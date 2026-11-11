# Slice 1.1-S2: The frontier belt, only when needed and never red

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) item S2 and Q2: the belt shows for any
unassigned work, Story or Bug, and isn't drawn when there is none. It builds on the earlier v1.1
items in the tree (L1, L2, L6, L7, L8, N1). None of their work was reverted. S1's in-progress work
(`chart/art/aura.ts`, `tests/drive/steps/{tmp-s1,v11-S1}.ts`) was left alone. S2 has no human gate of
its own. The stills below are for the user's review.

**Review fixes (2026-10-14).** The review found that the belt followed the beat, not its pieces. A
beat bringing new unassigned work (Sensor contact, Emergence) showed a fully drawn, empty belt before
its pieces made their entrance, and a departing frontier piece outlasted the belt's fade. Now the belt
follows its pieces as they are drawn. The sections below describe the fixed state; the fixes are
marked *(review fix)*.

## 1. What was built
- **"In the belt" is listed by the projection.** `graph.solar.unassigned` lists, by projection key
  and in key order, every piece in its frontier slot at the playhead (`scene/project/solar.ts`). It
  was a count before the review fix. Finished and Off pieces count too, since
  they stay drawn there. The belt's geometry (`frontierBelt`) is still planned over the loaded
  history, so showing or hiding the belt never moves anything (INV-14).
- **A guide can show for some nodes only** *(review fix: it was `shown?(graph): boolean`, read
  when the beat was applied)*. `ThemeGuide.shownBy?(graph)` lists the nodes that keep it shown; the
  `solarGuide` (the belt) lists `graph.solar.unassigned`. `GraphScene` keeps a presence for each such
  guide, from 0 to 1:
  - In play it is wanted while one of its nodes' views is drawn (alpha above 0), or while a node that
    kept it shown is still departing. A newcomer hidden for its entrance (the radar contact, the
    rift, a fade-up) doesn't count until it shows, so the belt fades in with the first frontier
    piece. A piece leaving the region keeps it until the piece has gone. The test is pure
    (`chart/scenes/guidePresence.ts`), and `GraphScene` asks it every frame.
  - It fades over `GUIDE_FADE_MS` (600 ms, wall time, so a fade finishes while paused, as arrivals
    do). It steps in `glide`, after the director has spawned the frame's beat, so a newcomer the
    director hides never counts as drawn for one frame first.
  - A seek, a new scene or reduced motion snaps it to whether the list is empty (INV-15).
    `landAllStages` snaps it too.
  - The opening hides it with the cast (`GraphScene.hideGuides`), so it comes in with the frontier's
    pieces, not ahead of them.
  - A guide with no `shownBy` is always drawn at full strength, as before.
