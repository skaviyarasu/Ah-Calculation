/**
 * Turns a parsed rules object into the engine's RuleSet, applying the same
 * defaults and interpretation as the Python reference. Pure and zod-free, so it
 * also works on any already-parsed object.
 *
 * TypeScript validation is stricter than Python on purpose: anything that would
 * crash the Python run (or is a silent no-op typo) is reported up-front.
 */
import { SUPPORTED_OPS } from './conditions.ts';
import { pyRegex, pyTruthy } from './pyCompat.ts';
import { PyFloat } from './types.ts';
import type { Condition, Filter, Preprocess, RuleScalar, RuleSet, Step, StepAction } from './types.ts';

export interface RuleIssue {
  path: string;
  message: string;
}

export interface NormalizeResult {
  rules?: RuleSet;
  errors: RuleIssue[];
  warnings: RuleIssue[];
}

const KNOWN_TOP = new Set(['global', 'steps', 'preprocess']);
const KNOWN_PREPROCESS = new Set(['skip_rows', 'header', 'drop_rows']);
const KNOWN_GLOBAL = new Set(['default_action']);
const KNOWN_STEP = new Set(['name', 'filter', 'then', 'once']);
const KNOWN_THEN = new Set(['action', 'set']);
const KNOWN_COND = new Set(['col', 'op', 'value', 'values', 'between', 'regex', 'case_insensitive']);
const DEFAULT_ACTIONS = new Set(['keep_unmatched', 'drop_unmatched']);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x) && !(x instanceof PyFloat);
const isScalar = (x: unknown): x is RuleScalar => x === null || ['string', 'number', 'boolean'].includes(typeof x) || x instanceof PyFloat;

function warnUnknown(obj: Record<string, unknown>, known: Set<string>, path: string, warnings: RuleIssue[]): void {
  for (const k of Object.keys(obj)) {
    if (!known.has(k)) warnings.push({ path: path ? `${path}.${k}` : k, message: `Unknown key '${k}' is ignored (as in the Python version).` });
  }
}

function checkRegex(pattern: string, ci: boolean, path: string, errors: RuleIssue[]): void {
  try {
    pyRegex(pattern, ci);
  } catch (e) {
    errors.push({ path, message: `Invalid or unsupported regular expression: ${(e as Error).message}` });
  }
}

function normalizeCondition(raw: unknown, path: string, errors: RuleIssue[], warnings: RuleIssue[]): Condition | undefined {
  if (!isObj(raw)) {
    errors.push({ path, message: 'A condition must be a mapping like { col: "IR_Value", op: "<=", value: 20 }.' });
    return undefined;
  }
  if ('all' in raw || 'any' in raw) {
    errors.push({ path, message: "Nested 'all'/'any' groups are not supported by the Python reference." });
    return undefined;
  }
  warnUnknown(raw, KNOWN_COND, path, warnings);

  const err = (key: string, message: string) => errors.push({ path: `${path}.${key}`, message });
  const col = raw.col;
  if (col !== undefined && col !== null && typeof col !== 'string' && typeof col !== 'number') err('col', 'must be a column name');
  const regex = raw.regex;
  if (regex !== undefined && regex !== null && typeof regex !== 'string') err('regex', 'must be a string');
  if ((col === undefined || col === null) && (regex === undefined || regex === null)) {
    errors.push({ path, message: "Condition requires 'col' or 'regex'." });
  }
  const opRaw = raw.op;
  if (opRaw !== undefined && opRaw !== null && typeof opRaw !== 'string') err('op', 'must be a string');
  const op = (typeof opRaw === 'string' && opRaw !== '' ? opRaw : '==').toLowerCase();
  if (raw.value !== undefined && !isScalar(raw.value)) err('value', 'must be a single value (use values: [...] for lists)');
  const values = raw.values;
  if (values !== undefined && values !== null && (!Array.isArray(values) || !values.every(isScalar))) err('values', 'must be a list of values');
  const betweenRaw = raw.between;
  if (betweenRaw !== undefined && betweenRaw !== null && (!Array.isArray(betweenRaw) || betweenRaw.length < 2 || !betweenRaw.every(isScalar))) {
    err('between', 'must be [low, high]');
  }
  const ci = pyTruthy(raw.case_insensitive);

  const hasRegex = typeof regex === 'string';
  const hasBetween = Array.isArray(betweenRaw);
  if (!hasRegex && !hasBetween) {
    if (!SUPPORTED_OPS.includes(op)) err('op', `Unsupported op '${op}'. Supported: ${SUPPORTED_OPS.join(', ')}`);
    if (
      (op === 'in' || op === 'not in' || op === 'nin') &&
      (values === undefined || values === null) &&
      (raw.value === undefined || raw.value === null)
    ) {
      errors.push({ path, message: `'${op}' requires 'values' or a single 'value'.` });
    }
    if ((op === 'contains' || op === '~') && typeof raw.value === 'string') checkRegex(raw.value, ci, `${path}.value`, errors);
  }
  if (hasRegex) checkRegex(regex as string, ci, `${path}.regex`, errors);

  return {
    col: col === undefined || col === null ? undefined : String(col),
    op,
    value: raw.value as RuleScalar | undefined,
    values: Array.isArray(values) ? (values as RuleScalar[]) : undefined,
    between: hasBetween ? (betweenRaw as RuleScalar[]) : undefined,
    regex: hasRegex ? (regex as string) : undefined,
    caseInsensitive: ci,
  };
}

