// The Star Chart's finales (2026-10-13): the moments a round builds to, beyond a single close.
//   glint     a four-point sparkle: a finished platform catching the light, a city's lights
//   allClear  a region's last threat has fallen: a calm all-clear in hero blue sweeps out from the
//             star, each planet catching it in turn, and the star breathes
//   sweep     a sector sweep (27 E7): a calm Nav cyan ring out from the star, passing each new piece as it enters
//   finale    the round's end (the theme's Finale): the star flares, each finished platform glints in
//             the order it finished, and the ships form up once over the star before going home
// A celebration of the round's work, never a scoreboard: no counts, no ranking (INV-19). Kept apart
// from ./commands (the beams) and ./entrance so each can change on its own.
import { GEOMETRY } from '@shared/engine/solar/version';
import { Container, Graphics, Sprite } from 'pixi.js';
import { brighten, HERO, HERO_GLOW } from '../../chart/art/energy';
import { lighten } from '../../chart/art/lit';
import { SUCCESS } from '../../chart/art/progress';
import { cmd, drawnR, pointOf } from '../../chart/fx/commands';
import { CYAN } from '../../chart/fx/timing';
import { glowTexture, type Anchor, type Fx } from '../../chart/fx/effects';
import type { CastView, CommandCall, CommandDef, Finale, FxHost } from '../../chart/fx/types';

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

/** The star's own light, warm and unladdered (the opening's breath is the same). */
const STAR_LIGHT = 0xfff1d6;

// ---- glint: a four-point sparkle ----

export interface GlintArgs { at: Anchor; r: number; color?: number; durS?: number }

class Glint implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly core = new Sprite(glowTexture());
  private readonly at: () => [number, number];
  private t = 0;
  constructor(layer: Container, private readonly a: GlintArgs, private readonly px: number) {
    this.at = resolve(a.at);
    this.g.blendMode = 'add';
    this.core.anchor.set(0.5);
    this.core.blendMode = 'add';
    this.core.tint = lighten(a.color ?? SUCCESS, 0.35);
    layer.addChild(this.core, this.g);
  }
  update(dt: number): boolean {
    this.t += dt;
    const dur = this.a.durS ?? 0.9;
    const u = clamp01(this.t / dur);
    const k = Math.sin(Math.PI * u) ** 1.5;
    const [x, y] = this.at();
    const color = this.a.color ?? SUCCESS;
    const L = Math.max(this.a.r * 1.1, 10 * this.px) * (0.55 + 0.6 * u);
    const g = this.g.clear();
    // Four long rays and four short ones, tapering to points, turning a little as it shines.
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + u * 0.35;
      const len = i % 2 ? L * 0.42 : L;
      const w = (i % 2 ? 0.9 : 1.6) * this.px;
      const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
      g.poly([x + -uy * w, y + ux * w, x + ux * len, y + uy * len, x + uy * w, y + -ux * w]).fill({ color: lighten(color, 0.5), alpha: 0.9 * k });
    }
    this.core.position.set(x, y);
    this.core.width = this.core.height = L * 0.9;
    this.core.alpha = 0.8 * k;
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
    this.core.destroy();
  }
}

// ---- allClear: the all-clear sweeps out ----

export interface AllClearArgs { durS: number }

