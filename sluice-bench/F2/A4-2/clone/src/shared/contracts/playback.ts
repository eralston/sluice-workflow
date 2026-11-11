// 03 §7 — playback types.
import type { Priority } from './events';
import type { CanonicalKey, UtcMs } from './keys';
import type { SceneKey } from './view';

/** Rates above 1× speed motion up by kind (05 §5, measured motion). */
export type Rate = 0.25 | 0.5 | 1 | 2 | 4;
export const RATES: readonly Rate[] = [0.25, 0.5, 1, 2, 4];

export interface PlaybackSession {
  rangeStartUtc: UtcMs;
  rangeEndUtc: UtcMs;
  playheadUtc: UtcMs;
  status: 'paused' | 'playing' | 'ended';
  rate: Rate;
  perspective: { kind: 'free' } | { kind: 'follow'; captainKey: CanonicalKey; suspended: boolean };
  /** Camera focus; navigation never resets the session. */
  sceneKey: SceneKey;
}

export interface Beat {
  index: number;
  /** Playhead source time once the beat fires: its last event's occurredAt. */
  sourceUtc: UtcMs;
  /** The beat's first event time (the gap before it ends here). */
  firstUtc: UtcMs;
  eventKeys: string[];
  priority: Priority;
  /** At 1×. */
  presentationStartMs: number;
  durationMs: number;
  /** False: state applies silently (budget cut or Low priority). */
  accented: boolean;
  /** It opens a new working day: the gap before it is a day turn (22 C5, 05 §8 B-17). */
  opensDay?: boolean;
}

/**
 * How a moment plays (27 E5, 05 §8.5c P-20): `full` is the rule's own phases (or its variant's), `short`
 * its short form (27 E4d), `progress` a merge played as a captain's progress beam, `montage` (E5b, P-24)
 * its short form with no held turn and no crew named, lighting one plate, `light` (E5c, P-26) a draft
 * dropped so its event falls to light work, `joined` (E6, M-31) a merge drafted into its volley's carrier.
 */
export type MomentForm = 'full' | 'short' | 'progress' | 'montage' | 'light' | 'joined';

/**
 * A volley (27 E6, 05 §8.4a M-31): merges into one facility that play within `VOLLEY_WINDOW_MS` of x (at 1×)
 * on one day, drafted as one Power link by the first of them, the carrier. Pure data.
 */
export interface Volley {
  /** The members' turn keys (`${eventKey}|${ruleId}`) in episode order, the carrier first. */
  members: readonly string[];
  /** Who fires (E6-Q1): the author with the most member merges; on a tie, the one whose last member merge is latest. */
  lead: CanonicalKey;
  /** Each member's x at 1× under the director's first pass, ms, as `members`. */
  atMs: readonly number[];
}

/**
 * The director's pass over an episode (27 E5, 05 §8.5c): the form of each moment, decided once so the
 * planner, the schedule and a seek read the same choices. Pure data.
 */
export interface Direction {
  /** The form of each moment, by its turn key as drafted (`${eventKey}|${ruleId}`); no entry means `full`. */
  forms: ReadonlyMap<string, MomentForm>;
  /** The turn keys of each working day's climax: the biggest moment, which keeps its full form. */
  climaxes: ReadonlySet<string>;
  /** The levers the director pulled to meet its target, in order (`short`, `montage`, `speed`, `light`, `fewer-heroes`). */
  levers: readonly string[];
  /** The episode's length as the director estimated it, in wall ms at 1× rate (after `speed`, the sped length): an upper bound on the schedule's `wallMs`. */
  estimateMs: number;
  /**
   * Adaptive speed (27 E5b, P-25), when the `speed` lever ran: by beat index, the factor k (1 to `TEMPO_MAX`)
   * the stretch from that beat's start to the next beat's plays at. A beat with a climax has no entry (1×).
   */
  tempo?: ReadonlyMap<number, number>;
  /** The volleys (27 E6, M-31), by the carrier's turn key. Their other members' forms are `joined`. */
  volleys?: ReadonlyMap<string, Volley>;
  /**
   * The raw beats a volley fuses into one (05 B-21), as inclusive index ranges `[first, last]` over the schedule's
   * groups before fusion: sorted, disjoint, each with last > first. Every beat index elsewhere is the fused one.
   */
  fuse?: readonly (readonly [number, number])[];
}

/**
 * Who is named in an episode (22 C6, 05 §8 P-17, M-28), decided once over its beats so the planner,
 * the renderer and a seek agree. Pure data.
 */
export interface Limelight {
  /** The maneuvers that play named, `${eventKey}|${ruleId}`: moments, arcs, first turns, a fair share. */
  named: ReadonlySet<string>;
  /** By the index of a beat that opens a working day: the captain its breather spotlights. */
  spotlights: ReadonlyMap<number, CanonicalKey>;
  /** The director's forms (27 E5), when the chain directs; the planner reads them with `named`. */
  direction?: Direction;
}

/**
 * A guest's time in a region (22 C8, 05 §8 K-13, K-14): from the state time of the beat they arrive in
 * until that of the beat they leave with (null: they stay to the end). Pure data.
 */
export interface GuestWindow { fromUtc: UtcMs; untilUtc: UtcMs | null }
/** Every guest's windows, by person: someone absent has never helped here. */
export type GuestPresence = ReadonlyMap<CanonicalKey, readonly GuestWindow[]>;

export interface BeatSchedule {
  beats: Beat[];
  /** At 1×: the schedule's length in x, which the ruler and every seek read. */
  totalMs: number;
  /** The wall time it takes at 1× rate: Σ length ÷ tempo (27 E5b, P-25); `totalMs` when no beat is sped. */
  wallMs: number;
  /** The tempo at schedule time x (1 on the orientation, a climax's beat, and any schedule that isn't sped). */
  tempoAt(presentationMs: number): number;
  /** The wall time from the start to schedule time x, at 1× rate (`wallMs` at `totalMs`). */
  wallAt(presentationMs: number): number;
  /** Monotonic piecewise-linear map from presentation time to source time. */
  toSource(presentationMs: number): UtcMs;
  toPresentation(sourceUtc: UtcMs): number;
  /** The displayed state's source time at schedule time x (05 §1). */
  stateUtc(presentationMs: number): UtcMs;
  /** Who is named (22 C6), when the chain decides it. */
  limelight?: Limelight;
  /** When each guest is in the region (22 C8), when the chain plans it. */
  guests?: GuestPresence;
}
