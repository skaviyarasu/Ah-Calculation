import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRules, parseRulesText } from '../../src/lib/cellGrouping/loadRules.ts';
import { PyFloat } from '../../src/lib/cellGrouping/types.ts';

const paths = (r: ReturnType<typeof parseRules>) => r.errors.map((e) => e.path);

describe('parseRulesText (YAML 1.1, like PyYAML safe_load)', () => {
  it('keeps floats distinguishable from ints', () => {
    const { value } = parseRulesText('a: 20\nb: 20.0\nc: 0.90\nd: .inf');
    const v = value as Record<string, unknown>;
    expect(v.a).toBe(20);
    expect(v.b).toBeInstanceOf(PyFloat);
    expect((v.b as PyFloat).value).toBe(20);
    expect((v.c as PyFloat).value).toBe(0.9);
    expect((v.d as PyFloat).value).toBe(Infinity);
  });
  it('uses YAML 1.1 booleans and allows duplicate keys (last wins)', () => {
    const { value } = parseRulesText('a: yes\nb: off\nc: 1\nc: 2');
    expect(value).toEqual({ a: true, b: false, c: 2 });
  });
  it('accepts JSON', () => {
    expect(parseRulesText('{"steps": [{"name": "x"}]}').value).toEqual({ steps: [{ name: 'x' }] });
  });
  it('reports syntax errors with a line number', () => {
    const r = parseRulesText('steps:\n  - name: "x\n');
    expect(r.errors[0].path).toMatch(/line \d+/);
  });
});

describe('parseRules', () => {
  it('loads the original rule.yaml unchanged', () => {
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/rules/rule.yaml'), 'utf8');
    const r = parseRules(text);
    expect(r.errors).toEqual([]);
    expect(r.rules?.steps.map((s) => [s.name, s.action, s.once])).toEqual([
      ['Grade-A', 'keep', true],
      ['Drop-High-IR', 'drop', true],
      ['Grade-B', 'keep', true],
      ['Label-Remaining', 'keep', true],
    ]);
    expect(r.rules?.steps[0].filter?.conditions[0]).toMatchObject({ col: 'CC_Ratio', op: '>=' });
    expect(r.rules?.steps[3].filter).toBeNull();
    expect(r.rules?.defaultAction).toBe('keep_unmatched');
  });

  it('applies Python defaults', () => {
    const r = parseRules('steps:\n  - name: s\n    filter: { col: X, value: 1, case_insensitive: 1 }\n    once: null');
    const step = r.rules!.steps[0];
    expect(step.action).toBe('keep');
    expect(step.once).toBe(false); // explicit null is falsy in Python
    expect(step.filter).toEqual({ mode: 'all', conditions: [expect.objectContaining({ op: '==', caseInsensitive: true })] });
  });

  it('warns about unknown keys instead of failing', () => {
    const r = parseRules('preprocess: {}\nsteps:\n  - name: s\n    filter: { col: X, op: "==", vale: 1 }');
    expect(r.rules).toBeDefined();
    expect(r.warnings.map((w) => w.path)).toEqual(['preprocess', 'steps[0].filter.vale']);
  });

  it.each([
    ['missing steps', 'global: {}', 'steps'],
    ['empty steps', 'steps: []', 'steps'],
    ['missing name', 'steps:\n  - filter: { col: X, op: "==", value: 1 }', 'steps[0].name'],
    ['bad action', 'steps:\n  - name: s\n    then: { action: remove }', 'steps[0].then.action'],
    ['unknown op', 'steps:\n  - name: s\n    filter: { col: X, op: like, value: 1 }', 'steps[0].filter.op'],
    ['no col or regex', 'steps:\n  - name: s\n    filter: { all: [ { op: "==", value: 1 } ] }', 'steps[0].filter.all[0]'],
    ['empty all', 'steps:\n  - name: s\n    filter: { all: [] }', 'steps[0].filter.all'],
    ['nested groups', 'steps:\n  - name: s\n    filter: { all: [ { any: [ { col: X, value: 1 } ] } ] }', 'steps[0].filter.all[0]'],
    ['in without values', 'steps:\n  - name: s\n    filter: { col: X, op: in }', 'steps[0].filter'],
    ['bad between', 'steps:\n  - name: s\n    filter: { col: X, between: [1] }', 'steps[0].filter.between'],
    ['bad regex', 'steps:\n  - name: s\n    filter: { regex: "(" }', 'steps[0].filter.regex'],
    ['set with a list', 'steps:\n  - name: s\n    then: { set: { A: [1, 2] } }', 'steps[0].then.set.A'],
  ])('rejects %s', (_label, yaml, path) => {
    const r = parseRules(yaml);
    expect(r.rules).toBeUndefined();
    expect(paths(r)).toContain(path);
  });
});