class AllClear implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private readonly bloom = new Sprite(glowTexture());
  private t = 0;
  constructor(layer: Container, private readonly host: FxHost, private readonly a: AllClearArgs) {
    this.g.blendMode = 'add';
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = 'add';
    this.bloom.tint = STAR_LIGHT;
    layer.addChild(this.bloom, this.g);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = clamp01(this.t / this.a.durS);
    const solar = this.host.stage().currentGraph()?.solar;
    const g = this.g.clear();
    if (!solar) return u < 1;
    const px = this.host.px();
    const { star, frontier: f } = solar;
    // The all-clear: a calm ring of hero energy sweeping from the star out past the belt (no red to
    // lift first since 19 S2: the belt is never red), after a breath for the tell's ring to settle.
    const s = smooth(0.12, 0.72, u);
    const reach = 0.06 + 1.04 * s;
    const ratio = f.ry1 / (f.rx1 || 1);
    const fade = Math.sin(Math.PI * clamp01((u - 0.12) / 0.62));
    if (fade > 0.01) {
      const rx = f.rx1 * reach;
      g.ellipse(star.x, star.y, rx, rx * ratio).stroke({ width: 16 * px, color: HERO_GLOW, alpha: 0.1 * fade });
      g.ellipse(star.x, star.y, rx, rx * ratio).stroke({ width: 2.5 * px, color: brighten(HERO, 0.45), alpha: 0.6 * fade });
    }
    // Each planet catches it as it passes: a soft ring of the same light.
    for (const seat of solar.seats) {
      const d = Math.hypot((seat.x - star.x) / (f.rx1 || 1), (seat.y - star.y) / (f.ry1 || 1));
      const passed = (reach - d) / 0.25;
      if (passed <= 0 || passed >= 1) continue;
      const r = GEOMETRY.planetR * (1.04 + 0.3 * passed);
      g.circle(seat.x, seat.y, r).stroke({ width: 2 * px, color: HERO_GLOW, alpha: 0.55 * (1 - passed) });
    }
    // Then the star breathes, warm and slow.
    const breath = smooth(0.55, 0.8, u) * (1 - smooth(0.8, 1, u));
    this.bloom.position.set(star.x, star.y);
    this.bloom.width = this.bloom.height = Math.max(GEOMETRY.planetR * 2.2, 60 * px) * (1 + 0.4 * breath);
    this.bloom.alpha = 0.55 * breath;
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
    this.bloom.destroy();
  }
}

// ---- sweep: a sector sweep's ring (27 E7) ----

/**
 * `stops`: each piece's distance from the star in frontier radii, nearest first; piece i enters at
 * `(i + 1) × stepMs`. `durS`: the act.
 */
export interface SweepArgs { stops: readonly number[]; stepMs: number; durS: number }

/** Where the ring has reached at `ms`, in frontier radii: piecewise-linear through each stop as its piece enters. */
export function sweepReach(a: SweepArgs, ms: number): number {
  const last = a.stops.at(-1) ?? 0;
  const pts: [number, number][] = [[0, 0.05], ...a.stops.map((d, i): [number, number] => [(i + 1) * a.stepMs, d]), [a.durS * 1000, Math.max(1.1, last + 0.05)]];
  if (ms <= 0) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (ms <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (ms - x0)) / (x1 - x0) : y1;
  }
  return pts.at(-1)![1];
}

/** A calm Nav cyan ring sweeping out from the star in the frontier's proportions, passing each new piece as it enters. */
class Sweep implements Fx {
  readonly kind = 'accent';
  private readonly g = new Graphics();
  private t = 0;
  constructor(layer: Container, private readonly host: FxHost, private readonly a: SweepArgs) {
    this.g.blendMode = 'add';
    layer.addChild(this.g);
  }
  update(dt: number): boolean {
    this.t += dt;
    const u = this.a.durS > 0 ? clamp01(this.t / this.a.durS) : 1;
    const solar = this.host.stage().currentGraph()?.solar;
    const g = this.g.clear();
    if (!solar) return u < 1;
    const px = this.host.px();
    const { star, frontier: f } = solar;
    const reach = sweepReach(this.a, this.t * 1000);
    const ratio = f.ry1 / (f.rx1 || 1);
    // It fades in as it leaves the star and out as it passes the belt.
    const fade = smooth(0, 0.08, u) * (1 - smooth(0.85, 1, u));
    if (fade > 0.01) {
      const rx = f.rx1 * reach;
      g.ellipse(star.x, star.y, rx, rx * ratio).stroke({ width: 16 * px, color: CYAN, alpha: 0.1 * fade });
      g.ellipse(star.x, star.y, rx, rx * ratio).stroke({ width: 2.5 * px, color: CYAN, alpha: 0.6 * fade });
    }
    return u < 1;
  }
  destroy(): void {
    this.g.destroy();
  }
}

export const finaleCommands: CommandDef[] = [
  {
    name: 'glint', tier: 'ornament', weight: 0.25, value: 0.5, cuttable: true, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: GlintArgs): Fx => new Glint(host.layer(), a, host.px()),
  } satisfies CommandDef<GlintArgs>,
  {
    // The milestone's whole act: never cut, or All clear would play as nothing.
    name: 'allClear', tier: 'essential', weight: 1, value: 10, cuttable: false, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: AllClearArgs): Fx => new AllClear(host.layer(), host, a),
  } satisfies CommandDef<AllClearArgs>,
  {
    // A sector sweep's ring (27 E7): the pieces' own entrances carry the arrivals, so it may be cut.
    name: 'sweep', tier: 'narrative', weight: 0.5, value: 3, cuttable: true, clock: 'accent', reduced: 'skip',
    make: (host: FxHost, a: SweepArgs): Fx => new Sweep(host.layer(), host, a),
  } satisfies CommandDef<SweepArgs>,
] as CommandDef[];

