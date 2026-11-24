import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../../src/lib/cellGrouping/csv.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import { gridToCsvText, PreprocessError, preprocessExcel, preprocessGrid } from '../../src/lib/cellGrouping/preprocess.ts';

const HEADER = ['Number', 'cell No.', '3SD (%)  ', '5Time(minute)', 'ERROR'];

/** A raw grading-machine sheet: 3 title rows, the machine's own header, then data. */
const RAW: unknown[][] = [
  ['Grading report', null, null, null, null],
  ['Machine: CT-01', null, 'Date: 2026-11-24', null, null],
  [null, null, null, null, null],
  ['序号', '通道', 'SD', 'Time', 'Err'],
  [' 01-1-1', '1', '***', 91.4, '---'],
  [' 01-1-2', '2', 1.2, 102, '---'],
];

function xlsxBytes(rows: unknown[][], bookType: XLSX.BookType = 'xlsx'): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

describe('preprocessGrid', () => {
  const grid = [['t1'], ['t2', ''], ['t3'], ['old a', 'old b'], ['1', '2'], ['3', '']];

  it('removes the first rows and replaces the header row', () => {
    expect(preprocessGrid(grid, { skipRows: 3, header: ['A', 'B'], dropRows: [] })).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['3', ''],
    ]);
  });
  it('keeps the file header when no header is configured', () => {
    expect(preprocessGrid(grid, { skipRows: 3, header: null, dropRows: [] })[0]).toEqual(['old a', 'old b']);
  });
  it('refuses a header whose column count does not match the file', () => {
    expect(() => preprocessGrid(grid, { skipRows: 3, header: ['A', 'B', 'C'], dropRows: [] })).toThrow(PreprocessError);
    expect(() => preprocessGrid(grid, { skipRows: 3, header: ['A', 'B', 'C'], dropRows: [] })).toThrow(/2 columns, but the new header has 3/);
  });
  it('refuses to remove more rows than the file has', () => {
    expect(() => preprocessGrid(grid, { skipRows: 6, header: null, dropRows: [] })).toThrow(/nothing is left/);
  });
});

describe('gridToCsvText', () => {
  it('quotes like Excel/pandas and keeps leading spaces', () => {
    expect(
      gridToCsvText([
        ['a', 'b,c'],
        [' x', 'say "hi"'],
      ]),
    ).toBe('a,"b,c"\r\n x,"say ""hi"""\r\n');
  });
});

describe('preprocessExcel', () => {
  it.each(['xlsx', 'biff8'] as const)('converts a raw %s sheet like the manual workflow', (bookType) => {
    const { csvText, frame } = preprocessExcel(xlsxBytes(RAW, bookType), { skipRows: 3, header: HEADER, dropRows: [] });
    expect(csvText).toBe('Number,cell No.,3SD (%)  ,5Time(minute),ERROR\r\n 01-1-1,1,***,91.4,---\r\n 01-1-2,2,1.2,102,---\r\n');
    // The frame is exactly what reading that CSV gives (pandas read_csv semantics).
    expect(frame).toEqual(readCsv(csvText));
    expect(frame.kinds).toEqual({ Number: 'object', 'cell No.': 'int', '3SD (%)  ': 'object', '5Time(minute)': 'float', ERROR: 'object' });
    expect(frame.data['5Time(minute)']).toEqual([91.4, 102]);
  });
});

describe('preprocess block in rules', () => {
  const steps = 'steps:\n  - name: All\n';

  it('is optional', () => {
    expect(parseRules(steps).rules?.preprocess).toBeUndefined();
  });
  it('reads skip_rows and header (trailing spaces kept)', () => {
    const r = parseRules(`preprocess:\n  skip_rows: 3\n  header: ["Number", "3SD (%)  "]\n${steps}`);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.rules?.preprocess).toEqual({ skipRows: 3, header: ['Number', '3SD (%)  '], dropRows: [] });
  });
  it.each([
    ['negative skip_rows', 'skip_rows: -1', 'preprocess.skip_rows'],
    ['fractional skip_rows', 'skip_rows: 2.5', 'preprocess.skip_rows'],
    ['header not a list', 'header: Number', 'preprocess.header'],
    ['unquoted number in header', 'header: [Number, 3600]', 'preprocess.header'],
    ['empty column name', 'header: ["A", " "]', 'preprocess.header[1]'],
  ])('rejects %s', (_label, body, path) => {
    const r = parseRules(`preprocess:\n  ${body}\n${steps}`);
    expect(r.rules).toBeUndefined();
    expect(r.errors.map((e) => e.path)).toContain(path);
  });
  it('warns about duplicate names and unknown keys', () => {
    const r = parseRules(`preprocess:\n  header: ["A", "A"]\n  sheet: 2\n${steps}`);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.path)).toEqual(['preprocess.sheet', 'preprocess.header[1]']);
  });
});

