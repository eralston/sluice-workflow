// A station's transformation rig (art session 2026-10-12): the shape every faction's two forms take, so
// the view can play any of them. A rig builds a station in a form from named pieces; the view slides,
// turns and swaps those pieces between the two forms (dreadnoughts.ts, "The transformation's pieces").
//
// 'ship' is a faction's FIRST form, the one before any PR has merged into it, and 'robot' its SECOND,
// reached on the first merge. The names are the Mecha station's (ship, then robot); the Trek station
// is a bare spacedock, then a ringed deep-space station (trekStation.ts); the Wars station is a
// cruiser, then the cruiser with a docking ring (warsStation.ts), whose transformation is a `Dock`.
// The stage string says `form=robot` for any faction's second form.
import type { HullModel, V3 } from './hull3d';

export type Pose = 'ship' | 'robot';

/** One station in one form: its solids, hardpoints and pieces. */
export interface RigPose {
  /** The whole station, with its navigation beacons first. */
  model: HullModel;
  turrets: V3[]; pd: V3[]; bays: V3[]; reactor: V3[];
  /** The main cannon's root and muzzle, if the form has one. */
  cannon?: [V3, V3];
  /**
   * Each piece alone, in this form, with beacons [origin, fore, aft] (the form's origin, and the two
   * ends of the piece's axis). `null`: the piece isn't there yet, so it grows out of the form's origin.
   */
  groups: { name: string; model: HullModel | null }[];
}

/** A line on a station (model space), with its surface's normal at each point (to tell which parts show). */
export interface Line { p: V3[]; n: V3[] }
/** A line the power runs along, over a share of its wave (0..1). */
export interface Run extends Line { from: number; to: number }

/** A piece that arrives from outside and locks onto the first form (a docking rig's). */
export interface DockPiece {
  name: string;
  /** Its middle, seated (model space): its offsets are from here. */
  centre: V3;
  /** Where it drops out of hyperspace, and where it holds before it glides in: offsets from its seat. */
  jump: V3;
  hold: V3;
  /** When it drops out, in seconds. */
  at: number;
  /** The piece at a heading: the part of it in front of the first form (`near`), or behind it. */
  model(dir: number, layer: 'near' | 'far'): HullModel;
}

/**
 * A transformation in which the second form's new pieces arrive and lock onto the first, which never
 * moves (the Wars station's docking ring): they drop out of hyperspace, hold, glide to their seats'
 * line and clamp on; the seams glow, the view cuts to the second form, and a wave of power runs out
 * over the new pieces and the hull, lighting its windows, until the drives light. Times in seconds.
 */
export interface Dock {
  pieces: readonly DockPiece[];
  /** How long a piece takes to come out of hyperspace to its hold. */
  jumpS: number;
  /** Gliding to the seats' line, then clamping on; the latch (the cut to the second form) is the clamp's end. */
  align: readonly [number, number];
  clamp: readonly [number, number];
  /** The wave of power, and the drives lighting at its end. */
  wave: readonly [number, number];
  ignite: readonly [number, number];
  /** The joints: they glow at the latch, and breathe faintly from then on. */
  seams: readonly Line[];
  /** The paths the wave runs out along on the new pieces (round the ring, up the fins). */
  runs: readonly Run[];
  /** The hull the wave crosses: where it starts on the axis, how far it runs fore and aft (shares of the wave), and the skin's ring at a section. */
  hull: { from: number; fore: readonly [number, number, number]; aft: readonly [number, number, number]; ring(x: number): Line };
  /** A charge in the second form: the paths it runs (shares of the charge) to its emitter. */
  charge: { runs: readonly Run[]; emitter: V3 };
}

export interface Rig {
  /** The pieces, in order (none for a docking rig: its arriving pieces are in `dock`). */
  names: readonly string[];
  /** When each piece starts to move, as a fraction of the whole transformation, and how long it takes (a fraction). */
  start: Readonly<Record<string, number>>;
  span: number;
  /** The whole transformation, in seconds. */
  seconds: number;
  pose(pose: Pose, dir: number): RigPose;
  /** Set when the second form's pieces arrive and lock on, rather than sliding or growing. */
  dock?: Dock;
}
