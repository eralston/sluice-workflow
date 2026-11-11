// 14 §2.7, 13 §6 — the engine's maneuver rules: which move starts a maneuver, who is in it, its
// phases and their lengths at 1×, and whether it's a protected moment. Rule ids are engine names
// (`objective.accomplish`); the theme names the choreography each one plays and decides what each
// phase draws. This file is the one place to retime, recast or re-trigger a maneuver. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Cast, CastRole, ManeuverRule, Phase, PhaseSpan } from '../contracts/maneuver';
import { memberAt, seatAtTime, servesAt, signalAtTime } from './facts';
import type { AttachmentFacts, Move, PieceFacts, RoundFacts, Signal } from './types';

// ---- Rule ids ----

/**
 * A close's glide (22 C3, M-22): the theme's initiating effect hides the piece's swap to its done
 * form, then it glides this long to its platform; the grand blossom opens as it settles.
 */
export const CLOSE_SLIDE_MS = 1200;

export const RULE = {
  pieceAppear: 'piece.appear',
  threatEmerge: 'threat.emerge',
  objectiveUnderway: 'objective.underway',
  objectiveNearing: 'objective.nearing',
  objectiveAccomplish: 'objective.accomplish',
  threatEngage: 'threat.engage',
  threatAccomplish: 'threat.accomplish',
  pieceOff: 'piece.off',
  pieceReseat: 'piece.reseat',
  facilityEnter: 'facility.enter',
  attachmentOpen: 'attachment.open',
  attachmentSettle: 'attachment.settle',
  attachmentMerge: 'attachment.merge',
  seatComplete: 'seat.complete',
  regionClear: 'region.clear',
  agentLight: 'agent.light',
  agentProgress: 'agent.progress',
  regionSweep: 'region.sweep',
} as const;
export type RuleId = (typeof RULE)[keyof typeof RULE];

/**
 * A rule with the engine's extras. `ManeuverRule` is the contract the renderer sees; the planner also
 * reads these optional fields, so a rule written against the bare contract still plays.
 */
export interface PaceRule extends ManeuverRule {
  /**
   * A further test, with the event (2026-10-13): a milestone matches a move only at the instant it
   * completes something (a seat's last open piece, a region's last threat), which needs the time.
   */
  when?(mv: Move, e: AnyTimelineEvent, f: RoundFacts): boolean;
  /** Protected only for some moves (a settle is protected when it lands, not when it's dropped). */
  protectWhen?(mv: Move, f: RoundFacts): boolean;
  /** Rule ids of the same event this rule starts after (an attachment opens once its facility is in). */
  waitsFor?: readonly string[];
  /**
   * It brings its subject into the scene (a facility's jump-in, an attachment's opening): in a beat it
   * goes ahead of any protected moment that casts its subject, so a merge plays at a facility that has
   * arrived, with its tender out (2026-10-13; it had played first, at a facility not there yet).
   */
  introduces?: boolean;
  /**
   * A light rule (`agent.light`) plays only where nothing else does: an agent at work on a change
   * that no other rule plays. It costs the schedule no time.
   */
  light?: boolean;
  /**
   * A second shape for some moves: its name (the plan's `variant`) and its phases, which replace the
   * rule's own. A facility's first merge runs longer than a later one; a close its facilities beam runs
   * longer than one they don't. `holds` names cast roles the variant has to itself while it plays:
   * nothing else in the beat that casts them starts until it ends (a transforming facility hosts no
   * other moment, so no other moment lands its new form first; 2026-10-13).
   */
  variant?(mv: Move, e: AnyTimelineEvent, f: RoundFacts): { name: string; phases: readonly PhaseSpan[]; holds?: readonly CastRole[] } | null;
  /**
   * In a beat, this moment goes ahead of any other it shares a cast member with (a merge before the
   * close of the work it served, which a pack often writes in the same instant, in either order).
   */
  leads?: boolean;
  /**
   * `false`: no captain flies it, so it holds no turn (22 C7, 05 §8 P-16): the planner doesn't stretch
   * it for a crew's hold or keep the crew busy, and no one is named (an abandoned PR's settle, G-7).
   */
  turn?: false;
  /**
   * Short forms for the director (27 E5) to choose (27 E4d, P7): the phases of a shorter play of this
   * rule, keyed by the form it shortens, `plain` or a variant's name. The planner never picks one:
   * `shortForm` reads it.
   */
  short?: Readonly<Record<string, readonly PhaseSpan[]>>;
  /**
   * A pass (27 F2, 05 §8 M-13): its captain flies through the spot without stopping. The ship is released as
   * its gather ends (the act's start, its blip), holds no turn there and never waits parked (P4); its plate
   * rides with the ship from the blip, whole for `NOTE_MIN_MS` (`crewTimes(phases, true)`).
   */
  pass?: true;
}

