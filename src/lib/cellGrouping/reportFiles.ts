/**
 * File reading for LFP per-cell reports and writing the converted batch in the machine layout.
 * Kept apart from lfpConvert.ts so the conversion stays pure.
 */
import * as XLSX from 'xlsx';
import { parseCsvRows } from './csv.ts';
import type { BatchResult, ReportInput, TableCell } from './lfpConvert.ts';
import { flattenedNames, machineSheetRows } from './lfpConvert.ts';
import { gridToCsvText } from './preprocess.ts';

const ACCEPTED = /\.(xls|xlsx|csv)$/i;

/** First sheet (or the CSV) as rows of raw values; throws with the reader's message if unreadable. */
export function readReportTable(data: Uint8Array, fileName: string): TableCell[][] {
  if (!ACCEPTED.test(fileName)) throw new Error('unsupported file type (use .xls, .xlsx or .csv)');
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^﻿/, '');
    return parseCsvRows(text);
  }
  const isZip = data[0] === 0x50 && data[1] === 0x4b; // .xlsx
  const isCfb = data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0; // .xls (BIFF)
  if (/\.xlsx$/i.test(fileName) && !isZip) throw new Error('not a valid .xlsx file');
  if (/\.xls$/i.test(fileName) && !isCfb && !isZip) {
    // Some machines save HTML/text with an .xls name; SheetJS can still read those, but not random bytes.
    const head = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 512)).toLowerCase();
    if (!/<(html|table|\?xml)|\t/.test(head)) throw new Error('not a valid .xls file');
  }
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('the workbook has no sheets');
  return XLSX.utils.sheet_to_json<TableCell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

/** Reads every uploaded file; unreadable files carry their reader message (spec check 1). */
export function readReportInputs(files: Array<{ name: string; data: Uint8Array }>): ReportInput[] {
  return files.map(({ name, data }) => {
    try {
      return { fileName: name, table: readReportTable(data, name) };
    } catch (e) {
      return { fileName: name, readError: (e as Error).message };
    }
  });
}

/** Text that is a plain number is written to the .xlsx as a number (spec 6). */
const NUMERIC = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** The converted batch as an .xlsx in the machine layout (Sheet1, 4 header rows). */
export function batchToXlsx(batch: BatchResult): Uint8Array {
  const rows = machineSheetRows(batch);
  const textColumns = new Set(
    batch.columns.flatMap((col, i) => (['Number', 'cell No.', 'ERROR'].includes(col.name) && col.step === null ? [i] : [])),
  );
  const aoa = rows.map((r, ri) => (ri < 4 ? r : r.map((v, ci) => (!textColumns.has(ci) && NUMERIC.test(v) ? Number(v) : v))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** The converted rows as CSV with one header row (the given names, default: spec flattened names). */
export function batchToCsv(batch: BatchResult, names: string[] = flattenedNames(batch.columns)): string {
  return gridToCsvText([names, ...batch.reports.map((r) => r.values)]);
}
