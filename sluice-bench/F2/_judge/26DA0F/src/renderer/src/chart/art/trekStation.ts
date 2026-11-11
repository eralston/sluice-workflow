// The Trek repository station's two forms (art session 2026-10-12): it begins as a bare spacedock, a
// saucer-topped core on a long spire (the look of the old movie-era space station), and when the first
// PR merges into it, it grows into a Deep Space Nine-style station: a habitat ring on spokes, crossover
// bridges, a broad docking ring with weapon sponsons, and three pylons that sweep up and down from it.
//
// Seven pieces: the core (in both forms, the same solid), the habitat ring with its spokes, the three
// bridges, the docking ring, and the three pylon pairs. In the first form only the core is there; the
// rest grow out of the form's origin as the transformation plays (stationRig.ts).
//
// Model space as hull3d.ts: +y is up; the rings lie in the xz plane.
import { HullModel, type V3 } from './hull3d';
import type { Pose, Rig, RigPose } from './stationRig';

/** Points on a circle in the xz plane. */
const onRing = (r: number, deg: number, y: number): V3 => {
  const t = (deg * Math.PI) / 180;
  return [Math.cos(t) * r, y, Math.sin(t) * r];
};
const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);
const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);

type Name = 'core' | 'inner' | 'bridges' | 'outer' | 'pylon30' | 'pylon150' | 'pylon270';
const NAMES: Name[] = ['core', 'inner', 'bridges', 'outer', 'pylon30', 'pylon150', 'pylon270'];

interface Def {
  build: (m: HullModel) => void;
  /** Two points along the piece's long axis: they give its size and heading. */
  fore: V3;
  aft: V3;
  nav?: V3[];
}

const core: Def = {
  build: (m) => {
    // A stacked core: an ops dome above, a broad disc, and a long reactor spire below.
    m.lathe([[0, 30], [2.5, 29.5], [4, 27], [5, 22], [7, 19], [9, 17], [10, 13], [16, 11], [20, 8.5], [23, 5], [24, 2], [24, -2], [21, -5], [15, -8], [11, -11], [9, -16], [8, -22], [6, -28], [4, -34], [2, -39], [0, -41]],
      ['steel', 'steel', 'hull', 'accent', 'hull', 'dark', 'hull', 'hull', 'accent', 'hull', 'dark', 'hull', 'hull', 'steel', 'hull', 'dark', 'hull', 'steel', 'glow', 'glow'], { sides: 24 });
    for (let i = 0; i < 24; i++) {
      const t = (360 * i) / 24;
      const n: V3 = [cos(t), 0, sin(t)];
      m.win(onRing(24.2, t, 0), n).win(onRing(20.4, t + 7, 7), [n[0], 0.5, n[2]]);
      if (i % 2) m.win(onRing(9.4, t, -14), n);
    }
  },
  fore: [0, 30, 0], aft: [0, -41, 0],
  nav: [[0, 30.4, 0]],
};

const inner: Def = {
  build: (m) => {
    m.torus([0, 0, 0], 35, 4.4, 'xz', 'hull', { segments: 24, sides: 6 });
    for (let i = 0; i < 6; i++) m.tube([onRing(23, i * 60 + 30, 0), onRing(31, i * 60 + 30, 0)], 1.3, 'steel', { sides: 4 });
    for (let i = 0; i < 32; i++) {
      const t = (360 * (i + 0.5)) / 32;
      m.win(onRing(39.6, t, 0.6), [cos(t), 0.25, sin(t)]);
    }
  },
  fore: [35, 0, 0], aft: [-35, 0, 0],
};

const bridges: Def = {
  build: (m) => {
    for (const t of [90, 210, 330]) m.tube([onRing(39, t, 0), onRing(54, t, 0)], 2, 'steel', { sides: 4 });
  },
  fore: [54, 0, 0], aft: [-54, 0, 0],
};