function normalizeFilter(raw: unknown, path: string, errors: RuleIssue[], warnings: RuleIssue[]): Filter | null {
  if (!pyTruthy(raw)) return null; // missing, null, {} or [] → every row matches
  if (!isObj(raw)) {
    errors.push({ path, message: "filter must be a mapping with 'all', 'any' or a single condition." });
    return null;
  }
  let mode: 'all' | 'any' = 'all';
  let list: unknown;
  if ('all' in raw) {
    list = raw.all;
    if ('any' in raw) warnings.push({ path: `${path}.any`, message: "Both 'all' and 'any' given: 'any' is ignored (as in the Python version)." });
  } else if ('any' in raw) {
    mode = 'any';
    list = raw.any;
  } else {
    const c = normalizeCondition(raw, path, errors, warnings);
    return c ? { mode: 'all', conditions: [c] } : null;
  }
  const listPath = `${path}.${mode}`;
  if (!Array.isArray(list) || list.length === 0) {
    errors.push({ path: listPath, message: 'must be a non-empty list of conditions.' });
    return null;
  }
  const conditions = list.map((c, i) => normalizeCondition(c, `${listPath}[${i}]`, errors, warnings)).filter((c): c is Condition => c !== undefined);
  return { mode, conditions };
}

/** `preprocess:` block (TypeScript only; the Python script ignores it). */
function normalizePreprocess(raw: unknown, errors: RuleIssue[], warnings: RuleIssue[]): Preprocess | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) {
    errors.push({ path: 'preprocess', message: 'must be a mapping with skip_rows and header' });
    return undefined;
  }
  warnUnknown(raw, KNOWN_PREPROCESS, 'preprocess', warnings);
  let skipRows = 0;
  if (raw.skip_rows !== undefined && raw.skip_rows !== null) {
    if (typeof raw.skip_rows !== 'number' || !Number.isInteger(raw.skip_rows) || raw.skip_rows < 0) {
      errors.push({ path: 'preprocess.skip_rows', message: 'must be a whole number of rows (0 or more)' });
    } else skipRows = raw.skip_rows;
  }
  let header: string[] | null = null;
  if (raw.header !== undefined && raw.header !== null) {
    if (!Array.isArray(raw.header) || raw.header.length === 0 || !raw.header.every((h) => typeof h === 'string')) {
      errors.push({ path: 'preprocess.header', message: 'must be a non-empty list of quoted column names' });
    } else {
      header = raw.header as string[];
      header.forEach((h, i) => {
        if (h.trim() === '') errors.push({ path: `preprocess.header[${i}]`, message: 'column name is empty' });
      });
      const seen = new Set<string>();
      header.forEach((h, i) => {
        if (seen.has(h))
          warnings.push({ path: `preprocess.header[${i}]`, message: `'${h}' appears more than once; the repeat is read as '${h}.1'.` });
        seen.add(h);
      });
    }
  }
  const dropRows: Condition[] = [];
  if (raw.drop_rows !== undefined && raw.drop_rows !== null) {
    if (!Array.isArray(raw.drop_rows) || raw.drop_rows.length === 0) {
      errors.push({
        path: 'preprocess.drop_rows',
        message: 'must be a non-empty list of conditions, e.g. - { col: "5CC_Ratio(%)", op: "==", value: "***" }',
      });
    } else {
      raw.drop_rows.forEach((c, i) => {
        const cond = normalizeCondition(c, `preprocess.drop_rows[${i}]`, errors, warnings);
        if (cond) dropRows.push(cond);
      });
    }
  }
  return { skipRows, header, dropRows };
}

