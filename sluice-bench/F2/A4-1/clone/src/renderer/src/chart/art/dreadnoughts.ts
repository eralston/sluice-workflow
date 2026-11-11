// v1 facilities (13-game-design.md §4.4): a repository is a station, drawn as an unbeatable
// dreadnought whose hull is as long as a planet's radius (several captain-ship lengths; at the screen
// floors, twice a ship: 15 §5), in one of three faction designs. Each design is
// inspired by its genre and copies nothing:
//   Trek  — a ring around a core with curved docking pylons (a Deep Space Nine-style station)
//   Wars  — a long, rounded cruiser of stacked, swelling decks (a Mon Calamari-style cruiser) that
//           takes on a great docking ring with dorsal and ventral fins on the first merge
//   Mecha — a colossal carrier with flanking flight decks, whose twin forward booms form a main
//           cannon (an SDF-1-style fortress)
// Hulls are real 3D solids (hull3d.ts), painted in gouache planes at the fleet's three-quarter view,
// in warm titanium and greys with one restrained accent (never a hostile red, 320°–40°, and never a
// ladder hue). Its satellites (§5, a compound) are crisp marks: tender shuttles for open PRs in fixed
// slots with a "+N" beyond the cap, and point-defense turrets for pipelines on hull hardpoints.
//
// Pace (10, Combat safety; 13 §4.4): ponderous, a campfire, never fireworks. Station fire is slow,
// sparse and rhythmic, and it only ever goes outward. Event motion runs on motion.pulseTime in a
// 3 s loop (one gallery cycle step); reduced motion freezes every event on a still, readable frame.
import { Container, Graphics, GraphicsContext, Text } from 'pixi.js';
import { brighten, coreOf, HERO_CORE, HERO_GLOW, HERO_SOFT } from './energy';
import { HullModel, renderHull, S, type HullRender, type Palette, type V3 } from './hull3d';
import { MECHA_RIG } from './mechaStation';
import { WARS_RIG } from './warsStation';
import type { Dock, Line, Pose, Rig, Run } from './stationRig';
import { TREK_RIG } from './trekStation';
import { darken, lighten, mix, topLit } from './lit';
import { motion } from './motion';
import { PROGRESS, PROGRESS_PERIOD, progressPulse, READY, SUCCESS } from './progress';

export type Faction = 'trek' | 'wars' | 'mecha';
export const FACTIONS: Faction[] = ['trek', 'wars', 'mecha'];
export const FACTION_TITLE: Record<Faction, string> = { trek: 'Trek', wars: 'Wars', mecha: 'Mecha' };
export const FACTION_NOD: Record<Faction, string> = {
  trek: 'ring around a core, curved docking pylons',
  wars: 'rounded cruiser; a docking ring locks on at the first merge',
  mecha: 'fortress carrier; twin booms form the main cannon',
};

/** What the station is doing (13 §4.4, §6). */
export type StationAct = 'idle' | 'jump' | 'intake' | 'cover' | 'dock' | 'charge';
/** A guard's (pipeline's) look: parked, tracking a contact, firing, or settled after a passing run. */
export type GuardMode = 'idle' | 'tracking' | 'firing' | 'passed';

export interface StationState {
  act: StationAct;
  /** The station's own share of linked items that are done, 0..1: more lit bays, shields, drive glow. */
  intensity: number;
  /** Open PRs, in all: the "+N" mark counts those with no shuttle drawn (`shuttleSlots`). */
  shuttles: number;
  /**
   * Which tender slots hold a shuttle, one bit each (23 C6, `pm=`): a gap stays where it is. Unset (the
   * gallery's, a stage with no `pm=`): the first `shuttles` slots fill, up to SHUTTLE_CAP.
   */
  slotMask?: number;
  /**
   * The slots whose tenders dock in a `dock` act, one bit each (`ds=`, a slot or a list: a volley's tenders dock
   * together, 27 E6); unset: the last one drawn with no `pm`, none with one.
   */
  dockMask?: number;
  guards: GuardMode;
  /**
   * The station's form (stationRig.ts): `ship` until the first PR has merged into it, then `robot`,
   * its second form (the Mecha robot, the grown Trek station, the Wars cruiser with its ring).
   */
  form: Pose;
  /** A pinned transformation progress, 0 (ship) to 1 (robot): for the gallery and tests. Unset: it plays by itself. */
  morph?: number;
  /** Play the transformation on this change of form (the gallery's; the chart's first merge starts it with `beginTransform`). */
  go?: boolean;
}

export const SHUTTLE_CAP = 6;
const SLOT_BITS = (1 << SHUTTLE_CAP) - 1;

const popcount = (m: number) => { let n = 0; for (let x = m; x; x &= x - 1) n++; return n; };

/**
 * The tender slots to draw (23 C6): the mask of filled slots, the "+N" count (open PRs with no shuttle),
 * and the slots docking in a `dock` act, as a mask (0 for none; several when a volley merges, 27 E6). Without
 * a mask the first `shuttles` slots fill and a dock with no `ds` takes the last drawn; with a mask and no `ds`
 * (a PR with no drawn slot merged) it docks none. A docking slot is drawn even if the stage has already
 * cleared its bit; one past the cap docks nothing. Pure; the view keeps the result between stages, so a frame allocates nothing.
 */
export function shuttleSlots(st: Pick<StationState, 'act' | 'shuttles' | 'slotMask' | 'dockMask'>): { mask: number; extra: number; docking: number } {
  let mask = st.slotMask === undefined ? (1 << Math.min(SHUTTLE_CAP, st.shuttles)) - 1 : st.slotMask & SLOT_BITS;
  const extra = Math.max(0, st.shuttles - popcount(mask));
  let docking = 0;
  if (st.act === 'dock') {
    if (st.dockMask !== undefined) docking = st.dockMask & SLOT_BITS;
    else if (st.slotMask === undefined && mask) docking = 1 << (31 - Math.clz32(mask));
    mask |= docking;
  }
  return { mask, extra, docking };
}
/** A station's charge before it fires, in seconds: a mirror of `STATION_CHARGE_MS` (chart/fx/timing.ts), which art doesn't import. */
const CHARGE_S = 0.6;
/** One event loop, in seconds: the length of a gallery cycle step, so each step plays its event once. */
export const EVENT_LOOP_S = 3;

const ACTS: StationAct[] = ['idle', 'jump', 'intake', 'cover', 'dock', 'charge'];
const GUARDS: GuardMode[] = ['idle', 'tracking', 'firing', 'passed'];

/**
 * Stage strings: `station.<faction>.<act>` with optional `key=value` parameters, e.g.
 * `station.mecha.cover i=0.8 pr=3 pm=11 pd=firing` (i = intensity, pr = open PRs, pm = the filled
 * tender slots as a bit mask, ds = the docking slot or slots, comma-separated, pd = guard mode).
 */
export function stationStage(faction: Faction, act: StationAct, o: { i?: number; pr?: number; pm?: number; ds?: number | readonly number[]; pd?: GuardMode; form?: Pose; tf?: number; go?: boolean } = {}): string {
  const parts = [`station.${faction}.${act}`];
  if (o.i !== undefined) parts.push(`i=${o.i}`);
  if (o.pr !== undefined) parts.push(`pr=${o.pr}`);
  if (o.pm !== undefined) parts.push(`pm=${o.pm}`);
  if (o.ds !== undefined && (typeof o.ds === 'number' || o.ds.length)) parts.push(`ds=${typeof o.ds === 'number' ? o.ds : o.ds.join(',')}`);
  if (o.pd !== undefined) parts.push(`pd=${o.pd}`);
  if (o.form !== undefined) parts.push(`form=${o.form}`);
  if (o.tf !== undefined) parts.push(`tf=${o.tf}`);
  if (o.go) parts.push('go=1');
  return parts.join(' ');
}

export function parseStationStage(stage: string): Partial<StationState> {
  const [head = '', ...params] = stage.trim().split(/\s+/);
  const out: Partial<StationState> = {};
  const act = head.split('.')[2] as StationAct | undefined;
  if (act && ACTS.includes(act)) out.act = act;
  for (const p of params) {
    const [k, v = ''] = p.split('=');
    if (k === 'i' && Number.isFinite(Number(v))) out.intensity = Math.max(0, Math.min(1, Number(v)));
    else if (k === 'pr' && Number.isFinite(Number(v))) out.shuttles = Math.max(0, Math.floor(Number(v)));
    else if (k === 'pm' && /^\d+$/.test(v)) out.slotMask = Number(v);
    else if (k === 'ds' && /^\d+(,\d+)*$/.test(v)) out.dockMask = v.split(',').map(Number).reduce((m, i) => (i < SHUTTLE_CAP ? m | (1 << i) : m), 0);
    else if (k === 'pd' && GUARDS.includes(v as GuardMode)) out.guards = v as GuardMode;
    else if (k === 'form' && (v === 'ship' || v === 'robot')) out.form = v;
    else if (k === 'tf' && Number.isFinite(Number(v))) out.morph = Math.max(0, Math.min(1, Number(v)));
    else if (k === 'go' && v === '1') out.go = true;
  }
  return out;
}

// ---- Palette ----

const IVORY = 0xf4f0de;
const INK = 0x081629;
/** A navigation-green beacon (06 §7): not a ladder colour, and clear of amber. */
const NAV_GREEN = 0x7fe0a0;
/** The tractor beam's hero blue, given not fired (fx/timing TRACTOR, art/energy.ts). */
const TRACTOR = HERO_SOFT;
/** The station's reactor, engines, shields and power runs: the one hero energy at rest (2026-10-13). */
const SHIELD = HERO_GLOW;
/** Enemy fire: hostile red, only ever on the enemy's side (13 §4.3). */
const HOSTILE = 0xd9464f;

export interface Colourway { name: string; accent: number }

/** Warm titanium and greys; accents restrained and clear of hostile reds and ladder hues (09 §1). */
const STYLE: Record<Faction, { hull: number; steel: number; dark: number; colourways: Colourway[]; fire: number }> = {
  trek: {
    hull: 0x9c9384, steel: 0x74716b, dark: 0x2e3036, fire: 0xbff3ee,
    colourways: [{ name: 'Teal', accent: 0x3f8a83 }, { name: 'Moss', accent: 0x6d8650 }, { name: 'Graphite', accent: 0x4a4c53 }],
  },
  // A cooler grey than the others, its panels mottled toward the accent (the cargo material, paletteOf).
  wars: {
    hull: 0x7e8784, steel: 0x5f6766, dark: 0x262c31, fire: 0xb4f0b8,
    colourways: [{ name: 'Sea green', accent: 0x3b7f6e }, { name: 'Olive', accent: 0x76803b }, { name: 'Charcoal', accent: 0x3d4148 }],
  },
  mecha: {
    hull: 0x8f8a82, steel: 0x6b6a67, dark: 0x2c2e33, fire: 0xe6f4ea,
    colourways: [{ name: 'Teal', accent: 0x2c7c84 }, { name: 'Forest', accent: 0x3e6e4b }, { name: 'Gunmetal', accent: 0x4a4f57 }],
  },
};

export const colourways = (f: Faction): Colourway[] => STYLE[f].colourways;

// ---- Hull models ----

/** Hardpoints, in model space: the art hangs its crisp marks on them. */
interface Points {
  /** Covering-fire batteries (muzzle points). */
  turrets: V3[];
  /** Point-defense mounts (guards). */
  pd: V3[];
  /** Hangar mouths: lit with intensity; the first takes the tractor, the last the docking shuttle. */
  bays: V3[];
  /** Reactor or cannon glows that swell with intensity. */
  reactor: V3[];
  /** The Mecha main cannon: root and muzzle, glowing between the booms as intensity rises. */
  cannon?: [V3, V3];
  /** Where its finishing beam leaves the hull in this form (`DreadnoughtView.anchor('emitter')`, 13 §4.4). */
  emitter: V3;
}

interface Design {
  build: (m: HullModel, dir: number) => Points;
  /** Render fit at the base length (px). */
  fit: { width: number; height: number };
  /** Tender-shuttle slots and the "+N" mark, in base px for the east heading (x mirrors for west). */
  slots: [number, number][];
  plus: [number, number];
  /** Where an asteroid sits for intake, base px, east heading. */
  rock: [number, number];
  bolt: 'lance' | 'bolt' | 'pulse';
  /** How far fire leans forward and upward from straight out (so it never crosses its own hull). */
  aim: [number, number];
  /** A second form, reached by transformation (the Mecha station's robot, the Trek station's rings). */
  robot?: Design;
  /**
   * Scale this form relative to another's (so a young Trek station is the same size as its grown self,
   * a bit enlarged); `origin` also centres it where the other is, so a hull both forms share lines up.
   */
  kFrom?: { pose: Pose; mul: number; origin?: boolean };
  /** Covering fire as a rolling salvo: this many batteries in turn, a beat apart (else one). */
  salvo?: number;
}

/** The factions that transform, and how (stationRig.ts). */
const RIGS: Partial<Record<Faction, Rig>> = { mecha: MECHA_RIG, trek: TREK_RIG, wars: WARS_RIG };

