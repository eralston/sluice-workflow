// Story time (05 §8.3a, 22 C2): a solar region's playback tells the day's story, not a strict log. One
// pure step, before anything is scheduled, gives each event a presentation time:
// - **Arcs (B-12).** A story or bug's close joins the moment of the last merge of a PR that served it,
//   at most `ARC_WORK_HOURS` working hours before it (nights and weekends don't count). The piece's work
//   from the start of the merge's day to the end of the close's day comes along, in order: what came
//   before the merge that day just ahead of it, the rest (the close among it) just behind it, so the
//   team that merged also wins it.
// - **A story's day (B-13).** A story or bug's other work events on a day (its Tasks' included) gather
//   at its last work event that day.
// - **The rest (B-14)** keep their real time. Creations, links, moves in or out of the region and PR
//   events never move (they place things on the board); outside an arc nothing crosses a day; order
//   within a piece is kept (B-15). Nor does any work move across one of those placing events of its
//   own piece or item (22 C9 review): a close never lands before its piece is created, enters the
//   region, or is linked to the PR. An arc that would is no arc; a day gathers only between them.
// The schedule, the board, seeks and the ruler read the re-timed copy, so playing to x and seeking to x
// still draw the same thing (INV-12, INV-15); the record keeps the real time (`realTimeOf`). An arc's
// events share one focus (`storyFocus`), so the schedule groups them into the merge's beat. Pure.
import { compareEvents, type AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import { typeIndex } from '../engine/moves';
import { resolveRole, resolveSignal } from '../engine/signal';
import { ARC_WORK_HOURS } from './constants';
import { workingHours } from './workHours';

export interface StoryTime {
  /** The bundle with its events re-timed (a copy; the input is never changed). */
  history: ScopeHistory;
  /** Each moved event's real time, by event key. */
  realAt: ReadonlyMap<string, UtcMs>;
  /** The focus an arc's events share (its merge's), by event key: one beat (B-1). */
  focus: ReadonlyMap<string, CanonicalKey>;
}

/** The kinds of a piece's work that story time may move: what it does, never what places it. */
const WORK: ReadonlySet<AnyTimelineEvent['kind']> = new Set(['wi_state_changed', 'wi_assignee_changed', 'wi_title_changed']);

/** No arc spans more than this much calendar time (24 working hours is at most four days, a weekend between). */
const ARC_CALENDAR_MS = 7 * 86_400_000;

const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** The local calendar day of an instant in `tz`, as `2026-09-24`. */
function dayOf(t: UtcMs, tz: string): string {
  let f = dayFormats.get(tz);
  if (!f) dayFormats.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })));
  return f.format(t);
}

const memo = new WeakMap<ScopeHistory, Map<string, StoryTime>>();
const told = new WeakMap<ScopeHistory, StoryTime>();

/** The bundle in story time, memoised per bundle and zone. */
export function storyTime(h: ScopeHistory, tz: string): StoryTime {
  // Already in story time: as it is (retiming twice would move a close past a later merge into an arc).
  const already = told.get(h);
  if (already) return already;
  let byZone = memo.get(h);
  if (!byZone) memo.set(h, (byZone = new Map()));
  const hit = byZone.get(tz);
  if (hit) return hit;
  const st = retime(h, tz);
  byZone.set(tz, st);
  told.set(st.history, st);
  return st;
}

/** The shared focus of a story-timed bundle's arc events (the schedule reads it); none for any other bundle. */
export function storyFocus(h: ScopeHistory): ReadonlyMap<string, CanonicalKey> | undefined {
  return told.get(h)?.focus;
}

/** An event's real time when story time moved it; undefined when it didn't, or the bundle isn't story-timed. */
export function realTimeOf(h: ScopeHistory, eventKey: string): UtcMs | undefined {
  return told.get(h)?.realAt.get(eventKey);
}

