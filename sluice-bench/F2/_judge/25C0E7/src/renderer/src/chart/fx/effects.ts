// Accent effects (06 §5): short-lived world-space objects in the scene's effect layer. Each advances
// on effect time, which the director scales by kind (05 §5 measured motion): travel at the rate,
// flares and rings at most 2×. All of them are additive light over the painting, crisp (no paint
// filter), and visibly different from ambient motion.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { brighten } from '../art/energy';
import { lighten } from '../art/lit';

export interface Fx {
  /** 'travel' moves at the playback rate; 'accent' at most 2×. */
  readonly kind: 'travel' | 'accent';
  /** Advance by effect seconds; false when finished. */
  update(dt: number): boolean;
  destroy(): void;
  /** Ducking (05 §5): dim toward `k` while a grand flare bursts; 1 restores. Decorative effects only. */
  duck?(k: number): void;
  /** The completion flare: never ducked, and one bursts at a time. */
  readonly grand?: boolean;
}

/**
 * A point an effect reaches for: fixed, or live (read every frame), so a beam or a line follows the
 * object it connects even while that object is still moving (05 §5 continuity).
 */
export type Anchor = readonly [number, number] | (() => readonly [number, number] | null);
function resolver(a: Anchor): () => [number, number] {
  let last: [number, number] = [0, 0];
  return () => {
    const p = typeof a === 'function' ? a() : a;
    if (p) last = [p[0], p[1]];
    return last;
  };
}

/** Eases a duck level toward its target, so dimming never pops. */
function easeDim(cur: number, target: number): number {
  return cur + (target - cur) * 0.12;
}

/** Waits, then runs `fn` once (a staggered or follow-up accent). Cancelled with everything else. */
export class After implements Fx {
  readonly kind: 'travel' | 'accent';
  private t = 0;
  constructor(private readonly delay: number, private readonly fn: () => void, kind: 'travel' | 'accent' = 'accent') {
    this.kind = kind;
  }
  update(dt: number): boolean {
    this.t += dt;
    if (this.t < this.delay) return true;
    this.fn();
    return false;
  }
  destroy(): void {}
}

// ---- Shared glow texture ----

let glow: Texture | null = null;
/** A soft round glow (white to clear), tinted per use: one texture for every flare. */
export function glowTexture(): Texture {
  if (glow) return glow;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glow = Texture.from(c);
  return glow;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export const easeIn = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 2.2);
export const easeInOut = (t: number) => smooth(0, 1, t);
/** Overshoots a little, then settles (arrivals, re-expanding dots). */
export const easeOutBack = (t: number) => {
  const u = Math.max(0, Math.min(1, t)) - 1;
  const c = 1.6;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
/** A vessel undocking: clamps release, it drifts clear of the bay, then accelerates away (06 §5). */
export const easeUndock = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.38 ? 0.1 * smooth(0, 1, u / 0.38) : 0.1 + 0.9 * smooth(0, 1, (u - 0.38) / 0.62);
};

function glowSprite(color: number): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.tint = color;
  s.blendMode = 'add';
  return s;
}

// ---- Flares (06 §5, decided 2026-10-02) ----

export interface FlareSpec {
  /** Peak aura radius, in multiples of the object's radius. */
  scale: number;
  /** Seconds (effect time) until it has died back. */
  linger: number;
  /** The completion flare: core flash, expanding ring, sparks, starburst. */
  grand?: boolean;
  /** Nearing: a few sparks in this color (gold creeping in). */
  sparks?: number;
}

/**
 * An aura flare: the object's glow swells to `scale`× its radius in the rung's color, then lingers
 * and dies back. The grand flare (into Accomplished) adds a core flash, an expanding ring, radiating
 * sparks, and an eight-point starburst: the biggest, busiest, most satisfying moment on the chart.
 */
