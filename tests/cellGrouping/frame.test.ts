/** Expected values were measured with pandas 2.3 `read_excel` / `df.loc[...] =`. */
import { describe, expect, it } from 'vitest';
import { cloneFrame, frameFromGrid, inferColumn, pandasColumnNames, rowJoinStrings, setColumn } from '../../src/lib/cellGrouping/frame.ts';

describe('inferColumn (pandas read_excel type inference)', () => {
  it.each([
    ['ints', [1, 2], 'int', [1, 2]],
    ['ints + float', [1, 2.5], 'float', [1, 2.5]],
    ['int + numeric text', [1, '2'], 'int', [1, 2]],
    ['numeric text with spaces', ['1.5', ' 2 '], 'float', [1.5, 2]],
    ['ints with blank', [1, null], 'float', [1, null]],
    ['NA string', ['2', 'NA'], 'float', [2, null]],
    ['bools', [true, false], 'bool', [true, false]],
    ['bools with blank → float', [true, null], 'float', [1, null]],
    ['bool + int → int', [true, 1], 'int', [1, 1]],
    ['bool strings', ['True', 'FALSE', 'true'], 'bool', [true, false, true]],
    ['bool string + blank → object', ['True', null], 'object', [true, null]],
    ['text', ['yes', 'no'], 'object', ['yes', 'no']],
    ['mixed text and number', ['abc', 5], 'object', ['abc', 5]],
    ['text with NA', [1.5, 'abc', 'NA'], 'object', [1.5, 'abc', null]],
    ['overflow text stays text', ['1e400'], 'object', ['1e400']],
    ['all blank', [null, null], 'float', [null, null]],
    ['pandas interning (True == 1)', [true, 1, 'z'], 'object', [true, true, 'z']],
  ])('%s', (_label, raw, kind, cells) => {
    expect(inferColumn(raw as never)).toEqual({ kind, cells });
  });
});

describe('frameFromGrid', () => {
  it('names columns like pandas and keeps middle blank rows, trims trailing ones', () => {
    const f = frameFromGrid([
      ['id', null, 'id', 5],
      [1, 'x', 'a', 2],
      [null, null, null, null],
      [3, 'y', 'b', 4],
      [null, null],
    ]);
    expect(f.columns).toEqual(['id', 'Unnamed: 1', 'id.1', '5']);
    expect(f.length).toBe(3);
    expect(f.kinds.id).toBe('float');
    expect(f.data.id).toEqual([1, null, 3]);
  });
  it('treats empty strings as blanks', () => {
    expect(pandasColumnNames(['a', '', 'a', 'a'])).toEqual(['a', 'Unnamed: 1', 'a.1', 'a.2']);
    const f = frameFromGrid([['a', 'b'], [1, ''], [2, '']]);
    expect(f.kinds).toEqual({ a: 'int', b: 'float' });
  });
});

describe('setColumn (df.loc[mask, col] = value upcasting)', () => {
  const base = () => frameFromGrid([['i', 'f', 'b', 's'], [1, 1.5, true, 'a'], [2, 2.5, false, 'b'], [3, null, true, 'c']]);
  const some = [true, false, true];
  const none = [false, false, false];
  it.each([
    ['new col, empty mask', 'new', none, { t: 'str', v: 'X' }, 'object', [null, null, null]],
    ['new col, number', 'new', some, { t: 'int', v: 1 }, 'float', [1, null, 1]],
    ['new col, bool', 'new', some, { t: 'bool', v: true }, 'object', [true, null, true]],
    ['int ← float', 'i', some, { t: 'float', v: 2.5 }, 'float', [2.5, 2, 2.5]],
    ['int ← str', 'i', some, { t: 'str', v: 'z' }, 'object', ['z', 2, 'z']],
    ['int ← None', 'i', some, { t: 'none' }, 'float', [null, 2, null]],
    ['int ← str, empty mask still upcasts', 'i', none, { t: 'str', v: 'z' }, 'object', [1, 2, 3]],
    ['float ← bool', 'f', some, { t: 'bool', v: true }, 'object', [true, 2.5, true]],
    ['bool ← int', 'b', some, { t: 'int', v: 1 }, 'object', [1, false, 1]],
  ])('%s', (_l, col, mask, v, kind, cells) => {
    const f = base();
    setColumn(f, col, mask, v as never);
    expect(f.kinds[col]).toBe(kind);
    expect(f.data[col]).toEqual(cells);
  });
  it('cloneFrame isolates mutations', () => {
    const a = base();
    const b = cloneFrame(a);
    setColumn(b, 'i', some, { t: 'int', v: 9 });
    expect(a.data.i).toEqual([1, 2, 3]);
  });
});

describe('rowJoinStrings', () => {
  it('upcasts all-numeric rows to float', () => {
    expect(rowJoinStrings(frameFromGrid([['a', 'b'], [8, 0.5]]))).toEqual(['8.0 0.5']);
  });
  it('keeps per-column rendering for mixed rows', () => {
    expect(rowJoinStrings(frameFromGrid([['a', 'b', 'c'], [8, 0.5, 'x'], [9, null, 'y']]))).toEqual(['8 0.5 x', '9 nan y']);
  });
});
