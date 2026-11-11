// The Mecha repository station's two forms (art session 2026-10-12): a Macross-style fortress that
// arrives as a streamlined carrier and, when the first PR merges into it, stands up as a giant robot.
//
// It is built as eight rigid groups: the torso (the main hull), the head (the stern's command tower),
// two legs (the twin cannon booms), two arms (the flank flight-deck carriers) and two back-pack
// spires (the stern drive blocks). The ship pose is each group where it always was; the robot pose is
// the SAME solids re-placed (turned upright, scaled a little, shifted), plus a few robot-only extras
// (fists, feet, thruster caps). The transformation is those groups sliding and turning between their
// two placements, each swapping from its ship look to its robot look as it passes the midpoint; no
// part is modelled twice. Hardpoints ride on the group they sit on, so they land where the pose wants.
//
// Model space as hull3d.ts: +x is the bow, +y up, +z starboard. The robot faces +x, stands on y = −96.
import { HullModel, placer, S, type V3, type Xf } from './hull3d';
import type { Pose, Rig, RigPose } from './stationRig';

export type { Pose };

type GroupName = 'hull' | 'head' | 'legS' | 'legP' | 'armS' | 'armP' | 'packS' | 'packP' | 'cannon';
export const GROUP_NAMES: GroupName[] = ['hull', 'head', 'legS', 'legP', 'armS', 'armP', 'packS', 'packP', 'cannon'];

interface Def {
  /** Builds the group in ship coordinates. */
  ship: (m: HullModel) => void;
  /** Where the robot pose puts the group (ship coordinates in, robot coordinates out). */
  xf: Xf;
  /** Robot-only parts, already in robot coordinates. */
  extras?: (m: HullModel) => void;
  /** Two points along the group's long axis, ship coordinates: they give its length and heading in each pose. */
  fore: V3;
  aft: V3;
  /** Navigation beacons riding on the group. */
  nav?: V3[];
}

const DEG = Math.PI / 180;
/** Ship +x becomes robot −y (down), ship −x up, ship +y forward (+x). */
const STAND = -90 * DEG;

const hull: Def = {
  ship: (m) => {
    m.loft([S(26, 12, 9, 6), S(16, 15, 12, 4), S(-48, 17, 14, 3), S(-66, 15, 12, 3)], ['accent', 'hull', 'steel'], { sides: 8, sq: 8, caps: [undefined, 'dark'] });
    m.box(-6, 26, 15.6, 16.6, -6, 6, 'dark', { bias: 2 });
    m.lathe([[3, 0], [2.4, 2.2], [0, 2.6]], 'steel', { cx: -58, cy: 17, cz: 10, sides: 10, bias: 4 });
    for (const sg of [1, -1]) {
      m.winRow(-44, 12, 4, 9, 15.2 * sg, [0, 0, sg]);
      m.winRow(-44, 12, 4, 3, 15.2 * sg, [0, 0, sg]);
    }
  },
  xf: { pivot: [26, 3, 0], s: [0.62, 1, 1.6], rz: STAND, t: [0, -2, 0] },
  extras: (m) => {
    // A chest plate and a belt: the torso's robot marks.
    m.box(14, 17, 22, 40, -18, 18, 'steel', { bias: 3 });
    m.box(10, 15, 6, 12, -26, 26, 'accent', { bias: 2 });
  },
  fore: [26, 3, 0], aft: [-66, 3, 0],
  nav: [[-104, 6.4, 0]],
};

