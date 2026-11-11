// Loiter slots (22 D3, D4): where each ship rests by a planet, on its loiter ring. The first to arrive
// takes the far-side slot; the rest fill ±1, ±2… by arrival, and each keeps its slot while it stays.
// "Arrives" is when its rest moves to that planet (05 §8 K-11: the planet of the last story or bug it
// touched there, a Task's as its parent's, a PR's as the work it serves; else its own planet), or, for
// a guest, when it helps with work there while present (K-13, K-14). A pure walk of the history up to
// the playhead, so a seek gives every ship the slot playing gave it (INV-12, INV-15).
import type { AnyTimelineEvent } from '../../contracts/events';
import type { CanonicalKey, UtcMs } from '../../contracts/keys';
import type { GuestPresence } from '../../contracts/playback';
import { memberAt, parentAtTime, seatAtTime } from '../../engine/facts';
import { helpOf, presentAt } from '../../engine/guests';
import type { RoundFacts } from '../../engine/types';

/** A ship's loiter slot: its planet's seat, and its slot there by arrival. */
export interface Loiter { seat: CanonicalKey; index: number }

/**
 * Every ship's loiter slot at state time `atUtc`. `seats` are the region's seats (their people have a
 * planet of their own); `guests` the schedule's presence, when planned.
 */
export function loiterSlots(events: readonly AnyTimelineEvent[], f: RoundFacts, seats: readonly CanonicalKey[], atUtc: UtcMs, guests?: GuestPresence): Map<CanonicalKey, Loiter> {
  const seated = new Set(seats);
  const pieceOf = (key: CanonicalKey, t: UtcMs): CanonicalKey | null => {
    let k: CanonicalKey | null = key;
    for (let i = 0; i < 8 && k; i++) {
      const p = f.pieces.get(k);
      if (!p) return null;
      if (p.role === 'objective' || p.role === 'threat') return k;
      k = p.role === 'step' ? parentAtTime(p, t) : null;
    }
    return null;
  };
  /** The planet a piece is at now (its seat's), if it's on the board here. */
  const planetOf = (piece: CanonicalKey, t: UtcMs): CanonicalKey | null => {
    const p = f.pieces.get(piece);
    if (!p || !memberAt(p, t)) return null;
    const s = seatAtTime(p, t);
    return s && seated.has(s) ? s : null;
  };
  const anchor = new Map<CanonicalKey, CanonicalKey>(); // person → the piece they rest by
  const at = new Map<CanonicalKey, CanonicalKey | null>(); // person → the planet they rest by now
  const taken = new Map<CanonicalKey, Map<number, CanonicalKey>>(); // planet → slot → person
  const slotOf = new Map<CanonicalKey, number>();
  const move = (who: CanonicalKey, to: CanonicalKey | null) => {
    const from = at.get(who) ?? null;
    if (from === to) return;
    if (from !== null) taken.get(from)?.delete(slotOf.get(who)!);
    at.set(who, to);
    if (to === null) { slotOf.delete(who); return; }
    const used = taken.get(to) ?? new Map<number, CanonicalKey>();
    let j = 0;
    while (used.has(j)) j++;
    used.set(j, who);
    taken.set(to, used);
    slotOf.set(who, j);
  };
  // Seated people start by their own planet, in seat order: the first seat's person first.
  for (const s of seats) move(s, s);
  const settle = (t: UtcMs) => {
    for (const who of [...new Set([...anchor.keys(), ...seats])].sort()) {
      const piece = anchor.get(who);
      const planet = piece ? planetOf(piece, t) : null;
      if (seated.has(who)) move(who, planet ?? who);
      else move(who, planet && (!guests || presentAt(guests.get(who), t)) ? planet : null);
    }
  };
  let last: UtcMs | null = null;
  for (const e of events) {
    if (e.occurredAt > atUtc) break;
    if (last !== null && e.occurredAt !== last) settle(last);
    last = e.occurredAt;
    // The piece each person touched: a seated person by any recorded change (K-11), a guest by help (K-7).
    const who = e.changedBy ?? (e.kind === 'pr_opened' ? e.payload.authorKey : null);
    if (who && seated.has(who)) {
      const pr = e.kind.startsWith('pr_') ? e.entityKey : e.kind === 'link_pr_added' || e.kind === 'link_pr_removed' ? e.payload.prKey : null;
      const keys = pr ? f.attachments.get(pr)?.links ?? [] : [e.entityKey];
      const piece = keys.map((k) => pieceOf(k, e.occurredAt)).find((k): k is CanonicalKey => !!k && planetOf(k, e.occurredAt) !== null);
      if (piece) anchor.set(who, piece);
    }
    if (e.occurredAt >= f.round.startUtc) {
      for (const help of helpOf(f, e)) {
        if (seated.has(help.who)) continue;
        const piece = help.at.find((k) => f.pieces.has(k) && planetOf(k, e.occurredAt) !== null);
        if (piece) anchor.set(help.who, piece);
      }
    }
  }
  if (last !== null) settle(last);
  settle(atUtc); // and as things stand at the playhead (a guest whose window has closed has left)
  const out = new Map<CanonicalKey, Loiter>();
  for (const [who, planet] of at) if (planet !== null) out.set(who, { seat: planet, index: slotOf.get(who)! });
  return out;
}
