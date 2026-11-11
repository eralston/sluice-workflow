// 18 §5, 14 §2.9 — achievements: what the viewer earned in one region's round, read from its round
// facts in engine terms. Personal (only the viewer's are ever computed), outcome-based (dated
// arrivals at Accomplished, merges and approvals; never activity volume) and earned, never lost:
// nothing is drawn or kept for a near miss. Undated facts never earn anything (INV-02): the fold
// keeps observations out of the facts, and an arrival with no dated move behind it (a piece seeded
// from the current state) doesn't count; every time comes from the facts' own event times
// (`RoundFacts.at`), and who held a piece from the seat as it stood at that event. The same facts
// always earn the same awards. The pack
// supplies the bars (swift days, K, the working day); the words come from a terminology. Pure.
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import { weightedHours } from '../playback/schedule';
import { eventsAt, knownOff, memberAt, parentAtTime, seatAtEvent, seatAtTime, signalAtTime } from './facts';
import { movedKeys, PLACED_ROLES } from './moves';
import { ENGINE_WORDS, terminology } from './terminology';
import type {
  AchievementRule, AttachmentFacts, Award, DomainPack, PackThresholds, PieceFacts, Role, RoundFacts, Rung, Terminology,
} from './types';

/** What a rule reads beyond the facts: the team's time zone (working hours) and the words. */
export interface AwardContext { tz: string; t: Terminology }

/** A v1 rule: 14's `AchievementRule`, with the context as an optional fourth argument. */
export interface AwardRule extends AchievementRule {
  earn(f: RoundFacts, viewer: CanonicalKey, th: PackThresholds, ctx?: AwardContext): Award | null;
}

export interface AchievementOptions {
  /** The team's time zone, for Swift passage's working days. Default UTC; the app passes its own. */
  tz?: string;
  /** The words for each award's reason. Default: the chart register with no theme words (engine words). */
  terms?: Terminology;
}

// ---- The ledger: dated arrivals, read once per facts ----

/** A piece reaching a rung through a dated move. */
interface Arrival { key: CanonicalKey; role: Role; at: UtcMs; eventKey: string; actor: CanonicalKey | null }
/** An attachment settling at Accomplished (merged) through a dated move. */
interface Merge { a: AttachmentFacts; at: UtcMs; eventKey: string }

interface Ledger {
  /** Arrivals at Accomplished, in time order (ties by key). */
  landed: Arrival[];
  landedBy: Map<CanonicalKey, Arrival[]>;
  /** Each piece's first arrival at Underway, when that arrival is dated. */
  firstStart: Map<CanonicalKey, Arrival>;
  merges: Merge[];
}

const byKey = (a: CanonicalKey, b: CanonicalKey) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = (a: { at: UtcMs; key: CanonicalKey }, b: { at: UtcMs; key: CanonicalKey }) => a.at - b.at || byKey(a.key, b.key);

type SignalMove = { eventKey: string; to: Rung; from: Rung | null; actor: CanonicalKey | null };

/**
 * A piece's dated arrivals at `rung`: each `appear` or `climb` onto it from another rung, at its
 * event's time (`RoundFacts.at`), when the piece shows that rung at the instant. Of several climbs
 * onto it in one millisecond only the last counts. A state seeded from the current state has no move,
 * so it is never an arrival (INV-02).
 */
function arrivalsAt(f: RoundFacts, p: PieceFacts, rung: Rung, moves: readonly SignalMove[]): Arrival[] {
  const out: Arrival[] = [];
  for (const m of moves) {
    const at = f.at?.get(m.eventKey);
    if (m.to !== rung || m.from === rung || at === undefined || signalAtTime(p, at)?.rung !== rung) continue;
    // Several climbs onto the rung in one millisecond are one arrival: the last (moves are in event order).
    if (out.at(-1)?.at === at) out.pop();
    out.push({ key: p.key, role: p.role, at, eventKey: m.eventKey, actor: m.actor });
  }
  return out;
}

