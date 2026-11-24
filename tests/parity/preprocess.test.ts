/**
 * Raw grading-machine Excel → preprocess (convert to CSV, remove rows, new header) → group.
 *
 * The TypeScript-preprocessed CSV is given to the Python script with the same rules file
 * (including its `preprocess:` block, which Python ignores). The Python output CSV must be
 * byte-identical to the TypeScript one.
 */
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { EOL, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as XLSX from 'xlsx';
import { afterAll, describe, expect, it } from 'vitest';
import { applySteps, DEFAULT_GROUP_COL, parseRules, preprocessExcel, resultToCsv } from '../../src/lib/cellGrouping/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON ?? 'python';
const REF = process.env.CELL_GROUPING_PY_REF ?? join(HERE, 'reference', 'categorize_csv.py');
const execFileAsync = promisify(execFile);
const pythonReady = spawnSync(PYTHON, ['-c', 'import pandas, yaml'], { encoding: 'utf8' }).status === 0;
const tempDir = mkdtempSync(join(tmpdir(), 'cell-grouping-pre-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const HEADER = ['Number', 'cell No.', '3End Voltage(mV)', '3SD (%)  ', '5Time(minute)', '5CC_Ratio(%)', 'ERROR'];

const RULES = `
preprocess:
  skip_rows: 3
  header: ${JSON.stringify(HEADER)}
  drop_rows:
    - { col: "5CC_Ratio(%)", op: "==", value: "***" }
global:
  default_action: keep_unmatched
steps:
  - name: "AA"
    filter:
      all:
        - { col: "5CC_Ratio(%)", between: [90, 100] }
        - { col: "5Time(minute)", between: [120.0, 130.0] }
        - { col: "3End Voltage(mV)", between: [2950, 3001] }
  - name: "BA"
    filter:
      all:
        - { col: "5CC_Ratio(%)", between: [80, 89.99] }
        - { col: "5Time(minute)", between: [100.0, 150.0] }
  - name: "SD-unknown"
    filter: { col: "3SD (%)  ", op: "==", value: "***" }
  - name: "Unassigned"
`;

/** Deterministic raw sheet: 3 title rows, the machine's own header, then cells. */
function rawSheet(): unknown[][] {
  let seed = 20261124;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const rows: unknown[][] = [
    ['Grading report CT-01', null, null, null, null, null, null],
    ['Batch', 'B-17', null, 'Operator', 'Shift A', null, null],
    [null, null, null, null, null, null, null],
    ['No', 'Ch', 'EndV', 'SD', 'T5', 'CC5', 'Err'],
  ];
  for (let i = 1; i <= 80; i++) {
    if (i % 9 === 0) {
      // Failed channel: no readings, like " 02 Current Error" rows from the machine.
      rows.push([` 0${1 + Math.floor(i / 40)}-1-${i % 40}`, String(64 + i), 0, '***', 0, '***', ' 02 Current Error']);
      continue;
    }
    rows.push([
      ` 0${1 + Math.floor(i / 40)}-1-${i % 40}`,
      String(64 + i),
      2890 + Math.floor(rnd() * 115),
      rnd() < 0.2 ? '***' : Math.round(rnd() * 200) / 100,
      Math.round((98 + rnd() * 54) * 10) / 10,
      Math.round((78 + rnd() * 22) * 100) / 100,
      '---',
    ]);
  }
  return rows;
}

function xlsxBytes(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe.skipIf(!pythonReady)('preprocessed raw Excel: TypeScript output is byte-identical to categorize_csv.py', () => {
  it('raw xlsx with 3 title rows and a machine header', async () => {
    const parsed = parseRules(RULES);
    expect(parsed.errors).toEqual([]);
    const rules = parsed.rules!;

    const { csvText, frame, droppedRows } = preprocessExcel(xlsxBytes(rawSheet()), rules.preprocess!);
    expect(droppedRows).toBe(8);
    expect(frame.kinds['5CC_Ratio(%)']).toBe('float');
    expect(csvText.split('\r\n')[0]).toBe(HEADER.join(','));

    const csvPath = join(tempDir, 'preprocessed.csv');
    const rulesPath = join(tempDir, 'rules.yaml');
    const outPath = join(tempDir, 'out.csv');
    writeFileSync(csvPath, csvText, 'utf8');
    writeFileSync(rulesPath, RULES, 'utf8');
    await execFileAsync(PYTHON, [REF, '--input', csvPath, '--rules', rulesPath, '--output', outPath], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
    });
    const expected = readFileSync(outPath, 'utf8');

    const actual = resultToCsv(applySteps(frame, rules, { groupCol: DEFAULT_GROUP_COL }), { lineTerminator: EOL });
    expect(actual).toBe(expected);
    // Sanity: several groups were actually used.
    expect(new Set(actual.split(EOL).slice(1, -1).map((l) => l.split(',').at(-1))).size).toBeGreaterThan(2);
  }, 120_000);
});

/**
 * Real raw machine export → must reproduce the output made with the manual workflow.
 * Paths can be overridden with env vars; the test is skipped when the files are missing.
 */
const REAL = {
  input: process.env.CELL_GROUPING_RAW_INPUT ?? 'C:/Users/vidhy/Downloads/REDCELL23112026.xlsx',
  rules: process.env.CELL_GROUPING_RAW_RULES ?? 'C:/Users/Public/Documents/Cell Grouping/GroupingRules.yaml',
  expected: process.env.CELL_GROUPING_RAW_EXPECTED ?? 'C:/Users/Public/Documents/Cell Grouping/final.csv',
};
const realReady = [REAL.input, REAL.rules, REAL.expected].every((f) => existsSync(f));

describe.skipIf(!realReady)('real raw export reproduces the manually processed output', () => {
  it('REDCELL raw xlsx + NMC rules with a preprocess block → final.csv (byte-identical)', () => {
    const expected = readFileSync(REAL.expected, 'utf8');
    // Header = the processed file's header without the added group column.
    const header = expected.replace(/^\uFEFF/, '').split(/\r?\n/)[0].split(',').slice(0, -1);
    const block = `preprocess:\n  skip_rows: 3\n  header: ${JSON.stringify(header)}\n  drop_rows:\n    - { col: "5CC_Ratio(%)", op: "==", value: "***" }\n`;
    const parsed = parseRules(block + readFileSync(REAL.rules, 'utf8'));
    expect(parsed.errors).toEqual([]);
    const { frame, droppedRows } = preprocessExcel(readFileSync(REAL.input), parsed.rules!.preprocess!);
    expect(droppedRows).toBe(125);
    const actual = resultToCsv(applySteps(frame, parsed.rules!, { groupCol: DEFAULT_GROUP_COL }), { lineTerminator: EOL });
    expect(actual).toBe(expected);
  });
});
