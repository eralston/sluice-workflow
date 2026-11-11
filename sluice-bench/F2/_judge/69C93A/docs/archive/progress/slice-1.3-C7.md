# Slice 1.3 C7: atlas pilot (asteroids)

**Status:** built 2026-10-28. Item: [23 §3 Block C](../23-v1.3.md#3-blocks), C7.

## 1. What was built
- **Bake.** `npm run bake:asteroids` (`tests/bake/bake.ts`, through the gallery's new `bakeAsteroids()` hook,
  `bakeAsteroidAtlas` in `chart/art/asteroidAtlas.ts`) draws each material (seeds 11, 23, 707) in 7 states
  (sketch, ready, underway, resolved, accept, accomplished, ghost) at rest (reduced motion, no steps, outline hidden)
  into `assets/atlas/asteroids.png` (1512 x 1296, **615 KB**, 42 frames: a `rock` and a `marks` frame per state)
  and `asteroids.json` (Pixi spritesheet, 19 KB, plus each state's outline silhouette in `meta.aura`).
  `AsteroidView` gained `auraShape` (the outline's shape in radius units) and `bareForBake()`. `assets/LEDGER.md` is new.
- **Atlas path.** `AtlasAsteroidView` (same surface as `AsteroidView`): rock sprite in `root` (still painted as
  celestial), hardware sprite in `marks`, a live `Aura` (the C1 rim and keyline, breathing as before) built from the
  stored silhouette, and the same rock-and-drift motion. `objective.ts` makes it through `makeAsteroidView`, which
  picks it only under the dev flag (`localStorage['starChart.atlasAsteroids'] = '1'`, or the test hook
  `setAtlasAsteroids(on)` + `remount()`); default off. The sheet loads with `Assets.load` + `Spritesheet`
  (`preferWorkers` off: the CSP has no `worker-src`, a worker load hung) from `?url` imports, so it is bundled.
- **Fallback.** Per asteroid, to the procedural view: steps drawn, `deferred`, `unknown`, `contact()` (arrival),
  `glint()`, or a missing sheet or key (a `[asteroid-atlas]` console line; counted in `atlasStats().missing`). Never a throw.
- **Gallery:** *atlas · metal/crystal/energy* cells show procedural (left) beside baked (right), every state.

## 2. Contracts changed
06 §7 (atlas pilot paragraph), 14 §1.4 (module row), tests/README, 23 C7 State. No 15 row (no tuned constant of
the art changed; the bake constants live in `asteroidAtlasKeys.ts`). 02, 03 unchanged.

## 3. Checks
- `tests/unit/asteroidAtlas.test.ts` (key mapping, fallback rules, the committed sheet holds every key and outline);
  `tests/e2e/asteroid-atlas.spec.ts` (pod-sprint, flag on, remount: `missing` is 0 and sprites are used; takes the
  still). Stills: `review/v1.3/C/C7-pod-atlas-on.png`, `C7-gallery-step2.png`, `C7-gallery-step5.png`.
- Build output contains the sheet: `out/renderer/assets/asteroids-<hash>.png`.
- Perf: not measured (the perf spec has no flag hook; left unmeasured). An atlas asteroid replaces a ray-marched shader quad
  with two sprites, so it should only be cheaper; measure at HG-C if wanted.

## 4. Human gates
HG-C: compare atlas and procedural in the gallery (*atlas · ...* cells).

## 5. Known limitations and open questions
- One baked rock per material (`ATLAS_VARIANTS = 1`): with the flag on, every asteroid of a material shares its
  silhouette and the surface tumble and live light are gone. More variants multiply the PNG (about 0.6 MB each).
  Q: bake more variants before the atlas could be the default?
- Asteroids with steps (Tasks) go procedural, which is most live asteroids; the atlas mostly covers step-free ones.
  Drawing the steps over a baked rock needs the augmentations split from the rock.
- The PNG is large for a pilot (halo glow in the rock frames); not quantised (no tool installed).
- The flag is dev-only (no Settings control), by the plan's "dev flag" option.

## 6. Review fixes (2026-10-28)
- `tsconfig.e2e.json` now includes `raw.d.ts` and `tests/bake/**` (typecheck was failing on the `?url` import via testHooks).
- The sheet JSON is imported lazily inside `loadAsteroidAtlas` (out of the main bundle while the flag is off).
- The e2e asserts `hits > 0`; the unit test checks the PNG header against `meta.size` (1512 x 1296 = 7 x 6 cells of 216 px; the note and LEDGER had said 2016 x 1728, a stale 2x figure).
- `AtlasAsteroidView` parses the state once with `asteroidStage()`.
