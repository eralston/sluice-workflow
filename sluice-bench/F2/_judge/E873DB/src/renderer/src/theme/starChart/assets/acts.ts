// The art acts that show a change as it happens (22 C3, 05 §8 M-25; G-1: they did nothing). Each is an
// overlay (`Overlay`, adapt.ts) drawn over the piece in its own units, `r` its radius, played across
// one maneuver's act and cleared, so the stage's look (which lands at the maneuver's land) stays a pure
// function of the snapshot (INV-12). Paths are fixed by index, never random.
//   carve    bright cuts across an asteroid, one after another, under the captain's cutting beam
//   rig      gantry arches rising round an asteroid, segment by segment
//   ghost    an asteroid cooling to its ghost: a grey veil settles over it, its outline breaking up
//   engage   an enemy ship's shields flaring, its gun ports waking one by one
//   launch   a tender sliding out of a station's bay to its patrol
//   operate  a station's ring of lights turning as it works
//   victory  a closed piece's gold outline flaring to full at the land of a victory, then settling over
//            AURA_FLARE_MS (27 B3). It draws nothing: it drives the art's outline each frame, and its `end` puts the
//            resting weight back. None under reduced motion.
import type { Graphics } from 'pixi.js';
import { HERO_GLOW, DANGER } from '../../../chart/art/energy';
import { NEARING, PROGRESS, READY } from '../../../chart/art/progress';
import { AURA_FLARE_MS, flareShare } from '../../../chart/art/aura';
import { motion } from '../../../chart/art/motion';
import type { Overlay } from './adapt';

/** In, hold, out: 0 at the ends of `u`, 1 between. */
const env = (u: number, a = 0.12, b = 0.8) => Math.min(1, u / a) * (1 - Math.max(0, (u - b) / (1 - b)));

/** Facets cut: four chords across the rock, each drawn end to end, flaring, then cooling to a scar. */
export const carve = (r: number): Overlay => (g: Graphics, u: number) => {
  for (let i = 0; i < 4; i++) {
    const start = 0.08 + i * 0.18;
    const t = (u - start) / 0.22;
    if (t <= 0) continue;
    const a = 0.5 + i * 1.7; // each cut its own heading
    const off = (i % 2 ? 0.3 : -0.25) * r;
    const nx = Math.cos(a + Math.PI / 2) * off;
    const ny = Math.sin(a + Math.PI / 2) * off;
    const half = Math.sqrt(Math.max(0, r * r * 0.81 - off * off));
    const x0 = nx - Math.cos(a) * half;
    const y0 = ny - Math.sin(a) * half;
    const k = Math.min(1, t);
    const x1 = x0 + Math.cos(a) * 2 * half * k;
    const y1 = y0 + Math.sin(a) * 2 * half * k;
    const hot = Math.max(0, 1 - Math.max(0, t - 1) * 1.5) * env(u, 0.05, 0.85);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: r * 0.09, color: PROGRESS, alpha: 0.35 * hot, cap: 'round' });
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: r * 0.03, color: 0xffffff, alpha: 0.8 * hot, cap: 'round' });
    if (t < 1) g.circle(x1, y1, r * 0.07).fill({ color: PROGRESS, alpha: 0.9 * hot });
  }
};

/** Gantries rising: three arches over the rock, each built up segment by segment. */
export const rig = (r: number): Overlay => (g: Graphics, u: number) => {
  const e = env(u, 0.1, 0.85);
  for (let i = 0; i < 3; i++) {
    const t = Math.min(1, Math.max(0, (u - 0.06 - i * 0.14) / 0.5));
    if (t <= 0) continue;
    const R = r * (1.12 + i * 0.16);
    const from = Math.PI * (0.92 + i * 0.03);
    const to = from + Math.PI * (1.16 - i * 0.06) * t;
    g.arc(0, 0, R, from, to).stroke({ width: r * 0.035, color: NEARING, alpha: 0.75 * e });
    // Its struts: short ticks along what has risen.
    const n = Math.floor(9 * t);
    for (let k = 0; k <= n; k++) {
      const a = from + ((to - from) * k) / Math.max(1, n);
      g.moveTo(Math.cos(a) * (R - r * 0.07), Math.sin(a) * (R - r * 0.07)).lineTo(Math.cos(a) * (R + r * 0.07), Math.sin(a) * (R + r * 0.07))
        .stroke({ width: r * 0.025, color: NEARING, alpha: 0.6 * e });
    }
  }
};

