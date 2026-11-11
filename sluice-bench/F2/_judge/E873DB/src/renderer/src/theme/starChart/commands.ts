// The Star Chart theme's own commands (14 §2.8, art session 2026-10-12), for the merge and the close:
//   guest   a ship with no place in the scene (a reviewer-only guest) jumps in out of hyperspace, holds
//           its spot, and jumps out again
//   charge  light gathering into a station before it fires
//   phaser  a station's hot beam in hero blue, with a bright head and trail, at a hive ship only (02 INV-08)
//   bolt    a quick, small phaser: a captain's (hero blue) or an enemy's (Danger Red, art/energy.ts)
//   energy  a reviewer's energy to an author: the hero blue desaturated, calm, motes flowing in
//   cutter  the tractor beam focused to cut: a captain's at an asteroid
//   mine    a station's mining beam at an asteroid: the phaser's weight, wrapped in a tractor sheath
//   stardust glittering motes swirling round an asteroid as it turns to its done form (22 C3)
// Sizes are in screen px (scaled by one screen pixel in world units), so they read at any zoom.
// Weights follow the seed commands (05 §5): beams 1, a ship 1.5, a charge 0.5.
import type { CanonicalKey } from '@shared/contracts/keys';
import { LABEL_PX } from '@shared/scene/sizing';
import { Container, Graphics, Sprite } from 'pixi.js';
import { CaptainView, fleetDesign } from '../../chart/art/fleet';
import { motion } from '../../chart/art/motion';
import { brighten, coreOf, HERO, HERO_CORE, HERO_SOFT } from '../../chart/art/energy';
import { glowTexture, type Anchor, type Fx } from '../../chart/fx/effects';
import { TRACTOR } from '../../chart/fx/timing';
import type { CommandCall, CommandDef, FxHost } from '../../chart/fx/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const resolve = (a: Anchor): (() => [number, number]) => {
  let last: [number, number] = [0, 0];
  return () => {
    const p = typeof a === 'function' ? a() : a;
    if (p) last = [p[0], p[1]];
    return last;
  };
};
const glow = (color: number): Sprite => {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.tint = color;
  s.blendMode = 'add';
  return s;
};

// ---- guest: a hyperspace jump in, a hold, a jump out ----

export interface GuestArgs { key: CanonicalKey; seed: number; at: Anchor; face: number; durS: number }

/** How long a jump takes, in and out (s). */
const JUMP_S = 0.45;

class GuestShip implements Fx {
  readonly kind = 'travel';
  private readonly root = new Container();
  private readonly ship: CaptainView;
  private readonly fx = new Graphics();
  private readonly at: () => [number, number];
  private t = 0;

  constructor(layer: Container, a: GuestArgs, private readonly px: number) {
    this.at = resolve(a.at);
    // A captain ship at its screen floor (sizing.ts), as the scene would draw it at this zoom.
    this.ship = new CaptainView(fleetDesign(a.seed), LABEL_PX * 0.6 * px);
    this.ship.face(a.face);
    this.face = a.face;
    this.dur = Math.max(JUMP_S * 2 + 0.1, a.durS);
    this.fx.blendMode = 'add';
    this.root.addChild(this.fx, this.ship.root);
    layer.addChild(this.root);
  }
  private readonly face: number;
  private readonly dur: number;

  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const [x, y] = this.at();
    const r = LABEL_PX * 0.6 * this.px;
    // In: out of a streak of light behind it, stretched and decelerating; out: the reverse, ahead.
    const inU = smooth(0, JUMP_S, t);
    const outU = smooth(this.dur - JUMP_S, this.dur, t);
    const off = (1 - inU) * -this.face * r * 9 + outU * this.face * r * 9;
    const stretch = 1 + 2.4 * (1 - inU) + 2.4 * outU;
    this.root.position.set(x, y);
    this.ship.root.position.set(off, 0);
    this.ship.root.scale.set(stretch, 1);
    this.ship.root.alpha = Math.min(inU * 1.4, 1 - outU);
    this.ship.tick(motion.pulseTime);
    const g = this.fx.clear();
    for (const [u, sign] of [[inU, -1], [outU, 1]] as const) {
      const live = u > 0.01 && u < 0.99;
      if (!live) continue;
      const k = Math.sin(Math.PI * u);
      g.moveTo(off, 0).lineTo(off + sign * this.face * r * 6 * k, 0).stroke({ width: 2 * this.px, color: 0xe8fbff, alpha: 0.7 * k });
    }
    // A flash where it drops out of hyperspace (and where it leaves).
    for (const [c, s] of [[JUMP_S * 0.9, 1], [this.dur - JUMP_S * 0.1, -1]] as const) {
      const age = (t - c) * s;
      if (age > -0.05 && age < 0.4) {
        const f = clamp01(age / 0.4);
        g.circle(0, 0, r * (0.6 + 1.6 * f)).stroke({ width: 1.5 * this.px, color: 0xe8fbff, alpha: 0.6 * (1 - f) });
        g.circle(0, 0, r * 0.6 * (1 - f)).fill({ color: 0xffffff, alpha: 0.5 * (1 - f) });
      }
    }
    return t < this.dur;
  }

  destroy(): void {
    this.ship.destroy();
    this.root.destroy({ children: true });
  }
}

