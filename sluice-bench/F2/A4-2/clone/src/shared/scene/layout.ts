// 03 §5 layout (INV-14). Positions come from slot order across the whole history, never the playhead,
// and from counts of everything *ever* present, so nothing moves while seeking.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';

/**
 * Keys in the order they first "joined" something, across the whole history (never the playhead),
 * so positions don't move on seek. `joins` returns the joining key for an event, or null.
 */
export function firstJoinOrder(h: ScopeHistory, joins: (e: AnyTimelineEvent) => CanonicalKey | null, seeded: [CanonicalKey, number][] = []): CanonicalKey[] {
  const first = new Map<CanonicalKey, number>();
  // Entities known only from the current state (no history) join at their creation (decided 2026-10-07).
  for (const [k, t] of seeded) if (!first.has(k)) first.set(k, t);
  for (const e of h.events) {
    const k = joins(e);
    if (k && !first.has(k)) first.set(k, e.occurredAt);
  }
  return [...first.entries()]
    .sort(([ka, ta], [kb, tb]) => ta - tb || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([k]) => k);
}

/** Children of `parentKey` known only from the current state, with their creation times (no history). */
export function currentChildren(h: ScopeHistory, parentKey: CanonicalKey): [CanonicalKey, number][] {
  if (!h.current) return [];
  const hist = new Set(h.coverage.history ?? []);
  const created = new Map(h.current.workItems.map((w) => [w.key, w.createdAt]));
  return h.current.links.filter((l) => l.kind === 'parent' && l.toKey === parentKey && !hist.has(l.fromKey))
    .map((l) => [l.fromKey, created.get(l.fromKey) ?? 0] as [CanonicalKey, number]);
}

/** Children ever validly linked under `parentKey`, ordered by first link time then key. */
export function slotOrder(h: ScopeHistory, parentKey: CanonicalKey): CanonicalKey[] {
  const dated = firstJoinOrder(h, (e) => (e.kind === 'link_parent_added' && e.payload.parentKey === parentKey ? e.payload.childKey : null), currentChildren(h, parentKey));
  // Children known only from an undated observation (02 §6) take the slots after every dated one,
  // by key, so they never move a dated child (INV-14). They show only in the retrospective lens.
  const seen = new Set(dated);
  const observed = h.observations
    .filter((o) => o.kind === 'link_parent' && o.op === 'present' && o.toKey === parentKey && !seen.has(o.fromKey))
    .map((o) => o.fromKey)
    .sort();
  return [...dated, ...new Set(observed)];
}

/**
 * Split `n` items into the fewest rows of at most `maxPerRow`, as evenly as possible, larger rows
 * first: 5 → [3, 2], 6 → [3, 3], 7 → [4, 3], 9 → [3, 3, 3].
 */
