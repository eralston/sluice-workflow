// The Wars repository station's two forms (art session 2026-10-12). It is a long, rounded cruiser in
// the manner of the Mon Calamari ships, inspired by them and copying nothing: a bullet-nosed hull of
// stacked, swelling decks, blister pods along its flanks, a keel, and a cluster of drives at its stern.
// From the first PR merged into it, the same cruiser carries a great docking ring: a broad band round
// its after hull on a collar and spokes, with drive nacelles and battery pods, a short dorsal fin with
// an emitter at its tip, and a long ventral fin with a hangar at its foot.
//
// The ring arrives in two halves, the dorsal and the ventral. They jump in out of hyperspace, glide to
// the cruiser and clamp on; the seams glow, and a wave of power runs out over ring and hull
// (stationRig.ts, Dock). The cruiser never moves. Each half is split per heading into what lies in
// front of the hull and what lies behind it, so the far arcs pass behind it while they dock, and the
// second form is built per heading with the same split (its ring parts carry a painter's bias).
//
// Model space as hull3d.ts: +x is the bow, +y up, +z starboard. The ring turns about the x axis; its
// angle φ runs from starboard (0) through up (90).
import { depthOf, HullModel, S, type Mat, type Section, type V3 } from './hull3d';
import type { Dock, DockPiece, Line, Pose, Rig, RigPose, Run } from './stationRig';

const DEG = Math.PI / 180;
/** The hull's cross-section: a superellipse a little fuller than a circle. */
const SQ = 2.2;
const se = (c: number) => Math.sign(c) * Math.pow(Math.abs(c), 2 / SQ);

/** A loft's section at x, between its stations (clamped to its ends). */
function sectionOf(secs: readonly Section[], x: number): Section {
  if (x >= secs[0]!.x) return secs[0]!;
  for (let i = 0; i + 1 < secs.length; i++) {
    const [a, b] = [secs[i]!, secs[i + 1]!];
    if (x >= b.x) {
      const k = (a.x - x) / (a.x - b.x);
      const l = (p: number, q: number) => p + (q - p) * k;
      return { x, w: l(a.w, b.w), h: l(a.h, b.h), y: l(a.y, b.y), z: l(a.z, b.z) };
    }
  }
  return secs[secs.length - 1]!;
}

// ---- The cruiser (both forms) ----

/** The main hull: a blunt, rounded prow, a full body, and a long taper to the drive cluster. */
const HULL: Section[] = [
  S(117, 1.4, 1.3, -1), S(114, 6.4, 6, -1), S(109, 10.4, 9.8, -0.6), S(101, 13.6, 12.8, -0.2),
  S(89, 15.8, 15, 0.2), S(70, 16.8, 16.4, 0.5), S(44, 17, 16.8, 0.6), S(14, 16.4, 16.2, 0.5),
  S(-16, 15.4, 15.2, 0.3), S(-46, 14, 13.8, 0), S(-72, 12.6, 12.4, 0), S(-90, 11.6, 11.2, 0), S(-100, 10.6, 10.2, 0),
];
const HULL_MATS: Mat[] = ['steel', 'steel', 'hull', 'hull', 'hull', 'hull', 'hull', 'hull', 'hull', 'hull', 'accent', 'steel'];
/** The upper decks, stacked on the hull fore and aft of the ring's collar. */
const FORE_DECK: Section[] = [S(99, 2, 1.4, 11.4), S(90, 7.6, 3.8, 14), S(66, 10, 5, 15.4), S(30, 10.2, 5.2, 15.6), S(4, 9, 4.6, 15), S(-8, 3, 2, 14.2)];
const AFT_DECK: Section[] = [S(-40, 2.6, 1.6, 13.6), S(-48, 7, 3.4, 14.4), S(-64, 6.4, 3, 13.4), S(-76, 2, 1.4, 12.4)];
const KEEL: Section[] = [S(92, 2, 1.4, -10.5), S(80, 7, 3.4, -13.6), S(40, 8.6, 4.4, -15.2), S(10, 8, 4, -14.6), S(-6, 2, 1.4, -12)];
/** Blister pods along each flank: [fore x, aft x, angle round the hull, radius]. */
const BLISTERS: [number, number, number, number][] = [[102, 82, 4, 3.4], [74, 46, 10, 4.2], [64, 40, -30, 3.2], [36, 8, -8, 3.8], [-46, -72, 4, 3.6]];
/** Long swelling ridges along the upper flanks, the stacked look of the hull: [fore x, aft x, angle, radius]. */
const RIDGES: [number, number, number, number][] = [[98, -6, 34, 3.4], [-42, -88, 30, 2.8]];
/** Window rows, dashed: [angle round the hull, fore x, aft x]. None under the ring's collar. */
const ROWS: [number, number, number][] = [[54, 96, -86], [20, 106, -94], [-14, 102, -90]];
const COLLAR: [number, number] = [-40, -8];

