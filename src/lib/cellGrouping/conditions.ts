/**
 * Condition evaluation: TypeScript port of the per-condition part of Python `_build_mask`.
 * Each operator is a pure function returning a boolean mask over the frame rows.
 */
import { rowJoinStrings } from './frame.ts';
import {
  applyOp,
  comparePyStrings,
  compareNumbers,
  isPyNull,
  numericOf,
  pandasStr,
  parsePyFloat,
  pyRegex,
  pyStr,
  pyValFromCell,
  pyValFromRule,
  toFloatOrStr,
} from './pyCompat.ts';
import type { CompareOp } from './pyCompat.ts';
import type { Cell, ColumnKind, Condition, Filter, Frame, PyVal } from './types.ts';

export class RuleEvaluationError extends Error {}

const COMPARE_OPS: ReadonlySet<string> = new Set(['>', '>=', '<', '<=', '==', '!=']);

/** Every operator spelling the Python reference accepts (after lower-casing). */
export const SUPPORTED_OPS: readonly string[] = [
  '>', '>=', '<', '<=', '==', '!=', 'in', 'not in', 'nin', 'contains', '~',
  'startswith', 'beginswith', 'endswith',
];

interface ColumnView {
  cells: Cell[];
  kind: ColumnKind;
}

const strings = (col: ColumnView): string[] => col.cells.map((c) => pandasStr(c, col.kind));

/** `s.astype(str) <op> str(v)`: the fallback Python uses when pandas raises TypeError. */
function compareAsStrings(col: ColumnView, op: CompareOp, v: PyVal): boolean[] {
  const target = pyStr(v);
  return strings(col).map((s) => applyOp(op, comparePyStrings(s, target)));
}

/** Python `eval(f"s {op} v")` with its TypeError fallback. */
export function compareColumn(col: ColumnView, op: CompareOp, v: PyVal): boolean[] {
  // Comparison with None / NaN: all False (all True for !=), never raises.
  if (isPyNull(v)) return col.cells.map(() => op === '!=');

  const vNum = numericOf(v);
  if (col.kind !== 'object') {
    if (vNum === undefined) {
      // numeric/bool column vs str: pandas `invalid_comparison`
      if (op === '==') return col.cells.map(() => false);
      if (op === '!=') return col.cells.map(() => true);
      return compareAsStrings(col, op, v);
    }
    return col.cells.map((c) =>
      c === null ? op === '!=' : compareNumbers(op, typeof c === 'boolean' ? Number(c) : (c as number), vNum),
    );
  }

  // object column: element-wise Python comparison, nulls skipped, TypeError → fallback
  const out: boolean[] = [];
  for (const cell of col.cells) {
    if (cell === null) {
      out.push(op === '!=');
      continue;
    }
    const x = pyValFromCell(cell, col.kind);
    const xNum = numericOf(x);
    if (xNum !== undefined && vNum !== undefined) out.push(compareNumbers(op, xNum, vNum));
    else if (x.t === 'str' && v.t === 'str') out.push(applyOp(op, comparePyStrings(x.v, v.v)));
    else if (op === '==') out.push(false);
    else if (op === '!=') out.push(true);
    else return compareAsStrings(col, op, v);
  }
  return out;
}

/** pandas `Series.isin(values)`. */
export function isin(col: ColumnView, values: PyVal[]): boolean[] {
  const matchesNaN = values.some((v) => v.t === 'float' && Number.isNaN(v.v));
  const nums = values.map(numericOf).filter((n): n is number => n !== undefined && !Number.isNaN(n));
  const strs = new Set(values.filter((v) => v.t === 'str').map((v) => (v as { v: string }).v));
  return col.cells.map((c) => {
    if (c === null) return matchesNaN;
    if (typeof c === 'string') return strs.has(c);
    const n = typeof c === 'boolean' ? Number(c) : c;
    return nums.includes(n);
  });
}

