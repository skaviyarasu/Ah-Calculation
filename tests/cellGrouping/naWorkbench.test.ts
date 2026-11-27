/**
 * NA workbench: finding NA cells in saved reports, why they missed a group, suggested rules and
 * validation against already graded cells.
 */
import { describe, expect, it } from 'vitest';
import { frameFromCsvText } from '../../src/lib/cellGrouping/csv.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import {
  adjacentBand,
  applySuggestions,
  nearestGroups,
  suggestSteps,
  unassignedCells,
  unassignedRows,
  validateProposal,
  type RunReport,
} from '../../src/lib/cellGrouping/naWorkbench.ts';

/** The provisional LFP rules (C = capacity band, R = Fast_R band), as published. */
const RULES = `# LFP rules
global:
  default_action: keep_unmatched
steps:
  - name: "C2R1"
    filter:
      all:
        - { col: "3Capacity(mAh)",   between: [14950, 15099.99] }
        - { col: "4Fast_R(mOhm)",    between: [0, 4.5] }
        - { col: "CC_Ratio_Corr(%)", between: [98, 100] }
    then:
      action: keep

  - name: "C2R2"
    filter:
      all:
        - { col: "3Capacity(mAh)",   between: [14950, 15099.99] }
        - { col: "4Fast_R(mOhm)",    between: [4.51, 5.5] }
        - { col: "CC_Ratio_Corr(%)", between: [98, 100] }
    then:
      action: keep

  - name: "C3R1"
    filter:
      all:
        - { col: "3Capacity(mAh)",   between: [15100, 15249.99] }
        - { col: "4Fast_R(mOhm)",    between: [0, 4.5] }
        - { col: "CC_Ratio_Corr(%)", between: [98, 100] }
    then:
      action: keep

  - name: "C3R2"
    filter:
      all:
        - { col: "3Capacity(mAh)",   between: [15100, 15249.99] }
        - { col: "4Fast_R(mOhm)",    between: [4.51, 5.5] }
        - { col: "CC_Ratio_Corr(%)", between: [98, 100] }
    then:
      action: keep

  - name: "NA"
    # every cell not grouped above
    then:
      action: keep
`;
const rules = parseRules(RULES).rules!;

/** A saved grouped report (as resultToCsv writes it), values of a real LFP batch. */
const REPORT = `Number,cell No.,3Capacity(mAh),4Fast_R(mOhm),CC_Ratio_Corr(%),ERROR,Category
0-8-1,1,15152.0,4.7,100.0,---,C3R2
0-8-2,2,15137.0,3.7,99.99,---,C3R1
0-8-8,3,15087.0,4.4,100.0,---,C2R1
0-8-17,4,15097.0,5.6,99.95,---,NA
0-8-18,5,,,,"Missing step 2, 3, 4, 5",NA
0-8-19,6,15070.0,3.8,99.95,---,C2R1
0-8-21,7,15180.0,7.9,99.9,---,NA
`;
const run: RunReport = { runId: 'r1', label: '2026-11-26 0-8-1..21', chemistry: 'LFP', frame: frameFromCsvText(REPORT), groupCol: 'Category' };

describe('NA cells in a saved report', () => {
  it('finds the NA rows (the CSV reader reads "NA" as missing)', () => {
    expect(unassignedRows(run.frame, 'Category', rules)).toEqual([3, 4, 6]);
  });

  const cells = unassignedCells([run], rules);

  it('names the cell, its run and why it was not converted', () => {
    expect(cells.map((c) => [c.cellId, c.error])).toEqual([
      ['0-8-17', ''],
      ['0-8-18', 'Missing step 2, 3, 4, 5'],
      ['0-8-21', ''],
    ]);
    expect(cells[0].runLabel).toBe(run.label);
  });

  it('identifies the nearest group and the condition it missed, with how far off', () => {
    const [best, second] = cells[0].nearest;
    expect(best.name).toBe('C2R2');
    expect(best.failed.map((f) => [f.text, f.detail])).toEqual([['4Fast_R(mOhm) 4.51 - 5.5', '5.6 > 5.5 (+0.1)']]);
    expect(second.failed.length).toBeGreaterThanOrEqual(1);
  });

  it('a cell without values misses every condition', () => {
    expect(cells[1].nearest[0].failed.map((f) => f.detail)).toEqual(['missing', 'missing', 'missing']);
  });

  it('ranks by fewest failed conditions, then by distance', () => {
    const frame = run.frame;
    // 0-8-21: capacity fits C3, Fast_R 7.9 is far above R2
    expect(nearestGroups(frame, 6, rules)[0].name).toBe('C3R2');
  });
});