// ---- Phases ----

/** Phases played one after another, from 0. */
export function phases(...spans: readonly [Phase, number][]): readonly PhaseSpan[] {
  let atMs = 0;
  return Object.freeze(spans.map(([phase, durMs]) => {
    const span = Object.freeze({ phase, atMs, durMs });
    atMs += durMs;
    return span;
  }));
}

/** A short form plays at this share of its form's phase lengths (27 E4d, 15 §10). */
export const SHORT_PACE = 0.6;

/** A form's phases at `SHORT_PACE`, each rounded to the ms; the phases in `keep` stay as they are. */
export function shortOf(ps: readonly PhaseSpan[], keep: readonly Phase[] = []): readonly PhaseSpan[] {
  return phases(...ps.map((s) => [s.phase, keep.includes(s.phase) ? s.durMs : Math.round(s.durMs * SHORT_PACE)] as [Phase, number]));
}

/**
 * A rule's short form for the form it shortens (`variant`, or the plain rule): its name (`short`, or
 * `<variant>-short`) and phases; null where it has none (a facility's `first` merge, which the
 * transformation floors).
 */
export function shortForm(rule: PaceRule, variant?: string): { name: string; phases: readonly PhaseSpan[] } | null {
  const ps = rule.short?.[variant ?? 'plain'];
  return ps ? { name: variant ? `${variant}-short` : 'short', phases: ps } : null;
}

/**
 * The sector sweep (27 E7, 05 §8 M-32, 15 §10): a beat's creations play as one sweep from the star. The ring
 * passes a piece every `SWEEP_STEP_MS`, over `SWEEP_SPREAD_MAX_MS` at most (the opening's own rhythm), and
 * each piece's quiet entrance takes `SWEEP_ENTER_MS`.
 */
export const SWEEP_STEP_MS = 110;
export const SWEEP_SPREAD_MAX_MS = 2000;
export const SWEEP_ENTER_MS = 1000;

/** The sweep's phases for `n` creations: a tell, the act (the spread plus the last entrance), an echo. */
export function sweepPhases(n: number): readonly PhaseSpan[] {
  return phases(['tell', 300], ['act', Math.min(SWEEP_SPREAD_MAX_MS, n * SWEEP_STEP_MS) + SWEEP_ENTER_MS], ['echo', 400]);
}

/** A maneuver's whole length: where its last phase ends. */
export function spanMs(ps: readonly PhaseSpan[]): number {
  return ps.reduce((m, p) => Math.max(m, p.atMs + p.durMs), 0);
}

// ---- Fact lookups (memoised per facts object) ----

const linkIndex = new WeakMap<RoundFacts, Map<CanonicalKey, AttachmentFacts[]>>();

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The attachments linked to a piece, by key. */
export function attachmentsOf(f: RoundFacts, piece: CanonicalKey): AttachmentFacts[] {
  let idx = linkIndex.get(f);
  if (!idx) {
    idx = new Map();
    for (const key of [...f.attachments.keys()].sort(byKey)) {
      const a = f.attachments.get(key)!;
      for (const link of a.links) {
        const list = idx.get(link) ?? [];
        list.push(a);
        idx.set(link, list);
      }
    }
    linkIndex.set(f, idx);
  }
  return idx.get(piece) ?? [];
}

/** The attachment and facility a move is about (opened, settled, linked), in `f`; null for any other move. */
export function attachmentMove(mv: Move, f: RoundFacts): { key: CanonicalKey; facility: CanonicalKey } | null {
  if (mv.m === 'attach' || mv.m === 'settle') return { key: mv.key, facility: mv.facility };
  if ((mv.m === 'bind' || mv.m === 'unbind') && mv.rel === 'attachment') {
    const facility = f.attachments.get(mv.child)?.facility;
    return facility ? { key: mv.child, facility } : null;
  }
  return null;
}

/**
 * When a region first needs each facility (22 C11, 05 §8 S-9): the earliest event in the round that
 * opens, settles or links one of its attachments while that attachment serves the region (`servesAt`,
 * 22 C12). By facility; one with none in the round is absent (it musters in the opening). Memoised.
 */
