# Asset ledger

Authored or baked art that ships as files (06 §7, 14 §1.4). Every entry keeps its procedural version as the
fallback. Procedural stays the default; an atlas path is a dev flag until real art replaces it.

| File | Keys | Size | Source | Date | Licence | Bundle |
|---|---|---|---|---|---|---|
| `atlas/asteroids.png` + `atlas/asteroids.json` | `asteroid.<metal\|crystal\|energy>.<sketch\|ready\|underway\|resolved\|accept\|accomplished\|ghost>.v0.<rock\|marks>`: 42 frames, plus the outline shape per `.rock` key in `meta.aura` | 1512 x 1296 px PNG (615 KB), 7 x 6 cells of 144 logical px at 1.5x; JSON 19 KB | Baked from the procedural `AsteroidView` by `npm run bake:asteroids` (seeds 11, 23, 707, radius 40, reduced motion, outline hidden, no steps) | 2026-10-28 | Own work (generated from this repo's code) | Imported with Vite `?url` from `src/renderer/src/chart/art/asteroidAtlas.ts`, so electron-vite emits it into `out/renderer/assets/` and electron-builder packs it with the renderer |

**Anchor:** every frame is centered on the rock's origin (the frame centre); `rock` is the painted layer
(`celestial`), `marks` the crisp hardware over it.

**What the asteroid atlas does not cover** (these stay procedural, even with the flag on): steps (Tasks) drawn
on the rim, the `deferred` and `unknown` looks, a contact's arrival, the closing glint, the live light and the
rock's surface tumble, the progress beat on the cut lines and lamps, the platform's window shimmer, and shape
variety (one baked rock per material). The outline (aura) is not baked: it stays a live layer, built from the
silhouette stored in `meta.aura`.
