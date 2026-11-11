// 14 §4 Free pieces and moves between seats — who stands where, fixed over the loaded history.
// A piece gets a slot at every seat it visited while on the board during the round (and in the
// frontier if it was unassigned then), so a reassignment is travel between two fixed points; what it
// held only before the start, after the end or while Off leaves no slot. Visits read the facts' own
// timeline (engine/facts), the one the projection reads at the playhead, so the two always agree.
// Per (seat, role) pieces are ordered by arrival there (13 Q6): held at the round's start first,
// then by the time they arrived, ties by key, and take formation indices in that order (no free cap
// since layout v4). A freed slot stays empty; nothing is promoted on a seek
// (INV-14). Pure.
import type { UtcRange } from '../../contracts/history';
import type { CanonicalKey, UtcMs } from '../../contracts/keys';
import { ghostSpans, heldSpans } from '../facts';
import type { PieceFacts, RoundFacts } from '../types';

/** The roles that hold a slot of their own. Steps, containers and attachments ride on others. */
export type SlotRole = 'objective' | 'threat';
export const SLOT_ROLES: readonly SlotRole[] = ['objective', 'threat'];

export function isSlotRole(role: string): role is SlotRole {
  return role === 'objective' || role === 'threat';
}

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every seat a piece visited while on the board during `round`, with the first time it was there
 * (`null` stands for the frontier: unassigned, which is also where it stands before its first seat
 * entry). Visits are the facts' own held stretches (`heldSpans`: a member, on the ladder, inside the
 * round), so a stay that ended by the start, began at or after the end, or was Off throughout is no
 * visit at all (14 §4: seats are who held a piece at some instant of the round).
 */
export function visitsOf(p: PieceFacts, round: UtcRange): Map<CanonicalKey | null, UtcMs> {
  const out = new Map<CanonicalKey | null, UtcMs>();
  for (const s of heldSpans(p, round)) if (s.from < (out.get(s.seat) ?? Infinity)) out.set(s.seat, s.from);
  return out;
}

/** Who stands where at one seat, per role, in arrival order. */
export interface SeatRoster {
  free: Record<SlotRole, CanonicalKey[]>;
  formation: Record<SlotRole, CanonicalKey[]>;
}

export interface Rosters {
  /** By seat, for every seat a slotted piece visited during the round. */
  seats: Map<CanonicalKey, SeatRoster>;
  /** Pieces unassigned while members during the round, by first-unassigned time. */
  frontier: CanonicalKey[];
  /** By seat: the first time any slotted piece arrived there. */
  firstSeen: Map<CanonicalKey, UtcMs>;
  /** For each slotted piece, the seats it visited (frontier excluded). */
  visited: Map<CanonicalKey, Set<CanonicalKey>>;
}

/** Every slotted piece's visits, sorted into rosters by arrival (Q6) and split at the free cap. */
export function rosters(f: RoundFacts, free: Record<SlotRole, number>): Rosters {
  const arrivals = new Map<CanonicalKey, Record<SlotRole, [CanonicalKey, UtcMs][]>>();
  // Ghost-only visits (23 C9): a piece reseated while Off to a seat it never held on the ladder has a
  // slot there, after every piece that was on the ladder, so no one else's slot moves for it.
  const ghosts = new Map<CanonicalKey, Record<SlotRole, [CanonicalKey, UtcMs][]>>();
  const seated = new Set(f.seats);
  const frontier: [CanonicalKey, UtcMs][] = [];
  const firstSeen = new Map<CanonicalKey, UtcMs>();
  const visited = new Map<CanonicalKey, Set<CanonicalKey>>();
  for (const key of [...f.pieces.keys()].sort(byKey)) {
    const p = f.pieces.get(key)!;
    if (!isSlotRole(p.role)) continue;
    // Held at the round's start arrives at the start (visitsOf clips it): those order by key alone.
    const had = visitsOf(p, f.round);
    for (const [seat, at] of had) {
      if (seat === null) {
        frontier.push([key, at]);
        continue;
      }
      if (!arrivals.has(seat)) arrivals.set(seat, { objective: [], threat: [] });
      arrivals.get(seat)![p.role].push([key, at]);
      firstSeen.set(seat, Math.min(firstSeen.get(seat) ?? Infinity, at));
      if (!visited.has(key)) visited.set(key, new Set());
      visited.get(key)!.add(seat);
    }
    const first = new Map<CanonicalKey, UtcMs>();
    for (const s of ghostSpans(p, f.round, seated)) if (!had.has(s.seat) && s.from < (first.get(s.seat!) ?? Infinity)) first.set(s.seat!, s.from);
    for (const [seat, at] of first) {
      if (!ghosts.has(seat)) ghosts.set(seat, { objective: [], threat: [] });
      ghosts.get(seat)![p.role].push([key, at]);
    }
  }
  const order = (xs: [CanonicalKey, UtcMs][]) => xs.sort(([ka, ta], [kb, tb]) => ta - tb || byKey(ka, kb)).map(([k]) => k);
  const seats = new Map<CanonicalKey, SeatRoster>();
  for (const seat of [...arrivals.keys()].sort(byKey)) {
    const roster: SeatRoster = { free: { objective: [], threat: [] }, formation: { objective: [], threat: [] } };
    for (const role of SLOT_ROLES) {
      const all = [...order(arrivals.get(seat)![role]), ...order(ghosts.get(seat)?.[role] ?? [])];
      const cap = Math.max(0, Math.floor(free[role]));
      roster.free[role] = all.slice(0, cap);
      roster.formation[role] = all.slice(cap);
    }
    seats.set(seat, roster);
  }
  return { seats, frontier: order(frontier), firstSeen, visited };
}

/**
 * The seat order: the facts' own (first join), then, defensively, any seat a piece visited that the
 * facts didn't list, by first arrival then key.
 */
export function seatOrder(f: RoundFacts, r: Rosters): CanonicalKey[] {
  const listed = [...new Set(f.seats)];
  const known = new Set(listed);
  const extra = [...r.seats.keys()].filter((s) => !known.has(s))
    .sort((a, b) => r.firstSeen.get(a)! - r.firstSeen.get(b)! || byKey(a, b));
  return [...listed, ...extra];
}
