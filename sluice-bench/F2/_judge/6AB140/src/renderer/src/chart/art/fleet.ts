// v1 hero captain ships, "the fleet" (13-game-design.md §4.5): three factions × three hulls, nine in
// all, each painted in any of the colourways, so 9 × 8 = 72 distinct ships. A person's faction, hull
// and colourway come from their stable seed (fleetDesign); the viewer may pick their own faction.
//
// Factions are inspired by their genres and copy nothing (10 D1). Each is told by silhouette first,
// so hue is never the only signal (INV-20):
//   Trek   smooth discs and cylinders; paired nacelles on swept pylons, with glowing coil strips.
//   Wars   flat, angular plates; bare engine cans and engine banks; split wings; asymmetry.
//   Mecha  jet-aircraft language: boxy intakes, swept wings and canted twin tails; armour blocks.
// The captain rule (06 §7): every hull has wings or nacelles, and its lights breathe on one slow,
// deep pulse. Size never varies by person (INV-19): every hull is fitted to the same footprint.
// Colourways avoid the hostile palette (reds through oranges and magentas, rust, black, charcoal:
// reserved for threats) and never lead with a signal-ladder hue (09 §1).
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { HERO_CORE, HERO_GLOW } from './energy';
import { HullModel, renderHull, S, type HullRender, type Mat, type Palette, type V3 } from './hull3d';
import { motion } from './motion';
import { lighten, mix, WindowLights } from './lit';

// ---- Factions, colourways, design decode ----

export type Faction = 'trek' | 'wars' | 'mecha';
export const FACTIONS: { key: Faction; title: string; genre: string }[] = [
  { key: 'trek', title: 'Trek', genre: 'space-opera explorers' },
  { key: 'wars', title: 'Wars', genre: 'planetary-romance starfighters' },
  { key: 'mecha', title: 'Mecha', genre: 'transforming space mecha' },
];

/** A colourway: the hull's body colour and its accent, both clear of hostile and ladder hues. */
export interface Colourway { name: string; hull: number; accent: number }

export const COLOURWAYS: Colourway[] = [
  { name: 'Forest & ivory', hull: 0x2e6443, accent: 0xebe3c8 },
  { name: 'Jade & navy', hull: 0x2a9c7c, accent: 0x262f52 },
  { name: 'Teal & ivory', hull: 0x1e7b87, accent: 0xeee6cf },
  { name: 'Navy & ivory', hull: 0x262f52, accent: 0xece4cc },
  { name: 'Olive & cream', hull: 0x6e7a34, accent: 0xe4dcc2 },
  { name: 'Chartreuse & pine', hull: 0xa2b63a, accent: 0x22473a },
  { name: 'Ivory & teal', hull: 0xe0d9c4, accent: 0x1f7f89 },
  { name: 'Seafoam & navy', hull: 0x7cc2ae, accent: 0x262f52 },
];

/**
 * Per-faction light: engine plumes, glowing coils, and window tints. Every reactor runs on the one
 * hero energy (art/energy.ts, 2026-10-13), so plumes and coils are hero blue in every faction; the
 * windows keep each faction's own warm or cool tint.
 */
const LIGHT: Record<Faction, { glow: number; ember: number; windows: number[] }> = {
  trek: { glow: HERO_GLOW, ember: HERO_CORE, windows: [0xf4f0de, 0xc8f7ee] },
  wars: { glow: HERO_GLOW, ember: HERO_CORE, windows: [0xf4f0de, 0xfff1d6] },
  mecha: { glow: HERO_GLOW, ember: HERO_CORE, windows: [0xf4f0de, 0xdcffc8] },
};

export interface FleetDesign { hull: number; colourway: number }

