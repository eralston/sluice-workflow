// The Backlog hierarchy (06 §3; a pluggable chain since 2026-10-07): a sector (a saved Area Path or an
// Epic) → its Features as stars → their Stories and Bugs as planets and anomalies → their Tasks on the
// radar. The general-purpose view, for any ADO organization. Everything here moved unchanged from the
// projector, navigation, and playback code. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { Snapshot, WorkItemState } from '../contracts/view';
import { MAX_CHILDREN_PER_FEATURE, MAX_FEATURES_PER_SECTOR, MAX_TASKS_PER_BODY } from '../limits';
import { firstJoinOrder, slotOrder } from '../scene/layout';
import { linkUncertain, workNode, type ProjectCtx } from '../scene/project/ctx';
import { resolveState } from '../stateMapping';
import { chain } from './chain';
import type { FieldSource, Hierarchy, LevelDef, RadarSource, SceneRef, SystemSource } from './types';
import { underPath } from '../paths';

const under = underPath;
/** Removed (and Rejected) items leave the scene after their departure (decided 2026-10-08; 02 INV-10). */
export const gone = (w: WorkItemState) => w.category === 'Removed';

// ---- Sector: the Features of an Area Path or an Epic ----

/**
 * Each item's latest known title over the whole bundle: today's when the current state has it, else
 * its last title in the history. Never the playhead's, so the A–Z order is the same at every instant.
 */
function latestTitles(h: ScopeHistory): Map<CanonicalKey, string> {
  const titles = new Map<CanonicalKey, { title: string; at: number }>();
  for (const e of h.events as AnyTimelineEvent[]) {
    const title = e.kind === 'wi_created' ? e.payload.title : e.kind === 'wi_title_changed' ? e.payload.to : null;
    if (title === null) continue;
    const prev = titles.get(e.entityKey);
    if (!prev || e.occurredAt >= prev.at) titles.set(e.entityKey, { title, at: e.occurredAt });
  }
  const out = new Map([...titles].map(([k, v]) => [k, v.title]));
  for (const w of h.current?.workItems ?? []) out.set(w.key, w.title);
  return out;
}