export function firstNeeds(f: RoundFacts): ReadonlyMap<CanonicalKey, { eventKey: string; at: UtcMs; actor: CanonicalKey | null }> {
  let idx = needIndex.get(f);
  if (idx) return idx;
  idx = new Map();
  const dated = [...f.moves].map(([eventKey, mv]) => ({ eventKey, mv, at: f.at?.get(eventKey) })).filter((x): x is { eventKey: string; mv: Move[]; at: UtcMs } => x.at !== undefined)
    .sort((a, b) => a.at - b.at || (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0));
  for (const { eventKey, mv, at } of dated) {
    if (at < f.round.startUtc || at >= f.round.endUtc) continue;
    for (const m of mv) {
      const a = attachmentMove(m, f);
      if (!a || idx.has(a.facility) || !servesAt(f, a.key, at)) continue;
      const actor = m.m === 'attach' ? m.author : m.m === 'settle' ? m.actor : null;
      idx.set(a.facility, { eventKey, at, actor });
    }
  }
  needIndex.set(f, idx);
  return idx;
}
const needIndex = new WeakMap<RoundFacts, Map<CanonicalKey, { eventKey: string; at: UtcMs; actor: CanonicalKey | null }>>();

/** The regions a whole round's facts carry (each region's own), else the facts themselves. */
const regionsIn = (f: RoundFacts): RoundFacts[] => (f.regions ? [...f.regions.keys()].sort(byKey).map((k) => f.regions!.get(k)!) : [f]);

/**
 * Whether `e` is the moment a region it serves first needs the move's facility: its jump-in (22 C11).
 * Facts with no dates (hand-built) read the first attachment opened in the round instead.
 */
export function isFirstNeed(mv: Move, e: AnyTimelineEvent, f: RoundFacts): boolean {
  // A scene's own region only (22 C9 review): another region's first need is no jump-in here.
  const own = f.scene ? f.regions?.get(f.scene) : undefined;
  return (own ? [own] : regionsIn(f)).some((rf) => {
    if (!rf.at) return mv.m === 'attach' && firstOpened(rf, mv.facility) === mv.key;
    const a = attachmentMove(mv, rf);
    return !!a && firstNeeds(rf).get(a.facility)?.eventKey === e.eventKey;
  });
}

/** The attachment first opened into a facility in the round (undated facts' first need). */
function firstOpened(f: RoundFacts, facility: CanonicalKey): CanonicalKey | null {
  let best: AttachmentFacts | null = null;
  for (const a of f.attachments.values()) {
    if (a.facility !== facility || a.open.from < f.round.startUtc || a.open.from >= f.round.endUtc) continue;
    if (!best || a.open.from < best.open.from || (a.open.from === best.open.from && a.key < best.key)) best = a;
  }
  return best?.key ?? null;
}

/** A piece's seat at an instant, from its facts (null: unassigned or unknown). */
export function seatAt(f: RoundFacts, piece: CanonicalKey, at: UtcMs): CanonicalKey | null {
  let seat: CanonicalKey | null = null;
  for (const s of f.pieces.get(piece)?.seatAt ?? []) {
    if (s.from > at) break;
    seat = s.seat;
  }
  return seat;
}

// ---- Casting ----

/** A cast with every list sorted and de-duplicated, and empty or null parts dropped. */
export function castOf(parts: Partial<Record<CastRole, readonly (CanonicalKey | null | undefined)[]>>): Cast {
  const out: Cast = {};
  for (const role of Object.keys(parts).sort() as CastRole[]) {
    const keys = [...new Set(parts[role]!.filter((k): k is CanonicalKey => !!k))].sort(byKey);
    if (keys.length) out[role] = keys;
  }
  return out;
}

const actorOf = (mv: Move, e: AnyTimelineEvent): CanonicalKey | null =>
  ('actor' in mv ? mv.actor : null) ?? (mv.m === 'attach' ? mv.author : null) ?? e.changedBy ?? null;

/** The piece a move is about. */
export function subjectOf(mv: Move): CanonicalKey {
  return 'child' in mv ? mv.child : mv.key;
}

/** A piece's parent at an instant (a step's objective or threat). */
function parentAt(p: PieceFacts, at: UtcMs): CanonicalKey | null {
  let parent = p.parentAt?.length ? null : p.parent;
  for (const x of p.parentAt ?? []) {
    if (x.from > at) break;
    parent = x.parent;
  }
  return parent;
}

/** The piece a key stands for at an instant: a step's parent then (27 E6's B-15 guard), else the key itself. */
export function pieceAt(f: RoundFacts, key: CanonicalKey, at: UtcMs): CanonicalKey {
  const p = f.pieces.get(key);
  return p?.role === 'step' ? (parentAt(p, at) ?? key) : key;
}

