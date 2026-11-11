// 14 §4 Seats — one planet per seat around the region's star, fixed over the loaded history (INV-14).
// The seats form a perfectly regular ring (v4, 2026-10-12): even angles, 2π / n apart, in a stride
// coprime with n so neighbouring first-join seats sit far apart (area control, 13 §3), all at one
// radius: the smallest at which every footprint (the planet, its low-orbit platforms and its pieces)
// clears the star and every other footprint. The ring starts at the top, so the picture is the same
// every time. Each seat's orbit is a short arc through its planet. Planets never orbit in playback. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { SeatSlot } from '../types';
import { GEOMETRY, SQUASH } from './version';

/** A disc in world units. */
export interface Circle { x: number; y: number; r: number }

/** The golden ratio: a stride near n/φ spreads consecutive seats like a sunflower's seeds. */
const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = 2 * Math.PI;
/** Points sampled round a disc for its ρ-range; the pad covers the sampling error (< 0.3 units). */
const RHO_SAMPLES = 64;
const RHO_PAD = 1;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * The angle stride for `n` seats: the integer nearest n/φ with gcd(s, n) = 1, searched outward
 * (the nearer candidate first, the lower on a tie); 1 for n ≤ 2.
 */
export function strideFor(n: number): number {
  if (n <= 2) return 1;
  const target = n / PHI;
  const candidates = Array.from({ length: n - 1 }, (_, i) => i + 1)
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  return candidates.find((c) => gcd(c, n) === 1) ?? 1;
}

/** The angle slot of each of `n` seats, in seat order: (i · s) mod n, a permutation of 0..n-1. */
export function angleSlots(n: number): number[] {
  const s = strideFor(n);
  return Array.from({ length: n }, (_, i) => (i * s) % n);
}

/** The ring's turn: the first seat at the top, whatever the region (a regular, canonical picture). The region is unused. */
export function baseAngle(region: string): number {
  void region;
  return -Math.PI / 2;
}

/** An angle in [0, 2π). */
export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Orbit radius through a point: the rx of the orbit ellipse (centred on the star) through it. */
export function rhoOf(x: number, y: number): number {
  return Math.hypot(x, y / SQUASH);
}

/** The range of orbit radius a disc covers: which orbits it would touch. */
export function rhoRange(c: Circle): [number, number] {
  if (Math.hypot(c.x, c.y) <= c.r) {
    let hi = 0;
    for (let k = 0; k < RHO_SAMPLES; k++) {
      const a = (k / RHO_SAMPLES) * TAU;
      hi = Math.max(hi, rhoOf(c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)));
    }
    return [0, hi + RHO_PAD];
  }
  let lo = Infinity;
  let hi = 0;
  for (let k = 0; k < RHO_SAMPLES; k++) {
    const a = (k / RHO_SAMPLES) * TAU;
    const rho = rhoOf(c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a));
    lo = Math.min(lo, rho);
    hi = Math.max(hi, rho);
  }
  return [Math.max(0, lo - RHO_PAD), hi + RHO_PAD];
}

/** A point on the orbit of radius rx at an angle. */
export function onOrbit(rx: number, angle: number): { x: number; y: number } {
  return { x: rx * Math.cos(angle), y: rx * SQUASH * Math.sin(angle) };
}

/** A seat's footprint around its planet's centre: the planet, its free slots and its formations. */
export type Footprint = readonly Circle[];

/** The ρ-range of a footprint placed with its planet at (px, py). */
export function footprintRange(fp: Footprint, px: number, py: number): [number, number] {
  let lo = Infinity;
  let hi = 0;
  for (const c of fp) {
    const [a, b] = rhoRange({ x: px + c.x, y: py + c.y, r: c.r });
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return [lo, hi];
}

/** Seats on their orbits, and the ρ the outermost footprint reaches (the frontier belt starts past it). */
export interface SeatLayout { seats: SeatSlot[]; reach: number }

const discsAt = (fp: Footprint, px: number, py: number): Circle[] => fp.map((c) => ({ x: px + c.x, y: py + c.y, r: c.r }));

function clashes(mine: readonly Circle[], others: readonly Circle[], gap: number): boolean {
  for (const a of mine) for (const b of others) if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap) return true;
  return false;
}

/** The half-span of the orbit arc through a seat: its planet's width plus a pad, as an angle on its orbit. */
export function arcSpan(rx: number): number {
  return Math.min(Math.PI / 2, Math.max(GEOMETRY.arcMin, (GEOMETRY.planetR * 1.5 + GEOMETRY.arcPad) / rx));
}

/** How far a world point (from the star) is from a seat's orbit arc; Infinity when it lies past the arc's ends. */
export function arcDistance(seat: Pick<SeatSlot, 'angle' | 'rx' | 'ry' | 'arc'>, x: number, y: number): number {
  const t = Math.atan2(y / SQUASH, x);
  const off = Math.abs(((t - seat.angle + 3 * Math.PI) % TAU) - Math.PI);
  const f = (x * x) / (seat.rx * seat.rx) + (y * y) / (seat.ry * seat.ry) - 1;
  const gx = (2 * x) / (seat.rx * seat.rx);
  const gy = (2 * y) / (seat.ry * seat.ry);
  const d = Math.abs(f) / (Math.hypot(gx, gy) || 1);
  return off <= seat.arc ? d : Infinity;
}

/**
 * Place the seats, in seat order, on one regular ring. Angles are even (2π / n) in the coprime
 * stride, and every seat takes the same radius: the smallest, in `radiusStep`s from the star's, at
 * which every footprint clears the star by `starGap` and every other footprint by `seatGap`. A footprint
 * is a function of its seat's angle (its pieces overlay the planet's shadow side). All steps are
 * fixed, so the layout is a pure function of (people, footprints).
 */
export function placeSeats(people: readonly CanonicalKey[], footprints: readonly ((angle: number) => Footprint)[], region: string, minRx = 0): SeatLayout {
  const n = people.length;
  const g = GEOMETRY;
  const base = baseAngle(region);
  const slots = angleSlots(n);
  const angles = slots.map((slot) => normAngle(base + (TAU * slot) / n));
  const star: Circle = { x: 0, y: 0, r: g.starR + (g.starGap - g.seatGap) }; // so one seatGap test also keeps starGap
  const ringAt = (r: number): Circle[][] => angles.map((a, i) => {
    const p = onOrbit(r, a);
    return discsAt(footprints[i]!(a), p.x, p.y);
  });
  let rx = Math.max(g.starR, minRx); // at least `minRx`: room for the facilities' inner ring (22 C11)
  if (n > 0) {
    for (; rx < g.maxRadius; rx += g.radiusStep) {
      const discs = ringAt(rx);
      let ok = discs.every((d) => !clashes(d, [star], g.seatGap));
      for (let i = 0; ok && i < n; i++) for (let j = i + 1; ok && j < n; j++) ok = !clashes(discs[i]!, discs[j]!, g.seatGap);
      if (ok) break;
    }
  }
  const seats: SeatSlot[] = people.map((person, i) => {
    const { x, y } = onOrbit(rx, angles[i]!);
    return { person, index: i, angle: angles[i]!, rx, ry: rx * SQUASH, x, y, arc: arcSpan(rx) };
  });
  let reach = rhoRange({ x: 0, y: 0, r: g.starR })[1];
  seats.forEach((s) => { reach = Math.max(reach, footprintRange(footprints[s.index]!(s.angle), s.x, s.y)[1]); });
  return { seats, reach };
}
