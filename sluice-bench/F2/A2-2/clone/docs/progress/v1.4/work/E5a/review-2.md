# Review E5a, round 2 · Verdict: pass

All six round-1 findings are fixed or acknowledged. The close test can now fail: it checks for missing closes against the undirected plan. The monotony test counts progress beams. The stills show the forms. The doc promises for E5b and the stale comments are gone. What's left is two Minors and a Nit, none against acceptance.

1. Minor: the third gate still, `work/E5/e5a-climax-merge.png`, isn't known to be a day's climax. The step picks "the scene's longest beat", and that heuristic misses on the scene where it can be checked.
   Evidence:
   - Re-running `npm run drive -- tests/drive/steps/e5-director.ts --paradigm solar` picks beat 186: 24 Sep 16:57, len 13020, the PR #20369 merge.
   - In the director's own Quasar schedule (`work/E5a/review-2-probe3.ts`), that merge is `attachment.merge/short` with 3 people and `climax=false`. 24 Sep's climax is the 20:15 `threat.accomplish/beamed`, with 4 people.
   - The ledger's longest Quasar beat (15 Sep 16:37, 15.3 s) holds no climax at all (`review-2-probe.ts`: `longestBeat=15340ms climax=false`).
   - The app's scene differs from the ledger's (carried to the block audit), so what the app plays at 16:57 can't be settled from here.
   - The step's header also calls the pick "the longest close", but it's a merge, and the shot is named `climax-close` while the file is `e5a-climax-merge.png`.

   The fixer recorded the heuristic under limitations. For the gate, the block note should present this still as "a full merge", not as the day's climax. Round 1's `work/E5a/review-1-beamed-close-act.png` (15 Sep 16:31, beamed strike) is 15 Sep's climax in the director's schedule, and a better climax still.
   Acceptance line or rule: packet Checks, "Stills for the gate … a day's climax".

2. Minor: the climax unit test doesn't fully check what the packet asks.
   - It never rejects a progress-beam climax: it checks only that the variant isn't `*short`.
   - It never checks "each day that has a moment has a climax" independently. It compares the count of days that have a climax play with `dir.climaxes.size`, so a day the director skipped would pass.

   The code itself is right. A probe over all six pods found that every day with a moment has exactly one climax (3/3, 8/8, 10/10, 8/8, 5/5, 6/6), with no progress or short climaxes. So only the test is weak.
   Evidence: `tests/unit/director.test.ts:55-64`; `work/E5a/review-2-probe.ts` output (`missing=- multi=0 progClimax=0 shortClimax=0` on every pod).
   Acceptance line or rule: acceptance line 1 ("each day has exactly one full-form climax"); packet Checks.

3. Nit: a comment in the monotony test is stale. Progress beams are now in the moment list, so the line "only a progress beam between them … could explain it" no longer describes the check.
   Evidence: `tests/unit/director.test.ts:74`.

Not findings (checked and fine):
- **Round-1 Blocker (fixed).** The close test now builds the undirected closes (`direct: false`) and requires each one in the directed plan under `eventKey|id`. The variant must be none, `beamed`, `arc` or `*short`, and the set must be non-empty. A dropped close or one turned into a progress beam would fail it. (`director.test.ts:40-53`)
- **Round-1 monotony Minor (fixed).** Progress beams now count as played moments. Pulsar does hold one same-day full merge, progress, full merge run (`fullProgFull=1`), and the test passes on it.
- **Docs and comments (fixed).**
  - 05:715, 13:692 and 15:825 now say a Task update doesn't trigger the progress beam, with no promise for E5b.
  - The `pace.ts:583` and `progressBeam.ts` comments are updated. In `src/`, the fixer changed comments only.
- **Stills.** `e5a-progress-act.png` shows Ulla Kowalczyk's beam at Ulla Prime with "PR #20360 … — Merged". `e5a-short-link-echo.png` shows the short Power link with its crew named (KJ, EW, LA). The re-run of the drive step reproduces both picks.
- **Checks.**
  - `npm run -s typecheck` and `npm run -s lint`: clean.
  - The mapped units plus `tests/golden`: 23 files, 364 tests passed.
  - The full `npm test`: 104 files, 1548 tests passed.
  - `npm run e2e:keystone`: 43 passed.
  - No existing golden moved (`git diff --stat 390d2cd -- tests/golden` is empty).
- **No new e2e run.** Round 1's e2e result (`solar-dense gallery-assets`, including the History-agreement case) stands: the source changes since then are comments only.
- **Already with the orchestrator.** Round 1's observation, that the ledger's Quasar schedule isn't the app's, is carried to block E's audit in 27's log.