/**
 * The pieces an attachment's work is, at an instant: its linked objectives and threats, a linked
 * step standing in for its parent then (most attachments link a step, not the piece). Sorted.
 */
export function workOf(f: RoundFacts, attachment: CanonicalKey, at: UtcMs): CanonicalKey[] {
  const out = new Set<CanonicalKey>();
  for (const link of f.attachments.get(attachment)?.links ?? []) {
    const p = f.pieces.get(link);
    if (!p) continue;
    const key = p.role === 'step' ? parentAt(p, at) : link;
    const role = key ? f.pieces.get(key)?.role : undefined;
    if (key && (role === 'objective' || role === 'threat')) out.add(key);
  }
  return [...out].sort(byKey);
}

/**
 * The attachments merged by `at` whose work is a piece (linked to it or to one of its steps), their
 * approvers, and the facilities they merged into: the facilities that beam a piece home when it closes.
 */
export function mergedBacking(f: RoundFacts, piece: CanonicalKey, at: UtcMs): { approvers: CanonicalKey[]; facilities: CanonicalKey[] } {
  const merged: AttachmentFacts[] = [];
  for (const a of f.attachments.values()) {
    const s = a.signalAt.filter((x) => x.from <= at).at(-1)?.signal;
    if (s?.rung === 'accomplished' && workOf(f, a.key, at).includes(piece)) merged.push(a);
  }
  merged.sort((a, b) => byKey(a.key, b.key));
  return { approvers: [...new Set(merged.flatMap((a) => a.approvers))].sort(byKey), facilities: [...new Set(merged.map((a) => a.facility))].sort(byKey) };
}

/** Who reviewed the work linked to a piece (its attachments' approvers), and the facilities those go to. */
function backing(f: RoundFacts, piece: CanonicalKey) {
  const links = attachmentsOf(f, piece);
  return { approvers: links.flatMap((a) => a.approvers), facilities: links.map((a) => a.facility) };
}

/** A close the facilities its merged work went to beam home: the final beam's act runs longer (2–3 s). */
const beamed = (phases: readonly PhaseSpan[]) => (mv: Move, e: AnyTimelineEvent, f: RoundFacts) =>
  (mergedBacking(f, subjectOf(mv), e.occurredAt).facilities.length ? { name: 'beamed', phases } : null);

/** The common cast of a piece's own change: the piece, who made it, and its seat then. */
function pieceCast(mv: Move, e: AnyTimelineEvent, f: RoundFacts, more: Partial<Record<CastRole, (CanonicalKey | null)[]>> = {}): Cast {
  const key = subjectOf(mv);
  const seat = mv.m === 'appear' ? mv.seat : seatAt(f, key, e.occurredAt);
  return castOf({ subject: [key], agent: [actorOf(mv, e)], seat: [seat], ...(seat === null ? { frontier: [key] } : {}), ...more });
}

// ---- Milestones (2026-10-13): a seat completes, a region clears ----

/** The region facts a piece is in at `t` (a whole round's facts carry each region's), else `f` itself. */
function regionOf(f: RoundFacts, piece: CanonicalKey, t: UtcMs): RoundFacts | null {
  if (!f.regions) return f.pieces.has(piece) ? f : null;
  for (const key of [...f.regions.keys()].sort(byKey)) {
    const rf = f.regions.get(key)!;
    const p = rf.pieces.get(piece);
    if (p && memberAt(p, t)) return rf;
  }
  return null;
}

/** On the ladder at `t` (not Off) and placed: what a seat's share counts, as its look does. */
const counted = (p: PieceFacts, t: UtcMs): Signal | null => {
  if (!isPiece(p.role) || !memberAt(p, t)) return null;
  const s = signalAtTime(p, t);
  return s && s.rung !== 'off' ? s : null;
};

/**
 * Whether `e` is the last of the closes at its instant that `pick` cares about: several pieces closing
 * in one instant (a pack writes them together) make one milestone, on the last event by key.
 */
function lastCloseAt(f: RoundFacts, e: AnyTimelineEvent, pick: (piece: CanonicalKey) => boolean): boolean {
  if (!f.at) return true;
  let last: string | null = null;
  for (const [key, at] of f.at) {
    if (at !== e.occurredAt) continue;
    const closes = (f.moves.get(key) ?? []).some((m) => m.m === 'climb' && m.to.rung === 'accomplished' && m.from.rung !== 'accomplished' && pick(m.key));
    if (closes && (last === null || key > last)) last = key;
  }
  return last === null || last === e.eventKey;
}

