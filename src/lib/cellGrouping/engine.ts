/**
 * Step engine: TypeScript port of Python `_apply_steps` (categorize_csv.py).
 * Pure: the input frame is never mutated.
 */
import { buildMask } from './conditions.ts';
import { cloneFrame, setColumn } from './frame.ts';
import { pyValFromRule } from './pyCompat.ts';
import type { ApplyOptions, Frame, GroupingResult, RuleScalar, RuleSet } from './types.ts';

/** Same default as the CLI's --category-col. */
export const DEFAULT_GROUP_COL = 'Category';

export function applySteps(input: Frame, rules: RuleSet, options: ApplyOptions): GroupingResult {
  const { groupCol } = options;
  const frame = cloneFrame(input);
  const n = frame.length;

  let keepMask = new Array<boolean>(n).fill(false);
  let assigned = frame.columns.includes(groupCol)
    ? frame.data[groupCol].map((c) => c !== null)
    : new Array<boolean>(n).fill(false);
  const sourceStep = new Array<number | null>(n).fill(null);

  rules.steps.forEach((step, stepIndex) => {
    const mask = buildMask(frame, step.filter);

    // Default group label = step name unless `then.set` provides the group column.
    const setEntries: Array<[string, RuleScalar]> = step.set.slice();
    if (!setEntries.some(([k]) => k === groupCol)) setEntries.push([groupCol, step.name]);

    const target = step.once ? mask.map((m, i) => m && !assigned[i]) : mask;
    for (const [col, value] of setEntries) setColumn(frame, col, target, pyValFromRule(value));
    target.forEach((t, i) => {
      if (t) sourceStep[i] = stepIndex;
    });
    if (step.once) assigned = assigned.map((a, i) => a || target[i]);

    keepMask = step.action === 'keep' ? keepMask.map((k, i) => k || mask[i]) : keepMask.map((k, i) => k && !mask[i]);
  });

  const allRows = Array.from({ length: n }, (_, i) => i);
  const outputRows = rules.defaultAction === 'drop_unmatched' ? allRows.filter((i) => keepMask[i]) : allRows;
  const rejectedRows = allRows.filter((i) => {
    const s = sourceStep[i];
    return s !== null && rules.steps[s].action === 'drop';
  });

  return { frame, keepMask, outputRows, sourceStep, rejectedRows, groupCol, rules };
}

/** Python-equivalent output table as rows (header excluded). */
export function outputTable(result: GroupingResult): { columns: string[]; rows: Array<Array<Frame['data'][string][number]>> } {
  const { frame, outputRows } = result;
  return {
    columns: frame.columns.slice(),
    rows: outputRows.map((r) => frame.columns.map((c) => frame.data[c][r])),
  };
}

export interface GroupSummary {
  /** Group label as written to the group column (`null` = row never labelled). */
  label: string | number | boolean | null;
  rows: number[];
  rejected: boolean;
  /** Names of the steps that produced this label. */
  steps: Array<string | number | boolean>;
}

/**
 * Groups for display/export. Rejected rows (labelled by a drop step) are grouped
 * separately and flagged; other groups only contain rows of the Python output.
 */
export function summarizeGroups(result: GroupingResult): GroupSummary[] {
  const { frame, groupCol, sourceStep, rules } = result;
  const rejected = new Set(result.rejectedRows);
  const labels = frame.data[groupCol] ?? [];
  const map = new Map<string, GroupSummary>();
  const rowsToShow = new Set([...result.outputRows, ...result.rejectedRows]);
  for (const r of [...rowsToShow].sort((a, b) => a - b)) {
    const label = (labels[r] ?? null) as GroupSummary['label'];
    const isRejected = rejected.has(r);
    const key = `${isRejected ? 'R' : 'G'}:${typeof label}:${String(label)}`;
    let g = map.get(key);
    if (!g) {
      g = { label, rows: [], rejected: isRejected, steps: [] };
      map.set(key, g);
    }
    g.rows.push(r);
    const s = sourceStep[r];
    if (s !== null && !g.steps.includes(rules.steps[s].name)) g.steps.push(rules.steps[s].name);
  }
  return [...map.values()];
}
