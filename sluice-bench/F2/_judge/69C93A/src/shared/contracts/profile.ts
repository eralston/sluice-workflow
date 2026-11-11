// 14 §2.9 / 15 §11: a device profile. One JSON file per device class (config/profiles/*.json) says what
// the render does, the render budget and the pacing budgets; a userData override (profile.json) may
// change any value. Strict at every level, so a typo is an error, not a silent default. Pure (no
// Electron, DOM or Pixi): the loader and the file reading live in src/main.
import { z } from 'zod';

export const PROFILE_IDS = ['desktop', 'laptop-battery', 'tablet', 'phone'] as const;
export const profileIdSchema = z.enum(PROFILE_IDS);
export type ProfileId = z.infer<typeof profileIdSchema>;

const ms = z.number().int().min(5000).max(600000);

const pacingSchema = z.object({
  /** An episode's length at 1x (was BUDGET_MS). */
  budgetMs: ms,
  /** The High-beats-only schedule at 1x (was HIGHLIGHT_BUDGET_MS). */
  highlightBudgetMs: ms,
}).strict();

const renderSchema = z.object({
  /** A3's frame budget: the painted p95 in vsyncs, plus a tolerance. */
  budget: z.object({
    frameVsyncs: z.number().int().min(1).max(8),
    toleranceMs: z.number().min(0).max(20),
  }).strict(),
  limits: z.object({
    /** Live effects at once (was MAX_ACTIVE_FX). */
    maxActiveFx: z.number().int().min(1).max(200),
  }).strict(),
  switches: z.object({
    paint: z.boolean(),
    twinkle: z.boolean(),
    ornament: z.boolean(),
    /** The role outline's filter chains baked into cached layers (27 C3). */
    auraBake: z.boolean(),
  }).strict(),
}).strict();

export const deviceProfileSchema = z.object({
  version: z.literal(1),
  id: profileIdSchema,
  title: z.string().min(1).max(60),
  pacing: pacingSchema,
  render: renderSchema,
}).strict();
export type DeviceProfile = z.infer<typeof deviceProfileSchema>;

/** The override file: every nested key optional; `profile` picks the base. */
export const profileOverrideSchema = z.object({
  profile: profileIdSchema.optional(),
  pacing: pacingSchema.partial().optional(),
  render: z.object({
    budget: renderSchema.shape.budget.partial().optional(),
    limits: renderSchema.shape.limits.partial().optional(),
    switches: renderSchema.shape.switches.partial().optional(),
  }).strict().optional(),
}).strict();
export type ProfileOverride = z.infer<typeof profileOverrideSchema>;

export const PROFILE_REASONS = ['parse', 'schema', 'merged', 'unknown-id'] as const;
/** What main hands the renderer (as a launch argument) and the Settings fieldset shows. */
export const profileStateSchema = z.object({
  profile: deviceProfileSchema,
  source: z.enum(['bundled', 'override', 'pinned']),
  overridden: z.boolean(),
  notice: z.string().max(300).nullable(),
  reason: z.enum(PROFILE_REASONS).nullable(),
}).strict();
export type ProfileState = z.infer<typeof profileStateSchema>;
