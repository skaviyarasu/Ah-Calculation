/**
 * LFP per-cell grading reports → one batch report in the grading machine's layout
 * (spec: LFP-to-grading-report-conversion.md, CR-GRD-01 v1.2, REQ-GRD-011/012, DATA-GRD-01).
 *
 * Pure functions only (no file or browser APIs): every input is an already-read table.
 * One per-cell file (a time series) becomes one row of the 59-column machine layout,
 * followed by 3 LFP extras. All values are kept as text, like the machine export.
 */
import type { Preprocess } from './types.ts';

/** A cell of a table read from a per-cell file. */
export type TableCell = string | number | boolean | Date | null | undefined;

/** Constants of the LFP machine program (spec section 4). */
export interface LfpConstants {
  /** mV, CC→CV switch point for charge steps. */
  cvVoltage: number;
  /** mV, the machine's "#…mV" levels. */
  reportLevels: number[];
  /** ERROR value for a good cell. */
  noError: string;
  /** Value the machine writes for figures it does not calculate. */
  notCalculated: string;
  /** mA, |i| below this counts as zero current (Fast_R). */
  idleCurrent: number;
}

export const LFP_CONSTANTS: LfpConstants = {
  cvVoltage: 3650,
  reportLevels: [3600, 3500, 3400, 3300, 3000],
  noError: '---',
  notCalculated: '***',
  idleCurrent: 50,
};

export interface Sample {
  /** mV */
  v: number;
  /** mA (discharge negative) */
  i: number;
  /** mAh accumulated within the step */
  q: number;
  step: number;
  /** seconds since the first valid sample */
  t: number;
}

export interface ParsedReport {
  samples: Sample[];
  /** Raw text of the first valid sample's time (for the report header). */
  firstTimeText: string;
  /** Absolute time of the first valid sample in seconds (to find the earliest report). */
  startSeconds: number;
}

// ---------------------------------------------------------------------------
// Column layout (spec 5.1)
// ---------------------------------------------------------------------------

type StepKind = 'charge' | 'rest' | 'discharge';
const STEP_KINDS: Record<number, StepKind> = { 1: 'charge', 2: 'rest', 3: 'discharge', 4: 'rest', 5: 'charge' };

const BASIC = ['Open Voltage(mV)', 'Ave_Voltage(mV)', 'End Voltage(mV)', 'Time(minute)'];
const CHARGE = [...BASIC, 'Capacity(mAh)', 'Energy(mWh)', 'End Current(mA)', 'CC_Time(min)', 'CC_Capacity(mAh)', 'CC_Ratio(%)'];
const DISCHARGE_FIXED = [
  ...BASIC,
  'Capacity(mAh)',
  'Energy(mWh)',
  'End Current(mA)',
  'Capacity Spoilage(mAh)',
  'Discharge Efficiency(%)',
  'Loss Rate(%)',
  'DC_Ratio(%)',
  'SD (%)  ',
  'Mid_V(mV)',
];

function stepColumns(kind: StepKind, c: LfpConstants): string[] {
  if (kind === 'charge') return CHARGE;
  if (kind === 'rest') return BASIC;
  return [...DISCHARGE_FIXED, ...c.reportLevels.flatMap((lv) => [`#${lv}mV(min)`, `#${lv}mV(mAh)`, `#${lv}mV(%)`])];
}

/** The 3 LFP extras written after ERROR (flattened names). */
export const LFP_EXTRA_COLUMNS = ['4Fast_R(mOhm)', 'CC_Ratio_Corr(%)', '5SOC_set(%)'];

export interface MachineColumn {
  /** Name exactly as the machine writes it in row 4. */
  name: string;
  /** Step 1–5, or null for Number / cell No. / ERROR / extras. */
  step: number | null;
}

/** All 62 columns: the 59 machine columns in order, then the 3 LFP extras. */
export function machineColumns(c: LfpConstants = LFP_CONSTANTS): MachineColumn[] {
  const cols: MachineColumn[] = [
    { name: 'Number', step: null },
    { name: 'cell No.', step: null },
  ];
  for (const step of [1, 2, 3, 4, 5]) for (const name of stepColumns(STEP_KINDS[step], c)) cols.push({ name, step });
  cols.push({ name: 'ERROR', step: null });
  for (const name of LFP_EXTRA_COLUMNS) cols.push({ name, step: null });
  return cols;
}

