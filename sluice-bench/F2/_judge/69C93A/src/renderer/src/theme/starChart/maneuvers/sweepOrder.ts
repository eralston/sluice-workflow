// The order a sector sweep (27 E7, 13 §6) reveals its pieces in: outward from the star, by how far each sits in
// the frontier's own proportions, so the sweep ring passes them one after another. Pure, no Pixi.

/** The frontier rectangle in world units (the solar plan's board). */
export interface SweepBoard { minX: number; minY: number; maxX: number; maxY: number }

/** Something the sweep reveals: its projection key and where it sits. */
export interface Sweepee { pk: string; at: readonly [number, number] }

/**
 * `subjects` nearest the star first: by the normalized elliptical distance `hypot(dx / rx1, dy / ry1)` from
 * the board's centre (rx1 and ry1 its half-sizes), then by key. `d` is that distance, in frontier radii.
 */
export function sweepOrder<T extends Sweepee>(subjects: readonly T[], board: SweepBoard): { item: T; d: number }[] {
  const cx = (board.minX + board.maxX) / 2;
  const cy = (board.minY + board.maxY) / 2;
  const rx = (board.maxX - board.minX) / 2 || 1;
  const ry = (board.maxY - board.minY) / 2 || 1;
  return subjects
    .map((item) => ({ item, d: Math.hypot((item.at[0] - cx) / rx, (item.at[1] - cy) / ry) }))
    .sort((a, b) => a.d - b.d || (a.item.pk < b.item.pk ? -1 : a.item.pk > b.item.pk ? 1 : 0));
}
