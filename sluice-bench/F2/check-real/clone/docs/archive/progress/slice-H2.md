# Slice H2: the Sprints view

Started 2026-10-07, on the pluggable hierarchy (H1). The Sprints view is the new default: project →
sprint → pod (a saved Area Path) → the Stories and Bugs that pod took into the sprint → their Tasks.
The Backlog view is a switch away.

## Decided with the user (2026-10-07)
- **Sprints come from the project iteration tree, with dates.** Current and past sprints are listed,
  newest first, opening on the current one.
- **A sprint's scene holds everything in it at any moment of its dates.** Carry-overs visibly leave,
  and additions arrive.
- **A pod's star shows the sprint's progress** on the signal ladder.
- **The sprint is the clock:** its dates are the range, and its history loads when it opens.
- **Pods are the saved Area Paths.** Items in sub-paths count.
- **Planets are Stories and Bugs**, with Tasks on the radar. The Feature shows on the label line.
- **The Sprints | Backlog switch** is in the title bar. It's remembered, with Sprints as the default.

## Built
- **Data:**
  - `iterationPath` on revisions and current items; `wi_iteration_changed`; `iterationPath` on
    `wi_created` and the snapshot, set only when present, so every existing golden is unchanged.
  - Iteration keys (`iter:`), and `SprintSector` with its pods.
  - `inSprint`, the shared membership rule.
- **ADO:**
  - `client.iterations`, `flattenIterations`, and the `sprintItems` WIQL, sampled daily across the sprint.
  - A sprint target in the full sync, and the service's cache-first `iterations()`.
  - Migration 003 adds `iteration_nodes` and clears cached history to refetch it with sprints.
  - The probe's Iterations row.
- **Fixtures:** `.iteration()`, `WiOpts.iteration`, `moveIteration`, `SprintScope`, `sprintScopes`,
  `listIterations`. The fake ADO answers the iteration tree and the sprint WIQL. There's a new
  `sprint-pods` scenario, with invented names.
- **Shared:** `SPRINTS` (`src/shared/hierarchy/sprints.ts`): the sprint field, the pod system, the
  shared close-up, `podStage`, and the family walks. The Hierarchy's walks now take the bundle, and
  it has a new `labelOf`.
- **Main:** the paradigm setting and IPC. Fixture mode also serves `sprint-pods` in Sprints mode.
- **Renderer:**
  - The `ParadigmSwitch` in the title bar.
  - `sprintsUi`: the default scope is the current sprint through the pods, and the ▾ lists sprints.
  - Sprint ranges and whole loads in `scopeData`.
  - The Inspector: the sprint list, the pods heading, and a pod panel.
  - `AreaChooser` opens the project the active view's way.
  - `goTo` names scenes through `labelOf`.
- **Driver:** `--paradigm`, and a `sprints.ts` steps file.

## Contracts and docs changed
- **02:** §2, Two hierarchies (sprint membership); INV-05, Pods (the one aggregate look); the
  `wi_iteration_changed` event row.
- **03 §5b (new):** the sprint types, keys, events, IPC, the walk signatures, and the paradigm.
- **04 §5b (new):** iterations, sprint discovery, the migration.
- **06 §3:** the Sprints chain and the switch. **09:** Pods. **07:** this slice.

## Checks
- **H2-1:** `tests/golden/ingest.test.ts`, the sprint cases for Sprints 40 and 41.
- **H2-2:** `tests/unit/sprints.test.ts` (8 tests).
- **H2-3:** `tests/e2e/sprints.spec.ts` (5 tests; 3 are keystone).
- `npm test` (222), `npm run e2e` (109), typecheck and lint are clean. Every existing golden and
  baseline is unchanged: e2e pins Backlog unless a spec asks for Sprints.

## Known limitations and open questions
- **The first sync of a sprint on the real org refetches history**, because migration 003 cleared
  the cache once.
- ~~**Sprint membership is sampled daily at 12:00 UTC.**~~ **Closed in H4:** one WIQL query
  (`[System.IterationPath] EVER`) finds everything ever in the sprint that's still under a pod, so a
  short stay can no longer be missed. The daily samples remain the backstop for an item that also
  left the pod's Area Path, and for an ADO that refuses the operator.
- **Teams on different cadences:** only the project iteration tree is read, not each team's own
  sprint list. **Deferred to slice 7** (2026-10-09), with the other coverage gaps.
- **Iteration paths are matched exactly.** A sprint's child iterations aren't gathered into it.
  **Deferred to slice 7** (2026-10-09).
- ~~**Removed items** are still drawn.~~ **Closed in H3:** a Removed item departs and leaves the
  scene, In view and the counts (02 INV-10); replay before the removal still shows it.