// ---- charge: light gathers into a station ----

export interface ChargeArgs { at: Anchor; r: number; color: number; durS: number }

class Charge implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly core: Sprite;
  private readonly at: () => [number, number];
  private t = 0;
  constructor(layer: Container, private readonly a: ChargeArgs, private readonly px: number) {
    this.at = resolve(a.at);
    this.g.blendMode = 'add';
    this.core = glow(brighten(a.color, 0.4));
    layer.addChild(this.g, this.core);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = clamp01(this.t / this.a.durS);
    const [x, y] = this.at();
    const g = this.g.clear();
    // Three rings drawn in from far out, faster each time; the core swells, then flashes as it releases.
    for (let i = 0; i < 3; i++) {
      const k = clamp01((u - i * 0.22) / 0.4);
      if (k <= 0 || k >= 1) continue;
      const rr = this.a.r * (2.6 - 2.1 * k);
      g.circle(x, y, rr).stroke({ width: (1.2 + 1.4 * k) * this.px, color: this.a.color, alpha: 0.65 * Math.sin(Math.PI * k) });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + i * 0.7;
      const k = clamp01((u * 1.3 - (i % 3) * 0.12));
      const rr = this.a.r * (2.2 - 1.9 * k);
      g.circle(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.6 * this.px).fill({ color: brighten(this.a.color, 0.5), alpha: 0.8 * Math.sin(Math.PI * k) });
    }
    const swell = smooth(0, 0.85, u) * (1 - smooth(0.92, 1, u));
    const flash = smooth(0.85, 0.95, u) * (1 - smooth(0.95, 1, u));
    this.core.position.set(x, y);
    this.core.width = this.core.height = this.a.r * (0.5 + 0.9 * swell + 1.4 * flash);
    this.core.alpha = 0.35 + 0.65 * Math.max(swell, flash);
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
    this.core.destroy();
  }
}

// ---- Beams: one effect, three cuts (2026-10-13) ----
// The station's phaser is the master: a hot core inside a body and a wide glow, a bright head that
// reaches out in REACH_S, a trail of after-images, a muzzle flare at the emitter, sparks where it hits,
// and a release that sweeps the tail in. The other cuts are the same beam at other weights:
//   bolt    a captain's phaser, or an enemy's: small and quick (about a third of a second), the same
//           layers at less than half the width; an enemy bolt is Danger Red
//   energy  a reviewer passing energy to an author: thin and calm, desaturated, motes flowing in

export interface FireArgs {
  from: Anchor; to: Anchor; toR: number; durS: number; color?: number;
  /** A bolt's width against its cut's own (station covering fire is a heavier bolt). */
  scale?: number;
  /** 27 D3: ships the beam passes (world units). Where it runs within `r` of one, the hot beam draws at VEIL_ALPHA. */
  veil?: BeamVeil;
}

/** The ships a blocked Power link beam fades past (27 D3). */
export interface BeamVeil { at: readonly (readonly [number, number])[]; r: number }

/** How much of its alpha a beam keeps while it passes a ship (27 D3). */
export const VEIL_ALPHA = 0.3;

interface HotStroke { width: number; color: number; alpha: number; cap: 'round' }

/**
 * One hot-beam stroke from s to e (27 D3). With no veil, or no ship near the segment, the single stroke
 * as ever. Otherwise the stretch within `veil.r` of each near ship (its projection +/- r) draws at
 * VEIL_ALPHA of the alpha. The beam is additive, so joints are butt (round caps would double); the
 * outer ends keep the round cap, drawn as a half-disc.
 */
