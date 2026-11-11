// 06 §7 captain ships: heroic capital ships, one per person, chosen by the captain's stable ship seed
// from 13 hull classes × 14 liveries. Each class nods to a family of pop-culture starships without
// copying one. Hulls are real 3D solids (hull3d.ts) painted at one shared three-quarter view, with an
// east-facing and a west-facing render so a ship always points the way it flies. Liveries use every
// hue except the signal ladder's (09 §1): no steel grey, progress blue, violet, or gold.
// Size never varies by person (INV-19): every hull is fitted to the same footprint.
// The captain rule (06 §7): every captain ship has wings or nacelles — 1950s concept-art technology
// — and its lights breathe on one slow, deep pulse. Cargo vessels never have either.
import { Container, Graphics } from 'pixi.js';
import { HullModel, renderHull, S, type HullRender, type Palette, type V3 } from './hull3d';
import { motion } from './motion';
import { BREATH_PERIOD, lighten, mix, topLit, WindowLights } from './lit';

const STEEL = 0x7d899e;

/** [hull, accent]: bold, distinct pairs, all clear of the ladder hues. */
export const LIVERIES: { name: string; hull: number; accent: number }[] = [
  { name: 'Crimson & cream', hull: 0xa8323a, accent: 0xe6dcc0 },
  { name: 'Vermilion & charcoal', hull: 0xd0532c, accent: 0x3a3f4a },
  { name: 'Terracotta & teal', hull: 0xa5583d, accent: 0x3b968e },
  { name: 'Olive & cream', hull: 0x76803b, accent: 0xe0d6b8 },
  { name: 'Forest & copper', hull: 0x386f48, accent: 0xc4763f },
  { name: 'Jade & ivory', hull: 0x2f9478, accent: 0xe8e1cc },
  { name: 'Teal & coral', hull: 0x26808a, accent: 0xe5806a },
  { name: 'Navy & signal red', hull: 0x253a6b, accent: 0xc8433c },
  { name: 'Magenta & silver', hull: 0x9c3a74, accent: 0xc9ccd2 },
  { name: 'Rose & navy', hull: 0xc97586, accent: 0x26365f },
  { name: 'Ivory & red', hull: 0xd8d2bf, accent: 0xbf3b33 },
  { name: 'Oxblood & tan', hull: 0x6e2a34, accent: 0xd2b48c },
  { name: 'Bronze & teal', hull: 0x8a6446, accent: 0x4aa59a },
  { name: 'Chartreuse & charcoal', hull: 0x9aae3a, accent: 0x343944 },
];

const MATERIALS = { cargo: 0x6a6d74, steel: 0x6a6d74, dark: 0x2c2f37, glass: 0x2a4256, glow: 0xa8f0ea, ember: 0xff9a5a };

type Build = (m: HullModel) => void;

/** Points along an arc from the bow back, bulging by (dy, dz) at its middle. */
const arc = (x0: number, x1: number, y0: number, z0: number, dy: number, dz: number, n = 12): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    const b = Math.sin(Math.PI * s);
    return [x0 + (x1 - x0) * s, y0 + dy * b, z0 + dz * b];
  });

