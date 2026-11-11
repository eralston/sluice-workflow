// The Solar hierarchy (v1, 13 §2 and 14 §2.5): a round (the sector: a map of its regions) → a region
// (one solar system, the bottom level and the only one that plays). In SDLC a round is a sprint and a
// region is one of its pods, so the chain reuses the Sprints levels' data and walks: only the region's
// layout is new. Level ids stay `sprint` and `pod` (ADO's focus() and field.ts read them); the words
// round and region come from vocab and terminology. There is no level below the region. Its beats are
// paced by the domain pack's maneuver rules. Pure.
import type { CanonicalKey } from '../contracts/keys';
import type { Snapshot } from '../contracts/view';
import type { ScopeHistory } from '../contracts/history';
import type { AnyTimelineEvent } from '../contracts/events';
import { servesAt } from '../engine/facts';
import { pacing } from '../engine/maneuvers';
import { DEFAULT_PACK, packFor, packIdOf } from '../packs/registry';
import { subtreeInto } from './backlog';
import { chain } from './chain';
import { chromeWords } from './chrome';
import { solarRoundField } from './solarRound';
import { facts, paceFacts, solarSource } from './solarSource';
import { SPRINTS } from './sprints';
import type { Hierarchy, LevelDef, SceneRef, SolarSource } from './types';

const level = (id: string): LevelDef => {
  const def = SPRINTS.levels.find((l) => l.id === id);
  if (!def) throw new Error(`solar: the Sprints chain has no ${id} level`);
  return def;
};

/**
 * The round: the Sprints sector's field of pods, which doesn't play (13 §2: too small to read). Each
 * pod star previews its region (19 P1: its seats' planets, its objectives and threats as counts).
 */
/**
 * The scene keys a region plays (23 D4): its star, then everything ever beneath its objectives and
 * threats. SDLC keeps Sprints' own membership (`podOrder`: User Stories and Bugs, so ADO mode and its goldens
 * are untouched). A fixture pack (Todo, CRM) names other types, so its keys come from the region's board
 * facts: the pieces the pack's mapping gives a placed role, whatever the type is called.
 */
function regionKeys(h: ScopeHistory, ref: SceneRef, legacy: LevelDef): Set<CanonicalKey> | null {
  if (packIdOf(h) === DEFAULT_PACK) return legacy.sceneKeys(h, ref);
  const keys = new Set<CanonicalKey>([ref.key]);
  for (const p of facts(h, ref).pieces.values()) if (p.role === 'objective' || p.role === 'threat') subtreeInto(h, keys, p.key);
  return keys;
}

/** The Sprints vocab with the pack's own words where the chrome names the round or the region (23 D5). */
const roundVocab: LevelDef['vocab'] = {
  ...level('sprint').vocab,
  typeLabel: (_ref, _t, h) => chromeWords(h).round,
  playNounFor: (h) => chromeWords(h).round.toLowerCase(),
  enter: { chart: level('sprint').vocab.enter.chart, ado: (_t, h) => `Open ${chromeWords(h).round.toLowerCase()} ›` },
  pill: (_ref, h) => chromeWords(h).round,
};
const regionVocab: LevelDef['vocab'] = {
  ...level('pod').vocab,
  typeLabel: (_ref, _t, h) => chromeWords(h).region,
  playNounFor: (h) => chromeWords(h).round.toLowerCase(),
  enter: { chart: level('pod').vocab.enter.chart, ado: (_t, h) => `Open ${chromeWords(h).region} ›` },
};

const ROUND_LEGACY = level('sprint');
const ROUND: LevelDef = {
  ...ROUND_LEGACY, vocab: roundVocab, layout: 'field', source: solarRoundField, playable: false,
  sceneKeys(h, ref) {
    if (packIdOf(h) === DEFAULT_PACK) return ROUND_LEGACY.sceneKeys(h, ref);
    const sector = h.scope.sector;
    const keys = new Set<CanonicalKey>();
    for (const pod of sector.kind === 'sprint' ? sector.pods : []) for (const k of regionKeys(h, { level: 'pod', key: pod.areaKey }, level('pod'))!) keys.add(k);
    return keys;
  },
};

/**
 * A region plays a PR's events only while the PR serves its work (22 C12, 05 §8 B-20): one of its links
 * is, or is a Task of, a story or bug in this area path and round at that moment. A PR serving another
 * region's work, or work that has moved away, never plays its merge (or opens, abandons, links) here.
 */
function regionEvents(h: ScopeHistory, ref: SceneRef): (e: AnyTimelineEvent) => boolean {
  const f = facts(h, ref);
  return (e) => {
    if (e.kind === 'pr_opened' || e.kind === 'pr_completed' || e.kind === 'pr_abandoned') return servesAt(f, e.entityKey, e.occurredAt);
    if (e.kind === 'link_pr_added' || e.kind === 'link_pr_removed') return servesAt(f, e.payload.prKey, e.occurredAt);
    return true;
  };
}

/**
 * The Solar chain, with its region source extended (2026-10-12): a theme names the seats
 * (`seatTitle`) without the shared code knowing its words. `SOLAR` is the plain chain.
 */
export function solarHierarchy(extra: Partial<SolarSource> = {}): Hierarchy {
  /** The region: the Sprints pod's data and transitions, drawn by the solar layout. */
  const REGION: LevelDef = { ...level('pod'), vocab: regionVocab, layout: 'solar', source: Object.keys(extra).length ? { ...solarSource, ...extra } : solarSource, sceneEvents: regionEvents, sceneKeys: (h, ref) => regionKeys(h, ref, level('pod')) };
  return chain('solar').then(ROUND).then(REGION).build({
    sceneForScope: (scope) => SPRINTS.sceneForScope(scope),
    // Sprints ends a path in its body close-up; Solar has no such level, and nav's goTo resolves every
    // ref it's given (14 §2.5), so the path stops at the region.
    pathTo: (s: Snapshot, key: CanonicalKey, h: ScopeHistory): SceneRef[] => SPRINTS.pathTo(s, key, h).filter((ref) => ref.level !== 'body'),
    labelOf(s, h, ref) {
      if (ref.level === 'body') return null;
      const named = SPRINTS.labelOf(s, h, ref);
      // The type is the pack's word for the level (23 D5): `Sprint` and `Area Path` for SDLC, as before.
      return named && (ref.level === 'sprint' || ref.level === 'pod') ? { ...named, typeName: ref.level === 'sprint' ? chromeWords(h).round : chromeWords(h).region } : named;
    },
    focusOf: (s, key, h) => SPRINTS.focusOf(s, key, h),
    closeUpOf: (s, key, h) => SPRINTS.closeUpOf(s, key, h),
    stageOf: (s, key, h) => SPRINTS.stageOf(s, key, h),
    uncharted: (s, h) => SPRINTS.uncharted(s, h),
    rankOf: (s, key) => SPRINTS.rankOf(s, key),
    vocab: SPRINTS.vocab,
    // Beats sized by the maneuvers they'll play (14 §2.6), from the round's board (`paceFacts`).
    pacing: (h, ref) => pacing(packFor(h), { facts: paceFacts, ...(ref?.level === 'pod' ? { region: ref.key } : {}) }),
  });
}

export const SOLAR: Hierarchy = solarHierarchy();
