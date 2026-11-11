// The director (27 E5, 05 §8.5c P-20..P-23): a pure pass beside limelight that picks every moment's form, once
// over the episode, so the planner, the schedule and a seek read the same choices (INV-12).
// - A merge that closes its work plays the volley; one that doesn't is a progress beam (E3), except that each
//   captain with a merge gets at least one volley: their hero shot (P-20).
// - The same choreography back to back in a day trades down to its short form (P-21).
// - Each working day's biggest moment keeps its full form: the daily climax (P-22).
// - Past the target length, the levers run in order, each only while the estimate is over (P-23): every other
//   moment that has a short form plays it; the routine folds into montage (P-24); the stretches between
//   climaxes play faster, up to `TEMPO_MAX` (P-25); more rules play as light work (P-26); a hero shot goes
//   back to a progress beam, each captain still named once (P-27).
// - Late-day montage (27 E10, step e2): in rising tempo's tight end (B-23) the same eligible repeats fold to
//   montage even under the target, before the levers. It is no lever: `levers` doesn't list it.
// - Merges into one facility close together in x on one day play as one volley (27 E6, M-31, B-21): `volleysOf`
//   groups them over the raw beats, their beats fuse, and the director then runs on the fused beats.
// Abstract the motion, never the names (PA-Q3): a progress beam is always named, so every moment names its
// ADO cause. Deterministic: sorted arrays only, and every Map is built in episode order.
import type { AnyTimelineEvent, Priority } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { ManeuverRule } from '../contracts/maneuver';
import type { Direction, MomentForm, Volley } from '../contracts/playback';
import { ARC_WORK_HOURS, FINAL_HOLD_MS, GAP_MIN_MS } from '../playback/constants';
import { chapterPs, inTightEnd, localDay } from '../playback/schedule';
import { realTimeOf } from '../playback/storyTime';
import { workingHours } from '../playback/workHours';
import { OPENING_ORIENT_MS, momentsOf, turnsOf, type BaseMoment, type SequenceOptions } from './maneuvers';
import { pieceAt, RULE, shortForm, type PaceRule } from './pace';
import type { RoundFacts } from './types';

/**
 * How far apart in x (at 1×, under the director's first pass) a volley's merges may play, from its first (27 E6,
 * 15 §10): the planner's sweep's smallest window at Pulsar's highest count.
 */
export const VOLLEY_WINDOW_MS = 20_000;

/** HG-C's cap: the length an episode should come to at 1×, 5 min (27 Decisions, 2026-11-01; 15 §10). Soft: past it the levers run. */
export const DIRECTOR_TARGET_MS = 300_000;

/** The most the stretches between climaxes are sped (27 E5b, HG-C's "about 2×"; 15 §10). */
export const TEMPO_MAX = 2;
/** The levers, in the order they run (HG-C): short forms, montage the routine, adaptive speed, light work for more rules, fewer hero shots. */
export const LEVERS: readonly string[] = ['short', 'montage', 'speed', 'light', 'fewer-heroes'];
/** The rules light work takes over (27 E5c, P-26): an opening, and the underway, nearing and engage of a piece. */
const LIGHTABLE: ReadonlySet<string> = new Set([RULE.attachmentOpen, RULE.objectiveUnderway, RULE.objectiveNearing, RULE.threatEngage]);

type Prio = (h: ScopeHistory, e: AnyTimelineEvent) => Priority;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** The rules whose moves close a piece (a close is a volley or its short form). */
const CLOSES: ReadonlySet<string> = new Set([RULE.objectiveAccomplish, RULE.threatAccomplish]);

interface Moment extends BaseMoment {
  beat: number;
  day: string;
  /** Where it falls in the episode: beat index, then base start, then turn key. */
  order: number;
  /** The event's time as it really happened (story time moved it, B-12). */
  at: number;
}

/** A moment that gets a form of its own: a protected draft that isn't a close riding its merge (M-23). */
const isMoment = (m: BaseMoment) => m.protect && !m.arcClose;

/**
 * The episode's direction. `beats` are its beats' events in order (the schedule's groups), `tz` the zone its
 * days are read in. `targetMs` is the length the episode should come to at 1×.
 */
