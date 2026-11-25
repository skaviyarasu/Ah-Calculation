/**
 * Loads a rules file (YAML or JSON) and validates it.
 *
 * YAML is parsed with YAML 1.1 semantics to match PyYAML `safe_load`
 * (yes/no booleans, 0x/0o ints, duplicate keys: last wins). Floats are kept as
 * PyFloat so `20.0` and `20` stay distinguishable, as they are in Python.
 */
import { isScalar, parseDocument } from 'yaml';
import type { ScalarTag } from 'yaml';
import { normalizeRules } from './normalize.ts';
import type { NormalizeResult, RuleIssue } from './normalize.ts';
import { conditionSchema, ruleFileSchema } from './schema.ts';
import { PyFloat } from './types.ts';

const FLOAT_TAG = 'tag:yaml.org,2002:float';

/** Wraps the YAML float resolvers so floats come back as PyFloat. */
function markFloats(tags: unknown[]): unknown[] {
  return tags.map((t) => {
    const tag = t as ScalarTag;
    if (typeof t !== 'object' || t === null || tag.tag !== FLOAT_TAG || typeof tag.resolve !== 'function') return t;
    const resolve = tag.resolve.bind(tag);
    return {
      ...tag,
      resolve: (...args: Parameters<ScalarTag['resolve']>) => {
        const v = resolve(...args);
        if (typeof v === 'number') return new PyFloat(v);
        // The YAML 1.1 float resolver returns a Scalar node (to keep trailing zeros); wrap its value.
        if (isScalar(v) && typeof v.value === 'number') v.value = new PyFloat(v.value);
        return v;
      },
    };
  });
}

function zodPath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

/** Parses YAML/JSON text into plain JS (floats as PyFloat). */
export function parseRulesText(text: string): { value?: unknown; errors: RuleIssue[] } {
  const doc = parseDocument(text, {
    version: '1.1',
    uniqueKeys: false,
    customTags: markFloats as never,
  });
  if (doc.errors.length) {
    return {
      errors: doc.errors.map((e) => ({
        path: e.linePos ? `line ${e.linePos[0].line}, column ${e.linePos[0].col}` : '',
        message: e.message.split('\n')[0],
      })),
    };
  }
  return { value: doc.toJS({ maxAliasCount: 1000 }), errors: [] };
}

/** Collects zod issues for every condition inside the steps' filters. */
function conditionIssues(raw: unknown): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return issues;
  steps.forEach((s, i) => {
    const filter = (s as { filter?: unknown } | null)?.filter;
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return;
    const f = filter as Record<string, unknown>;
    const mode = 'all' in f ? 'all' : 'any' in f ? 'any' : null;
    const list = mode ? f[mode] : [filter];
    if (!Array.isArray(list)) return;
    list.forEach((c, j) => {
      const r = conditionSchema.safeParse(c);
      if (!r.success) {
        const base = mode ? `steps[${i}].filter.${mode}[${j}]` : `steps[${i}].filter`;
        for (const issue of r.error.issues) {
          const sub = zodPath(issue.path);
          issues.push({ path: sub ? `${base}.${sub}` : base, message: issue.message });
        }
      }
    });
  });
  return issues;
}

/**
 * Full pipeline: text → YAML/JSON → zod shape check → Python-equivalent normalization.
 * Returns `rules` only when there are no errors.
 */
export function parseRules(text: string): NormalizeResult {
  const parsed = parseRulesText(text);
  if (parsed.errors.length) return { errors: parsed.errors, warnings: [] };

  const shape = ruleFileSchema.safeParse(parsed.value);
  const shapeErrors: RuleIssue[] = shape.success
    ? []
    : shape.error.issues.map((i) => ({ path: zodPath(i.path), message: i.message }));
  const condErrors = conditionIssues(parsed.value);

  const normalized = normalizeRules(parsed.value);
  const errors = dedupe([...shapeErrors, ...condErrors, ...normalized.errors]);
  if (errors.length) return { errors, warnings: normalized.warnings };
  return normalized;
}

function dedupe(issues: RuleIssue[]): RuleIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.path}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