export class Flare implements Fx {
  readonly kind = 'accent';
  private readonly root = new Container();
  private readonly aura: Sprite;
  private readonly core: Sprite | null = null;
  private readonly ring = new Graphics();
  private readonly sparks = new Graphics();
  private readonly burst = new Graphics();
  private readonly sparkDirs: { a: number; v: number; s: number }[] = [];
  private t = 0;
  private dim = 1;
  private dimTarget = 1;
  readonly grand: boolean;

  constructor(layer: Container, x: number, y: number, private readonly r: number, private readonly color: number, private readonly spec: FlareSpec, private readonly px: number) {
    this.grand = !!spec.grand;
    this.root.position.set(x, y);
    this.aura = glowSprite(color);
    this.ring.blendMode = 'add';
    this.root.addChild(this.aura, this.ring);
    if (spec.grand) {
      this.core = glowSprite(lighten(color, 0.6));
      this.burst.blendMode = 'add';
      this.sparks.blendMode = 'add';
      this.root.addChild(this.burst, this.core, this.sparks);
      for (let i = 0; i < 18; i++) this.sparkDirs.push({ a: (i / 18) * Math.PI * 2 + Math.sin(i * 7.1) * 0.2, v: 0.7 + 0.6 * Math.abs(Math.sin(i * 3.7)), s: 0.6 + 0.6 * Math.abs(Math.cos(i * 5.3)) });
    } else if (spec.sparks !== undefined) {
      this.sparks.blendMode = 'add';
      this.root.addChild(this.sparks);
      for (let i = 0; i < 6; i++) this.sparkDirs.push({ a: (i / 6) * Math.PI * 2 + 0.4, v: 0.5, s: 0.5 });
    }
    layer.addChild(this.root);
  }

  duck(k: number): void {
    this.dimTarget = k;
  }

  /** Seconds since it started: a grand flare's burst is its first second or so. */
  get age(): number {
    return this.t;
  }

  update(dt: number): boolean {
    this.t += dt;
    this.dim = easeDim(this.dim, this.dimTarget);
    this.root.alpha = this.dim;
    const { scale, linger, grand } = this.spec;
    const t = this.t;
    const grow = easeOut(t / 1.0); // a leisurely swell (decided 2026-10-03)
    const fade = 1 - smooth(1.0, linger, t);
    const R = this.r * (1 + (scale - 1) * grow);
    this.aura.width = this.aura.height = R * 2.8; // the sprite's soft edge reaches about its half size
    this.aura.alpha = (scale < 1.4 ? 0.45 : grand ? 1 : 0.8) * fade * (0.85 + 0.15 * Math.sin(t * 5));
    this.ring.clear();
    const ringT = grand ? 2.2 : 1.6;
    const ringR = this.r * (1.02 + (scale - 0.9) * easeOut(t / ringT));
    const ringA = (1 - smooth(0, ringT + 0.2, t)) * (scale < 1.4 ? 0.45 : 0.75);
    if (ringA > 0.01) this.ring.circle(0, 0, ringR).stroke({ width: (grand ? 3 : 2) * this.px, color: lighten(this.color, 0.35), alpha: ringA });
    if (this.core) {
      const flash = Math.exp(-Math.pow((t - 0.2) / 0.3, 2));
      this.core.width = this.core.height = this.r * (1.6 + 1.4 * flash);
      this.core.alpha = Math.min(1, flash * 1.2 + 0.2 * fade);
      // The starburst crown flares once, turning slowly, then settles.
      const b = this.burst.clear();
      const ba = (1 - smooth(0.3, 3.6, t)) * smooth(0, 0.25, t);
      if (ba > 0.01) {
        const len = this.r * (1.3 + 1.5 * easeOut(t / 1.3));
        const spin = t * 0.25;
        const pts: number[] = [];
        for (let i = 0; i < 16; i++) {
          const a = spin + (i / 16) * Math.PI * 2;
          const rr = i % 2 === 0 ? len * (i % 4 === 0 ? 1 : 0.62) : this.r * 0.42;
          pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        b.poly(pts).fill({ color: lighten(this.color, 0.25), alpha: 0.35 * ba });
      }
    }
    if (this.sparkDirs.length) {
      const g = this.sparks.clear();
      const sa = (1 - smooth(0.3, linger * 0.85, t)) * smooth(0, 0.1, t);
      const c = this.spec.sparks ?? lighten(this.color, 0.5);
      for (const d of this.sparkDirs) {
        const dist = this.r * (1.05 + d.v * 1.6 * easeOut(t / 2.4) + d.v * 0.08 * t);
        const tw = 0.6 + 0.4 * Math.sin(t * (6 + d.v * 4) + d.a * 9);
        g.circle(Math.cos(d.a) * dist, Math.sin(d.a) * dist, Math.max(2 * this.px, this.r * 0.05 * d.s)).fill({ color: c, alpha: sa * tw });
      }
    }
    return t < linger;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ---- Rings and pulses ----

/** One ring expanding and fading: arrival rings, scan glints, a station powering up, sector pulses. */
export class Ring implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private t = 0;
  private dim = 1;
  private dimTarget = 1;
  duck(k: number): void {
    this.dimTarget = k;
  }

  constructor(layer: Container, x: number, y: number, private readonly r0: number, private readonly r1: number, private readonly color: number, private readonly dur: number, private readonly px: number, private readonly alpha = 0.8) {
    this.g.position.set(x, y);
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }

  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    this.dim = easeDim(this.dim, this.dimTarget);
    this.g.alpha = this.dim;
    this.g.clear().circle(0, 0, this.r0 + (this.r1 - this.r0) * easeOut(u)).stroke({ width: 2 * this.px, color: this.color, alpha: this.alpha * (1 - u) });
    return u < 1;
  }

  destroy(): void {
    this.g.destroy();
  }
}

// ---- Ink along a path (routes and orbits) ----

/**
 * Light travelling along a path: a bright head with the inked path glowing behind it, then fading.
 * Reversed for removals (a retracting route, an orbit fading), and dimmer.
 */
export class Ink implements Fx {
  readonly kind = 'travel';
  private readonly g = new Graphics();
  private readonly head: Sprite;
  private t = 0;
  private readonly lengths: number[] = [0];
  private dim = 1;
  private dimTarget = 1;
  duck(k: number): void {
    this.dimTarget = k;
  }

