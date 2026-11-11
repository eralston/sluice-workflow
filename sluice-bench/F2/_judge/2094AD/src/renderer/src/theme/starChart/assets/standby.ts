// A station on standby (19 M1, option A): none of its PRs is open and none has moved for two days of
// history (the projection's `piece.standby`). It goes quiet: its drives and lights dim, its idle drift
// slows to a stop, and its plate drops to T3 (labels.ts, `flags.standby`). Its tenders are already
// docked, since a tender is an open PR. It keeps its place and its size (INV-14, INV-19). A new PR wakes
// it: the stage lands with that PR's maneuver, after its tell, and the lights come up quicker than they
// went. A seek, scene entry and reduced motion land it at once (`settle`, INV-15).
//
// The art owns the dimming: `DreadnoughtView.setPower(0..1)` tints the hull and its satellites, and
// every additive layer under the hull (drives, windows, bays, reactor, beacons, shield, seams) a deeper
// grey, and slows the art's own idle motion (the heave, sway and roll, the drives' swell, the window
// shimmer) to a stop. This adapter only eases the level on wall time and passes it (power = 1 - level).
import { POWER_DIM_HULL, POWER_DIM_LIGHTS, type DreadnoughtView } from '../../../chart/art/dreadnoughts';
import { motion } from '../../../chart/art/motion';
import { pieceOf } from '../stageCodec';
import { AdaptedView } from './adapt';

/** How long a station takes to power down into standby (wall ms): the bigger the thing, the slower. */
export const STANDBY_FADE_MS = 2400;
/** How long it takes to wake (wall ms), once the PR that wakes it lands. */
export const STANDBY_WAKE_MS = 900;
/** The hull and its satellites on standby: this share of their light (the art's, at power 0). */
export const STANDBY_HULL = POWER_DIM_HULL;
/** Its drives and lights on standby: this share again, under the hull's. */
export const STANDBY_LIGHTS = POWER_DIM_LIGHTS;

/** A station's view: the adapter's, with its standby eased in and out. */
export class StationView extends AdaptedView<DreadnoughtView> {
  /** How far into standby it is: 0 awake, 1 on standby. */
  private level = 0;
  /** Where its stage wants it, or null before the first stage (a new view starts there). */
  private target: 0 | 1 | null = null;
  /** The wall clock (ms) the level last stepped at. */
  private wallAt: number | null = null;

  /** Whether it's on standby now, eased in or not (tests and the drive). */
  get standby(): number {
    return this.level;
  }

  override setStage(stage: string): void {
    super.setStage(stage);
    const want = pieceOf(stage, 'facility')?.standby ? 1 : 0;
    if (this.target === null) this.level = want;
    this.target = want;
  }

  settle(): void {
    this.art.settleForm?.(); // a seek or scene entry mid-merge snaps the form to the stage (INV-15)
    if (this.target !== null) this.level = this.target;
    this.draw();
  }

  protected override artTime(seconds: number): number {
    const now = performance.now();
    const dt = this.wallAt === null ? 0 : Math.max(0, now - this.wallAt);
    this.wallAt = now;
    if (this.target !== null && this.level !== this.target) {
      if (motion.reduced) this.level = this.target;
      else {
        const step = dt / (this.target > this.level ? STANDBY_FADE_MS : STANDBY_WAKE_MS);
        this.level = this.target > this.level ? Math.min(1, this.level + step) : Math.max(0, this.level - step);
      }
    }
    this.draw();
    return seconds;
  }

  private draw(): void {
    this.art.setPower(1 - this.level);
  }
}
