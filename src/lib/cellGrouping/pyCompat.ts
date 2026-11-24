/**
 * Helpers that reproduce Python / pandas value semantics in TypeScript.
 * Every function here is pure.
 */
import { PyFloat } from './types.ts';
import type { Cell, ColumnKind, PyVal, RuleScalar } from './types.ts';

/** Strings that `to_float_or_str` turns into NaN (compared after strip().lower()). */
const RULE_NAN_STRINGS = new Set(['nan', 'none', 'null', '']);

/** Python `float(str)` grammar (whitespace stripped, underscores between digits allowed). */
const PY_FLOAT_RE = /^[+-]?(?:(?:\d(?:_?\d)*)?(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d(?:_?\d)*)?)$/;
const PY_SPECIAL_RE = /^([+-]?)(inf|infinity|nan)$/i;

/** Python `float(s)`; returns `undefined` where Python raises ValueError. */
export function parsePyFloat(s: string): number | undefined {
  const t = s.trim();
  const special = PY_SPECIAL_RE.exec(t);
  if (special) {
    if (special[2].toLowerCase() === 'nan') return Number.NaN;
    return special[1] === '-' ? -Infinity : Infinity;
  }
  if (!PY_FLOAT_RE.test(t) || !/\d/.test(t)) return undefined;
  const mantissa = t.split(/[eE]/)[0];
  if (!/\d/.test(mantissa)) return undefined;
  return Number(t.replace(/_/g, ''));
}

/** Converts a rule scalar to a typed Python value (YAML int → int, YAML float → float). */
export function pyValFromRule(x: RuleScalar | undefined): PyVal {
  if (x === undefined || x === null) return { t: 'none' };
  if (x instanceof PyFloat) return { t: 'float', v: x.value };
  if (typeof x === 'number') return Number.isInteger(x) ? { t: 'int', v: x } : { t: 'float', v: x };
  if (typeof x === 'boolean') return { t: 'bool', v: x };
  return { t: 'str', v: x };
}

/** Python `_to_num_or_str` / `to_float_or_str`. */
export function toFloatOrStr(v: PyVal): PyVal {
  if (v.t !== 'str') return v;
  if (RULE_NAN_STRINGS.has(v.v.trim().toLowerCase())) return { t: 'float', v: Number.NaN };
  const f = parsePyFloat(v.v);
  return f === undefined ? v : { t: 'float', v: f };
}

/** Python `repr(float)` (shortest round-trip, Python's exponent thresholds). */
export function pyFloatRepr(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0';
  const sign = n < 0 ? '-' : '';
  const [mant, expStr] = Math.abs(n).toExponential().split('e');
  const exp = Number(expStr);
  const digits = mant.replace('.', '');
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) {
      const intPart = digits.padEnd(exp + 1, '0').slice(0, exp + 1);
      const frac = digits.slice(exp + 1);
      return `${sign}${intPart}.${frac || '0'}`;
    }
    return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  }
  const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const e = Math.abs(exp).toString().padStart(2, '0');
  return `${sign}${m}e${exp < 0 ? '-' : '+'}${e}`;
}

/** Python `str(v)`. */
export function pyStr(v: PyVal): string {
  switch (v.t) {
    case 'int':
      return String(v.v);
    case 'float':
      return pyFloatRepr(v.v);
    case 'bool':
      return v.v ? 'True' : 'False';
    case 'none':
      return 'None';
    default:
      return v.v;
  }
}

/** pandas `Series.astype(str)` for one cell of a column of the given kind. */
export function pandasStr(cell: Cell, kind: ColumnKind): string {
  if (cell === null) return 'nan';
  if (typeof cell === 'boolean') return cell ? 'True' : 'False';
  if (typeof cell === 'string') return cell;
  if (kind === 'float') return pyFloatRepr(cell);
  if (kind === 'int') return String(cell);
  // object column: integral numbers come from openpyxl as Python int
  return Number.isInteger(cell) ? String(cell) : pyFloatRepr(cell);
}

/** Python-typed view of a cell. */
export function pyValFromCell(cell: Cell, kind: ColumnKind): PyVal {
  if (cell === null) return { t: 'none' };
  if (typeof cell === 'boolean') return { t: 'bool', v: cell };
  if (typeof cell === 'string') return { t: 'str', v: cell };
  if (kind === 'float') return { t: 'float', v: cell };
  return Number.isInteger(cell) ? { t: 'int', v: cell } : { t: 'float', v: cell };
}

/** Numeric value of int/float/bool values, else undefined. */
export function numericOf(v: PyVal): number | undefined {
  if (v.t === 'int' || v.t === 'float') return v.v;
  if (v.t === 'bool') return v.v ? 1 : 0;
  return undefined;
}

/** True for Python None and float NaN. */
export function isPyNull(v: PyVal): boolean {
  return v.t === 'none' || (v.t === 'float' && Number.isNaN(v.v));
}

/** Python truthiness of a rule value. */
export function pyTruthy(x: unknown): boolean {
  if (x === undefined || x === null || x === false || x === 0 || x === '') return false;
  if (x instanceof PyFloat) return x.value !== 0;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === 'object') return Object.keys(x as object).length > 0;
  return true;
}

/** Python string comparison (by code point). */
export function comparePyStrings(a: string, b: string): number {
  if (a === b) return 0;
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const x = ai.next();
    const y = bi.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0) as number;
    const cy = y.value.codePointAt(0) as number;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

export type CompareOp = '>' | '>=' | '<' | '<=' | '==' | '!=';

/** Applies a comparison operator to a three-way comparison result. */
export function applyOp(op: CompareOp, cmp: number): boolean {
  switch (op) {
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '==':
      return cmp === 0;
    default:
      return cmp !== 0;
  }
}

/** Numeric comparison with IEEE NaN semantics (every op false except !=). */
export function compareNumbers(op: CompareOp, a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return op === '!=';
  return applyOp(op, a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Translates a Python `re` pattern to a JavaScript RegExp.
 * Supported translations: (?P<name>…) → (?<name>…), (?P=name) → \k<name>,
 * leading (?i) → "i" flag, \A → ^, \Z → $. Throws on anything JS cannot compile.
 */
export function pyRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let src = pattern;
  let flags = caseInsensitive ? 'i' : '';
  const inline = /^\(\?([aiLmsux]+)\)/.exec(src);
  if (inline) {
    src = src.slice(inline[0].length);
    for (const f of inline[1]) {
      if (f === 'i' && !flags.includes('i')) flags += 'i';
      else if (f === 'm') flags += 'm';
      else if (f === 's') flags += 's';
      else if (f !== 'u' && f !== 'a') throw new Error(`Python regex flag (?${f}) is not supported`);
    }
  }
  src = src
    .replace(/\(\?P<([A-Za-z_]\w*)>/g, '(?<$1>')
    .replace(/\(\?P=([A-Za-z_]\w*)\)/g, '\\k<$1>')
    .replace(/\\A/g, '^')
    .replace(/\\Z/g, '$');
  return new RegExp(src, flags);
}