/** Features A–Z by their latest title (numbers in order: "Phase 2" before "Phase 10"); ties by key. */
export function byTitle(h: ScopeHistory, keys: CanonicalKey[]): CanonicalKey[] {
  const titles = latestTitles(h);
  const name = (k: CanonicalKey) => titles.get(k) ?? '';
  return [...keys].sort((a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true }) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Every Feature that ever joined a sector in the loaded history, in first-join order (which ones show). */
function sectorFeatureOrder(h: ScopeHistory, sectorKey: CanonicalKey, kind: 'area' | 'epic'): CanonicalKey[] {
  const path = h.scope.sector.kind === 'area' ? h.scope.sector.path : '';
  // Features known only from the current state join at their creation (decided 2026-10-07).
  const hist = new Set(h.coverage.history ?? []);
  const seeded: [CanonicalKey, number][] = !h.current ? [] : kind === 'area'
    ? h.current.workItems.filter((w) => !hist.has(w.key) && resolveState(h.stateMapping, w.type, '').kind === 'feature' && under(w.areaPath, path)).map((w) => [w.key, w.createdAt])
    : h.current.links.filter((l) => l.kind === 'parent' && l.toKey === sectorKey && !hist.has(l.fromKey))
      .map((l) => [l.fromKey, h.current!.workItems.find((w) => w.key === l.fromKey)?.createdAt ?? 0] as [CanonicalKey, number]);
  return firstJoinOrder(h, (e) => {
    if (kind === 'epic') return e.kind === 'link_parent_added' && e.payload.parentKey === sectorKey ? e.payload.childKey : null;
    if (e.kind === 'wi_created' && e.payload.type === 'Feature' && under(e.payload.areaPath, path)) return e.entityKey;
    if (e.kind === 'wi_area_changed' && under(e.payload.to, path)) return e.entityKey;
    return null;
  }, seeded);
}

const sectorKind = (ref: SceneRef): 'area' | 'epic' => (ref.variant === 'area' ? 'area' : 'epic');

const sectorSource: FieldSource = {
  // Slot order: first time each Feature joined this sector anywhere in the history. Loaded by level
  // (decided 2026-10-07), Load more can bring more than the cap: the sector becomes a page that scrolls.
  // Slots are A–Z by title (decided 2026-10-07, amending INV-14): the cap still keeps the first to join.
  order: (h, ref) => byTitle(h, sectorFeatureOrder(h, ref.key, sectorKind(ref)).slice(0, h.current ? undefined : MAX_FEATURES_PER_SECTOR)),
  member(ctx, ref, key, pk) {
    const wi = ctx.s.workItems.get(key);
    const sector = ctx.h.scope.sector;
    const path = sector.kind === 'area' ? sector.path : '';
    const isMember = (w: WorkItemState) => w.kind === 'feature' && !gone(w) && (sectorKind(ref) === 'area' ? under(w.areaPath, path) : w.parentKey === ref.key);
    return wi && isMember(wi) ? workNode(ctx, pk, wi, 'star', { x: 0, y: 0, r: 0 }) : null;
  },
  miniOrder: (h, key) => slotOrder(h, key).slice(0, MAX_CHILDREN_PER_FEATURE),
  mini(ctx, key, childKey, pk) {
    const child = ctx.s.workItems.get(childKey);
    if (!child || child.parentKey !== key || (child.kind !== 'story' && child.kind !== 'bug') || gone(child)) return null;
    return workNode(ctx, pk, child, child.kind === 'story' ? 'planet' : 'anomaly', { x: 0, y: 0, r: 0 });
  },
  unexplored(h, key) {
    const c = (h.entities.childCounts ?? []).find((x) => x.key === key);
    return c ? { planets: c.stories, anomalies: c.bugs } : null;
  },
  loadMore: (h) => (h.coverage.more?.team ? { meta: 'Older Features' } : null),
  passThrough(h, ref) {
    const order = sectorFeatureOrder(h, ref.key, sectorKind(ref));
    return order.length === 1 ? order[0]! : null;
  },
};

// ---- Feature system: the Stories and Bugs of a Feature ----

export function taskKeys(ctx: ProjectCtx, parentKey: CanonicalKey): CanonicalKey[] {
  return slotOrder(ctx.h, parentKey)
    .filter((k) => {
      const t = ctx.s.workItems.get(k);
      return t?.kind === 'task' && t.parentKey === parentKey && !gone(t);
    })
    .slice(0, MAX_TASKS_PER_BODY);
}

const featureSource: SystemSource = {
  center(ctx, ref, pk) {
    const feature = ctx.s.workItems.get(ref.key);
    return feature ? workNode(ctx, pk, feature, 'star', { x: 0, y: 0, r: 0 }) : null;
  },
  order: (h, ref) => slotOrder(h, ref.key).slice(0, MAX_CHILDREN_PER_FEATURE),
  child(ctx, ref, childKey, pk) {
    const child = ctx.s.workItems.get(childKey);
    if (!child || child.parentKey !== ref.key || gone(child)) return null;
    if (child.kind !== 'story' && child.kind !== 'bug') return null;
    return workNode(ctx, pk, child, child.kind === 'story' ? 'planet' : 'anomaly', { x: 0, y: 0, r: 0 });
  },
  uncertain: (ctx, ref, childKey) => linkUncertain(ctx.s, 'parent', childKey, ref.key),
  points: taskKeys,
  point: (ctx, key, pk) => workNode(ctx, pk, ctx.s.workItems.get(key)!, 'missionPoint', { x: 0, y: 0, r: 0 }),
};

// ---- Body close-up: one Story or Bug, its Tasks on the radar ----

export const bodySource: RadarSource = {
  center(ctx, ref, pk) {
    const wi = ctx.s.workItems.get(ref.key);
    return wi ? workNode(ctx, pk, wi, wi.kind === 'bug' ? 'anomaly' : 'planet', { x: 0, y: 0, r: 0 }) : null;
  },
  spokes(h, ref) {
    const taskType = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
    return slotOrder(h, ref.key).filter((k) => taskType.get(k) === 'Task').slice(0, MAX_TASKS_PER_BODY);
  },
  current: (ctx, ref) => taskKeys(ctx, ref.key),
  point: (ctx, key, pk) => workNode(ctx, pk, ctx.s.workItems.get(key)!, 'missionPoint', { x: 0, y: 0, r: 0 }),
  uncertain: (ctx, ref, key) => linkUncertain(ctx.s, 'parent', key, ref.key),
};

// ---- In-view keys (05 §3 highlights) ----

/**
 * Everything ever linked under each key, by parent: built once per bundle so the walks below are a
 * breadth-first search rather than a fixed-point pass over every event (decided 2026-10-08, when the
 * sprint level began asking for one subtree per pod on every frame).
 */
interface LinkIndex { kids: Map<CanonicalKey, CanonicalKey[]>; prs: Map<CanonicalKey, CanonicalKey[]>; who: Map<CanonicalKey, CanonicalKey[]> }
const indexes = new WeakMap<ScopeHistory, LinkIndex>();
function linkIndex(h: ScopeHistory): LinkIndex {
  const found = indexes.get(h);
  if (found) return found;
  const kids = new Map<CanonicalKey, CanonicalKey[]>();
  const prs = new Map<CanonicalKey, CanonicalKey[]>();
  const who = new Map<CanonicalKey, CanonicalKey[]>();
  const push = (m: Map<CanonicalKey, CanonicalKey[]>, k: CanonicalKey, v: CanonicalKey) => {
    const list = m.get(k);
    if (list) list.push(v); else m.set(k, [v]);
  };
  for (const e of h.events) {
    if (e.kind === 'link_parent_added') push(kids, e.payload.parentKey, e.payload.childKey);
    else if (e.kind === 'link_pr_added') push(prs, e.payload.itemKey, e.payload.prKey);
    // Who has ever held each item: a scene draws their ships, so their moves belong to it.
    else if (e.kind === 'wi_created' && e.payload.assigneeKey) push(who, e.entityKey, e.payload.assigneeKey);
    else if (e.kind === 'wi_assignee_changed') for (const p of [e.payload.from, e.payload.to]) if (p) push(who, e.entityKey, p);
  }
  for (const o of h.observations) {
    if (o.kind === 'link_parent' && o.op === 'present' && o.toKey) push(kids, o.toKey, o.fromKey);
    else if (o.kind === 'link_pr' && o.toKey) push(prs, o.toKey, o.fromKey);
  }
  const idx = { kids, prs, who };
  indexes.set(h, idx);
  return idx;
}

/** The keys a scene can show: its focus, everything ever linked beneath it, and their PRs. */
export function subtreeKeys(h: ScopeHistory, root: CanonicalKey): Set<CanonicalKey> {
  return subtreeInto(h, new Set<CanonicalKey>(), root);
}

/** The same walk, adding into a set already in hand (a sprint gathers every pod's bodies). */
export function subtreeInto(h: ScopeHistory, keys: Set<CanonicalKey>, root: CanonicalKey): Set<CanonicalKey> {
  const { kids, prs, who } = linkIndex(h);
  if (keys.has(root)) return keys;
  const queue: CanonicalKey[] = [root];
  keys.add(root);
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!;
    for (const child of kids.get(key) ?? []) if (!keys.has(child)) { keys.add(child); queue.push(child); }
  }
  for (const key of queue) {
    for (const pr of prs.get(key) ?? []) keys.add(pr);
    // The captains who ever held this work: their ships are drawn here, so an assignment that takes
    // one of them away is this scene's news too (its jump trail, 05 §5).
    for (const person of who.get(key) ?? []) keys.add(person);
  }
  return keys;
}

