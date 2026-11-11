// The solar board in screen terms (v1, 17 D12, VC-3; W4-T2; the mandala since 22 Block D). The plan
// (engine/solar) fixes every place in world units, and since the mandala every slot is kept exactly
// there at any scale: a member's drawn size is capped to its slot's room (`ViewNode.maxScale`) rather
// than the board spreading (the user's rule from 22 C11: keep the symmetry). This pass:
// - puts each seat's pieces on their half-disc slots, and its finished pieces on their trophy slots
//   (`platformSpots`), exactly as planned;
// - moves the frontier's pieces out from the star until their hits clear every planet's group, loiter
//   ring and planned station (23 C8);
// - sits each station on its ring's slot (22 C11; an older graph's takes the first spot on a spiral
//   round its planned one), drawn smaller when its room is less than its floor.
// These read the scale and the plan's places, not who is on the board now, so the board doesn't
// shift as pieces come and go, and a seek lands it where play would have (INV-14, INV-15).
// Mutates the effective nodes' positions in place.
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import type { Formation } from '@shared/engine/types';
import { arcDistance } from '@shared/engine/solar/seats';
import { awayFromStar, loiterRingAt, trophyOffset, type Shell } from '@shared/engine/solar/mandala';
import { isSlotRole, SLOT_ROLES } from '@shared/engine/solar/slots';
import { RING_MAX_SCALE } from '@shared/engine/solar/stations';
import { FACILITY_REACH, GEOMETRY } from '@shared/engine/solar/version';
import { ATTACH_GAP_PX, hitRadius, MIN_TARGET_PX, screenRadius } from '@shared/scene/sizing';

/** Members' centres at least this far apart on screen: two 12 px hit circles and half a pixel each side. */
export const FORMATION_PITCH_PX = 25;

/** A stand-in node, for the sizes the sizing rules give a kind at a world radius. */
const probe = (kind: ViewNode['kind'], r: number): ViewNode => ({ kind, selectable: true, world: { x: 0, y: 0, r } }) as ViewNode;

/** A station's drawn reach at `scale`, world units: its hull's hit (its floor applied) or its satellites', the larger (22 C11, the fit). */
export function stationReach(scale: number): number {
  return Math.max(FACILITY_REACH, hitRadius({ ...probe('facility', GEOMETRY.facilityR), maxScale: RING_MAX_SCALE }, scale));
}

/** A hit circle in world units. */
type Disc = { x: number; y: number; r: number };

// ---- Formations ----

/** A formation as drawn at one camera scale: its centre, member pitch and radius, and outer radius. */
export interface FormationLayout { cx: number; cy: number; pitch: number; memberR: number; outerR: number; offsets: { x: number; y: number }[] }

/**
 * A formation's layout at `scale`, for members drawn at radius `memberR` (world units, floors
 * applied). The hex grid holds every member it ever had, so the layout never changes with the
 * playhead (INV-14).
 */
export function formationLayout(f: Formation, memberR: number, scale: number): FormationLayout {
  // The mandala (22 D1): every slot stays exactly where the plan put it, at any scale; a member's drawn
  // size is capped to its slot's room (`ViewNode.maxScale`) instead of the slots spreading.
  void scale;
  const r = Math.max(f.memberR, memberR);
  const offsets = f.offsets;
  const outerR = offsets.reduce((m, o) => Math.max(m, Math.hypot(o.x, o.y)), 0) + r;
  return { cx: f.cx, cy: f.cy, pitch: f.pitch, memberR: r, outerR, offsets };
}

/** How far a group's hits reach from its centre: its outer members' hits, 12 px at least as GraphScene sizes them. */
export function groupReach(l: FormationLayout, scale: number): number {
  return l.outerR - l.memberR + Math.max(1.1 * l.memberR, MIN_TARGET_PX / 2 / scale);
}

/** A formation's members as drawn: their radius after the screen floor (they share one size). */
export function memberRadius(members: readonly ViewNode[], scale: number): number {
  let r = 0;
  for (const m of members) r = Math.max(r, screenRadius(m, scale) / scale);
  return r;
}

/**
 * Each formation's layout at `scale`, for the formations with a member in `nodes` (`every`: all of
 * them, as the stations keep clear of each formation's place whoever is in it). The member size is
 * the kind's at the plan's radius, so a layout never depends on which members are drawn (INV-14).
 */