const head: Def = {
  ship: (m) => {
    m.box(-52, -22, 17, 25, -9, 9, 'hull', { bias: 3 });
    m.box(-48, -26, 25, 32, -7, 7, 'accent', { bias: 4 });
    m.box(-46, -28, 32, 38, -6, 6, 'hull', { bias: 5 });
    m.box(-28.6, -27.6, 33, 36.6, -5, 5, 'glass', { bias: 6 });
    m.box(-43, -31, 38, 41, -4, 4, 'steel', { bias: 6 });
    m.tube([[-37, 41, 0], [-37, 49, 0]], 0.55, 'steel', { sides: 4, bias: 6 });
    for (let x = -46; x <= -30; x += 4) m.win([x, 28.5, 7.1], [0, 0, 1]);
  },
  xf: { pivot: [-37, 17, 0], s: [1.05, 1.05, 1.05], t: [5, 55, 0] },
  extras: (m) => {
    // Two cheek vents either side of the visor.
    for (const sg of [1, -1]) m.box(-9, 7, 62, 70, sg * 12, sg * 14, 'dark', { bias: 7 });
  },
  fore: [-37, 41, 0], aft: [-37, 17, 0],
  nav: [[-37, 49.4, 0]],
};

/** A leg (a cannon boom): it runs far forward on the ship, and hangs down as a stout leg on the robot. */
const leg = (sg: 1 | -1): Def => ({
  ship: (m) => {
    const z = 11 * sg;
    m.loft([S(-8, 5, 7, 22, z), S(110, 5, 7, 22, z), S(114, 6, 8.6, 22, z), S(128, 6, 8.6, 22, z), S(132, 4.4, 6.6, 22, z)],
      ['hull', 'steel', 'accent', 'dark'], { sides: 8, sq: 8, caps: ['steel', 'dark'], bias: sg > 0 ? 3 : 1 });
    for (const x of [36, 74]) m.box(x, x + 4, 14.6, 29.4, z - 5.4, z + 5.4, 'steel', { bias: (sg > 0 ? 3 : 1) + 0.5 });
    m.winRow(0, 104, 4.4, 24, 16.1 * sg, [0, 0, sg]);
  },
  xf: { pivot: [-8, 22, 11 * sg], s: [0.54, 1.8, 1.9], rz: STAND, t: [2, -4, 19 * sg] },
  extras: (m) => {
    // A broad foot with three toes, and a thruster underneath (the robot's feet carry its landing burn).
    const z = 19 * sg;
    m.box(-10, 24, -86, -77, z - 12, z + 12, 'steel', { bias: 3 });
    for (const dz of [-8, 0, 8]) m.box(16, 28, -86, -81, z + dz - 3, z + dz + 3, 'accent', { bias: 4 });
    m.engine([6, -86, z], 4, true);
  },
  fore: [132, 22, 11 * sg], aft: [-8, 22, 11 * sg],
  nav: [[132, 22, 11 * sg]],
});

/** An arm (a flight-deck carrier): a long flank hull on the ship, hanging from the shoulder on the robot. */
const arm = (sg: 1 | -1): Def => ({
  ship: (m) => {
    const z = 31 * sg;
    m.loft([S(86, 2, 2, -1, z), S(78, 7, 5, -1, z), S(-42, 7.5, 6, -1, z), S(-50, 6, 5, -1, z)], ['accent', 'hull', 'hull'], { sides: 8, sq: 8, caps: ['dark', 'dark'], bias: 1 });
    m.box(-40, 76, 4.6, 5.6, Math.min(25 * sg, 37 * sg), Math.max(25 * sg, 37 * sg), 'dark', { bias: 2 });
    m.box(-24, 60, 5.6, 6, Math.min(30.6 * sg, 31.4 * sg), Math.max(30.6 * sg, 31.4 * sg), 'steel', { bias: 3 });
    m.box(-30, 10, -4, 6, Math.min(14 * sg, 25 * sg), Math.max(14 * sg, 25 * sg), 'steel');
    m.winRow(-38, 72, 4.4, -1, 38.2 * sg, [0, 0, sg]);
    if (sg > 0) {
      m.lathe([[3, 0], [2.4, 2.2], [0, 2.6]], 'steel', { cx: 60, cy: 6, cz: 35, sides: 10, bias: 4 });
      m.lathe([[3, 0], [2.4, 2.2], [0, 2.6]], 'steel', { cx: -10, cy: 6, cz: 35, sides: 10, bias: 4 });
    }
  },
  xf: { pivot: [-50, -1, 31 * sg], s: [0.5, 1.6, 1.5], rz: STAND, t: [0, 50, 41 * sg] },
  extras: (m) => {
    // A shoulder cap and a fist.
    const z = 41 * sg;
    m.box(-13, 13, 46, 57, z - 13, z + 13, 'steel', { bias: 3 });
    m.box(-12, 12, -34, -16, z - 11, z + 11, 'steel', { bias: 3 });
    m.box(-13, 13, -30, -24, z - 12, z + 12, 'dark', { bias: 4 });
  },
  fore: [86, -1, 31 * sg], aft: [-50, -1, 31 * sg],
});

