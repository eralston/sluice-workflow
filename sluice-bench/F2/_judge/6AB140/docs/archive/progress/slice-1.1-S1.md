# Slice 1.1-S1: One outline weight for danger and opportunity

Built 2026-10-14, following [19 §3](../19-v1.1.md#3-items) item S1 and Q8, Q10 (as recommended). It
builds on the v1.1 items already in the tree (L1, L2, L6, L7, L8, N1, P1, P2, S2) and reverts none of
their work. An earlier S1 run was cut off with a partial `aura.ts` and two steps files in the tree.
This run kept its approach, measured it, retuned the balance and replaced its temporary
`globalThis.__auraProbe` with two test hooks. That clears the three `no-explicit-any` lint errors the
P1, P2 and S2 notes reported. The scratch `tests/drive/steps/tmp-s1.ts` is deleted. S1 has no human
gate of its own. The stills below are for review.

## 1. What was built
- **Measured first** (a drive crop, Harbor Pod a third of the way through the round, reduced motion,
  three open asteroids and three open hive ships, each at the fit, 2× and 4×, shot with and without
  the outlines. Medians over 32 rays from each piece, in CSS px):

  | Zoom | Role | Rim offset, before → after | Band at half peak | ΔE vs the bare sky | Glow blur | Glow past the band |
  |---|---|---|---|---|---|---|
  | fit | asteroid | 0.29 → 2.00 | 1 → 2 | 31 → 52 | 16.6 → 4.0 | 0 → 1 |
  | fit | hive ship | 2.00 → 2.00 | 2 → 2 | 80 → 69 | 43.3 → 4.0 | 0 → 2 |
  | 2× | asteroid | 0.58 → 2.00 | 1 → 2 | 24 → 55 | 16.6 → 4.0 | 0 → 1 |
  | 2× | hive ship | 2.00 → 2.00 | 2 → 2 | 80 → 69 | 34.2 → 4.0 | 0 → 2 |
  | 4× | asteroid | 1.17 → 2.00 | 1 → 1.5 | 38 → 50 | 16.6 → 4.7 | 0 → 0 |
  | 4× | hive ship | 2.00 → 2.00 | 2.5 → 2.5 | 81 → 70 | 17.1 → 4.0 | 3.5 → 4 |

  **What the measurement found.** 19 S1's *Today* was half right: the rim was meant to be shared, but
  only the hive ship told the aura its zoom (`swarm.ts` `setZoom`). An asteroid never did, so its rim
  stayed `spread × 0.2` in art units: 0.3 px at the fit and 1.2 px at 4×, against the hive's 2 px.
  Both spreads also went to the blur unconverted (a `BlurFilter` strength is in screen px). A hive's
  glow was a 43 px haze at the fit, too faint to measure, and close up it showed as a clipped red
  square round the ship. An asteroid's glow was a fixed 17 px. The red read heavier mostly because
  it *was* wider. At equal width and alpha it still stands further off the sky than blue: ΔE 80
  against 48.
- **One token, in `chart/art/aura.ts`.** The aura reads its own scale on screen before each frame
  (`root.onRender`, `getGlobalTransform`), whoever owns the art, at any zoom, in the gallery too:
  - the rim is `RIM_PX`, 2 px, for every role (Q8: 2 px read clearly at the fit once the asteroid's
    was 2 px too, so 2.5 wasn't tried);
  - the glow's blur is `GLOW_SHARE` (0.08) of the silhouette's size on screen (the root of its bounds'
    area), between `GLOW_MIN_PX` 4 and `GLOW_MAX_PX` 12. It now hugs the rim, and the square haze is
    gone;
  - changes under 2% are left alone, so a steady camera costs one transform read per aura per frame.
- **Balanced by alpha, not width** (`AURA_BALANCE`: red 0.85, blue 1.1, gold 1). The aura is added,
  so scaling its colour scales its alpha. I tried three settings:
  - 1 and 1: red ΔE 80 against blue's 48, and red read a little heavier;
  - matching ΔE outright, 0.7 and 1.25 (59 against 60): blue read clearly the heavier, a bright cyan
    against a dim red;
  - 0.85 and 1.1 (69 against 53): they read as one weight by eye. Kept.
- **The art files are untouched** (Q10, "none if the spread moves into `aura.ts`"). The
  constructor's `spread` argument is now ignored (`_spread`). `setZoom` stays as a no-op, because
  `swarm.ts` still calls it.
- **Two test hooks** (03 §10): `auras()` (each drawn aura's centre, colour, rim and blur in screen
  px, and its alphas) and `showAuras('all' | 'none' | 'rim' | 'glow')`. They read a module-level set of
  live auras, and `destroy` removes each one.
- **`tests/drive/steps/v11-S1.ts`**: the measurement above, as a drive (listed in `tests/README.md`).

## 2. Contracts changed (with their doc edits)
- **03 §10:** the two hooks, under a new "v1.1 (19 S1)" line.
- **15 §8:** a new marked table, `aura` (RIM_PX, RIM_ALPHA, GLOW_SHARE, GLOW_MIN_PX, GLOW_MAX_PX,
  and AURA_BALANCE's three members), checked by `docTables.test.ts` (a new `check('aura')`, in
  `GUARDED`).
- **06 §9:** a new paragraph, *Role outlines: one weight*: the rim, the glow, the balance, and the
  before and after figures.
- **19:** S1's *Measured* and *State* lines, and a §5 decision (Q8, Q10, the balance values).
- Nothing departs from 02, 03 or 13. No golden changed: the aura isn't in any golden, and no v0 view
  draws one.

## 3. Checks
- `npm run typecheck`: pass.
- `npm test`: pass (54 files, 858 tests), including `docTables` (the new `aura` table).
- `npm run lint`: pass, with no errors anywhere. The earlier run's three `no-explicit-any` errors are
  gone.
- `npm run e2e:spec -- gallery-v1 solar`: 24 passed (gallery-v1's five families, `solar.spec.ts`,
  `solar-play.spec.ts`).
- `npm run e2e:keystone`: 38 passed.
- I didn't run the full `npm run e2e`, as instructed. The final phase runs it.

## 4. Human gates and stills
No gate of S1's own. For review:
- `npm run drive -- tests/drive/steps/v11-S1.ts --paradigm solar` writes `test-results/drive/v11-S1/`:
  - `sheet.png`: the contact sheet, one row per zoom (fit, 2×, 4×), three asteroids then three hive
    ships. Compare the blue rims with the red ones in each row: they should read as one line weight.
  - `01-fit.png`: the whole region at the fit. Watch Ossian's World, where three asteroids sit beside
    three hive ships.
  - `z<zoom>-<i>-<role>.png` and `-bare.png`: each crop with and without the outlines.
  - `measure.json` and `console.log`: the figures.
- **Before**, for comparison: `test-results/drive/v11-S1-before/` (same files). I made it by running
  the same steps with HEAD's `aura.ts`, plus the two hooks pasted in temporarily, then restoring the
  new file. To recreate it, do the same swap. Playwright's runs clear `test-results/`, so the full
  e2e may already have removed both folders. Re-run the drive for the after set.
- In the gallery (`npm run gallery`, or `test-results/gallery-v1/v1-asteroids-c0.png` and
  `v1-swarm-c0.png` after `gallery-v1`), the Asteroids and Threats cells draw the same 2 px rims.

## 5. Known limitations and open questions
- **The balance was judged by eye** between two measured ends (equal alpha, equal ΔE). If the user
  sees red or blue as heavier, tune `AURA_BALANCE` (and its 15 §8 rows) and re-run the drive.
- **Victory gold now has the full 2 px rim on asteroids too** (it was 0.3 px at the fit). Finished
  asteroids and platforms near the star read more clearly gold than before. Its balance is 1, and it
  wasn't tuned against the others. If it now reads too loud, that's one value.
- **A hive ship's spikes and legs still gather a little more glow** at 4× (4 px past the band against
  the asteroid's 0, and a 2.5 px band against 1.5). The silhouette is spikier, so the eight rim copies
  and the blur overlap along the thin parts. Fixing that means changing the hive's silhouette, which is
  the art effort's call.
- **`setZoom` and the spread argument are vestigial.** The art files still pass them. When the art
  effort next edits `asteroids.ts` and `swarm.ts`, they can drop them.
- The glow's breathing amplitude is the art's own (`setAlpha`). With a tighter blur the breath reads
  closer to the rim, but it isn't stronger.
