// The two calls playback.ts makes into v1 (14 §1.4, 17 A7): a beat planner and a recap hook. v1
// registers them (v1/plan.ts, v1/awards.ts); with none registered, or one that answers null for the
// scene, playback runs exactly as v0 did. Keeping the seam this small means playback.ts never names a
// maneuver, a pack or an achievement.
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import type { Beat, Limelight } from '@shared/contracts/playback';
import type { Award } from '@shared/engine/types';
import type { Engagement } from '@shared/playback/engagement';

/** What a planner sees for one frame's crossing: the accented beat, and others crossed with it. */
export interface BeatPlanArgs {
  history: ScopeHistory;
  sceneKey: string;
  /** The beat that plays (the latest accented one crossed), or null. */
  beat: Beat | null;
  /** Beats crossed in the same frame that don't play their own accents: light work only (05 §5). */
  others: readonly Beat[];
  /**
   * Every accented beat crossed in the frame, in order (22 C9, B-19), `beat` the last. A planner that
   * plays them all (Solar) plans each at its offset from the first and leaves them out of `others`.
   */
  accents?: readonly Beat[];
  eng: Engagement;
  /** The schedule's limelight (22 C6): who is named, as the beats were shaped. */
  limelight?: Limelight;
}

/**
 * Plans a beat's maneuvers for a scene it owns; null means "not mine" (the v0 accents play). An
 * empty list means it owns the scene but nothing plays.
 */
export type BeatPlanner = (a: BeatPlanArgs) => PlannedManeuver[] | null;

/** An award as the chart shows it: on its holder's ship (18 §3), never on anyone else's. */
export type ShownAward = Award & { holder: CanonicalKey };

/** The awards the recap ends with, for the scene on screen; [] when there are none to show. */
export type RecapHook = (a: { history: ScopeHistory; sceneKey: string }) => ShownAward[];

let planner: BeatPlanner | null = null;
let recapHook: RecapHook | null = null;

/** Registers the beat planner (one; a later one replaces it). Returns an unregister. */
export function registerBeatPlanner(fn: BeatPlanner): () => void {
  planner = fn;
  return () => { if (planner === fn) planner = null; };
}

/** Registers the recap hook (one; a later one replaces it). Returns an unregister. */
export function registerRecapHook(fn: RecapHook): () => void {
  recapHook = fn;
  return () => { if (recapHook === fn) recapHook = null; };
}

/** The registered planner's maneuvers for this crossing, or null when the scene isn't its own. */
export function planBeat(a: BeatPlanArgs): PlannedManeuver[] | null {
  return planner?.(a) ?? null;
}

/** The awards to show in the scene's recap (none without a hook). */
export function recapAwards(history: ScopeHistory, sceneKey: string): ShownAward[] {
  return recapHook?.({ history, sceneKey }) ?? [];
}

/** The awards earned by a beat's own events: their insignia light as it plays (18 §3). */
export function beatAwards(history: ScopeHistory, sceneKey: string, beat: Beat): ShownAward[] {
  const keys = new Set(beat.eventKeys);
  return recapAwards(history, sceneKey).filter((a) => keys.has(a.earnedAt.eventKey));
}
