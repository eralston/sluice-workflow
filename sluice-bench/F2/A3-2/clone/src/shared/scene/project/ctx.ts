// 03 §5 — what every scene projection shares: the read-only context, node and edge builders, and the
// evidence index. Moved out of projectScene.ts unchanged (pluggable hierarchy, decided 2026-10-07).
import { identityLine } from '../../identity';
import type { EvidenceRef } from '../../contracts/events';
import type { PrStats } from '../../contracts/facts';
import type { ReadRun } from '../../runLine';
import type { ScopeHistory } from '../../contracts/history';
import type { GuestPresence } from '../../contracts/playback';
import { workItemId, type CanonicalKey } from '../../contracts/keys';
import type { SceneKey, Snapshot, ViewEdge, ViewGraph, ViewNode, WorkItemState } from '../../contracts/view';
import type { Hierarchy } from '../../hierarchy/types';
import { fnv1a32 } from '../../hash';
import { ART_VERSION } from '../../limits';
import { avatarColor, initialsOf } from '../avatar';

const MAX_EVIDENCE = 5;

export function projectionKey(scene: SceneKey, key: CanonicalKey, role?: string): string {
  return role ? `${scene}|${key}|${role}` : `${scene}|${key}`;
}

export function artSeed(key: CanonicalKey): number {
  return fnv1a32(`${key}|${ART_VERSION}`);
}

/** Read-only context shared by the per-scene projections. */
/** What a projection may be given beyond the snapshot: the schedule's own plans for the scene. */
export interface ProjectOptions {
  /** When each guest is in the region (22 C8), from the scene's schedule; unset, a guest stays once they've helped. */
  guests?: GuestPresence;
}

export interface ProjectCtx {
  /** When each guest is in the region (22 C8), if the scene's schedule planned it. */
  guests?: GuestPresence;
  h: ScopeHistory;
  s: Snapshot;
  scene: SceneKey;
  layoutVersion: number;
  graph: ViewGraph;
  /** The hierarchy the scene belongs to: the next level's scene keys come from it. */
  hier: Hierarchy;
  adoUrls: Map<CanonicalKey, string>;
  /** The PR stat line's facts, by PR (B1). */
  prStats: Map<CanonicalKey, PrStats>;
  /** Each station's latest pipeline run (B2), by repo, and the time the plate counts its age from: the last sync's clock, else the range's end. */
  repoRuns: Map<CanonicalKey, ReadRun>;
  runAsOf: number;
  evidence: Map<CanonicalKey, EvidenceRef[]>;
  repoNames: Map<CanonicalKey, string>;
  captains: Map<CanonicalKey, { displayName: string; callSign: string; shipSeed: number; avatar?: string }>;
  /** Entities whose facts ADO refused on the last sync (`coverage.stale`): drawn, and marked stale. */
  stale: Set<CanonicalKey>;
}

export function makeCtx(h: ScopeHistory, s: Snapshot, scene: SceneKey, layoutVersion: number, graph: ViewGraph, hier: Hierarchy, opts: ProjectOptions = {}): ProjectCtx {
  return {
    h, s, scene, layoutVersion, graph, hier,
    ...(opts.guests ? { guests: opts.guests } : {}),
    adoUrls: new Map([...h.entities.workItems, ...h.entities.repos, ...h.entities.prs].map((e) => [e.key, e.adoUrl])),
    prStats: new Map(h.entities.prs.flatMap((p) => (p.stats ? [[p.key, p.stats] as const] : []))),
    repoRuns: new Map(h.entities.repos.flatMap((r) => (r.run ? [[r.key, r.run] as const] : []))),
    runAsOf: h.coverage.syncedAt ?? h.range.endUtc,
    evidence: evidenceIndex(h, s.atUtc),
    repoNames: new Map(h.entities.repos.map((r) => [r.key, r.name])),
    captains: new Map(h.entities.captains.map((c) => [c.key, c])),
    // Objects ADO wouldn't give us on the last sync: drawn from the last known facts, marked (02 §3).
    stale: new Set(h.coverage.stale ?? []),
  };
}

/** A captain's label avatar: their picture when they have one, otherwise initials on a color (06 §4). */
export function captainAvatar(c: { displayName: string; avatar?: string }): ViewNode['avatar'] {
  const initials = initialsOf(c.displayName);
  return { initials, color: avatarColor(initials), ...(c.avatar ? { image: c.avatar } : {}) };
}

export function workNode(ctx: ProjectCtx, pk: string, wi: WorkItemState, kind: ViewNode['kind'], world: ViewNode['world']): ViewNode {
  return {
    projectionKey: pk,
    canonicalKey: wi.key,
    kind,
    world,
    stage: wi.stage,
    seed: artSeed(wi.key),
    label: wi.title,
    // The identity line (22 B3): the ADO type leads every subtitle, so the metaphor stays learnable.
    meta: identityLine(wi.type, workItemId(wi.key), wi.rawState),
    // The captain behind the item, only when assigned (06 §4 label lines).
    meta2: wi.assigneeKey ? ctx.captains.get(wi.assigneeKey)?.displayName : undefined,
    typeName: wi.type,
    rawState: wi.rawState,
    openable: Boolean(ctx.adoUrls.get(wi.key)),
    selectable: true,
    labelled: true,
    flags: { reopened: wi.reopened || undefined, stale: ctx.stale.has(wi.key) || undefined },
    evidence: ctx.evidence.get(wi.key) ?? [],
  };
}

export function orbitEdge(from: string, to: string, cx: number, cy: number, rx: number, ry: number, uncertain = false, arc?: { from: number; to: number }): ViewEdge {
  return { key: `${to}|orbit`, kind: 'orbit', from, to, uncertain, evidence: [], geometry: { kind: 'ellipse', cx, cy, rx, ry, ...(arc ? { arc } : {}) } };
}

export function edge(kind: ViewEdge['kind'], from: string, to: string, uncertain = false): ViewEdge {
  return { key: `${from}|${kind}|${to}`, kind, from, to, uncertain, evidence: [] };
}

/** Whether the snapshot's link between two items is uncertain (the retrospective lens, 02 §6). */
export function linkUncertain(s: Snapshot, kind: 'parent' | 'pr', from: CanonicalKey, to: CanonicalKey): boolean {
  return s.links.some((l) => l.kind === kind && l.fromKey === from && l.toKey === to && l.uncertain);
}

/** Most recent evidence per entity, up to the playhead. */
function evidenceIndex(h: ScopeHistory, atUtc: number): Map<CanonicalKey, EvidenceRef[]> {
  const idx = new Map<CanonicalKey, EvidenceRef[]>();
  for (const e of h.events) {
    if (e.occurredAt > atUtc) break;
    const list = idx.get(e.entityKey) ?? [];
    list.unshift(...e.evidence);
    idx.set(e.entityKey, list.slice(0, MAX_EVIDENCE));
  }
  return idx;
}