/** Spec 5.1 flattening: step number + trimmed machine name; Number, cell No., ERROR and extras unprefixed; unique. */
export function flattenedNames(cols: MachineColumn[]): string[] {
  const used = new Set<string>();
  return cols.map((col) => {
    let flat = (col.step === null ? '' : String(col.step)) + col.name.trim();
    while (used.has(flat)) flat += '_';
    used.add(flat);
    return flat;
  });
}

// ---------------------------------------------------------------------------
// Number formatting (spec 5.8): round half to even, shortest text
// ---------------------------------------------------------------------------

export function roundText(x: number, dp: number): string {
  if (!Number.isFinite(x)) return '';
  const scale = 10 ** dp;
  const y = x * scale;
  const f = Math.floor(y);
  const r = Math.abs(y - f - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  const value = r / scale;
  return String(Object.is(value, -0) ? 0 : value);
}

const int = (x: number) => roundText(x, 0);
const dp1 = (x: number) => roundText(x, 1);
const dp2 = (x: number) => roundText(x, 2);

// ---------------------------------------------------------------------------
// Parsing (spec 2)
// ---------------------------------------------------------------------------

const toNumber = (x: TableCell): number => {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '') return Number(x.trim());
  return NaN;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Seconds, plus the raw text used for the report header. */
function parseTime(x: TableCell): { seconds: number; text: string } | null {
  if (x instanceof Date) {
    const ms = x.getTime();
    if (!Number.isFinite(ms)) return null;
    const text = `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ${pad2(x.getHours())}:${pad2(x.getMinutes())}:${pad2(x.getSeconds())}`;
    return { seconds: ms / 1000, text };
  }
  if (typeof x === 'number') return Number.isFinite(x) ? { seconds: x * 86400, text: String(x) } : null;
  if (typeof x === 'string') {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(x.trim());
    if (!m) return null;
    const secs = m[6] ? Number(m[6]) : 0;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], Math.floor(secs), Math.round((secs % 1) * 1000));
    return Number.isFinite(ms) ? { seconds: ms / 1000, text: x.trim() } : null;
  }
  return null;
}

/** Column index by header name (case-insensitive, trimmed), else the fallback position. */
function columnIndex(header: TableCell[], names: string[], fallback: number): number {
  const wanted = names.map((n) => n.toLowerCase());
  const idx = header.findIndex((h) =>
    wanted.includes(
      String(h ?? '')
        .trim()
        .toLowerCase(),
    ),
  );
  return idx >= 0 ? idx : fallback;
}

/** True when the first row looks like an LFP per-cell report (all four key columns found by name). */
export function isPerCellReport(table: TableCell[][]): boolean {
  const header = (table[0] ?? []).map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase(),
  );
  return (
    header.includes('voltage(mv)') &&
    header.includes('current(ma)') &&
    header.includes('capacity(mah)') &&
    (header.includes('current step') || header.includes('step'))
  );
}

export function parseReport(table: TableCell[][]): ParsedReport {
  const header = table[0] ?? [];
  const vi = columnIndex(header, ['Voltage(mV)'], 0);
  const ii = columnIndex(header, ['Current(mA)'], 1);
  const qi = columnIndex(header, ['Capacity(mAh)'], 2);
  const si = columnIndex(header, ['Current Step', 'Step'], 4);
  const ti = columnIndex(header, ['Time', 'Date Time', 'DateTime'], 7);
  const samples: Sample[] = [];
  let t0: number | null = null;
  let firstTimeText = '';
  for (const row of table.slice(1)) {
    const v = toNumber(row[vi]);
    const i = toNumber(row[ii]);
    const q = toNumber(row[qi]);
    const step = toNumber(row[si]);
    const time = parseTime(row[ti]);
    if (![v, i, q, step].every(Number.isFinite) || !time) continue;
    if (t0 === null) {
      t0 = time.seconds;
      firstTimeText = time.text;
    }
    samples.push({ v, i, q, step, t: time.seconds - t0 });
  }
  return { samples, firstTimeText, startSeconds: t0 ?? Number.NaN };
}

// ---------------------------------------------------------------------------
// Helpers (spec 5.2)
// ---------------------------------------------------------------------------

const first = (s: Sample[]) => s[0];
const last = (s: Sample[]) => s[s.length - 1];
const maxQ = (s: Sample[]) => s.reduce((m, x) => Math.max(m, x.q), -Infinity);
const minutes = (s: Sample[]) => (last(s).t - first(s).t) / 60;

