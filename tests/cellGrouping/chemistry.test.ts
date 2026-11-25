import { describe, expect, it } from 'vitest';
import { CHEMISTRIES, missingRuleColumns } from '../../src/lib/cellGrouping/chemistry.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';

describe('chemistries', () => {
  it('offers LFP and NMC with unique ids', () => {
    expect(CHEMISTRIES.map((c) => c.id)).toEqual(['LFP', 'NMC']);
  });
});

describe('missingRuleColumns', () => {
  const rules = parseRules(`
steps:
  - name: A
    filter:
      all:
        - { col: "5Time(minute)", between: [120, 130] }
        - { col: "3End Voltage(mV)", op: ">=", value: 2900 }
  - name: B
    filter: { col: "5Time(minute)", op: "<", value: 100 }
  - name: Rest
`).rules!;

  it('is empty when the data has every column the rules use', () => {
    expect(missingRuleColumns(rules, { columns: ['5Time(minute)', '3End Voltage(mV)', 'Other'] })).toEqual([]);
  });
  it('lists each missing column once, in rule order', () => {
    expect(missingRuleColumns(rules, { columns: ['Other'] })).toEqual(['5Time(minute)', '3End Voltage(mV)']);
  });
});
