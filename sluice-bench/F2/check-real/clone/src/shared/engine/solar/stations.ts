// 14 §4 Facilities, on two regular rings (22 C11, 05 §8 S-8; 08 §7): where each facility jumps in,
// fixed over the loaded history. A facility serves every seat with a piece ever linked to one of its
// attachments in the round, weighted by link count. Both rings are concentric with the orbits, at one
// fixed radius each, with their slots at the angles half-way between the planets (the planets start at
// the top, so with an odd count the bottom slot is the middle of the bottom), so the facilities
// interlock with the planets, packed as tightly as their padding allows (the user, 2026-10-16: "as
// tightly as concentric circles of spherical objects can pack into a flat plane"):
// - **The inner ring** is every facility's first choice: as close to the planets as it can be with a
//   facility's width of padding from everything, one slot per gap (more when the facilities serving
//   two or more seats outnumber the gaps: then side by side, and the planets move out to make room).
//   One-seat facilities choose first, each the free gap nearest its planet, leaving one for every other.
// - **The outer ring** takes only the one-seat facilities left over, drawn at `OUTER_SIZE`: just past
//   the planets, one slot per gap (more when needed), the frontier belt beyond.
// "Clear" means a facility's width (at its size) from the other facilities on its ring, half that
// (`BODY_PAD`) from the star and every planet, and the usual `facilityGap` from the pieces, platforms,
// formations, frontier belt and orbit lines (a full width from all of them pushed small, busy systems
// so far out that, at the smallest window, every hit was floored and pieces overlapped: 08 §7). `enterAt` is when
// the region first needs it (`firstNeeds`, 22 C11: its first PR event there in the round), else the
// round's start: it musters in the opening. `summoner` is who made that event. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { UtcMs } from '../../contracts/keys';
import { firstNeeds } from '../pace';
import type { AttachmentFacts, Formation, PieceSlot, RoundFacts, SeatSlot, SolarPlan, StationSlot } from '../types';
import { compoundSlots } from './compound';
import { normAngle, onOrbit, rhoRange, type Circle } from './seats';
import { FACILITY_REACH, GEOMETRY, SQUASH } from './version';

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** What a facility must keep clear of. */
export interface Obstacles {
  /** `body`: the star or a planet, which a ring facility keeps a full padding from (22 C11); else a piece, platform or formation. */
  discs: (Circle & { body?: boolean })[];
  /** Points along every seat's orbit arc; each point is ±orbitBand wide. */
  arcPoints: { x: number; y: number }[];
  frontier: SolarPlan['frontier'];
}

/** Points along a seat's orbit arc, one every ARC_STEP units of arc length. */
const ARC_STEP = 60;
function arcPointsOf(s: SeatSlot): { x: number; y: number }[] {
  const n = Math.max(2, Math.ceil((2 * s.arc * s.rx) / ARC_STEP));
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = s.angle - s.arc + (2 * s.arc * k) / n;
    return { x: s.rx * Math.cos(a), y: s.ry * Math.sin(a) };
  });
}

/** The obstacles a plan's seats, slots and formations make. */
export function obstaclesOf(seats: readonly SeatSlot[], slots: Iterable<PieceSlot>, formations: readonly Formation[], frontier: SolarPlan['frontier']): Obstacles {
  const discs: Obstacles['discs'] = [{ x: 0, y: 0, r: GEOMETRY.starR, body: true }];
  for (const s of seats) discs.push({ x: s.x, y: s.y, r: GEOMETRY.planetR, body: true });
  for (const p of slots) if (p.mode !== 'frontier') discs.push({ x: p.x, y: p.y, r: p.r });
  for (const f of formations) discs.push({ x: f.cx, y: f.cy, r: f.outerR });
  return { discs, arcPoints: seats.flatMap(arcPointsOf), frontier };
}

/**
 * Whether a facility (its whole reach) centred at (x, y) is clear of every obstacle: `gap` from the
 * pieces, platforms, formations and the belt, `bodyGap` from the star and the planets, `lineGap` from
 * the orbit lines (thin, not objects).
 */
