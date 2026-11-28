/**
 * NA workbench: cells that no grouping step matched ("NA", the catch-all group), why, and new
 * rules that would group them, checked against already graded cells before publishing.
 * Pure functions on frames read from the grouped reports saved with each run.
 */
import { parseDocument, isMap, isSeq } from 'yaml';
import { evalCondition } from './conditions.ts';
import { applySteps } from './engine.ts';
import { parseRules } from './loadRules.ts';
import type { Cell, Condition, Frame, GroupingResult, RuleScalar, RuleSet, Step } from './types.ts';
import { PyFloat } from './types.ts';

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** The frame without one column (the saved group column must go before grouping again). */
export function dropColumn(frame: Frame, col: string): Frame {
  if (!frame.columns.includes(col)) return frame;
  const data = { ...frame.data };
  const kinds = { ...frame.kinds };
  delete data[col];
  delete kinds[col];
  return { columns: frame.columns.filter((c) => c !== col), data, kinds, length: frame.length };
}

function rowFrame(frame: Frame, row: number): Frame {
  const data: Frame['data'] = {};
  for (const c of frame.columns) data[c] = [frame.data[c][row]];
  return { columns: frame.columns, data, kinds: frame.kinds, length: 1 };
}

/** Column that names a cell in a report: "Number" (the channel), else "cell No.", else none. */
export function cellIdColumn(frame: Pick<Frame, 'columns'>): string | null {
  return ['Number', 'cell No.', 'Cell ID', 'Cell'].find((c) => frame.columns.includes(c)) ?? null;
}

const text = (c: Cell | undefined): string => (c === null || c === undefined ? '' : String(c));

/** Names of the catch-all steps (no filter), e.g. "NA". */
export function catchAllNames(rules: RuleSet): Set<string> {
  return new Set(rules.steps.filter((s) => s.filter === null).map((s) => String(s.name)));
}

/**
 * Rows of a saved report that are NA: an empty group (the CSV reader reads the text "NA" as
 * missing, like pandas) or the name of a catch-all step.
 */
export function unassignedRows(frame: Frame, groupCol: string, rules: RuleSet): number[] {
  if (!frame.columns.includes(groupCol)) return [];
  const catchAll = catchAllNames(rules);
  return frame.data[groupCol].flatMap((g, i) => (g === null || text(g).trim() === '' || catchAll.has(text(g)) ? [i] : []));
}

// ---------------------------------------------------------------------------
// Nearest group and failed conditions
// ---------------------------------------------------------------------------

const num = (r: RuleScalar | Cell | undefined): number | undefined => {
  if (r instanceof PyFloat) return r.value;
  if (typeof r === 'number') return Number.isFinite(r) ? r : undefined;
  if (typeof r === 'boolean') return Number(r);
  if (typeof r === 'string' && r.trim() !== '' && Number.isFinite(Number(r))) return Number(r);
  return undefined;
};
const scalarText = (r: RuleScalar | undefined): string => (r instanceof PyFloat ? String(r.value) : r === null || r === undefined ? 'None' : String(r));
const fmt = (x: number) => String(Number(x.toPrecision(12)));

/** A condition written for people: "4Fast_R(mOhm) 4.51 - 5.5". */
export function conditionText(c: Condition): string {
  if (c.between) return `${c.col} ${scalarText(c.between[0])} - ${scalarText(c.between[1])}`;
  if (c.regex !== undefined) return `${c.col ?? 'row'} ~ /${c.regex}/`;
  if (c.values) return `${c.col} ${c.op} [${c.values.map(scalarText).join(', ')}]`;
  return `${c.col} ${c.op} ${scalarText(c.value)}`;
}

export interface ConditionCheck {
  condition: Condition;
  text: string;
  passed: boolean;
  /** The cell's value in the condition's column. */
  actual: Cell;
  /** How far outside, in the column's units (numeric conditions only). */
  distance: number | null;
  /** Distance relative to the span the rules cover in this column (comparable across columns). */
  relative: number;
  /** e.g. "5.6 > 5.5 (+0.1)" or "missing". */
  detail: string;
}