function strokeVeiled(g: Graphics, [sx, sy]: [number, number], [ex, ey]: [number, number], veil: BeamVeil | undefined, st: HotStroke): void {
  const [dx, dy] = [ex - sx, ey - sy];
  const len = Math.hypot(dx, dy);
  const spans: [number, number][] = [];
  if (veil && len > 0) {
    const [ux, uy] = [dx / len, dy / len];
    for (const [qx, qy] of veil.at) {
      const u = (qx - sx) * ux + (qy - sy) * uy;
      const d = Math.hypot(qx - (sx + ux * Math.min(len, Math.max(0, u))), qy - (sy + uy * Math.min(len, Math.max(0, u))));
      if (d > veil.r) continue;
      const a = Math.max(0, u - veil.r);
      const b = Math.min(len, u + veil.r);
      if (b > a) spans.push([a, b]);
    }
  }
  if (!spans.length) {
    g.moveTo(sx, sy).lineTo(ex, ey).stroke(st);
    return;
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else merged.push([sp[0], sp[1]]);
  }
  const [ux, uy] = [dx / len, dy / len];
  const pieces: [number, number, number][] = []; // from, to, alpha factor
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) pieces.push([at, a, 1]);
    pieces.push([a, b, VEIL_ALPHA]);
    at = b;
  }
  if (at < len) pieces.push([at, len, 1]);
  const half = st.width / 2;
  for (const [a, b, k] of pieces) {
    const alpha = st.alpha * k;
    const [x0, y0, x1, y1] = [sx + ux * a, sy + uy * a, sx + ux * b, sy + uy * b];
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ ...st, alpha, cap: 'butt' });
    for (const [end, cx, cy, sign] of [[0, x0, y0, -1], [len, x1, y1, 1]] as const) {
      if ((sign < 0 ? a : b) !== end) continue;
      // The original round cap, at an outer end only.
      const pts: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const th = (i / 8) * Math.PI - Math.PI / 2; // from -across, through the outward side, to +across
        const [o, c] = [Math.cos(th) * half, Math.sin(th) * half];
        pts.push(cx + sign * ux * o - uy * c * sign, cy + sign * uy * o + ux * c * sign);
      }
      g.poly(pts).fill({ color: st.color, alpha });
    }
  }
}

type BeamCut = 'phaser' | 'bolt' | 'energy';

/** Per cut: width, how long the head takes to reach, how long the release takes, the head's size (px). */
const CUTS: Record<BeamCut, { width: number; reach: number; release: number; head: number }> = {
  phaser: { width: 1, reach: 0.22, release: 0.3, head: 16 },
  bolt: { width: 0.42, reach: 0.07, release: 0.1, head: 7 },
  energy: { width: 0.5, reach: 0.3, release: 0.4, head: 9 },
};

class Beam implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly hit: Sprite;
  private readonly head: Sprite;
  private readonly muzzle: Sprite;
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private readonly core: number;
  private readonly w: number;
  private t = 0;
  private dim = 1;
  constructor(layer: Container, private readonly a: FireArgs, private readonly cut: BeamCut, private readonly color: number, private readonly px: number) {
    this.from = resolve(a.from);
    this.to = resolve(a.to);
    this.core = coreOf(color);
    this.w = CUTS[cut].width * (a.scale ?? 1);
    this.g.blendMode = 'add';
    this.hit = glow(brighten(color, 0.35));
    this.head = glow(this.core);
    this.muzzle = glow(brighten(color, 0.5));
    layer.addChild(this.g, this.hit, this.muzzle, this.head);
  }
  duck(k: number): void {
    this.dim = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const cut = CUTS[this.cut];
    // A bolt shorter than its own reach and release still reaches, holds a moment, and lets go.
    const dur = Math.max(this.a.durS, cut.reach + cut.release + 0.05);
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const [dx, dy] = [bx - ax, by - ay];
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    const [nx, ny] = [-uy, ux];
    const px = this.px;
    const W = this.w;
    // The beam's reach (its head) and its tail (letting go at the end).
    const reach = smooth(0, cut.reach, t);
    const tail = smooth(dur - cut.release, dur, t);
    const [sx, sy] = [ax + dx * tail, ay + dy * tail];
    const [ex, ey] = [ax + dx * reach, ay + dy * reach];
    const on = reach > tail;
    const g = this.g.clear();
    g.alpha = this.dim;
    const flicker = 0.85 + 0.15 * Math.sin(t * 47) * Math.sin(t * 13);
    if (on && (this.cut === 'phaser' || this.cut === 'bolt')) {
      // A hot beam: a wide glow, a body and a white-hot core; it pulses as it holds.
      const w = W * (1 + 0.25 * Math.sin(t * 22));
      for (const [width, color, alpha] of [[14, this.color, 0.16], [7, this.color, 0.5], [3.2, brighten(this.color, 0.4), 0.85], [1.4, this.core, 0.9]] as const) {
        strokeVeiled(g, [sx, sy], [ex, ey], this.a.veil, { width: Math.max(0.8, width * w) * px, color, alpha: alpha * flicker, cap: 'round' });
      }
      // The bright trail: after-images left along the beam as its head went out.
      for (let i = 1; i <= (this.cut === 'bolt' ? 2 : 5); i++) {
        const k = clamp01(reach - i * 0.08);
        if (k <= tail) continue;
        g.circle(ax + dx * k, ay + dy * k, Math.max(0.8, (3.4 - i * 0.45) * W) * px).fill({ color: this.core, alpha: 0.5 * (1 - i / 6) });
      }
    } else if (on && this.cut === 'energy') {
      // Energy given: a soft ribbon, a fine bright line, and motes flowing to the receiver, weaving.
      g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 7 * W * px, color: this.color, alpha: 0.14 * flicker, cap: 'round' });
      g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 2 * W * px, color: brighten(this.color, 0.35), alpha: 0.55, cap: 'round' });
      for (let i = 0; i < 8; i++) {
        const k = (t * 0.7 + i / 8) % 1;
        if (k < tail || k > reach) continue;
        const wob = Math.sin(k * Math.PI * 2 + i) * 2.5 * px;
        g.circle(ax + dx * k + nx * wob, ay + dy * k + ny * wob, (1.1 + 1.1 * k) * px).fill({ color: this.core, alpha: 0.7 * Math.sin(Math.PI * k) });
      }
    }
    // The muzzle: a flare at the emitter while the beam is out, brightest as it fires.
    const fired = on ? 1 - 0.5 * smooth(cut.reach, cut.reach * 3, t) : 0;
    this.muzzle.visible = on && this.cut !== 'energy';
    this.muzzle.position.set(sx, sy);
    this.muzzle.width = this.muzzle.height = (cut.head + 6) * W * px * (0.8 + 0.2 * flicker);
    this.muzzle.alpha = fired * (1 - tail) * this.dim;
    // The head, while it travels, and the glow where it lands.
    this.head.visible = reach < 1;
    this.head.position.set(ex, ey);
    this.head.width = this.head.height = cut.head * (this.cut === 'bolt' ? W / CUTS.bolt.width : 1) * px;
    const landed = smooth(cut.reach * 0.8, cut.reach * 1.4, t) * (1 - tail);
    this.hit.position.set(bx, by);
    const hr = Math.max(this.a.toR * (this.cut === 'bolt' ? 0.6 : 1.1), (this.cut === 'bolt' ? 6 : 14) * px);
    this.hit.width = this.hit.height = hr * (1.6 + 0.35 * Math.sin(t * 17)) * (this.cut === 'phaser' ? 1.15 : 1);
    this.hit.alpha = landed * flicker * this.dim * (this.cut === 'energy' ? 0.7 : 1);
    if (landed > 0.05) {
      // Where it lands: sparks thrown off a hit, a shimmer round something being built or empowered.
      if (this.cut === 'phaser' || this.cut === 'bolt') {
        const n = this.cut === 'bolt' ? 4 : 7;
        for (let i = 0; i < n; i++) {
          const ang = Math.atan2(-uy, -ux) + (((i * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 2.4;
          const ph = (t * 3.1 + i * 0.37) % 1;
          const r0 = hr * 0.3 + hr * 0.9 * ph;
          const r1 = r0 + hr * 0.25;
          g.moveTo(bx + Math.cos(ang) * r0, by + Math.sin(ang) * r0).lineTo(bx + Math.cos(ang) * r1, by + Math.sin(ang) * r1)
            .stroke({ width: 1.4 * Math.max(0.6, W) * px, color: this.core, alpha: landed * (1 - ph) });
        }
      } else {
        // Energy received: a shimmer round the one it empowers.
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.9 + i / 3) % 1;
          g.circle(bx, by, this.a.toR * (0.8 + 0.7 * ph)).stroke({ width: 1.2 * px, color: brighten(this.color, 0.4), alpha: 0.6 * landed * (1 - ph) });
        }
      }
    }
    return t < dur;
  }
  destroy(): void {
    this.g.destroy();
    this.hit.destroy();
    this.head.destroy();
    this.muzzle.destroy();
  }
}

