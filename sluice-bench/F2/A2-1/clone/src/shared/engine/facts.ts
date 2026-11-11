// 14 §1.1, §3 step 3 — round facts: the neutral board for one region's round, folded once over the
// bundle's dated events and memoised. For every piece it records when it was in the region, which
// seat held it, which signal it showed and its parent; for every attachment, its facility, author,
// links and approvers; and when each event happened. The solar plan, pacing and the achievements
// read these, through the readers below, never raw events. Items known only from the current state
// start the fold as they are now; observations are undated and never enter it (INV-02), so facts
// read as the known-then lens does. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory, UtcRange } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { SceneRef } from '../hierarchy/sceneKey';
import { movedKeys, movesOf, PLACED_ROLES, roleOfKey, scopeTest, type InScope, type Placement } from './moves';
import { attachmentSignal, resolveRole, resolveSignal } from './signal';
import type { AttachmentFacts, DomainPack, Interval, Move, PieceFacts, Role, RoundFacts, Signal } from './types';

// ---- Reading facts at an instant ----
// These readers are the one timeline every v1 consumer reads (the solar plan, the projection, pacing
// and the achievements), so a piece's seat, membership and place on the ladder always agree.

/** Whether an interval list covers `x` (from inclusive, to exclusive; `to: null` runs on). */
export function coversAt(intervals: readonly Interval[], x: UtcMs): boolean {
  return intervals.some((i) => i.from <= x && (i.to === null || x < i.to));
}

/** Whether an interval overlaps a range (start inclusive, end exclusive). */
export function overlapsRange(i: Interval, r: UtcRange): boolean {
  return i.from < r.endUtc && (i.to === null || i.to > r.startUtc);
}

/** Where two intervals meet, or null when they share no instant. */
export function meet(a: Interval, b: Interval): Interval | null {
  const from = Math.max(a.from, b.from);
  const to = a.to === null ? b.to : b.to === null ? a.to : Math.min(a.to, b.to);
  return to === null || to > from ? { from, to } : null;
}

/** The entry of a dated series in force at `x`, or undefined before its first. */
export function entryAt<T extends { from: UtcMs }>(series: readonly T[], x: UtcMs): T | undefined {
  let found: T | undefined;
  for (const s of series) {
    if (s.from > x) break;
    found = s;
  }
  return found;
}

/** Whether a piece is in the region at `x`. */
export const memberAt = (p: PieceFacts, x: UtcMs): boolean => coversAt(p.member, x);
/** The seat holding a piece at `x` (null: unassigned, the frontier, which is also where it is before its first entry). */
export const seatAtTime = (p: PieceFacts, x: UtcMs): CanonicalKey | null => entryAt(p.seatAt, x)?.seat ?? null;
/** A piece's or an attachment's signal at `x`, or null before it existed. */
export const signalAtTime = (p: { signalAt: { from: UtcMs; signal: Signal }[] }, x: UtcMs): Signal | null => entryAt(p.signalAt, x)?.signal ?? null;
/** A piece's parent at `x` (null: unbound). Facts without a parent series read the final parent. */
export const parentAtTime = (p: PieceFacts, x: UtcMs): CanonicalKey | null =>
  p.parentAt ? entryAt(p.parentAt, x)?.parent ?? null : p.parent;

/** The story or bug a linked item stands for at `x` among `pieces`: itself, or a Task's parent then (22 C12). */
function servedAt(pieces: ReadonlyMap<CanonicalKey, PieceFacts>, k: CanonicalKey, x: UtcMs): PieceFacts | null {
  const p = pieces.get(k);
  if (!p) return null;
  if (p.role !== 'step') return p;
  const parent = parentAtTime(p, x);
  const q = parent ? pieces.get(parent) : undefined;
  return q && q.role !== 'step' ? q : null;
}

/**
 * Whether a PR serves the region at `x` (22 C12, 05 §8 B-20): one of its links is, or is a Task of, a
 * story or bug in the region's area path and round then. Only then do its events play there.
 */
export function servesAt(f: Pick<RoundFacts, 'pieces' | 'attachments'>, pr: CanonicalKey, x: UtcMs): boolean {
  const a = f.attachments.get(pr);
  return !!a && a.links.some((k) => { const p = servedAt(f.pieces, k, x); return !!p && memberAt(p, x); });
}

