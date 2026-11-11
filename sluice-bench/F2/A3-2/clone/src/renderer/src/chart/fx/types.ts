// 14 §2.8 — the effect seams (v1). `FxDirector` is what ChartApp and playback talk to: the v0
// AnimationDirector has this shape already, and the v1 ManeuverInterpreter and the switch between
// the two implement it too. Commands are named, weighted effects a maneuver's phases issue; a
// theme's ManeuverDef says which commands each phase of an engine rule issues.
import type { CastNote } from './v1/castLabels';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CastRole, Phase, PlannedManeuver } from '@shared/contracts/maneuver';
import type { ViewNode } from '@shared/contracts/view';
import type { Award } from '@shared/engine/types';
import type { BeatContext } from './director';
import type { Anchor, Fx } from './effects';
import type { FxHost as CommandHost } from './host';

/** A beat as the directors receive it: v1 adds the beat's planned maneuvers. */
export type FxBeat = BeatContext & { maneuvers?: PlannedManeuver[] };

export interface FxDirector {
  /** Play a beat once the scene has laid out its new state (next update). */
  queue(ctx: FxBeat): void;
  /** Lead-in tells for the beat about to play. */
  tell(ctx: FxBeat, i: number, leadS: number): void;
  /** Seek, lens toggle or scene change: cancel every effect, tell and trail (INV-15). */
  clear(): void;
  /**
   * The end-of-episode bloom, with the viewer's awards when there are any. `finale`: the round has
   * ended here, so a theme's finale plays in its place (2026-10-13).
   */
  recap(keys: CanonicalKey[], awards?: Award[], opts?: { finale?: boolean }): void;
  /** A beat's awards (23 D2): their insignia light from the beat's start. Optional (v0 has none). */
  insignia?(awards: Award[], calledAt?: number): void;
  /** The episode begins (2026-10-13): what's already here makes its entrance. Optional (v0 has none). */
  opening?(): void;
  /**
   * The hover-only pieces whose label shows now in play (19 L7), by projection key, with its opacity.
   * Optional (v0 has none).
   */
  labelled?(): ReadonlyMap<string, number>;
  /** The note each labelled piece wears now (22 B6: its event's action), by projection key. Optional. */
  notes?(): ReadonlyMap<string, CastNote>;
  /** The acting captains whose plates are unfurled to their names (22 B9): how far, their part, the event. Optional. */
  crew?(): ReadonlyMap<string, { u: number; text: string; eventKey: string; pass?: true }>;
  /** The events whose notes show now (22 B5: History's *now* rows), by event key. Optional. */
  nowPlaying?(): string[];
  update(dtMs: number, scheduleDtMs: number, frozen: boolean): void;
  volatility(): number;
  census(): Record<string, number>;
  calm(): boolean;
  activeCount(): number;
  trailCount(): number;
  /**
   * Test hook: extra volatility. A field, as on AnimationDirector (14 §2.8 writes it `bias(v)`; the
   * v0 director already has it as a property, and `implements FxDirector` must hold unchanged).
   */
  bias: number;
}

/** What a command may reach: the director's host, plus the runner's services (fx/host.ts). */
export type FxHost = CommandHost;

export type CommandTier = 'essential' | 'narrative' | 'ornament';

export interface CommandDef<A = unknown> {
  name: string;
  tier: CommandTier;
  /** Its share of the volatility meter. */
  weight: number;
  /** What it tells per unit of attention (27 E1): the mute rule keeps it while value per weight clears the floor (15 §10). */
  value: number;
  /** Whether a busy scene may drop it. */
  cuttable: boolean;
  /** 'travel' moves at the playback rate; 'accent' at most 2×. */
  clock: 'travel' | 'accent';
  /** It takes a node over (a mover). */
  moves?: boolean;
  /** Its reduced-motion substitute (INV-20): the same, a ring, a snap, nothing, or another command. */
  reduced: 'same' | 'ring' | 'snap' | 'skip' | { use: string };
  make(host: FxHost, args: A): Fx;
}

/**
 * One cast member as the choreography sees it: its key, its node in the scene, and a live anchor.
 * `gone`: it left the scene this beat (a landed objective), so `node` and `at` are where it was.
 */
