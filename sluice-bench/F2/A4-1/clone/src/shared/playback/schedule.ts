// 05 §3 — the beat schedule: groups a range's events into beats and lays them out in presentation
// time, compressing nights, weekends, and quiet stretches. Pure and deterministic (golden-tested).
import { storyFocus } from './storyTime';
import { PRIORITY_RANK, type AnyTimelineEvent, type Priority } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Beat, BeatSchedule, GuestPresence, Limelight } from '../contracts/playback';
import type { Snapshot } from '../contracts/view';
import { snapshotAt } from '../replay/snapshotAt';
import { entityKind } from './accents';
import { protectBeat } from './protect';
import { BACKLOG } from '../hierarchy/backlog';
import { DESKTOP } from '../profile/bundled';
import type { Hierarchy } from '../hierarchy/types';
import {
  FINAL_HOLD_MS, GAP_BASE_MS, GAP_LOG_MS, GAP_MAX_MS, GAP_MIN_MS, GROUP_BURST_MS, GROUP_WINDOW_MS,
  OFF_HOURS_WEIGHT, ORIENT_MS, DAY_TURN_MS, RISING_FIRST_DAY, RISING_FLOOR_MS, RISING_LAST_DAY, RISING_TIGHT_SHARE,
} from './constants';
import { isWorkingQuarter, QUARTER_MS } from './workHours';

// ---- Local working hours ----

const weights = new Map<string, number>();

/** 1.0 on weekdays 07:00–19:00 local, else OFF_HOURS_WEIGHT, for the quarter-hour starting at t. */
function quarterWeight(t: UtcMs, tz: string): number {
  const key = `${tz}|${t}`;
  let w = weights.get(key);
  if (w !== undefined) return w;
  w = isWorkingQuarter(t, tz) ? 1 : OFF_HOURS_WEIGHT;
  weights.set(key, w);
  return w;
}

/** Weighted hours between two instants (05 §3 step 5). */
export function weightedHours(a: UtcMs, b: UtcMs, tz: string): number {
  if (b <= a) return 0;
  let total = 0;
  let t = a;
  while (t < b) {
    const q = Math.floor(t / QUARTER_MS) * QUARTER_MS;
    const next = Math.min(q + QUARTER_MS, b);
    total += (next - t) * quarterWeight(q, tz);
    t = next;
  }
  return total / 3_600_000;
}

export const gapMs = (wHours: number, max: number = GAP_MAX_MS) => Math.min(max, Math.max(GAP_MIN_MS, GAP_BASE_MS + GAP_LOG_MS * Math.log2(1 + wHours)));

// ---- Focus (05 §3 step 2) ----

/** When each PR link was (last) added before `endUtc`, for ordering a PR's links by link time. */
export function prLinkTimesOf(h: ScopeHistory, endUtc: UtcMs): Map<string, UtcMs> {
  const prLinkTimes = new Map<string, UtcMs>();
  for (const e of h.events) {
    if (e.occurredAt >= endUtc) break;
    if (e.kind === 'link_pr_added') prLinkTimes.set(`${e.payload.prKey}|${e.payload.itemKey}`, e.occurredAt);
  }
  return prLinkTimes;
}

/** The v0 focus: a PR's first linked item's close-up, a Task's parent, else the entity itself. */
export function focusOf(h: ScopeHistory, e: AnyTimelineEvent, snap: Snapshot, prLinkTimes: Map<string, UtcMs>, hier: Hierarchy): CanonicalKey {
  const bodyOf = (key: CanonicalKey): CanonicalKey | null => hier.focusOf(snap, key, h);
  if (e.kind.startsWith('pr_') || e.kind.startsWith('link_pr_')) {
    const prKey = e.kind.startsWith('pr_') ? e.entityKey : (e.payload as { prKey: CanonicalKey }).prKey;
    const items = snap.links
      .filter((l) => l.kind === 'pr' && l.fromKey === prKey)
      .map((l) => ({ item: l.toKey, at: prLinkTimes.get(`${prKey}|${l.toKey}`) ?? 0 }))
      .sort((a, b) => a.at - b.at || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
    for (const { item } of items) {
      const body = bodyOf(item);
      if (body) return body;
    }
    return prKey;
  }
  const wi = snap.workItems.get(e.entityKey);
  if (wi?.kind === 'task') return wi.parentKey ?? e.entityKey;
  return e.entityKey;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** The local calendar day of an instant in `tz`, as `2026-09-24`. */
export function localDay(t: UtcMs, tz: string): string {
  let f = dayFormats.get(tz);
  if (!f) dayFormats.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })));
  return f.format(t);
}

