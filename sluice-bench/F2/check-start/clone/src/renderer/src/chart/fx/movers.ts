// The v1 effect runner (14 §1.4): the bookkeeping the v0 AnimationDirector keeps for its effects,
// copied out so the ManeuverInterpreter can share it (the v0 copy stays in director.ts, unchanged).
// It holds the live effects and tells, the mover per node (so a new move takes over from where the
// node is drawn, never a jump), protected moments (05 §5: only the moment moves its cast), the
// budget cap, ducking under a grand burst, and the effect clock. Plus two movers v0 doesn't have:
// a timed hold, and a sortie (out to a live point, hold, back home).
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewNode } from '@shared/contracts/view';
import { motion } from '../art/motion';
import type { GraphScene } from '../scenes/GraphScene';
import { Graphics } from 'pixi.js';
import { After, easeInOut, Streak, type Fx } from './effects';
import { Protect } from './moments';
import { DUCK, GRAND_BURST_S, TRAIL_COLOR } from './timing';
import { activeProfile } from '../../profile';

/** What the runner knows of an effect a command made: its name, weight, budget and clock. */
export interface RunMeta {
  name: string;
  weight: number;
  cuttable: boolean;
  /** Overrides the effect's own clock (a protect on the beat's clock, say). */
  clock?: 'travel' | 'accent';
}

export class FxRunner {
  fx: Fx[] = [];
  /** Lead-in tells for the next beat: cancelled when it plays, or by any seek. */
  tells: Fx[] = [];
  /** Effect clock (s), and when the next grand flare may burst. */
  clock = 0;
  grandFree = 0;
  /** The effect steering each node, so a new move takes over from where the node is, never a jump. */
  readonly movers = new Map<string, Fx>();
  /** Effects retired early (taken over, cut): skipped by the update pass, whichever list holds them. */
  private readonly dead = new WeakSet<Fx>();
  private readonly meta = new WeakMap<Fx, RunMeta>();
  /** A v1 protect's actors, by key, so whole maneuvers can wait for it (agent.light, 14 §4). */
  private readonly guarded = new WeakMap<Protect, Set<CanonicalKey>>();
  /** Effects started per command name, a running total (the census). */
  readonly started = new Map<string, number>();

  metaOf(f: Fx): RunMeta | undefined {
    return this.meta.get(f);
  }

  /** Every live effect (not tells), for the census and volatility. */
  live(): Fx[] {
    return this.fx.filter((f) => !this.dead.has(f));
  }

  /** Effects the budget may cut: decoration. Never a move, a pending step, or a protect. */
  private cuttable(f: Fx): boolean {
    return !f.grand && (this.meta.get(f)?.cuttable ?? false);
  }

  add(f: Fx, meta?: RunMeta): void {
    if (meta) {
      this.meta.set(f, meta);
      this.started.set(meta.name, (this.started.get(meta.name) ?? 0) + 1);
    }
    this.fx.push(f);
    // Budget: past the cap, cut the oldest decorative effect (continuity: moves are never cut).
    while (this.fx.filter((x) => this.cuttable(x)).length > activeProfile().render.limits.maxActiveFx) {
      const i = this.fx.findIndex((x) => this.cuttable(x));
      if (i < 0) break;
      const [cut] = this.fx.splice(i, 1);
      if (cut) this.retire(cut);
    }
  }

  /** Run `fn` now, or after `delay` effect-seconds on the given clock. */
  at(delay: number, fn: () => void, kind: 'travel' | 'accent' = 'accent'): void {
    if (delay <= 1e-3) fn();
    else this.fx.push(new After(delay, fn, kind));
  }

  /** Registers a protected moment over these actors (05 §5). */
  protect(scene: GraphScene, eventKey: string, keys: readonly CanonicalKey[], durS: number, meta: RunMeta): Protect {
    const set = new Set(keys);
    const p = new Protect(scene, eventKey, (n: ViewNode) => set.has(n.canonicalKey), durS);
    this.guarded.set(p, set);
    this.add(p, meta);
    return p;
  }