export interface CastView {
  key: CanonicalKey; node: ViewNode; at: Anchor; gone?: boolean;
  /** An attachment: the compound slot it holds in its station (23 C6), which a per-slot act plays on. */
  slot?: number;
  /** Its drawn radius now, in world units: a hardware floor makes it bigger than `node.world.r` when zoomed out. */
  drawnR?: () => number;
  /** A named hardpoint of its art in world units now (23 C5: a station's `emitter`), or null when it has none. */
  anchor?: (name: string) => readonly [number, number] | null;
  /**
   * The compound it's drawn inside (an attachment's station). Captains aim at the host, never at the
   * part: a tender is only a count of open PRs, not a place of work (2026-10-12).
   */
  host?: CastView;
  /** Its plate's rect in world units now, if shown (22 C11: a formation keeps off the plates it serves). */
  plate?: () => { x0: number; y0: number; x1: number; y1: number } | null;
}
/** A person in the cast with no ship in the scene (a reviewer-only guest): their key and ship seed. */
export interface AwayView { key: CanonicalKey; seed: number }
export type CastViews = Partial<Record<CastRole, CastView[]>> & {
  /** The agent and support members with no ship in the scene: they can jump in as guests. */
  away?: Partial<Record<'agent' | 'support', AwayView[]>>;
  /** The solar plan's board (the frontier rectangle, world units), when the scene is a region (27 D2). */
  board?: { minX: number; minY: number; maxX: number; maxY: number };
};

/** A command to issue, or an art act to play on one cast member's view. */
export type CommandCall = { cmd: string; args: unknown; delayMs?: number; value?: number } | { act: { key: CanonicalKey; act: string; slot?: number | readonly number[] }; delayMs?: number };

/** A theme's choreography for one engine rule: its name, and what each phase issues. */
export interface ManeuverDef {
  /** Matches `ManeuverRule.id`. */
  id: string;
  /** The theme's name for it ('Landing', 'Strike run'). */
  title: string;
  /**
   * It brings its new subject in itself (2026-10-13: the radar contact, the rift): the interpreter
   * keeps the subject hidden until the choreography's entrance, instead of fading it up.
   */
  reveals?: boolean;
  /**
   * Cast parts whose new look it lands itself, over any other moment in the beat that casts them
   * (2026-10-13): a seat's completion blooms its world at its own land, not at the close before it.
   */
  owns?: readonly CastRole[];
  /**
   * A guide whose part its subjects play it holds as it was before the beat, until a phase starts
   * (2026-10-13): a reassigned piece keeps the frontier belt as it was until it flies (19 S2), so the
   * belt fades with the flight. The guide's other nodes follow the scene meanwhile.
   */
  freezes?: { guide: string; until: Phase };
  /**
   * Its subject slides to its new place from this phase's start (22 C3, M-22: a close's glide): the
   * moment's protect lets it go then, instead of at the moment's end, and the scene's glide carries it.
   */
  slides?: Phase;
  phase: Partial<Record<Phase, (cast: CastViews, m: PlannedManeuver) => CommandCall[]>>;
}

/**
 * A theme's idle work (2026-10-12): what a captain at rest does with the piece it rests beside while
 * that piece is under way, played now and then (more often where people worked lately) and only when
 * the scene is calm. Ornament: it never changes anything.
 */
export interface AmbientWork {
  /** The calls for one bout: `n` counts this ship's bouts so far, for variety. */
  work(ship: CastView, piece: CastView, activity: number, n: number): CommandCall[];
}

/** What a finale sees: the region's star, what finished in the order it did, every ship and seat. */
export interface FinaleCast { star: CastView | null; finished: CastView[]; ships: CastView[]; seats: CastView[] }

/**
 * A theme's finale (2026-10-13): the round's end, played once when playback reaches it in a round
 * that's over. A celebration of the round, never a scoreboard: no counts, no ranking. `awardsAtMs`:
 * when the viewer's awards light, on their own ship wherever it is then (in formation, say).
 */
export type Finale = (c: FinaleCast) => {
  calls: CommandCall[]; awardsAtMs: number;
  /** The roll call (22 C6, M-29): when the ships it forms up are named, from the finale's start (ms). */
  rollCall?: { fromMs: number; toMs: number };
};

/**
 * A theme's entrances (2026-10-13): how one object comes into the scene. `quiet` for the episode's
 * opening, where many arrive together. Null: the plain fade.
 */
export type Entrance = (node: ViewNode, quiet: boolean) => CommandCall[] | null;
