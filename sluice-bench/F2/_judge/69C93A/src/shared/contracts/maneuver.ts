// 14 §2.7 — maneuvers (v1). A maneuver is data planned in shared code: an engine-named rule (its
// match, cast, phases and timing, in engine/pace.ts) and, per beat, the planned instance the
// renderer's interpreter plays. The theme names the choreography and says which commands each phase
// issues; nothing here knows how anything looks. Pure.
import type { AnyTimelineEvent } from './events';
import type { CanonicalKey } from './keys';
import type { Move, RoundFacts, Signal } from '../engine/types';

/** A maneuver's phases, in order (12 §6). */
export type Phase = 'tell' | 'gather' | 'act' | 'land' | 'echo' | 'disperse';
export const PHASES: readonly Phase[] = ['tell', 'gather', 'act', 'land', 'echo', 'disperse'];

/** Who a maneuver moves or points at, by part. */
export type CastRole = 'subject' | 'agent' | 'support' | 'seat' | 'fromSeat' | 'toSeat'
  | 'facility' | 'attachment' | 'guard' | 'frontier'
  /** What a moment's energy is aimed at but doesn't change: the pieces a merged attachment's work is. */
  | 'target';

export type Cast = Partial<Record<CastRole, CanonicalKey[]>>;

/** One phase's place in a maneuver, in ms from the maneuver's start at 1×. */
export interface PhaseSpan { phase: Phase; atMs: number; durMs: number }

export type ManeuverTier = 'essential' | 'narrative' | 'ornament';

/** Engine pace data: an engine-named rule (`objective.accomplish`). The theme names the choreography. */
export interface ManeuverRule {
  id: string;
  tier: ManeuverTier;
  /** A protected moment (12 §5): nobody else may move its cast until it finishes. */
  protect?: boolean;
  match(mv: Move, f: RoundFacts): boolean;
  cast(mv: Move, e: AnyTimelineEvent, f: RoundFacts): Cast;
  phases: readonly PhaseSpan[];
}

/**
 * One naming turn of a volley (27 E6, M-31, P-6): a member's plates, wearing its note, and the people it names,
 * at most `ATTENTION_MAX` labels together. Turn i opens `i × VOLLEY_TURN_MS` after the claim.
 */
export interface VolleyTurn {
  /** The member event whose note its plates wear. */
  eventKey: string;
  /** The pieces it lights: that member's noted targets. */
  plates: readonly CanonicalKey[];
  /** Who it names, each once in the volley, with the member event and the part they had in it. */
  names: readonly { key: CanonicalKey; eventKey: string; part: 'agent' | 'support' | 'holder' }[];
}

/** One rule matched in one beat: what the interpreter plays. */
export interface PlannedManeuver {
  id: string;
  eventKey: string;
  /** Art randomness for this maneuver: `fnv(eventKey)` (14 §4). */
  seed: number;
  cast: Cast;
  phases: readonly PhaseSpan[];
  /** From the beat's start, and how long it runs, in ms at 1×. */
  afterMs: number;
  durationMs: number;
  protect?: { keys: CanonicalKey[]; windowMs: number };
  from?: Signal;
  to?: Signal;
  /** What frame and follow look at. */
  keys: CanonicalKey[];
  /** The rule's variant for this move, when it has more than one shape (`first`: a facility's first merge). */
  variant?: string;
  /**
   * Cast members it has to itself while it plays (its variant's `holds`: a first merge's facility,
   * whose form it changes). One new to the scene this beat comes in with its look from before the
   * maneuver, and its own lands with it (2026-10-13).
   */
  holds?: CanonicalKey[];
  /**
   * The arc climax (22 C4, 05 §8 M-23). On a merge: the holders of the work closing at its beam's
   * impact, flown into its formation (named *Closed it*). On such a close (variant `arc`): the merge's
   * event key, whose impact it plays at.
   */
  arc?: { holders?: CanonicalKey[]; merge?: string };
  /** Limelight didn't name it (22 C6): it plays unlabelled, no plate or name, and no held turn. */
  quiet?: boolean;
  /** Montage (22 C5): quiet in a crowded beat, its phases already shortened. */
  montage?: boolean;
  /**
   * The director's montage form (27 E5b, 05 §8.5c P-24; `montage` is set too): its short form with no held turn,
   * lighting this one plate, with its event's note, and naming no crew.
   */
  plate?: CanonicalKey;
  /** The director chose it as its working day's climax (27 E5, P-22): it plays its full form. The camera (E9) reads this. */
  climax?: true;
  /**
   * A volley (27 E6, M-31): this merge carries its members' casts, the union of authors, approvers, tenders and
   * targets, led by `lead`. `members` are the member event keys, this one first; `turns` name them in turn.
   */
  volley?: { lead: CanonicalKey; members: readonly string[]; turns: readonly VolleyTurn[] };
  /**
   * A sector sweep (27 E7, M-32): a beat's creations play as this one maneuver, which carries the first's event.
   * `members` are every creation's event key, in order; `counts` the pieces swept, by role. `cast.subject` holds them.
   * It names no one: the star wears one note.
   */
  sweep?: { members: readonly string[]; counts: { objective: number; threat: number } };
}
