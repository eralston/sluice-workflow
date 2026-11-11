// 19 P1 — a region's preview in the round (Solar): what its solar system opens with, so the outside
// matches the inside (R3). One small planet per seat, in fixed slots on the front of a ring round the
// pod star (more seats than the ring holds go on wider rings outside it); one rock per objective on the
// star's left and one hive mark per threat on its right, every one of them (22 A1: the drawn count is
// the true count), in groups of five that read at a glance. No stations or ships. Decorative: nothing in it is
// selectable or labelled, and its footprint is fixed, so the field never reflows as history streams
// (INV-14). The data comes from the level's source (`FieldSource.preview`); this file only places it.
// Pure.
import type { CanonicalKey } from '../../contracts/keys';
import type { ViewNode } from '../../contracts/view';
import { encodePiece } from '../../engine/stageCode';
import type { FieldPreview } from '../../hierarchy/types';
import { artSeed, orbitEdge, type ProjectCtx } from './ctx';

/** The preview's sizes, in the round's world units (15 §5, *Preview*). */
export const PREVIEW = Object.freeze({
  /** The planets' ring round the pod star: its half-width and half-height. */
  ringRx: 300,
  ringRy: 175,
  /** The front arc the ring's slots spread over, in degrees from the star's right, clockwise (y down). */
  arcFromDeg: 20,
  arcToDeg: 160,
  /** Slots on the ring, so the seats history adds take free ones. Further seats go on wider rings, of one fewer and this many in turn. */
  seatSlots: 8,
  /** Each further ring is this much wider and deeper than the last, as a fraction of the first. */
  ringStep: 0.3,
  /** A preview planet. One size for every seat (INV-19). */
  planetR: 27,
  /** Each planet's orbit is a short arc through it, this far either side (radians), as inside the region. */
  orbitArc: 0.22,
  /**
   * The asteroid cluster starts this far left of the star's centre, and the hive marks as far right,
   * each growing outward from there, so even one rock sits by its own star (19 review: Lantern Pod's
   * lone rock read as halfway between two).
   */
  clusterX: 130,
  /** How far up or down the clusters sit from the star's centre (y down). */
  clusterY: -16,
  /**
   * One asteroid, and its group of five (22 A1): a quincunx, a die's five, its corners this far from its
   * centre; a group every `rockStep` outward from the star and `rockRow` up. No cap: every objective.
   */
  rockR: 11,
  rockPitch: 14,
  rockStep: 74,
  rockRow: 58,
  /** One hive mark (its half-length), and its group of five, as the rocks'. No cap: every threat. */
  hiveR: 15,
  hivePitch: 18,
  hiveStep: 92,
  hiveRow: 60,
  /** Groups stand this many high (from the star's level, up), then the next column starts further out. */
  groupRows: 4,
  /** The groups' vertical squash, so they lie in the ring's tilted plane. */
  squash: 0.7,
  /**
   * What the preview reaches from its star, sideways and below (two rings, 15 seats; 60 rocks and 40
   * hive marks): the field spaces its members by it, so it's fixed (INV-14). More groups run on outward,
   * still clear of the next star's (its marks begin 710 away).
   */
  reachX: 340,
  reachY: 255,
});

/** A group's five places, in the order they fill: two corners, the other two, then the centre (a die's 2, 4, 5). */
const QUINCUNX: readonly (readonly [number, number])[] = [[-1, -1], [1, 1], [1, -1], [-1, 1], [0, 0]];

/**
 * The i-th mark's place, from its anchor beside the star, growing away from it (`side` -1: left, 1:
 * right) in groups of five (22 A1). A group stands `groupRows` high, from the star's level up, then the
 * next column starts. A mark's place depends on its index alone, so a count that grows never moves one.
 */
function groupSpot(i: number, pitch: number, step: number, row: number, side: -1 | 1): { x: number; y: number } {
  const g = Math.floor(i / 5);
  const col = Math.floor(g / PREVIEW.groupRows);
  const [qx, qy] = QUINCUNX[i % 5]!;
  return { x: side * (step / 2 + col * step) + qx * pitch, y: -(g % PREVIEW.groupRows) * row + qy * pitch * PREVIEW.squash };
}