export function formationLayouts(solar: NonNullable<ViewGraph['solar']>, nodes: Iterable<ViewNode>, scale: number, every = false): Map<string, FormationLayout> {
  const byId = new Map<string, ViewNode[]>();
  nodes = [...nodes];
  for (const n of nodes) {
    if (!n.cluster) continue;
    const list = byId.get(n.cluster.id);
    if (list) list.push(n);
    else byId.set(n.cluster.id, [n]);
  }
  const out = new Map<string, FormationLayout>();
  for (const f of solar.formations) {
    const members = byId.get(f.id);
    if (!members && !every) continue;
    const r = Math.max(screenRadius(probe(f.role, f.memberR), scale) / scale, memberRadius(members ?? [], scale));
    out.set(f.id, formationLayout(f, r, scale));
  }
  return out;
}

/**
 * Places every formation member (`ViewNode.cluster`) on its formation's screen-terms grid. Members
 * whose formation isn't in `solar` keep their projected spot. Run before the attached and travelling
 * objects are placed, so those keep clear of the formations.
 */
export function placeFormations(effective: Map<string, ViewNode>, scale: number, solar: ViewGraph['solar']): void {
  if (!solar?.formations.length) return;
  // Effective nodes already carry their floored radius, so the layout's member size is as drawn.
  const layouts = formationLayouts(solar, effective.values(), scale);
  for (const e of effective.values()) {
    const c = e.cluster;
    const l = c ? layouts.get(c.id) : undefined;
    const o = l?.offsets[c!.index];
    if (!l || !o) continue;
    e.world = { ...e.world, x: l.cx + o.x, y: l.cy + o.y };
  }
  // The groups spread past their planned places at small scales; the frontier's pieces (unassigned
  // work, on the belt) move out from the star until their hits clear every group's, whoever is on the
  // board (so they depend on the scale alone, INV-14).
  const groups = [...formationLayouts(solar, effective.values(), scale, true).values()];
  const gap = ATTACH_GAP_PX / scale;
  // And every planet's loiter ring as drawn, its ships' hits included (22 D3, D5).
  const drawn = drawnMandalas(solar, scale);
  const shipHit = hitRadius(probe('captain', GEOMETRY.shipR), scale);
  const rings = solar.seats.filter((st) => drawn.has(st.person)).map((st) => ({ x: st.x, y: st.y, r: drawn.get(st.person)!.loiterR + shipHit }));
  // And every planned station (23 C8), drawn yet or not, at the plan's spot and the size a ring
  // station is drawn at most: a ring station sits exactly there (`placeStations`), so a piece pushed
  // out toward one must stop short of it or go past it. The hull's hit at its largest keeps this
  // on the safe side of the smaller one a crowded spot leaves it.
  const hulls = (solar.stations ?? []).map((st) => {
    const size = st.size ?? 1;
    const r = hitRadius({ ...probe('facility', GEOMETRY.facilityR * size), ...(size !== 1 ? { floorScale: size } : {}), ...(st.mode ? { maxScale: RING_MAX_SCALE } : {}) }, scale);
    // A modeless station (an older graph) settles on a spiral up to STATION_REACH_PX from its plan spot: keep clear of all of it.
    return { x: st.x, y: st.y, r: st.mode ? r : r + STATION_REACH_PX / scale };
  });
  const { x: sx, y: sy } = solar.star;
  for (const e of effective.values()) {
    if (e.cluster || !isSlotRole(e.kind) || !e.selectable || !inBelt(e.world, solar)) continue;
    const dx = e.world.x - sx;
    const dy = e.world.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    const hit = hitRadius(e, scale);
    let fallback: { x: number; y: number } | null = null;
    for (let k = 0; k < 80; k++) {
      const x = e.world.x + (dx / len) * k * (8 / scale);
      const y = e.world.y + (dy / len) * k * (8 / scale);
      if (!(groups.every((l) => Math.hypot(l.cx - x, l.cy - y) >= groupReach(l, scale) + hit + gap) && rings.every((q) => Math.hypot(q.x - x, q.y - y) >= q.r + hit + gap))) continue;
      // The first spot clear of the groups and rings is the answer when no spot is clear of the stations too (as before C8).
      fallback ??= { x, y };
      if (hulls.every((q) => Math.hypot(q.x - x, q.y - y) >= q.r + hit + gap)) {
        fallback = { x, y };
        break;
      }
    }
    if (fallback) e.world = { ...e.world, ...fallback };
  }
}