/**
 * Per column, the span between the lowest and highest limit any step uses (e.g. Fast_R 0 - 5.5,
 * capacity 14950 - 15249.99), so a distance in mOhm and one in mAh can be compared.
 */
export function columnSpans(rules: RuleSet): Map<string, number> {
  const limits = new Map<string, number[]>();
  for (const step of rules.steps) {
    for (const c of step.filter?.conditions ?? []) {
      if (c.col === undefined) continue;
      const xs = (c.between ?? [c.value]).map(num).filter((x): x is number => x !== undefined);
      if (xs.length) limits.set(c.col, [...(limits.get(c.col) ?? []), ...xs]);
    }
  }
  const spans = new Map<string, number>();
  for (const [col, xs] of limits) {
    const span = Math.max(...xs) - Math.min(...xs);
    spans.set(col, span > 0 ? span : Math.max(Math.abs(xs[0]), 1));
  }
  return spans;
}

/** Checks one condition on one row and says how far off a numeric value is. */
export function checkCondition(frame: Frame, row: number, c: Condition, spans?: Map<string, number>): ConditionCheck {
  const scale = (fallback: number) => (c.col !== undefined && spans?.get(c.col)) || fallback;
  const one = rowFrame(frame, row);
  const actual = c.col !== undefined && frame.columns.includes(c.col) ? frame.data[c.col][row] : null;
  const base = { condition: c, text: conditionText(c), actual };
  let passed: boolean;
  try {
    passed = evalCondition(one, c)[0];
  } catch (e) {
    return { ...base, passed: false, distance: null, relative: Infinity, detail: (e as Error).message };
  }
  if (passed) return { ...base, passed, distance: 0, relative: 0, detail: '' };
  if (c.col !== undefined && !frame.columns.includes(c.col)) return { ...base, passed, distance: null, relative: Infinity, detail: 'column not in the report' };
  const x = num(actual);
  if (x === undefined) return { ...base, passed, distance: null, relative: Infinity, detail: actual === null ? 'missing' : `not a number: ${text(actual)}` };
  if (c.between) {
    const lo = num(c.between[0]);
    const hi = num(c.between[1]);
    if (lo !== undefined && hi !== undefined) {
      const d = x < lo ? lo - x : x - hi;
      const width = scale(Math.max(hi - lo, Math.abs(hi) * 1e-9, 1e-9));
      return { ...base, passed, distance: d, relative: d / width, detail: x < lo ? `${fmt(x)} < ${fmt(lo)} (-${fmt(d)})` : `${fmt(x)} > ${fmt(hi)} (+${fmt(d)})` };
    }
  }
  const v = num(c.value);
  if (v !== undefined && ['>', '>=', '<', '<=', '==', '!='].includes(c.op)) {
    const d = Math.abs(x - v);
    return { ...base, passed, distance: d, relative: d / scale(Math.max(Math.abs(v), 1e-9)), detail: `${fmt(x)} is not ${c.op} ${fmt(v)}` };
  }
  return { ...base, passed, distance: null, relative: Infinity, detail: `${text(actual)} does not match` };
}

export interface NearestGroup {
  stepIndex: number;
  name: string;
  /** Conditions the cell does not meet (empty = it would be grouped here). */
  failed: ConditionCheck[];
}

/**
 * Grouping steps ranked by how close the cell is to them: fewest failed conditions first, then the
 * smallest distance (relative to each column's span in the rules). Steps without a filter
 * (catch-all) and drop steps are left out.
 */
