// The solar beat planner (v1, 14 §3 step 8): on each forward beat in a solar region, the beat's
// maneuvers come from the engine's pace rules over the same facts the schedule was sized from
// (`paceFacts`, the whole round's board), so every protect window lands inside its beat. Every
// accented beat crossed in one frame plays, at its own offset (22 C9, B-19); cut beats get light work
// only (05 §5). Other scenes
// answer null, and playback plays the v0 accents there. Registered on import.
import type { ScopeHistory } from '@shared/contracts/history';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { sceneFacts } from '@shared/engine/facts';
import { planManeuvers, priorityFor } from '@shared/engine/maneuvers';
import { PACE_RULES } from '@shared/engine/pace';
import { paceFacts } from '@shared/hierarchy/solarSource';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { activeHierarchy } from '../hierarchy';
import { registerBeatPlanner, type BeatPlanArgs } from '../playHooks';

/** Whether a scene is drawn by the solar layout (a region), in the active chain. */
export function isSolarScene(sceneKey: string | null | undefined): boolean {
  return !!sceneKey && activeHierarchy().resolve(sceneKey)?.def.layout === 'solar';
}

/** The schedule's priority for the pack (pacing's own), so the planner drafts the beats it sized. */
const prioCache = new WeakMap<ScopeHistory, ReturnType<typeof priorityFor> | null>();
function priorityOf(h: ScopeHistory) {
  if (!prioCache.has(h)) prioCache.set(h, priorityFor(packFor(h), paceFacts) ?? null);
  return prioCache.get(h) ?? undefined;
}

/** The maneuvers for one frame's crossing in a solar region; null anywhere else. */
export function planSolarBeat(a: BeatPlanArgs): PlannedManeuver[] | null {
  if (!isSolarScene(a.sceneKey)) return null;
  // The round's facts as this region's scene plans them, as its schedule was sized (22 C9 review).
  const ref = activeHierarchy().resolve(a.sceneKey)?.ref;
  const f = sceneFacts(paceFacts(a.history), ref?.level === 'pod' ? ref.key : undefined);
  const prio = priorityOf(a.history);
  const opts = { ...(prio ? { priorityOf: prio } : {}), ...(a.limelight ? { limelight: a.limelight } : {}) };
  // Every accented beat the frame crossed plays (22 C9, B-19), each as late as it began after the first,
  // so they keep the schedule's spacing; the latest alone when the caller names no others.
  const accents = a.accents?.length ? a.accents : a.beat ? [a.beat] : [];
  const first = accents[0]?.presentationStartMs ?? 0;
  return [
    ...accents.flatMap((b) => {
      const lag = b.presentationStartMs - first;
      return planManeuvers(a.history, b, f, PACE_RULES, a.eng, opts).map((m) => (lag ? { ...m, afterMs: m.afterMs + lag } : m));
    }),
    // Cut beats keep their light work, as v0's ships' actions do (05 §5).
    ...(a.eng.lightActions ? a.others.filter((b) => !accents.includes(b)).flatMap((b) => planManeuvers(a.history, { ...b, accented: false }, f, PACE_RULES, a.eng, opts)) : []),
  ];
}

registerBeatPlanner(planSolarBeat);