/** pandas `s.astype(float).between(lo, hi, inclusive="both")`. */
export function between(col: ColumnView, loRaw: PyVal, hiRaw: PyVal): boolean[] {
  const toFloat = (v: PyVal, what: string): number => {
    const n = numericOf(v);
    if (n !== undefined) return n;
    if (v.t === 'str') {
      const f = parsePyFloat(v.v);
      if (f !== undefined) return f;
      throw new RuleEvaluationError(`could not convert string to float: '${v.v}' (between ${what})`);
    }
    throw new RuleEvaluationError(`between ${what} must be a number, got None`);
  };
  const lo = toFloat(toFloatOrStr(loRaw), 'lower bound');
  const hi = toFloat(toFloatOrStr(hiRaw), 'upper bound');
  return col.cells.map((c) => {
    let x: number;
    if (c === null) return false;
    if (typeof c === 'boolean') x = Number(c);
    else if (typeof c === 'number') x = c;
    else {
      const f = parsePyFloat(c);
      if (f === undefined) throw new RuleEvaluationError(`could not convert string to float: '${c}'`);
      x = f;
    }
    return !Number.isNaN(x) && x >= lo && x <= hi;
  });
}

function regexTest(values: string[], pattern: string, ci: boolean): boolean[] {
  const re = pyRegex(pattern, ci);
  return values.map((s) => re.test(s));
}

function prefixSuffix(col: ColumnView, v: PyVal, ci: boolean, fn: 'startsWith' | 'endsWith'): boolean[] {
  const target = ci ? pyStr(v).toLowerCase() : pyStr(v);
  return strings(col).map((s) => (ci ? s.toLowerCase() : s)[fn](target));
}

/** Evaluates one condition (Python `_build_mask` loop body). */
export function evalCondition(frame: Frame, cond: Condition): boolean[] {
  const ci = cond.caseInsensitive;

  if (cond.col === undefined && cond.regex === undefined) {
    throw new RuleEvaluationError(`Condition requires 'col' or 'regex'`);
  }

  if (cond.regex !== undefined) {
    let values: string[];
    if (cond.col) {
      const name = cond.col.trim();
      if (!frame.columns.includes(name)) throw new RuleEvaluationError(`Column '${name}' not found (regex condition)`);
      values = strings({ cells: frame.data[name], kind: frame.kinds[name] });
    } else {
      values = rowJoinStrings(frame);
    }
    return regexTest(values, cond.regex, ci);
  }

  const colName = cond.col as string;
  if (!frame.columns.includes(colName)) return new Array<boolean>(frame.length).fill(false);
  const col: ColumnView = { cells: frame.data[colName], kind: frame.kinds[colName] };

  const v = cond.value === undefined || cond.value === null ? ({ t: 'none' } as PyVal) : toFloatOrStr(pyValFromRule(cond.value));
  let vs = cond.values === undefined ? undefined : cond.values.map((x) => toFloatOrStr(pyValFromRule(x)));

  if (cond.between !== undefined) {
    return between(col, pyValFromRule(cond.between[0]), pyValFromRule(cond.between[1]));
  }

  const op = cond.op;
  if (COMPARE_OPS.has(op)) return compareColumn(col, op as CompareOp, v);

  switch (op) {
    case 'in':
    case 'not in':
    case 'nin': {
      if (vs === undefined && v.t !== 'none') vs = [v];
      if (vs === undefined) throw new RuleEvaluationError(`'${op}' requires 'values' or a single 'value'.`);
      const m = isin(col, vs);
      return op === 'in' ? m : m.map((x) => !x);
    }
    case 'contains':
    case '~':
      return regexTest(strings(col), pyStr(v), ci);
    case 'startswith':
    case 'beginswith':
      return prefixSuffix(col, v, ci, 'startsWith');
    case 'endswith':
      return prefixSuffix(col, v, ci, 'endsWith');
    default:
      throw new RuleEvaluationError(`Unsupported op: ${op}`);
  }
}

/** Python `_build_mask`: AND (`all`) or OR (`any`) of the conditions; no filter = every row. */
export function buildMask(frame: Frame, filter: Filter | null): boolean[] {
  if (filter === null) return new Array<boolean>(frame.length).fill(true);
  const parts = filter.conditions.map((c) => evalCondition(frame, c));
  if (parts.length === 0) throw new RuleEvaluationError(`'${filter.mode}' needs at least one condition`);
  return parts.reduce((acc, p) => acc.map((x, i) => (filter.mode === 'all' ? x && p[i] : x || p[i])));
}
