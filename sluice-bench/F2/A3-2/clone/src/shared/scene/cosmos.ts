// The empty cosmos (decided 2026-10-07): its rotating quotes, and the contrast rule they keep. Pure.

export interface Quote { text: string; by: string }

/** One quote per line, `“quote” — Name, Source`; blank lines and `#` comments are skipped. */
export function parseQuotes(raw: string): Quote[] {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((line) => {
    const i = line.lastIndexOf(' — ');
    return i < 0 ? { text: line, by: '' } : { text: line.slice(0, i).trim(), by: line.slice(i + 3).trim() };
  });
}

type Rgb = [number, number, number];
export const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** WCAG 2 contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** A colour at `alpha` over an opaque background. */
export const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i]! * (1 - alpha))) as Rgb;

/**
 * The quote's look: ivory at this opacity. Subtle against space, yet AA (4.5:1) against the
 * brightest backdrop it can sit on (a lit nebula band, QUOTE_WORST_BG) as well as the ink.
 */
export const QUOTE_ALPHA = 0.74;
export const IVORY = '#f4f0de';
export const INK = '#081629';
export const QUOTE_WORST_BG = '#2c3a64';
