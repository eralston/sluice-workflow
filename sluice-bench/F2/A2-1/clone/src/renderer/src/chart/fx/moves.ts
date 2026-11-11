// Moves (05 §5 continuity): effects that steer a node from where it's drawn to where it's going.
// Split out of director.ts (2026-10-10, no behaviour change).
import { Sprite } from 'pixi.js';
import { lighten } from '../art/lit';
import { ShipView } from '../art/ships';
import type { GraphScene } from '../scenes/GraphScene';
import { easeIn, easeInOut, easeOut, glowTexture, Streak, type Fx } from './effects';
import { DEPART_S, RADAR_COLLAPSE_S, RADAR_EXPAND_S, RADAR_RUN_S, TRAIL_COLOR } from './timing';

/**
 * Pursuit (05 §5): a node travelling from an absolute start toward its *live* layout target, read
 * every frame, so if the target moves mid-flight (a lane re-spread) the node bends toward its new goal
 * instead of jumping. In-scene moves bow along a gentle arc; a wake streaks behind when asked.
 */
export class Pursue implements Fx {
  readonly kind: 'travel' | 'accent';
  private t = 0;
  private readonly streak: Streak | null;
  private done = false;
  constructor(
    private readonly scene: GraphScene, private readonly pk: string, private readonly start: [number, number], private readonly dur: number,
    private readonly opts: { ease?: (u: number) => number; lift?: number; wake?: number; face?: boolean; onDone?: () => void; kind?: 'travel' | 'accent' } = {},
  ) {
    this.kind = opts.kind ?? 'travel';
    scene.own(pk);
    this.streak = opts.wake ? new Streak(scene.fxLayer(), TRAIL_COLOR) : null;
    scene.placeAt(pk, start[0], start[1]);
  }
  private point(u: number, target: [number, number]): [number, number] {
    const [sx, sy] = this.start;
    const [tx, ty] = target;
    const lift = this.opts.lift ?? 0;
    const len = Math.hypot(tx - sx, ty - sy) || 1;
    const cx = (sx + tx) / 2 + (-(ty - sy) / len) * lift;
    const cy = (sy + ty) / 2 + ((tx - sx) / len) * lift;
    const v = 1 - u;
    return [v * v * sx + 2 * v * u * cx + u * u * tx, v * v * sy + 2 * v * u * cy + u * u * ty];
  }
  update(dt: number): boolean {
    this.t += dt;
    const target = this.scene.goalOf(this.pk);
    if (!target) return false;
    const u = Math.min(1, this.t / this.dur);
    const k = (this.opts.ease ?? easeInOut)(u);
    const [x, y] = this.point(k, target);
    if (this.opts.face !== false) {
      const [nx] = this.point(Math.min(1, k + 0.02), target);
      if (Math.abs(nx - x) > 1e-6) this.scene.faceView(this.pk, nx - x);
    }
    this.scene.placeAt(this.pk, x, y);
    if (this.streak) {
      const tail = this.point(Math.max(0, k - 0.3), target);
      this.streak.draw(tail, [x, y], (this.opts.wake ?? 5) * (1 / this.scene.currentScale()), 0.7 * (1 - u * u));
    }
    if (u >= 1 && !this.done) {
      this.done = true;
      this.opts.onDone?.();
    }
    return u < 1;
  }
  destroy(): void {
    this.scene.release(this.pk);
    this.scene.restoreFacing(this.pk);
    this.streak?.destroy();
  }
}

/**
 * Travel along the orbit (05 §5, the board, decided 2026-10-09): a body moving to another column on
 * its own ring follows the ring's ellipse from where it was to its new place, so work reads as moving
 * left to right along the board. While it passes another body it bows out to the neighbouring ring's
 * path (`bow`: that ring's radii), then settles back; `onPass` fires at the middle of the pass (the
 * eclipse, when there's no room to bow). It starts from where the body is drawn and ends on its live
 * goal, so a glide in progress or a target that moves never makes it jump.
 */
