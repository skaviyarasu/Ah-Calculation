/**
 * Core types for the cell-grouping engine.
 *
 * The engine is a TypeScript port of the Python reference
 * (PythonProject/categorize_csv.py, `_apply_steps`). Data is held column-wise,
 * together with a pandas-equivalent dtype ("kind") per column, because several
 * rule operators behave differently depending on the column dtype
 * (e.g. `astype(str)` renders 20 as "20" in an int column but "20.0" in a float column).
 */

/** A single spreadsheet value after pandas-style type inference. `null` = NaN/None. */
export type Cell = number | string | boolean | null;

/** pandas dtype family of a column. */
export type ColumnKind = 'int' | 'float' | 'bool' | 'object';

/** Column-oriented table (the equivalent of a pandas DataFrame). */
export interface Frame {
  columns: string[];
  data: Record<string, Cell[]>;
  kinds: Record<string, ColumnKind>;
  length: number;
}

/**
 * Marks a YAML value that PyYAML would load as a Python `float` (e.g. `20.0`).
 * JavaScript has a single number type, so without this marker `20.0` and `20`
 * would be indistinguishable, yet Python renders them differently ("20.0" vs "20")
 * in string comparisons.
 */
export class PyFloat {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}

/** A scalar as it appears in the rules file. */
export type RuleScalar = string | number | boolean | null | PyFloat;

/** Python value with its runtime type made explicit. */
export type PyVal =
  | { t: 'int'; v: number }
  | { t: 'float'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'none' };

export interface Condition {
  /** Column name; `undefined` mirrors Python `None`. */
  col?: string;
  /** Lower-cased operator (Python default "=="). */
  op: string;
  value?: RuleScalar;
  values?: RuleScalar[];
  between?: RuleScalar[];
  regex?: string;
  caseInsensitive: boolean;
}

export interface Filter {
  mode: 'all' | 'any';
  conditions: Condition[];
}

export type StepAction = 'keep' | 'drop';

export interface Step {
  /** Raw step name (string or number, exactly as in YAML); default group label. */
  name: string | number | boolean;
  /** `null` = no filter: every row matches. */
  filter: Filter | null;
  action: StepAction;
  /** Ordered `then.set` entries. */
  set: Array<[string, RuleScalar]>;
  once: boolean;
}

export interface RuleSet {
  /** Raw `global.default_action`; only "drop_unmatched" changes behaviour. */
  defaultAction: string;
  steps: Step[];
}

export interface ApplyOptions {
  /** Column that receives the group label (CLI `--category-col`, default "Category"). */
  groupCol: string;
}

export interface GroupingResult {
  /** All rows after every step, including added columns (before drop_unmatched filtering). */
  frame: Frame;
  /** Python `keep_mask`. */
  keepMask: boolean[];
  /** Row indices of the Python-equivalent output (all rows, or keep_mask rows for drop_unmatched). */
  outputRows: number[];
  /** Index of the step that last wrote the group label of each row; `null` = never written by a step. */
  sourceStep: Array<number | null>;
  /** Rows whose group label came from a step with `action: drop`. */
  rejectedRows: number[];
  groupCol: string;
  rules: RuleSet;
}
