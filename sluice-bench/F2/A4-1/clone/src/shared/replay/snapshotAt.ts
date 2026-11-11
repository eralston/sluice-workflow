// 03 §5 — pure replay. Same inputs, same snapshot, regardless of call history (INV-12).
// Events in a bundle are sorted (02 §5), so a snapshot is a prefix fold. Fold states are cached as
// checkpoints every CHECKPOINT_EVERY events per bundle, so a seek replays at most that many events.
// The cache only memoizes the fold: results never depend on what was asked before.
import type { AnyTimelineEvent, Observation } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Lens, PrState, Snapshot, SnapshotLink, WorkItemState } from '../contracts/view';
import { resolveState } from '../stateMapping';

export const CHECKPOINT_EVERY = 256;

interface FoldState {
  workItems: Map<CanonicalKey, WorkItemState>;
  prs: Map<CanonicalKey, PrState>;
  links: Map<string, SnapshotLink>;
  /** Items that have been in category Completed at some point (for `reopened`, 02 §2). */
  everCompleted: Set<CanonicalKey>;
}

const linkId = (kind: SnapshotLink['kind'], from: CanonicalKey, to: CanonicalKey) => `${kind}|${from}|${to}`;

const emptyFold = (): FoldState => ({ workItems: new Map(), prs: new Map(), links: new Map(), everCompleted: new Set() });

/**
 * Where the fold starts (decided 2026-10-07): empty, or, for a bundle with a `current` state, every
 * entity without history as it is now. Events (only for entities with history) apply on top. An
 * entity with no history has no events, so it shows its current state at every time.
 */
const seeds = new WeakMap<ScopeHistory, FoldState>();
function seedFold(h: ScopeHistory): FoldState {
  if (!h.current) return emptyFold();
  let seed = seeds.get(h);
  if (seed) return cloneFold(seed);
  seed = emptyFold();
  const hist = new Set(h.coverage.history ?? []);
  for (const w of h.current.workItems) {
    if (hist.has(w.key)) continue;
    const r = resolveState(h.stateMapping, w.type, w.state);
    seed.workItems.set(w.key, {
      key: w.key, type: w.type, kind: r.kind, title: w.title, rawState: w.state, category: r.category, stage: r.stage, reopened: false,
      areaPath: w.areaPath, assigneeKey: w.assigneeKey, assignedAt: null, parentKey: null, lastEventAt: null,
      ...(w.iterationPath ? { iterationPath: w.iterationPath } : {}),
    });
    if (r.category === 'Completed') seed.everCompleted.add(w.key);
  }
  for (const p of h.current.prs) {
    if (hist.has(p.key)) continue;
    seed.prs.set(p.key, { key: p.key, repoKey: p.repoKey, title: p.title, status: p.status, statusUncertain: false, authorKey: p.authorKey });
  }
  // A link belongs to its canonical side (03 §3): the child, the item a PR links, the successor.
  for (const l of h.current.links) {
    const canonical = l.kind === 'parent' ? l.fromKey : l.toKey;
    if (hist.has(canonical)) continue;
    seed.links.set(linkId(l.kind, l.fromKey, l.toKey), { kind: l.kind, fromKey: l.fromKey, toKey: l.toKey, uncertain: false });
  }
  seeds.set(h, seed);
  return cloneFold(seed);
}

function cloneFold(s: FoldState): FoldState {
  return {
    workItems: new Map([...s.workItems].map(([k, v]) => [k, { ...v }])),
    prs: new Map([...s.prs].map(([k, v]) => [k, { ...v }])),
    links: new Map([...s.links].map(([k, v]) => [k, { ...v }])),
    everCompleted: new Set(s.everCompleted),
  };
}