/** Whether a link, or the story or bug it's a Task of, stood in the region at some instant of `window`. */
function servedDuring(pieces: ReadonlyMap<CanonicalKey, PieceFacts>, k: CanonicalKey, window: Interval): boolean {
  const p = pieces.get(k);
  if (!p) return false;
  const meets = (q: PieceFacts) => q.member.some((m) => !!meet(m, window));
  if (p.role !== 'step') return meets(p);
  const parents = new Set([...(p.parentAt ?? []).map((x) => x.parent), p.parent].filter((x): x is CanonicalKey => !!x));
  return meets(p) && [...parents].some((q) => { const r = pieces.get(q); return !!r && r.role !== 'step' && meets(r); });
}

/** Whether a signal is known to be Off. An unknown state (INV-11) isn't: it's neutral, not gone. */
export const knownOff = (s: Signal | null | undefined): boolean => !!s && s.rung === 'off' && !s.unknown;

/**
 * When a piece is on the ladder: every stretch its signal isn't known to be Off. Before its first
 * signal it isn't known to be Off either, so a piece with no signal series is on throughout.
 */
export function onSpans(p: Pick<PieceFacts, 'signalAt'>): Interval[] {
  const out: Interval[] = [];
  let from: UtcMs | null = -Infinity;
  for (const s of p.signalAt) {
    const off = knownOff(s.signal);
    if (off && from !== null) {
      if (s.from > from) out.push({ from, to: s.from });
      from = null;
    } else if (!off && from === null) from = s.from;
  }
  if (from !== null) out.push({ from, to: null });
  return out;
}

/** One stretch of the round a piece stood on the board at one seat (null: the frontier). End-exclusive. */
export interface HeldSpan { seat: CanonicalKey | null; from: UtcMs; to: UtcMs }

/**
 * Every stretch of the round a piece stood on the board: in the region, on the ladder, and at one
 * seat as `seatAtTime` reads it (so unassigned, the frontier, before its first seat entry). Clipped
 * to the round. Seats (`seatsOf`), the plan's slots and the frontier all come from these, so a piece
 * Off for a whole stay at a seat never opens it.
 */
export function heldSpans(p: PieceFacts, round: UtcRange): HeldSpan[] {
  const segments: { from: UtcMs; to: UtcMs | null; seat: CanonicalKey | null }[] = [
    { from: -Infinity, to: p.seatAt[0]?.from ?? null, seat: null },
    ...p.seatAt.map((s, i) => ({ from: s.from, to: p.seatAt[i + 1]?.from ?? null, seat: s.seat })),
  ];
  const r: Interval = { from: round.startUtc, to: round.endUtc };
  const on = onSpans(p);
  const out: HeldSpan[] = [];
  for (const seg of segments) {
    for (const m of p.member) {
      for (const o of on) {
        const a = meet(seg, m);
        const b = a && meet(a, o);
        const c = b && meet(b, r);
        if (c) out.push({ seat: seg.seat, from: c.from, to: c.to ?? round.endUtc });
      }
    }
  }
  return out;
}

/**
 * When a piece is known to be Off: every stretch its signal is Off (nothing before its first signal).
 */
export function offSpans(p: Pick<PieceFacts, 'signalAt'>): Interval[] {
  const out: Interval[] = [];
  let from: UtcMs | null = null;
  for (const s of p.signalAt) {
    const off = knownOff(s.signal);
    if (off && from === null) from = s.from;
    else if (!off && from !== null) {
      out.push({ from, to: s.from });
      from = null;
    }
  }
  if (from !== null) out.push({ from, to: null });
  return out;
}

/**
 * Every stretch of the round a piece stood as a ghost at a seat: in the region, known to be Off, at a
 * seat a reseat made while Off put it at, and the seat is one of `seats` (23 C9: a reseat made while Off puts the
 * ghost at its new seat, if that seat is on the board). These are slots only: a ghost holds nothing, so
 * `heldSpans`, `seatsOf` and `seatReason` never see them.
 */