export function aveVoltage(s: Sample[]): number {
  const T = last(s).t - first(s).t;
  if (T <= 0) return first(s).v;
  let sum = 0;
  for (let k = 1; k < s.length; k++) sum += ((s[k - 1].v + s[k].v) / 2) * (s[k].t - s[k - 1].t);
  return sum / T;
}

export function energyMWh(s: Sample[]): number {
  let sum = 0;
  for (let k = 1; k < s.length; k++) sum += ((s[k - 1].v * Math.abs(s[k - 1].i) + s[k].v * Math.abs(s[k].i)) / 2) * (s[k].t - s[k - 1].t);
  return sum / 3.6e6;
}

export function interpVoltage(s: Sample[], targetQ: number): number {
  if (targetQ <= s[0].q) return s[0].v;
  for (let k = 1; k < s.length; k++) {
    if (s[k].q >= targetQ) {
      const a = s[k - 1];
      const b = s[k];
      return b.q === a.q ? b.v : a.v + ((targetQ - a.q) * (b.v - a.v)) / (b.q - a.q);
    }
  }
  return last(s).v;
}

export function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ---------------------------------------------------------------------------
// Validation (spec 3, checks 2–5; 1 and 6 need the file / the batch)
// ---------------------------------------------------------------------------

export function validate(samples: Sample[], c: LfpConstants = LFP_CONSTANTS): string | null {
  if (!samples.length) return 'File has no readable data rows';
  const missing = [1, 2, 3, 4, 5].filter((n) => !samples.some((s) => s.step === n));
  if (missing.length) return `Missing step ${missing.join(', ')}`;
  if (!samples.some((s) => s.step === 1 && s.v >= c.cvVoltage)) return `Step 1 never reached ${c.cvVoltage} mV`;
  const s3 = samples.filter((s) => s.step === 3);
  if (s3.length <= 10 || maxQ(s3) <= 0) return 'No discharge data in step 3';
  return null;
}

// ---------------------------------------------------------------------------
// One converted row (spec 5.3–5.7)
// ---------------------------------------------------------------------------

function chargeValues(s: Sample[], c: LfpConstants): string[] {
  const cap = maxQ(s);
  const cvAt = s.findIndex((x) => x.v >= c.cvVoltage);
  const ccEnd = cvAt >= 0 ? s[cvAt] : last(s);
  return [
    int(cap),
    int(energyMWh(s)),
    int(Math.abs(last(s).i)),
    dp1((ccEnd.t - first(s).t) / 60),
    int(ccEnd.q),
    cap <= 0 ? c.notCalculated : dp2((ccEnd.q / cap) * 100),
  ];
}

function dischargeValues(s: Sample[], c1cap: number, c: LfpConstants): string[] {
  const cap = maxQ(s);
  const out = [
    int(cap),
    int(energyMWh(s)),
    int(Math.abs(last(s).i)),
    int(c1cap - cap),
    c1cap <= 0 ? c.notCalculated : dp2((cap / c1cap) * 100),
    c1cap <= 0 ? c.notCalculated : dp2(100 - (cap / c1cap) * 100),
    c.notCalculated,
    c.notCalculated,
    int(interpVoltage(s, cap / 2)),
  ];
  for (const lv of c.reportLevels) {
    const k = s.findIndex((x) => x.v < lv);
    const at = k === 0 ? null : k === -1 ? last(s) : s[k - 1];
    out.push(at ? dp1((at.t - first(s).t) / 60) : '0', at ? int(at.q) : '0', at ? dp2((at.q / cap) * 100) : '0');
  }
  return out;
}

/** Values for the 59 machine columns + 3 extras of a cell that passed validation. */
export function convertSamples(cellId: string, cellNo: number, samples: Sample[], c: LfpConstants = LFP_CONSTANTS): string[] {
  const byStep = (n: number) => samples.filter((s) => s.step === n);
  const steps = [1, 2, 3, 4, 5].map(byStep);
  const [s1, , s3, s4, s5] = steps;
  const row: string[] = [cellId, String(cellNo)];
  steps.forEach((s, idx) => {
    const kind = STEP_KINDS[idx + 1];
    row.push(int(first(s).v), int(aveVoltage(s)), int(last(s).v), dp1(minutes(s)));
    if (kind === 'charge') row.push(...chargeValues(s, c));
    else if (kind === 'discharge') row.push(...dischargeValues(s, maxQ(s1), c));
  });
  row.push(c.noError);

  // LFP extras (5.7)
  const cap = maxQ(s3);
  const amps = Math.abs(median(s3.map((x) => x.i))) / 1000;
  const dcEnd = last(s3);
  const idle = s4.find((x) => Math.abs(x.i) < c.idleCurrent);
  const cvAt = s1.findIndex((x) => x.v >= c.cvVoltage);
  const cvCap1 = maxQ(s1) - s1[cvAt].q;
  row.push(idle && amps > 0 ? dp2((idle.v - dcEnd.v) / amps) : '', dp2(((cap - cvCap1) / cap) * 100), dp1((maxQ(s5) / cap) * 100));
  return row;
}

