# Slice 1 — Complete static hierarchy

## Built
- **Fixture universe:** the full `orbit-week` scenario.
  - Projects and areas: two projects (Nimbus Deck, Harbor Watch) and three saved areas.
  - Epics and Features: two Epics and eight Features, with Feature 101 holding five Stories and one
    Bug.
  - Tasks, people, and repos: Tasks, three people, and four repos.
  - PRs: five PRs covering PR → Task → Story, PR → Story direct, PR → Bug direct, and one unlinked
    PR.
  - Edge cases: a repo shared across two Features, a concurrent assignment across two Features, and
    an Uncharted Task.
  - `toHistory` now applies the 03 §4 membership rules per scope, and listings back the galaxy and
    the chooser.
- **IPC:** `projects.list`, `favorites.list`, and `epics.list` in fixture mode. Canonical keys stay
  typed across zod.
- **Projections** (`src/shared/scene/projectScene.ts`, all pure):
  - `projectGalaxy`.
  - Sector: small orreries on a staggered grid.
  - Feature system: orrery, Task dots, a flank station belt, PR flights and routes, and captains.
  - Body close-up: Task lane, station column, flights, captains, and beacons.
  - Uncharted and unlinked trays.
- **Rendering:**
  - One generic `GraphScene` adapter, with view factories per node kind.
  - New art: a spiral-galaxy shader, a vector ship kit (6×5×4×8×6, chosen by seed), three station
    silhouettes, cargo flights with open, docked, and abandoned badges, and Task markers.
  - Orbits split per star into back and front halves; arced routes, with dashed continuations.
- **Navigation:**
  - A scene stack with breadcrumbs, ‹ Back and Esc, and saved camera and selection per level.
  - Snapshot-and-crossfade transitions under an instrument-grid wipe. They can be interrupted and
    start from the current transform.
  - Search by ID or title jumps straight to the target's scene.
- **Panels:**
  - The inspector covers projects (the sector chooser), work items, repo stations (direct vs
    through-hierarchy work: the component-impact journey), PRs, and captains.
  - The object list and trays panel.

## Interaction refinement (after the first HG-2 review)
- **Select first, then enter.** A single click selects. A double-click, Enter on the selection, or
  wheel zoom past 2.2× (aimed at center, or under the cursor) enters. Wheel zoom out past 0.5× goes
  back. A momentum guard stops one scroll gesture from tunnelling through two levels.
- **Galaxies** open the last-used sector, else the first saved Area Path.
- **New e2e tests:** single click doesn't zoom; double-click on a galaxy; Enter on the canvas
  selection; Enter on the object-list row; wheel in, the momentum guard, and wheel out.

## Learnability refinement
- **ADO type in labels and breadcrumbs:** every label subtitle leads with its ADO type, and so does
  every breadcrumb level. A new project crumb reopens the sector chooser.
- **Map key (K):** shows objects (Star Chart and ADO names), the looks in the current view with
  their ADO meaning taken from the state mapping, and the line styles.
- **Names toggle:** switches between Star Chart and ADO wording, remembered locally.
- **Grouped object list:** sections by ADO type, with counts.
- **New e2e tests:** the key's contents, list grouping, and the toggle plus its persistence.

## Layout refinement (predictable, legible, symmetric)
- **Sector:** balanced, centered rows (6 → 3 + 3, 5 → 3 + 2). Labels sit above the stars, so the
  mini systems are visible.
- **Feature system:**
  - A two-band formation replaces the scattered angle table. The back row is labelled above and the
    front row below, the star is labelled above, and bodies are bigger.
  - Stations form a row below the planets, in barycenter order to minimize crossings.
  - Tasks sit on each body's left and ships on its right. Mirrored pairs share one orbit ring.
- **Chrome:** trays collapse to chips. The breadcrumb stays on one line, with the ADO type on the
  current level and tooltips on earlier ones. The title bar can no longer widen the window.
- **Tests:**
  - Unit: `balancedRows`, centered rows, formation bands and spacing, and bodies exactly on their
    orbits.
  - E2E: the sector is 3 + 3 and centered with no hidden or overlapping labels. Three Feature
    systems show every label with no overlaps, and stations sit below the planets.

## Consistent spatial grammar
- **Rings:** two bodies per ring as mirrored pairs, nested outward, so ring count tracks Story and
  Bug count, including in the sector minis. Labels point outward.
