import { describe, expect, it } from 'vitest';
import { applySteps } from '../../src/lib/cellGrouping/engine.ts';
import { frameFromGrid } from '../../src/lib/cellGrouping/frame.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';
import { summarizeRun } from '../../src/lib/cellGrouping/runRecord.ts';

const frame = frameFromGrid([['Number', 'Cap'], ['c1', 15000], ['c2', 15020], ['c3', 9000], ['c4', 14000], ['c5', 1]]);
const rules = (extra = '') =>
  parseRules(`steps:
  - { name: C2, filter: { col: Cap, between: [14950, 15099.99] } }
  - { name: Dead, filter: { col: Cap, op: "<", value: 100 }, then: { action: drop } }
  - { name: C1, filter: { col: Cap, between: [13000, 14949.99] } }
${extra}`).rules!;

describe('summarizeRun', () => {
  it('counts groups, unassigned (catch-all step) and rejected (drop step)', () => {
    const r = applySteps(frame, rules('  - { name: NA }\n'), { groupCol: 'Category' });
    expect(summarizeRun(r)).toEqual({ cellsGrouped: 5, groupCounts: { C2: 2, NA: 1, C1: 1, Rejected: 1 }, unassignedCount: 1, rejectedCount: 1 });
  });
  it('counts cells matched by no step as unassigned (no label)', () => {
    const r = applySteps(frame, rules(), { groupCol: 'Category' });
    const s = summarizeRun(r);
    expect(s.unassignedCount).toBe(1);
    expect(s.groupCounts['(no group)']).toBe(1);
  });
});
