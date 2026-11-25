/** Expected values were measured with pandas 2.3 read_csv / to_csv. */
import { describe, expect, it } from 'vitest';
import { frameToCsv, parseCsvRows, readCsv } from '../../src/lib/cellGrouping/csv.ts';
import { frameFromGrid } from '../../src/lib/cellGrouping/frame.ts';

describe('parseCsvRows', () => {
  it('handles quotes, doubled quotes, CRLF and skips empty lines', () => {
    expect(parseCsvRows('a,b\r\n"x, y","say ""hi"""\r\n\r\n1,\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', ''],
    ]);
  });
  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsvRows('a\n"l1\nl2"\n')).toEqual([['a'], ['l1\nl2']]);
  });
  it('supports another separator', () => {
    expect(parseCsvRows('a;b\n1;2', ';')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('readCsv (pandas read_csv)', () => {
  it('reads a grading-machine style export', () => {
    const bytes = new TextEncoder().encode('﻿Number,cell No.,3SD (%)  ,5Time(minute),ERROR,Category\r\n 03-1-1,65,***,129.7,---,\r\n 03-1-2,66,1.2,88.8,---,\r\n');
    const f = readCsv(bytes);
    expect(f.columns).toEqual(['Number', 'cell No.', '3SD (%)  ', '5Time(minute)', 'ERROR', 'Category']);
    expect(f.kinds).toEqual({ Number: 'object', 'cell No.': 'int', '3SD (%)  ': 'object', '5Time(minute)': 'float', ERROR: 'object', Category: 'float' });
    expect(f.data.Number).toEqual([' 03-1-1', ' 03-1-2']);
    expect(f.data['3SD (%)  ']).toEqual(['***', '1.2']);
    expect(f.data.Category).toEqual([null, null]);
  });
  it.each([
    ['ints with spaces', [' 65', '66 ', '67'], 'int', [65, 66, 67]],
    ['NA string', ['NA', '3'], 'float', [null, 3]],
    ['bools', ['True', 'FALSE'], 'bool', [true, false]],
    ['bool with blank', ['True', ''], 'object', [true, null]],
    ['underscore stays text', ['1_000', '2'], 'object', ['1_000', '2']],
    ['bool text + number stays text', ['True', '1'], 'object', ['True', '1']],
    ['leading zeros', ['007', '8'], 'int', [7, 8]],
    ['inf', ['inf', '1'], 'float', [Infinity, 1]],
  ])('%s', (_l, values, kind, cells) => {
    const f = readCsv(`c\n${values.map((v) => (v.trim() !== v || v === '' ? `"${v}"` : v)).join('\n')}\n`);
    expect(f.kinds.c).toBe(kind);
    expect(f.data.c).toEqual(cells);
  });
  it('names a trailing empty header column and drops an implicit index', () => {
    expect(readCsv('a,b,\n1,2,\n').columns).toEqual(['a', 'b', 'Unnamed: 2']);
    const f = readCsv('a,b\nidx,1,2\n');
    expect(f.columns).toEqual(['a', 'b']);
    expect(f.data.a).toEqual([1]);
  });
  it('honours --decimal', () => {
    const f = readCsv('v;w\n1,5;1.5\n', { sep: ';', decimal: ',' });
    expect(f.data.v).toEqual([1.5]);
    expect(f.data.w).toEqual(['1.5']);
  });
  it('rejects bytes that are not valid in the given encoding, like Python', () => {
    expect(() => readCsv(new Uint8Array([0x61, 0x0a, 0xff]))).toThrow();
  });
});

describe('frameToCsv (pandas to_csv(index=False))', () => {
  it('formats floats, quotes minimally and uses CRLF', () => {
    const f = frameFromGrid([
      ['f', 'i', 'o', 'b'],
      [64, 1, ' x', true],
      [1e-5, 2, 'a,b', false],
      [null, 3, 'q"t', true],
    ]);
    expect(f.kinds.f).toBe('float');
    expect(frameToCsv(f, [0, 1, 2])).toBe('f,i,o,b\r\n64.0,1, x,True\r\n1e-05,2,"a,b",False\r\n,3,"q""t",True\r\n');
  });
  it('uses the given line terminator', () => {
    expect(frameToCsv(frameFromGrid([['a'], [1]]), [0], { lineTerminator: '\n' })).toBe('a\n1\n');
  });
});