// ---- The family walks: goTo, follow, focus, Uncharted ----

function ancestry(s: Snapshot, key: CanonicalKey): WorkItemState[] {
  const chainUp: WorkItemState[] = [];
  for (let cur = s.workItems.get(key); cur; cur = cur.parentKey ? s.workItems.get(cur.parentKey) : undefined) chainUp.unshift(cur);
  return chainUp;
}

/** The Feature above an item, if any. */
function featureOf(s: Snapshot, key: CanonicalKey): CanonicalKey | null {
  let cur = s.workItems.get(key);
  while (cur) {
    if (cur.kind === 'feature') return cur.key;
    cur = cur.parentKey ? s.workItems.get(cur.parentKey) : undefined;
  }
  return null;
}

/** Stories, Bugs, and Tasks whose parent chain never reaches a Feature (02 §2, INV-10). */
function unchartedItems(s: Snapshot): CanonicalKey[] {
  const out: CanonicalKey[] = [];
  for (const wi of s.workItems.values()) {
    if (wi.kind !== 'story' && wi.kind !== 'bug' && wi.kind !== 'task') continue;
    let cur: WorkItemState | undefined = wi;
    const seen = new Set<CanonicalKey>();
    while (cur && cur.kind !== 'feature' && cur.parentKey && !seen.has(cur.key)) {
      seen.add(cur.key);
      cur = s.workItems.get(cur.parentKey);
    }
    if (cur?.kind !== 'feature') out.push(wi.key);
  }
  return out.sort();
}

