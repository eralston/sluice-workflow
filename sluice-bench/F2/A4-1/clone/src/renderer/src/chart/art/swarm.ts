// v1 threats (13-game-design.md §4.3): Bugs become enemy hive ships, insectoid craft in three
// swarm styles, inspired by the bug races of fiction (arachnid hives, brood swarms) and copying none.
//   Reaver   an arachnid lancer: armoured cephalothorax, splayed jointed legs, two mandible lances
//   Brood    a brood carrier: a domed, plated carapace with glowing brood sacs on its spine
//   Stinger  a wasp interceptor: compound eyes, a pinched waist, a banded abdomen, membrane wings
// Colours come only from the hostile palette (12 §6): reds and their neighbours with black,
// charcoal and obsidian. A ship wears one gentle "deadly red" aura (aura.ts) on every open look, its
// wireframe contact included: it says what the object is. A defeated hulk's turns victory gold. The
// state is in its form (wireframe, solid and dormant, bristling with fire, venting and cracked,
// breaking apart, a gold-lit orbital research platform); there is no target lock on it (removed
// 2026-10-12, hard to read).
//
// Steps (Tasks) are its weapon pods: charging (New, Active), dark and disabled (Closed). Each step
// climbs its own ladder (INV-05).
//
// Combat safety (10, Combat safety): insects and machines only; no crew anywhere; enemy fire goes
// outward and is absorbed by shields, never landing on anyone; defeat is debris, sparks and research.
//
// Hulls are hull3d solids, baked per design × colourway × heading and shared by every view. The
// marks (wireframe, off-ladder marks) stay crisp in `marks`. State motion reads
// motion.pulseTime; ambient drift reads wall time; reduced motion holds one still, legible frame.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { brighten, DANGER, HERO, HERO_CORE, HERO_GLOW } from './energy';
import { HullModel, renderHull, S, type HullRender, type Mat, type Palette, type V3 } from './hull3d';
import { darken, lighten, mix } from './lit';
import { Aura, AURA } from './aura';
import { drawOffLadderMarks } from './marks';
import { motion } from './motion';
import { NEARING_PERIOD, PROGRESS_PERIOD, progressPulse, READY, SUCCESS, type Rung } from './progress';

// ---- Palettes ----

/** Hostile colourways (12 §6): hue roughly 320°–40°, with insidiously dark accents. Heroes may not use these. */
export const HOSTILE: { name: string; hull: number; accent: number; glow: number }[] = [
  { name: 'Crimson & obsidian', hull: 0x84182a, accent: 0x18141c, glow: 0xff4438 },
  { name: 'Oxblood & charcoal', hull: 0x541722, accent: 0x36333b, glow: 0xff5c48 },
  { name: 'Vermilion & black', hull: 0xa8361a, accent: 0x121014, glow: 0xff5a1e },
  { name: 'Rust & ash', hull: 0x7a3a20, accent: 0x4a4140, glow: 0xff6e30 },
  { name: 'Magenta-red & void', hull: 0x80184b, accent: 0x1c1021, glow: 0xff3a86 },
  { name: 'Obsidian & blood', hull: 0x261c22, accent: 0x9c1c2a, glow: 0xff3030 },
];

const CHITIN = 0x0f0c11;
const SHIELD = HERO_GLOW; // hero shields and point defence: the one hero energy at rest (art/energy.ts)
const IVORY = 0xf4f0de;

const grey = (c: number) => {
  const l = Math.round(0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255));
  return (l << 16) | (l << 8) | l;
};

type Variant = 'live' | 'scorched' | 'ghost' | 'charred';

function paletteOf(cw: number, variant: Variant): Palette {
  const c = HOSTILE[cw]!;
  const base: Palette = {
    hull: c.hull, accent: c.accent, dark: mix(CHITIN, c.accent, 0.25), steel: mix(c.accent, c.hull, 0.28),
    glass: mix(0x1c080d, c.glow, 0.18), cargo: mix(c.hull, c.glow, 0.5), glow: c.glow, ember: lighten(c.glow, 0.45),
  };
  const map = (f: (v: number, k: keyof Palette) => number): Palette =>
    Object.fromEntries(Object.entries(base).map(([k, v]) => [k, f(v, k as keyof Palette)])) as Palette;
  switch (variant) {
    case 'live': return base;
    // Heavily engaged: carbon-scored plates, the glow still burning.
    case 'scorched': return map((v, k) => (k === 'glow' || k === 'ember' ? v : mix(v, 0x1d1214, k === 'hull' ? 0.38 : 0.25)));
    // Off the ladder: desaturated toward the ghost grey (09 §1).
    case 'ghost': return map((v) => mix(mix(v, grey(v), 0.85), 0x6f7787, 0.35));
    // A wreck: lights out, plates burnt to soot with a trace of their colour.
    case 'charred': return map((v, k) => (k === 'glow' || k === 'ember' || k === 'cargo' ? mix(c.hull, 0x241a1a, 0.7) : mix(v, 0x1e1919, 0.55)));
  }
}

// ---- Model helpers ----

