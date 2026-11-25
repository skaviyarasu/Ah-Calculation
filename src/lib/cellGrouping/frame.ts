/**
 * DataFrame-like helpers: building a Frame from raw sheet rows with pandas
 * `read_excel` type inference, and pandas `df.loc[mask, col] = value` semantics.
 */
import { pandasStr, parsePyFloat } from './pyCompat.ts';
import type { Cell, ColumnKind, Frame, PyVal } from './types.ts';

/** Raw value as delivered by the spreadsheet reader (pandas/openpyxl `_convert_cell`). */
export type RawCell = number | string | boolean | null;

/** pandas `STR_NA_VALUES`: text cells equal to one of these become NaN. */
export const PANDAS_NA_STRINGS: ReadonlySet<string> = new Set([
  '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan', '1.#IND',
  '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a', 'nan', 'null',
]);

const TRUE_STRINGS = new Set(['True', 'TRUE', 'true']);
const FALSE_STRINGS = new Set(['False', 'FALSE', 'false']);
const INT_TEXT_RE = /^\s*[+-]?\d+\s*$/;
const FLOAT_TEXT_RE = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/;
const SPECIAL_TEXT_RE = /^\s*[+-]?(?:inf|infinity|nan)\s*$/i;

type NumParse = { kind: 'int' | 'float' | 'bool' | 'null'; value: number | boolean | null } | undefined;

/**
 * One value through pandas `maybe_convert_numeric`; undefined = not numeric.
 * `decimal` mirrors read_csv(decimal=...): with "," the text "1,5" is 1.5 and "1.5" is not a number.
 */
function numericParse(v: RawCell, decimal = '.'): NumParse {
  if (v === null) return { kind: 'null', value: null };
  if (typeof v === 'boolean') return { kind: 'bool', value: v };
  if (typeof v === 'number') return { kind: Number.isInteger(v) ? 'int' : 'float', value: v };
  if (PANDAS_NA_STRINGS.has(v)) return { kind: 'null', value: null };
  if (INT_TEXT_RE.test(v)) return { kind: 'int', value: Number(v.trim()) };
  if (SPECIAL_TEXT_RE.test(v)) {
    const f = parsePyFloat(v) as number;
    return Number.isNaN(f) ? { kind: 'null', value: null } : { kind: 'float', value: f };
  }
  let text = v;
  if (decimal !== '.') {
    if (v.includes('.')) return undefined;
    text = v.replace(decimal, '.');
  }
  if (FLOAT_TEXT_RE.test(text)) {
    const f = Number(text.trim());
    return Number.isFinite(f) ? { kind: 'float', value: f } : undefined;
  }
  return undefined;
}

/**
 * pandas `_infer_types` for one column (read_excel and read_csv share it):
 *  1. numeric conversion (numbers, numeric text, bools; NA strings → NaN)
 *  2. otherwise NA sanitising (with pandas' value interning) and bool-string conversion
 */
export function inferColumn(raw: RawCell[], decimal = '.'): { kind: ColumnKind; cells: Cell[] } {
  const parsed: NonNullable<NumParse>[] = [];
  let numeric = true;
  for (const v of raw) {
    const p = numericParse(v, decimal);
    if (!p) {
      numeric = false;
      break;
    }
    parsed.push(p);
  }

  if (numeric) {
    const has = (k: string) => parsed.some((p) => p.kind === k);
    if (parsed.length > 0 && parsed.every((p) => p.kind === 'bool')) {
      return { kind: 'bool', cells: parsed.map((p) => p.value as boolean) };
    }
    const toNum = (p: NonNullable<NumParse>): Cell =>
      p.kind === 'null' ? null : typeof p.value === 'boolean' ? (p.value ? 1 : 0) : (p.value as number);
    if (has('null') || has('float') || parsed.length === 0) {
      return { kind: 'float', cells: parsed.map(toNum) };
    }
    return { kind: 'int', cells: parsed.map(toNum) };
  }

  // sanitize_objects: NA strings → NaN; values interned by Python equality (True == 1 == 1.0)
  const memo = new Map<string, RawCell>();
  const sanitized: Cell[] = raw.map((v) => {
    if (v === null || (typeof v === 'string' && PANDAS_NA_STRINGS.has(v))) return null;
    const key = typeof v === 'string' ? `s:${v}` : `n:${Number(v)}`;
    if (!memo.has(key)) memo.set(key, v);
    return memo.get(key) as Cell;
  });

  // maybe_convert_bool
  const boolish = sanitized.every(
    (v) => v === null || typeof v === 'boolean' || (typeof v === 'string' && (TRUE_STRINGS.has(v) || FALSE_STRINGS.has(v))),
  );
  if (boolish && sanitized.some((v) => v !== null)) {
    const cells = sanitized.map((v) => (v === null ? null : typeof v === 'boolean' ? v : TRUE_STRINGS.has(v as string)));
    return { kind: cells.includes(null) ? 'object' : 'bool', cells };
  }
  return { kind: 'object', cells: sanitized };
}