/** The seat whose every counted piece is Accomplished once `e` lands, if this close completes it. */
export function seatCompletedBy(mv: Move, e: AnyTimelineEvent, f: RoundFacts): CanonicalKey | null {
  if (mv.m !== 'climb') return null;
  const t = e.occurredAt;
  const rf = regionOf(f, mv.key, t);
  const p = rf?.pieces.get(mv.key);
  const seat = p ? seatAtTime(p, t) : null;
  if (!rf || !seat) return null;
  const held = [...rf.pieces.values()].filter((q) => seatAtTime(q, t) === seat && counted(q, t));
  if (!held.length || !held.every((q) => counted(q, t)!.rung === 'accomplished')) return null;
  const mine = new Set(held.map((q) => q.key));
  return lastCloseAt(rf, e, (k) => mine.has(k)) ? seat : null;
}

/** The region facts whose last open threat this close is, if it is. */
export function regionClearedBy(mv: Move, e: AnyTimelineEvent, f: RoundFacts): RoundFacts | null {
  if (mv.m !== 'climb' || mv.role !== 'threat') return null;
  const t = e.occurredAt;
  const rf = regionOf(f, mv.key, t);
  if (!rf) return null;
  const threats = [...rf.pieces.values()].filter((q) => q.role === 'threat');
  if (threats.some((q) => { const s = counted(q, t); return !!s && s.rung !== 'accomplished'; })) return null;
  const ids = new Set(threats.map((q) => q.key));
  return lastCloseAt(rf, e, (k) => ids.has(k)) ? rf : null;
}

/** The seats that hold a piece in a region at `t`. */
const seatsHolding = (rf: RoundFacts, t: UtcMs): CanonicalKey[] =>
  [...new Set([...rf.pieces.values()].filter((q) => counted(q, t)).map((q) => seatAtTime(q, t)).filter((k): k is CanonicalKey => !!k))].sort(byKey);

// ---- Matching ----

const isPiece = (role: string): role is 'objective' | 'threat' => role === 'objective' || role === 'threat';
const reached = (mv: Move, role: 'objective' | 'threat', ...rungs: Signal['rung'][]) =>
  mv.m === 'climb' && mv.role === role && rungs.includes(mv.to.rung) && mv.from.rung !== mv.to.rung;

// ---- The rules ----

// Each form's phases, named once: the rule plays them and its short form (`short`) shortens them, so a
// retime can't leave a short form stale (27 E5, the E4d review).
/** An objective's close: the turn and the glide are the land (`CLOSE_SLIDE_MS`), the blossom opens the echo. */
export const LANDING = phases(['tell', 300], ['gather', 400], ['act', 800], ['land', CLOSE_SLIDE_MS], ['echo', 400], ['disperse', 300]);
/** A close its facilities beam home: the act runs longer (charge 0.6 s, beam 2 s). */
export const LANDING_BEAMED = phases(['tell', 300], ['gather', 400], ['act', 2600], ['land', CLOSE_SLIDE_MS], ['echo', 400], ['disperse', 300]);
/** A Bug's close, the decisive pass. */
export const STRIKE = phases(['tell', 300], ['gather', 700], ['act', 1200], ['land', CLOSE_SLIDE_MS], ['echo', 400], ['disperse', 400]);
/** A Bug's close its facilities blast: the act runs longer (charge 0.6 s, fire 2 s). */
export const STRIKE_BEAMED = phases(['tell', 300], ['gather', 700], ['act', 2600], ['land', CLOSE_SLIDE_MS], ['echo', 400], ['disperse', 400]);
/** A merge: setup, action, the docking, the payoff, then out. */
export const LINK = phases(['tell', 300], ['gather', 900], ['act', 1600], ['land', 500], ['echo', 3000], ['disperse', 900]);
/** A seat completes. */
export const HOMEWORLD = phases(['tell', 300], ['gather', 700], ['act', 1000], ['land', 1100], ['echo', 900]);
/** A region clears. */
export const ALL_CLEAR = phases(['tell', 350], ['act', 1600], ['echo', 1000]);

/**
 * The pace (12, "a cozy campfire, not fireworks"): every maneuver has room to breathe, and the two
 * successes the chart exists to show, an objective accomplished and a threat defeated, are the
 * longest and are protected. Lengths sit close to the v0 accents they replace (05 §4).
 */
