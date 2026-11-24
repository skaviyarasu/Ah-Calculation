/**
 * zod schemas describing the rules file shape. They are intentionally loose
 * (unknown keys are kept) so every YAML file the Python reference accepts also
 * passes here; unknown keys are reported as warnings by `normalizeRules`.
 */
import { z } from 'zod';
import { PyFloat } from './types.ts';

export const ruleScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.instanceof(PyFloat)]);

const nameLike = z.union([z.string(), z.number(), z.boolean(), z.instanceof(PyFloat)]);

export const conditionSchema = z
  .object({
    col: z.union([z.string(), z.number()]).nullish(),
    op: z.string().nullish(),
    value: ruleScalarSchema.optional(),
    values: z.array(ruleScalarSchema).nullish(),
    between: z.array(ruleScalarSchema).min(2, 'between needs [low, high]').nullish(),
    regex: z.string().nullish(),
    case_insensitive: z.unknown().optional(),
  })
  .passthrough();

export const thenSchema = z
  .object({
    action: z.enum(['keep', 'drop']).optional(),
    set: z.record(z.string(), ruleScalarSchema).nullish(),
  })
  .passthrough()
  .nullish();

export const stepSchema = z
  .object({
    name: nameLike.refine((v) => v !== '' && v !== 0 && v !== false, "Step is missing a 'name'."),
    // Shape depends on its keys (all / any / bare condition); checked in normalizeRules.
    filter: z.unknown().optional(),
    then: thenSchema,
    once: z.unknown().optional(),
  })
  .passthrough();

export const ruleFileSchema = z
  .object({
    global: z.object({ default_action: z.string().optional() }).passthrough().nullish(),
    steps: z.array(stepSchema).min(1, "Rules file must define a non-empty 'steps' list."),
  })
  .passthrough();

export type RuleFile = z.infer<typeof ruleFileSchema>;
