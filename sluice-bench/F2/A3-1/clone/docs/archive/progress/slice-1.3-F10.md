# Slice 1.3-F10: frame time on Pulsar Pod

**Status:** built 2026-10-27; no human gate (HG-F reads the numbers below). Plan: [23-v1.3.md](../23-v1.3.md) Block F.
Fixture data only (INV-18).

## 1. What was built
- **Measured Pulsar Pod** (Halcyon Reach, Sprint 41, 20 captains, `STAR_CHART_PARADIGM: ''`) in
  `tests/e2e/perf.spec.ts`, a new `Pulsar Pod` describe next to the old dense-scene test. Each state is
  bounded by frames drawn or by the playhead (`session().x`), never by wall time: rest = 300 frames;
  play 1× = 10 s of episode, 4× = 40 s of episode (a 4000-frame cap guards a stalled clock); seek = 8 seeks
  across the episode, each timed to land and draw two frames. It writes
  `test-results/perf-pulsar-report.json`. Asserts (soft): p95 < 25 ms for rest and both plays; a seek's
  worst < 250 ms (a seek is one long frame, so it has its own bound).
- **Fixed the spec's own interference:** the file-level `beforeAll` launched one app for the whole file, which sat idle beside the new describe's
  app, so the new describe ran beside the old test's idle app and every number was doubled up (rest p95 33 ms).
  Each test now owns its app. The old test's local sampler is renamed `frameTimes` (the shared `frames` is
  imported).
- **A seek onto a dense pod was slow: 0.4-0.5 s each, measured.** The CPU profile put 1.15 s of 2.2 s
  over four seeks in `sdRock` (`chart/art/asteroids.ts`): every `AsteroidView` normalizes its shape by
  marching ~46k distance samples (`makeGeo`) and re-does 96 more rim searches per state change
  (`silhouette`). Three changes, none of which changes what is drawn:
  - `sdRock` takes no temporaries and uses `Math.sqrt` of the squared sum instead of `Math.hypot`
    (about 30x less self time; the difference is 1 ulp, and all goldens and pixel checks are unmoved).
    `toBody` had no other user and is gone.
  - `makeGeo` is memoised by `seed|material` (256 rocks, oldest out); a `Geo` is read-only after it is built.
  - `silhouette` is memoised per rock and cut set (a state change or a light turn no longer re-searches).
- **The F6 `placeStations` key is cheap, so left alone.** Instrumented once (then reverted): building the
  plan's JSON key is 24 KB of text on Pulsar, under the timer's 0.1 ms resolution; 35 calls (scene entry
  plus 15 s of play) summed to 0.4 ms in `planSig` and `stationInputs` together, max 0.2 ms for one call.
  Far below the 1 ms threshold.

## 2. Contracts changed
None. 09 §7 (Performance) gets the Pulsar numbers' summary; 15 §9-§10 have no frame-time row (the budget
lives in 09 and in the perf spec), so no table changed.

## 3. Checks
Machine: the user's Mac, a display that runs at 120 Hz (frames land on multiples of 8.3 ms: 16.7, 25, 33.3),
load average 3.6-7 throughout (Steam and a video-call daemon running; another agent running tests), so these
are loaded-machine numbers.

| State (Pulsar Pod) | Before p50 / p95 / max | After p50 / p95 / max |
|---|---|---|
| At rest (300 frames) | 16.7 / 17.3 / 17.6 | 16.6 / 17.0 / 25-26 |
| Playing 1× (10 s of episode) | 16.7 / 33.4 / 50 | 16.7 / 25.2-25.3 / 59-67 |
| Playing 4× (40 s of episode) | 16.9 / 33.9 / 50 | 16.7 / 33.0-33.2 / 50-52 |
| Seek (8 seeks, to land and draw 2 frames) | 424 / 538 / 538 | 103 / 169-171 / 169-171 |

The old dense-scene test (Nimbus Deck, Billing statement redesign) is unchanged: p95 17.3 / 17.5 ms.
(A first run, with two apps open at once, showed rest p95 33 ms; that was the spec's fault, fixed above. A
Comet Pod control played 900 frames with 0-1 frames over 25 ms; Pulsar 42-88 of 900.)

- **Result: rest and seek meet the budget; playing does not, on this machine.** 1× is at the edge (25.2 against
  < 25), 4× is two vsyncs late for about one frame in twenty. The `perf` spec's soft asserts for those two states
  fail here, honestly.
- **Where playing's time goes (CPU profile, tracing):** the main thread is not the limit. `BeginMainFrame` is
  p50 5.2, p95 6.6, p99 10.4 ms; the busy stretches over 12 ms number six in 900 frames; the GPU's WebGL tasks
  are p99 2.2 ms, max 6 ms. The slow frames come in clusters (a busy beat, about 2 s) and in the
  buffer swap and compositor (`SwapBuffers` p50 11 ms, 20 of 900 over 16 ms), not in a function that can be
  made cheaper. The self-time list is flat Pixi internals (`position`, `syncShader`, `packAttributes`,
  `collectRenderablesSimple`, `updateTransformAndChildren`, 20-30 ms each over 900 frames). Painting off
  made no clear difference (42-50 slow frames against 54-65).
- **What differs from Comet:** the DOM. Pulsar's page holds 1770 elements, 303 of them labels, 88 with a
  filter, will-change or backdrop-filter, against Comet's 252, 22 and 13. That is the likeliest cost of the
  compositor stalls, and not a clear win to take here: see Known limitations.
- `npm test` 75 files / 1094 tests pass; goldens unmoved. `npm run typecheck` and `npm run lint` clean.
- `npm run e2e:spec -- density solar`: 32 passed, 1 failed (`solar-dense` "a plate unfurls from its ship
  after a glance", 22 A8, `toEqual`) in a run beside other load; `solar-dense` alone then passed 16/16.
  `npm run e2e:keystone`: 41 passed. `perf`: the Pulsar test fails its soft asserts for 1× and 4× as above
  (the old dense-scene test passes).

## 4. Human gates
HG-F reads the frame-time numbers in section 3. No stills.

## 5. Known limitations and open questions
- **Playing Pulsar Pod misses 25 ms p95 on this loaded machine** (1×: 25.2; 4×: 33). Not fixed: no clear win
  in the app's own code. A candidate for a later pass, if the user's own machine shows it: thin the DOM label
  layer on a dense pod (303 labels, 88 filtered; hide or skip off-tier labels' filters). It changes what is
  composited and wants the user's eye, so it was not done under "without changing what's drawn". Re-measure
  on a quiet machine; if 1× is under 25 ms there, the 4× state is the one to watch.
- The 25 ms threshold sits on a vsync multiple at 120 Hz (25.0 is three vsyncs), so p95 flips between 17,
  25.x and 33 on a handful of late frames. A budget of "p95 at most 2 vsyncs of the display" would be steadier;
  not changed.
- The `solar-dense` unfurl test failed once under load and passed alone; it is not in code this item touched.

**Review follow-ups (2026-10-27, orchestrator):** the file-level serial mode was dropped, so a miss in the dense
test can't skip the Pulsar describe. Two comments were corrected (40 s at 4×; the budget lives in 09 §7, not 15). The 06 §8
Perf row was amended. 09 §7 records that the hidden harness runs at about 60 fps. The "Before" column was measured on the
fixed harness with the old `asteroids.ts`. **Open for the user at HG-F:** playing Pulsar misses p95 25 ms
(1×: 25.2, 4×: 33). The candidate fix is thinning the DOM label layer (303 labels, 88 filtered), which
changes what is composited. Separately, the budget could be stated in vsyncs (at most 2 of the display's).