interface Spot { p: V3; n: V3 }
const mirror = (p: V3): V3 => [p[0], p[1], -p[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function newell(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm3([x, y, z]);
}

/** A two-sided flat membrane through any 3D points (wings, fins): one face per side. */
function plate(m: HullModel, pts: V3[], mat: Mat, bias = 0): void {
  const n = newell(pts);
  m.parts.push({ bias, faces: [{ pts, n, mat }, { pts: [...pts].reverse(), n: [-n[0], -n[1], -n[2]], mat }] });
}

/** A jointed, tapering limb along a path. */
const limb = (m: HullModel, path: V3[], r0: number, r1: number, mat: Mat = 'steel', sides = 5) =>
  m.tube(path, (s) => r0 + (r1 - r0) * s, mat, { sides });

/** A small lathed bulb (eye, sac, turret) centred at p. */
const bulb = (m: HullModel, p: V3, r: number, mat: Mat, sides = 10) =>
  m.lathe([[0, r], [r * 0.6, r * 0.8], [r, 0], [r * 0.6, -r * 0.8], [0, -r]], mat, { cx: p[0], cy: p[1], cz: p[2], sides });

/**
 * The rig a design builds into: pieces go to a chunk (so the ship can break apart), wings to their own
 * translucent layer, and the marks (weapon pods, running lights, vents, wing veins) are kept in model
 * space for the view to project. `sym` mirrors everything built inside it to port.
 */
type Part = HullModel['parts'][number];

/**
 * A part that flexes as the ship idles (art session 2026-10-12): a leg, a mandible, an antenna. It
 * turns about its root, a few degrees, on its own slow period: mechanical pieces reaching out.
 */
interface Flex { parts: Part[]; root: V3; amp: number; period: number; phase: number }

class Rig {
  readonly models: HullModel[];
  readonly wing = new HullModel();
  /** The parts that flex, and where each turns from. */
  readonly flex: Flex[] = [];
  readonly pods: Spot[] = [];
  readonly lights: Spot[] = [];
  readonly vents: Spot[] = [];
  readonly veins: [V3, V3][] = [];

  constructor(private readonly chunked: boolean, chunks: number) {
    this.models = Array.from({ length: chunked ? chunks : 1 }, () => new HullModel());
    for (const m of [...this.models, this.wing]) m.beacon([0, 0, 0]); // the origin: aligns separate bakes
  }

  at(chunk: number): HullModel {
    return this.models[this.chunked ? chunk : 0]!;
  }

  sym(build: () => void): void {
    const all = [...this.models, this.wing];
    const before = all.map((m) => m.parts.length);
    const marks = [this.pods, this.lights, this.vents] as const;
    const mb = marks.map((a) => a.length);
    const vb = this.veins.length;
    const fb = this.flex.length;
    build();
    const copyOf = new Map<Part, Part>();
    all.forEach((m, i) => {
      for (const p of m.parts.slice(before[i])) {
        const copy = { bias: p.bias, faces: p.faces.map((f) => ({ mat: f.mat, pts: f.pts.map(mirror), n: mirror(f.n) })) };
        copyOf.set(p, copy);
        m.parts.push(copy);
      }
    });
    // A flexing part's mirror flexes too, a little out of step with it.
    for (const g of this.flex.slice(fb)) {
      this.flex.push({ ...g, parts: g.parts.map((p) => copyOf.get(p)!), root: mirror(g.root), phase: g.phase + 1.9 });
    }
    marks.forEach((a, i) => { for (const s of a.slice(mb[i])) a.push({ p: mirror(s.p), n: mirror(s.n) }); });
    for (const [a, b] of this.veins.slice(vb)) this.veins.push([mirror(a), mirror(b)]);
  }

  /** Builds a flexing part into a chunk: it turns about `root` by up to `amp` radians over `period` s. */
  flexing(chunk: number, root: V3, amp: number, period: number, phase: number, build: (m: HullModel) => void): void {
    const m = this.at(chunk);
    const before = m.parts.length;
    build(m);
    this.flex.push({ parts: m.parts.slice(before), root, amp, period, phase });
  }

  pod(p: V3, n: V3): this { this.pods.push({ p, n: norm3(n) }); return this; }
  light(p: V3, n: V3): this { this.lights.push({ p, n: norm3(n) }); return this; }
  vent(p: V3, n: V3): this { this.vents.push({ p, n: norm3(n) }); return this; }

  /** A membrane wing with veins fanning from its root. */
  membrane(pts: V3[]): void {
    plate(this.wing, pts, 'glass');
    const root: V3 = [(pts[0]![0] + pts[1]![0]) / 2, (pts[0]![1] + pts[1]![1]) / 2, (pts[0]![2] + pts[1]![2]) / 2];
    for (const p of pts.slice(2)) this.veins.push([root, p]);
    for (let i = 1; i < pts.length; i++) this.veins.push([pts[i]!, pts[(i + 1) % pts.length]!]);
    for (let i = 2; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const lerp = (t: number): V3 => [root[0] + (a[0] - root[0]) * t, root[1] + (a[1] - root[1]) * t, root[2] + (a[2] - root[2]) * t];
      const lerpB = (t: number): V3 => [root[0] + (b[0] - root[0]) * t, root[1] + (b[1] - root[1]) * t, root[2] + (b[2] - root[2]) * t];
      this.veins.push([lerp(0.55), lerpB(0.6)]);
    }
  }
}

interface Swarm {
  key: string;
  name: string;
  nod: string;
  chunks: number;
  /** Which chunk becomes the wreck at the heart of the research facility. */
  wreck: number;
  /** Emerging from hyperspace: where the rift plane cuts the hull (model x), its centre height and radius. */
  rift: [number, number, number];
  build: (r: Rig) => void;
}

// ---- The three swarms ----

export const SWARMS: Swarm[] = [
  {
    key: 'reaver', name: 'Reaver', nod: 'arachnid lancer: splayed legs, mandible lances', chunks: 3, wreck: 0, rift: [-24, 6, 24],
    build: (r) => {
      // Art audit 2026-10-12: simplified. Fewer segments (a three-band abdomen, one-piece thorax), and the
      // legs cut to two short, stout pairs so the body and the mandible lances carry the read at 29 px.
      // Abdomen (chunk 1): a heavy ovoid with a short ridge of dorsal spines and a spine turret.
      const ab = r.at(1);
      ab.loft([S(-52, 0, 0, 6), S(-46, 9, 8, 6.5), S(-34, 16, 13, 7), S(-20, 14, 11.5, 5.5), S(-9, 6, 5, 3)],
        ['accent', 'hull', 'hull', 'accent'], { sides: 14 });
      for (const [x, h] of [[-40, 6], [-30, 7.5], [-20, 5.5]] as const) {
        const top = x < -30 ? 17.5 : 18.5 - (x + 30) * 0.35;
        ab.prism([[x + 3, top - 1.5], [x - 3, top - 1.5], [x - 4.5, top + h]], -0.9, 0.9, 'xy', 'dark');
      }
      ab.lathe([[0, 23], [2.2, 22.4], [3, 20.5], [3.6, 18]], ['glow', 'dark', 'dark'], { cx: -28, cy: 0, sides: 10 });
      r.pod([-28, 22.5, 0], [0, 1, 0]);
      // Waist and cephalothorax (chunks 2, 0): one armoured, tapering body.
      r.at(2).loft([S(-10, 5, 4, 3), S(-4, 5, 4, 2.5)], 'dark', { sides: 10 });
      r.at(2).loft([S(-5, 7, 5, 2.5), S(0, 12, 7, 3), S(10, 13, 7.5, 3)], ['accent', 'hull'], { sides: 12, sq: 3 });
      r.at(0).loft([S(10, 13, 7.5, 3), S(18, 11, 6.5, 2.5), S(24, 8, 5, 2), S(28, 5, 3.5, 1.5), S(31, 0, 0, 1)], ['hull', 'hull', 'accent', 'dark'], { sides: 12, sq: 3 });
      r.sym(() => {
        // An eye cluster: the menacing running lights.
        for (const [x, y, z, s] of [[27, 4.2, 1.8, 1.3], [25, 5.6, 3.6, 1.1], [22.5, 6.6, 5.2, 0.9]] as const) {
          bulb(r.at(0), [x, y, z], s, 'glass', 8);
          r.light([x + s * 0.5, y + s * 0.5, z + s * 0.4], [0.5, 0.6, 0.4]);
        }
        // Mandible lances, with a weapon pod swelling at each root.
        r.flexing(0, [27, 0, 5], 0.07, 5.2, 0, (m) => limb(m, [[25, 0, 4], [34, -1, 10.5], [45, -2, 13], [55, -2.5, 10.5], [62, -3, 4]], 3.6, 0.5, 'accent', 6));
        bulb(r.at(0), [31, 0, 8.5], 3.2, 'cargo', 10);
        r.pod([31.5, 1.2, 11], [0.35, 0.3, 1]);
        // Two stout pairs of legs, short and splayed: the spider stance without the clutter.
        ([[18, 12], [2, -8]] as const).forEach(([x0, dx], i) => {
          r.flexing(i ? 2 : 0, [x0, 2, 9], 0.06, 7.4, i * 2.6, (m) => limb(m, [[x0, 2, 9], [x0 + dx * 0.55, 11, 20], [x0 + dx, -6, 27]], 3, 1, 'steel', 5));
        });
        r.light([-34, 8.5, 15.5], [0, 0.2, 1]).light([-24, 8, 14.6], [0, 0.2, 1]);
        r.vent([-30, 15, 9], [0, 0.6, 0.8]);
        r.vent([14, 9, 7], [0.2, 0.7, 0.7]);
      });
    },
  },
  {
    key: 'brood', name: 'Brood', nod: 'brood carrier: plated carapace, brood sacs', chunks: 3, wreck: 0, rift: [-12, 3, 31],
    build: (r) => {
      // A domed carapace with a flat belly: overlapping armour plates, front (0), mid (1), rear (2).
      const dome: [number, number][] = Array.from({ length: 16 }, (_, k) => {
        const t = (2 * Math.PI * k) / 16;
        return [Math.cos(t), Math.sin(t) > 0 ? Math.sin(t) : Math.sin(t) * 0.35];
      });
      const secs = [S(50, 0, 0), S(46, 7, 4), S(38, 15, 9), S(26, 22, 13), S(12, 25, 15), S(-4, 26, 15.5), S(-20, 24, 14), S(-34, 19, 11), S(-44, 12, 7), S(-50, 4, 3), S(-52, 0, 0)];
      const chunkOf = (x: number) => (x > 26 ? 0 : x > -20 ? 1 : 2);
      for (let i = 0; i + 1 < secs.length; i++) {
        r.at(chunkOf((secs[i]!.x + secs[i + 1]!.x) / 2)).loft([secs[i]!, secs[i + 1]!], i === 0 ? 'accent' : 'hull', { shape: dome });
      }
      // Plate lips: a dark overlapping rim at each seam.
      for (const s of secs.slice(2, 9)) {
        r.at(chunkOf(s.x - 1)).loft([S(s.x + 0.8, s.w * 1.04, s.h * 1.05), S(s.x - 2.6, s.w * 1.06, s.h * 1.08)], 'accent', { shape: dome });
      }
      // Head under the brow: horns and a row of eyes.
      r.at(0).loft([S(53, 0, 0, -2.5), S(51, 5, 3, -2.5), S(44, 7, 4, -2), S(40, 6, 3.5, -1.5)], 'dark', { sides: 10 });
      // Brood sacs along the spine: the weapon pods (spore launchers), glowing within.
      for (const [x, top, c] of [[31, 11, 0], [4, 15.5, 1], [-24, 13, 2]] as const) {
        const m = r.at(c);
        m.lathe([[0, 6.4], [3.4, 5.6], [5.6, 3.4], [6.4, 0.6], [5.8, -1.4]], ['ember', 'cargo', 'cargo', 'cargo'], { cx: x, cy: top, cz: 0, sides: 14 });
        m.torus([x, top - 0.6, 0], 6, 1.1, 'xz', 'dark', { segments: 10 });
        r.pod([x, top + 6.2, 0], [0, 1, 0]);
      }
      r.sym(() => {
        r.flexing(0, [48, -3, 3], 0.08, 5.4, 0.3, (m) => limb(m, [[48, -3, 3], [54, -5, 7], [59, -5, 4]], 1.3, 0.2, 'accent', 5));
        // A horned brow, and thorns along each plate seam: armour that bites back.
        limb(r.at(0), [[42, 5, 5], [51, 8, 9], [60, 6, 7]], 2.4, 0.2, 'accent', 6);
        for (const s of secs.slice(3, 9)) {
          const [w, h] = [s.w * 1.06, s.h * 1.08];
          limb(r.at(chunkOf(s.x - 1)), [[s.x - 1, h * 0.86, w * 0.4], [s.x - 4.5, h * 0.86 + 6, w * 0.55]], 1.6, 0.1, 'dark', 5);
          limb(r.at(chunkOf(s.x - 1)), [[s.x - 1, h * 0.35, w * 0.86], [s.x - 4, h * 0.35 + 2.5, w * 0.86 + 5]], 1.4, 0.1, 'dark', 5);
        }
        r.light([51.5, -1.4, 2.4], [1, 0.3, 0.3]).light([50, -0.6, 4.4], [0.8, 0.3, 0.6]);
        // Egg pods slung along the flanks, each with a glow.
        for (const [x, z] of [[16, 24], [-4, 25.2], [-22, 23]] as const) {
          r.at(chunkOf(x)).loft([S(x + 6, 0, 0, -1, z), S(x + 4.5, 3.6, 3.2, -1.5, z), S(x, 4.2, 3.8, -2.5, z), S(x - 5, 2.6, 2.4, -4, z - 1), S(x - 9, 0, 0, -5.5, z - 2)], ['ember', 'cargo', 'dark', 'dark'], { sides: 10 });
          r.light([x + 1, -1.2, z + 4.3], [0, 0.1, 1]);
        }
        // Short hooked legs beneath.
        [26, 9, -9, -27].forEach((x, i) => {
          r.flexing(chunkOf(x), [x, -4, 13], 0.07, 7.8, i * 1.4, (m) => limb(m, [[x, -4, 13], [x + 2, -9, 21], [x - 2, -14, 24], [x - 5, -15, 21]], 1.5, 0.3, 'dark', 5));
        });
        r.vent([18, 14, 6], [0.1, 1, 0.3]).vent([-12, 13.8, 9], [0, 1, 0.5]);
      });
      // Tail barbs.
      r.at(2).prism([[-44, 5], [-58, 10], [-50, 2]], -0.8, 0.8, 'xy', 'dark');
    },
  },
  {
    key: 'stinger', name: 'Stinger', nod: 'wasp interceptor: membrane wings, banded sting', chunks: 2, wreck: 0, rift: [-14, -2, 19],
    build: (r) => {
      const h = r.at(0);
      // Head with compound eyes, antennae and mandibles.
      h.loft([S(53, 0, 0, 2), S(51, 3, 3, 2), S(47, 6, 5.5, 2.5), S(41, 6.5, 6, 2.5), S(37, 4, 4, 2)], ['dark', 'hull', 'hull', 'accent'], { sides: 12 });
      // Thorax, armoured, with a dorsal plate.
      h.loft([S(37, 4, 4, 2), S(33, 8, 7, 3), S(24, 9, 8, 3), S(16, 6, 5.5, 2), S(13, 3, 3, 1)], ['accent', 'hull', 'hull', 'accent'], { sides: 12 });
      h.loft([S(33, 5, 1, 9.6), S(24, 6, 1.2, 10.6), S(17, 3, 0.8, 7.6)], 'accent', { sides: 8, sq: 4 });
      h.loft([S(13, 2.4, 2.4, 1), S(7, 2, 2, 0)], 'dark', { sides: 8 });
      // Abdomen (chunk 1): long, banded like a wasp's (art audit 2026-10-12: two bands, thicker), curving to the sting.
      r.at(1).loft([S(7, 3, 3, 0), S(2, 7.5, 7, -0.5), S(-10, 11, 10, -2), S(-24, 9.5, 8.5, -4), S(-36, 5, 4.5, -7), S(-46, 1.5, 1.5, -10)],
        ['hull', 'accent', 'hull', 'accent', 'dark'], { sides: 14 });
      limb(r.at(1), [[-45, -9.5, 0], [-52, -12.5, 0]], 2, 0.2, 'dark', 6);
      bulb(r.at(1), [-47, -10.5, 0], 2.5, 'cargo', 8);
      r.pod([-48, -10, 0], [-0.6, -0.5, 0.2]);
      r.sym(() => {
        r.at(0).loft([S(49, 0, 0, 3.5, 3.8), S(47.5, 2.6, 3.4, 3.5, 5.2), S(42.5, 2.8, 3.8, 3.5, 5.6), S(40.5, 0, 0, 3.5, 5)], 'glass', { sides: 10 });
        r.light([46, 4.2, 8.2], [0.4, 0.3, 1]).light([44, 6, 7.4], [0.2, 0.7, 0.8]);
        r.flexing(0, [48, 6.5, 1.5], 0.12, 4.6, 0.4, (m) => limb(m, [[48, 6.5, 1.5], [52, 13, 4], [58, 15, 6.5]], 0.9, 0.3, 'dark', 4));
        r.flexing(0, [51, -1, 1.6], 0.09, 5.8, 1.1, (m) => limb(m, [[51, -1, 1.6], [55, -3, 2.6], [56.5, -4, 0.6]], 1.4, 0.3, 'accent', 4));
        // Wing-root guns: the forward weapon pods.
        limb(r.at(0), [[28, 0, 8], [39, -0.5, 9.5]], 1.5, 1.1, 'dark', 6);
        bulb(r.at(0), [29, 0, 8.4], 2.4, 'cargo', 8);
        r.pod([39.5, -0.5, 9.6], [1, 0, 0.35]);
        // Two short pairs of legs, tucked under like a wasp's in flight.
        ([[30, 4], [20, -5]] as const).forEach(([x, dx], i) => {
          r.flexing(0, [x, -3, 4], 0.07, 6.6, 0.8 + i * 2.2, (m) => limb(m, [[x, -3, 4], [x + dx * 0.5, -10, 9], [x + dx, -15, 7]], 1.8, 0.6, 'steel', 4));
        });
        // One broad membrane wing, raised in a shallow V.
        r.membrane([[30, 9.5, 3], [22, 9.5, 3], [-22, 11.5, 22], [-14, 12.5, 32], [10, 11.5, 29]]);
        r.light([-10, -1, 10.2], [0, 0.1, 1]).light([-24, -3.5, 8.2], [0, 0.1, 1]);
        r.vent([24, 11, 4], [0, 1, 0.3]).vent([-14, 6, 7], [0, 0.7, 0.7]);
      });
    },
  },
];

export interface HiveDesign { style: number; colourway: number }

/** A threat's look from its stable seed (13 §4): the seed picks the swarm and colourway only. */
export function hiveDesign(seed: number): HiveDesign {
  const s = seed >>> 0;
  return { style: s % SWARMS.length, colourway: Math.floor(s / SWARMS.length) % HOSTILE.length };
}

// ---- The looks ----

export type ThreatLook = 'sketch' | 'emerging' | 'retreat' | 'ready' | 'underway' | 'nearing' | 'breakup' | 'ruin' | 'platform' | 'facility' | 'warp' | 'ghost' | 'rejected';

/** Every look in order up the ladder, with its rung and the SDLC states it portrays (13 §4.3). */
export const THREAT_LOOKS: { key: ThreatLook; label: string; rung: Rung; sdlc: string; note: string }[] = [
  { key: 'sketch', label: 'sensor contact', rung: 'ready', sdlc: 'Bug · New', note: 'Radar wireframe sensor contact, already in its red outline' },
  { key: 'emerging', label: 'emerging', rung: 'ready', sdlc: 'Bug · Ready (arrival)', note: 'Tearing out of hyperspace' },
  { key: 'ready', label: 'dormant', rung: 'ready', sdlc: 'Bug · Ready, Ready for Review', note: 'Solid and dormant, in its deadly red aura, running lights breathing' },
  { key: 'underway', label: 'engaged', rung: 'underway', sdlc: 'Bug · Active', note: 'Bristling with fire, absorbed by shields; the same red aura' },
  { key: 'nearing', label: 'heavily engaged', rung: 'nearing', sdlc: 'Bug · Resolved, Ready to Accept', note: 'Venting sparks, cracked plates, frantic fire; the same red aura' },
  { key: 'breakup', label: 'strike run', rung: 'accomplished', sdlc: 'Bug · Closed (the moment)', note: 'Breaking apart into debris' },
  { key: 'retreat', label: 'retreating', rung: 'ready', sdlc: 'Bug · moved out of the sprint (the moment)', note: 'Backing into a closing rift, about a second' },
  { key: 'ruin', label: 'ruin cloud', rung: 'accomplished', sdlc: 'Bug · Closed (where it was)', note: 'Drifting debris, glints of gold' },
  { key: 'platform', label: 'research platform', rung: 'accomplished', sdlc: 'Bug · Closed (in orbit)', note: 'Orbital emblem: an asterisk (22 A12): the hulk caged in titanium, gold windows, sharp wreckage spikes all round, a victory-gold outline round the spikes' },
  /** @deprecated Replaced by `platform`; the chart no longer uses it and the gallery hides it. */
  { key: 'facility', label: 'research facility', rung: 'accomplished', sdlc: 'Bug · Closed (on the planet)', note: 'Deprecated: a gold-lit outpost built around the wreck' },
  { key: 'warp', label: 'warping out', rung: 'off', sdlc: 'Bug · Removed (the moment)', note: 'Retreating into hyperspace' },
  { key: 'ghost', label: 'ghost', rung: 'off', sdlc: 'Bug · Removed', note: 'Faded, dashed' },
  { key: 'rejected', label: 'rejected', rung: 'off', sdlc: 'Bug · Rejected', note: 'Faded, dashed, struck' },
];
const LOOK = new Map(THREAT_LOOKS.map((l) => [l.key, l]));

/** Step states, one letter per Task: n = New (marked), a = Active (under fire), c = Closed (disabled). */
export type StepState = 'n' | 'a' | 'c';
const DEFAULT_STEPS: Partial<Record<ThreatLook, string>> = { sketch: 'nnn', emerging: 'nnn', ready: 'nnn', underway: 'aan', nearing: 'cca' };

/** `threat.<swarm>.<look>`, optionally `|<steps>` (e.g. `threat.stinger.underway|anc`). */
export function parseThreatStage(stage: string): { look: ThreatLook; steps: StepState[] } {
  const [name, steps] = stage.split('|');
  const key = (name ?? '').split('.').pop() as ThreatLook;
  const look = LOOK.has(key) ? key : 'ghost';
  const s = steps ?? DEFAULT_STEPS[look] ?? '';
  return { look, steps: [...s].filter((c): c is StepState => c === 'n' || c === 'a' || c === 'c') };
}

// ---- Projection (the same fixed three-quarter view as hull3d) ----

const YAW = (32 * Math.PI) / 180;
const PITCH = (27 * Math.PI) / 180;
const EYE = 320;

function viewOf(dir: number): (p: V3) => V3 {
  const a = dir > 0 ? YAW : Math.PI - YAW;
  const [ca, sa, cp, sp] = [Math.cos(a), Math.sin(a), Math.cos(PITCH), Math.sin(PITCH)];
  return (p) => {
    const x = p[0] * ca - p[2] * sa;
    const z1 = p[0] * sa + p[2] * ca;
    return [x, p[1] * cp - z1 * sp, z1 * cp + p[1] * sp];
  };
}
const proj = (v: V3): [number, number] => {
  const s = EYE / (EYE - v[2]);
  return [v[0] * s, -v[1] * s];
};

type P2 = [number, number];

/** Screen placement shared by every bake of one design at one heading. */
interface Frame { k: number; cx: number; cy: number; view: (p: V3) => V3 }

const toScreen = (f: Frame, p: V3): P2 => {
  const [x, y] = proj(f.view(p));
  return [(x - f.cx) * f.k, (y - f.cy) * f.k];
};
const facing = (f: Frame, s: Spot, min = 0.12): boolean => {
  const v = f.view(s.p);
  const n = f.view(s.n);
  const e = norm3(sub3([0, 0, EYE], v));
  return n[0] * e[0] + n[1] * e[1] + n[2] * e[2] > min;
};

function bounds(models: HullModel[], view: (p: V3) => V3): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const m of models) for (const p of m.parts) for (const fc of p.faces) for (const q of fc.pts) {
    const [x, y] = proj(view(q));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** A bake placed in a frame: its Graphics offset so model points land where toScreen puts them. */
interface Bake { ctx: GraphicsContext; dx: number; dy: number }
function bake(model: HullModel, pal: Palette, dir: number, f: Frame): Bake {
  const r: HullRender = renderHull(model, pal, dir, { width: 1, height: 1, k: f.k });
  const [ax, ay] = r.beacons[0]!;
  return { ctx: r.context, dx: -ax - f.cx * f.k, dy: -ay - f.cy * f.k };
}

// ---- Per-design layout and bakes (cached; bounded by swarms × colourways × variants × 2) ----

/** A smooth step from a to b. */
const ease = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A rift transit's length, in seconds: a menacing moment, about a second (2026-10-13). */
const TRANSIT_S = 1;

/** Model x past which a running light is an eye (Reaver, Brood, Stinger). */
const EYE_X = [20, 40, 40];

/** Ship length on screen, about a captain ship's (INV-19: one footprint for every swarm). */
const DEFAULT_LENGTH = 132;

interface Layout {
  frame: Frame;
  pods: { p: P2; d: P2 }[];
  lights: P2[];
  /** The running lights at the head: its eyes, which watch (2026-10-12). */
  eyes: P2[];
  vents: { p: P2; d: P2 }[];
  veins: [P2, P2][];
  chunks: { c: P2 }[];
  /** Half extents of the ship on screen. */
  hw: number; hh: number;
  /** The bow's direction on screen (unit). */
  heading: P2;
  wire: GraphicsContext;
}

interface Built { full: Rig; parts: Rig }
const builtCache = new Map<number, Built>();
function built(style: number): Built {
  let b = builtCache.get(style);
  if (!b) {
    const sw = SWARMS[style]!;
    const full = new Rig(false, sw.chunks);
    sw.build(full);
    const parts = new Rig(true, sw.chunks);
    sw.build(parts);
    b = { full, parts };
    builtCache.set(style, b);
  }
  return b;
}

const unit = (x: number, y: number): P2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

const layoutCache = new Map<string, Layout>();
function layoutOf(style: number, dir: number, length: number): Layout {
  const key = `${style}:${dir}:${length}`;
  let l = layoutCache.get(key);
  if (l) return l;
  const { full, parts } = built(style);
  const view = viewOf(dir);
  // One scale for both headings (from the east view), so east and west are the same size.
  const [ex0, , ex1] = bounds([full.models[0]!, full.wing], viewOf(1));
  const k = length / (ex1 - ex0);
  const [x0, y0, x1, y1] = bounds([full.models[0]!, full.wing], view);
  const frame: Frame = { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, view };
  const at = (p: V3) => toScreen(frame, p);
  const centre = at([0, 0, 0]);
  const dirOf = (s: Spot): P2 => {
    const [a, b] = [at(s.p), at([s.p[0] + s.n[0] * 10, s.p[1] + s.n[1] * 10, s.p[2] + s.n[2] * 10])];
    // Outward from the body, leaning along the surface normal.
    const out = unit(a[0] - centre[0], a[1] - centre[1]);
    const nn = unit(b[0] - a[0], b[1] - a[1]);
    return unit(out[0] + nn[0] * 1.4, out[1] + nn[1] * 1.4);
  };
  const bow = at([50, 0, 0]);
  const stern = at([-50, 0, 0]);
  // A radar wireframe of every face turned toward the viewer: the sensor contact (New).
  const wire = new GraphicsContext();
  for (const m of [full.models[0]!, full.wing]) for (const p of m.parts) for (const fc of p.faces) {
    if (!facing(frame, { p: fc.pts.reduce((s, q) => [s[0] + q[0] / fc.pts.length, s[1] + q[1] / fc.pts.length, s[2] + q[2] / fc.pts.length], [0, 0, 0] as V3), n: fc.n }, 0)) continue;
    wire.poly(fc.pts.flatMap(at));
  }
  wire.stroke({ width: 0.7, color: READY, alpha: 0.5, join: 'round' });
  const chunkCentre = (m: HullModel): P2 => {
    let [sx, sy, n] = [0, 0, 0];
    for (const p of m.parts) for (const fc of p.faces) for (const q of fc.pts) {
      const [x, y] = at(q);
      sx += x; sy += y; n++;
    }
    return [sx / Math.max(1, n), sy / Math.max(1, n)];
  };
  l = {
    frame,
    pods: full.pods.map((s) => ({ p: at(s.p), d: dirOf(s) })),
    lights: full.lights.filter((s) => facing(frame, s)).map((s) => at(s.p)),
    eyes: full.lights.filter((s) => facing(frame, s) && s.p[0] > EYE_X[style]!).map((s) => at(s.p)),
    vents: full.vents.filter((s) => facing(frame, s, 0)).map((s) => ({ p: at(s.p), d: dirOf(s) })),
    veins: full.veins.map(([a, b]) => [at(a), at(b)]),
    chunks: [...parts.models, parts.wing].map((m) => ({ c: chunkCentre(m) })),
    hw: ((x1 - x0) * k) / 2,
    hh: ((y1 - y0) * k) / 2,
    heading: unit(bow[0] - stern[0], bow[1] - stern[1]),
    wire,
  };
  layoutCache.set(key, l);
  return l;
}

/** A flexing part, baked on its own: where it turns from on screen, and whether it's on the near side. */
interface LimbBake { b: Bake; root: P2; front: boolean; amp: number; period: number; phase: number }
interface Bakes { body: Bake; wing: Bake | null; chunks: Bake[]; limbs: LimbBake[] }

/** A model of some of another's parts, with the origin beacon every bake aligns on. */
function modelOf(parts: readonly Part[]): HullModel {
  const m = new HullModel();
  m.beacon([0, 0, 0]);
  m.parts.push(...parts);
  return m;
}
const bakeCache = new Map<string, Bakes>();
/** Only the faces forward of a plane at model x: the part of a hull already through the rift. */
function clipped(src: HullModel, x: number): HullModel {
  const m = new HullModel();
  m.beacon([0, 0, 0]);
  for (const p of src.parts) {
    const faces = p.faces.filter((f) => f.pts.reduce((s, q) => s + q[0], 0) / f.pts.length > x);
    if (faces.length) m.parts.push({ bias: p.bias, faces });
  }
  return m;
}

type BakeMode = 'whole' | 'chunks' | 'emerge';
function bakesOf(style: number, cw: number, variant: Variant, dir: number, length: number, mode: BakeMode = 'whole'): Bakes {
  const key = `${style}:${cw}:${variant}:${dir}:${length}:${mode}`;
  let b = bakeCache.get(key);
  if (!b) {
    const { full, parts } = built(style);
    const f = layoutOf(style, dir, length).frame;
    const pal = paletteOf(cw, variant);
    const cut = SWARMS[style]!.rift[0];
    // A whole live ship bakes its flexing parts on their own, so they can move; the rest is one bake.
    const flexing = mode === 'whole' ? full.flex : [];
    const loose = new Set(flexing.flatMap((g) => g.parts));
    const body = mode === 'emerge' ? clipped(full.models[0]!, cut) : loose.size ? modelOf(full.models[0]!.parts.filter((p) => !loose.has(p))) : full.models[0]!;
    const wing = mode === 'emerge' ? clipped(full.wing, cut) : full.wing;
    const withChunks = mode === 'chunks';
    const near = f.view([0, 0, 0])[2];
    b = {
      body: bake(body, pal, dir, f),
      wing: wing.parts.length ? bake(wing, pal, dir, f) : null,
      chunks: withChunks ? [...parts.models, ...(parts.wing.parts.length ? [parts.wing] : [])].map((m) => bake(m, pal, dir, f)) : [],
      limbs: flexing.map((g) => ({ b: bake(modelOf(g.parts), pal, dir, f), root: toScreen(f, g.root), front: f.view(g.root)[2] > near, amp: g.amp, period: g.period, phase: g.phase })),
    };
    bakeCache.set(key, b);
  }
  return b;
}

/** A swarm's whole-hull bake contexts at a heading (body, then wings), for the silhouette metrics (scripts/ship-metrics.ts). */
export function hiveContexts(style: number, dir: number, length = DEFAULT_LENGTH): GraphicsContext[] {
  const b = bakesOf(style, 0, 'live', dir, length);
  return [b.body.ctx, ...(b.wing ? [b.wing.ctx] : [])];
}

// ---- DEPRECATED: the research facility (on the planet). Replaced by the orbital platform below; the chart stops using it. ----

const OUTPOST: Omit<Palette, 'hull' | 'accent'> = { cargo: 0xe4dfcf, steel: 0xa79f92, dark: 0x100c0c, glass: 0x3f3628, glow: SUCCESS, ember: 0xffd79a };

interface Facility { model: HullModel; lights: Spot[] }
const facilityModels = new Map<number, Facility>();
function facilityModel(style: number): Facility {
  let fm = facilityModels.get(style);
  if (fm) return fm;
  const sw = SWARMS[style]!;
  const { parts } = built(style);
  const wreck = parts.models[sw.wreck]!;
  const m = new HullModel();
  m.beacon([0, 0, 0]);
  const lights: Spot[] = [];
  // The site: a patch of the planet's curved dark rock, a crater rim, the wreck nose-down in it.
  m.lathe([[0, 0.4], [10, 0.3], [20, -0.4], [27, -1.6], [31, -3.4], [0, -4]], 'dark', { sides: 28, bias: -200 });
  m.torus([-2, 0.6, 0], 13, 1.4, 'xz', 'accent', { segments: 14, sides: 5 });
  // The wreck: its chunk recentred, tipped nose-down, sunk into the crater, its lights burnt out.
  let [cx, cy, cz, n] = [0, 0, 0, 0];
  for (const p of wreck.parts) for (const fc of p.faces) for (const q of fc.pts) { cx += q[0]; cy += q[1]; cz += q[2]; n++; }
  [cx, cy, cz] = [cx / n, cy / n, cz / n];
  const tilt = (-20 * Math.PI) / 180;
  const yaw = (30 * Math.PI) / 180;
  const s = 0.95;
  const rot = (q: V3): V3 => {
    const x1 = q[0] * Math.cos(tilt) - q[1] * Math.sin(tilt);
    const y1 = q[0] * Math.sin(tilt) + q[1] * Math.cos(tilt);
    return [x1 * Math.cos(yaw) - q[2] * Math.sin(yaw), y1, x1 * Math.sin(yaw) + q[2] * Math.cos(yaw)];
  };
  const remat: Partial<Record<Mat, Mat>> = { glow: 'accent', cargo: 'accent', glass: 'accent', ember: 'accent', steel: 'accent', dark: 'accent' };
  for (const p of wreck.parts) {
    m.parts.push({
      bias: p.bias,
      faces: p.faces.map((fc) => ({
        mat: remat[fc.mat] ?? fc.mat,
        n: rot(fc.n),
        pts: fc.pts.map((q) => {
          const r = rot([(q[0] - cx) * s, (q[1] - cy) * s, (q[2] - cz) * s]);
          return [r[0] - 2, Math.max(0.3, r[1] + 8), r[2]] as V3;
        }),
      })),
    });
  }
  // Rubble around the impact.
  for (const [x, z, r] of [[14, 9, 2.2], [-12, 13, 1.6], [16, -6, 1.8], [-6, -14, 1.4]] as const) bulb(m, [x, 0.6, z], r, 'accent', 6);
  // The outpost, built around it: scaffold arches over the wreck, labs, domes, a dish.
  for (const x of [-10, 6]) {
    m.tube(Array.from({ length: 9 }, (_, i): V3 => {
      const t = (Math.PI * i) / 8;
      return [x, Math.sin(t) * 19, Math.cos(t) * 18];
    }), 0.5, 'steel', { sides: 4 });
  }
  m.tube([[-10, 19, 0], [6, 19, 0]], 0.5, 'steel', { sides: 4 });
  // Survey lamps on the gantry, trained on the wreck.
  for (const x of [-10, 6]) lights.push({ p: [x, 19.6, 0], n: [0, 1, 0.3] });
  const dome = (x: number, z: number, r: number) => {
    m.lathe([[0, r], [r * 0.5, r * 0.88], [r * 0.85, r * 0.5], [r, 0.4], [r, 0]], ['cargo', 'cargo', 'cargo', 'glow'], { cx: x, cy: 0, cz: z, sides: 16 });
    for (let i = 0; i < 5; i++) {
      const t = (2 * Math.PI * i) / 5 + 0.3;
      lights.push({ p: [x + Math.cos(t) * r * 0.9, r * 0.32, z + Math.sin(t) * r * 0.9], n: [Math.cos(t), 0.3, Math.sin(t)] });
    }
  };
  dome(-20, 12, 6.5);
  dome(-4, 22, 4.6);
  m.box(8, 22, 0, 4.6, 12, 19, 'cargo');
  m.box(9, 21, 4.6, 5.6, 13, 18, 'steel');
  m.box(8.6, 21.4, 2, 3, 18.95, 19.15, 'glow');
  m.box(8.6, 21.4, 2, 3, 11.85, 12.05, 'glow');
  for (let x = 10; x <= 20; x += 2.5) lights.push({ p: [x, 2.8, 19.05], n: [0, 0, 1] });
  m.tube([[-14, 1.6, 15], [-7, 1.6, 20]], 1.1, 'steel', { sides: 6 });
  m.tube([[-1, 1.6, 21], [8, 1.6, 16]], 1.1, 'steel', { sides: 6 });
  // The dish mast, turned to the sky, with a gold beacon.
  m.tube([[22, 0, -8], [22, 20, -8]], 0.8, 'steel', { sides: 5 });
  m.lathe([[0, 20], [3.5, 21.2], [5.6, 23]], 'cargo', { cx: 22, cz: -8, sides: 14 });
  lights.push({ p: [22, 23.8, -8], n: [0, 1, 0.4] });
  // A landing pad ringed in gold.
  m.lathe([[0, 0.6], [7, 0.6], [7.4, 0.2]], ['steel', 'glow'], { cx: -18, cz: -10, sides: 18 });
  fm = { model: m, lights };
  facilityModels.set(style, fm);
  return fm;
}

const facilityCache = new Map<string, { bake: Bake; lights: P2[]; frame: Frame }>();
function facilityBake(style: number, cw: number, dir: number, length: number) {
  const key = `${style}:${cw}:${dir}:${length}`;
  let b = facilityCache.get(key);
  if (!b) {
    const { model, lights } = facilityModel(style);
    const view = viewOf(dir);
    const [ex0, , ex1] = bounds([model], viewOf(1));
    const [x0, y0, x1, y1] = bounds([model], view);
    const frame: Frame = { k: length / (ex1 - ex0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, view };
    const charred = paletteOf(cw, 'charred');
    b = { bake: bake(model, { ...OUTPOST, hull: charred.hull, accent: charred.accent }, dir, frame), lights: lights.filter((s) => facing(frame, s)).map((s) => toScreen(frame, s.p)), frame };
    facilityCache.set(key, b);
  }
  return b;
}


// ---- The orbital research platform (Accomplished; lingers in low orbit on the lit edge) ----
// The defeated hulk, gutted to a recognisable fragment of its swarm (Reaver: legs and mandible stubs;
// Brood: carapace plates; Stinger: torn wing membranes), tamed in muted cool hull tones, then caged in
// the shared scaffold: a brushed-titanium truss ring, a cage hoop, spokes, nodes, small blue-grey
// solar vanes, warm windows and gold rivets. The asteroid emblem uses the same vocabulary.

const HULK_R = 31;
const RING_R = 37;
/** Which chunks of the dismantled ship survive, where the hulk was cut, and how far its limbs may reach past the cage. */
const PLATFORM_KEEP: { keep: number[]; cutX: number; boost: number }[] = [
  { keep: [0, 2], cutX: -10, boost: 1.9 },
  { keep: [0, 1], cutX: -20, boost: 1 },
  { keep: [0], cutX: 7, boost: 1 },
];

function platformPalette(cw: number, membrane = false): Palette {
  const c = HOSTILE[cw]!;
  return {
    hull: mix(c.hull, 0x5b6573, 0.4), accent: mix(c.accent, 0x2c323d, 0.6), dark: 0x1b1f27,
    steel: 0x8b95a3, cargo: 0xb3bbc6, glass: membrane ? mix(c.hull, 0x7d8795, 0.5) : 0x14284a,
    glow: SUCCESS, ember: lighten(SUCCESS, 0.45),
  };
}

interface Platform { body: HullModel; wing: HullModel; windows: Spot[]; rivets: Spot[]; glints: Spot[] }
const platformModels = new Map<number, Platform>();
function platformModel(style: number): Platform {
  let pm = platformModels.get(style);
  if (pm) return pm;
  const { parts, full } = built(style);
  const cfg = PLATFORM_KEEP[style]!;
  const srcBody = cfg.keep.map((i) => parts.models[i]!);
  const srcWing = parts.wing;
  const body = new HullModel();
  const wing = new HullModel();
  body.beacon([0, 0, 0]);
  wing.beacon([0, 0, 0]);
  const all: V3[] = [];
  for (const m of [...srcBody, srcWing]) for (const p of m.parts) for (const fc of p.faces) all.push(...fc.pts);
  const [lo, hi]: [V3, V3] = [[0, 1, 2].map((k) => Math.min(...all.map((q) => q[k]!))) as V3, [0, 1, 2].map((k) => Math.max(...all.map((q) => q[k]!))) as V3];
  const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const maxR = Math.max(...all.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])));
  const s = (HULK_R * cfg.boost) / maxR;
  const tf = (q: V3): V3 => [(q[0] - c[0]) * s, (q[1] - c[1]) * s, (q[2] - c[2]) * s];
  // Dead hulk: eyes, sacs and glow vents gone dark; legs and limbs taken to dull plate.
  const remat: Partial<Record<Mat, Mat>> = { glow: 'dark', ember: 'dark', cargo: 'hull', glass: 'dark', steel: 'accent' };
  for (const p of srcBody.flatMap((m) => m.parts)) {
    body.parts.push({ bias: p.bias, faces: p.faces.map((fc) => ({ mat: remat[fc.mat] ?? fc.mat, n: fc.n, pts: fc.pts.map(tf) })) });
  }
  for (const p of srcWing.parts) wing.parts.push({ bias: p.bias, faces: p.faces.map((fc) => ({ mat: fc.mat, n: fc.n, pts: fc.pts.map(tf) })) });
  // The hulk's old eyes and running lights become warm windows.
  const windows: Spot[] = full.lights.filter((l) => l.p[0] > cfg.cutX).map((l) => ({ p: tf(l.p), n: l.n }));
  const rivets: Spot[] = [];
  const glints: Spot[] = [];
  const R = RING_R;
  const ang = (i: number, n: number, off = 0) => ((i + off) * 2 * Math.PI) / n;
  // The truss ring: two rings joined by a zig-zag of struts.
  for (const y of [3, -3]) body.torus([0, y, 0], R, 1.1, 'xz', 'steel', { segments: 20, sides: 5 });
  const ZZ = 24;
  for (let i = 0; i < ZZ; i++) {
    const [a, b] = [ang(i, ZZ), ang(i + 1, ZZ)];
    const up = i % 2 === 0;
    body.tube([[Math.cos(a) * R, up ? 3 : -3, Math.sin(a) * R], [Math.cos(b) * R, up ? -3 : 3, Math.sin(b) * R]], 0.45, 'steel', { sides: 4 });
  }
  // The cage hoop over the hulk, and spokes from the ring into its plates.
  body.torus([0, 0, 0], R * 0.9, 0.95, 'yz', 'steel', { segments: 16, sides: 5 });
  for (let i = 0; i < 8; i++) {
    const a = ang(i, 8, 0.5);
    body.tube([[Math.cos(a) * R, 0, Math.sin(a) * R], [Math.cos(a) * HULK_R * 0.45, (i % 2 ? 1 : -1) * 3, Math.sin(a) * HULK_R * 0.45]], 0.7, 'steel', { sides: 4 });
  }
  // Nodes where the struts meet, each with a gold rivet; three are lit service modules.
  for (let i = 0; i < 8; i++) {
    const a = ang(i, 8);
    const [px, pz] = [Math.cos(a) * R, Math.sin(a) * R];
    const mod = i % 3 === 1;
    const w = mod ? 2.6 : 1.9;
    body.box(px - w, px + w, mod ? -5.2 : -4.4, mod ? 5.2 : 4.4, pz - w, pz + w, mod ? 'cargo' : 'steel');
    const out: V3 = [Math.cos(a), 0.15, Math.sin(a)];
    rivets.push({ p: [px + out[0] * (w + 0.2), 3, pz + out[2] * (w + 0.2)], n: out });
    rivets.push({ p: [px + out[0] * (w + 0.2), -3, pz + out[2] * (w + 0.2)], n: out });
    if (mod) windows.push({ p: [px + out[0] * (w + 0.3), 0, pz + out[2] * (w + 0.3)], n: out });
  }
  // Solar vanes: blue-grey panels on short arms at the ring's flanks, tilted up toward the star.
  for (const sg of [1, -1]) {
    body.tube([[0, 0, sg * R], [0, 0.5, sg * (R + 4)]], 0.7, 'steel', { sides: 4 });
    for (const [x0, x1] of [[-11, -1.2], [1.2, 11]] as const) {
      const [zA, zB, yB] = [sg * (R + 4), sg * (R + 15), 6.5];
      plate(body, sg > 0 ? [[x0, 0.5, zA], [x1, 0.5, zA], [x1, yB, zB], [x0, yB, zB]] : [[x1, 0.5, zA], [x0, 0.5, zA], [x0, yB, zB], [x1, yB, zB]], 'glass');
      body.tube([[x0, yB, zB], [x1, yB, zB]], 0.35, 'steel', { sides: 4 });
      body.tube([[(x0 + x1) / 2, 0.5, zA], [(x0 + x1) / 2, yB, zB]], 0.25, 'steel', { sides: 4 });
      glints.push({ p: [(x0 + x1) / 2, yB + 0.4, zB], n: [0, 1, sg * 0.4] });
    }
  }
  pm = { body, wing, windows, rivets, glints };
  platformModels.set(style, pm);
  return pm;
}