/** The slots on ring `ring`: the first holds `seatSlots`, then the rings alternate one fewer and as many, staggered. */
const ringSlots = (ring: number): number => PREVIEW.seatSlots - (ring % 2);

/**
 * Where a slot sits: its angle on the front arc, and its ring's scale (1 for the first). Each ring
 * fills from the middle outward (the front, then alternating sides), at one pitch whatever the count,
 * and a full ring hands on to a wider one outside it, half a pitch round so its planets sit between.
 * A slot's place depends on its number alone, so a seat added later never moves one.
 */
export function previewSlot(slot: number): { angle: number; scale: number } {
  let ring = 0;
  let i = slot;
  while (i >= ringSlots(ring)) i -= ringSlots(ring++);
  const mid = Math.floor(ringSlots(ring) / 2);
  const j = i % 2 ? mid - (i + 1) / 2 : mid + i / 2;
  const pitch = (PREVIEW.arcToDeg - PREVIEW.arcFromDeg) / PREVIEW.seatSlots;
  const deg = PREVIEW.arcFromDeg + pitch * (j + (ring % 2 ? 1 : 0.5));
  return { angle: (deg * Math.PI) / 180, scale: 1 + ring * PREVIEW.ringStep };
}

/** A decorative node of the preview: not selectable, not labelled, keyed to its pod. */
function mini(pk: string, pod: CanonicalKey, kind: ViewNode['kind'], asset: string, world: ViewNode['world'], stage: string, seed: number): ViewNode {
  return { projectionKey: pk, canonicalKey: pod, kind, asset, world, stage, seed, label: '', openable: false, selectable: false, labelled: false, flags: {}, evidence: [] };
}

/** The neutral look of a counted piece: on the ladder, not yet started (counts, not states). */
const COUNTED = {
  objective: encodePiece({ role: 'objective', signal: { rung: 'ready' }, category: 'Proposed' }),
  threat: encodePiece({ role: 'threat', signal: { rung: 'ready' }, category: 'Proposed' }),
};

/** Places one member's preview round its star at (cx, cy) (`starPk`), into the graph. */
export function projectPreview(ctx: ProjectCtx, starPk: string, pod: CanonicalKey, cx: number, cy: number, p: FieldPreview): void {
  for (const seat of p.seats) {
    const { angle: a, scale } = previewSlot(seat.slot);
    const rx = PREVIEW.ringRx * scale;
    const ry = PREVIEW.ringRy * scale;
    const pk = `${starPk}|preview|seat|${seat.person}`;
    // The seat's own seed, so its preview planet is the homeworld you find inside (R3).
    ctx.graph.nodes.push(mini(pk, pod, 'seat', 'seat', { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), r: PREVIEW.planetR }, seat.stage, artSeed(seat.person)));
    ctx.graph.edges.push(orbitEdge(starPk, pk, cx, cy, rx, ry, false, { from: a - PREVIEW.orbitArc, to: a + PREVIEW.orbitArc }));
  }
  for (let i = 0; i < p.objectives; i++) {
    const at = groupSpot(i, PREVIEW.rockPitch, PREVIEW.rockStep, PREVIEW.rockRow, -1);
    const pk = `${starPk}|preview|rock${i}`;
    ctx.graph.nodes.push(mini(pk, pod, 'objective', 'objective', { x: cx - PREVIEW.clusterX + at.x, y: cy + PREVIEW.clusterY + at.y, r: PREVIEW.rockR }, COUNTED.objective, artSeed(pk as CanonicalKey)));
  }
  for (let i = 0; i < p.threats; i++) {
    const at = groupSpot(i, PREVIEW.hivePitch, PREVIEW.hiveStep, PREVIEW.hiveRow, 1);
    const pk = `${starPk}|preview|hive${i}`;
    ctx.graph.nodes.push(mini(pk, pod, 'threat', 'threat', { x: cx + PREVIEW.clusterX + at.x, y: cy + PREVIEW.clusterY + at.y, r: PREVIEW.hiveR }, COUNTED.threat, artSeed(pk as CanonicalKey)));
  }
}
