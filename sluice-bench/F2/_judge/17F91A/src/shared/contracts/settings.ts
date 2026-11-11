// 14 §2.9 — the user's settings (v1): one JSON file at userData/settings.json, beside the window
// state, so a Purge of the cache leaves it. Validated with zod on read, on every IPC crossing, and
// on write. The viewer is a person's `id:` key, never a name.
import { z } from 'zod';
import type { CanonicalKey } from './keys';

/** The viewer's own ship: a faction, a hull within it, and a colourway (13 §4). */
export interface CaptainStyle { faction: 'trek' | 'wars' | 'mecha'; hull: number; colourway: number }

export interface UserSettings {
  version: 1;
  /** The theme pack's id (`'star-chart'`). */
  theme: string;
  /** Achievements on or off (18 §5 A5): an opt-out switch. */
  achievements: boolean;
  /** Per tenant (org key): the person this copy of the app is for, or null when not chosen yet. */
  viewer: Record<string, CanonicalKey | null>;
  /** Per tenant: the viewer's ship style, or null for their seeded look. */
  captain: Record<string, CaptainStyle | null>;
  /**
   * The developer toggle's view (13 Q9, 23 E3): which view the app opens in when nothing pins one.
   * Missing reads as `'solar'`, so a file from before this field opens in Solar as it always did.
   */
  devParadigm?: 'solar' | 'sprints' | 'backlog';
  /** The guided tour has been offered on a first launch (23 E7); it is offered once, and always from Settings › Read. */
  tourOffered?: boolean;
}

const personKey = z.custom<CanonicalKey>((v) => typeof v === 'string' && /^id:/.test(v), 'not a person key');

export const captainStyleSchema = z.object({
  faction: z.enum(['trek', 'wars', 'mecha']),
  hull: z.number().int().min(0).max(63),
  colourway: z.number().int().min(0).max(255),
});

export const userSettingsSchema = z.object({
  version: z.literal(1),
  theme: z.string().min(1).max(60),
  achievements: z.boolean(),
  viewer: z.record(z.string().max(200), personKey.nullable()),
  captain: z.record(z.string().max(200), captainStyleSchema.nullable()),
  devParadigm: z.enum(['solar', 'sprints', 'backlog']).optional(),
  tourOffered: z.boolean().optional(),
});

/** What `settings.set` takes: any top-level fields; `viewer` and `captain` replace that tenant's entries. */
export const userSettingsPatchSchema = userSettingsSchema.omit({ version: true }).partial();

export const DEFAULT_THEME = 'star-chart';

export function defaultUserSettings(): UserSettings {
  return { version: 1, theme: DEFAULT_THEME, achievements: true, viewer: {}, captain: {} };
}

/**
 * A patch over saved settings. `viewer` and `captain` merge per tenant, so setting one org's
 * viewer never forgets another's. Pure.
 */
export function mergeUserSettings(base: UserSettings, patch: Partial<UserSettings>): UserSettings {
  return {
    ...base,
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.achievements !== undefined ? { achievements: patch.achievements } : {}),
    viewer: { ...base.viewer, ...(patch.viewer ?? {}) },
    captain: { ...base.captain, ...(patch.captain ?? {}) },
    ...(patch.devParadigm !== undefined ? { devParadigm: patch.devParadigm } : {}),
    ...(patch.tourOffered !== undefined ? { tourOffered: patch.tourOffered } : {}),
    version: 1,
  };
}