const ledgers = new WeakMap<RoundFacts, Ledger>();

function ledgerOf(f: RoundFacts): Ledger {
  const memo = ledgers.get(f);
  if (memo) return memo;
  // Each piece's signal moves, and each attachment's merges, in event order (the facts' own order).
  const signalMoves = new Map<CanonicalKey, SignalMove[]>();
  const settles = new Map<CanonicalKey, string>();
  for (const [eventKey, mv] of f.moves) {
    for (const m of mv) {
      if (m.m === 'appear' || m.m === 'climb') {
        const list = signalMoves.get(m.key) ?? [];
        list.push({ eventKey, to: m.to.rung, from: m.m === 'climb' ? m.from.rung : null, actor: m.m === 'climb' ? m.actor : null });
        signalMoves.set(m.key, list);
      } else if (m.m === 'settle' && m.to.rung === 'accomplished') settles.set(m.key, eventKey);
    }
  }
  const landed: Arrival[] = [];
  const landedBy = new Map<CanonicalKey, Arrival[]>();
  const firstStart = new Map<CanonicalKey, Arrival>();
  for (const key of [...f.pieces.keys()].sort(byKey)) {
    const p = f.pieces.get(key)!;
    const moves = signalMoves.get(key) ?? [];
    const done = arrivalsAt(f, p, 'accomplished', moves);
    landed.push(...done);
    landedBy.set(key, done);
    // The first start counts only when it's the first time the piece is seen Underway at all: one
    // seeded there (undated) has no dated first start.
    const started = arrivalsAt(f, p, 'underway', moves)[0];
    if (started && started.at === p.signalAt.find((s) => s.signal.rung === 'underway')?.from) firstStart.set(key, started);
  }
  landed.sort(byTime);
  const merges: Merge[] = [];
  for (const key of [...f.attachments.keys()].sort(byKey)) {
    const a = f.attachments.get(key)!;
    const eventKey = settles.get(key);
    const at = eventKey === undefined ? undefined : f.at?.get(eventKey);
    if (eventKey === undefined || at === undefined || signalAtTime(a, at)?.rung !== 'accomplished') continue;
    merges.push({ a, at, eventKey });
  }
  merges.sort((x, y) => x.at - y.at || byKey(x.a.key, y.a.key));
  const l: Ledger = { landed, landedBy, firstStart, merges };
  ledgers.set(f, l);
  return l;
}

// ---- Readers ----

const inRound = (f: RoundFacts, t: UtcMs) => t >= f.round.startUtc && t < f.round.endUtc;
/** Whether the viewer's seat holds a piece in the region at `t` (after every event of that instant). */
const heldBy = (p: PieceFacts, t: UtcMs, viewer: CanonicalKey) => memberAt(p, t) && seatAtTime(p, t) === viewer;
/** Whether the viewer's seat holds a piece in the region at one of the facts' events, as it stood then. */
const heldAt = (f: RoundFacts, p: PieceFacts, at: { eventKey: string; at: UtcMs }, viewer: CanonicalKey) =>
  memberAt(p, at.at) && seatAtEvent(f, p, at.eventKey) === viewer;
/** The round's last instant (its range is end-exclusive). */
const roundEnd = (f: RoundFacts) => f.round.endUtc - 1;

/** The viewer's landings of one role in the round: each piece once, at its first arrival there. */
function landingsOf(f: RoundFacts, viewer: CanonicalKey, roles: readonly Role[]): Arrival[] {
  const seen = new Set<CanonicalKey>();
  return ledgerOf(f).landed.filter((a) => {
    if (!roles.includes(a.role) || seen.has(a.key) || !inRound(f, a.at) || !heldAt(f, f.pieces.get(a.key)!, a, viewer)) return false;
    seen.add(a.key);
    return true;
  });
}

