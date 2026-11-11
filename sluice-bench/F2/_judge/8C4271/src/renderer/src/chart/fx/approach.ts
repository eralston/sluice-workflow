// Where a ship parks to work something (13 §6.1, 22 A10): pure points from live anchors, so a sortie's
// target can move while it flies. No Pixi here, so the unit tests read it directly.
import type { Anchor } from './effects';

/**
 * Where a ship comes in to work `target` (22 A10): `gap` out from it, on the side of its planet it's
 * on, so a ship attacking a hive ship or mining an asteroid comes round to that side of the planet and
 * works it from outside the planet's face. Without a planet (`around`: a frontier piece), from the side
 * the ship comes from (`besideOf`). `fan` turns it off that side (radians), to spread several ships;
 * `clear` is the least distance from the planet's centre (the planet's radius and the ship's).
 */
export function approachOf(target: Anchor, around: Anchor | null, from: Anchor, gap: () => number, fan = 0, clear: () => number = () => 0): () => [number, number] | null {
  const beside = besideOf(target, from, gap);
  if (!around) return beside;
  return () => {
    const t = typeof target === 'function' ? target() : target;
    const c = typeof around === 'function' ? around() : around;
    if (!t || !c) return beside();
    const dx = t[0] - c[0];
    const dy = t[1] - c[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return beside();
    // `fan`: a turn off that side, so several ships on one target (a strike run) stand apart. Never
    // nearer the planet's centre than `clear` (its radius and the ship's), so it stays off the face
    // whatever depth the work sits at.
    const a = Math.atan2(dy, dx) + fan;
    const d = Math.max(l + gap(), clear());
    return [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
  };
}

/**
 * Where a ship parks on its planet's loiter ring to work `target` (22 D6, the mandala): at the ring's
 * slot nearest the work's direction from the planet, `slots` more round it (to spread several ships).
 * The ring's slots run from the planet's far side from the star (at the origin), `pitch` apart along it.
 */
export function ringApproachOf(target: Anchor, around: Anchor, ringR: number, pitch: () => number, slots = 0): () => [number, number] | null {
  return () => {
    const t = typeof target === 'function' ? target() : target;
    const c = typeof around === 'function' ? around() : around;
    if (!t || !c) return null;
    const far = Math.atan2(c[1], c[0]);
    const step = Math.min(Math.PI / 3, pitch() / ringR);
    let off = Math.atan2(t[1] - c[1], t[0] - c[0]) - far;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    const a = far + (Math.round(off / step) + slots) * step;
    return [c[0] + Math.cos(a) * ringR, c[1] + Math.sin(a) * ringR];
  };
}

/** A point beside `target`, `gap` out from it toward `from` (where a ship parks to work it). */
export function besideOf(target: Anchor, from: Anchor, gap: () => number): () => [number, number] | null {
  return () => {
    const t = typeof target === 'function' ? target() : target;
    const f = typeof from === 'function' ? from() : from;
    if (!t) return null;
    const dx = (f?.[0] ?? t[0] + 1) - t[0];
    const dy = (f?.[1] ?? t[1]) - t[1];
    const l = Math.hypot(dx, dy) || 1;
    return [t[0] + (dx / l) * gap(), t[1] + (dy / l) * gap()];
  };
}