/**
 * A seat's mandala as drawn at `scale` (22 Block D). The trophy shells keep their planned radii at any
 * scale (a trophy is drawn no larger than its world size, so it keeps to its slot: keep the symmetry).
 * The loiter ring keeps its radius too unless the ships, which keep their floor to stay readable, would
 * reach over what it rings at a far zoom; then it moves just far enough out, on every side alike.
 */
export interface DrawnMandala { shells: Shell[]; loiterR: number; within: number }

/** Every seat's drawn mandala at `scale`, by person. A pure function of the plan and the scale (INV-14). */
export function drawnMandalas(solar: NonNullable<ViewGraph['solar']>, scale: number): Map<string, DrawnMandala> {
  const out = new Map<string, DrawnMandala>();
  const gap = ATTACH_GAP_PX / scale;
  const trophyHit = hitRadius({ ...probe('threat', GEOMETRY.platformR), maxScale: 1 }, scale);
  const shipHit = hitRadius(probe('captain', GEOMETRY.shipR), scale);
  for (const seat of solar.seats) {
    const m = seat.mandala;
    if (!m) continue;
    // How far the planet's own pieces reach, their hits as drawn.
    const own = solar.formations.filter((f) => f.seat === seat.person);
    const pieceHit = hitRadius({ ...probe('threat', m.pieceR), maxScale: m.room / m.pieceR }, scale);
    const reach = Math.max(GEOMETRY.planetR, ...own.flatMap((f) => f.offsets.map((o) => Math.hypot(o.x, o.y) + pieceHit)));
    const shells = m.shells;
    const within = m.trophies ? shells[shells.length - 1]!.r : GEOMETRY.planetR;
    const loiterR = loiterRingAt(m.loiterR, within, m.trophies ? trophyHit : reach - GEOMETRY.planetR, shipHit, gap);
    out.set(seat.person, { shells, loiterR, within });
  }
  return out;
}

/**
 * Every trophy slot a region could ever hold (22 D2): each seat's, in close order on its shells round the
 * planet, the first on the star line, as drawn at `scale` (`drawnMandalas`). Keyed `${seat}|${index}`,
 * so a spot depends on the plan and the scale alone, never on who is on the board (INV-14).
 */
export function platformSpots(solar: NonNullable<ViewGraph['solar']>, nodes: Iterable<ViewNode>, scale: number): Map<string, { x: number; y: number }> {
  void nodes;
  const drawn = drawnMandalas(solar, scale);
  const out = new Map<string, { x: number; y: number }>();
  for (const seat of solar.seats) {
    const m = seat.mandala;
    const d = drawn.get(seat.person);
    if (!m || !d) continue;
    const toStar = awayFromStar(solar.star.x - seat.x, solar.star.y - seat.y);
    for (let i = 0; i < m.trophies; i++) {
      const o = trophyOffset(d.shells, i, toStar);
      out.set(`${seat.person}|${i}`, { x: seat.x + o.x, y: seat.y + o.y });
    }
  }
  return out;
}

/**
 * Each planet's loiter ring as drawn at `scale`, onto its effective node (22 D3): the ships rest on it,
 * its name hangs past it, and sorties park on it, all reading the one radius.
 */
export function placeLoiterRings(effective: Map<string, ViewNode>, scale: number, solar: ViewGraph['solar']): void {
  if (!solar?.seats.length) return;
  const drawn = drawnMandalas(solar, scale);
  for (const e of effective.values()) {
    if (e.kind !== 'seat' || !e.loiterR) continue;
    const d = drawn.get(e.canonicalKey);
    if (!d) continue;
    e.loiterR = d.loiterR;
    e.loiterWithin = { r: d.within, trophies: !!e.loiterWithin?.trophies };
  }
}