export function nearestGroups(frame: Frame, row: number, rules: RuleSet, limit = 3, spans = columnSpans(rules)): NearestGroup[] {
  const ranked = rules.steps.flatMap((step, stepIndex) => {
    if (step.filter === null || step.action !== 'keep') return [];
    const checks = step.filter.conditions.map((c) => checkCondition(frame, row, c, spans));
    const failed = step.filter.mode === 'any' && checks.some((k) => k.passed) ? [] : checks.filter((k) => !k.passed);
    const anyBest = step.filter.mode === 'any' && failed.length ? [failed.reduce((a, b) => (b.relative < a.relative ? b : a))] : failed;
    const score = anyBest.reduce((s, k) => s + (Number.isFinite(k.relative) ? k.relative : 1e6), 0);
    return [{ stepIndex, name: String(step.name), failed: anyBest, score }];
  });
  ranked.sort((a, b) => a.failed.length - b.failed.length || a.score - b.score || a.stepIndex - b.stepIndex);
  return ranked.slice(0, limit).map(({ stepIndex, name, failed }) => ({ stepIndex, name, failed }));
}

// ---------------------------------------------------------------------------
// NA cells of saved runs
// ---------------------------------------------------------------------------

export interface RunReport {
  /** Grading history run id. */
  runId: string;
  /** Shown to people, e.g. the run date and input file. */
  label: string;
  chemistry: string;
  /** The saved grouped report. */
  frame: Frame;
  groupCol: string;
}

export interface UnassignedCell {
  runId: string;
  runLabel: string;
  chemistry: string;
  row: number;
  cellId: string;
  /** The ERROR column (why a cell was not converted), when the report has one. */
  error: string;
  /** Rule columns with no value for this cell (e.g. a step of the test is missing). */
  missing: string[];
  /** Complete data: converted (no error) and a value in every column the rules check. Only these get rules generated. */
  complete: boolean;
  /** Group the given (current) rules already give this cell, '' if none: NA only in its saved report, a rerun is pending. */
  identifiedGroup: string;
  nearest: NearestGroup[];
}

/** Columns the grouping steps check (keep steps with a filter). */
export function ruleColumns(rules: RuleSet): string[] {
  const cols = new Set<string>();
  for (const st of rules.steps) if (st.filter) for (const c of st.filter.conditions) if (c.col !== undefined) cols.add(c.col);
  return [...cols];
}

/** Why a row's data is incomplete: its ERROR (not converted) and the rule columns without a value. */
export function rowCompleteness(frame: Frame, row: number, cols: string[]): { error: string; missing: string[]; complete: boolean } {
  const raw = frame.columns.includes('ERROR') ? text(frame.data.ERROR[row]) : '';
  const error = raw === '---' ? '' : raw;
  const missing = cols.filter((c) => !frame.columns.includes(c) || text(frame.data[c][row]).trim() === '');
  return { error, missing, complete: error === '' && missing.length === 0 };
}

/** The frame with only the given rows, in that order. */
function selectRows(frame: Frame, rows: number[]): Frame {
  const data: Frame['data'] = {};
  for (const c of frame.columns) data[c] = rows.map((r) => frame.data[c][r]);
  return { columns: frame.columns, data, kinds: frame.kinds, length: rows.length };
}

export interface DuplicateCell {
  cellId: string;
  /** The older run whose copy is skipped. */
  runLabel: string;
  /** The newest run with the same cell and test data, which is kept. */
  keptIn: string;
}

/**
 * Counts each cell once when the same batch was graded more than once: a row is skipped when a
 * newer run (runs are given newest first) has a row with the same chemistry, cell ID and test data
 * (every column except the group and the position "cell No."). The same channel in another batch
 * has other test data, so it is kept. Runs left without rows are dropped.
 */
export function latestCellRows(runs: RunReport[]): { runs: RunReport[]; duplicates: DuplicateCell[] } {
  const seen = new Map<string, string>();
  const duplicates: DuplicateCell[] = [];
  const kept: RunReport[] = [];
  for (const run of runs) {
    const idCol = cellIdColumn(run.frame);
    if (!idCol) {
      kept.push(run);
      continue;
    }
    const cols = run.frame.columns.filter((c) => c !== run.groupCol && c !== 'cell No.');
    const rows: number[] = [];
    for (let row = 0; row < run.frame.length; row++) {
      const key = `${run.chemistry}\u0000${cols.map((c) => `${c}=${text(run.frame.data[c][row])}`).join('\u0000')}`;
      const newer = seen.get(key);
      if (newer !== undefined) duplicates.push({ cellId: text(run.frame.data[idCol][row]), runLabel: run.label, keptIn: newer });
      else {
        seen.set(key, run.label);
        rows.push(row);
      }
    }
    if (rows.length === run.frame.length) kept.push(run);
    else if (rows.length) kept.push({ ...run, frame: selectRows(run.frame, rows) });
  }
  return { runs: kept, duplicates };
}