/** A limelight's spotlights moved onto the beats that open each day: the last one chosen since the previous played beat. */
function spotlightsOnTurns(ll: Limelight, beats: readonly Beat[]): Limelight {
  const spotlights = new Map<number, CanonicalKey>();
  let pending: CanonicalKey | null = null;
  for (const b of beats) {
    const pick = ll.spotlights.get(b.index);
    if (pick) pending = pick;
    if (b.durationMs <= 0) continue;
    if (b.opensDay && pending) spotlights.set(b.index, pending);
    pending = null;
  }
  return { ...ll, spotlights };
}

/**
 * Volleys' fusion (27 E6, 05 §8.3b B-21): each inclusive range `[first, last]` of `groups` (sorted, disjoint)
 * becomes one group, its members concatenated in order; the rest stay as they are. No event moves in time.
 */
export function fuseRanges<T>(groups: readonly (readonly T[])[], ranges: readonly (readonly [number, number])[] = []): T[][] {
  const out: T[][] = [];
  let r = 0;
  for (let i = 0; i < groups.length; i++) {
    const range = ranges[r];
    if (range && i === range[0]) {
      out.push(groups.slice(range[0], range[1] + 1).flat() as T[]);
      i = range[1];
      r++;
    } else out.push([...groups[i]!]);
  }
  return out;
}

// ---- Layout ----

interface Seg { x0: number; x1: number; s0: UtcMs; s1: UtcMs }

/** Rising tempo (27 E8, 05 B-23): the share of itself a gap or day turn keeps at p, 0 on the first day to 1 on the last. */
export const risingShare = (p: number): number => RISING_FIRST_DAY + (RISING_LAST_DAY - RISING_FIRST_DAY) * p;
/** A gap or day turn of `ms` at p under rising tempo: its share, never below `RISING_FLOOR_MS` nor above `capMs`. */
export const risingMs = (ms: number, p: number, capMs: number): number => Math.min(capMs, Math.max(RISING_FLOOR_MS, ms * risingShare(p)));

/**
 * Each played beat's p (27 E10, B-23): the share of the episode's day turns at or before it, for beats given as
 * [first event, last event] spans in play order. A beat opens a day when its first event is on another local day
 * than the previous span's last, as `layout` tests it. Every p is 0 when the episode has no day turn.
 */
export function chapterPs(spans: readonly (readonly [UtcMs, UtcMs])[], tz: string): number[] {
  const opens = spans.map((s, i) => i > 0 && localDay(s[0], tz) !== localDay(spans[i - 1]![1], tz));
  const total = opens.filter(Boolean).length;
  let so = 0;
  return opens.map((o) => { if (o) so++; return total ? so / total : 0; });
}
/** Whether p lies in rising tempo's tight end (27 E10): `risingShare(p)` at most `RISING_TIGHT_SHARE`. The 1e-9 absorbs `risingShare(2/3)` being 0.7000000000000001. */
export const inTightEnd = (p: number): boolean => risingShare(p) <= RISING_TIGHT_SHARE + 1e-9;

/**
 * `squeeze` (0..1) compresses every gap toward GAP_MIN_MS: 1 = natural gaps, 0 = all at the minimum.
 * `rising` (27 E8, B-23): each gap and day turn then keeps `risingMs` of itself, p the share of the episode's
 * day turns at or before it (the tail gap's is 1); `dense` makes every day turn `RISING_FLOOR_MS`.
 */
