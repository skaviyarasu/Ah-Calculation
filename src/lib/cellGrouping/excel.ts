/**
 * Excel I/O (the only module that touches SheetJS).
 * Reading reproduces pandas `read_excel(engine="openpyxl")`; export writes the
 * grouping result as a multi-sheet workbook.
 */
import * as XLSX from 'xlsx';
import { summarizeGroups } from './engine.ts';
import { frameFromGrid } from './frame.ts';
import type { RawCell } from './frame.ts';
import type { Cell, Frame, GroupingResult } from './types.ts';

export interface Workbook {
  sheetNames: string[];
  /** Reads one sheet (default: first, like pandas `sheet_name=0`). */
  sheet(name?: string): Frame;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** pandas renders datetimes as "YYYY-MM-DD HH:MM:SS". */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** openpyxl/pandas `_convert_cell`: empty → "", errors → NaN, integral numbers → int. */
function rawCell(cell: XLSX.CellObject | undefined): RawCell {
  if (!cell) return '';
  switch (cell.t) {
    case 'n':
      return cell.v as number;
    case 'b':
      return cell.v as boolean;
    case 's':
      return (cell.v as string) ?? '';
    case 'd':
      return cell.v instanceof Date ? formatDate(cell.v) : String(cell.v);
    case 'e':
      return null;
    default:
      return '';
  }
}

/** Sheet grid starting at A1 (openpyxl always reads from A1). */
export function sheetGrid(ws: XLSX.WorkSheet): RawCell[][] {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const grid: RawCell[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: RawCell[] = [];
    for (let c = 0; c <= range.e.c; c++) row.push(rawCell(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    grid.push(row);
  }
  return grid;
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): Workbook {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false, cellText: false });
  return {
    sheetNames: wb.SheetNames.slice(),
    sheet(name?: string): Frame {
      const sheetName = name ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`Sheet '${sheetName}' not found`);
      return frameFromGrid(sheetGrid(ws));
    },
  };
}

/** Excel sheet names: max 31 chars, no []:*?/\ , unique (case-insensitive). */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, '_').trim() || 'Sheet').slice(0, 31);
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const toSheetValue = (c: Cell): string | number | boolean => (c === null ? '' : c);

function rowsSheet(frame: Frame, rows: number[]): XLSX.WorkSheet {
  const aoa: Array<Array<string | number | boolean>> = [frame.columns.slice()];
  for (const r of rows) aoa.push(frame.columns.map((c) => toSheetValue(frame.data[c][r])));
  return XLSX.utils.aoa_to_sheet(aoa);
}

export const labelText = (label: Cell): string => (label === null ? '(no group)' : String(label));

/** Builds the export workbook: All Cells, one sheet per group, Rejected, Summary. The rules (YAML) are never included. */
export function buildResultWorkbook(result: GroupingResult): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const add = (ws: XLSX.WorkSheet, name: string) => XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));
  const { frame } = result;
  const groups = summarizeGroups(result);

  add(rowsSheet(frame, result.outputRows), 'All Cells');
  for (const g of groups.filter((x) => !x.rejected)) add(rowsSheet(frame, g.rows), labelText(g.label));
  add(rowsSheet(frame, result.rejectedRows), 'Rejected');

  const excluded = result.outputRows.length === frame.length ? 0 : frame.length - result.outputRows.length;
  const summary: Array<Array<string | number>> = [
    ['Group', 'Cells', 'Status', 'Source steps'],
    ...groups.map((g) => [labelText(g.label), g.rows.length, g.rejected ? 'Rejected (drop step)' : 'Kept', g.steps.map(String).join(', ')]),
    [],
    ['Total cells', frame.length],
    ['Rejected cells', result.rejectedRows.length],
    ['Excluded by drop_unmatched', excluded],
    ['Group column', result.groupCol],
    ['default_action', result.rules.defaultAction],
  ];
  add(XLSX.utils.aoa_to_sheet(summary), 'Summary');
  return wb;
}

/** Serialises the export workbook to .xlsx bytes. */
export function exportResults(result: GroupingResult): Uint8Array {
  const out = XLSX.write(buildResultWorkbook(result), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}