/** Cooling to a ghost: a grey veil settles over the rock and its outline breaks into dashes. */
export const ghost = (r: number): Overlay => (g: Graphics, u: number) => {
  const k = Math.min(1, u / 0.7);
  const e = 1 - Math.max(0, (u - 0.85) / 0.15);
  g.circle(0, 0, r * 0.98).fill({ color: READY, alpha: 0.42 * k * e });
  const dashes = 12;
  for (let i = 0; i < dashes; i++) {
    const a0 = (i / dashes) * Math.PI * 2 + u * 0.6;
    const a1 = a0 + (Math.PI / dashes) * (1 - 0.6 * k);
    g.arc(0, 0, r * 1.05, a0, a1).stroke({ width: r * 0.03, color: READY, alpha: 0.7 * e });
  }
};

/** Shields up, guns waking: an At-rest blue shield flares round the ship; Danger red ports glow in turn. */
export const engage = (r: number): Overlay => (g: Graphics, u: number) => {
  const e = env(u, 0.08, 0.8);
  const pulse = 0.6 + 0.4 * Math.sin(u * Math.PI * 4);
  g.ellipse(0, 0, r * 1.32, r * 1.08).stroke({ width: r * 0.05, color: HERO_GLOW, alpha: 0.55 * e * pulse });
  g.ellipse(0, 0, r * 1.32, r * 1.08).fill({ color: HERO_GLOW, alpha: 0.08 * e * pulse });
  for (let i = 0; i < 4; i++) {
    const on = Math.min(1, Math.max(0, (u - 0.15 - i * 0.12) / 0.12));
    if (on <= 0) continue;
    const a = -Math.PI * 0.7 + (i * Math.PI * 1.4) / 3;
    const x = Math.cos(a) * r * 0.62;
    const y = Math.sin(a) * r * 0.42;
    g.circle(x, y, r * 0.16).fill({ color: DANGER, alpha: 0.25 * on * e });
    g.circle(x, y, r * 0.07).fill({ color: DANGER, alpha: 0.9 * on * e });
  }
};

/**
 * A tender out of the bay: a Progress blue capsule slides from the hull's middle out to its patrol, a trail behind.
 * `dir`: the unit direction of the tender's own slot (23 C6), else out along the front arc.
 */
export const launch = (r: number, dir?: readonly [number, number] | null): Overlay => (g: Graphics, u: number) => {
  const e = env(u, 0.06, 0.85);
  const k = Math.min(1, u / 0.7);
  const ease = 1 - (1 - k) * (1 - k);
  const a = dir ? Math.atan2(dir[1], dir[0]) : -Math.PI / 2 - 0.5;
  const d = r * 1.3 * ease;
  const x = Math.cos(a) * d;
  const y = Math.sin(a) * d;
  g.moveTo(0, 0).lineTo(x, y).stroke({ width: r * 0.05, color: PROGRESS, alpha: 0.3 * e, cap: 'round' });
  g.ellipse(x, y, r * 0.12, r * 0.07).fill({ color: PROGRESS, alpha: 0.9 * e });
  g.circle(x, y, r * 0.2).fill({ color: PROGRESS, alpha: 0.15 * e });
};

/** At work: the station's ring of lights turns, a quarter of a turn across the act. */
export const operate = (r: number, dir?: readonly [number, number] | null): Overlay => (g: Graphics, u: number) => {
  const e = env(u, 0.1, 0.8);
  // The satellite being worked (23 C6): a soft pulse where its own tender patrols.
  if (dir) g.circle(dir[0] * r * 1.3, dir[1] * r * 1.3, r * (0.1 + 0.06 * Math.sin(u * Math.PI * 4))).fill({ color: HERO_GLOW, alpha: 0.5 * e });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + u * Math.PI * 0.5;
    const lit = 0.5 + 0.5 * Math.sin(a * 3 - u * 12);
    g.circle(Math.cos(a) * r * 1.18, Math.sin(a) * r * 0.62, r * 0.05).fill({ color: HERO_GLOW, alpha: (0.35 + 0.55 * lit) * e });
  }
};

/** A victory's gold outline flares, then settles (27 B3). Nothing is drawn; none under reduced motion. */
export const victory = (art: { setAuraFlare(s: number): void }): Overlay | null => {
  if (motion.reduced) return null;
  const o: Overlay = (_g: Graphics, u: number) => art.setAuraFlare(motion.reduced ? 0 : flareShare(u));
  o.durS = AURA_FLARE_MS / 1000;
  o.end = () => art.setAuraFlare(0);
  return o;
};