// ---- cutter: the tractor beam focused to cut (2026-10-13) ----
// Mining, not fighting: a ship works an asteroid by focusing its tractor to a point on the rock's
// face. The point sweeps slowly to and fro across the face toward the ship, scoring a kerf that glows
// and cools behind it, and throws sparks off the surface. Hero energy given (the tractor's blue),
// brightened toward pale blue, never white. A station's mining beam (`mine`, below) is its big sibling.

export interface CutArgs {
  from: Anchor; to: Anchor; toR: number; durS: number; color?: number;
  /** Where on the face the sweep starts. */
  seed?: number;
}

/**
 * How far the cut sweeps across the face either side of the ship's bearing (radians), and how fast.
 * Narrowed from 0.55 (22 A10): the ship holds still while it works, and the cut stays on the face it faces.
 */
const CUT_SWEEP = 0.35;
const CUT_RATE = 1.4;
/** How long the kerf glows behind the cut point (s), in steps. */
const KERF_S = 0.5;
const KERF_STEPS = 10;

const hash01 = (i: number, salt: number) => (((i * 2654435761) ^ (salt * 40503)) >>> 0) % 1000 / 1000;

class Cutter implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly hot: Sprite;
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private readonly color: number;
  private readonly phase: number;
  private t = 0;
  private dim = 1;
  constructor(layer: Container, private readonly a: CutArgs, private readonly px: number) {
    this.from = resolve(a.from);
    this.to = resolve(a.to);
    this.color = a.color ?? TRACTOR;
    this.phase = ((a.seed ?? 0) % 997) / 997 * Math.PI * 2;
    this.g.blendMode = 'add';
    this.hot = glow(coreOf(this.color));
    layer.addChild(this.g, this.hot);
  }
  duck(k: number): void {
    this.dim = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const dur = Math.max(this.a.durS, 0.7);
    const env = smooth(0, 0.25, t) * (1 - smooth(dur - 0.35, dur, t));
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const px = this.px;
    // The cut point: on the face toward the ship, sweeping to and fro across it.
    const bearing = Math.atan2(ay - by, ax - bx);
    const angAt = (u: number) => bearing + CUT_SWEEP * Math.sin(u * CUT_RATE + this.phase);
    const rr = this.a.toR * 0.8;
    const pointAt = (u: number): [number, number] => {
      const a = angAt(u);
      return [bx + Math.cos(a) * rr, by + Math.sin(a) * rr];
    };
    const [cx, cy] = pointAt(t);
    const g = this.g.clear();
    g.alpha = this.dim;
    const flicker = 0.85 + 0.15 * Math.sin(t * 41) * Math.sin(t * 11);
    // The beam: narrow and focused, a glow, a body and a pale core, straight to the cut.
    for (const [width, color, alpha] of [[7, this.color, 0.16], [2.6, brighten(this.color, 0.35), 0.6], [1.1, coreOf(this.color), 0.9]] as const) {
      g.moveTo(ax, ay).lineTo(cx, cy).stroke({ width: Math.max(0.8, width) * px, color, alpha: alpha * env * flicker, cap: 'round' });
    }
    // The kerf: the line it has scored, glowing behind the cut point as it cools.
    let prev = pointAt(t);
    for (let i = 1; i <= KERF_STEPS; i++) {
      const u = t - (i / KERF_STEPS) * KERF_S;
      if (u < 0) break;
      const p = pointAt(u);
      const k = 1 - i / KERF_STEPS;
      g.moveTo(prev[0], prev[1]).lineTo(p[0], p[1]).stroke({ width: 1.5 * px, color: brighten(this.color, 0.6), alpha: 0.75 * k * env, cap: 'round' });
      prev = p;
    }
    // Sparks thrown off the surface where it cuts: outward, away from the rock, a little toward the ship.
    const out = angAt(t);
    for (let i = 0; i < 7; i++) {
      const ph = (t * 2.4 + hash01(i, 1)) % 1;
      const dir = out + (hash01(i, 2) - 0.5) * 1.9;
      const r0 = (2 + 14 * ph) * px;
      const r1 = r0 + (2.5 + 2 * hash01(i, 3)) * px;
      g.moveTo(cx + Math.cos(dir) * r0, cy + Math.sin(dir) * r0).lineTo(cx + Math.cos(dir) * r1, cy + Math.sin(dir) * r1)
        .stroke({ width: 1.1 * px, color: i % 3 ? coreOf(this.color) : brighten(this.color, 0.5), alpha: env * (1 - ph) });
    }
    // The hot spot where the beam meets the rock.
    this.hot.position.set(cx, cy);
    this.hot.width = this.hot.height = (9 + 3 * Math.sin(t * 29)) * px;
    this.hot.alpha = env * flicker * this.dim;
    return t < dur;
  }
  destroy(): void {
    this.g.destroy();
    this.hot.destroy();
  }
}