- **Close-up:** the planet on top, Tasks below it in the same ring formation, and stations in a row
  at the bottom, the same as the system view.
- **Camera fit** includes screen-sized labels.
- **Tests:** the ring-formation unit test covers counts, nesting, orbits, outward labels, and mirror
  symmetry. Camera-restore checks now use a float tolerance.

## Relative scale and 3D mechanical art
- **Sizes:** celestial bodies doubled. Mechanical objects get label-sized on-screen floors and
  screen-space attachment with collision search.
- **Art:** ships, freighters, stations, and mission points redrawn as lit 3D forms with shimmering
  windows.
- **Limits raised:** children per Feature 24, Tasks per body 24, stations 6. Up to 8 Task dots
  show under a body in the system view.
- **Density fixture:** Feature 111 (dense) and Feature 112 (sparse), plus the harness and its
  report. VC-3 now checks the scene's real hit circles.
- **Fixes:** zoom range is relative to the fit (the old absolute minimum made zoom-out-through
  unreachable in big scenes); zoom-out holds the wheel lock until its transition ends.

## PR lane and breadcrumb siblings
- **PR lane:** in-flight PR vessels sit between the children and the station row in both the system
  view and the close-up. The density harness and the legibility test both assert it.
- **Breadcrumb sibling menus:** projects, Area Paths and Epics, Features, and Stories and Bugs,
  each with sideways moves.

## Dense-system declutter
- **Labels:** the person (assignee or PR author) is a third label line. Beacons and ship call-sign
  labels are off. Titles are capped at 41 characters.
- **Stations:** spread across the formation's width.
- **Spacing:** more vertical space in the formations. The station gap grows with formation width.
- **PR lane:** vessels sit in even slots with alternating labels, and completed vessels join the
  lane above their station.
- **Known limit:** in the dense system only 2 of 5 PR labels fit. The gap is set in world units, but
  label room is a screen-space need (see the open question in the reply).

## Screen-space PR lane, ship labels, label layouts (in progress)
- **PR lane in screen px** (`sizing.laneRows`, `laneSlotsX`): every PR vessel has a label's room
  above and below and half a label between neighbours, in both the renderer and the camera fit. All
  PR, station, and ship labels now show in the dense Feature system.
- **Ship labels:** the person's name, with "Captain · call sign" under it.
- **Label layouts:**
  - Horizontal for parents and children (left first; ring right ends right); vertical for vessels,
    stations, and ships.
  - A label may touch only its own object or the captain ship assigned to it (and vice versa).
- **Known gap:** in the dense close-up, the screen-space lane takes about 240 px of height, so the
  20-Task formation shrinks until its interior buoys collide (4 hit overlaps; the density test
  fails). Next step: the layout solver (see the reply), which reflows objects, not just labels.

## Art direction and polish (HG-2 review rounds, 2026-10-01 to 10-02)
- **Signal ladder** ([09](../09-signal-ladder.md), `art/progress.ts`): one visual language for work
  state. Ready (steel grey) → Underway (progress blue) → Nearing (violet) → Accomplished (gold), each
  rung with its own color, ornament, contrast rank, and motion. Every star, planet, anomaly, vessel,
  and Task pin was redrawn on it. Coral is now for alerts only; the selection reticle is ivory.
- **Painterly pass** (`art/paint.ts`, 09 §7): a Kuwahara brush filter and impasto on the skies and
  the celestial bodies, plus a canvas weave over the whole picture. **P** toggles it. Mechanical
  art (ships, stations, vessels, pins) takes no filter; the paint was muddying it.
- **Skies per scale:** a galaxy gas arc, a sector band, a feature nebula, and a body sky with
  asteroids and desaturated comets.
- **3D mechanical art** (`art/hull3d.ts`): hulls modelled as 3D solids and painted face by face in
  gouache, at one heroic three-quarter view, with lit east and west renders for anything that moves.
  - **Captain ships:** 13 classes × 14 liveries off the ladder hues. The rule: always wings or
    nacelles, and lights that breathe slowly.
  - **PR vessels:** 5 "trains in space", chains of cars, with soft strobes while in flight.
  - **Stations:** ring, twin-wheel, and platform, in titanium with an accent per repository.
