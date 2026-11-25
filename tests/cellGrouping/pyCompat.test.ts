import { describe, expect, it } from 'vitest';
import {
  comparePyStrings,
  pandasStr,
  parsePyFloat,
  pyFloatRepr,
  pyRegex,
  pyStr,
  pyTruthy,
  pyValFromRule,
  toFloatOrStr,
} from '../../src/lib/cellGrouping/pyCompat.ts';
import { PyFloat } from '../../src/lib/cellGrouping/types.ts';

describe('pyFloatRepr (Python repr(float))', () => {
  it.each([
    [20, '20.0'],
    [0.9, '0.9'],
    [1e-5, '1e-05'],
    [1.5e-7, '1.5e-07'],
    [0.0001, '0.0001'],
    [1e16, '1e+16'],
    [1234567890123456, '1234567890123456.0'],
    [-2.5, '-2.5'],
    [0, '0.0'],
    [-0, '-0.0'],
    [Number.NaN, 'nan'],
    [Infinity, 'inf'],
    [-Infinity, '-inf'],
    [0.1 + 0.2, '0.30000000000000004'],
  ])('%s → %s', (n, expected) => {
    expect(pyFloatRepr(n)).toBe(expected);
  });
});

describe('parsePyFloat (Python float(str))', () => {
  it.each([
    ['1.5', 1.5],
    [' 2 ', 2],
    ['1_000', 1000],
    ['5.', 5],
    ['.5', 0.5],
    ['1e3', 1000],
    ['-inf', -Infinity],
    ['Infinity', Infinity],
  ])('%s → %s', (s, n) => {
    expect(parsePyFloat(s)).toBe(n);
  });
  it('NaN and rejects', () => {
    expect(parsePyFloat('nan')).toBeNaN();
    for (const bad of ['abc', '1,000', '0x10', '.', '', '1__0', 'e5']) expect(parsePyFloat(bad)).toBeUndefined();
  });
});

describe('toFloatOrStr (rule value coercion)', () => {
  it('turns numeric strings into floats and NaN words into NaN', () => {
    expect(toFloatOrStr({ t: 'str', v: '0.95' })).toEqual({ t: 'float', v: 0.95 });
    expect(toFloatOrStr({ t: 'str', v: '001' })).toEqual({ t: 'float', v: 1 });
    const nan = toFloatOrStr({ t: 'str', v: ' NULL ' });
    expect(nan.t).toBe('float');
    expect(Number.isNaN((nan as { v: number }).v)).toBe(true);
    expect(toFloatOrStr({ t: 'str', v: 'PASS' })).toEqual({ t: 'str', v: 'PASS' });
    expect(toFloatOrStr({ t: 'int', v: 3 })).toEqual({ t: 'int', v: 3 });
  });
});

describe('str() and astype(str)', () => {
  it('pyStr distinguishes int and float rule values', () => {
    expect(pyStr(pyValFromRule(20))).toBe('20');
    expect(pyStr(pyValFromRule(new PyFloat(20)))).toBe('20.0');
    expect(pyStr(pyValFromRule(true))).toBe('True');
    expect(pyStr(pyValFromRule(null))).toBe('None');
  });
  it('pandasStr depends on the column kind', () => {
    expect(pandasStr(20, 'int')).toBe('20');
    expect(pandasStr(20, 'float')).toBe('20.0');
    expect(pandasStr(20, 'object')).toBe('20');
    expect(pandasStr(2.5, 'object')).toBe('2.5');
    expect(pandasStr(null, 'object')).toBe('nan');
    expect(pandasStr(false, 'bool')).toBe('False');
  });
});

describe('misc', () => {
  it('pyTruthy', () => {
    expect([null, undefined, 0, '', false, [], {}].map(pyTruthy)).toEqual([false, false, false, false, false, false, false]);
    expect([1, 'x', true, [1], { a: 1 }].map(pyTruthy)).toEqual([true, true, true, true, true]);
  });
  it('comparePyStrings orders by code point', () => {
    expect(comparePyStrings('8', 'abc')).toBeLessThan(0);
    expect(comparePyStrings('nan', 'abc')).toBeGreaterThan(0);
    expect(comparePyStrings('\u{1F600}', '￿')).toBeGreaterThan(0); // UTF-16 order would say < 0
  });
  it('pyRegex translates Python-only syntax', () => {
    expect(pyRegex('(?P<id>C\\d+)-(?P=id)', false).test('C1-C1')).toBe(true);
    expect(pyRegex('(?i)pass', false).test('PASS')).toBe(true);
    expect(pyRegex('\\Afoo\\Z', false).test('foo')).toBe(true);
    expect(() => pyRegex('(?x)a b', false)).toThrow();
  });
});