const call = <A>(name: string) => (args: A, delayMs = 0): CommandCall => ({ cmd: name, args, delayMs });

/** Typed builders for the finale commands. */
export const finaleCmd = {
  glint: call<GlintArgs>('glint'),
  allClear: call<AllClearArgs>('allClear'),
  sweep: call<SweepArgs>('sweep'),
};

// ---- The round's end ----

/** When the platforms start to glint, how far apart, and how many at most (the rest stay lit). */
const GLINT_AT_MS = 700;
const GLINT_STEP_MS = 240;
const GLINT_MAX = 14;
/** The formation: when it gathers, how long it flies in, holds, and flies home. */
const FORM_AT_MS = 900;
const FORM_IN_MS = 1500;
const FORM_HOLD_MS = 2600;
const FORM_BACK_MS = 1400;

/**
 * The ships' spots: a tight chevron pointing east, its leader just above the star, the wings trailing
 * back either side, close enough to read as one formation (a drawn radius is a ship's half-length, so
 * the wings sit a little under a length apart). Leader first, by key, so it's the same every time.
 */
function chevron(ships: CastView[], at: [number, number], starR: number): [number, number][] {
  const r = Math.max(...ships.map(drawnR), 1);
  const gap = r * 1.5;
  const lead: [number, number] = [at[0] + gap, at[1] - starR * 1.4];
  return ships.map((_, i) => {
    if (i === 0) return lead;
    const k = Math.ceil(i / 2);
    const side = i % 2 ? -1 : 1;
    return [lead[0] - k * gap * 0.95, lead[1] + side * k * gap * 0.55];
  });
}

export const finale: Finale = (c) => {
  const calls: CommandCall[] = [];
  const starAt = c.star ? pointOf(c.star.at) : null;
  const starR = c.star ? drawnR(c.star) : GEOMETRY.planetR;
  // The star flares, warm and slow: the round's last light.
  if (c.star) {
    calls.push(cmd.flare({ at: c.star.at, r: starR, color: STAR_LIGHT, scale: 2.2, linger: 3.2 }));
    calls.push(cmd.ring({ at: c.star.at, r: starR * 1.1, r1: starR * 3.4, color: lighten(SUCCESS, 0.3), durS: 1.8, alpha: 0.55 }, 200));
  }
  // Each finished platform glints in turn, in the order it finished.
  const shown = c.finished.slice(0, GLINT_MAX);
  shown.forEach((v, i) => calls.push(finaleCmd.glint({ at: v.at, r: drawnR(v), color: SUCCESS, durS: 1 }, GLINT_AT_MS + i * GLINT_STEP_MS)));
  const glintsEnd = GLINT_AT_MS + shown.length * GLINT_STEP_MS + 1000;
  // The ships form up once over the star, all nosed the same way, then fly home.
  const ships = [...c.ships].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let formed = 0;
  if (starAt && ships.length) {
    const spots = chevron(ships, starAt, starR);
    const east: [number, number] = [starAt[0] + 1e6, starAt[1]];
    ships.forEach((v, i) => {
      const delay = FORM_AT_MS + i * 90;
      calls.push(cmd.pursue({ pk: v.node.projectionKey, durS: FORM_IN_MS / 1000, holdS: (FORM_HOLD_MS - i * 90) / 1000, backS: FORM_BACK_MS / 1000, to: spots[i]!, look: east, wake: 4 }, delay));
    });
    // Formed: one salute of hero energy from the leader.
    const lead = spots[0]!;
    calls.push(cmd.ring({ at: lead, r: drawnR(ships[0]!) * 0.8, r1: drawnR(ships[0]!) * 6, color: HERO_GLOW, durS: 1.1, alpha: 0.6 }, FORM_AT_MS + FORM_IN_MS + 150));
    formed = FORM_AT_MS + FORM_IN_MS + 300;
  }
  // The viewer's awards light on their ship once the ships have formed (or after the glints, with none).
  // The roll call (22 C6, M-29): every ship in the chevron named once it has formed, until it turns for home.
  return { calls, awardsAtMs: formed || glintsEnd, ...(formed ? { rollCall: { fromMs: FORM_AT_MS + FORM_IN_MS, toMs: FORM_AT_MS + FORM_IN_MS + FORM_HOLD_MS - 600 } } : {}) };
};