export function ghostSpans(p: PieceFacts, round: UtcRange, seats: ReadonlySet<CanonicalKey>): HeldSpan[] {
  const r: Interval = { from: round.startUtc, to: round.endUtc };
  const off = offSpans(p);
  const out: HeldSpan[] = [];
  p.seatAt.forEach((seg, i) => {
    // Only a stay a reseat made while Off began (23 C9): the first stay, or one entered on the ladder, is as before.
    if (i === 0 || !seg.seat || !seats.has(seg.seat) || !knownOff(signalAtTime(p, seg.from))) return;
    const seatSpan: Interval = { from: seg.from, to: p.seatAt[i + 1]?.from ?? null };
    for (const m of p.member) {
      for (const o of off) {
        const a = meet(seatSpan, m);
        const b = a && meet(a, o);
        const c = b && meet(b, r);
        if (c) out.push({ seat: seg.seat, from: c.from, to: c.to ?? round.endUtc });
      }
    }
  });
  return out;
}

const instants = new WeakMap<RoundFacts, Map<UtcMs, string[]>>();

/** The facts' events at one instant, in event order (needs `RoundFacts.at`). */
export function eventsAt(f: RoundFacts, t: UtcMs): string[] {
  let ix = instants.get(f);
  if (!ix) {
    ix = new Map();
    for (const k of f.moves.keys()) {
      const at = f.at?.get(k);
      if (at !== undefined) ix.set(at, [...(ix.get(at) ?? []), k]);
    }
    instants.set(f, ix);
  }
  return ix.get(t) ?? [];
}

/**
 * The seat holding a piece at one dated event, in event order. The seat series folds every reseat of
 * a millisecond into that instant, so `seatAtTime` already shows a reseat that comes after the event
 * (an assignee change sorts after a state change, 03 §3); this reads the seat as it stood then.
 * Membership and parents need no such care: placement and link changes sort first.
 */
export function seatAtEvent(f: RoundFacts, p: PieceFacts, eventKey: string): CanonicalKey | null {
  const t = f.at?.get(eventKey);
  if (t === undefined) return null;
  const keys = eventsAt(f, t);
  const seats = (k: string) => (f.moves.get(k) ?? []).flatMap((m) =>
    m.m === 'appear' && m.key === p.key ? [m.seat] : m.m === 'reseat' && m.key === p.key ? [m.to] : []);
  if (!keys.some((k) => seats(k).length)) return seatAtTime(p, t);
  let seat = seatAtTime(p, t - 1);
  for (const k of keys) {
    // A reseat to the frontier is a null seat, not "no reseat": only an empty list keeps the seat.
    const s = seats(k);
    if (s.length) seat = s[s.length - 1]!;
    if (k === eventKey) break;
  }
  return seat;
}

// ---- The fold ----

/** One work item as the fold sees it. */
interface Track {
  key: CanonicalKey; role: Role | null; at: Placement;
  parent: CanonicalKey | null; parentAt: { from: UtcMs; parent: CanonicalKey | null }[];
  /** Step children now, and every step child ever in first-bind order. */
  children: Set<CanonicalKey>; steps: CanonicalKey[];
  member: boolean; open: UtcMs | null; intervals: Interval[];
  seatAt: { from: UtcMs; seat: CanonicalKey | null }[];
  signalAt: { from: UtcMs; signal: Signal }[];
}

/** One attachment as the fold sees it. */
interface AttachTrack {
  key: CanonicalKey; facility: CanonicalKey | null; author: CanonicalKey | null;
  open: Interval; links: Set<CanonicalKey>; approvers: CanonicalKey[];
  signalAt: { from: UtcMs; signal: Signal }[];
}

const sameSignal = (a: Signal, b: Signal) =>
  a === b || (a.rung === b.rung && !!a.sketch === !!b.sketch && a.step === b.step && !!a.deferred === !!b.deferred
    && !!a.ghost === !!b.ghost && !!a.strike === !!b.strike && !!a.unknown === !!b.unknown);

class Fold {
  readonly items = new Map<CanonicalKey, Track>();
  readonly attachments = new Map<CanonicalKey, AttachTrack>();

  constructor(private h: ScopeHistory, private inScope: InScope) {}

  item(key: CanonicalKey, role: Role | null = null): Track {
    let t = this.items.get(key);
    if (!t) {
      t = {
        key, role, at: { area: '', iteration: null }, parent: null, parentAt: [], children: new Set(), steps: [],
        member: false, open: null, intervals: [], seatAt: [], signalAt: [],
      };
      this.items.set(key, t);
    } else if (role && !t.role) t.role = role;
    return t;
  }

  attachment(key: CanonicalKey, at: UtcMs): AttachTrack {
    let a = this.attachments.get(key);
    if (!a) {
      a = { key, facility: null, author: null, open: { from: at, to: null }, links: new Set(), approvers: [], signalAt: [] };
      this.attachments.set(key, a);
    }
    return a;
  }