// ---- mine: a station's mining beam (2026-10-13) ----
// The finishing blow of mining, with the phaser's weight (a merge's payoff, a beamed landing): a heavy
// beam in full hero blue reaches out of a muzzle flare, pulsing as it holds, and bites into the rock's
// face where a molten bloom throws sparks and debris. What makes it mining, not fire: a tractor sheath
// in the given blue wraps the asteroid the whole time, the cut point sweeps across its face scoring a
// kerf, and chunks of ore ride the sheath home to the station. It lets go the phaser's way.

export interface MineArgs {
  from: Anchor; to: Anchor; toR: number; durS: number; seed?: number; veil?: BeamVeil;
  /** The beam's weight against a station's (27 E3: a captain's progress beam, 0.5). */
  scale?: number;
}

/** The head's reach and the tail's release (s), the phaser's. */
const MINE_REACH = 0.22;
const MINE_RELEASE = 0.35;

class MiningBeam implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly muzzle: Sprite;
  private readonly head: Sprite;
  private readonly bloom: Sprite;
  private readonly hot: Sprite;
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private readonly phase: number;
  private t = 0;
  private dim = 1;
  constructor(layer: Container, private readonly a: MineArgs, private readonly px: number) {
    this.from = resolve(a.from);
    this.to = resolve(a.to);
    this.phase = ((a.seed ?? 0) % 997) / 997 * Math.PI * 2;
    this.g.blendMode = 'add';
    this.muzzle = glow(brighten(HERO, 0.5));
    this.head = glow(HERO_CORE);
    this.bloom = glow(brighten(HERO, 0.35));
    this.hot = glow(HERO_CORE);
    layer.addChild(this.g, this.bloom, this.muzzle, this.head, this.hot);
  }
  duck(k: number): void {
    this.dim = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    const dur = Math.max(this.a.durS, MINE_REACH + MINE_RELEASE + 0.3);
    const px = this.px;
    const k = this.a.scale ?? 1;
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const R = Math.max(this.a.toR, 10 * px);
    // The cut point sweeps the face toward the station.
    const bearing = Math.atan2(ay - by, ax - bx);
    const angAt = (u: number) => bearing + CUT_SWEEP * 0.8 * Math.sin(u * CUT_RATE + this.phase);
    const pointAt = (u: number): [number, number] => {
      const a = angAt(u);
      return [bx + Math.cos(a) * R * 0.75, by + Math.sin(a) * R * 0.75];
    };
    const [cx, cy] = pointAt(t);
    const [dx, dy] = [cx - ax, cy - ay];
    const reach = smooth(0, MINE_REACH, t);
    const tail = smooth(dur - MINE_RELEASE, dur, t);
    const on = reach > tail;
    const live = reach * (1 - tail);
    const landed = smooth(MINE_REACH * 0.8, MINE_REACH * 1.5, t) * (1 - tail);
    const [sx, sy] = [ax + dx * tail, ay + dy * tail];
    const [ex, ey] = [ax + dx * reach, ay + dy * reach];
    const flicker = 0.85 + 0.15 * Math.sin(t * 47) * Math.sin(t * 13);
    const g = this.g.clear();
    g.alpha = this.dim;
    // The tractor sheath: a soft cone from the emitter that wraps the whole rock.
    const cone = (k: number, side: number, widen: number): [number, number] => {
      const w = (6 * px + (R * 1.2 - 6 * px) * k) * widen;
      const [qx, qy] = [ax + (bx - ax) * k, ay + (by - ay) * k];
      const bl = Math.hypot(bx - ax, by - ay) || 1;
      return [qx - ((by - ay) / bl) * w * side, qy + ((bx - ax) / bl) * w * side];
    };
    for (const [widen, alpha] of [[1.2, 0.07], [0.75, 0.09]] as const) {
      g.poly([...cone(0, -1, widen), ...cone(1, -1, widen), ...cone(1, 1, widen), ...cone(0, 1, widen)]).fill({ color: TRACTOR, alpha: alpha * live });
    }
    g.circle(bx, by, R * 1.15).stroke({ width: 3 * px, color: brighten(TRACTOR, 0.3), alpha: 0.3 * live });
    if (on) {
      // The beam: the phaser's four layers in full hero blue, pulsing as it holds.
      const w = 1.1 * (1 + 0.22 * Math.sin(t * 19));
      for (const [width, color, alpha] of [[16, HERO, 0.17], [8, HERO, 0.5], [3.6, brighten(HERO, 0.45), 0.85], [1.6, HERO_CORE, 0.95]] as const) {
        strokeVeiled(g, [sx, sy], [ex, ey], this.a.veil, { width: Math.max(0.8, width * w * k) * px, color, alpha: alpha * flicker, cap: 'round' });
      }
    }
    // The kerf: the scored line glowing behind the cut point as it cools.
    let prev = pointAt(t);
    for (let i = 1; i <= KERF_STEPS; i++) {
      const u = t - (i / KERF_STEPS) * KERF_S * 1.6;
      if (u < 0) break;
      const p = pointAt(u);
      g.moveTo(prev[0], prev[1]).lineTo(p[0], p[1]).stroke({ width: 3 * px, color: brighten(HERO, 0.6), alpha: 0.85 * (1 - i / KERF_STEPS) * landed, cap: 'round' });
      prev = p;
    }
    if (landed > 0.02) {
      const out = angAt(t);
      // Sparks: a fierce spray off the face.
      for (let i = 0; i < 14; i++) {
        const ph = (t * 2.8 + hash01(i, 4)) % 1;
        const dir = out + (hash01(i, 5) - 0.5) * 2.2;
        const r0 = (4 + 34 * ph) * px * k;
        const r1 = r0 + (4 + 4 * hash01(i, 6)) * px * k;
        g.moveTo(cx + Math.cos(dir) * r0, cy + Math.sin(dir) * r0).lineTo(cx + Math.cos(dir) * r1, cy + Math.sin(dir) * r1)
          .stroke({ width: 1.6 * px, color: i % 3 ? HERO_CORE : brighten(HERO, 0.5), alpha: landed * (1 - ph) });
      }
      // Debris: rock flecks tumbling off the cut, slower and darker.
      for (let i = 0; i < 6; i++) {
        const ph = (t * 1.1 + hash01(i, 7)) % 1;
        const dir = out + (hash01(i, 8) - 0.5) * 1.6;
        const d = (6 + 30 * ph) * px;
        g.circle(cx + Math.cos(dir) * d, cy + Math.sin(dir) * d, (1.4 + 1.4 * hash01(i, 9)) * px).fill({ color: 0x8f97a6, alpha: 0.8 * landed * (1 - ph) });
      }
      // Ore riding the sheath home to the station.
      for (let i = 0; i < 5; i++) {
        const k = 1 - ((t * 0.5 + i / 5) % 1);
        const [mx, my] = cone(k, Math.sin(i * 2.3) * 0.5, 0.7);
        const a = Math.sin(Math.PI * k) * landed;
        g.rect(mx - 1.8 * px, my - 1.4 * px, 3.6 * px, 2.8 * px).fill({ color: 0xb9c3d4, alpha: 0.85 * a }).stroke({ width: 0.8 * px, color: brighten(TRACTOR, 0.5), alpha: 0.7 * a });
      }
    }
    // The muzzle flare, the head while it reaches, the molten bloom where it bites.
    this.muzzle.visible = on;
    this.muzzle.position.set(sx, sy);
    this.muzzle.width = this.muzzle.height = 26 * px * k * (0.85 + 0.15 * flicker) * (1 - 0.4 * smooth(MINE_REACH, MINE_REACH * 4, t));
    this.muzzle.alpha = (1 - tail) * this.dim;
    this.head.visible = reach < 1;
    this.head.position.set(ex, ey);
    this.head.width = this.head.height = 18 * px * k;
    this.bloom.position.set(bx, by);
    this.bloom.width = this.bloom.height = Math.max(R * 2.6, 34 * px) * k * (1 + 0.15 * Math.sin(t * 17));
    this.bloom.alpha = 0.8 * landed * flicker * this.dim;
    this.hot.position.set(cx, cy);
    this.hot.width = this.hot.height = (16 + 5 * Math.sin(t * 29)) * px * k;
    this.hot.alpha = landed * flicker * this.dim;
    return t < dur;
  }
  destroy(): void {
    this.g.destroy();
    this.muzzle.destroy();
    this.head.destroy();
    this.bloom.destroy();
    this.hot.destroy();
  }
}