export class OrbitTravel implements Fx {
  readonly kind = 'travel';
  private t = 0;
  private passed = false;
  constructor(
    private readonly scene: GraphScene, private readonly pk: string, private readonly start: [number, number],
    private readonly ring: { cx: number; cy: number; rx: number; ry: number }, private readonly a0: number, private readonly a1: number,
    private readonly dur: number, private readonly bow: { rx: number; ry: number } | null, private readonly onPass?: () => void,
  ) {
    scene.own(pk);
    scene.placeAt(pk, start[0], start[1]);
  }
  private at(a: number, bump: number): [number, number] {
    const { cx, cy, rx, ry } = this.ring;
    const brx = this.bow ? rx + (this.bow.rx - rx) * bump : rx;
    const bry = this.bow ? ry + (this.bow.ry - ry) * bump : ry;
    return [cx + Math.cos(a) * brx, cy + Math.sin(a) * bry];
  }
  update(dt: number): boolean {
    this.t += dt;
    const goal = this.scene.goalOf(this.pk);
    if (!goal) return false;
    const u = Math.min(1, this.t / this.dur);
    const k = easeInOut(u);
    const a = this.a0 + (this.a1 - this.a0) * k;
    const bump = Math.sin(Math.PI * k) ** 2;
    const [ox, oy] = this.at(a, bump);
    // Fold in where it really started (mid-glide) and where it really ends (a live goal).
    const [sx, sy] = this.at(this.a0, 0);
    const [ex, ey] = this.at(this.a1, 0);
    const lead = (1 - k) ** 2;
    const tail = k * k;
    const x = ox + (this.start[0] - sx) * lead + (goal[0] - ex) * tail;
    const y = oy + (this.start[1] - sy) * lead + (goal[1] - ey) * tail;
    this.scene.faceView(this.pk, Math.sign(this.a1 - this.a0) * -Math.sin(a) || 1);
    this.scene.placeAt(this.pk, x, y);
    if (!this.passed && k >= 0.5) {
      this.passed = true;
      this.onPass?.();
    }
    return u < 1;
  }
  destroy(): void {
    this.scene.release(this.pk);
    this.scene.restoreFacing(this.pk);
  }
}

/** Keeps a node where it is until its delayed move begins (stagger), so it never drifts and snaps back. */
export class Hold implements Fx {
  readonly kind = 'accent';
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly at: [number, number]) {
    scene.own(pk);
    scene.placeAt(pk, at[0], at[1]);
  }
  update(): boolean {
    this.scene.placeAt(this.pk, this.at[0], this.at[1]);
    return true;
  }
  destroy(): void {
    this.scene.release(this.pk);
  }
}

/**
 * The radar ping (06 §5): a Task changing band collapses to a point, runs as a spark along its spoke
 * to its live place in the new band, and re-expands there; `onLand` plays the landing (its rung's
 * flare, an echo). Leisurely: about two seconds in all.
 */
