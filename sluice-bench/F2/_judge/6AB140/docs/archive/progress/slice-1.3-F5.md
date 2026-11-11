# Slice 1.3-F5: test gaps

**Status:** built 2026-10-27; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block F. Fixture data only (INV-18).
Tests and tests/README.md only; no app code changed.

## 1. What was built
- **A touch smoke test,** `tests/e2e/touch.spec.ts` (pod-sprint, Solar; both tests `@keystone`, ~5 s).
  Real touches go through the DevTools protocol (`page.context().newCDPSession(page)`,
  `Input.dispatchTouchEvent`). Playwright's `touchscreen` needs a context made with `hasTouch`, and an
  Electron window can't be given one. Chromium turns the protocol's touches into touch events and
  pointer events with `pointerType: 'touch'`, and the spec checks that it did. Covered:
  - a tap on a plate selects its object (the project's chooser shows);
  - a double tap on a plate enters it (`DOUBLE_TAP_MS`, `ChartApp.pressLabel`). The four protocol
    calls are sent together, because awaiting each one under load could put 350 ms between the taps;
  - a tap on the canvas over a homeworld selects it;
  - on an expanded plate, a long press on a row (`LONG_PRESS_MS`, `holoRows.ts`) lights the row and the
    hover ring, and letting go unlights it with nothing selected. A short tap on the row selects its
    object. The time from the touch's pointerdown to the row's `is-lit` is measured in the page and must
    be at least `LONG_PRESS_MS` (450, kept in step by hand: `holoRows.ts` pulls in renderer art). It's
    timed in the page rather than read soon after the touch, because under load that read could take
    longer than the press. Mutation check: with `LONG_PRESS_MS = 0` built in, the test failed
    (`Expected >= 450, Received 101`); it was restored and rebuilt afterwards. A touchscreen has no hover, so the plate is expanded by the mouse resting on its title,
    which lights no row (the spec checks that).
- **One shared `frames(page, n = 2)`** in `tests/e2e/launch.ts`. It resolves after `n` more
  `requestAnimationFrame`s. Every copy of a frame wait in e2e now uses it:
  - `solar-play.spec.ts`'s own `frames(n)`, removed;
  - the inline double-rAF waits in `solar.spec.ts` (VC-2 setup) and `density.spec.ts` (`seek`);
  - the in-page `drawn()` / `frame()` loops in `board.spec.ts` (finding the move) and
    `solar-dense.spec.ts` ("a seek while a guest waits"). These are now node-side loops: seek,
    `frames`, read.

  Per-frame samplers (one rAF per iteration inside a single `page.evaluate`: perf, review-scenes,
  slice3a, the solar-play belt, the board path, the solar-dense glide) aren't waits. They stay as they
  are. The drive steps (`tests/drive/steps/*.ts`) have their own `frame()` copies. They're outside
  e2e and untouched.
- **A real wait in `board.spec.ts`.** The path is still sampled in the page on every frame, from play
  until the body arrives, but the bound is now the chart's own clock (`session().x <
  startMs + 8_000` at 1×, or play stopping), not 8 s of wall time. A 60 s wall-clock backstop, which only
  a stalled clock reaches, throws `the playhead stalled at X ms (wanted Y)` instead of a bare test timeout
  (review).
- **`activity.spec.ts`, pictures 401/404, de-flaked.** The cause is a fixed-size window, not slowness.
  The panel's Recent list holds only the last 50 calls (`RECENT_MAX`, `shared/activity.ts`). I probed
  the fake log and the panel on sprint-mechanics with temporary specs (since deleted). There are 63
  calls in all, and the picture calls are numbers 15–22. When the test read the list at the end, the
  failed picture rows sat at **rows 40–47 of 50**. Three more calls after them would start pushing them
  out, and ten would push them all out. Any change in call order or count (a busier run's interleaving,
  or a future extra call) makes `li.is-failed` vanish, and the expect times out. The test now opens the
  panel right after connecting, keeps it open through the load, and records with a `MutationObserver`
  that a "Fetching pictures" row showed in Recent as failed. It also checks once right after `observe`,
  so a row already there counts (review). It then waits on that flag, so it no
  longer depends on what the window holds at the end. The panel stays open (only Esc, × or the button
  close it), so the earlier `.activity-button` click is replaced by a visibility check. The rest of the
  test is unchanged.
- **`solar-dense.spec.ts`, "ships and stations point the way they travel", made load-proof.** The
  cause: the chart's clock advances at most 100 ms a frame (`ChartApp.ts`, the clamp), so a loaded
  machine plays less round, in fewer and longer frames. The old fixed window was 160 samples 60 ms
  apart in wall time, and it judged fewer moves the busier the machine (14 in the failing run). It now
  samples in the page on drawn frames and judges a step every 120 ms of **playhead** (60 ms of wall at
  2×). It plays until 30 decisive moves have been judged or the round ends, with a 90 s wall cap that
  only a stuck clock reaches; the test timeout is 120 s. The assertions are unchanged (> 20 moves, < 5 %
  wrong). The test logs `facing: N decisive steps judged, W wrong, to playhead X of 200440 ms`. Alone it
  reaches 30 by ~46–53 s of playhead, and under load by 49–83 s, so the 200 s round leaves plenty of
  room. A first try that played a fixed 24 s of playhead still came up short under load (16–20), since
  longer frames also make fewer judged steps per stretch. That's why it now plays until there's enough
  travel.

- **Two more load-sensitive tests (review follow-up):**
  - `slice2.spec.ts` AC-19 used to read `fx().active` after a fixed 100 ms wait, which under load could
    pass before the step's first frame drew the launch. It now polls until the launch is playing
    (`active > 0`, up to 10 s). It then seeks to 12 000 ms directly and asserts `{ active: 0, trails: 0 }`
    right after `frames(page)`. That's stricter than before: read after a fixed 100 ms, the launch could
    simply have finished on its own.
  - `activity.spec.ts`' keystone "one indicator" expected `Loading teams` on the team switch within 5 s.
    That label lasts one call (about 120 ms with the fake's delay), so a poll that first looked after the
    teams came back missed it. A `MutationObserver` now watches from before the click and records that
    the label showed, and the test waits on that flag. The assertion is the same, without the race.

## 2. Contracts changed
None. No app code, no 02/03 change. `tests/README.md` gained *Shared helpers*: `frames`, waiting under
load (bound by the playhead or the condition, never wall time; how to prove a de-flake), and how
touch is sent. It also gained a touch row in *Which specs cover what*, and a note on the `activity` row
about Recent's 50-call window.

## 3. Checks
- `npm run typecheck`: pass. `npm run lint`: pass. `npm test`: 75 files, 1091 tests pass.
- Mapped specs, alone (`npm run e2e:spec -- touch activity board solar-play solar-dense density solar`):
  **50 passed** (4.7 min).
- `npm run e2e:keystone`: **41 passed** (47.7 s; it was 39, plus the two touch tests).
- **Under load** (built once, then `npx playwright test --grep @keystone` running alongside, 8 Electron
  apps in all):
  - `activity -g "answer 401"`, `--repeat-each=3`: 3/3 (twice, in separate runs). Before the fix, with
    a probe, the failed rows sat at 40–47 of 50 every time.
  - `solar-dense -g "point the way"`, `--repeat-each=3`: with the final version, 3/3 (30, 30, 31 judged,
    0 wrong). The first, playhead-span version failed 3/3 here (16, 19, 20).
  - `board -g "state change travels"`, `--repeat-each=3`: 3/3 (twice).
  - `touch`, `--repeat-each=3`: 6/6. Before the double tap was pipelined, it failed once inside the
    loaded keystone run (the pod never entered).
  - `solar-play -g "strike run"`, `--repeat-each=3`: 6/6.
- The keystone runs used as load had their own failures under the doubled load: `activity`'s "one
  indicator" (`Loading teams` not seen within 5 s) and `slice2`'s AC-19 (`fx().active` 0 after a fixed
  100 ms wait). Both pass in the plain keystone run. They're outside F5 (see 5).
- **Review round:** typecheck and lint pass. Mapped specs (`touch activity board slice2 solar-play
  solar-dense density solar`): **60 passed** (5.0 min). `npm run e2e:keystone`: **41 passed** (52.4 s).
  Under load (keystone running alongside, `--repeat-each=3`): slice2 AC-19 3/3, activity "one indicator"
  3/3, pictures 401 3/3 and 404 3/3, board 3/3, touch 6/6. The keystone run used as load: 41/41.
- Full `npm run e2e`: not run (the block's final phase runs it).

## 4. Human gates
None.

## 5. Known limitations and open questions
- `slice2.spec.ts`' next test ("stepping shows the beat's state…") still reads `fx().active` after a fixed
  100 ms wait, the same pattern as AC-19. It wasn't asked for and hasn't failed; it's a candidate. The
  same goes for `activity.spec.ts`' bead check (`toHaveCount(0, { timeout: 8000 })`).
- `solar-dense`'s facing test now takes ~25–50 s (it was ~16 s), because it plays until it has 30
  judged moves.
- Under load, the facing check judges fewer moves per stretch of playhead (longer frames make longer
  steps, and more steps fall outside the "decisive" window). That's why the bound is a count and not a
  span.
- The drive steps' own `frame()` copies (`solar-station`, `solar-merge`, `solar-strike`, `v12-*`) were
  left alone. They aren't e2e, and the shared helper lives in the e2e module.
- The canvas tap aims at a homeworld's drawn centre. If its plate ever sits over that spot, the tap
  goes through the label's press path, not the stage's hit test. Either way it selects, but the spec
  doesn't say which path ran.
