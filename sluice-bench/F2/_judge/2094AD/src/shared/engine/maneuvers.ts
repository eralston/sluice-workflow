// 14 §2.6–2.7 — maneuvers, planned per beat from the pace rules (pace.ts), and the schedule hooks
// that size each beat from the same plan, so a beat is always exactly as long as its maneuvers.
// Protected moments (12 §5) play first: another maneuver that would move a moment's cast starts
// after it, inside the same beat (never queued across beats: INV-15). Attention is budgeted (22 B7,
// C10): at most `ATTENTION_MAX` labels (pieces' plates and named captains) show at once. Pure and deterministic: keys
// are sorted, and nothing reads the clock, randomness or Map insertion order.
import type { AnyTimelineEvent, Priority } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { Cast, CastRole, ManeuverRule, PhaseSpan, PlannedManeuver, VolleyTurn } from '../contracts/maneuver';
import type { Beat, Direction, Limelight } from '../contracts/playback';
import { fnv1a32 } from '../hash';
import { ENGAGEMENT, type Engagement } from '../playback/engagement';
import type { BeatShape, ScheduleOptions } from '../playback/schedule';
import { roundFacts, sceneFacts } from './facts';
import { PULSE_GAP_MAX_MS } from '../playback/constants';
import { guestPresence } from './guests';
import { directorOf, volleysOf, DIRECTOR_TARGET_MS } from './director';
import { limelightOf } from './limelight';
import { fuseRanges, localDay } from '../playback/schedule';
import { CLOSE_SLIDE_MS, PACE_RULES, RULE, castOf, seatAt, shortForm, spanMs, subjectOf, sweepPhases, type PaceRule } from './pace';
import type { DomainPack, Move, RoundFacts } from './types';

/** The cast parts that act, and so can't be moved by anyone else during a protected moment. */
export const ACTING_ROLES: readonly CastRole[] = ['subject', 'agent', 'support', 'attachment', 'target'];
const ACTING = ACTING_ROLES;

/**
 * The attention budget (22 C10, revising B7): at most this many labels show at once, counting the
 * pieces' plates a maneuver lights (its subject, frontier or target is an objective or a threat: the
 * plates that show only while cast, 19 L7, each wearing a note, 22 B6) and the captains it names (its
 * flying crew, 22 B9). A merge with its author and two reviewers takes all four. Light work, ornament
 * and the standing plates (stars, planets, stations) don't count.
 */
export const ATTENTION_MAX = 4;
/**
 * The arc climax (22 C4): the facility's split beam strikes the work this long into the merge's echo
 * (its charge, 700 ms, and the beam's run, 600): the close of that work plays from then.
 */
export const ARC_IMPACT_MS = 1300;
/** The least time a labelled interaction holds its place in that budget, so its note can be read (22 B7). */
export const NOTE_MIN_MS = 1800;
/**
 * A beat with this many arrivals brings them in quietly, a little apart, with no plates (the interpreter's crowd,
 * 2026-10-13); and this many creations in a beat play as one sector sweep (27 E7, M-32). `pace.ts` writes the
 * sweep rule's nominal length with the literal; a test keeps the two equal.
 */
export const CROWD_MIN = 4;
/**
 * A captain's turn in a maneuver they fly (22 B9, R8): their ship arrives as the work starts, their
 * plate unfurls to name and part over `CREW_FOLD_MS`, stays fully open through the work and at least
 * `CREW_HOLD_MS` after it (longer if the payoff runs on), and at least `CREW_OPEN_MIN_MS` in all, then
 * folds over `CREW_FOLD_MS`, and only then does the ship leave. Neither animation counts toward either
 * minimum: they are times the plate is whole and still, to be read (the user's second look: 1 s after
 * the work read too short).
 */
export const CREW_HOLD_MS = 1500;
export const CREW_OPEN_MIN_MS = 1500;
export const CREW_FOLD_MS = 520;
/**
 * One naming turn of a volley (27 E6, M-31, 15 §10): a plate's unfurl, its least open time and its fold, so each
 * turn's names are read before the next turn's open. A volley's echo stretches to hold all its turns.
 */
export const VOLLEY_TURN_MS = 2 * CREW_FOLD_MS + CREW_OPEN_MIN_MS;

/**
 * When, from a maneuver's start, it claims its attention places and its plates show (27 E2, R11): the
 * act's start, once its cast has arrived. The tell and the gather (travel) ask for no places. 0 if
 * there is no act.
 */
export const claimMs = (phases: readonly PhaseSpan[]): number => phases.find((x) => x.phase === 'act')?.atMs ?? 0;

/**
 * When, from a maneuver's start, its flying crew's plates open (the act's start: the ship has
 * arrived, and the unfurl begins) and close (the fold begins: the work's end plus `CREW_HOLD_MS`, no
 * sooner than `CREW_OPEN_MIN_MS` after the unfurl ends, or later when the payoff runs on until the
 * disperse), and when the ships leave (once folded).
 */
export function crewTimes(phases: readonly PhaseSpan[]): { openMs: number; closeMs: number; leaveMs: number } {
  const span = (p: string) => phases.find((x) => x.phase === p);
  const end = (p?: PhaseSpan) => (p ? p.atMs + p.durMs : undefined);
  const openMs = claimMs(phases);
  const workEnd = end(span('land')) ?? end(span('act')) ?? 0;
  const restAt = span('disperse')?.atMs ?? Math.max(0, ...phases.map((x) => x.atMs + x.durMs));
  const closeMs = Math.max(workEnd + CREW_HOLD_MS, openMs + CREW_FOLD_MS + CREW_OPEN_MIN_MS, restAt - CREW_FOLD_MS);
  return { openMs, closeMs, leaveMs: closeMs + CREW_FOLD_MS };
}

/** How long a pass's plate rides with its ship (27 F2): it unfurls, stays whole `NOTE_MIN_MS` to be read, and folds. */
export const PASS_RIDE_MS = CREW_FOLD_MS + NOTE_MIN_MS + CREW_FOLD_MS;

/**
 * A pass's crew (27 F2, `PaceRule.passes`): the ship flies through its spot as the act starts, so the plate opens
 * there and rides with the ship for `PASS_RIDE_MS`, and the ship leaves at once.
 */
export function passTimes(phases: readonly PhaseSpan[]): { openMs: number; closeMs: number; leaveMs: number } {
  const openMs = claimMs(phases);
  return { openMs, closeMs: openMs + CREW_FOLD_MS + NOTE_MIN_MS, leaveMs: openMs };
}

/** Whether a rule's ships fly a turn for it (a narrative or essential maneuver with a crew that travels). */
const flies = (rule: PaceRule, cast: Cast, phases: readonly PhaseSpan[]) =>
  rule.tier !== 'ornament' && rule.turn !== false && (cast.agent?.length ?? 0) > 0 && phases.some((p) => p.phase === 'gather');

/** The cast parts whose plates a maneuver lights (the interpreter's `LABELLED`). */
const NOTED: readonly CastRole[] = ['subject', 'frontier', 'target'];
/** The rules that bring a piece in: in a crowd they enter quietly, and ask for no attention. */
const ARRIVING: ReadonlySet<string> = new Set([RULE.pieceAppear, RULE.threatEmerge]);

/**
 * The sequencer's overlaps (27 E4, 05 §8.5 P-3, P-5). The app never sets it (`SEQUENCE_ON`): it exists so
 * the pacing ledger can measure each part with it undone.
 */
export interface SequenceOptions {
  /** P3: a maneuver's tell and gather play during the previous one's echo and disperse (no shared actor at the act). */
  seams: boolean;
  /** P4: a captain's next sortie sets off as the last one's ship leaves, so it never flies home between. */
  near: boolean;
}
export const SEQUENCE_ON: SequenceOptions = { seams: true, near: true };

