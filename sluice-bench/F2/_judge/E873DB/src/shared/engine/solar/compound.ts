// 14 §4 Compound slots (13 §5) — a facility's satellites hold fixed slots round it, like tags round
// a molecule. Attachments take the lowest slot free when they open and keep it until they leave, so no
// drawn satellite ever swaps places on a seek or in play (INV-14); one waiting past the cap is promoted
// into the first slot that frees (23 C6, `attachmentSegments`). Slots at or past the cap count into the "+N" mark.
// Guards are `fnv(facility) % 4` fixed slots on the back arc, opposite the attachments; visual only
// for now. Pure.
import type { CanonicalKey, UtcMs } from '../../contracts/keys';
import { fnv1a32 } from '../../hash';
import type { AttachmentFacts, CompoundSlot, Interval } from '../types';
import { GEOMETRY } from './version';

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Whether two `[from, to)` intervals share an instant (`to: null` is open-ended). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.from < (b.to ?? Infinity) && b.from < (a.to ?? Infinity);
}

/**
 * Interval first-fit: a slot number per interval, in the order given (open time, then key). Each
 * takes the lowest slot none of its overlapping predecessors holds.
 */
export function firstFit(intervals: readonly Interval[]): number[] {
  const held: Interval[][] = [];
  return intervals.map((iv) => {
    let slot = 0;
    while (held[slot]?.some((h) => overlaps(h, iv))) slot++;
    (held[slot] ??= []).push(iv);
    return slot;
  });
}

/**
 * An attachment slot's angle: the front arc (below the facility, toward the viewer), the cap's
 * slots and then the "+N" mark, centred. Every slot past the cap shares the mark's place.
 */
export function attachmentAngle(slot: number, cap = GEOMETRY.compoundCap): number {
  return Math.PI / 2 + (Math.min(slot, cap) - cap / 2) * GEOMETRY.attachmentSpread;
}

/** How many guards a facility has: a fixed count from its key, 0 to 3. */
export function guardCount(facility: CanonicalKey): number {
  return fnv1a32(facility) % 4;
}

/**
 * The slot segments of every attachment (23 C6, decided 2026-10-28: an overflow PR is promoted). Events are
 * processed in time order (a close before an open at the same instant; opens by open time, then key), so the
 * result depends on the history alone and a seek and play agree. An open takes the lowest free slot below
 * the cap; with none free it waits past the cap (slot `cap`, counted in "+N"). When a drawn PR closes, its
 * slot goes to the earliest-opened PR waiting, from that instant: the waiting PR's own segment ends and a new
 * one begins in the freed slot. A drawn tender never changes slot (INV-14); a PR leaving "+N" for a freed
 * slot is not a swap. So at every instant drawn tenders = min(open, cap) and "+N" is the rest (R9).
 */
export function attachmentSegments(attachments: readonly AttachmentFacts[], cap = GEOMETRY.compoundCap): { key: CanonicalKey; slot: number; from: UtcMs; to: UtcMs | null }[] {
  const sorted = [...attachments].sort((a, b) => a.open.from - b.open.from || byKey(a.key, b.key));
  type Ev = { t: number; open: boolean; i: number };
  const events: Ev[] = [];
  sorted.forEach((a, i) => {
    events.push({ t: a.open.from, open: true, i });
    if (a.open.to !== null) events.push({ t: a.open.to, open: false, i });
  });
  events.sort((x, y) => x.t - y.t || (x.open === y.open ? x.i - y.i : x.open ? 1 : -1));
  const held: (number | null)[] = Array.from({ length: cap }, () => null); // slot -> attachment index
  const slotOf = new Map<number, number>(); // attachment index -> slot now (cap: waiting)
  const waiting: number[] = []; // in open order
  const segs: { key: CanonicalKey; slot: number; from: UtcMs; to: UtcMs | null }[] = [];
  const cur = new Map<number, number>(); // attachment index -> its open segment's index in segs
  const begin = (i: number, slot: number, t: number) => {
    slotOf.set(i, slot);
    cur.set(i, segs.length);
    segs.push({ key: sorted[i]!.key, slot, from: t, to: null });
  };
  const end = (i: number, t: number) => { segs[cur.get(i)!]!.to = t; };
  for (const ev of events) {
    if (ev.open) {
      const free = held.indexOf(null);
      if (free >= 0) { held[free] = ev.i; begin(ev.i, free, ev.t); } else { waiting.push(ev.i); begin(ev.i, cap, ev.t); }
      continue;
    }
    const slot = slotOf.get(ev.i)!;
    end(ev.i, ev.t);
    if (slot >= cap) { waiting.splice(waiting.indexOf(ev.i), 1); continue; }
    held[slot] = null;
    const next = waiting.shift();
    if (next !== undefined) { end(next, ev.t); held[slot] = next; begin(next, slot, ev.t); }
  }
  return segs;
}

/**
 * Every satellite slot of one facility: its attachments' slot segments (an attachment waiting past the cap and
 * then promoted has one entry for each; they never overlap in time), then its guards. A guard has no
 * entity of its own, so its `key` is the facility's and its `slot` tells it apart.
 */
export function compoundSlots(facility: CanonicalKey, attachments: readonly AttachmentFacts[], enterAt: UtcMs): CompoundSlot[] {
  const g = GEOMETRY;
  const out: CompoundSlot[] = attachmentSegments(attachments).map((s) => ({
    key: s.key, role: 'attachment', slot: s.slot, angle: attachmentAngle(s.slot), dist: g.satelliteDist, from: s.from, to: s.to,
  }));
  const guards = guardCount(facility);
  for (let i = 0; i < guards; i++) {
    out.push({
      key: facility, role: 'guard', slot: i, angle: -Math.PI / 2 + (i - (guards - 1) / 2) * g.guardSpread, dist: g.guardDist,
      from: enterAt, to: null,
    });
  }
  return out;
}

/** The satellites live at `t`: attachments under the cap and guards drawn, the rest counted as "+N". */
export function compoundAt(slots: readonly CompoundSlot[], t: UtcMs, cap = GEOMETRY.compoundCap): { live: CompoundSlot[]; more: number } {
  const live: CompoundSlot[] = [];
  let more = 0;
  for (const s of slots) {
    if (!(t >= s.from && (s.to === null || t < s.to))) continue;
    if (s.role === 'attachment' && s.slot >= cap) more++;
    else live.push(s);
  }
  return { live, more };
}

/**
 * The tender slots filled by the attachments among `live` (23 C6): bit n is slot n, for slots below the cap.
 * A closed PR's bit clears and no other moves, so a gap stays where it is.
 */
export function slotMask(live: readonly CompoundSlot[], cap = GEOMETRY.compoundCap): number {
  let mask = 0;
  for (const s of live) if (s.role === 'attachment' && s.slot < cap) mask |= 1 << s.slot;
  return mask;
}
