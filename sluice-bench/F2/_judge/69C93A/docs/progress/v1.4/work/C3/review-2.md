# Review C3, round 2 · Verdict: fix needed

Judged with HG-C (2026-11-01, "HG-C, C3") applied. Desktop must look the same, with the switch off there. Phone and tablet
ship the bake on, because the look gate still fails. Most of it holds. The desktop and laptop-battery JSONs ship
`auraBake: false`, and tablet and phone ship `true`. With the switch off, the code takes the old live path. The goldens and
gallery pass. The cut still halves Pulsar's 4× p95 in one run. Review-1's Minors 2 to 4 are fixed, and HG-C settles its
Blocker. One problem remains: in the busy state this suite is usually in, the hard check never runs.

1. Major: the hard cuts test sits in a `serial` describe after the absolute-budget test. That test fails whenever its soft lines are red, which the docs call the known state. Playwright then skips the cuts test, so the acceptance's hard check isn't run.
   Evidence: `tests/e2e/perf.spec.ts:93` `test.describe.configure({ mode: 'serial' })` (from before C3). The new test is at
   `:182`, after the absolute test at `:133`. My run of `npm run e2e:spec -- perf profile gallery-v1 slice3b` (this tree,
   machine under load) gave "1 failed [alone] perf.spec.ts:133 ... 1 did not run, 25 passed". The soft lines were red (1× p95
   50.7, 4× 100.1, seek 447.5), the cuts test did not run, and `perf-pulsar-report.json` had no `cuts` key. Run on its own
   (`playwright test perf -g "the cuts lower"`), the cuts test passes: 4× off 33.3 against on 16.8, a 0.495 gain. At 1× off was
   17.1, inside 1.25 vsyncs, so the skip clause applied. 09 §7 calls the absolute lines "known red". So under `npm run e2e`,
   the hard check is skipped whenever the absolute budget is missed, which is exactly when it matters.
   Acceptance line or rule: "`perf.spec.ts` measures Pulsar playing at 1× and 4× with the cuts off and on in the same run ...
   (a hard check)". Fix: make the cuts test independent of the soft test. Either put it first in the describe (it calls
   `ensurePulsar()` already, so its order doesn't matter), or give it its own describe or app. Then a red soft line can't skip
   it. Keep the `prior` merge into `perf-pulsar-report.json` working whichever test runs first.

2. Nit: the profile note's last section says "Options 1 to 4 above were reduced to one", but no numbered options are left above it.
   The 1× as-is row (17.8 ms) and the cuts table's 1× off (33.4 ms) come from different runs, and the note doesn't label them.
   Evidence: `profile-note.md`, "Options for HG-C (settled 2026-11-01)" and the two tables.

3. Nit: `STAR_CHART_TEST_DPR` (new, `tests/e2e/launch.ts:6`) isn't mentioned in `tests/README.md` beside `STAR_CHART_TEST_SHOW`.
   Only the profile note names it.

4. Nit (carried from review-1 #5): `build()` destroys the live group without its `AlphaFilter` on a flip to baked.

Not findings (checked; the fixer shouldn't touch these):
- Desktop look unchanged. The live path is the start commit's: one group with `AlphaFilter`, `eraseGlow` as its only
  eraser, keyline alpha `KEYLINE_ALPHA` on the keyline, and blur strength `reach` when not baked. `setAlpha(1)` and
  `show('all')` in `build()` set the same values the old constructor left by default. `rebake` is a no-op when live. The only
  new per-frame work when live is copying `lastM`. `e2e:spec gallery-v1 slice3b` (with perf and profile) gave 25 passed,
  goldens unmoved. `solar solar-dense` gave 37 passed.
- Profiles: `auraBake` is false in `desktop.json` and `laptop-battery.json`, and true in `tablet.json` and `phone.json`. 15 §11's
  desktop row is "off", and the deltas row is off/on/on in the column order laptop-battery/tablet/phone. `profile.test.ts`
  expects `auraBake: false`.
- `profile.spec` passed, including the Pulsar flip case (live and baked agree within 0.5, and the scene draws after the pod
  reopens) and the phone profile e2e with the bake on.
- 15 §10's "Cut gain floor" cites `../../../tests/e2e/perf.spec.ts` CUT_GAIN_MIN (review-1 #3 fixed). 15 §11's Aura bake row
  gives the measured gate numbers (review-1 #2 fixed). The profile note carries the Pulsar and DPR 2 runs (review-1 #4 fixed).
- 09 §7 and the profile note record the HG-C fallback and the gate failure honestly, and the 27 Decisions row matches.
- Gate re-run: typecheck and lint clean, unit tests 99 files and 1462 tests green. `e2e:keystone` gave 42 passed and 1
  failed (`devlog.spec.ts:16`). That spec passed 2/2 on re-run, it doesn't touch the aura or the profile, and it's flaky
  under load.
- `src/shared/` stays pure (a zod key only). Pixi v8 APIs only. No real data.
