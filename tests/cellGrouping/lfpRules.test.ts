/**
 * rules/GroupingRules-LFP.yaml: LFP groups with NMC-style codes (1st letter = capacity band,
 * 2nd = resistance band) and the old C/R name -> new code mapping in rules/LFP-group-mapping.csv.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameFromCsvText } from '../../src/lib/cellGrouping/csv.ts';
import { applySteps } from '../../src/lib/cellGrouping/engine.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';

const yamlText = readFileSync(new URL('../../rules/GroupingRules-LFP.yaml', import.meta.url), 'utf8');
const mapping = readFileSync(new URL('../../rules/LFP-group-mapping.csv', import.meta.url), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(','));

/** Values of a real LFP batch graded with the old provisional rules (Category = old group). */
const BATCH = `Number,3Capacity(mAh),4Fast_R(mOhm),CC_Ratio_Corr(%),Old
0-8-1,15152,4.7,100,C3R2
0-8-2,15137,3.7,99.99,C3R1
0-8-8,15087,4.4,100,C2R1
0-8-15,15059,4.5,100,C2R1
0-8-16,15123,5.2,99.97,C3R2
0-8-17,15097,5.6,99.95,NA
0-8-18,,,,NA
X-C1-R1,14850,4.1,99.5,C1R1
X-C1-R2,14900,5.5,99.5,C1R2
X-C2-R2,15000,4.51,99,C2R2
X-low-capacity,14700,4.0,99.9,NA
X-high-resistance,15100,6.6,99.9,NA
X-low-cc-ratio,15100,4.0,97.5,NA
`;

describe('LFP grouping rules with NMC-style codes', () => {
  const parsed = parseRules(yamlText);

  it('is a valid rules file with the preprocessing of the machine layout', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.rules!.steps.map((s) => s.name)).toEqual(['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'CB', 'CC', 'NA']);
    expect(parsed.rules!.preprocess!.header).toHaveLength(62);
    expect(parsed.rules!.preprocess!.header!.slice(-3)).toEqual(['4Fast_R(mOhm)', 'CC_Ratio_Corr(%)', '5SOC_set(%)']);
  });

  const result = applySteps(frameFromCsvText(BATCH), parsed.rules!, { groupCol: 'Category' });
  const category = Object.fromEntries((result.frame.data.Number as string[]).map((n, i) => [n, result.frame.data.Category[i]]));
  const old = Object.fromEntries((result.frame.data.Number as string[]).map((n, i) => [n, result.frame.data.Old[i]]));
  const oldToNew = Object.fromEntries(mapping.filter(([o]) => !o.startsWith('(')).map(([o, n]) => [o, n]));

  it('gives every cell graded C1R1…C3R2 the code from the mapping table', () => {
    for (const [cell, was] of Object.entries(old)) {
      if (was === null || was === 'NA') continue; // the CSV reader treats "NA" as missing, like pandas
      expect(category[cell], `${cell} (${was})`).toBe(oldToNew[was as string]);
    }
  });

  it('groups a good cell with Fast_R 5.51 - 6.5 mOhm (was NA) in the new R3 band', () => {
    expect(category['0-8-17']).toBe('BC');
  });

  it('keeps NA for an incomplete test and for values outside every band', () => {
    for (const cell of ['0-8-18', 'X-low-capacity', 'X-high-resistance', 'X-low-cc-ratio']) expect(category[cell], cell).toBe('NA');
  });

  it('maps every old name once, and every new code exists in the rules', () => {
    expect(oldToNew).toEqual({ C1R1: 'AA', C1R2: 'AB', C2R1: 'BA', C2R2: 'BB', C3R1: 'CA', C3R2: 'CB', NA: 'NA' });
    const codes = new Set(parsed.rules!.steps.map((s) => s.name));
    for (const [, code] of mapping) expect(codes.has(code), code).toBe(true);
  });
});
