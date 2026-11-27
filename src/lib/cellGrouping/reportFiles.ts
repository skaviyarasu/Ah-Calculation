/**
 * File reading for LFP per-cell reports and writing the converted batch in the machine layout.
 * Kept apart from lfpConvert.ts so the conversion stays pure.
 */
import { zipSync } from 'fflate';
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

/** A merged raw file (lfpConvert mergeParts) as an .xlsx with one sheet. */
export function mergedFileXlsx(table: TableCell[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table), 'merged');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/**
 * One merged raw file per cell whose test was split by a power cut, named "<cell ID>.xlsx" so
 * that uploading it instead of the parts gives the same cell and the same converted row.
 */
export function mergedFiles(batch: BatchResult): Array<{ name: string; data: Uint8Array; parts: string[] }> {
  return batch.reports
    .filter((r) => r.mergedTable && r.parts)
    .map((r) => ({ name: `${r.cellId}.xlsx`, data: mergedFileXlsx(r.mergedTable!), parts: r.parts! }));
}

/** "merged/README.txt": which parts were joined into each merged file, in recorded order. */
function mergedReadme(merged: Array<{ name: string; parts: string[] }>): Uint8Array {
  const lines = [
    'Merged raw files: tests split by a power cut, one file per cell.',
    'Parts are joined in recorded order; the capacity of the interrupted step is added up and the',
    'power-off time is left out of Time ("Original Time" keeps the recorded time, "Source File" the part).',
    '',
    ...merged.map((m) => `${m.name}: ${m.parts.join(' -> ')}`),
    '',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

/** Adds a file under its own name; a repeated name gets " (2)", " (3)", ... before the extension. */
function addEntry(entries: Record<string, Uint8Array>, folder: string, name: string, data: Uint8Array) {
  const base = (name.split(/[\\/]/).pop() || 'file').trim() || 'file';
  let entry = folder + base;
  for (let n = 2; entry in entries; n++) entry = folder + base.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext}`);
  entries[entry] = data;
}

/**
 * The raw per-cell files exactly as uploaded (including every part of a split test), as one ZIP
 * saved with the run in the grading history. When tests were merged, the merged raw files are
 * added under "merged/" with a README listing their parts.
 */
export function rawFilesZip(
  files: Array<{ name: string; data: Uint8Array }>,
  merged: Array<{ name: string; data: Uint8Array; parts: string[] }> = [],
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const { name, data } of files) addEntry(entries, '', name, data);
  if (merged.length) {
    for (const { name, data } of merged) addEntry(entries, 'merged/', name, data);
    entries['merged/README.txt'] = mergedReadme(merged);
  }
  // .xlsx is already compressed; the old binary .xls and .csv compress well.
  return zipSync(entries, { level: 6 });
}

/** Only the merged raw files (with the README), for downloading from the result. */
export function mergedFilesZip(batch: BatchResult): Uint8Array {
  const merged = mergedFiles(batch);
  const entries: Record<string, Uint8Array> = {};
  for (const { name, data } of merged) addEntry(entries, '', name, data);
  entries['README.txt'] = mergedReadme(merged);
  return zipSync(entries, { level: 6 });
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