  seat(t: Track, at: UtcMs, seat: CanonicalKey | null): void {
    const last = t.seatAt.at(-1);
    if (last && last.seat === seat) return;
    if (last && last.from === at) last.seat = seat;
    else t.seatAt.push({ from: at, seat });
  }

  signal(series: { from: UtcMs; signal: Signal }[], at: UtcMs, signal: Signal): void {
    const last = series.at(-1);
    if (last && sameSignal(last.signal, signal)) return;
    if (last && last.from === at) last.signal = signal;
    else series.push({ from: at, signal });
  }

  /** A parent change at `at`; a second change in one millisecond replaces the first. */
  reparent(tr: Track, at: UtcMs, parent: CanonicalKey | null): void {
    tr.parent = parent;
    const last = tr.parentAt.at(-1);
    if (last ? last.parent === parent : parent === null) return;
    if (last && last.from === at) last.parent = parent;
    else tr.parentAt.push({ from: at, parent });
  }

  bind(child: CanonicalKey, parent: CanonicalKey, at: UtcMs, rel?: 'step' | 'container'): void {
    const c = this.item(child, rel === 'step' ? 'step' : null);
    if (c.parent && c.parent !== parent) this.items.get(c.parent)?.children.delete(child);
    this.reparent(c, at, parent);
    if (c.role !== 'step') return;
    const p = this.item(parent);
    p.children.add(child);
    if (!p.steps.includes(child)) p.steps.push(child);
  }

  unbind(child: CanonicalKey, parent: CanonicalKey, at: UtcMs): void {
    const c = this.items.get(child);
    if (!c || c.parent !== parent) return;
    this.reparent(c, at, null);
    this.items.get(parent)?.children.delete(child);
  }

  /** Whether an item is in the region now: placed roles by placement, steps by their parent. */
  private memberNow(t: Track): boolean {
    if (t.role && PLACED_ROLES.has(t.role)) return this.inScope(t.at);
    if (t.role !== 'step' || !t.parent) return false;
    const p = this.items.get(t.parent);
    return !!p?.role && PLACED_ROLES.has(p.role) && p.member;
  }

  /** Re-reads an item's membership at `at`, opening or closing its interval, and its steps' after it. */
  refresh(key: CanonicalKey, at: UtcMs): void {
    const t = this.items.get(key);
    if (!t) return;
    const now = this.memberNow(t);
    if (now !== t.member) {
      t.member = now;
      // Out and back at one instant is never seen out either, so the last interval runs on.
      if (now) t.open = t.intervals.at(-1)?.to === at ? t.intervals.pop()!.from : at;
      else {
        // An interval that opens and closes at one instant is never seen (a snapshot shows the state after both).
        if (t.open !== null && t.open < at) t.intervals.push({ from: t.open, to: at });
        t.open = null;
      }
    }
    for (const c of [...t.children].sort()) this.refresh(c, at);
  }

  /** Applies one event: its moves, then the placement it carries (the contract's own fields). */
  apply(e: AnyTimelineEvent, moves: readonly Move[]): void {
    const t = e.occurredAt;
    const touched = new Set<CanonicalKey>();
    for (const mv of moves) {
      switch (mv.m) {
        case 'appear': {
          const tr = this.item(mv.key, mv.role);
          this.seat(tr, t, mv.seat);
          this.signal(tr.signalAt, t, mv.to);
          touched.add(mv.key);
          break;
        }
        case 'climb': this.signal(this.item(mv.key, mv.role).signalAt, t, mv.to); break;
        case 'reseat': this.seat(this.item(mv.key, mv.role), t, mv.to); break;
        case 'bind':
          if (mv.rel === 'attachment') this.attachment(mv.child, t).links.add(mv.parent);
          else { this.bind(mv.child, mv.parent, t, mv.rel); touched.add(mv.child); }
          break;
        case 'unbind':
          // An attachment's links are kept ever: it served the piece, even once unlinked.
          if (mv.rel !== 'attachment') { this.unbind(mv.child, mv.parent, t); touched.add(mv.child); }
          break;
        case 'attach': {
          const a = this.attachment(mv.key, t);
          a.facility = mv.facility;
          a.author = mv.author;
          a.open = { from: t, to: null };
          this.signal(a.signalAt, t, attachmentSignal(this.h.stateMapping, 'active'));
          break;
        }
        case 'settle': {
          const a = this.attachment(mv.key, t);
          a.facility ??= mv.facility;
          a.open = { from: a.open.from, to: t };
          a.approvers = [...mv.approvers];
          this.signal(a.signalAt, t, mv.to);
          break;
        }
        case 'enter': case 'leave': touched.add(mv.key); break;
        case 'retitle': break;
      }
    }
    // Placement comes from the event contract's own fields, so a region of any round reads alike.
    const placed = e.kind === 'wi_created' ? { area: e.payload.areaPath, iteration: e.payload.iterationPath || null }
      : e.kind === 'wi_area_changed' ? { area: e.payload.to }
      : e.kind === 'wi_iteration_changed' ? { iteration: e.payload.to || null }
      : null;
    if (placed) {
      const tr = this.item(e.entityKey, roleOfKey(this.h, e.entityKey));
      tr.at = { ...tr.at, ...placed };
      touched.add(e.entityKey);
    }
    // Placed pieces first, so a step reads its parent's membership after this event.
    const order = [...touched].sort((a, b) => rank(this.items.get(a)) - rank(this.items.get(b)) || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of order) this.refresh(k, t);
  }

