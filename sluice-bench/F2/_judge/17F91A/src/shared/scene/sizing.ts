// 06 §2 relative scale: the callout label is the unit of size. Celestial bodies scale with the
// world; mechanical objects (ships, cargo vessels, stations, mission points) have a minimum on-screen
// size tied to label height, like the labels themselves, so they stay legible at any density.
import stateMapping from '../../../config/state-mapping.json';
import type { LaneSpec, ViewNode } from '../contracts/view';

/** Nominal callout label height in screen px. */
export const LABEL_PX = 48; // three lines: title, type/ID/state, person

/** Minimum on-screen radius (px) for selectable mechanical objects. */
export const FLOOR_PX: Partial<Record<ViewNode['kind'], number>> = {
  captain: LABEL_PX * 0.6, // a ship is at least ~1.2 labels long
  assignmentBeacon: LABEL_PX * 0.3,
  flight: LABEL_PX * 0.55,
  station: LABEL_PX * 0.9,
  missionPoint: LABEL_PX * 0.5,
  // v1 hardware (14 §2.4): a threat's ship and a facility's hull keep a floor, smaller than a v0
  // vessel's and station's so the solar board fits its fit scale (W4-T2, VC-3: at about 0.13 a
  // threat is then about its planet's size). Seats and objectives are celestial and scale with the
  // world. The theme's AssetDef floors (theme/starChart/assets) match these.
  threat: LABEL_PX * 0.3,
  // A station is drawn at least twice a captain ship's size (art session 2026-10-12).
  facility: LABEL_PX * 1.2,
};

/**
 * Radar Task dots (06 §3) are half a label across: the band counts summarize them, and only Underway
 * ones carry a label, so they can sit closer than label-sized pins.
 */
export const RADAR_DOT_FLOOR_PX = LABEL_PX * 0.27;
/** Accomplished dots fold into the accretion ring: smaller still, so a full inner band never crowds. */
export const RADAR_DONE_FLOOR_PX = LABEL_PX * 0.2;

/** On-screen radius in px at a camera scale. */
export function screenRadius(n: ViewNode, scale: number): number {
  const floor = n.radar ? (n.radar.band === 'accomplished' ? RADAR_DONE_FLOOR_PX : RADAR_DOT_FLOOR_PX) : n.selectable ? FLOOR_PX[n.kind] ?? 0 : n.kind === 'missionPoint' ? 4 : 0;
  const r = Math.max(n.world.r * scale, floor * (n.floorScale ?? 1));
  return n.maxScale ? Math.min(r, n.world.r * n.maxScale * scale) : r;
}

/**
 * Minimum targets in screen points (decided 2026-10-07, after Apple's HIG): every object you can
 * click is at least MIN_TARGET_PX across for a pointer, and a scene opens with the objects that lead
 * somewhere at least TOUCH_TARGET_PX across, so it would work on a tablet too.
 */
export const MIN_TARGET_PX = 32;
export const TOUCH_TARGET_PX = 44;

/** Whether a node keeps a minimum on-screen size (mechanical objects and radar Tasks), whatever the zoom. */
export function hasScreenFloor(n: ViewNode): boolean {
  return !!n.radar || (n.selectable && FLOOR_PX[n.kind] !== undefined);
}

/**
 * Hit radius in world units: the visual size, never under half a MIN_TARGET_PX on screen (VC-3).
 * Radar Tasks keep a 12 px floor: their spokes are spaced for it, the band tally summarizes them,
 * and In view lists each one (decided 2026-10-07).
 */
export function hitRadius(n: ViewNode, scale: number): number {
  const visual = n.kind === 'galaxy' ? n.world.r * 0.8 : screenRadius(n, scale) / scale * 1.1;
  return Math.max(visual, (n.radar ? 12 : MIN_TARGET_PX / 2) / scale);
}

/** The hit radius the object's own size gives (world units), before the minimum-target floor. */
export function visualHitRadius(n: ViewNode, scale: number): number {
  return n.kind === 'galaxy' ? n.world.r * 0.8 : screenRadius(n, scale) / scale * 1.1;
}

/** A node's own drawn radius in world units, for sizing (a galaxy's bright disc, not its glow). */
const bodyRadius = (n: ViewNode) => (n.kind === 'galaxy' ? n.world.r * 0.8 : n.world.r);

/**
 * The camera scale at which the smallest object that leads somewhere (a galaxy, or anything with a
 * scene to open) is `px` across. Mechanical objects have screen floors, so they never limit it.
 * 0 when the scene has no such object.
 */
