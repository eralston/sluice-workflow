// 14 §1.1 — moves: every event of a bundle, normalised once into engine terms (14 §2.2). Maneuver
// rules and achievements read moves, never raw events. A pack's adapter does the reading;
// `contractMoves` is the default reading of the shared event contract (03 §3) through the bundle's
// own mapping, which an adapter may use as is (SDLC does) or wrap. Observations are undated, so they
// are never events and never move (INV-02). Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import { underPath } from '../paths';
import { attachmentSignal, resolveRole, resolveSignal } from './signal';
import type { DomainPack, Move, Role } from './types';

// ---- Scope membership: which pieces a bundle (or one region of it) holds ----

/** Where a piece sits: its region path and its round path (null outside every round). */
export interface Placement { area: string; iteration: string | null }

/** Whether a placement is inside the scope. */
export type InScope = (at: Placement) => boolean;

/**
 * The scope's membership test, read from the bundle's sector. A round (a sprint sector) holds a
 * piece while its round path is under the round's and its region path is under one of the round's
 * regions; with `region`, under that region only (the round's own key means every region). An
 * area sector holds what's under its path, and an epic sector holds everything in the bundle.
 */
export function scopeTest(h: ScopeHistory, region?: CanonicalKey): InScope {
  const sector = h.scope.sector;
  if (sector.kind === 'sprint') {
    const pods = region === undefined || region === sector.iterationKey ? sector.pods : sector.pods.filter((p) => p.areaKey === region);
    if (!pods.length) return () => false;
    return (at) => at.iteration !== null && underPath(at.iteration, sector.path) && pods.some((p) => underPath(at.area, p.path));
  }
  if (sector.kind === 'area') return (at) => underPath(at.area, sector.path);
  return () => true;
}

/** The roles that hold a place of their own in a region. Steps follow their parent. */
export const PLACED_ROLES: ReadonlySet<Role> = new Set<Role>(['objective', 'threat']);

// ---- Lookups ----

const types = new WeakMap<ScopeHistory, ReadonlyMap<CanonicalKey, string>>();

/** Every work item's type (an opaque mapping key), from the bundle's entities and current state. */
export function typeIndex(h: ScopeHistory): ReadonlyMap<CanonicalKey, string> {
  let ix = types.get(h);
  if (!ix) {
    const m = new Map<CanonicalKey, string>();
    for (const w of h.current?.workItems ?? []) m.set(w.key, w.type);
    for (const w of h.entities.workItems) m.set(w.key, w.type);
    types.set(h, (ix = m));
  }
  return ix;
}

/** A work item's role, by key, or null for an item the bundle or its mapping doesn't know. */
export function roleOfKey(h: ScopeHistory, key: CanonicalKey): Role | null {
  const type = typeIndex(h).get(key);
  return type === undefined ? null : resolveRole(h.stateMapping, type);
}

/** The keys a move is about, in a fixed order: the piece first, then whatever it binds or lands at. */
export function movedKeys(mv: Move): CanonicalKey[] {
  switch (mv.m) {
    case 'bind': case 'unbind': return [mv.child, mv.parent];
    case 'attach': case 'settle': return [mv.key, mv.facility];
    default: return [mv.key];
  }
}

// ---- The default reading of the event contract ----

interface ItemState { type: string; role: Role | null; at: Placement; inScope: boolean }

/**
 * Reads a bundle's events in order. Most moves need only the event and the mapping; `enter` and
 * `leave` need where the piece was before, so the reader keeps each item's placement.
 */
class ContractReader {
  private items = new Map<CanonicalKey, ItemState>();
  private inScope: InScope;

  constructor(private h: ScopeHistory) {
    this.inScope = scopeTest(h);
    // Items known only from the current state start where they are now (no history, no events).
    const hist = new Set(h.coverage.history ?? []);
    for (const w of h.current?.workItems ?? []) {
      if (hist.has(w.key)) continue;
      this.place(w.key, w.type, { area: w.areaPath, iteration: w.iterationPath || null });
    }
  }

  private place(key: CanonicalKey, type: string, at: Placement): ItemState {
    const role = resolveRole(this.h.stateMapping, type);
    const s: ItemState = { type, role, at, inScope: !!role && PLACED_ROLES.has(role) && this.inScope(at) };
    this.items.set(key, s);
    return s;
  }

  private item(key: CanonicalKey): ItemState | null {
    const known = this.items.get(key);
    if (known) return known;
    const type = typeIndex(this.h).get(key);
    return type === undefined ? null : this.place(key, type, { area: '', iteration: null });
  }

  /** An item moved: `enter` or `leave` when it crossed the scope's edge. */
  private moved(key: CanonicalKey, s: ItemState, at: Placement): Move[] {
    s.at = at;
    const was = s.inScope;
    s.inScope = !!s.role && PLACED_ROLES.has(s.role) && this.inScope(at);
    if (!s.role || was === s.inScope) return [];
    return [{ m: s.inScope ? 'enter' : 'leave', key, role: s.role }];
  }