/** The round's start and every instant in it at which one of `pieces` changes signal, seat or membership. */
function changeTimes(f: RoundFacts, pieces: readonly PieceFacts[]): UtcMs[] {
  const times = new Set<UtcMs>([f.round.startUtc]);
  for (const p of pieces) {
    for (const x of [...p.signalAt.map((s) => s.from), ...p.seatAt.map((s) => s.from), ...p.member.flatMap((m) => (m.to === null ? [m.from] : [m.from, m.to]))]) {
      if (inRound(f, x)) times.add(x);
    }
  }
  return [...times].sort((a, b) => a - b);
}

const award = (id: string, at: { eventKey: string; at: UtcMs }, pieces: CanonicalKey[], reason: string): Award =>
  ({ id, earnedAt: { eventKey: at.eventKey, atUtc: at.at }, pieces, reason });

/** The engine's own words (the chart register with no theme words), for a rule called without a context. */
const ENGINE_CTX: AwardContext = { tz: 'UTC', t: terminology({ words: ENGINE_WORDS }, 'chart') };
const fallbackCtx = (ctx: AwardContext | undefined): AwardContext => ctx ?? ENGINE_CTX;

// ---- The v1 rules (18 §5 A1) ----

/**
 * Every objective and threat the viewer's seat holds at the round's end is Accomplished, and one of
 * them landed in the round. Off pieces are ignored; an unknown state isn't known to be Off, so it
 * still counts. Earned when the seat's last clear stretch began: at its last landing, or at a later
 * move that cleared it (an open piece leaving the region, going to another seat, or going Off).
 */
const clearSkies: AwardRule = {
  id: 'clear-skies', shape: 'sun',
  earn(f, viewer, _th, ctx) {
    const { t } = fallbackCtx(ctx);
    const end = roundEnd(f);
    const placed = [...f.pieces.values()].filter((p) => PLACED_ROLES.has(p.role));
    const holds = (x: UtcMs) => placed.filter((p) => heldBy(p, x, viewer) && !knownOff(signalAtTime(p, x)));
    const clear = (x: UtcMs) => holds(x).every((p) => signalAtTime(p, x)?.rung === 'accomplished');
    const held = holds(end);
    if (!held.length || !clear(end)) return null;
    const last = held.flatMap((p) => ledgerOf(f).landedBy.get(p.key)!.filter((a) => inRound(f, a.at))).sort(byTime).at(-1);
    if (!last) return null;
    // The last clear stretch: the earliest change from which the seat stays clear to the end.
    const times = changeTimes(f, placed);
    let from = end;
    for (let i = times.length - 1; i >= 0 && clear(times[i]!); i--) from = times[i]!;
    let by: { eventKey: string; at: UtcMs } = last;
    if (from > last.at) {
      // The clearing move: the last event of that instant that moved one of the seat's pieces, else
      // (a change that shows only then, such as a reseat held while Off) the instant's last event.
      const mine = new Set([...holds(from - 1), ...held].map((p) => p.key));
      const at = eventsAt(f, from);
      const eventKey = at.filter((k) => f.moves.get(k)!.some((m) => movedKeys(m).some((x) => mine.has(x)))).at(-1) ?? at.at(-1);
      if (eventKey !== undefined) by = { eventKey, at: from };
    }
    return award('clear-skies', by, held.map((p) => p.key).sort(byKey),
      `Every ${t.noun('objective')} and ${t.noun('threat')} on your ${t.level('seat')} reached ${t.rung('accomplished')}`);
  },
};

/** Three of the viewer's pieces of one role land in the round. */
function hatTrick(id: string, shape: string, role: 'objective' | 'threat', line: (t: Terminology) => string): AwardRule {
  return {
    id, shape,
    earn(f, viewer, _th, ctx) {
      const three = landingsOf(f, viewer, [role]).slice(0, 3);
      return three.length === 3 ? award(id, three[2]!, three.map((a) => a.key), line(fallbackCtx(ctx).t)) : null;
    },
  };
}