  /** Items and attachments known only from the current state, as they are now, from `origin`. */
  seed(origin: UtcMs): void {
    const cur = this.h.current;
    if (!cur) return;
    const hist = new Set(this.h.coverage.history ?? []);
    const map = this.h.stateMapping;
    for (const w of cur.workItems) {
      if (hist.has(w.key)) continue;
      const t = this.item(w.key, resolveRole(map, w.type));
      t.at = { area: w.areaPath, iteration: w.iterationPath || null };
      this.seat(t, origin, w.assigneeKey);
      this.signal(t.signalAt, origin, resolveSignal(map, w.type, w.state));
    }
    for (const l of cur.links) {
      if (l.kind === 'parent' && !hist.has(l.fromKey)) this.bind(l.fromKey, l.toKey, origin);
      if (l.kind === 'pr' && !hist.has(l.toKey)) this.attachment(l.fromKey, origin).links.add(l.toKey);
    }
    for (const p of cur.prs) {
      if (hist.has(p.key)) continue;
      const a = this.attachment(p.key, p.createdAt);
      a.facility = p.repoKey;
      a.author = p.authorKey;
      a.open = { from: p.createdAt, to: p.status === 'active' ? null : p.closedAt ?? p.createdAt };
      this.signal(a.signalAt, p.createdAt, attachmentSignal(map, 'active'));
      if (p.status !== 'active') this.signal(a.signalAt, a.open.to!, attachmentSignal(map, p.status));
    }
    const order = [...this.items.values()].sort((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const t of order) this.refresh(t.key, origin);
  }
}

/** Placed pieces before steps before everything else. */
const rank = (t: Track | undefined) => (t?.role && PLACED_ROLES.has(t.role) ? 0 : t?.role === 'step' ? 1 : 2);

// ---- Round facts ----

const memo = new WeakMap<ScopeHistory, WeakMap<DomainPack, Map<string, RoundFacts>>>();

/**
 * The round's facts for one region (`ref.key`: a region of the round, or the round itself for all
 * of them), over the whole loaded history. Memoised per bundle, pack and region.
 */
/**
 * Each facility's merged attachments within `round` (the whole history when it's unset), in merge
 * order: the moves that settle an attachment there at Accomplished, by time, ties by attachment key.
 * `keep` limits them to the merges a region plays (22 C12). Deterministic.
 */
export function roundMerges(events: readonly { eventKey: string; occurredAt: UtcMs }[], movesOf: (eventKey: string) => readonly Move[] | undefined, round?: UtcRange, keep?: (attachment: CanonicalKey, at: UtcMs) => boolean): Map<CanonicalKey, CanonicalKey[]> {
  const all = new Map<CanonicalKey, { at: UtcMs; key: CanonicalKey }[]>();
  for (const e of events) {
    if (round && (e.occurredAt < round.startUtc || e.occurredAt > round.endUtc)) continue;
    for (const m of movesOf(e.eventKey) ?? []) {
      if (m.m !== 'settle' || m.to.rung !== 'accomplished' || (keep && !keep(m.key, e.occurredAt))) continue;
      const list = all.get(m.facility) ?? [];
      if (!list.some((x) => x.key === m.key)) list.push({ at: e.occurredAt, key: m.key });
      all.set(m.facility, list);
    }
  }
  return new Map([...all].map(([f, list]) => [f, list.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((x) => x.key)]));
}

/**
 * Each facility's first merged attachment within `round` (the whole history when it's unset): the
 * merge that transforms it on playback (decided 2026-10-13: every playback starts with every facility
 * in its first form, so the round's first merge plays the transformation).
 */
export function firstMerges(events: readonly { eventKey: string; occurredAt: UtcMs }[], movesOf: (eventKey: string) => readonly Move[] | undefined, round?: UtcRange): Map<CanonicalKey, CanonicalKey> {
  return new Map([...roundMerges(events, movesOf, round)].map(([f, keys]) => [f, keys[0]!]));
}

export function roundFacts(h: ScopeHistory, ref: SceneRef, pack: DomainPack): RoundFacts {
  let byPack = memo.get(h);
  if (!byPack) memo.set(h, (byPack = new WeakMap()));
  let byRef = byPack.get(pack);
  if (!byRef) byPack.set(pack, (byRef = new Map()));
  const id = `${ref.level}|${ref.variant ?? ''}|${ref.key}`;
  let f = byRef.get(id);
  if (!f) byRef.set(id, (f = build(h, ref.key, pack)));
  return f;
}

function build(h: ScopeHistory, region: CanonicalKey, pack: DomainPack): RoundFacts {
  const round: UtcRange = { startUtc: h.range.startUtc, endUtc: h.range.endUtc };
  const moves = movesOf(h, pack);
  const fold = new Fold(h, scopeTest(h, region));
  fold.seed(Math.min(round.startUtc, h.events[0]?.occurredAt ?? round.startUtc));
  for (const e of h.events) fold.apply(e, moves.get(e.eventKey) ?? []);

  // Pieces: objectives, threats and steps in the region at some instant of the round.
  const pieces = new Map<CanonicalKey, PieceFacts>();
  for (const t of [...fold.items.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    if (!t.role || (!PLACED_ROLES.has(t.role) && t.role !== 'step')) continue;
    const member = t.open !== null ? [...t.intervals, { from: t.open, to: null }] : [...t.intervals];
    if (!member.some((i) => overlapsRange(i, round))) continue;
    pieces.set(t.key, {
      key: t.key, role: t.role, member, seatAt: t.seatAt.map((s) => ({ ...s })), signalAt: t.signalAt.map((s) => ({ ...s })),
      steps: [...t.steps], parent: t.parent, parentAt: t.parentAt.map((x) => ({ ...x })),
    });
  }

  // Attachments: linked to a piece here, and open at some instant of the round.
  const attachments = new Map<CanonicalKey, AttachmentFacts>();
  const repoOf = new Map(h.entities.prs.map((p) => [p.key, p.repoKey]));
  for (const a of [...fold.attachments.values()].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))) {
    const links = [...a.links].filter((k) => pieces.has(k)).sort();
    const facility = a.facility ?? repoOf.get(a.key) ?? null;
    if (!links.length || !facility || !overlapsRange(a.open, round)) continue;
    // Only a PR that served the region's work while open is the region's (22 C12).
    const open = meet(a.open, { from: round.startUtc, to: round.endUtc });
    if (!open || !links.some((k) => servedDuring(pieces, k, open))) continue;
    attachments.set(a.key, {
      key: a.key, facility, author: a.author, open: { ...a.open }, links, approvers: [...a.approvers],
      signalAt: a.signalAt.map((s) => ({ ...s })),
    });
  }

