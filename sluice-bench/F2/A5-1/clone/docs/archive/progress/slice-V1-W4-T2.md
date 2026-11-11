# Slice V1-W4-T2: Verification specs

Built 2026-10-12, following [17 W4-T2](../17-v1-phases.md#w4-t2-verification-specs) and 14 §5.
This task adds the v1 verification specs and the density harness's solar case. It also fixes the
bug those specs found, as 17 W4-T2 asks: **VC-3 in the solar region**, which W3-T1 routed here
and which gated HG-V3. VC-3 now holds on `pod-sprint` at both the test window and the smallest
window. solar.spec's `test.fail()` is gone. A second bug, in the Settings focus trap, is fixed in
the module that owns it.

v0 is unchanged. The placement changes are no-ops without `graph.solar`. The two floors that
changed are read only by v1 kinds. Every golden is unchanged, and the v0 pixel baselines pass.

**Second review fix (2026-10-12, on the v4 and then v5 layout).** Another session moved the solar
layout to v4 and then v5 while this task was open. It rewrote the formation half of
`placeFormation.ts` (regions, platforms, frontier push-out) and the density and solar-play specs
to match. The moon ring and `moonSpots` described in §1 are gone; that session owns that part now.
This fix touches only the station pass, plus two small additive changes outside the task's files
(§2):
- **Stations now keep clear of each other, whatever the playhead.** `graph.solar.stations` carries
  every planned station's spot, in the plan's order (arrival, then key), whether it's drawn yet or
  not. `placeStations` settles every one of them in that order, each against the fixed board and the
  stations settled before it. A drawn station takes its settled spot. So the spot depends on the
  plan and the scale only (INV-14, seek equals play), and no two stations overlap on screen.
- **The three density failures** (station × station at 1024×640, a 9.9 px objective hit, and seat
  × objective at 5%) no longer occur on the v4 or v5 tree. The v4 session's `groupReach`
  (12 px hits) and its region layout fixed the last two. The station fix makes the first hold by
  rule now, instead of by luck in the geometry.
- **Lint** is clean. The unused `SeatSlot` and `isSlotRole` imports were removed by the v4 session.
  `isSlotRole` is used again by its frontier push-out.

## 1. What was built

### Specs (new)
- **`tests/e2e/solar-play.spec.ts`** (4 tests), on `pod-sprint`'s Harbor Pod.
  - The test walks the beats and finds the first one that takes a drawn threat to Accomplished.
    That beat is "Wrong time zone on receipts", the frontier Bug Juno picks up and closes.
  - **The strike run plays.** Stepping that beat raises the grand flare and starts maneuvers. The
    hive ship's stage then lands at the graph's stage, and live commands drain to 0. Afterwards
    every resting stage equals `viewGraph`'s.
  - **Seeks.** The test seeks back (−5 s) and then forward (+60 s), each from the middle of the
    strike run, while commands are live. Each seek leaves `liveCommands() === 0`, and no stage
    differs from the graph. The threat rests at its ruin after the beat and at its earlier look
    before it.
  - **Reduced motion keeps the information.**
    - Over 30 samples during the beat there are no moves, sparks, beams, guests or grand flares.
    - Static rings appear where the flares would be.
    - The threat still lands at its new stage, and its seat counts the defeat (`outcomes.r`).
  - **Stations keep one spot** (review fix). At one camera, every station drawn at 5%, 25%, 50%,
    75% and 100% of the round stands where it does at the end. Then the test plays through the
    strike run at 4× and pauses. The stations' targets match a seek to the same time, and the
    round's end.
- **`tests/unit/placeStations.test.ts`** (7 tests, new; review fix). On a hand-built board at
  scales 0.02, 0.05 and 0.1, a station's spot is the same with or without a frontier piece or a
  second station drawn, in either map order. It clears a frontier piece on the belt's middle by
  the attach gap, and a station whose plan spot is clear stays there. The order and presence tests
  failed on the earlier station pass at 0.05 and pass now.
- **`tests/e2e/settings.spec.ts`** (5 tests). It runs on a fixed userData folder so the relaunch
  sees the same `settings.json`.
  - **The cog and the tabs.**
    - The cog has `aria-label` and `aria-expanded`.
    - When the modal opens, focus is on the selected tab.
    - ↑ and ↓ move between tabs and wrap. Home and End also work. Each tab's `aria-controls`
      panel is shown.
    - Space doesn't reach the chart.
    - Esc closes the modal, gives focus back to the cog, and leaves the region on screen.
  - **Focus trap.** In every tab, 24 Tabs and 24 Shift+Tabs never leave the modal.
  - **Targets of 44 pt.** Every drawn button, select, input and tab in every tab is at least
    44 × 44, and so is the cog. For a radio or checkbox, its label is measured, because the label
    is the target.
  - **`.connect…` selectors.**
    - The mode chip opens the Connection tab, `section#connect-panel.connect.connect--tab`.
      `.connect__mode` is inside it, along with the Purge note.
    - There is exactly one `.connect__close`, and it is `.settings__close`. It closes the modal and
      clears `connectOpen`.
    - The cog's Connection tab shows the same section.
  - **The viewer survives a relaunch, and insignia go only on the viewer's ship.**
    - With no viewer there are no awards and the recap lights no insignia.
    - Wren is chosen. `settings.get()` has her key, and after a relaunch on the same userData the
      select still holds her and her awards are listed.
    - Every award has `holder` set to Wren, and her ship is on the board. The recap lights at least
      1 insignia, and never more than the awards.
    - Choosing Ossian moves every award's holder to him. With the switch off there are no awards
      and no insignia.
- **`tests/e2e/density.spec.ts`: the solar case** (2 tests).
  - It runs on Harbor Pod at 1440×900 and at 1024×640, the minimum window. At each size it
    measures the round's end, middle and start (seek to 100%, 50% and 5%).
  - **Objective checks, asserted at both sizes:**
    - the v0 harness checks (hit overlaps, label overlaps, off-screen objects, hidden labels, and
      captains at least a label tall);
    - **the crowd cap** (no more than 3 free pieces per seat and role, read from the projection);
    - **formations**: members at least `FORMATION_PITCH_PX` apart on screen, and every member's hit
      at least 12 px;
    - **footprints**: no threat ship (2r) or station hull (2r) over a captain's ship or a planet;
    - **the frontier in view**: its pieces and the belt's outer ellipse are inside the usable view;
    - **stations clear**: no hull over the star, a planet, a piece or another station.
  - **Asserted at 1440×900 only:** formation members are clear of other seats' orbit lines.
  - **Reported only**, in `test-results/density-report.md`: free pieces and stations that cross
    an orbit line (see 5).
  - `measure()` now takes a page, so the v0 cases are unchanged.

### Drive steps (new; run with `--paradigm solar`)
- **`tests/drive/steps/solar-board.ts`** (for HG-V3): the board at both window sizes and three
  playheads, with each shot's hit count, overlaps and scale noted. It ends with a close-up of Ossian
  Vale's formations.
- **`tests/drive/steps/solar-strike.ts`** (for HG-V3'): the strike-run beat at 1×, shot every
  250 ms, and then the same beat under reduced motion.

### The VC-3 fix (bug found here, fixed in its owner modules; 17 W4-T2)
I followed W3-T1's recipe (§5 of its handoff), then took it further: the recipe alone still left
overlaps at the smallest window.
- **`chart/scenes/placeFormation.ts`** (W2-T2's file) now places the whole solar board in screen
  terms. Nothing is changed in the plan.
  - **`moonRing(role, scale, kmax)`.** A free piece's ring is the plan's ring and its 36° spread
    wherever those keep the hits clear.
    - When they don't, the spread widens first, up to π/(2·kmax + 1). That is 60° for the 3 + 3
      crowd.
    - Then the ring grows, until each piece's hit clears the planet's hit and its neighbours' hits
      by `ATTACH_GAP_PX`.
    - Sizes come from the sizing rules for a kind at the plan's radius (a probe node). So the ring
      depends on the scale alone.
  - **`moonSpots`.** All seats' slots are settled in one pass, in order: seat, then role, then
    index. Empty slots count too, so a spot never depends on who is on the board (INV-14).
    - A slot whose hit would cover the star, another planet, a formation's disc, another slot or
      the frontier belt takes the nearest of 55 moves (out along its spoke, or round the ring by
      half spreads) that clears all of those.
    - If none clears, it takes the move that overlaps least. Inner seats' objectives face the star,
      and these moves are how they get round it.
  - **Formations past the ring.** `formationLayout(…, ring)` puts the formation's centre at least
    `ring.d + pieceHit + gap + rings·pitch + memberHit` from its seat, along the plan's direction.
    The halos follow, because `solarGuides` draws from the same layout.
    - The member size is now the kind's at the plan's radius, so a layout doesn't depend on which
      members are drawn.
    - `formationLayouts(…, every)` can lay out every formation.
  - **`placeStations`.** Each station takes the first spot on a 6 px spiral round its planned spot
    whose hull's hit clears the board by the attach gap. Within 96 px it prefers a spot that is
    also off every orbit line (Sampson distance, plus the 24-unit band). The search reaches 240 px.
    - The board is fixed by the plan and the scale alone: the star, the planets, every group's
      disc (`groupReach`), and the frontier belt. The belt counts with room for a frontier piece's
      hit anywhere round its middle ellipse, so whichever frontier pieces are drawn.
    - **Second review fix.** Stations count each other through the plan, not through what's drawn.
      Every planned station in `graph.solar.stations` settles in the plan's order (arrival, then
      key) at the kind's hull size. Each one keeps clear of the board and of the stations settled
      before it. A drawn station takes its settled spot, so its spot depends on the plan and the
      scale only. It never depends on the playhead, which stations are drawn, the renderer's map
      order, or how the playhead got there (INV-14, seek equals play). A drawn station missing from
      the list (an older graph) settles after all of them.
    - **Review fix.** The first version also counted the frontier pieces drawn now and the
      stations placed before, in the renderer's map order. GraphScene re-runs the pass on every
      `apply`, so a station could move as a frontier piece arrived or left near it. A rebuilt
      entry also goes to the end of `GraphScene.nodes`, which changed the order. Both are gone.
      (The review said departing entries stay in `GraphScene.nodes` during play. They don't:
      `depart()` deletes them. The presence and order problems were real all the same.)
- **`chart/scenes/placement.ts`** (W2-T2's file)
  - It calls `placeMoons`, `placeFormations` and `placeStations`, in that order, before the PR lane
    and the ships.
  - Under `solar`, a ship attached to an anchor may try a second tier of reaches (3, 3.8 and 4.8),
    but only after every direction at the first tier has failed. v0 keeps exactly one tier, in the
    same order as before.
- **Floors (an art call, assumption recorded)**
  - `sizing.ts` `FLOOR_PX.threat` is now `LABEL_PX × 0.3` (was 0.55), and `.facility` is
    `LABEL_PX × 0.5` (was 0.9).
  - The theme's `AssetDef.floorPx` in `theme/starChart/assets/threat.ts` and `facility.ts` now
    match those values, because GraphScene takes the larger of the two floors.
  - At the fit scale a threat is now about its planet's size. Before, it was drawn bigger than the
    planet.
  - Only v1 kinds read these floors.

### Other fixes
- **Focus trap (`settings/SettingsModal.tsx`, W2-T6's file).**
  - The trap took the last focusable element in DOM order as its wrap point. On the Theme tab that
    element is an unchecked radio, which Tab never lands on, so Tab went from the checked radio
    straight out of the modal. settings.spec caught it.
  - `tabbable()` now keeps only drawn, enabled elements with tabindex ≥ 0, and one stop per radio
    group (the checked radio, or the group's first). A disabled fieldset counts as disabled.
- **`tests/e2e/solar.spec.ts` (W3-T1's file).** As W3-T1 asked:
  - `test.fail()` is removed from the VC-3 test, which now passes;
  - the "no other hit covers its centre" seat search is dropped from the mega-label test.
  - Its contrast check already covers `.callout--mega`, because the plate is a `.callout`.

## 2. Contracts changed
- **Second review fix: one additive view field, outside this task's files.**
  - `src/shared/contracts/view.ts` gets `ViewGraph.solar.stations?: { facility; x; y }[]`. It's
    optional and type-only.
  - `src/shared/scene/project/solar.ts` fills it from `plan.stations`, one line beside the existing
    `graph.solar` assignment.
  - The reviewer named this route. No golden changes, because the solar goldens' plain graph has no
    `graph.solar`, and `npm test` passes against the current goldens. W4-T3 should record it in
    03 §5d. The v4 and v5 session kept both lines through its later edits.
- No IPC or engine type changed.
  - `SOLAR_LAYOUT_VERSION` and `GEOMETRY` are untouched by this task. Another session moved them
    to v2 (`OBJECT_SCALE = 2`) while this task ran. The fix reads `GEOMETRY`, and every spec was
    re-run on v2 and passes.
- **Renderer seams for W4-T3 to record in 03 §6 / 14 §1.4:**
  - in `placeFormation.ts`: `moonRing`, `moonRings`, `moonOffset`, `MoonRing`, `placeMoons`,
    `placeStations`, `formationLayout(f, memberR, scale, seat?, ring?)` and
    `formationLayouts(solar, nodes, scale, every?)`;
  - `placeInScreen`'s solar order: moons, formations, stations, the lane, then ships.
- **Doc edits owed (W4-T3 owns these docs):**
  - **08**: the solar screen pass as built, and what the density harness found (5 below). Also
    the station rule: the board a station clears is the plan's and the scale's alone, never the
    pieces or stations drawn now.
  - **06 §2**: the v1 hardware floors (threat 0.3 and facility 0.5 label, against v0's 0.55 and
    0.9 for vessels and stations).
  - **14 §5**: the density solar case also runs at 1024×640.
  - **tests/README**: the solar specs and drive steps, and `tests/unit/placeStations.test.ts`.
- 02 is unchanged: no invariant changed.

## 3. Checks
Re-run after the second review fix (2026-10-12), on the v4 tree and then on v5:
- `npm run typecheck`: clean. `npm run lint`: clean. `npm test`: 50 files and 776 tests, all
  pass, including 12 `placeStations` tests (5 new).
- **`placeStations` unit test**: the 5 new tests cover three things. Stations clear each other at
  scales 0.02 and 0.05, whichever are drawn. Settling follows the plan's order. An older graph
  without `stations` still works. Run on the earlier station pass, 3 fail (clearing at 0.02 and
  0.05, and order), so the tests catch the reported bug.
- **`density`, `solar-play`, `solar` and `settings`, `--repeat-each=2`**: all pass on v4 (42/42)
  and on v5. On v5 one run hit the other session's mid-edit `platforms` assertion in solar-play
  (that file changed during the run). A rebuild and rerun of solar-play and density gave 18/18.
  The density report shows 0 hit overlaps, 0 formation issues, 0 footprint overlaps and 0 station
  issues, at both window sizes and all three playheads (scale 0.126 at 1440×900, 0.052 at
  1024×640, on v4).
- **Keystone**: 38 of 38 on v4 and on v5.
- **Full e2e** (`npx playwright test`): 155 of 155 on v4 and again on v5.
- **Goldens**: unchanged by this fix. The solar goldens were changed by the v4 and v5 session.

Earlier, after the first review fix to `placeStations`:
- **Base**
  - `npm run typecheck` (node, web and e2e): clean.
  - `npm run lint`: clean.
  - `npm test`: 50 files, 770 tests, all pass (the 7 new `placeStations` tests included).
- **Goldens unchanged by this task.** `git status tests/golden` shows only the untracked v1 files
  from earlier waves.
- **`placeStations` unit test**: 7 of 7 pass. With the earlier station pass swapped back in, 2
  fail (presence and order at scale 0.05), so the test catches the reported bug.
- **Specs `solar-play` (4), `density` (5), `solar` (7) and `settings` (5)**: 21 of 21 pass.
  - The new solar-play test also passes on the earlier station pass. On `pod-sprint` no frontier
    piece comes near a station, so the bug doesn't show there. The unit test is the one that
    catches it.
  - In density there are 0 hit overlaps and 0 station issues at both sizes and all three
    playheads. One run during this fix showed a star × threat hit overlap at 1024×640. A probe
    and two repeats (`--repeat-each=2`) didn't reproduce it, and neither did the full suite. The
    fit scale has also moved (0.069 at 1024×640, against 0.03 earlier), so another session may
    have been rebuilding `out/` around that run. Watch for it.
- **Keystone**: 38 of 38 pass.
- **Full e2e** (`npx playwright test`, both projects): 155 of 155 pass.

Earlier runs for this task, before the review:
- `solar-play` 3 of 3, `settings` 5 of 5, `density` 5 of 5, `solar` 7 of 7 (VC-3 holds, with no
  `test.fail()`), `slice1` alone 20 of 20.
- On the v1 geometry, before the VC-3 fix: 21 hit overlaps at 1440×900 and 32 at 1024×640.
  After it: none.
- **Drives** (`--paradigm solar`): `solar-board` (0 overlaps in all six shots), `solar-strike` and
  `solar-episode`. None had page errors. In `solar-episode`, Wren earns 7 awards, a seek leaves 0
  live commands, and the recap lights an insignia.

## 4. Screenshots (HG-V3, HG-V3'; fixture data only)
These are in `test-results/` (gitignored):
- `drive/solar-board/01–06-board-*.png`: the board at 1440×900 and 1024×640, each at three
  playheads.
- `drive/solar-board/08-ossian-formations.png`: Ossian Vale's formations, up close.
- `drive/solar-strike/strike-*.png` and `reduced-*.png`: the strike run, frame by frame, in full
  motion and in reduced motion.
- `drive/solar-episode/*.png`: the episode as W3-T1 listed it, re-shot after the fix.
- `density-5-solar-*.png`, plus the measurements in `density-report.md`.
- `solar-play-1-strike-run.png`, `solar-play-2-reduced.png`, `settings-1-modal.png` and
  `settings-2-captain.png`.

**HG-V3 can now go to the user.** VC-3 no longer gates it. The `handoff.md` row that marks HG-V3
as gated belongs to W4-T3, which should clear it.

## 5. Known limitations and open questions
- **Orbit lines are crossed on screen. This is reported, not asserted.**
  - At the smallest window, two orbits that run level are closer on screen than one 32 px hit. So
    some free pieces, and Ossian's one-member threat formation, overlap a neighbouring seat's line
    there: about 4 to 7 crossings per shot at 1024×640.
  - At 1440×900, one or two stations or pieces graze a line. No formation member does, and that
    part is asserted.
  - The plan keeps everything off every orbit in world units. On screen, the floors outgrow those
    gaps.
  - The ways out are: smaller floors, a wider orbit lane (`GEOMETRY.lane`, which needs a layout
    version bump), or turning formations off the line. **It's for the user to judge at HG-V3.**
- **The floors are an art call.** The threat floor is now 0.3 label and the station floor 0.5. If
  the art owners want bigger hardware, the ring and the station pass still keep VC-3, but the
  board spreads more on screen.
- **Superseded:** the moon-ring kmax limitation recorded here before. The v4 layout removed free
  moons and `moonRings`.
- **Stations settle at one size: the kind's hull at the plan's radius, with its floor.** GraphScene
  takes the larger of the sizing floor and the theme's `AssetDef.floorPx`, and today the two are
  equal. If a theme raises the facility floor above the sizing one, the drawn hull will outgrow the
  size the stations settled at. To keep them clear then, pass the theme floor into the pass.
- **The frontier push-out and stations.** The v4 session's frontier pass pushes frontier pieces
  outward until they clear the groups, so a piece can leave the belt. Stations keep clear of the
  belt, not of a piece pushed past it. The density case finds no overlap on `pod-sprint`. That
  pass belongs to the v4 session; record it there if it becomes a problem.
- **Ships can stand further from their anchor in solar**, up to 4.8 × the touching distance, but
  only when every closer spot is taken. Captains are still placed by presence, as in v0.
- **Insignia position isn't checked directly.** No test hook reports where an insignia is drawn.
  settings.spec checks these instead:
  - every award's holder is the viewer;
  - the recap lights no more insignia than there are awards;
  - nothing lights with no viewer, or with the switch off.

  The interpreter puts each insignia on `holder`'s ship. A `insignias()` hook in `testHooks.ts`
  (W3-T1's file) would close the gap.
- **Follow-ups that aren't this task's files:**
  - A shared `frames(n)` helper in `tests/e2e/launch.ts` (from W3-T5). `solar-play.spec` has its
    own copy.
  - Capping the in-page sampling loop in `board.spec.ts` (from W3-T5).
  - `tests/README.md` rows for `solar-play`, `settings` and the solar drive steps (W4-T3).
- **Another session edited files during this task.** It added `tests/drive/steps/solar-tap.ts`
  and moved the solar layout to v2. That drive step isn't this task's. Everything above was
  re-checked on v2.