/** Row of a report that was not converted: identity, empty data, the reason in ERROR. */
function failedRow(cellId: string, cellNo: number, reason: string, width: number, errorIndex: number): string[] {
  const row = new Array<string>(width).fill('');
  row[0] = cellId;
  row[1] = String(cellNo);
  row[errorIndex] = reason;
  return row;
}

// ---------------------------------------------------------------------------
// Batch (spec 3 check 1 and 6, 5.6, 6)
// ---------------------------------------------------------------------------

/** One uploaded per-cell file, already read (or the reason it could not be read). */
export interface ReportInput {
  /** File name or path as uploaded. */
  fileName: string;
  table?: TableCell[][];
  /** Message from the reader when the file could not be read. */
  readError?: string;
}

export interface ConvertedReport {
  cellId: string;
  cellNo: number;
  fileName: string;
  /** null when converted. */
  error: string | null;
  values: string[];
  parsed?: ParsedReport;
}

export interface BatchResult {
  columns: MachineColumn[];
  reports: ConvertedReport[];
  converted: number;
  failed: number;
  /** Earliest start time text among converted reports ('' if none). */
  testTime: string;
  /** Row 3 label of each column. */
  stepLabels: string[];
}

/**
 * Cell ID = file name without folder and extension. A leading space is kept (" 01-2-1.xls" →
 * " 01-2-1"), like the Number the grading machine writes; trailing spaces are removed.
 */
export function cellIdFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).replace(/\s+$/, '');
}

/** Key used to detect duplicate cell IDs: case and surrounding spaces ignored. */
const duplicateKey = (cellId: string) => cellId.trim().toLowerCase();

/** Channel order: numbers compared as numbers (01-2-2 before 01-2-10), case and spaces ignored. */
export function compareChannels(a: string, b: string): number {
  const ta =
    a
      .trim()
      .toLowerCase()
      .match(/\d+|\D+/g) ?? [];
  const tb =
    b
      .trim()
      .toLowerCase()
      .match(/\d+|\D+/g) ?? [];
  for (let k = 0; k < Math.min(ta.length, tb.length); k++) {
    const x = ta[k];
    const y = tb[k];
    if (x === y) continue;
    const nx = /^\d/.test(x) && /^\d/.test(y) ? Number(x) - Number(y) : 0;
    if (nx !== 0) return nx;
    return x < y ? -1 : 1;
  }
  return ta.length - tb.length;
}

/** Median over converted cells of each cell's median current (or NaN when none). */
function batchCurrent(reports: ConvertedReport[], pick: (s: Sample[]) => number[]): number {
  const perCell = reports
    .filter((r) => r.error === null && r.parsed)
    .map((r) => median(pick(r.parsed!.samples)))
    .filter(Number.isFinite);
  return median(perCell);
}

function stepLabelsFor(columns: MachineColumn[], reports: ConvertedReport[], c: LfpConstants): string[] {
  const current = (step: number, kind: StepKind): number =>
    kind === 'discharge'
      ? batchCurrent(reports, (s) => s.filter((x) => x.step === step).map((x) => x.i))
      : batchCurrent(reports, (s) => s.filter((x) => x.step === step && x.v < c.cvVoltage && Math.abs(x.i) > 0).map((x) => x.i));
  const labels = new Map<number, string>();
  for (const step of [1, 2, 3, 4, 5]) {
    const kind = STEP_KINDS[step];
    if (kind === 'rest') {
      labels.set(step, ` ${step}(1)REST `);
      continue;
    }
    const cur = current(step, kind);
    // |current| rounded to the nearest 10 mA; left out when no current is available.
    const amps = Number.isFinite(cur) ? ` ${Number(roundText(Math.abs(cur) / 10, 0)) * 10}mA` : '';
    labels.set(step, kind === 'charge' ? ` ${step}(1)C_CV${amps}` : ` ${step}(1)D_CC${amps}  `);
  }
  return columns.map((col) => (col.step === null ? '' : labels.get(col.step)!));
}