// ---- Idle work: a faint beam that breathes, a short volley (2026-10-12) ----

export interface IdleArgs { from: Anchor; to: Anchor; toR: number; durS: number; color: number; n?: number }

/** A captain at rest working the piece beside it: a thin, faint beam that swells in and fades out. */
class IdleBeam implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly from: () => [number, number];
  private readonly to: () => [number, number];
  private t = 0;
  constructor(layer: Container, private readonly a: IdleArgs, private readonly px: number) {
    this.from = resolve(a.from);
    this.to = resolve(a.to);
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = clamp01(this.t / this.a.durS);
    const env = Math.sin(Math.PI * u) ** 2;
    const [ax, ay] = this.from();
    const [bx, by] = this.to();
    const px = this.px;
    this.g.clear()
      .moveTo(ax, ay).lineTo(bx, by).stroke({ width: 5 * px, color: this.a.color, alpha: 0.08 * env, cap: 'round' })
      .moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1.2 * px, color: brighten(this.a.color, 0.4), alpha: 0.32 * env, cap: 'round' })
      .circle(bx, by, Math.max(this.a.toR * 0.5, 5 * px)).fill({ color: this.a.color, alpha: 0.07 * env });
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
  }
}

// ---- Stardust (22 C3, M-22) ----

