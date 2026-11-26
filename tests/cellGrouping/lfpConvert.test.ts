/**
 * LFP per-cell report conversion (spec: LFP-to-grading-report-conversion.md, section 9).
 * TC-GRD-020/021 also run against a real report named by LFP_SAMPLE_REPORT, and TC-GRD-028
 * against a real machine export named by CELL_GROUPING_RAW_INPUT. They are skipped when unset.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { applySteps, summarizeGroups } from '../../src/lib/cellGrouping/engine.ts';
import {
  batchPreprocess,
  cellIdFromFileName,
  convertBatch,
  flattenedNames,
  isPerCellReport,
  machineColumns,
  machineSheetRows,
  parseReport,
  roundText,
} from '../../src/lib/cellGrouping/lfpConvert.ts';
import type { TableCell } from '../../src/lib/cellGrouping/lfpConvert.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import { preprocessExcel, preprocessSheetRows } from '../../src/lib/cellGrouping/preprocess.ts';
import { batchToXlsx, readReportInputs, readReportTable } from '../../src/lib/cellGrouping/reportFiles.ts';

const HEADER = ['Voltage(mV)', 'Current(mA)', 'Capacity(mAh)', 'h/m/s', 'Current Step', 'Cycles', 'Status', 'Time'];

/** A plausible LFP per-cell report following the machine program (spec 2.2), one sample every 10 s. */
function makeReport(opts: { skipStep?: number; maxV1?: number; capScale?: number } = {}): string[][] {
  const rows: string[][] = [HEADER];
  let t = Date.UTC(2026, 10, 11, 10, 45, 50) / 1000;
  const push = (v: number, i: number, q: number, step: number, status: string) => {
    if (step === opts.skipStep) return;
    const d = new Date(t * 1000);
    const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    rows.push([String(Math.round(v)), String(Math.round(i)), String(Math.round(q)), '0:0:0', String(step), '0', status, time]);
    t += 10;
  };
  const scale = opts.capScale ?? 1;
  const maxV1 = opts.maxV1 ?? 3662;
  // 1: CC at 7500 mA from 3290 to 3650, then CV taper
  let q = 0;
  for (let k = 0; k < 540; k++) {
    q += (7500 * 10) / 3600;
    push(Math.min(3290 + k * 0.68, maxV1), 7500, q, 1, 'Con-C&V Charge');
  }
  for (let k = 0; k < 40; k++) {
    const i = 7500 * Math.exp(-k / 15);
    q += (i * 10) / 3600;
    push(Math.min(3651, maxV1), Math.max(i, 478), q, 1, 'Con-C&V Charge');
  }
  for (let k = 0; k < 30; k++) push(3640 - k * 4, 0, 0, 2, 'Idle');
  // 3: CC discharge at 10000 mA down to 2800
  q = 0;
  for (let k = 0; k < 540 * scale; k++) {
    q += (10000 * 10) / 3600;
    push(3490 - (k / (540 * scale)) * 690, -10000, q, 3, 'Con-C Discharge');
  }
  push(2830, -1819, 0, 4, 'Idle');
  for (let k = 0; k < 29; k++) push(2850 + k * 3, k % 2 ? 1 : -1, 0, 4, 'Idle');
  q = 0;
  for (let k = 0; k < 360; k++) {
    q += (7500 * 10) / 3600;
    push(2940 + k, 7500, q, 5, 'Con-C&V Charge');
  }
  return rows;
}

const csvOf = (rows: string[][]) => new TextEncoder().encode(rows.map((r) => r.join(',')).join('\r\n') + '\r\n');
function workbookOf(rows: unknown[][], bookType: XLSX.BookType): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'sheet0');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}
const named = (batchIdx: number, batch: ReturnType<typeof convertBatch>) =>
  Object.fromEntries(flattenedNames(batch.columns).map((n, i) => [n, batch.reports[batchIdx].values[i]]));

describe('roundText (round half to even, spec 5.8)', () => {
  it.each([
    [2.5, 0, '2'],
    [3.5, 0, '4'],
    [-2.5, 0, '-2'],
    [0.125, 2, '0.12'],
    [98.6, 2, '98.6'],
    [5, 1, '5'],
    [Number.NaN, 0, ''],
    [Infinity, 1, ''],
  ])('round(%s, %s) = %s', (x, dp, expected) => expect(roundText(x, dp)).toBe(expected));
});