export const PACE_RULES: readonly PaceRule[] = Object.freeze([
  {
    // A new piece pings in as a sketch, at its seat or in the frontier.
    id: RULE.pieceAppear, tier: 'narrative',
    match: (mv) => mv.m === 'appear' && (mv.role === 'objective' || (mv.role === 'threat' && !!mv.to.sketch)),
    cast: (mv, e, f) => pieceCast(mv, e, f),
    phases: phases(['tell', 300], ['act', 900], ['echo', 400]),
  },
  {
    // A threat arrives solid: created past its sketch, or its sketch firming up.
    id: RULE.threatEmerge, tier: 'narrative',
    match: (mv) => (mv.m === 'appear' && mv.role === 'threat' && !mv.to.sketch)
      || (mv.m === 'climb' && mv.role === 'threat' && !!mv.from.sketch && !mv.to.sketch && mv.to.rung === 'ready'),
    cast: (mv, e, f) => pieceCast(mv, e, f),
    // A menacing second through the rift (2026-10-13): a quick pinch, the rift, a settle.
    phases: phases(['tell', 250], ['act', 1000], ['echo', 300]),
  },
  {
    id: RULE.objectiveUnderway, tier: 'narrative',
    match: (mv) => reached(mv, 'objective', 'underway'),
    cast: (mv, e, f) => pieceCast(mv, e, f),
    phases: phases(['tell', 300], ['gather', 500], ['act', 1200], ['echo', 400]),
  },
  {
    id: RULE.objectiveNearing, tier: 'narrative',
    match: (mv) => reached(mv, 'objective', 'nearing'),
    cast: (mv, e, f) => pieceCast(mv, e, f, { facility: backing(f, subjectOf(mv)).facilities }),
    phases: phases(['tell', 300], ['gather', 600], ['act', 1100], ['echo', 400]),
  },
  {
    // The objective lands on its seat (a protected moment).
    id: RULE.objectiveAccomplish, tier: 'essential', protect: true,
    match: (mv) => reached(mv, 'objective', 'accomplished'),
    cast: (mv, e, f) => pieceCast(mv, e, f, { facility: mergedBacking(f, subjectOf(mv), e.occurredAt).facilities }),
    // The close in three acts (22 C3, M-22): the turn and the glide are the land (`CLOSE_SLIDE_MS`), the blossom opens the echo.
    phases: LANDING,
    // Beamed home: the facilities its merged work went to charge (0.6 s) and beam it (2 s) as the act.
    variant: beamed(LANDING_BEAMED),
    // Short forms (27 E4d): the glide to the platform stays whole.
    short: { plain: shortOf(LANDING, ['land']), beamed: shortOf(LANDING_BEAMED, ['land']) },
  },
  {
    // The fleet engages a threat, with covering fire from the facilities its work goes to.
    id: RULE.threatEngage, tier: 'narrative',
    match: (mv) => reached(mv, 'threat', 'underway', 'nearing'),
    cast: (mv, e, f) => pieceCast(mv, e, f, { facility: backing(f, subjectOf(mv)).facilities }),
    phases: phases(['tell', 300], ['gather', 500], ['act', 1300], ['echo', 300]),
  },
  {
    // The decisive pass, with whoever reviewed the fix (a protected moment).
    id: RULE.threatAccomplish, tier: 'essential', protect: true,
    match: (mv) => reached(mv, 'threat', 'accomplished'),
    cast: (mv, e, f) => {
      const b = backing(f, subjectOf(mv));
      const agent = actorOf(mv, e);
      const merged = mergedBacking(f, subjectOf(mv), e.occurredAt).facilities;
      return pieceCast(mv, e, f, { support: b.approvers.filter((k) => k !== agent), facility: [...new Set([...b.facilities, ...merged])] });
    },
    phases: STRIKE,
    // Blasted: the facilities its merged fixes went to charge (0.6 s) and fire (2 s) as the act.
    variant: beamed(STRIKE_BEAMED),
    short: { plain: shortOf(STRIKE, ['land']), beamed: shortOf(STRIKE_BEAMED, ['land']) },
  },
  {
    // Dropped or set aside: it leaves, and rests as a ghost.
    id: RULE.pieceOff, tier: 'narrative',
    match: (mv) => mv.m === 'climb' && isPiece(mv.role) && mv.to.rung === 'off' && mv.from.rung !== 'off',
    cast: (mv, e, f) => pieceCast(mv, e, f),
    phases: phases(['tell', 300], ['act', 900], ['disperse', 600]),
  },
  {
    // Travel between two fixed slots: seat to seat, or to and from the frontier.
    // The hand-off (22 C7, 05 §8 M-24): the new holder's captain flies to meet the piece at its new
    // place, named *Takes it*; unassigned, it drifts to the belt with no ship.
    id: RULE.pieceReseat, tier: 'narrative',
    match: (mv) => mv.m === 'reseat' && isPiece(mv.role) && mv.from !== mv.to,
    cast: (mv) => {
      if (mv.m !== 'reseat') return {};
      return castOf({
        subject: [mv.key], agent: [mv.to], fromSeat: [mv.from], toSeat: [mv.to],
        ...(mv.from === null || mv.to === null ? { frontier: [mv.key] } : {}),
      });
    },
    phases: phases(['tell', 300], ['gather', 300], ['act', 1400], ['land', 400]),
  },
  {
    // A facility jumps in when a region first needs it (22 C11): its first PR event there in the
    // round, an opening, a merge or a link, summoned by who made it. Never twice.
    id: RULE.facilityEnter, tier: 'narrative', introduces: true,
    match: (mv, f) => attachmentMove(mv, f) !== null || regionsIn(f).some((rf) => attachmentMove(mv, rf) !== null),
    when: (mv, e, f) => isFirstNeed(mv, e, f),
    cast: (mv, e, f) => {
      const a = attachmentMove(mv, f) ?? regionsIn(f).map((rf) => attachmentMove(mv, rf)).find((x) => !!x) ?? null;
      if (!a) return {};
      // The seats its attachment's work sits at: where it comes in.
      const seats = (f.attachments.get(a.key)?.links ?? []).map((k) => seatAt(f, k, e.occurredAt));
      return castOf({ subject: [a.facility], facility: [a.facility], agent: [actorOf(mv, e)], seat: seats });
    },
    // On the fly (27 F2): the summoner's flight passes through the spot (0.715 s, 27 E1: the beacon pulses are
    // retired), its call blip at the act's start, and the facility jumps in at that instant. No hold, no fly-back.
    phases: phases(['gather', 715], ['act', 1200]),
    pass: true,
  },
  {
    // An attachment launches into its slot around the facility.
    id: RULE.attachmentOpen, tier: 'narrative', waitsFor: [RULE.facilityEnter], introduces: true,
    match: (mv) => mv.m === 'attach',
    cast: (mv, e) => (mv.m === 'attach' ? castOf({ subject: [mv.key], attachment: [mv.key], facility: [mv.facility], agent: [actorOf(mv, e)] }) : {}),
    phases: phases(['tell', 300], ['act', 1000], ['land', 400]),
  },
  {
    // The attachment charges, operates and settles into its new rung (not a merge: that's its own moment).
    // The author works it, as in a merge; whoever else settled it and the approvers lend their energy
    // (13 §6.1, 2026-10-13).
    // No ship flies it: it holds no turn (22 C7, P-16; G-7).
    id: RULE.attachmentSettle, tier: 'narrative', turn: false,
    match: (mv) => mv.m === 'settle' && mv.to.rung !== 'accomplished',
    cast: (mv, e, f) => {
      if (mv.m !== 'settle') return {};
      const agent = f.attachments.get(mv.key)?.author ?? actorOf(mv, e);
      return castOf({
        subject: [mv.key], attachment: [mv.key], facility: [mv.facility], agent: [agent],
        support: [actorOf(mv, e), ...mv.approvers].filter((k) => k !== agent),
      });
    },
    phases: phases(['tell', 300], ['gather', 600], ['act', 900], ['land', 600], ['echo', 400]),
  },
  {
    // A merge (a protected moment of teamwork): the author's ship flies to the facility, the approvers
    // jump in, energy chains approvers → author → facility, the attachment docks (the merge itself,
    // mid-sequence), and the facility charges and beams the work it served. The beam never changes
    // its target (INV-06: merged ≠ done): the piece's own close plays that. A facility's first merge
    // gives it room to transform while the beams hold (the `first` variant: the transformation begins
    // with the gather, and the facility fires as the longest one, the Wars ring docking's 4.4 s, ends).
    id: RULE.attachmentMerge, tier: 'essential', protect: true, leads: true,
    match: (mv) => mv.m === 'settle' && mv.to.rung === 'accomplished',
    cast: (mv, e, f) => {
      if (mv.m !== 'settle') return {};
      const agent = f.attachments.get(mv.key)?.author ?? actorOf(mv, e);
      return castOf({
        subject: [mv.key], attachment: [mv.key], facility: [mv.facility], agent: [agent],
        support: mv.approvers.filter((k) => k !== agent), target: workOf(f, mv.key, e.occurredAt),
      });
    },
    // Setup (fly in, jump in), action (the energy chain), the merge (docking), payoff (charge and beam), then out.
    phases: LINK,
    variant: (mv, _e, f) => (mv.m === 'settle' && f.firstMerge?.get(mv.facility) === mv.key
      // The transformation starts at the gather (300 ms in) and runs 4.4 s. The facility's charge is
      // LINK_CHARGE_MS (700), so it fires at 300 + 900 + 2300 + 500 + 700 = 4700 ms: as that ends.
      ? { name: 'first', phases: phases(['tell', 300], ['gather', 900], ['act', 2300], ['land', 500], ['echo', 3000], ['disperse', 900]), holds: ['facility'] }
      : null),
    // Plain only: a first merge has no short form (once per facility; the transformation floors it).
    short: { plain: shortOf(LINK) } as PaceRule['short'],
  },
  {
    // A seat completes (2026-10-13): the close that leaves every piece it holds here Accomplished.
    // A milestone, not a ranking (INV-19): it celebrates the seat's own work, after the close itself
    // (it shares that close's subject, so it plays once that moment ends).
    id: RULE.seatComplete, tier: 'essential', protect: true,
    match: (mv) => mv.m === 'climb' && isPiece(mv.role) && mv.to.rung === 'accomplished' && mv.from.rung !== 'accomplished',
    when: (mv, e, f) => seatCompletedBy(mv, e, f) !== null,
    cast: (mv, e, f) => {
      const seat = seatCompletedBy(mv, e, f);
      return castOf({ subject: [subjectOf(mv)], seat: [seat], agent: [seat] });
    },
    // A bloom that takes its time: the ship comes home, the light gathers, the look lands, it settles.
    phases: HOMEWORLD,
    short: { plain: shortOf(HOMEWORLD) } as PaceRule['short'],
  },
  {
    // A region clears (2026-10-13): the close of the last open threat in it. Every seat there sees it.
    id: RULE.regionClear, tier: 'essential', protect: true,
    match: (mv) => mv.m === 'climb' && mv.role === 'threat' && mv.to.rung === 'accomplished' && mv.from.rung !== 'accomplished',
    when: (mv, e, f) => regionClearedBy(mv, e, f) !== null,
    cast: (mv, e, f) => {
      const rf = regionClearedBy(mv, e, f);
      return castOf({ subject: [subjectOf(mv)], seat: rf ? seatsHolding(rf, e.occurredAt) : [] });
    },
    phases: ALL_CLEAR,
    short: { plain: shortOf(ALL_CLEAR) } as PaceRule['short'],
  },
  {
    // An agent at work on a change nothing else plays (gated by the activity level, 05 §5).
    id: RULE.agentLight, tier: 'ornament', light: true,
    match: (mv) => mv.m !== 'retitle',
    // Its subject's seat too, so the captain comes in on the work's side of that planet (22 A10).
    cast: (mv, e, f) => castOf({ subject: [subjectOf(mv)], agent: [e.changedBy ?? null], seat: [seatAt(f, subjectOf(mv), e.occurredAt)] }),
    phases: phases(['gather', 400], ['act', 800]),
  },
  {
    // A captain's progress beam (27 E3): one beam from the captain to the work, a small flare as it lands.
    // No move triggers it: the director (27 E5a) plays it for a merge that doesn't close its work.
    id: RULE.agentProgress, tier: 'narrative',
    match: () => false,
    cast: (mv, e, f) => {
      if (mv.m === 'settle') {
        // The merge's cast without its approvers: they don't form up.
        return castOf({
          subject: [mv.key], attachment: [mv.key], facility: [mv.facility],
          agent: [f.attachments.get(mv.key)?.author ?? actorOf(mv, e)], target: workOf(f, mv.key, e.occurredAt),
        });
      }
      // A Task update aims at its Story or Bug.
      const p = f.pieces.get(subjectOf(mv));
      return pieceCast(mv, e, f, p?.role === 'step' ? { target: [parentAt(p, e.occurredAt)] } : {});
    },
    // A gather makes it a turn (a captain does one thing at a time) and names a crew; it is light, not travel.
    phases: phases(['gather', 300], ['act', 800], ['echo', 400]),
  },
  {
    // A sector sweep (27 E7): a beat with `CROWD_MIN` or more creations plays them as one sweep from the
    // star. No move triggers it: the planner drafts it in place of the creations' own rules, so it goes last.
    // The literal 4 is `CROWD_MIN` (maneuvers.ts imports this file; a test keeps the two equal).
    id: RULE.regionSweep, tier: 'narrative', turn: false,
    match: () => false,
    cast: () => ({}),
    phases: sweepPhases(4),
  },
] satisfies PaceRule[]);

/** A rule by id. */
export function ruleById(id: string, rules: readonly ManeuverRule[] = PACE_RULES): ManeuverRule | undefined {
  return rules.find((r) => r.id === id);
}