  /** Lets `pk` go from `eventKey`'s protect now (a close's glide, 22 C3). */
  release(eventKey: string, pk: string): void {
    for (const f of this.fx) if (f instanceof Protect && f.eventKey === eventKey && !this.dead.has(f)) f.release(pk);
  }

  /** How long until no protect of another event holds any of `keys` (effect-seconds; 0 if free). */
  protectedFor(keys: readonly CanonicalKey[], owner?: string): number {
    let wait = 0;
    for (const f of this.fx) {
      if (!(f instanceof Protect) || f.eventKey === owner || this.dead.has(f)) continue;
      const held = this.guarded.get(f);
      if (held && keys.some((k) => held.has(k))) wait = Math.max(wait, f.remaining);
    }
    return wait;
  }

  /** How long a node stays protected from movers other than `owner` (effect-seconds; 0 if free). */
  blockedFor(scene: GraphScene, pk: string, owner?: string): number {
    let wait = 0;
    let node: ViewNode | undefined;
    for (const f of this.fx) {
      if (!(f instanceof Protect) || f.eventKey === owner || this.dead.has(f)) continue;
      node ??= scene.targetNodes().find((n) => n.projectionKey === pk);
      if (node && f.matches(node)) wait = Math.max(wait, f.remaining);
    }
    return wait;
  }

  /**
   * Start a node's move. A move already steering it is retired first, and the new one starts where the
   * node is drawn now. With a `delay`, the node is held where it is until the move begins, so it never
   * drifts toward its new place and snaps back. A protected moment's cast waits for the moment.
   */
  move(scene: GraphScene, pk: string, make: (from: [number, number]) => Fx, from: [number, number], delay = 0, owner?: string, meta?: RunMeta): void {
    const prev = this.movers.get(pk);
    const wait = this.blockedFor(scene, pk, owner);
    if (wait > delay + 1e-3) {
      if (prev) {
        this.fx.push(new After(wait, () => this.move(scene, pk, make, (scene.liveOf(pk) as [number, number] | null) ?? from, 0, owner, meta)));
        return;
      }
      delay = wait;
    }
    let start = from;
    if (prev) {
      start = (scene.liveOf(pk) as [number, number] | null) ?? from;
      this.fx = this.fx.filter((f) => f !== prev);
      this.retire(prev);
    }
    if (delay > 1e-3) {
      const hold = new HoldFor(scene, pk, start, Infinity);
      this.movers.set(pk, hold);
      this.fx.push(hold);
      this.fx.push(new After(delay, () => {
        if (this.movers.get(pk) !== hold) return; // something else took the node over meanwhile
        this.move(scene, pk, make, start, 0, owner, meta);
      }));
      return;
    }
    const f = make(start);
    this.movers.set(pk, f);
    this.add(f, meta);
  }

  retire(f: Fx): void {
    if (this.dead.has(f)) return;
    this.dead.add(f);
    f.destroy();
    for (const [pk, m] of this.movers) if (m === f) this.movers.delete(pk);
  }

  /** Whether a grand flare is bursting now (lesser flares shrink; decoration ducks). */
  bursting(): boolean {
    return this.grandFree > this.clock + 1e-3;
  }

  /** One grand burst at a time: when a grand flare wanting to start in `want` s may burst (≤ `cap`). Books it. */
  grandSlot(want: number, cap: number): number {
    const start = Math.min(Math.max(want, this.grandFree - this.clock), Math.max(want, cap));
    this.grandFree = this.clock + start + GRAND_BURST_S;
    return start;
  }