/** A point on the hull's skin at x, `deg` round from starboard (90 up), lifted `out` off it. */
function skin(x: number, deg: number, out = 0): V3 {
  const s = sectionOf(HULL, x);
  return [x, s.y + (s.h + out) * se(Math.sin(deg * DEG)), s.z + (s.w + out) * se(Math.cos(deg * DEG))];
}
const radial = (deg: number): V3 => [0, Math.sin(deg * DEG), Math.cos(deg * DEG)];
/** A point at radius r about the hull's axis, at x and angle φ. */
const polar = (x: number, r: number, deg: number): V3 => [x, Math.sin(deg * DEG) * r, Math.cos(deg * DEG) * r];
const deckTop = (secs: readonly Section[], x: number) => {
  const s = sectionOf(secs, x);
  return s.y + s.h;
};

/** Battery domes on the decks: [x, the deck], with their muzzles. */
const DOMES: [number, Section[]][] = [[58, FORE_DECK], [6, FORE_DECK], [-56, AFT_DECK]];
const muzzleOf = ([x, deck]: [number, Section[]]): V3 => [x + 6.2, deckTop(deck, x) + 1.6, 0];

function blister(m: HullModel, x0: number, x1: number, deg: number, r: number): void {
  const secs = [0, 0.15, 0.5, 0.85, 1].map((f, i) => {
    const x = x0 - (x0 - x1) * f;
    const rr = [0.3, 0.8, 1, 0.8, 0.3][i]! * r;
    const c = skin(x, deg, -r * 0.35);
    return S(x, rr * 0.75, rr, c[1], c[2]);
  });
  m.loft(secs, ['steel', 'cargo', 'cargo', 'steel'], { sides: 10 });
}

function cruiser(m: HullModel): void {
  m.loft(HULL, HULL_MATS, { sides: 16, sq: SQ, caps: ['steel', 'dark'] });
  m.loft(FORE_DECK, ['steel', 'hull', 'cargo', 'hull', 'steel'], { sides: 12, sq: 2.4 });
  m.loft(AFT_DECK, ['steel', 'cargo', 'steel'], { sides: 12, sq: 2.4 });
  m.loft(KEEL, ['steel', 'steel', 'hull', 'steel'], { sides: 10, sq: 2.4 });
  m.sym(() => {
    for (const [x0, x1, deg, r] of [...BLISTERS, ...RIDGES]) blister(m, x0, x1, deg, r);
    // Dashes of four lit windows, a gap between them.
    for (const [deg, x0, x1] of ROWS) {
      for (let x = x0; x >= x1; x -= 1) {
        if (x >= COLLAR[0] && x <= COLLAR[1]) continue;
        if (Math.round(x0 - x) % 13 < 8 && Math.round(x0 - x) % 2 === 0) m.win(skin(x, deg, 0.15), radial(deg));
      }
    }
    // The drive cluster: four bells round a great central one.
    for (const y of [5.4, -5.4]) {
      m.loft([S(-99, 3.4, 3.4, y, 5.2), S(-104.5, 3, 3, y, 5.2)], 'dark', { sides: 10, caps: ['dark', 'glow'] });
      m.engine([-105, y, 5.2], 3);
    }
  });
  m.loft([S(-99, 5.6, 5.6), S(-105.5, 5, 5)], 'dark', { sides: 12, caps: ['dark', 'glow'] });
  m.engine([-106, 0, 0], 4.6);
  // The command dome forward on the deck, a sensor mast amidships, and the deck batteries.
  m.lathe([[5, 0], [4.6, 1.4], [3.2, 2.6], [0, 3.2]], ['steel', 'glass', 'steel'], { cx: 80, cy: deckTop(FORE_DECK, 80) - 0.3, sides: 14 });
  m.tube([[34, deckTop(FORE_DECK, 34) - 0.4, 0], [32, 31, 0]], 0.8, 'steel', { sides: 5 });
  m.box(28, 36, 29.2, 30, -0.5, 0.5, 'steel');
  for (const d of DOMES) {
    const [x, deck] = d;
    const top = deckTop(deck, x);
    m.lathe([[3, 0], [2.4, 2], [0, 2.4]], 'steel', { cx: x, cy: top - 0.2, sides: 10 });
    m.tube([[x + 1, top + 1.6, 0], muzzleOf(d)], 0.5, 'dark', { sides: 4 });
  }
}

