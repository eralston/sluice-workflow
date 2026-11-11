# Slice V1-W2-T2: Scene seams and the asset registry hook

Built 2026-10-10, following [17 W2-T2](../17-v1-phases.md#w2-t2-scene-seams-and-the-asset-registry-hook)
and [14 §2.8, §3 step 6](../14-architecture.md#3-data-flow), with 17 D7 and D12. With the asset
registry empty and no `graph.solar`, v0 behaviour is identical: the slice1 pixel baselines, VC-2,
VC-3, density and motions all pass unchanged.

## 1. What was built
- **`chart/scenes/placeFormation.ts`** (new)
  - `FORMATION_PITCH_PX = 25`. A member pitch on screen is `max(2·r, 25 px / scale)`, where r is
    the larger of the plan's `memberR` and the member's drawn radius (screen floors applied).
  - `formationLayout(f, memberR, scale, seat?)` gives the centre, pitch, member radius, outer radius
    and hex offsets. The offsets come from the plan's own `hexOffsets`, over every member the
    formation ever had, so a seek never moves a member (INV-14).
  - When the pitch spreads a formation, its centre moves out, away from its planet, by however
    much the disc grew. The near edge stays where the plan put it, so a spread formation never
    grows into its planet.
  - `formationLayouts(solar, nodes, scale)` covers the formations that have a member in the
    scene. `placeFormations(effective, scale, solar)` puts every `cluster` node on its grid.
- **`chart/scenes/placement.ts`**: `placeInScreen(effective, scale, lane, solar?)` places the
  formations first, so attached and travelling objects then keep clear of them. With no `solar`
  it does nothing.
- **`chart/scenes/GraphScene.ts`**
  - **`createEntry` asks `assetFor(node)` before the v0 switch.** The def's `layer` picks the
    sublayer:
    - `celestial` goes into the painted geography;
    - `infrastructure` and `traffic` go into the hardware sublayers.
    - A hardware asset's `marks` go into a new `hardwareMarks` container, above the hardware and
      outside the paint pass. A station's satellites therefore sit over its hull, as in the
      gallery.
    - If `make` throws, the node falls back to the v0 switch with a `console.warn`, so the scene
      keeps drawing.
  - **Per-entry `caps`** (`EntryCaps`: `celestial`, `moving`, `flare`, `body`, `framed`) come from
    the asset's capabilities, or else from the v0 kind tables. They replace `MOVING_KINDS` (Arrive
    and Depart) and the inline celestial kind list (no screen floor) in `setCameraScale`.
  - **Asset entries are oriented by shape (`setLightFrom?`, `face?`), not `instanceof`.**
    - The light comes from the orbit's star, else `graph.solar.star`, else the upper left.
    - A node with `attach` faces like a v0 ship: nose toward its assignment. Any other asset that
      can turn faces the star.
    - `faceView`, `restoreFacing` and `setFacing` use `face?` for asset entries. v0 entries keep
      their `instanceof` checks.
  - **Floors.** An `AssetDef.floorPx` raises the effective radius, and `hitFloorPx` raises the hit
    floor.
  - **Formation members' hits** stop halfway to their nearest neighbour, even below their visual
    size. Members touch, and v0's `max(visual, …)` would make touching members' hits overlap.
  - **The guides hook at the end of `drawOrbits`** (`drawGuides`).
    - Each `ThemeGuide` draws into its own cleared `Graphics`, in a `guides` container under the
      orbits.
    - By default the guides are `activeTheme()?.guides`, read only when the graph has `solar`, so
      v0 scenes never touch the theme.
    - `setGuides(list | null)` overrides the default.
  - **`tick` copies the root's scale onto `marks`**, as well as its position. Asset marks also
    follow the root's alpha.
    - In v0, every view with marks (planet, anomaly, load-more) keeps a root scale of 1, so this is
      a no-op there.
  - **New seams for W2-T4 and W3-T1:**
    - `setAssetCtx(ctx)`: the viewer and captain style. A change rebuilds every asset view.
    - `capsOf(pk)`.
    - `actView(pk, name)`: plays an `AssetView.act`.
    - Asset entries are also rebuilt when `asset` changes, or when `def.rebuildOn` says so.
- **`chart/framing.ts`**
  - `isFramed(n)`: the asset's `framed` capability, else `FRAMED_KINDS`. `actionFrame` and
    `followTarget` use it.
  - `boundsOf` includes a solar region's whole frontier belt (`star ± rx1/ry1`, plus 24 px) and
    every formation's spread at the fit's scale, so the fit doesn't change as pieces come and go.
- **`chart/fx/timing.ts`**: `FLARE_KINDS` and `BODY_KINDS` are now `KindTable`s, a `Set<string>`
  subclass.
  - `has(node)` uses the node's asset capability, or else its kind.
  - `has(kind)` keeps the v0 answer. A v1 kind (`seat`, `objective`, `threat`, `facility`) also
    counts when the asset bound to that role has the capability. So the unchanged v0 director's
    `kinds.has(n.kind)` already sees v1 bodies once the theme is installed.
- **`chart/scenes/solarGuides.ts`**: `solarGuide` now draws from `graph.solar`.
  - **The frontier belt** is a faint cyan annulus round the star, cut out with v8 `cut()`, with
    10 px dashed edges.
  - **Each formation in play** gets a soft halo at its screen-terms spread (`formationLayouts`).
  - Both use the orbits' cyan, never a rung colour (09).

## 2. Contracts changed
No shared contract changed; nothing in `src/shared` was edited. These renderer seams are new, and
**W4-T3** should add them to 03 §5d:
- `GraphScene`: `setAssetCtx`, `setGuides`, `capsOf`, `actView`, and the `EntryCaps` export.
- `framing.ts`: `isFramed`. `fx/timing.ts`: `KindTable`.
- `placeFormation.ts`: `FORMATION_PITCH_PX`, `formationLayout`, `formationLayouts`,
  `placeFormations` and `memberRadius`.
- `placeInScreen` takes an optional fourth argument, `solar`.

**Departures:**
- **D12 says 24 px; the pitch floor is 25 px.** The hit sizing takes half the gap to the nearest
  neighbour, minus 0.5 px, and VC-3 refuses a hit under 11.99 px. A 24 px pitch would give
  11.5 px hits. 17 D12 should read `max(2·r_world, 25 px / scale)`.
- **Formation hits are capped at half the neighbour gap**, rather than v0's `max(visual, …)`. This
  applies only to `cluster` nodes.
- **`tick` copies the alpha to marks only for asset entries.** v0 marks don't fade with their body
  during an Arrive, and that stays as it was.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 652 of 654 pass. The 2 failures are both in `tests/unit/solarChain.test.ts`, and
    they come from W2-T1's in-flight change (it drops the boot `fallback`). This task doesn't touch
    those files.
- **Goldens unchanged**: no tracked golden changed. The untracked golden files belong to W1-T2,
  W2-T1 and W2-T7.
- **Keystone**: 38 of 38 pass.
- **Spec `slice1`**: all pass, including VC-1 and HG-2 (pixel baselines), VC-2, VC-3 and VC-4.
- **Spec `density`**: 3 of 3 pass.
- **Spec `motions`**: passes.
- **Spec `solar`** (not required here): 2 of 2 pass.
- **Formation pitch, a scratch check, not kept.** A formation of 8 with `memberR` 20 has a 40
  pitch at scales 2 and 1. At 0.5, 0.1 and 0.02, the minimum on-screen separation is exactly
  25 px, and the near edge stays 300 from the planet at every scale.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **None of it has been seen on a real solar scene yet.**
  - Nothing imports `theme/starChart` yet, so `activeTheme()` returns null and no asset is bound.
  - `projectSolar` doesn't emit `asset`, `cluster` or `graph.solar` until W2-T1 lands.
  - **W3-T1** imports the theme once (which activates it) and calls `scene.setAssetCtx(...)` with
    the viewer and captain style from settings. A drive run on `pod-sprint` should then show the
    belt, the halos and the spread formations.
- **Pitch spreading changes clearance on screen.** It keeps a formation clear of its own planet,
  but at small scales it can reach orbit lines, other seats or facilities. W1-T3 noted this too.
  The density solar case (W4-T2) referees it. The knob is `FORMATION_PITCH_PX`, or a smaller hit
  floor for formation members.
- **`setAssetCtx` rebuilds every asset view on any change**, through a `jump` re-apply that ends
  motions and snaps. That's fine for a settings change. A finer rule could ask each def's
  `rebuildOn`.
- **Facing.** Assets with `face` that aren't attached face the star. A threat facing its seat's
  planet would read better, but nodes don't carry their seat. The theme can override this in its
  adapter.
- **`boundsOf` still sizes v1 nodes by kind floors** (`FLOOR_PX` in sizing.ts), not
  `AssetDef.floorPx`. The two agree as long as the theme's floors match 03 §5d's kind floors.
- The known follow-ups from earlier waves (facts, signal, stage codec) don't fall in this task's
  files, so none of them was fixed here.
