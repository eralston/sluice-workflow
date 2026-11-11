# Packet F1: A bulk-PR run in the fixtures
Risk: medium (one shared demo fixture that a dozen tests and the e2e demo read; the engine is untouched) · Score: blast 1, verify 1, design 0, acceptance 1, track 1
Start commit: 8b3cadb

## Acceptance
- `npm run fixtures` writes the pod. Its halcyon golden is added, and the other pods' goldens are unchanged.
- The pod opens in `npm run dev` with 36 stations on its rings, with no layout overlap (VC-3 case).
- The ledger has the pod's row, measured before F2.

How to read it (decided here): **"its halcyon golden"** means two things. The Meteor scope's new entry in `sprint-pods.scenes.json`, which appears by itself. And a new Solar golden for this pod only, `halcyon-meteor.{plan,scenes}.json`, so F2 to F4 have a diff to read. **"36 stations"** are the run's 36. The pod has 37: the run's 36 plus the lone summon's station, which a single-summon case needs (a summon always brings a new station). The e2e checks that all 36 run repos are drawn and that the total is 37.

## Approach
1. **The pod is Meteor Pod** (`Halcyon Reach\Meteor Pod`, area 8005, a favorite). The name fits a shower of 36 in a minute. Comet is hand-written, and this pod is too: a `meteor(): PodBuild` in `pods.ts`, with a loop for the 36. Item ids are 12001+ (today's highest is 11227), PR ids 21001+ (today's highest is 20764), and the new Feature is **9018 'Platform upkeep'**. Meteor goes last everywhere (areas, repos, people, events, runs), so nothing that exists moves.
2. **Cast.** `cast.ts` is generated, so extend `scripts/find-cast.ts` and re-run it (`npx vite-node -c vitest.config.ts scripts/find-cast.ts`). After `const comet = …`, add `const meteor = pick(8, { hulls: true, colours: true }, <fresh have sets>)`. After `cometRepo`, add `const meteorRepos = pickRepos(37, new Set(), new Set())`. Emit `METEOR_CAST` after `PULSAR_CAST` (offset 49), and `METEOR_REPOS` after `PULSAR_REPOS`. The picks are greedy over a shared `used` set, so appending them leaves every existing line byte-identical. **Check that `git diff` on cast.ts only adds lines.** The roles go by index: [0] **A**, the run's captain; [1] **B**, the other captain; [2] **C**, the second author; [3..7] **D–H**, approvers who hold no items (like Quasar's manager). `METEOR_REPOS[0..35]` are the run's repos and `[36]` is the lone summon's.
3. **The timeline, exactly as given.** Times are UTC and the zone is America/Los_Angeles, so every time below falls on the same local date. Every item is made at planning (Fri 11 Sep, 18:00–18:20Z) in S41/Meteor. Stories and the Bug have parent 9018, and Tasks have their Story as parent. With no creations inside the round, there is no opening sweep. When a PR opens while its item is Active, add `column(item, 'Code Review')`, as `emitItem` does. Every PR gets `prStats` from `prStatsFor(<PrPlan-shaped object>, METEOR handles)`.
   - **A's run, S1 12001 'Move every service to the new base image'.** Tasks: 12002 'Write the upgrade script' and 12003 'Open the PRs'. S1 goes Ready Mon 14 17:00 and Active Tue 15 16:30. Task 12002 goes Active at 16:35 and Closed at 21:00. Task 12003 goes Active at 21:30 and Closed Wed 16 16:50.
     - **Opens:** PR `21001+i` into `METEOR_REPOS[i]`, i = 0..35, at Wed 16 17:00:00 + 1.5 s·i (the last is at 17:00:52.5). Each is titled `Move <repo> to the new base image`, links [12001], and is authored by A.
     - **Merges:** merge j = 0..35 completes PR index `p(j) = (7·j) mod 36`. That is a fixed permutation, so the merge order isn't the ring order (F3's proximity order then has work to do). Merges j = 0..17 are at Wed 16 18:00 + 17 min·j, and j = 18..35 are at Thu 17 16:30 + 17 min·(j−18).
     - **Approvers:** j 0–11 get [D,E,F]; 12–23 get [E,F,G,H]; 24–35 get [D,E,F,G,H]. The sets run 3→4→5 people, each overlaps the one before, and the union grows from 3 to 5.
     - **After:** S1 goes Resolved Thu 17 21:40, Ready to Accept Fri 18 16:30 and Closed Fri 18 17:00. That's an arc (B-12) onto the last link. There is no S1 work on Wed 16 after 16:50 and none on Thu before 21:40.
   - **Another captain inside the run (gather-back cases, F-Q1).** B's Story 12040 'Tidy the host dashboard' goes Active Wed 16 17:00:26. That is between opens 17 and 18, and it is 12040's only work that day. B's Bug 12041 'Dashboard totals lag after a refund' goes Resolved Thu 17 18:40, between merges j=25 (18:29) and j=26 (18:46). Its Task 12043 goes Active Tue 15 18:05 and Closed Thu 17 18:35. The rest of B's work: 12041 goes Active Tue 15 18:00 and Closed Fri 18 18:00. Task 12042 under 12040 goes Active Fri 18 17:00 and Closed Mon 21 17:30. 12040 goes Resolved Mon 21 18:00 and Closed Tue 22 17:30.
   - **F-Q5 station (a run link that is also an E6 volley).** C's Story 12050 'Cache the rate tables' goes Active Mon 14 17:30. Its Task 12051 goes Active Mon 14 17:35 and Closed Tue 15 19:00. PR **21040** goes into `METEOR_REPOS[35]` (the repo of run PR 21036, merged at j=5, Wed 19:25). It opens Wed 16 18:40, links [12050], and is completed by C at **the same instant, 19:25:00**, emitted just after A's merge, approvedBy [G]. 12050 goes Resolved Tue 22 18:00 and Closed Thu 24 17:00. That is more than 24 working hours after the merge, so there is no arc.
   - **A link the B-15 guard must refuse.** S2 12010 'Rotate the shared signing keys' goes Active Fri 18 19:30. Its Task 12011 'Rotate the staging keys' goes Active at 19:45. A opens PR 21041 into `METEOR_REPOS[3]` and PR 21042 into `[20]` on Fri 18 at 20:00 and 20:05. These go into existing stations, so they are not summons. Merges are Mon 21 at 17:00 (approvedBy [D,E]) and 17:40 (approvedBy [E,F]). **Task 12011 goes Closed Mon 21 17:20.** That is S2's only work that Monday. B-1 puts it in the first merge's beat, so the second merge's beat comes after a draft touching S2. S2 stays Active to the end, so there is no arc.
   - **Two merges more than a working day apart.** S3 12020 'Retire the legacy health checks' goes Active Tue 22 19:30. Its Task 12021 goes Active at 19:40. A opens PR 21043 into `METEOR_REPOS[11]` and PR 21044 into `[27]` on Tue 22 at 20:00 and 20:05. Merges are **Wed 23 18:00** (approvedBy [D,E,F]) and **Fri 25 18:00** (approvedBy [E,G]). 12021 goes Closed Fri 25 17:30, and S3 goes Resolved at 18:30 and Closed at 21:00. Every working day between A's separate merge groups (Fri 18, Tue 22, Thu 24) has a played Meteor beat. So no two groups can fuse across at most one day turn, and none can fall within 30 s in x.
   - **The same captain's single summon.** S4 12030 'Pin the base image in the new search service' goes Active Thu 24 18:30. Its Task 12031 goes Active at 18:35. PR **21045** goes into `METEOR_REPOS[36]` (the 37th station) on Thu 24 19:00. It **stays open** at the sprint's end: a merge would chain with Fri's. A has no other summon after Wed 16.