/**
 * A captain whose next turn's gather starts within this long of their ship's release waits near the
 * work instead of flying home and out again (27 E4 P4, 05 §8.5 P-7, 15 §10).
 */
export const STAY_NEAR_MS = 3000;

/**
 * P3: where `d` may start when it waits for `p` only through a hold, sharing no actor with it. `endMs`
 * is `p`'s end, `tailMs` its echo and disperse, `claimMs` `d`'s act start: `d`'s act starts at or after
 * `endMs`, and only its tell and gather overlap `p`'s tail.
 */
export const seamStartMs = (endMs: number, tailMs: number, claimMs: number): number => endMs - Math.min(tailMs, claimMs);

/**
 * P4: where `d` may start when `p` and `d` fly the same person. `startMs` is `p`'s start, `workEndMs` its
 * work's end, `releaseMs` when its ship leaves, `gatherAtMs` where `d`'s gather starts: `d`'s tell
 * overlaps `p`'s fold, and `d`'s ship sets off as `p`'s leaves.
 */
export const nearStartMs = (startMs: number, workEndMs: number, releaseMs: number, gatherAtMs: number): number =>
  startMs + Math.max(workEndMs, releaseMs - gatherAtMs);

/**
 * P4 after a pass (27 F2): where `d` may start when `p`, a pass, flies the same person. `passMs` is when `p`'s
 * ship passes its spot, from `p`'s start: `d`'s gather starts no sooner, so its ship flies on into `d`'s sortie.
 */
export const passStartMs = (startMs: number, passMs: number, gatherAtMs: number): number => startMs + Math.max(0, passMs - gatherAtMs);

export interface PlanOptions {
  /** The sequencer's overlaps; default `SEQUENCE_ON`. */
  sequence?: SequenceOptions;
  /** The same priority the schedule used (`pacing`'s `priorityOf`); default `e.priority`. */
  priorityOf?(h: ScopeHistory, e: AnyTimelineEvent): Priority;
  /** The schedule's limelight (22 C6), so a beat plays as it was shaped. */
  limelight?: Limelight;
}

type Prio = (h: ScopeHistory, e: AnyTimelineEvent) => Priority;
const basePriority: Prio = (_h, e) => e.priority;

const asPace = (r: ManeuverRule): PaceRule => r as PaceRule;

// ---- Events by key ----

const eventIndex = new WeakMap<ScopeHistory, Map<string, AnyTimelineEvent>>();

