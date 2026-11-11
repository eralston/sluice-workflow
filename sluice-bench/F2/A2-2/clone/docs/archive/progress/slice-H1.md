# Slice H1: the pluggable hierarchy

Started 2026-10-07. The user's team plans by sprint, so the hierarchy that tells their story is
project → sprint → area path (pod) → story → task. The Backlog hierarchy (project → Area Path or Epic
→ Feature → Story → Task) stays as the general-purpose view. This slice makes the hierarchy
pluggable, with no change in behaviour, so Sprints can be a second chain over the same layouts and
art (slice H2).

## Decided with the user (2026-10-07)
- Two passes, each with review: the refactor first (this slice), then the Sprints paradigm.
- **Sprints come from the project's iteration tree**, with its dates. The tree, each team's sprint
  list, and every item's `System.IterationPath` are all readable with the token's existing scopes.
  The parsers drop that field today.
- **A sprint's scene** holds everything that was in it during its dates. Carry-overs visibly leave.
- **A pod's star** shows its sprint progress on the signal ladder.
- **The sprint is the clock:** the range is the sprint's dates, and its history loads on open.
- **Sprints becomes the default,** chosen by a switch at the top of the screen. Backlog stays.

## Built
- **`src/shared/hierarchy/`:**
  - `sceneKey.ts`, the codec;
  - `types.ts`: `LevelDef`, the three layouts' source interfaces, and `Hierarchy`;
  - `chain.ts`, the builder;
  - `backlog.ts`: the Backlog chain, holding today's logic moved unchanged;
  - `crumbs.ts`, the pure breadcrumb.
- **`src/shared/scene/project/`:** `ctx`, `galaxy`, `field`, `system`, `radar` and `traffic`.
  `projectScene.ts` is now a facade that dispatches on the level's layout.
- **Playback goes through the hierarchy:**
  - `schedule.ts` takes its beat focus from it, and `highlights.ts` its in-view keys.
  - `follow.ts` uses `closeUpOf` and `stageOf`. The story anchor's `feature` field is renamed `stage`.
  - The director uses the layout for its sector check, `rankOf` for the stagger, and `stageOf` for the star pulse.
- **Data sources:**
  - `src/shared/contracts/source.ts` (`SourceCaps`);
  - `src/main/source/`: the `ChartSource` interface, with `fixtureSource` and `adoSource`;
  - main's handlers ask the active source.
- **Renderer:**
  - `data/` holds `caps` and `scopeData`: bundles, range, sync jobs and `loadScope`.
  - `hierarchy/` holds the active chain and `backlogUi`: a project's default scope, and the scope's ▾ menu.
  - `nav.ts` resolves every scene through the hierarchy.
  - The panels take their words from the vocabulary, and their capabilities from the source.

## Contracts and docs changed
- **03 §5a (new):** the hierarchy, the codec, the source caps, and the anchor rename. Keys stay byte-identical.
- **06 §3:** the scales are now layouts chained by a hierarchy.
- **07:** this slice.

## Checks
- **H1-1:** `tests/golden/scenes.test.ts` is the characterization net. It covers every scope's scenes at the middle and the end, plus pass-through, in-view keys, highlights, beats and follow anchors (about 1.1 MB). It was written before any code moved, and it is byte-identical apart from the anchor rename. That rename was checked separately against the committed `follow.ts`, `schedule.ts` and `highlights.ts`, which were identical apart from the name.
- **H1-2 and H1-3:** `tests/unit/hierarchy.test.ts` (8 tests).
- **H1-4:** `npm run e2e` passes 104 of 104 in about 5 minutes: 83 in parallel, then 21 alone.
- `npm test` (199), `npm run typecheck` and `npm run lint` are clean.

## Known limitations and open questions
- **The Feature pixel baseline was re-accepted.** The difference was a classic macOS scrollbar in the side panel, which depends on the system setting and whether a mouse is connected. Test runs now hide native scrollbars (`hide-scrollbars`), so baselines no longer depend on the machine. Test windows also no longer throttle when covered, because parallel specs open several at once.
- ~~**`SceneKey` is still the Backlog's union.**~~ **Closed in H2:** it is now `'galaxy' | \`${string}:${string}\``,
  with `BacklogSceneKey` kept for tests that build keys by hand.
- ~~**The sync contract is still the Backlog's**~~ **Closed in H2 and H3:** `SyncLevel` gained a
  `sprint` level, and the sprint streams (03 §5c).
- ~~**The galaxy's chooser is still Backlog-shaped.**~~ **Closed in H2:** `sprintsUi` lists the
  project's sprints, and the chooser carries them.
- **Backlog still loads level by level,** not through H3's streaming engine. Deferred until after
  slice 5 (decided 2026-10-09), so it moves once, onto the finished loader.