function apply(h: ScopeHistory, s: FoldState, e: AnyTimelineEvent): void {
  const touch = (key: CanonicalKey) => {
    const wi = s.workItems.get(key);
    if (wi) wi.lastEventAt = e.occurredAt;
  };
  switch (e.kind) {
    case 'wi_created': {
      const p = e.payload;
      const r = resolveState(h.stateMapping, p.type, p.state);
      s.workItems.set(e.entityKey, {
        key: e.entityKey, type: p.type, kind: r.kind, title: p.title, rawState: p.state,
        category: r.category, stage: r.stage, reopened: false, areaPath: p.areaPath,
        assigneeKey: p.assigneeKey, assignedAt: p.assigneeKey ? e.occurredAt : null,
        parentKey: null, lastEventAt: e.occurredAt,
        ...(p.iterationPath ? { iterationPath: p.iterationPath } : {}),
      });
      if (r.category === 'Completed') s.everCompleted.add(e.entityKey);
      return;
    }
    case 'wi_state_changed': {
      const wi = s.workItems.get(e.entityKey);
      if (!wi) return;
      const r = resolveState(h.stateMapping, wi.type, e.payload.to);
      wi.rawState = e.payload.to;
      wi.category = r.category;
      wi.stage = r.stage;
      if (r.category === 'Completed') {
        s.everCompleted.add(e.entityKey);
        wi.reopened = false;
      } else if (s.everCompleted.has(e.entityKey)) {
        wi.reopened = true;
      }
      touch(e.entityKey);
      return;
    }
    case 'wi_assignee_changed': {
      const wi = s.workItems.get(e.entityKey);
      if (wi) {
        wi.assigneeKey = e.payload.to;
        wi.assignedAt = e.payload.to ? e.occurredAt : null;
      }
      touch(e.entityKey);
      return;
    }
    case 'wi_area_changed': {
      const wi = s.workItems.get(e.entityKey);
      if (wi) wi.areaPath = e.payload.to;
      touch(e.entityKey);
      return;
    }
    case 'wi_iteration_changed': {
      const wi = s.workItems.get(e.entityKey);
      if (wi) {
        if (e.payload.to) wi.iterationPath = e.payload.to;
        else delete wi.iterationPath;
      }
      touch(e.entityKey);
      return;
    }
    case 'wi_title_changed': {
      const wi = s.workItems.get(e.entityKey);
      if (wi) wi.title = e.payload.to;
      touch(e.entityKey);
      return;
    }
    case 'link_parent_added': {
      const { childKey, parentKey } = e.payload;
      s.links.set(linkId('parent', childKey, parentKey), { kind: 'parent', fromKey: childKey, toKey: parentKey, uncertain: false });
      touch(childKey);
      return;
    }
    case 'link_parent_removed':
      s.links.delete(linkId('parent', e.payload.childKey, e.payload.parentKey));
      touch(e.payload.childKey);
      return;
    case 'link_dependency_added': {
      const { predecessorKey, successorKey } = e.payload;
      s.links.set(linkId('dependency', predecessorKey, successorKey), { kind: 'dependency', fromKey: predecessorKey, toKey: successorKey, uncertain: false });
      return;
    }
    case 'link_dependency_removed':
      s.links.delete(linkId('dependency', e.payload.predecessorKey, e.payload.successorKey));
      return;
    case 'link_pr_added': {
      const { prKey, itemKey } = e.payload;
      s.links.set(linkId('pr', prKey, itemKey), { kind: 'pr', fromKey: prKey, toKey: itemKey, uncertain: false });
      touch(itemKey);
      return;
    }
    case 'link_pr_removed':
      s.links.delete(linkId('pr', e.payload.prKey, e.payload.itemKey));
      touch(e.payload.itemKey);
      return;
    case 'pr_opened':
      s.prs.set(e.entityKey, {
        key: e.entityKey, repoKey: e.payload.repoKey, title: e.payload.title, status: 'active',
        statusUncertain: false, authorKey: e.payload.authorKey,
      });
      return;
    case 'pr_completed':
    case 'pr_abandoned': {
      const pr = s.prs.get(e.entityKey);
      if (pr) pr.status = e.kind === 'pr_completed' ? 'completed' : 'abandoned';
      return;
    }
  }
}

// ---- Checkpoints ----