export function directorOf(h: ScopeHistory, beats: readonly AnyTimelineEvent[][], f: RoundFacts, rules: readonly ManeuverRule[], prio: Prio, tz: string, seq?: SequenceOptions, targetMs: number = DIRECTOR_TARGET_MS, levers: readonly string[] = LEVERS, volleys?: Volleys, late = true): Direction {
  // The volleys (27 E6): `beats` are then the fused ones. Each carrier is drafted with its members' union, the
  // others `joined`; every Direction below carries them, so the estimates fuse too.
  const joined = new Map<string, MomentForm>();
  for (const v of volleys?.volleys.values() ?? []) for (const k of v.members.slice(1)) joined.set(k, 'joined');
  // The opening's creations (27 E7b, B-22) may fuse with no volley: the fuse is carried then too.
  const carried = volleys?.volleys.size ? { volleys: volleys.volleys, fuse: volleys.fuse } : volleys?.fuse.length ? { fuse: volleys.fuse } : {};
  const base: Direction | undefined = volleys?.volleys.size || volleys?.fuse.length ? { forms: joined, climaxes: new Set(), levers: [], estimateMs: 0, ...carried } : undefined;
  // Every beat's base drafts, in episode order.
  const all: Moment[] = [];
  const heldBeats = new Set<number>(); // beats that hold a moment
  const eventAt = new Map<string, number>();
  beats.forEach((events, beat) => {
    if (!events.length) return;
    for (const e of events) eventAt.set(e.eventKey, realTimeOf(h, e.eventKey) ?? e.occurredAt);
    const day = localDay(events[0]!.occurredAt, tz);
    for (const m of momentsOf(h, events, f, rules, prio, seq, base)) {
      all.push({ ...m, beat, day, order: 0, at: eventAt.get(m.eventKey) ?? 0 });
      if (isMoment(m)) heldBeats.add(beat);
    }
  });
  all.sort((a, b) => a.beat - b.beat || a.startMs - b.startMs || cmp(a.key, b.key));
  all.forEach((m, i) => { m.order = i; });
  const moments = all.filter(isMoment);
  const rule = (id: string) => rules.find((r) => r.id === id) as PaceRule | undefined;
  const hasShort = (m: Moment) => !!(rule(m.rule) && shortForm(rule(m.rule)!, m.variant));

  // a. Closing merges (E5-Q1): the last merge serving a piece before that piece's next close, within the
  // arc window (B-12's own test, read per merge). A merge whose work closes in its beat closes it too.
  const byPiece = new Map<CanonicalKey, Moment[]>();
  for (const m of all) if (CLOSES.has(m.rule) && m.subject) byPiece.set(m.subject, [...(byPiece.get(m.subject) ?? []), m]);
  const merges = moments.filter((m) => m.rule === RULE.attachmentMerge);
  const later = (a: Moment, b: Moment) => a.at - b.at || cmp(a.eventKey, b.eventKey);
  const last = new Map<string, Moment>(); // per (piece, its next close): the last merge before it
  const closeOf = new Map<string, Moment>();
  for (const m of merges) {
    for (const piece of m.targets) {
      const next = (byPiece.get(piece) ?? []).filter((c) => c.at >= m.at).sort(later)[0];
      if (!next) continue;
      const slot = `${piece}|${next.eventKey}`;
      closeOf.set(slot, next);
      const best = last.get(slot);
      if (!best || later(m, best) > 0) last.set(slot, m);
    }
  }
  const closing = new Set<string>();
  for (const [slot, m] of last) {
    if (workingHours(m.at, closeOf.get(slot)!.at, tz) <= ARC_WORK_HOURS) closing.add(m.key);
  }
  for (const m of merges) if (m.arcMerge) closing.add(m.key);

  // b. Every moment starts full; a merge that doesn't close its work, and isn't a facility's first, is a progress
  // beam. A volley never is (27 E6).
  const form = new Map<string, MomentForm>(moments.map((m) => [m.key, 'full']));
  for (const m of merges) if (!closing.has(m.key) && m.variant !== 'first' && !m.volley) form.set(m.key, 'progress');

  // c. The daily climax: the most people, then a close, then the longer full form, then episode order.
  const isClose = (m: Moment) => CLOSES.has(m.rule) || m.arcMerge;
  const climaxes = new Set<string>();
  const days = [...new Set(moments.map((m) => m.day))];
  for (const day of days) {
    const best = moments.filter((m) => m.day === day).sort((a, b) =>
      b.people.length - a.people.length || Number(isClose(b)) - Number(isClose(a)) || b.fullMs - a.fullMs || a.order - b.order)[0]!;
    climaxes.add(best.key);
    form.set(best.key, 'full');
  }

  // d. Hero shots: each merge author left with no volley gets their earliest merge back as a volley. An author
  // in a multi-fire volley (27 E6) has one.
  const heroes: Moment[] = [];
  const inVolley = new Set(merges.flatMap((m) => m.volley?.authors ?? []));
  const authors = [...new Set(merges.flatMap((m) => [...(m.agent ? [m.agent] : []), ...(m.volley?.authors ?? [])]))].sort();
  for (const a of authors) {
    const mine = merges.filter((m) => m.agent === a);
    if (inVolley.has(a) || mine.some((m) => form.get(m.key) !== 'progress')) continue;
    form.set(mine[0]!.key, 'full'); // merges are in episode order
    heroes.push(mine[0]!);
  }

  // e. Monotony: within a day, a full moment that plays the same rule as the one before trades down to its short form.
  const played = (m: Moment) => (form.get(m.key) === 'progress' ? RULE.agentProgress : m.rule);
  for (const day of days) {
    const today = moments.filter((m) => m.day === day);
    today.forEach((m, i) => {
      if (i === 0 || form.get(m.key) !== 'full' || climaxes.has(m.key) || !hasShort(m)) return;
      if (played(today[i - 1]!) === m.rule) form.set(m.key, 'short');
    });
  }

  // f. The target. The estimate bounds the schedule's length from above: its budget is far below the target, so
  // every gap is squeezed to the minimum and every beat that holds no moment (and isn't High) is cut.
  const pulled: string[] = [];
  const climaxBeats = new Set(moments.filter((m) => climaxes.has(m.key)).map((m) => m.beat));
  let tempo: Map<number, number> | undefined;
  const lit = new Set<string>(); // drafts light work takes over (E5c)
  const direction = (): Direction => {
    const forms = new Map<string, MomentForm>();
    for (const m of moments) {
      const v = form.get(m.key);
      if (v && v !== 'full') forms.set(m.key, v);
    }
    for (const k of [...lit].sort()) forms.set(k, 'light');
    for (const [k, v] of joined) forms.set(k, v);
    return { forms, climaxes, levers: pulled, estimateMs: 0, ...(tempo ? { tempo } : {}), ...carried };
  };
  /** The episode's length at 1× in x, and the share that plays at 1× whatever the tempo: the climax beats (with the gap before each) and the orientation. */
  const estimate = (dir: Direction, kept?: number[]) => {
    let ms = OPENING_ORIENT_MS + FINAL_HOLD_MS + GAP_MIN_MS;
    let fixedMs = OPENING_ORIENT_MS;
    beats.forEach((events, beat) => {
      if (!events.length) return;
      if (!heldBeats.has(beat) && !events.some((e) => prio(h, e) === 'high')) return;
      const { durationMs } = turnsOf(h, events, f, rules, prio, seq, dir);
      if (durationMs <= 0) return;
      kept?.push(beat);
      ms += durationMs + GAP_MIN_MS;
      if (climaxBeats.has(beat)) fixedMs += durationMs + GAP_MIN_MS;
    });
    return { ms, fixedMs };
  };
  const wall = (e: { ms: number; fixedMs: number }, k: number) => e.fixedMs + (e.ms - e.fixedMs) / k;
  const kept: number[] = [];
  let est = estimate(direction(), kept);
  let estimateMs = est.ms;
  const over = () => estimateMs > targetMs;
  const rerun = () => { est = estimate(direction()); estimateMs = est.ms; };

  // The eligible repeat (P-24): a non-climax moment that plays the rule of the one before it that day (not a `first`
  // merge, not an arc's merge, not a progress beam, not a volley: a montage names no one) and has a short form.
  const routine = (today: Moment[], i: number) => {
    const m = today[i]!;
    return i > 0 && !climaxes.has(m.key) && form.get(m.key) !== 'progress' && m.variant !== 'first' && !m.arcMerge && !m.volley && hasShort(m) && played(today[i - 1]!) === m.rule;
  };
  // e2. Late-day montage (27 E10, P-24): in rising tempo's tight end (B-23) the routine folds even under the target.
  // p is the schedule's chapter count over the beats it plays (those the estimate keeps). No lever: not in `pulled`.
  if (late) {
    const ps = new Map(chapterPs(kept.map((b) => [beats[b]![0]!.occurredAt, beats[b]!.at(-1)!.occurredAt] as const), tz).map((p, i) => [kept[i]!, p]));
    let folded = false;
    for (const day of days) {
      const today = moments.filter((m) => m.day === day);
      today.forEach((m, i) => {
        if (!routine(today, i) || !inTightEnd(ps.get(m.beat) ?? 0)) return;
        form.set(m.key, 'montage');
        folded = true;
      });
    }
    if (folded) rerun();
  }

  // 1. Short forms: every other moment that has one plays it.
  if (over() && levers.includes('short')) {
    pulled.push('short');
    for (const m of moments) if (form.get(m.key) === 'full' && !climaxes.has(m.key) && hasShort(m)) form.set(m.key, 'short');
    rerun();
  }
  // 2. Montage the routine: a non-climax moment that plays the rule of the one before it that day (not a `first`
  // merge, not an arc's merge, not a progress beam, not a volley: a montage names no one) folds to a plate and a note.
  if (over() && levers.includes('montage')) {
    pulled.push('montage');
    for (const day of days) {
      const today = moments.filter((m) => m.day === day);
      today.forEach((m, i) => { if (routine(today, i)) form.set(m.key, 'montage'); });
    }
    rerun();
  }
  // 3. Adaptive speed: every beat without a climax plays at the least k (a multiple of 0.05, up to `TEMPO_MAX`) that meets the target.
  let k = 1;
  const setTempo = () => {
    k = TEMPO_MAX;
    for (let i = 21; i <= TEMPO_MAX * 20; i++) if (wall(est, i / 20) <= targetMs) { k = i / 20; break; }
    tempo = new Map();
    beats.forEach((events, beat) => { if (events.length && !climaxBeats.has(beat)) tempo!.set(beat, k); });
  };
  if (over() && levers.includes('speed')) {
    pulled.push('speed');
    setTempo();
  }
  // The levers past speed run only while the length at the sped pace is still over; each re-estimates, and k is the least that now meets the target.
  const overSped = () => wall(est, k) > targetMs;
  // 4. Light work for more rules (27 E5c): an opening (but not one placed ahead of a moment), underway, nearing and engage play as light work.
  if (overSped() && levers.includes('light')) {
    const before = lit.size;
    for (const m of all) if (LIGHTABLE.has(m.rule) && !m.protect && !m.ahead) lit.add(m.key);
    if (lit.size > before) { pulled.push('light'); rerun(); if (tempo) setTempo(); }
  }
  // 5. Fewer hero shots: a hero shot goes back to a progress beam. Limelight names everyone's first turn and a beam is always named.
  if (overSped() && levers.includes('fewer-heroes')) {
    const back = heroes.filter((m) => !climaxes.has(m.key) && form.get(m.key) !== 'progress');
    for (const m of back) form.set(m.key, 'progress');
    if (back.length) { pulled.push('fewer-heroes'); rerun(); if (tempo) setTempo(); }
  }
  return { ...direction(), estimateMs: wall(est, k) };
}