const hatTrickLandings = hatTrick('hat-trick-landings', 'triple-chevron', 'objective',
  (t) => `Three of your ${t.noun('objective', 3)} reached ${t.rung('accomplished')}`);
const hatTrickDefences = hatTrick('hat-trick-defences', 'triple-shield', 'threat',
  (t) => `Three ${t.noun('threat', 3)} on your ${t.level('seat')} reached ${t.rung('accomplished')}`);

/** The viewer approved three attachments that merged in the round (approvers at completion). */
const hatTrickReviews: AwardRule = {
  id: 'hat-trick-reviews', shape: 'triple-star',
  earn(f, viewer, _th, ctx) {
    const { t } = fallbackCtx(ctx);
    const three = ledgerOf(f).merges.filter((m) => inRound(f, m.at) && m.a.author !== viewer && m.a.approvers.includes(viewer)).slice(0, 3);
    return three.length === 3
      ? award('hat-trick-reviews', three[2]!, three.map((m) => m.a.key), `You approved three ${t.noun('attachment', 3)} that reached ${t.rung('accomplished')}`)
      : null;
  },
};

/** One of the viewer's objectives goes from its first Underway to Accomplished within the pack's working days. */
const swiftPassage: AwardRule = {
  id: 'swift-passage', shape: 'arrow',
  earn(f, viewer, th, ctx) {
    const { tz, t } = fallbackCtx(ctx);
    const bar = th.swiftDays * th.dayHours;
    for (const a of landingsOf(f, viewer, ['objective'])) {
      const start = ledgerOf(f).firstStart.get(a.key);
      if (start && start.at < a.at && weightedHours(start.at, a.at, tz) <= bar) {
        return award('swift-passage', a, [a.key],
          `One of your ${t.noun('objective', 2)} went from ${t.rung('underway')} to ${t.rung('accomplished')} within ${th.swiftDays} working days`);
      }
    }
    return null;
  },
};

/**
 * All round, the viewer's seat never holds more than K objectives and threats Underway at once, and
 * at least one of them lands. Steps aren't counted: they're parts of a piece, not more work in hand.
 */
const steadyHands: AwardRule = {
  id: 'steady-hands', shape: 'level',
  earn(f, viewer, th, ctx) {
    const { t } = fallbackCtx(ctx);
    const landed = landingsOf(f, viewer, ['objective', 'threat']);
    if (!landed.length) return null;
    const placed = [...f.pieces.values()].filter((p) => PLACED_ROLES.has(p.role));
    // Holding is constant between changes, so the round start and every change in it are enough to look at.
    for (const x of changeTimes(f, placed)) {
      const underway = placed.filter((p) => heldBy(p, x, viewer) && signalAtTime(p, x)?.rung === 'underway').length;
      if (underway > th.wipK) return null;
    }
    return award('steady-hands', landed.at(-1)!, landed.map((a) => a.key),
      `Never more than ${th.wipK} of your ${t.noun('objective', 2)} and ${t.noun('threat', 2)} ${t.rung('underway')} at once, and at least one reached ${t.rung('accomplished')}`);
  },
};

/**
 * One of the viewer's objectives lands with every step bound to it then already Accomplished. Off
 * steps aside; a step in an unknown state isn't known to be Off, so it spoils the landing.
 */
const cleanLanding: AwardRule = {
  id: 'clean-landing', shape: 'ring',
  earn(f, viewer, _th, ctx) {
    const { t } = fallbackCtx(ctx);
    for (const a of landingsOf(f, viewer, ['objective'])) {
      const steps = f.pieces.get(a.key)!.steps.map((k) => f.pieces.get(k))
        .filter((s): s is PieceFacts => !!s && memberAt(s, a.at) && parentAtTime(s, a.at) === a.key && !knownOff(signalAtTime(s, a.at)));
      if (steps.length && steps.every((s) => signalAtTime(s, a.at)?.rung === 'accomplished')) {
        return award('clean-landing', a, [a.key, ...steps.map((s) => s.key)],
          `One of your ${t.noun('objective', 2)} reached ${t.rung('accomplished')} with all its ${t.noun('step', 2)} already ${t.rung('accomplished')}`);
      }
    }
    return null;
  },
};