  read(e: AnyTimelineEvent): Move[] {
    const map = this.h.stateMapping;
    const actor = e.changedBy ?? null;
    switch (e.kind) {
      case 'wi_created': {
        const p = e.payload;
        const s = this.place(e.entityKey, p.type, { area: p.areaPath, iteration: p.iterationPath || null });
        return s.role ? [{ m: 'appear', key: e.entityKey, role: s.role, to: resolveSignal(map, p.type, p.state), seat: p.assigneeKey }] : [];
      }
      case 'wi_state_changed': {
        const s = this.item(e.entityKey);
        if (!s?.role) return [];
        return [{ m: 'climb', key: e.entityKey, role: s.role, from: resolveSignal(map, s.type, e.payload.from), to: resolveSignal(map, s.type, e.payload.to), actor }];
      }
      case 'wi_assignee_changed': {
        const s = this.item(e.entityKey);
        return s?.role ? [{ m: 'reseat', key: e.entityKey, role: s.role, from: e.payload.from, to: e.payload.to, actor }] : [];
      }
      case 'wi_area_changed': {
        const s = this.item(e.entityKey);
        return s ? this.moved(e.entityKey, s, { ...s.at, area: e.payload.to }) : [];
      }
      case 'wi_iteration_changed': {
        const s = this.item(e.entityKey);
        return s ? this.moved(e.entityKey, s, { ...s.at, iteration: e.payload.to || null }) : [];
      }
      case 'wi_title_changed':
        return this.item(e.entityKey)?.role ? [{ m: 'retitle', key: e.entityKey }] : [];
      case 'link_parent_added':
      case 'link_parent_removed': {
        const { childKey, parentKey } = e.payload;
        const child = this.item(childKey);
        if (!child?.role) return [];
        return [{ m: e.kind === 'link_parent_added' ? 'bind' : 'unbind', child: childKey, parent: parentKey, rel: child.role === 'step' ? 'step' : 'container' }];
      }
      case 'link_pr_added':
      case 'link_pr_removed':
        return [{ m: e.kind === 'link_pr_added' ? 'bind' : 'unbind', child: e.payload.prKey, parent: e.payload.itemKey, rel: 'attachment' }];
      case 'link_dependency_added':
      case 'link_dependency_removed':
        return []; // not on the v1 board
      case 'pr_opened':
        return [{ m: 'attach', key: e.entityKey, facility: e.payload.repoKey, author: e.payload.authorKey }];
      case 'pr_completed':
        return [{
          m: 'settle', key: e.entityKey, facility: e.payload.repoKey, to: attachmentSignal(map, 'completed'),
          approvers: [...(e.payload.approvedBy ?? [])].sort(), actor,
        }];
      case 'pr_abandoned':
        return [{ m: 'settle', key: e.entityKey, facility: e.payload.repoKey, to: attachmentSignal(map, 'abandoned'), approvers: [], actor }];
    }
  }
}

const contract = new WeakMap<ScopeHistory, ReadonlyMap<string, Move[]>>();

/**
 * The default reading of one event: the moves the shared event contract implies, through the
 * bundle's mapping. An event from the bundle is read in context (its piece's placement before it);
 * any other event is read alone, so it never enters or leaves.
 */
export function contractMoves(h: ScopeHistory, e: AnyTimelineEvent): Move[] {
  let all = contract.get(h);
  if (!all) {
    const reader = new ContractReader(h);
    const m = new Map<string, Move[]>();
    for (const ev of h.events) m.set(ev.eventKey, frozen(reader.read(ev)));
    contract.set(h, (all = m));
  }
  return all.get(e.eventKey) ?? frozen(new ContractReader(h).read(e));
}

// ---- Every event, as the pack reads it ----

const memo = new WeakMap<ScopeHistory, WeakMap<DomainPack, ReadonlyMap<string, Move[]>>>();

/** Every event's moves, by event key, as the pack's adapter reads them. Memoised per bundle and pack. */
export function movesOf(h: ScopeHistory, pack: DomainPack): ReadonlyMap<string, Move[]> {
  let byPack = memo.get(h);
  if (!byPack) memo.set(h, (byPack = new WeakMap()));
  let all = byPack.get(pack);
  if (!all) {
    const m = new Map<string, Move[]>();
    for (const e of h.events) m.set(e.eventKey, frozen(pack.adapter.moves(h, e)));
    byPack.set(pack, (all = m));
  }
  return all;
}

/** Frozen, so a memoised move can't be changed by a reader. */
function frozen(mv: Move[]): Move[] {
  for (const m of mv) Object.freeze(m);
  return Object.freeze(mv) as Move[];
}
