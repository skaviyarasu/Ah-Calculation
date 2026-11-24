import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { applySteps } from '../../src/lib/cellGrouping/engine.ts';
import { exportResults, readWorkbook, safeSheetName } from '../../src/lib/cellGrouping/excel.ts';
import { parseRules } from '../../src/lib/cellGrouping/loadRules.ts';

function xlsxBytes(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('readWorkbook', () => {
  it('reads the first sheet by default with pandas types', () => {
    const wb = readWorkbook(
      xlsxBytes({
        Cells: [
          ['Cell_ID', 'IR_Value', 'CC_Ratio', 'Status'],
          ['C1', 12, '0.91', 'PASS'],
          ['C2', 30, 0.88, 'NA'],
        ],
        Other: [['x'], [1]],
      }),
    );
    expect(wb.sheetNames).toEqual(['Cells', 'Other']);
    const f = wb.sheet();
    expect(f.columns).toEqual(['Cell_ID', 'IR_Value', 'CC_Ratio', 'Status']);
    expect(f.kinds).toEqual({ Cell_ID: 'object', IR_Value: 'int', CC_Ratio: 'float', Status: 'object' });
    expect(f.data.CC_Ratio).toEqual([0.91, 0.88]);
    expect(f.data.Status).toEqual(['PASS', null]);
    expect(wb.sheet('Other').data.x).toEqual([1]);
    expect(() => wb.sheet('Missing')).toThrow(/not found/);
  });
});

describe('exportResults', () => {
  it('writes All Cells, one sheet per group, Rejected, Summary and Rules', () => {
    const frame = readWorkbook(xlsxBytes({ S: [['IR'], [10], [90], [50]] })).sheet();
    const text = `
steps:
  - { name: "Low/IR: good", filter: { col: IR, op: "<", value: 20 } }
  - { name: Reject, filter: { col: IR, op: ">", value: 80 }, then: { action: drop } }
  - { name: Rest }
`;
    const rules = parseRules(text).rules!;
    const result = applySteps(frame, rules, { groupCol: 'GroupID' });
    const wb = XLSX.read(exportResults(result, text), { type: 'array' });
    expect(wb.SheetNames).toEqual(['All Cells', 'Low_IR_ good', 'Rest', 'Rejected', 'Summary', 'Rules']);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Rejected)).toEqual([{ IR: 90, GroupID: 'Reject' }]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets['All Cells'])).toHaveLength(3);
  });

  it('safeSheetName truncates and de-duplicates', () => {
    const used = new Set<string>();
    expect(safeSheetName('x'.repeat(40), used)).toHaveLength(31);
    expect(safeSheetName('Group', used)).toBe('Group');
    expect(safeSheetName('group', used)).toBe('group (2)');
  });
});