/** Puts every finished piece on its platform (`platformSpots`). */
export function placePlatforms(effective: Map<string, ViewNode>, scale: number, solar: ViewGraph['solar']): void {
  if (!solar?.seats.length) return;
  let spots: Map<string, { x: number; y: number }> | null = null;
  for (const e of effective.values()) {
    const p = e.platform;
    if (!p) continue;
    spots ??= platformSpots(solar, effective.values(), scale);
    const at = spots.get(`${p.seat}|${p.index}`);
    if (at) e.world = { ...e.world, x: at.x, y: at.y };
  }
}

// ---- Stations ----

/** Whether a world disc lies in the frontier belt (its ellipses' ρ, as the plan measures it). */
function inBelt(w: { x: number; y: number; r: number }, solar: NonNullable<ViewGraph['solar']>): boolean {
  const f = solar.frontier;
  if (!(f.rx1 > f.rx0)) return false;
  const rho = Math.hypot(w.x - solar.star.x, ((w.y - solar.star.y) * f.rx0) / f.ry0);
  return rho >= f.rx0 - w.r && rho <= f.rx1 + w.r;
}

/** The spiral's step and reach, in screen px: a station moves at most this far from its plan spot. */
const STATION_STEP_PX = 6;
const STATION_REACH_PX = 240;
/** How far a station goes to get off an orbit line too, once a spot clear of bodies is found. */
const ORBIT_REACH_PX = 96;

/** How far a world point is from the frontier belt (where unassigned pieces drift): negative inside it. */
function beltRoom(p: { x: number; y: number }, solar: NonNullable<ViewGraph['solar']>): number {
  const f = solar.frontier;
  if (!(f.rx1 > f.rx0)) return Infinity;
  const x = p.x - solar.star.x;
  const y = p.y - solar.star.y;
  const d = Math.min(orbitDistance(x, y, f.rx0, f.ry0), orbitDistance(x, y, f.rx1, f.ry1));
  const inside = (x * x) / (f.rx0 * f.rx0) + (y * y) / (f.ry0 * f.ry0) > 1 && (x * x) / (f.rx1 * f.rx1) + (y * y) / (f.ry1 * f.ry1) < 1;
  return inside ? -d : d;
}

/** About how far a world point is from an orbit's line (Sampson's first-order distance to the ellipse). */
function orbitDistance(x: number, y: number, rx: number, ry: number): number {
  const f = (x * x) / (rx * rx) + (y * y) / (ry * ry) - 1;
  const gx = (2 * x) / (rx * rx);
  const gy = (2 * y) / (ry * ry);
  return Math.abs(f) / (Math.hypot(gx, gy) || 1);
}

/**
 * A ring station (22 C11) sits exactly on its planned slot: the rings are regular, a station's width of
 * padding is its room, and its drawn size is capped to it. A station from an older graph (no ring) takes
 * the first spot, on a spiral round its planned one, whose hull's hit clears the board by the attach
 * gap; while one is also off every orbit line, that one. The board is
 * fixed by the plan and the scale alone: the star, the planets, every group's disc, every platform spot, the frontier belt
 * with room for a piece's hit anywhere round its middle (so whichever frontier pieces are drawn), and
 * the stations settled before it. Every planned station (`solar.stations`, drawn yet or not) settles
 * in the plan's order, arrival then key, and a drawn one takes its settled spot. So a station's spot
 * depends on the plan and the scale only, never on the playhead, which stations are drawn, the
 * renderer's map order, or how the playhead got there (INV-14, seek equals play). A drawn station
 * missing from the list (an older graph) settles after them all. Run after the pieces and groups are
 * placed, and before the ships, which then keep clear of the stations.
 */
export function placeStations(effective: Map<string, ViewNode>, scale: number, solar: ViewGraph['solar']): void {
  if (!solar) return;
  const drawn = [...effective.values()].filter((e) => e.kind === 'facility');
  if (!drawn.length) return;
  // Memoised by content (v1.3 F6). A projection builds a new `solar` object each time, so identity
  // would almost never hit; the key is the plan's content (JSON, computed once per plan object), the
  // scale, and the size-bearing fields of the drawn stations and formation members. The last few
  // answers are kept, so a seek or a re-projection to the same plan and scale reuses one. The answer
  // is by drawn-node position (the signature fixes the order), so two nodes that share a key still
  // settle separately, as before.
  const sig = `${planSig(solar)}#${stationInputs(drawn, effective, scale)}`;
  let hit = stationMemo.find((m) => m.sig === sig);
  if (hit) stationMemoStats.hits++;
  else {
    hit = { sig, answer: computeStations(drawn, effective, scale, solar) };
    stationMemoStats.computes++;
    stationMemo.unshift(hit);
    if (stationMemo.length > STATION_MEMO_MAX) stationMemo.pop();
  }
  drawn.forEach((e, i) => {
    const a = hit!.answer[i]!;
    e.world = { ...e.world, x: a.x, y: a.y, ...(a.r !== undefined ? { r: a.r } : {}) };
    if (a.maxScale1) e.maxScale = 1;
  });
}

