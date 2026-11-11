// 05 §3 highlights and in-view ticks: which events touch a scene. Membership is by everything ever
// linked into the scene across the loaded history (like slots, INV-14), so it never changes on seek.
// Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { SceneKey } from '../contracts/view';
import { DESKTOP } from '../profile/bundled';
import { buildBeatSchedule } from './schedule';
import type { BeatSchedule } from '../contracts/playback';
import { BACKLOG } from '../hierarchy/backlog';
import type { Hierarchy } from '../hierarchy/types';

/**
 * The keys a scene can show: its focus, everything ever linked beneath it, and their PRs. Null only
 * for a scene outside the hierarchy (the galaxy). Memoised per bundle and scene: the ruler asks per
 * beat, and the sprint level gathers one subtree per pod.
 */
const cached = new WeakMap<ScopeHistory, Map<string, Set<CanonicalKey> | null>>();
export function sceneEntityKeys(h: ScopeHistory, scene: SceneKey, hier: Hierarchy = BACKLOG): Set<CanonicalKey> | null {
  let byScene = cached.get(h);
  if (!byScene) { byScene = new Map(); cached.set(h, byScene); }
  const memo = `${hier.id}|${scene}`;
  if (byScene.has(memo)) return byScene.get(memo)!;
  const at = hier.resolve(scene);
  const keys = at ? at.def.sceneKeys(h, at.ref) : null;
  byScene.set(memo, keys);
  return keys;
}

/**
 * Whether an event touches a scene's keys: its entity, either end of a link it makes or breaks, or —
 * for a reassignment — the captain, whose ship the scene draws (so a departure is its news).
 */
export function touches(e: AnyTimelineEvent, keys: Set<CanonicalKey> | null): boolean {
  if (!keys) return true;
  if (keys.has(e.entityKey)) return true;
  const p = e.payload as Partial<Record<'childKey' | 'parentKey' | 'prKey' | 'itemKey', CanonicalKey>>;
  if ([p.childKey, p.parentKey, p.prKey, p.itemKey].some((k) => k !== undefined && keys.has(k))) return true;
  if (e.kind === 'wi_assignee_changed') return [e.payload.from, e.payload.to].some((k) => k !== null && keys.has(k));
  return false;
}

/**
 * The scene's own schedule (05 §3, decided 2026-10-08): playback belongs to the scene on screen, so
 * only its events get beats. State is still the full snapshot, so work elsewhere still happens — it
 * just doesn't spend playback time. A v1 chain's pacing hooks (14 §2.6) are spread in first, so the
 * scene filter and the budget here always win; v0 chains have none.
 */
export function buildScene(h: ScopeHistory, range: { startUtc: number; endUtc: number }, tz: string, scene: SceneKey, hier: Hierarchy = BACKLOG, include?: (e: AnyTimelineEvent) => boolean, budgetMs?: number): BeatSchedule {
  const mine = sceneEvents(h, scene, hier);
  return buildBeatSchedule(h, range, tz, { ...hier.pacing?.(h, hier.resolve(scene)?.ref), include: (e) => mine(e) && (!include || include(e)), hier, ...(budgetMs ? { budgetMs } : {}) });
}

/** The events a scene's schedule plays: those touching its keys that its level also keeps (22 C12). */
export function sceneEvents(h: ScopeHistory, scene: SceneKey, hier: Hierarchy = BACKLOG): (e: AnyTimelineEvent) => boolean {
  const keys = sceneEntityKeys(h, scene, hier);
  const at = hier.resolve(scene);
  const keep = at?.def.sceneEvents?.(h, at.ref);
  return keep ? (e) => touches(e, keys) && keep(e) : (e) => touches(e, keys);
}

/**
 * Highlights (H, decided 2026-10-08): the scene's **big moments** only — its High-priority beats, in
 * the shorter budget. The scene filter is the default now, so H is the quick pass over a busy sprint.
 */
export function buildHighlights(h: ScopeHistory, range: { startUtc: number; endUtc: number }, tz: string, scene: SceneKey, hier: Hierarchy = BACKLOG, budgetMs: number = DESKTOP.pacing.highlightBudgetMs): BeatSchedule {
  const mine = sceneEvents(h, scene, hier);
  return buildBeatSchedule(h, range, tz, { ...hier.pacing?.(h, hier.resolve(scene)?.ref), include: (e) => mine(e) && e.priority === 'high', budgetMs, hier });
}
