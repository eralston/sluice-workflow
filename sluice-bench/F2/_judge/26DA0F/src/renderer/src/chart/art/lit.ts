// Lighting kit for mechanical art (06 §7): light always arrives from above, because the parent
// (star, planet) is always on top of every scene (06 §3 grammar). Gradients are shared and cached by
// color, so the number of gradient textures is bounded by the palette, not by the object count.
import { FillGradient, Graphics } from 'pixi.js';

const INK = 0x081629;
const IVORY = 0xf4f0de;
const VIOLET = 0x79568f;
/** Gouache lighting (09 §7): warm key from above, cool fill in the shadows, a few hard tone steps. */
const WARM = 0xfff1d6;
const COOL_SHADOW = 0x1b2147; // ink pushed toward violet: shadows read as cool, not black

/** Mix two colors; t = 0 → a, t = 1 → b. */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}
export const lighten = (c: number, t: number) => mix(c, IVORY, t);
export const darken = (c: number, t: number) => mix(c, INK, t);
/** Key-lit: lightened toward a warm white. Fill-shaded: darkened toward a cool violet ink. */
export const keyLit = (c: number, t: number) => mix(c, WARM, t);
export const coolShade = (c: number, t: number) => mix(c, mix(COOL_SHADOW, VIOLET, 0.15), t);

const cache = new Map<string, FillGradient>();
function cached(key: string, make: () => FillGradient): FillGradient {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/**
 * Top-lit surface, painted in gouache bands rather than an airbrushed ramp: a warm highlight band,
 * the local color, then a cool shadow, with short soft transitions between them.
 */
export function topLit(color: number): FillGradient {
  return cached(`top:${color}`, () => new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
    // McCall-style value structure: a hot rim at the lit edge, a warm highlight band, the local
    // color, then a deep cool shadow (the hull never reads as white on white).
    colorStops: [
      { offset: 0, color: keyLit(color, 0.85) },
      { offset: 0.05, color: keyLit(color, 0.5) },
      { offset: 0.16, color: keyLit(color, 0.3) },
      { offset: 0.22, color },
      { offset: 0.5, color },
      { offset: 0.58, color: coolShade(color, 0.62) },
      { offset: 1, color: coolShade(color, 0.88) },
    ],
  }));
}

/** Cylinder lit from the upper left: bright left third, shadowed right edge. */
export function cylinder(color: number): FillGradient {
  return cached(`cyl:${color}`, () => new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: 'local',
    colorStops: [
      { offset: 0, color: coolShade(color, 0.45) },
      { offset: 0.06, color: keyLit(color, 0.8) },
      { offset: 0.12, color: keyLit(color, 0.45) },
      { offset: 0.26, color: keyLit(color, 0.3) },
      { offset: 0.32, color },
      { offset: 0.58, color },
      { offset: 0.66, color: coolShade(color, 0.65) },
      { offset: 1, color: coolShade(color, 0.88) },
    ],
  }));
}

/** Sphere lit from the upper left. */
export function sphere(color: number): FillGradient {
  return cached(`sph:${color}`, () => new FillGradient({
    type: 'radial', center: { x: 0.36, y: 0.3 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: keyLit(color, 0.85) },
      { offset: 0.18, color: keyLit(color, 0.55) },
      { offset: 0.25, color },
      { offset: 0.56, color },
      { offset: 0.64, color: coolShade(color, 0.62) },
      { offset: 1, color: coolShade(color, 0.88) },
    ],
  }));
}

/** Points along an ellipse arc (t in radians, 0 = +x, π/2 = front/bottom). */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, t0: number, t1: number, n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / Math.max(1, n - 1);
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
  });
}

export function polyline(g: Graphics, pts: [number, number][]): Graphics {
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  return g;
}

/**
 * Lit windows split into three groups that shimmer out of phase: a sense of life aboard, kept
 * subtle so it reads as ambience, never as an event (05 §5).
 */
/**
 * How windows move: `shimmer` (stations: groups out of phase), `breathe` (captain ships: one slow,
 * deep pulse, a hero breathing), or `steady` (cargo vessels, whose life is their strobes).
 */
export type WindowMotion = 'shimmer' | 'breathe' | 'steady';

/** The captain ships' breath, in seconds: shared by their windows and engines. */
export const BREATH_PERIOD = 6;

export class WindowLights {
  readonly groups = [new Graphics(), new Graphics(), new Graphics()];
  private readonly phase: number;

  constructor(points: [number, number][], size: number, seed: number, colors: number[] = [IVORY, 0xf1b75b, 0xffe6b0], private readonly motion: WindowMotion = 'shimmer') {
    this.phase = (seed % 997) / 97;
    points.forEach(([x, y], i) => {
      const g = this.groups[(i * 7 + seed) % 3]!;
      const c = colors[(i + seed) % colors.length]!;
      // A soft dab of light around each window, like a touch of paint that blooms: the lights read
      // as painted glow, and they breathe with the shimmer below.
      g.circle(x, y, size * 1.35).fill({ color: c, alpha: 0.12 }); // small and faint: closely spaced rows mustn't merge into a wash
      g.rect(x - size / 2, y - size / 2, size, size).fill({ color: c });
    });
    // A soft bloom under the brightest group makes the windows read as light, not paint.
    for (const g of this.groups) g.blendMode = 'add';
  }

  tick(seconds: number): void {
    if (this.motion === 'steady') return;
    this.groups.forEach((g, i) => {
      g.alpha = this.motion === 'breathe'
        ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / BREATH_PERIOD + this.phase + i * 0.35))
        : 0.72 + 0.28 * Math.sin(seconds * (0.6 + i * 0.37) + this.phase + i * 2.1);
    });
  }
}
