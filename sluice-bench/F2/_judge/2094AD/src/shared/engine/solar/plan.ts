// 14 §4 — the solar plan: a region's fixed setup over the loaded history. Seats on their orbits,
// every piece's slot at every seat it visited (free or in a formation), the frontier belt and its
// slots, and the facilities with their satellite slots. It reads the round's facts only, never the
// playhead, so a seek never reflows the board (INV-14); the projection decides which slots are filled
// at the playhead (`pieceAt`). Keys are sorted everywhere, and nothing
// depends on Map insertion order. Memoised per facts object. Pure.
import type { CanonicalKey, UtcMs } from '../../contracts/keys';
import { heldSpans, memberAt, seatAtTime } from '../facts';
import type { DomainPack, Formation, PieceFacts, PieceSlot, RoundFacts, SeatMandala, SolarPlan } from '../types';
import { awayFromStar, halfDiscSlots, loiterRadius, trophyOffset, trophyShells } from './mandala';
import { frontierBelt, frontierSlots } from './frontier';
import { baseAngle, placeSeats, rhoRange, type Circle } from './seats';
import { rosters, seatOrder, SLOT_ROLES, type SeatRoster } from './slots';
import { facilityPlans, NO_BELT, obstaclesOf, OUTER_SIZE, placeRings, STATION_PAD, stationSlots } from './stations';
import { FACILITY_REACH, GEOMETRY, SOLAR_LAYOUT_VERSION } from './version';

/** What the plan reads from a pack: its id (for the memo). */
export type PlanPack = Pick<DomainPack, 'id'>;

/** A slot's key in `SolarPlan.slots`. */
export function slotKey(seat: CanonicalKey | 'frontier', piece: CanonicalKey): string {
  return `${seat}|${piece}`;
}

/** A formation's id: one per (seat, role). */
export function formationId(seat: CanonicalKey, role: 'objective' | 'threat'): string {
  return `${seat}|${role}`;
}

/** A trophy slot's width (22 D2): the larger of a closed story and a closed bug, which share one size. */
export const TROPHY_W = 2 * GEOMETRY.platformR;

/**
 * A seat's mandala (22 D1–D3), fixed for the round: its pieces' size on the planet (both sides one size,
 * shrunk to the busier side's room), its trophy shells for every piece that closes there, and the loiter
 * ring past them.
 */
function mandalaOf(roster: SeatRoster | undefined, trophies: number): SeatMandala {
  const g = GEOMETRY;
  const left = halfDiscSlots(roster?.formation.objective.length ?? 0, g.planetR, -1);
  const right = halfDiscSlots(roster?.formation.threat.length ?? 0, g.planetR, 1);
  const room = Math.min(roster?.formation.objective.length ? left.room : Infinity, roster?.formation.threat.length ? right.room : Infinity);
  const shells = trophyShells(g.planetR, TROPHY_W, trophies);
  return { pieceR: Math.min(g.pieceR, room), room: Number.isFinite(room) ? room : g.pieceR, trophies, shells, loiterR: loiterRadius(shells, TROPHY_W) };
}

/**
 * A seat's footprint round its planet's centre (22 Block D): its whole mandala, the loiter ring and
 * a ship's length past it, every slot inside. The same at any angle.
 */
function footprintOf(m: SeatMandala): (angle: number) => Circle[] {
  const r = m.loiterR + 2 * GEOMETRY.shipR;
  return () => [{ x: 0, y: 0, r }];
}

/**
 * The pieces that close at a seat in the round, in the order they closed there (22 D2): each by the
 * first instant it was Accomplished while held there (one already done when it came, as it came), ties
 * by key. Fixed for the round, so a trophy's slot never moves (INV-14).
 */
function closeOrder(f: RoundFacts, seat: CanonicalKey, pieces: readonly CanonicalKey[]): CanonicalKey[] {
  const at = (p: PieceFacts): number => {
    let best = Infinity;
    for (const span of heldSpans(p, f.round)) {
      if (span.seat !== seat) continue;
      p.signalAt.forEach((s, i) => {
        if (s.signal.rung !== 'accomplished') return;
        const to = p.signalAt[i + 1]?.from ?? Infinity;
        const from = Math.max(s.from, span.from);
        if (from < Math.min(to, span.to)) best = Math.min(best, from);
      });
    }
    return best;
  };
  return pieces.map((k) => [k, at(f.pieces.get(k)!)] as const).filter(([, t]) => Number.isFinite(t))
    .sort(([a, ta], [b, tb]) => ta - tb || (a < b ? -1 : a > b ? 1 : 0)).map(([k]) => k);
}

/** The seats' pieces have no free cap in v4: every piece is standalone in its seat's region. */
const NO_FREE_CAP = { objective: 0, threat: 0 } as const;

function build(f: RoundFacts, pack: PlanPack): SolarPlan {
  void pack;
  const g = GEOMETRY;
  const r = rosters(f, NO_FREE_CAP);
  const people = seatOrder(f, r);
  // The facilities' inner ring needs room between the star and the planets (22 C11): with none, the
  // planets' ring moves out until it fits.
  // Each seat's mandala (22 Block D), from its roster and the pieces that close there.
  const closes = new Map(people.map((p) => {
    const roster = r.seats.get(p);
    return [p, closeOrder(f, p, roster ? [...roster.formation.objective, ...roster.formation.threat] : [])] as const;
  }));
  const mandalas = new Map(people.map((p) => [p, mandalaOf(r.seats.get(p), closes.get(p)!.length)] as const));
  let minRx = 0;
  for (let tries = 0; ; tries++) {
    const plan = attempt(f, r, people, minRx, mandalas, closes);
    if (plan.version !== PUSH || tries >= MAX_PUSHES) return { ...plan, version: SOLAR_LAYOUT_VERSION };
    minRx = plan.seats[0]!.rx + Math.max(g.radiusStep, Math.ceil(plan.seats[0]!.rx * 0.05));
  }
}