const outer: Def = {
  build: (m) => {
    m.torus([0, 0, 0], 57, 3.6, 'xz', 'hull', { segments: 32, sides: 6 });
    m.torus([0, 1.6, 0], 57, 2.2, 'xz', 'accent', { segments: 32, sides: 4 });
    // A weapon sponson where each bridge meets the docking ring.
    for (const t of [90, 210, 330]) {
      const [x, , z] = onRing(57, t, 0);
      m.box(x - 3.4, x + 3.4, 2.4, 5.4, z - 3.4, z + 3.4, 'dark', { bias: 2 });
      m.lathe([[2.4, 5.4], [1.6, 7.2], [0, 7.6]], 'steel', { cx: x, cz: z, sides: 10, bias: 3 });
    }
    for (let i = 0; i < 32; i++) {
      const t = (360 * (i + 0.5)) / 32;
      if (i % 2) m.win(onRing(60.8, t + 3, -0.4), [cos(t), 0.1, sin(t)]);
    }
  },
  fore: [57, 0, 0], aft: [-57, 0, 0],
};

/** A pylon pair: one arc sweeping up and one down from the docking ring, curling back in like claws. */
const pylon = (t: number): Def => {
  const tip = (up: number): V3 => pathOf(t, up)[10]!;
  return {
    build: (m) => {
      for (const up of [1, -1]) {
        const path = pathOf(t, up);
        m.tube(path, (s) => 2.9 - 1.9 * s, up > 0 ? 'hull' : 'steel', { sides: 6 });
        m.lathe([[1.6, -1.6], [1.6, 1.6]], 'accent', { cx: path[8]![0], cy: path[8]![1], cz: path[8]![2], sides: 8 });
      }
    },
    fore: tip(1), aft: tip(-1),
    nav: [tip(1), tip(-1)],
  };
};

const pathOf = (t: number, up: number): V3[] => Array.from({ length: 11 }, (_, j): V3 => {
  const s = j / 10;
  const rho = 58 + 8 * Math.sin(Math.PI * s * 0.85) - 15 * s * s;
  return onRing(rho, t, up * 27 * s);
});

const DEFS: Record<Name, Def> = { core, inner, bridges, outer, pylon30: pylon(30), pylon150: pylon(150), pylon270: pylon(270) };

const built = new Map<Name, HullModel>();
function pieceOf(name: Name): HullModel {
  let m = built.get(name);
  if (!m) {
    m = new HullModel();
    DEFS[name].build(m);
    built.set(name, m);
  }
  return m;
}

/** The first form: the core alone, hardpoints on it. The second: the whole station, hardpoints on its rings. */
const HARD = {
  ship: {
    turrets: [90, 330, 210].map((t) => onRing(16, t, 10)),
    pd: [20, 60, 110].map((t) => onRing(21, t, 3.4)),
    bays: [onRing(24.4, 75, 0), onRing(24.4, 20, 0), onRing(24.4, 130, 0), onRing(24.4, 200, 0)],
    reactor: [[0, -38, 0]] as V3[],
  },
  robot: {
    turrets: [90, 330, 210].map((t) => onRing(57, t, 7.8)),
    pd: [20, 60, 110].map((t) => onRing(35, t, 4.6)),
    bays: [onRing(60.6, 100, 0), onRing(60.6, 25, 0), onRing(24.4, 75, 0), onRing(60.6, 62, 0)],
    reactor: [[0, -38, 0]] as V3[],
  },
};

function trekPose(pose: Pose): RigPose {
  const model = new HullModel();
  const groups = NAMES.map((name) => {
    const there = pose === 'robot' || name === 'core';
    if (!there) return { name, model: null };
    const piece = pieceOf(name);
    model.append(piece.transformed({}));
    for (const b of DEFS[name].nav ?? []) model.beacon(b);
    const alone = piece.transformed({});
    alone.beacons.push([0, 0, 0], DEFS[name].fore, DEFS[name].aft);
    return { name, model: alone };
  });
  return { model, ...HARD[pose], groups };
}

/** The Trek station as a transformation rig (stationRig.ts): the rings open outward from the core, then the pylons unfold. */
export const TREK_RIG: Rig = {
  names: NAMES,
  start: { core: 0, inner: 0.02, outer: 0.2, bridges: 0.3, pylon30: 0.55, pylon150: 0.65, pylon270: 0.75 },
  span: 0.25,
  seconds: 3.6,
  pose: (pose) => trekPose(pose),
};