interface Checkpoints { at: number[]; states: FoldState[] }
const cache = new WeakMap<ScopeHistory, Checkpoints>();

/** Fold states after events 0, CHECKPOINT_EVERY, 2·CHECKPOINT_EVERY, … (state *before* that index). */
function checkpointsFor(h: ScopeHistory): Checkpoints {
  let cp = cache.get(h);
  if (cp) return cp;
  cp = { at: [0], states: [seedFold(h)] };
  const s = seedFold(h);
  h.events.forEach((e, i) => {
    apply(h, s, e);
    if ((i + 1) % CHECKPOINT_EVERY === 0) {
      cp!.at.push(i + 1);
      cp!.states.push(cloneFold(s));
    }
  });
  cache.set(h, cp);
  return cp;
}

/** Index of the first event with occurredAt > t (events are sorted). */
function upperBound(events: AnyTimelineEvent[], t: UtcMs): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.occurredAt <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function foldTo(h: ScopeHistory, end: number): FoldState {
  const cp = checkpointsFor(h);
  let c = 0;
  while (c + 1 < cp.at.length && cp.at[c + 1]! <= end) c++;
  const s = cloneFold(cp.states[c]!);
  for (let i = cp.at[c]!; i < end; i++) apply(h, s, h.events[i]!);
  return s;
}

// ---- Lenses (02 §6) ----

const obsLinkKind: Record<Observation['kind'], SnapshotLink['kind'] | null> = {
  link_parent: 'parent', link_dependency: 'dependency', link_pr: 'pr', pr_status: null,
};

function obsLinkId(o: Observation): string | null {
  const kind = obsLinkKind[o.kind];
  return kind && o.toKey ? linkId(kind, o.fromKey, o.toKey) : null;
}

/** Pure: the state at `atUtc` through `lens` (INV-03, INV-12). */
export function snapshotAt(h: ScopeHistory, atUtc: UtcMs, lens: Lens): Snapshot {
  const s = foldTo(h, upperBound(h.events, atUtc));
  // An undated removal of a dated link: its end is unknown (02 §6).
  const undatedRemovals = new Set(h.observations.filter((o) => o.op === 'removed').map(obsLinkId).filter((x): x is string => !!x));

  let links: SnapshotLink[];
  if (lens === 'knownThen') {
    links = [...s.links.values()].map((l) => ({ ...l, uncertain: undatedRemovals.has(linkId(l.kind, l.fromKey, l.toKey)) }));
  } else {
    // Retrospective: the link set as of the range end, applied between the items that exist now.
    const end = foldTo(h, h.events.length);
    const known = new Set(s.links.keys());
    const byId = new Map<string, SnapshotLink>();
    for (const [id, l] of end.links) if (!undatedRemovals.has(id)) byId.set(id, { ...l, uncertain: !known.has(id) });
    for (const o of h.observations) {
      const id = obsLinkId(o);
      const kind = obsLinkKind[o.kind];
      if (!id || !kind || o.op !== 'present') continue;
      byId.set(id, { kind, fromKey: o.fromKey, toKey: o.toKey!, uncertain: true });
    }
    links = [...byId.values()];
    for (const o of h.observations) {
      if (o.kind !== 'pr_status' || !o.status) continue;
      const pr = s.prs.get(o.fromKey);
      if (pr) {
        pr.status = o.status;
        pr.statusUncertain = true;
      }
    }
  }

  links = links
    .filter((l) => (l.kind === 'pr' ? s.prs.has(l.fromKey) : s.workItems.has(l.fromKey)) && s.workItems.has(l.toKey))
    .sort((a, b) => cmp(a.kind, b.kind) || cmp(a.fromKey, b.fromKey) || cmp(a.toKey, b.toKey));
  for (const l of links) {
    if (l.kind === 'parent') {
      const child = s.workItems.get(l.fromKey);
      if (child) child.parentKey = l.toKey;
    }
  }
  return { atUtc, lens, workItems: s.workItems, prs: s.prs, links };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
