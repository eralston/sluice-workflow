# C3 profile note: Pulsar Pod's frame time

Fixture data only. Pulsar Pod (Halcyon Reach, Sprint 41), hidden window 1440x803, devicePixelRatio 1, vsync 16.7 ms, one machine,
variants compared in one run (`probe-gpu.ts`, run 2026-11-01 with `HIDE=1`; the hidden window is the e2e window, the shown one differs).
Counts are per frame, playing.

## Top costs
| Variant | p95 ms | draws | offscreen passes | program switches |
|---|---|---|---|---|
| as-is 4x | 33.4 (again 33.4) | 885 | 404 | 344 |
| as-is 1x | 17.8 (a separate run from the cuts table below) | 627 | 347 | 277 |
| paint off 4x | 33.2 | 885 | 400 | 341 |
| paint and twinkle off 4x | 33.3 | 885 | 400 | 341 |
| canvas hidden from the compositor 4x | 33.3 | 892 | 407 | 347 |
| draws into offscreen targets skipped 4x | 17.6 | | | |
| all draws skipped 4x (CPU floor) | 17.5 | | | |
| `auraBake` on, 4x | 17.6 | 184 | 8.5 | 64 |
| `auraBake` on, 1x | 17.6 | 117 | 4 | 40 |

- 79% of the draws land in offscreen targets, each 10x10 to 22x22 px: the cost is the number of passes, not pixels. Paint, twinkle
  and the compositor are not the cost. `gl.finish()` returns in about 0 ms.
- Who binds the passes (stacks, 357 binds a frame): `BlurFilter` 54%, `FilterSystem.push` for a filtered container 27%,
  `ColorMatrixFilter` 18%: the role outline (`art/aura.ts`) on about 32 live asteroids and hive ships (three filter chains each).

## The cut
`render.switches.auraBake`: an `outside` aura draws three cached sprites (glow, keyline, rim) instead of three live filter chains,
re-baked only on colour, flare or a >2% scale change, snapped to the screen's pixel grid and rasterised at the grid's phase. The
module subscribes to `onProfile` so a flip reaches every aura (chart, gallery, tests); `ChartApp.applyProfile` is untouched.

Same run, `perf.spec.ts` "the cuts lower p95", median of three alternating rounds of p95 (off then on):
| Rate | off | on | gain |
|---|---|---|---|
| 1x | 33.4 (33.4, 33.4, 33.4) | 17.6 (17.7, 17.6, 17.6) | 47% |
| 4x | 34.0 (34.0, 33.7, 34.1) | 17.6 (17.6, 17.6, 17.5) | 48% |
The hard floor (20%) passes. 17.6 ms is one vsync: the 2-vsync budget (35.4 ms) is met too, but the old 1-vsync CPU floor is reached.

## The look gate: found two causes, still fails, so `auraBake` ships on for `phone` and `tablet` only
Decided at HG-C (2026-11-01): find why the baked rim composites dimmer, fix it, ship on if the gates pass, else phone and tablet only.
What the pixels showed (one row across a rim on Harbor, live against baked against bare):
1. **The live rim ignores its container's alpha.** `rimTop.alpha` is 0.8 (`RIM_ALPHA`), but the live rim composites at full strength
   (a pixel past the keyline: live 207 blue against 175 expected at 0.8; baked at 0.8 gave 173). Pixi 8.21 does not apply a filtered
   container's alpha through its filter. The baked rim is a plain sprite and did apply it: a 20% dimmer rim. Fix: the baked rim's top is drawn at 1.
2. **The live glow is clipped to the keyline's box.** The live group's bounds are its copies' (the keyline's, RIM_PX + KEYLINE_PX out),
   so the glow shows no further out. The baked glow was padded out to GLOW_MAX_PX and lit the pixels past the keyline, which lowers
   the contrast of the rim against its neighbour. Fix: the layers' pad is RIM_PX + KEYLINE_PX.
3. Also fixed: a live to baked flip left the live glow and rim containers' own alpha on them, so alpha applied twice. `build()` now clears it.
After the fixes (Harbor, DPR 1): `c1-contrast` night-sky medians, live then baked, rim against backdrop: red 5.31 then 5.39, blue 5.33 then
6.05, gold 4.84 then 5.50 (before: baked 1.4 to 1.9 lower; now it is 0.1 to 0.7 higher, so no longer dim, but over the 0.1 limit for blue and
gold). Planet face blue: live 2.24, baked 1.52. `c3-aura-diff` still fails: Harbor worst p99 97 (limit 12), max 251 (limit 64); Pulsar worst p99 249, max 252.
What remains is the edge: the live rim's outer pixel is partly covered (coverage 0.6) and the baked one is wider by about a third of a
pixel at both edges (antialiased) or hard (antialias off, tried: p99 91, same failure). The live filter's edge depends on the filter's own
resolution, which the cached layer does not follow. Matching it pixel for pixel would mean re-implementing the live filter's sampling, which is not
a switch's job. So the gate cannot pass as written and the HG-C fallback applies: `auraBake` is on for `phone` and `tablet` (which already trade look for speed)
and off for `desktop` and `laptop-battery`. Perf is unchanged by the fixes: the cuts test, 3 alternating rounds, off 33.4 against on 17.5 (47% gain).
Not covered by the live look: devicePixelRatio 2 (run once, `STAR_CHART_TEST_DPR=2`, new launch option in `tests/e2e/launch.ts`): live itself changes with the ratio
(`c1-contrast` night sky live 4.78 / 4.92 / 4.62 at 2, against 5.31 / 5.33 / 4.84 at 1), baked does not (5.39 / 6.12 / 5.50); `c3-aura-diff` at 2: p99 187, max 220, three pieces per role at the fit.
The baked look is therefore resolution-independent and the live one is not; at ratio 2 the live rim is the dimmer.
Open question for the user: the live glow is invisible beyond 4 px (clipped, cause 2), which is probably not what 19 S1 meant by a glow reaching 4 to 12 px.
Left alone (C1's contrast was tuned on it).

## Options for HG-C (settled 2026-11-01)
The options were reduced to one by the decision: fix the compositing (done as far as it goes), then ship `phone` and `tablet` on. The look-changing cuts
(blur quality, a smaller glow) are not pursued, so they stay unmeasured by decision.