/** A swirl of glittering stardust round a piece (`at`, radius `r`) over `durS`: the turn's cover. */
export interface StardustArgs { at: Anchor; r: number; color?: number; durS?: number }
/** How many motes a swirl has. */
const MOTES = 26;

/**
 * Stardust: motes of gold and white swirling in round a piece and bursting out again, with a soft
 * glow at its height, so the piece's swap to its done form happens behind it (22 C3: "glittery
 * stardust for an asteroid"). Each mote's path is fixed by its index: deterministic, no randomness.
 */
class Stardust implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly glow: Sprite;
  private t = 0;
  private dim = 1;
  private readonly dur: number;
  constructor(layer: Container, private readonly a: StardustArgs, private readonly px: number) {
    this.dur = a.durS ?? 0.9;
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.tint = a.color ?? 0xffd27a;
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.g.blendMode = 'add';
    layer.addChild(this.glow, this.g);
  }
  duck(k: number): void {
    this.dim = k;
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const at = typeof this.a.at === 'function' ? this.a.at() : this.a.at;
    if (!at) return u < 1;
    const [x, y] = at;
    const r = this.a.r;
    // In, then out: tightest (and brightest) at a third of the way, where the swap happens.
    const pull = u < 0.35 ? 1 - u / 0.35 : (u - 0.35) / 0.65;
    const env = Math.min(1, u / 0.12) * (1 - Math.max(0, (u - 0.7) / 0.3)) * this.dim;
    this.glow.position.set(x, y);
    this.glow.width = this.glow.height = r * (2.2 + 0.8 * (1 - pull));
    this.glow.alpha = 0.55 * env * (1 - 0.6 * pull);
    this.g.clear();
    const gold = this.a.color ?? 0xffd27a;
    for (let i = 0; i < MOTES; i++) {
      const phase = (i / MOTES) * Math.PI * 2;
      const lane = 0.75 + 0.5 * ((i * 7) % MOTES) / MOTES; // each mote its own ring
      const ang = phase + u * Math.PI * (2.2 + (i % 3) * 0.4) * (i % 2 ? 1 : -1);
      const d = r * (0.55 + lane * (0.6 + 1.1 * pull));
      const mx = x + Math.cos(ang) * d;
      const my = y + Math.sin(ang) * d * 0.8;
      const twinkle = 0.55 + 0.45 * Math.sin(this.t * 22 + i * 1.7);
      const size = (1.2 + (i % 4) * 0.45) * this.px;
      this.g.circle(mx, my, size * 2.2).fill({ color: gold, alpha: 0.18 * env * twinkle });
      this.g.circle(mx, my, size).fill({ color: i % 3 === 0 ? 0xffffff : brighten(gold, 0.3), alpha: 0.9 * env * twinkle });
    }
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
    this.glow.destroy();
  }
}

