/**
 * After new rules go live: compare them with the rules they replace, and regroup the NA cells of
 * a saved run (database/25_cell_grouping_na_reruns.sql). Cells that already have a group keep it,
 * so a rerun never moves a cell that was already sorted. Pure functions on the saved report.
 */
import { applySteps, DEFAULT_GROUP_COL } from './engine.ts';
import { cloneFrame } from './frame.ts';
import { catchAllNames, cellIdColumn, conditionText, dropColumn, unassignedRows } from './naWorkbench.ts';
import type { CellChange } from './naWorkbench.ts';
import type { RunSummary } from './runRecord.ts';
import type { Cell, Frame, RuleScalar, RuleSet, Step } from './types.ts';
import { PyFloat } from './types.ts';

const text = (c: Cell | undefined): string => (c === null || c === undefined ? '' : String(c));
const scalar = (r: RuleScalar): string => (r instanceof PyFloat ? String(r.value) : r === null ? 'None' : String(r));

// ---------------------------------------------------------------------------
// Rules comparison
// ---------------------------------------------------------------------------

/** One step written as lines people can compare: its conditions, then anything unusual. */
export function stepLines(step: Step): string[] {
  const lines = step.filter
    ? step.filter.conditions.map((c, i) => (i === 0 ? '' : step.filter!.mode === 'any' ? 'or ' : 'and ') + conditionText(c))
    : ['every cell not grouped above'];
  if (step.action === 'drop') lines.push('action: drop (rejected)');
  if (!step.once) lines.push('once: false (also regroups cells grouped above)');
  for (const [col, value] of step.set) lines.push(`set ${col} = ${scalar(value)}`);
  return lines;
}

export interface StepChange {
  name: string;
  before: string[];
  after: string[];
}

export interface RulesComparison {
  /** Steps only in the new rules, with their position (1-based). */
  added: Array<{ name: string; position: number; lines: string[] }>;
  /** Steps only in the current rules. */
  removed: Array<{ name: string; lines: string[] }>;
  /** Steps in both whose conditions or action differ. */
  changed: StepChange[];
  /** Steps in both whose relative order differs (order decides which group a cell gets). */
  reordered: boolean;
  /** Other differences: default action, preprocessing. */
  other: string[];
  /** Nothing differs. */
  same: boolean;
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Differences between the rules in use and new rules, step by step (steps matched by name). */
export function compareRules(current: RuleSet, next: RuleSet): RulesComparison {
  const name = (s: Step) => String(s.name);
  const curByName = new Map(current.steps.map((s) => [name(s), s]));
  const nextByName = new Map(next.steps.map((s) => [name(s), s]));
  const added = next.steps.flatMap((s, i) => (curByName.has(name(s)) ? [] : [{ name: name(s), position: i + 1, lines: stepLines(s) }]));
  const removed = current.steps.flatMap((s) => (nextByName.has(name(s)) ? [] : [{ name: name(s), lines: stepLines(s) }]));
  const changed = next.steps.flatMap((s) => {
    const old = curByName.get(name(s));
    if (!old) return [];
    const before = stepLines(old);
    const after = stepLines(s);
    return sameLines(before, after) ? [] : [{ name: name(s), before, after }];
  });
  const common = (steps: Step[], other: Map<string, Step>) => steps.map(name).filter((n) => other.has(n));
  const reordered = !sameLines(common(current.steps, nextByName), common(next.steps, curByName));
  const other: string[] = [];
  if (current.defaultAction !== next.defaultAction) other.push(`default_action: ${current.defaultAction} → ${next.defaultAction}`);
  if (JSON.stringify(current.preprocess ?? null) !== JSON.stringify(next.preprocess ?? null)) other.push('preprocess block changed');
  return { added, removed, changed, reordered, other, same: !added.length && !removed.length && !changed.length && !reordered && !other.length };
}

// ---------------------------------------------------------------------------
// Rerun of the NA cells of one saved run
// ---------------------------------------------------------------------------

/** The group column of a saved report: "Category", else the last column (where grouping adds it). */
export function reportGroupColumn(columns: string[]): string {
  return columns.includes(DEFAULT_GROUP_COL) ? DEFAULT_GROUP_COL : columns[columns.length - 1];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export interface RerunResult {
  /** The saved report with the NA cells regrouped (same columns and rows). */
  frame: Frame;
  /** NA cells that now have a group ('' from). */
  regrouped: CellChange[];
  /** Cells that are still NA. */
  stillUnassigned: CellChange[];
  /** For the new run row in the grading history. */
  summary: RunSummary;
}

/**
 * Regroups the NA cells of a saved report with the new rules. Cells with a group keep it, even if
 * the new rules would group them differently: they may already be sorted into their bins.
 * The NA cells are those of the rules the run used (oldRules) or of the new rules' catch-all.
 * Throws when the new rules cannot group the report (e.g. a column the rules need is missing).
 */
export function rerunUnassigned(report: Frame, groupCol: string, oldRules: RuleSet, newRules: RuleSet, runLabel = ''): RerunResult {
  if (!report.columns.includes(groupCol)) throw new Error(`The saved report has no "${groupCol}" column.`);
  const na = new Set([...unassignedRows(report, groupCol, oldRules), ...unassignedRows(report, groupCol, newRules)]);
  const result = applySteps(dropColumn(report, groupCol), newRules, { groupCol });
  const kept = new Set(result.outputRows);
  const catchAll = [...catchAllNames(newRules)][0] ?? 'NA';
  const idCol = cellIdColumn(report);

  const frame = cloneFrame(report);
  frame.kinds[groupCol] = 'object';
  const labels = frame.data[groupCol];
  const regrouped: CellChange[] = [];
  const stillUnassigned: CellChange[] = [];
  for (const row of [...na].sort((a, b) => a - b)) {
    const s = result.sourceStep[row];
    const grouped = s !== null && newRules.steps[s].filter !== null && kept.has(row);
    const label = grouped ? text(result.frame.data[groupCol][row]) : catchAll;
    labels[row] = label;
    const change = { runLabel, cellId: idCol ? text(report.data[idCol][row]) : `row ${row + 1}`, from: '', to: grouped ? label : '' };
    (grouped ? regrouped : stillUnassigned).push(change);
  }

  // Summary as summarizeRun counts it: rejected cells under "Rejected", NA cells as unassigned.
  const dropNames = new Set([...oldRules.steps, ...newRules.steps].filter((st) => st.action === 'drop').map((st) => String(st.name)));
  const naNames = new Set([...catchAllNames(oldRules), ...catchAllNames(newRules)]);
  const groupCounts: Record<string, number> = {};
  let rejectedCount = 0;
  let unassignedCount = 0;
  labels.forEach((l) => {
    const t = text(l);
    const isRejected = dropNames.has(t);
    if (isRejected) rejectedCount++;
    else if (t === '' || naNames.has(t)) unassignedCount++;
    const key = isRejected ? 'Rejected' : t || catchAll;
    groupCounts[key] = (groupCounts[key] ?? 0) + 1;
  });
  if (groupCounts.Rejected !== undefined) {
    const n = groupCounts.Rejected;
    delete groupCounts.Rejected;
    groupCounts.Rejected = n;
  }
  return {
    frame,
    regrouped,
    stillUnassigned,
    summary: { cellsGrouped: frame.length, groupCounts, unassignedCount, rejectedCount },
  };
}
