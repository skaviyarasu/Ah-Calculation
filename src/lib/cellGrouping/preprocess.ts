/**
 * Preprocessing of raw grading-machine Excel files, driven by the rules' `preprocess:` block.
 *
 * Reproduces the manual workflow:
 *   1. convert the Excel sheet to CSV (cells written as displayed, like Excel "Save As CSV"),
 *   2. remove the first `skip_rows` rows,
 *   3. replace the next row (the machine's header) with the configured header,
 *   4. delete the rows matching `drop_rows` (e.g. failed cells with "***" readings).
 * The resulting CSV text is then read exactly like the Python script reads a CSV, so column
 * types are inferred from the remaining rows only, as after deleting them by hand.
 */
import * as XLSX from 'xlsx';
import { evalCondition } from './conditions.ts';
import { readCsv } from './csv.ts';
import type { Frame, Preprocess } from './types.ts';

export class PreprocessError extends Error {}

/** Cell text as Excel shows it (and writes it to CSV). */
function displayText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.w !== undefined) return cell.w;
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  return String(cell.v);
}

/** Sheet as rows of displayed text, starting at A1 (Excel's CSV export starts at A1). */
export function sheetTextGrid(ws: XLSX.WorkSheet): string[][] {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const grid: string[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = 0; c <= range.e.c; c++) row.push(displayText(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    grid.push(row);
  }
  return grid;
}

/** Number of columns up to the last non-empty cell in any of the rows. */
function usedWidth(rows: string[][]): number {
  let w = 0;
  for (const r of rows) {
    for (let c = r.length - 1; c >= w; c--) {
      if (r[c] !== '') {
        w = c + 1;
        break;
      }
    }
  }
  return w;
}

/**
 * Removes the first `skipRows` rows, then replaces the following (header) row with `header`.
 * Every row is padded to the same width, as Excel does when saving CSV.
 */
export function preprocessGrid(grid: string[][], pre: Preprocess): string[][] {
  const rest = grid.slice(pre.skipRows);
  if (rest.length === 0) {
    throw new PreprocessError(`The file has only ${grid.length} row(s); nothing is left after removing the first ${pre.skipRows}.`);
  }
  const data = rest.slice(1);
  const width = pre.header ? pre.header.length : usedWidth(rest);
  if (pre.header) {
    const fileWidth = usedWidth(rest);
    if (fileWidth !== pre.header.length) {
      throw new PreprocessError(
        `After removing ${pre.skipRows} row(s) the file has ${fileWidth} columns, but the new header has ${pre.header.length} names. ` +
          'Check that this is the right chemistry and the rules match this grading machine.',
      );
    }
  }
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  // A row that would be an empty CSV line is skipped by the CSV reader anyway; drop it here so
  // grid rows and frame rows stay aligned for drop_rows.
  const rows = data.map(fit).filter((r) => r.join(',') !== '');
  return [pre.header ? [...pre.header] : fit(rest[0]), ...rows];
}

/** QUOTE_MINIMAL, the same quoting Excel and pandas use. */
function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gridToCsvText(grid: string[][], eol = '\r\n'): string {
  return grid.map((r) => r.map(csvField).join(',')).join(eol) + eol;
}

export interface PreprocessedFile {
  /** The converted CSV (what the operator used to save by hand). */
  csvText: string;
  /** The CSV read exactly like the Python script reads it. */
  frame: Frame;
  /** Number of data rows removed by `drop_rows`. */
  droppedRows: number;
}

/**
 * Removes the data rows matching any `drop_rows` condition. Conditions are evaluated on the
 * file as read before removal (like looking at the sheet), then the kept rows are re-read.
 */
export function dropMatchingRows(grid: string[][], pre: Preprocess): { grid: string[][]; dropped: number } {
  if (!pre.dropRows.length || grid.length < 2) return { grid, dropped: 0 };
  const frame = readCsv(gridToCsvText(grid));
  for (const cond of pre.dropRows) {
    if (cond.col !== undefined && !frame.columns.includes(cond.col)) {
      throw new PreprocessError(`drop_rows refers to column '${cond.col}', which is not in the file. Check the header in the rules.`);
    }
  }
  const drop = new Array<boolean>(frame.length).fill(false);
  for (const cond of pre.dropRows) evalCondition(frame, cond).forEach((m, i) => (drop[i] ||= m));
  const kept = grid.slice(1).filter((_, i) => !drop[i]);
  return { grid: [grid[0], ...kept], dropped: grid.length - 1 - kept.length };
}

/** Excel bytes (.xlsx or .xls) → preprocessed CSV text and frame. Uses the first sheet unless one is named. */
export function preprocessExcel(data: ArrayBuffer | Uint8Array, pre: Preprocess, sheetName?: string): PreprocessedFile {
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: false, cellFormula: false, cellHTML: false });
  const name = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) throw new PreprocessError(`Sheet '${name}' not found.`);
  const { grid, dropped } = dropMatchingRows(preprocessGrid(sheetTextGrid(ws), pre), pre);
  const csvText = gridToCsvText(grid);
  return { csvText, frame: readCsv(csvText), droppedRows: dropped };
}
