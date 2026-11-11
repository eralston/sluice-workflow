// 14 §4 Frontier — the neutral outer belt for unassigned objectives and threats (13 §3). It is an
// annulus just outside the outermost orbit's band. Pieces ever unassigned while members take slots
// by first-unassigned time, at fixed angles evenly round the belt's middle, filling from the top either
// side in turn (22 D5), and the belt moves out until neighbours clear each other. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { PieceSlot, SolarPlan } from '../types';
import { slotOrder } from './mandala';
import { normAngle, onOrbit } from './seats';
import { GEOMETRY, SQUASH } from './version';

/** The belt's width in ρ: a piece's full ρ-extent (2r / SQUASH, at the belt's top and bottom), plus pads. */
const BELT_WIDTH = (2 * GEOMETRY.frontierR) / SQUASH + 2 * GEOMETRY.frontierPad;

/**
 * The belt, outside `reach` (the outermost band's ρ) by a lane, for `count` pieces: wide enough for
 * a piece's full ρ-extent, and far enough out that `count` pieces round its middle clear each other.
 */
export function frontierBelt(reach: number, count: number): SolarPlan['frontier'] {
  const g = GEOMETRY;
  let mid = reach + g.lane + BELT_WIDTH / 2;
  if (count >= 2) {
    // The closest neighbours sit at the belt's sides, where its ellipse is flattest: their chord is
    // 2 · ry · sin(π / count).
    const need = (2 * g.frontierR + g.frontierGap) / (2 * SQUASH * Math.sin(Math.PI / count));
    mid = Math.max(mid, Math.ceil(need));
  }
  const rx0 = mid - BELT_WIDTH / 2;
  const rx1 = mid + BELT_WIDTH / 2;
  return { rx0, rx1, ry0: rx0 * SQUASH, ry1: rx1 * SQUASH };
}

/**
 * Frontier slots for `keys` in their order, round the belt's middle (22 D5, the mandala): evenly spaced,
 * the first at the top, then either side of it in turn, so the belt fills symmetrically from the top.
 */
export function frontierSlots(keys: readonly CanonicalKey[], belt: SolarPlan['frontier'], base: number): PieceSlot[] {
  void base;
  const mid = (belt.rx0 + belt.rx1) / 2;
  const n = keys.length;
  return keys.map((piece, index) => {
    const k = ((slotOrder(index) % n) + n) % n;
    const angle = normAngle(-Math.PI / 2 + (2 * Math.PI * k) / n);
    const { x, y } = onOrbit(mid, angle);
    return { seat: 'frontier', piece, mode: 'frontier', x, y, r: GEOMETRY.frontierR, index };
  });
}