/** NA cells to write rules for: complete data and no group identified yet. */
export function actionableCells(cells: UnassignedCell[]): UnassignedCell[] {
  return cells.filter((c) => c.complete && !c.identifiedGroup);
}

/** Every NA cell of the runs, with its nearest groups under the given rules. */
export function unassignedCells(runs: RunReport[], rules: RuleSet): UnassignedCell[] {
  const spans = columnSpans(rules);
  const cols = ruleColumns(rules);
  return runs.flatMap((run) => {
    const idCol = cellIdColumn(run.frame);
    const frame = dropColumn(run.frame, run.groupCol);
    let current: GroupingResult | null = null;
    try {
      current = applySteps(frame, rules, { groupCol: run.groupCol });
    } catch {
      current = null; // the rules cannot group this report (e.g. a column is missing): nothing identified
    }
    return unassignedRows(run.frame, run.groupCol, rules).map((row) => {
      const { error, missing, complete } = rowCompleteness(frame, row, cols);
      return {
        missing,
        complete,
        identifiedGroup: current ? groupOf(current, row) : '',
        runId: run.runId,
        runLabel: run.label,
        chemistry: run.chemistry,
        row,
        cellId: idCol ? text(run.frame.data[idCol][row]) : `row ${row + 1}`,
        error,
        nearest: nearestGroups(frame, row, rules, 3, spans),
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface Suggestion {
  /** Proposed step name (to be renamed by the admin, e.g. to the next code). */
  name: string;
  /** The step it is copied from. */
  fromStep: string;
  fromIndex: number;
  /** The condition that changes: its column and new band. */
  col: string;
  between: [number, number];
  /** NA cells the new step would group (run label + cell). */
  cells: string[];
}

const decimals = (x: number) => {
  const s = fmt(x);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
};

/**
 * The band of the same width next to [lo, hi] (or k bands away) that contains x, keeping the gap
 * the rules use between bands (e.g. 4.51 - 5.5 → 5.51 - 6.5; 14950 - 15099.99 → 15100 - 15249.99).
 */
export function adjacentBand(lo: number, hi: number, x: number): [number, number] {
  const dp = Math.max(decimals(lo), decimals(hi));
  const gap = dp > 0 ? 10 ** -dp : 1;
  const width = hi - lo;
  const pitch = width + gap;
  const round = (v: number) => Number(v.toFixed(dp));
  if (x > hi) {
    const k = Math.max(1, Math.ceil((x - hi - gap) / pitch + 1e-9));
    const newLo = round(hi + gap + (k - 1) * pitch);
    return [newLo, round(newLo + width)];
  }
  const k = Math.max(1, Math.ceil((lo - gap - x) / pitch + 1e-9));
  const newHi = round(lo - gap - (k - 1) * pitch);
  return [round(newHi - width), newHi];
}

/**
 * New steps for NA cells that miss their nearest group by exactly one numeric band: a copy of that
 * group with the band moved next to it so the cell falls in (cells needing the same band share one
 * suggestion). Only cells with complete data and no group identified yet are used; cells that miss
 * by more than one condition get none.
 */
export function suggestSteps(cells: UnassignedCell[], rules: RuleSet): Suggestion[] {
  const byKey = new Map<string, Suggestion>();
  const used = new Set(rules.steps.map((s) => String(s.name)));
  let n = 0;
  for (const cell of actionableCells(cells)) {
    const best = cell.nearest[0];
    if (!best || best.failed.length !== 1) continue;
    const k = best.failed[0];
    const c = k.condition;
    const x = num(k.actual);
    const lo = c.between ? num(c.between[0]) : undefined;
    const hi = c.between ? num(c.between[1]) : undefined;
    if (!c.between || c.col === undefined || x === undefined || lo === undefined || hi === undefined || hi < lo) continue;
    const band = adjacentBand(lo, hi, x);
    const key = `${best.stepIndex}|${c.col}|${band[0]}|${band[1]}`;
    if (!byKey.has(key)) {
      let name: string;
      do name = `NEW-${++n}`;
      while (used.has(name));
      used.add(name);
      byKey.set(key, { name, fromStep: best.name, fromIndex: best.stepIndex, col: c.col, between: band, cells: [] });
    }
    byKey.get(key)!.cells.push(`${cell.runLabel}: ${cell.cellId}`);
  }
  return [...byKey.values()];
}

const yamlScalar = (r: RuleScalar | undefined): string => {
  if (r instanceof PyFloat) return Number.isInteger(r.value) ? `${r.value}.0` : String(r.value);
  if (typeof r === 'string') return JSON.stringify(r);
  if (r === null || r === undefined) return 'null';
  return String(r);
};

function conditionYaml(c: Condition, between?: [number, number]): string {
  const parts: string[] = [];
  if (c.col !== undefined) parts.push(`col: ${JSON.stringify(c.col)}`);
  if (between) parts.push(`between: [${between.map(fmt).join(', ')}]`);
  else if (c.between) parts.push(`between: [${c.between.map(yamlScalar).join(', ')}]`);
  else {
    if (c.regex !== undefined) parts.push(`regex: ${JSON.stringify(c.regex)}`);
    if (c.regex === undefined) parts.push(`op: ${JSON.stringify(c.op)}`);
    if (c.values) parts.push(`values: [${c.values.map(yamlScalar).join(', ')}]`);
    else if (c.value !== undefined) parts.push(`value: ${yamlScalar(c.value)}`);
  }
  if (c.caseInsensitive) parts.push('case_insensitive: true');
  return `{ ${parts.join(', ')} }`;
}

function stepYaml(step: Step, s: Suggestion, indent: string): string {
  const filter = step.filter!;
  const lines = [
    `${indent}- name: ${JSON.stringify(s.name)}   # suggested from ${step.name}: ${s.col} ${fmt(s.between[0])} - ${fmt(s.between[1])} (${s.cells.length} NA cell${s.cells.length === 1 ? '' : 's'})`,
    `${indent}  filter:`,
    `${indent}    ${filter.mode}:`,
    ...filter.conditions.map((c) => `${indent}      - ${conditionYaml(c, c.col === s.col && c.between ? s.between : undefined)}`),
    `${indent}  then:`,
    `${indent}    action: ${step.action}`,
  ];
  if (step.set.length) {
    lines.push(`${indent}    set:`);
    for (const [k, v] of step.set) lines.push(`${indent}      ${JSON.stringify(k)}: ${yamlScalar(v)}`);
  }
  if (!step.once) lines.push(`${indent}  once: false`);
  return lines.join('\n') + '\n';
}

/**
 * The rules text with the suggested steps inserted before the first catch-all step (or at the end
 * of `steps`). The rest of the file, comments and formatting included, is left as it is.
 */
export function applySuggestions(yamlText: string, suggestions: Suggestion[], rules: RuleSet): string {
  if (!suggestions.length) return yamlText;
  const doc = parseDocument(yamlText, { version: '1.1', uniqueKeys: false });
  const steps = isMap(doc.contents) ? doc.contents.get('steps', true) : undefined;
  if (!isSeq(steps) || !steps.items.length) throw new Error("The rules have no 'steps' list to add to.");
  const catchAll = rules.steps.findIndex((s) => s.filter === null);
  const anchor = catchAll >= 0 ? steps.items[catchAll] : null;
  const lineStart = (offset: number) => yamlText.lastIndexOf('\n', offset - 1) + 1;
  let insertAt: number;
  let indent: string;
  if (anchor && (anchor as { range?: number[] }).range) {
    const start = (anchor as { range: number[] }).range[0];
    insertAt = lineStart(start);
    const line = yamlText.slice(insertAt, start);
    indent = line.slice(0, line.indexOf('-') >= 0 ? line.indexOf('-') : 0);
  } else {
    const last = steps.items[steps.items.length - 1] as { range?: number[] };
    const first = steps.items[0] as { range?: number[] };
    const firstLine = yamlText.slice(lineStart(first.range![0]), first.range![0]);
    indent = firstLine.slice(0, Math.max(0, firstLine.indexOf('-')));
    const end = last.range![2];
    insertAt = yamlText.indexOf('\n', end - 1) + 1 || yamlText.length;
  }
  const block = suggestions.map((s) => stepYaml(rules.steps[s.fromIndex], s, indent)).join('\n') + '\n';
  const before = yamlText.slice(0, insertAt);
  return (before.endsWith('\n') || before === '' ? before : before + '\n') + block + yamlText.slice(insertAt);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CellChange {
  runLabel: string;
  cellId: string;
  /** Group in the saved report ('' = NA). */
  from: string;
  /** Group under the proposed rules ('' = NA). */
  to: string;
}

export interface ValidationReport {
  /** Problems in the rules file; nothing else is checked when there are any. */
  errors: string[];
  warnings: string[];
  /** Runs that could not be grouped with the proposed rules (e.g. a column missing). */
  runErrors: Array<{ runLabel: string; message: string }>;
  cellsChecked: number;
  /** NA cells that the proposed rules group. */
  nowGrouped: CellChange[];
  /** Cells with complete data that stay NA. */
  stillUnassigned: CellChange[];
  /** NA cells with incomplete data (not converted or a value missing) that stay NA: ignored. */
  incomplete: CellChange[];
  /** Cells with a group whose group would change (including to NA): check these before publishing. */
  changed: CellChange[];
  /** Cells per group under the proposed rules. */
  groupCounts: Record<string, number>;
}

function groupOf(result: GroupingResult, row: number): string {
  const s = result.sourceStep[row];
  if (s === null || result.rules.steps[s].filter === null) return '';
  return text(result.frame.data[result.groupCol][row]);
}

/**
 * Groups every cell of the runs again with the proposed rules and compares with the saved reports:
 * which NA cells get a group, which stay NA, and which already grouped cells would move.
 */
export function validateProposal(yamlText: string, runs: RunReport[], currentRules: RuleSet): ValidationReport {
  const parsed = parseRules(yamlText);
  const report: ValidationReport = {
    errors: parsed.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)),
    warnings: parsed.warnings.map((w) => (w.path ? `${w.path}: ${w.message}` : w.message)),
    runErrors: [],
    cellsChecked: 0,
    nowGrouped: [],
    stillUnassigned: [],
    incomplete: [],
    changed: [],
    groupCounts: {},
  };
  if (report.errors.length || !parsed.rules) return report;
  const oldCatchAll = catchAllNames(currentRules);
  const cols = ruleColumns(currentRules);
  for (const run of runs) {
    const idCol = cellIdColumn(run.frame);
    let result: GroupingResult;
    try {
      result = applySteps(dropColumn(run.frame, run.groupCol), parsed.rules, { groupCol: run.groupCol });
    } catch (e) {
      report.runErrors.push({ runLabel: run.label, message: (e as Error).message });
      continue;
    }
    const saved = run.frame.columns.includes(run.groupCol) ? run.frame.data[run.groupCol] : [];
    for (let row = 0; row < run.frame.length; row++) {
      const fromRaw = text(saved[row]);
      const from = oldCatchAll.has(fromRaw) ? '' : fromRaw.trim();
      const to = groupOf(result, row);
      const change = { runLabel: run.label, cellId: idCol ? text(run.frame.data[idCol][row]) : `row ${row + 1}`, from, to };
      report.cellsChecked++;
      const key = to || 'NA';
      report.groupCounts[key] = (report.groupCounts[key] ?? 0) + 1;
      if (from === '' && to) report.nowGrouped.push(change);
      else if (from === '') (rowCompleteness(run.frame, row, cols).complete ? report.stillUnassigned : report.incomplete).push(change);
      else if (to !== from) report.changed.push(change);
    }
  }
  return report;
}
