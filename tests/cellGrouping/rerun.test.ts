/**
 * After new rules go live: the comparison with the rules they replace, and the rerun of the NA
 * cells of a saved run (graded cells keep their group).
 */
import { describe, expect, it } from 'vitest';
import { frameFromCsvText, frameToCsv } from '../../src/lib/cellGrouping/csv.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import { compareRules, rerunUnassigned } from '../../src/lib/cellGrouping/rerun.ts';

const step = (name: string, cap: string, r: string) => `
  - name: "${name}"
    filter:
      all:
        - { col: "3Capacity(mAh)",   between: [${cap}] }
        - { col: "4Fast_R(mOhm)",    between: [${r}] }
        - { col: "CC_Ratio_Corr(%)", between: [98, 100] }
    then:
      action: keep
`;
const NA = `
  - name: "NA"
    then:
      action: keep
`;
const head = 'global:\n  default_action: keep_unmatched\nsteps:';
const CURRENT = head + step('BA', '14950, 15099.99', '0, 4.5') + step('BB', '14950, 15099.99', '4.51, 5.5') + step('CA', '15100, 15249.99', '0, 4.5') + step('CB', '15100, 15249.99', '4.51, 5.5') + NA;
// new: BC (R3 band) added, CA widened to 4.6 — would move 0-8-1 (4.55) if it were regraded
const NEXT =
  head +
  step('BA', '14950, 15099.99', '0, 4.5') +
  step('BB', '14950, 15099.99', '4.51, 5.5') +
  step('BC', '14950, 15099.99', '5.51, 6.5') +
  step('CA', '15100, 15249.99', '0, 4.6') +
  step('CB', '15100, 15249.99', '4.61, 5.5') +
  NA;
const current = parseRules(CURRENT).rules!;
const next = parseRules(NEXT).rules!;

const REPORT = `Number,3Capacity(mAh),4Fast_R(mOhm),CC_Ratio_Corr(%),ERROR,Category
0-8-1,15152.0,4.55,100.0,---,CB
0-8-2,15137.0,3.7,99.99,---,CA
0-8-17,15097.0,5.6,99.95,---,NA
0-8-18,,,,"Missing step 2, 3, 4, 5",NA
0-8-21,15180.0,7.9,99.9,---,NA
`;
const report = frameFromCsvText(REPORT);

describe('comparing new rules with the published ones', () => {
  const c = compareRules(current, next);

  it('lists added steps with their position, and changed conditions', () => {
    expect(c.added.map((a) => [a.name, a.position])).toEqual([['BC', 3]]);
    expect(c.added[0].lines).toEqual(['3Capacity(mAh) 14950 - 15099.99', 'and 4Fast_R(mOhm) 5.51 - 6.5', 'and CC_Ratio_Corr(%) 98 - 100']);
    expect(c.changed.map((x) => [x.name, x.before[1], x.after[1]])).toEqual([
      ['CA', 'and 4Fast_R(mOhm) 0 - 4.5', 'and 4Fast_R(mOhm) 0 - 4.6'],
      ['CB', 'and 4Fast_R(mOhm) 4.51 - 5.5', 'and 4Fast_R(mOhm) 4.61 - 5.5'],
    ]);
    expect(c.removed).toEqual([]);
    expect(c.reordered).toBe(false);
    expect(c.same).toBe(false);
  });

  it('notices removed steps and a new order', () => {
    const swapped = parseRules(head + step('BB', '14950, 15099.99', '4.51, 5.5') + step('BA', '14950, 15099.99', '0, 4.5') + NA).rules!;
    const d = compareRules(current, swapped);
    expect(d.removed.map((r) => r.name)).toEqual(['CA', 'CB']);
    expect(d.reordered).toBe(true);
  });

  it('identical rules are the same', () => {
    expect(compareRules(current, parseRules(CURRENT).rules!).same).toBe(true);
  });
});

describe('rerunning the NA cells of a saved run', () => {
  const r = rerunUnassigned(report, 'Category', current, next, 'run 1');

  it('groups the NA cells the new rules match and leaves the rest NA', () => {
    expect(r.regrouped).toEqual([{ runLabel: 'run 1', cellId: '0-8-17', from: '', to: 'BC' }]);
    expect(r.stillUnassigned.map((c) => c.cellId)).toEqual(['0-8-18', '0-8-21']);
  });

  it('keeps the group of cells that were already graded, even if the new rules differ', () => {
    // CA now reaches 4.6, but 0-8-1 stays CB: it may already be in the CB bin
    expect(r.frame.data.Category).toEqual(['CB', 'CA', 'BC', 'NA', 'NA']);
    expect(r.frame.columns).toEqual(report.columns);
  });

  it('summarizes the refreshed run like a new grading', () => {
    expect(r.summary).toEqual({ cellsGrouped: 5, groupCounts: { CB: 1, CA: 1, BC: 1, NA: 2 }, unassignedCount: 2, rejectedCount: 0 });
  });

  it('writes the refreshed report with the same columns and values', () => {
    const csv = frameToCsv(r.frame, [0, 1, 2, 3, 4], { lineTerminator: '\n' });
    expect(csv.split('\n')[3]).toBe('0-8-17,15097.0,5.6,99.95,---,BC');
    expect(csv.split('\n')[4]).toBe('0-8-18,,,,"Missing step 2, 3, 4, 5",NA');
  });

  it('a run with nothing to regroup stays as it was', () => {
    const same = rerunUnassigned(report, 'Category', current, current);
    expect(same.regrouped).toEqual([]);
    expect(same.frame.data.Category).toEqual(['CB', 'CA', 'NA', 'NA', 'NA']);
  });

  it('fails clearly when the report has no group column', () => {
    expect(() => rerunUnassigned(report, 'Group', current, next)).toThrow('no "Group" column');
  });
});