  private pts: [number, number][] = [];
  private readonly path: () => [number, number][];
  /**
   * `path`: fixed points, or two live anchors (a line between moving objects). `onDone` runs when the
   * ink has drawn the whole path: the moment the static line takes over (05 §5 edge reveal).
   */
  constructor(layer: Container, path: [number, number][] | readonly [Anchor, Anchor], private readonly color: number, private readonly dur: number, private readonly px: number, private readonly reverse = false, private onDone?: () => void) {
    if (path.length === 2 && (typeof path[0] === 'function' || typeof path[1] === 'function')) {
      const a = resolver(path[0] as Anchor);
      const b = resolver(path[1] as Anchor);
      this.path = () => [a(), b()];
    } else {
      const fixed = path as [number, number][];
      this.path = () => fixed;
    }
    this.measure();
    this.g.blendMode = 'add';
    this.head = glowSprite(lighten(color, 0.5));
    this.head.width = this.head.height = 16 * px;
    layer.addChild(this.g, this.head);
  }

  private measure(): void {
    this.pts = this.path();
    this.lengths.length = 1;
    for (let i = 1; i < this.pts.length; i++) this.lengths.push(this.lengths[i - 1]! + Math.hypot(this.pts[i]![0] - this.pts[i - 1]![0], this.pts[i]![1] - this.pts[i - 1]![1]));
  }