describe('layout (spec 5.1)', () => {
  it('has the 59 machine columns in order, then the 3 LFP extras', () => {
    const cols = machineColumns();
    expect(cols).toHaveLength(62);
    const flat = flattenedNames(cols);
    expect(flat.slice(0, 4)).toEqual(['Number', 'cell No.', '1Open Voltage(mV)', '1Ave_Voltage(mV)']);
    expect(flat).toContain('3SD (%)');
    expect(flat).toContain('3#3000mV(%)');
    expect(flat[58]).toBe('ERROR');
    expect(flat.slice(59)).toEqual(['4Fast_R(mOhm)', 'CC_Ratio_Corr(%)', '5SOC_set(%)']);
    expect(cols[27].name).toBe('SD (%)  ');
  });
  it.each([
    ['C:\\exports\\CELL-0042.xls', 'CELL-0042'],
    ['batch/CELL 7.report.xlsx', 'CELL 7.report'],
    [' 01-2-1.xls', ' 01-2-1'],
    ['01-2-1 .xls', '01-2-1'],
  ])('cell ID from %s', (path, id) => expect(cellIdFromFileName(path)).toBe(id));

  it('sorts rows by channel and numbers cell No. in that order (leading spaces kept in Number)', () => {
    const t = makeReport();
    const b = convertBatch(['  01-2-10.csv', ' 01-2-1.csv', ' 02-1-1.csv', ' 01-2-2.csv'].map((fileName) => ({ fileName, table: t })));
    expect(b.reports.map((r) => [r.values[0], r.values[1]])).toEqual([
      [' 01-2-1', '1'],
      [' 01-2-2', '2'],
      ['  01-2-10', '3'],
      [' 02-1-1', '4'],
    ]);
  });
  it('treats " 01-2-1" and "01-2-1" as the same cell (duplicate)', () => {
    const t = makeReport();
    const b = convertBatch([' 01-2-1.xls', '01-2-1.csv'].map((fileName) => ({ fileName, table: t })));
    expect(b.reports.map((r) => r.error)).toEqual([
      'Duplicate cell ID: another report has the same file name',
      'Duplicate cell ID: another report has the same file name',
    ]);
  });
});

describe('conversion of a generated report', () => {
  const ok = convertBatch([{ fileName: 'CELL-0001.csv', table: makeReport() }]);

  it('converts and fills every column', () => {
    expect(ok.converted).toBe(1);
    const row = named(0, ok);
    expect(row.ERROR).toBe('---');
    expect(row['cell No.']).toBe('1');
    expect(row['3DC_Ratio(%)']).toBe('***');
    expect(row['5CC_Ratio(%)']).toBe('100');
    expect(Number(row['3Capacity(mAh)'])).toBeCloseTo(15000, -1);
    expect(row['4Fast_R(mOhm)']).not.toBe('');
  });
  it('finds columns by header name when they are reordered', () => {
    const t = makeReport();
    const order = [7, 4, 2, 0, 1, 3, 5, 6];
    const reordered = convertBatch([{ fileName: 'CELL-0001.csv', table: t.map((r) => order.map((i) => r[i])) }]);
    expect(reordered.reports[0].values).toEqual(ok.reports[0].values);
  });
  it('TC-GRD-021: the same report read from .xlsx, .xls and .csv gives identical rows', () => {
    const t = makeReport();
    const inputs = readReportInputs([
      { name: 'A.xlsx', data: workbookOf(t, 'xlsx') },
      { name: 'B.xls', data: workbookOf(t, 'biff8') },
      { name: 'C.csv', data: csvOf(t) },
    ]);
    const b = convertBatch(inputs);
    expect(b.converted).toBe(3);
    const strip = (v: string[]) => v.slice(2);
    expect(strip(b.reports[1].values)).toEqual(strip(b.reports[0].values));
    expect(strip(b.reports[2].values)).toEqual(strip(b.reports[0].values));
  });
});

