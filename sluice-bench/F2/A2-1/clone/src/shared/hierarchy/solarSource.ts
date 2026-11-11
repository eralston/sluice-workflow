// The solar region's source (v1, 14 §1.2): the region's star, which keeps the Sprints pod's aggregate
// look (13 §3, INV-05), the round's neutral board the solar layout plans from, and the pack that reads
// the bundle. It reuses the Sprints pod system through the chain's exports, so sprints.ts stays as it
// is (14 §1.4). The pack is looked up here, outside the engine (the import fence): the projection
// and the engine are handed it. Pure.
import type { ScopeHistory } from '../contracts/history';
import { FEATURE_ROW_CAP, FEATURE_TYPE, rankFeatures, type FeatureTally } from '../featureRow';
import type { CanonicalKey } from '../contracts/keys';
import type { ViewNode } from '../contracts/view';
import { knownOff, memberAt, parentAtTime, roundFacts, signalAtTime } from '../engine/facts';
import { isSlotRole } from '../engine/solar/slots';
import { scheduleFacts } from '../engine/maneuvers';
import type { RoundFacts } from '../engine/types';
import '../packs/all';
import { packFor } from '../packs/registry';
import type { ProjectCtx } from '../scene/project/ctx';
import { boardFacts } from '../scene/project/solar';
import { chromeWords } from './chrome';
import { sprintOf, SPRINTS } from './sprints';
import type { SceneRef, SolarSource, SystemSource } from './types';

/** The Sprints pod level's system source: the pod star and its members, as v0 draws them. */
export const podSystemSource: SystemSource = (() => {
  const pod = SPRINTS.levels.find((l) => l.id === 'pod');
  if (pod?.layout !== 'system') throw new Error('solar: the Sprints chain has no pod system to reuse');
  return pod.source;
})();

/** One region's board: the round's facts for it, with seats held only on the ladder (`boardFacts`). */
export function facts(h: ScopeHistory, ref: SceneRef): RoundFacts {
  return boardFacts(roundFacts(h, ref, packFor(h)));
}

/**
 * The facts the episode is paced from (14 §2.6): the whole round's board (every region of it),
 * since the schedule hooks see the bundle, not the scene. A bundle that isn't a round falls back to
 * the schedule's own fold. The beat planner must read this same object, so every protect window
 * stays inside its beat.
 */
export function paceFacts(h: ScopeHistory): RoundFacts {
  const had = paceMemo.get(h);
  if (had) return had;
  const sector = h.scope.sector;
  const pack = packFor(h);
  let f: RoundFacts;
  if (sector.kind === 'sprint') {
    // Each pod's own board too (2026-10-13), for the rules about one region: a seat completing there,
    // its last threat falling. The same facts each pod's scene is drawn from.
    const regions = new Map(sector.pods.map((p) => [p.areaKey, facts(h, { level: 'pod', key: p.areaKey })] as const));
    f = { ...boardFacts(roundFacts(h, { level: 'sprint', key: sector.iterationKey }, pack)), regions };
  } else f = boardFacts(scheduleFacts(h, pack));
  paceMemo.set(h, f);
  return f;
}

/** One pace facts object per bundle: the schedule and the beat planner must read the same one. */
const paceMemo = new WeakMap<ScopeHistory, RoundFacts>();

/**
 * What a region holds at the playhead, as counts (19 P1): its objectives and threats in the region and
 * on the ladder, from the same board facts its scene is drawn from, and how many of them are done.
 * Off pieces aren't counted.
 */
export function regionCounts(ctx: ProjectCtx, key: CanonicalKey): { objectives: number; threats: number; done: number; nearing: number; underway: number } {
  const out = { objectives: 0, threats: 0, done: 0, nearing: 0, underway: 0 };
  const x = ctx.s.atUtc;
  for (const p of facts(ctx.h, { level: 'pod', key }).pieces.values()) {
    const signal = signalAtTime(p, x);
    if (!isSlotRole(p.role) || !memberAt(p, x) || knownOff(signal)) continue;
    if (p.role === 'objective') out.objectives++;
    else out.threats++;
    if (signal?.rung === 'accomplished') out.done++;
    else if (signal?.rung === 'nearing') out.nearing++;
    else if (signal?.rung === 'underway') out.underway++;
  }
  return out;
}

/** Every work item the bundle knows by key: its type and its title as last read (the entities, then the current state). */
const knownItems = new WeakMap<ScopeHistory, Map<CanonicalKey, { type: string; title: string | null }>>();
function itemsOf(h: ScopeHistory): Map<CanonicalKey, { type: string; title: string | null }> {
  let m = knownItems.get(h);
  if (!m) {
    m = new Map(h.entities.workItems.map((w) => [w.key, { type: w.type, title: null }] as const));
    for (const w of h.current?.workItems ?? []) m.set(w.key, { type: w.type, title: w.title });
    knownItems.set(h, m);
  }
  return m;
}