/** Header names the way pandas builds them: blanks → "Unnamed: i", duplicates → "name.1", "name.2". */
export function pandasColumnNames(header: RawCell[]): string[] {
  const names = header.map((h, i) => {
    if (h === null || (typeof h === 'string' && h === '')) return `Unnamed: ${i}`;
    if (typeof h === 'number') return String(h);
    if (typeof h === 'boolean') return h ? 'True' : 'False';
    return h;
  });
  const used = new Set<string>();
  const counts = new Map<string, number>();
  return names.map((n) => {
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
    let k = (counts.get(n) ?? 0) + 1;
    while (used.has(`${n}.${k}`)) k++;
    counts.set(n, k);
    used.add(`${n}.${k}`);
    return `${n}.${k}`;
  });
}

/**
 * Builds a Frame from a header row and body rows (all padded to the header width):
 * pandas column naming, then per-column type inference. Empty strings count as blanks.
 */
export function buildFrame(header: RawCell[], body: RawCell[][], decimal = '.'): Frame {
  const columns = pandasColumnNames(header.map((v) => (v === '' ? null : v)));
  const data: Record<string, Cell[]> = {};
  const kinds: Record<string, ColumnKind> = {};
  columns.forEach((name, c) => {
    const { kind, cells } = inferColumn(body.map((r) => (r[c] === '' || r[c] === undefined ? null : r[c])), decimal);
    data[name] = cells;
    kinds[name] = kind;
  });
  return { columns, data, kinds, length: body.length };
}

/**
 * Builds a Frame from a sheet grid (first row = header), reproducing pandas
 * `read_excel(engine="openpyxl")`: trailing empty cells/rows trimmed, rows padded,
 * blank rows in the middle kept, then per-column type inference.
 */
export function frameFromGrid(grid: RawCell[][]): Frame {
  const isEmpty = (v: RawCell) => v === null || v === '';
  const rows = grid.map((r) => {
    const copy = r.slice();
    while (copy.length && isEmpty(copy[copy.length - 1])) copy.pop();
    return copy;
  });
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  if (rows.length === 0) return { columns: [], data: {}, kinds: {}, length: 0 };

  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: RawCell[]) => Array.from({ length: width }, (_, i) => (i < r.length ? r[i] : null));
  return buildFrame(pad(rows[0]), rows.slice(1).map(pad));
}

export function cloneFrame(f: Frame): Frame {
  const data: Record<string, Cell[]> = {};
  for (const c of f.columns) data[c] = f.data[c].slice();
  return { columns: f.columns.slice(), data, kinds: { ...f.kinds }, length: f.length };
}

function cellFromPy(v: PyVal): Cell {
  return v.t === 'none' ? null : v.v;
}

/** Resulting dtype of `df.loc[mask, col] = v` (pandas 2.x upcasting, applied even for an empty mask). */
function kindAfterSet(existing: ColumnKind | undefined, v: PyVal): ColumnKind {
  if (existing === undefined) {
    return v.t === 'int' || v.t === 'float' ? 'float' : 'object';
  }
  switch (existing) {
    case 'int':
      if (v.t === 'int') return 'int';
      if (v.t === 'float' || v.t === 'none') return 'float';
      return 'object';
    case 'float':
      return v.t === 'int' || v.t === 'float' || v.t === 'none' ? 'float' : 'object';
    case 'bool':
      return v.t === 'bool' ? 'bool' : 'object';
    default:
      return 'object';
  }
}

/** Mutating `df.loc[mask, col] = v`. Only call on a Frame you own (see cloneFrame). */
export function setColumn(frame: Frame, col: string, mask: boolean[], v: PyVal): void {
  const existing = frame.columns.includes(col) ? frame.kinds[col] : undefined;
  if (existing === undefined) {
    frame.columns.push(col);
    frame.data[col] = new Array<Cell>(frame.length).fill(null);
  }
  const anySet = mask.some(Boolean);
  // A brand-new column with nothing written stays an all-NaN object column.
  frame.kinds[col] = existing === undefined && !anySet ? 'object' : kindAfterSet(existing, v);
  const cells = frame.data[col];
  const value = cellFromPy(v);
  for (let i = 0; i < frame.length; i++) if (mask[i]) cells[i] = value;
}

/**
 * pandas `df.apply(lambda r: r.astype(str).str.cat(sep=" "), axis=1)`.
 * A row Series is upcast to float64 when every column is numeric with at least one float column.
 */
export function rowJoinStrings(frame: Frame): string[] {
  const kinds = frame.columns.map((c) => frame.kinds[c]);
  const allNumeric = kinds.length > 0 && kinds.every((k) => k === 'int' || k === 'float');
  const rowKind: ColumnKind | null = allNumeric ? (kinds.includes('float') ? 'float' : 'int') : null;
  const out: string[] = [];
  for (let i = 0; i < frame.length; i++) {
    const parts = frame.columns.map((c, j) => pandasStr(frame.data[c][i], rowKind ?? kinds[j]));
    out.push(parts.join(' '));
  }
  return out;
}
