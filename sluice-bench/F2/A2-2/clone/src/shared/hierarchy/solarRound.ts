// Solar's round (19 P1, 13 §2): the Sprints sector's field of pods, with each pod star's miniature
// replaced by a preview of the region inside it, so the outside matches the inside (R3). The planets
// are the region's seats, by the region's own rule (`seatsOf` over its board facts); the region's
// objectives and threats show as counts (R4). While history is still streaming (ADO's first look),
// today's assignees stand in, and the people history adds arrive once the region's history is in,
// in free slots. The v0 Sprints sector keeps its own miniatures (`sprintField`). Pure.
import type { CanonicalKey } from '../contracts/keys';
import { memberAt, roundFacts, seatAtTime, signalAtTime } from '../engine/facts';
import { isSlotRole } from '../engine/solar/slots';
import { encodePiece } from '../engine/stageCode';
import type { Signal } from '../engine/types';
import { packFor } from '../packs/registry';
import type { ProjectCtx } from '../scene/project/ctx';
import { seatPiece } from '../scene/project/solar';
import { regionCounts, solarPodStar, solarSource } from './solarSource';
import { SPRINTS } from './sprints';
import type { FieldPreview, FieldSource } from './types';

/** The Sprints sector's field source: the pods as stars, their order and their pass-through. */
const sprintField: FieldSource = (() => {
  const round = SPRINTS.levels.find((l) => l.id === 'sprint');
  if (round?.layout !== 'field') throw new Error('solar: the Sprints chain has no sprint field to reuse');
  return round.source;
})();

/**
 * One region's preview at the playhead. Its seat slots never move while history streams (R4, INV-14),
 * whatever order the items' histories arrive in:
 * - First, everyone holding a piece in the region now (today's assignees), by key. ADO's first look
 *   already has them all, so this group is fixed from the start. They're read from the round's own
 *   facts, not the board's, so a piece that turns out to have been on the ladder doesn't add one
 *   later; someone here who isn't a seat keeps an empty slot.
 * - Then the seats history adds, held back until every piece in the region now has its history, so
 *   they arrive together, in the region's order: first those who held one of those pieces, then those
 *   who held only pieces that have since left (whose histories can come later, so they go last).
 */
export function regionPreview(ctx: ProjectCtx, key: CanonicalKey): FieldPreview {
  const ref = { level: 'pod', key } as const;
  const f = solarSource.facts(ctx.h, ref);
  const x = ctx.s.atUtc;
  const now = [...roundFacts(ctx.h, ref, packFor(ctx.h)).pieces.values()].filter((p) => isSlotRole(p.role) && p.member.some((m) => m.to === null));
  const today = new Set(now.flatMap((p) => p.seatAt.at(-1)?.seat ?? []));
  const hist = ctx.h.coverage.history ? new Set(ctx.h.coverage.history) : null; // absent: all of it is in
  const settled = !hist || now.every((p) => hist.has(p.key));
  const others = settled ? f.seats.filter((s) => !today.has(s)) : [];
  const held = new Set(now.flatMap((p) => p.seatAt.map((s) => s.seat)));
  const order = [...[...today].sort(), ...others.filter((s) => held.has(s)), ...others.filter((s) => !held.has(s))];
  const seated = new Set(f.seats);
  // Each planet's look is its seat's own share now, as inside (13 §4.1), from the same facts.
  const shares = new Map<CanonicalKey, Signal[]>();
  for (const p of f.pieces.values()) {
    if (!isSlotRole(p.role) || !memberAt(p, x)) continue;
    const seat = seatAtTime(p, x);
    const signal = signalAtTime(p, x);
    if (seat && signal) shares.set(seat, [...(shares.get(seat) ?? []), signal]);
  }
  const seats = order.flatMap((person, slot) => (seated.has(person) ? [{ person, slot, stage: encodePiece(seatPiece(shares.get(person) ?? [])) }] : []));
  return { seats, ...regionCounts(ctx, key) };
}

/** Solar's round: the pods as Sprints draws them, each star's plate and preview the Solar way. */
export const solarRoundField: FieldSource = {
  order: (h, ref) => sprintField.order(h, ref),
  member: (ctx, ref, key, pk) => solarPodStar(ctx, sprintField.member(ctx, ref, key, pk), key),
  // No miniature: the preview stands in for it.
  miniOrder: () => [],
  mini: () => null,
  preview: (ctx, key) => regionPreview(ctx, key),
  passThrough: (h, ref) => sprintField.passThrough?.(h, ref) ?? null,
};