// ---- Volleys (27 E6) ----

/** An episode's volleys over its raw beats: the ranges that fuse (05 B-21) and each volley by its carrier's key. */
export interface Volleys { fuse: readonly (readonly [number, number])[]; volleys: ReadonlyMap<string, Volley> }

/** The planner's sweep and the guard's test (27 E6): another window, or the B-15 guard off. The app never sets them. */
export interface VolleyOptions { windowMs?: number; guard?: false; late?: false }

/** A raw beat's base draft as `volleysOf` reads it: where it falls, the pieces it touches, and a merge's x. */
interface Draft0 extends BaseMoment { beat: number; order: number; touches: CanonicalKey[]; x?: number }

/**
 * The volleys (27 E6, 05 §8.4a M-31, B-21) over the raw beats (the schedule's groups before fusion). D0 is the
 * director's pass with no volleys; a merge's x is its beat's start in D0's estimate plus its turn's start there.
 * Per facility, in episode order, a merge joins the open group when its beat and the head's lie on one local day,
 * it plays within `windowMs` of the head's x, and the B-15 guard holds over the range; otherwise it heads a new
 * group. A group of one is dropped, and a group whose range overlaps one taken earlier dissolves. Pure, deterministic.
 */
export function volleysOf(h: ScopeHistory, beats: readonly AnyTimelineEvent[][], f: RoundFacts, rules: readonly ManeuverRule[], prio: Prio, tz: string, seq?: SequenceOptions, targetMs: number = DIRECTOR_TARGET_MS, levers: readonly string[] = LEVERS, opts: VolleyOptions = {}): Volleys {
  const windowMs = opts.windowMs ?? VOLLEY_WINDOW_MS;
  const d0 = directorOf(h, beats, f, rules, prio, tz, seq, targetMs, levers, undefined, opts.late);
  const all: Draft0[] = [];
  let at = OPENING_ORIENT_MS; // where the previous kept beat ends, in x
  beats.forEach((events, beat) => {
    if (!events.length) return;
    const time = new Map(events.map((e) => [e.eventKey, e.occurredAt]));
    const mine: Draft0[] = momentsOf(h, events, f, rules, prio, seq).map((m) => {
      const when = time.get(m.eventKey) ?? events[0]!.occurredAt;
      // What it touches (B-15): its subject and targets, a step standing for its parent then.
      const touches = [...new Set([...(m.subject ? [m.subject] : []), ...m.targets, ...(m.swept ?? [])].map((k) => pieceAt(f, k, when)))].sort();
      return { ...m, beat, order: 0, touches };
    });
    all.push(...mine);
    // Kept as the director's estimate keeps it: it holds a moment or a High event, and has a length.
    if (!mine.some(isMoment) && !events.some((e) => prio(h, e) === 'high')) return;
    const { turns, durationMs } = turnsOf(h, events, f, rules, prio, seq, d0);
    if (durationMs <= 0) return;
    const start = at + GAP_MIN_MS;
    const startOf = new Map(turns.map((t) => [t.key, t.startMs]));
    for (const m of mine) {
      if (m.rule !== RULE.attachmentMerge) continue;
      // Under D0 a merge may play as a progress beam: its turn is then the beam's.
      const t = startOf.get(m.key) ?? startOf.get(`${m.eventKey}|${RULE.agentProgress}`);
      if (t !== undefined) m.x = start + t;
    }
    at = start + durationMs;
  });
  all.sort((a, b) => a.beat - b.beat || a.startMs - b.startMs || cmp(a.key, b.key));
  all.forEach((m, i) => { m.order = i; });
  /** A raw beat's local day, when its first and last events share one (no day turn inside it). */
  const dayOf = (beat: number) => {
    const es = beats[beat]!;
    const a = localDay(es[0]!.occurredAt, tz);
    return a === localDay(es.at(-1)!.occurredAt, tz) ? a : undefined;
  };

  /**
   * B-15 over `members` (episode order). In a fused beat the sequencer plays merges first and moments before the
   * rest, so the other drafts in the range touching any key must lie in one raw beat, at or after the latest
   * member beat touching it.
   */
  const guard = (members: readonly Draft0[]) => {
    const from = members[0]!.beat;
    const to = members.at(-1)!.beat;
    const ids = new Set(members.map((m) => m.key));
    const others = new Map<CanonicalKey, Set<number>>();
    for (const m of all) {
      if (m.beat < from || m.beat > to || ids.has(m.key)) continue;
      for (const k of m.touches) others.set(k, (others.get(k) ?? new Set<number>()).add(m.beat));
    }
    for (const [k, bs] of others) {
      if (bs.size > 1) return false;
      const latest = Math.max(-1, ...members.filter((m) => m.touches.includes(k)).map((m) => m.beat));
      if ([...bs][0]! < latest) return false;
    }
    return true;
  };

  // Candidates: every merge moment, `first` and D0's progress beams too, so everyone becomes a hero.
  const groups: Draft0[][] = [];
  const open = new Map<CanonicalKey, Draft0[]>();
  for (const m of all) {
    if (m.rule !== RULE.attachmentMerge || !isMoment(m) || !m.facility || m.x === undefined) continue;
    const g = open.get(m.facility);
    const head = g?.[0];
    const day = dayOf(m.beat);
    if (g && head && day !== undefined && day === dayOf(head.beat) && m.x - head.x! <= windowMs && (opts.guard === false || guard([...g, m]))) g.push(m);
    else {
      const fresh = [m];
      open.set(m.facility, fresh);
      groups.push(fresh);
    }
  }
  const taken: Draft0[][] = [];
  for (const g of groups.filter((x) => x.length > 1).sort((a, b) => a[0]!.order - b[0]!.order)) {
    const lo = g[0]!.beat;
    const hi = g.at(-1)!.beat;
    if (taken.some((t) => lo <= t.at(-1)!.beat && t[0]!.beat <= hi)) continue;
    taken.push(g);
  }
  const fuse: [number, number][] = [];
  const volleys = new Map<string, Volley>();
  for (const g of taken.sort((a, b) => a[0]!.order - b[0]!.order)) {
    // The lead (E6-Q1): the most member merges, then the latest last member merge.
    const count = new Map<CanonicalKey, { n: number; last: number }>();
    for (const m of g) if (m.agent) count.set(m.agent, { n: (count.get(m.agent)?.n ?? 0) + 1, last: m.order });
    const lead = [...count].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0]?.[0];
    if (!lead) continue;
    volleys.set(g[0]!.key, { members: g.map((m) => m.key), lead, atMs: g.map((m) => m.x!) });
    if (g.at(-1)!.beat > g[0]!.beat) fuse.push([g[0]!.beat, g.at(-1)!.beat]);
  }
  return { fuse, volleys };
}