const DESIGNS: Record<Faction, Design> = {
  trek: {
    // The first form: a bare spacedock, the core alone (a saucer-topped stack on a long reactor spire).
    // On the first merge it grows into the full station (trekStation.ts): a habitat ring on spokes,
    // three crossover bridges to a broad docking ring with weapon sponsons, and three pylons that sweep
    // up and down from it and curl back in like claws.
    build: (m, dir) => rigBuild('trek', m, 'ship', dir),
    fit: { width: 240, height: 150 },
    kFrom: { pose: 'robot', mul: 1.35 },
    slots: [[-104, -34], [106, 30], [-98, 52], [100, -46], [-52, -88], [54, 84]],
    plus: [128, -10],
    rock: [-176, 36],
    bolt: 'lance',
    aim: [0.25, 0.1],
    robot: {
      build: (m, dir) => rigBuild('trek', m, 'robot', dir),
      fit: { width: 240, height: 150 },
      slots: [[-138, -30], [138, 26], [-132, 44], [134, -40], [-60, -82], [62, 80]],
      plus: [170, -8],
      rock: [-196, 36],
      bolt: 'lance',
      aim: [0.25, 0.1],
    },
  },
  wars: {
    // The cruiser (warsStation.ts): a bullet-nosed hull of stacked decks and flank blisters, drives
    // clustered at the stern. On the first merge the two halves of a docking ring jump in and lock
    // round its after hull (a Dock rig); it never moves, so the second form is centred where it is.
    build: (m, dir) => rigBuild('wars', m, 'ship', dir),
    fit: { width: 240, height: 135 },
    slots: [[96, -54], [-104, 56], [146, -10], [-150, 14], [36, -80], [-30, 82]],
    plus: [150, -50],
    rock: [-196, 40],
    bolt: 'bolt',
    aim: [0.8, 0.9],
    // The same cruiser at the same size, with the ring: taller by its fins, so its tenders ride wider.
    robot: {
      build: (m, dir) => rigBuild('wars', m, 'robot', dir),
      fit: { width: 240, height: 135 },
      kFrom: { pose: 'ship', mul: 1, origin: true },
      slots: [[100, -64], [-112, 66], [152, -12], [-156, 16], [44, -96], [-34, 100]],
      plus: [156, -62],
      rock: [-140, 74],
      bolt: 'bolt',
      aim: [0.8, 0.9],
      salvo: 3,
    },
  },
  mecha: {
    // A deep armoured main hull with a stepped command tower at its stern; two long, deep booms ride
    // its shoulders and run far forward with open space between them: the main cannon. Flight-deck
    // carriers flank it like arms; drive blocks fill the stern. (mechaStation.ts builds it as eight
    // groups, which the robot form re-places.)
    build: (m, dir) => rigBuild('mecha', m, 'ship', dir),
    fit: { width: 240, height: 140 },
    slots: [[100, -60], [-110, 56], [150, -16], [-154, 12], [30, -84], [-24, 84]],
    plus: [150, -56],
    rock: [-196, 40],
    bolt: 'pulse',
    aim: [0.8, 0.9],
    // The same footprint, stood up: a robot about as tall as the ship is wide.
    robot: {
      build: (m, dir) => rigBuild('mecha', m, 'robot', dir),
      fit: { width: 160, height: 172 },
      slots: [[96, -64], [-96, 60], [108, 6], [-110, -24], [44, -112], [-40, 112]],
      plus: [104, -104],
      rock: [-190, 50],
      bolt: 'pulse',
      aim: [0.8, 0.9],
    },
  },
};

/** A transforming station in a form: its solids and hardpoints (the faction's rig, stationRig.ts). */
function rigBuild(f: Faction, m: HullModel, pose: Pose, dir: number): Points {
  const p = RIGS[f]!.pose(pose, dir);
  m.append(p.model);
  // The emitter: the main cannon's muzzle, the Wars ring's dorsal emitter (where its charge climbs to), else the first battery.
  const dock = RIGS[f]!.dock;
  const emitter = p.cannon ? p.cannon[1] : pose === 'robot' && dock ? dock.charge.emitter : p.turrets[0]!;
  return { turrets: p.turrets, pd: p.pd, bays: p.bays, reactor: p.reactor, emitter, ...(p.cannon ? { cannon: p.cannon } : {}) };
}

const designOf = (f: Faction, pose: Pose): Design => (pose === 'robot' ? DESIGNS[f].robot ?? DESIGNS[f] : DESIGNS[f]);

/** The base length the hulls are baked at; views scale to their own length. */
const BASE_L = 240;

interface Baked {
  render: HullRender;
  turrets: [number, number][];
  pd: [number, number][];
  bays: [number, number][];
  reactor: [number, number][];
  cannon?: [[number, number], [number, number]];
  emitter: [number, number];
  beacons: [number, number][];
}

const models = new Map<string, { model: HullModel; points: Points; beacons: number }>();
const baked = new Map<string, [Baked, Baked]>();

function modelOf(f: Faction, pose: Pose = 'ship', dir = 1) {
  // Most hulls are one model seen from either side; the robot is turned toward the viewer, so it is one per heading.
  const key = `${f}:${pose}:${pose === 'robot' ? dir : 1}`;
  let m = models.get(key);
  if (!m) {
    const model = new HullModel();
    const points = designOf(f, pose).build(model, dir);
    const beacons = model.beacons.length;
    // Hardpoints ride along as beacons, so renderHull projects them with everything else.
    for (const p of [...points.turrets, ...points.pd, ...points.bays, ...points.reactor, ...(points.cannon ?? []), points.emitter]) model.beacon(p);
    m = { model, points, beacons };
    models.set(key, m);
  }
  return m;
}

function paletteOf(f: Faction, cw: number): Palette {
  const st = STYLE[f];
  const accent = st.colourways[cw]!.accent;
  // The Wars hull's mottled panels: its grey drawn a little toward the accent.
  const cargo = f === 'wars' ? mix(st.hull, accent, 0.35) : accent;
  return { hull: st.hull, accent, cargo, steel: st.steel, dark: st.dark, glass: 0x2a4256, glow: HERO_GLOW, ember: HERO_CORE };
}

const cwOf = (f: Faction, colourway: number) => ((colourway % STYLE[f].colourways.length) + STYLE[f].colourways.length) % STYLE[f].colourways.length;

const growK = new Map<string, number>();

/** A form's render fit: its design's, with a scale taken from another form where the design asks (a young station is as big as its grown self, a little enlarged). */
function fitOf(f: Faction, pose: Pose): { width: number; height: number; k?: number } {
  const d = designOf(f, pose);
  if (!d.kFrom) return d.fit;
  const key = `${f}:${d.kFrom.pose}`;
  let k = growK.get(key);
  if (k === undefined) {
    k = renderHull(modelOf(f, d.kFrom.pose, 1).model, paletteOf(f, 0), 1, fitOf(f, d.kFrom.pose)).k;
    growK.set(key, k);
  }
  return { ...d.fit, k: k * d.kFrom.mul };
}

function bakedFor(f: Faction, colourway: number, pose: Pose = 'ship'): [Baked, Baked] {
  const cw = cwOf(f, colourway);
  const key = `${f}:${cw}:${pose}`;
  let b = baked.get(key);
  if (!b) {
    const palette = paletteOf(f, cw);
    const fit = fitOf(f, pose);
    const [me, mw] = [modelOf(f, pose, 1), modelOf(f, pose, -1)];
    // A form that shares its hull with another is centred where that one is, heading by heading.
    const from = designOf(f, pose).kFrom;
    const at = (h: number) => (from?.origin ? { origin: bakedFor(f, cw, from.pose)[h]!.render.origin } : {});
    const east = renderHull(me.model, palette, 1, { ...fit, ...at(0) });
    const west = renderHull(mw.model, palette, -1, { ...fit, k: east.k, ...at(1) });
    const split = (r: HullRender, { points, beacons }: { points: Points; beacons: number }): Baked => {
      const pts = r.beacons.slice(beacons);
      const take = (n: number) => pts.splice(0, n);
      const out: Baked = {
        render: r, beacons: r.beacons.slice(0, beacons),
        turrets: take(points.turrets.length), pd: take(points.pd.length), bays: take(points.bays.length), reactor: take(points.reactor.length),
        emitter: [0, 0],
      };
      if (points.cannon) {
        const [a, c] = take(2);
        out.cannon = [a!, c!];
      }
      out.emitter = take(1)[0]!;
      return out;
    };
    b = [split(east, me), split(west, mw)];
    baked.set(key, b);
  }
  return b;
}

// ---- The transformation's pieces ----

/** One piece's look in one form, placed in that form's frame (centred on its whole station). */
interface Look {
  ctx: GraphicsContext;
  /** Where the context sits in the form's frame. */
  x: number; y: number;
  /** The piece's centre, length and heading (screen angle, fore from aft) in that form. */
  cx: number; cy: number; len: number; ang: number;
}
/** A piece in both forms; `grows` when it isn't there in the first, so it comes out of the form's origin. */
interface Piece { name: string; a: Look; b: Look; grows: boolean }

const pieceBakes = new Map<string, [Piece[], Piece[]]>();

/** Every piece of a transforming station, as it looks in each form (a, b), per heading. */
function piecesFor(f: Faction, colourway: number): [Piece[], Piece[]] {
  const cw = cwOf(f, colourway);
  const key = `${f}:${cw}`;
  let out = pieceBakes.get(key);
  if (out) return out;
  const rig = RIGS[f]!;
  const palette = paletteOf(f, cw);
  const looks = (pose: Pose): (Look | null)[][] => {
    const fit = fitOf(f, pose);
    // The whole station with the form's origin as a last beacon: pieces line up on it.
    const wholeOf = (dir: number) => {
      const w = rig.pose(pose, dir).model.transformed({});
      w.beacon([0, 0, 0]);
      return w;
    };
    const east = renderHull(wholeOf(1), palette, 1, fit);
    return [1, -1].map((dir) => {
      const rp = rig.pose(pose, dir);
      const u = dir > 0 ? east : renderHull(wholeOf(-1), palette, -1, { ...fit, k: east.k });
      const o = u.beacons[u.beacons.length - 1]!;
      return rp.groups.map(({ model }): Look | null => {
        if (!model) return null;
        const g = renderHull(model, palette, dir, { ...fit, k: east.k });
        const [b0, fore, aft] = g.beacons as [[number, number], [number, number], [number, number]];
        const [dx, dy] = [o[0] - b0[0], o[1] - b0[1]];
        const [fx, fy, ax, ay] = [fore[0] + dx, fore[1] + dy, aft[0] + dx, aft[1] + dy];
        return { ctx: g.context, x: dx, y: dy, cx: (fx + ax) / 2, cy: (fy + ay) / 2, len: Math.max(1, Math.hypot(fx - ax, fy - ay)), ang: Math.atan2(fy - ay, fx - ax) };
      });
    });
  };
  const [first, second] = [looks('ship'), looks('robot')];
  // Where each heading's first form has its origin: a piece that isn't there yet grows from it.
  const origins = [1, -1].map((dir) => {
    const w = rig.pose('ship', dir).model.transformed({});
    w.beacon([0, 0, 0]);
    const fit = fitOf(f, 'ship');
    const east = renderHull((() => { const e = rig.pose('ship', 1).model.transformed({}); e.beacon([0, 0, 0]); return e; })(), palette, 1, fit);
    const r = dir > 0 ? east : renderHull(w, palette, -1, { ...fit, k: east.k });
    return r.beacons[r.beacons.length - 1]!;
  });
  const heading = (h: number): Piece[] => rig.names.map((name, i) => {
    const b = second[h]![i]!;
    const a = first[h]![i];
    const [ox, oy] = origins[h]!;
    // Not there yet: an empty look at the origin, a quarter the size, turned the same way.
    return { name, b, a: a ?? { ctx: new GraphicsContext(), x: 0, y: 0, cx: ox, cy: oy, len: b.len * 0.25, ang: b.ang }, grows: !a };
  });
  out = [heading(0), heading(1)];
  pieceBakes.set(key, out);
  return out;
}

/** The pieces of one heading, each with its ship look and its robot look. */
interface MorphPiece { root: Container; a: Container; b: Container; piece: Piece }

function buildMorph(pieces: Piece[]): { root: Container; pieces: MorphPiece[]; fx: Graphics } {
  const root = new Container();
  const list = pieces.map((piece): MorphPiece => {
    const holder = new Container();
    const mk = (l: Look) => {
      const c = new Container();
      const g = new Graphics(l.ctx);
      g.position.set(l.x - l.cx, l.y - l.cy); // the piece's own centre is its container's origin
      c.addChild(g);
      return c;
    };
    const [a, b] = [mk(piece.a), mk(piece.b)];
    holder.addChild(a, b);
    root.addChild(holder);
    return { root: holder, a, b, piece };
  });
  const fx = new Graphics();
  fx.blendMode = 'add';
  root.addChild(fx);
  return { root, pieces: list, fx };
}

// ---- Docking (a rig whose new pieces arrive and lock on: the Wars ring, warsStation.ts) ----