// ---- The defs ----

export const commands: CommandDef[] = [
  {
    // A guest is part of the moment's cast (continuity): never cut; under reduced motion, it isn't drawn.
    name: 'guest', tier: 'essential', weight: 1.5, value: 15, cuttable: false, clock: 'travel', reduced: 'skip',
    make: (host: FxHost, a: GuestArgs): Fx => new GuestShip(host.layer(), a, host.px()),
  } satisfies CommandDef<GuestArgs>,
  {
    name: 'charge', tier: 'narrative', weight: 0.5, value: 5, cuttable: false, clock: 'accent', reduced: 'ring',
    make: (host: FxHost, a: ChargeArgs): Fx => new Charge(host.layer(), a, host.px()),
  } satisfies CommandDef<ChargeArgs>,
  {
    name: 'phaser', tier: 'narrative', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'ring',
    make: (host: FxHost, a: FireArgs): Fx => new Beam(host.layer(), a, 'phaser', a.color ?? HERO, host.px()),
  } satisfies CommandDef<FireArgs>,
  {
    // Like the tractor it focuses: never cut (continuity), and under reduced motion not drawn.
    name: 'cutter', tier: 'narrative', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: CutArgs): Fx => new Cutter(host.layer(), a, host.px()),
  } satisfies CommandDef<CutArgs>,
  {
    // The phaser's sibling: a station's sustained finishing beam, never cut; a ring under reduced motion.
    name: 'mine', tier: 'narrative', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'ring',
    make: (host: FxHost, a: MineArgs): Fx => new MiningBeam(host.layer(), a, host.px()),
  } satisfies CommandDef<MineArgs>,
  {
    name: 'idleBeam', tier: 'ornament', weight: 0.25, value: 0.5, cuttable: true, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: IdleArgs): Fx => new IdleBeam(host.layer(), a, host.px()),
  } satisfies CommandDef<IdleArgs>,
  {
    // A captain's phaser, an enemy's return fire, a station's covering fire: many per beat, so cuttable.
    name: 'bolt', tier: 'narrative', weight: 0.25, value: 1.5, cuttable: true, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: FireArgs): Fx => new Beam(host.layer(), a, 'bolt', a.color ?? HERO, host.px()),
  } satisfies CommandDef<FireArgs>,
  {
    // The turn's cover (22 C3): part of the close, so essential (no load gate may bare the swap it hides); a ring under reduced motion.
    name: 'stardust', tier: 'essential', weight: 0.5, value: 5, cuttable: false, clock: 'accent', reduced: 'ring',
    make: (host: FxHost, a: StardustArgs): Fx => new Stardust(host.layer(), a, host.px()),
  } satisfies CommandDef<StardustArgs>,
  {
    name: 'energy', tier: 'narrative', weight: 0.5, value: 5, cuttable: false, clock: 'accent', reduced: 'ring',
    make: (host: FxHost, a: FireArgs): Fx => new Beam(host.layer(), a, 'energy', a.color ?? HERO_SOFT, host.px()),
  } satisfies CommandDef<FireArgs>,
] as CommandDef[];

const call = <A>(name: string) => (args: A, delayMs = 0) => ({ cmd: name, args, delayMs });

/** Typed builders for the theme's commands. */
export const themeCmd = {
  guest: call<GuestArgs>('guest'),
  charge: call<ChargeArgs>('charge'),
  phaser: call<FireArgs>('phaser'),
  cutter: call<CutArgs>('cutter'),
  mine: call<MineArgs>('mine'),
  idleBeam: call<IdleArgs>('idleBeam'),
  bolt: call<FireArgs>('bolt'),
  energy: call<FireArgs>('energy'),
  stardust: call<StardustArgs>('stardust'),
};

/**
 * A captain's burst (2026-10-13): `n` quick phaser bolts from `from` at `to`, `gapMs` apart, starting
 * at `delayMs`. In place of v0's dots of fire.
 */
export function burst(a: Omit<FireArgs, 'durS'> & { n: number; gapMs: number; durS?: number }, delayMs = 0): CommandCall[] {
  const { n, gapMs, durS = 0.3, ...rest } = a;
  return Array.from({ length: n }, (_, i) => themeCmd.bolt({ ...rest, durS }, delayMs + i * gapMs));
}