  // Moves that touch the board, by event key, in event order, and when each happened.
  const board = new Map<string, Move[]>();
  const at = new Map<string, UtcMs>();
  for (const e of h.events) {
    const mv = moves.get(e.eventKey);
    if (!mv?.some((m) => movedKeys(m).some((k) => pieces.has(k) || attachments.has(k)))) continue;
    board.set(e.eventKey, mv);
    at.set(e.eventKey, e.occurredAt);
  }

  // A merge counts toward a facility's form here only while its PR serves the region (22 C12).
  const here = { pieces, attachments };
  const merges = roundMerges(h.events, (k) => moves.get(k), round, (key, x) => servesAt(here, key, x));
  const firstMerge = new Map([...merges].map(([fac, keys]) => [fac, keys[0]!]));
  return { round, region, pieces, seats: seatsOf(pieces, round), attachments, moves: board, at, firstMerge, merges };
}

/**
 * Why a seat is on the board at `at` (22 A2: a planet says why it's there): it holds work in the region
 * now (`holds`, how many); or it held a piece earlier in the round (`held`: the last one, until when,
 * and what ended it: the piece left the region or the round, went Off, or was handed to someone else
 * (`to`) or to no one); or its work comes later (`later`: the first, from when). From the same spans seats come from
 * (`heldSpans`), so the answer always agrees with the planet being there. Null: not a seat.
 */
