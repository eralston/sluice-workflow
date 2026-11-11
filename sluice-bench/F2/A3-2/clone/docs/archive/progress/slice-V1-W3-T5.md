# Slice V1-W3-T5: Flake and density guard

Built 2026-10-10. This is an extra W3 task, not listed in 17. It fixes the older flake in
`board.spec.ts` "a state change travels along the ring", which the W2 gate carried forward
([slice-V1-W2-T7](slice-V1-W2-T7.md), Wave gate). Only `tests/e2e/board.spec.ts` changed. No app
code, doc contract or golden was touched.

## 1. What was built
The flake had three causes. Each one is fixed without weakening what the test proves.
- **The plan read stale places.** The search for a rightward move waited a fixed 30 ms after each
  seek. Under 8-worker load that wait could pass without a frame, so `targetNodes()` still held the
  previous seek's places. The test then planned from a `from` the body never returns to. That showed
  up as the poll timing out about 715 px away, or as a different "move" whose start was off the ring.
  The search now waits for two `requestAnimationFrame`s after each seek, so a frame has always drawn
  it. Under load, all 64 stress plans picked the same move (`…:101|…:301` at 14112 ms).
- **The travel started from where the body was last drawn.** The fixed 200 ms wait after the seek
  to `startMs - 400` was replaced by an `expect.poll` (10 s) that waits until the drawn body
  (`liveNodes`) is within 1 px of `from`. `OrbitTravel` starts from the drawn position, so a stale
  draw had folded an offset into the start of the path. That offset produced the k of about
  0.96–0.97 at the start.
- **Too few samples.** The path used to be sampled with one `page.evaluate` round trip per 40 ms
  over 60 samples, and under load those round trips could miss the move. It's now sampled inside the
  page on every frame, from `play()` until the body is within 0.5 px of `to`, or for at most 8 s.
- **The inner bound is now relative to the chord.** On this move the chord's midpoint has
  k ≈ 0.990. The old fixed `k > 0.97` therefore sat *below the chord*, so it could not tell travel
  along the ring from a straight cut across. The bound is now halfway between the ring (k = 1) and
  the chord's deepest point, about 0.995 here. A guard asserts the chord sags below 0.995, so the
  check always means something. The real path stays at k ≥ 0.9988.
  - **Relaxed at the start, as asked.** The start of the path no longer needs any allowance: it now
    begins at the polled `from`, which is on the ring to within 1 px (≤ 0.0004 in k). So the strict
    middle bound holds over the whole path.
- **New check: it gets there.** The last sample is at least 75% of the way from `from.x` to `to.x`.
  This proves the sampling window covered the travel.
- **Unchanged:** the rightward-move search criteria, the x-monotonic check (−5 px), the outer bound
  (next ring + 0.05, the bow), and the lane-heads test.

## 2. Contracts changed
None. This change is to the test only, and it uses existing hooks (`beatTimes`, `setScheduleMs`,
`targetNodes`, `liveNodes`, `viewGraph`, `play`, `pause`, `setRate`).

## 3. Check results
- **Required check:** `board.spec.ts --repeat-each=5`, run under the build lock after a fresh
  `electron-vite build`, passed 10 of 10 (5 runs of each of the two tests). It was run twice, with
  the same result both times. It was re-run on 2026-10-12 against the current tree (other W3 tasks
  in flight), after a fresh build under the lock, and passed 10 of 10 again.
- **Stress, for my own confidence** (this load had reproduced the flake): with `E2E_WORKERS=8`,
  "travels along the ring" `--repeat-each=16` passed 16 of 16. The full spec `--repeat-each=24`,
  run twice, passed 48 of 48 both times. Before the frame waits in the plan, the same 16-run stress
  failed 2 to 3 of 16.
- `npm run typecheck`: clean (node, web and e2e). `eslint tests/e2e/board.spec.ts`: clean.
- `git status tests/golden`: only the untracked files from earlier waves (`solar.*`,
  `v1-awards.*`, `v1-ingest.test.ts`). None are from this task.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- The test still depends on the fixture having one long rightward move on a single ring. If the
  fixtures change so the chosen move is short, the chord guard (`< 0.995`) fails loudly rather than
  passing vacuously.
- The same fixed-wait-after-seek pattern (`setTimeout` 30 ms, `waitForTimeout(200)`) may be in
  other specs. A shared `frames(n)` helper in `tests/e2e/launch.ts` would let them use frame waits
  too. That file isn't mine in W3, so this is a follow-up for W4-T2.
- "Density guard" in the task title: nothing beyond this spec was in scope. The density follow-ups
  listed for W4-T2 (formations vs orbit lines, threat and station footprints) are still open.

