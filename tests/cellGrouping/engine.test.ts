import { describe, expect, it } from 'vitest';
import { applySteps, outputTable, summarizeGroups } from '../../src/lib/cellGrouping/engine.ts';
import { frameFromGrid } from '../../src/lib/cellGrouping/frame.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import type { RuleSet } from '../../src/lib/cellGrouping/types.ts';

const cells = frameFromGrid([
  ['Cell_ID', 'CC_Ratio', 'Capacity_Retention', 'IR_Value'],
  ['A1', 0.95, 0.97, 15], // Grade-A
  ['A2', 0.86, 0.9, 35], // Grade-B
  ['A3', 0.7, 0.8, 95], // Drop-High-IR
  ['A4', 0.7, 0.8, 60], // Label-Remaining
]);

const rules = (yaml: string): RuleSet => {
  const r = parseRules(yaml);
  if (!r.rules) throw new Error(JSON.stringify(r.errors));
  return r.rules;
};

const SAMPLE = `
global:
  default_action: keep_unmatched
steps:
  - name: "Grade-A"
    filter:
      all:
        - { col: "CC_Ratio", op: ">=", value: 0.90 }
        - { col: "Capacity_Retention", op: ">=", value: 0.95 }
        - { col: "IR_Value", op: "<=", value: 20 }
    then: { action: keep, set: { Grade: "A" } }
  - name: "Drop-High-IR"
    filter: { any: [ { col: "IR_Value", op: ">", value: 80 } ] }
    then: { action: drop }
  - name: "Grade-B"
    filter:
      all:
        - { col: "CC_Ratio", op: ">=", value: 0.85 }
        - { col: "IR_Value", op: "<=", value: 40 }
    then: { action: keep, set: { Grade: "B" } }
  - name: "Label-Remaining"
    then: { action: keep, set: { Grade: "Unassigned" } }
`;

describe('applySteps (rule.yaml semantics)', () => {
  const result = applySteps(cells, rules(SAMPLE), { groupCol: 'GroupID' });

  it('labels with the first matching step; set columns are added before the group column', () => {
    const t = outputTable(result);
    expect(t.columns).toEqual(['Cell_ID', 'CC_Ratio', 'Capacity_Retention', 'IR_Value', 'Grade', 'GroupID']);
    expect(t.rows.map((r) => [r[4], r[5]])).toEqual([
      ['A', 'Grade-A'],
      ['B', 'Grade-B'],
      [null, 'Drop-High-IR'],
      ['Unassigned', 'Label-Remaining'],
    ]);
  });

  it('the catch-all keep step re-keeps everything (keep_mask all true)', () => {
    expect(result.keepMask).toEqual([true, true, true, true]);
    expect(result.outputRows).toEqual([0, 1, 2, 3]);
  });

  it('cells labelled by a drop step are rejected', () => {
    expect(result.rejectedRows).toEqual([2]);
    const groups = summarizeGroups(result);
    expect(groups.find((g) => g.rejected)).toMatchObject({ label: 'Drop-High-IR', rows: [2], steps: ['Drop-High-IR'] });
    expect(groups.filter((g) => !g.rejected).map((g) => g.label)).toEqual(['Grade-A', 'Grade-B', 'Label-Remaining']);
  });

  it('does not mutate the input frame', () => {
    expect(cells.columns).toHaveLength(4);
  });
});

describe('step options', () => {
  it('drop_unmatched returns only keep_mask rows', () => {
    const r = applySteps(
      cells,
      rules(`
global: { default_action: drop_unmatched }
steps:
  - name: Low-IR
    filter: { col: IR_Value, op: "<", value: 50 }
  - name: Bad
    filter: { col: CC_Ratio, op: "<", value: 0.9 }
    then: { action: drop }
`),
      { groupCol: 'GroupID' },
    );
    expect(r.keepMask).toEqual([true, false, false, false]); // A2 kept by Low-IR, then dropped by Bad
    expect(r.outputRows).toEqual([0]);
    expect(r.frame.data.GroupID).toEqual(['Low-IR', 'Low-IR', 'Bad', 'Bad']);
    expect(r.rejectedRows).toEqual([2, 3]);
  });

  it('once: false overwrites, and does not mark rows as assigned', () => {
    const r = applySteps(
      cells,
      rules(`
steps:
  - name: All
  - name: Override
    once: false
    filter: { col: IR_Value, op: ">", value: 50 }
    then: { set: { GroupID: High, Tier: 2 } }
`),
      { groupCol: 'GroupID' },
    );
    expect(r.frame.data.GroupID).toEqual(['All', 'All', 'High', 'High']);
    expect(r.frame.data.Tier).toEqual([null, null, 2, 2]);
    expect(r.frame.kinds.Tier).toBe('float');
  });

  it('an existing group column pre-assigns rows', () => {
    const pre = frameFromGrid([['IR_Value', 'GroupID'], [10, 'Manual'], [20, null]]);
    const r = applySteps(pre, rules('steps: [ { name: Auto } ]'), { groupCol: 'GroupID' });
    expect(r.frame.data.GroupID).toEqual(['Manual', 'Auto']);
    expect(r.sourceStep).toEqual([null, 0]);
  });

  it('uses the configured group column name', () => {
    const r = applySteps(cells, rules('steps: [ { name: X } ]'), { groupCol: 'Category' });
    expect(r.frame.columns.at(-1)).toBe('Category');
  });
});