/**
 * A region's Features now (B3): for every piece in the region and on the ladder, its parent at the playhead when
 * that parent is a Feature. A piece with no Feature parent is counted nowhere. Titles are the playhead's when the
 * snapshot holds the Feature, else the bundle's last read; unknown stays null (the plate says `Feature #id`).
 */
export function regionFeatures(ctx: ProjectCtx, key: CanonicalKey): FeatureTally[] {
  const x = ctx.s.atUtc;
  const known = itemsOf(ctx.h);
  const counts = new Map<CanonicalKey, number>();
  for (const p of facts(ctx.h, { level: 'pod', key }).pieces.values()) {
    if (!isSlotRole(p.role) || !memberAt(p, x) || knownOff(signalAtTime(p, x))) continue;
    const parent = parentAtTime(p, x);
    if (!parent) continue;
    const type = ctx.s.workItems.get(parent)?.type ?? known.get(parent)?.type;
    if (type === FEATURE_TYPE) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  return rankFeatures(counts, (k) => ctx.s.workItems.get(k)?.title || known.get(k)?.title || null);
}

const everMemo = new WeakMap<object, number>();
/**
 * The lines the Features row needs at most over the loaded round (R4 vs R9): every Feature that ever parents one of the region's
 * pieces, capped at the row's size (`+N more` shares the last line, 27 B2). 0: no row at all.
 */
export function featureLinesEver(ctx: ProjectCtx, key: CanonicalKey): number {
  const pieces = facts(ctx.h, { level: 'pod', key }).pieces;
  let n = everMemo.get(pieces);
  if (n === undefined) {
    const known = itemsOf(ctx.h);
    const seen = new Set<CanonicalKey>();
    for (const p of pieces.values()) {
      if (!isSlotRole(p.role)) continue;
      for (const q of [p.parent, ...(p.parentAt ?? []).map((e) => e.parent)]) if (q && known.get(q)?.type === FEATURE_TYPE) seen.add(q);
    }
    n = seen.size;
    everMemo.set(pieces, n);
  }
  return Math.min(FEATURE_ROW_CAP, n);
}

/**
 * A pod star's look under Solar, from those counts: v0's thresholds (`podStage`) over the pack's own
 * rungs, so its outside reads what's inside for every pack (19 review: a CRM pod with 8 items was drawn
 * as the empty pod's sketch, since v0's membership counts only User Stories and Bugs).
 */
function regionStage(c: ReturnType<typeof regionCounts>): string {
  const n = c.objectives + c.threats;
  if (!n) return 'feature.faint';
  if (c.done === n) return 'feature.whiteDwarf';
  if ((c.done + c.nearing) / n >= 0.75) return 'feature.accept';
  if (c.done + c.nearing > 0 || c.underway > 0) return 'feature.active';
  return 'feature.ready';
}

/**
 * A pod's star under Solar (19 L4, Q11; 22 A3), in the round and at a region's centre: its plate is its
 * name over its counts by role (`roleCounts`, worded by the renderer: `12 asteroids · 4 hive ships`), never
 * its path, which the inspector shows (`path`, 22 A4). `meta` is the plain fallback (`16 items`); the
 * inspector's line (`detail`) adds the done count, from the same counts, so the two agree for every
 * pack (v0's line counts only User Stories and Bugs: a CRM pod read 0 there, 19 review). The region's own star
 * (`withFeatures`) also carries its Features (B3); the round's does not.
 */
export function solarPodStar(ctx: ProjectCtx, node: ViewNode | null, key: CanonicalKey, withFeatures = false): ViewNode | null {
  const pod = sprintOf(ctx.h)?.pods.find((p) => p.areaKey === key);
  if (!node || !pod) return node;
  const c = regionCounts(ctx, key);
  const n = c.objectives + c.threats;
  const items = `${n} item${n === 1 ? '' : 's'}`;
  const typeName = chromeWords(ctx.h).region;
  return {
    ...node, typeName, stage: regionStage(c), meta: items, path: pod.path,
    roleCounts: { objective: c.objectives, threat: c.threats, done: c.done },
    ...(withFeatures && featureLinesEver(ctx, key) > 0 ? { features: regionFeatures(ctx, key), featureLines: featureLinesEver(ctx, key) } : {}),
    detail: `${typeName} · ${items}${n ? ` · ${c.done} done` : ''}`,
  };
}

export const solarSource: SolarSource = {
  center: (ctx, ref, pk) => solarPodStar(ctx, podSystemSource.center(ctx, ref, pk), ref.key, true),
  facts,
  pack: (h) => packFor(h),
};