/**
 * Converts all uploaded reports into one batch. Rows are sorted by channel (cell ID) and
 * `cell No.` is the position in that order (1-based).
 */
export function convertBatch(inputs: ReportInput[], c: LfpConstants = LFP_CONSTANTS): BatchResult {
  const columns = machineColumns(c);
  const width = columns.length;
  const errorIndex = columns.findIndex((col) => col.name === 'ERROR');
  const counts = new Map<string, number>();
  for (const inp of inputs) {
    const key = duplicateKey(cellIdFromFileName(inp.fileName));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Stable sort: reports with the same channel keep their upload order.
  const sorted = inputs
    .map((inp, k) => ({ inp, k }))
    .sort((a, b) => compareChannels(cellIdFromFileName(a.inp.fileName), cellIdFromFileName(b.inp.fileName)) || a.k - b.k);
  const reports: ConvertedReport[] = sorted.map(({ inp }, idx) => {
    const cellId = cellIdFromFileName(inp.fileName);
    const cellNo = idx + 1;
    const fail = (reason: string, parsed?: ParsedReport): ConvertedReport => ({
      cellId,
      cellNo,
      fileName: inp.fileName,
      error: reason,
      values: failedRow(cellId, cellNo, reason, width, errorIndex),
      parsed,
    });
    if (inp.readError !== undefined || !inp.table) return fail(`File cannot be read: ${inp.readError ?? 'no data'}`);
    const parsed = parseReport(inp.table);
    const reason = validate(parsed.samples, c);
    if (reason) return fail(reason, parsed);
    if ((counts.get(duplicateKey(cellId)) ?? 0) > 1) return fail('Duplicate cell ID: another report has the same file name', parsed);
    return { cellId, cellNo, fileName: inp.fileName, error: null, values: convertSamples(cellId, cellNo, parsed.samples, c), parsed };
  });
  const ok = reports.filter((r) => r.error === null);
  const earliest = ok.reduce<ConvertedReport | null>((best, r) => (!best || r.parsed!.startSeconds < best.parsed!.startSeconds ? r : best), null);
  return {
    columns,
    reports,
    converted: ok.length,
    failed: reports.length - ok.length,
    testTime: earliest?.parsed?.firstTimeText ?? '',
    stepLabels: stepLabelsFor(columns, reports, c),
  };
}

/** The batch as the machine's sheet: 4 header rows, then one row per report (all text). */
export function machineSheetRows(batch: BatchResult): string[][] {
  const width = batch.columns.length;
  const row = (cells: Record<number, string>) => Array.from({ length: width }, (_, i) => cells[i] ?? '');
  const row3 = batch.stepLabels.slice();
  row3[0] = '';
  row3[1] = 'data issues';
  return [
    row({ 0: 'Charge & Discharge Data' }),
    row({ 0: `WorkName: LFP per-cell reports  CabinetTag: -  test time: ${batch.testTime} ` }),
    row3,
    batch.columns.map((col) => col.name),
    ...batch.reports.map((r) => r.values),
  ];
}

/** Download / run-record name, e.g. LFP_57_reports_CELL-0001_to_CELL-0057. */
export function batchFileStem(batch: BatchResult): string {
  const ids = batch.reports.map((r) => r.cellId.trim());
  return ids.length ? `LFP_${ids.length}_reports_${ids[0]}_to_${ids[ids.length - 1]}` : 'LFP_0_reports';
}

/**
 * Preprocessing used to turn the converted batch sheet into grouping columns, matching how a
 * machine export of the same chemistry is read:
 * - with the rules' `preprocess:` block: its header names (if it lists only the 59 machine
 *   columns, the 3 LFP extras are appended) and its drop_rows;
 * - without one: the spec's flattened names (step number + machine name).
 * The converted sheet always has 3 rows above its header row.
 */
export function batchPreprocess(batch: BatchResult, pre?: Preprocess): Preprocess {
  const width = batch.columns.length;
  if (!pre || !pre.header) return { skipRows: 3, header: flattenedNames(batch.columns), dropRows: pre?.dropRows ?? [] };
  const header = pre.header.length === width - LFP_EXTRA_COLUMNS.length ? [...pre.header, ...LFP_EXTRA_COLUMNS] : pre.header;
  return { skipRows: 3, header, dropRows: pre.dropRows };
}