/** A beat's events, in history order. */
function eventsOf(h: ScopeHistory, eventKeys: readonly string[]): AnyTimelineEvent[] {
  let idx = eventIndex.get(h);
  if (!idx) {
    idx = new Map((h.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
    eventIndex.set(h, idx);
  }
  return eventKeys.flatMap((k) => idx!.get(k) ?? []);
}

// ---- Drafting and sequencing ----

interface Draft {
  rule: PaceRule; mv: Move; e: AnyTimelineEvent; cast: Cast;
  durMs: number; protect: boolean; acting: Set<CanonicalKey>; startMs: number;
  /** The rule's phases for this move (its variant's, when it has one). */
  phases: readonly PhaseSpan[]; variant?: string;
  /** Cast members it has to itself while it plays (its variant's `holds`), and every member of its cast. */
  holds: Set<CanonicalKey>; all: Set<CanonicalKey>;
  /** Its agent and support: the people it flies (22 A11). */
  crew: Set<CanonicalKey>;
  /** Whether its crew's ships fly a turn for it (`flies`). */
  flying: boolean;
  /** Its crew flies through and on, holding no turn (27 F2, `PaceRule.passes`). */
  passes?: boolean;
  /**
   * How many labels it shows, at most `ATTENTION_MAX`: the pieces' plates it lights and the captains it
   * names (22 C10). A merge serving two pieces lights both. 0: it asks for no attention.
   */
  attends: number;
  /** The arc climax (22 C4): a merge's holders flown in for its closes; a close's merge, whose impact it plays at. */
  arc?: { holders?: CanonicalKey[]; merge?: Draft };
  /** Limelight didn't name it (22 C6): it plays unlabelled. In a crowded beat it's montage too (22 C5): quicker, no held turn. */
  quiet?: boolean; montage?: boolean;
  /** The director chose its form (27 E5): a progress beam from a merge. It is always named, so every moment names its ADO cause (PA-Q3). */
  directed?: boolean;
  /** The director's daily climax (27 E5, P-22). */
  climax?: boolean;
  /** The director's montage form (27 E5b, P-24): the one plate it lights, with its event's note; no crew is named and no turn is held. */
  plate?: CanonicalKey;
  /** A volley's carrier (27 E6, M-31): its lead, its members (this one first) and the naming turns. */
  volley?: { lead: CanonicalKey; members: VolleyMember[]; turns: VolleyTurn[] };
  /** A sector sweep's carrier (27 E7, M-32): the beat's creations, as event keys in order, and their counts by role. */
  sweep?: { members: string[]; counts: { objective: number; threat: number } };
}

/** One merge of a volley as its carrier drafts it (27 E6): its event, author, approvers, work, and the holders of work it closes (M-23). */
export interface VolleyMember { eventKey: string; author?: CanonicalKey; approvers: CanonicalKey[]; targets: CanonicalKey[]; holders: CanonicalKey[] }

/**
 * Montage (22 C5, 05 §8 P-15): in a beat where labelled work would wait for a place, the work limelight
 * doesn't name plays alongside at this share of its phases' lengths, unlabelled, with no held turn.
 */
export const MONTAGE_PACE = 0.6;

/** A maneuver's key in limelight (22 C6): its event and its rule. */
export const turnKey = (eventKey: string, ruleId: string) => `${eventKey}|${ruleId}`;

/**
 * Applies the episode's limelight to a beat's drafts (22 C5, C6): a moment or an arc is always named;
 * anything else limelight didn't name plays quiet (unlabelled). When the named labels would still wait
 * for a place, the quiet ones play as montage: phases × `MONTAGE_PACE`, no held turn.
 */
function applyLimelight(drafts: Draft[], ll: Limelight | undefined): void {
  if (!ll) return;
  for (const d of drafts) {
    if (d.protect || d.arc || d.directed || d.sweep || ll.named.has(turnKey(d.e.eventKey, d.rule.id))) continue;
    d.quiet = true;
    d.attends = 0;
    d.durMs = spanMs(d.phases); // no held turn: that is a named turn's (05 §8 P-16)
  }
  const asked = drafts.filter((d) => !d.quiet).reduce((n, d) => n + d.attends, 0);
  if (asked <= ATTENTION_MAX) return;
  for (const d of drafts) {
    if (!d.quiet || d.protect) continue;
    d.montage = true;
    d.phases = d.phases.map((p) => ({ ...p, atMs: Math.round(p.atMs * MONTAGE_PACE), durMs: Math.round(p.durMs * MONTAGE_PACE) }));
    d.durMs = spanMs(d.phases);
  }
}

/** One maneuver's base turn (22 C6): when it plays in its beat (no limelight yet), who flies or acts in it, and whether it's a moment. */
export interface Turn { key: string; startMs: number; endMs: number; people: CanonicalKey[]; always: boolean }

/** A beat's base turns, in start order, and its length: what limelight decides over (22 C6). */
export function turnsOf(h: ScopeHistory, events: readonly AnyTimelineEvent[], f: RoundFacts, rules: readonly ManeuverRule[] = PACE_RULES, prio: Prio = basePriority, seq: SequenceOptions = SEQUENCE_ON, dir?: Direction): { turns: Turn[]; durationMs: number } {
  const drafts = draftsOf(h, events, f, rules, prio, undefined, dir);
  sequence(drafts, seq);
  const turns = drafts.map((d): Turn => {
    const crew = [...d.crew].sort();
    const actor = actorOfMove(d.mv) ?? d.e.changedBy ?? null;
    // A montage names no one (P-24): its crew isn't counted as named, though it still keeps them busy.
    return { key: turnKey(d.e.eventKey, d.rule.id), startMs: d.startMs, endMs: d.startMs + heldMs(d), people: d.plate || d.sweep ? [] : crew.length ? crew : actor ? [actor] : [], always: d.protect || !!d.arc || !!d.directed || !!d.sweep };
  }).sort((a, b) => a.startMs - b.startMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { turns, durationMs: Math.max(0, ...turns.map((t) => t.endMs)) };
}

/** One maneuver of a beat as the director reads it (27 E5): its base draft, with no limelight and no direction. */
export interface BaseMoment {
  key: string; eventKey: string; rule: string; variant?: string;
  protect: boolean;
  /** A close that rides its merge (M-23): not a moment of its own. */
  arcClose: boolean;
  /** A merge whose work closes in the same beat. */
  arcMerge: boolean;
  /** Placed ahead of a moment in its beat (the sequencer's introduction of a piece the moment acts on): it keeps its play. */
  ahead: boolean;
  /** Its author or holder (after the arcs), if it has one. */
  agent?: CanonicalKey;
  /** Who flies it (its agent and support, after the arcs). */
  people: CanonicalKey[];
  /** The work a merge served (the cast's targets). */
  targets: CanonicalKey[];
  subject?: CanonicalKey;
  /** The whole length of its own form, ms. */
  fullMs: number;
  startMs: number;
  /** The facility it casts (a merge's: the repository it merges into). */
  facility?: CanonicalKey;
  /** A volley's carrier (27 E6): every member's author, in member order. */
  volley?: { authors: CanonicalKey[] };
  /** A sector sweep's carrier (27 E7): every piece it reveals, which the volleys' B-15 guard counts as touched. */
  swept?: CanonicalKey[];
}

/**
 * One beat's base drafts for the director (27 E5), after the sequencer, in start order: what plays with
 * no limelight and no direction yet. `dir` (27 E6) carries only the volleys: their carriers drafted with the union. Pure.
 */
export function momentsOf(h: ScopeHistory, events: readonly AnyTimelineEvent[], f: RoundFacts, rules: readonly ManeuverRule[] = PACE_RULES, prio: Prio = basePriority, seq: SequenceOptions = SEQUENCE_ON, dir?: Direction): BaseMoment[] {
  const drafts = draftsOf(h, events, f, rules, prio, undefined, dir);
  sequence(drafts, seq);
  return drafts.map((d): BaseMoment => ({
    key: turnKey(d.e.eventKey, d.rule.id), eventKey: d.e.eventKey, rule: d.rule.id, ...(d.variant ? { variant: d.variant } : {}),
    protect: d.protect, arcClose: !!d.arc?.merge, arcMerge: drafts.some((x) => x.arc?.merge === d),
    ahead: !d.protect && !!d.rule.introduces && drafts.some((x) => x.protect && (d.cast.subject ?? []).some((k) => x.all.has(k))),
    ...(d.cast.agent?.[0] ? { agent: d.cast.agent[0] } : {}),
    people: [...d.crew].sort(), targets: [...(d.cast.target ?? [])],
    ...(d.cast.subject?.[0] ? { subject: d.cast.subject[0] } : {}),
    fullMs: spanMs(d.phases), startMs: d.startMs,
    ...(d.cast.facility?.[0] ? { facility: d.cast.facility[0] } : {}),
    ...(d.volley ? { volley: { authors: [...new Set(d.volley.members.flatMap((x) => (x.author ? [x.author] : [])))] } } : {}),
    ...(d.sweep ? { swept: [...(d.cast.subject ?? [])] } : {}),
  })).sort((a, b) => a.startMs - b.startMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Who made a move, where it says. */
const actorOfMove = (mv: Move): CanonicalKey | null => ('actor' in mv ? mv.actor : null) ?? (mv.m === 'attach' ? mv.author : null);

const actingOf = (cast: Cast) => new Set(ACTING.flatMap((r) => cast[r] ?? []));
const shares = (a: Set<CanonicalKey>, b: Set<CanonicalKey>) => [...a].some((k) => b.has(k));
/** Whether `d` waits for `p`: they share an actor, or one has to itself a member of the other's cast. */
const blocks = (p: Draft, d: Draft) => shares(p.acting, d.acting) || shares(p.holds, d.all) || shares(d.holds, p.all);
/** The people who fly in a maneuver: its agent and its support (22 A11). */
const crewOf = (cast: Cast) => new Set([...(cast.agent ?? []), ...(cast.support ?? [])]);
/** Where a maneuver's work ends, from its start: its land's end, else its act's (`crewTimes`' measure). */
export const workEndOf = (phases: readonly PhaseSpan[]): number => {
  const end = (p: string) => { const x = phases.find((q) => q.phase === p); return x ? x.atMs + x.durMs : undefined; };
  return end('land') ?? end('act') ?? 0;
};
/** When a flying maneuver's ships leave, from its start: once folded, for a quiet or montage turn (no held turn) as the work ends, or for a pass (27 F2) as it passes. */
const releaseOf = (d: Draft): number => (d.passes ? claimMs(d.phases) : d.quiet || d.plate ? workEndOf(d.phases) : crewTimes(d.phases).leaveMs);
/** Where a maneuver's gather starts, from its start. */
export const gatherAtOf = (phases: readonly PhaseSpan[]): number => phases.find((x) => x.phase === 'gather')?.atMs ?? 0;
/** A maneuver's echo and disperse together: the tail its successor's tell and gather may overlap (P3). */
export const tailOf = (phases: readonly PhaseSpan[]): number => phases.filter((x) => x.phase === 'echo' || x.phase === 'disperse').reduce((n, x) => n + x.durMs, 0);
/**
 * Where the placed maneuvers that fly any of `d`'s crew let it start: one person does one thing at a
 * time (22 A11, R8). Their end, or (P4) when both fly, as the first's ship leaves (`nearStartMs`). A pass's
 * ship (27 F2) is free as it passes: `d`'s ship sets off from there, carrying on (`passStartMs`).
 */
const crewBusy = (d: Draft, placed: readonly Draft[], seq: SequenceOptions): number[] =>
  placed.filter((p) => p !== d && shares(p.crew, d.crew)).map((p) =>
    !(seq.near && p.flying && d.flying) ? p.startMs + p.durMs
    : p.passes ? passStartMs(p.startMs, releaseOf(p), gatherAtOf(d.phases))
    : nearStartMs(p.startMs, workEndOf(p.phases), releaseOf(p), gatherAtOf(d.phases)));
/** Where `d` may start when it waits for `p` through `blocks`: `p`'s end, or (P3) when they share no actor, `seamStartMs`. */
const blockedUntil = (p: Draft, d: Draft, seq: SequenceOptions): number => {
  const end = p.startMs + p.durMs;
  return seq.seams && !shares(p.acting, d.acting) ? seamStartMs(end, tailOf(p.phases), claimMs(d.phases)) : end;
};

/**
 * Every (move, rule) match among the beat's events, in event, move and rule order. Light rules aside.
 * The director's `dir` (27 E5, default the limelight's) picks each moment's form as it is drafted, before
 * the arcs: `short` takes the rule's short form (none: it stays full), `progress` plays a merge as the
 * progress beam, always named.
 */
function draftsOf(h: ScopeHistory, events: readonly AnyTimelineEvent[], f: RoundFacts, rules: readonly ManeuverRule[], prio: Prio, ll?: Limelight, dir: Direction | undefined = ll?.direction): Draft[] {
  const out: Draft[] = [];
  const beam = dir ? rules.find((r) => r.id === RULE.agentProgress) : undefined;
  for (const e of events) {
    if (prio(h, e) === 'low') continue;
    for (const mv of f.moves.get(e.eventKey) ?? []) {
      for (const r of rules) {
        let rule = asPace(r);
        if (rule.light || !rule.match(mv, f) || (rule.when && !rule.when(mv, e, f))) continue;
        const key = turnKey(e.eventKey, rule.id);
        const form = dir?.forms.get(key);
        if (form === 'light') continue; // light work (27 E5c, P-26): the event falls to `lights`, and costs the schedule nothing
        let directed = false;
        let cast: Cast;
        let protect: boolean;
        let phases: readonly PhaseSpan[];
        let variant: string | undefined;
        let holdRoles: readonly CastRole[] = [];
        let shortened = false;
        if (form === 'progress' && beam && rule.id === RULE.attachmentMerge) {
          // The merge plays as a captain's progress beam: its own cast and phases, not protected, no holds.
          rule = asPace(beam);
          cast = rule.cast(mv, e, f);
          protect = false;
          phases = rule.phases;
          directed = true;
        } else {
          cast = rule.cast(mv, e, f);
          protect = !!rule.protect || !!rule.protectWhen?.(mv, f);
          const v = rule.variant?.(mv, e, f) ?? null;
          const sf = form === 'short' || form === 'montage' ? shortForm(rule, v?.name) : null;
          phases = sf?.phases ?? v?.phases ?? rule.phases;
          variant = sf?.name ?? v?.name;
          shortened = !!sf;
          holdRoles = sf ? [] : (v?.holds ?? []);
        }
        const holds = new Set(holdRoles.flatMap((role) => cast[role] ?? []));
        const lit = new Set(NOTED.flatMap((p) => (cast[p] ?? []).filter((k) => { const role = f.pieces.get(k)?.role; return role === 'objective' || role === 'threat'; })));
        const flying = flies(rule, cast, phases);
        // A montage (27 E5b, P-24) is its short form lighting one plate, naming no crew and holding no turn; with
        // no short form or no plate to light it stays a short form (or full).
        const plate = form === 'montage' && shortened ? [...lit][0] : undefined;
        // Its labels: the pieces it lights, then the captains it names, at most the budget (22 C10).
        const attends = rule.tier === 'ornament' ? 0 : plate ? 1 : Math.min(ATTENTION_MAX, lit.size + (flying ? crewOf(cast).size : 0));
        // A flying crew's turn holds the maneuver open until their ships leave (22 B9), so their next
        // work (crewBusy) never cuts the hold short. A pass (27 F2) holds no turn.
        const passes = flying && !!rule.passes;
        const durMs = flying && !plate && !passes ? Math.max(spanMs(phases), crewTimes(phases).leaveMs) : spanMs(phases);
        // No turn (22 C7, P-16): no ship flies it, so no one in it is kept busy.
        out.push({
          rule, mv, e, cast, durMs, protect, acting: actingOf(cast), crew: rule.turn === false ? new Set() : crewOf(cast), flying, attends, startMs: 0, phases, holds,
          all: new Set(Object.values(cast).flat()), ...(variant ? { variant } : {}), ...(directed ? { directed } : {}), ...(dir?.climaxes.has(key) ? { climax: true } : {}),
          ...(passes ? { passes } : {}),
          ...(plate ? { plate } : {}),
        });
      }
    }
  }
  // A crowd of arrivals comes in quietly, with no plates: it asks for no attention.
  const arriving = out.filter((d) => ARRIVING.has(d.rule.id));
  if (arriving.length >= CROWD_MIN) for (const d of arriving) d.attends = 0;
  sweepCreations(out, f, rules);
  joinVolleys(out, f, dir);
  arcsOf(out);
  turnVolleys(out, f);
  applyLimelight(out, ll);
  return out;
}

/**
 * The sector sweep (27 E7, 05 §8 M-32): a beat with `CROWD_MIN` or more creations (a piece's `appear`) plays them as
 * one sweep from the star, when the rules hold it. The first creation in event order carries it: its rule is the
 * sweep, its cast every created piece and their seats, with no crew; it asks the star's one note. The other
 * creations' drafts are dropped. Not a moment, so nothing about it is protected or held.
 */
function sweepCreations(out: Draft[], f: RoundFacts, rules: readonly ManeuverRule[]): void {
  const rule = rules.find((r) => r.id === RULE.regionSweep);
  const made = out.filter((d) => ARRIVING.has(d.rule.id) && d.mv.m === 'appear');
  if (!rule || made.length < CROWD_MIN) return;
  const carrier = made[0]!;
  const cast = castOf({ subject: made.flatMap((d) => d.cast.subject ?? []), seat: made.flatMap((d) => d.cast.seat ?? []) });
  const roleOf = (k: CanonicalKey) => f.pieces.get(k)?.role;
  const subjects = cast.subject ?? [];
  const phases = sweepPhases(subjects.length);
  const sweep: Draft = {
    rule: asPace(rule), mv: carrier.mv, e: carrier.e, cast, durMs: spanMs(phases), protect: false, acting: actingOf(cast), startMs: 0, phases,
    holds: new Set(), all: new Set(Object.values(cast).flat()), crew: new Set(), flying: false, attends: 1,
    sweep: { members: made.map((d) => d.e.eventKey), counts: { objective: subjects.filter((k) => roleOf(k) === 'objective').length, threat: subjects.filter((k) => roleOf(k) === 'threat').length } },
  };
  const gone = new Set(made);
  out.splice(0, out.length, ...out.flatMap((d) => (d === carrier ? [sweep] : gone.has(d) ? [] : [d])));
}

/**
 * The round's opening run (27 E7b, 05 §8 B-22): the raw beats (the schedule's groups before fusion) from the first
 * that drafts anything, over the consecutive beats whose every draft is a creation (or a sweep of them), each on
 * one local day, `lo`'s, none drafting nothing. When the run spans two beats or more and holds `CROWD_MIN`
 * creations or more, its range `[lo, hi]` fuses into one beat, which then plays one sweep. Null otherwise, and
 * when `rules` lack the sweep. Pure.
 */
export function openingSweep(h: ScopeHistory, beats: readonly (readonly AnyTimelineEvent[])[], f: RoundFacts, rules: readonly ManeuverRule[], prio: Prio, tz: string): [number, number] | null {
  if (!rules.some((r) => r.id === RULE.regionSweep)) return null;
  /** A beat's creations: null if it drafts nothing, -1 if any draft isn't a creation. */
  const made = (events: readonly AnyTimelineEvent[]): number | null => {
    const drafts = draftsOf(h, events, f, rules, prio);
    if (!drafts.length) return null;
    let n = 0;
    for (const d of drafts) {
      if (d.sweep) n += d.sweep.members.length;
      else if (ARRIVING.has(d.rule.id) && d.mv.m === 'appear') n++;
      else return -1;
    }
    return n;
  };
  /** A beat's local day, when its first and last events share one. */
  const dayOf = (events: readonly AnyTimelineEvent[]) => {
    const a = localDay(events[0]!.occurredAt, tz);
    return a === localDay(events.at(-1)!.occurredAt, tz) ? a : undefined;
  };
  let lo = -1;
  let n0: number | null = null;
  for (let i = 0; i < beats.length && lo < 0; i++) {
    if (!beats[i]!.length) continue;
    n0 = made(beats[i]!);
    if (n0 !== null) lo = i;
  }
  if (lo < 0 || n0 === null || n0 < 0) return null;
  const day = dayOf(beats[lo]!);
  if (day === undefined) return null;
  let total = n0;
  let hi = lo;
  for (let i = lo + 1; i < beats.length; i++) {
    const events = beats[i]!;
    if (!events.length || dayOf(events) !== day) break;
    const n = made(events);
    if (n === null || n < 0) break;
    total += n;
    hi = i;
  }
  return hi > lo && total >= CROWD_MIN ? [lo, hi] : null;
}

/** The plates a cast lights: its subject, frontier and targets that are objectives or threats. */
const litOf = (cast: Cast, f: RoundFacts) => new Set(NOTED.flatMap((p) => (cast[p] ?? []).filter((k) => { const role = f.pieces.get(k)?.role; return role === 'objective' || role === 'threat'; })));

/** A draft's sets and label count from its cast, after its cast changed (a volley's union, 27 E6). */
function recast(d: Draft, f: RoundFacts): void {
  d.acting = actingOf(d.cast);
  d.crew = d.rule.turn === false ? new Set() : crewOf(d.cast);
  d.all = new Set(Object.values(d.cast).flat());
  d.flying = flies(d.rule, d.cast, d.phases);
  d.attends = d.rule.tier === 'ornament' ? 0 : d.plate ? 1 : Math.min(ATTENTION_MAX, litOf(d.cast, f).size + (d.flying ? d.crew.size : 0));
}

/**
 * The volley draft (27 E6, 05 §8.4a M-31), before the arcs: each carrier (its key in `dir.volleys`) takes its
 * members' casts, and the members it took (`joined`) are dropped. The lead fires; the other authors, then every
 * member's approvers, fly as support; every member's tender is a subject and an attachment; the targets are the
 * union, in member order. The carrier keeps its own form's phases and holds.
 */
function joinVolleys(out: Draft[], f: RoundFacts, dir: Direction | undefined): void {
  if (!dir?.volleys?.size) return;
  const byKey = new Map(out.filter((d) => d.rule.id === RULE.attachmentMerge).map((d) => [turnKey(d.e.eventKey, d.rule.id), d]));
  const gone = new Set<Draft>();
  for (const [key, v] of dir.volleys) {
    const carrier = byKey.get(key);
    if (!carrier) continue;
    const drafts = v.members.flatMap((k) => byKey.get(k) ?? []);
    const members: VolleyMember[] = drafts.map((d) => {
      const author = d.cast.agent?.[0];
      return { eventKey: d.e.eventKey, ...(author ? { author } : {}), approvers: [...(d.cast.support ?? [])], targets: [...(d.cast.target ?? [])], holders: [] };
    });
    const uniq = (ks: (CanonicalKey | undefined)[]) => [...new Set(ks.filter((k): k is CanonicalKey => !!k))];
    const tenders = uniq(drafts.map((d) => d.cast.attachment?.[0]));
    const support = uniq([...members.map((m) => m.author), ...members.flatMap((m) => m.approvers)]).filter((k) => k !== v.lead);
    carrier.cast = {
      ...carrier.cast, agent: [v.lead], ...(support.length ? { support } : {}), subject: tenders, attachment: tenders,
      target: uniq(members.flatMap((m) => m.targets)),
    };
    if (!support.length) delete carrier.cast.support;
    recast(carrier, f);
    carrier.volley = { lead: v.lead, members, turns: [] };
    for (const d of drafts) if (d !== carrier) gone.add(d);
  }
  if (gone.size) out.splice(0, out.length, ...out.filter((d) => !gone.has(d)));
}

/**
 * A volley's naming turns (27 E6, M-31, P-6), pure: one per member in order, its plates that member's noted
 * targets (`lit`; the same piece may show again with the next member's note), at most `ATTENTION_MAX`; its names
 * that member's author, approvers and holders not yet named, up to the budget the plates leave. The overflow
 * carries into the next turn, and name-only turns follow the last member. Each person is named once.
 */
export function volleyTurns(members: readonly VolleyMember[], lit: ReadonlySet<CanonicalKey>): VolleyTurn[] {
  const named = new Set<CanonicalKey>();
  const queue: VolleyTurn['names'][number][] = [];
  const push = (key: CanonicalKey | undefined, eventKey: string, part: 'agent' | 'support' | 'holder') => {
    if (!key || named.has(key)) return;
    named.add(key);
    queue.push({ key, eventKey, part });
  };
  const turns: VolleyTurn[] = [];
  for (const m of members) {
    push(m.author, m.eventKey, 'agent');
    for (const k of m.approvers) push(k, m.eventKey, 'support');
    for (const k of m.holders) push(k, m.eventKey, 'holder');
    const plates = m.targets.filter((k) => lit.has(k)).slice(0, ATTENTION_MAX);
    turns.push({ eventKey: m.eventKey, plates, names: queue.splice(0, ATTENTION_MAX - plates.length) });
  }
  while (queue.length) {
    const names = queue.splice(0, ATTENTION_MAX);
    turns.push({ eventKey: names[0]!.eventKey, plates: [], names });
  }
  return turns;
}

/**
 * A volley's phases (27 E6): the echo lengthens so that every turn opens before the disperse,
 * `disperse.atMs ≥ claimMs + turns × VOLLEY_TURN_MS`; the later phases shift with it. A pair under the full
 * LINK needs no stretch (1200 + 5080 ≤ 6300).
 */
export function volleyPhases(ps: readonly PhaseSpan[], turns: readonly VolleyTurn[]): readonly PhaseSpan[] {
  const echo = ps.find((p) => p.phase === 'echo');
  const restAt = ps.find((p) => p.phase === 'disperse')?.atMs ?? spanMs(ps);
  const extra = claimMs(ps) + turns.length * VOLLEY_TURN_MS - restAt;
  if (!echo || extra <= 0) return ps;
  return ps.map((p) => (p === echo ? { ...p, durMs: p.durMs + extra } : p.atMs > echo.atMs ? { ...p, atMs: p.atMs + extra } : p));
}

/** After the arcs (27 E6): each carrier's turns, its stretched phases, and its length and labels from them. */
function turnVolleys(out: Draft[], f: RoundFacts): void {
  for (const d of out) {
    if (!d.volley) continue;
    d.volley.turns = volleyTurns(d.volley.members, litOf(d.cast, f));
    d.phases = volleyPhases(d.phases, d.volley.turns);
    recast(d, f);
    d.durMs = d.flying ? Math.max(spanMs(d.phases), crewTimes(d.phases).leaveMs) : spanMs(d.phases);
  }
}

/** A close's phases inside an arc (22 C4): the facility's beam is its cause, so only the turn, the glide and the blossom. */
const ARC_CLOSE_PHASES: readonly PhaseSpan[] = [
  { phase: 'land', atMs: 0, durMs: CLOSE_SLIDE_MS },
  { phase: 'echo', atMs: CLOSE_SLIDE_MS, durMs: 400 },
  { phase: 'disperse', atMs: CLOSE_SLIDE_MS + 400, durMs: 300 },
];
/** The closes that play inside a merge: a story's or a bug's close of work the merge served. */
const CLOSES: ReadonlySet<string> = new Set([RULE.objectiveAccomplish, RULE.threatAccomplish]);

/**
 * The arc climax (22 C4, 05 §8 M-23): a merge and the close of work it served, in one beat, are one
 * moment. The facility's split beam is the finishing blow: the close (variant `arc`, its turn, glide
 * and blossom only) plays at the beam's impact (`ARC_IMPACT_MS` into the merge's echo), and its holder,
 * rather than flying a sortie of their own, flies into the merge's formation as support, named
 * *Closed it*. The close asks no attention of its own: the merge lights its plate.
 */
function arcsOf(drafts: Draft[]): void {
  const merges = drafts.filter((d) => d.rule.id === RULE.attachmentMerge);
  for (const c of drafts) {
    if (!CLOSES.has(c.rule.id) || c.arc) continue;
    const piece = c.cast.subject?.[0];
    const m = piece ? merges.find((x) => (x.cast.target ?? []).includes(piece)) : undefined;
    if (!m) continue;
    const holder = c.cast.agent?.[0];
    const { agent: _agent, support: _support, ...rest } = c.cast;
    void _agent; void _support;
    c.cast = rest;
    c.phases = ARC_CLOSE_PHASES;
    c.variant = 'arc';
    c.durMs = spanMs(ARC_CLOSE_PHASES);
    c.acting = actingOf(c.cast);
    c.crew = new Set();
    c.all = new Set(Object.values(c.cast).flat());
    c.attends = 0;
    c.arc = { merge: m };
    if (holder && !(m.cast.agent ?? []).includes(holder) && !(m.cast.support ?? []).includes(holder)) {
      m.cast = { ...m.cast, support: [...(m.cast.support ?? []), holder] };
      m.acting.add(holder);
      m.crew.add(holder);
      m.all.add(holder);
      m.arc = { holders: [...(m.arc?.holders ?? []), holder] };
      m.attends = Math.min(ATTENTION_MAX, m.attends + 1);
      // In a volley (27 E6), the holder is named with the member whose work held the closed piece.
      m.volley?.members.find((x) => x.targets.includes(piece!))?.holders.push(holder);
    }
  }
}

/**
 * How long a maneuver holds its place in the attention budget: a labelled one long enough to read its note, and a
 * pass (27 F2) until its crew's plate, riding with the ship from the act's start, has folded (`passTimes`).
 */
const heldMs = (d: Draft) => (d.attends ? Math.max(d.durMs, NOTE_MIN_MS, d.passes ? claimMs(d.phases) + PASS_RIDE_MS : 0) : d.durMs);

/**
 * The earliest start at or after `fromMs` at which `d` keeps the attention budget (22 B7, C10, 27 E2):
 * a labelled one holds its places over `[start + claim, start + held)` (it travels free before its
 * act), and over that window the labels it shows and those the labelled interactions already placed
 * show come to `ATTENTION_MAX` at most. So a waiting maneuver sets off early enough to arrive just as
 * places free. Placed ones never move, so the budget holds however the placing order runs.
 * Unlabelled: `fromMs`.
 */
function attentionFrom(d: Draft, placed: readonly Draft[], fromMs: number): number {
  if (!d.attends) return fromMs;
  const others = placed.filter((p) => p !== d && p.attends);
  const claim = claimMs(d.phases);
  const lit = (at: number) => others.filter((p) => p.startMs + claimMs(p.phases) <= at && at < p.startMs + heldMs(p)).reduce((n, p) => n + p.attends, 0);
  const tries = [fromMs, ...others.map((p) => p.startMs + heldMs(p) - claim).filter((t) => t > fromMs)].sort((a, b) => a - b);
  for (const t of tries) {
    const until = t + heldMs(d);
    const points = [t + claim, ...others.map((p) => p.startMs + claimMs(p.phases)).filter((s) => s > t + claim && s < until)];
    if (points.every((at) => lit(at) + d.attends <= ATTENTION_MAX)) return t;
  }
  return tries.at(-1)!; // unreachable: after every placed hold ends, none plays
}

/**
 * Sets each draft's start. A protected moment starts once every earlier moment it shares an actor
 * with has finished (a leading moment, a merge, counts as earlier than the rest of its beat); any
 * other maneuver starts once every moment whose actors it shares has, and after the rules it waits for
 * in the same event. A moment that holds a cast member (a first merge's transforming facility) also
 * holds back anything else that casts it. One person does one thing at a time (22 A11, R8): any
 * maneuver starts once every one placed before it that flies the same person has finished, so a
 * captain travels, works, finishes, then moves on, never two sorties at once. And attention is
 * budgeted (22 B7, C10): a labelled interaction starts once its labels fit under `ATTENTION_MAX`.
 */
function sequence(drafts: Draft[], seq: SequenceOptions = SEQUENCE_ON): void {
  const timed: Draft[] = [];
  const at = (d: Draft, fromMs: number) => {
    d.startMs = attentionFrom(d, timed, fromMs);
    timed.push(d);
  };
  const end = (p: Draft) => p.startMs + p.durMs;
  const waited = (d: Draft, placed: readonly Draft[]) => {
    const waits = d.rule.waitsFor ?? [];
    return placed.filter((p) => p.e.eventKey === d.e.eventKey && waits.includes(p.rule.id)).map(end);
  };
  // The sector sweep (27 E7) goes first, at 0: it brings its pieces in, so anything else that casts one
  // of them starts once it ends (an underway would carve a piece still hidden). Its seats don't hold anyone back.
  const sweep = drafts.find((d) => d.sweep);
  if (sweep) at(sweep, 0);
  const sweptKeys = new Set(sweep?.cast.subject ?? []);
  const swept = (d: Draft) => (sweep && d !== sweep && shares(d.all, sweptKeys) ? end(sweep) : 0);
  // What brings a protected moment's cast member into the scene goes first, in event order: a
  // facility's jump-in, then the attachment's opening, ahead of its merge.
  const ahead = drafts.filter((s) => !s.protect && s.rule.introduces && drafts.some((d) => d.protect && (s.cast.subject ?? []).some((k) => d.all.has(k))));
  const placed: Draft[] = sweep ? [sweep] : [];
  for (const d of ahead) {
    at(d, Math.max(0, swept(d), ...waited(d, placed), ...crewBusy(d, placed, seq)));
    placed.push(d);
  }
  // Moments that lead (a merge) go next, then the rest, each in event order. A close inside an arc
  // (22 C4) plays at its merge's impact, whatever the merge holds.
  const moments: Draft[] = [...ahead];
  const order = drafts.filter((d) => d.protect && !d.arc?.merge).sort((a, b) => Number(!!b.rule.leads) - Number(!!a.rule.leads));
  for (const d of order) {
    at(d, Math.max(0, swept(d), ...moments.filter((p) => blocks(p, d)).map((p) => blockedUntil(p, d, seq)), ...crewBusy(d, moments, seq)));
    moments.push(d);
    for (const c of drafts.filter((x) => x.arc?.merge === d)) {
      c.startMs = d.startMs + phaseStart(d.phases, 'echo') + ARC_IMPACT_MS;
      timed.push(c);
      moments.push(c);
    }
  }
  const flown: Draft[] = [...moments];
  for (const d of drafts) {
    if (d === sweep) continue;
    if (!d.protect && !ahead.includes(d)) {
      at(d, Math.max(0, swept(d), ...moments.filter((p) => p.protect && blocks(p, d)).map((p) => blockedUntil(p, d, seq)), ...waited(d, placed), ...crewBusy(d, flown, seq)));
      flown.push(d);
    }
    if (!ahead.includes(d)) placed.push(d);
  }
}

/** Where a phase starts among `phases` (or where the last ends, if it has none). */
const phaseStart = (phases: readonly PhaseSpan[], phase: string) => phases.find((p) => p.phase === phase)?.atMs ?? Math.max(0, ...phases.map((p) => p.atMs + p.durMs));

/** The shape a beat's maneuvers give it: each event's earliest start (non-zero only), and the whole. */
export function shapeOf(h: ScopeHistory, events: readonly AnyTimelineEvent[], f: RoundFacts, rules: readonly ManeuverRule[] = PACE_RULES, prio: Prio = basePriority, ll?: Limelight, seq: SequenceOptions = SEQUENCE_ON): BeatShape {
  const drafts = draftsOf(h, events, f, rules, prio, ll);
  sequence(drafts, seq);
  const first = new Map<string, number>();
  let durationMs = 0;
  // A labelled one holds the beat open for its note's reading time too (22 B7), so the next beat's
  // never competes with it.
  for (const d of drafts) {
    first.set(d.e.eventKey, Math.min(first.get(d.e.eventKey) ?? Infinity, d.startMs));
    durationMs = Math.max(durationMs, d.startMs + heldMs(d));
  }
  const afterMs = new Map([...first].filter(([, ms]) => ms > 0));
  const essential = drafts.some((d) => d.rule.tier === 'essential');
  return { afterMs, durationMs, ...(essential ? { essential } : {}) };
}

// ---- Planning ----

const allKeys = (cast: Cast) => [...new Set(Object.values(cast).flat())].sort();

function planned(d: { rule: ManeuverRule; mv: Move; e: AnyTimelineEvent; cast: Cast; startMs: number; durMs: number; protect: boolean; acting: Set<CanonicalKey>; phases?: readonly PhaseSpan[]; variant?: string; holds?: Set<CanonicalKey>; arc?: Draft['arc']; quiet?: boolean; montage?: boolean; climax?: boolean; plate?: CanonicalKey; volley?: Draft['volley']; sweep?: Draft['sweep'] }): PlannedManeuver {
  const { mv } = d;
  const from = mv.m === 'climb' ? { from: mv.from } : {};
  const to = mv.m === 'climb' || mv.m === 'appear' || mv.m === 'settle' ? { to: mv.to } : {};
  return {
    id: d.rule.id, eventKey: d.e.eventKey, seed: fnv1a32(d.e.eventKey), cast: d.cast, phases: d.phases ?? d.rule.phases,
    afterMs: d.startMs, durationMs: d.durMs,
    ...(d.protect ? { protect: { keys: [...d.acting].sort(), windowMs: d.durMs } } : {}),
    ...from, ...to, keys: allKeys(d.cast), ...(d.variant ? { variant: d.variant } : {}),
    ...(d.holds?.size ? { holds: [...d.holds].sort() } : {}),
    ...(d.arc ? { arc: { ...(d.arc.holders ? { holders: [...d.arc.holders] } : {}), ...(d.arc.merge ? { merge: d.arc.merge.e.eventKey } : {}) } } : {}),
    ...(d.quiet ? { quiet: true } : {}), ...(d.montage || d.plate ? { montage: true } : {}), ...(d.plate ? { plate: d.plate } : {}),
    ...(d.climax ? { climax: true as const } : {}),
    ...(d.volley ? { volley: { lead: d.volley.lead, members: d.volley.members.map((x) => x.eventKey), turns: d.volley.turns } } : {}),
    ...(d.sweep ? { sweep: { members: [...d.sweep.members], counts: { ...d.sweep.counts } } } : {}),
  };
}

/** The other person in a change (05 §5 "subjects"): a new seat, an attachment's author, or the piece's seat. */
function otherOf(mv: Move, e: AnyTimelineEvent, f: RoundFacts): CanonicalKey | null {
  switch (mv.m) {
    case 'reseat': return mv.to;
    case 'attach': return mv.author;
    case 'settle': return f.attachments.get(mv.key)?.author ?? null;
    default: return seatAt(f, subjectOf(mv), e.occurredAt);
  }
}

/**
 * Light maneuvers (`agent.light`, engagement.lightActions): one per event that nothing else plays,
 * for whoever made the change and, when the level asks, the other person in it. At most
 * `actionsPerBeat`, `staggerS` apart. They run beside the schedule and cost it no time.
 */
function lights(h: ScopeHistory, events: readonly AnyTimelineEvent[], f: RoundFacts, rules: readonly ManeuverRule[], eng: Engagement, prio: Prio, busy: ReadonlySet<CanonicalKey> = new Set()): PlannedManeuver[] {
  const rule = rules.find((r) => asPace(r).light);
  if (!rule || !eng.lightActions) return [];
  const out: PlannedManeuver[] = [];
  for (const e of events) {
    if (out.length >= eng.actionsPerBeat) break;
    if (prio(h, e) === 'low') continue;
    const mv = (f.moves.get(e.eventKey) ?? []).find((m) => rule.match(m, f));
    if (!mv) continue;
    const base = rule.cast(mv, e, f);
    // Someone already flying in the beat's maneuvers isn't sent off on a light one too (22 A11): no light
    // for a busy agent, and a busy other person doesn't lend a hand.
    const agent = base.agent?.[0] ?? null;
    if (agent && busy.has(agent)) continue;
    const other = eng.subjects ? otherOf(mv, e, f) : null;
    const cast = castOf({ ...base, support: [...(base.support ?? []), other !== agent ? other : null].filter((k) => !k || !busy.has(k)) });
    if (!cast.agent && !cast.support) continue;
    const startMs = out.length * Math.round(eng.staggerS * 1000);
    out.push(planned({ rule, mv, e, cast, startMs, durMs: spanMs(rule.phases), protect: false, acting: new Set() }));
  }
  return out;
}

/**
 * What a beat plays (14 §2.7). An accented beat plays every rule its moves match, sequenced around
 * its protected moments; events no rule plays get light maneuvers when the engagement allows. An
 * unaccented beat (Low, or cut by the budget) gets light maneuvers only.
 */
export function planManeuvers(h: ScopeHistory, beat: Beat, f: RoundFacts, rules: readonly ManeuverRule[] = PACE_RULES, eng: Engagement = ENGAGEMENT.calm, opts: PlanOptions = {}): PlannedManeuver[] {
  const prio = opts.priorityOf ?? basePriority;
  const events = eventsOf(h, beat.eventKeys);
  if (!beat.accented) return lights(h, events, f, rules, eng, prio);
  const drafts = draftsOf(h, events, f, rules, prio, opts.limelight);
  sequence(drafts, opts.sequence ?? SEQUENCE_ON);
  // A volley's members (27 E6) and a sweep's (27 E7) play in their carrier: none gets light work.
  const played = new Set(drafts.flatMap((d) => [d.e.eventKey, ...(d.volley?.members.map((x) => x.eventKey) ?? []), ...(d.sweep?.members ?? [])]));
  const busy = new Set(drafts.flatMap((d) => [...d.crew]));
  return [...drafts.map(planned), ...lights(h, events.filter((e) => !played.has(e.eventKey)), f, rules, eng, prio, busy)];
}

/** When a planned flying maneuver's ships leave, from its start (`releaseOf`, from the plan). */
export const releaseOfPlay = (m: Pick<PlannedManeuver, 'id' | 'phases' | 'quiet' | 'plate'>): number => (passesPlay(m) ? claimMs(m.phases) : m.quiet || m.plate ? workEndOf(m.phases) : crewTimes(m.phases).leaveMs);

/** Whether a planned maneuver's crew passes (27 F2, `PaceRule.passes`): flies through and on, holding no turn. */
export function passesPlay(m: Pick<PlannedManeuver, 'id'>): boolean {
  return !!(PACE_RULES as readonly PaceRule[]).find((r) => r.id === m.id)?.passes;
}

/** Whether a planned maneuver sends its crew's ships on a turn: the rule's own test, from the plan. */
export function flyingPlay(m: PlannedManeuver): boolean {
  const rule = (PACE_RULES as readonly PaceRule[]).find((r) => r.id === m.id);
  return !!rule && !rule.light && rule.tier !== 'ornament' && rule.turn !== false && (m.cast.agent?.length ?? 0) > 0 && m.phases.some((p) => p.phase === 'gather');
}

/**
 * P4 in the renderer (27 E4, 05 §8.5 P-7): for each flying play and each captain of its crew, how long
 * (ms) the ship waits parked near the work after its turn, when that captain's next turn in the beat sets
 * off within `STAY_NEAR_MS` of the release. The next turn is the next flying play of the same person
 * whose gather starts at or after this one's claim. `startOf` is when each starts (default: planned).
 * Pure; a captain with no entry flies home as they always did.
 */
export function nearWaits(plays: readonly PlannedManeuver[], startOf: (m: PlannedManeuver) => number = (m) => m.afterMs): Map<PlannedManeuver, Map<CanonicalKey, number>> {
  const out = new Map<PlannedManeuver, Map<CanonicalKey, number>>();
  const flying = plays.filter(flyingPlay);
  const gatherAt = (m: PlannedManeuver) => startOf(m) + gatherAtOf(m.phases);
  for (const m of flying) {
    if (passesPlay(m)) continue; // a pass never parks (27 F2): its ship flies on, and its next sortie takes it from there
    const release = startOf(m) + releaseOfPlay(m);
    const claim = startOf(m) + claimMs(m.phases);
    const waits = new Map<CanonicalKey, number>();
    for (const c of new Set([...(m.cast.agent ?? []), ...(m.cast.support ?? [])])) {
      const next = flying.filter((n) => n !== m && [...(n.cast.agent ?? []), ...(n.cast.support ?? [])].includes(c) && gatherAt(n) >= claim)
        .reduce((best, n) => Math.min(best, gatherAt(n)), Infinity);
      const wait = next - release;
      if (wait >= 0 && wait <= STAY_NEAR_MS) waits.set(c, wait);
    }
    if (waits.size) out.set(m, waits);
  }
  return out;
}

// ---- Facts for the schedule ----

/**
 * The facts the schedule reads when its chain passes none: the bundle's whole scope through the same
 * fold `roundFacts` uses (one core, so pacing and the scene can't drift, 23 D3). For a round that is
 * every region of it; for an area or epic bundle, everything the scope holds. Memoised by `roundFacts`.
 */
export function scheduleFacts(h: ScopeHistory, pack: DomainPack): RoundFacts {
  const sector = h.scope.sector;
  return roundFacts(h, sector.kind === 'sprint' ? { level: 'sprint', key: sector.iterationKey } : { level: 'sector', key: '' as CanonicalKey }, pack);
}

// ---- The schedule hooks ----

/** The orientation before a region's first beat: long enough for its opening (2026-10-13). */
export const OPENING_ORIENT_MS = 3000;

export interface PacingOptions {
  /** The rules to size beats with (default `PACE_RULES`); the planner must be given the same. */
  rules?: readonly ManeuverRule[];
  /** The sequencer's overlaps (default `SEQUENCE_ON`); the planner must be given the same. */
  sequence?: SequenceOptions;
  /** The facts to read (default `scheduleFacts`); the planner should be given the same. */
  facts?: (h: ScopeHistory) => RoundFacts;
  /** The region the scene shows, when it is one (its captains are the day turns' spotlights, 22 C6). */
  region?: CanonicalKey;
  /** `false`: no director (27 E5), every moment plays its full form. The pacing ledger's "before"; the app never sets it. */
  direct?: false;
  /** The director's target length at 1× in ms (default `DIRECTOR_TARGET_MS`). */
  targetMs?: number;
  /** The director's levers it may pull, in its own order (default all: `short`, `montage`, `speed`). The ledger's "before" for a lever; the app never sets it. */
  levers?: readonly string[];
  /** `false`: no volleys (27 E6), each merge plays its own Power link. The pacing ledger's "before"; the app never sets it. */
  volleys?: false;
  /** `false`: no rising tempo (27 E8, 05 B-23), the gaps and day turns as squeezed. The pacing ledger's "before"; the app never sets it. */
  risingTempo?: false;
  /** `false`: no late-day montage (27 E10, 05 P-24), the tight end's routine repeats keep their short form. The pacing ledger's "before"; the app never sets it. */
  lateMontage?: false;
}

/** The pack's own priority, when its adapter has one (14 §2.2), over the moves the facts hold. */
export function priorityFor(pack: DomainPack, facts: (h: ScopeHistory) => RoundFacts = (h) => scheduleFacts(h, pack)): Prio | undefined {
  const own = pack.adapter.priority;
  if (!own) return undefined;
  return (h, e) => own.call(pack.adapter, h, e, facts(h).moves.get(e.eventKey) ?? []);
}

/**
 * A chain's schedule hooks (14 §2.6) for a pack: beats sized by the maneuvers they'll play, and the
 * pack adapter's priority and focus where it has them. Unset hooks keep the v0 defaults.
 */
export function pacing(pack: DomainPack, opts: PacingOptions = {}): Partial<ScheduleOptions> {
  const rules = opts.rules ?? PACE_RULES;
  const round = opts.facts ?? ((h: ScopeHistory) => scheduleFacts(h, pack));
  // As the region's scene plans them (a facility's first need is that region's), the planner given the same.
  const facts = (h: ScopeHistory) => sceneFacts(round(h), opts.region);
  const priorityOf = priorityFor(pack, facts);
  const focus = pack.adapter.focusOf;
  return {
    ...(priorityOf ? { priorityOf } : {}),
    ...(focus ? { focusOf: (h, e, s) => focus.call(pack.adapter, h, e, s) } : {}),
    beatShape: (h, events, ll) => shapeOf(h, events, facts(h), rules, priorityOf ?? basePriority, ll, opts.sequence),
    // How each moment plays (27 E5), then who is named (22 C6), once over the episode; the spotlights come
    // from the region's captains. The direction rides on the limelight, so seek and play read one pass.
    limelight: (h, beats, tz) => {
      const f = facts(h);
      const seats = (opts.region ? f.regions?.get(opts.region)?.seats : undefined) ?? f.seats;
      const prio = priorityOf ?? basePriority;
      if (opts.direct === false) return limelightOf(h, beats, f, rules, prio, seats, tz, opts.sequence);
      const target = opts.targetMs ?? DIRECTOR_TARGET_MS;
      // Volleys (27 E6, B-21): grouped over the raw beats, which then fuse; the director and limelight read the fused ones.
      // The round's opening creations (27 E7b, B-22) fuse too: an opening beat holds no merge, so the ranges are disjoint.
      const op = openingSweep(h, beats, f, rules, prio, tz);
      const v0 = opts.volleys === false ? undefined : volleysOf(h, beats, f, rules, prio, tz, opts.sequence, target, opts.levers, opts.lateMontage === false ? { late: false } : {});
      const vs = op ? { fuse: [op, ...(v0?.fuse ?? [])].sort((a, b) => a[0] - b[0]), volleys: v0?.volleys ?? new Map() } : v0;
      const fused = vs?.fuse.length ? fuseRanges(beats, vs.fuse) : beats;
      const direction = directorOf(h, fused, f, rules, prio, tz, opts.sequence, target, opts.levers, vs, opts.lateMontage !== false);
      const ll = limelightOf(h, fused, f, rules, prio, seats, tz, opts.sequence, direction);
      return { ...ll, direction };
    },
    // Guests come and go (22 C8): when each is in the region, over the laid-out beats.
    guests: (h, beats) => {
      const f = facts(h);
      const here = (opts.region ? f.regions?.get(opts.region) : undefined) ?? f;
      return guestPresence(h, beats, here, new Set(here.seats));
    },
    // A steady pulse (22 C5): no gap past 1.2 s, and a new working day opens with a day turn (B-16, B-17).
    dayTurns: true,
    // Rising tempo (27 E8, B-23): the gaps tighten day by day; over the target, every day turn is the floor.
    ...(opts.risingTempo === false ? {} : { risingTempo: true }),
    gapMaxMs: PULSE_GAP_MAX_MS,
    // The opening (2026-10-13): what's already in the region makes its entrance before the first beat.
    orientMs: OPENING_ORIENT_MS,
  } satisfies Partial<ScheduleOptions>;
}