describe('drop_rows', () => {
  const FAILED: unknown[][] = [
    ...RAW.slice(0, 4),
    [' 01-1-1', '1', '***', 91.4, '---'],
    [' 01-1-2', '2', '***', '***', ' 02 Current Error'],
    [' 01-1-3', '3', 1.5, 102, '---'],
  ];
  const parsed = (body: string) => parseRules(`preprocess:\n  skip_rows: 3\n  header: ${JSON.stringify(HEADER)}\n${body}steps:\n  - name: All\n`);

  it('removes matching rows and re-reads the rest (column becomes numeric, as after deleting by hand)', () => {
    const pre = parsed('  drop_rows:\n    - { col: "5Time(minute)", op: "==", value: "***" }\n').rules!.preprocess!;
    const { frame, droppedRows, csvText } = preprocessExcel(xlsxBytes(FAILED), pre);
    expect(droppedRows).toBe(1);
    expect(frame.data.Number).toEqual([' 01-1-1', ' 01-1-3']);
    expect(frame.kinds['5Time(minute)']).toBe('float');
    expect(frame).toEqual(readCsv(csvText));
  });
  it('removes a row when any of several conditions matches', () => {
    const pre = parsed('  drop_rows:\n    - { col: "5Time(minute)", op: "==", value: "***" }\n    - { col: "3SD (%)  ", op: "==", value: "***" }\n')
      .rules!.preprocess!;
    const { frame, droppedRows } = preprocessExcel(xlsxBytes(FAILED), pre);
    expect(droppedRows).toBe(2);
    expect(frame.data.Number).toEqual([' 01-1-3']);
  });
  it('stops when a drop_rows column is not in the file', () => {
    const pre = parsed('  drop_rows:\n    - { col: "5CC_Ratio(%)", op: "==", value: "***" }\n').rules!.preprocess!;
    expect(() => preprocessExcel(xlsxBytes(FAILED), pre)).toThrow(/'5CC_Ratio\(%\)', which is not in the file/);
  });
  it.each([
    ['not a list', '  drop_rows: { col: X, op: "==", value: 1 }\n', 'preprocess.drop_rows'],
    ['empty list', '  drop_rows: []\n', 'preprocess.drop_rows'],
    ['bad op', '  drop_rows:\n    - { col: X, op: like, value: 1 }\n', 'preprocess.drop_rows[0].op'],
  ])('rejects drop_rows that is %s', (_l, body, path) => {
    const r = parsed(body);
    expect(r.rules).toBeUndefined();
    expect(r.errors.map((e) => e.path)).toContain(path);
  });
});

describe('raw-export check', () => {
  it('refuses a file that is already processed (header in row 1, readings in the row to replace)', () => {
    const processed: unknown[][] = [
      HEADER,
      [' 01-1-1', '1', '***', 91.4, '---'],
      [' 01-1-2', '2', 1.2, 102, '---'],
      [' 01-1-3', '3', 1.1, 99.5, '---'],
      [' 01-1-4', '4', 1.3, 101, '---'],
      [' 01-1-5', '5', 1.0, 98, '---'],
    ];
    expect(() => preprocessExcel(xlsxBytes(processed), { skipRows: 3, header: HEADER, dropRows: [] })).toThrow(
      /Row 4 should be the grading machine's header, but it contains readings .*Upload the raw grading-machine export/,
    );
  });
  it('accepts the raw export, whose row 4 is the machine header', () => {
    expect(() => preprocessExcel(xlsxBytes(RAW), { skipRows: 3, header: HEADER, dropRows: [] })).not.toThrow();
  });
});