/**
 * A defeated hive's wreckage spikes (22 A12): `SPIKES` sharp blades round the hulk, alternately long and
 * short, out to `SPIKE_REACH` of its radius, dark steel edged in victory gold. Seeded per design, so a
 * ship keeps its own. Cached by radius and seed: they're shared like the bakes.
 */
export const SPIKES = 8;
export const SPIKE_REACH = 1.55;
const asterisks = new Map<string, GraphicsContext>();
function asteriskOf(r: number, seed: number): GraphicsContext {
  const key = `${r.toFixed(2)}|${seed}`;
  let ctx = asterisks.get(key);
  if (ctx) return ctx;
  ctx = new GraphicsContext();
  const turn = ((seed % 97) / 97) * (Math.PI / SPIKES);
  for (let i = 0; i < SPIKES; i++) {
    const a = turn + (i / SPIKES) * Math.PI * 2;
    const reach = r * (i % 2 ? SPIKE_REACH * 0.78 : SPIKE_REACH);
    const half = 0.16;
    const base = r * 0.5;
    const pts = [Math.cos(a - half) * base, Math.sin(a - half) * base, Math.cos(a) * reach, Math.sin(a) * reach, Math.cos(a + half) * base, Math.sin(a + half) * base];
    ctx.poly(pts).fill({ color: 0x3a414d }).stroke({ width: Math.max(0.8, r * 0.035), color: SUCCESS, alpha: 0.85, join: 'miter' });
  }
  asterisks.set(key, ctx);
  return ctx;
}