const NAV_SHIP: V3[] = [[118, -1, 0], [32, 31.4, 0], [-97, 10.6, 0]];
const PD: V3[] = [skin(94, 48, 1), skin(16, 60, 1), skin(-70, 50, 1)];
const HULL_BAYS: V3[] = [skin(56, -24, 0.3), skin(-58, -20, 0.3), skin(6, -28, 0.3), skin(88, -18, 0.3)];
const REACTOR: V3[] = [[-106, 0, 0]];

// ---- The docking ring (the second form), in two halves ----

const X_RING = -24;
/** The collar that grips the hull, the broad band on its spokes, the band's accent stripe, and the latch blocks at the seams: [x, radius] outlines. */
const SLEEVE: [number, number][] = [[-13, 16.4], [-13, 19.4], [-16, 20.6], [-32, 20.6], [-35, 19.4], [-35, 16.4]];
const BAND: [number, number][] = [[-16, 38], [-16, 41.6], [-18, 43.4], [-30, 43.4], [-32, 41.6], [-32, 38]];
const STRIPE: [number, number][] = [[-21, 43.3], [-21, 44.1], [-27, 44.1], [-27, 43.3]];
const LATCH: [number, number][] = [[-14, 40.6], [-14, 45.4], [-34, 45.4], [-34, 40.6]];
const R_BAND = 43.6;
const RIM_MATS: Mat[] = ['steel', 'steel', 'hull', 'steel', 'steel', 'dark'];

type Half = 'top' | 'bottom';
const ARC: Record<Half, [number, number]> = { top: [0, 180], bottom: [-180, 0] };
/** What each half carries, by angle: drive nacelles, battery pods, spokes. */
const NACELLES: Record<Half, number[]> = { top: [40, 140], bottom: [-40, -140] };
const PODS: Record<Half, number[]> = { top: [70, 110], bottom: [-15, -165] };
const SPOKES: Record<Half, number[]> = { top: [45, 135], bottom: [-45, -135] };
const R_NACELLE = 47.4;
const R_POD = 46;
const podMuzzle = (deg: number) => polar(-5, R_POD, deg);

/** The dorsal fin's emitter (a charge runs to it) and the ventral fin's hangar mouth (tenders dock there). */
const EMITTER: V3 = [-24.5, 61.6, 0];
const HANGAR: V3 = [-31.5, -94, 0];

/** Whether a part at angle φ sits in front of the hull at a heading. */
const nearAt = (deg: number, dir: number) => depthOf(radial(deg), dir) > 0;
/** The painter's bias that puts a ring part wholly in front of the hull, or wholly behind it. */
const biasAt = (deg: number, dir: number) => (nearAt(deg, dir) ? 60 : -60);

