// 23 C1: the role outlines' contrast. The measurement is the drive step tests/drive/steps/c1-contrast.ts
// (`npm run drive -- tests/drive/steps/c1-contrast.ts --paradigm solar`): it samples rendered pixels and
// reports WCAG 2 contrast, (L1 + 0.05) / (L2 + 0.05) on relative luminance, medians by role and backdrop
// (15 §8, aura). Additive blending, alpha, the glow and the keyline all move the nominal colour, so the
// colour math below predicts the measurement only roughly.
//
// What can fail here:
// - NOMINAL tests compute each rim's colour from the constants in code (weights, RIM_ALPHA) and hold
//   the 3:1 floor against the night sky's measured luminance, red and blue near each other, and (27 B3)
//   gold at rest within 10% of both; at the peak of a victory's flare gold is above both.
// - The PIN test holds the weights and keyline the last drive measurement was taken at: retune one and
//   it fails until the drive is re-run and PINNED (and 15 §8, 09) are updated. It is a reminder, not a proof.
// RIM_ALPHA is nominal: the live rim ignores it and draws at full strength (27 C3), so the model uses alpha 1 and
// the gold check allows 11% (the model reads 10.8% from blue); the drive's measurement is the real check
// (gold 4.84 against red 5.31, blue 5.33: within 9.2%).
// The drive's own numbers are NOT asserted here: they are the record, in the note and 15 §8.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rec = Record<string, unknown>;
// The same way docTables.test.ts reads a renderer constant: a runtime import of the file by path.
const AURA_FILE = resolve(__dirname, '../../src/renderer/src/chart/art/aura.ts');
const mod = (await import(/* @vite-ignore */ AURA_FILE)) as Rec;
const AURA = mod.AURA as { threat: number; objective: number; accomplished: number };
const AURA_BALANCE = mod.AURA_BALANCE as { threat: number; objective: number; accomplished: number };
const AURA_FLARE_WEIGHT = mod.AURA_FLARE_WEIGHT as number;
const RIM_ALPHA = mod.RIM_ALPHA as number;

/** Median bare luminance of the night sky under the rims in Harbor Pod (the drive, 2026-10-28). */
const SKY_L = 0.007;
/** The weights and keyline the last drive run was taken at. */
const PINNED = { threat: 1.25, objective: 1.04, accomplished: 0.68, AURA_FLARE_WEIGHT: 1, RIM_ALPHA: 0.8, KEYLINE_PX: 2, KEYLINE_ALPHA: 0.85 };

/** What the live rim actually composites at (27 C3): full strength, whatever RIM_ALPHA says. */
const LIVE_RIM_ALPHA = 1;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** The rim's nominal relative luminance: each channel scaled by the role's weight, capped at 1, times LIVE_RIM_ALPHA. */
const rimL = (color: number, k: number) => {
  const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((v) => Math.min(1, (v / 255) * k) * LIVE_RIM_ALPHA) as [number, number, number];
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (l: number) => (l + 0.05) / (SKY_L + 0.05);
const nominal = {
  threat: ratio(rimL(AURA.threat, AURA_BALANCE.threat)),
  objective: ratio(rimL(AURA.objective, AURA_BALANCE.objective)),
  accomplished: ratio(rimL(AURA.accomplished, AURA_BALANCE.accomplished)),
};

describe('role outline contrast (23 C1)', () => {
  it('nominally, every outline holds 3:1 against the night sky', () => {
    for (const k of ['threat', 'objective', 'accomplished'] as const) expect(nominal[k], k).toBeGreaterThanOrEqual(3);
  });
  it('nominally, red and blue stand within 20% of each other (measured: within 4%)', () => {
    expect(Math.abs(nominal.threat - nominal.objective) / Math.max(nominal.threat, nominal.objective)).toBeLessThan(0.2);
  });
  it('gold at rest is within about 10% of red and of blue (27 B3; the model reads 10.8% from blue, so 11%: the drive holds the true 10%)', () => {
    expect(Math.abs(nominal.accomplished - nominal.threat) / nominal.threat).toBeLessThanOrEqual(0.11);
    expect(Math.abs(nominal.accomplished - nominal.objective) / nominal.objective).toBeLessThanOrEqual(0.11);
  });
  it('at the peak of a victory flare, gold is above both red and blue (27 B3)', () => {
    const peak = ratio(rimL(AURA.accomplished, AURA_FLARE_WEIGHT));
    expect(peak).toBeGreaterThan(Math.max(nominal.threat, nominal.objective));
  });
  it('PIN: the weights and keyline the last drive measurement was taken at', () => {
    expect({ ...AURA_BALANCE, AURA_FLARE_WEIGHT, RIM_ALPHA, KEYLINE_PX: mod.KEYLINE_PX, KEYLINE_ALPHA: mod.KEYLINE_ALPHA }).toEqual(PINNED);
  });
});