interface PlatformBake { body: Bake; wing: Bake | null; windows: P2[]; rivets: P2[]; glints: P2[]; radius: number }
const platformCache = new Map<string, PlatformBake>();
function platformBake(style: number, cw: number, dir: number, length: number): PlatformBake {
  const key = `${style}:${cw}:${dir}:${length}`;
  let b = platformCache.get(key);
  if (b) return b;
  const pm = platformModel(style);
  const models = [pm.body, ...(pm.wing.parts.length ? [pm.wing] : [])];
  const view = viewOf(dir);
  // One scale for both headings, so the emblem is the same size either way: a diameter of 0.56 × length.
  const [ex0, ey0, ex1, ey1] = bounds(models, viewOf(1));
  const k = (length * 0.56) / Math.max(ex1 - ex0, ey1 - ey0);
  const [x0, y0, x1, y1] = bounds(models, view);
  const frame: Frame = { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, view };
  const spots = (l: Spot[], min = 0.12) => l.filter((q) => facing(frame, q, min)).map((q) => toScreen(frame, q.p));
  b = {
    body: bake(pm.body, platformPalette(cw), dir, frame),
    wing: pm.wing.parts.length ? bake(pm.wing, platformPalette(cw, true), dir, frame) : null,
    windows: spots(pm.windows), rivets: spots(pm.rivets), glints: spots(pm.glints, 0),
    radius: (Math.max(x1 - x0, y1 - y0) * k) / 2,
  };
  platformCache.set(key, b);
  return b;
}