  private at(d: number): [number, number] {
    const L = this.lengths;
    let i = 1;
    while (i < L.length - 1 && L[i]! < d) i++;
    const a = this.pts[i - 1]!;
    const b = this.pts[i]!;
    const seg = L[i]! - L[i - 1]! || 1;
    const k = Math.max(0, Math.min(1, (d - L[i - 1]!) / seg));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  update(dt: number): boolean {
    this.t += dt;
    this.measure();
    if (this.t >= this.dur && this.onDone) {
      const done = this.onDone;
      this.onDone = undefined;
      done();
    }
    const total = this.lengths[this.lengths.length - 1]!;
    const u = easeInOut(this.t / this.dur);
    const fade = 1 - smooth(this.dur, this.dur + 0.5, this.t);
    this.dim = easeDim(this.dim, this.dimTarget);
    this.g.alpha = this.dim;
    const g = this.g.clear();
    const from = this.reverse ? total * u : 0;
    const to = this.reverse ? total : total * u;
    const n = 24;
    const strength = this.reverse ? 0.45 : 0.85;
    for (let i = 0; i < n; i++) {
      const d0 = from + ((to - from) * i) / n;
      const d1 = from + ((to - from) * (i + 1)) / n;
      const [x0, y0] = this.at(d0);
      const [x1, y1] = this.at(d1);
      // Brightest near the head.
      const k = this.reverse ? 1 - i / n : (i + 1) / n;
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 2.5 * this.px, color: this.color, alpha: strength * fade * (0.25 + 0.75 * k) });
    }
    const [hx, hy] = this.at(this.reverse ? from : to);
    this.head.position.set(hx, hy);
    this.head.alpha = fade * (this.t < this.dur ? 1 : 0.6) * this.dim;
    return this.t < this.dur + 0.5;
  }

  destroy(): void {
    this.onDone?.(); // cut short: still hand the line over, so nothing stays hidden
    this.g.destroy();
    this.head.destroy();
  }
}

/** A narrow beam from one point to another with a quick falloff (the author's beam, 06 §5). */
export class Beam implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private t = 0;
  private dim = 1;
  private dimTarget = 1;
  duck(k: number): void {
    this.dimTarget = k;
  }

  private readonly a: () => [number, number];
  private readonly b: () => [number, number];
  constructor(layer: Container, a: Anchor, b: Anchor, private readonly color: number, private readonly dur: number, private readonly px: number) {
    this.a = resolver(a);
    this.b = resolver(b);
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }

  update(dt: number): boolean {
    this.t += dt;
    const u = this.t / this.dur;
    const reach = easeOut(u / 0.35);
    const alpha = 1 - smooth(0.35, 1, u);
    this.dim = easeDim(this.dim, this.dimTarget);
    this.g.alpha = this.dim;
    const [ax, ay] = this.a();
    const [tx, ty] = this.b();
    const bx = ax + (tx - ax) * reach;
    const by = ay + (ty - ay) * reach;
    this.g.clear()
      .moveTo(ax, ay).lineTo(bx, by).stroke({ width: 5 * this.px, color: this.color, alpha: 0.18 * alpha })
      .moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1.6 * this.px, color: lighten(this.color, 0.5), alpha: 0.9 * alpha })
      .circle(bx, by, 4 * this.px).fill({ color: lighten(this.color, 0.6), alpha: alpha });
    return u < 1;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/**
 * The reverse flare (a reopen, 06 §5): a gold ring gathers in from outside and contracts onto the
 * object, cooling to the earlier rung's color. Gentle: no red, no shake.
 */
export class Implode implements Fx {
  readonly kind = 'accent';
  private readonly root = new Container();
  private readonly aura: Sprite;
  private readonly ring = new Graphics();
  private t = 0;
  private readonly dur = 1.6;

  constructor(layer: Container, x: number, y: number, private readonly r: number, private readonly from: number, private readonly to: number, private readonly px: number) {
    this.root.position.set(x, y);
    this.aura = glowSprite(from);
    this.ring.blendMode = 'add';
    this.root.addChild(this.aura, this.ring);
    layer.addChild(this.root);
  }

  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const k = easeInOut(u);
    const color = mixColor(this.from, this.to, smooth(0.2, 0.9, u));
    const R = this.r * (1.9 - 0.85 * k);
    this.ring.clear().circle(0, 0, R).stroke({ width: 2 * this.px, color: lighten(color, 0.3), alpha: 0.7 * (1 - smooth(0.75, 1, u)) * smooth(0, 0.1, u) });
    this.aura.tint = color;
    this.aura.width = this.aura.height = this.r * (2.6 - 0.8 * k);
    this.aura.alpha = 0.55 * (1 - u) * smooth(0, 0.15, u);
    return u < 1;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A point of light travelling between two points (a radar dot moving along its spoke; an echo). */
export class Spark implements Fx {
  readonly kind = 'accent';
  private readonly head: Sprite;
  private readonly tail = new Graphics();
  private t = 0;

