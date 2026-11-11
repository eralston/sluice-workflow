# Slice 0 — Boot and one procedural Feature system

## Built
- **Scaffold:** electron-vite 5 with Electron 44.5.1, React 19.3, PixiJS 8.21.0 (WebGL), zod 4,
  zustand 5, Vitest 5, Playwright 1.63, TypeScript 5.9, and Node 24 pinned with Volta.
  - Vite is pinned at 7.3 because electron-vite 5 doesn't support Vite 8 yet.
  - TypeScript is pinned at 5.9 because typescript-eslint doesn't support TypeScript 7 yet.
- **Process boundaries:**
  - The renderer is sandboxed, with context isolation and a CSP.
  - It imports `pixi.js/unsafe-eval`, so no `eval` is needed.
  - Popups and navigation are blocked.
  - Every IPC call is zod-validated on both sides.
  - `window.starChart` exposes `mode`, `fixtures.list`, `history.load`, and `openInAdo`. In fixture
    mode, `openInAdo` rejects.
- **Shared core (`src/shared`, pure TypeScript):**
  - Keys and `normalizeGuid`, `fnv1a32`, state-mapping lookup, and event priority.
  - `snapshotAt` covers the full `knownThen` reducer.
  - `projectScene` handles `feature:` scenes, with layout slots ordered by history.
- **Fixture DSL** (`fixtures/dsl.ts`) with `toHistory`, plus a subset of the `orbit-week` scenario:
  one Feature, three Stories (New, Resolved, Closed), and one Active Bug.
- **Rendering:**
  - Pixi stage layers per 06 §4, with a `FeatureScene` adapter (`mount`, `apply`,
    `setSelection`, `dispose`) that reconciles by projection key.
  - A `CameraController` (fit, wheel zoom, drag, interruptible tweens).
  - DOM callout labels, a selection reticle, and map debug (`D` key).
- **Procedural art:** a baked nebula backdrop (domain-warped fBm), twinkling stars, a star shader
  (granulated core plus noise corona), a planet shader (sphere-mapped terrain, terraform front,
  clouds, city lights, rim light, survey grid), and an anomaly shader (spiked turbulent field with
  wave rings). Each stage also has its non-hue overlay (06 §6).
- **Panels:**
  - The inspector shows raw type, state, category, stage, area, assignee and call sign, canonical
    and projection keys, and evidence, with a disabled ADO link.
  - A keyboard-navigable object list.

## Art iteration 1 (feedback round after the first HG-1 review)
- You approved the star, planet, anomaly, and nebula assets as they are.
- **Feature system moved to an oblique orrery view (06 §3):**
  - The camera looks down about 30°, orbits are ellipses half as tall as they are wide, and the star
    sits large at the back.
  - Children are cheated onto the front arcs at fixed per-slot offsets, and bodies are roughly
    equal in size.
  - Orbits draw in two halves around the star, bodies are depth-sorted, and planets are lit from
    the star behind them.
- **Screen-space label declutter:** each label tries below, then above, then nudges. Bodies count
  as obstacles.
- The object list moved into the right-hand column, above the inspector.
- A unit test enforces that no body or label overlaps another across all 8 slots.
- Back halves of the rings faded to near-invisible (alpha 0.05), at your request. You noted that the
  orrery view makes it possible to fit several star systems on screen at once, which is worth
  remembering for sector scenes in slice 1.

## Contract changes
- 03 §5: `ViewEdge.geometry` (orbit ellipse); the Feature-scene slot table.
- 03 §10: added the `remount()` and `camera()` hooks, `env.testMode`, and a note on unsetting
  `ELECTRON_RUN_AS_NODE`.
- 03 §0: public npm for the prototype; Volta pins Node.

## Checks
| Check | Result |
|---|---|
| AC-01 (E) | ✅ pass |
| AC-02 (E) | ✅ pass: pointer and keyboard selection; inspector shows keys and evidence; ADO link disabled |
| AC-03 (E) | ✅ pass: counts match baseline after 10 remounts |
| Unit tests | ✅ 9/9 (GUIDs, state mapping, scenario checkpoints, seek idempotence, slot stability, projection, orrery overlap) |
| typecheck / lint | ✅ clean |
| **HG-1** | ✅ signed off 2026-09-30 after one iteration (orrery view; back halves of rings faded to alpha 0.05) |

## Known limitations and open questions
- Bodies use live shaders rather than cached textures (06 §7 suggests baking). With ≤8 bodies this
  costs little; I'll profile before adding caching.
- Only the stages the fixture uses have been checked by eye. Every stage has code paths, but slice 2
  reviews them all.
- Nobody has checked frame time yet. Profiling comes in slice 1, when there are more objects.