  /** Once per frame. `frozen`: the user paused, so effects hold in place. */
  step(dtMs: number, frozen: boolean): void {
    if (frozen) return;
    const dt = dtMs / 1000;
    this.clock += dt * motion.pulse;
    const rate = (f: Fx) => ((this.meta.get(f)?.clock ?? f.kind) === 'travel' ? motion.travel : motion.pulse);
    // Effects may spawn follow-ups as they finish: those join after this pass.
    const run = (list: Fx[]) => list.filter((f) => {
      if (this.dead.has(f)) return false;
      let alive: boolean;
      try {
        alive = f.update(dt * rate(f));
      } catch (e) {
        // One broken effect must never stop playback: retire it and carry on.
        console.error('effect failed; retired', e);
        alive = false;
      }
      if (!alive) this.retire(f);
      return alive;
    });
    const running = this.fx;
    this.fx = [];
    const kept = run(running);
    this.fx = [...kept, ...this.fx];
    this.tells = run(this.tells);
    // Ducking: while a grand flare bursts, everything decorative dims so the moment stays clear.
    const ducking = this.bursting() && this.fx.some((f) => f.grand);
    for (const f of this.fx) if (!f.grand) f.duck?.(ducking ? DUCK : 1);
  }

  dropTells(): void {
    for (const t of this.tells) t.destroy();
    this.tells = [];
  }

  /** Destroy every effect and tell (INV-15). The caller releases edges, thaws and lands stages. */
  clear(): void {
    for (const f of [...this.fx, ...this.tells]) if (!this.dead.has(f)) f.destroy();
    this.fx = [];
    this.tells = [];
    this.movers.clear();
    this.grandFree = this.clock;
  }
}

/** Keeps a node where it is for `dur` effect-seconds (Infinity: until another move takes it over). */
export class HoldFor implements Fx {
  readonly kind = 'travel';
  private t = 0;
  constructor(private readonly scene: GraphScene, private readonly pk: string, private readonly at: [number, number], private readonly dur: number) {
    scene.own(pk);
    scene.placeAt(pk, at[0], at[1]);
  }
  update(dt: number): boolean {
    this.t += dt;
    this.scene.placeAt(this.pk, this.at[0], this.at[1]);
    return this.t < this.dur;
  }
  destroy(): void {
    this.scene.release(this.pk);
  }
}

/**
 * A sortie (13 §6, a captain at work): the node flies out to a live point (beside the work), holds
 * there nosed toward it, then flies back to wherever its layout puts it now. Along a gentle arc, with
 * a wake on the way out. It starts from where the node is drawn, so a glide in progress never jumps.
 */