/** One half of the ring at a heading, keeping only the parts in front of the hull, or behind it, or all. */
function ringHalf(m: HullModel, half: Half, dir: number, keep: 'near' | 'far' | 'all'): void {
  const wants = (deg: number) => keep === 'all' || nearAt(deg, dir) === (keep === 'near');
  const [a0, a1] = ARC[half];
  for (let a = a0; a < a1; a += 15) {
    const mid = a + 7.5;
    if (!wants(mid)) continue;
    const o = { bias: biasAt(mid, dir), caps: [a === a0, a + 15 === a1] as [boolean, boolean] };
    m.spin(SLEEVE, a, a + 15, RIM_MATS, o);
    m.spin(BAND, a, a + 15, RIM_MATS, o);
    m.spin(STRIPE, a, a + 15, 'accent', { ...o, bias: o.bias + 1 });
    // Windows along the band, clear of what it carries.
    for (let d = a + 5; d < a + 15; d += 10) {
      const busy = [...NACELLES[half], ...PODS[half], a0, a1].some((q) => Math.abs(q - d) < 9);
      if (!busy) for (const x of [-19, -29]) m.win(polar(x, R_BAND, d), radial(d));
    }
  }
  // The latch blocks at the seams: half of each is on this half.
  for (const [p, q] of half === 'top' ? [[0, 7], [173, 180]] : [[-7, 0], [-180, -173]]) {
    if (wants((p! + q!) / 2)) m.spin(LATCH, p!, q!, 'steel', { bias: biasAt((p! + q!) / 2, dir) + 2, step: 7 });
  }
  for (const deg of SPOKES[half]) {
    if (!wants(deg)) continue;
    for (const x of [-19, -29]) m.tube([polar(x, 20.4, deg), polar(x, 38.4, deg)], 1.5, 'steel', { sides: 6, bias: biasAt(deg, dir) - 1 });
  }
  for (const deg of NACELLES[half]) {
    if (!wants(deg)) continue;
    const [, y, z] = polar(0, R_NACELLE, deg);
    m.loft([S(-8, 0.8, 0.8, y, z), S(-12, 3.4, 3.4, y, z), S(-38, 3.8, 3.8, y, z), S(-44, 3.2, 3.2, y, z)], ['steel', 'hull', 'steel'],
      { sides: 10, caps: ['steel', 'glow'], bias: biasAt(deg, dir) + 2 });
    m.engine(polar(-44.5, R_NACELLE, deg), 2.8);
  }
  for (const deg of PODS[half]) {
    if (!wants(deg)) continue;
    const [, y, z] = polar(0, R_POD, deg);
    m.loft([S(-16, 0.8, 0.8, y, z), S(-19, 2.6, 2.6, y, z), S(-30, 2.6, 2.6, y, z), S(-33, 1, 1, y, z)], ['steel', 'hull', 'steel'], { sides: 8, bias: biasAt(deg, dir) + 2 });
    m.tube([polar(-17, R_POD, deg), podMuzzle(deg)], 0.6, 'dark', { sides: 4, bias: biasAt(deg, dir) + 3 });
  }
  if (half === 'top' && wants(90)) {
    // The short dorsal fin, its leading edge in the accent, the emitter pod at its tip.
    const b = biasAt(90, dir) + 1;
    m.prism([[-17, 42], [-31, 42], [-38, 61], [-28, 61]], -1.8, 1.8, 'xy', 'hull', { bias: b });
    m.tube([[-17, 43, 0], [-28, 61, 0]], 1, 'accent', { sides: 5, bias: b + 1 });
    m.loft([S(-24, 0.8, 0.8, 61.6), S(-27, 2.1, 2.1, 61.6), S(-39, 2.1, 2.1, 61.6), S(-42, 1, 1, 61.6)], ['steel', 'hull', 'steel'], { sides: 8, caps: ['glow', 'steel'], bias: b + 2 });
    for (const z of [1.9, -1.9]) for (const [x, y] of [[-25, 48], [-28, 54]] as const) m.win([x, y, z], [0, 0, Math.sign(z)]);
  }
  if (half === 'bottom' && wants(-90)) {
    // The long ventral fin, raked aft, with the tenders' hangar pod at its foot.
    const b = biasAt(-90, dir) + 1;
    m.prism([[-16, -42], [-32, -42], [-46, -92], [-32, -92]], -2.1, 2.1, 'xy', 'hull', { bias: b });
    m.tube([[-16, -43, 0], [-32, -92, 0]], 1.1, 'accent', { sides: 5, bias: b + 1 });
    m.loft([S(-31, 1.2, 1.2, -94), S(-35, 3.6, 4, -94), S(-51, 3.6, 4, -94), S(-56, 2, 2, -94)], ['steel', 'hull', 'steel'], { sides: 10, caps: ['dark', 'steel'], bias: b + 2 });
    for (const z of [2.2, -2.2]) for (const [x, y] of [[-25, -52], [-28, -62], [-31, -72], [-34, -82]] as const) m.win([x, y, z], [0, 0, Math.sign(z)]);
  }
}

const NAV_RING: V3[] = [[-42.5, 61.6, 0], [-56.5, -94, 0]];

// ---- The forms ----