export function normalizeRules(raw: unknown): NormalizeResult {
  const errors: RuleIssue[] = [];
  const warnings: RuleIssue[] = [];
  if (!isObj(raw)) return { errors: [{ path: '', message: 'Rules file must be a mapping with a steps list.' }], warnings };
  warnUnknown(raw, KNOWN_TOP, '', warnings);

  let defaultAction = 'keep_unmatched';
  if (raw.global !== undefined && raw.global !== null) {
    if (!isObj(raw.global)) errors.push({ path: 'global', message: 'must be a mapping' });
    else {
      warnUnknown(raw.global, KNOWN_GLOBAL, 'global', warnings);
      const da = raw.global.default_action;
      if (da !== undefined) {
        defaultAction = String(da);
        if (!DEFAULT_ACTIONS.has(defaultAction)) {
          warnings.push({ path: 'global.default_action', message: `'${defaultAction}' is not keep_unmatched/drop_unmatched; all rows are kept.` });
        }
      }
    }
  }

  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push({ path: 'steps', message: "Rules file must define a non-empty 'steps' list." });
    return { errors, warnings };
  }

  const steps: Step[] = [];
  raw.steps.forEach((s, i) => {
    const path = `steps[${i}]`;
    if (!isObj(s)) {
      errors.push({ path, message: 'Each step must be a mapping.' });
      return;
    }
    warnUnknown(s, KNOWN_STEP, path, warnings);
    const nameRaw = s.name instanceof PyFloat ? s.name.value : s.name;
    if (!pyTruthy(nameRaw) || !(typeof nameRaw === 'string' || typeof nameRaw === 'number' || typeof nameRaw === 'boolean')) {
      errors.push({ path: `${path}.name`, message: `Step #${i + 1} is missing a 'name'.` });
    }
    const name = nameRaw as string | number | boolean;
    const filter = normalizeFilter(s.filter, `${path}.filter`, errors, warnings);

    let action: StepAction = 'keep';
    const set: Array<[string, RuleScalar]> = [];
    const then = s.then;
    if (then !== undefined && then !== null) {
      if (!isObj(then)) errors.push({ path: `${path}.then`, message: `Step '${String(name)}' has invalid 'then' (must be a mapping).` });
      else {
        warnUnknown(then, KNOWN_THEN, `${path}.then`, warnings);
        if ('action' in then) {
          if (then.action === 'keep' || then.action === 'drop') action = then.action;
          else errors.push({ path: `${path}.then.action`, message: `Unknown action: ${String(then.action)} (use keep or drop).` });
        }
        if (then.set !== undefined && then.set !== null) {
          if (!isObj(then.set)) errors.push({ path: `${path}.then.set`, message: 'must be a mapping of column: value' });
          else {
            for (const [k, v] of Object.entries(then.set)) {
              if (isScalar(v)) set.push([k, v]);
              else errors.push({ path: `${path}.then.set.${k}`, message: 'must be a single value' });
            }
          }
        }
      }
    }
    const once = 'once' in s ? pyTruthy(s.once) : true;
    steps.push({ name, filter, action, set, once });
  });

  const preprocess = normalizePreprocess(raw.preprocess, errors, warnings);

  if (errors.length) return { errors, warnings };
  return { rules: preprocess ? { defaultAction, steps, preprocess } : { defaultAction, steps }, errors, warnings };
}