// ---- Deterministic noise for fire and sparks (no Math.random) ----

function hash(a: number, b = 0, c = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const rotate = ([x, y]: P2, a: number): P2 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// ---- The view ----

export class HiveShipView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'hardware' as const;
  /** Bob and drift: shared by the body and its marks so the locks stay on their pods. */
  private readonly body = new Container();
  private readonly markBody = new Container();
  /** A heading-aligned frame (rotated to the bow) so stretch and the emergence mask follow the ship. */
  private readonly along = new Container();
  private readonly across = new Container();
  private readonly hull = new Container();
  private readonly rift = new Graphics();
  /** The outline (aura.ts): deadly red on every open look, the contact's included; victory gold once defeated. */
  private readonly aura: Aura;
  private readonly glows = new Graphics();
  private readonly dmg = new Graphics();
  private readonly fx = new Graphics();
  /** Holds a Graphics over the shared wireframe context (never cleared: the context is cached). */
  private readonly wire = new Container();
  private readonly off = new Graphics();
  private dir = 1;
  private look: ThreatLook = 'ready';
  private steps: StepState[] = [];
  private readonly phase: number;
  private readonly palette: Palette;
  private chunkViews: Graphics[] = [];
  /** Screen px per art unit (setZoom): weapon bolts keep a readable size when zoomed out. */
  private zoom = 1;
  /** Which way the nearest captain is (unit, screen terms), when the scene has told it. */
  private toward: [number, number] | null = null;
  /** A rift transit under way (emerging or retreating), and when it began (wall-clock s; null: next tick). */
  private transit: { dir: 'in' | 'out'; from: number | null } | null = null;
  /** The half-plane on the near side of the rift: what's through it shows, what isn't is hidden. */
  private readonly portal = new Graphics();
  /** The flexing parts now drawn, each turning about its root. */
  private limbs: { c: Container; amp: number; period: number; phase: number }[] = [];
  private platform: PlatformBake | null = null;

  constructor(private readonly design: HiveDesign, private readonly length = DEFAULT_LENGTH) {
    this.palette = paletteOf(design.colourway, 'live');
    // Its reach scales with the ship, at any zoom. Outside the silhouette only, so a wireframe contact
    // (no hull to cover the inside) wears the outline without being filled with red.
    this.aura = new Aura(AURA.threat, length * 0.055, { outside: true });
    this.phase = ((design.style * 7 + design.colourway * 3) % 11) / 3;
    this.glows.blendMode = 'add';
    this.dmg.blendMode = 'add';
    this.across.addChild(this.aura.root, this.hull, this.glows, this.dmg);
    this.along.addChild(this.across);
    this.body.addChild(this.rift, this.along, this.portal, this.fx);
    this.root.addChild(this.body);
    this.markBody.addChild(this.wire, this.off);
    this.marks.addChild(this.markBody);
    this.rebuild();
  }

  face(dir: number): void {
    this.dir = dir < 0 ? -1 : 1;
    this.rebuild();
  }

  setStage(stage: string): void {
    const s = parseThreatStage(stage);
    this.look = s.look;
    this.steps = s.steps;
    this.rebuild();
  }

  private get layout(): Layout {
    return layoutOf(this.design.style, this.dir, this.length);
  }

  /** Rebuild the static layers for the current look and heading: cheap, as the bakes are shared. */
  private rebuild(): void {
    for (const c of [...this.hull.removeChildren(), ...this.wire.removeChildren()]) c.destroy({ children: true });
    this.chunkViews = [];
    this.limbs = [];
    this.transit = null;
    this.along.mask = null;
    this.portal.clear();
    this.rift.scale.set(1);
    this.rift.pivot.set(0, 0);
    this.along.visible = true;
    this.markBody.alpha = 1;
    this.platform = null;
    this.aura.set([]);
    [this.glows, this.dmg, this.rift, this.off, this.fx].forEach((g) => g.clear());
    this.along.rotation = 0;
    this.along.scale.set(1);
    this.along.position.set(0, 0);
    this.across.rotation = 0;
    this.rift.position.set(0, 0);
    this.rift.rotation = 0;
    this.hull.alpha = 1;
    this.glows.alpha = 1;
    this.dmg.alpha = 1;
    this.glows.blendMode = this.look === 'ruin' ? 'normal' : 'add';
    const { style, colourway } = this.design;
    const L = this.layout;
    const look = this.look;
    const place = (b: Bake, alpha = 1) => {
      const g = new Graphics(b.ctx);
      g.position.set(b.dx, b.dy);
      g.alpha = alpha;
      this.hull.addChild(g);
      return g;
    };
    const ship = (variant: Variant, wingAlpha = 0.5) => {
      const b = bakesOf(style, colourway, variant, this.dir, this.length, 'whole');
      if (variant !== 'ghost') this.aura.set([b.body]); // a live ship wears the aura; a ghost doesn't
      // Flexing parts on the far side go behind the body, the near ones in front, each turning at its root.
      const limb = (l: LimbBake) => {
        const c = new Container();
        const g = new Graphics(l.b.ctx);
        g.position.set(l.b.dx - l.root[0], l.b.dy - l.root[1]);
        c.position.set(l.root[0], l.root[1]);
        c.addChild(g);
        this.hull.addChild(c);
        this.limbs.push({ c, amp: l.amp, period: l.period, phase: l.phase });
      };
      for (const l of b.limbs) if (!l.front) limb(l);
      place(b.body);
      for (const l of b.limbs) if (l.front) limb(l);
      if (b.wing) {
        place(b.wing, wingAlpha);
        this.drawVeins(variant === 'ghost' ? 0x8a8f9a : darken(this.palette.accent, 0.3), variant === 'ghost' ? 0.3 : 0.75);
      }
    };
    // Deadly red while it's a threat, wireframe contact included; victory gold once it's defeated.
    this.aura.setColor(look === 'platform' || look === 'facility' ? AURA.accomplished : AURA.threat);
    if (look === 'sketch') {
      this.wire.addChild(new Graphics(L.wire));
      // Not seen yet (the wireframe says so), but already known for a Bug: the red follows the hull it will have.
      this.aura.set([bakesOf(style, colourway, 'live', this.dir, this.length, 'whole').body]);
    } else if (look === 'emerging' || look === 'retreat' || look === 'ready' || look === 'underway') {
      ship('live');
      this.drawLights(look === 'ready' || look === 'emerging' || look === 'retreat' ? 0.75 : 1);
      // Through a rift, about a second (2026-10-13): out of it bow first, or backing into it.
      if (look === 'emerging' || look === 'retreat') {
        this.drawEmergence();
        this.transit = { dir: look === 'emerging' ? 'in' : 'out', from: null };
      }
    } else if (look === 'nearing') {
      ship('scorched');
      this.drawLights(1);
      this.drawCracks();
    } else if (look === 'breakup' || look === 'ruin') {
      const b = bakesOf(style, colourway, look === 'ruin' ? 'charred' : 'scorched', this.dir, this.length, 'chunks');
      this.chunkViews = b.chunks.map((c, i) => {
        const g = place(c, i >= L.chunks.length - 1 && b.wing !== null ? 0.5 : 1);
        const [px, py] = L.chunks[i]!.c;
        g.pivot.set(px - c.dx, py - c.dy);
        g.position.set(px, py);
        return g;
      });
      if (look === 'ruin') this.drawRuin();
      else this.drawSeams();
    } else if (look === 'platform') {
      const f = platformBake(style, colourway, this.dir, this.length);
      this.platform = f;
      // A faint warm halo (the gold ornament), then the caged hulk, then still gold rivets.
      // The aura of the win stays with it for good (art session 2026-10-12): a warmer, wider halo than before.
      for (let i = 6; i > 0; i--) this.rift.circle(0, 0, (f.radius * 1.4 * i) / 6).fill({ color: SUCCESS, alpha: 0.045 });
      // Told apart from a done asteroid's round orb by shape, not only by colour (22 A12, R10): sharp
      // wreckage bristles out of the caged hulk in an asterisk, and its gold outline follows the spikes,
      // so it reads as a star of points at any size. Behind the hulk, which stays the head.
      const spikes = new Graphics(asteriskOf(f.radius, style * 7 + colourway));
      this.hull.addChild(spikes);
      place(f.body);
      if (f.wing) place(f.wing, 0.5);
      this.aura.set([f.body, { ctx: spikes.context, dx: 0, dy: 0 }]);
      for (const [x, y] of f.rivets) this.glows.circle(x, y, 2.2).fill({ color: SUCCESS, alpha: 0.18 }).circle(x, y, 1.05).fill({ color: lighten(SUCCESS, 0.25) });
    } else if (look === 'facility') {
      const f = facilityBake(style, colourway, this.dir, this.length);
      // The gold ornament: a soft halo under the outpost, and its windows lit, still (09 §1).
      for (let i = 6; i > 0; i--) this.rift.ellipse(0, 2, (this.length * 0.7 * i) / 6, (this.length * 0.36 * i) / 6).fill({ color: SUCCESS, alpha: 0.035 });
      place(f.bake);
      this.aura.set([f.bake]);
      for (const [x, y] of f.lights) this.glows.circle(x, y, 4.2).fill({ color: SUCCESS, alpha: 0.24 }).circle(x, y, 1.7).fill({ color: lighten(SUCCESS, 0.55) });
      const [bx, by] = f.lights[f.lights.length - 1] ?? [0, 0];
      this.glows.moveTo(bx - 6, by).lineTo(bx + 6, by).moveTo(bx, by - 6).lineTo(bx, by + 6).stroke({ width: 1, color: SUCCESS, alpha: 0.9 });
    } else {
      // Off the ladder: a desaturated ghost; warping out is the same ghost stretched into the jump.
      ship('ghost', 0.4);
      this.hull.alpha = look === 'warp' ? 0.5 : 0.42;
      if (look === 'warp') {
        this.drawWarp();
      } else {
        drawOffLadderMarks(this.off, { rung: 'off', ghost: true, strike: look === 'rejected' }, L.hw * 0.7, Math.max(L.hw, L.hh) + 4);
      }
    }
    this.drawPodGlows();
    this.tick(0);
  }

  // ---- Static layers ----

  private drawLights(strength: number): void {
    const c = this.palette.glow;
    for (const [x, y] of this.layout.lights) {
      this.glows.circle(x, y, 3.4).fill({ color: c, alpha: 0.16 * strength });
      this.glows.circle(x, y, 1.25).fill({ color: lighten(c, 0.35), alpha: strength });
    }
  }

  /** Weapon pods charging in the swarm's glow; a disabled (Closed) pod is dark. */
  private drawPodGlows(): void {
    if (!['ready', 'emerging', 'underway', 'nearing'].includes(this.look)) return;
    const c = this.palette.glow;
    this.layout.pods.forEach(({ p: [x, y] }, i) => {
      if (this.steps[i] === 'c') return;
      this.glows.circle(x, y, 5).fill({ color: c, alpha: 0.18 }).circle(x, y, 2.2).fill({ color: lighten(c, 0.3), alpha: 0.9 });
    });
  }

  private drawVeins(color: number, alpha: number): void {
    const g = new Graphics();
    for (const [[ax, ay], [bx, by]] of this.layout.veins) g.moveTo(ax, ay).lineTo(bx, by);
    g.stroke({ width: 0.6, color, alpha });
    this.hull.addChild(g);
  }

  /** Glowing fractures at each vent (Nearing): the hull failing, never anyone hurt. */
  private drawCracks(): void {
    const c = this.palette.ember;
    const g = this.dmg;
    const paths = this.layout.vents.flatMap(({ p: [x, y] }, v) => Array.from({ length: 3 }, (_, b) => {
      const pts: P2[] = [[x, y]];
      let a = hash(v, b, 11) * Math.PI * 2;
      for (let s = 0; s < 3; s++) {
        a += (hash(v, b, s) - 0.5) * 1.4;
        const len = 2.5 + hash(b, s, v) * 3.5;
        const [px, py] = pts[pts.length - 1]!;
        pts.push([px + Math.cos(a) * len, py + Math.sin(a) * len * 0.7]);
      }
      return pts;
    }));
    const trace = () => paths.forEach((pts) => pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))));
    trace();
    g.stroke({ width: 2.6, color: this.palette.glow, alpha: 0.28 });
    trace();
    g.stroke({ width: 0.8, color: lighten(c, 0.4), alpha: 0.95 });
    for (const { p: [x, y] } of this.layout.vents) g.circle(x, y, 2.6).fill({ color: c, alpha: 0.5 });
  }

  /**
   * Emerging from hyperspace: a torn rift standing across the ship's path, drawn in the model's own
   * perspective, with only the part of the hull already through it baked (no mask).
   */
  private drawEmergence(): void {
    const L = this.layout;
    const [cut, cy, R] = SWARMS[this.design.style]!.rift;
    const at = (p: V3) => toScreen(L.frame, p);
    const ring = (r: number, jag: number, x = cut): number[] => Array.from({ length: 40 }, (_, i) => {
      const t = (2 * Math.PI * i) / 40;
      const rr = r * (1 + (hash(i, 17) - 0.5) * jag);
      return at([x, cy + Math.cos(t) * rr, Math.sin(t) * rr]);
    }).flat();
    const g = this.rift;
    const c = this.palette.glow;
    // Light dragged out of the rift behind it, along the ship's path.
    for (let i = 0; i < 16; i++) {
      const t = hash(i, 3) * Math.PI * 2;
      const r = R * (0.5 + 0.5 * hash(i, 4));
      const [ax, ay] = at([cut - 2, cy + Math.cos(t) * r, Math.sin(t) * r]);
      const [bx, by] = at([cut - 22 - hash(i, 5) * 36, cy + Math.cos(t) * r * 1.25, Math.sin(t) * r * 1.25]);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: lighten(c, 0.25), alpha: 0.45 });
    }
    g.poly(ring(R * 1.25, 0.2)).fill({ color: mix(c, CHITIN, 0.45), alpha: 0.28 });
    g.poly(ring(R, 0.16)).fill({ color: 0x07050a, alpha: 0.97 }).stroke({ width: 2.4, color: c, alpha: 0.75, join: 'round' });
    g.poly(ring(R * 0.97, 0.16)).stroke({ width: 0.9, color: lighten(c, 0.55), alpha: 0.95, join: 'round' });
    g.poly(ring(R * 0.55, 0.3)).fill({ color: mix(c, 0x07050a, 0.82), alpha: 0.8 });
  }

  /** Warping out (Off): the ghost stretched along its heading into the jump, with streaks behind. */
  private drawWarp(): void {
    const L = this.layout;
    const a = Math.atan2(L.heading[1], L.heading[0]);
    const [ux, uy] = L.heading;
    this.along.rotation = a;
    this.across.rotation = -a;
    this.along.scale.set(1.4, 0.82);
    this.along.position.set(ux * L.hw * 0.18, uy * L.hw * 0.18);
    const g = this.rift;
    const [nx, ny] = [-uy, ux];
    for (let i = 0; i < 14; i++) {
      const off = (hash(i, 7) - 0.5) * L.hh * 1.4;
      const x0 = -L.hw * (0.2 + 0.5 * hash(i, 8));
      const len = 30 + hash(i, 9) * 50;
      g.moveTo(ux * x0 + nx * off, uy * x0 + ny * off).lineTo(ux * (x0 - len) + nx * off, uy * (x0 - len) + ny * off);
    }
    g.stroke({ width: 1, color: 0xc9ccd6, alpha: 0.4 });
    const [fx, fy] = [ux * L.hw * 1.3, uy * L.hw * 1.3];
    g.moveTo(fx - nx * 14, fy - ny * 14).lineTo(fx + nx * 14, fy + ny * 14).stroke({ width: 1, color: IVORY, alpha: 0.6 });
    g.circle(fx, fy, 6).fill({ color: IVORY, alpha: 0.15 }).circle(fx, fy, 2).fill({ color: IVORY, alpha: 0.85 });
  }

  /** Breaking apart: hot seams where the chunks part, a white flash at the heart. */
  private drawSeams(): void {
    const L = this.layout;
    const c = this.palette.ember;
    this.chunkViews.forEach((g, i) => {
      const [px, py] = L.chunks[i]!.c;
      const [ux, uy] = unit(px, py);
      g.position.set(px * 1.15 + ux * 18, py * 1.15 + uy * 16);
      g.rotation = (hash(i, 9) - 0.5) * 1.1;
      // The torn end of each piece glows hot where it parted.
      const [ex, ey] = [px * 0.55 + ux * 6, py * 0.55 + uy * 6];
      this.dmg.circle(ex, ey, 7).fill({ color: c, alpha: 0.22 }).circle(ex, ey, 3).fill({ color: lighten(c, 0.4), alpha: 0.7 });
    });
    for (let i = 0; i < 4; i++) this.dmg.circle(0, 0, 5 + i * 6).fill({ color: lighten(c, 0.3), alpha: 0.16 });
    this.dmg.circle(0, 0, 4).fill({ color: IVORY, alpha: 0.95 });
    // The strike run's mark: one gold ring thrown wide (the accent into Accomplished, 09 §5).
    this.dmg.circle(0, 0, Math.max(L.hw, L.hh) * 0.95).stroke({ width: 1.6, color: SUCCESS, alpha: 0.55 });
  }

  /** The cloud of victorious ruin: the wreckage scattered, dust, and a few still gold glints. */
  private drawRuin(): void {
    const L = this.layout;
    this.chunkViews.forEach((g, i) => {
      const [px, py] = L.chunks[i]!.c;
      const [ux, uy] = unit(px + 0.1, py);
      g.position.set(px * 1.1 + ux * 26, py * 1.1 + uy * 20);
      g.rotation = (hash(i, 4) - 0.5) * 2.6;
      g.scale.set(0.66);
    });
    const dust = mix(this.palette.hull, 0x8a7f7a, 0.55);
    for (let i = 0; i < 10; i++) {
      const [x, y] = [(hash(i, 21) - 0.5) * L.hw * 1.9, (hash(i, 22) - 0.5) * L.hh * 1.7];
      const r = 12 + hash(i, 23) * 18;
      for (let k = 4; k > 0; k--) this.rift.circle(x, y, (r * k) / 4).fill({ color: dust, alpha: 0.045 });
    }
    const shard = mix(this.palette.hull, 0x1e1919, 0.45);
    for (let i = 0; i < 34; i++) {
      const [x, y] = [(hash(i, 31) - 0.5) * L.hw * 2.3, (hash(i, 32) - 0.5) * L.hh * 2.1];
      const s = 0.9 + hash(i, 33) * 2.4;
      const a = hash(i, 34) * Math.PI * 2;
      const pts = [0, 1.6, 2.6].flatMap((t) => [x + Math.cos(a + t) * s * (t ? 1 : 1.6), y + Math.sin(a + t) * s * (t ? 1 : 1.6)]);
      this.glows.poly(pts).fill({ color: i % 3 ? shard : this.palette.accent });
    }
    for (let i = 0; i < 5; i++) {
      const [x, y] = [(hash(i, 41) - 0.5) * L.hw * 1.5, (hash(i, 42) - 0.5) * L.hh * 1.3];
      this.dmg.moveTo(x - 2.6, y).lineTo(x + 2.6, y).moveTo(x, y - 2.6).lineTo(x, y + 2.6).stroke({ width: 0.8, color: SUCCESS, alpha: 0.9 });
      this.dmg.circle(x, y, 1.6).fill({ color: SUCCESS, alpha: 0.35 });
    }
  }

  // ---- Per frame ----

  /** A victory's gold flare, 0..1 (27 B3; aura.ts). */
  setAuraFlare(share: number): void {
    this.aura.setFlare(share);
  }

  tick(seconds: number): void {
    const look = this.look;
    // Ambient: a slow, heavy hover (identity, not state); the ruin drifts apart instead.
    const still = look === 'facility' || look === 'ruin';
    const bob = look === 'platform' ? Math.sin(seconds * 0.3 + this.phase) * 0.5 * motion.jiggle : still ? 0 : Math.sin(seconds * 0.55 + this.phase) * 1.4 * motion.jiggle;
    this.body.y = bob;
    this.markBody.y = bob;
    this.tickTransit(seconds);
    // Legs, mandibles and antennae reach and settle, slowly, out of step (identity motion).
    for (const l of this.limbs) l.c.rotation = motion.reduced ? 0 : Math.sin((2 * Math.PI * seconds) / l.period + l.phase + this.phase) * l.amp * motion.jiggle;
    if (look === 'ruin' && !motion.reduced) {
      this.chunkViews.forEach((g, i) => (g.rotation = (hash(i, 4) - 0.5) * 1.6 + seconds * 0.025 * (hash(i, 5) - 0.5)));
    }
    // State motion reads the pulse clock; reduced motion holds one legible frame.
    const t = motion.reduced ? 0.95 : motion.pulseTime;
    const breath = 0.8 + 0.2 * Math.sin((2 * Math.PI * t) / 12 + this.phase);
    this.fx.clear();
    // The aura breathes slowly and gently: the same red on every open look, a contact's a touch fainter;
    // victory gold on a defeated hulk (state is in the form).
    const alive = look === 'emerging' || look === 'ready' || look === 'underway' || look === 'nearing';
    if (alive) this.drawEyes(seconds);
    const won = look === 'platform' || look === 'facility';
    const base = alive ? 0.5 : look === 'sketch' ? 0.4 : won ? 0.45 : 0;
    this.aura.setAlpha(base > 0 ? (motion.reduced ? base + 0.1 : base + 0.12 * Math.sin((2 * Math.PI * t) / 6 + this.phase)) : 0);
    switch (look) {
      case 'sketch':
        this.wire.alpha = 0.75 + 0.25 * breath;
        break;
      case 'emerging':
      case 'ready':
        this.glows.alpha = 0.55 + 0.45 * breath;
        break;
      case 'underway':
        this.glows.alpha = 0.85 + 0.15 * progressPulse(t, 0.5);
        this.drawFire(t, PROGRESS_PERIOD / 3, 0.22);
        break;
      case 'nearing':
        this.glows.alpha = 0.7 + 0.3 * hash(Math.floor(t * 9), 1);
        this.dmg.alpha = 0.65 + 0.35 * hash(Math.floor(t * 12), 2);
        this.drawVenting(t);
        this.drawFire(t, NEARING_PERIOD / 4, 0.75, true);
        break;
      case 'breakup':
        this.drawBurst(t);
        break;
      case 'platform':
        this.drawPlatformLights(seconds);
        break;
      default:
        break;
    }
  }

  /** The platform's warm windows (a slow shimmer) and a faint research glint sweeping its vanes. */
  private drawPlatformLights(seconds: number): void {
    const f = this.platform;
    if (!f) return;
    const g = this.fx;
    const still = motion.reduced;
    f.windows.forEach(([x, y], i) => {
      const a = still ? 0.8 : 0.66 + 0.26 * Math.sin(seconds * 0.9 + i * 2.1 + this.phase);
      g.circle(x, y, 3).fill({ color: SUCCESS, alpha: 0.2 * a });
      g.circle(x, y, 1.25).fill({ color: lighten(SUCCESS, 0.45), alpha: a });
    });
    if (!f.glints.length) return;
    const cycle = 11;
    const u = (seconds + this.phase * 3) / cycle;
    const n = Math.floor(u);
    const ph = u - n;
    const env = still ? 0.4 : ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
    if (env <= 0.01) return;
    const [x, y] = f.glints[Math.floor(hash(n, this.design.style, 3) * f.glints.length) % f.glints.length]!;
    g.moveTo(x - 4.5, y).lineTo(x + 4.5, y).moveTo(x, y - 4.5).lineTo(x, y + 4.5).stroke({ width: 0.9, color: IVORY, alpha: 0.85 * env });
    g.circle(x, y, 1.3).fill({ color: IVORY, alpha: env });
  }

  /**
   * Weapons fire both ways. The swarm's bolts fly outward from its live pods and break on a shield
   * flare (absorbed, never landing on anyone); the fleet's beams strike the pods under fire. Good guys
   * shoot blue, bad guys red (art/energy.ts, 2026-10-13): the swarm's fire is Danger Red whatever its
   * colourway (which stays on its hull lights), the fleet's is hero blue.
   */
  private drawFire(t: number, period: number, spread: number, frantic = false): void {
    const L = this.layout;
    const g = this.fx;
    const c = DANGER;
    const travel = (frantic ? 3.4 : 2.2) * period;
    const reach = Math.max(L.hw, L.hh) * 0.75 + 16;
    // Live pods fire; a disabled pod is silent. Heavily engaged, the hull's vents spit wild fire too.
    const emitters = [
      ...L.pods.map((e, i) => ({ ...e, i, wild: false })).filter((e) => this.steps[e.i] !== 'c'),
      ...(frantic ? L.vents.map((e, k) => ({ ...e, i: 10 + k, wild: true })) : []),
    ];
    emitters.forEach(({ p: [x, y], d, i, wild }) => {
      const ph = hash(i, 77) * period;
      const n = Math.floor((t + ph) / period);
      for (let m = 0; m < (frantic ? 5 : 3); m++) {
        const shot = n - m;
        const age = (t + ph) - shot * period;
        if (age < 0 || age > travel + 0.25) continue;
        const [ux, uy] = rotate(d, (hash(i, shot, 5) - 0.5) * (wild ? 1.8 : spread) * 2);
        const dist = Math.min(age / travel, 1) * reach;
        const [hx, hy] = [x + ux * dist, y + uy * dist];
        if (age <= travel) {
          // At least a few screen pixels wide and long, so the fire still reads zoomed out (2026-10-12).
          const px = 1 / Math.max(1e-3, this.zoom);
          const tail = Math.min(dist, Math.max(9, 8 * px));
          g.moveTo(hx - ux * tail, hy - uy * tail).lineTo(hx, hy).stroke({ width: Math.max(3, 3.6 * px), color: c, alpha: 0.3 });
          g.moveTo(hx - ux * tail * 0.7, hy - uy * tail * 0.7).lineTo(hx, hy).stroke({ width: Math.max(1.2, 1.6 * px), color: brighten(c, 0.7), alpha: 0.95 });
        } else {
          // Absorbed: a brief arc of shield light where the bolt broke.
          const f = 1 - (age - travel) / 0.25;
          const a = Math.atan2(-uy, -ux);
          const [sx, sy] = [hx + ux * 6, hy + uy * 6];
          g.moveTo(sx + Math.cos(a - 0.8) * 6, sy + Math.sin(a - 0.8) * 6).arc(sx, sy, 6, a - 0.8, a + 0.8).stroke({ width: 1.3, color: SHIELD, alpha: 0.8 * f });
          g.circle(hx, hy, 1.8 * f + 0.6).fill({ color: SHIELD, alpha: 0.6 * f });
        }
      }
      // The fleet's beam on a pod under fire, on the beat, with sparks thrown off the impact.
      if (this.steps[i] === 'a') {
        const p = progressPulse(t, i * 0.21);
        if (p > 0.05) {
          const [bx, by] = rotate(d, 1.1 + hash(i, 3) * 0.6);
          const [sx, sy] = [x + bx * 52, y + by * 52];
          const [mx, my] = [x + bx * 24, y + by * 24];
          g.moveTo(sx, sy).lineTo(x, y).stroke({ width: 4, color: HERO, alpha: 0.18 * p });
          g.moveTo(sx, sy).lineTo(mx, my).stroke({ width: 1, color: brighten(HERO, 0.5), alpha: 0.35 * p });
          g.moveTo(mx, my).lineTo(x, y).stroke({ width: 1.4, color: brighten(HERO, 0.8), alpha: 0.95 * p });
          g.circle(x, y, 2.5 + 2 * p).fill({ color: HERO_CORE, alpha: 0.7 * p });
        }
        this.sparks(x, y, Math.atan2(d[1], d[0]), 1.6, 5, t, 0.8, 18, this.palette.ember, i);
      }
    });
  }

  /** Nearing: sparks and dark smoke venting from the fractures. */
  private drawVenting(t: number): void {
    const g = this.fx;
    this.layout.vents.forEach(({ p: [x, y], d }, v) => {
      for (let k = 0; k < 4; k++) {
        const age = ((t / 2.2 + hash(v, k, 61)) % 1 + 1) % 1;
        const [ux, uy] = rotate(d, (hash(v, k, Math.floor(t / 2.2 + hash(v, k, 61))) - 0.5) * 0.8);
        const [px, py] = [x + ux * age * 16, y + uy * age * 16 - age * 4];
        g.circle(px, py, 2.5 + age * 8).fill({ color: 0x2a2226, alpha: 0.42 * (1 - age) });
      }
      this.sparks(x, y, Math.atan2(d[1], d[0]), 1.3, 10, t, 0.7, 26, this.palette.ember, 40 + v);
    });
  }

  /** Breakup: sparks and embers thrown off the parting hull. */
  private drawBurst(t: number): void {
    this.sparks(0, 0, 0, Math.PI * 2, 18, t, 1.6, 40, this.palette.ember, 90);
    this.sparks(0, 0, 0, Math.PI * 2, 8, t + 0.5, 2.2, 26, IVORY, 91);
  }

  private sparks(x: number, y: number, a: number, spread: number, count: number, t: number, period: number, speed: number, color: number, seed: number): void {
    const g = this.fx;
    for (let i = 0; i < count; i++) {
      const u = t / period + hash(seed, i, 1);
      const age = u - Math.floor(u);
      const ang = a + (hash(seed, i, Math.floor(u)) - 0.5) * spread;
      const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
      const d = age * speed * (0.6 + 0.4 * hash(seed, i, 2));
      const [px, py] = [x + ux * d, y + uy * d];
      g.moveTo(px - ux * 2.5, py - uy * 2.5).lineTo(px, py);
    }
    g.stroke({ width: 1.2, color, alpha: 0.9 });
  }

  /** The camera's scale on this object (pixels per art unit): the aura keeps a readable reach on screen. */
  /**
   * The rift transit, about a second (2026-10-13). Emerging: the rift tears open (0.2 s), the ship
   * slides out of it bow first, the part still beyond the rift hidden (to 0.8 s), and it snaps shut
   * with a pulse. Retreating: the same backwards, into the rift, which closes behind it. Reduced
   * motion: the end at once.
   */
  private tickTransit(seconds: number): void {
    const tr = this.transit;
    if (!tr) return;
    if (tr.from === null) tr.from = seconds;
    const u = motion.reduced ? 1 : Math.max(0, Math.min(1, (seconds - tr.from) / TRANSIT_S));
    const L = this.layout;
    const [cut, cy] = SWARMS[this.design.style]!.rift;
    const [cx, cyy] = toScreen(L.frame, [cut, cy, 0]);
    const [hx, hy] = L.heading;
    const travel = L.hw * 2.4;
    const inbound = tr.dir === 'in';
    // How far out of the rift the ship is (1: all the way, at its place).
    const out = inbound ? ease(0.15, 0.8, u) : 1 - ease(0.2, 0.85, u);
    const open = inbound ? ease(0, 0.2, u) * (1 - ease(0.8, 1, u)) : ease(0, 0.2, u) * (1 - ease(0.85, 1, u));
    this.along.position.set(-hx * travel * (1 - out), -hy * travel * (1 - out));
    this.rift.pivot.set(cx, cyy);
    this.rift.position.set(cx, cyy);
    this.rift.scale.set(Math.max(0.001, open));
    this.rift.alpha = open;
    this.markBody.alpha = out;
    const done = inbound ? u >= 0.82 : u >= 1;
    if (done || motion.reduced) {
      this.along.mask = null;
      this.portal.clear();
      if (!inbound) this.along.visible = false;
      if (u >= 1) this.transit = null;
      return;
    }
    // The near side of the rift's plane, across the heading: a big half-plane.
    const B = this.length * 4;
    const [px, py] = [-hy, hx];
    this.portal.clear().poly([
      cx + px * B, cyy + py * B, cx - px * B, cyy - py * B,
      cx - px * B + hx * B, cyy - py * B + hy * B, cx + px * B + hx * B, cyy + py * B + hy * B,
    ]).fill({ color: 0xffffff });
    this.along.mask = this.portal;
  }

  /**
   * Watchful eyes (2026-10-12): they brighten and dim on a slow breath, and every so often, for a few
   * seconds, their glints turn toward the nearest captain. Wall time, so they watch while paused too.
   */
  private drawEyes(seconds: number): void {
    const eyes = this.layout.eyes;
    if (!eyes.length) return;
    const g = this.fx;
    const c = this.palette.glow;
    const still = motion.reduced;
    const breath = still ? 0.6 : 0.45 + 0.4 * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / 9.5 + this.phase * 2));
    // A look: about once every 17 s, 3.5 s long, eased in and out.
    const cycle = 17;
    const u = (seconds + this.phase * 11) / cycle;
    const ph = (u - Math.floor(u)) * cycle;
    const look = still || !this.toward ? 0 : ease(0, 0.8, ph) * (1 - ease(2.7, 3.5, ph));
    const [tx, ty] = this.toward ?? [0, 0];
    const px = 1 / Math.max(1e-3, this.zoom);
    for (const [x, y] of eyes) {
      const [ex, ey] = [x + tx * 1.1 * look, y + ty * 1.1 * look];
      g.circle(x, y, Math.max(2.4, 2.2 * px)).fill({ color: c, alpha: 0.16 * (breath + look * 0.5) });
      g.circle(ex, ey, Math.max(0.9, 0.9 * px)).fill({ color: lighten(c, 0.6), alpha: Math.min(1, 0.5 * breath + 0.5 * look) });
    }
  }

  /**
   * What the scene around it is doing (2026-10-12): `toward` the nearest captain, in screen terms, so
   * its eyes can turn to it now and then.
   */
  ambient(a: { toward?: readonly [number, number] | null }): void {
    if (a.toward === undefined) return;
    const t = a.toward;
    const l = t ? Math.hypot(t[0], t[1]) : 0;
    this.toward = t && l > 1e-6 ? [t[0] / l, t[1] / l] : null;
  }

  setZoom(pxPerUnit: number): void {
    this.zoom = pxPerUnit;
    this.aura.setZoom(pxPerUnit);
  }

  destroy(): void {
    this.aura.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}