const SECTOR: LevelDef = {
  id: 'sector', variants: ['area', 'epic'], layout: 'field', source: sectorSource,
  backdrop: 'sector', durationMs: 600, historyScene: 'scope',
  // Its own stars and everything ever beneath them (decided 2026-10-08): a sector plays its own work,
  // not every item the bundle happens to hold.
  sceneKeys(h, ref) {
    const keys = new Set<CanonicalKey>([ref.key]);
    for (const f of sectorFeatureOrder(h, ref.key, sectorKind(ref))) subtreeInto(h, keys, f);
    return keys;
  },
  vocab: {
    typeLabel: (ref) => (ref.variant === 'area' ? 'Area Path' : 'Epic'),
    glyph: (ref) => (ref.variant === 'area' ? '◇ ' : ref.variant === 'epic' ? '⬡ ' : ''),
    playNoun: 'team',
    enter: { chart: 'Enter sector ›', ado: () => 'Open team ›' },
    pill: (ref) => (ref.variant === 'epic' ? 'Epic' : 'Team'),
    loadMoreTip: 'Load older Features',
  },
};

const FEATURE: LevelDef = {
  id: 'feature', layout: 'system', source: featureSource,
  backdrop: 'feature', durationMs: 750, historyScene: 'self',
  sceneKeys: (h, ref) => subtreeKeys(h, ref.key),
  // An unexplored Feature loads its subtree first (decided 2026-10-07): it swirls, then opens.
  enterLoad: (h, ref) => (h.current && !h.coverage.explored?.includes(ref.key) ? { kind: 'feature', featureKey: ref.key } : null),
  vocab: {
    typeLabel: () => 'Feature',
    glyph: () => '',
    playNoun: 'Feature',
    enter: { chart: 'Enter star system ›', ado: () => 'Open Feature ›' },
  },
};

const BODY: LevelDef = {
  id: 'body', layout: 'radar', source: bodySource,
  backdrop: 'body', durationMs: 750, historyScene: 'parent',
  sceneKeys: (h, ref) => subtreeKeys(h, ref.key),
  vocab: {
    typeLabel: (_ref, typeName) => typeName ?? 'Item',
    glyph: () => '',
    playNoun: 'Feature', // a close-up plays its Feature's history
    enter: { chart: 'Close approach ›', ado: (typeName) => `Open ${typeName ?? 'item'} ›` },
  },
};

export const BACKLOG: Hierarchy = chain('backlog').then(SECTOR).then(FEATURE).then(BODY).build({
  sceneForScope(scope) {
    const sector = scope.sector;
    if (sector.kind === 'area') return { level: 'sector', variant: 'area', key: sector.areaKey };
    if (sector.kind === 'epic') return { level: 'sector', variant: 'epic', key: sector.epicKey };
    throw new Error('A sprint is a Sprints scene, not a Backlog one');
  },
  pathTo(s, key) {
    const wi = s.workItems.get(key);
    if (!wi) return [];
    const up = ancestry(s, key);
    const feature = up.find((w) => w.kind === 'feature')?.key;
    const body = wi.kind !== 'feature' ? up.find((w) => w.kind === 'story' || w.kind === 'bug')?.key : undefined;
    return [
      ...(feature ? [{ level: 'feature', key: feature }] : []),
      ...(body ? [{ level: 'body', key: body }] : []),
    ];
  },
  focusOf(s, key) {
    const wi = s.workItems.get(key);
    if (!wi) return null;
    if (wi.kind === 'story' || wi.kind === 'bug') return key;
    if (wi.kind === 'task' && wi.parentKey) {
      const p = s.workItems.get(wi.parentKey);
      return p && (p.kind === 'story' || p.kind === 'bug') ? p.key : null;
    }
    return null;
  },
  closeUpOf(s, key) {
    let cur = s.workItems.get(key);
    if (!cur) return { body: null, inScope: false };
    let body: CanonicalKey | null = null;
    while (cur) {
      if (!body && (cur.kind === 'story' || cur.kind === 'bug')) body = cur.key;
      if (cur.kind === 'feature') return { body, inScope: true };
      cur = cur.parentKey ? s.workItems.get(cur.parentKey) : undefined;
    }
    return { body, inScope: false };
  },
  stageOf(s, key) {
    const f = featureOf(s, key);
    return f ? { level: 'feature', key: f } : null;
  },
  labelOf(s, _h, ref) {
    const wi = s.workItems.get(ref.key);
    return wi ? { label: wi.title, typeName: wi.type } : null;
  },
  uncharted: (s) => unchartedItems(s),
  rankOf(s, key) {
    const kind = s.workItems.get(key)?.kind;
    return kind === 'feature' ? 0 : kind === 'task' ? 2 : 1;
  },
  vocab: { uncharted: { chart: 'Uncharted', ado: 'No Feature parent', reason: 'no Feature parent' } },
});