export class Sortie implements Fx {
  readonly kind = 'travel';
  private t = 0;
  private readonly streak: Streak | null;
  private parked: [number, number] | null = null;
  /** A guest's arrival (22 C8, K-13): no flight out; it drops out of hyperspace at the spot instead. */
  private readonly flash: Graphics | null;
  constructor(
    private readonly scene: GraphScene, private readonly pk: string, private readonly start: [number, number],
    private readonly to: () => readonly [number, number] | null, private readonly look: () => readonly [number, number] | null,
    private readonly outS: number, private readonly holdS: number, private readonly backS: number, private readonly wake = 0,
    private readonly jump = false,
    /** Seconds it stays parked after its hold (plate shut), when the same captain's next turn follows soon (P4, `nearWaits`), before flying back. */
    private readonly waitS = 0,
  ) {
    scene.own(pk);
    scene.placeAt(pk, start[0], start[1]);
    this.streak = wake || jump ? new Streak(scene.fxLayer(), TRAIL_COLOR) : null;
    this.flash = jump ? new Graphics() : null;
    if (this.flash) {
      this.flash.blendMode = 'add';
      scene.fxLayer().addChild(this.flash);
      scene.fadeView(pk, 0);
    }
  }
  /**
   * The jump in (K-13): hidden at its spot, then in from behind along its heading, stretched by a
   * streak, finishing as the out leg ends, so the ship's part begins only once it has fully arrived.
   */
  private jumpIn(slot: readonly [number, number], t: number): [number, number] {
    const w = Math.min(JUMP_IN_S, this.outS);
    const u = Math.max(0, Math.min(1, (t - (this.outS - w)) / Math.max(1e-3, w)));
    const k = 1 - (1 - u) ** 3;
    const look = this.look();
    const dir = look && Math.abs(look[0] - slot[0]) > 1e-6 ? Math.sign(look[0] - slot[0]) : this.scene.facingOf(this.pk) ?? 1;
    this.scene.faceView(this.pk, dir);
    const px = 1 / this.scene.currentScale();
    const reach = 90 * px;
    const p: [number, number] = [slot[0] - dir * reach * (1 - k), slot[1]];
    this.scene.fadeView(this.pk, u <= 0 ? 0 : Math.min(1, u / 0.35));
    if (u > 0 && u < 1) this.streak?.draw([p[0] - dir * reach * 0.9 * (1 - k), p[1]], p, 2 * px, 0.6 * (1 - k));
    else this.streak?.draw(p, p, 0, 0);
    const g = this.flash!.clear();
    if (u > 0.75) {
      const f = (u - 0.75) / 0.25;
      g.circle(slot[0], slot[1], (8 + 10 * f) * px).stroke({ width: 1.2 * px, color: 0xe8fbff, alpha: 0.5 * (1 - f) });
    }
    return p;
  }
  private arc(a: readonly [number, number], b: readonly [number, number], u: number): [number, number] {
    const k = easeInOut(u);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const lift = len * 0.18;
    const cx = (a[0] + b[0]) / 2 + (-(b[1] - a[1]) / len) * lift;
    const cy = (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * lift;
    const v = 1 - k;
    return [v * v * a[0] + 2 * v * k * cx + k * k * b[0], v * v * a[1] + 2 * v * k * cy + k * k * b[1]];
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const slot = this.to() ?? this.parked ?? this.start;
    let p: [number, number];
    if (this.flash && t < this.outS) p = this.jumpIn(slot, t);
    else if (t < this.outS) {
      p = this.arc(this.start, slot, t / Math.max(1e-3, this.outS));
      if (Math.abs(slot[0] - this.start[0]) > 1e-6) this.scene.faceView(this.pk, slot[0] - this.start[0]);
      if (this.streak) this.streak.draw(this.start, p, this.wake / this.scene.currentScale(), 0.6 * (1 - t / this.outS));
    } else if (t < this.outS + this.holdS + this.waitS) {
      if (this.flash) { this.scene.fadeView(this.pk, 1); this.flash.clear(); }
      // Parked where it arrived (22 A10): it works from there, nosed toward the work, and never drifts
      // past it while its beam is on; movement and work are two acts.
      p = this.parked ??= [slot[0], slot[1]];
      this.streak?.draw(p, p, 0, 0);
      const w = this.look();
      if (w && Math.abs(w[0] - p[0]) > 1e-6) this.scene.faceView(this.pk, w[0] - p[0]); // nose toward the work
    } else {
      const home = this.scene.goalOf(this.pk) ?? this.start;
      const from = this.parked ?? slot;
      p = this.arc(from, home, (t - this.outS - this.holdS - this.waitS) / Math.max(1e-3, this.backS));
      if (Math.abs(home[0] - from[0]) > 1e-6) this.scene.faceView(this.pk, home[0] - from[0]);
    }
    this.scene.placeAt(this.pk, p[0], p[1]);
    return t < this.outS + this.holdS + this.waitS + this.backS;
  }
  /**
   * How open its captain's plate should be now (22 B9): shut in flight, unfurling over `foldS` once
   * parked, open through the hold, folded again as the hold ends, so the ship leaves with it shut. It
   * follows the flight as flown, however late a protect let it set off.
   */
  crewOpen(foldS: number): number {
    const h = this.t - this.outS;
    if (h < 0 || h > this.holdS) return 0;
    return Math.max(0, Math.min(1, h / foldS, (this.holdS - h) / foldS));
  }

  destroy(): void {
    if (this.flash) { this.scene.fadeView(this.pk, 1); this.flash.destroy(); }
    this.scene.release(this.pk);
    this.scene.restoreFacing(this.pk);
    this.streak?.destroy();
  }
}

/** A guest's drop out of hyperspace at its spot (s, K-13): it fits inside every rule's gather (≥ 400 ms). */
export const JUMP_IN_S = 0.4;