export function isClear(x: number, y: number, o: Obstacles, gap: number = GEOMETRY.facilityGap, reach: number = FACILITY_REACH, lineGap: number = gap, bodyGap: number = gap): boolean {
  for (const d of o.discs) if (Math.hypot(x - d.x, y - d.y) < d.r + reach + (d.body ? bodyGap : gap)) return false;
  for (const p of o.arcPoints) if (Math.hypot(x - p.x, y - p.y) < reach + lineGap + GEOMETRY.orbitBand) return false;
  const [lo, hi] = rhoRange({ x, y, r: reach + gap });
  if (lo < o.frontier.rx1 && hi > o.frontier.rx0) return false;
  return true;
}

/** The last resort: past the frontier belt, in the given direction. */
function beyondAll(angle: number, o: Obstacles): { x: number; y: number } {
  const rho = o.frontier.rx1 + (2 * (FACILITY_REACH + GEOMETRY.facilityGap)) / SQUASH + GEOMETRY.lane;
  return { x: rho * Math.cos(angle), y: rho * SQUASH * Math.sin(angle) };
}

/** No belt yet: the rings are placed before the frontier, which then lies beyond them. */
export const NO_BELT: SolarPlan['frontier'] = { rx0: 0, rx1: 0, ry0: 0, ry1: 0 };
/** A facility's padding from everything (22 C11, the user's real runs): its own width. */
export const STATION_PAD = 2 * FACILITY_REACH;
/**
 * The share of `STATION_PAD` a ring facility keeps from the star and the planets (22 C11): half. A full
 * width pushed small, busy systems' planets so far out that at the smallest window (1024×640, VC-3) the
 * floored hits of pieces and platforms overlapped; the stations on a ring keep the full width apart.
 */
export const BODY_PAD = 0.5;
/** An outer-ring facility's size against an inner one's (22 C11): hull, satellites, floor. */
export const OUTER_SIZE = 0.7;
/** How far a ring facility may be drawn past its planned size at a small fit (its floor capped): into half its padding. */
export const RING_MAX_SCALE = 1 + STATION_PAD / (2 * FACILITY_REACH);
/** An inner facility whose seats' centre lies this close to the star (a share of the orbit) has no aim. */
const AIM_MIN = 0.15;
/** The parametric angle of a point on the orbits' ellipses (what `onOrbit` takes). */
const angleOf = (x: number, y: number) => Math.atan2(y / SQUASH, x);
/** About how far a point is from the planets' orbit ellipse (rx = `orbit`): Sampson's first-order distance. */
function orbitGapOf(p: { x: number; y: number }, orbit: number): number {
  const ry = orbit * SQUASH;
  const f = (p.x * p.x) / (orbit * orbit) + (p.y * p.y) / (ry * ry) - 1;
  return Math.abs(f) / (Math.hypot((2 * p.x) / (orbit * orbit), (2 * p.y) / (ry * ry)) || 1);
}
/** The signed turn from `a` to `b`, in (-π, π]. */
const turn = (a: number, b: number) => normAngle(b - a + Math.PI) - Math.PI;

/** One facility to place: who it serves, how much, when it arrives and who summons it. */
export interface FacilityPlan {
  facility: CanonicalKey; atts: AttachmentFacts[]; serves: CanonicalKey[]; weight: Map<CanonicalKey, number>;
  enterAt: UtcMs; summoner: CanonicalKey | null; order: UtcMs;
  /** Its first attachment's opening: where its compound's slots start. */
  firstOpen: UtcMs;
}

/**
 * The facilities with attachments in the round, in order of arrival (when first needed, then key), with
 * the seats each serves. `visited` gives the seats each slotted piece ever held; a linked piece without
 * a slot (a step) stands in for its parent.
 */
