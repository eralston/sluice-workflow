# Slice V1-W1-T1: SDLC pack, moves and round facts

Built 2026-10-10, following [17 W1-T1](../17-v1-phases.md#w1-t1-sdlc-pack-moves-and-round-facts)
and [14 §1.1–1.2, §2.2, §3](../14-architecture.md#2-interfaces). It's additive only: no v0 code
imports the new modules yet, so v0 behaviour and every golden are unchanged.

## 1. What was built
- **`src/shared/engine/moves.ts`**
  - `movesOf(h, pack)` returns every event's moves, keyed by event key. It's memoised per bundle and
    per pack object (a `WeakMap` of `WeakMap`s), and every move and array is frozen. Its keys are
    exactly `h.events`, so an observation never moves (INV-02).
  - `contractMoves(h, e)` is the default reading of the shared event contract (03 §3) through the
    bundle's own mapping. The SDLC adapter uses it as is, and W3-T2's packs can too.
    - `wi_created` gives `appear` (role, signal and seat).
    - `wi_state_changed` gives `climb` (from and to signals, and `changedBy` as the actor).
    - `wi_assignee_changed` gives `reseat`.
    - `wi_area_changed` and `wi_iteration_changed` give `enter` or `leave` when the piece crosses
      the bundle's scope edge: in the round and in one of its regions. A move between two regions
      of the round gives neither. Only objectives and threats enter or leave.
    - `wi_title_changed` gives `retitle`.
    - `link_parent_*` gives `bind` or `unbind`, with rel `step` when the child is a step and
      `container` otherwise.
    - `link_pr_*` gives `bind` or `unbind` with rel `attachment`: the child is the PR and the
      parent is the piece.
    - `pr_opened` gives `attach`. `pr_completed` and `pr_abandoned` give `settle`, with the
      attachment signal and the sorted approvers (none when abandoned).
    - `link_dependency_*` gives nothing, since dependencies aren't on the v1 board. An unknown
      type gives nothing either (INV-11).
    - The reader keeps each item's placement, because `enter` and `leave` depend on where the
      piece was. An event that isn't in the bundle is read alone, so it never enters or leaves.
  - Helpers:
    - `scopeTest(h, region?)`: the membership test, read from the sector. In a sprint sector, a
      piece is in when its round path is under the sprint's and its area is under one of the
      pods. With a pod's key, that pod only; with the sprint's own key, every pod. An area
      sector holds what's under its path, and an epic sector holds everything.
    - `PLACED_ROLES` (objective and threat).
    - `typeIndex(h)`, `roleOfKey(h, key)` and `movedKeys(mv)`.
- **`src/shared/engine/facts.ts`**
  - `roundFacts(h, ref, pack)` gives one region's round over the whole loaded history.
    - It's memoised per bundle, pack and ref. `ref.key` is a pod's area key, or the sprint's
      iteration key for every pod.
    - `round` is `h.range`.
  - It folds `movesOf` over the dated events. The placement comes from the contract's own fields
    (`areaPath`, `iterationPath` and their changes). Items and PRs known only from `h.current`
    seed the fold as they are now, from the start (the earlier of the range start and the first
    event). Observations never enter the fold, so facts read like the known-then lens.
  - Pieces:
    - Objectives and threats are members while their placement is in scope.
    - A step is a member while its parent is a member objective or threat.
    - Membership intervals run from inclusive to exclusive. An interval that opens and closes at
      one instant is dropped, and an out-and-back at one instant is merged.
    - `seatAt` and `signalAt` hold one entry per change.
    - `steps` lists every step child ever, in first-bind order (INV-14). `parent` is the parent
      at the end of the history.
    - A piece is kept only if one of its member intervals overlaps the round.
  - Seats are everyone who held a member objective or threat during the round, ordered by when
    they first held one (clipped to the round start, so anyone holding at the start comes
    first). Ties go by key.
  - Attachments are PRs linked by a dated link to a piece here, and open at some instant of the
    round. Each has its facility, author, open interval, links (pieces here only, kept even if
    unlinked), approvers at completion and `signalAt`.
  - `moves` holds only the events whose moves touch a piece or attachment here, in event order.
  - Readers: `coversAt`, `overlapsRange`, `entryAt`, `memberAt`, `seatAtTime` and
    `signalAtTime`.
- **`src/shared/engine/terminology.ts`**
  - `ENGINE_WORDS`: the neutral nouns, levels and rungs.
  - `terminology(pack, register, opts?)`:
    - The source register uses the pack's words.
    - The chart register uses `opts.chart`, the theme's `ThemePack.words`, which the renderer
      passes in.
    - Both fall back to `ENGINE_WORDS`.
    - In the chart register, `typeName` names a type by its role's noun, through `opts.mapping`
      (default `pack.mapping`).
  - `describeMoves(h, e, mv, t)` writes the neutral event line from the moves.
- **`src/shared/packs/sdlc/`**
  - `index.ts`: `sdlcPack`.
  - `words.ts`: User Story, Bug, Task, Feature, Repository, Pull Request and Pipeline run; Project,
    Sprint, Area Path, Assignee and Unassigned; the rungs New, Active, Resolved, Closed and
    Removed; "Azure DevOps".
  - `adapter.ts`: `contractMoves`. The event line is v0's `describeEvent` in the source register
    and `describeMoves` in the chart register. `priority` and `focusOf` are unset, so v0's apply.
  - `thresholds.ts`: 3 days, K = 2, a 12-hour day, and the 3 + 3 crowd.
  - `links.ts`: `containerUrl`. It returns a work item's own `https://dev.azure.com/{org}/…`
    address, or builds `{org}/_workitems/edit/{id}` from the project's address. Anything else is
    `null`, including every fixture bundle (their `adoUrl`s are empty).
  - The pack has no `mapping`: its bundles carry `config/state-mapping.json`.
- **`src/shared/packs/all.ts`**: `PACKS` and an idempotent `registerAllPacks()`, which also runs
  on import.
- **Tests**
  - `tests/unit/moves.test.ts`: 18 tests.
  - `tests/unit/facts.test.ts`: 13 tests.
  - `tests/unit/packs.test.ts`: 12 tests.
  - `literalFence.test.ts` now checks that its glob reaches `moves`, `facts` and `terminology`.

## 2. Contracts changed
- **One additive line in W0-T1's `engine/types.ts`:** `SourceWords.agent?: Noun`. `Terminology.noun`
  takes `'agent'`, but `SourceWords.role` is keyed by `Role`, so there was nowhere for a pack or a
  theme to say what a person is called. It's optional and type-only.
- **`terminology` takes a third, optional argument** (`{ chart?, mapping? }`) beyond 14 §1.1's
  `terminology(pack, register)`. The chart register's words are the theme's, and the engine can't
  import the theme, so the renderer passes them in.
- **Departures from 14, as built:**
  - `enter` and `leave` are scoped to the bundle (in the round and any of its regions), not to one
    region, because a move has no region field. Region membership is in
    `RoundFacts.pieces[].member`, which maneuver rules and the projection should read.
  - Creating a piece inside the scope gives `appear`, not `appear` plus `enter`.
  - `RoundFacts.moves` keeps every touching event in the loaded history, including those before
    the round starts. Consumers filter by time.
- 03 isn't edited, since it isn't this task's file. **Follow-up (W4-T3):** add to 03 §5d:
  - the move table above;
  - the membership rule (`scopeTest`; steps by their parent);
  - the seat order (first held, clipped to the round start, ties by key);
  - `SourceWords.agent` and the `terminology` options.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean. The new engine files pass the import fence: they import only
    contracts, `paths`, `hierarchy/sceneKey`, `playback/describe` and the engine.
  - `npm test`: 40 files and 610 tests pass. That count includes other W1 tasks' tests that are
    in the tree.
- **Goldens unchanged**: `git status tests/golden` shows only `v1-ingest.test.ts`, which is
  W1-T2's.
- **`moves.test.ts`**
  - One case per event kind. The kinds come from `sprint-pods` (Sprint 41) and a hand-built
    `moves-mini` sprint with area moves, a retitle, an unlink, an abandoned PR and undated links,
    plus three hand-made events (`link_pr_removed` and both dependency kinds). A final test
    checks that all 15 kinds are covered.
  - Memoised and frozen. A cloned bundle is read again and gives equal moves.
  - The keys are exactly the events, and the observed links bind nothing.
  - An unknown type gives no moves, and an event read alone doesn't enter or leave.
  - `scopeTest` by pod, by round, and for an unsaved pod.
- **`facts.test.ts`**
  - Membership: a carry-over enters, a story leaves for the next sprint, and the steps follow
    their parent.
  - It agrees with `snapshotAt` (membership and seat) at every event time in the round.
  - Out and back gives two intervals, and out-and-back at one instant gives one. An unlinked
    step leaves and isn't brought back by an observation.
  - The seat and signal series are checked.
  - Seat order: Teo, then Maren in Comet; a tie broken by key in Nova; all four people at the
    round level.
  - A seeded current-state item is checked.
  - The attachment for PR 9501 is checked: its facility, author, interval, links, approvers at
    completion and signals.
  - Moves are filtered to the region, and the memo is checked.
- **`packs.test.ts`**
  - `packs/all.ts` registers SDLC, and `packFor` reads an unnamed bundle with it.
  - Every SDLC type has a role, and every state and PR status has a rung.
  - The thresholds and crowd are checked.
  - The words are complete.
  - Terminology works in both registers, including the fallbacks.
  - The adapter's source line equals `describeEvent` for every Sprint 41 event, and the chart
    line uses no SDLC names.
  - `containerUrl`: a fixture gives `null`, ADO addresses are accepted, and anything else is
    refused.
- **Literal fence**: passes, and covers the three new engine files.
- **Keystone and e2e**: not run. They aren't among this task's checks, and nothing the app
  builds imports the new modules yet.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **Nobody imports `packs/all.ts` yet.**
  - `packFor` still throws in the app until something imports it. Whoever first calls
    `roundFacts` or `packFor` should import it: W2-T1's `solarSource.facts` in shared code, and
    W3-T1 in the renderer.
  - `solarSource.facts` (W1-T5) still returns empty facts. W2-T1 should swap in
    `roundFacts(h, ref, packFor(h))`.
- **Placement needs a `wi_created` event.** An item with history but no creation event in the
  bundle starts with an unknown placement until an area or iteration change says where it is.
  Fixture bundles always have the creation event. For ADO bundles, this matters only if derive
  ever drops the creation event for history that starts later.
- **Off pieces are members.** A Removed or Rejected piece stays in the region, so it can show as
  a ghost (14 §4). v0's `inPodNow` dropped Removed items instead, so v1 and v0 differ here. A
  person whose only piece is Removed still gets a seat. Whether that's right is open.
- **`PieceFacts.parent` is the final parent, not a series.** Mega-label subtitles read the
  snapshot, so they aren't affected.
- **`describeMoves` describes only the first move of an event** (every contract event has at
  most one), and it's English only.
- **`containerUrl` gives `null` for fixtures**, so W2-T1's "facility rows carry … a read-only
  URL" check will see `null` URLs on fixture data, unless the fixture bundle gains web addresses
  (W1-T2's `dsl.ts`) or the check accepts `null` for fixtures.
