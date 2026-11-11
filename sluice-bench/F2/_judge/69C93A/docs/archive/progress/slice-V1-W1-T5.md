# Slice V1-W1-T5: Solar chain boot and paradigm default

Built 2026-10-10, following [17 W1-T5](../17-v1-phases.md#w1-t5-solar-chain-boot-and-paradigm-default)
and [14 §1.2, §1.4, §2.5, §7](../14-architecture.md#7-what-v0-code-stays-and-how-it-is-pinned). The app
now boots into `solar` when it isn't pinned. It walks galaxy → round → region, and draws the region
through the v0 pod system fallback. Playback gating and the new art come later.

## 1. What was built
- **`src/shared/hierarchy/solarSource.ts`**
  - `podSystemSource` is the Sprints pod level's `SystemSource`, taken from `SPRINTS.levels`, so
    `sprints.ts` isn't edited (14 §1.4).
  - `solarSource` is a `SolarSource`. `center` is the pod star (the v0 aggregate look) and
    `fallback` is `podSystemSource`. For now, `facts` returns `emptyRoundFacts(h.range, ref.key)`.
- **`src/shared/hierarchy/solar.ts`**: `SOLAR = chain('solar')` with two levels.
  - **Round** is the Sprints `sprint` level spread, with `playable: false`.
  - **Region** is the Sprints `pod` level spread, with `layout: 'solar'` and `source: solarSource`.
  - The level ids stay `sprint` and `pod`, and there's no body level.
  - The walks delegate to `SPRINTS`, with two changes. `pathTo` filters out `body` refs, and
    `labelOf` answers `null` for a body ref.
  - `pacing` is unset (see 5).
- **`src/renderer/src/hierarchy/registry.ts`**: `registerHierarchyUi(paradigm, ui)` and
  `uiFor(paradigm)`. `uiFor` throws for a paradigm that was never registered.
  - Backlog, Sprints and Solar are registered when the module loads.
  - The v0 UIs are registered as `{ ...ui, chooser }`, so `backlogUi.ts` and `sprintsUi.ts` stay
    as they are.
  - `RegisteredUi = HierarchyUi & { chooser: ChooserKind }`.
- **`src/renderer/src/hierarchy/solarUi.ts`**: `{ ...sprintsUi, hierarchy: SOLAR, chooser: 'sprints' }`.
- **`hierarchy/types.ts`**: `ChooserKind = 'sprints' | 'backlog'`, and `HierarchyUi.chooser?`.
- **`hierarchy/index.ts`**: `activeUi()` is now `uiFor(paradigm)`.
- **`store.ts`**: the default `paradigm` is `'solar'`.
- **`nav.ts`**
  - `setParadigm(p: Paradigm)`.
  - `loadChooser` reads `activeUi().chooser === 'sprints'`. Nothing else in `nav.ts` changed.
- **`panels/Inspector.tsx`**: the project plate reads `uiFor(paradigm).chooser`.
- **`App.tsx`**: `ParadigmSwitch` returns `null` under `solar`. Nothing else in `App.tsx` changed.
- **`main/index.ts`**
  - The pin is `paradigmSchema.safeParse(STAR_CHART_PARADIGM)`.
  - A valid pin wins; otherwise the paradigm is `solar`.
  - The stored `paradigm` setting is still written by `paradigmSet`, but it's no longer read at
    boot.
- **`main/fixtures.ts`**
  - `mappingFor(s) = s.mapping ?? SDLC mapping`. It's used wherever a mapping was used before
    (projects, Epics, scopes, `toHistory`).
  - `served()` returns only the active scenario under `backlog`. Otherwise it returns the active
    scenario, `sprintPods` and the `v1Scenarios`, with duplicates removed.
  - `STAR_CHART_FIXTURE` can also name a v1 scenario.
- **Tests**
  - `tests/unit/solarChain.test.ts`, 6 tests:
    - Levels, ids, layouts and `playable`, and that `body:` doesn't resolve.
    - The source wiring and the empty facts.
    - `pathTo` never returns `body`. It equals Sprints' path cut at the region, and every ref on it
      resolves. This is checked for every item and pod, on every sprint-pods bundle, at 13
      playheads.
    - `stageOf` lands on a `pod` ref, Tasks included.
    - The round's stars open regions.
    - The fallback region equals the v0 pod system minus `zoomTo`, at 13 playheads.
  - `tests/e2e/solar.spec.ts` (navigation part), 2 tests:
    - Unpinned, the paradigm is solar, `.toggle--paradigm` has a count of 0, and the plate lists
      Sprints and Pods, not Epics.
    - Galaxy → round → region. The round's level has `playable: false`, and the region is the last
      level, with the solar layout. No node has `zoomTo`, and a double-click on a planet stays in
      the region. Escape walks back up to the galaxy.
  - `tests/e2e/sprints.spec.ts`
    - It pins `'sprints'` at both launches.
    - The default assertion is dropped: the first test is renamed "Sprints (E): …", and the
      `aria-pressed` check is removed.
    - The remembered-switch test is now "a pin wins over the stored value". It switches to
      Backlog (stored), relaunches pinned to sprints, and expects Sprints with its Pods plate.

## 2. Contracts changed
- **No shape in 03 changed.** `HierarchyUi` is renderer-only and isn't in 03.
- **One departure from 17's text: the v1 scenarios aren't served under `sprints` when their pack
  isn't SDLC.** 17 W1-T5 says "`served()` adds `sprintPods` and `v1Scenarios` unless the paradigm
  is `backlog`". A3 and `fixtures/scenarios/v1/index.ts` say the Todo and CRM packs are served
  under `solar` only, and the v0 Sprints chain can't read a pack. So both paradigms get the SDLC
  v1 scenarios (`pack` unset or `'sdlc'`), but only `solar` gets the others.
- **`HierarchyUi.chooser` is optional**, which is a small refinement of 14 §1.4. The registry sets
  it for the v0 UIs, and `uiFor` always returns it set. Making it required would have meant
  editing `backlogUi.ts` and `sprintsUi.ts`, which aren't this task's files.
- **03 is stale now: follow-up for W4-T3.** [03 §6](../03-contracts.md#6-ipc-api) (around line 523)
  still says "Sprints by default until v1's boot task (17, W1-T5) makes Solar the unpinned
  default". It should say that Solar is the unpinned default, that a valid `STAR_CHART_PARADIGM`
  pin wins, and that the stored value is written but not read at boot. 03 isn't this task's file,
  so it isn't edited here.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 507 of 508 pass, across 35 files. The one failure is
    `tests/unit/scheduleHooks.test.ts:90`, from W1-T4, which is in flight. Its hooks change
    `totalMs` there, and this task doesn't touch it.
  - `solarChain.test.ts`: 6 of 6 pass.
- **Goldens unchanged**: `git status tests/golden` shows only `?? tests/golden/v1-ingest.test.ts`,
  which is W1-T2's.
- **Spec `sprints`**: 7 of 7 pass.
- **Spec `solar`**: 2 of 2 pass.
- **Keystone** (`electron-vite build && playwright test --grep @keystone`): 38 of 38 pass.
- Every other spec that relies on a paradigm already pins one: `launch.ts` pins `backlog`, and
  pictures, activity, slice7 and offline pin `sprints`. So the new default doesn't reach them.

## 4. Screenshots
No human gate. `solar.spec.ts` writes `test-results/solar-1-region.png` (fixture data, sprint-pods,
Comet Pod). It shows the region drawn by the v0 pod system fallback, with no paradigm switch in the
title bar.

## 5. Known limitations and open questions
- **The round still plays.** The flag is set (`playable: false`), but nothing reads it yet.
  `playGate.ts` (`playableHere()`) and the Transport gate belong to W3-T1.
- **`SOLAR.pacing` is unset.** W1-T4's `pacing(pack)` hook should be wired into `solar.ts` by
  W2-T1 (which owns the solar projection) or W3-T1. The schedule stays v0 until then.
- **`solarSource.facts` is empty, and `fallback` is still set.** W2-T1 fills in `facts` with
  `roundFacts(h, ref, packFor(h))`, and deletes the `fallback` line. `projectScene` then switches
  to `projectSolar` by itself.
- **The level vocab is Sprints'** ("Sprint", "Area Path", "Enter pod system ›"). The words round
  and region come from terminology (W1-T1) and the label work, not from here.
- **The developer toggle (13 Q9) and the stored value.** Because boot no longer reads the stored
  paradigm, a v0 view chosen from W2-T6's Settings toggle lasts only until the next launch, unless
  it's pinned. That matches 14 §7. If the toggle should survive a relaunch, W2-T6 should keep it in
  `userData/settings.json`, and boot should read it there.
- **The `MapKey` and other UI may still say Sprints things under Solar.** That's expected for the
  boot crutch. W3-T1 owns the UI wiring.
- **Suggested follow-up:** `backlogUi.ts` and `sprintsUi.ts` could declare `chooser` themselves.
  Then `HierarchyUi.chooser` could become required, and the registry's spreads could go.

## Wave gate (W1)
Run on 2026-10-10, after W1-T1 through W1-T5 had all landed.
- **Base**: `npm run typecheck` is clean (node, web and e2e). `npm run lint` is clean. `npm test`
  passes 40 files and 611 tests, including all 9 of the wave's unit and golden files (134 tests).
  The red typecheck in `moves.test.ts` and the `facts.test.ts` interval failure that W1-T4 reported
  were already fixed by W1-T1 before the gate ran.
- **Keystone**: inside the build lock, `electron-vite build` and then `playwright test --grep
  @keystone` pass 38 of 38. `solar.spec.ts` and `sprints.spec.ts` pass 9 of 9. That covers W1-T2's
  open item: the extra served project (Tidewater Array) doesn't break the v0 Sprints flows.
- **Goldens**: `git status tests/golden` shows only the new `v1-ingest.test.ts`. No v0 golden
  changed.
- **Fixes at the gate**: none were needed.
- **Carried forward**: these are the minor items from the task reports, none of them blocking.
  - Region-scoped `enter`/`leave` in `facts.ts`, and in-scope `appear` opening membership in
    `scheduleFacts` (W1-T1/W1-T4).
  - Off pieces creating seats in `seatsOf`.
  - The unknown-state climb line in `terminology.ts`, and the chart register needing `h.stateMapping`.
  - The rule for seeding a PR's signal.
  - The two `seatAtTime`/`memberAt` versions (slots.ts and facts.ts) (W2-T1).
  - `buildHighlights` should use `priorityOf`.
  - High beats losing their accent under pacing.
  - `scheduleFacts` ignoring `unbind`.
  - `sequence()` delaying behind later events, and `agent.light` landing inside protect windows
    (W2-T1/W2-T4).
  - Which paradigms the v1 scenarios are served under, and the comment in `v1/index.ts`.
  - The v1 scenarios in the fake-ADO lookup in `main/index.ts`.
  - The AC-27 area-scope cases asserting only empty-vs-empty, and the test's `s.mapping ?? mapping`.
  - `RegisteredUi` moving into `hierarchy/types.ts`.
  - Bringing 03 §5b, §5d and §6 in line with the code (W4-T3).
