# Slice V1-W1-T2: SDLC v1 fixture (`pod-sprint`)

Built 2026-10-10, following [17 W1-T2](../17-v1-phases.md#w1-t2-sdlc-v1-fixture-pod-sprint) and
[14 §1.3](../14-architecture.md#13-config-fixtures-and-main). v0 behaviour doesn't change: every v0
bundle is byte-identical and every golden holds.

## 1. What was built
- **`fixtures/scenarios/v1/pod-sprint.ts`**: project *Tidewater Array*. Work items are
  20000–20999 and PRs 21000+. Invented names only.
  - **Areas**: the root, plus two saved pods, Harbor Pod (the default scope) and Lantern Pod, and
    one unsaved area, Reef Pod.
  - **Iterations**: Sprint 12, Sprint 13 and Sprint 14 (S-1, S0, S+1). The scenario's range is
    Sprint 13 from start to finish, so the episode is the whole round. Sprint 14 hasn't started,
    so the scenario serves two sprint scopes.
  - **Features**: 3, in the root area. They have no Epic.
  - **People**: Wren Calloway first (the intended viewer, and the fake's `@Me`), then Ossian, Juno,
    Kit and Pell (5 assignees). Sable and Tamsin are reviewer-only guests: they only approve, and
    never change anything.
  - **Seats in Harbor Pod**:
    - Wren has 3 Stories.
    - Ossian has 5 Stories and 4 Bugs, past both 3+3 caps. One of the Bugs arrives mid-sprint.
    - Juno and Kit are the light seats, with up to 3 pieces each.
    - Pell has Tasks only.
  - **Frontier**: 2 Stories and 1 Bug, unassigned. Juno picks up the Bug and closes it. One of the
    frontier Stories is later Removed.
  - **States and moves**:
    - Every Story and Bug state, including Deferred and Rejected.
    - A reopen: Closed, then Active again.
    - A carry-over from Sprint 12 into Sprint 13, and a Deferred Story moved out to Sprint 14.
    - A pod move (Lantern to Harbor).
    - A reassignment (Kit to Juno, by Kit).
    - Wren closes a Task that Pell holds.
  - **Repos and PRs** (3 repos, 9 PRs):
    - `tide-gateway` serves three seats and has 7 PRs open at once (the "+N" case). One of its
      PRs is abandoned, and one is still open at the end.
    - `harbor-console` serves only Kit.
    - `ledger-sync` has one PR, linked to 2 items.
    - Wren approves 3 merges.
  - **Achievements (18 §5 A1)**: by design, Wren earns Clear skies, Hat trick: landings, Hat trick:
    reviews, Swift passage (2 days, Active to Closed), Clean landing, Steady hands (never more than
    2 Underway) and Wingman. W2-T7's "at least five" has some room.
- **`fixtures/scenarios/v1/index.ts`** registers it: `v1Scenarios = [podSprint]`.
- **`fixtures/dsl.ts`**
  - **`item(type, id, title, opts)`** creates a work item of any type the scenario's mapping names.
    `epic`, `feature`, `story`, `bug` and `task` call it. `WiType` is now `string`.
  - **`Universe.itemKind`** holds each item's kind under the mapping given to `simulate`. It's
    resolved once, at create time.
  - **Membership reads kinds, as `derive.ts` does**:
    - A sprint's roots are kind `story` or `bug`.
    - An area's roots are kind `feature`, and the walk down stops at kind `feature`.
    - `listEpics` checks kind `feature` and kind `epic`.
    - Under the SDLC mapping this is the same as the old name checks, so the v0 output doesn't
      change.
- **`scripts/build-fixtures.ts`**
  - Each scenario uses its own mapping (`s.mapping`, else `config/state-mapping.json`).
  - It also writes the v1 scenarios. Each v1 scenario gets its default-scope bundle plus one
    bundle per sprint it serves: `pod-sprint.history.json`, `pod-sprint.sprint-12.history.json`
    and `pod-sprint.sprint-13.history.json`.
- **`tests/golden/v1-ingest.test.ts`**
  - AC-27 for each v1 SDLC scenario (no pack, or `sdlc`), over every area and sprint scope it
    serves. Each sprint bundle must be non-empty and have no `domainPack`.
  - Content checks on the Sprint 13 bundle, one per line of 17's scenario list, so a later edit
    can't silently drop a case.
  - A small hand-built scenario with its own types (`Goal`, `Chore`, `Snag`, `Note`). It checks
    that membership follows the mapped kinds, which W3-T2's packs depend on.

## 2. Contracts changed
- None. Only fixture and test code changed. 02 and 03 are unchanged.
- **Follow-up (W4-T3, docs)**: 03 §8 could mention `item(type, …)`, that the DSL's membership
  rules read kinds, and the per-scenario mapping in `npm run fixtures`.

## 3. Checks
- **Base**
  - `npm run lint`: clean.
  - `npm test`: 34 files and 500 tests pass, including the 15 in `v1-ingest.test.ts`.
  - `npm run typecheck`: one error, and it isn't from this task. `src/shared/engine/pace.ts(131)`
    reads `Property 'key' does not exist on type 'Move'`. That file belongs to W1-T4, which is
    still in flight. Without it, typecheck is clean, including `fixtures/**`, `scripts/**` and
    `tests/golden/**`.
- **Goldens unchanged**: `git status tests/golden` shows only the new `v1-ingest.test.ts`.
  `ingest.test.ts`, `seek`, `scenes` and `schedule` all pass, which shows the move to kinds left
  the v0 bundles unchanged.
- **`npm run fixtures`**: wrote all 8 bundles. `pod-sprint.sprint-13` has 136 events and
  `sprint-12` has 9.
- **`v1-ingest.test.ts`**: AC-27 passes for `pod-sprint` on Harbor Pod, Lantern Pod, Sprint 12 and
  Sprint 13. The content and by-kind checks pass too.
- **e2e**: not run. 17 doesn't list keystone for this task, and no app code changed.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **The default scope is an area, and its bundle is empty.** `ScenarioScope` can't name a sprint,
  and the Features sit in the root, as in v0's `sprint-pods`. So `pod-sprint.history.json` has 0
  events. The bundle to play is the Sprint 13 sprint scope.
  - **For W1-T5 and W2-T1**: open the sprint from `sprintScopes(s)` (or the chooser), not
    `defaultScope`.
- **No `mappingFor(s)` is exported.** `build-fixtures.ts` has its own one-line `mappingOf`, so it
  doesn't collide with W1-T5's `mappingFor(s)` in `src/main/fixtures.ts`. If one shared helper is
  wanted, it could live in `fixtures/dsl.ts`.
- **The achievement claims aren't tested here.** They're designed into the scenario but checked
  only by W2-T7's tests. If W2-T7 reads a rule differently (for example, whether Steady hands
  counts the viewer's own Tasks), check Wren's Underway overlap: her Story and its Task overlap,
  and so do 20102 and 20103, each pair making 2.
- **Area scopes have no Features.** Like `sprint-pods`, the pods' area scopes are empty, so their
  AC-27 cases compare empty bundles. The sprint cases carry the weight.
