/**
 * Parity: every rules × Excel fixture pair is run through the Python reference
 * (tests/parity/run_python.py → categorize_csv.py) and the TypeScript engine;
 * output columns, row order, every cell and keep_mask must be identical.
 *
 * Env:
 *   PYTHON                     Python executable (default "python")
 *   CELL_GROUPING_PY_REF       path to a categorize_csv.py to test against (default: vendored copy)
 *   CELL_GROUPING_EXTRA_DATA   extra .xlsx/.csv files/folders (separated by the OS path delimiter), e.g. real grading-machine exports
 *   CELL_GROUPING_EXTRA_RULES  extra rules files/folders (.yaml/.yml/.json), e.g. production GroupingRules.yaml
 */
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { delimiter, dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applySteps, outputTable, parseRules, readCsv, readWorkbook } from '../../src/lib/cellGrouping/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures');
const PYTHON = process.env.PYTHON ?? 'python';
const GROUP_COL = 'Category'; // the CLI's default --category-col

const probe = spawnSync(PYTHON, ['-c', 'import pandas, openpyxl, yaml'], { encoding: 'utf8' });
const pythonReady = probe.status === 0;
if (!pythonReady) {
  console.warn(`[parity] SKIPPED: '${PYTHON}' with pandas, openpyxl and PyYAML is not available.\n${probe.stderr ?? probe.error ?? ''}`);
}

const filesIn = (p: string, re: RegExp): string[] =>
  statSync(p).isDirectory() ? readdirSync(p).filter((f) => re.test(f) && !f.startsWith('~$')).map((f) => join(p, f)) : [p];
const fromEnv = (name: string, re: RegExp): string[] =>
  (process.env[name] ?? '').split(delimiter).filter((p) => p && existsSync(p)).flatMap((p) => filesIn(p, re));

const DATA_RE = /\.(xlsx|csv)$/i;
const RULES_RE = /\.ya?ml$|\.json$/i;
const dataFiles = [...filesIn(join(FIXTURES, 'data'), DATA_RE), ...fromEnv('CELL_GROUPING_EXTRA_DATA', DATA_RE)];
const rulesFiles = [...filesIn(join(FIXTURES, 'rules'), RULES_RE), ...fromEnv('CELL_GROUPING_EXTRA_RULES', RULES_RE)];

type Json = string | number | boolean | null;
interface Outcome {
  error?: string;
  columns?: string[];
  rows?: Json[][];
  index?: number[];
  keep?: number[];
}

/** Same JSON normalisation as run_python.py (NaN → null, ±inf → strings). */
const norm = (v: unknown): Json => {
  if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? null : v > 0 ? 'Infinity' : '-Infinity';
  return v as Json;
};

const execFileAsync = promisify(execFile);

/** Async on purpose: a blocking spawnSync stalls the vitest worker's RPC and causes timeouts. */
async function runPython(rulesPath: string, dataPath: string): Promise<Outcome> {
  const args = [join(HERE, 'run_python.py'), '--rules', rulesPath, '--input', dataPath, '--group-col', GROUP_COL];
  const { stdout } = await execFileAsync(PYTHON, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout) as Outcome;
}

function runTypeScript(rulesPath: string, dataPath: string): Outcome {
  try {
    const parsed = parseRules(readFileSync(rulesPath, 'utf8'));
    if (!parsed.rules) return { error: parsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ') };
    // .csv is read like the CLI (pd.read_csv defaults); .xlsx like pd.read_excel
    const frame = /\.csv$/i.test(dataPath) ? readCsv(readFileSync(dataPath)) : readWorkbook(readFileSync(dataPath)).sheet();
    const result = applySteps(frame, parsed.rules, { groupCol: GROUP_COL });
    const table = outputTable(result);
    return {
      columns: table.columns,
      rows: table.rows.map((row) => row.map(norm)),
      index: result.outputRows,
      keep: result.keepMask.flatMap((k, i) => (k ? [i] : [])),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

describe.skipIf(!pythonReady)('Python ↔ TypeScript parity', () => {
  for (const rulesPath of rulesFiles) {
    for (const dataPath of dataFiles) {
      it(`${basename(rulesPath)} × ${basename(dataPath)}`, async () => {
        const py = await runPython(rulesPath, dataPath);
        const ts = runTypeScript(rulesPath, dataPath);
        if (py.error || ts.error) {
          // Both must fail (TS validation may phrase it differently).
          expect({ python: Boolean(py.error), typescript: Boolean(ts.error) }, `python: ${py.error}\ntypescript: ${ts.error}`).toEqual({ python: true, typescript: true });
          return;
        }
        expect(ts.columns).toEqual(py.columns);
        expect(ts.index).toEqual(py.index);
        expect(ts.keep).toEqual(py.keep);
        expect(ts.rows).toEqual(py.rows);
      }, 60_000);
    }
  }
});
