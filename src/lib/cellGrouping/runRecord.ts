/**
 * Summary of one grouping run, for the grading history (database/21_cell_grouping_runs.sql).
 * Pure: derived only from the grouping result.
 */
import { summarizeGroups } from './engine.ts';
import type { GroupSummary } from './engine.ts';
import { labelText } from './excel.ts';
import type { GroupingResult } from './types.ts';

export interface RunSummary {
  /** Rows in the grouping report (drop_unmatched respected). */
  cellsGrouped: number;
  /** Cells per group label, in the order the groups first appear. Rejected cells are under "Rejected". */
  groupCounts: Record<string, number>;
  /** Cells labelled by a catch-all step (no filter) or by no step. */
  unassignedCount: number;
  /** Cells labelled by a drop step. */
  rejectedCount: number;
}

/** True for a group that is "unassigned": no label, or only produced by catch-all steps (no filter). */
export function isUnassignedGroup(result: GroupingResult, group: GroupSummary): boolean {
  const catchAll = new Set(result.rules.steps.filter((st) => st.filter === null).map((st) => String(st.name)));
  return group.label === null || (group.steps.length > 0 && group.steps.every((st) => catchAll.has(String(st))));
}

export function summarizeRun(result: GroupingResult): RunSummary {
  const groups = summarizeGroups(result);
  const groupCounts: Record<string, number> = {};
  for (const g of groups.filter((x) => !x.rejected)) groupCounts[labelText(g.label)] = (groupCounts[labelText(g.label)] ?? 0) + g.rows.length;
  if (result.rejectedRows.length) groupCounts.Rejected = (groupCounts.Rejected ?? 0) + result.rejectedRows.length;
  return {
    cellsGrouped: result.outputRows.length,
    groupCounts,
    unassignedCount: groups.filter((g) => !g.rejected && isUnassignedGroup(result, g)).reduce((n, g) => n + g.rows.length, 0),
    rejectedCount: result.rejectedRows.length,
  };
}