export function balancedRows(n: number, maxPerRow: number): number[] {
  if (n <= 0) return [];
  const rows = Math.ceil(n / maxPerRow);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * A reading-order grid (decided 2026-10-07): full rows of `cols`, the last row centred. Unlike
 * `balancedRows`, every row but the last is full, so A–Z reads left to right, top to bottom.
 */
export function gridRows(n: number, cols: number): number[] {
  if (n <= 0) return [];
  const rows = Math.ceil(n / cols);
  return Array.from({ length: rows }, (_, i) => (i < rows - 1 ? cols : n - cols * (rows - 1)));
}

/** x offsets for `count` items centered on 0 with spacing `step`. */
export function centeredRow(count: number, step: number): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

/** The camera looks down ~30° onto the orbital plane, so an orbit through (x, y) has ry = rx · ORBIT_SQUASH. */
export const ORBIT_SQUASH = 0.5;

/** Radii of the orbit ellipse (centered on the star) that passes through a front-side point. */
export function orbitThrough(x: number, y: number): { rx: number; ry: number } {
  const rx = Math.hypot(x, y / ORBIT_SQUASH);
  return { rx, ry: rx * ORBIT_SQUASH };
}

// --- Ring formation (06 §3): one shared grammar for planets around a star and Tasks around a planet ---

export interface FormationParams {
  /** Ring k holds its bodies at half-span x0 + k·dx and depth y0 + k·dy below the parent. */
  x0: number;
  dx: number;
  y0: number;
  dy: number;
  /** Past this many rings, rings take 3+ bodies instead of adding more rings. */
  maxRings: number;
}

/** Feature system: sized for a star of r 240 and bodies of r ≈ 120 (06 §3). */
export const FORMATION = {
  x0: 380,
  dx: 380,
  y0: 600,
  dy: 400,
  maxRings: 6,
  /** Gap from the lowest body to the resource (station) row. */
  /** Room below the lowest body for the PR lane, then the station row (06 §3). */
  stationGap: 1250,
  stationStep: 680,
};

// --- Task radar (06 §3): Tasks around a close-up planet sit in one band per rung ---

/** A Task's band: outer while Ready, middle while Underway, inner once Accomplished. */
export type RadarBand = 'ready' | 'underway' | 'accomplished';
export const RADAR_BANDS: readonly RadarBand[] = ['accomplished', 'underway', 'ready'];

/**
 * Band radii (rx; ry = rx · ORBIT_SQUASH) around a planet of r 400, inner to outer. Each band is a
 * front arc from RADAR_ARC[0] to RADAR_ARC[1] (radians, y down: π/2 is straight in front), so the
 * gap sits behind the planet and every dot stays visible.
 */
export const RADAR = { rx: { accomplished: 1120, underway: 1540, ready: 1960 } as Record<RadarBand, number>, planetR: 400 };
export const RADAR_ARC: readonly [number, number] = [(7 * Math.PI) / 6, -Math.PI / 6]; // 210° → −30°, through the front

/** The band for a Task stage (INV-14 amendment): radius follows the displayed stage. Removed has none. */
export function radarBand(stage: string): RadarBand | null {
  if (stage === 'task.settled') return 'accomplished';
  if (stage === 'task.lit') return 'underway';
  if (stage === 'task.faint') return null;
  return 'ready'; // task.unstarted, and unknown states (neutral, INV-11)
}

/** The most Tasks that stop spreading wider: fewer than this sit at this many Tasks' spacing, centered. */
const RADAR_SPREAD_MAX = 6;
const ARC_SAMPLES = 720;
let arcTable: { theta: number[]; len: number[] } | null = null;
/** Cumulative arc length along the unit band (rx 1), sampled from RADAR_ARC[0] to RADAR_ARC[1]. */
function arcLengths(): { theta: number[]; len: number[] } {
  if (arcTable) return arcTable;
  const [a0, a1] = RADAR_ARC;
  const theta: number[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= ARC_SAMPLES; i++) theta.push(a0 + ((a1 - a0) * i) / ARC_SAMPLES);
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const [x0, y0] = [Math.cos(theta[i - 1]!), ORBIT_SQUASH * Math.sin(theta[i - 1]!)];
    const [x1, y1] = [Math.cos(theta[i]!), ORBIT_SQUASH * Math.sin(theta[i]!)];
    len.push(len[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  arcTable = { theta, len };
  return arcTable;
}

/**
 * Spoke angles for `n` Tasks (every Task ever linked, so seeking never moves a spoke): evenly spaced
 * by arc length along the band, left end to right end through the front, in slot order; with fewer
 * than `RADAR_SPREAD_MAX` they keep that spacing and sit centered. The bands
 * share one shape, so a spoke spaces Tasks evenly in every band.
 */
export function radarAngles(n: number): number[] {
  if (n <= 0) return [];
  const { theta, len } = arcLengths();
  const total = len[len.length - 1]!;
  // A few Tasks cluster at the front instead of stretching to the band's ends (decided 2026-10-09):
  // the spacing is never wider than six Tasks' share of the arc, and the group is centered.
  const slot = Math.min(total / n, total / RADAR_SPREAD_MAX);
  return Array.from({ length: n }, (_, i) => {
    const target = total / 2 + (i - (n - 1) / 2) * slot;
    let j = 1;
    while (j < len.length - 1 && len[j]! < target) j++;
    const k = (target - len[j - 1]!) / (len[j]! - len[j - 1]! || 1);
    return theta[j - 1]! + (theta[j]! - theta[j - 1]!) * k;
  });
}

/** Where a spoke crosses a band, centered on the planet. */
export function radarPoint(angle: number, band: RadarBand, scale = 1): { x: number; y: number; rx: number; ry: number } {
  const rx = RADAR.rx[band] * scale;
  const ry = rx * ORBIT_SQUASH;
  return { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry, rx, ry };
}

/** Miniature in a sector: same ring rule, compressed so the minis stay near their star. */
export const MINI_FORMATION: FormationParams = { x0: 90, dx: 38, y0: 130, dy: 26, maxRings: 6 };

export interface FormationSlot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  ring: number;
  /** Labels point outward from the ring's ends, so rings never compete for label space (06 §4). */
  labelSide: 'left' | 'right';
}

/** Bodies per ring: two per ring (mirrored pair) until maxRings, then spread evenly, outer rings fuller. */
export function ringCounts(n: number, maxRings = FORMATION.maxRings): number[] {
  if (n <= 0) return [];
  if (n <= maxRings * 2) return Array.from({ length: Math.ceil(n / 2) }, (_, k) => (k === Math.ceil(n / 2) - 1 && n % 2 ? 1 : 2));
  const base = Math.floor(n / maxRings);
  const extra = n % maxRings;
  return Array.from({ length: maxRings }, (_, k) => base + (k >= maxRings - extra ? 1 : 0));
}

/**
 * Ring formation for `n` children (the count ever linked, so it's stable across seeks), centered on a
 * parent at the origin and scaled by `scale`. Ring k's ends sit at (±span_k, depth_k), each ring
 * outside and in front of the last, so ring count reads as child count at every zoom. A lone body
 * sits at front-center. Slots fill inner ring first, left to right. The ring's two end bodies label
 * outward; any between them label below.
 */
export function featureFormation(n: number, scale = 1, p: FormationParams = FORMATION): FormationSlot[] {
  const out: FormationSlot[] = [];
  ringCounts(n, p.maxRings).forEach((c, k) => {
    const span = (p.x0 + k * p.dx) * scale;
    const depth = (p.y0 + k * p.dy) * scale;
    if (c === 1) {
      out.push({ x: 0, y: depth, ...orbitThrough(0, depth), ring: k, labelSide: 'left' }); // interior: left (06 §4)
      return;
    }
    const ring = orbitThrough(span, depth);
    for (let j = 0; j < c; j++) {
      const x = -span + (2 * span * j) / (c - 1);
      const y = ring.ry * Math.sqrt(Math.max(0, 1 - (x / ring.rx) ** 2));
      out.push({ x, y, ...ring, ring: k, labelSide: j === c - 1 ? 'right' : 'left' }); // ends outward, interior left
    }
  });
  return out;
}

/**
 * Resource row (stations) below the lowest body of a formation. Wide formations are fit at a smaller
 * scale, so the gap grows with the formation's width: the PR lane keeps a label's room above and
 * below its vessels on screen, whatever the density (06 §3).
 */
export function stationRowY(slots: readonly { x: number; y: number }[], floor = 0): number {
  const width = Math.max(0, ...slots.map((s) => Math.abs(s.x))) * 2;
  return Math.max(floor, ...slots.map((s) => s.y)) + Math.max(FORMATION.stationGap, width * 0.4);
}