- **Reassign holds its piece's part in the belt until it flies** (`freezes: { guide: 'solar', until:
  'act' }`). The belt fades out as the last unassigned piece lifts off, and in as the first one flies
  to it. It no longer changes while the route inks. *(Review fix:)* a freeze now holds only its
  subjects' part in the guide, counted per node (`freezeGuide(id, before, pks)` /
  `thawGuide(id, pks)`). The guide's other nodes follow the scene meanwhile, so two reassigns in one
  beat, or an arrival beside one, no longer wait on the first act. A guide always draws from the
  current graph: only its presence was ever held state, and the belt's geometry is fixed.
- **The threat light is gone.** `threatGuide`, `drawThreatLight` and `threatsOpen` were removed from
  `solarGuides.ts`. The theme's guides are `[solarGuide]`. The belt is always the orbits' cyan and
  dashed.
- **All clear** (`finales.ts` `AllClear`, `maneuvers/regionClear.ts`) no longer lifts any red. It
  keeps its tell (the red ring collapsing on the wreck), its hero-blue sweep from the star, the
  planets' rings, the star's breath and the echo's gold ring on the wreck. Its sweep keeps its
  timing: it starts at 12% of the act, a breath after the tell. It has no `freezes` now. The freeze
  mechanism remains, used by Reassign. The `allClear` command is still essential and never cut.
- **Test hooks:** `__starChartTest.guides()` gives how shown each guide is, by id
  (`GraphScene.guidesShown`, `ChartApp.guidesShown`). *(Review fix:)* `viewAlphas(pks)` gives how
  drawn each node's view is (0 while hidden for an entrance).
- **Tests:**
  - `solarSeek.test.ts`: `unassigned` lists the pieces in frontier slots at every beat of both
    regions, and the belt's geometry is the plan's. The fixture has playheads with and without
    unassigned work.
  - `guidePresence.test.ts` *(review fix, new)*: the last unassigned piece reassigned keeps the belt
    through the route and drops it when released; a piece reassigned to the belt keeps it away until
    released; holds are counted; a hold covers only its own pieces; a hidden newcomer doesn't count,
    and a departing piece does until it's gone.
  - `commands.test.ts` *(review fix)*: a Reassign beat holds its subject's part in `solar` from the
    beat, and lets go at its act, on the same frame as the flight's `pursue`.
  - `solar-play.spec.ts`: on the beat that brings the first unassigned work, a seek snaps the belt
    (0 before, 1 after). Stepped into and sampled every frame with how drawn the belt's pieces are,
    the belt stays at 0 until the first of them shows *(review fix)*, passes through values between
    0 and 1, and ends at 1. Under reduced motion it is 1 at once.
- **Drive:** `tests/drive/steps/v11-S2.ts`, with a row in tests/README.md.

## 2. Contracts changed (with their doc edits)
- `ViewGraph.solar.unassigned: projectionKey[]` (03 §5 view contracts; a count before the review
  fix). `placeStations.test.ts`'s hand-built `solar` gains the field.
- `ThemeGuide.shownBy?(graph): readonly projectionKey[]` (03, the theme seams; `shown?(graph):
  boolean` before the review fix). `GraphScene.freezeGuide(id, before, pks)`, `thawGuide(id, pks)`,
  `hideGuides()` and `viewAlphas(pks)`; `ChartApp.viewAlphas`; the `viewAlphas` test hook. The `solarGuides.ts` exports are now
  `solarGuide` only (03, 14 §1 file table, 14 §2.8).
- `ManeuverDef.freezes`: Reassign uses it (`solar`, until `act`), and All clear no longer does (03,
  05 §8 *Frozen guides*, 14 §2.8). `GraphScene.frozenGuides` became a map from id to the held graph.
- **13 (normative) amended:**
  - §3: the frontier belt's *Only when needed* and *Never red* bullets.
  - §6.2: Reassign's tell and act (the belt holds, then fades with the flight), and All clear's act
    (no lift).
  - §6.3: the threat light row removed, with a *Retired* note under the table.
- **15:**
  - §2: the Deadly red row (the threat light retired; a guide joins its *Must not be*), and Nav cyan
    (the belt's only colour).
  - §7: the `region.clear` and `piece.reseat` rows.
  - §8: the `allClear` row.
  - §9: the reassign and last-Bug rows.
  - §10: a new *Frontier belt fade* row, `GUIDE_FADE_MS` 600 ms (guarded by `docTables.test.ts`).
- **Review fix doc edits:** 03 (the `solar` field, `ThemeGuide`, the `freezes` seam and the
  interpreter's land step), 05 §8 (*Frozen guides*, and a new *Guides that show for their nodes*),
  06 §9 (*Guides*), 13 §3 (*Only when needed*: following the pieces as drawn) and §6.2 (Reassign's
  tell), 14 §1 (the file table gains `guidePresence.ts`) and §2.8, 15 §10 (the *Frontier belt fade*
  row's wording; its value is unchanged), and a 19 §5 row.
- **Also amended:** 06 §1 (the line table) and §9 (*Guides*, *Finales*), 08 §7 and its status table,
  09 §3 (the hostile palette note), 12 (*All clear*), and the comments in `solarGuides.ts`,
  `finales.ts`, `regionClear.ts`, `reassign.ts`, `fx/types.ts`, `fx/v1/interpreter.ts` and
  `GraphScene.ts`.
- **19:** S2's *State*, and a §5 decision recording the choices that 19 S2 left open (the count,
  Reassign's freeze, the fade's clock and length).
- **Goldens:** none changed. `solar.scenes.json` doesn't serialise `graph.solar`, and no v0 golden
  moved.

## 3. Checks
After the review fixes (2026-10-14):
- `npm run typecheck`: pass.
- `npm test`: pass (55 files, 864 tests), including the new `guidePresence`, and `commands` (the
  Reassign hold), `solarSeek`, `placeStations`, `docTables`, `maneuvers` and `castLabels`.
- `npm run lint`: pass (S1's earlier lint errors are gone from the tree).
- `npm run e2e:spec -- solar-play`: 5 passed, including the strengthened belt test (no belt before
  its first piece shows).
- `npm run e2e:spec -- solar.spec gallery-v1 gallery-assets`: 21 passed (every rule's demo, Reassign
  and All clear among them, in full and reduced motion).
- `npm run e2e:keystone`: 38 passed.
- `npm run drive -- tests/drive/steps/v11-S2.ts --paradigm solar`: passed; stills below.
- The full `npm run e2e` was not run, as instructed. The final phase runs it.
- Goldens: none changed (the Solar golden doesn't serialise `graph.solar`; no v0 golden moved).

## 4. Human gates and stills
No gate of S2's own. For review, `npm run drive -- tests/drive/steps/v11-S2.ts --paradigm solar`
writes to `test-results/drive/v11-S2/`. Each still's note (in `console.log`) gives the belt's
presence, read just after the screenshot.
- `01-start-no-belt.png`: Harbor Pod at the round's start. Nothing is unassigned, so there is no
  belt.
- `02-arrive-before-pieces.png`: the beat that brings the first three unassigned pieces, stepped
  into, 150 ms in. The pieces haven't made their entrance yet, and there is no belt (presence 0).
  Before the review fix, this moment showed a full, empty belt.
- `03-arrive-fading-in.png`: 200 ms after the belt starts to show. The first frontier asteroids are
  curving in, and the belt is still faint (presence 0.86 just after the shot).
- `04-arrive-shown.png`: the belt fully drawn, with its pieces.
- `05-seek-back-gone.png`: a seek back to before that beat. The belt is gone at once.
- `06–08 reseat-*`: Kit's frontier Bug is reassigned. Two pieces stay unassigned, so the belt
  stays, unchanged.
- `09–16 all-clear-*`: the last Bug's strike run, then All clear. In `10` the hero-blue sweep leaves
  the star; in `11` the star breathes and the gold ring settles on the wreck. There is no red on the
  belt at any point. The console notes give a timeline of live commands, every 100 ms.

To watch: the Harbor Pod region of `pod-sprint` Sprint 13, the beat that brings the first unassigned
work (Mon Sep 28, early in the round). Step into it: the belt should appear only as the first
frontier piece curves in, not when the beat lands.

## 5. Known limitations and open questions
- **The fade-out isn't seen on `pod-sprint`.** In both regions, unassigned work stays to the round's
  end (Harbor Pod: 0, then 3, then 2; Lantern Pod: 1). None of the v1 scenarios (`pod-sprint`,
  `todo-week`, `crm-quarter`) has a beat whose last frontier piece is taken, so no still or e2e
  spec shows the belt fading out. The path is covered by unit tests instead: `guidePresence.test.ts`
  (the hold through the route, the release, a departing piece) and `commands.test.ts` (Reassign
  holds from the beat and lets go at its act). Showing it in a still needs a fixture whose last
  unassigned piece gets taken. A small edit to `pod-sprint` would do it, but it would move the Solar
  goldens, so it was left for the user to decide.
- **A departing frontier piece keeps the belt until it has gone.** The belt then fades over 600 ms,
  so for that moment the belt is empty and fading. Starting the fade as the piece starts its own
  fade would overlap them; it wasn't needed to meet 13 §3.
- **"Drawn" means the view's alpha is above 0.** If a frontier piece were ever hidden at rest some
  other way, the belt would fade with it. Nothing does that today: culling uses `visible`, not
  alpha.
- **Off and finished pieces keep the belt shown.** Such a piece in its frontier slot counts as
  "sitting in it", since it stays drawn there. If the user wants ghosts not to count, that is a
  one-line change in the projection.
- **The All clear sweep reads quickly in stills.** Only one frame (`10`) catches the ring. Its timing
  is unchanged from v1.
