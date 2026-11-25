import { describe, expect, it } from 'vitest';
import { buildMask, evalCondition, RuleEvaluationError } from '../../src/lib/cellGrouping/conditions.ts';
import { frameFromGrid } from '../../src/lib/cellGrouping/frame.ts';
import { PyFloat } from '../../src/lib/cellGrouping/types.ts';
import type { Condition } from '../../src/lib/cellGrouping/types.ts';

const frame = frameFromGrid([
  ['Cell_ID', 'IR', 'CC', 'Status', 'Mixed', 'Ok'],
  ['C001', 8, 0.95, 'PASS', 'high', true],
  ['C002', 50, 0.85, 'fail', 5, false],
  ['C003', 90, null, null, 2.5, true],
]);
const cond = (c: Partial<Condition>): Condition => ({ op: '==', caseInsensitive: false, ...c });
const run = (c: Partial<Condition>) => evalCondition(frame, cond(c));

describe('comparison operators', () => {
  it.each([
    ['>', 50, [false, false, true]],
    ['>=', 50, [false, true, true]],
    ['<', 50, [true, false, false]],
    ['<=', 50, [true, true, false]],
    ['==', 50, [false, true, false]],
    ['!=', 50, [true, false, true]],
  ])('IR %s %s', (op, value, expected) => {
    expect(run({ col: 'IR', op, value })).toEqual(expected);
  });
  it('NaN cells are false except for !=', () => {
    expect(run({ col: 'CC', op: '>', value: 0.5 })).toEqual([true, true, false]);
    expect(run({ col: 'CC', op: '!=', value: 0.5 })).toEqual([true, true, true]);
  });
  it('numeric strings in rules are compared as numbers', () => {
    expect(run({ col: 'IR', op: '>', value: '49.5' })).toEqual([false, true, true]);
  });
  it('numeric column vs text: == is all False, ordering falls back to string comparison', () => {
    expect(run({ col: 'IR', op: '==', value: 'abc' })).toEqual([false, false, false]);
    expect(run({ col: 'IR', op: '!=', value: 'abc' })).toEqual([true, true, true]);
    expect(run({ col: 'CC', op: '>', value: 'abc' })).toEqual([false, false, true]); // "nan" > "abc"
  });
  it('object column with text vs number falls back to string comparison for ordering', () => {
    // "high" > "3", "5" > "3", "2.5" < "3"
    expect(run({ col: 'Mixed', op: '>', value: 3 })).toEqual([true, true, false]);
    expect(run({ col: 'Mixed', op: '==', value: 5 })).toEqual([false, true, false]);
  });
  it('comparisons with null are all False (True for !=)', () => {
    expect(run({ col: 'IR', op: '>', value: null })).toEqual([false, false, false]);
    expect(run({ col: 'Status', op: '!=', value: 'nan' })).toEqual([true, true, true]);
  });
  it('bool columns compare numerically', () => {
    expect(run({ col: 'Ok', op: '==', value: 1 })).toEqual([true, false, true]);
  });
});

describe('membership, text, between, regex', () => {
  it('in / not in / nin', () => {
    expect(run({ col: 'Status', op: 'in', values: ['PASS', 'fail'] })).toEqual([true, true, false]);
    expect(run({ col: 'Status', op: 'in', value: 'PASS' })).toEqual([true, false, false]);
    expect(run({ col: 'Status', op: 'not in', values: ['PASS'] })).toEqual([false, true, true]);
    expect(run({ col: 'IR', op: 'nin', values: ['8', 90] })).toEqual([false, true, false]);
    expect(run({ col: 'CC', op: 'in', values: ['nan'] })).toEqual([false, false, true]);
    expect(run({ col: 'Ok', op: 'in', values: [new PyFloat(1)] })).toEqual([true, false, true]);
  });
  it('contains is a regex search and honours case_insensitive', () => {
    expect(run({ col: 'Status', op: 'contains', value: 'a' })).toEqual([false, true, true]); // "nan" contains "a"
    expect(run({ col: 'Status', op: '~', value: '^pa', caseInsensitive: true })).toEqual([true, false, false]);
  });
  it('startswith / beginswith / endswith', () => {
    expect(run({ col: 'Cell_ID', op: 'startswith', value: 'C00' })).toEqual([true, true, true]);
    expect(run({ col: 'Status', op: 'beginswith', value: 'f', caseInsensitive: true })).toEqual([false, true, false]);
    expect(run({ col: 'Cell_ID', op: 'endswith', value: 'C003' })).toEqual([false, false, true]);
    // Python quirk: "3" is coerced to 3.0 first, so this tests endswith("3.0")
    expect(run({ col: 'Cell_ID', op: 'endswith', value: '3' })).toEqual([false, false, false]);
    expect(run({ col: 'IR', op: 'startswith', value: 9 })).toEqual([false, false, true]);
  });
  it('between is inclusive, wins over op, accepts numeric strings', () => {
    expect(run({ col: 'IR', between: [8, '50'], op: 'bogus' })).toEqual([true, true, false]);
    expect(() => run({ col: 'Cell_ID', between: [1, 2] })).toThrow(RuleEvaluationError);
  });
  it('regex on a column, or across the whole row', () => {
    expect(run({ col: 'Cell_ID', regex: '00[12]' })).toEqual([true, true, false]);
    expect(run({ regex: 'FAIL', caseInsensitive: true })).toEqual([false, true, false]);
    expect(() => run({ col: 'Nope', regex: 'x' })).toThrow(RuleEvaluationError);
  });
  it('missing columns never match', () => {
    expect(run({ col: 'Nope', op: '!=', value: 1 })).toEqual([false, false, false]);
  });
  it('unsupported op throws', () => {
    expect(() => run({ col: 'IR', op: 'like', value: 1 })).toThrow(/Unsupported op/);
  });
});

describe('buildMask', () => {
  const a = cond({ col: 'IR', op: '<', value: 60 });
  const b = cond({ col: 'Status', op: '==', value: 'PASS' });
  it('all = AND, any = OR, null = everything', () => {
    expect(buildMask(frame, { mode: 'all', conditions: [a, b] })).toEqual([true, false, false]);
    expect(buildMask(frame, { mode: 'any', conditions: [a, b] })).toEqual([true, true, false]);
    expect(buildMask(frame, null)).toEqual([true, true, true]);
  });
});