/** A back-pack spire (a stern drive block): a block of engines on the ship, a thruster tower on the robot. */
const pack = (sg: 1 | -1): Def => ({
  ship: (m) => {
    m.box(-104, -62, -20, 6, Math.min(6 * sg, 17 * sg), Math.max(6 * sg, 17 * sg), 'steel');
    m.box(-100, -66, -3, 1, Math.min(16.6 * sg, 17.4 * sg), Math.max(16.6 * sg, 17.4 * sg), 'accent', { bias: 1 });
    m.engine([-105, -8, 11.5 * sg], 5);
  },
  xf: { pivot: [-62, -7, 11.5 * sg], s: [0.8, 1.2, 1.3], rz: STAND, t: [-21, 40, 27 * sg] },
  extras: (m) => {
    // The spire's cap: a lit thruster mouth.
    const z = 27 * sg;
    m.box(-36, -6, 72, 74.6, z - 7, z + 7, 'ember', { bias: 3 });
    m.box(-38, -4, 69, 72, z - 9, z + 9, 'dark', { bias: 2 });
  },
  fore: [-62, -7, 11.5 * sg], aft: [-104, -7, 11.5 * sg],
});

/**
 * The main cannon: a long barrel nestled between the booms on the ship (the glow gathers along it as
 * the work nears done), and in the robot's right fist, held forward. The barrel carries over.
 */
const cannon: Def = {
  ship: (m) => {
    m.loft([S(26, 4.4, 4.4, 22, 0), S(40, 5.4, 5, 22, 0), S(46, 3.4, 3.2, 22, 0), S(120, 3.4, 3.2, 22, 0), S(124, 4.6, 4.2, 22, 0), S(132, 4.6, 4.2, 22, 0)],
      ['steel', 'hull', 'dark', 'accent', 'dark'], { sides: 8, sq: 6, caps: ['steel', 'glow'], bias: 2 });
    m.box(60, 64, 19.6, 24.4, -4.4, 4.4, 'steel', { bias: 3 });
    m.box(88, 92, 19.6, 24.4, -4.4, 4.4, 'steel', { bias: 3 });
  },
  xf: { pivot: [30, 22, 0], s: [0.62, 1.5, 1.5], rz: -8 * DEG, t: [-4, -24, 41] },
  fore: [132, 22, 0], aft: [30, 22, 0],
};

const DEFS: Record<GroupName, Def> = { hull, head, legS: leg(1), legP: leg(-1), armS: arm(1), armP: arm(-1), packS: pack(1), packP: pack(-1), cannon };

/** A hardpoint: where it sits on its group in ship coordinates, and (optionally) a different spot for the robot. */
interface Hard { g: GroupName; p: V3; robot?: V3 }

const HARD = {
  turrets: [{ g: 'armS', p: [60, 8.6, 35] }, { g: 'hull', p: [-58, 19.6, 10] }, { g: 'armS', p: [-10, 8.6, 35] }],
  pd: [{ g: 'legS', p: [122, 30.6, 11] }, { g: 'armS', p: [84, 5.6, 27] }, { g: 'packS', p: [-92, 6.4, 12] }],
  bays: [{ g: 'armS', p: [-46, -3, 38.2] }, { g: 'armP', p: [85, -1, -31] }, { g: 'hull', p: [26, 7, 7], robot: [-14, 16, 0] }, { g: 'armS', p: [85, -1, 31] }],
  reactor: [{ g: 'hull', p: [26, 22, 0], robot: [-24, 17, 0] }],
} satisfies Record<string, Hard[]>;