export class RadarMove implements Fx {
  readonly kind = 'accent';
  private t = 0;
  private readonly spark: Sprite;
  private landed = false;
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly from: [number, number], color: number, px: number, private readonly onLand: () => void) {
    scene.own(pk);
    this.spark = new Sprite(glowTexture());
    this.spark.anchor.set(0.5);
    this.spark.tint = lighten(color, 0.45);
    this.spark.blendMode = 'add';
    this.spark.width = this.spark.height = 18 * px;
    this.spark.alpha = 0;
    scene.fxLayer().addChild(this.spark);
    scene.placeAt(pk, from[0], from[1]);
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const to = this.scene.goalOf(this.pk) ?? this.from;
    if (t < RADAR_COLLAPSE_S) {
      this.scene.placeAt(this.pk, this.from[0], this.from[1]);
      this.scene.scaleView(this.pk, 1 - easeIn(t / RADAR_COLLAPSE_S));
      this.spark.position.set(this.from[0], this.from[1]);
      this.spark.alpha = t / RADAR_COLLAPSE_S;
    } else if (t < RADAR_COLLAPSE_S + RADAR_RUN_S) {
      const k = easeInOut((t - RADAR_COLLAPSE_S) / RADAR_RUN_S);
      const x = this.from[0] + (to[0] - this.from[0]) * k;
      const y = this.from[1] + (to[1] - this.from[1]) * k;
      this.scene.scaleView(this.pk, 0);
      this.scene.placeAt(this.pk, x, y); // the collapsed dot rides with its spark, so it re-expands where the spark lands
      this.spark.position.set(x, y);
      this.spark.alpha = 1;
    } else {
      const k = Math.min(1, (t - RADAR_COLLAPSE_S - RADAR_RUN_S) / RADAR_EXPAND_S);
      this.scene.placeAt(this.pk, to[0], to[1]);
      this.scene.scaleView(this.pk, Math.max(0.01, easeOut(k)));
      this.spark.position.set(to[0], to[1]);
      this.spark.alpha = 1 - k;
      if (!this.landed) {
        this.landed = true;
        this.onLand();
      }
    }
    return t < RADAR_COLLAPSE_S + RADAR_RUN_S + RADAR_EXPAND_S;
  }
  destroy(): void {
    this.scene.release(this.pk);
    this.scene.scaleView(this.pk, 1);
    this.spark.destroy();
  }
}

/** An abandoned PR (06 §5): the vessel's lights go out and it settles as ash. Quiet; no drift. */
export class Withdraw implements Fx {
  readonly kind = 'accent';
  private t = 0;
  private readonly dur = 2.4;
  constructor(private readonly scene: GraphScene, private readonly pk: string) {}
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const out = u < 0.2 ? 1 - 0.7 * (u / 0.2) : 0.3 + 0.7 * easeInOut((u - 0.2) / 0.8);
    this.scene.fadeView(this.pk, Math.min(0.999, out));
    return u < 1;
  }
  destroy(): void {
    this.scene.fadeView(this.pk, 1);
  }
}

/** A new object fades up (emerge, 06 §5). */
export class FadeIn implements Fx {
  readonly kind = 'accent';
  private t: number;
  /** `hold`: stay hidden this long first (a seed spark plays where it will appear). */
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly dur: number, hold = 0) {
    this.t = -hold;
    scene.fadeView(pk, 0);
  }
  update(dt: number): boolean {
    this.t += dt;
    this.scene.fadeView(this.pk, Math.min(1, easeOut(Math.max(0, this.t) / this.dur)));
    return this.t < this.dur;
  }
  destroy(): void {
    this.scene.fadeView(this.pk, 1);
  }
}

/** A ship leaving the scene: a stand-in that turns, accelerates along its axis, and streaks away. */
export class Departure implements Fx {
  readonly kind = 'travel';
  private t = 0;
  private readonly ship: ShipView;
  private readonly streak: Streak;
  constructor(private readonly scene: GraphScene, private readonly from: [number, number], private readonly dir: [number, number], private readonly reach: number, seed: number, r: number, private readonly px: number, private readonly onDone: () => void) {
    this.ship = new ShipView(seed, r);
    this.ship.face(dir[0]);
    this.ship.root.position.set(from[0], from[1]);
    this.streak = new Streak(scene.fxLayer(), TRAIL_COLOR);
    scene.fxLayer().addChild(this.ship.root);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / DEPART_S);
    const d = this.reach * easeIn(u);
    const x = this.from[0] + this.dir[0] * d;
    const y = this.from[1] + this.dir[1] * d;
    this.ship.root.position.set(x, y);
    this.ship.root.alpha = 1 - Math.max(0, (u - 0.55) / 0.45);
    this.ship.tick(0);
    this.streak.draw(this.from, [x, y], 5 * this.px, 0.8);
    if (u >= 1) this.onDone();
    return u < 1;
  }
  destroy(): void {
    this.ship.destroy();
    this.streak.destroy();
  }
}