export function targetScale(nodes: ViewNode[], px: number): number {
  let need = 0;
  for (const n of nodes) {
    if (!n.selectable || !(n.kind === 'galaxy' || n.zoomTo) || FLOOR_PX[n.kind] !== undefined) continue;
    const r = bodyRadius(n);
    if (r > 0) need = Math.max(need, px / (2 * r));
  }
  return need;
}

/**
 * The opening scale (decided 2026-10-07): the whole-scene fit while it keeps objects that lead
 * somewhere at least MIN_TARGET_PX across (`min`). Below that the scene is a page: it opens at its
 * top, at the width fit or the touch scale (`touch`), whichever is larger, and scrolls (scroll over
 * shrink).
 */
export function pageScale(wholeFit: number, widthFit: number, touch: number, min: number): { scale: number; page: boolean } {
  if (wholeFit >= min) return { scale: wholeFit, page: false };
  return { scale: Math.max(widthFit, touch), page: true };
}

/** Gap between attached objects, in screen px. */
export const ATTACH_GAP_PX = 6;

/** Every type name a subtitle can lead with (work item types from the mapping, plus non-work-item kinds). */
const TYPE_NAMES = [...Object.keys(stateMapping.types), 'Pull Request', 'Repository', 'Project'];
const STATE_NAMES = [...Object.values(stateMapping.types).flatMap((t) => Object.keys(t.states)), 'completed', 'abandoned', 'active'];
const longest = (xs: string[]) => Math.max(...xs.map((x) => x.length));

/**
 * Title cap (06 §4): as long as the longest possible subtitle, `{type} #{8-digit id} · {state}` —
 * "Pull Request #12345678 · Ready for Review", 41 characters. Longer titles end in "…"; the full
 * title is in the tooltip and the inspector.
 */
export const TITLE_MAX_CHARS = longest(TYPE_NAMES) + ' #12345678'.length + ' · '.length + longest(STATE_NAMES);

/**
 * A holo plate's title cap (22 A7): two lines' worth, since a holo title wraps onto a second line and
 * its plate ends that line in "…" (a line clamp) when it still runs over. The cap only bounds the text.
 */
export const HOLO_TITLE_MAX_CHARS = 2 * TITLE_MAX_CHARS;

export function capTitle(title: string, max = TITLE_MAX_CHARS): string {
  return title.length <= max ? title : `${title.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Lane and station-row y (world) at a camera scale: the world offsets from the projection, but never
 * less than a full label's room above and below each vessel on screen (06 §3 PR lane).
 */
export function laneRows(lane: LaneSpec, scale: number): { laneY: number; stationY: number } {
  const vessel = FLOOR_PX.flight ?? 0;
  const station = FLOOR_PX.station ?? 0;
  const room = LABEL_PX + 14; // one label plus its gaps
  const vesselLabelOffset = vessel * 1.4 + 6; // where the label layer puts a label beside a vessel
  // Above the lane: room for a child's label that drops below it, then the vessel's own label.
  const laneY = lane.childrenBottom + Math.max(lane.laneOffset, (room * (lane.childLabelRow ? 2 : 1) + vesselLabelOffset) / scale);
  // Below the lane: the vessel's label, then the station.
  const stationY = laneY + Math.max(lane.stationOffset - lane.laneOffset, (vesselLabelOffset + room + station) / scale);
  return { laneY, stationY };
}

/** Widest callout plate, in screen px (title capped at TITLE_MAX_CHARS). */
export const LABEL_W_PX = 270;

/**
 * Lane slot x positions at a camera scale (06 §3): the projection's evenly spread slots, widened so
 * neighbouring vessels are at least half a label apart on screen (labels alternate above and below,
 * so same-side labels are a full label apart). Order and centre are preserved.
 */
export function laneSlotsX(xs: number[], scale: number, minPx = LABEL_W_PX * 0.55): number[] {
  if (xs.length < 2) return xs;
  const sorted = [...xs].sort((a, b) => a - b);
  const step = (sorted.at(-1)! - sorted[0]!) / (xs.length - 1);
  const minStep = minPx / scale;
  if (step >= minStep) return xs;
  const centre = (sorted[0]! + sorted.at(-1)!) / 2;
  const rank = new Map(sorted.map((x, i) => [x, i]));
  return xs.map((x) => centre + (rank.get(x)! - (xs.length - 1) / 2) * minStep);
}