type StationAnswer = { x: number; y: number; r?: number; maxScale1: boolean }[];
const STATION_MEMO_MAX = 4;
const stationMemo: { sig: string; answer: StationAnswer }[] = [];
const planSigs = new WeakMap<object, string>();
/** The plan's content as a string, computed once per plan object (a plan is plain data). */
function planSig(solar: NonNullable<ViewGraph['solar']>): string {
  let sig = planSigs.get(solar);
  if (sig === undefined) planSigs.set(solar, (sig = JSON.stringify(solar)));
  return sig;
}
/** Test hooks (placeStations.test.ts): the memo's hit and compute counts, and a way to empty it. */
export const stationMemoStats = { hits: 0, computes: 0 };
export function clearStationMemo(): void {
  stationMemo.length = 0;
  stationMemoStats.hits = 0;
  stationMemoStats.computes = 0;
}

/** Everything `computeStations` reads off the effective nodes, as one string. */
function stationInputs(drawn: ViewNode[], effective: Map<string, ViewNode>, scale: number): string {
  const part = (n: ViewNode) => `${n.world.x},${n.world.y},${n.world.r},${n.maxScale ?? ''},${n.floorScale ?? ''},${n.selectable ? 1 : 0},${n.radar?.band ?? ''}`;
  const parts: string[] = [String(scale)];
  for (const e of drawn) parts.push(`${e.canonicalKey}|${part(e)}`);
  // Formation members only size their group (`memberRadius`): their cluster, kind and size inputs.
  for (const e of effective.values()) if (e.cluster) parts.push(`${e.cluster.id}|${e.kind}|${e.world.r},${e.maxScale ?? ''},${e.floorScale ?? ''},${e.selectable ? 1 : 0},${e.radar?.band ?? ''}`);
  return parts.join(';');
}

