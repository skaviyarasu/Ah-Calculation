/**
 * Replays real `categorize_csv.py` command lines (tests/parity/cli-cases.json, or the
 * file named by CELL_GROUPING_CLI_CASES) and checks that the TypeScript module writes a
 * byte-identical output CSV.
 *
 * The Python run uses the vendored reference (or CELL_GROUPING_PY_REF) with the same
 * arguments, except --output, which is redirected to a temp folder so real files are
 * never overwritten.
 */
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { EOL, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { applySteps, DEFAULT_GROUP_COL, parseRules, readCsv, resultToCsv } from '../../src/lib/cellGrouping/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON ?? 'python';
const REF = process.env.CELL_GROUPING_PY_REF ?? join(HERE, 'reference', 'categorize_csv.py');
const CASES_FILE = process.env.CELL_GROUPING_CLI_CASES ?? join(HERE, 'cli-cases.json');
const execFileAsync = promisify(execFile);

/** Splits a command line like a shell would for double-quoted arguments (Windows paths keep their backslashes). */
export function splitCommand(command: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(command); m; m = re.exec(command)) args.push(m[1] ?? m[2]);
  return args;
}

/** Parses the categorize_csv.py flags (same names and defaults as its argparse setup). */
export function parseCliArgs(args: string[]): Record<string, string | true> {
  const scriptAt = args.findIndex((a) => /\.py$/i.test(a));
  const out: Record<string, string | true> = {};
  const rest = args.slice(scriptAt + 1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}

interface CliCase {
  name: string;
  command: string;
}
const cases: CliCase[] = existsSync(CASES_FILE) ? (JSON.parse(readFileSync(CASES_FILE, 'utf8')).cases as CliCase[]) : [];
const pythonReady = spawnSync(PYTHON, ['-c', 'import pandas, yaml'], { encoding: 'utf8' }).status === 0;
const tempDir = mkdtempSync(join(tmpdir(), 'cell-grouping-cli-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe('command-line helpers', () => {
  it('splits quoted Windows paths', () => {
    const args = splitCommand('python categorize_csv.py --input "C:\\A B\\x.csv" --latest --rules r.yaml');
    expect(args).toEqual(['python', 'categorize_csv.py', '--input', 'C:\\A B\\x.csv', '--latest', '--rules', 'r.yaml']);
    expect(parseCliArgs(args)).toEqual({ input: 'C:\\A B\\x.csv', latest: true, rules: 'r.yaml' });
  });
});

describe.skipIf(!pythonReady)('CLI replay: TypeScript output CSV is byte-identical to categorize_csv.py', () => {
  cases.forEach((c, n) => {
    const flags = parseCliArgs(splitCommand(c.command));
    const input = flags.input as string | undefined;
    const rules = flags.rules as string | undefined;
    const missing = !input || !rules || !existsSync(input) || !existsSync(rules);
    if (!input) console.warn(`[cli] "${c.name}": only --input runs are replayed; skipped.`);
    else if (missing) console.warn(`[cli] "${c.name}": input or rules file not found on this machine; skipped.`);

    it.skipIf(missing)(c.name, async () => {
      const outPath = join(tempDir, `case${n}.csv`);
      const args = [REF, '--input', input!, '--rules', rules!, '--output', outPath];
      for (const flag of ['category-col', 'encoding', 'sep', 'decimal']) {
        if (typeof flags[flag] === 'string') args.push(`--${flag}`, flags[flag] as string);
      }
      await execFileAsync(PYTHON, args, { encoding: 'utf8', env: { ...process.env, PYTHONWARNINGS: 'ignore' } });
      const expected = readFileSync(outPath, 'utf8');

      const read = { encoding: flags.encoding as string | undefined, sep: flags.sep as string | undefined, decimal: flags.decimal as string | undefined };
      const parsed = parseRules(readFileSync(rules!, 'utf8'));
      expect(parsed.errors).toEqual([]);
      const frame = readCsv(readFileSync(input!), read);
      const result = applySteps(frame, parsed.rules!, { groupCol: (flags['category-col'] as string | undefined) ?? DEFAULT_GROUP_COL });
      const actual = resultToCsv(result, { sep: read.sep, lineTerminator: EOL });

      if (actual !== expected) {
        const a = actual.split(EOL);
        const e = expected.split(EOL);
        const line = e.findIndex((l, i) => l !== a[i]);
        expect({ line: line + 1, typescript: a[line] }).toEqual({ line: line + 1, typescript: e[line] });
      }
      expect(actual).toBe(expected);
      // The real --output file named in the command was not touched.
      expect(resolve(outPath)).not.toBe(resolve(String(flags.output ?? '')));
    }, 120_000);
  });
});