/** The version an attempt returns when its facilities' inner ring didn't fit: push the planets out and try again. */
const PUSH = -1;
/** The most pushes before the inner ring gives up (each moves the planets out by at least 5%). */
const MAX_PUSHES = 40;

function attempt(f: RoundFacts, r: ReturnType<typeof rosters>, people: CanonicalKey[], minRx: number, mandalas: Map<CanonicalKey, SeatMandala>, closes: Map<CanonicalKey, CanonicalKey[]>): SolarPlan {
  const g = GEOMETRY;
  const placed = placeSeats(people, people.map((p) => footprintOf(mandalas.get(p)!)), f.region, minRx);
  const seats = placed.seats.map((s) => ({ ...s, mandala: mandalas.get(s.person)! }));
  const reach = placed.reach;
  const slots: PieceSlot[] = [];
  const platforms: PieceSlot[] = [];
  const formations: Formation[] = [];
  for (const seat of seats) {
    const roster = r.seats.get(seat.person);
    if (!roster) continue;
    const m = seat.mandala;
    // On the planet (22 D1): stories on its left half-disc, bugs on its right, by arrival, one size.
    for (const role of SLOT_ROLES) {
      const members = roster.formation[role];
      if (members.length === 0) continue;
      const id = formationId(seat.person, role);
      const disc = halfDiscSlots(members.length, g.planetR, role === 'objective' ? -1 : 1);
      formations.push({ id, seat: seat.person, role, cx: seat.x, cy: seat.y, memberR: m.pieceR, pitch: disc.pitch, outerR: g.planetR, offsets: disc.offsets, members: [...members] });
      disc.offsets.forEach((h, index) => {
        slots.push({ seat: seat.person, piece: members[index]!, mode: 'formation', x: seat.x + h.x, y: seat.y + h.y, r: m.pieceR, formation: id, index });
      });
    }
    // Trophies (22 D2): one ring round the planet, in the order they closed here, the first on the star line.
    const toStar = awayFromStar(-seat.x, -seat.y);
    closes.get(seat.person)!.forEach((piece, index) => {
      const o = trophyOffset(m.shells, index, toStar);
      platforms.push({ seat: seat.person, piece, mode: 'platform', x: seat.x + o.x, y: seat.y + o.y, r: g.platformR, index });
    });
  }

  // The two regular rings (22 C11): the inner first, every facility's first choice; the one-seat
  // facilities it had no slot for on the outer; the frontier belt beyond.
  const plans = facilityPlans(f, seats, r.visited);
  const rings = placeRings(plans, seats, obstaclesOf(seats, [...slots, ...platforms], formations, NO_BELT));
  const outerReach = Math.max(0, ...[...(rings?.outer.values() ?? [])].map((p) => rhoRange({ x: p.x, y: p.y, r: (FACILITY_REACH + STATION_PAD) * OUTER_SIZE })[1]));
  const frontier = frontierBelt(Math.max(reach, outerReach), r.frontier.length);
  slots.push(...frontierSlots(r.frontier, frontier, baseAngle(f.region)));
  const stations = stationSlots(plans, rings ?? { inner: new Map(), outer: new Map() }, obstaclesOf(seats, [...slots, ...platforms], formations, frontier));

  const byKey = new Map(slots.map((s) => [slotKey(s.seat, s.piece), s]));
  const sorted = new Map([...byKey.keys()].sort().map((k) => [k, byKey.get(k)!]));
  const platformMap = new Map(platforms.map((p) => [slotKey(p.seat, p.piece), p] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { version: rings ? SOLAR_LAYOUT_VERSION : PUSH, star: { x: 0, y: 0, r: g.starR }, seats, slots: sorted, platforms: platformMap, formations, frontier, stations };
}

const memo = new WeakMap<RoundFacts, Map<string, SolarPlan>>();

/** The fixed setup for a round's facts (14 §2.3), memoised on (facts, pack, version). */
export function planSolar(f: RoundFacts, pack: PlanPack): SolarPlan {
  const key = `${pack.id}|${SOLAR_LAYOUT_VERSION}`;
  let byPack = memo.get(f);
  if (!byPack) memo.set(f, (byPack = new Map()));
  let plan = byPack.get(key);
  if (!plan) byPack.set(key, (plan = build(f, pack)));
  return plan;
}

/**
 * Where a piece shows at the playhead `t`: its current seat's slot, the frontier's while unassigned,
 * or null while it isn't a member (or holds no slot of its own: a stay Off throughout opens none).
 * Always one of `plan.slots`. It reads the facts' own readers, the timeline the slots were cut from.
 */
export function pieceAt(plan: SolarPlan, f: RoundFacts, piece: CanonicalKey, t: UtcMs): PieceSlot | null {
  const p = f.pieces.get(piece);
  if (!p || !memberAt(p, t)) return null;
  return plan.slots.get(slotKey(seatAtTime(p, t) ?? 'frontier', piece)) ?? null;
}