function retime(h: ScopeHistory, tz: string): StoryTime {
  const events = h.events as AnyTimelineEvent[];
  const { startUtc, endUtc } = h.range;
  const inRange = (e: AnyTimelineEvent) => e.occurredAt >= startUtc && e.occurredAt < endUtc;
  const types = typeIndex(h);
  const isPiece = (key: CanonicalKey) => {
    const type = types.get(key);
    const role = type === undefined ? null : resolveRole(h.stateMapping, type);
    return role === 'objective' || role === 'threat';
  };

  // A Task's parent over time (its links, else what's known now): its work is its parent's.
  const parents = new Map<CanonicalKey, { at: UtcMs; parent: CanonicalKey | null }[]>();
  for (const e of events) {
    if (e.kind === 'link_parent_added' || e.kind === 'link_parent_removed') {
      const list = parents.get(e.payload.childKey) ?? [];
      list.push({ at: e.occurredAt, parent: e.kind === 'link_parent_added' ? e.payload.parentKey : null });
      parents.set(e.payload.childKey, list);
    }
  }
  const nowParent = new Map<CanonicalKey, CanonicalKey>((h.current?.links ?? []).filter((l) => l.kind === 'parent').map((l) => [l.fromKey, l.toKey]));
  const parentAt = (key: CanonicalKey, t: UtcMs): CanonicalKey | null => {
    const list = parents.get(key);
    if (!list?.length) return nowParent.get(key) ?? null;
    let p: CanonicalKey | null = null;
    for (const x of list) if (x.at <= t) p = x.parent;
    return p ?? (list[0]!.at > t ? nowParent.get(key) ?? null : null);
  };
  const pieceOf = (key: CanonicalKey, t: UtcMs): CanonicalKey | null => {
    if (isPiece(key)) return key;
    const p = parentAt(key, t);
    return p && isPiece(p) ? p : null;
  };

  // What each PR served, ever (links are kept, as `mergedBacking` keeps them).
  const serves = new Map<CanonicalKey, Set<CanonicalKey>>();
  const serve = (pr: CanonicalKey, item: CanonicalKey) => {
    const s = serves.get(pr) ?? new Set<CanonicalKey>();
    s.add(item);
    serves.set(pr, s);
  };
  for (const e of events) if (e.kind === 'link_pr_added') serve(e.payload.prKey, e.payload.itemKey);
  for (const l of h.current?.links ?? []) if (l.kind === 'pr') serve(l.fromKey, l.toKey);

  // What places a work item (its creation, its moves in or out of an area or sprint, its parent and PR
  // links): story time never moves a work event across one of its own item's or its piece's.
  const placed = new Map<CanonicalKey, UtcMs[]>();
  const place = (key: CanonicalKey, t: UtcMs) => placed.set(key, [...(placed.get(key) ?? []), t]);
  for (const e of events) {
    if (e.kind === 'wi_created' || e.kind === 'wi_area_changed' || e.kind === 'wi_iteration_changed') place(e.entityKey, e.occurredAt);
    else if (e.kind === 'link_parent_added' || e.kind === 'link_parent_removed') place(e.payload.childKey, e.occurredAt);
    else if (e.kind === 'link_pr_added' || e.kind === 'link_pr_removed') place(e.payload.itemKey, e.occurredAt);
  }
  /** Whether moving `e` (of `piece`) to `t` would cross one of those: at or past `t` going back, past its own time going on. */
  const crosses = (e: AnyTimelineEvent, piece: CanonicalKey, t: UtcMs) => {
    const lo = Math.min(t, e.occurredAt);
    const hi = Math.max(t, e.occurredAt);
    return [e.entityKey, piece].some((k) => (placed.get(k) ?? []).some((b) => (t < e.occurredAt ? b >= lo && b < hi : b > lo && b <= hi)));
  };

  // Each piece's work events in range, in order.
  const work = new Map<CanonicalKey, AnyTimelineEvent[]>();
  for (const e of events) {
    if (!inRange(e) || !WORK.has(e.kind)) continue;
    const piece = pieceOf(e.entityKey, e.occurredAt);
    if (!piece) continue;
    const list = work.get(piece) ?? [];
    list.push(e);
    work.set(piece, list);
  }

  // Arcs: a close's last merge before it, within ARC_WORK_HOURS working hours, of a PR that served the piece (or one of its Tasks).
  const merges = events.filter((e): e is AnyTimelineEvent & { kind: 'pr_completed' } => e.kind === 'pr_completed' && inRange(e));
  const closes = (e: AnyTimelineEvent, piece: CanonicalKey): boolean => {
    if (e.kind !== 'wi_state_changed' || e.entityKey !== piece) return false;
    const type = types.get(piece) ?? '';
    return resolveSignal(h.stateMapping, type, e.payload.to).rung === 'accomplished' && resolveSignal(h.stateMapping, type, e.payload.from).rung !== 'accomplished';
  };
  const arcOf = (piece: CanonicalKey, close: AnyTimelineEvent): AnyTimelineEvent | null => {
    let best: AnyTimelineEvent | null = null;
    for (const m of merges) {
      // Cheap tests first: before the close, within a week (24 working hours never spans more), serving it.
      if (m.occurredAt > close.occurredAt || close.occurredAt - m.occurredAt > ARC_CALENDAR_MS) continue;
      if (best && compareEvents(m, best) <= 0) continue;
      if (![...(serves.get(m.entityKey) ?? [])].some((k) => pieceOf(k, close.occurredAt) === piece)) continue;
      if (workingHours(m.occurredAt, close.occurredAt, tz) <= ARC_WORK_HOURS) best = m;
    }
    return best;
  };

  const moved = new Map<string, UtcMs>();
  const focus = new Map<string, CanonicalKey>();
  const after = new Map<string, number>(); // per merge: how many have been placed after it
  for (const piece of [...work.keys()].sort()) {
    const list = work.get(piece)!;
    const claimed = new Set<string>();
    // Each close with an arc claims the piece's work from the merge's day to the close's day (up to its next close).
    list.forEach((close, ci) => {
      if (!closes(close, piece) || claimed.has(close.eventKey)) return;
      const merge = arcOf(piece, close);
      if (!merge) return;
      const from = dayOf(merge.occurredAt, tz);
      const to = dayOf(close.occurredAt, tz);
      const next = list.findIndex((e, i) => i > ci && closes(e, piece));
      const span = list.filter((e, i) => !claimed.has(e.eventKey) && (next < 0 || i < next) && dayOf(e.occurredAt, tz) >= from && dayOf(e.occurredAt, tz) <= to);
      if (!span.length) return;
      const arc = `arc:${merge.entityKey}` as CanonicalKey;
      const before = span.filter((e) => e.occurredAt < merge.occurredAt);
      const behind = span.filter((e) => e.occurredAt >= merge.occurredAt);
      const n0 = after.get(merge.eventKey) ?? 0;
      const at = new Map<string, UtcMs>([
        ...before.map((e, i) => [e.eventKey, merge.occurredAt - (before.length - i)] as const),
        ...behind.map((e, i) => [e.eventKey, merge.occurredAt + 1 + n0 + i] as const),
      ]);
      // No arc if any of it would cross what places the piece (created, moved in, linked after the merge).
      if (span.some((e) => crosses(e, piece, at.get(e.eventKey)!))) return;
      focus.set(merge.eventKey, arc);
      for (const e of span) { moved.set(e.eventKey, at.get(e.eventKey)!); focus.set(e.eventKey, arc); }
      after.set(merge.eventKey, n0 + behind.length);
      for (const e of span) claimed.add(e.eventKey);
    });
    // The rest gather by day, at the day's last work event, the earlier ones just ahead of it, in order.
    const days = new Map<string, AnyTimelineEvent[]>();
    for (const e of list) {
      if (claimed.has(e.eventKey)) continue;
      const d = dayOf(e.occurredAt, tz);
      days.set(d, [...(days.get(d) ?? []), e]);
    }
    for (const day of days.values()) {
      // In runs between what places the piece or its items: each run gathers at its own last event.
      const runs: AnyTimelineEvent[][] = [];
      for (const e of day) {
        const run = runs[runs.length - 1];
        const prev = run?.[run.length - 1];
        if (run && prev && !crosses(prev, piece, e.occurredAt) && !crosses(e, piece, prev.occurredAt)) run.push(e);
        else runs.push([e]);
      }
      for (const run of runs) {
        if (run.length < 2) continue;
        const last = run[run.length - 1]!;
        run.slice(0, -1).forEach((e, i, rest) => moved.set(e.eventKey, last.occurredAt - (rest.length - i)));
      }
    }
  }

  // Only real moves count (an event already at its story time keeps no real time).
  const realAt = new Map<string, UtcMs>();
  const retimed = events.map((e) => {
    const t = moved.get(e.eventKey);
    if (t === undefined || t === e.occurredAt) return e;
    realAt.set(e.eventKey, e.occurredAt);
    return { ...e, occurredAt: t } as AnyTimelineEvent;
  });
  if (!realAt.size && !focus.size) return { history: h, realAt, focus };
  retimed.sort(compareEvents);
  return { history: { ...h, events: retimed }, realAt, focus };
}