function warsPose(pose: Pose, dir: number): RigPose {
  const model = new HullModel();
  for (const b of pose === 'robot' ? [...NAV_SHIP, ...NAV_RING] : NAV_SHIP) model.beacon(b);
  cruiser(model);
  if (pose === 'robot') {
    ringHalf(model, 'top', dir, 'all');
    ringHalf(model, 'bottom', dir, 'all');
  }
  const muzzles = DOMES.map(muzzleOf);
  return pose === 'robot'
    ? {
      model, groups: [],
      // A rolling broadside: the forward deck battery, then the ring's pods round from the dorsal side.
      turrets: [muzzles[0]!, ...[70, 110, -15, -165].map(podMuzzle)],
      pd: PD, bays: [HULL_BAYS[0]!, HULL_BAYS[1]!, polar(X_RING, R_BAND + 0.2, 20), HANGAR], reactor: REACTOR,
    }
    : { model, groups: [], turrets: muzzles, pd: PD, bays: HULL_BAYS, reactor: REACTOR };
}

// ---- The docking: lines the light runs along ----

const arc = (x: number, r: number, from: number, to: number, share: [number, number]): Run => {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 7.5) + 1);
  const degs = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
  return { p: degs.map((d) => polar(x, r, d)), n: degs.map(radial), from: share[0], to: share[1] };
};
const loop = (x: number, r: number): Line => arc(x, r, 0, 360, [0, 1]);
const seam = (deg: number): Line[] => [
  { p: [polar(-14, 45.5, deg), polar(-34, 45.5, deg)], n: [radial(deg), radial(deg)] },
  { p: [polar(-16, 38, deg), polar(-16, 41.6, deg)], n: [[1, 0, 0], [1, 0, 0]] },
];
const FORWARD_UP: V3 = [1, 0.3, 0];
const FORWARD_DOWN: V3 = [1, -0.3, 0];
const DORSAL_EDGE = (share: [number, number]): Run => ({ p: [[-17, 43.5, 0], [-28, 61, 0], EMITTER], n: [FORWARD_UP, FORWARD_UP, FORWARD_UP], from: share[0], to: share[1] });
const VENTRAL_EDGE = (share: [number, number]): Run => ({ p: [[-16, -43.5, 0], [-32, -92, 0], HANGAR], n: [FORWARD_DOWN, FORWARD_DOWN, FORWARD_DOWN], from: share[0], to: share[1] });

const piece = (name: Half, centre: V3, jump: V3, hold: V3, at: number): DockPiece => ({
  name, centre, jump, hold, at,
  model: (dir, layer) => {
    const m = new HullModel();
    ringHalf(m, name, dir, layer);
    return m;
  },
});

const DOCK: Dock = {
  // The dorsal half drops out first, high and astern; the ventral half a beat later, low and astern.
  pieces: [
    piece('top', [X_RING, 28, 0], [-420, 50, 0], [-40, 16, 0], 0.1),
    piece('bottom', [X_RING, -34, 0], [-420, -60, 0], [-40, -16, 0], 0.35),
  ],
  jumpS: 0.6,
  align: [1.0, 1.75],
  clamp: [1.75, 2.2],
  wave: [2.45, 3.9],
  ignite: [3.55, 4.05],
  seams: [...seam(0), ...seam(180), loop(-12, 16.6), loop(-36, 16.6)],
  // From the seams round the band to the fins, then up the dorsal fin and down the ventral one.
  runs: [
    arc(X_RING, R_BAND, 0, 90, [0, 0.4]), arc(X_RING, R_BAND, 180, 90, [0, 0.4]),
    arc(X_RING, R_BAND, 0, -90, [0, 0.4]), arc(X_RING, R_BAND, 180, 270, [0, 0.4]),
    DORSAL_EDGE([0.4, 0.7]), VENTRAL_EDGE([0.4, 0.8]),
  ],
  hull: {
    from: X_RING, fore: [117, 0.12, 0.85], aft: [-100, 0.12, 0.6],
    ring: (x) => {
      const degs = Array.from({ length: 25 }, (_, i) => i * 15);
      return { p: degs.map((d) => skin(x, d, 0.4)), n: degs.map(radial) };
    },
  },
  // A charge climbs both sides of the ring from its keel to the dorsal fin, then up the fin to the emitter.
  charge: { runs: [arc(X_RING, R_BAND, -90, 90, [0, 0.6]), arc(X_RING, R_BAND, 270, 90, [0, 0.6]), DORSAL_EDGE([0.6, 1])], emitter: EMITTER },
};

/** The Wars station as a docking rig (stationRig.ts): the ring's two halves jump in and lock on. */
export const WARS_RIG: Rig = {
  names: [],
  start: {},
  span: 1,
  seconds: 4.4,
  pose: (pose, dir) => warsPose(pose, dir),
  dock: DOCK,
};