describe('validation (spec 3)', () => {
  const errorOf = (table: TableCell[][]) => convertBatch([{ fileName: 'X.csv', table }]).reports[0];

  it('TC-GRD-022: missing step 3', () => {
    const r = errorOf(makeReport({ skipStep: 3 }));
    expect(r.error).toBe('Missing step 3');
    // every other data column is empty
    expect(r.values.slice(2, 58).every((v) => v === '')).toBe(true);
    expect(r.values[58]).toBe('Missing step 3');
  });
  it('TC-GRD-023: step 1 capped at 3600 mV', () => {
    expect(errorOf(makeReport({ maxV1: 3600 })).error).toBe('Step 1 never reached 3650 mV');
  });
  it('TC-GRD-024: header only / empty table', () => {
    expect(errorOf([HEADER]).error).toBe('File has no readable data rows');
    expect(errorOf([]).error).toBe('File has no readable data rows');
  });
  it('no discharge data in step 3', () => {
    expect(errorOf(makeReport({ capScale: 0.01 })).error).toBe('No discharge data in step 3');
  });
  it('TC-GRD-025: duplicates (case-insensitive) and an unreadable file', () => {
    const t = makeReport();
    const b = convertBatch(
      readReportInputs([
        { name: 'CELL-A.csv', data: csvOf(t) },
        { name: 'cell-a.xls', data: workbookOf(t, 'biff8') },
        { name: 'BROKEN.xlsx', data: new Uint8Array([1, 2, 3, 4, 5]) },
        { name: 'CELL-B.csv', data: csvOf(t) },
      ]),
    );
    // rows in channel order: BROKEN, CELL-A, cell-a, CELL-B
    expect(b.reports.map((r) => [r.fileName, r.error])).toEqual([
      ['BROKEN.xlsx', 'File cannot be read: not a valid .xlsx file'],
      ['CELL-A.csv', 'Duplicate cell ID: another report has the same file name'],
      ['cell-a.xls', 'Duplicate cell ID: another report has the same file name'],
      ['CELL-B.csv', null],
    ]);
    expect([b.converted, b.failed]).toEqual([1, 3]);
  });
});

describe('machine layout, download and grouping', () => {
  const t = makeReport();
  const batch = convertBatch([
    { fileName: 'CELL-0001.csv', table: t },
    { fileName: 'CELL-0002.csv', table: makeReport({ skipStep: 5 }) },
  ]);

  it('writes the 4 header rows like the machine (spec 6)', () => {
    const rows = machineSheetRows(batch);
    expect(rows[0][0]).toBe('Charge & Discharge Data');
    expect(rows[1][0]).toBe('WorkName: LFP per-cell reports  CabinetTag: -  test time: 2026-11-11 10:45:50 ');
    expect(rows[2].slice(0, 3)).toEqual(['', 'data issues', ' 1(1)C_CV 7500mA']);
    expect(new Set(rows[2])).toEqual(
      new Set(['', 'data issues', ' 1(1)C_CV 7500mA', ' 2(1)REST ', ' 3(1)D_CC 10000mA  ', ' 4(1)REST ', ' 5(1)C_CV 7500mA']),
    );
    expect(rows[3]).toEqual(machineColumns().map((c) => c.name));
    expect(rows).toHaveLength(6);
  });
  it('TC-GRD-029: the .xlsx download read back equals the converted rows', () => {
    const pre = batchPreprocess(batch);
    expect(preprocessExcel(batchToXlsx(batch), pre).csvText).toBe(preprocessSheetRows(machineSheetRows(batch), pre).csvText);
    const back = XLSX.utils.sheet_to_json<string[]>(XLSX.read(batchToXlsx(batch), { type: 'array' }).Sheets.Sheet1, {
      header: 1,
      raw: false,
      defval: '',
    });
    expect(back.slice(4)).toEqual(batch.reports.map((r) => r.values));
  });
  it('uses the rules header (59 names → the 3 extras are added) and groups failed cells as unmatched (TC-GRD-026/030)', () => {
    const header59 = flattenedNames(machineColumns()).slice(0, 59);
    const rules = parseRules(`preprocess:
  skip_rows: 3
  header: ${JSON.stringify(header59)}
steps:
  - name: C2R1
    filter:
      all:
        - { col: "3Capacity(mAh)", between: [14000, 16000] }
        - { col: "4Fast_R(mOhm)", between: [0, 100] }
  - name: NA
`).rules!;
    const pre = batchPreprocess(batch, rules.preprocess);
    expect(pre.header).toHaveLength(62);
    const { frame } = preprocessSheetRows(machineSheetRows(batch), pre);
    const groups = summarizeGroups(applySteps(frame, rules, { groupCol: 'Category' }));
    expect(groups.map((g) => [g.label, g.rows])).toEqual([
      ['C2R1', [0]],
      ['NA', [1]],
    ]);
  });
});

const SAMPLE = process.env.LFP_SAMPLE_REPORT ?? '';
const MACHINE = process.env.CELL_GROUPING_RAW_INPUT ?? '';