function layout(beats: Beat[], range: { startUtc: UtcMs; endUtc: UtcMs }, tz: string, squeeze = 1, orient = ORIENT_MS, gapMax: number = GAP_MAX_MS, dayTurns = false, rising?: { dense: boolean }): { segs: Seg[]; totalMs: number } {
  const segs: Seg[] = [{ x0: 0, x1: orient, s0: range.startUtc, s1: range.startUtc }];
  let x = orient;
  let prev = range.startUtc;
  const gap = (a: UtcMs, b: UtcMs) => GAP_MIN_MS + (gapMs(weightedHours(a, b, tz), gapMax) - GAP_MIN_MS) * squeeze;
  // A new working day is a day turn (22 C5, B-17): a chapter break, the night and weekend folded in.
  const turn = GAP_MIN_MS + (DAY_TURN_MS - GAP_MIN_MS) * squeeze;
  // First pass: which beats open a day, and how many do (T).
  let played: Beat | null = null;
  let dayTurnCount = 0;
  for (const b of beats) {
    delete b.opensDay;
    if (b.durationMs <= 0) continue;
    // Against the last beat that plays, so a day whose first beats are silent or cut still opens with
    // its turn (22 C9 review); a silent beat never opens one.
    if (dayTurns && played && localDay(b.firstUtc, tz) !== localDay(played.sourceUtc, tz)) {
      b.opensDay = true;
      dayTurnCount++;
    }
    played = b;
  }
  // Rising tempo only with day turns to count: one day (T = 0) keeps its gaps.
  const rise = rising && dayTurnCount > 0 ? rising : undefined;
  let turnsSoFar = 0;
  for (const b of beats) {
    if (b.durationMs <= 0) continue;
    if (b.opensDay) turnsSoFar++;
    let g = b.opensDay ? turn : gap(prev, b.firstUtc);
    if (rise) {
      const p = turnsSoFar / dayTurnCount;
      g = b.opensDay ? (rise.dense ? RISING_FLOOR_MS : risingMs(g, p, DAY_TURN_MS)) : risingMs(g, p, gapMax);
    }
    segs.push({ x0: x, x1: x + g, s0: prev, s1: b.firstUtc });
    x += g;
    b.presentationStartMs = x;
    segs.push({ x0: x, x1: x + b.durationMs, s0: b.sourceUtc, s1: b.sourceUtc });
    x += b.durationMs;
    prev = b.sourceUtc;
  }
  const last = range.endUtc - 1;
  const g = rise ? risingMs(gap(prev, range.endUtc), 1, gapMax) : gap(prev, range.endUtc);
  segs.push({ x0: x, x1: x + g, s0: prev, s1: last });
  x += g;
  segs.push({ x0: x, x1: x + FINAL_HOLD_MS, s0: last, s1: last });
  x += FINAL_HOLD_MS;
  // Silent beats sit at their interpolated position inside the surrounding gap.
  for (const b of beats) if (b.durationMs <= 0) b.presentationStartMs = firstX(segs, b.sourceUtc, x);
  return { segs, totalMs: x };
}

function firstX(segs: Seg[], t: UtcMs, total: number): number {
  for (const s of segs) {
    if (s.s1 < t) continue;
    if (s.s0 >= t || s.s1 === s.s0) return s.x0;
    return s.x0 + ((t - s.s0) / (s.s1 - s.s0)) * (s.x1 - s.x0);
  }
  return total;
}

function sourceAt(segs: Seg[], x: number): UtcMs {
  const first = segs[0]!;
  if (x <= first.x0) return first.s0;
  for (const s of segs) {
    if (x < s.x1) return s.x1 === s.x0 ? s.s1 : Math.round(s.s0 + ((x - s.x0) / (s.x1 - s.x0)) * (s.s1 - s.s0));
  }
  return segs[segs.length - 1]!.s1;
}

// ---- Tempo (27 E5b, 05 §8.5c P-25) ----

interface TempoRun { x0: number; x1: number; k: number }

/**
 * Adaptive speed: a played beat's factor runs from its start to the next played beat's start (the last, to the
 * end); the orientation and the gap before the first beat play at 1×. x, the ruler and every seek are untouched:
 * only the wall time x takes changes.
 */
function tempoOf(beats: readonly Beat[], tempo: ReadonlyMap<number, number> | undefined, totalMs: number): Pick<BeatSchedule, 'wallMs' | 'tempoAt' | 'wallAt'> {
  const played = beats.filter((b) => b.durationMs > 0).sort((a, b) => a.presentationStartMs - b.presentationStartMs);
  const runs: TempoRun[] = tempo?.size ? played.map((b, i) => ({ x0: b.presentationStartMs, x1: played[i + 1]?.presentationStartMs ?? totalMs, k: tempo.get(b.index) ?? 1 })) : [];
  const head = runs[0]?.x0 ?? totalMs;
  const tempoAt = (x: number) => {
    let k = 1;
    for (const r of runs) {
      if (r.x0 > x) break;
      k = r.k;
    }
    return k;
  };
  const wallAt = (x: number) => runs.reduce((w, r) => (x > r.x0 ? w + (Math.min(x, r.x1) - r.x0) / r.k : w), Math.min(x, runs.length ? head : x));
  return { tempoAt, wallAt, wallMs: wallAt(totalMs) };
}

// ---- Build ----

const maxPriority = (ps: Priority[]): Priority => ps.reduce((a, b) => (PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a), 'low');

