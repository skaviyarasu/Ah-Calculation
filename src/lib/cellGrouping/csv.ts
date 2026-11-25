/**
 * CSV I/O matching the Python CLI (categorize_csv.py):
 *   read:  pd.read_csv(path, encoding=..., sep=..., decimal=...)   (C engine defaults)
 *   write: df.to_csv(path, index=False, encoding=...)
 */
import { buildFrame } from './frame.ts';
import type { RawCell } from './frame.ts';
import { pandasStr } from './pyCompat.ts';
import type { Frame, GroupingResult } from './types.ts';

/** Mirrors the CLI flags --sep, --decimal and --encoding (same defaults). */
export interface CsvReadOptions {
  sep?: string;
  decimal?: string;
  encoding?: string;
}

export interface CsvWriteOptions {
  sep?: string;
  /** pandas uses os.linesep: "\r\n" on Windows (where the CLI runs), "\n" elsewhere. */
  lineTerminator?: string;
}

/**
 * Splits CSV text into rows of fields (quote char ", doubled quotes as escapes,
 * quoted fields may contain separators and line breaks). Empty lines are skipped,
 * like pandas' skip_blank_lines=True.
 */
export function parseCsvRows(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let lineHasContent = false;
  const endRow = () => {
    if (lineHasContent) {
      row.push(field);
      rows.push(row);
    }
    row = [];
    field = '';
    lineHasContent = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      lineHasContent = true;
    } else if (text.startsWith(sep, i)) {
      row.push(field);
      field = '';
      lineHasContent = true;
      i += sep.length - 1;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
      lineHasContent = true;
    }
  }
  endRow();
  return rows;
}

/** pandas read_csv: header = first row; extra leading fields in data rows become the (dropped) index. */
export function frameFromCsvText(text: string, options: CsvReadOptions = {}): Frame {
  const rows = parseCsvRows(text, options.sep ?? ',');
  if (rows.length === 0) throw new Error('No columns to parse from file');
  const header: RawCell[] = rows[0];
  const body = rows.slice(1);
  // pandas: if the first data row has more fields than the header, the extra leading fields are the index
  const indexCols = body.length && body[0].length > header.length ? body[0].length - header.length : 0;
  const width = header.length;
  const padded: RawCell[][] = body.map((r) => {
    const fields = r.slice(indexCols);
    if (fields.length > width) throw new Error(`Expected ${width} fields, saw ${fields.length}`);
    return Array.from({ length: width }, (_, i) => (i < fields.length ? fields[i] : null));
  });
  return buildFrame(header, padded, options.decimal ?? '.');
}

/** Decodes bytes like Python's open(encoding=...): UTF-8 BOM is dropped (pandas does the same). */
export function readCsv(data: ArrayBuffer | Uint8Array | string, options: CsvReadOptions = {}): Frame {
  const text = typeof data === 'string' ? data.replace(/^﻿/, '') : new TextDecoder(options.encoding ?? 'utf-8', { fatal: true }).decode(data);
  return frameFromCsvText(text, options);
}

/** QUOTE_MINIMAL: quote only fields containing the separator, a quote or a line break. */
function csvField(s: string, sep: string): string {
  return s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r') ? `"${s.replace(/"/g, '""')}"` : s;
}

/** pandas `df.to_csv(index=False)` for the given rows of a frame. */
export function frameToCsv(frame: Frame, rows: number[], options: CsvWriteOptions = {}): string {
  const sep = options.sep ?? ',';
  const eol = options.lineTerminator ?? '\r\n';
  const lines = [frame.columns.map((c) => csvField(c, sep)).join(sep)];
  for (const r of rows) {
    lines.push(
      frame.columns
        .map((c) => {
          const cell = frame.data[c][r];
          return cell === null ? '' : csvField(pandasStr(cell, frame.kinds[c]), sep);
        })
        .join(sep),
    );
  }
  return lines.join(eol) + eol;
}

/** The CLI's output file: the Python-equivalent rows (drop_unmatched respected) as CSV. */
export function resultToCsv(result: GroupingResult, options: CsvWriteOptions = {}): string {
  return frameToCsv(result.frame, result.outputRows, options);
}
