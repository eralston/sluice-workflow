// Label avatars (06 §4): a circle at the left of a label showing a person's picture, or their
// initials on a color. Like ADO's typographic avatars, the color depends only on the initials, so the
// same initials always get the same color, and different initials spread across many hues. Every
// color avoids the signal ladder's hues (09 §1: steel grey, progress blue, violet, gold) and holds
// ivory text at WCAG AA or better (tests/unit/avatar.test.ts checks both).
import { fnv1a32 } from '../hash';

/**
 * Deep, saturated swatches for ivory initials: oranges, greens, teals, blues, magenta, browns. No true
 * reds (crimson and raspberry went 2026-10-09, slice 6): red means a real alert (09), and with no
 * pictures readable every captain wears one of these.
 */
export const AVATAR_COLORS: readonly number[] = [
  0x3d3f8f, // indigo
  0x9c3d22, // brick
  0x8a4b1e, // rust
  0x5e6a1f, // olive
  0x3f6f2a, // moss
  0x23704a, // forest
  0x13705f, // jade
  0x146a72, // teal
  0x243f78, // navy (far darker than progress blue)
  0x8c2c66, // magenta
  0x7a5c14, // bronze
  0x6f4a32, // walnut
];

/** The ivory used for initials. */
export const AVATAR_TEXT = 0xf4f0de;

/** "Dave Mauldin" → "DM"; "Cher" → "C"; extra middle names are skipped, like ADO. */
export function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return '?';
  const first = [...words[0]!].find((c) => /\p{L}/u.test(c)) ?? '';
  if (words.length === 1) return first.toUpperCase();
  const last = [...words[words.length - 1]!].find((c) => /\p{L}/u.test(c)) ?? '';
  return (first + last).toUpperCase();
}

export function avatarColor(initials: string): number {
  return AVATAR_COLORS[fnv1a32(`avatar:${initials}`) % AVATAR_COLORS.length]!;
}

/** Only inline images reach the renderer: it never fetches from ADO (no credentials there, INV-17). */
export const isAvatarImage = (url: string) => /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(url);