4. **The scenario** (`sprint-pods.ts`): add `.area(METEOR, 8005, { favorite: true })` after Pulsar, 9018 at the end of `features`, `METEOR_REPOS` and `METEOR_CAST` last in the repo and person loops, and `...meteor().events` after `pulsar().events`, before `runEvents()`. In `runs.ts`, add `METEOR_REPOS` at the end of `stationRuns`' list. The cycle's earlier entries keep their states.
5. **The ledger** (`scripts/pacing-ledger.ts`): add `extra?: true` to `PodSpec`. Append `{ scenario: halcyon, scenarioName: 'sprint-pods', sprint: 'Sprint 41', pick: { tail: 'Meteor Pod' }, extra: true }` after Harbor. `resolvePods(opts: { story?: boolean; all?: boolean })` leaves out `extra` pods unless `all`. `buildLedger` passes `all: true` to both of its calls. So the ledger's tables gain Meteor (7th, last), and C2's Candidates, the Built rows (frozen, against C2's per-pod estimates), the director golden and the engine tests over `resolvePods()` keep measuring the six they were set against. F2 to F4 opt in with `all: true`. That's a one-line comment on the option. Then regenerate with `npm run pacing -- --candidates`. Expect only `pacing-ledger.{md,json}` to change, and `pacing-built.json` and `pacing-candidates.json` to show no diff.
6. **03 is normative**: amend its `sprint-pods` fixture row (03-contracts.md:1813) in the same change, and say so in the build record. Also update the "four pods" header comments in `pods.ts`, `sprint-pods.ts`, `find-cast.ts` and `demo.spec.ts`, and tests/README.md:98 ("the four pods" → five).

## Files
- `fixtures/scenarios/halcyon/pods.ts` 1–60 (the pod constants, `comet()` as the model)
- `fixtures/scenarios/halcyon/gen.ts` 101 (`PrPlan`), 265–325 (`prStatsFor`, `emitItem`'s column rule)
- `fixtures/scenarios/halcyon/runs.ts` (all), `fixtures/scenarios/halcyon/cast.ts` (generated, all)
- `scripts/find-cast.ts` 70–169
- `fixtures/scenarios/sprint-pods.ts` (all)
- `scripts/pacing-ledger.ts` 100–106 (PODS), 187–222 (`resolvePods`), 306–311 (`buildLedger`)
- `tests/unit/pacing.test.ts` 27–30, 47–56; `tests/unit/halcyonCoverage.test.ts` 1–45, 163–170, 233–240
- `tests/golden/solar.test.ts` 1–90 (add a Meteor-only describe beside `ROUNDS`)
- `tests/e2e/demo.spec.ts` 1–100; `tests/e2e/solar.spec.ts` 76–100 (`hitProblems`), 143–150 (a describe's launch); `tests/e2e/density.spec.ts` 350–355 (resizing)
- `docs/03-contracts.md` 1813
- Probe (planner's, not shipped): `docs/progress/v1.4/work/F1/probe-rings.ts`. A 3-seat pod with 36 one-seat stations plans with 0 overlaps, a minimum centre gap of 1065 world units, and about 59 px at 1024×640 fit, against the 24 px the hit floor needs. Delete it when the build is done.

## Excerpts
- INV-18 (02 §1): "No real ADO data in fixtures, git, screenshots or prompts." Invent every name.
- B-1 (05): "Only the newest beat takes a new event: one at the same instant as its last, or one about a story already in it within `GROUP_WINDOW_MS` (30 min) of its first event. Work on another story in between starts a new beat … Under Solar it groups in story time."
- B-12 (05): "A story or bug's close joins the moment of the last merge of a PR that served it, at most `ARC_WORK_HOURS` (24) working hours before it (weekdays 07:00–19:00 in the viewer's zone …). The piece's work from the start of the merge's day to the end of the close's day … moves with it."
- B-13 (05): "A story or bug's work on one local day that no arc took (its Tasks' included …) gathers at its culmination, its last work event that day." This is why each case above keeps its touching work as the piece's only work that day.
- B-21's guard (05): "over the range, the other drafts touching any piece (a step standing for its parent) lie in one raw beat, at or after the latest member's beat touching it." E6's grouping (`volleysOf`, director.ts 340–353): per facility, same local day, within `VOLLEY_WINDOW_MS` (20 000 ms, 15 §10) in x of the head, guard holding.
- F3/F4 (27): a chain link is "within `CHAIN_WINDOW_MS` (30 s) in x of the link before, or on the same or the next working day"; "a chain's fuse may cross one day turn"; "abandoned PRs don't chain".
- Project notes: "Goldens: update only the golden your item meant to move; check its diff line by line." Fixture coverage is guarded by `halcyonCoverage.test.ts`.

## Checks
New tests:
- `halcyonCoverage.test.ts`: add `METEOR_CAST` to `everyone` (cast honesty), and `METEOR_REPOS` to the pipeline-line repo list (238). Add `describe('Meteor: the bulk-PR run (27 F1)')` over `halcyon.ops`, asserting each case in Approach 3 by its structure:
  - 36 opens by A within 60 s into 36 distinct repos, each the first PR into its repo in the scenario.
  - 18 merges on each of Wed 16 and Thu 17 (local), with the approver sets as given (sizes 3–5, each overlapping the last, union growing to D–H).
  - B's events strictly between opens 17/18 and merges j=25/26.
  - 21040 by C in 21036's repo, completed at 21036's instant.
  - 21041 and 21042 on one local day with 12011's change strictly between, and no other 12010 work that day.
  - 21043 and 21044 more than one working day apart, with a Meteor event on every working day between A's merge days.
  - 21045 the only PR into `METEOR_REPOS[36]` and still open, with no other first-PR-into-a-repo by A after Wed 16.
- In the same describe, using `resolvePods({ all: true })` and `{ story: true, all: true }`: Meteor's schedule has an E6 volley whose members are exactly 21036's and 21040's merges (today's engine, recorded and story time). **If it doesn't group, stop and report. Don't retime C's merge or touch the engine.**
- `solar.test.ts`: a Meteor-only describe, with the Halcyon S41 sprint scope and the pod picked by label.
  - Check: `planSolar` gives 37 stations and 3 seats, and no two stations' discs overlap.
  - Golden `halcyon-meteor.plan.json`.
  - Golden `halcyon-meteor.scenes.json`, projected at range start, Wed 16 17:00:30Z (mid-opening), Wed 16 23:00Z, Thu 17 22:00Z and range end −1.
- `solar.spec.ts`: a new describe, `launchApp({ STAR_CHART_PARADIGM: '' })` (Halcyon is the default fixture). It goes galaxy → Halcyon Reach → Sprint 41 → Meteor Pod and seeks to the end. Assert 37 facility nodes, among them one for each of `METEOR_REPOS[0..35]`. Then, at 1440×900 and at 1024×640 (resize as density.spec does), `hitProblems(page)` must be `[]`.
- `demo.spec.ts`: add `['Meteor Pod', 3]` to `PODS`, in the order the sprint scene draws its stars (read it, don't guess). Rename the "four pods" test.
- `pacing.test.ts`: the seven labels, Meteor last; the App-column test uses `resolvePods({ story: true, all: true })`.

Run:
- `npm run fixtures`. Report whether `fixtures/generated/sprint-pods.history.json` (the Comet default scope) changed. It should not.
- `npx vitest run tests/golden -u`, then `git diff --stat tests/golden`. Only the new `halcyon-meteor.*` files and the **end** of `sprint-pods.scenes.json` (one new scope entry) may change. `sprint-pods.seek.json`, `sprint-pods.schedule.json`, `director.json`, `solar.*` and `meridian.*` must not move.
- `npm test`. These read every Halcyon pod and so now see Meteor: `stationSlotsInvariant`, `board`, `formationBounds`, `formationCorridor`, `frontierStations`, `featureRow`, `sprints`, `halcyonCoverage`, `pacing*`. If one of them pins a pod count or list, update it. **If a property fails on Meteor, stop and report it with the assertion. Don't exclude Meteor and don't change engine code.** If any of the six pods' numbers move (`pacingBuilt`'s frozen rows, the committed JSONs), find out why before going on, and never regenerate past it.
- `npm run e2e:spec -- demo solar sprints tour`, then `npm run e2e:keystone`.

## Out of scope
- Any engine, layout or renderer change. A VC-3 or property failure on Meteor is reported, not fixed (layout is a separate item).
- Meteor in C2's Candidates, the Built rows, the director golden, or `volleys`/`sweep`/`rising`/`director` unit tests. F2 to F4 opt in with `all: true` when they change the engine.
- The drive step `tests/drive/steps/demo.ts` (four pods). Note it under limitations.
