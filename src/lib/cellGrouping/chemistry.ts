/**
 * Cell chemistries that each have their own grouping rules (YAML).
 * Add an entry here to support another chemistry; the UI is built from this list.
 */
import type { Frame, RuleSet } from './types.ts';

export interface Chemistry {
  id: string;
  label: string;
  description: string;
  /** Accepts per-cell time-series reports (one file per cell), converted to the machine layout. */
  perCellReports?: boolean;
}

export const CHEMISTRIES: readonly Chemistry[] = [
  { id: 'LFP', label: 'LFP', description: 'Lithium iron phosphate', perCellReports: true },
  { id: 'NMC', label: 'NMC', description: 'Nickel manganese cobalt' },
];

/** A published version of one chemistry's rules (row of the cell_grouping_rules table). */
export interface PublishedRules {
  id: string;
  chemistry: string;
  file_name: string;
  yaml_text: string;
  uploaded_by_email: string | null;
  uploaded_at: string;
}

/** Columns the rules refer to that the data does not have, in rule order (each once). */
export function missingRuleColumns(rules: RuleSet, frame: Pick<Frame, 'columns'>): string[] {
  const have = new Set(frame.columns);
  const missing: string[] = [];
  for (const step of rules.steps) {
    for (const cond of step.filter?.conditions ?? []) {
      if (cond.col !== undefined && !have.has(cond.col) && !missing.includes(cond.col)) missing.push(cond.col);
    }
  }
  return missing;
}