/** An arriving piece at a heading: its looks in front of the hull and behind it, and its screen offsets from its seat. */
interface DockLook {
  near: GraphicsContext;
  far: GraphicsContext;
  /** Where it drops out of hyperspace, where it holds, and level with its seat at its hold's height. */
  jump: [number, number];
  hold: [number, number];
  line: [number, number];
  /** Its seat's centre, and about half its size, on screen. */
  seat: [number, number];
  r: number;
}

const dockBakes = new Map<string, [DockLook[], DockLook[]]>();

/** A docking rig's arriving pieces, per heading, baked at the second form's scale and centre (so they seat exactly). */
function dockLooksFor(f: Faction, colourway: number): [DockLook[], DockLook[]] {
  const cw = cwOf(f, colourway);
  const key = `${f}:${cw}`;
  let out = dockBakes.get(key);
  if (out) return out;
  const dock = RIGS[f]!.dock!;
  const palette = paletteOf(f, cw);
  const fit = fitOf(f, 'robot');
  const whole = bakedFor(f, cw, 'robot');
  const heading = (h: number): DockLook[] => {
    const dir = h ? -1 : 1;
    const r = whole[h]!.render;
    return dock.pieces.map((p): DockLook => {
      const [near, far] = (['near', 'far'] as const).map((layer) => renderHull(p.model(dir, layer), palette, dir, { ...fit, k: r.k, origin: r.origin }).context);
      const seat = r.at(p.centre);
      const off = (v: V3): [number, number] => {
        const q = r.at([p.centre[0] + v[0], p.centre[1] + v[1], p.centre[2] + v[2]]);
        return [q[0] - seat[0], q[1] - seat[1]];
      };
      const [a, b] = [near!.bounds, far!.bounds];
      const size = Math.max(Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX), Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY));
      return { near: near!, far: far!, jump: off(p.jump), hold: off(p.hold), line: off([0, p.hold[1], p.hold[2]]), seat, r: size / 2 };
    });
  };
  out = [heading(0), heading(1)];
  dockBakes.set(key, out);
  return out;
}

interface DockLayer { back: Container; front: Container; pieces: { near: Graphics; far: Graphics; look: DockLook }[] }

/** One heading's arriving pieces: the parts behind the hull in `back` (under the form), the rest in `front`. */
function buildDock(looks: DockLook[]): DockLayer {
  const [back, front] = [new Container(), new Container()];
  const pieces = looks.map((look) => {
    const [near, far] = [new Graphics(look.near), new Graphics(look.far)];
    back.addChild(far);
    front.addChild(near);
    return { near, far, look };
  });
  return { back, front, pieces };
}

/** The screen points of a line, and its length so far at each. */
function traced(r: HullRender, line: Line): { pts: [number, number][]; lens: number[] } {
  const pts = line.p.map(r.at);
  const lens = [0];
  for (let i = 0; i + 1 < pts.length; i++) lens.push(lens[i]! + Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]));
  return { pts, lens };
}

/** A line of even light (a seam, the wave's band round the hull), only where its surface faces the viewer. */
function drawLine(g: Graphics, r: HullRender, line: Line, color: number, alpha: number, width = 1): void {
  if (alpha <= 0.01) return;
  const { pts } = traced(r, line);
  for (let i = 0; i + 1 < pts.length; i++) {
    if (!r.faces(line.p[i]!, line.n[i]!) || !r.faces(line.p[i + 1]!, line.n[i + 1]!)) continue;
    const [a, b] = [pts[i]!, pts[i + 1]!];
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 4.5 * width, color, alpha: 0.16 * alpha, cap: 'round' });
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1.1 * width, color: brighten(color, 0.5), alpha: 0.8 * alpha, cap: 'round' });
  }
}

/** Power running along a line: lit from its start to share e of its length, brightest at its head. */
function drawRun(g: Graphics, r: HullRender, line: Run, e: number, color: number, alpha: number): void {
  if (e <= 0 || alpha <= 0.01) return;
  const { pts, lens } = traced(r, line);
  const reach = Math.min(1, e) * (lens[lens.length - 1] || 1);
  for (let i = 0; i + 1 < pts.length && lens[i]! < reach; i++) {
    const k = Math.min(1, (reach - lens[i]!) / (lens[i + 1]! - lens[i]! || 1));
    const [a, b] = [pts[i]!, pts[i + 1]!];
    const end: [number, number] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    if (!r.faces(line.p[i]!, line.n[i]!) && !r.faces(line.p[i + 1]!, line.n[i + 1]!)) continue;
    const toward = (lens[i]! + (lens[i + 1]! - lens[i]!) * k) / reach;
    const w = alpha * (0.3 + 0.7 * toward * toward);
    g.moveTo(a[0], a[1]).lineTo(end[0], end[1]).stroke({ width: 4, color, alpha: 0.2 * w, cap: 'round' });
    g.moveTo(a[0], a[1]).lineTo(end[0], end[1]).stroke({ width: 1.2, color: brighten(color, 0.5), alpha: 0.9 * w, cap: 'round' });
    if (e < 1 && lens[i + 1]! >= reach) {
      g.circle(end[0], end[1], 3.4).fill({ color, alpha: 0.3 * alpha }).circle(end[0], end[1], 1.3).fill({ color: coreOf(color), alpha: 0.85 * alpha });
    }
  }
}

// ---- Tender shuttles (PRs) ----

/** Tiny tenders: no wings or nacelles (those mark captains, 06 §7); a trim band carries the PR's rung. */
const SHUTTLES: Record<Faction, (m: HullModel) => void> = {
  trek: (m) => {
    m.loft([S(11, 0.8, 0.6, 0.2), S(9, 2.8, 2.1), S(4, 3.5, 2.6), S(-7, 3.5, 2.6), S(-9.5, 3, 2.2)], ['glass', 'hull', 'hull', 'steel'], { sides: 10, sq: 3, caps: [undefined, 'dark'] });
    m.box(-7, -1, 2.2, 3.6, -1.6, 1.6, 'accent', { bias: 1 });
    m.sym(() => m.box(-6, 3.5, -0.8, 0.6, 3.2, 3.7, 'trim'));
    m.engine([-10, 0, 0], 1.5);
    m.beacon([11, 0.6, 0]);
  },
  wars: (m) => {
    m.loft([S(10, 1.6, 1.2, -0.5), S(7, 3, 2.4), S(-8, 3.2, 2.8), S(-10, 2.8, 2.4)], ['glass', 'hull', 'hull'], { sides: 8, sq: 6, caps: [undefined, 'dark'] });
    m.prism([[-8, 2.4], [-2, 2.4], [-6, 7], [-9, 7]], -0.45, 0.45, 'xy', 'accent', { bias: 1 });
    m.sym(() => {
      m.box(-7, 5, -0.6, 0.6, 3.1, 3.5, 'trim');
      m.engine([-10.5, 0, 1.4], 1.1);
    });
    m.beacon([10.4, 0, 0]);
  },
  mecha: (m) => {
    m.loft([S(11, 0.6, 0.5, -0.5), S(7, 3.2, 2.2), S(-6, 3.8, 2.8), S(-9, 3.4, 2.6)], ['accent', 'hull', 'hull'], { sides: 8, sq: 8, caps: [undefined, 'dark'] });
    m.loft([S(7, 0, 0, 2), S(5, 1.5, 1, 2.4), S(1, 1.5, 1, 2.6), S(-1, 0, 0, 2.4)], 'glass', { sides: 8, bias: 1 });
    m.sym(() => {
      m.box(-9.5, -3, -1.8, 1.4, 3.3, 4.6, 'steel');
      m.box(-2, 6, -0.7, 0.5, 2.9, 3.3, 'trim');
      m.engine([-10, 0, 4], 1.1);
    });
    m.beacon([11, 0, 0]);
  },
};

const shuttleBakes = new Map<string, [HullRender, HullRender]>();

function shuttleFor(f: Faction, colourway: number): [HullRender, HullRender] {
  const st = STYLE[f];
  const accent = st.colourways[((colourway % 3) + 3) % 3]!.accent;
  const key = `${f}:${accent}`;
  let r = shuttleBakes.get(key);
  if (!r) {
    const m = new HullModel();
    SHUTTLES[f](m);
    const palette: Palette = { hull: lighten(st.hull, 0.12), accent, cargo: accent, steel: st.steel, dark: st.dark, glass: 0x2a4256, glow: HERO_GLOW, ember: HERO_CORE };
    const fit = { width: 20, height: 11 };
    const east = renderHull(m, palette, 1, fit);
    r = [east, renderHull(m, palette, -1, { ...fit, k: east.k })];
    shuttleBakes.set(key, r);
  }
  return r;
}

interface Shuttle { root: Container; headings: { root: Container; trim: Graphics; light: Graphics; engines: Graphics }[] }

// ---- Small helpers ----

/** The hull and its satellites at power 0: this share of their light. */
export const POWER_DIM_HULL = 0.7;
/** Its drives and lights at power 0: this share again, under the hull's. */
export const POWER_DIM_LIGHTS = 0.3;

const grey = (k: number) => {
  const v = Math.round(255 * Math.max(0, Math.min(1, k)));
  return (v << 16) | (v << 8) | v;
};

/** Every additive layer under `root`: the art's light. */
function lightsOf(root: Container, out: Container[] = []): Container[] {
  for (const c of root.children) {
    if (c.blendMode === 'add') out.push(c);
    lightsOf(c, out);
  }
  return out;
}

/** The tints at a power: the hull's (and its satellites') and each additive layer's, as grey colours. Pure. */
export function powerTints(power: number): { hull: number; light: number } {
  const u = 1 - Math.max(0, Math.min(1, power));
  const e = u * u * (3 - 2 * u);
  return { hull: grey(1 - (1 - POWER_DIM_HULL) * e), light: grey(1 - (1 - POWER_DIM_LIGHTS) * e) };
}

/**
 * The art's idle clock as a lag behind the scene's: it grows by the scene's forward step times
 * (1 - power), so at power 1 the art runs exactly on the scene clock (a step back included, as the gallery's
 * `freeze` makes) and at power 0 it stills. Returns the new lag; the art's clock is `scene - lag`. Pure.
 */
