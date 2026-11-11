# Slice V1-W4-T1: Gallery registry section and maneuver demos

Built 2026-10-12, following [17 W4-T1](../17-v1-phases.md#w4-t1-gallery-registry-section-and-maneuver-demos)
and 14 §1.4, §2.8 and §8. `npm run gallery` now shows two new kinds of section, right after the v1
art families:
- **Maneuvers**: one cell per engine rule, each looping its maneuver on a real board;
- **Registry**: one section per theme asset, drawn through that asset's own factory.

No product code outside the gallery changed. v0 behaviour, the goldens and the other gallery specs
are unchanged.

## 1. What was built
- **`gallery/maneuverDemos.ts`**: the maneuver demos (HG-V3′).
  - **Where the data comes from.** `demoCases()` builds `pod-sprint` (fixture data only, INV-18)
    in the renderer, through the fixture DSL. Then, for every region of every round, busiest region
    first, it does what the chart does:
    - schedules the region with `buildScene(..., SOLAR)` (the same pacing hooks);
    - plans each beat with `planManeuvers(h, beat, paceFacts(h), PACE_RULES, ENGAGEMENT.maximum,
      { priorityOf })`, as `v1/plan.ts` does;
    - projects the before graph (`firstUtc - 1`) and the after graph (`sourceUtc`) with
      `projectScene`.
  - **Picking a moment.** Each rule gets the first moment whose whole cast is on the board, either
    drawn or in a facility's compound slots. A reviewer with no ship doesn't count.
    - `DEMO_PICK` (rule id → which occurrence) is the remix knob for showing a different moment.
    - All 13 rules in `pace.ts` are found, all in Sprint 13's Harbor Pod.
  - **A small canned graph.** Each demo is cropped to the nodes in or near the framed box. The cast
    is always kept, and so is anything a kept node is attached to. Edges are kept only between kept
    nodes, and the mega-lists are dropped.
  - **`ManeuverDemo`** is an `ArtView`, so the gallery mounts it like any other cell (wide, clipped).
    - It holds a real `GraphScene` with the theme's assets (`setAssetCtx`, no viewer) and a real
      `ManeuverInterpreter` over a small `DirectorHost`.
    - The maneuver is played alone: `afterMs` is 0, so it starts with its beat.
    - **Framing.** The camera frames the moment's pieces and places: the subject, the seats, the
      facility. It includes the ships too, unless that makes the box wider than 2600 world units, in
      which case they fly in from off the frame. The box is framed twice: first from the graphs, then
      from where the scene draws them at that scale, since ships and formations are placed in screen
      terms.
    - **The loop.** Each loop runs the frame order ChartApp uses:
      1. The before state is snapped in and held for 0.8 s.
      2. The after graph is applied as a `beat`, and the maneuver is queued against the drawn
         `effectiveNodes()`.
      3. The demo waits for the maneuver's `durationMs` and for `activeCount() === 0`.
      4. The after state holds for 1.4 s.
      5. `clear()` resets everything (INV-15), and the loop repeats.
    - A loop that hasn't cleared 20 s past its end counts as `stuck`.
    - The demo runs on the gallery's clock, so pausing or freezing the gallery holds it.
  - **Reduced motion.** **R** toggles reduced motion for the demos only, and every demo restarts in
    the new mode. `motion.reduced` is set only around each demo's own tick, so the other gallery
    cells keep theirs. Each cell's caption shows the mode and the loop state.
  - **Test hooks.** `window.__starChartGalleryDemos`: `list()` (per-demo `DemoStats`: loops,
    reduced loops, peak and live commands, stuck, maneuvers started), `setReduced` and `reduced`.
- **`gallery/registrySection.ts`**: `registrySections()`, one section per registered asset that has
  `samples()`, in the theme's `roleAsset` order.
  - The cells are the asset's own `samples()` (W2-T3). They are built through `make` and cycle
    through every neutral stage.
  - Each title names the roles bound to the asset, its layer, capabilities, floors and acts.
- **`gallery/extraSections.ts`**: `extraSections()`, the maneuver section and then the registry
  sections. It's the one entry point a remix adds sections to.
- **`gallery/Gallery.tsx`**: the import and `[...V1_SECTIONS, ...extraSections(), ...RAW_SECTIONS]`.
- **`tests/e2e/gallery-assets.spec.ts`**: two tests.
  - The 5 registry sections mount, each with cells, and alignment holds.
  - All 13 maneuver demos mount, one per rule. Each finishes a full-motion loop that started its
    maneuver and issued commands (`peak > 0`), and clears to `activeCount() === 0`. Each then
    finishes a reduced-motion loop and clears again. A demo between loops has nothing live.
  - The listeners attach and then the gallery reloads, so no console error goes unseen from the
    first module on.

## 2. Contracts changed
- No shared contract changed, and no doc in 02 or 03 needed an edit.
- **Departures:**
  - **Gallery.tsx is a two-line change**, not one: the import plus the `SECTIONS` line. And the
    extra sections go *after the v1 families* rather than at the end, so the maneuvers sit at the
    top for HG-V3′. That follows the file's own "v1 families come first while under review" rule.
  - **Fixtures in the renderer.** `tsconfig.web.json` (composite) doesn't include `fixtures/`, so a
    static import of `@fixtures/dsl` fails with TS6307. `maneuverDemos.ts` instead loads the DSL and
    `pod-sprint` with `import.meta.glob(..., { eager: true })`. Vite bundles that like any import,
    but tsc doesn't follow it. The file types the two functions it calls and declares
    `ImportMeta.glob` locally.
    - Loading through IPC would have depended on the stored mode, and in ADO mode that could reach
      real data. That's why IPC wasn't used.
    - The generated JSON wasn't used either: `fixtures/generated/` is gitignored.
  - The demos draw without the paint pass, because each scene would need its own filters. Bodies
    look a little crisper than on the chart.
- **For W4-T3 (03 §5d/§6):** the gallery seams `extraSections()`, `registrySections()`,
  `maneuverSections()`, `demoCases()`, `DEMO_PICK`, and the `__starChartGalleryDemos` test hook.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean on node, web and e2e.
  - `npm run lint`: clean.
  - `npm test`: 49 files, 762 tests, all passing.
- **Goldens unchanged**: `git status tests/golden` shows only earlier waves' untracked files
  (`solar.*`, `v1-awards.*`, `v1-ingest`). None is this task's.
- **Spec `gallery-assets`**: 2 of 2. All 13 demos loop and clear, in full and reduced motion, with
  no console errors.
- **Spec `gallery-v1`**: 5 of 5, unchanged.
- **Spec `gallery-layout`** (keystone; 2× density, three window sizes): passes, so the longer page
  keeps every view in its frame.
- **Spec `gallery`**: 3 of 3.
- **Keystone**: 38 of 38.

## 4. Screenshots (HG-V3′, fixture data only)
In `test-results/gallery-assets/` (gitignored), from a hidden gallery run on 2026-10-12:
- `maneuvers-a.png`, `-b.png` and `-c.png`: the maneuver section at three instants. Together they
  show each demo resting, mid-play and after.
- `registry-0.png` to `-4.png`: world, asteroid, hive, dreadnought and captain.

**HG-V3′ is ready for the user.** In `npm run gallery`, scroll to "Maneuvers" and watch every
cell. Press **R** to see the reduced-motion version of each, and press **R** again to return.

## 5. Known limitations and open questions
- **Tuning is not in this task's files, so it's recorded here for the theme's owner** (17 lists no
  theme file under W4-T1):
  - **`HOSTILE` (0xd8503f) in `theme/starChart/maneuvers/emergence.ts`** (also used by `engage.ts`)
    is duller than the swarm art. The swarm's glow colours (`chart/art/swarm.ts` colourways) run
    from 0xff3030 to 0xff6e30, and `dreadnoughts.ts` has its own `HOSTILE = 0xd9464f`.
    - The fix is to take the subject hive's own glow, from `hiveDesign(seed)`, inside the
      choreography.
    - Failing that, use one shared constant near 0xff4438, the first colourway's glow.
  - **Sortie gaps, bolt counts and colours** read well enough in the demos to review.
    - The candidates are Engage's return-fire bolts and Carve's bolts (counts in `engage.ts` and
      `carve.ts`), and the sortie stand-off (`besideOf` in `fx/movers.ts`).
    - The user's HG-V3′ review should decide these. Nothing was changed.
- **Framing.** Moments whose cast spans orbits are framed wide, so their pieces are small: Reassign,
  Warp out, Station jump-in, Shuttle tender and Satellite cycle. A ship that sits far off flies in
  from outside the frame. `MIN_BOX_W`, `MAX_BOX_W` and `BOX_PAD` are the knobs.
- **The registry cells are at the sizes W2-T3's `samples()` picked**: radius 36 for objectives,
  100 for facilities, and so on. These are world units at a scale of 1, not the floored on-screen
  size at the region's fit scale. Showing that size would need a scale option in `samples()`, in
  W2-T3's files.
- **One maneuver per demo.** The after graph also carries the beat's other changes. Their stages land
  unclaimed two frames in, as they would on the chart.
- **The demo set is fixed by the fixture.** A new engine rule gets a cell once `pod-sprint` plays it,
  and the section title names any rule the fixture never plays. The spec expects 13.