/** A ship-coordinate point on a group, in the robot pose (placed, then turned toward the viewer). */
function posedAt(name: GroupName, dir: number): (p: V3) => V3 {
  const [place, turn] = [placer(DEFS[name].xf), placer({ ry: yawOf(dir) })];
  return (p) => turn(place(p));
}

const posedAtPose = (name: GroupName, pose: Pose, dir: number): ((p: V3) => V3) => (pose === 'ship' ? (p) => p : posedAt(name, dir));

export interface MechaPose {
  /** The whole station, with its navigation beacons first (then none; the hardpoints are separate). */
  model: HullModel;
  turrets: V3[]; pd: V3[]; bays: V3[]; reactor: V3[];
  /** The main cannon's root and muzzle: between the booms on the ship, in the right fist on the robot. */
  cannon: [V3, V3];
  /** Each group alone, in this pose, with beacons [origin, fore, aft] (for the transformation's pieces). */
  groups: { name: GroupName; model: HullModel }[];
}

const shipGroups = new Map<GroupName, HullModel>();
function shipGroup(name: GroupName): HullModel {
  let m = shipGroups.get(name);
  if (!m) {
    m = new HullModel();
    DEFS[name].ship(m);
    shipGroups.set(name, m);
  }
  return m;
}

/** One group in one pose (ship coordinates for the ship; placed, with its robot extras, for the robot). */
function groupIn(name: GroupName, pose: Pose, dir: number): HullModel {
  const d = DEFS[name];
  if (pose === 'ship') return shipGroup(name).transformed({});
  const m = shipGroup(name).transformed(d.xf);
  const extras = new HullModel();
  d.extras?.(extras);
  return m.append(extras).transformed({ ry: yawOf(dir) });
}

/**
 * The robot is turned toward the viewer a little (about 28°) so its arms, legs and shoulders show
 * side by side; at the chart's shared three-quarter view a robot facing straight along its heading
 * would be seen almost in profile. West is the mirror turn, as the camera is.
 */
const yawOf = (dir: number) => -28 * DEG * (dir < 0 ? -1 : 1);

export function mechaPose(pose: Pose, dir = 1): MechaPose {
  const model = new HullModel();
  const groups = GROUP_NAMES.map((name) => {
    const g = groupIn(name, pose, dir);
    const at = pose === 'ship' ? (p: V3) => p : posedAt(name, dir);
    // The piece alone, for the transformation: its beacons are the pose's origin (a shared reference
    // to line pieces up) and the two ends of its axis.
    const alone = g.transformed({});
    alone.beacons.push([0, 0, 0], at(DEFS[name].fore), at(DEFS[name].aft));
    model.append(g);
    for (const b of DEFS[name].nav ?? []) model.beacon(at(b));
    return { name, model: alone };
  });
  const pt = (h: Hard): V3 => {
    const at = pose === 'ship' ? (p: V3) => p : posedAt(h.g, dir);
    return at(pose === 'robot' && h.robot ? h.robot : h.p);
  };
  return {
    model,
    turrets: HARD.turrets.map(pt), pd: HARD.pd.map(pt), bays: HARD.bays.map(pt), reactor: HARD.reactor.map(pt),
    cannon: [posedAtPose('cannon', pose, dir)([30, 22, 0]), posedAtPose('cannon', pose, dir)([132, 22, 0])] as [V3, V3],
    groups,
  };
}

/** The Mecha station as a transformation rig (stationRig.ts). */
export const MECHA_RIG: Rig = {
  names: GROUP_NAMES,
  start: { packS: 0, packP: 0.02, armS: 0.08, armP: 0.1, hull: 0.14, legS: 0.2, legP: 0.22, cannon: 0.3, head: 0.42 },
  span: 0.5,
  seconds: 2.8,
  pose: (pose, dir): RigPose => mechaPose(pose, dir),
};