  private readonly a: () => [number, number];
  private readonly b: () => [number, number];
  constructor(layer: Container, a: Anchor, b: Anchor, color: number, private readonly dur: number, private readonly px: number, size = 14, private onDone?: () => void) {
    this.a = resolver(a);
    this.b = resolver(b);
    this.head = glowSprite(lighten(color, 0.4));
    this.head.width = this.head.height = size * px;
    this.tail.blendMode = 'add';
    this.color = color;
    layer.addChild(this.tail, this.head);
  }
  private readonly color: number;

  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const k = easeInOut(u);
    const [ax, ay] = this.a();
    const [bx, by] = this.b();
    const x = ax + (bx - ax) * k;
    const y = ay + (by - ay) * k;
    const k0 = Math.max(0, k - 0.3);
    const tx = ax + (bx - ax) * k0;
    const ty = ay + (by - ay) * k0;
    if (u >= 1 && this.onDone) {
      const done = this.onDone;
      this.onDone = undefined;
      done();
    }
    this.head.position.set(x, y);
    this.head.alpha = 1 - smooth(0.85, 1, u);
    this.tail.clear().moveTo(tx, ty).lineTo(x, y).stroke({ width: 2 * this.px, color: this.color, alpha: 0.5 * (1 - u) });
    return u < 1;
  }

  destroy(): void {
    this.head.destroy();
    this.tail.destroy();
  }
}

function mixColor(a: number, b: number, k: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k) << s;
  return m(16) | m(8) | m(0);
}

/**
 * The tractor beam (06 §5, decided 2026-10-03): how a person's ship works on something, as
 * assistance, never attack. A broad, soft cone of light from the ship to the object, widening to wrap
 * it, with gentle bands drifting out along it and a few motes drifting home (exploring, mining,
 * farming for an outcome). No bright core line: nothing about it reads as a weapon.
 */
export class Tractor implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private t = 0;
  private dim = 1;
  private dimTarget = 1;
  duck(k: number): void {
    this.dimTarget = k;
  }

  constructor(layer: Container, from: Anchor, to: Anchor, private readonly toR: number, private readonly color: number, private readonly dur: number, private readonly px: number) {
    this.from = resolver(from);
    this.to = resolver(to);
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }

  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const env = smooth(0, 0.35, t) * (1 - smooth(this.dur - 0.45, this.dur, t));
    this.dim = easeDim(this.dim, this.dimTarget);
    this.g.alpha = this.dim;
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = 5 * this.px;
    const w1 = this.toR * 1.05;
    const at = (k: number, side: number, widen = 1): [number, number] => {
      const w = (w0 + (w1 - w0) * k) * widen;
      return [ax + dx * k + nx * w * side, ay + dy * k + ny * w * side];
    };
    const g = this.g.clear();
    // Two soft cones, outer and inner, for a gradient with no hard edge.
    for (const [widen, alpha] of [[1.15, 0.07], [0.7, 0.09]] as const) {
      g.poly([...at(0, -1, widen), ...at(1, -1, widen), ...at(1, 1, widen), ...at(0, 1, widen)]).fill({ color: this.color, alpha: alpha * env });
    }
    // Gentle bands drifting out along the beam toward the object.
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.45 + i / 3) % 1;
      const [x0, y0] = at(k, -0.9);
      const [x1, y1] = at(k, 0.9);
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 2 * this.px, color: brighten(this.color, 0.4), alpha: 0.22 * env * Math.sin(Math.PI * k) });
    }
    // A soft glow where it wraps the object, and a few motes drifting home along it.
    g.circle(bx, by, this.toR * 1.08).stroke({ width: 3 * this.px, color: brighten(this.color, 0.3), alpha: 0.18 * env });
    for (let i = 0; i < 5; i++) {
      const k = 1 - ((t * 0.3 + i / 5) % 1);
      const [mx, my] = at(k, Math.sin(i * 2.3) * 0.6);
      g.circle(mx, my, 1.6 * this.px).fill({ color: brighten(this.color, 0.6), alpha: 0.5 * env * Math.sin(Math.PI * k) });
    }
    return t < this.dur;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/**
 * Support (06 §5 review formation, decided 2026-10-03): a reviewer empowering the author. A warm
 * stream of gold motes flows from the supporter's ship into the author's, over a faint ribbon, and
 * the author's ship glows brighter as it arrives. Distinct from the tractor beam (a cyan cone onto
 * the work): this is energy between people.
 */