/** A 32-bit finalizer (murmur3 fmix), so neighbouring seeds land on unrelated designs. */
function fmix32(seed: number): number {
  let h = seed >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A person's ship from their stable seed: faction, then hull within it, then colourway. Pass a
 * faction to override it (the viewer's own pick, 13 §4.5); hull and colourway still come from the seed.
 */
export function fleetDesign(seed: number, faction?: Faction): FleetDesign {
  const s = fmix32(seed);
  const f = faction ? FACTIONS.findIndex((x) => x.key === faction) : s % 3;
  return { hull: f * 3 + (Math.floor(s / 3) % 3), colourway: Math.floor(s / 9) % COLOURWAYS.length };
}

export const factionOf = (d: FleetDesign): Faction => FLEET_HULLS[d.hull]!.faction;
export const captainColours = (d: FleetDesign): [number, number] => {
  const c = COLOURWAYS[d.colourway]!;
  return [c.hull, c.accent];
};

// ---- Local modelling helpers (plates in any plane, on top of hull3d's kit) ----

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const centroid = (pts: V3[]): V3 => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

interface Face { pts: V3[]; n: V3; mat: Mat }

function faceOf(pts: V3[], mat: Mat, ref: V3): Face | null {
  const raw = newell(pts);
  if (Math.hypot(raw[0], raw[1], raw[2]) < 1e-9) return null;
  let n = norm(raw);
  if (dot(n, sub(centroid(pts), ref)) < 0) n = mul(n, -1);
  return { pts, n, mat };
}

/** A flat plate in any plane: a planar polygon extruded by `thick` along its own normal. */
function slab(m: HullModel, poly: V3[], thick: number, mat: Mat, bias = 0): void {
  const h = mul(norm(newell(poly)), thick / 2);
  const a = poly.map((p) => add(p, h));
  const b = poly.map((p) => sub(p, h));
  const ref = centroid(poly);
  const faces = [faceOf(a, mat, ref), faceOf(b, mat, ref)];
  poly.forEach((_, i) => {
    const j = (i + 1) % poly.length;
    faces.push(faceOf([a[i]!, a[j]!, b[j]!, b[i]!], mat, ref));
  });
  m.parts.push({ faces: faces.filter((f): f is Face => f !== null), bias });
}

/**
 * A wing or fin from its four corners (root leading edge, root trailing edge, tip trailing edge, tip
 * leading edge), with stripes across it: [span from, span to, material], drawn just proud of it.
 */
function wing(m: HullModel, c: [V3, V3, V3, V3], thick: number, mat: Mat, stripes: [number, number, Mat][] = []): void {
  slab(m, c, thick, mat);
  const at = (u: number, v: number) => lerp3(lerp3(c[0], c[3], v), lerp3(c[1], c[2], v), u);
  for (const [v0, v1, sm] of stripes) slab(m, [at(0, v0), at(1, v0), at(1, v1), at(0, v1)], thick * 1.5, sm, 0.4);
}

/** A flat disc (a dish or a hatch) of radius r at c, facing n. */
function disc(m: HullModel, c: V3, n: V3, r: number, thick: number, mat: Mat, sides = 14, bias = 0): void {
  const nn = norm(n);
  const u = norm(cross(nn, Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const w = cross(nn, u);
  slab(m, Array.from({ length: sides }, (_, k) => {
    const t = (2 * Math.PI * k) / sides;
    return add(c, add(mul(u, Math.cos(t) * r), mul(w, Math.sin(t) * r)));
  }), thick, mat, bias);
}

/** A ring of windows round a lathe (an elliptical saucer), facing out and up. */
function winRing(m: HullModel, cx: number, y: number, r: number, sx: number, n: number, up = 0.7, cz = 0): void {
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * (i + 0.5)) / n;
    m.win([cx + Math.cos(t) * r * sx, y, cz + Math.sin(t) * r], [Math.cos(t), up, Math.sin(t)]);
  }
}

// ---- Shared faction parts ----

/** A Trek nacelle along x: a glowing intake cap, the body, an aft taper, and a coil strip on top. */
function nacelle(m: HullModel, x0: number, x1: number, y: number, z: number, r: number): void {
  m.loft([S(x0, r * 0.5, r * 0.5, y, z), S(x0 - r * 0.7, r * 0.92, r * 0.92, y, z), S(x0 - r * 1.2, r, r, y, z), S(x1 + r * 1.3, r, r, y, z), S(x1, r * 0.66, r * 0.66, y, z)],
    ['ember', 'accent', 'hull', 'steel'], { sides: 12, caps: ['ember', 'dark'] });
  // The coils: segmented glow along the top, the unmistakable mark of a warp drive.
  const len = x0 - x1 - r * 3.4;
  for (let i = 0; i < 5; i++) {
    const a = x0 - r * 1.6 - (len * i) / 5;
    m.box(a - len / 5 + 0.7, a, y + r * 0.82, y + r * 1.08, z - r * 0.42, z + r * 0.42, 'glow', { bias: 0.3 });
  }
  m.engine([x1 - 0.4, y, z], r * 0.55);
}

/** A Wars engine can: a bare cylinder with a dark intake ring and a glowing nozzle. */
function engineCan(m: HullModel, x0: number, x1: number, y: number, z: number, r: number): void {
  m.loft([S(x0, r * 0.7, r * 0.7, y, z), S(x0 - 1.2, r, r, y, z), S(x1 + 2, r, r, y, z), S(x1, r * 0.82, r * 0.82, y, z)],
    ['dark', 'steel', 'steel'], { sides: 10, caps: ['dark', 'glow'] });
  m.engine([x1 - 0.3, y, z], r * 0.8);
}

/** A Mecha engine nacelle (it becomes a leg): boxy, with a dark nozzle bell. */
function jetNacelle(m: HullModel, x0: number, x1: number, y: number, z: number, w: number, h: number): void {
  m.loft([S(x0, w * 0.86, h * 0.86, y, z), S(x0 - 2, w, h, y, z), S(x1 + 4, w, h, y, z), S(x1 + 1, w * 0.9, h * 0.9, y, z)],
    ['hull', 'hull', 'steel'], { sides: 12, sq: 3, caps: ['dark', undefined] });
  m.loft([S(x1 + 1, w * 0.72, h * 0.72, y, z), S(x1 - 1.5, w * 0.82, h * 0.82, y, z)], 'dark', { sides: 12, caps: [undefined, 'glow'] });
  m.engine([x1 - 1.8, y, z], Math.min(w, h) * 0.75);
}

/** A Mecha canted tail fin, with an accent tip. */
function cantedTail(m: HullModel, x0: number, chord: number, y0: number, z0: number, height: number, cant: number): void {
  wing(m, [[x0, y0, z0], [x0 - chord, y0, z0], [x0 - chord - 4, y0 + height, z0 + cant], [x0 - chord * 0.45 - 4, y0 + height, z0 + cant]], 0.9, 'hull', [[0.72, 1, 'accent']]);
}

// ---- The nine hulls ----

type Build = (m: HullModel) => void;
export interface FleetHull { faction: Faction; name: string; nod: string; poses: Record<string, Build> }

/** The Mecha fighter airframe, shared by both of its poses. */
function variableAirframe(m: HullModel): void {
  m.loft([S(52, 0, 0, -0.6), S(47, 1.5, 1.3, -0.4), S(40, 2.6, 2.2, -0.1), S(30, 3.5, 2.8), S(16, 4.3, 3.2), S(0, 5, 3.2), S(-14, 5, 2.9), S(-28, 4, 2.4), S(-34, 3, 1.8)],
    ['accent', 'accent', 'hull', 'hull', 'hull', 'hull', 'hull', 'steel'], { sides: 14, sq: 3, caps: [undefined, 'dark'] });
  m.loft([S(36, 0, 0, 2.3), S(32, 1.4, 1.3, 2.5), S(24, 1.7, 1.7, 2.7), S(17, 0.8, 0.8, 2.6)], 'glass', { sides: 10 });
  // The dorsal spine and a chevron across the back.
  m.box(-26, 14, 2.6, 3.7, -1.2, 1.2, 'steel');
  m.sym(() => {
    m.box(-4, 10, -2.2, 2.4, 4.6, 9.2, 'steel');
    m.box(9.6, 10.6, -1.6, 1.8, 5.3, 8.6, 'dark', { bias: 0.4 });
    wing(m, [[6, 0.8, 8.8], [-21, 0.8, 8.8], [-31, 0.8, 34], [-25, 0.8, 34]], 1, 'hull', [[0.5, 0.64, 'accent'], [0.96, 1, 'steel']]);
    m.prism([[-31, 2.6], [-43, 2.6], [-46, 15], [-42, 15]], 0, 0.8, 'xz', 'hull');
    cantedTail(m, -24, 13, 2.4, 3.6, 12, 5);
    m.win([-28, 1.6, 34.2], [0, 1, 0.3]);
    m.win([-42.5, 15, 9.6], [0.2, 0.6, 1]);
  });
}

export const FLEET_HULLS: FleetHull[] = [
  {
    faction: 'trek', name: 'Saucer explorer', nod: 'an elliptic saucer, a swept neck, an engineering hull, and twin nacelles high and aft',
    poses: {
      cruise: (m) => {
        m.lathe([[0, 5.4], [3.2, 5.2], [5, 4.2], [7.5, 3.2], [13, 2.5], [19, 1.3], [23, 0.2], [23, -0.7], [19, -1.9], [11, -2.9], [5, -3.4], [0, -3.8]],
          ['steel', 'steel', 'hull', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull', 'hull', 'steel'], { cx: 20, cy: 9, sx: 1.18, sides: 32 });
        slab(m, [[14, 6.8, 0], [3, 6.8, 0], [-13, -4.5, 0], [-3, -4.5, 0]], 3.2, 'hull');
        m.loft([S(6, 2.8, 2.8, -6.5), S(4.5, 4.6, 4.8, -6.5), S(-5, 5.3, 5.5, -6.5), S(-24, 4.6, 4.8, -6), S(-33, 3.2, 3.4, -5.4), S(-37, 1.8, 1.8, -5)],
          ['accent', 'hull', 'hull', 'hull', 'steel'], { sides: 14, caps: ['glow', 'dark'] });
        // A 1950s dorsal fin on the engineering hull, between the pylons.
        slab(m, [[-18, -1.6, 0], [-30, -1.6, 0], [-35, 3.4, 0], [-29, 3.4, 0]], 1, 'accent');
        winRing(m, 20, 11, 16.5, 1.18, 20, 0.9);
        winRing(m, 20, 8.7, 22.6, 1.18, 14, 0.1);
        m.sym(() => {
          slab(m, [[-13, -3, 2.6], [-25, -3, 2.6], [-35, 9.2, 14.5], [-27, 9.2, 14.5]], 1.5, 'hull');
          nacelle(m, -6, -48, 11.2, 14.5, 2.9);
          m.winRow(-26, -2, 4, -4.8, 5.2, [0, 0.25, 1]);
          m.engine([-7.5, 9.2, 4], 1.3);
        });
      },
    },
  },
  {
    faction: 'trek', name: 'Compact escort', nod: 'a dense disc-and-wedge warship with cannon ridges, its short nacelles riding high on its flanks',
    poses: {
      cruise: (m) => {
        // A broad disc, wider than it is long, on a deep wedge body: the shape of a warship, not a liner.
        m.lathe([[0, 6], [3, 5.8], [5, 4.8], [10, 4], [15, 2.2], [18, 0.2], [17, -1.8], [11, -3.6], [0, -4]],
          ['steel', 'steel', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull'], { cx: 10, cy: 0, sx: 1.05, sides: 28 });
        m.loft([S(6, 7, 3.6, -0.4), S(-12, 9, 4.2, -0.6), S(-24, 7.5, 3.6, -0.6), S(-29, 5.4, 2.6, -0.6)], ['hull', 'hull', 'steel'], { sides: 16, sq: 3, caps: [undefined, 'dark'] });
        m.box(-20, 6, 3.6, 6.4, -2.4, 2.4, 'accent'); // the raised command deck
        m.box(27.4, 29.4, -0.8, 0.8, -4.5, 4.5, 'glow', { bias: 0.4 }); // the deflector slit
        winRing(m, 10, 3, 11, 1.05, 16, 0.9);
        m.sym(() => {
          // Forward cannon ridges along the disc, the escort's teeth.
          m.box(8, 24, 1.6, 3.2, 5.4, 7, 'accent', { bias: 0.4 });
          nacelle(m, 2, -38, 1.6, 18, 3);
          slab(m, [[-2, -1.2, 7], [-26, -1.2, 7], [-28, 1.2, 15.5], [-4, 1.2, 15.5]], 2.2, 'hull');
          m.box(23, 27.2, -1, 0.8, 4.2, 6.2, 'dark', { bias: 0.5 }); // torpedo tubes
          m.winRow(-20, 0, 4, 1.4, 9.1, [0, 0.3, 1]);
          m.engine([-29.4, -0.6, 3.6], 1.5);
        });
      },
    },
  },
  {
    faction: 'trek', name: 'Science vessel', nod: 'a long sensor needle through a small saucer, with a dorsal dome and long nacelles on outriggers',
    poses: {
      cruise: (m) => {
        // Art audit 2026-10-12: simplified. The array ring, struts, dorsal pole and window rings are gone;
        // what's left is three bold shapes (a needle hull, a saucer, two nacelles) that read at 29 px.
        m.loft([S(44, 0.9, 0.9), S(41, 3, 3), S(34, 5.2, 4.8), S(-22, 5.6, 5.2), S(-31, 3.8, 3.6)], ['accent', 'hull', 'hull', 'steel'], { sides: 14, caps: ['glow', 'dark'] });
        m.lathe([[0, 3.8], [4.5, 3.6], [11, 1.9], [16, 0.3], [16, -0.7], [11, -1.9], [0, -2.5]], ['steel', 'hull', 'accent', 'accent', 'hull', 'hull'], { cx: 9, cy: 5.6, sx: 1.25, sides: 28 });
        m.lathe([[0, 2.4], [2, 2], [3.4, 0.8]], 'steel', { cx: 8, cy: 8, sides: 12 }); // the dorsal sensor dome
        winRing(m, 9, 6.6, 12.5, 1.25, 14, 0.9);
        m.sym(() => {
          slab(m, [[-6, 0.5, 3], [-22, 0.5, 3], [-30, 2.6, 19], [-18, 2.6, 19]], 2.2, 'hull');
          nacelle(m, -2, -40, 3.6, 20, 3.4);
          m.winRow(-24, 30, 4.5, 0.8, 2.75, [0, 0.3, 1]);
        });
      },
    },
  },
  {
    faction: 'wars', name: 'Starfighter', nod: 'a long wedge nose and four split wings in an X, with bare engine cans at the roots and cannons at the tips',
    poses: {
      cruise: (m) => {
        // A hexagonal section, flat on top and keeled at the sides: angular, not turned.
        const hex: [number, number][] = [[1, 0], [0.62, 0.9], [-0.62, 0.9], [-1, 0], [-0.62, -0.9], [0.62, -0.9]];
        m.loft([S(52, 0.7, 0.4, -0.4), S(42, 2.5, 1.9, -0.2), S(22, 3.8, 2.9), S(0, 4.5, 3.5), S(-20, 5, 3.9), S(-30, 4.7, 3.6)],
          ['accent', 'hull', 'hull', 'hull', 'steel'], { shape: hex, caps: [undefined, 'dark'] });
        m.box(26, 40, 1.3, 2.1, -1.6, 1.6, 'accent', { bias: 0.3 }); // a nose stripe
        m.loft([S(9, 0, 0, 2.8), S(5, 1.6, 1.3, 3), S(-5, 1.8, 1.5, 3.2), S(-9, 0.6, 0.6, 3)], 'glass', { sides: 10 });
        m.box(-22, -12, 2.9, 4.2, -1.2, 1.2, 'steel'); // the dorsal droid socket
        m.sym(() => {
          for (const y of [1, -1]) {
            engineCan(m, -4, -34, 2.8 * y, 5.6, 2.8);
            wing(m, [[-6, 2.4 * y, 6], [-28, 2.4 * y, 6], [-30, 8.4 * y, 27], [-14, 8.4 * y, 27]], 1, 'hull', [[0.1, 0.22, 'accent'], [0.66, 0.8, 'accent']]);
            m.loft([S(-28, 1.3, 1.3, 8.6 * y, 27), S(-10, 1.3, 1.3, 8.6 * y, 27), S(-8, 0.75, 0.75, 8.6 * y, 27), S(6, 0.65, 0.65, 8.6 * y, 27), S(8, 1, 1, 8.6 * y, 27), S(11, 0.5, 0.5, 8.6 * y, 27)],
              ['steel', 'steel', 'dark', 'steel', 'dark'], { sides: 8 });
          }
          m.win([-24, 9.8, 27.6], [0, 1, 0.3]);
        });
      },
    },
  },
  {
    faction: 'wars', name: 'Light freighter', nod: 'a round, plated hull with its cockpit offset to starboard, a dorsal turret, a rear drive slot, and outrigger engines on stub wings',
    poses: {
      cruise: (m) => {
        // A faceted puck, plated in panels: round, but cut rather than turned.
        m.lathe([[0, 6.4], [5, 6.2], [10, 5.4], [17, 3.8], [22, 1.8], [24, 0.4], [24, -0.8], [21, -2.8], [12, -4.2], [0, -4.6]],
          ['steel', 'hull', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull', 'steel'], { sides: 14 });
        m.box(-27, -17, -2.4, 2.6, -13, 13, 'steel');
        m.box(-27.6, -26.6, -1.3, 1.5, -11.5, 11.5, 'glow', { bias: 0.5 });
        for (let z = -10; z <= 10.01; z += 5) m.engine([-27.8, 0, z], 1.5);
        // The blunt loading prow, and vents and panels across the upper hull: the worn, hard-used look.
        m.box(16, 33, -2.6, 2.2, -5.5, 5.5, 'hull');
        m.box(18, 33.4, 2.2, 2.9, -2.4, 2.4, 'accent');
        m.box(32.6, 33.6, -1.8, 1.4, -4.6, 4.6, 'dark', { bias: 0.3 });
        for (const [x, z] of [[-12, -7], [-6, 9], [6, -12], [12, 6], [-14, 4]] as const) m.box(x - 2, x + 2, 4.8, 5.6, z - 1.4, z + 1.4, 'dark', { bias: 0.4 });
        m.lathe([[0, 8.8], [2.4, 8.5], [3.6, 7.4], [4, 6]], 'steel', { cx: 1, sides: 10 });
        for (const z of [-0.9, 0.9]) m.loft([S(3, 0.5, 0.5, 8, z), S(13, 0.4, 0.4, 8.2, z)], 'dark', { sides: 6 });
        // The cockpit, off to starboard on its own arm and well forward: the freighter's tell.
        slab(m, [[18, 0.6, 14], [6, 0.6, 14], [8, 0.6, 21], [20, 0.6, 21]], 2.4, 'steel');
        m.loft([S(37, 1.4, 1.2, 0.6, 22), S(35.5, 2.7, 2.5, 0.6, 22), S(28, 3.1, 2.9, 0.6, 22), S(14, 3.1, 2.9, 0.6, 22), S(11, 2.2, 2, 0.6, 22)],
          ['glass', 'hull', 'hull', 'steel'], { sides: 12, caps: ['glass', 'dark'] });
        m.box(24, 30, 3, 3.5, 20.6, 23.4, 'accent', { bias: 0.4 });
        m.win([36.4, 1.4, 23.4], [1, 0.3, 0.4]).win([36.6, 1.6, 21], [1, 0.3, 0]);
        // A radar dish to port.
        m.tube([[8, 4.4, -12], [8.5, 8, -12.5]], 0.5, 'steel', { sides: 4 });
        disc(m, [8.6, 8.3, -12.6], [0.5, 0.8, -0.3], 3.4, 0.5, 'accent', 12);
        winRing(m, 0, 0.4, 23.6, 1, 12, 0.2);
        m.sym(() => {
          wing(m, [[-4, 0, 18], [-20, 0, 18], [-26, 0, 33], [-12, 0, 33]], 1.2, 'hull', [[0.6, 0.8, 'accent']]);
          engineCan(m, 0, -32, 0, 35, 2.6);
        });
      },
    },
  },
  {
    faction: 'wars', name: 'Corvette', nod: 'a flat hammerhead bow on a long neck, a big drive block with a bank of nine engines, radiator fins, and swept wings',
    poses: {
      cruise: (m) => {
        // The hammerhead: a wide bow block with a lit bridge strip across its face, on a thick neck.
        // (Art audit 2026-10-12: thickened throughout; at a ~58 px length it was a thin pole.)
        m.loft([S(38, 8.5, 3), S(36, 13, 4.6), S(28, 13.6, 4.8), S(23, 11, 4.2), S(20, 4.6, 3.8)], ['accent', 'hull', 'hull', 'steel'], { sides: 14, sq: 5, caps: ['accent', undefined] });
        m.box(29, 33, -4.8, 4.8, -13.8, 13.8, 'accent', { bias: 0.3 });
        for (let z = -9; z <= 9.01; z += 3) m.win([37.8, 1, z], [1, 0.3, z / 16]);
        m.loft([S(20, 4.6, 3.8), S(12, 5.4, 4.6), S(4, 7, 6), S(-6, 9.6, 8), S(-10, 10.4, 8.6)], ['hull', 'steel', 'hull', 'hull'], { sides: 14, sq: 3 });
        m.box(-40, -9, -10, 10, -12.5, 12.5, 'hull');
        m.box(-27, -22, -10.4, 10.4, -12.9, 12.9, 'accent', { bias: 0.3 });
        // The drive bank: nine engines in a block (was twelve), each big enough to show.
        for (const y of [-5.4, 0, 5.4]) for (const z of [-7.6, 0, 7.6]) {
          m.loft([S(-40, 2.4, 2.4, y, z), S(-42.8, 2.6, 2.6, y, z)], 'dark', { sides: 10, caps: [undefined, 'glow'] });
          m.engine([-43, y, z], 1.9);
        }
        for (const y of [1, -1]) slab(m, [[-10, 9 * y, 0], [-32, 9 * y, 0], [-38, 20 * y, 0], [-25, 20 * y, 0]], 1.6, y > 0 ? 'accent' : 'hull');
        m.sym(() => {
          wing(m, [[-12, -1, 12.5], [-38, -1, 12.5], [-44, -1, 31], [-33, -1, 31]], 1.6, 'hull', [[0.7, 0.86, 'accent']]);
          engineCan(m, -26, -45, -1, 31.5, 2.4);
        });
      },
    },
  },
  {
    faction: 'mecha', name: 'Transforming fighter', nod: 'a variable jet: swept wings, boxy intakes, canted twin tails, and the engine nacelles that swing down as legs',
    poses: {
      fighter: (m) => {
        variableAirframe(m);
        m.sym(() => jetNacelle(m, -2, -44, -1.4, 6.6, 3.3, 3));
      },
      hybrid: (m) => {
        variableAirframe(m);
        // The head drops clear of the nose, its visor lit.
        m.box(8, 14, -6.4, -3, -2.2, 2.2, 'accent');
        m.box(13.8, 14.5, -5.6, -4.4, -1.7, 1.7, 'glow', { bias: 0.5 });
        // The gun pod, held under the body in both hands.
        m.loft([S(6, 1.4, 1.4, -10.5, 0), S(26, 1.4, 1.4, -10.5, 0), S(28, 0.7, 0.7, -10.5, 0), S(34, 0.5, 0.5, -10.5, 0)], ['dark', 'steel', 'dark'], { sides: 8 });
        m.sym(() => {
          m.tube([[6, -2.5, 4.4], [8, -8.4, 5.6]], 1.4, 'steel', { sides: 8 });
          m.tube([[8, -8.4, 5.6], [17, -9.6, 2.6]], 1.6, 'hull', { sides: 8 });
          m.box(16, 19, -11, -8.6, 1.2, 3.4, 'steel');
          // Legs: the nacelle swings down from the hip, nozzle become feet.
          m.tube([[-8, -2, 6.8], [-3, -11, 7.8]], 3.3, 'steel', { sides: 8 });
          m.box(-6, 0, -14, -9.6, 4.6, 11, 'accent');
          m.tube([[-3, -12, 7.8], [-9, -25, 8]], (s) => 4.4 - s * 0.6, 'hull', { sides: 10 });
          m.box(-15, -2, -29.5, -25.5, 4.6, 11.4, 'steel');
          m.box(-15.2, -1.8, -30.2, -29.3, 4.8, 11.2, 'dark', { bias: 0.3 });
          m.engine([-8.5, -30.4, 8], 2.5, true);
        });
      },
    },
  },
  {
    faction: 'mecha', name: 'Armoured heavy', nod: 'the variable jet under bolt-on armour: a broad hump, shoulder missile pods, back boosters, stub wings and short canted tails',
    poses: {
      cruise: (m) => {
        m.loft([S(48, 0, 0, -0.4), S(43, 2.2, 1.8, -0.2), S(33, 4, 3.2), S(18, 6, 4.4), S(0, 7, 4.8), S(-16, 7, 4.4), S(-28, 6, 3.8), S(-34, 4.6, 2.8)],
          ['accent', 'hull', 'hull', 'steel', 'hull', 'hull', 'steel'], { sides: 14, sq: 4, caps: [undefined, 'dark'] });
        m.loft([S(30, 0, 0, 3.2), S(26, 1.4, 1.4, 3.6), S(20, 1.6, 1.6, 4), S(16, 0.6, 0.6, 3.8)], 'glass', { sides: 10 });
        m.box(2, 18, 3.6, 5.8, -4.6, 4.6, 'steel');
        m.box(16.5, 17.5, 4, 5.2, -3.6, 3.6, 'glow', { bias: 0.5 }); // the sensor visor in the chest plate
        m.sym(() => {
          m.box(-8, 14, 2, 8.6, 6, 12.4, 'accent');
          for (const x of [-5, 0, 5, 10]) for (const z of [7.4, 10]) m.box(x, x + 2.6, 8.5, 9, z, z + 1.6, 'dark', { bias: 0.4 });
          m.loft([S(2, 1.6, 1.6, 8, 3.4), S(-1, 3, 3, 8, 3.4), S(-34, 3, 3, 8, 3.4), S(-38, 2.5, 2.5, 8, 3.4)], ['dark', 'steel', 'dark'], { sides: 12, caps: ['dark', 'glow'] });
          m.engine([-38.4, 8, 3.4], 2.3);
          jetNacelle(m, -6, -43, -3, 6, 3.8, 3.4);
          wing(m, [[-2, 0, 9], [-22, 0, 9], [-29, 0, 26], [-22, 0, 26]], 1.4, 'hull', [[0.55, 0.72, 'accent']]);
          cantedTail(m, -22, 11, 4, 4.4, 11, 4.5);
          m.win([-25.5, 1, 26.2], [0, 1, 0.3]);
        });
      },
    },
  },
  {
    faction: 'mecha', name: 'Command cruiser', nod: 'a split bow of twin cannon booms, a stepped bridge tower, carrier arms on the flanks, canted twin fins and delta wings',
    poses: {
      cruise: (m) => {
        m.box(18, 44, -1.1, 1.1, -1.1, 1.1, 'glow', { bias: -0.5 }); // the cannon's charge line between the booms
        m.loft([S(10, 10, 5), S(-6, 12, 6), S(-30, 12, 6.4), S(-36, 10, 5.2)], ['hull', 'hull', 'steel'], { sides: 16, sq: 5, caps: ['steel', 'dark'] });
        m.box(-24, -10, 5.6, 13, -3.6, 3.6, 'hull');
        m.box(-21, -11, 13, 16.6, -3, 3, 'accent');
        m.box(-11.6, -10.6, 14, 15.6, -2.6, 2.6, 'glass', { bias: 0.4 });
        for (const z of [-1.8, 0, 1.8]) m.win([-10.4, 14.8, z], [1, 0.3, 0]);
        for (const y of [-2.4, 2.4]) for (const z of [-5, 5]) m.engine([-36.4, y, z], 2.4);
        m.sym(() => {
          m.loft([S(50, 2, 2.6, 0, 6.6), S(46, 3, 3.6, 0, 6.6), S(14, 3.2, 3.9, 0, 6.6), S(8, 3.2, 3.9, 0, 6.6)], ['accent', 'hull', 'hull'], { sides: 12, sq: 4, caps: ['dark', undefined] });
          m.box(14, 34, 2.6, 4.2, 5.2, 8, 'steel', { bias: 0.3 });
          slab(m, [[6, -1, 10], [-22, -1, 10], [-22, -1, 13.4], [6, -1, 13.4]], 2.2, 'steel');
          m.loft([S(14, 3, 3.4, -2, 16.4), S(10, 4, 4, -2, 16.4), S(-24, 4, 4, -2, 16.4), S(-28, 3.2, 3.4, -2, 16.4)], ['accent', 'hull', 'steel'], { sides: 14, sq: 5, caps: ['dark', 'dark'] });
          m.engine([-28.4, -2, 16.4], 1.9);
          cantedTail(m, -18, 14, 6, 5, 14, 6);
          wing(m, [[-8, -3, 20], [-30, -3, 20], [-38, -3, 34], [-31, -3, 34]], 1.2, 'hull', [[0.68, 0.84, 'accent']]);
          m.winRow(-28, -4, 4, 2, 12.1, [0, 0.2, 1]);
          m.winRow(-20, 8, 4, -0.6, 20.4, [0, 0.2, 1]);
          m.winRow(16, 44, 4, 0.6, 9.9, [0, 0.2, 1]);
        });
      },
    },
  },
];

const poseNames = (hull: number) => Object.keys(FLEET_HULLS[hull]!.poses);
/** The poses a hull can take (the Mecha fighter has two); the first is its default. */
export const posesOf = (hull: number): string[] => poseNames(hull);

// ---- Baking: one render per design, colourway, pose and heading, shared by every ship ----

/** The render footprint: 44 × 28 units (half-length 22 at scale 1), the same for every hull (INV-19). */
const BASE_R = 22;
const FIT = { width: 44, height: 28 };

interface Baked { hull: HullRender; exhaust: GraphicsContext; dx: number; dy: number }

const models = new Map<string, HullModel>();
const baked = new Map<string, [Baked, Baked]>();

function modelFor(hull: number, pose: string): HullModel {
  const key = `${hull}:${pose}`;
  let m = models.get(key);
  if (!m) {
    m = new HullModel();
    FLEET_HULLS[hull]!.poses[pose]!(m);
    m.beacon([0, 0, 0]); // the airframe's origin: poses line up on it
    models.set(key, m);
  }
  return m;
}

function paletteFor(d: FleetDesign): Palette {
  const c = COLOURWAYS[d.colourway]!;
  const l = LIGHT[FLEET_HULLS[d.hull]!.faction];
  return {
    hull: c.hull, accent: c.accent, cargo: 0x6a6d74,
    steel: mix(0x666c76, c.hull, 0.22), dark: 0x262a33, glass: 0x2a4d58,
    glow: l.glow, ember: l.ember,
  };
}

function bake(d: FleetDesign, pose: string): [Baked, Baked] {
  const key = `${d.hull}:${d.colourway}:${pose}`;
  let b = baked.get(key);
  if (b) return b;
  const base = poseNames(d.hull)[0]!;
  const palette = paletteFor(d);
  const glow = LIGHT[FLEET_HULLS[d.hull]!.faction].glow;
  const ref = pose === base ? null : bake(d, base);
  const model = modelFor(d.hull, pose);
  const east = renderHull(model, palette, 1, ref ? { ...FIT, k: ref[0].hull.k } : FIT);
  const west = renderHull(model, palette, -1, { ...FIT, k: east.k });
  const one = (r: HullRender, i: number): Baked => {
    const exhaust = new GraphicsContext();
    for (const e of r.engines) drawExhaust(exhaust, e, glow);
    // A second pose keeps the airframe where the first one had it, so the change reads as a transformation.
    const [ox, oy] = ref ? ref[i]!.hull.beacons[0]! : [0, 0];
    const [px, py] = ref ? r.beacons[0]! : [0, 0];
    return { hull: r, exhaust, dx: ref ? ref[i]!.dx + ox - px : 0, dy: ref ? ref[i]!.dy + oy - py : 0 };
  };
  b = [one(east, 0), one(west, 1)];
  baked.set(key, b);
  return b;
}

/** A glow at each nozzle and a short plume: aft along the hull, or straight down for `hot` (thrust feet). */
function drawExhaust(g: GraphicsContext, e: HullRender['engines'][number], c: number): void {
  let [ux, uy] = e.hot ? [0, 1] : [e.bx, e.by];
  const len = Math.hypot(ux, uy) || 1;
  [ux, uy] = [ux / len, uy / len];
  const [px, py] = [-uy, ux];
  const reach = e.r * 3;
  const w = e.r * 0.8;
  g.poly([e.x + px * w, e.y + py * w, e.x + ux * reach, e.y + uy * reach, e.x - px * w, e.y - py * w]).fill({ color: c, alpha: 0.24 });
  g.poly([e.x + px * w * 0.45, e.y + py * w * 0.45, e.x + ux * reach * 0.6, e.y + uy * reach * 0.6, e.x - px * w * 0.45, e.y - py * w * 0.45]).fill({ color: lighten(c, 0.5), alpha: 0.4 });
  g.circle(e.x, e.y, e.r * 1.25).fill({ color: c, alpha: 0.2 });
  g.circle(e.x, e.y, e.r * 0.6).fill({ color: lighten(c, 0.7), alpha: 0.95 });
}

// ---- The view ----

interface Heading { root: Container; engines: Graphics; lights: WindowLights }

/**
 * A captain's hero ship: one design and colourway, lit and baked at both headings. `size` is the
 * half-length in screen px (35 → about 70 px long), the same for every hull and person (INV-19).
 * setStage takes a pose name (posesOf), and ignores anything else: a captain carries no state rung.
 */
export class CaptainView {
  readonly root = new Container();
  readonly layer = 'hardware' as const;
  readonly design: FleetDesign;
  private readonly bob = new Container();
  private readonly poses = new Map<string, Heading[]>();
  private pose: string;
  private heading = 0;
  private readonly phase: number;
  private readonly lightSeed: number;
  /** Its speed on screen (px/s), smoothed, and where it was last tick: engines burn with it. */
  private speed = 0;
  private lastP: [number, number] | null = null;
  private lastT: number | null = null;

  constructor(design: FleetDesign | number, readonly size = 35, pose?: string) {
    this.design = typeof design === 'number' ? fleetDesign(design) : design;
    this.lightSeed = typeof design === 'number' ? design >>> 0 : this.design.hull * 31 + this.design.colourway * 7;
    this.phase = (this.lightSeed % 101) / 13;
    this.bob.scale.set(size / BASE_R);
    this.root.addChild(this.bob);
    const names = poseNames(this.design.hull);
    this.pose = pose && names.includes(pose) ? pose : names[0]!;
    this.show();
  }

  private headingsFor(pose: string): Heading[] {
    let hs = this.poses.get(pose);
    if (hs) return hs;
    const windows = LIGHT[FLEET_HULLS[this.design.hull]!.faction].windows;
    hs = bake(this.design, pose).map((b) => {
      const root = new Container();
      root.position.set(b.dx, b.dy);
      const engines = new Graphics(b.exhaust);
      engines.blendMode = 'add';
      const hull = new Graphics(b.hull.context); // shared by every ship of this design
      const lights = new WindowLights(b.hull.windows, 0.8, this.lightSeed, windows, 'breathe');
      root.addChild(engines, hull, ...lights.groups);
      this.bob.addChild(root);
      return { root, engines, lights };
    });
    this.poses.set(pose, hs);
    return hs;
  }

  private show(): void {
    this.headingsFor(this.pose);
    for (const [p, hs] of this.poses) hs.forEach((h, i) => (h.root.visible = p === this.pose && i === this.heading));
  }

  /** Which way it points now: east (1) or west (−1). */
  get dir(): number {
    return this.heading ? -1 : 1;
  }

  /** Point east (+x, 1) or west (−x, −1): each heading is its own lit render, not a mirror. */
  face(dir: number): void {
    this.heading = dir < 0 ? 1 : 0;
    this.show();
  }

  /** A pose name changes the ship's form (the Mecha fighter's hybrid); anything else is ignored. */
  setStage(stage: string): void {
    if (stage === this.pose || !poseNames(this.design.hull).includes(stage)) return;
    this.pose = stage;
    this.show();
  }

  tick(seconds: number): void {
    // A slow decorative drift, never an event (05 §5); none in reduced motion or fast playback.
    this.bob.y = motion.reduced ? 0 : Math.sin(seconds * 0.9 + this.phase) * this.size * 0.03 * motion.jiggle;
    const h = this.poses.get(this.pose)![this.heading]!;
    // Engines (2026-10-12): at rest a low glow on a long, slow pulse; under way they burn in step with
    // how fast the ship is going, the force pushing it. Speed is the ship's own, measured on screen.
    const p = this.root.getGlobalPosition(undefined, true);
    const dt = this.lastT === null ? 0 : Math.max(0, seconds - this.lastT);
    if (this.lastP && dt > 0) {
      const v = Math.hypot(p.x - this.lastP[0], p.y - this.lastP[1]) / dt;
      this.speed += (v - this.speed) * Math.min(1, dt * 4);
    }
    this.lastP = [p.x, p.y];
    this.lastT = seconds;
    const idle = 0.2 + 0.16 * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / 7 + this.phase));
    const go = Math.max(0, Math.min(1, (this.speed - 8) / 70));
    h.engines.alpha = motion.reduced ? 0.4 : idle + (1 - idle) * go;
    h.lights.tick(motion.reduced ? 0 : motion.pulseTime);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