/**
 * The viewer helps a piece another seat holds, and it then lands in the round. Helping: bringing
 * one of its steps (bound to it then) to Accomplished, or authoring or approving an attachment for
 * it that merged. The holder is read at the help's own event, and the award falls at the landing
 * (the same instant counts); help that came after the landing didn't help it land.
 */
const wingman: AwardRule = {
  id: 'wingman', shape: 'wings',
  earn(f, viewer, _th, ctx) {
    const { t } = fallbackCtx(ctx);
    const l = ledgerOf(f);
    const helps: { piece: CanonicalKey; by: CanonicalKey; at: UtcMs; eventKey: string }[] = [];
    for (const a of l.landed) {
      const step = f.pieces.get(a.key)!;
      const parent = parentAtTime(step, a.at);
      if (a.role !== 'step' || a.actor !== viewer || !inRound(f, a.at) || !parent || !memberAt(step, a.at)) continue;
      helps.push({ piece: parent, by: a.key, at: a.at, eventKey: a.eventKey });
    }
    for (const m of l.merges) {
      if (!inRound(f, m.at) || (m.a.author !== viewer && !m.a.approvers.includes(viewer))) continue;
      for (const k of m.a.links) helps.push({ piece: k, by: m.a.key, at: m.at, eventKey: m.eventKey });
    }
    const earned = helps.flatMap((h) => {
      const p = f.pieces.get(h.piece);
      const holder = p && PLACED_ROLES.has(p.role) ? seatAtEvent(f, p, h.eventKey) : null;
      if (!holder || holder === viewer) return [];
      const landing = l.landedBy.get(h.piece)!.find((a) => a.at >= h.at && inRound(f, a.at));
      return landing ? [{ at: landing.at, eventKey: landing.eventKey, key: h.piece, pieces: [h.piece, h.by], role: p!.role }] : [];
    }).sort((a, b) => byTime(a, b) || byKey(a.pieces[1]!, b.pieces[1]!));
    const first = earned[0];
    return first
      ? award('wingman', first, first.pieces, `You helped another ${t.level('seat')}'s ${t.noun(first.role)} reach ${t.rung('accomplished')}`)
      : null;
  },
};

/** The v1 rule set (18 §5 A1), in the order they're listed. */
export const ACHIEVEMENT_RULES: readonly AwardRule[] = Object.freeze([
  clearSkies, hatTrickLandings, hatTrickDefences, hatTrickReviews, swiftPassage, steadyHands, cleanLanding, wingman,
]);

/** A rule by id, or undefined. */
export const achievementRule = (id: string): AwardRule | undefined => ACHIEVEMENT_RULES.find((r) => r.id === id);

/**
 * The viewer's awards for one region's round, in the order they were earned (ties in rule order).
 * No viewer, no awards: nobody else's are ever computed (18 §1).
 */
export function achievementsFor(f: RoundFacts, viewer: CanonicalKey | null, pack: DomainPack, opts: AchievementOptions = {}): Award[] {
  if (!viewer) return [];
  const ctx: AwardContext = { tz: opts.tz ?? ENGINE_CTX.tz, t: opts.terms ?? terminology(pack, 'chart') };
  const earned = ACHIEVEMENT_RULES.flatMap((r, i) => {
    const a = r.earn(f, viewer, pack.thresholds, ctx);
    return a ? [{ a, i }] : [];
  });
  return earned.sort((x, y) => x.a.earnedAt.atUtc - y.a.earnedAt.atUtc || x.i - y.i).map((x) => x.a);
}
