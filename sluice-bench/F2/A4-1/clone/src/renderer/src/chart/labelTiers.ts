// 14 §2.9 — label tiers (12: "Label tier"). One pure rule picks how much a label says this frame, so
// the DOM layer (labels.ts) and its plates' rows read the same answer. It reproduces v0's dynamic
// labels exactly (06 §4, decided 2026-10-04), and adds one tier above them for v1. The states are
// named once (19 Q5): Title, Full, Expanded and Picture. An expanded plate's row budget is
// projection's (`ROW_BUDGET`, shared/scene/project/lists.ts), not a tier's.
import type { ViewNode } from '@shared/contracts/view';
import type { HoloTier } from './holo/holoLabel';

/**
 * - **expanded**: a v1 object that is pointed at or selected, while settled. Its label is full, and
 *   its holo plate (if the graph lists rows for it) grows them in place (19 L2).
 * - **full**: the full label: title, meta, who (a holo plate: its variant's title and subtitle).
 * - **title**: the title only (while playing or moving, a dense grid's names, a brief flash).
 * - **picture**: a ship's title-only label: just its captain's picture, hugging the top of the ship.
 */
export type LabelTier = 'expanded' | 'full' | 'title' | 'picture';

/** What the label layer knows about a node this frame. */
export interface TierState {
  /** The pointer is over it on the chart (or over its label). */
  pointed: boolean;
  selected: boolean;
  /** It is the captain being followed (05 §6). */
  followed: boolean;
  /** Playback advanced within the settle time. */
  recent: boolean;
  /** It moved within the settle time. */
  moving: boolean;
  /** Its label is flashing (a new or changed Task). */
  flashed: boolean;
}

/**
 * Only what the pointer is over opens fully while playing, to be read, and never the followed ship.
 * Dense grids (`labelCompact`) always show the title unless selected. Ships show their picture
 * wherever other labels show their title. Rows are hidden unless pointed or selected (17 W2-T5), and
 * like every full label they wait for the object to settle, unless pointed.
 */
export function tierFor(n: ViewNode, s: TierState): LabelTier {
  const open = s.pointed && !(n.kind === 'captain' && s.followed);
  const always = !!n.labelCompact && !s.selected;
  if (!open && (always || s.recent || s.moving || s.flashed)) return n.kind === 'captain' ? 'picture' : 'title';
  // v0 nodes (no asset) have no rows, so they never go past full.
  return n.asset !== undefined && (open || s.selected) ? 'expanded' : 'full';
}

/** Whether a tier shows the title alone (v0's `is-compact`). */
export const isCompact = (t: LabelTier): boolean => t === 'title' || t === 'picture';

/** What raises a plate off T4 Sky (27 B1). */
export interface RaiseState {
  pointed: boolean;
  selected: boolean;
  followed: boolean;
  /** Its rows are open. */
  expanded: boolean;
  /** A maneuver casts it (P-6 attention slot). */
  cast: boolean;
  /** It is a captain a maneuver names (P-6 attention slot). */
  acting: boolean;
}

/** Every plate rests at T4 Sky; any raising state draws it at its own tier (27 B1, 15 §6). */
export function raisedTier(own: HoloTier, s: RaiseState): HoloTier {
  return s.pointed || s.selected || s.followed || s.expanded || s.cast || s.acting ? own : 'sky';
}

/** Where a plate goes in a formation (27 D1): its members' axis and the side of it a member stands on. */
export type FormationSide = { axis: 'v' | 'h'; side: 'left' | 'right' | 'above' | 'below' | null };

/**
 * A formation is a crew of two or more (27 D1). Screen px. When it runs closer to vertical (its y extent
 * greater than its x), each member's plate goes beside its ship, on the side away from the crew's own line (its principal axis
 * through the members' mean, so a line D3 turned counts) (the member on it, toward the view's middle); otherwise above or below, by the side of the
 * axis (null on it: the plate's usual preference). Fewer than two members is no formation.
 */
export function formationSides(members: { pk: string; x: number; y: number }[], viewW: number): Map<string, FormationSide> {
  const out = new Map<string, FormationSide>();
  if (members.length < 2) return out;
  const xs = members.map((m) => m.x), ys = members.map((m) => m.y);
  const meanX = xs.reduce((a, b) => a + b, 0) / members.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / members.length;
  const axis = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs) ? 'v' : 'h';
  // The side is the signed offset from the crew's own line (its principal axis), so a line turned by D3
  // still alternates its members; the normal points right for v and down for h.
  let sxx = 0, syy = 0, sxy = 0;
  for (const m of members) { sxx += (m.x - meanX) ** 2; syy += (m.y - meanY) ** 2; sxy += (m.x - meanX) * (m.y - meanY); }
  // A zigzag of members tilts the fitted angle a few degrees, so snap it to D3's 15 degree steps.
  const step = Math.PI / 12;
  const th = Math.round((0.5 * Math.atan2(2 * sxy, sxx - syy)) / step) * step;
  let nx = -Math.sin(th), ny = Math.cos(th);
  if (axis === 'v' ? nx < 0 : ny < 0) { nx = -nx; ny = -ny; }
  for (const m of members) {
    const off = (m.x - meanX) * nx + (m.y - meanY) * ny;
    if (axis === 'v') out.set(m.pk, { axis, side: off > 2 ? 'right' : off < -2 ? 'left' : m.x < viewW / 2 ? 'right' : 'left' });
    else out.set(m.pk, { axis, side: off > 2 ? 'below' : off < -2 ? 'above' : null });
  }
  return out;
}