export interface ScheduleOptions {
  /** Highlights (05 §3): beats from only these events. State still comes from the full snapshot. */
  include?: (e: AnyTimelineEvent) => boolean;
  /** Presentation budget at 1× (default: the desktop profile's pacing.budgetMs). */
  budgetMs?: number;
  /** The hierarchy whose close-ups group beats (default Backlog: a Story or Bug). */
  hier?: Hierarchy;
  // v1 hooks (14 §2.6). Each is optional; with all three unset the v0 path runs unchanged, so the
  // schedule goldens stay byte-identical. A chain supplies them through `Hierarchy.pacing`.
  /** An event's priority (default: the ingest-baked `e.priority`). */
  priorityOf?(h: ScopeHistory, e: AnyTimelineEvent): Priority;
  /** The key that groups an event into a beat (default: the v0 focus, step 2). */
  focusOf?(h: ScopeHistory, e: AnyTimelineEvent, s: Snapshot): CanonicalKey;
  /** A beat's length and each event's start in it (default: `v0BeatShape`); `limelight` is the episode's, if decided. */
  beatShape?(h: ScopeHistory, events: AnyTimelineEvent[], limelight?: Limelight): BeatShape;
  /**
   * Who is named across the episode (22 C6), decided once from its beats' events in order, before any
   * beat is shaped; the schedule carries it. Unset: no one is singled out (every turn as before).
   */
  limelight?(h: ScopeHistory, beats: readonly AnyTimelineEvent[][], tz: string): Limelight;
  /** When each guest is in the region (22 C8), planned once over the laid-out beats; the schedule carries it. */
  guests?(h: ScopeHistory, beats: readonly Beat[]): GuestPresence;
  /** Whether consecutive beats fall on different working days, so the later opens with a day turn (default: never). */
  dayTurns?: boolean;
  /**
   * Rising tempo (27 E8, 05 B-23): each gap and day turn keeps `risingMs` of itself, from a little wider on the
   * first day to half on the last, floored at `RISING_FLOOR_MS`; over the director's target (a lever pulled) every
   * day turn is the floor. Needs `dayTurns`. Unset: the v0 path, unchanged. Solar's pacing sets it.
   */
  risingTempo?: boolean;
  /** The longest gap at 1× (default `GAP_MAX_MS`; a solar region's is `PULSE_GAP_MAX_MS`, 22 C5). */
  gapMaxMs?: number;
  /**
   * The orientation before the first beat, in ms (default ORIENT_MS). A solar region takes longer
   * (2026-10-13): the opening, where what's already there makes its entrance, plays in it.
   */
  orientMs?: number;
}

/** How a beat's events lay out inside it: each one's start (only non-zero ones), and the whole. */
export interface BeatShape {
  afterMs: Map<string, number>; durationMs: number;
  /** It plays an essential moment (a close, a merge, a milestone): over budget it's never cut, as a High beat isn't (2026-10-13). */
  essential?: boolean;
}

/**
 * The v0 beat shape (step 4): its accents' longest, with protected moments played first (05 §5): an
 * accent that would move a moment's cast starts after it, so the beat holds both. A wave of two or
 * more grouped Tasks gets the group burst.
 */
export function v0BeatShape(h: ScopeHistory, events: AnyTimelineEvent[]): BeatShape {
  const shape = protectBeat(h, events);
  const taskGroup = events.filter((e) => e.priority === 'mediumGroup' && entityKind(h, e) === 'task').length;
  return taskGroup >= 2 ? { afterMs: shape.afterMs, durationMs: Math.max(shape.durationMs, GROUP_BURST_MS) } : shape;
}