export function facilityPlans(f: RoundFacts, seats: readonly SeatSlot[], visited: ReadonlyMap<CanonicalKey, ReadonlySet<CanonicalKey>>): FacilityPlan[] {
  const byFacility = new Map<CanonicalKey, AttachmentFacts[]>();
  for (const key of [...f.attachments.keys()].sort(byKey)) {
    const a = f.attachments.get(key)!;
    byFacility.set(a.facility, [...(byFacility.get(a.facility) ?? []), a]);
  }
  const seatOf = new Set(seats.map((s) => s.person));
  const needs = firstNeeds(f);
  return [...byFacility.entries()].map(([facility, atts]): FacilityPlan => {
    const weight = new Map<CanonicalKey, number>();
    for (const a of atts) {
      for (const link of [...new Set(a.links)].sort(byKey)) {
        const parent = f.pieces.get(link)?.parent ?? null;
        const held = visited.get(link) ?? (parent ? visited.get(parent) : undefined) ?? [];
        for (const seat of held) if (seatOf.has(seat)) weight.set(seat, (weight.get(seat) ?? 0) + 1);
      }
    }
    const first = [...atts].sort((a, b) => a.open.from - b.open.from || byKey(a.key, b.key))[0]!;
    // Undated (hand-built) facts: the first attachment opened in the round stands for the first need.
    const opened = f.at ? undefined : atts.filter((a) => a.open.from >= f.round.startUtc && a.open.from < f.round.endUtc).sort((a, b) => a.open.from - b.open.from || byKey(a.key, b.key))[0];
    const need = needs.get(facility) ?? (opened ? { at: opened.open.from, actor: opened.author } : undefined);
    const enterAt = need ? need.at : f.round.startUtc;
    return {
      facility, atts, weight, serves: seats.filter((s) => weight.has(s.person)).map((s) => s.person),
      enterAt, summoner: need ? need.actor : first.author, order: enterAt, firstOpen: first.open.from,
    };
  }).sort((a, b) => a.order - b.order || byKey(a.facility, b.facility));
}

/**
 * A ring's slot angles (22 C11): half-way between the planets, `perGap` side by side in each gap, evenly
 * spaced, in order round from the top planet's gap. With no seats, `perGap` slots round the star from the top.
 */
export function gapAngles(seats: readonly SeatSlot[], perGap: number): number[] {
  if (!seats.length) return Array.from({ length: perGap }, (_, j) => -Math.PI / 2 + (2 * Math.PI * j) / perGap);
  const n = seats.length;
  const step = (2 * Math.PI) / n;
  const base = (seats.find((s) => s.index === 0) ?? seats[0]!).angle; // the first seat stands at the top
  const out: number[] = [];
  for (let k = 0; k < n; k++) for (let j = 0; j < perGap; j++) out.push(normAngle(base + step * (k + (j + 0.5) / perGap)));
  return out;
}

/** Where the rings put the facilities; null when the inner ring can't hold the ones it must (the planets move out). */
export interface Rings { inner: Map<CanonicalKey, { x: number; y: number }>; outer: Map<CanonicalKey, { x: number; y: number }> }

/**
 * The two rings (22 C11, the user's third look, 2026-10-16): regular, fixed, interlocking with the planets.
 * - **The inner ring:** `perGap` slots in every gap between planets (one, or as many as it takes for the
 *   facilities serving two or more seats), at the largest radius inside the planets at which every slot
 *   keeps a facility's width from everything and from its neighbours. None: null, the planets move out.
 * - **Who sits inside:** one-seat facilities first, in order of arrival, each the free slot nearest its
 *   planet, leaving one for each of the rest; those then take the slot nearest the weighted direction of
 *   their seats (aimless ones the first free).
 * - **The outer ring:** the one-seat facilities left over, at `OUTER_SIZE`, in the gaps again (side by
 *   side if need be), at the smallest radius past the planets where every slot is clear.
 */