describe('suggested rules', () => {
  it('moves a band next to the existing one, keeping its width and gap', () => {
    expect(adjacentBand(4.51, 5.5, 5.6)).toEqual([5.51, 6.5]);
    expect(adjacentBand(4.51, 5.5, 7.9)).toEqual([7.51, 8.5]);
    expect(adjacentBand(14950, 15099.99, 15300)).toEqual([15250, 15399.99]);
    expect(adjacentBand(14950, 15099.99, 14900)).toEqual([14800, 14949.99]);
    expect(adjacentBand(120, 130, 131)).toEqual([131, 141]);
  });

  const cells = unassignedCells([run], rules);
  const suggestions = suggestSteps(cells, rules);

  it('suggests one step per new band, only for cells missing a single band', () => {
    expect(suggestions.map((s) => [s.name, s.fromStep, s.col, s.between, s.cells])).toEqual([
      ['NEW-1', 'C2R2', '4Fast_R(mOhm)', [5.51, 6.5], [`${run.label}: 0-8-17`]],
      ['NEW-2', 'C3R2', '4Fast_R(mOhm)', [7.51, 8.5], [`${run.label}: 0-8-21`]],
    ]);
  });

  it('inserts them before the catch-all step and keeps the rest of the file as written', () => {
    const text = applySuggestions(RULES, suggestions.slice(0, 1), rules);
    expect(text.startsWith(RULES.slice(0, RULES.indexOf('  - name: "NA"')))).toBe(true);
    expect(text.endsWith(RULES.slice(RULES.indexOf('  - name: "NA"')))).toBe(true);
    expect(text).toContain('  - name: "NEW-1"   # suggested from C2R2: 4Fast_R(mOhm) 5.51 - 6.5 (1 NA cell)');
    expect(text).toContain('      - { col: "4Fast_R(mOhm)", between: [5.51, 6.5] }');
    const parsed = parseRules(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rules!.steps.map((s) => s.name)).toEqual(['C2R1', 'C2R2', 'C3R1', 'C3R2', 'NEW-1', 'NA']);
  });
});

describe('validation before publishing', () => {
  const cells = unassignedCells([run], rules);
  const proposal = applySuggestions(RULES, suggestSteps(cells, rules).slice(0, 1), rules);

  it('shows which NA cells get a group, which stay NA, and that no graded cell moves', () => {
    const v = validateProposal(proposal, [run], rules);
    expect(v.errors).toEqual([]);
    expect(v.cellsChecked).toBe(7);
    expect(v.nowGrouped).toEqual([{ runLabel: run.label, cellId: '0-8-17', from: '', to: 'NEW-1' }]);
    expect(v.stillUnassigned.map((c) => c.cellId)).toEqual(['0-8-18', '0-8-21']);
    expect(v.changed).toEqual([]);
    expect(v.groupCounts).toEqual({ C3R2: 1, C3R1: 1, C2R1: 2, 'NEW-1': 1, NA: 2 });
  });

  it('flags already graded cells that a change would move', () => {
    // widening R1 to 5.5 moves 0-8-1 (Fast_R 4.7) from C3R2 to C3R1
    const widened = RULES.split('{ col: "4Fast_R(mOhm)",    between: [0, 4.5] }').join('{ col: "4Fast_R(mOhm)",    between: [0, 5.5] }');
    const v = validateProposal(widened, [run], rules);
    expect(v.changed).toEqual([{ runLabel: run.label, cellId: '0-8-1', from: 'C3R2', to: 'C3R1' }]);
  });

  it('reports errors in the rules file and checks nothing else', () => {
    const v = validateProposal('steps: [', [run], rules);
    expect(v.errors.length).toBeGreaterThan(0);
    expect(v.cellsChecked).toBe(0);
  });

  it('reports a run the rules cannot group', () => {
    const bad = RULES.replace('  - name: "NA"', '  - name: "R"\n    filter: { col: "3Capacity(mAh)", between: ["x", 1] }\n    then: { action: keep }\n  - name: "NA"');
    const v = validateProposal(bad, [run], rules);
    expect(v.runErrors).toEqual([{ runLabel: run.label, message: expect.stringContaining("could not convert string to float: 'x'") }]);
  });
});