function computeStations(drawn: ViewNode[], effective: Map<string, ViewNode>, scale: number, solar: NonNullable<ViewGraph['solar']>): StationAnswer {
  const gap = ATTACH_GAP_PX / scale;
  const band = GEOMETRY.orbitBand;
  const planetHit = hitRadius(probe('seat', GEOMETRY.planetR), scale);
  const starHit = hitRadius(probe('star', GEOMETRY.starR), scale);
  const groups = [...formationLayouts(solar, effective.values(), scale, true).values()].map((l) => ({ x: l.cx, y: l.cy, r: groupReach(l, scale) }));
  const fixed: Disc[] = [{ ...solar.star, r: starHit }, ...groups];
  for (const seat of solar.seats) fixed.push({ x: seat.x, y: seat.y, r: planetHit });
  // Every platform a finished piece could take (fixed by the plan and the scale, so still INV-14): a
  // station is big enough to reach one (half a planet, 2026-10-12).
  const platformHit = Math.max(...SLOT_ROLES.map((role) => hitRadius(probe(role, GEOMETRY.platformR), scale)));
  for (const p of platformSpots(solar, effective.values(), scale).values()) fixed.push({ ...p, r: platformHit });
  // A frontier piece stands on the belt's middle ellipse; its hit reaches this far off it.
  const frontierHit = Math.max(...SLOT_ROLES.map((role) => hitRadius(probe(role, GEOMETRY.frontierR), scale)));
  const f = solar.frontier;
  const { x: sx, y: sy } = solar.star;
  const midRoom = (x: number, y: number) => (f.rx1 > f.rx0 ? orbitDistance(x - sx, y - sy, (f.rx0 + f.rx1) / 2, (f.ry0 + f.ry1) / 2) : Infinity);
  /** The first clear spot round (x0, y0) for a hull's hit of `r`, keeping clear of `fixed` and `placed`. */
  const settle = (x0: number, y0: number, r: number, placed: readonly Disc[]): { x: number; y: number } => {
    const clear = (x: number, y: number) => beltRoom({ x, y }, solar) >= r + gap && midRoom(x, y) >= r + gap + frontierHit
      && fixed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap)
      && placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap);
    const offOrbits = (x: number, y: number) => solar.seats.every((s) => arcDistance(s, x - sx, y - sy) >= r + band);
    let spot: { x: number; y: number } | null = null;
    let near: { x: number; y: number } | null = null;
    const a0 = Math.atan2(y0 - sy, x0 - sx); // outward first
    for (let k = 0; k * STATION_STEP_PX <= STATION_REACH_PX && !spot && !(near && k * STATION_STEP_PX > ORBIT_REACH_PX); k++) {
      const n = k === 0 ? 1 : 8 * k;
      for (let i = 0; i < n; i++) {
        const turn = (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * ((2 * Math.PI) / n); // 0, +1, -1, +2 … steps round from outward
        const p = { x: x0 + Math.cos(a0 + turn) * (k * STATION_STEP_PX) / scale, y: y0 + Math.sin(a0 + turn) * (k * STATION_STEP_PX) / scale };
        if (!clear(p.x, p.y)) continue;
        if (offOrbits(p.x, p.y)) { spot = p; break; }
        near ??= p;
      }
    }
    return spot ?? near ?? { x: x0, y: y0 };
  };
  const placed: Disc[] = [];
  const answer: StationAnswer = [];
  const settled = new Map<string, { x: number; y: number }>();
  /** A ring station's drawn radius at most (world units): what its spot leaves it on screen (22 C11). */
  const room = new Map<string, number>();
  const ring = (solar.stations ?? []).filter((st) => st.mode);
  for (const st of solar.stations ?? []) {
    // A ring station (22 C11) sits exactly on its slot: the rings are regular, and its padding is its
    // room. At a small fit the board spreads to its screen pitches (formations, platforms) and every
    // hit has its floor, so it is drawn no bigger than its spot leaves it: smaller, never moved.
    const size = st.size ?? 1;
    const r = hitRadius({ ...probe('facility', GEOMETRY.facilityR * size), ...(size !== 1 ? { floorScale: size } : {}), ...(st.mode ? { maxScale: RING_MAX_SCALE } : {}) }, scale);
    const p = st.mode ? { x: st.x, y: st.y } : settle(st.x, st.y, r, placed);
    if (st.mode) {
      const free = Math.min(
        ...fixed.map((d) => Math.hypot(d.x - p.x, d.y - p.y) - d.r - gap),
        ...ring.filter((o) => o !== st).map((o) => Math.hypot(o.x - p.x, o.y - p.y) / 2 - gap / 2),
        beltRoom(p, solar) - gap,
        midRoom(p.x, p.y) - frontierHit - gap,
      );
      // Its hit is a tenth past what it draws (sizing.ts): the drawing keeps the hit inside the room.
      room.set(st.facility, Math.max(free / 1.1, 4 / scale));
    }
    settled.set(st.facility, p);
    placed.push({ ...p, r: Math.min(r, room.get(st.facility) ?? r) });
  }
  // A drawn station missing from the plan (an older graph) settles after them, in key order, and the
  // later ones keep clear of it too.
  const inOrder = drawn.map((e, i) => ({ e, i })).sort((a, b) => (a.e.canonicalKey < b.e.canonicalKey ? -1 : a.e.canonicalKey > b.e.canonicalKey ? 1 : 0));
  for (const { e, i } of inOrder) {
    let p = settled.get(e.canonicalKey);
    if (!p) {
      const r = hitRadius(e, scale);
      p = settle(e.world.x, e.world.y, r, placed);
      placed.push({ ...p, r });
    }
    const cap = room.get(e.canonicalKey);
    // Its radius is now its drawn size: no floor grows it, or its hit, past that (22 C11).
    answer[i] = { x: p.x, y: p.y, ...(cap !== undefined && cap < e.world.r ? { r: cap } : {}), maxScale1: cap !== undefined };
  }
  return answer;
}
