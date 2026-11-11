# Slice 1.3 C1 and C10: outline contrast, softer loading energy

**Status:** built 2026-10-28, fixed after review the same day. Items: [23 §3 Block C](../23-v1.3.md#3-blocks), C1 and C10.

## 1. What was built
- **C1, measured first.** `tests/drive/steps/c1-contrast.ts` (`npm run drive -- tests/drive/steps/c1-contrast.ts --paradigm solar`)
  shoots each piece four ways (rim only, no keyline, everything, no aura) at device scale. Along 32 rays it reads the rim's brightest rendered
  pixel against the bare backdrop under it and the pixel 1 px past the band, as WCAG 2 contrast `(L1 + 0.05) / (L2 + 0.05)`. Rays are pooled per
  role (six pieces each at the fit and 2×) and split by backdrop: night sky (bare luminance under 0.02) or a lit planet face / bright nebula.
  "Planet" in the contract means the seat planet a piece sits on (13 §3), not the piece's own body.
- **Weights.** Deadly red was the one under the floor (2.3:1 against the night sky). `AURA_BALANCE.threat` 0.85 → 1.25 (the cap: its strongest
  channel clips there). On the same backdrop blue then read about 20% above red, so `objective` 1.1 → 1.04 to match. Gold stays 1.
- **The keyline** (new): copies of the silhouette tinted the night sky's colour (`KEY_COLOR`, near the ink), `KEYLINE_PX` 2 wide past the rim at
  `KEYLINE_ALPHA` 0.85, normal-blended between the glow and the rim, so the rim's neighbour is dark on any backdrop. It has no hue or motion, so it is
  the outline's shadow edge, not an ornament (09). **No filter pass and no group of its own.** The first build used a ColorMatrix filter on the
  keyline and a second AlphaFilter group per asteroid aura (to keep glow, keyline and rim in order); it cost Pulsar Pod p50 16.8 → 24.9 ms. The asteroid
  aura is back to one group (glow, keyline, rim, eraser inside it, as at HEAD); a ship's has none.
  The with/without switch is the test hook `showAuras('unkeyed')` against `'all'`; `KEYLINE_PX` or `KEYLINE_ALPHA` at 0 turns it off.
- **Pixi 8.21 blending (checked, not changed).** A filtered container composites by its *filter's* blend mode, so the `blendMode = 'add'` set on the filtered
  glow, rim and group was ignored: the aura has always been laid over the scene by alpha, and the weights were tuned on that. Proof: giving the asteroid group's
  AlphaFilter `blendMode: 'add'` lifted blue's outline luminance from 0.23 to 0.37 on the night sky and to 0.51 on a planet face. The dead assignments are removed and
  the comments (aura.ts, 06 §9, 15 §8) say what renders. Nothing changes on screen.
- **Perf** (`npm run e2e:spec -- perf`, Pulsar Pod, this machine and session; ms, p50 / p95):

  | Build | rest | play 1× | play 4× |
  |---|---|---|---|
  | HEAD `aura.ts` | 16.6 / 17.0 | 16.7 / 25.2 | 16.7 / 33.2 |
  | Keyline on, run 1 | 16.6 / 17.3 | 16.7 / 25.3 | 16.7 / 32.6 |
  | Keyline on, run 2 | 16.6 / 17.3 | 16.7 / 25.3 | 16.7 / 33.3 |
  | Keyline off (`KEYLINE_ALPHA` 0), run 1 | 16.6 / 17.0 | 16.7 / 25.2 | 16.7 / 32.9 |
  | Keyline off, run 2 | 16.6 / 17.1 | 16.7 / 25.2 | 16.7 / 33.3 |

  No measurable p50 cost and at most 0.3 ms at p95. The intermediate two-group build (keyline off) read 24.7 ms p50 at 4×, so the second group, not the keyline, was most of the cost.
  The spec's own soft budget (p95 under 25 ms) is missed at play 1× and 4× at HEAD too (25.2, 33.2): pre-existing, not from this item.
- **Final numbers** (device scale; medians, 0.1 to 0.3 run to run). Night sky: Harbor Pod. Lit planet face: Meridian Works, Sprint 7, Convoy Planning Pod (hive ships on
  their planet's right half, some on the lit crescent), `C1_POD="Meridian Works|Sprint 7|Convoy Planning Pod" C1_PICKS=12`.

  | Outline | Weight | Night sky: vs backdrop | Night sky: vs pixel past rim | Lit face: vs pixel past rim, keyline off → on | clean rays only | n (night / face) |
  |---|---|---|---|---|---|---|
  | Deadly red | 0.85 → 1.25 | 2.3 → 4.7 | 4.3 | 1.7 → 1.7 | 1.9 → 2.4 | 177 / 152 |
  | Opportunity blue | 1.1 → 1.04 | 3.9 → 4.9 | 5.0 | 2.7 → 4.0 | 2.5 → 4.2 | 118 / 272 |
  | Victory gold | 1 → 1 | 8.7 → 9.6 | 9.7 | 4.0 → 4.9 | 5.3 → 7.9 | 310 / 156 |

  "Clean rays" keep rays where the keyline is visible (the neighbour is not the piece's own hull, legs or weapons, which the plain ray median includes). The night-sky "before" values are from the
  first CSS-pixel measurement, so they are a trend only. Red and blue are within 4% against the night sky (4.7, 4.9). Gold's "against the body" is not applicable (the dark gap inside its ring) and it stays the brightest outline.
  **Deadly red stays under 3:1 on a lit planet face** (1.7; 2.4 on clean rays; 1.4 against the backdrop under it). Its weight is capped and an opaque keyline gave the same, so it goes to HG-C.
  Blue passes against its neighbour but not against the backdrop beneath the rim (2.2), which a keyline cannot change.
- **C10.** The energy was `min(1.8, 0.35 + 0.14 s + 0.35 progress)`; it is now `min(1.5, 0.3 + 0.09 s + 0.3 progress)`, named
  `ENERGY_BASE/RATE/PROGRESS/PEAK` in `chart/fx/explore.ts` and a marked, guarded table in 15 §8. With no progress, 1.0 comes at 7.8 s (was 4.6) and the peak at 13.3 s (was 10.3).
  The gallery reads the constants (*starting* 0.3, *a long wait* 1.02, *at its peak* 1.5, *tearing spacetime* 1.5).
  **Side effects:** the success flare peaks at 2.3 (was 2.6: the peak plus its 0.8 release); a gentle load's progress term is 0.3 (was 0.35); the
  cosmos storm (base 0.65, 0.22/s) now caps at 1.5, which it reaches in about 3.9 s (it capped at 1.8 in about 5.2 s). Reduced motion's 0.6 and the callers' own bases and rates are unchanged.
- **Stills:** `review/v1.3/C/C1-after-*.png` (keyline on), `C1-keyline-off-*.png` (same pieces without it: `9ccc-z2-5` and `9ccc-z2-0` are blue asteroids over a lit planet face;
  `cc293d-z2-3` red; `ffc76b-z1-5` gold), `C1-before-*.png` (old weights, CSS-pixel crops); `C10-before.png` and `C10-after.png` (the gallery's Loading energy section).

## 2. Contracts changed
- 15 §8 (aura rows incl. `KEYLINE_PX`, `KEYLINE_ALPHA`; the contrast table; a marked `loading-energy` table, guarded in `docTables.test.ts`), 15 §6 (a role-outline row in the contrast table),
  06 §9 (balance, keyline) and §3 (loading), 09 §9, 03 §10 (`showAuras('unkeyed')`), tests/README (drive command and step table).
- No goldens moved (outline weights and the keyline are render-only).

## 3. Checks
- `npm run typecheck`, `npm run lint`, `npm test`, `e2e:spec -- gallery explore`, `e2e:keystone`, drive `c1-contrast`: see the final report for counts.
- `tests/unit/auraContrast.test.ts` loads the constants by a runtime import (as `docTables.test.ts` does). It computes each rim's nominal colour from the code and asserts the 3:1 floor against the
  night sky, red and blue within 20% (nominal, which is rougher than the render; measured 4%), and gold brightest. One `PIN` test holds the weights and keyline the last drive run was taken at: it is a reminder to re-run the drive, not a proof.
  The drive's own numbers are not asserted; they are the record here and in 15 §8.

## 4. Human gates
HG-C: the outline look (C1 stills, with and without the keyline; red is brighter than before) and the loading energy (C10 stills, or the gallery).

## 5. Known limitations and open questions
- **Red on a lit planet face is below 3:1** (1.7 / 2.4 clean), measured on real fixture data (above). Open for HG-C: accept it, or add something that is not a weight (a wider or bright-edged keyline, or a pale inner rim for hive ships).
- **Blue, one asteroid over bright nebula** read 1.9:1 against the bare sky in the first measurement; the keyline does not change a rim against the backdrop *under* it, only against its neighbour.
- **Gold is not equalised to red and blue** (10:1 against the night sky, on purpose). If "likewise" meant equal contrast, gold would drop to about 4:1 (weight about 0.6): a one-line change.
- The glow's rectangular clip (a square patch of glow ends at the aura's bounds near a hive ship) is pre-existing; not touched.
- The storm's photon-ring crack (shader `smoothstep(0.9, 1.6, E)`) is slightly weaker now that the cosmos caps at 1.5.