- **Labels:**
  - The accent edge faces the object.
  - AA-contrast plates.
  - People's names are ivory (amber was too close to gold).
  - An optional avatar circle, used by captains: an ADO picture, or initials on a color chosen by
    the initials.
- **Lines:**
  - PR routes are soft marker bands; completed ones keep only a faint gold link to the station.
  - Orbit lines are drawn in screen pixels in the crisp guide layer.
  - Lines are tabled in 06 §2.
- **Motion:** ambient motion runs on wall time and was slowed (48 s planet turns). Task pins run a
  New, Active, Closed lifecycle (a radiating pedestal, then a still check).
- **Tooling:**
  - **`npm run gallery`:** every object in every stage, with ADO states, for development only, plus
    screenshot regression (`tests/e2e/gallery.spec.ts`).
  - **Window position:** remembered per mode. Tests use a fixed size and never save.
  - **Perf check:** `tests/e2e/perf.spec.ts`. Painted, it holds 120 Hz (8.3 ms mean).

## Contract and doc changes
- 03 §5:
  - `ViewNode` gains `selectable`, `labelled`, `meta`, and `zoomTo`.
  - `projectGalaxy`.
  - Feature-scene station belt, sector grid.
- 03 §6, fixture mode: the scenario-as-universe listings.
- 06 §3:
  - Composition rules for the galaxy, sector, Feature system, and close-up.
  - Activation rules: click zooms or selects; Enter selects; the inspector button zooms.
- 06 §4: the label policy now uses four adjacent spots and hides labels rather than letting them
  drift; label plates are 82% opaque.

- **Art-round contracts and docs:**
  - 03 adds `ViewNode.avatar` and `captains[].avatar` (an inline data:image, validated).
  - 06 covers the palette, lines, liveries, the ship versus cargo rule, and avatars.
  - New docs: 08 (the layout solver's history) and 09 (the signal ladder and the paint).

## Checks
| Check | Result |
|---|---|
| AC-04 (U) | ✅ The same Feature under its Area sector and its Epic sector has one key and an identical subtree history. The Epic sector spans areas |
| AC-05 (U) | ✅ All route shapes are correct. The unlinked PR goes to the tray; the orphaned Task is Uncharted |
| AC-06 (U) | ✅ portal-web is one entity, projected into Feature 101 and Feature 104 |
| AC-07 (U) | ✅ 20 random seeks don't move any body. The Bug, which arrived last, takes slot 5 |
| AC-08 (E) | ✅ Back, Back restores camera and selection exactly. Five rapid clicks mid-transition leave counts at baseline |
| VC-1 (E) | ✅ Golden screenshots for all four scales, with ambient animation frozen |
| VC-2 (E) | ✅ Every selectable node is listed. Worst-case label contrast is ≥4.5:1, measured over a white backdrop with text alpha counted |
| VC-3 (E) | ✅ No hit area is under 12 px, and no adjacent targets overlap, at every scale (it caught docked flights stacking, and close-up ships sitting on Task markers) |
| VC-4 (E) | ✅ Ten full galaxy → body → galaxy round trips leave counts at baseline |
| Earlier checks | ✅ AC-01 to AC-03, updated for the galaxy landing scene. Typecheck and lint clean |
| Totals at sign-off | ✅ 31 unit tests; 28 e2e tests pass, plus the one expected failure |
| Gallery (E) | ✅ Every object in every stage matches its screenshot at two instants |
| Density (E) | ✅ The sparse and dense Feature systems pass. ⚠️ The dense close-up (20 Tasks and five PRs) is an **accepted limit**, marked as an expected failure until the layout solver (08) |
| **HG-2** | ✅ **Signed off** by the user on 2026-10-02 ("the look is fantastic"). Screenshots: `test-results/hg2-1-galaxy.png` … `hg2-4-body.png` |

## Known limitations and open questions
- **Deferred: the layout solver** ([08](../08-layout-solver.md)). The dense close-up (20 Tasks,
  five PRs) still has touching pin hit areas and two hidden PR labels.
- In a crowded Feature system, some labels hide until hovered: currently 1 of 6 in Feature 101.
- Routes from upper-flank stations to the near planets can cross in front of the star.
- Test runs open real app windows. They now open without stealing focus, but closing one fails
  that run.
- The overflow token (more than 8 children, 6 Tasks, or 4 stations) is still undrawn. Extra items
  simply aren't projected. The pilot's data never exceeds the limits.
