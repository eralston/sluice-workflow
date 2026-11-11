// Hero energy (2026-10-13): one reactor, one blue. Every hero craft, dreadnoughts and captains alike,
// runs on the same heroic energy, so everything it emits is one blue: its weapons, its tractor beam,
// the energy a reviewer passes an author, its engines, coils and reactor glow. Enemies fire Danger
// Red. Good guys shoot blue, bad guys shoot red.
//
// The blue started as the signal ladder's progress blue, then shifted toward a definite blue (same
// day): drawn additively in layers, the lighter progress blue summed to near white. So hero energy
// brightens toward a pale blue, never toward white (`brighten`), and its hottest core is still blue.
// The ladder's own blue (progress.ts) is unchanged on the pieces.
//
// Weight comes from form, not hue: a weapon is the full blue with a pale-blue core; the tractor beam
// and a reviewer's energy are the same blue desaturated and spread out, friendly rather than fierce;
// a reactor at rest is the blue brightened.
import { lighten, mix } from './lit';

/** Hero energy: a definite, saturated blue (hue about 218°). */
export const HERO = 0x3d84ff;
/** Hero energy brightened: the hot centre of a beam. A pale blue, never white. */
export const HERO_PALE = 0x9ec8ff;
/** The hottest line of a hero beam: the palest the energy gets, still blue. */
export const HERO_CORE = 0xcfe3ff;
/** The same energy at rest: engines, nacelle coils, reactors, shields. */
export const HERO_GLOW = mix(HERO, HERO_PALE, 0.45);
/** The same energy given, not fired: the tractor beam and a reviewer's energy, desaturated and calm. */
export const HERO_SOFT = mix(HERO, 0x9aa4b6, 0.32);
/** Enemy fire: Danger Red, a hostile red only threats ever shoot (13 §4.3). */
export const DANGER = 0xff3b2f;
/** Danger Red brightened: an enemy beam's hot centre. */
const DANGER_PALE = 0xff8f7c;
/** The hot core of an enemy beam. */
export const DANGER_CORE = 0xffd2c6;

/** Is it hero energy (blue, by hue) or Danger Red? Derived tints (a lance's lighter blue) still count. */
const rgbOf = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
const isHero = (c: number) => {
  const [r, g, b] = rgbOf(c);
  return b > r * 1.35 && b >= g;
};
const isDanger = (c: number) => {
  const [r, g, b] = rgbOf(c);
  return r > g * 1.6 && r > b * 1.6;
};

/** A beam's core for its colour: pale blue for hero energy, pale red for an enemy's. */
export const coreOf = (color: number): number => (isDanger(color) ? DANGER_CORE : isHero(color) ? HERO_CORE : lighten(color, 0.75));

/**
 * Brighten energy by `t` without losing its hue: hero energy toward its pale blue, Danger Red toward
 * its pale red, anything else toward ivory (`lighten`).
 */
export const brighten = (color: number, t: number): number =>
  isDanger(color) ? mix(color, DANGER_PALE, t) : isHero(color) ? mix(color, HERO_PALE, t) : lighten(color, t);