## Wave gate (W3)
Run on 2026-10-12, after W3-T1 through W3-T5 had landed.
- **Base**: `npm run typecheck` (node, web and e2e) and `npm run lint` are clean. `npm test`
  passes 49 files and 762 tests (758 before the gate, plus the gate's four probes).
- **Keystone**: inside the build lock, `electron-vite build` and `playwright test --grep @keystone`
  pass 38 of 38.
- **Full e2e** (`npm run e2e`, run before and after the fixes): parallel 121 passed, alone 21
  passed, exit 0. The one ✘ is `solar.spec.ts:181` "VC-3 in a solar scene", which is marked
  `test.fail()` and counts as an expected failure. **VC-3 is still not met** (see Carried forward).
- **Goldens**: `git status tests/golden` shows only the untracked v1 files from earlier waves
  (`solar.*`, `v1-awards.*`, `v1-ingest.test.ts`). No v0 golden is modified, and the v1 goldens
  didn't change at the gate.
- **Fixes at the gate** (minor, from the task reports; all in files this wave changed):
  - `engine/facts.ts` `seatAtEvent`: a reseat to the frontier (`[null]`) now counts as a seat.
    Before, `?? seat` kept the seat that had just let go. Probe: `facts.test.ts` "the seat at an
    event".
  - `engine/achievements.ts`:
    - `arrivalsAt` keeps only the last climb onto a rung in each millisecond. Probe: three climbs
      in one millisecond, where the hat trick's third landing is the last close.
    - Clear skies falls back to the instant's last board event when no event at `from` moved one
      of the seat's pieces, so it is no longer dated at the last landing. No probe was added.
  - `scene/project/solar.ts` `boardFacts`: a linked step is read by its final parent, the same
    rule `linkedPieces` and `placeFacilities` use. Probe: `solarSeek.test.ts`, a step moved onto
    a dropped piece makes no facility.
  - `chart/megaLabels.ts`:
    - A mouse press is cleared on `pointerleave` and on an up over a row's link (a capture
      listener), so a stale `down` can't select later.
    - `sub.key` is read directly, without the cast.
    - There is no DOM test environment, so this has no unit probe.
  - `settings/store.ts`: a `flush(api)` helper is shared by `patchSettings` and `loadSettings`.
    When a read succeeds, it now sends the queued changes, and `persisted` is true only once
    nothing is queued. The `userSettings.test.ts` case now expects the queued patch in the file
    right after the read.
  - `settings/views.ts`: if `chooseView` fails, `devView` follows the paradigm the app is now in,
    so a v0 view that boot already reached keeps the cog.
  - Fixture comments (`todo-week.ts`, `crm-quarter.ts`) no longer say the viewer is seated first.
  - `packs.test.ts` now locks in the CRM approver wording ("approved by Discount Desk", and
    "Caspian Pine and Discount Desk").
  - In the W3-T1 handoff, the §5 simulation table has a baseline row (21 overlaps), and its first
    row is relabelled.
- **Carried forward**:
  - **Blocking, owned by W4-T2: VC-3 in the solar region.** HG-V3 stays gated. The cause is in
    W2-T2's `scenes/placement.ts` and `placeFormation.ts`, and W0-T1's `FLOOR_PX.threat` and
    `.facility`. No W3 task broke it, so the gate didn't touch it. Apply the recipe in
    [slice-V1-W3-T1](slice-V1-W3-T1.md) §5. The floors are an art call, so record the assumption.
    Then remove `test.fail()` at `solar.spec.ts:189` and the clear-seat search in the mega-label
    test, and re-run Spec `solar`, the solar-episode drive and Full. W4-T2 has to start while
    W3-T1 is partial.
  - `settings/tabs/Theme.tsx` (W2-T6's file): the developer view radios switch on arrow keys.
    Apply on an explicit action, such as buttons with `aria-pressed` like the v0 ParadigmSwitch.
  - `board.spec.ts`: cap the in-page sampling loop at the beat's end, or stop it when the body
    stops moving, instead of a flat 8 s. Add a shared `frames(n)` helper in `launch.ts` (W4-T2).
  - Docs (W4-T3):
    - Record `v1/lines.ts` and the W3-T1 renderer seams in 17, 14 and 03.
    - Replace the "V1, Solar" row in `handoff.md` with the full v1 status and the HG list.
    - Record the A6 thresholds of the demo packs in 18 §5, and where they live in 14 §1.2.
    - Drop `SolarSource.fallback` from 14 §2.5, and the `ROW_BUDGET` location from 14 §2.9.
    - Note the "final parent" rule for linked steps in 03 and 14.
