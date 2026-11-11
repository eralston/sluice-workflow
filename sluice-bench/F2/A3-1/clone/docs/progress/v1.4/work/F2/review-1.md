# Review F2, round 1 · Verdict: fix needed (re-plan: no packet)
1. Blocker: nothing for F2 was built. The working tree is identical to HEAD (61e4958) apart from this folder, so none of F2's acceptance is met.
   Evidence: `git diff HEAD --name-only | wc -l` gives 0; the only untracked files are `build-1.json` and `probe-engine.diff`. `stationJumpIn.ts:26,35` still holds the summoner (`crewHoldMs(m)`) and flies it back (`backS: 0.8`); `pace.ts:514` still has `facility.enter` as tell 300, gather 715, act 1200, land 600; `scripts/pacing-built.ts` has no F2 entry; nothing changed in 15 §7, 13 §6, 05 §8 or the schedule goldens.
   Acceptance line or rule: every F2 line (the gallery jump-in cell in full and reduced motion; the unit test for no hold and act within 50 ms of the blip; 15 §7 row and docTables; goldens updated and named; the ledger showing the saving per pod).
2. Blocker: the item has no contract. `packet.md` and `plan-1.json` are missing, so there is no Acceptance copy, Approach, or list of goldens to judge a build against.
   Evidence: `ls docs/progress/v1.4/work/F2/packet.md` reports "No such file or directory". The builder stopped for this reason (build-1.json, verdict `blocked`).
   Acceptance line or rule: the item contract (a builder works from the packet's Approach). The planner needs to run for F2.
3. Minor: build-1.json says `probe-engine.diff` calls a `heldSummon` helper that "is not in the tree". That is only half true. The diff defines `heldSummon` itself, in its `scripts/pacing-ledger.ts` hunk, and `git apply --check` applies it cleanly to HEAD. It isn't applied, though, and it covers only the engine and ledger side: `pace.ts` phases gather 715 + act 1200 with `passes: true`, `passTimes`, `releaseOf` and `durMs` changes in `maneuvers.ts`, and `PlannedManeuver.passes`. There's nothing for the renderer (`stationJumpIn.ts`, `commands.ts` pursue pass-through), the docs, the goldens or tests.
   Evidence: `grep "^diff --git" probe-engine.diff` lists 6 files (pacing-built, pacing-candidates, pacing-ledger, contracts/maneuver, engine/maneuvers, engine/pace). `git apply --check` exits 0.
   Acceptance line or rule: honest reporting. The planner can use this probe as input; it isn't a build.

Not findings (checked, and fine as they are):
- The baseline is green. `npm run typecheck` is clean. `npm test` failed one test on its first run, which took 272 s while the machine was loaded. A rerun passed 109 files and 1719 tests in 89 s, so I read the failure as a timing flake. The tree is HEAD, so it isn't F2's.
- No real data, no PAT and no ADO writes: nothing changed.
- I didn't run the gallery or the e2e specs. Nothing changed, so they would only re-check HEAD and couldn't show F2's acceptance.