export type SeatReason =
  | { kind: 'holds'; count: number }
  | { kind: 'held'; key: CanonicalKey; until: UtcMs; why: 'left' | 'off' | 'handed' | 'unassigned'; to?: CanonicalKey }
  | { kind: 'later'; key: CanonicalKey; from: UtcMs };

export function seatReason(f: Pick<RoundFacts, 'pieces' | 'round'>, seat: CanonicalKey, at: UtcMs): SeatReason | null {
  let count = 0;
  let last: { key: CanonicalKey; until: UtcMs; p: PieceFacts } | null = null;
  let next: { key: CanonicalKey; from: UtcMs } | null = null;
  for (const p of f.pieces.values()) {
    if (!PLACED_ROLES.has(p.role)) continue;
    for (const s of heldSpans(p, f.round)) {
      if (s.seat !== seat) continue;
      if (s.from <= at && at < s.to) count++;
      else if (s.to <= at && (!last || s.to > last.until)) last = { key: p.key, until: s.to, p };
      else if (s.from > at && (!next || s.from < next.from)) next = { key: p.key, from: s.from };
    }
  }
  if (count) return { kind: 'holds', count };
  if (last) {
    // What ended it, in this order when several land at once (one ADO save often moves a piece and
    // reassigns it): it left the region or the round, it went Off, or it changed hands (to someone, or
    // to no one). `to`: who held it next, at that instant, not now.
    const t = last.until;
    const p = last.p;
    const next = p.seatAt.filter((x) => x.from === t).at(-1);
    if (p.member.some((m) => m.to === t)) return { kind: 'held', key: last.key, until: t, why: 'left' };
    if (p.signalAt.some((x) => x.from === t && knownOff(x.signal))) return { kind: 'held', key: last.key, until: t, why: 'off' };
    if (next && next.seat !== seat) {
      return next.seat ? { kind: 'held', key: last.key, until: t, why: 'handed', to: next.seat } : { kind: 'held', key: last.key, until: t, why: 'unassigned' };
    }
    return { kind: 'held', key: last.key, until: t, why: 'left' };
  }
  return next ? { kind: 'later', key: next.key, from: next.from } : null;
}

/**
 * Seats (14 §4): everyone who held an objective or threat in the region at some instant of the
 * round, in the order they first held one (ties by key). Held: the piece was in the region, on the
 * ladder and assigned to them at once (`heldSpans`), so an Off piece never opens a seat.
 */
export function seatsOf(pieces: ReadonlyMap<CanonicalKey, PieceFacts>, round: UtcRange): CanonicalKey[] {
  const first = new Map<CanonicalKey, UtcMs>();
  for (const p of pieces.values()) {
    if (!PLACED_ROLES.has(p.role)) continue;
    for (const s of heldSpans(p, round)) if (s.seat && s.from < (first.get(s.seat) ?? Infinity)) first.set(s.seat, s.from);
  }
  return [...first.entries()].sort(([ka, ta], [kb, tb]) => ta - tb || (ka < kb ? -1 : ka > kb ? 1 : 0)).map(([k]) => k);
}

const scoped = new WeakMap<RoundFacts, Map<CanonicalKey, RoundFacts>>();
/**
 * A round's facts as one region's scene plans them (22 C9 review): the same facts, naming the region,
 * so a rule about the scene (a facility's first need) reads that region alone. Memoised, so the
 * schedule and the planner get the same object. No region: the facts themselves.
 */
export function sceneFacts(f: RoundFacts, region?: CanonicalKey): RoundFacts {
  if (!region || !f.regions?.has(region)) return f;
  let byRegion = scoped.get(f);
  if (!byRegion) scoped.set(f, (byRegion = new Map()));
  let out = byRegion.get(region);
  if (!out) byRegion.set(region, (out = { ...f, scene: region }));
  return out;
}