export class Support implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly glow: Sprite;
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private t = 0;
  private dim = 1;
  private dimTarget = 1;
  duck(k: number): void {
    this.dimTarget = k;
  }

  constructor(layer: Container, from: Anchor, to: Anchor, private readonly toR: number, private readonly color: number, private readonly dur: number, private readonly px: number) {
    this.from = resolver(from);
    this.to = resolver(to);
    this.g.blendMode = 'add';
    this.glow = glowSprite(lighten(color, 0.3));
    layer.addChild(this.g, this.glow);
  }

  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const env = smooth(0, 0.4, t) * (1 - smooth(this.dur - 0.5, this.dur, t));
    this.dim = easeDim(this.dim, this.dimTarget);
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const g = this.g.clear();
    g.alpha = this.dim;
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 6 * this.px, color: this.color, alpha: 0.06 * env });
    // Motes flow toward the author, weaving gently, brightest as they arrive.
    for (let i = 0; i < 9; i++) {
      const k = (t * 0.55 + i / 9) % 1;
      const wave = Math.sin(k * Math.PI * 2 + i) * 4 * this.px;
      const x = ax + dx * k + nx * wave;
      const y = ay + dy * k + ny * wave;
      g.circle(x, y, (1.4 + 1.2 * k) * this.px).fill({ color: lighten(this.color, 0.5), alpha: 0.75 * env * Math.sin(Math.PI * Math.min(1, k * 1.15)) });
    }
    this.glow.position.set(bx, by);
    this.glow.width = this.glow.height = this.toR * 3.2;
    this.glow.alpha = 0.45 * env * this.dim * (0.85 + 0.15 * Math.sin(t * 4));
    return t < this.dur;
  }

  destroy(): void {
    this.g.destroy();
    this.glow.destroy();
  }
}

/**
 * An intention (05 §5): a line inks from an object toward where it means to go, then holds from the
 * object's live position to the goal while the object travels, so the line is consumed behind it.
 * `finish()` lets it fade once the object has arrived.
 */
export class Intent implements Fx {
  readonly kind = 'travel';
  private readonly g = new Graphics();
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private t = 0;
  private ending: number | null = null;

  constructor(layer: Container, from: Anchor, to: Anchor, private readonly color: number, private readonly inkS: number, private readonly px: number, private readonly maxS = 8) {
    this.from = resolver(from);
    this.to = resolver(to);
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }

  finish(): void {
    if (this.ending === null) this.ending = this.t;
  }