export function placeRings(plans: readonly FacilityPlan[], seats: readonly SeatSlot[], o: Obstacles): Rings | null {
  const out: Rings = { inner: new Map(), outer: new Map() };
  if (!plans.length) return out;
  const g = GEOMETRY;
  const n = Math.max(1, seats.length);
  const seatOf = new Map(seats.map((s) => [s.person, s]));
  const orbit = seats.length ? Math.max(...seats.map((s) => s.rx)) : 0;
  const aimOf = (p: FacilityPlan): number | null => {
    if (p.serves.length === 1) return seatOf.get(p.serves[0]!)!.angle;
    if (p.serves.length < 2) return null;
    const total = p.serves.reduce((k, s) => k + p.weight.get(s)!, 0);
    const cx = p.serves.reduce((k, s) => k + seatOf.get(s)!.x * p.weight.get(s)!, 0) / total;
    const cy = p.serves.reduce((k, s) => k + seatOf.get(s)!.y * p.weight.get(s)!, 0) / total;
    return Math.hypot(cx, cy / SQUASH) > AIM_MIN * orbit ? angleOf(cx, cy) : null;
  };
  const singles = plans.filter((p) => p.serves.length === 1);
  const multis = plans.filter((p) => p.serves.length !== 1);

  /**
   * The radius (from `from` toward `to`) at which every taken slot keeps a facility's width (at `size`)
   * from everything and from the other taken slots, and, inside, from the planets' orbit line: the ring
   * stands clear inside the planets, never on their circle. Empty slots ask for no room.
   */
  const radius = (angles: readonly number[], size: number, from: number, to: number, inside: boolean): number | null => {
    const reach = FACILITY_REACH * size;
    const pad = STATION_PAD * size;
    const dir = to >= from ? 1 : -1;
    for (let r = from; dir > 0 ? r <= to : r >= to; r += dir * g.searchStep) {
      const pts = angles.map((a) => onOrbit(r, a));
      if (!pts.every((q) => isClear(q.x, q.y, o, g.facilityGap * size, reach, g.facilityGap, pad * BODY_PAD))) continue;
      if (inside && seats.length && !pts.every((q) => orbitGapOf(q, orbit) >= reach + g.facilityGap + g.orbitBand)) continue;
      if (!pts.every((q, i) => pts.every((p2, j) => j <= i || Math.hypot(q.x - p2.x, q.y - p2.y) >= 2 * reach + pad))) continue;
      return r;
    }
    return null;
  };
  /** Each of `who` (in order) takes the free slot nearest its aim; returns those with none. */
  const take = (who: readonly FacilityPlan[], angles: readonly number[], free: Set<number>, into: Map<CanonicalKey, number>): FacilityPlan[] => {
    const left: FacilityPlan[] = [];
    for (const p of who) {
      const aim = aimOf(p);
      const pick = [...free].sort((a, b) => (aim === null ? a - b : Math.abs(turn(aim, angles[a]!)) - Math.abs(turn(aim, angles[b]!)) || a - b))[0];
      if (pick === undefined) { left.push(p); continue; }
      free.delete(pick);
      into.set(p.facility, pick);
    }
    return left;
  };

  // The inner ring: a slot per gap, or as many side by side as the multi-seat facilities need. Who
  // sits where depends on the angles alone; then the ring's one radius, as close to the planets as fits.
  const perIn = Math.max(1, Math.ceil(multis.length / n));
  const inAngles = gapAngles(seats, perIn);
  const free = new Set(inAngles.map((_, j) => j));
  const room = Math.max(0, free.size - multis.length);
  const inSlot = new Map<CanonicalKey, number>();
  const overflow = [...take(singles.slice(0, room), inAngles, free, inSlot), ...singles.slice(room)];
  take(multis, inAngles, free, inSlot);
  const taken = [...inSlot.values()].map((j) => inAngles[j]!);
  const rIn = radius(taken, 1, seats.length ? orbit : g.starR + 40 * g.searchStep, g.starR, true);
  if (rIn === null) return seats.length ? null : out;
  for (const [k, j] of inSlot) out.inner.set(k, onOrbit(rIn, inAngles[j]!));
  if (!overflow.length) return out;

  // The outer ring: the one-seat facilities left over, smaller, in the gaps past the planets.
  const perOut = Math.max(1, Math.ceil(overflow.length / n));
  const outAngles = gapAngles(seats, perOut);
  const outSlot = new Map<CanonicalKey, number>();
  take(overflow, outAngles, new Set(outAngles.map((_, j) => j)), outSlot);
  const rOut = radius([...outSlot.values()].map((j) => outAngles[j]!), OUTER_SIZE, orbit + g.planetR, g.maxRadius, false) ?? orbit * 2;
  for (const [k, j] of outSlot) out.outer.set(k, onOrbit(rOut, outAngles[j]!));
  return out;
}

/** The stations, from where the two rings put them (arrival order kept): an outer one at `OUTER_SIZE`. */
export function stationSlots(plans: readonly FacilityPlan[], rings: Rings, o: Obstacles): StationSlot[] {
  return plans.map((p) => {
    const ring = rings.outer.has(p.facility) ? 'outer' : 'inner';
    const spot = rings.inner.get(p.facility) ?? rings.outer.get(p.facility) ?? beyondAll(-Math.PI / 2, o);
    return {
      facility: p.facility, serves: p.serves, mode: ring, size: ring === 'outer' ? OUTER_SIZE : 1, x: spot.x, y: spot.y,
      enterAt: p.enterAt, summoner: p.summoner, slots: compoundSlots(p.facility, p.atts, p.firstOpen), cap: GEOMETRY.compoundCap,
    };
  });
}