describe.skipIf(!existsSync(SAMPLE))('TC-GRD-020/021: the real sample report (spec 9.1)', () => {
  const expected: Record<string, string> = {
    Number: '01-2-1',
    'cell No.': '1',
    ERROR: '---',
    '1Open Voltage(mV)': '3292',
    '1Ave_Voltage(mV)': '3420',
    '1End Voltage(mV)': '3651',
    '1Time(minute)': '97.3',
    '1Capacity(mAh)': '11555',
    '1Energy(mWh)': '39321',
    '1End Current(mA)': '478',
    '1CC_Time(min)': '90.8',
    '1CC_Capacity(mAh)': '11349',
    '1CC_Ratio(%)': '98.22',
    '2Open Voltage(mV)': '3651',
    '2Ave_Voltage(mV)': '3542',
    '2End Voltage(mV)': '3496',
    '2Time(minute)': '5',
    '3Open Voltage(mV)': '3496',
    '3Ave_Voltage(mV)': '3233',
    '3End Voltage(mV)': '2802',
    '3Time(minute)': '90.2',
    '3Capacity(mAh)': '15043',
    '3Energy(mWh)': '48539',
    '3End Current(mA)': '10000',
    '3Capacity Spoilage(mAh)': '-3488',
    '3Discharge Efficiency(%)': '130.19',
    '3Loss Rate(%)': '-30.19',
    '3DC_Ratio(%)': '***',
    '3SD (%)': '***',
    '3Mid_V(mV)': '3254',
    '3#3600mV(min)': '0',
    '3#3600mV(mAh)': '0',
    '3#3600mV(%)': '0',
    '3#3500mV(min)': '0',
    '3#3500mV(mAh)': '0',
    '3#3500mV(%)': '0',
    '3#3400mV(min)': '0.2',
    '3#3400mV(mAh)': '10',
    '3#3400mV(%)': '0.07',
    '3#3300mV(min)': '0.6',
    '3#3300mV(mAh)': '82',
    '3#3300mV(%)': '0.55',
    '3#3000mV(min)': '88.3',
    '3#3000mV(mAh)': '14721',
    '3#3000mV(%)': '97.86',
    '4Open Voltage(mV)': '2828',
    '4Ave_Voltage(mV)': '2920',
    '4End Voltage(mV)': '2936',
    '4Time(minute)': '5',
    '5Open Voltage(mV)': '2936',
    '5Ave_Voltage(mV)': '3320',
    '5End Voltage(mV)': '3371',
    '5Time(minute)': '60.1',
    '5Capacity(mAh)': '7497',
    '5Energy(mWh)': '24866',
    '5End Current(mA)': '7500',
    '5CC_Time(min)': '60.1',
    '5CC_Capacity(mAh)': '7497',
    '5CC_Ratio(%)': '100',
    '4Fast_R(mOhm)': '4.5',
    'CC_Ratio_Corr(%)': '98.63',
    '5SOC_set(%)': '49.8',
  };

  it('every value in section 9.1', () => {
    const batch = convertBatch(readReportInputs([{ name: SAMPLE, data: readFileSync(SAMPLE) }]));
    expect(named(0, batch)).toEqual(expected);
    expect(machineSheetRows(batch)[1][0]).toBe('WorkName: LFP per-cell reports  CabinetTag: -  test time: 2026-11-11 10:45:50 ');
  });
  it('the same report saved as .csv converts identically', () => {
    const table = readReportTable(readFileSync(SAMPLE), SAMPLE);
    expect(isPerCellReport(table)).toBe(true);
    const csv = new TextEncoder().encode(table.map((r) => r.map((c) => String(c ?? '')).join(',')).join('\n'));
    const b = convertBatch(readReportInputs([{ name: '01-2-1.csv', data: csv }]));
    expect(named(0, b)).toEqual(expected);
    expect(parseReport(table).samples).toHaveLength(6397);
  });
});

describe.skipIf(!existsSync(MACHINE))('TC-GRD-028: converted columns follow the real machine report', () => {
  it('the 59 machine column names equal row 4 of REDCELL23112026.xlsx, in order', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(XLSX.read(readFileSync(MACHINE), { type: 'buffer' }).Sheets.Sheet1, {
      header: 1,
      raw: false,
      defval: '',
    });
    expect(
      machineColumns()
        .slice(0, 59)
        .map((c) => c.name),
    ).toEqual(rows[3].slice(0, 59));
    // and the step of each column matches the machine's row-3 step labels
    const steps = rows[2].slice(0, 59).map((l) => (/^\s*(\d+)\s*\(/.exec(l)?.[1] ? Number(/^\s*(\d+)\s*\(/.exec(l)![1]) : null));
    expect(
      machineColumns()
        .slice(2, 58)
        .map((c) => c.step),
    ).toEqual(steps.slice(2, 58));
  });
});

describe('download name', () => {
  it('is LFP_<n>_reports_<first>_to_<last>, without the leading spaces', async () => {
    const { batchFileStem } = await import('../../src/lib/cellGrouping/lfpConvert.ts');
    const t = makeReport();
    const b = convertBatch([' 01-2-2.csv', ' 01-2-1.csv'].map((fileName) => ({ fileName, table: t })));
    expect(batchFileStem(b)).toBe('LFP_2_reports_01-2-1_to_01-2-2');
  });
});