  update(dt: number): boolean {
    this.t += dt;
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const k = easeInOut(this.t / this.inkS);
    const fade = this.ending === null ? 1 : 1 - Math.min(1, (this.t - this.ending) / 0.5);
    const ex = ax + (bx - ax) * k;
    const ey = ay + (by - ay) * k;
    this.g.clear()
      .moveTo(ax, ay).lineTo(ex, ey).stroke({ width: 6 * this.px, color: this.color, alpha: 0.08 * fade })
      .moveTo(ax, ay).lineTo(ex, ey).stroke({ width: 1.6 * this.px, color: lighten(this.color, 0.35), alpha: 0.55 * fade })
      .circle(bx, by, 3 * this.px).fill({ color: lighten(this.color, 0.5), alpha: 0.6 * fade * k });
    return fade > 0 && this.t < this.maxS;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** A streak of light between two moving points: the wake of a flight. Updated by its owner. */
export class Streak {
  readonly g = new Graphics();

  constructor(layer: Container, private readonly color: number) {
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }

  draw(from: [number, number], to: [number, number], width: number, alpha: number): void {
    const g = this.g.clear();
    const n = 10;
    for (let i = 0; i < n; i++) {
      const k0 = i / n;
      const k1 = (i + 1) / n;
      g.moveTo(from[0] + (to[0] - from[0]) * k0, from[1] + (to[1] - from[1]) * k0)
        .lineTo(from[0] + (to[0] - from[0]) * k1, from[1] + (to[1] - from[1]) * k1)
        .stroke({ width: width * (0.3 + 0.7 * k1), color: this.color, alpha: alpha * k1 * k1 });
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

/**
 * Sector-scale glyphs (05 §5): at a sector's zoom, what happens inside a Feature shows as a small
 * mark on its star, never a scoreboard. A **glint** runs half an orbit around the star (a Story or Bug
 * changed); **specks** circle close in like satellites (Task events); a **spoke** reaches down
 * toward the resources (a PR event: one grammar at every scale, resources at the bottom). A Feature's
 * own change is its core pulse: the star's flare.
 */
export class Glyph implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly dots: Sprite[] = [];
  private t = 0;
  private dim = 1;
  private target = 1;
  constructor(layer: Container, private readonly at: () => [number, number], private readonly r: number, private readonly look: 'glint' | 'specks' | 'spoke', private readonly color: number, private readonly px: number, private readonly dur = 1.6) {
    this.g.blendMode = 'add';
    layer.addChild(this.g);
    const n = look === 'specks' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const s = glowSprite(lighten(color, 0.45));
      s.width = s.height = (look === 'specks' ? 7 : 12) * px;
      layer.addChild(s);
      this.dots.push(s);
    }
  }
  duck(k: number): void {
    this.target = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    this.dim = easeDim(this.dim, this.target);
    const u = Math.min(1, this.t / this.dur);
    const fade = smooth(0, 0.15, u) * (1 - smooth(0.7, 1, u)) * this.dim;
    const [cx, cy] = this.at();
    const g = this.g.clear();
    if (this.look === 'glint') {
      // Half an orbit across the front of the star, on the oblique plane (orbits are half as tall).
      const rx = this.r * 1.9;
      const ry = rx * 0.5;
      const a = Math.PI * (1 - easeInOut(u));
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      for (let i = 1; i <= 8; i++) {
        const b = a + i * 0.06;
        g.circle(cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, (2.2 - i * 0.2) * this.px).fill({ color: this.color, alpha: 0.35 * fade * (1 - i / 9) });
      }
      this.dots[0]!.position.set(x, y);
      this.dots[0]!.alpha = fade;
    } else if (this.look === 'specks') {
      this.dots.forEach((d, i) => {
        const a = (i / 3) * Math.PI * 2 + u * Math.PI * 1.2;
        d.position.set(cx + Math.cos(a) * this.r * 1.35, cy + Math.sin(a) * this.r * 0.68);
        d.alpha = fade;
      });
    } else {
      const top = cy + this.r * 1.05;
      const len = this.r * 1.3;
      g.moveTo(cx, top).lineTo(cx, top + len).stroke({ width: 2 * this.px, color: this.color, alpha: 0.45 * fade });
      this.dots[0]!.position.set(cx, top + len * easeInOut(Math.min(1, u * 1.4)));
      this.dots[0]!.alpha = fade;
    }
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
    for (const d of this.dots) d.destroy();
  }
}