/** The hull classes, each a family of famous starships (no single one copied). */
export const HULLS: { name: string; nod: string; build: Build }[] = [
  {
    name: 'Explorer', nod: 'saucer, neck, and warp nacelles',
    build: (m) => {
      m.lathe([[0, 4.5], [5, 4.2], [12, 3.2], [24, 1.4], [27, 0.4], [28, -0.4], [25, -1.6], [12, -3], [0, -3.4]],
        ['hull', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull', 'hull'], { cx: 16, cy: 8, sx: 1.2, sides: 28 });
      m.lathe([[0, 6.4], [3, 6], [5, 4.4]], 'steel', { cx: 16, cy: 8, sides: 14 });
      m.prism([[8, 4], [16, 4], [2, -7], [-6, -7]], -2.2, 2.2, 'xy', 'hull');
      m.loft([S(10, 3.4, 3.4, -10), S(6, 6, 6, -10), S(-22, 5.5, 6, -10), S(-32, 3, 3.5, -10)], ['steel', 'hull', 'hull'], { sides: 14, caps: ['glow'] });
      m.sym(() => {
        m.tube([[-14, -6, 3], [-24, 4, 13]], 1.3, 'hull', { sides: 4 });
        m.loft([S(-6, 2.2, 2.2, 5, 15), S(-9, 3.2, 3, 5, 15), S(-40, 3.2, 3, 5, 15), S(-46, 2, 2, 5, 15)], ['accent', 'hull', 'steel'], { sides: 12, caps: ['ember', 'dark'] });
        m.box(-38, -12, 7.6, 8.6, 14.4, 15.6, 'accent');
        m.winRow(-18, 2, 5, -9, 6, [0, 0, 1]);
        m.engine([-47, 5, 15], 2.4);
        m.engine([-17, 8, 5], 1.8, true);
      });
      for (let i = 0; i < 26; i++) {
        const t = (2 * Math.PI * i) / 26;
        m.win([16 + Math.cos(t) * 24 * 1.2, 9.4, Math.sin(t) * 24], [Math.cos(t), 0.7, Math.sin(t)]);
      }
    },
  },
  {
    name: 'Battlestar', nod: 'armored carrier with flight pods',
    build: (m) => {
      m.loft([S(52, 2, 1.5), S(44, 7, 4), S(26, 10, 5.5), S(20, 7, 4.5), S(-18, 8, 6, 1), S(-34, 12, 8, 1), S(-50, 11, 7.5, 1)],
        ['hull', 'hull', 'steel', 'hull', 'hull', 'steel'], { sides: 12, sq: 6, caps: [undefined, 'dark'] });
      m.box(-30, 14, 5.5, 9, -3, 3, 'steel');
      for (let x = 28; x < 44; x += 4) m.box(x, x + 2, 4.4, 6.2, -5.5, 5.5, 'dark');
      for (let x = -28; x < 10; x += 6) m.box(x, x + 2.5, 9, 10.2, -2, 2, 'dark');
      m.sym(() => {
        m.loft([S(30, 1.5, 1.5, -1, 15), S(26, 4.5, 3, -1, 15), S(-20, 4.5, 3.4, -1, 15), S(-26, 3.5, 2.8, -1, 15)], ['accent', 'hull', 'steel'], { sides: 12, sq: 6 });
        m.box(-6, 2, -2, 1, 7, 11, 'steel');
        m.box(10, 16, -2, 1, 7, 11, 'steel');
        m.box(-30, 18, 1.4, 2.8, 7.6, 8.4, 'accent');
        m.winRow(-16, 22, 4.5, -1, 19.5);
        m.prism([[-14, 10], [-40, 30], [-50, 31], [-48, 10]], -0.4, 1.2, 'xz', 'hull');
        m.prism([[-36, 26], [-40, 30], [-50, 31], [-49, 26]], -0.5, 1.3, 'xz', 'accent', { bias: 0.5 });
        m.engine([-51, -3, 6], 3.2);
      });
      m.engine([-51, 2, 0], 4);
    },
  },
  {
    name: 'Rocket', nod: 'needle rocket with swept fins',
    build: (m) => {
      m.loft([S(52, 0, 0), S(44, 2.6), S(36, 4.2)], 'accent', { sides: 16 });
      m.loft([S(36, 4.2), S(26, 5), S(-34, 5.4), S(-44, 4.6), S(-48, 3.6)], ['hull', 'hull', 'hull', 'steel'], { sides: 16, caps: [undefined, 'dark'] });
      m.loft([S(32, 0, 0, 4.4), S(28, 2.2, 1.6, 4.6), S(20, 2.4, 1.8, 4.8), S(14, 0, 0, 4.6)], 'glass', { sides: 10 });
      m.prism([[-26, 4], [-40, 17], [-47, 17], [-45, 4]], -0.6, 0.6, 'xy', 'accent');
      m.sym(() => {
        m.prism([[12, 4], [-18, 22], [-30, 23], [-28, 4]], -1.6, -0.6, 'xz', 'hull');
        m.loft([S(-10, 0, 0, -1, 23), S(-14, 1.7, 1.7, -1, 23), S(-30, 1.7, 1.7, -1, 23), S(-33, 1, 1, -1, 23)], 'accent', { sides: 8 });
        m.prism([[30, 3], [24, 10], [20, 10], [22, 3]], -0.4, 0.4, 'xz', 'accent');
        m.winRow(-24, 12, 6, 1.2, 5.3, [0, 0.2, 1]);
      });
      m.engine([-49, 0, 0], 4.5, true);
    },
  },
  {
    name: 'Orbiter', nod: 'winged shuttle orbiter',
    build: (m) => {
      m.loft([S(50, 0, 0, -1), S(46, 3, 2.6, -0.5), S(38, 5.5, 4.6), S(-38, 6, 5.2), S(-44, 5.6, 5)], 'hull', { sides: 12, sq: 3, caps: [undefined, 'dark'] });
      m.prism([[-26, 5], [-40, 22], [-47, 22], [-45, 5]], -0.7, 0.7, 'xy', 'hull');
      m.prism([[-36.5, 16], [-40, 22], [-47, 22], [-46, 16]], -0.8, 0.8, 'xy', 'accent', { bias: 0.5 });
      m.sym(() => {
        m.prism([[18, 5], [-22, 24], [-40, 25], [-42, 5]], -4.6, -3.4, 'xz', 'hull');
        m.prism([[18, 5], [-22, 24], [-25, 24], [13, 5]], -4.5, -3.2, 'xz', 'accent', { bias: 0.5 });
        m.loft([S(-26, 0, 0, 4, 3.5), S(-30, 2, 2, 4, 3.5), S(-44, 2.4, 2.2, 4, 3.5)], 'hull', { sides: 8, caps: [undefined, 'dark'] });
        m.box(-38, 36, 0.3, 1.4, 5.7, 6.2, 'accent');
        m.win([40, 3.6, 1.6], [0.4, 1, 0.3]).win([37, 4.1, 2.8], [0.2, 1, 0.5]);
        m.engine([-45, -2.5, 3], 2.4, true);
      });
      m.engine([-45, 1, 0], 3, true);
    },
  },
  {
    name: 'Saucer', nod: 'two-deck flying saucer',
    build: (m) => {
      m.lathe([[0, 10], [6, 9.6], [12, 7.6], [22, 4.6], [34, 1.4], [38, 0.3], [38, -0.6], [32, -2.6], [20, -5], [8, -6.2], [0, -6.4]],
        ['glass', 'glass', 'hull', 'hull', 'accent', 'accent', 'hull', 'hull', 'steel', 'steel'], { sides: 32 });
      m.prism([[-20, 5], [-33, 10], [-37, 10], [-34, 2]], -0.8, 0.8, 'xy', 'accent');
      for (let i = 0; i < 24; i++) {
        const t = (2 * Math.PI * i) / 24;
        m.win([Math.cos(t) * 28, 3.3, Math.sin(t) * 28], [Math.cos(t) * 0.5, 0.85, Math.sin(t) * 0.5]);
      }
      for (let z = -6; z <= 6; z += 3) m.win([37.6, -0.1, z], [1, 0, z / 38]);
      m.sym(() => {
        m.tube([[-24, 0, 14], [-36, 2, 22]], 1.3, 'steel', { sides: 4 });
        m.loft([S(-22, 0, 0, 2, 23), S(-26, 2.6, 2.6, 2, 23), S(-52, 2.8, 2.8, 2, 23), S(-56, 2, 2, 2, 23)], ['accent', 'hull', 'steel'], { sides: 10, caps: ['ember', 'dark'] });
        m.engine([-57, 2, 23], 2.4);
      });
      m.engine([-38, 0, 0], 2.8);
    },
  },
  {
    name: 'Wedge', nod: 'arrowhead dreadnought',
    build: (m) => {
      const wedge: [number, number][] = [[1, 0], [0.5, 0.6], [0.12, 1], [-0.12, 1], [-0.5, 0.6], [-1, 0], [-0.5, -0.45], [0, -0.6], [0.5, -0.45]];
      m.loft([S(54, 0, 0), S(36, 8.8, 2.4), S(-36, 24, 7), S(-42, 22, 6)], ['accent', 'hull', 'hull'], { shape: wedge, caps: [undefined, 'dark'] });
      m.box(-36, -14, 5, 9, -7, 7, 'steel');
      m.box(-32, -20, 9, 13, -4.5, 4.5, 'accent');
      m.box(-30, -26, 13, 14.6, -10, 10, 'steel');
      for (let x = -10; x < 34; x += 6) {
        const y = (7 * (54 - x)) / 90;
        m.box(x, x + 2.5, y - 0.6, y + 0.8, -1.6, 1.6, 'dark');
      }
      m.sym(() => {
        m.winRow(-34, -16, 3.6, 7, 7.1);
        m.winRow(-30, -22, 4, 11, 4.6);
        m.loft([S(-6, 0, 0, 0, 25), S(-10, 2.4, 2.4, 0, 25), S(-44, 2.6, 2.6, 0, 25), S(-48, 2, 2, 0, 25)], ['accent', 'hull', 'steel'], { sides: 10, caps: ['ember', 'dark'] });
        m.engine([-42, 0, 11], 3);
        m.engine([-49, 0, 25], 2.2);
      });
      m.engine([-43, 0, 0], 4.5);
    },
  },
  {
    name: 'Tug', nod: 'chunky bounty-hunter tug with a big drive',
    build: (m) => {
      m.loft([S(36, 2.5, 2, 1), S(30, 6, 4.5, 0.5), S(4, 8, 6), S(-18, 7, 6), S(-24, 6, 5)], ['glass', 'hull', 'hull', 'hull'], { sides: 12, sq: 4 });
      m.loft([S(-22, 5, 5), S(-28, 9, 9), S(-38, 11.5, 11.5), S(-40, 11, 11)], ['steel', 'accent', 'dark'], { sides: 14, caps: [undefined, 'dark'] });
      m.sym(() => {
        m.prism([[16, 6], [30, 30], [22, 33], [-4, 7]], -2, -0.6, 'xz', 'accent');
        m.loft([S(36, 0, 0, -1.3, 32), S(32, 2.2, 2.2, -1.3, 32), S(12, 2.4, 2.4, -1.3, 32), S(9, 1.8, 1.8, -1.3, 32)], ['hull', 'hull', 'steel'], { sides: 10, caps: [undefined, 'dark'] });
        m.winRow(-12, 18, 6, 1.5, 8);
        m.engine([8, -1.3, 32], 2);
      });
      m.engine([-41, 0, 0], 8);
    },
  },
  {
    name: 'Lancer', nod: 'slim cruiser in sweeping arcs',
    build: (m) => {
      m.loft([S(52, 0, 0), S(40, 3, 2.4), S(14, 5, 4), S(-30, 4.4, 3.6), S(-40, 3.2, 3)], ['steel', 'hull', 'hull', 'steel'], { sides: 12, caps: [undefined, 'dark'] });
      const taper = (s: number) => 0.9 + 0.9 * Math.sin(Math.PI * s);
      m.tube(arc(34, -36, 3, 0, 18, 0), taper, 'accent', { sides: 6 });
      m.sym(() => {
        m.tube(arc(34, -36, -1, 2, -9, 15), taper, 'accent', { sides: 6 });
        m.loft([S(-30, 0, 0, 0, 6), S(-34, 2.6, 2.6, 0, 6), S(-46, 2.6, 2.6, 0, 6), S(-48, 2, 2, 0, 6)], 'hull', { sides: 10, caps: [undefined, 'dark'] });
        m.winRow(-26, 30, 6, 1.8, 4.3);
        m.engine([-49, 0, 6], 3);
      });
    },
  },
  {
    name: 'Hauler', nod: 'industrial mining hauler with claws',
    build: (m) => {
      m.loft([S(46, 7, 2, -2), S(40, 9, 4, -1), S(-40, 9, 5), S(-48, 8, 4.5)], ['steel', 'hull', 'hull'], { sides: 12, sq: 8, caps: [undefined, 'dark'] });
      m.box(-38, 16, 3.8, 9, -6.5, 6.5, 'hull');
      m.box(-34, -20, 9, 15, -4, 4, 'accent');
      m.box(-36, -18, 15, 16.4, -5, 5, 'steel');
      [20, 25, 30, 35].forEach((x, i) => {
        m.box(x, x + 4, 3.8, 6.4, -6, -0.4, i % 2 ? 'accent' : 'dark');
        m.box(x, x + 4, 3.8, 6.4, 0.4, 6, i % 2 ? 'dark' : 'accent');
      });
      m.sym(() => {
        m.loft([S(40, 2.6, 2.6, -3, 6), S(52, 1.8, 2, -3.5, 6.5), S(60, 0.2, 0.4, -5, 7)], 'steel', { sides: 6 });
        for (let x = -40; x < 14; x += 8) m.box(x, x + 1.6, -4, 3.8, 8.8, 9.6, 'dark');
        m.winRow(-34, 14, 4, 6.5, 6.6);
        m.winRow(-32, -22, 3.4, 12.5, 4.1);
        m.tube([[-24, -2, 9], [-30, -6, 19]], 1.4, 'steel', { sides: 4 });
        m.loft([S(-8, 0, 0, -6, 20), S(-12, 3, 3, -6, 20), S(-46, 3.2, 3.2, -6, 20), S(-50, 2.2, 2.2, -6, 20)], ['accent', 'hull', 'steel'], { sides: 12, caps: ['ember', 'dark'] });
        m.box(-40, -16, -2.6, -2, 19, 21, 'accent');
        m.engine([-49, 0, 5], 3.4);
        m.engine([-51, -6, 20], 2.6);
      });
    },
  },
  {
    name: 'Pearl', nod: 'improbably smooth egg with a tail ring',
    build: (m) => {
      m.loft([S(42, 0, 0, -2), S(38, 6, 5, -1.5), S(30, 10, 8.5, -0.5), S(16, 13, 11), S(0, 13.5, 11.5, 0.5), S(-14, 12, 10.5, 1), S(-26, 9, 8, 1.5), S(-34, 5, 4.6, 1.5), S(-37, 0, 0, 1.5)],
        ['hull', 'hull', 'hull', 'accent', 'hull', 'hull', 'hull', 'hull'], { sides: 18 });
      m.prism([[-12, 10], [-28, 15], [-32, 15], [-30, 8]], -0.7, 0.7, 'xy', 'accent');
      // The ring in short arcs, each sorted on its own, so it passes in front of and behind the tail.
      for (let k = 0; k < 8; k++) {
        const pts = Array.from({ length: 4 }, (_, j): V3 => {
          const t = ((k + j / 3) * Math.PI) / 4;
          return [-30, 1.5 + Math.sin(t) * 12, Math.cos(t) * 12];
        });
        m.tube(pts, 1.4, 'accent', { sides: 6 });
      }
      m.sym(() => {
        m.winRow(-6, 16, 5.5, 3, 13.3, [0, 0.25, 1]);
        m.prism([[8, 10], [-16, 30], [-26, 31], [-18, 9]], -3.4, -2.4, 'xz', 'accent');
        m.loft([S(-12, 0, 0, -2.9, 30.5), S(-15, 1.5, 1.5, -2.9, 30.5), S(-27, 1.5, 1.5, -2.9, 30.5), S(-29, 1, 1, -2.9, 30.5)], 'hull', { sides: 8 });
      });
      m.engine([-38, 1.5, 0], 4);
    },
  },
  {
    name: 'Frigate', nod: 'hard-science drive ship with outboard drives',
    build: (m) => {
      m.loft([S(48, 0, 0), S(44, 4), S(32, 7.5), S(30, 8.5), S(12, 8.5), S(10, 5), S(6, 5)], ['steel', 'hull', 'steel', 'hull', 'dark', 'dark'], { sides: 12 });
      m.loft([S(6, 10), S(-18, 10)], 'accent', { sides: 8, caps: ['dark', 'dark'] });
      for (const [y, z] of [[5, 5], [5, -5], [-5, 5], [-5, -5]] as const) m.tube([[-18, y, z], [-32, y, z]], 0.8, 'steel', { sides: 4 });
      m.tube([[-18, 5, 5], [-32, -5, 5]], 0.6, 'steel', { sides: 4 });
      m.tube([[-18, 5, -5], [-32, -5, -5]], 0.6, 'steel', { sides: 4 });
      m.loft([S(-32, 6), S(-36, 8), S(-44, 11)], ['steel', 'dark'], { sides: 14, caps: [undefined, 'ember'] });
      m.sym(() => {
        m.prism([[-4, 8], [-22, 18], [-28, 18], [-16, 8]], -0.6, 0.6, 'xz', 'steel');
        m.loft([S(-6, 0, 0, 0, 19), S(-10, 3, 3, 0, 19), S(-36, 3.2, 3.2, 0, 19), S(-40, 2.4, 2.4, 0, 19)], ['accent', 'hull', 'steel'], { sides: 12, caps: ['glow', 'dark'] });
        m.winRow(14, 28, 3.5, 2, 8.6, [0, 0.2, 1]);
        m.engine([-41, 0, 19], 2.6);
      });
      m.engine([-45, 0, 0], 9, true);
    },
  },
  {
    name: 'Dragonfly', nod: 'segmented organic bio-ship',
    build: (m) => {
      m.loft([S(52, 0, 0), S(49, 5), S(44, 9, 8.5), S(36, 9.5, 9), S(28, 6), S(25, 3)], ['hull', 'hull', 'accent', 'hull', 'steel'], { sides: 16 });
      let x = 23;
      let r = 4.4;
      for (let i = 0; i < 7; i++) {
        const len = 7.5;
        m.loft([S(x, r * 0.6), S(x - 1.5, r), S(x - len + 1.5, r), S(x - len, r * 0.6)], i % 2 ? 'accent' : 'hull', { sides: 10 });
        x -= len + 0.6;
        r *= 0.88;
      }
      m.sym(() => {
        m.prism([[16, 3], [6, 34], [-6, 36], [6, 3]], 0.8, 1.3, 'xz', 'accent');
        m.prism([[0, 3], [-12, 26], [-22, 27], [-8, 3]], 0.8, 1.3, 'xz', 'accent');
        m.win([47, 4.5, 2.5], [0.6, 0.6, 0.5]).win([44, 6.5, 4.5], [0.3, 0.7, 0.6]);
      });
      m.engine([x - 1, 0, 0], 2.5);
    },
  },
  {
    name: 'Starliner', nod: 'mid-century liner with Googie fins',
    build: (m) => {
      m.loft([S(50, 0, 0, -1), S(44, 5, 4, -0.5), S(22, 8, 6), S(-34, 8, 6), S(-48, 5.5, 4.4)], ['accent', 'hull', 'hull', 'hull'], { sides: 12, sq: 3, caps: [undefined, 'dark'] });
      m.box(-30, 24, 5, 9, -6, 6, 'hull');
      m.box(-20, 12, 9, 12.5, -4.6, 4.6, 'hull');
      m.box(-12, 2, 12.5, 15.5, -3, 3, 'accent');
      m.prism([[-22, 12], [-36, 20], [-40, 20], [-36, 10]], -0.6, 0.6, 'xy', 'accent');
      m.sym(() => {
        m.prism([[-26, 4], [-42, 15], [-48, 15], [-44, 2]], 5.5, 6.7, 'xy', 'accent');
        m.prism([[12, 6], [-14, 26], [-24, 27], [-18, 6]], -2.6, -1.6, 'xz', 'hull');
        m.loft([S(-6, 0, 0, -2.1, 27), S(-10, 1.8, 1.8, -2.1, 27), S(-28, 1.8, 1.8, -2.1, 27), S(-31, 1.2, 1.2, -2.1, 27)], 'accent', { sides: 8, caps: ['ember'] });
        m.winRow(-40, 40, 4.5, 1.4, 8.1);
        m.winRow(-28, 22, 4.5, 7, 6.1);
        m.winRow(-18, 10, 4.5, 10.7, 4.7);
        m.engine([-49, 0, 2.5], 3, true);
      });
    },
  },
];

export interface ShipDesign { hull: number; livery: number }

export function shipDesign(seed: number): ShipDesign {
  const s = seed >>> 0;
  return { hull: s % HULLS.length, livery: Math.floor(s / HULLS.length) % LIVERIES.length };
}

/** A seed with this design (the inverse of shipDesign), for the gallery. */
export const seedFor = (hull: number, livery: number) => hull + livery * HULLS.length;

export function shipColors(seed: number): [number, number] {
  const l = LIVERIES[shipDesign(seed).livery]!;
  return [l.hull, l.accent];
}

/** The render footprint: 44 × 28 units (radius 22 at scale 1), the same for every class (INV-19). */
const BASE_R = 22;
const FIT = { width: 44, height: 28 };

const renders = new Map<string, [HullRender, HullRender]>();
const models = new Map<number, HullModel>();

function rendersFor(d: ShipDesign): [HullRender, HullRender] {
  const key = `${d.hull}:${d.livery}`;
  let r = renders.get(key);
  if (!r) {
    let model = models.get(d.hull);
    if (!model) {
      model = new HullModel();
      HULLS[d.hull]!.build(model);
      models.set(d.hull, model);
    }
    const l = LIVERIES[d.livery]!;
    const palette: Palette = { hull: l.hull, accent: l.accent, ...MATERIALS };
    const east = renderHull(model, palette, 1, FIT);
    r = [east, renderHull(model, palette, -1, { ...FIT, k: east.k })];
    renders.set(key, r);
  }
  return r;
}

interface Heading { root: Container; engines: Graphics; lights: WindowLights }

export class ShipView {
  readonly root = new Container();
  private readonly bob = new Container();
  private readonly headings: Heading[];
  private heading = 0;
  private readonly seedPhase: number;

  constructor(seed: number, private readonly size: number) {
    const d = shipDesign(seed);
    this.headings = rendersFor(d).map((r) => {
      const root = new Container();
      const engines = new Graphics();
      for (const e of r.engines) drawExhaust(engines, e);
      engines.blendMode = 'add';
      // The baked hull is shared by every ship of this design (bounded by classes × liveries).
      const hull = new Graphics(r.context);
      const lights = new WindowLights(r.windows, 0.85, seed, undefined, 'breathe');
      root.addChild(engines, hull, ...lights.groups);
      this.bob.addChild(root);
      return { root, engines, lights };
    });
    this.bob.scale.set(size / BASE_R);
    this.root.addChild(this.bob);
    this.seedPhase = (seed % 101) / 13;
    this.face(1);
  }

  /** Point east (+x, 1) or west (−x, −1): each heading is its own lit render, not a mirror. */
  face(dir: number): void {
    this.heading = dir < 0 ? 1 : 0;
    this.headings.forEach((h, i) => (h.root.visible = i === this.heading));
  }

  setStage(): void {}

  tick(seconds: number): void {
    // Decorative idle: a slow drift, clearly not an event (05 §5).
    // The bob fades out in fast playback (silly at 4×) and in reduced motion (05 §5, §7).
    this.bob.y = Math.sin(seconds * 0.9 + this.seedPhase) * (this.size * 0.03) * motion.jiggle;
    const h = this.headings[this.heading]!;
    // Heroes breathe: engines swell with the windows on one slow pulse (identity, not state, 09 §5).
    h.engines.alpha = motion.reduced ? 0.8 : 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((2 * Math.PI * motion.pulseTime) / BREATH_PERIOD + this.seedPhase));
    h.lights.tick(motion.reduced ? 0 : motion.pulseTime);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A glow at the nozzle and a short plume trailing behind, along the ship's own axis. */
function drawExhaust(g: Graphics, e: HullRender['engines'][number]): void {
  const c = e.hot ? 0xffb07a : 0xa8f0ea;
  const len = Math.hypot(e.bx, e.by) || 1;
  const [ux, uy] = [e.bx / len, e.by / len];
  const [px, py] = [-uy, ux];
  const reach = e.r * 2.6;
  const w = e.r * 0.85;
  g.poly([e.x + px * w, e.y + py * w, e.x + ux * reach, e.y + uy * reach, e.x - px * w, e.y - py * w]).fill({ color: c, alpha: 0.22 });
  g.circle(e.x, e.y, e.r * 1.15).fill({ color: c, alpha: 0.2 });
  g.circle(e.x, e.y, e.r * 0.65).fill({ color: lighten(c, 0.6), alpha: 0.9 });
}

/** A secondary assignment marker in the captain's colors (INV-07): a small lit buoy. */
export class BeaconView {
  readonly root = new Container();
  private readonly g = new Graphics();

  constructor(seed: number, size: number) {
    const [hull, trim] = shipColors(seed);
    const s = size;
    this.g.circle(0, 0, s * 1.4).fill({ color: trim, alpha: 0.14 });
    this.g.poly([s, 0, 0, -s, -s, 0, 0, s]).fill(topLit(mix(STEEL, hull, 0.5))).stroke({ width: 1, color: trim });
    this.g.circle(0, 0, s * 0.28).fill({ color: lighten(trim, 0.4) });
    this.root.addChild(this.g);
  }

  setStage(): void {}
  tick(seconds: number): void {
    this.g.alpha = 0.7 + 0.3 * Math.sin(seconds * 2.2);
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}