export function buildBeatSchedule(h: ScopeHistory, range: { startUtc: UtcMs; endUtc: UtcMs }, tz: string, opts: ScheduleOptions = {}): BeatSchedule {
  const budget = opts.budgetMs ?? DESKTOP.pacing.budgetMs;
  const events = h.events.filter((e) => e.occurredAt >= range.startUtc && e.occurredAt < range.endUtc && (!opts.include || opts.include(e)));
  const prLinkTimes = prLinkTimesOf(h, range.endUtc);
  const snaps = new Map<UtcMs, Snapshot>();
  const snapAt = (t: UtcMs) => {
    let s = snaps.get(t);
    if (!s) {
      s = snapshotAt(h, t, 'knownThen');
      snaps.set(t, s);
    }
    return s;
  };

  // Step 3: grouping. Only the current beat can absorb an event.
  interface Draft { events: AnyTimelineEvent[]; foci: Set<CanonicalKey>; firstUtc: UtcMs; lastUtc: UtcMs }
  const drafts: Draft[] = [];
  // A story-timed bundle's arc shares its merge's focus (05 §8 B-12), so the merge and the close it led
  // to group into one beat; any other bundle has none.
  const told = storyFocus(h);
  for (const e of events) {
    const focus = told?.get(e.eventKey) ?? (opts.focusOf ? opts.focusOf(h, e, snapAt(e.occurredAt)) : focusOf(h, e, snapAt(e.occurredAt), prLinkTimes, opts.hier ?? BACKLOG));
    const cur = drafts[drafts.length - 1];
    if (cur && (e.occurredAt === cur.lastUtc || (cur.foci.has(focus) && e.occurredAt - cur.firstUtc <= GROUP_WINDOW_MS))) {
      cur.events.push(e);
      cur.foci.add(focus);
      cur.lastUtc = e.occurredAt;
    } else {
      drafts.push({ events: [e], foci: new Set([focus]), firstUtc: e.occurredAt, lastUtc: e.occurredAt });
    }
  }

  // Who is named (22 C6), once, over every beat's events in order.
  const limelight = opts.limelight?.(h, drafts.map((d) => d.events), tz);
  // A volley's raw beats fuse into one (27 E6, B-21), as the director and limelight read them: events
  // concatenated, foci unioned, the first's start and the last's end. Beat indices from here are the fused ones.
  const fuse = limelight?.direction?.fuse;
  if (fuse?.length) {
    const fused = fuseRanges(drafts.map((d) => [d]), fuse).map((ds): Draft => ({
      events: ds.flatMap((d) => d.events), foci: new Set(ds.flatMap((d) => [...d.foci])), firstUtc: ds[0]!.firstUtc, lastUtc: ds.at(-1)!.lastUtc,
    }));
    drafts.splice(0, drafts.length, ...fused);
  }

  // Step 4: priority and duration.
  const kept = new Set<number>();
  const shape = (events: AnyTimelineEvent[]) => (opts.beatShape ? opts.beatShape(h, events, limelight) : v0BeatShape(h, events));
  const beats: Beat[] = drafts.map((d, index) => {
    const priority = maxPriority(d.events.map((e) => (opts.priorityOf ? opts.priorityOf(h, e) : e.priority)));
    const { durationMs, essential } = shape(d.events);
    if (essential) kept.add(index);
    const accented = priority !== 'low' && durationMs > 0;
    return {
      index, sourceUtc: d.lastUtc, firstUtc: d.firstUtc, eventKeys: d.events.map((e) => e.eventKey), priority,
      presentationStartMs: 0, durationMs: accented ? durationMs : 0, accented,
    };
  });

  // Steps 5–7: lay out. Over budget, first compress the gaps (never below GAP_MIN_MS), and only then
  // cut accents from the lowest-priority beats; High beats are never cut, nor one with an essential
  // moment (a Bug's close is Medium, but its strike run is the moment the chart exists to show).
  const orient = opts.orientMs ?? ORIENT_MS;
  // Rising tempo (27 E8, B-23): dense when the director pulled any lever, i.e. the episode is over its target (P10).
  const rising = opts.risingTempo ? { dense: (limelight?.direction?.levers.length ?? 0) > 0 } : undefined;
  const fit = () => {
    let o = layout(beats, range, tz, 1, orient, opts.gapMaxMs, !!opts.dayTurns, rising);
    if (o.totalMs <= budget) return o;
    const tight = layout(beats, range, tz, 0, orient, opts.gapMaxMs, !!opts.dayTurns, rising);
    if (tight.totalMs > budget) return tight;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (layout(beats, range, tz, mid, orient, opts.gapMaxMs, !!opts.dayTurns, rising).totalMs <= budget) lo = mid;
      else hi = mid;
    }
    o = layout(beats, range, tz, lo, orient, opts.gapMaxMs, !!opts.dayTurns, rising);
    return o;
  };
  let out = fit();
  while (out.totalMs > budget) {
    const cut = beats
      .filter((b) => b.accented && b.priority !== 'high' && !kept.has(b.index))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.index - a.index)[0];
    if (!cut) break;
    cut.accented = false;
    cut.durationMs = 0;
    out = fit();
  }

  const { segs, totalMs } = out;
  const guests = opts.guests?.(h, beats);
  // Each day's spotlight on the beat that opens it (22 C9 review): limelight chose it at the day's first
  // draft, which may be silent or cut; it moves to the first beat that plays that day.
  const ll = limelight && opts.dayTurns ? spotlightsOnTurns(limelight, beats) : limelight;
  return {
    beats,
    totalMs,
    ...tempoOf(beats, ll?.direction?.tempo, totalMs),
    ...(ll ? { limelight: ll } : {}),
    ...(guests ? { guests } : {}),
    toSource: (x) => sourceAt(segs, x),
    toPresentation: (t) => firstX(segs, t, totalMs),
    stateUtc: (x) => {
      let at = range.startUtc - 1;
      for (const b of beats) {
        if (b.presentationStartMs > x) break;
        at = b.sourceUtc;
      }
      return at;
    },
  };
}