export function powerLag(lag: number, prevScene: number | null, scene: number, power: number): number {
  const ds = prevScene === null ? 0 : Math.max(0, scene - prevScene);
  return lag + ds * (1 - Math.max(0, Math.min(1, power)));
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A stable 0..1 hash of an integer. */
const hash01 = (i: number) => (((i * 2654435761) >>> 0) % 1000) / 1000;

/** A glow at the nozzle and a short plume trailing behind, along the hull's own axis (as ships.ts). */
function drawExhaust(g: Graphics, e: HullRender['engines'][number], c: number): void {
  const len = Math.hypot(e.bx, e.by) || 1;
  const [ux, uy] = [e.bx / len, e.by / len];
  const [px, py] = [-uy, ux];
  const reach = e.r * 3;
  const w = e.r * 0.85;
  g.poly([e.x + px * w, e.y + py * w, e.x + ux * reach, e.y + uy * reach, e.x - px * w, e.y - py * w]).fill({ color: c, alpha: 0.22 });
  g.circle(e.x, e.y, e.r * 1.2).fill({ color: c, alpha: 0.2 });
  g.circle(e.x, e.y, e.r * 0.65).fill({ color: lighten(c, 0.6), alpha: 0.9 });
}

/** One heading's static layers: the baked hull and its lights. */
interface Heading {
  root: Container;
  baked: Baked;
  /** Windows in five buckets: intensity lights more of them. */
  windows: Graphics[];
  bays: Graphics[];
  engines: Graphics;
  reactor: Graphics;
  beacons: Graphics[];
}

const WINDOW_BUCKETS = 5;
/** One turn of the tenders' patrol round their station, in seconds: ponderous, to show its size. */
const PATROL_S = 150;

/** A window's intensity bucket and its colour (warm whites), stable per seed. */
const windowBucket = (i: number, seed: number) => Math.floor(hash01(i + seed * 31) * WINDOW_BUCKETS);
const WINDOW_COLORS = [IVORY, 0xf1d9a0, 0xffe6b0];
const windowColor = (i: number, seed: number) => WINDOW_COLORS[(i + seed) % WINDOW_COLORS.length]!;

function buildHeading(b: Baked, seed: number): Heading {
  const root = new Container();
  const engines = new Graphics();
  for (const e of b.render.engines) drawExhaust(engines, e, HERO_GLOW);
  engines.blendMode = 'add';
  const hull = new Graphics(b.render.context);
  const windows = Array.from({ length: WINDOW_BUCKETS }, () => new Graphics());
  b.render.windows.forEach(([x, y], i) => {
    const g = windows[windowBucket(i, seed)]!;
    const c = windowColor(i, seed);
    g.circle(x, y, 1.5).fill({ color: c, alpha: 0.1 });
    g.rect(x - 0.55, y - 0.55, 1.1, 1.1).fill({ color: c });
  });
  for (const g of windows) g.blendMode = 'add';
  const bays = b.bays.map(([x, y]) => {
    const g = new Graphics();
    g.circle(x, y, 4.2).fill({ color: 0xffe6b0, alpha: 0.12 });
    g.roundRect(x - 2.2, y - 1.2, 4.4, 2.4, 0.8).fill({ color: 0xfff1d6, alpha: 0.95 });
    g.blendMode = 'add';
    return g;
  });
  const reactor = new Graphics();
  for (const [x, y] of b.reactor) reactor.circle(x, y, 7).fill({ color: SHIELD, alpha: 0.12 }).circle(x, y, 3.2).fill({ color: SHIELD, alpha: 0.3 }).circle(x, y, 1.4).fill({ color: brighten(SHIELD, 0.6) });
  reactor.blendMode = 'add';
  const beacons = b.beacons.map(([x, y]) => {
    const g = new Graphics().circle(x, y, 2.2).fill({ color: NAV_GREEN, alpha: 0.22 }).circle(x, y, 0.8).fill({ color: lighten(NAV_GREEN, 0.5) });
    g.blendMode = 'add';
    return g;
  });
  root.addChild(engines, hull, ...windows, ...bays, reactor, ...beacons);
  return { root, baked: b, windows, bays, engines, reactor, beacons };
}

/** A point-defense turret: a dark collar, a lit dome, twin barrels that turn, and a status lamp. */
interface Guard { root: Container; barrels: Graphics; lamp: Graphics; charge: Graphics; angle: number }

function buildGuard(): Guard {
  const root = new Container();
  const base = new Graphics()
    .ellipse(0, 1.2, 4.8, 2.4).fill({ color: 0x24262b }).stroke({ width: 0.6, color: 0x15171b })
    .ellipse(0, 0, 3.6, 2.6).fill(topLit(0xb0a99c));
  const barrels = new Graphics()
    .rect(0, -1.5, 6.5, 1).fill({ color: 0x3a3c42 })
    .rect(0, 0.5, 6.5, 1).fill({ color: 0x3a3c42 })
    .rect(5.2, -1.6, 1.6, 3.2).fill({ color: 0x55575d });
  const lamp = new Graphics().circle(0, -0.4, 1).fill({ color: 0xffffff });
  const charge = new Graphics();
  charge.blendMode = 'add';
  root.addChild(base, barrels, lamp, charge);
  return { root, barrels, lamp, charge, angle: -1.1 };
}

interface Bounds { x0: number; x1: number; y0: number; y1: number }
/** One form's baked hull and its extent. */
interface Kit { headings: Heading[]; bounds: Bounds }
interface MorphLayer { root: Container; pieces: MorphPiece[]; fx: Graphics }

/**
 * What became of a station's change of form, for the dev log (the theme wires `onForm`: facility.ts).
 * `armed`: a first merge asked for the transformation (`reason: already-second-form` when the new form
 * had landed first). `played` / `finished` / `interrupted`: the transformation. `cut`: the form changed
 * without it, and why. `built-second`: the view was made in its second form (a scene built, or a view
 * rebuilt, after the first merge). Times are wall-clock ms: how long ago it was armed, or changed form.
 */
export interface FormNote {
  outcome: 'armed' | 'played' | 'finished' | 'interrupted' | 'cut' | 'built-second';
  reason?: 'already-second-form' | 'never-armed' | 'armed-window-passed' | 'reduced-motion' | 'not-started' | 'back-to-first' | 'scrubbed-back' | 'destroyed' | 'other';
  /** The faction's kind of transformation: pieces that arrive and lock on (`dock`), or slide and grow (`slide`). */
  type: 'dock' | 'slide';
  armedAgoMs?: number | null;
  changedAgoMs?: number | null;
}

export interface DreadnoughtOptions {
  faction: Faction;
  colourway?: number;
  /** Hull length on screen, px. On the chart, twice the node's r (`GEOMETRY.facilityR` on the inner ring, 0.7× that on the outer); the gallery's is 240. */
  length?: number;
  stage?: string;
  /** A stable seed (the repo's): varies window patterns and phases only. */
  seed?: number;
  /** Point-defense mounts in use (pipelines), 0..3. */
  guardCount?: number;
}

/**
 * A repository station as a faction dreadnought (13 §4.4), with its satellites. Implements the
 * gallery's ArtView shape. `root` holds the hull and its lights; `marks` holds the crisp satellites
 * and fire, transformed with the hull.
 */
export class DreadnoughtView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'hardware' as const;
  readonly faction: Faction;
  private readonly body = new Container();
  private readonly onHull = new Container();
  private readonly shield = new Graphics();
  private readonly fold = new Graphics();
  private readonly fx = new Graphics();
  /** Light on the hull itself, over the form (seams, the docking's power, a charge): in hull space, under the marks. */
  private readonly glow = new Graphics();
  private readonly rock = new Graphics();
  /** The hull as it stands in each form built so far (a station with one form has one). */
  private readonly kits: Partial<Record<Pose, Kit>> = {};
  private pose: Pose = 'ship';
  private readonly colourway: number;
  /** The transformation layer, built the first time a station changes form. */
  private morph: { east: MorphLayer; west: MorphLayer } | null = null;
  /** A docking rig's arriving pieces, built the first time it docks (in place of `morph`). */
  private docking: { east: DockLayer; west: DockLayer } | null = null;
  /** The transformation in progress: seconds it began (null: next tick), or unset when none is. */
  private morphStart: number | null | undefined;
  /** How far the transformation is, 0..1, while it is showing; unset when the station is at rest in a form. */
  private morphU: number | undefined;
  private readonly shuttles: Shuttle[] = [];
  private readonly guards: Guard[] = [];
  private readonly plus: Container;
  private readonly plusText: Text;
  private heading = 0;
  private readonly px: number;
  private readonly seed: number;
  /** The slots drawn and those docking (`shuttleSlots`, masks), kept from the last stage so a frame computes nothing. */
  private slotMask = 0;
  private dockMask = 0;
  state: StationState = { act: 'idle', intensity: 0.5, shuttles: 0, guards: 'idle', form: 'ship' };
  private stage = '';
  private litBays = 2;
  /** Told what became of each change of form (the dev log); unset in the gallery. */
  onForm?: (n: FormNote) => void;
  /** When it was last armed, and last changed form without the transformation (wall seconds). */
  private armedAt: number | undefined;
  private cutAt: number | undefined;
  private builtSecond = false;

  constructor(o: DreadnoughtOptions) {
    this.faction = o.faction;
    this.colourway = o.colourway ?? 0;
    this.seed = (o.seed ?? 7) >>> 0;
    const L = o.length ?? BASE_L;
    this.px = L / BASE_L;
    // A station that arrives already transformed (a scene built after the first merge) starts in its robot form.
    this.pose = this.canTransform && parseStationStage(o.stage ?? '').form === 'robot' ? 'robot' : 'ship';
    this.builtSecond = this.pose === 'robot';
    this.shield.blendMode = 'add';
    this.glow.blendMode = 'add';
    this.body.addChild(this.shield, this.glow);
    this.kit(this.pose);
    this.drawShield();
    this.body.scale.set(this.px);
    this.root.addChild(this.body);

    // Marks: satellites and fire, crisp, in base px scaled with the hull.
    const s = this.px;
    this.onHull.scale.set(s);
    const shuttleR = shuttleFor(o.faction, o.colourway ?? 0);
    for (let i = 0; i < SHUTTLE_CAP + 1; i++) {
      const root = new Container();
      const headings = shuttleR.map((r) => {
        const hr = new Container();
        const engines = new Graphics();
        for (const e of r.engines) engines.circle(e.x, e.y, e.r * 1.6).fill({ color: SHIELD, alpha: 0.25 }).circle(e.x, e.y, e.r * 0.7).fill({ color: brighten(SHIELD, 0.6) });
        engines.blendMode = 'add';
        const trim = new Graphics(r.trim);
        const light = new Graphics();
        for (const [x, y] of r.beacons) light.circle(x, y, 1.8).fill({ color: 0xffffff, alpha: 0.25 }).circle(x, y, 0.75).fill({ color: 0xffffff });
        hr.addChild(engines, new Graphics(r.context), trim, light);
        root.addChild(hr);
        return { root: hr, trim, light, engines };
      });
      root.visible = false;
      this.shuttles.push({ root, headings });
    }
    for (let i = 0; i < Math.max(0, Math.min(3, o.guardCount ?? 3)); i++) this.guards.push(buildGuard());
    this.plus = new Container();
    this.plusText = new Text({ text: '+0', style: { fontFamily: 'Menlo, Monaco, monospace', fontSize: 11, fill: IVORY, fontWeight: '600' } });
    this.plusText.anchor.set(0.5);
    this.plusText.resolution = 3;
    this.plus.addChild(new Graphics(), this.plusText);
    this.plus.visible = false;
    this.rock.visible = false;
    this.drawRock();
    this.onHull.addChild(this.rock, ...this.guards.map((g) => g.root), this.fx, ...this.shuttles.map((x) => x.root), this.plus, this.fold);
    this.marks.addChild(this.onHull);
    this.face(1);
    if (o.stage) this.setStage(o.stage);
  }

  /** Whether the station has a second form (every faction's does now; stationRig.ts). */
  private get canTransform(): boolean {
    return !!DESIGNS[this.faction].robot;
  }

  /** The faction's docking, when its second form's pieces arrive and lock on (the Wars ring). */
  private get dockRig(): Dock | undefined {
    return RIGS[this.faction]?.dock;
  }

  private get headings(): Heading[] {
    return this.kit(this.pose).headings;
  }

  private get design(): Design {
    return designOf(this.faction, this.pose);
  }

  private get bounds(): Bounds {
    return this.kit(this.pose).bounds;
  }

  /** The hull in a form, baked and mounted the first time it is needed. */
  private kit(pose: Pose): Kit {
    let k = this.kits[pose];
    if (!k) {
      const bakes = bakedFor(this.faction, this.colourway, pose);
      const headings = bakes.map((b) => buildHeading(b, this.seed));
      const bb = bakes[0].render.context.bounds;
      k = { headings, bounds: { x0: bb.minX, x1: bb.maxX, y0: bb.minY, y1: bb.maxY } };
      this.kits[pose] = k;
      for (const h of headings) {
        h.root.visible = false;
        this.body.addChildAt(h.root, this.body.getChildIndex(this.glow));
      }
      this.lights = lightsOf(this.root);
      this.tinted = -1;
    }
    return k;
  }

  private get b(): Baked {
    return this.headings[this.heading]!.baked;
  }

  /** Mirror a base-px design point for the current heading. */
  private at(p: readonly [number, number]): [number, number] {
    return [this.heading ? -p[0] : p[0], p[1]];
  }

  face(dir: number): void {
    this.heading = dir < 0 ? 1 : 0;
    this.showForm();
    this.guards.forEach((g, i) => {
      const p = this.b.pd[i];
      if (p) g.root.position.set(p[0], p[1] - 1);
      g.root.scale.set(1.3);
    });
    this.shuttles.forEach((sh, i) => {
      const slot = this.design.slots[i];
      if (slot) {
        const [x] = this.at(slot);
        // Each tender faces the station from its slot.
        sh.headings.forEach((h, k) => (h.root.visible = k === (x > 0 ? 1 : 0)));
      }
    });
    const [px, py] = this.at(this.design.plus);
    this.plus.position.set(px, py);
    const [rx, ry] = this.at(this.design.rock);
    this.rock.position.set(rx, ry);
  }

  /**
   * Power, 0..1 (13 §4.4; a station on standby is brought down by its adapter): the hull and its
   * satellites at `POWER_DIM_HULL` of their light at 0, and every additive layer under the hull
   * (drives, windows, bays, reactor, beacons, shield, seams) at `POWER_DIM_LIGHTS`, eased as a smoothstep
   * of the level; the drift stills as the clock does. 1 draws it untinted.
   */
  setPower(level: number): void {
    this.power = clamp01(level);
    this.tint();
  }

  private tint(): void {
    if (this.power === this.tinted) return;
    this.tinted = this.power;
    const { hull, light } = powerTints(this.power);
    this.root.tint = hull;
    this.marks.tint = hull;
    for (const l of this.lights) l.tint = light;
  }

  /**
   * A named hardpoint, in px from the view's origin (the node's centre), at the current form and heading
   * and with the idle drift in it; null for a name it lacks, and while the form is changing (a morph or a
   * docking in progress), when the hardpoint isn't drawn yet. `emitter`: where the finishing beam leaves
   * (a cannon's muzzle, a docking ring's dorsal emitter, else the first battery).
   */
  anchor(name: string): [number, number] | null {
    if (name !== 'emitter' || this.morphStart !== undefined || this.morphing) return null;
    const [x, y] = this.b.emitter;
    return [x * this.body.scale.x + this.body.position.x, y * this.body.scale.y + this.body.position.y];
  }

  setStage(stage: string): void {
    this.applyStage(stage);
    // A change of form may have built layers with lights of their own (a hull, a morph's fx): find them again.
    this.lights = lightsOf(this.root);
    this.tinted = -1;
    this.tint();
  }

  private applyStage(stage: string): void {
    if (stage === this.stage) return;
    this.stage = stage;
    const was = this.state.form;
    const wasAct = this.state.act;
    this.state = { act: 'idle', intensity: 0.5, shuttles: 0, guards: 'idle', form: 'ship', ...parseStationStage(stage) };
    if (!this.canTransform) this.state.form = 'ship';
    if (this.state.act !== wasAct) this.actStart = null;
    const st = this.state;
    const { mask, extra, docking: dockMask } = shuttleSlots(st);
    this.slotMask = mask;
    this.dockMask = dockMask;
    this.shuttles.forEach((sh, i) => {
      sh.root.visible = ((mask >> i) & 1) === 1 && st.act !== 'jump';
      for (const h of sh.headings) {
        const docking = ((dockMask >> i) & 1) === 1;
        h.trim.tint = docking ? SUCCESS : PROGRESS;
        h.light.tint = docking ? SUCCESS : PROGRESS;
      }
    });
    this.plus.visible = extra > 0 && st.act !== 'jump';
    if (extra > 0) {
      this.plusText.text = `+${extra}`;
      const w = this.plusText.width + 9;
      (this.plus.children[0] as Graphics).clear()
        .roundRect(-w / 2, -8, w, 16, 8).fill({ color: INK, alpha: 0.85 }).stroke({ width: 1, color: IVORY, alpha: 0.55 });
    }
    this.rock.visible = st.act === 'intake';
    this.retarget(was);
    this.applyIntensity();
    this.face(this.heading ? -1 : 1);
  }

  /** Lit windows, bays and glows follow intensity, in every form built. */
  private applyIntensity(): void {
    const st = this.state;
    const lit = 1 + Math.round(st.intensity * (WINDOW_BUCKETS - 1));
    for (const kit of Object.values(this.kits)) {
      for (const h of kit.headings) {
        h.windows.forEach((g, i) => (g.visible = i < lit));
        h.engines.alpha = 0.15 + 0.85 * st.intensity;
        h.reactor.alpha = 0.2 + 0.8 * st.intensity;
      }
    }
    this.litBays = Math.round(st.intensity * this.b.bays.length);
    this.shield.alpha = 0.05 + 0.95 * st.intensity * st.intensity;
  }

  // ---- Transformation (a station's first form, then its second: stationRig.ts) ----

  /** Whether a tick has run: a station that is told its form before then simply starts in it. */
  private started = false;
  /** The last tick's wall clock (identity motion runs on it). */
  private seconds = 0;
  /** How much power it has, 1 running to 0 dark (`setPower`), the scene clock at the last tick, and how far its idle clock lags it (`powerLag`). */
  private power = 1;
  private sceneAt: number | null = null;
  private lag = 0;
  /** The additive layers under `root` (the art's light), found when the stage is set, and the power the tints were last drawn at. */
  private lights: Container[] = [];
  private tinted = 1;
  /** When the current act began, on the pulse clock (null: on the next tick). */
  private actStart: number | null = null;

  /**
   * The state asks for a form. A pinned progress (`tf`) is shown as given. A change from ship to robot
   * plays the transformation only when it was asked for (`beginTransform`, from the first merge's
   * gather; `expectTransform`; or `go=1` in the gallery); any other change of form (a seek past the first merge, a scene
   * built after it, scrubbing back before it) is a cut.
   */
  private retarget(was: Pose): void {
    if (!this.canTransform) return;
    const st = this.state;
    if (this.leading) {
      // A ship-form stage (the dock act, a rest) keeps the pose and the morph running; the look's robot stage takes the normal path.
      if (st.form === 'ship' && st.morph === undefined) { this.showForm(); return; }
      this.leading = false;
    }
    if (st.morph !== undefined) {
      this.ensureMorph();
      this.morphStart = undefined;
      this.morphU = st.morph;
      this.setPose(st.morph >= 1 ? 'robot' : 'ship');
    } else if (this.morphStart !== undefined) {
      if (st.form === 'ship') { // scrubbed back mid-way
        this.morphStart = undefined;
        this.morphU = undefined;
        this.setPose('ship');
        this.note('interrupted', 'scrubbed-back');
      }
    } else if (st.form === 'robot' && this.pose === 'ship' && was === 'ship' && this.started && !motion.reduced && (st.go || this.seconds <= this.armedUntil)) {
      this.ensureMorph();
      this.morphStart = null;
      this.morphU = 0;
      this.note('played');
    } else {
      this.morphU = undefined;
      if (st.form !== this.pose) {
        const reason = st.form === 'ship' ? 'back-to-first'
          : !this.started ? 'not-started'
          : motion.reduced ? 'reduced-motion'
          : this.armedAt === undefined ? 'never-armed'
          : this.seconds > this.armedUntil ? 'armed-window-passed' : 'other';
        if (st.form === 'robot') this.cutAt = this.seconds;
        this.note('cut', reason);
      }
      this.setPose(st.form);
    }
    this.showForm();
  }

  private note(outcome: FormNote['outcome'], reason?: FormNote['reason']): void {
    if (!this.onForm) return;
    const ago = (at: number | undefined) => (at === undefined ? null : Math.round((this.seconds - at) * 1000));
    this.onForm({ outcome, ...(reason ? { reason } : {}), type: this.dockRig ? 'dock' : 'slide', armedAgoMs: ago(this.armedAt), changedAgoMs: ago(this.cutAt) });
  }

  /** When its tenders began to muster out to their patrol (wall s; null: next tick), or unset. */
  private musterFrom: number | null | undefined;

  /** The episode's opening (2026-10-13): its tenders slide out from the hull to their patrol. */
  muster(): void {
    this.musterFrom = null;
  }

  /** Until when a change to the second form plays the transformation (wall-clock seconds). */
  private armedUntil = -Infinity;

  /** The next change to the second form, within `windowS`, plays the transformation (a first merge). */
  expectTransform(windowS = 6): void {
    this.armedUntil = this.seconds + windowS;
    this.armedAt = this.seconds;
    // Armed too late: the second form already landed, so this first merge's transformation was cut.
    if (this.canTransform) this.note('armed', this.pose === 'robot' && !this.morphing ? 'already-second-form' : undefined);
  }

  /** The transformation began ahead of its stage (a first merge's, from the gather): ship-form stages keep it until the look lands. */
  private leading = false;

  /**
   * A first merge's transformation starts now, ahead of the look that lands the second form at the merge's
   * land. Nothing happens if it can't transform, under reduced motion, or before the first tick (the look
   * then cuts at the land); `leading` holds the morph through the stages in between.
   */
  beginTransform(): void {
    if (!this.canTransform || motion.reduced || !this.started) return;
    if (this.pose === 'robot' && !this.morphing) {
      this.note('armed', 'already-second-form');
      return;
    }
    if (this.morphStart !== undefined) return; // already running
    this.ensureMorph();
    this.morphStart = null;
    this.morphU = 0;
    this.leading = true;
    this.note('played');
  }

  /** A seek or scene entry mid-merge: drop a transformation that is leading its stage and show the stage's form (INV-15). */
  settleForm(): void {
    if (!this.leading) return;
    this.leading = false;
    this.morphStart = undefined;
    this.morphU = undefined;
    this.setPose(this.state.form);
    this.showForm();
    this.note('interrupted', 'scrubbed-back');
  }

  private ensureMorph(): void {
    if (this.morph || this.docking) return;
    this.kit('robot');
    if (this.dockRig) {
      // The parts of the arriving pieces behind the hull go under the forms; the rest over them.
      const [east, west] = dockLooksFor(this.faction, this.colourway).map(buildDock) as [DockLayer, DockLayer];
      for (const l of [east, west]) {
        l.back.visible = l.front.visible = false;
        this.body.addChildAt(l.back, this.body.getChildIndex(this.shield) + 1);
        this.body.addChildAt(l.front, this.body.getChildIndex(this.glow));
      }
      this.docking = { east, west };
      return;
    }
    const [east, west] = piecesFor(this.faction, this.colourway).map(buildMorph) as [MorphLayer, MorphLayer];
    east.root.visible = west.root.visible = false;
    for (const l of [east, west]) this.body.addChildAt(l.root, this.body.getChildIndex(this.glow));
    this.morph = { east, west };
  }

  private setPose(pose: Pose): void {
    if (pose === this.pose) return;
    this.pose = pose;
    this.kit(pose);
    this.applyIntensity();
    this.drawShield();
    this.face(this.heading ? -1 : 1);
  }

  private get morphing(): boolean {
    return this.morphU !== undefined && this.morphU > 0 && this.morphU < 1;
  }

  /**
   * Show the form at rest, or the transformation's pieces while it is under way. A docking keeps a
   * form showing under its arriving pieces: the first, then from the latch the second.
   */
  private showForm(): void {
    const on = this.morphing;
    const hide = on && !this.docking;
    for (const [pose, kit] of Object.entries(this.kits)) kit.headings.forEach((h, i) => (h.root.visible = !hide && pose === this.pose && i === this.heading));
    if (this.morph) {
      this.morph.east.root.visible = on && this.heading === 0;
      this.morph.west.root.visible = on && this.heading === 1;
    }
    if (this.docking) {
      [this.docking.east, this.docking.west].forEach((l, i) => (l.back.visible = l.front.visible = on && this.heading === i));
    }
  }

  /** The transformation at progress u: each piece slides and turns to its robot place, swapping look as it passes the midpoint. */
  private drawMorph(u: number): void {
    const layer = this.heading ? this.morph!.west : this.morph!.east;
    const fx = layer.fx.clear();
    const lift = Math.sin(Math.PI * u);
    layer.root.scale.set(1 - 0.04 * lift, 1 + 0.02 * lift);
    for (const mp of layer.pieces) {
      const { a, b } = mp.piece;
      const rig = RIGS[this.faction]!;
      const e = smooth(0, 1, (u - (rig.start[mp.piece.name] ?? 0)) / rig.span);
      const x = a.cx + (b.cx - a.cx) * e;
      const y = a.cy + (b.cy - a.cy) * e;
      let d = b.ang - a.ang;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      mp.a.position.set(x, y);
      mp.a.rotation = d * e;
      mp.a.scale.set(1 + (b.len / a.len - 1) * e);
      mp.b.position.set(x, y);
      mp.b.rotation = -d * (1 - e);
      mp.b.scale.set(a.len / b.len + (1 - a.len / b.len) * e);
      // A piece that isn't there in the first form simply fades in as it grows into place.
      const swap = mp.piece.grows ? smooth(0, 0.5, e) : smooth(0.35, 0.65, e);
      mp.a.alpha = mp.piece.grows ? 0 : 1 - swap;
      mp.b.alpha = swap;
      // A pulse of light where a piece changes: the joints locking.
      const flash = mp.piece.grows ? 0 : Math.sin(Math.PI * clamp01((e - 0.25) / 0.5));
      if (flash > 0.02) {
        const r = Math.max(a.len, b.len) * 0.28;
        fx.circle(x, y, r * 1.5).fill({ color: SHIELD, alpha: 0.1 * flash }).circle(x, y, r * 0.6).fill({ color: brighten(SHIELD, 0.6), alpha: 0.22 * flash });
      }
    }
    this.rideAlong(u);
  }

  /** The satellites ride along a transformation: tenders and guards slide to their second places, the shield re-fits. */
  private rideAlong(u: number): void {
    const k = smooth(0.1, 0.9, u);
    const [from, to] = [bakedFor(this.faction, this.colourway, 'ship')[this.heading]!, bakedFor(this.faction, this.colourway, 'robot')[this.heading]!];
    this.guards.forEach((g, i) => {
      const [p, q] = [from.pd[i], to.pd[i]];
      if (p && q) g.root.position.set(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k - 1);
    });
    const [pa, pb] = [this.at(designOf(this.faction, 'ship').plus), this.at(designOf(this.faction, 'robot').plus)];
    this.plus.position.set(pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k);
    const [ba, bb] = [this.kit('ship').bounds, this.kit('robot').bounds];
    const mix = (m: number, n: number) => m + (n - m) * k;
    this.drawShield({ x0: mix(ba.x0, bb.x0), x1: mix(ba.x1, bb.x1), y0: mix(ba.y0, bb.y0), y1: mix(ba.y1, bb.y1) });
  }

  /**
   * A docking at progress u (stationRig.ts, Dock): the pieces drop out of hyperspace astern, hold,
   * glide level with their seats and clamp on, while the hull's lights fade as power transfers. At the
   * latch the second form takes over: the seams flare, and a wave of power runs out from the collar
   * round the ring, up and down the fins, and fore and aft along the hull, relighting its windows as
   * it passes, until the drives light.
   */
  private drawDock(u: number): void {
    const d = this.dockRig!;
    const T = u * RIGS[this.faction]!.seconds;
    const latch = d.clamp[1];
    const form: Pose = T >= latch ? 'robot' : 'ship';
    if (form !== this.pose) this.setPose(form);
    const layer = this.heading ? this.docking!.west : this.docking!.east;
    const r = bakedFor(this.faction, this.colourway, 'robot')[this.heading]!.render;
    const h = this.headings[this.heading]!;
    const g = this.glow;

    d.pieces.forEach((p, i) => {
      const { near, far, look } = layer.pieces[i]!;
      const shown = T >= p.at && T < latch;
      near.visible = far.visible = shown;
      if (!shown) return;
      const lerp = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      const jumpK = clamp01((T - p.at) / d.jumpS);
      let at: [number, number];
      if (jumpK < 1) at = lerp(look.jump, look.hold, 1 - Math.pow(1 - jumpK, 4));
      else if (T < d.clamp[0]) at = lerp(look.hold, look.line, smooth(d.align[0], d.align[1], T));
      else at = lerp(look.line, [0, 0], Math.pow(clamp01((T - d.clamp[0]) / (d.clamp[1] - d.clamp[0])), 2)); // it accelerates into the clamp
      near.position.set(at[0], at[1]);
      far.position.set(at[0], at[1]);
      near.alpha = far.alpha = smooth(0.12, 0.4, jumpK);
      // Out of hyperspace: a long bright streak along its path, the drop-out flash, and streaks trailing as it slows.
      if (jumpK < 1) {
        const [cx, cy] = [look.seat[0] + at[0], look.seat[1] + at[1]];
        const [dx, dy] = [look.hold[0] - look.jump[0], look.hold[1] - look.jump[1]];
        const dl = Math.hypot(dx, dy) || 1;
        const [ux, uy] = [dx / dl, dy / dl];
        const run = 1 - smooth(0.2, 0.45, jumpK);
        if (run > 0.01) {
          const [sx, sy] = [look.seat[0] + look.jump[0], look.seat[1] + look.jump[1]];
          g.moveTo(sx, sy).lineTo(cx, cy).stroke({ width: 3, color: IVORY, alpha: 0.18 * run, cap: 'round' });
          g.moveTo(sx, sy).lineTo(cx, cy).stroke({ width: 1, color: 0xffffff, alpha: 0.7 * run, cap: 'round' });
        }
        const pop = Math.exp(-(((jumpK - 0.32) / 0.1) ** 2));
        if (pop > 0.02) g.circle(cx, cy, look.r * 0.5).fill({ color: brighten(SHIELD, 0.4), alpha: 0.16 * pop }).circle(cx, cy, look.r * 0.16).fill({ color: HERO_CORE, alpha: 0.6 * pop });
        const trail = Math.pow(1 - jumpK, 2) * smooth(0.25, 0.4, jumpK);
        for (let k = 0; k < 6; k++) {
          const o = ((k + 0.5) / 6 - 0.5) * look.r * 1.4;
          const [bx, by] = [cx - uy * o - ux * look.r * 0.4, cy + ux * o - uy * look.r * 0.4];
          const len = look.r * (1.2 + 1.4 * hash01(k + 5)) * trail;
          g.moveTo(bx, by).lineTo(bx - ux * len, by - uy * len).stroke({ width: 1, color: IVORY, alpha: 0.4 * trail });
        }
      }
    });

    // Power transfers: the hull's lights fade as the halves clamp on, then relight with the wave.
    const W = (T - d.wave[0]) / (d.wave[1] - d.wave[0]);
    if (T < latch) {
      const dim = smooth(d.clamp[0], latch, T);
      h.windows.forEach((w) => (w.alpha *= 1 - dim));
      h.engines.alpha *= 1 - 0.7 * dim;
    } else {
      h.engines.alpha *= 0.3 + 0.7 * smooth(d.ignite[0], d.ignite[1], T);
      if (W < 1) {
        for (const w of h.windows) w.alpha = 0;
        this.windowsBehindWave(g, r, d, W);
      }
    }

    // The seams flare at the latch and settle toward their resting breath; a bloom at the joints and the collar.
    const seam = smooth(d.clamp[1] - 0.12, latch + 0.05, T) * (1 - 0.75 * smooth(latch + 0.4, d.wave[1], T));
    for (const line of d.seams) drawLine(g, r, line, SHIELD, seam);
    if (T >= latch) {
      const flash = Math.exp(-(T - latch) * 5);
      for (const line of d.seams) {
        const [p, n] = [line.p[0]!, line.n[0]!];
        if (line.p.length > 2 || !r.faces(p, n)) continue;
        const [x, y] = r.at(p);
        g.circle(x, y, 10 * flash).fill({ color: SHIELD, alpha: 0.25 * flash }).circle(x, y, 4 * flash).fill({ color: HERO_CORE, alpha: 0.8 * flash });
      }
      const [cx, cy] = r.at([d.hull.from, 0, 0]);
      g.circle(cx, cy, 34 * (0.6 + 0.4 * (1 - flash))).fill({ color: SHIELD, alpha: 0.14 * flash });
    }

    // The wave: round the ring and along the fins, and as a band of light fore and aft along the hull.
    if (W > 0 && W < 1.3) {
      for (const run of d.runs) {
        const fade = 1 - 0.85 * smooth(run.to, run.to + 0.25, W);
        drawRun(g, r, run, clamp01((W - run.from) / (run.to - run.from)), SHIELD, fade * (1 - smooth(1, 1.3, W)));
      }
      for (const [x1, a, b] of [d.hull.fore, d.hull.aft]) {
        const e = smooth(a, b, W);
        if (e <= 0 || e >= 1) continue;
        drawLine(g, r, d.hull.ring(d.hull.from + (x1 - d.hull.from) * e), SHIELD, 0.9 * Math.sin(Math.PI * Math.min(1, e * 1.4 + 0.15)), 1.4);
      }
    }
    // The drives light: a bloom at every nozzle, the ring's with the rest.
    const ig = smooth(d.ignite[0], d.ignite[1], T);
    const bloom = Math.sin(Math.PI * ig);
    if (bloom > 0.02) for (const e of r.engines) g.circle(e.x, e.y, e.r * 3.2 * bloom).fill({ color: SHIELD, alpha: 0.3 * bloom }).circle(e.x, e.y, e.r * 1.1).fill({ color: brighten(SHIELD, 0.6), alpha: 0.7 * bloom });
    this.rideAlong(u);
  }

  /** The second form's windows lit where the wave has passed (fore and aft of the collar along the hull), flaring just behind it. */
  private windowsBehindWave(g: Graphics, r: HullRender, d: Dock, W: number): void {
    if (W <= 0) return;
    const c = r.at([d.hull.from, 0, 0]);
    const f = r.at([d.hull.fore[0], 0, 0]);
    const fl = Math.hypot(f[0] - c[0], f[1] - c[1]) || 1;
    const [ux, uy] = [(f[0] - c[0]) / fl, (f[1] - c[1]) / fl];
    const along = (p: [number, number]) => (p[0] - c[0]) * ux + (p[1] - c[1]) * uy;
    const front = ([x1, a, b]: readonly [number, number, number]) => Math.abs(along(r.at([d.hull.from + (x1 - d.hull.from) * smooth(a, b, W), 0, 0])));
    const [sf, sa] = [front(d.hull.fore), front(d.hull.aft)];
    const lit = 1 + Math.round(this.state.intensity * (WINDOW_BUCKETS - 1));
    const glow = 0.6 + 0.4 * this.state.intensity;
    r.windows.forEach((p, i) => {
      if (windowBucket(i, this.seed) >= lit) return;
      const s = along(p);
      const behind = s >= 0 ? sf - s : sa + s;
      if (behind < 0) return;
      const c0 = windowColor(i, this.seed);
      const flare = Math.exp(-behind / 9);
      g.circle(p[0], p[1], 1.5 + 2.2 * flare).fill({ color: c0, alpha: 0.1 + 0.3 * flare });
      g.rect(p[0] - 0.55, p[1] - 0.55, 1.1, 1.1).fill({ color: c0, alpha: glow * 0.9 });
    });
  }

  /** At rest in a docking rig's second form, its seams breathe faintly (about 12 s), brighter with intensity. */
  private drawSeams(): void {
    const d = this.dockRig;
    if (!d || this.pose !== 'robot') return;
    const breath = motion.reduced ? 0.5 : 0.5 + 0.5 * Math.sin((2 * Math.PI * this.seconds) / 12 + this.seed);
    const a = (0.1 + 0.14 * breath) * (0.5 + 0.5 * this.state.intensity);
    for (const line of d.seams) drawLine(this.glow, this.b.render, line, SHIELD, a);
  }

  /**
   * A charge before the station fires (the act a beamed strike's maneuver plays). On a docking ring,
   * power climbs both sides of the ring to the dorsal fin and up it to the emitter, which holds lit while
   * the beam fires; otherwise the reactor gathers light. A still frame (t < 0) shows it charged.
   */
  private charge(t: number): void {
    const g = this.glow;
    const r = this.b.render;
    const d = this.dockRig;
    const k = t < 0 ? 1 : clamp01(t / CHARGE_S);
    if (d && this.pose === 'robot') {
      for (const run of d.charge.runs) drawRun(g, r, run, clamp01((k - run.from) / (run.to - run.from)), SHIELD, 1);
      const [ex, ey] = r.at(d.charge.emitter);
      const e = t < 0 ? 0.85 : smooth(0.6 * CHARGE_S, CHARGE_S, t) * (0.85 + 0.15 * Math.sin(t * 9));
      g.circle(ex, ey, 10).fill({ color: SHIELD, alpha: 0.18 * e }).circle(ex, ey, 4.2).fill({ color: brighten(SHIELD, 0.5), alpha: 0.5 * e }).circle(ex, ey, 1.7).fill({ color: HERO_CORE, alpha: 0.9 * e });
      return;
    }
    for (const [x, y] of this.b.reactor) {
      g.circle(x, y, 4 + 8 * k).fill({ color: SHIELD, alpha: 0.1 + 0.12 * k }).circle(x, y, 2 + 2 * k).fill({ color: brighten(SHIELD, 0.5), alpha: 0.5 * k });
    }
  }

  /**
   * The hull's idle drift now, in screen px and radians: a heave of about 1% of its length over
   * 17 s, a sway half that over 31 s, and a roll of a third of a degree over 23 s, phased by its seed.
   */
  private idle(): [number, number, number] {
    if (motion.reduced) return [0, 0, 0];
    const s = this.seconds;
    const k = motion.jiggle * this.px * BASE_L;
    const ph = (this.seed % 997) / 97;
    const TAU = Math.PI * 2;
    return [
      Math.sin((TAU * s) / 31 + ph) * 0.005 * k,
      Math.sin((TAU * s) / 17 + ph * 1.7) * 0.01 * k + this.heave(),
      Math.sin((TAU * s) / 23 + ph * 2.3) * 0.006 * motion.jiggle,
    ];
  }

  /** A docking's clamp gives the hull a heavy nudge down that settles over 0.7 s (screen px). */
  private heave(): number {
    const d = this.dockRig;
    if (!d || !this.morphing) return 0;
    const s = (this.morphU! * RIGS[this.faction]!.seconds - d.clamp[1]) / 0.7;
    return s > 0 && s < 1 ? Math.sin(Math.PI * s) * (1 - s) * 0.014 * this.px * BASE_L : 0;
  }

  /**
   * A tender on patrol: its slot carried slowly round the station on the slots' own ellipse, one turn
   * in PATROL_S, all together so none ever passes another (each still reads as its own tag). Returns
   * where it is, which way it's flying (1 east, −1 west) and how near it is (0 far side, 1 near).
   */
  /**
   * The tenders drawn now, by slot (a read-only test hook, 23 C6): each one's place in px from the view's origin, and
   * whether it is the one docking. Allocates, so only a test calls it.
   */
  tenders(): { slot: number; x: number; y: number; docking: boolean }[] {
    const out: { slot: number; x: number; y: number; docking: boolean }[] = [];
    this.shuttles.forEach((sh, i) => {
      if (((this.slotMask >> i) & 1) === 1 && sh.root.visible) out.push({ slot: i, x: sh.root.position.x, y: sh.root.position.y, docking: ((this.dockMask >> i) & 1) === 1 });
    });
    return out;
  }

  /** Where the dock bay is, in px from the view's origin (a test hook, 23 C6). */
  bay(): { x: number; y: number } {
    const [x, y] = this.b.bays[this.b.bays.length - 1]!;
    return { x, y };
  }

  /**
   * Where a tender's slot lies from the hull's centre, as a unit direction at the current heading (23 C6): the way a
   * per-slot act aims. Null past the cap.
   */
  slotDir(i: number): [number, number] | null {
    const slot = this.design.slots[i];
    if (!slot) return null;
    const [x, y] = this.at(slot);
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  }

  private patrolOf(i: number): { p: [number, number]; dir: number; near: number } {
    const [sx, sy] = this.slotOf(i);
    const slots = this.design.slots;
    const rx = Math.max(...slots.map((q) => Math.abs(q[0])));
    const ry = Math.max(...slots.map((q) => Math.abs(q[1])));
    const a = motion.reduced ? 0 : ((Math.PI * 2 * this.seconds) / PATROL_S) * (this.heading ? -1 : 1);
    const [u, v] = [sx / rx, sy / ry];
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    const [ru, rv] = [u * c - v * sn, u * sn + v * c];
    // The way round it's going: the ellipse's tangent at that point, signed by the turn's direction.
    const vx = -rv * rx * (this.heading ? -1 : 1);
    return { p: [ru * rx, rv * ry], dir: motion.reduced ? (sx > 0 ? -1 : 1) : vx >= 0 ? 1 : -1, near: clamp01(0.5 + rv * 0.5) };
  }

  /** A tender's place: its slot on the form at rest, sliding between the two forms' slots during the transformation. */
  private slotOf(i: number): [number, number] {
    const own = this.design.slots[i]!;
    if (!this.morphing) return this.at(own);
    const k = smooth(0.1, 0.9, this.morphU!);
    const [a, b] = [designOf(this.faction, 'ship').slots[i]!, designOf(this.faction, 'robot').slots[i]!];
    return this.at([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }

  private drawShield(bounds: Bounds = this.bounds): void {
    const { x0, x1, y0, y1 } = bounds;
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const [rx, ry] = [(x1 - x0) / 2 + 12, (y1 - y0) / 2 + 10];
    const g = this.shield.clear();
    g.ellipse(cx, cy, rx * 1.04, ry * 1.06).fill({ color: SHIELD, alpha: 0.03 });
    g.ellipse(cx, cy, rx * 0.92, ry * 0.92).fill({ color: SHIELD, alpha: 0.035 });
    // A lit rim, brightest toward the key light (upper left), like a curved surface catching it.
    for (let k = 0; k < 24; k++) {
      const t0 = (k / 24) * Math.PI * 2;
      const t1 = ((k + 1) / 24) * Math.PI * 2;
      const lit = 0.5 + 0.5 * Math.cos(t0 - (-2.3));
      g.moveTo(cx + Math.cos(t0) * rx, cy + Math.sin(t0) * ry).lineTo(cx + Math.cos(t1) * rx, cy + Math.sin(t1) * ry)
        .stroke({ width: 1.2, color: brighten(SHIELD, 0.3), alpha: 0.05 + 0.2 * lit * lit });
    }
  }

  private drawRock(): void {
    const g = this.rock.clear();
    const pts: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2;
      const r = 13 * (0.78 + 0.32 * hash01(i + 11));
      pts.push(Math.cos(t) * r * 1.15, Math.sin(t) * r * 0.9);
    }
    g.poly(pts).fill(topLit(0x7d7264));
    g.poly([-6, -6, 2, -9, 6, -3, -1, 0]).fill({ color: lighten(0x7d7264, 0.25), alpha: 0.7 });
    g.circle(4, 4, 2).fill({ color: darken(0x7d7264, 0.4) }).circle(-6, 3, 1.4).fill({ color: darken(0x7d7264, 0.35) });
  }

  tick(sceneSeconds: number): void {
    // Its identity motion (the drift, the drives' swell, the window shimmer) runs on a clock of its own,
    // which slows to a stop as power drops and picks up where it stopped: nothing jumps.
    this.lag = powerLag(this.lag, this.sceneAt, sceneSeconds, this.power);
    this.sceneAt = sceneSeconds;
    const seconds = sceneSeconds - this.lag;
    this.started = true;
    this.seconds = seconds;
    if (this.musterFrom === null) this.musterFrom = seconds;
    else if (this.musterFrom !== undefined && seconds - this.musterFrom > 3) this.musterFrom = undefined;
    if (this.builtSecond) {
      this.builtSecond = false;
      this.note('built-second');
    }
    if (this.morphStart !== undefined) {
      if (this.morphStart === null) this.morphStart = seconds;
      const u = (seconds - this.morphStart) / RIGS[this.faction]!.seconds;
      if (motion.reduced || u >= 1) {
        this.morphStart = undefined;
        this.morphU = undefined;
        this.setPose('robot');
        this.note('finished');
      } else {
        this.morphU = Math.max(0, u);
      }
    }
    const reduced = motion.reduced;
    const pt = motion.pulseTime;
    // An act plays from when it began (a jump-in, a docking), looping every EVENT_LOOP_S while it holds.
    if (this.actStart === null || pt < this.actStart) this.actStart = pt;
    const since = pt - this.actStart;
    const loop = Math.floor(since / EVENT_LOOP_S);
    const t = reduced ? -1 : since - loop * EVENT_LOOP_S; // −1: a still frame for reduced motion
    const h = this.headings[this.heading]!;
    const st = this.state;

    // Ambient identity: windows shimmer in buckets (wall time); beacons blink slowly (pulse time).
    const glow = 0.6 + 0.4 * st.intensity;
    h.windows.forEach((g, i) => (g.alpha = glow * (reduced ? 0.9 : 0.72 + 0.28 * Math.sin(seconds * (0.5 + i * 0.23) + i * 1.7 + this.seed))));
    h.beacons.forEach((g, i) => {
      if (reduced) { g.alpha = 0.8; return; }
      const f = ((pt + i * 0.45) / 3.6) % 1;
      g.alpha = 0.25 + 0.75 * Math.exp(-f * 9);
    });
    const breath = reduced ? 1 : 0.85 + 0.15 * Math.sin((pt * Math.PI * 2) / 4.8);
    h.reactor.alpha = (0.2 + 0.8 * st.intensity) * breath;
    // Its drives swell and settle very slowly, a hulk idling (2026-10-12; wall time, slower than a ship's).
    h.engines.alpha = (0.15 + 0.85 * st.intensity) * (reduced ? 1 : 0.8 + 0.2 * Math.sin((2 * Math.PI * seconds) / 11 + this.seed));

    const g = this.fx.clear();
    this.fold.clear();
    this.glow.clear();
    this.showForm();
    if (this.morphing && this.morph) this.drawMorph(this.morphU!);
    if (this.morphing && this.docking) this.drawDock(this.morphU!);
    else this.drawSeams();
    this.jump(t);
    this.drawCannon(g);
    if (st.act === 'intake') this.intake(g, t, seconds);
    if (st.act === 'cover') this.cover(g, t, loop);
    // A charge plays once, then holds charged while the act lasts (the beam is firing).
    if (st.act === 'charge') this.charge(loop > 0 ? -1 : t);
    this.tickGuards(g, t);
    this.tickShuttles(g, t, seconds);
  }

  // ---- Events ----

  /** Jump-in: space folds open in a long lens, the hull slides out of it, slow and heavy, and a ripple rolls out. */
  private jump(t: number): void {
    const jumping = this.state.act === 'jump' && t >= 0;
    const dir = this.heading ? -1 : 1;
    const { x0, x1, y0, y1 } = this.bounds;
    const w = x1 - x0;
    const cy = (y0 + y1) / 2;
    if (!jumping) {
      // A lumbering hulk, alive in space: a slow heave and sway and the faintest roll, out of step
      // with each other so it never reads as a loop (identity motion, 05 §5; none in reduced motion).
      const [dx, dy, roll] = this.idle();
      for (const c of [this.body, this.onHull]) {
        c.position.set(dx, dy);
        c.rotation = roll;
        c.scale.set(this.px);
      }
      this.body.alpha = 1;
      if (this.state.act === 'jump') {
        // Reduced motion: arrived, with the fold's still afterglow ring.
        this.fold.ellipse(0, cy, w * 0.62, (y1 - y0) * 0.62).stroke({ width: 1.2, color: IVORY, alpha: 0.18 });
      }
      return;
    }
    const u = clamp01((t - 0.2) / 2.2);
    const arrive = 1 - (1 - u) * (1 - u);
    const stretch = 1 + 0.9 * (1 - arrive);
    const dx = -dir * w * 0.42 * (1 - arrive);
    this.body.position.set(dx * this.px, 0);
    this.body.rotation = this.onHull.rotation = 0;
    this.body.scale.set(this.px * stretch, this.px);
    this.body.alpha = smooth(0.2, 1.4, t);
    this.onHull.position.set(dx * this.px, 0);
    this.onHull.scale.set(this.px * stretch, this.px);
    // The fold: a long, thin lens of light that opens, flares as the hull clears it, and closes.
    const open = smooth(0, 0.5, t) * (1 - smooth(1.0, 1.7, t));
    const g = this.fold;
    if (open > 0.01) {
      const lw = (w * 0.65) / stretch;
      const lh = 3 + 9 * open * (1 - smooth(0.9, 1.6, t));
      g.ellipse(-dx, cy, lw * 1.2, lh * 2.4).fill({ color: SHIELD, alpha: 0.08 * open });
      g.ellipse(-dx, cy, lw, lh).fill({ color: brighten(SHIELD, 0.5), alpha: 0.32 * open });
      g.ellipse(-dx, cy, lw * 0.92, Math.max(0.6, lh * 0.25)).fill({ color: HERO_CORE, alpha: 0.7 * open });
    }
    // Streaks trailing behind the stretched hull while it is still moving.
    const streak = (1 - arrive) * smooth(0.25, 0.6, t);
    for (let i = 0; i < 6; i++) {
      const y = y0 + ((i + 0.5) / 6) * (y1 - y0);
      const len = w * (0.4 + 0.5 * hash01(i + 3)) * streak;
      const xs = (dir > 0 ? x0 : x1) / stretch;
      g.moveTo(xs, y).lineTo(xs - dir * len / stretch, y).stroke({ width: 1, color: IVORY, alpha: 0.35 * streak });
    }
    // A slow ripple once it's through.
    const rip = smooth(1.0, 2.6, t);
    if (rip > 0 && rip < 1) g.ellipse(-dx, cy, (w * 0.5 + w * 0.12 * rip) / stretch, (y1 - y0) * (0.5 + 0.1 * rip)).stroke({ width: 1.5, color: IVORY, alpha: 0.3 * (1 - rip) });
  }

  /** Mecha: the main cannon gathers light between its booms as the work nears done. */
  private drawCannon(g: Graphics): void {
    const c = this.b.cannon;
    if (!c) return;
    const k = this.state.intensity * this.state.intensity;
    if (k < 0.02) return;
    const [a, b] = c;
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 4, color: SHIELD, alpha: 0.12 * k });
    g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1.2, color: brighten(SHIELD, 0.5), alpha: 0.5 * k });
    g.circle(b[0], b[1], 3.2).fill({ color: SHIELD, alpha: 0.25 * k });
  }

  /** Intake: a soft cyan tractor from a bay to an asteroid, supply crates drifting home along it. */
  private intake(g: Graphics, t: number, seconds: number): void {
    const [bx, by] = this.at(this.design.rock);
    const [ax, ay] = this.b.bays.reduce((best, p) => (Math.hypot(p[0] - bx, p[1] - by) < Math.hypot(best[0] - bx, best[1] - by) ? p : best));
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [-dy / len, dx / len];
    const w0 = 4;
    const w1 = 15;
    const atK = (k: number, side: number, widen = 1): [number, number] => {
      const w = (w0 + (w1 - w0) * k) * widen;
      return [ax + dx * k + nx * w * side, ay + dy * k + ny * w * side];
    };
    for (const [widen, alpha] of [[1.15, 0.08], [0.7, 0.1]] as const) {
      g.poly([...atK(0, -1, widen), ...atK(1, -1, widen), ...atK(1, 1, widen), ...atK(0, 1, widen)]).fill({ color: TRACTOR, alpha });
    }
    const clock = t < 0 ? 0.4 : seconds;
    for (let i = 0; i < 3; i++) {
      const k = (clock * 0.45 + i / 3) % 1;
      const [x0, y0] = atK(k, -0.9);
      const [x1, y1] = atK(k, 0.9);
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.6, color: brighten(TRACTOR, 0.4), alpha: 0.22 * Math.sin(Math.PI * k) });
    }
    g.circle(bx, by, 16).stroke({ width: 2.4, color: brighten(TRACTOR, 0.3), alpha: 0.2 });
    // Supply crates riding the beam in toward the bay.
    for (let i = 0; i < 3; i++) {
      const k = 1 - ((clock * 0.28 + i / 3) % 1);
      const [mx, my] = atK(k, Math.sin(i * 2.3) * 0.4);
      const a = Math.sin(Math.PI * k);
      g.rect(mx - 1.6, my - 1.3, 3.2, 2.6).fill({ color: 0xd9c9a3, alpha: 0.9 * a }).stroke({ width: 0.6, color: brighten(TRACTOR, 0.5), alpha: 0.6 * a });
    }
    g.circle(ax, ay, 4).fill({ color: TRACTOR, alpha: 0.25 });
  }

  /** Covering fire: one shot every 1.5 s from a battery, outward, unhurried (a campfire, not fireworks). */
  private cover(g: Graphics, t: number, loop: number): void {
    const color = STYLE[this.faction].fire;
    const turrets = this.b.turrets;
    const salvo = this.design.salvo ?? 1;
    // A salvo rolls along its batteries a beat apart (the Wars ring's broadside); a still frame shows it all.
    const shots = (t < 0 ? [{ at: -0.5, k: 0 }] : [{ at: 0.6, k: 0 }, { at: 2.1, k: 1 }])
      .flatMap((s) => Array.from({ length: salvo }, (_, j) => ({ at: s.at + j * 0.16, idx: ((loop * 2 + s.k) * salvo + j) % turrets.length })));
    for (const s of shots) {
      const age = t < 0 ? 0.5 : t - s.at;
      if (age < 0 || age > 1.2) continue;
      const idx = s.idx;
      const [mx, my] = turrets[idx]!;
      // Outward from the hull's centre, lifted a little: fire never crosses its own ship.
      const { x0, x1, y0, y1 } = this.bounds;
      const [vx, vy] = [mx - (this.heading ? -(x0 + x1) / 2 : (x0 + x1) / 2), my - (y0 + y1) / 2];
      const vl = Math.hypot(vx, vy) || 1;
      const [qx, qy] = [vx / vl + (this.heading ? -1 : 1) * this.design.aim[0], vy / vl - this.design.aim[1]];
      const ql = Math.hypot(qx, qy) || 1;
      const [ux, uy] = [qx / ql, qy / ql];
      const flash = t < 0 ? 0.6 : Math.exp(-age * 12);
      g.circle(mx, my, 4.5).fill({ color, alpha: 0.25 * flash }).circle(mx, my, 1.8).fill({ color: 0xffffff, alpha: 0.8 * flash });
      const fade = t < 0 ? 0.6 : 1 - smooth(0.55, 0.95, age);
      if (this.design.bolt === 'lance') {
        // A beam lance: it reaches out, holds, and lets go.
        const reach = 95 * (t < 0 ? 1 : smooth(0, 0.3, age));
        const tail = 95 * (t < 0 ? 0 : smooth(0.55, 1.1, age));
        const [sx, sy, ex, ey] = [mx + ux * tail, my + uy * tail, mx + ux * reach, my + uy * reach];
        g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 3.6, color, alpha: 0.2 * fade, cap: 'round' });
        g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 1.1, color: 0xffffff, alpha: 0.85 * fade, cap: 'round' });
      } else {
        const d = 12 + 105 * age;
        const pieces = this.design.bolt === 'bolt' ? [0, 9] : [0, 7, 14];
        for (const lag of pieces) {
          const dd = d - lag;
          if (dd < 4) continue;
          const [cx, cy] = [mx + ux * dd, my + uy * dd];
          if (this.design.bolt === 'bolt') {
            const off = lag ? 1.8 : -1.8;
            const [ox, oy] = [-uy * off, ux * off];
            g.moveTo(cx + ox - ux * 6, cy + oy - uy * 6).lineTo(cx + ox + ux * 6, cy + oy + uy * 6).stroke({ width: 3, color, alpha: 0.25 * fade, cap: 'round' });
            g.moveTo(cx + ox - ux * 5, cy + oy - uy * 5).lineTo(cx + ox + ux * 5, cy + oy + uy * 5).stroke({ width: 1.1, color: lighten(color, 0.5), alpha: 0.95 * fade, cap: 'round' });
          } else {
            g.circle(cx, cy, 3.4).fill({ color, alpha: 0.22 * fade }).circle(cx, cy, 1.5).fill({ color: 0xffffff, alpha: 0.9 * fade });
          }
        }
      }
    }
  }

  /** Point defense: parked (grey lamp), tracking a contact (blue), firing at incoming enemy fire, settled (gold). */
  private tickGuards(g: Graphics, t: number): void {
    const mode = this.state.guards;
    const dir = this.heading ? -1 : 1;
    const lampColor = mode === 'idle' ? READY : mode === 'passed' ? SUCCESS : PROGRESS;
    const { x1, y0 } = this.bounds;
    // The contact: far out off the bow, drifting slowly across.
    const tt = t < 0 ? 1.2 : t;
    const contact: [number, number] = [dir * (x1 + 40), y0 + 10 + 34 * Math.sin((tt / EVENT_LOOP_S) * Math.PI * 2 * 0.5)];
    // Enemy fire for the firing mode: two motes per loop come in and are stopped short of the hull.
    const motes = mode === 'firing' ? [{ hit: 1.3, k: 0 }, { hit: 2.6, k: 1 }] : [];
    this.guards.forEach((gd, i) => {
      const p = this.b.pd[i]!;
      let aim = dir > 0 ? -1.05 : Math.PI + 1.05;
      if (mode === 'tracking') aim = Math.atan2(contact[1] - p[1], contact[0] - p[0]);
      if (mode === 'firing') {
        const m = motes[i % motes.length]!;
        const tgt = this.moteAt(m.k, m.hit - 0.05, dir);
        aim = Math.atan2(tgt[1] - p[1], tgt[0] - p[0]);
      }
      // Barrels slew toward their aim, heavily damped (they track, they don't snap).
      gd.angle = t < 0 || Math.abs(gd.angle - aim) > 3 ? aim : gd.angle + (aim - gd.angle) * 0.12;
      gd.barrels.rotation = gd.angle;
      gd.lamp.tint = lampColor;
      const beat = mode === 'tracking' || mode === 'firing' ? (t < 0 ? 0.6 : progressPulse(motion.pulseTime, i * 0.15, PROGRESS_PERIOD)) : 0;
      gd.lamp.alpha = mode === 'idle' ? 0.7 : 0.75 + 0.25 * beat;
      // Charge up at the start of a run: light gathers into the turret.
      gd.charge.clear();
      if ((mode === 'tracking' || mode === 'firing') && t >= 0 && t < 0.6) {
        const c = smooth(0, 0.6, t);
        gd.charge.circle(0, 0, 10 - 7 * c).stroke({ width: 1, color: PROGRESS, alpha: 0.5 * Math.sin(Math.PI * c) });
      }
      if (mode === 'passed') gd.charge.circle(0, 0, 5.4).stroke({ width: 1, color: SUCCESS, alpha: 0.55 });
    });
    if (mode === 'tracking') {
      // A sensor bracket on the contact, and a faint bearing line from the nearest turret.
      const [cx, cy] = contact;
      const r = 6;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        g.moveTo(cx + sx * r, cy + sy * (r - 3)).lineTo(cx + sx * r, cy + sy * r).lineTo(cx + sx * (r - 3), cy + sy * r).stroke({ width: 1.1, color: PROGRESS, alpha: 0.85 });
      }
      g.circle(cx, cy, 1.3).fill({ color: lighten(READY, 0.4) });
      const p = this.b.pd[0];
      if (p) {
        for (let k = 0; k < 10; k++) {
          const a = k / 10;
          const b = a + 0.05;
          g.moveTo(p[0] + (cx - p[0]) * a, p[1] + (cy - p[1]) * a).lineTo(p[0] + (cx - p[0]) * b, p[1] + (cy - p[1]) * b);
        }
        g.stroke({ width: 0.8, color: PROGRESS, alpha: 0.35 });
      }
    }
    if (mode === 'firing') {
      motes.forEach((m, j) => {
        const gd = this.b.pd[j % this.b.pd.length]!;
        const tm = t < 0 ? m.hit - 0.12 : t;
        const spawn = m.hit - 0.9;
        if (tm >= spawn && tm < m.hit) {
          const [x, y] = this.moteAt(m.k, tm, dir);
          const [px, py] = this.moteAt(m.k, tm - 0.12, dir);
          g.moveTo(px, py).lineTo(x, y).stroke({ width: 2.2, color: HOSTILE, alpha: 0.35, cap: 'round' });
          g.circle(x, y, 1.6).fill({ color: lighten(HOSTILE, 0.3) });
          // Three-round bursts in the last third of a second, meeting it.
          for (let r = 0; r < 3; r++) {
            const fired = m.hit - 0.32 + r * 0.07;
            const age = tm - fired;
            if (age < 0 || age > 0.25) continue;
            const k = clamp01(age / 0.25);
            const tgt = this.moteAt(m.k, m.hit, dir);
            const [ex, ey] = [gd[0] + (tgt[0] - gd[0]) * k, gd[1] + (tgt[1] - gd[1]) * k];
            const [bx, by] = [gd[0] + (tgt[0] - gd[0]) * Math.max(0, k - 0.18), gd[1] + (tgt[1] - gd[1]) * Math.max(0, k - 0.18)];
            g.moveTo(bx, by).lineTo(ex, ey).stroke({ width: 1.2, color: IVORY, alpha: 0.95, cap: 'round' });
          }
        } else if (tm >= m.hit && tm < m.hit + 0.5) {
          // Stopped: a small ivory pop, then a puff that fades. Nothing reaches the hull.
          const [x, y] = this.moteAt(m.k, m.hit, dir);
          const f = (tm - m.hit) / 0.5;
          g.circle(x, y, 2 + 6 * f).stroke({ width: 1, color: IVORY, alpha: 0.6 * (1 - f) });
          g.circle(x, y, 2.4 * (1 - f)).fill({ color: 0xffffff, alpha: 0.8 * (1 - f) });
        }
      });
    }
  }

  /** Where incoming enemy fire is at local time t: it comes in from off the bow toward the hull. */
  private moteAt(k: number, t: number, dir: number): [number, number] {
    const { x1, y0, y1 } = this.bounds;
    const hit = k ? 2.6 : 1.3;
    const u = clamp01((t - (hit - 0.9)) / 0.9);
    const from: [number, number] = [dir * (x1 + 70), k ? y1 - 10 : y0 + 4];
    const pd = this.b.pd[k % this.b.pd.length]!;
    const stop: [number, number] = [pd[0] + dir * 46, pd[1] + (k ? 8 : -14)];
    return [from[0] + (stop[0] - from[0]) * u, from[1] + (stop[1] - from[1]) * u];
  }

  /** Tenders hold their slots, bobbing a little; a merged PR's tender (a volley's, every one together) flies into a bay that glows gold. */
  private tickShuttles(g: Graphics, t: number, seconds: number): void {
    const docking = this.dockMask;
    const mask = this.slotMask;
    const h = this.headings[this.heading]!;
    const bayIdx = this.b.bays.length - 1;
    // The dock bay's light: gold, briefly, while the tender comes home.
    const gold = docking === 0 ? 0 : t < 0 ? 0.8 : smooth(0.7, 1.4, t) * (1 - smooth(2.4, 2.95, t));
    if (gold > 0.01) {
      const [x, y] = this.b.bays[bayIdx]!;
      g.circle(x, y, 16).fill({ color: SUCCESS, alpha: 0.14 * gold }).circle(x, y, 8).fill({ color: SUCCESS, alpha: 0.32 * gold });
      g.circle(x, y, 11).stroke({ width: 1, color: SUCCESS, alpha: 0.5 * gold });
      g.roundRect(x - 3.4, y - 2, 6.8, 4, 1.2).fill({ color: lighten(SUCCESS, 0.5), alpha: gold });
    }
    h.bays.forEach((b, i) => (b.visible = i < this.litBays && !(i === bayIdx && gold > 0.01)));
    this.shuttles.forEach((sh, i) => {
      if (((mask >> i) & 1) === 0) return;
      const pat = this.patrolOf(i);
      // Mustering (an episode's opening): out from the hull to the patrol, a tender a beat apart.
      const m = this.musterFrom === undefined || motion.reduced ? 1 : smooth(i * 0.12, 1.2 + i * 0.12, seconds - (this.musterFrom ?? seconds));
      const [sx, sy] = [pat.p[0] * (0.12 + 0.88 * m), pat.p[1] * (0.12 + 0.88 * m)];
      const bob = motion.reduced ? 0 : Math.sin(seconds * 0.5 + i * 1.9) * 1.2 * motion.jiggle;
      let [x, y] = [sx, sy + bob];
      // Depth: a little smaller and dimmer on the far side of the hull, so the patrol reads as round it.
      let scale = (0.86 + 0.14 * pat.near) * (0.6 + 0.4 * m);
      sh.root.alpha = (0.72 + 0.28 * pat.near) * Math.min(1, m * 3);
      sh.headings.forEach((hh, j) => (hh.root.visible = j === (pat.dir > 0 ? 0 : 1)));
      const docks = ((docking >> i) & 1) === 1;
      if (docks) {
        const [bx, by] = this.b.bays[bayIdx]!;
        const k = t < 0 ? 0.85 : smooth(0.0, 1.6, t);
        x = sx + (bx - sx) * k;
        y = sy + bob * (1 - k) + (by - sy) * k;
        scale = (0.86 + 0.14 * pat.near) * (1 - 0.35 * k);
        sh.root.alpha = t < 0 ? 0.8 : 1 - smooth(1.45, 1.75, t);
        sh.headings.forEach((hh, j) => (hh.root.visible = j === (bx < sx ? 1 : 0)));
      }
      sh.root.position.set(x, y);
      sh.root.scale.set(scale);
      // Open PRs are underway: the running light pulses softly on the progress beat.
      for (const hh of sh.headings) {
        hh.light.alpha = docks ? 1 : motion.reduced ? 0.85 : 0.55 + 0.45 * progressPulse(motion.pulseTime, i * 0.11);
        // On patrol a low glow on a slow pulse; docking, the drive burns (2026-10-12).
        hh.engines.alpha = docks ? 1 : motion.reduced ? 0.4 : 0.25 + 0.2 * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / 7 + i * 1.3));
      }
    });
  }

  destroy(): void {
    if (this.morphing) this.note('interrupted', 'destroyed');
    this.root.destroy({ children: true });
    this.marks.destroy({ children: true });
  }
}
