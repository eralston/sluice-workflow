# 11 — v0 inventory

What v0 contains, recorded from the code on 2026-10-10. The working tree includes slice 7, which
isn't committed yet. This is the factual starting point for the v1 redesign
([10-v1-charter.md](10-v1-charter.md)). It describes the code; it doesn't set rules. 01–09 stay
normative until their v1 replacements are signed off.

- **How it was made.** Five parallel surveys, one per area. Paths are repo-relative, and line
  numbers are as of the survey date; they drift as the code changes.
- **Inferred items.** Anything marked *(inferred)* came from reading code structure and wasn't
  confirmed by a test or a doc.
- **Mechanic names are interpretations.** v0 never uses board-game words, so every mapping to a game
  mechanic in §3 is ours.

**Sections**
1. [Art assets and transformations](#art-assets-and-transformations)
2. [Motions, effects and maneuvers](#motions-effects-and-maneuvers)
3. [Game mechanics and rules](#game-mechanics-and-rules)
4. [Data model and the ADO mapping](#data-model-and-the-ado-mapping)
5. [UI, accessibility and engineering standards](#ui-accessibility-and-engineering-standards)

---

## Summary: what the surveys agree on

The five surveys found the same few seams from different directions. These are the main inputs to
[12-glossary.md](12-glossary.md) and [14-architecture.md](14-architecture.md).

### Recurring coupling

1. **Rungs aren't data.** The four-rung ladder (Ready → Underway → Nearing → Accomplished) is the
   core of the game. Yet it is re-derived from stage-name strings in at least five places:
   - `art/progress.ts` `SIGNALS`
   - `scene/board.ts` `columnOf`
   - `scene/layout.ts` `radarBand`
   - `hierarchy/sprints.ts` `podStage`
   - `vocab.ts` `LOOKS`

   `state-mapping.json` stores a category and a stage but no rung. PR stages are built in code
   (`flight.${status}`) and never appear in the mapping at all.
2. **ADO names leak into shared logic.** Type literals (`'Feature'`, `'User Story'`, `'Task'`) and
   raw state literals (`'Resolved'`, `'Ready to Accept'`, `'Closed'`) appear in `hierarchy/`,
   `playback/accents.ts`, `playback/describe.ts`, and in main-process sync. Other code resolves kind
   through the mapping, so the same check is done two ways.
3. **`WorkKind` is a closed SDLC union.** `feature | story | bug | task | epic` means both *what an
   item is* and *its role in the game*. The same closed sets reappear in other shapes:
   - the bundle (`childCounts{stories,bugs}`, `more.features`)
   - keys (`wi:` needs a numeric id; ids are parsed with `split(':').pop()`)
   - link kinds (`parent | dependency | pr`)
4. **Closed switches stand in for registries.** Adding a new kind of thing means editing every one
   of these in step:
   - the `GraphScene` node factory, where `default` silently draws a Task dot
   - the 1,064-line effects director, with `instanceof` lists for weight and cuttability
   - the Inspector's dispatch on key prefix
   - the two-value Names toggle (`starChart | ado`)
   - the paradigm switch (`backlog | sprints`)
5. **The same knowledge is written twice:**
   - the palette (CSS variables, plus hex literals in about ten TS files)
   - `rungOf` and `rungOfEvent`
   - `focusOf` and `rankOf` (copied between the two hierarchies)
   - key bindings (handler, help overlay, status bar)
   - `DEPART_S` and `ARRIVE_S`
   - `NodeViewLike` and `ArtView`
6. **Dead or vestigial code:**
   - `Beam` (counted, never created), `BeaconView` and the `assignmentBeacon` role
   - the `trayItem` and `sector` node kinds
   - `travel()`, which always returns false
   - `followAnchors`
   - the planet's `uGrid` uniform
   - the white-dwarf shrink, which survives in layout after the art retired it

### The proposed abstractions converge

Each survey proposed its abstractions independently, and together they form one design:

| Proposed abstraction | Replaces | From § |
|---|---|---|
| **Domain pack**: key codec, mapping with an explicit `role` per type and `category` + `rung` per state, chains, terminology, source, fixtures | `WorkKind`, the type and state literals, ADO-shaped keys, `ChartSource`'s ADO methods | 3, 4 |
| **Neutral item / link / event schema**: `Item{…, axes}`, a link vocabulary declared by the pack, `item_field_changed`, an attachment ("vessel") lifecycle | the six `wi_*` kinds, `areaPath` and `iterationPath`, separate PR entities | 4 |
| **Event adapter (per pack)**: priority, focus, accent, actors, story, describe, protected moment | the switches in `accents`, `plan`, `protect`, `highlights`, `follow` and `describe` | 2 |
| **Asset registry (`AssetDef`)**: layer (celestial or hardware), capabilities, `make(r, seed)`, `setSignal`, gallery samples | the factory switch, `instanceof` chains, five "celestial vs mechanical" lists | 1 |
| **Effect and Motion as commands**, with declared tier, weight, cuttability, clock and reduced-motion substitute | the director's `instanceof` budgets; the two separate arrival systems | 2 |
| **Maneuver**: a composite of roles, cast and phases (tell → gather → act → land → echo → disperse) | the formation, launch and captain-jump code paths; protected-window re-derivation | 2 |
| **Board, region and tray as first-class types** | ring identity recovered by `rx` matching; fixed `uncharted`/`unlinked` trays; duplicated family walks | 3 |
| **Terminology pack**, label tier spec, one theme module, command registry | `vocab.ts`, per-kind label CSS, scattered colours, triplicated key bindings | 5 |

### Gaps against our own standards (inputs to P6)

- **Contrast checks cover little.** VC-2 checks only label title and meta. It doesn't check:
  `who`, `tally`, lane heads, the amber star title on sky, or panel text.
- **Keyboard gaps.** No Esc on the rate and ⋯ menus, MapKey, Connect or Coverage. No arrow keys on
  tabs or search results. No focus trap in the ? overlay.
- **Colour-only cues.** The ruler's in-view ticks and the collapsed-bar dots differ only by hue.
- **No minimum size for DOM controls.** Some toggles are 11 px.
- **Read-only isn't tested.** No automated test asserts that the app makes no ADO writes (INV-21).
- **Labels have no tiers.** The three modes are chosen by motion, not by available space. The row
  count varies from 1 to 4, and when space runs out the only fallback is to hide.

---

## Art assets and transformations

Every drawable is a class with the same informal shape: `root: Container`, an optional `marks`
layer (kept crisp), `setStage(stage)`, `tick(seconds)` and `destroy()` (`NodeViewLike`,
`src/renderer/src/chart/scenes/GraphScene.ts:17-24`). One switch on `ViewNode.kind` picks the class
(`GraphScene.ts:855-871`).

### Asset table

| Asset | Represents (ADO entity) | Code | Visual states / rungs | Driven by | Painted or mechanical |
|---|---|---|---|---|---|
| Galaxy | Project | `art/galaxy.ts`; projection `src/shared/scene/project/galaxy.ts` | No stage (`setStage(){}`). "Quiet" projects are drawn at alpha 0.42 (`QUIET_ALPHA`) | `artSeed(projectKey)`; `flags.quiet` (no saved areas and no activity) | Painted (shader plus live Paint/Impasto) |
| Black hole (empty cosmos) | No project chosen yet (onboarding) | `art/blackhole.ts`; created in `ChartApp.ts:637` | None; ambient only | Fixed; loading energy `'blackhole'` on top | Screen-anchored shader, normal blend |
| Star | Feature (Backlog); **pod**, an Area Path in a sprint (Sprints) | `art/star.ts`; `hierarchy/backlog.ts:76,109`, `hierarchy/sprints.ts:95` | 9 `feature.*` stages → 4 rungs plus ghost, deferred and unknown. Uniforms: `uBright, uRays, uCrown, uFringe, uSketch, uMute, uGhost` | The Feature's own `(type, state)` → stage; for pods, the `podStage()` aggregate (`sprints.ts:76-85`) | Painted |
| Planet | User Story | `art/planet.ts`; `backlog.ts:82,116,128`, `sprints.ts:108` | 9 `story.*` stages. Uniforms: `uTerraform, uClouds, uLights, uBands, uSketch, uDormant, uGhost, uNeutral, uFringe, uSignalAmt` | Story stage; light direction from the parent star (`setLightFrom`) | Painted |
| Anomaly | Bug | `art/anomaly.ts`; same projection sites (chosen by `kind === 'bug'` or `!== 'story'`) | 9 `bug.*` stages. Uniforms: `uIntensity, uSize, uWaves, uSpike, uSeal, uWire, uWireFill, uSketch, uGhost` | Bug stage | Painted |
| Unexplored ghost | A Feature's children that aren't loaded yet | `art/loadmore.ts:GhostView`; `project/field.ts:52-60` (`role: 'unexplored'`) | None; a dim dashed ring | Child counts per Feature | Crisp (`marks` container) |
| Mini planets and anomalies | A sector's Feature children (decorative, not selectable) | `PlanetView`/`AnomalyView` via `project/field.ts:64-70` | Same as the full planet and anomaly | Child stage | Painted |
| Load-more beacon | Paging through older Features | `art/loadmore.ts:LoadMoreView`; `field.ts:82` (`kind: 'overflow'`) | None; a halo pulse | Whether more pages exist | Mechanical (2D Graphics), crisp |
| Mission point (pin or radar dot) | Task | `art/infrastructure.ts:TaskDotView` (390-497); radar placement `project/radar.ts`; system rows `project/system.ts:57-65` | `task.unstarted`: grey outline, breathing. `task.lit`: blue pin with ripples. `task.settled`: faded pin with a gold check. `task.faint`: outline at 18%. Radar band from `layout.ts:radarBand` | Task stage; spoke angle by slot (INV-14) | Mechanical, 2D lit gradients (`lit.ts:topLit`), crisp |
| Station | Repository | `infrastructure.ts:StationView` (133-162); `project/traffic.ts:57` | Placeholder stage `'station.active'`; `setStage` does nothing | `artSeed(repoKey)` → 3 kinds × 6 accents | Mechanical 3D hull (`hull3d.ts`), crisp |
| Cargo vessel ("flight") | Pull request | `infrastructure.ts:FlightView` (279-381); `traffic.ts:101-107` | `flight.active`: blue trim, chevrons, strobes. `flight.completed`: gold trim, check, still. `flight.abandoned`: alpha 0.5, X | `stage = \`flight.${pr.status}\`` (`traffic.ts:107`), built in code, not from `state-mapping.json`; seed `artSeed(prKey)`; east or west from the station's position | Mechanical 3D hull, crisp |
| Captain ship | Person (assignee, PR author, changedBy) | `art/ships.ts:ShipView` (341-389); `traffic.ts:252-267` | No stage (`stage: 'captain'`, unused). Identity motion only: a bob and a 6 s breath | `captain_profiles.ship_seed` = `shipSeedFor(org, identity)` (`src/shared/captains.ts:7`) | Mechanical 3D hull, crisp |
| Assignment beacon | Secondary assignment | `ships.ts:BeaconView` (405-425); `traffic.ts:264` (`role: 'beacon'`) | None | The captain's livery colours | Mechanical 2D, crisp. 06 §4 says beacons are off, but the class and the projection role still exist |
| Avatar circle | Person (in labels) | `src/shared/scene/avatar.ts`; `ctx.ts:captainAvatar` | A picture, or initials on one of 12 colours | Initials hash, or a `data:image` URL | DOM, not Pixi |
| Nebula backdrop | Scene level (no entity) | `art/nebula.ts` (`BackdropLevel = galaxy, sector, feature, body`) | 4 styles | `LevelDef.backdrop` (`hierarchy/types.ts:84`); seed `fnv1a32('backdrop|'+sceneKey)` (`ChartApp.ts:842-843`) | Baked texture, with Paint and Impasto when painted |
| Guides: orbits, board swimlanes, column ticks, radar bands, accretion arc, PR routes, cargo motes | Parent → child links, lanes, PR → work links | `GraphScene.ts`: `drawOrbits` (912), `drawBoard` (983), radar guides, routes and swarm (~1085-1110) | Routes take their PR's rung colour (blue active, gold completed), and dash when `uncertain` | ViewEdges, `graph.board`, `graph.lane` | Crisp chart layer |
| Off-ladder marks | Deferred, Removed, Rejected, unknown | `art/marks.ts:drawOffLadderMarks` | Pause bars, dashed ring, strike, "?" | `Signal` flags | Crisp |
| Stale badge | An entity ADO refused on the last sync | `GraphScene.ts:drawStale` (825) | An ivory clock face at the upper left | `flags.stale` from `coverage.stale` (`ctx.ts:47,75`) | Crisp |
| Accent effects (flare, ring, spark, ink, beam, tractor, support, implode, glyph, streak, intent) | Events | `chart/fx/effects.ts`, `moves.ts`, `moments.ts`, `ships.ts`, `trails.ts`, `director.ts` | Flare scale and colour follow the target's rung (`director.ts:56-66`) | Timeline events | Additive overlay, crisp |
| Loading energy | A load in progress | `chart/fx/explore.ts:EnergyFx` (kinds `galaxy, star, planet, blackhole`) | Strength `base` grows with the wait; flares out on success | Request lifecycle; `ChartApp.ts:690` maps node kind → energy kind | Shader overlay |
| Hero aura | The captain being followed | `chart/fx/hero.ts:HeroAura` | Entrance (2.6 s), then a steady glow | Follow state | Cyan overlay |
| Trays (Uncharted, Unlinked PRs) | Orphan work items; PRs with no readable link | `src/renderer/src/panels/Trays.tsx`; `ViewGraph.trays` | — | `graph.trays.uncharted/unlinked` | **DOM only.** `NodeKind 'trayItem'` (`contracts/view.ts:66`) is never produced, and would fall through to the default `TaskDotView` |
| Canvas tooth | The whole picture | `art/paint.ts:CanvasTooth` | — | — | A screen-space weave tile at 16% |

`NodeKind 'sector'` is declared but never emitted. A sector is drawn as a field of `star` nodes.

### Transformations

| Transformation | Trigger | Where |
|---|---|---|
| **Signal-ladder rung change** (colour, ornament, motion) on every body that has a state | `(type, rawState)` → stage via `config/state-mapping.json` (`src/shared/stateMapping.ts:resolveState`), then stage → `Signal` (`art/progress.ts:30-69`) | Each view's `setStage`: `star.ts:140`, `planet.ts:215`, `anomaly.ts:142`, `infrastructure.ts:330,426` |
| **Terraforming** (planet): sketch → barren (`terraform 0.05`) → terraforming front (0.42, with a pulsing band) → developed (0.78, with clouds and a gold limb fringe) → lush (1.0, with city lights) | Story stage | `planet.ts:166-178` (`planetStage`); front logic in the shader at `planet.ts:98-104` |
| **Wireframe → solid** ("sensor sketch", like fog of war). New is a graticule wireframe; Ready is the first solid form | `Signal.sketch` (New states) | Planet `uSketch` (`planet.ts:138-146`); anomaly `uWire/uWireFill` (`anomaly.ts:74-87`); star `uSketch` outline (`star.ts:80-85`); Task outline pin (`infrastructure.ts:459-462`) |
| **Starburst crown** (star, Accomplished). It replaced the white dwarf in the art, but the system scene still **shrinks a closed Feature's star** (240 → 140; in a sector, 96 → 56) | `feature.whiteDwarf` | Crown `star.ts:58-67`; shrink at `project/system.ts:21`, `project/field.ts:40` |
| **Anomaly seal**: the spikes fold into a heptagonal gold knot, and Nearing contracts its size | `bug.remnant`; Nearing `step` | `anomaly.ts:44-61, 97-108` |
| **Stage swap with a dip**: the new look waits for its accent, then swaps under a 0.5 s brightness dip | A beat during playback (`cause === 'glide'`) | `GraphScene.ts` `stageTo` / `claimStage` / `landStage` (~398-440), `SWAP_S` |
| **Flare** on a stage change: Ready 1.25×, Underway 1.6×, Nearing 1.75× with sparks, Accomplished 2× "grand", which dims other effects | Stage-change accent | `fx/director.ts:56-66` (`flareFor`), 590-640; `fx/effects.ts:Flare` |
| **Reopen implode**: a gold ring contracts to the lower rung's colour | Accomplished → a lower rung | `fx/director.ts:596,609` (`Implode`). Nothing marks a reopened item afterwards: `flags.reopened` is read only by `panels/Inspector.tsx:255`, although 06 §6 calls for "repair marks" |
| **Radar ping**: a Task collapses, sparks along its spoke, and re-expands in its new band | Task band change (`radarBand`) | `layout.ts:122-127`; `fx/moves.ts:RadarMove` |
| **Done compresses** (board): to 60% at the right end, 2 days after done | Playhead vs done time | `scene/board.ts` (`BOARD.doneScale`), `system.ts:46` |
| **Board column travel**: a body moves along its ring to a later column, bowing out or eclipsing | `columnOf(stage)` changes | `board.ts:58-64`; `fx/moves.ts:OrbitTravel`, `fx/moments.ts:Eclipse` |
| **Arrive / Depart** along the orbit, with a streak and a ring | A node appears in or disappears from the ViewGraph (streaming, creation, removal, carry-over) | `GraphScene.ts:52-72`, `MOVING_KINDS` (69), arrive/depart around 640-700 |
| **Ghost, deferred, strike and unknown overlays** | `Signal.ghost/deferred/strike/unknown` | `art/marks.ts:18-38`, plus `uGhost` desaturation in each shader |
| **Stale clock badge** | `coverage.stale` contains the key | `GraphScene.ts:825-843` |
| **Unexplored → explored**: the dashed ghost rings are replaced by real mini bodies | The Feature's children are loaded | `project/field.ts:46-60` vs `64-70` |
| **Quiet galaxy dim** | No saved areas and no activity | `project/galaxy.ts:44`, `GraphScene.ts:QUIET_ALPHA` |
| **Loading energy builds, then flares out or fades**: galaxy arms; star corona tongues and embers; planet aurora; black-hole pull, then storm, then ring tear | Request start, progress, success, cancel | `fx/explore.ts` (`EnergyFx`, `QUIET_START_S = 0.25`); orchestrated in `ChartApp.ts:~690-740` |
| **Vessel lifecycle**: launch (bay glow, intent line, undock), in flight (chevrons, strobes), then dock with a grand flare, or withdraw (ash grey) | PR opened, completed, abandoned | `FlightView.setStage/tick`; `fx/effects.ts:Intent`, `fx/moves.ts:Withdraw`, director 700-760 |
| **Ship heading flip** (separate east and west lit renders) | Direction of travel, or the side of the assignment | `ShipView.face`, `FlightView.face`; `GraphScene.ts:212-216, 585-591` |
| **Captain jump, tractor beam, review formation, jump trail** | changedBy, PR author, approvers | `fx/moves.ts`, `fx/ships.ts`, `fx/trails.ts`, `fx/effects.ts:Tractor/Support` |

### Procedural art and seeding

- **Work items, repos, PRs and projects:** `artSeed(key) = fnv1a32(key + '|' + ART_VERSION)`
  (`src/shared/scene/project/ctx.ts:18-20`; `ART_VERSION = 1` in `src/shared/limits.ts:19`). The
  seed varies only the look; state is passed as uniforms (INV-12).
  - Each shader folds the seed differently: star `% 9973 / 997.3`, planet `% 10007 / 10007`, anomaly
    `% 7919 / 791.9`, galaxy `% 8191 / 819.1`.
  - **Planet:** the seed picks the surface palette (`pal = fract(uSeed*4)`), terrain, cloud phase
    and crater field. Size jitters by seed: `116 + seed%17` for planets, `108 + seed%9` for
    anomalies (`system.ts:45`).
  - **Galaxy:** the seed sets the arm count (2–3) and the cobalt/violet hue mix.
  - **Unexplored ghosts** are seeded from their projection key (`field.ts:57`).
  - **Task pins** have no seed: `seed = round(r*97) % 13` (`infrastructure.ts:412`). So every pin
    of the same size breathes in phase (inferred).
- **Captain ships:** the seed is per person, `fnv1a32(orgKey + identityId + SHIP_DESIGN_VERSION)`
  (`src/shared/captains.ts:7`, `SHIP_DESIGN_VERSION = 1`). It's written once to `captain_profiles`
  (`src/main/sync/levels.ts:171`, `sync.ts:388`), so an art update never changes anyone's ship.
  - `shipDesign(seed)` = `{hull: s % 13, livery: floor(s/13) % 14}` (`ships.ts:300-303`), giving
    **13 hull classes × 14 liveries = 182 designs**.
  - Hull classes: Explorer, Battlestar, Rocket, Orbiter, Saucer, Wedge, Tug, Lancer, Hauler, Pearl,
    Frigate, Dragonfly, Starliner (`ships.ts:47-296`).
  - Liveries are hull/accent pairs that avoid the ladder hues (`ships.ts:17-32`).
  - Call sign = first name + `seed % 1296` in base 36 (`captains.ts:12-16`).
- **People's pictures:** an ADO picture, or one added by hand, arrives as a `data:image` URL.
  Without one, the person's initials sit on one of **12 avatar colours**, chosen by a hash of the
  initials (`src/shared/scene/avatar.ts:13-26,41-43`). The renderer never fetches images.
- **PR vessels:** 5 trains (container freighter, tanker, shuttle train, pod courier, tug and barge)
  × 7 cargo colours × 3 hull tones = **105 variants** (`infrastructure.ts:165-266`). The rung shows
  on a `trim` material tinted at run time.
- **Stations:** 3 kinds (ring, twin-wheel, platform) × 6 accents = **18 variants**, all on warm
  titanium with green navigation beacons (`infrastructure.ts:15-131`).
- **3D kit:** `art/hull3d.ts` provides `HullModel` (`loft, lathe, prism, box, tube, torus, sym, win,
  winRow, engine, beacon`).
  - `renderHull(model, palette, dir, fit)` bakes one `GraphicsContext` per design and heading,
    painted face by face in gouache value planes.
  - Bakes are cached in module-level maps: `renders` (`ships.ts:317`), `vesselRenders`
    (`infrastructure.ts:244`) and `stationRenders` (`infrastructure.ts:118`).
  - Window lights come from `lit.ts:WindowLights` (`shimmer | breathe | steady`).
- **Shaders:** every celestial shader is a single quad mesh (`art/quad.ts:quadGeometry/makeShader`)
  sharing `NOISE` (`art/glsl.ts`) and `PROGRESS_GLSL` (ladder colours plus the pulse,
  `progress.ts:103-112`). The motion clock is global: `art/motion.ts` (`pulseTime`, `travel`,
  `jiggle`, `reduced`).
  - 06 §7 describes a texture cache keyed by `(artKind, seed, stage, sizeBucket)`. The code doesn't
    have one: bodies are live meshes, re-rendered every frame, and only skies are baked (inferred
    from reading the code).

### Gallery

- **Entry point:** `src/renderer/src/gallery/Gallery.tsx` (429 lines). It's enabled by
  `STAR_CHART_GALLERY=1` and launched with `npm run gallery`. Test hooks are in `gallery/hooks.ts`
  (`freeze, setBackground, setPaint, alignment`).
- **Structure:** a `RAW_SECTIONS: Section[]` array (`Gallery.tsx:84-157`). Each
  `Section { key, title, items, sky? }` holds `Item { id, title, note, make: () => ArtView, stage?,
  ado?, face? }`.
  - Stage lists come from `vocab.ts:LOOKS`, filtered by prefix (`stages('feature.')`, plus
    `'unknown'`). So a new stage with a `LOOKS` entry appears in the gallery automatically.
  - ADO captions come from `state-mapping.json`, plus a hard-coded `PR_STATES`
    (`Gallery.tsx:41-45`).
  - A rung chip shows `signalOf(stage)` (`Gallery.tsx:420`).
- **Sections today:**
  1. Skies (4 levels)
  2. Empty cosmos (black hole)
  3. Loading energy (galaxy, star and planet × 3 strengths; black hole × 3)
  4. Galaxies (4 seeds)
  5. Stars: Features, every `feature.*` stage
  6. Planets: Stories
  7. Planet palettes (6 seeds at `story.lush`)
  8. Anomalies: Bugs
  9. Mission points: Tasks, at close-up and system size
  10. Cargo vessels: 3 stages, plus 5 trains × east/west
  11. Stations: 3 kinds × 2 accents
  12. Captain ships: 13 hulls × east/west
  13. Liveries: 14, on the Tug hull
- **Rendering:** `GalleryScene` places a view over each `[data-art]` DOM cell.
  - Painted vs crisp is decided by `instanceof StarView|PlanetView|AnomalyView|GalaxyView`
    (`Gallery.tsx:200`), and marks go to the crisp layer.
  - Keys: Space (play/pause), ←/→ (step one frame), B (background), P (paint).
  - `EnergyDemo` (`Gallery.tsx:58-80`) wraps a base view to show the loading-energy overlay.
- **Not in the gallery yet:**
  - `BeaconView`, `LoadMoreView`, `GhostView` (unexplored)
  - the stale badge, the hero aura
  - board lanes and lane heads, radar bands and accretion, routes and cargo motes
  - accent effects, the selection reticle
- **Adding an asset:** write a class that matches `ArtView`, add a `Section` or `Item` with a
  `make()` factory, and give each new stage a `LOOKS` entry.

### Generic vs domain-specific

- **Domain-neutral, reusable as is:**
  - the ladder palette and pulse (`progress.ts` colours, `RUNG_COLOR`, `ACTIVITY`,
    `progressPulse`), the off-ladder marks (`marks.ts`), the motion clock (`motion.ts`)
  - the lighting and 3D kit (`lit.ts`, `hull3d.ts`), the paint pipeline (`paint.ts`), the skies
    (`nebula.ts`), the quad and shader helpers (`quad.ts`, `glsl.ts`)
  - the black hole, the galaxy shader, loading energy, the hero aura, the accent effect primitives
    (`effects.ts`)
  - the ship hull and livery catalogue, the avatar colours, the Load-more beacon, the ghost outline,
    the stale badge
- **Neutral in shape, ADO in names and meaning:**
  - `StarView`, `PlanetView` and `AnomalyView` take a stage string, but decode it through
    `signalOf`, whose table is keyed by ADO-derived stage names (`feature.*`, `story.*`, `bug.*`,
    `task.*`, `flight.*`).
  - The pod star reuses `feature.*` stages for an aggregate (`sprints.ts:76-85`).
- **ADO- or SDLC-specific:**
  - `FlightView` and its PR meaning (the `flight.active/completed/abandoned` literals); stations as
    repositories.
  - `TaskDotView`, which switches on literal `task.*` stages (`infrastructure.ts:438-462, 469-490`).
  - The radar bands (`layout.ts:122-127`), board columns (`board.ts:58-64`), vocabulary
    `KINDS`/`LOOKS` (`vocab.ts:9-75`) and the PR caption tables.
  - The sizing code's title cap, derived from ADO type and state names (`sizing.ts:93-103`).

### Coupling and pain points

1. **The stage → rung mapping is written at least five times:**
   - `art/progress.ts:30-65` (`SIGNALS`)
   - `src/shared/scene/board.ts:58-64` (`columnOf`, which matches stage *suffixes*)
   - `src/shared/scene/layout.ts:122-127` (`radarBand`, literal `task.*`)
   - `src/shared/hierarchy/sprints.ts:76-85` (`podStage` emits `feature.*`)
   - `vocab.ts:LOOKS`, plus PR captions in both `vocab.ts:FLIGHT_MEANING` and
     `Gallery.tsx:PR_STATES`

   `Rung` and `Signal` live in the renderer, so `src/shared` can't import them, and re-derives them
   from strings.
2. **PR stages aren't in the mapping file.** `stage: \`flight.${pr.status}\`` is built in
   `project/traffic.ts:107`. Stations use the placeholder `'station.active'`, captains use
   `'captain'`, galaxies `'galaxy'`, and the beacon `'loadMore'`. None of these is in `SIGNALS`, so
   `signalOf` reports them all as unknown; the views happen to ignore `setStage`.
3. **The art kind is chosen in several places, two ways.** `child.kind === 'story' ? 'planet' :
   'anomaly'` (`backlog.ts:82,116`) vs `wi.kind === 'bug' ? 'anomaly' : 'planet'`
   (`backlog.ts:128`, `sprints.ts:108`). The two disagree for any child that is neither a story nor
   a bug (inferred).
4. **The factory is a hard-coded switch** (`GraphScene.ts:859-871`) that mixes choosing the layer
   (geography, infrastructure or traffic) with construction. Its `default` silently draws a
   `TaskDotView`, for example for `trayItem` and `sector`.
5. **"Celestial vs mechanical" is decided separately in five places:**
   - the layer choice in `GraphScene` (`859-871`)
   - `MOVING_KINDS` (`GraphScene.ts:69`)
   - `BODY_KINDS`, `FLARE_KINDS` and `TARGET_KINDS` (`fx/timing.ts:76,93,102`)
   - `ChartApp.ts:690` (energy kind; anomaly → `'planet'`)
   - `Gallery.tsx:200` (an `instanceof` chain)
6. **Capabilities are detected with `instanceof`.** `face()` is called after
   `instanceof ShipView || FlightView` (`GraphScene.ts:212-216, 585-591`), and only planets have
   `setLightFrom`. There's no capability interface.
7. **The view interface is declared twice:** `NodeViewLike` (`GraphScene.ts:17-24`) and `ArtView`
   (`Gallery.tsx:22-30`). `marks` is a `Graphics` in the body views but a `Container` in
   `GhostView`.
8. **The white dwarf survives in layout.** The docs retired it (09 §6), but `system.ts:21` and
   `field.ts:40` still shrink closed stars, and the stage is still named `feature.whiteDwarf`.
9. **Dead uniforms and flags, and doc-only marks:**
   - The planet's `uGrid` is declared and set but never read by the shader
     (`planet.ts:24,198,218`).
   - `flags.reopened` and `flags.uncertain` leave no lasting mark on a body; only edges dash when
     uncertain (`GraphScene.ts:942,1048`).
   - `BeaconView` is still built, although 06 §4 says beacons are off.
10. **Shader boilerplate is repeated.** Star, planet and anomaly each carry the same
    uniform-assignment, `uSignal.set(rgb(...))`, `tick` and `destroy` code (`star.ts:140-162`,
    `planet.ts:215-247`, `anomaly.ts:142-163`), and each fragment shader copies the ghost
    desaturation.
11. **Colour constants are redeclared per file.** IVORY, INK, CYAN, GOLD and BLUE appear in
    `marks.ts:6-7`, `infrastructure.ts:9-11`, `loadmore.ts:7-9`, `GraphScene.ts:97-103` (copies of
    the ladder's gold and blue) and `lit.ts`.
12. **Guides live inside `GraphScene`.** The stale badge, routes, motes, orbits, board and radar
    guides are drawn inside the 1,100-line `GraphScene` rather than as assets, so the gallery can't
    show them.

> **While the survey ran,** `GraphScene.ts` shrank from 1,243 to 1,149 lines and a new
> `scenes/placement.ts` appeared. Line numbers for that file may drift.

### Candidate abstractions (sketch)

This sketch builds on what already exists: `Signal`, `NodeViewLike`, `LevelDef.backdrop`, and the
seed helpers.

```ts
// shared, pure: the domain adapter supplies this; art never sees ADO names
type Rung = 'ready' | 'underway' | 'nearing' | 'accomplished' | 'off';
interface Signal { rung: Rung; sketch?: boolean; step?: number; deferred?: boolean; ghost?: boolean; strike?: boolean; unknown?: boolean }
interface DomainMapping { signalOf(entityType: string, rawState: string): Signal; assetFor(entityType: string): AssetKind }

// renderer: one registry instead of a switch and instanceof chains
type AssetKind = 'galaxy' | 'star' | 'planet' | 'anomaly' | 'pin' | 'station' | 'vessel' | 'ship' | 'beacon' | 'ghost' | 'overflow';
interface AssetView {
  readonly root: Container; readonly marks?: Container;
  setSignal(s: Signal): void;           // replaces setStage(stage: string)
  tick(t: number): void; destroy(): void;
  face?(dir: 1 | -1): void; setLight?(x: number, y: number): void;
}
interface AssetDef {
  kind: AssetKind; layer: 'celestial' | 'hardware';   // decides the paint filter and z-layer
  moves: boolean; flares: boolean; energy?: EnergyKind;
  make(r: number, seed: number): AssetView;
  gallery?: { title: string; samples: { seed: number; signal: Signal; face?: 1 | -1 }[] };
}
const ASSETS: Record<AssetKind, AssetDef> = { /* … */ };
```

- **One source for rungs.** The rung, board column, radar band, flare size and gallery rows would
  all come from `Signal`. Only `DomainMapping` would know names like `story.terraforming` or
  `flight.active`. `state-mapping.json` becomes one pack's data, with the PR states added to it.
- **A lifecycle per asset.** Each `AssetDef` declares its transformations: sketch → solid → rung
  looks → accomplished ornament. The off-ladder overlays (shared `marks.ts`) and the stale and
  reopened badges become generic flags. The swap dip, flare and Arrive/Depart are already generic in
  `GraphScene` and the director; they would key on `AssetDef.moves/flares` instead of kind sets.
- **Seeds.** Keep `artSeed(key, ART_VERSION)` for things and `shipSeedFor` for people. A
  `DesignCatalogue<T>` (hulls × liveries; trains × cargo × hulls; stations × accents) could share
  the seed → index decoding and the bake caches that `ships.ts` and `infrastructure.ts` already use.
- **Gallery.** Generate the sections from `ASSETS[*].gallery`, crossed with each rung. Move guide
  art (routes, lanes, radar, stale badge) into small `GuideView`s so the gallery can list them too.

---

## Motions, effects and maneuvers

This section covers how v0 shows change over time, in three layers:
- **A shared, pure pipeline** (`src/shared/playback/`, `src/shared/replay/`) turns events into timed
  beats and planned accents.
- **A renderer director** (`src/renderer/src/chart/fx/director.ts`) turns each plan into *effects*
  (short-lived Pixi objects) and *moves* (effects that steer a node).
- **The scene's glide layer** (`src/renderer/src/chart/scenes/GraphScene.ts`) carries every other
  change of place.

Specs: `docs/05-playback.md` §1–7, `docs/06-visual-brief.md` §5 and §7, and INV-12 and INV-15 in
`docs/02-domain-rules.md`.

### Effects

**Tiers** (05 §5) are gated by the volatility meter (see *Playback pipeline* below):
- **E (essential)** always plays.
- **N (narrative)** plays unless the scene is overloaded (≥16). When the scene is busy (≥10) it's
  rationed, unless Activity is Maximum.
- **O (ornament)** plays only when the scene is calm (<5).
- **Scene**: owned by `GraphScene` and never cut.
- **UI**: shows app state rather than events.

| Effect | What it tells the viewer | Triggered by | Code | Tier | Reduced-motion substitute |
|---|---|---|---|---|---|
| Stage flare (small, medium, grand gold) | An item moved up a rung of the ladder; the flare grows with the step | `wi_state_changed` → `stageShift.*` | `fx/effects.ts` `Flare`; `flareFor` at `director.ts:56` | E (the sparks on lesser flares are O) | A static ring in the rung's colour (`director.ts:432`) |
| Stage swap dip | The new look arrives with its cause (a 0.5 s brightness dip) | Any stage change that has an accent | `GraphScene.claimStage/landStage` (`GraphScene.ts:513-520`) | E | Swaps at once |
| Reverse flare (`Implode`) | A reopen: the gold contracts back to the earlier rung | `wi_state_changed` from Completed back out | `effects.ts:394`; `director.ts:609` | E | Ring |
| Task dissolve | A Task was removed from the radar | `stageShift.task` to an off-ladder stage | `director.ts:625-633` (`Ring` plus a grey `Flare`) | E | Ring only |
| Tractor beam | "This person works on this thing": assisting, never attacking | The actor's or the subject's change on any event of Medium priority or higher; `shipAction` | `effects.ts:488` `Tractor`; `beamFrom` at `director.ts:516` | N | Off |
| Support stream | Approvers enabling the author | `pr_completed` with `approvedBy` | `effects.ts:559` `Support`; `director.ts:957-960` | E (part of the formation) | One ring per approver |
| Tell: ship turn and engine glow | A ship is about to fly | The lead-in before an accented beat | `fx/ships.ts:125` `ShipTell`; `director.ts:302-346` | N (none when busy) | Off |
| Tell: rim or bay glow | A body is about to change, or a station is about to launch | The lead-in before `stageShift.*` or a launch | `fx/moments.ts:64` `GlowTell` | N | Off |
| Echo spark and parent ring | A completion reaches the parent. It's an accent only: the parent's state doesn't change (INV-05) | A stage change into Accomplished | `effects.ts:429` `Spark`; `echo` at `director.ts:451` | N (at most 3 when busy) | Off |
| Orbit ink and fade | A parent link was made or broken | `link_parent_added/removed` | `effects.ts:256` `Ink`; `director.ts:656-686` | N | The edge is released at once |
| Route ink and retract | A PR was linked to, or unlinked from, work | `link_pr_added/removed` | `Ink`; `director.ts:687-700` | N | Released at once |
| Intent line | A launch announces where the vessel will go | `pr_opened` | `effects.ts:620` `Intent`; `director.ts:724` | N | The route is revealed directly |
| Bay ring (blue) and station power-up ring | A launch began; a new repo station appeared | `pr_opened`; a scene diff (`stationPowerUp`) | `Ring` at `director.ts:740`, `:801-805` | E | The same ring |
| Dock grand flare and gold bay flash | A PR merged | `pr_completed` | `director.ts:758-763` | E | Ring |
| Withdraw (lights out, grey ring) | A PR was abandoned (quietly, per INV-19) | `pr_abandoned` | `fx/moves.ts:199` `Withdraw`; `director.ts:775-783` | E | Ring only |
| Arrival ring | A ship has settled after flying in | `captainJump`, or a guest or resident flying in | `director.ts:1021` | E | Fade (`FadeIn`, 0.3 s) |
| Departure streak | A ship left the scene | `wi_assignee_changed` (the ship is gone after the diff) | `moves.ts:236` `Departure` | E | None; only the trail |
| Jump trail, with "→ destination" and **Go** | Where the ship (or a body) went; it can be followed | `captainJump`, a reparent out of the scene, an area move | `fx/trails.ts:13`; `leftScene` at `director.ts:567` | E (lasts `TRAIL_MS`, 14 s of schedule time; at most 3) | A static line and label |
| Seed rings | Something is about to emerge here | `wi_created` → `emerge.*` | `director.ts:642-648` | O | Off |
| Sector glyphs (glint, specks, spoke) | A change inside a system, seen at sector scale | Any descendant event in a `field` layout | `effects.ts:692` `Glyph`; `pulseFeatureOf` at `director.ts:541` | E | Off |
| Sector pulse wash | Something changed in this sector (at most one per beat) | The same | `Ring` at `director.ts:550` | E | A static ring |
| Star bloom | A Feature got its first child | A scene diff (0 → 1 orbit edges) | `director.ts:806-811` | E | Ring |
| Eclipse shadow | A body passes in front of another on a board ring | `OrbitTravel` with no free neighbouring ring | `moments.ts:9`; `director.ts:875` | E | Not applicable: moves snap |
| Label flash | Names the Task that just moved or appeared | `stageShift.task`, `emerge.task` | `host.flashLabel` at `director.ts:606` and `:640` | E | The same |
| Recap bloom | What was accomplished in the range, in the order it finished | Playback reaches the end while playing | `director.recap` at `director.ts:353`; `playback.ts:456` | O (waits up to 4 s for calm) | Rings |
| Dawn sweep | Ambient: the night ended. It carries no event | The ruler crosses 07:00 local time | `ChartApp.dawn/drawDawn` at `ChartApp.ts:445` and `:997` | O | Off |
| Arrive / Depart | A body entered or left the scene, for any reason | The scene's enter/exit join: `emerge.*`, `sectorRekey`, a data stream, a removal | `GraphScene.arrive/depart` at `GraphScene.ts:741` and `:760` | Scene (12 full motions per second, then 0.3 s fades) | A 0.3 s fade |
| Hero aura | Who you are following | Follow state, plus an entrance as play starts | `fx/hero.ts:26` `HeroAura` | UI | A steady halo and ring |
| Loading energy (galaxy arms, star corona, planet aurora, black-hole swirl) | Something is loading for this object | Load progress from `nav.ts` (`explore`, `cosmosEnergy`) | `fx/explore.ts:186` `EnergyFx`; `ChartApp.ts:759-830` | UI | One still frame |
| Cargo motes and other ambient motion | An open PR is under way; the world feels alive | State, not events | `GraphScene.drawSwarm` (`GraphScene.ts:~886`); 06 §7 | Ambient (never implies an event) | Steady |
| `Beam` (a thin line) | The old "laser". No longer created | None | `effects.ts:348` (still counted in `volatility()` and `census()`) | — | — |

### Motions

| Motion | What moves | Driven by | Code |
|---|---|---|---|
| Glide layer: a critically damped spring, τ ≈ 0.3 s | Every node whose layout target changed on a beat or data update. It snaps on a seek or on entering a scene | `GraphScene.apply(graph, 'beat' \| 'data' \| 'jump')` | `GraphScene.ts:177-223`, `:362-421` |
| Pursuit: a quadratic arc toward the live `goalOf` | Ships flying to new work; reparented bodies; launching and berthing vessels | The director's `move()` → `Pursue` | `moves.ts:15`; `director.ts:245-276`, `:820`, `:1014` |
| Arrival from out of view (ease-out, with a wake) | A ship that's new to the scene, or one that's engaged | `captainJump`, an engaged actor | `director.ts:1015-1025` |
| Departure out of view | A ship whose assignment went elsewhere | `captainJump` diff | `moves.ts:236`; `director.ts:1027-1041` |
| Orbit travel along a ring, bowing out to pass | A board body moving within its lane's ring; a ship on its home track | The diff of position before and after | `moves.ts:76` `OrbitTravel`; `director.ts:848-882`, `:1006-1012` |
| Radar ping: collapse, run the spoke, re-expand | A Task dot changing band | `stageShift.task` | `moves.ts:145` `RadarMove` |
| Arrive / Depart along the orbit, through about 40° of arc | Galaxies, stars, planets, anomalies, Tasks | The scene join | `GraphScene.ts:53-73`, `:741-800` |
| Launch undock: held at the bay, then `easeUndock` | PR vessel | `pr_opened` | `director.ts:730-737` |
| Berth | PR vessel | `pr_completed` | `director.ts:930` |
| Formation escort: gather → hold slot → return home | Resident crew ships | `pr_completed` with approvers | `ships.ts:14` `Escort` |
| Guest ship: in, beam, out (no trail) | A person with no ship in the scene | The formation; `summon` under Activity | `ships.ts:57` `GuestShip`; `director.ts:492-515` |
| Hold / freeze | The cast, held in place during a stagger or a protected moment | `Hold`, `Protect` → `scene.freeze/thaw` | `moves.ts:125`; `moments.ts:42` |
| Facing (nose toward the work) | Ships while beaming; vessels toward their station | `faceView/restoreFacing` | `director.ts:986-987`; `GraphScene.ts:208-213` |
| Scene transition (zoom in or out, plus a grid wipe) | Camera | Navigation | `ChartApp.ts:244-276`, `:652-671` (700 ms; 150 ms under reduced motion) |
| Frame the action (pan or zoom out, never in) | Camera | A High beat's lead-in, when its objects are off screen | `ChartApp.frameAction` (`ChartApp.ts:332`, 700 ms); `playback.ts:294` |
| Follow camera (a working-set ratchet; the whole system at 55%) | Camera | The lead-in and landing of each story beat | `ChartApp.followFrame` (`ChartApp.ts:366`, 900 ms); `playback.ts:283` |
| Camera hold around a click | Camera (held still) | Pointer down, plus 1.5 s after release | `ChartApp.ts:319-326` |
| Reveal, reset view, explore nudge | Camera | A search or In view pick; key 0; a load starting | `ChartApp.ts:294`, `:843`, `:781` |
| Measured motion | All effects | Playback rate: travel ×r; accents and pulses ×min(r, 2); jiggle ÷r | `art/motion.ts:20-26`; `director.ts:184` |

### Maneuvers (choreographies with several objects)

Each maneuver follows the story grammar in 05 §5: **tell → act → land → echo**.

1. **A ship goes to its work and stays.** It rests where its captain last worked, by `changedBy`,
   never by assignment (INV-07).
   - *Tell:* `ShipTell` turns the ship and warms its engines.
   - *Act:* one `Pursue` flight (`MOVE_S`, 1.8 s), or a glide if the move is under 60 px.
   - *Land:* the `Tractor` beam engages for 1.6 s, and the change shows `TRACTOR_LEAD_S` (0.5 s)
     later.
   - *Echo:* the parent rings if the item was completed.
   - Code: `beamFrom` → `flyCaptains`, `director.ts:516-534` and `:975-1026`. The resting place
     itself comes from projection, not the director.
2. **A stage shift, with a radar ping.**
   - *Tell:* `GlowTell` in the colour of the coming rung.
   - *Act:* the actor's beam, then `RadarMove`.
   - *Land:* the `landStage` swap plus a flare.
   - *Echo:* a `Spark` to the parent's edge, and one ring per parent per beat.
   - Code: `director.ts:592-634`. A wave of two or more Tasks shares one delay, and the beat
     stretches to `GROUP_BURST_MS` (2,400 ms; `schedule.ts:182-183`).
3. **A launch (PR opened).**
   - *Tell:* the bay glows.
   - *Act:* the intent line inks out to the lane slot while the vessel waits, then the vessel
     undocks and consumes the line. The author's ship flies to meet it and takes it in a tractor
     beam.
   - *Land:* the route inks on to the linked work.
   - *Echo:* cargo motes start (ambient).
   - Code: `director.ts:701-744`.
4. **The review formation** (a merge with approvers; a protected moment of 5.1 s).
   - *Gather* (`GATHER_S`, 1.2 s): the author takes the point above the vessel, and the reviewers
     take the wings of the V. Resident ships `Escort`; guests fly in.
   - *Act:* `Support` streams flow into the author. The author's `Tractor` starts 0.4 s later.
   - *Land:* the vessel berths (`BERTH_S`, 1.0 s), then the grand flare and the gold bay flash.
   - *Disperse:* after 0.9 s, over `LEAVE_S` (1.0 s), guests leave out of view and residents return
     home.
   - Code: `director.ts:894-967`, `ships.ts`. `Protect` holds the vessel and crew still
     (`director.ts:421-429`).
5. **A captain jump** (a reassignment).
   - *Tell:* the ship turns and its engines glow.
   - *Departure side:* a `Departure` streak, then a `JumpTrail` with Go, which follows the captain.
   - *Arrival side:* a streak in from the edge, then an arrival ring and the beam.
   - Code: `director.ts:652-655`, `:1015-1041`.
6. **A guest visit** (Activity set to Lively or Maximum). A person with no ship in the scene arrives
   as a guest (1.0 s), beams the item, and leaves. It's capped by `maxGuests`
   (`director.ts:492-515`).
7. **Leaving the scene** (a reparent or an area move). Depart, plus a grey contracting ring, a
   `Spark` streak, and a jump trail to the new parent or sector (`director.ts:567-577`, `:676-684`,
   `:784-793`).
8. **A board pass.** A body travels its ring and either bows out to an empty neighbouring ring or
   eclipses the bodies it passes (`director.ts:848-882`).
9. **A closing, as a protected moment.** A Story or Bug closing holds the body and the closer's
   ship. A Feature closing holds its whole system (`protect.ts:52-60`).
10. **The recap bloom.** At the end of play, up to 14 accomplishments flare 220 ms apart, in the
    order they were completed. When following, only the captain's own (`playback.ts:456-484`).
11. **A bug outbreak.** This exists only as a fixture scenario (`fixtures/scenarios/bug-outbreak.ts`).
    It has no choreography of its own; it plays as a series of `emerge.bug` Arrives and stage flares
    (inferred from code).

### Playback pipeline

```
ScopeHistory (events, sorted)
  └─ buildScene / buildHighlights / storyOf filter (highlights.ts:49-61, follow.ts:80)
      └─ buildBeatSchedule (schedule.ts:142)
           focus → group (same instant, or same focus within 30 min) → priority
           → duration = protectBeat(...)  (protect.ts:84) ≥ accentFor(...).durationMs
           → gaps: clamp(500+450·log2(1+weighted hours), 500, 2500)
           → ORIENT 1200 + … + FINAL_HOLD 1200
           → budget 45 s: squeeze gaps (binary search), then de-accent the lowest non-High beats
           → piecewise-linear toSource / toPresentation / stateUtc
  └─ PlaybackClock (clock.ts) .advance(wallMs·rate, clamped to 100 ms) → Advance{crossed, seeked}
  renderer frame (playback.ts:225)
     ├─ followGate → leadIn (≤ LEAD_MS 700 before the next accented beat):
     │      planAccents(next) → director.tell; frameBeat / followBeat (the camera moves first)
     └─ applyBeats: refresh('beat') → snapshotAt(stateUtc) → projectScene → GraphScene glides
            accentBeat(adv) = the latest accented beat crossed (INV-15)
            plan = planAccents(beat, before, after, eng) + lightActions(other crossed beats)
            → ChartApp.playBeat → director.queue → spawn on the next frame (after layout)
```

- **Three clocks** (05 §1):
  - Source time: what is true, from `snapshotAt`.
  - Schedule time: `clock.x`, advanced at the playback rate.
  - Wall time: effects and the camera. Effects scale per kind through `motion` (`art/motion.ts`).
- **Pace budget.** `BUDGET_MS` is 45,000, or `HIGHLIGHT_BUDGET_MS` 30,000 for Highlights
  (`constants.ts`). High beats are never cut (`schedule.ts:209-217`).
- **Protected moments** are computed purely, by `protectedMoment`, `movesCast` and `protectBeat`
  (`protect.ts`). Their offsets go into the plan as `afterMs` and `protect`. The renderer enforces
  them with a `Protect` effect that holds the matching nodes still, and `move()` defers any other
  mover until the window ends (`director.ts:245-288`).
- **Volatility meter.**
  - Weights (`director.ts:126-138`): flights and pings 1.5, grand flares 3, other flares 1, tractor
    and support 1, lines 0.5, rings 0.25, each gliding node 0.3, plus 0.6 for each planned accent at
    spawn.
  - Marks: CALM 5, BUSY 10, OVERLOAD 16 (`timing.ts:67-71`).
  - The `ENGAGEMENT.ignoreLoad` flag lets beams and tells bypass the meter (`engagement.ts`).
- **Other budgets.**
  - `MAX_ACTIVE_FX` (24) cuts the oldest decorative effect first. Moves, holds, ink, beams and the
    grand flare are never cut (`director.ts:219-238`).
  - Ducking: while a grand flare bursts, other effects dim to 40%, and only one grand flare bursts
    at a time (`director.ts:198-200`, `:437-441`).
- **Stagger.** Accents start in the order Feature → Story or Bug → Task → PR, 0.4 s apart, using
  `hier.rankOf` (`director.ts:413-419`). Activity adds a stagger per ship (`engagedAt`).
- **Skipping accents (INV-15).**
  - At most one accented beat plays per frame (`accentBeat`, `clock.ts:110-115`).
  - A seek, a lens change or a scene change calls `director.clear()`. It destroys every effect, tell
    and trail, and releases held edges, held nodes and pending stages (`director.ts:100-112`).
    `GraphScene` snaps and ends any Arrive or Depart (`apply(..., 'jump')`).
  - Step ▶ uses `stepTo`, so only the target beat accents.
- **Follow mode.**
  - `storyOf` filters the schedule to the captain's events.
  - `storyAnchors` supplies the follow bar's text and notes.
  - `ChartApp.followFrame` runs the ratchet camera, and `HeroAura` marks the followed ship.
  - Following never travels out of the scene; when the story leaves, a note says so instead.
- **Determinism.**
  - `snapshotAt(history, t, lens)` is a pure fold over a prefix of the events, with checkpoints every
    256 events (`replay/snapshotAt.ts:1-12`). Schedules are golden-tested.
  - Everything visual is a function of `stateUtc(x)`. Effects only decorate the change between two
    snapshots.

### Generic vs domain-specific

- **Already domain-neutral:**
  - `PlaybackClock` (`clock.ts`); the schedule's layout, gap, budget and segment maths
    (`schedule.ts:18-127`, `:193-233`); the `ENGAGEMENT` levels; `snapshotAt`'s checkpointed fold.
  - The `Fx` interface, `Anchor` live points and `After`.
  - The effect primitives: `Pursue`, `OrbitTravel`, `Hold`, `Ring`, `Flare`, `Ink`, `Spark`,
    `Tractor`, `Support`, `Streak`.
  - The glide spring, Arrive/Depart, volatility, ducking, the effect cap, measured motion, the
    camera controller, frame-the-action and the follow ratchet.
  - The hierarchy hooks (`focusOf`, `rankOf`, `stageOf`, `closeUpOf`), which are already the seam
    for "which scene and level owns this".
- **Tied to ADO event kinds or vocabulary:**
  - `accentFor` (`accents.ts:40-64`) maps each `EventKind` to an accent, and `stageShiftMs`
    hard-codes the raw ADO states `'Closed'`, `'Active'`, `'Ready to Accept'` and `'Resolved'`
    (`accents.ts:25-38`).
  - `protectedMoment` and `movesCast` know `pr_completed`, `wi_*` and `link_*`
    (`protect.ts:41-76`).
  - `actionTarget` and the `planAccents` switch (`plan.ts:49-61`, `:97-129`).
  - `focusOf`'s `pr_` and `link_pr_` prefix tests (`schedule.ts:63`); the `touches` payload field
    names (`highlights.ts:38`); the `storyOf` switch (`follow.ts:98-110`); `describeEvent` and
    `storyLine` (`describe.ts`).
  - The recap's `wi_state_changed || pr_completed` check (`playback.ts:465`).
  - In the renderer, the director's switch on accent names and node kinds (`'captain'`, `'flight'`,
    `'station'`, `'missionPoint'`). The formation is specific to PR review by construction.

### Coupling and pain points

1. **One 1,064-line director with a closed switch.** `spawn` (`director.ts:379-841`) is a long
   function full of closures that switches on accent names. Adding an accent means editing the
   switch, plus `volatility()` (`:126-138`), `cuttable()` (`:220-222`) and `census()` (`:144-157`),
   which are all `instanceof` lists. Effects don't declare their own weight, cuttability or tier.
2. **Event meaning is split between shared and renderer.** Shared plans accents per event kind, but
   the renderer derives accents from scene diffs: station power-up, star bloom, reparent arcs
   (`director.ts:800-822`), as 02 §4 specifies. The recap's choice of what to show also lives in the
   renderer (`playback.ts:456-484`).
3. **A protected moment's cast is described twice.** Shared expresses the cast as people, entities,
   lane and whole (`plan.ts:42`). The renderer re-interprets "lane" as `n.kind === 'flight'` and
   people as `kind === 'captain'` (`director.ts:427`). The window is in schedule ms at 1×, but
   `Protect` ages on the accent clock (min(r, 2)) (`moments.ts:42-63`), so above 2× the moment
   outlasts its beat. 05 §5 accepts this.
4. **The lead-in plans the beat twice.** `leadIn` calls `snapshotAt`, `projectScene` and
   `planAccents` for the next beat (`playback.ts:438-440`), and `applyBeats` plans it again when it
   arrives (`:266-269`). The director's `told.beams` set is written but never read
   (`director.ts:82`, `:308`).
5. **Dead or vestigial code:**
   - `travel()` always returns `false` (`playback.ts:320-337`), so `holding` (`:44`, `:227-230`,
     `:362`) can never become true.
   - `followAnchors` and `latestAnchor` (`follow.ts:25-65`) have no caller under `src/`.
   - `Beam` is never created but is still counted.
   - There are orphaned doc comments at `director.ts:67-74` and `:884`. The one at `:74` still says
     "backs off a touch", although back-off was dropped.
6. **Duplicated constants:**
   - `DEPART_S` in both `timing.ts:14` and `GraphScene.ts:61`; the same for `ARRIVE_S`.
   - `SIDE_PANEL_PX` (`timing.ts:96`) vs `INSPECTOR_WIDTH` (`ChartApp.ts:72`).
   - Dawn hard-codes 07:00 and the local `Date` (`playback.ts:447-453`) instead of using
     `WORKDAY_START_HOUR` and `TZ` (`constants.ts`, `schedule.ts`).
   - The wall-time delta is clamped twice (`ChartApp.ts:952`, `clock.ts:105`).
7. **Magic numbers inside the choreography.**
   - The `authorBeam` duration of 450 ms (`plan.ts:125`).
   - The formation's slot geometry: `2.6`, `3.4` and `2.2` × the ship's radius
     (`director.ts:906-914`).
   - The guest `reach` of 260 px and the exit `reach` of 220 px (`:500`, `:977`).
   - Stage durations live in shared, but the timings of their sub-phases live in `timing.ts`, and
     nothing checks that the sub-phases add up to the beat's duration (inferred risk).
8. **Two arrival systems.** `GraphScene.arrive` owns body arrivals, and the director owns ship
   arrivals and departures with its own budget. Both are "Arrive", with different rules, caps and
   reduced-motion handling (`GraphScene.ts:53-73` vs `director.ts:1015-1041`).
9. **Global mutable motion state.** `motion` is a module singleton set once per frame
   (`art/motion.ts:7-26`), and effects read `motion.reduced` throughout. Test mode forces Activity
   to Calm (`renderer/src/engagement.ts:9`), so the default Maximum behaviour is covered only where
   a spec opts in (inferred).
10. **The renderer's playback state is module-level.** `chart`, `clock`, `toldIndex`, `framedIndex`
    and the rest are module-level `let`s (`playback.ts:32-46`), reset by hand in four places
    (`:114-118`, `:136-139`, `:488-491`, `sceneChanged`).

### Candidate abstractions (sketch)

- **An `EventAdapter` per domain.** It supplies `priority`, `focus`, `accentFor`,
  `actors(e) → {actor, subject}`, `touches`, `storyOf`, `describe` and `protectedMoment`. The
  switch statements in `accents.ts`, `plan.ts`, `protect.ts`, `highlights.ts`, `follow.ts` and
  `describe.ts` become one table per domain (SDLC, todo, CRM). The schedule, clock and budget stay
  generic.
- **Effects as commands.** Extend `Fx` with declared metadata:
  `{ tier, weight, cuttable, clock: 'travel' | 'accent', reducedSubstitute() }`. `volatility()`,
  `cuttable()` and `census()` then read the metadata instead of `instanceof` lists. `Anchor` (a live
  point) stays the targeting primitive.
- **Motions as commands over a node.** `Pursue`, `OrbitTravel`, `RadarMove`, `Escort`, `Hold` and
  Arrive/Depart already share a contract: own the node (pk), `placeAt`, read `goalOf`, release.
  Making that contract explicit as a `MoveCommand` would let Arrive/Depart and ship flights share
  one budget and one reduced-motion rule.
- **A maneuver as a composite with a beat script.** For example:
  `{ roles: {lead, supporters, target}, cast, phases: [tell, gather, act, land, echo, disperse] }`,
  where each phase lists the commands it emits and its offset.
  - `formation()`, the launch chain, ship-to-work and the captain jump each map onto this one to
    one.
  - `protectBeat` would read the maneuver's own `windowMs` and `cast`, instead of re-deriving them
    from event kinds.
  - The phases' total can then be checked against `durationMs`.
- **A plan is data, run in one place.** `planAccents` would emit maneuver instances with role
  bindings (actor, subject, target, parent, station) instead of accent names plus optional fields.
  The director becomes a generic interpreter: it resolves each role to a projected node, checks the
  tier, and schedules the commands. Domain art (ships, vessels) plugs in through a role → node-kind
  mapping, not through switch cases.

---

## Game mechanics and rules

### Mechanics catalog

| Mechanic (board-game term) | How v0 expresses it | Rule or invariant source | Code |
|---|---|---|---|
| **Nested map with zoom tiers** (TI's galaxy → system; Stellaris's galaxy → system view) | A fixed root (a galaxy grid of projects), then a chain of three levels: field (sector), system (star system), radar (close-up). Each level is its own scene, with its own backdrop and transition time | 02 §2 "Two hierarchies"; 06 §3 | `src/shared/hierarchy/types.ts:99-132`, `chain.ts`, `scene/project/galaxy.ts` |
| **Area control / territory** | A sector is defined by its members: Features whose *own* Area Path is under the saved path, or the children of an Epic. A Feature can be in several territories at once and is still one entity. A Feature that changes area moves territory at that source time (`sectorRekey`). Sector colour means only "recent recorded activity" | 02 §2, INV-09, INV-19 | `backlog.ts:48-93` (`sectorFeatureOrder`, `sectorSource.member`) |
| **Rounds** | A sprint is the round. Its start and its finish (or now) are the playback range, and its whole history loads with it. Membership is "ever in the sprint" (the `EVER` query). Carry-overs keep their slot and leave; mid-sprint additions arrive | 02 §2, INV-10 "Ever in the sprint" | `sprints.ts:47-68` (`podOrder`), `sprintsUi.ts:18-28` |
| **Worker placement** | One ship per captain per scene. It sits where its captain *last worked* (`changedBy` or PR authorship), never where they're merely assigned. With no activity yet, it sits at an assignment (a body before a Task; the one held longest). On a board it rests on its owner's lane, and goes elsewhere only for 6 source hours after working there | INV-07, INV-08; 91 "BOARD numbers" | `scene/project/traffic.ts:165-274` (`activityAnchors`, `homeOnTrack`, `projectCaptains`), `board.ts:41-42` |
| **Player mats / swimlanes** | A star system is laid out like a kanban board. Each ring is one person's lane (A–Z by name, Unassigned last), headed by their avatar. A lane exists only for people whose work shows in the scene during the range | INV-14 (board amendment); 08 §6 | `board.ts:171-293` (`boardFrame`), `board.ts:393-410` (`boardGuides`) |
| **Progress track** (tech or terraforming rungs) | An item's own `(type, raw state)` maps to a visual stage, then to one of four rungs, which are the board's columns: Ready → Underway → Nearing → Accomplished. Bodies move left to right along their lane as they advance. Accomplished items shrink and tuck to the right after 2 days | INV-05, INV-11; 09 signal ladder | `config/state-mapping.json`, `board.ts:20-64` (`BOARD.columns`, `columnOf`), `board.ts:331-385` |
| **Concentric track** (the radar) | In the close-up, Tasks sit on fixed spokes (each angle from its first-join slot). Their radius is one band per rung: Ready outermost, Accomplished hugging the planet. A state change moves a Task only along its own spoke | INV-14 (Task radar amendment) | `layout.ts:107-176` (`RADAR`, `radarBand`, `radarAngles`), `scene/project/radar.ts` |
| **Fog of war / exploration** | A Feature known only from its current state shows ghost minis, "N items · not yet explored". Entering it starts a load: the star swirls, then opens. The Load-more beacon sits in the next free slot. Objects that couldn't be read are drawn from their last known facts with a stale mark. Items that were never read aren't drawn | 04 §5a; 02 §3 "Inaccessible" | `scene/project/field.ts:45-62, 78-86`, `backlog.ts:84-88, 257`, `ctx.ts:46-47`, `nav.ts:603-627, 735-748` |
| **Hidden information / perspective lens** | `knownThen` (the default) shows only what was true at the playhead. `currentObserved` (retrospective) applies end-of-range links and marks them `uncertain`. Undated facts are Observations and never animate | INV-02, INV-03; 02 §6 | `ctx.ts:88-91` (`linkUncertain`), `layout.ts:34-44` (observed children take the last slots) |
| **Event deck / timeline** | A fixed catalog of event kinds, each with an accent and a priority (high > medium > mediumGroup > low). Replay applies events in `(occurredAt, precedence, eventKey)` order. Low-priority beats are cut to fit the budget; high beats never are | 02 §4, §5; INV-15 | `src/shared/priority.ts`, `src/shared/playback/` |
| **Logistics / trade routes** | PRs are cargo flights from their linked work to a repo station. Stations appear only where a real link exists. Vessels ride a PR lane, and merged ones dock. A Task's route continues to the Task's real parent | 02 §3, INV-06, INV-10 | `traffic.ts:11-156` (`projectTraffic`, `prLane`, `stationStep`) |
| **Holding area / reserve** ("uncharted") | Items whose parent chain doesn't reach a member go to a tray chip, never to an invented home: Backlog's "Uncharted / No Feature parent", Sprints' "Outside the pods". PRs with no readable link go to the repo's Unlinked tray | INV-10 | `backlog.ts:216-230`, `sprints.ts:221-231`, `projectScene.ts:20`, `panels/Trays.tsx` |
| **Fixed board setup / stable seating** | Slots come from first-join order over the whole loaded history, never from the playhead. Sector Features sort A–Z by their latest title. The board's frame (lanes, ring sizes, column widths) comes from peaks over the history. Art seeds come from `(key, artVersion)` | INV-12, INV-14 | `layout.ts:11-44` (`firstJoinOrder`, `slotOrder`), `backlog.ts:27-45` (`byTitle`), `ctx.ts:18-20` (`artSeed`) |
| **Leaving play** | Items in a `Removed` category, and deleted items, depart with a motion and leave the scene and the counts. Replay from before the removal still shows them | INV-10 "Removed items leave" | `backlog.ts:19` (`gone`), `sprints.ts:29`, `radar.ts:35` (band null) |
| **Revival** | An item that was once Completed and leaves Completed gets a `reopened` flag (repair marks; the star re-ignites) | 02 §2 "Reopened" overlay | `ctx.ts:75` |
| **Aggregate objective marker** | A pod's star shows its share of the sprint: Accomplished when all is done; Nearing at 75% or more resolved or done; Underway once anything is under way; Ready otherwise; faint when empty. This is the *only* visual driven by an aggregate | INV-05 (pods) | `sprints.ts:76-85` (`podStage`) |
| **Cooperative play, no scoring** | No scores, XP, rankings or leaderboards. Size and colour never encode productivity. In the review formation, approvers fly in to support the author with gold beams, then leave without moving anyone's resting place. Ships use tractor beams and never attack | INV-19, INV-08; handoff, "Ships help; they never attack" | `galaxy.ts:22-26` (recency, never amount), `traffic.ts` (ships), `chart/fx/director.ts` (formation) |
| **Single-occupant shortcut** | A sector, or a sprint, with only one member passes straight through to that member, both on entry and on Back | 06 §3, AC-48 | `types.ts:34`, `backlog.ts:89-92`, `sprints.ts:120`, `nav.ts:692-703, 773-777` |
| **Dependency lanes** | Drawn only when a predecessor/successor link is explicit | 02 §4 `link_dependency_*` | `EdgeKind 'dependency'` in `contracts/view.ts:67` |

### The hierarchy chains

**The builder.** `chain(id).then(level)…build(rest)` (`src/shared/hierarchy/chain.ts:16-43`) puts an
ordered list of `LevelDef`s under the shared root, `galaxy`. It checks four things:
- the chain isn't empty;
- the level ids are unique;
- `galaxy` isn't one of the levels;
- a `radar` level, if there is one, comes last.

It also derives the scene-key codec, in the form `level[:variant]:key` (for example
`sector:area:<key>` or `feature:<key>`; `sceneKey.ts:20-38`). `levels[0]` is the **scope level**,
where a bundle (`ScopeHistory`) is loaded.

**Each `LevelDef`** (`types.ts:81-103`) carries:
- one of three layouts (`field`, `system` or `radar`), with a typed data source for it
  (`FieldSource`, `SystemSource`, `RadarSource`; `types.ts:20-63`);
- a `backdrop` and a `durationMs`;
- `historyScene` (`scope`, `self` or `parent`: which history the player loads);
- `sceneKeys` (what the scene plays);
- an optional `enterLoad` (a load to run before entering: a `feature` explore, or a `focus` stream);
- `vocab`, the breadcrumb words, in both the chart vocabulary and the ADO vocabulary.

**The `Hierarchy`** adds the walks around an item's family: `pathTo`, `labelOf`, `focusOf`,
`closeUpOf`, `stageOf`, `uncharted`, `rankOf` and `sceneForScope` (`types.ts:108-132`).

**The renderer side.** `HierarchyUi` (`renderer/src/hierarchy/types.ts:19-30`) adds the choices that
need the data source: `defaultScope`, the scope level's ▾ sibling menu, and `rescope`. `activeUi()`
chooses Backlog or Sprints from a two-value `paradigm` flag (`renderer/src/hierarchy/index.ts:9-11`).

| | Root | Scope level (field) | System level | Close-up (radar) |
|---|---|---|---|---|
| **Backlog** (`backlog.ts:278`) | galaxy = project | `sector` (variants `area` and `epic`): Features as stars with mini orreries; A–Z; capped at 15 unless loaded by level; Load more | `feature`: the Feature's star at the centre; Stories (planets) and Bugs (anomalies) on the board; Tasks as dots under each body (at most 8); stations; ships | `body`: a Story or Bug, with its Tasks on the radar |
| **Sprints** (`sprints.ts:186`), the default | galaxy = project | `sprint`: pods (saved Area Paths) as stars, in favourite order | `pod`: the pod's star (aggregate stage), with the sprint's members on the board | `body`: the same `bodySource` as Backlog |

**How levels map to scene objects.**
- `projectScene` (`scene/projectScene.ts:17-34`) resolves the scene key to `(def, index, ref)`, then
  dispatches on `def.layout` to `projectField`, `projectSystem` or `projectRadar`.
- It passes the *next* level along, so each node gets
  `zoomTo = hier.format({level: next.id, key})`.
- Sources return `ViewNode`s with `world` set to zero, and the layout fills in their positions.
- The node kinds are a fixed space vocabulary (`contracts/view.ts:64-66`): galaxy, sector, star,
  planet, anomaly, missionPoint, station, flight, captain, assignmentBeacon, trayItem, overflow.
- The tray lists are computed by `hier.uncharted(s, h)`.

### Layout and sizing rules

**Slots** (`layout.ts:11-44`).
- `firstJoinOrder` ranks keys by their first "join" event over the whole history. Items seeded from
  the current state only join at their creation time. Ties go by key.
- `slotOrder` lists children by their first `link_parent_added`. Observed-only children go after
  every dated child.
- The exception (INV-14 amendment): sector Features go A–Z by their latest-ever title (`byTitle`,
  with numeric collation). The cap still keeps the *first to join*.

**The grammar** (08 §2). Every scene reads top to bottom: parent → children → PRs in transit (the
lane) → stations (the resource row). Reading order is top left to bottom right.

**Field (sector)** (`field.ts`).
- Members go in balanced, centred rows of at most 4 (`balancedRows`).
- The pitch is at least 760 × 520 world units, and grows with the widest mini.
- Each mini uses the ring rule with `MINI_FORMATION`.
- A Load-more beacon takes the next free slot.

**Galaxy** (`galaxy.ts`).
- Projects are ordered pinned first, then by your own recent activity, then A–Z.
- Columns = min(8, ⌈√(1.6n)⌉), in full rows (`gridRows`).
- A project with nothing saved or recorded is drawn "quiet": the same size, dimmer.

**System as a board** (`board.ts`; `SYSTEM_LAYOUT = 'board'` in `limits.ts`).
- **The frame** is fixed over the loaded history, from a sweep over each child's
  `(column, assignee)` timeline (`board.ts:171-293`):
  - Lanes: one ring per person (`maxLanes` and `maxPerRing` are unlimited).
  - Rings are sized for each lane's peak, with room for at least 6 bodies at `sep` 620.
  - Column widths come from each column's peak, and no column is under 14% (`minShare`).
  - Rings step 950 apart, and each ring's span grows by at least 220.
- **Placement inside the frame** follows the playhead (`board.ts:331-385`):
  - The lane comes from the assignee at t, and the column from the stage at t.
  - Within a column, the newest arrival goes leftmost, with the slot as the last tie-break.
  - Bodies are packed by isotonic regression (pool-adjacent-violators), so they never overlap.
- The star never moves. The older ring formation (`featureFormation`, 2 per ring up to 6 rings;
  `layout.ts:191-224`) is kept one switch away.

**Radar** (`layout.ts:107-176`).
- Three bands, at rx 1120, 1540 and 1960, on a front arc from 210° to −30°.
- Spokes are spaced evenly by arc length. Fewer than 6 Tasks keep the spacing for 6 and cluster at
  the centre (decided 2026-10-09).
- Only Underway Tasks are labelled. The rest show on hover, and the body carries a tally per band
  (`radar.ts:45-58`).

**Traffic** (`traffic.ts`).
- Stations are every repo ever linked into the subtree, at most 6.
- They're ordered by the barycentre of their linked work, which minimises route crossings; repos
  with no dated link go last.
- Vessels sit in a PR lane between the children and the station row, with labels alternating above
  and below.

**Sizing: "the label is the unit"** (`sizing.ts`).
- The unit is `LABEL_PX`, 48 px. Mechanical objects have floors measured in labels: ship 1.2 long,
  vessel 1.1, station 1.8, mission point 1. Radar dots get 0.27 of a label; done dots 0.2.
- Every hit radius is at least `MIN_TARGET_PX/2` (16 px), or 12 px for radar dots.
- A scene opens so that the objects that lead somewhere are at least 32 px (pointer). If the whole
  scene can't fit at that size, it becomes a scrolling page, opening at the larger of the
  width-fit and the 44 px touch scale (`pageScale`).
- Titles are capped at 41 characters (`TITLE_MAX_CHARS`).
- The PR lane's room is computed in screen pixels (`laneRows`, `laneSlotsX`).

**Density handling.**
- **Caps** (`limits.ts`): 15 Features per sector, 24 children per Feature, 24 Tasks per body, 8 Task
  dots per body in a system, 6 stations, 3,000 scope members.
- **Labels follow the touch rule:** a label may touch only its own object. Ships and lane heads are
  obstacles, and a label that can't fit hides until hovered.
- **Ships on a packed board** ride above their work, between the lanes.

**What worked and what didn't** (08 §1, §4, §6):

| Worked | Didn't |
|---|---|
| Screen-space parameters fed through one fixed-point, label-aware fit | Greedy world-space constants, which fixed one density and broke another |
| Replacing labels on each object with a summary (the radar tally) | A fixed minimum zoom, which clamped the dense fit by accident |
| Reflowing objects, not just labels (the board's packing) | Ships *beside* bodies on a packed ring, which failed the 20-Story hit-area check |
| The density harness (`tests/e2e/density.spec.ts`) as the referee | Rotating the whole system over time (declined; compressing Done does the job) |

The general solver (08 §5) is still deferred. It would score about 20–60 candidate parameter sets
headlessly, with priority weights.

### Invariants as game rules

**Game rules** (what the game shows and allows):

| Rule | As a game rule |
|---|---|
| INV-05 | A piece's place on its track comes only from its own state. Children never advance a parent, and there's no invented percentage. Pods are the one aggregate exception |
| INV-06 | Delivering cargo (a merge) isn't completing the objective, and nothing claims deployment |
| INV-07 | A worker stands where they last *acted*, not where they're assigned. Every concurrent assignment is shown, and none is picked as "current" |
| INV-08 | Roles stay separate. One player's action never moves another player's piece. Supporters join at the moment of the merge, then leave |
| INV-09 | One piece, many boards: a piece in two territories is still one piece with one history |
| INV-10 | No invented connections. A piece with no legal place goes to a holding tray, and removed pieces leave the board |
| INV-11 | A state the rules don't know gets a neutral marker, never a guess |
| INV-14 | The board's setup is fixed for the game, and pieces move only within that frame |
| INV-15 | Effects play only when time moves forward. Jumping in time shows the resulting state, with no effects |
| INV-19 | A cooperative game with no score: no ranking, XP or leaderboard, and size and colour never mean merit |
| INV-03 | The default perspective is "what was known then". The hindsight lens is opt-in and labelled |

**Determinism and engine rules:** INV-01, INV-02 and INV-04 (time comes from the source; undated
facts never animate), and INV-12 and INV-13 (pure replay; idempotent ingest).

**Safety, data-integrity and platform rules (not game rules):**
- INV-16 (renderer boundary) and INV-17 (PAT hygiene)
- INV-18 (no real data outside the app)
- INV-20 (accessibility: never hue alone; keyboard; reduced motion)
- INV-21 (read-only) and INV-22 (names are not keys)

### Generic vs domain-specific

| Generic (domain-free as written) | ADO- or SDLC-specific |
|---|---|
| `chain.ts`, `sceneKey.ts`, `crumbs.ts`, and the shape of `LevelDef` and `Hierarchy` | All of `backlog.ts` and `sprints.ts` (Feature, Story, Bug, Task, Area Path, Epic, iteration) |
| `firstJoinOrder`, `balancedRows`, `gridRows`, `centeredRow`, the ring formation, the radar geometry, the arc packing in `board.ts` | Board column names, derived from stage suffixes (`board.ts:58-64`) |
| The floors and fit in `sizing.ts`, except the title cap, which is built from mapping type and state names (`sizing.ts:94-103`) | `traffic.ts` (PRs, repos, routes, review) and the `podStage` thresholds |
| The lens model, replay ordering, and the tray concept | The `workNode` subtitle `{type} #{id} · {state}` (`ctx.ts:67`). The `NodeKind` space vocabulary is a theme, not a domain |

### Coupling and pain points

- **Domain type literals inside "pure" sources.**
  - `backlog.ts:58` tests `e.payload.type === 'Feature'`, while line 53 uses
    `resolveState(...).kind`.
  - `backlog.ts:132` tests `=== 'Task'`.
  - `sprints.ts:55` tests `'User Story' || 'Bug'`.
  - `sprints.ts:80` hard-codes the raw states `'Resolved'` and `'Ready to Accept'`.
- **Stage names act as an API.** These places parse or compare stage strings:
  - `columnOf` parses suffixes such as `'whiteDwarf'` and `'terraforming'` (`board.ts:58-64`).
  - `radarBand` keys on `task.*` (`layout.ts:122-127`).
  - The star's radius compares against `'feature.whiteDwarf'` (`system.ts:21`, `field.ts:40`).
  - Pods map onto Feature stages (`sprints.ts:81-84`).
- **Level ids and kinds leak into navigation.**
  - `BackdropLevel` is `'feature' | 'body'` (`types.ts:14`).
  - `historySceneOf` returns `{kind:'feature'}` (`nav.ts:345-355`).
  - `playState` branches on `sector.kind === 'sprint'` (`nav.ts:377`), and `loadChooser` on
    `paradigm === 'sprints'` (`nav.ts:631`).
  - `enterLoad` returns a `SyncLevel` of kind `'feature'` (`nav.ts:613`).
- **The scope type is a closed union.** `sceneForScope` throws for the other hierarchy's sector kind
  (`backlog.ts:283`, `sprints.ts:188`), and the paradigm is a two-value switch
  (`renderer/src/hierarchy/index.ts:10`).
- **The defaults disagree.** `projectScene` and `soleFeature` default to `BACKLOG`
  (`projectScene.ts:17, 41`), while the app's default is Sprints. And the name `soleFeature` uses
  Backlog's vocabulary for what is a generic `passThrough`.
- **Duplicated walks.** `focusOf` and `rankOf` are copied verbatim between `backlog.ts:296-329` and
  `sprints.ts:203-235`. Pods reuse `MAX_CHILDREN_PER_FEATURE` (`sprints.ts:67`).
- **Geometry is recovered by matching numbers.** `homeOnTrack` finds a body's ring by matching the
  orbit edge's `rx` to within 1 unit (`traffic.ts:208-211`). Whether a ship rides above its work is
  inferred from `!!ctx.graph.board` (`traffic.ts:247`).
- **A hidden cost in building the frame.** On the first build, `projectSystem`'s `shownAt` calls
  `snapshotAt` once per event instant (`system.ts:32-35`, `board.ts:210-230`). It's memoised per
  bundle and child list, but it's costly for dense histories (inferred).
- **The trays are fixed.** `ViewGraph.trays` has exactly two lists, `uncharted` and `unlinked`
  (`projectScene.ts:20`). `Trays.tsx:13` reads its words from `activeHierarchy()` rather than from
  the graph's own hierarchy.
- **Leftover code.** Secondary-assignment beacons are disabled in code, but are still a node kind
  (`traffic.ts:233-235`).

### Candidate abstractions (sketch)

- **A `Domain` (ruleset) object.** Sources would call it instead of comparing literals (fixing
  `backlog.ts:58`, `sprints.ts:55`, `sprints.ts:80`). It declares:
  - the entity kinds (anchor, body, point) and how they map onto node kinds;
  - the state → rung mapping (generalising `state-mapping.json`, `columnOf` and `radarBand`);
  - the aggregate rule for containers that aren't items (`podStage`);
  - the event priorities.
- **`Level` = layout × source.** Keep `LevelDef`, but make `backdrop`, `historyScene` and
  `enterLoad` domain-neutral enums. Keep `chain()` as the point of composition, so SDLC, todo and
  CRM chains are just different `.then()` sequences.
- **A `Region` membership rule.** Sector, Epic and pod membership share one shape: `order` (ever
  joined) + `member` (in at t) + `passThrough`. Pulled out of `FieldSource`, it would let area-like
  regions and time-boxed ones (a sprint, a round) share it.
- **The board's frame as a first-class result.** `boardFrame` already outputs lanes, rings, bounds
  and timelines. Return the ring's identity on each node, rather than recovering it by matching
  `rx`. Let lanes group by any key: the assignee today; an owner, stage or account in other
  domains.
- **A tray registry.** A tray is a named list of reasons a piece couldn't be placed, per hierarchy
  (`uncharted`, `unlinked`, …). It replaces the fixed two-field `trays`.
- **Shared family walks.** Default `focusOf`, `rankOf` and `closeUpOf` derived from the level chain,
  removing the duplication between the two hierarchies.

---

## Data model and the ADO mapping

### Entity table

| ADO entity | Contract type (file) | Game object | Key | Lifecycle and states |
|---|---|---|---|---|
| Organization | `OrgKey = Guid` (`src/shared/contracts/keys.ts:5`) | The universe (not drawn) | `connectionData.instanceId`; fixtures use `00000000-0000-4000-8000-000000000001` (`fixtures/dsl.ts:18`) | None |
| Project | `ProjectFact` (`contracts/facts.ts:44`), `ProjectSummary` (`contracts/ipc.ts:30`) | Galaxy (the galaxy scene lists the projects) | `proj:{org}:{projectGuid}` | None. Pinned and recent are local settings |
| Area Path | `AreaNodeFact` (`facts.ts:45`), `SectorRef{kind:'area'}` (`contracts/history.ts:6`), `AreaFavorite` | Backlog: a sector, a field of Feature orreries. Sprints: a pod, drawn as a star | `area:{org}:{projectGuid}:{nodeId}`. Favourites are keyed by node ID (`ingest/favorites.ts`) | None of its own. A pod's star stage is aggregated from its members (`hierarchy/sprints.ts:76`) |
| Iteration (sprint) | `IterationNodeFact` (`facts.ts:47`), `SprintSector` (`history.ts:18`) | The sprint scene. Its dates are the playback range | `iter:{org}:{projectGuid}:{nodeId}` | Only dated sprints that have started are listed |
| Team | `TeamFacts` (`src/shared/teams.ts:7`), kept in settings only | None directly. It decides which pods run which sprint (`podsBySprint`) | The ADO team id (not a canonical key) | None |
| Epic | `RevisionFact`, `WorkItemState{kind:'epic'}` (`contracts/view.ts:11`) | Epic sector (`SectorRef{kind:'epic'}`). Its visuals stay neutral | `wi:{org}:{id}` | `states: {}` in the mapping, so every Epic state maps to `unknown` (`config/state-mapping.json:6-10`) |
| Feature | The same, with `kind:'feature'` | Star (the centre of a system) | `wi:` | New, Draft, Ready for Review, Ready, Deferred, Active, Ready to Accept, Closed, Removed |
| User Story | The same, `kind:'story'` | Planet (a body; radar close-up) | `wi:` | New, Ready, Deferred, Ready for Review, Active, Resolved, Ready to Accept, Closed, Removed |
| Bug | The same, `kind:'bug'` | Anomaly (a body) | `wi:` | As for Story, plus Rejected. Resolved and Ready to Accept have the category `Resolved` |
| Task | The same, `kind:'task'` | Mission point, on its body's radar | `wi:` | New, Active, Closed, Removed |
| Any other work-item type | `kind:'other'` (`stateMapping.ts:15`) | Neutral `unknown` stage | `wi:` | Its raw state name is shown (INV-11) |
| Person (identity) | `IdentityRefFact` (`facts.ts:6`), `entities.captains` (`history.ts:100`) | Captain (ship, call sign, avatar) | `id:{org}:{identityGuid}`. `shipSeed = fnv1a32(org+id+SHIP_DESIGN_VERSION)` (`src/shared/captains.ts:7`) | Group identities (`isContainer`) are dropped (`ingest/parse.ts:22`) |
| Repository | `RepoFact` (`facts.ts:43`) | Station (only when a valid PR link connects it to the scene) | `repo:{org}:{repoGuid}` | None |
| Pull request | `PullRequestFact` (`facts.ts:34`), `PrState` (`view.ts:27`) | Flight, a cargo vessel (in the lane between bodies and stations) | `pr:{org}:{repoGuid}:{prId}` | `active`, `completed`, `abandoned` (a fixed enum) |
| Parent link | `RelationFact{rel:'parent'}` → `SnapshotLink{kind:'parent'}` | Orbit edge | child → parent, from the `Hierarchy-Reverse` side | A validity interval, `[validFrom, validTo)` (`ingest/derive.ts:58`) |
| Dependency link | `rel:'predecessor'` → `kind:'dependency'` | Dependency lane | predecessor → successor | The same |
| PR artifact link | `rel:'pr'`, parsed from `vstfs:///Git/PullRequestId/...` (`parse.ts:15`) | Route (PR → Task, or PR → Story or Bug directly) | pr → item | The same |
| Other relations | `rel:'other'` | Ignored | — | — |
| Reviewer approval | `pr_completed.payload.approvedBy` (`contracts/events.ts:44`) | The review formation (a fly-in at merge only) | Identity keys | Not activity (INV-07, INV-08) |

### Events and facts

**Facts** are normalized projections of ADO responses (`contracts/facts.ts`), kept in the main
process. They're the only thing persisted (INV-16, INV-18).
- `RevisionFact`: one per revision. A full snapshot of type, title, state, areaPath,
  iterationPath, assignedTo, changedBy and changedAt.
- `UpdateFact`: relation changes (`added` and `removed`), plus `sourceAt`.
- `PullRequestFact`, `RepoFact`, `ProjectFact`, `AreaNodeFact`, `IterationNodeFact`,
  `IdentityRefFact`.
- `CurrentItemFact` (`facts.ts:50`): the current fields from the hydrate, for loads without history.

**Events.** A `TimelineEvent<K>` (`events.ts:48`) carries `eventKey`, `kind`, `occurredAt`,
`observedAt`, `entityKey`, `projectKey`, `priority`, `payload`, `evidence[]`, and optionally
`changedBy`. There are 15 kinds (`events.ts:4-10`):
- **Work item:** `wi_created`, `wi_state_changed`, `wi_assignee_changed`, `wi_area_changed`,
  `wi_title_changed`, `wi_iteration_changed`. Each is a field difference between consecutive
  revisions (`derive.ts:93-115`).
- **Links:** `link_parent_*`, `link_dependency_*`, `link_pr_*`, from the update relations on the
  canonical side (`derive.ts:120-151`).
- **PR:** `pr_opened`, `pr_completed`, `pr_abandoned`, from `creationDate` and `closedDate`
  (`derive.ts:162-178`).

**Ordering and keys.**
- Events sort by `(occurredAt, PRECEDENCE[kind], eventKey)` (`events.ts:82-100`).
- Keys are deterministic: `kind:entityKey:r{rev}`, `…:u{updateId}:{targetKey}`, or `…:pr`
  (INV-13).
- Priority comes from `eventPriority(kind, workKind)` (`src/shared/priority.ts`).

**`occurredAt` and `observedAt`.**
- `occurredAt` is always a source timestamp (INV-01): `System.ChangedDate`; an update's
  `ChangedDate.newValue`, or else its matching revision's; or the PR's `creationDate` or
  `closedDate`.
- `observedAt` is poll time. The derivation sets it equal to `occurredAt` (`derive.ts:89`), and
  bundle equivalence ignores it.
- `revisedDate` is never read (`parse.ts:93`).

**Observations** (`events.ts:69`) are undated facts. They are never events (INV-02).
- Kinds: `link_parent | link_dependency | link_pr | pr_status`, with `op` either `present` or
  `removed`.
- `confidence`: `unknown` (from an undated update) or `observed_only` (seen only in the current
  relations).
- They appear only in the `currentObserved` lens and in the Inspector.

**The bundle** (`ScopeHistory`, `history.ts:65`) is one per scope and range:
- `scope`: `{orgKey, projectKey, sector: SectorRef}`.
- `range` and `coverage`. Coverage holds `syncedAt`, `historyFrom`, `partial` and `notes`, plus
  the optional `history`, `stale`, `missing`, `explored`, `more` and `played`.
- `entities`: `projects`, `workItems{key,type,adoUrl}`, `repos`, `prs`, `captains`, `childCounts`.
- The optional `current` (`CurrentState`, `history.ts:55`): the seed for entities without history.
- `events`, `observations`, `unlinkedPrs`, and `stateMapping` (the mapping travels inside the
  bundle).

**`snapshotAt(h, t, lens)`** (`src/shared/replay/snapshotAt.ts:233`).
- A pure fold over the sorted events, checkpointed every 256 events. It starts from `seedFold`
  (current state for entities not in `coverage.history`).
- It returns `Snapshot{workItems: Map<WorkItemState>, prs: Map<PrState>, links: SnapshotLink[]}`.
- The `reopened` flag is computed from an `everCompleted` set (`snapshotAt.ts:96-101`).

**The lenses** (02 §6):
- **`knownThen`:** only links valid at `t`. Observations are ignored, except that an undated
  removal marks its link `uncertain`.
- **`currentObserved`:** the link set at the end of the range, plus every `present` observation,
  applied to items that exist at `t`. Links that are absent at `t` are marked `uncertain`. A
  `pr_status` observation overrides the PR's status (`snapshotAt.ts:241-262`).

### Pipeline

```
ChartSource (src/main/source/types.ts:7)  ── chosen per mode in src/main/index.ts:273
 ├─ fixtureSource (source/fixtureSource.ts) → src/main/fixtures.ts → fixtures/dsl.ts toHistory(s, mapping, scope)
 │     (in memory, no SQLite, no network)
 └─ adoSource(service) (source/adoSource.ts) → AdoService (src/main/ado/service.ts)
       │  Transport (src/shared/contracts/transport.ts)
       │   ├─ HttpTransport (src/main/ado/http.ts: allowlist, PAT as Basic, 4 in flight, Retry-After/jitter)
       │   └─ FakeAdoTransport (src/main/ado/fake.ts) ← fixtures/ado.ts toAdoPayloads(scenario)
       │        (STAR_CHART_FAKE_ADO=1, dev/test only: src/main/index.ts:50,169)
       ▼
     AdoClient (src/main/ado/client.ts: families, api-version fallback, NetError)
       ▼  WIQL templates: src/main/sync/wiql.ts
     Sync loaders (each writes facts to the cache):
       • syncScope: full sync, 04 §5 (src/main/sync/sync.ts:143)
       • loadLevel: team/feature/more/history/catchUp, 04 §5a (src/main/sync/levels.ts:198)
       • SprintStream: look/fill/context/idle via Scheduler (src/main/sync/sprintStream.ts, sync/scheduler.ts)
       • refresh / rescan (sync/refresh.ts); Unreadable → coverage.missing (sync/missing.ts)
       ▼  parse: src/shared/ingest/parse.ts (JSON → facts)
     Cache (src/main/db/cache.ts; migrations 001–004): wi_revisions, wi_updates, wi_current,
       wi_current_relations, pull_requests, identities, scope_members, scope_prs, …
       derived: links/events/observations via rebuildDerived (cache.ts:341)
       ▼  factsFor (sync.ts:417) → IngestFacts
     derive() (src/shared/ingest/derive.ts:73) → ScopeHistory  [+ applyCurrent (ingest/current.ts:27)]
       ▼  service.load (service.ts:606-611): loadLevelHistory if level state exists, else loadHistory;
          then withWebLinks / withPictureMarks
     IPC: CH.historyLoad, zod scopeHistorySchema both sides (index.ts:333, preload/index.ts:79)
       ▼
     Renderer: data/scopeData.ts, nav.ts, playback.ts → snapshotAt → projectScene(h, s, scene, v, hier)
       (src/shared/scene/*, src/shared/hierarchy/{backlog,sprints}.ts) → ViewGraph → Pixi scenes
```

The fixture-equivalence check (AC-27) is `derive(ingest(toAdoPayloads(s))) ≡ toHistory(s)`,
ignoring `observedAt`, `syncedAt` and `notes`.

### State mapping

- **The data.** `config/state-mapping.json` maps each type name → `{kind, states: {rawState →
  {category, stage}}}`. Main imports it (`index.ts:7,43`; `fixtures.ts:2`), and it ships inside
  every bundle.
- **The lookup.** `resolveState(mapping, type, state)` (`src/shared/stateMapping.ts:11`) returns
  `{kind ?? 'other', category ?? 'Unknown', stage ?? 'unknown'}`. INV-05 holds: only the item's own
  `(type, state)` decides its stage.
- **Categories** follow ADO's state categories: `Proposed`, `InProgress`, `Resolved` (Bug only),
  `Completed`, `Removed`, and an implicit `Unknown`. `Completed` drives `reopened`, and `Removed`
  makes an item leave the scene (`hierarchy/backlog.ts:19`).
- **Stages** are art identifiers in the form `{kind}.{look}`: for example `story.terraforming`,
  `feature.whiteDwarf`, `task.lit`.
- **Rungs aren't stored.** The signal ladder (`docs/09-signal-ladder.md` §3: Ready, Underway,
  Nearing, Accomplished, plus off-ladder) is recomputed from stage-name suffixes, by `columnOf(stage)`
  (`scene/board.ts:58-64`) for the board's column and `radarBand(stage)` (`scene/layout.ts:122-126`)
  for Task bands. The category doesn't feed the rung directly.
- **The probe check.** At connect, the probe compares the runtime `workitemtypes/{type}/states` for
  a fixed list of five types against the mapping (`src/main/ado/probe.ts:107-112`).
- **The pod exception.** `podStage` (`hierarchy/sprints.ts:76-85`) aggregates its members'
  categories into a `feature.*` stage. It's the one look driven by an aggregate (INV-05 amendment).

### Portability analysis

| Piece | ADO-specific | Domain-neutral | Notes |
|---|---|---|---|
| `UtcMs`, evidence, `occurredAt`/`observedAt`, Observation, confidence | | ✓ | The core "source time is truth" model (INV-01 to INV-04) is generic |
| The `CanonicalKey` grammar (`keys.ts:7-15`, `ipc.ts:9`) | ✓ | | Fixed prefixes: `wi:` needs a numeric id, `OrgKey` must be a GUID, `pr:` needs a repo GUID plus a number |
| Facts (`facts.ts`) | ✓ | | The ADO field set (`System.*` meanings, areaPath, iterationPath) and the revision/update split |
| `EventKind` (`events.ts:4`) | partly | partly | The `wi_*` field-difference and `link_*` interval patterns are generic. The field names (area, iteration) and the `pr_*` lifecycle are SDLC-specific |
| `derive.ts` | ✓ | | ADO's canonical-side link rules, the PR reconcile, and membership by kind (`derive.ts:213-233`) |
| `parse.ts`, `client.ts`, `http.ts`, `wiql.ts`, `probe.ts`; `neterror.ts`'s classification (`:71`, `:87`, TF and VS codes) | ✓ | | The pure adapter layer |
| `Transport` and `AdoRequest` (`transport.ts`) | in name only | ✓ in shape | A generic request/response seam |
| The scheduler, throttle gate, and the refresh and checkpoint model | | mostly ✓ | Checkpoints are per `item_id INTEGER` (`001_init.sql`) |
| The SQLite schema | ✓ | | Tables `wi_*`, `pull_requests`, `area_nodes`, `iteration_nodes`. The derived `events`, `links` and `observations` are generic |
| `StateMapping` | partly | partly | Type → states → {category, stage} is generic. `WorkKind` is a closed SDLC union (`history.ts:32`) |
| `snapshotAt` | partly | mostly ✓ | A generic fold, but `WorkItemState` has `areaPath` and `iterationPath`, and `PrState` is a separate kind of entity |
| `SectorRef` and `SprintSector` | ✓ | | area, epic, sprint |
| Hierarchy chains (`hierarchy/*`) | ✓ | | The level/source abstraction is generic (03 §5a), but the sources hard-code kinds and type names |
| `SourceCaps` (`source.ts:5`) | partly | ✓ | `openInAdo` and `areaTree` are named after ADO |
| `ChartSource` (`source/types.ts:7`) | partly | ✓ as a seam | The methods `epics`, `searchEpics`, `areaTree`, `iterations` and `favorites` are ADO concepts |
| The fixture DSL (`fixtures/dsl.ts`) | ✓ | | The `WiType` union (`dsl.ts:26`); `toAdoPayloads` |
| Captains, ship seeds, call signs | | ✓ | Keyed on identity GUID |
| Priority, accents, describe | ✓ | | Keyed on kind and raw state names (see *Coupling* below) |

**A todo app** (lists, tasks, done), as a fixture-only demo:
- **What fits today:**
  - A list → a Feature-kind container, or a sector or pod. A todo → a story-kind body. Sub-steps →
    task-kind radar points.
  - Done and Open → the categories `Completed` and `Proposed`, with an optional "doing" →
    `InProgress`.
  - Owner → assignee and captain.
  - Created, completed, renamed and moved → `wi_created`, `wi_state_changed`, `wi_title_changed`
    and `link_parent_*`. Deleted → `Removed`.
  - Undated changes → Observations. Most todo backends keep only `createdAt`, `updatedAt` and
    `completedAt`, so the history in between would be thin (inferred).
- **What breaks:**
  - **Keys:** ids are often strings or UUIDs, but `wi:` requires a number (`keys.ts:9`;
    `workItemId` at `keys.ts:44`; `Number(key.split(':').pop())` in `current.ts:57` and
    `derive.ts:244`).
  - **Type names** must be literally `Feature`, `Task`, `User Story` or `Bug` for the hierarchies
    (`backlog.ts:58`, `backlog.ts:132`, `sprints.ts:55`).
  - **Fields:** `areaPath` is a required string on every item, and due dates, tags and priority have
    no slot.
  - **PR machinery:** the PR, repo and station machinery has no counterpart. It would stay empty,
    but it's still wired into the scene (`scene/project/traffic.ts`).
  - **One user** makes captains trivial.

**A CRM pipeline** (accounts, contacts, deals, stages, follow-ups, owners), as a fixture-only demo:
- **What fits today:**
  - An account → a Feature-kind star, or an area or pod sector. A deal → a story-kind body.
    Follow-ups → task-kind radar points. Owner → assignee.
  - Pipeline stages → categories:

    | Stage | Category |
    |---|---|
    | Lead, Qualified | `Proposed` |
    | Proposal | `InProgress` |
    | Negotiation | `Resolved` (Nearing) |
    | Closed Won | `Completed` |
    | Closed Lost | `Removed` (it departs) |

  - Whoever logged the activity → `changedBy`. A quarter or close period could act as a
    `SprintSector` with dates.
- **What breaks:**
  - **People:** contacts are external people. The model has only captains (actors, INV-07 and
    INV-08), and no entity for a person who isn't an actor.
  - **Links:** contacts ↔ deals and contacts ↔ accounts are many-to-many associations, but
    `SnapshotLink.kind` allows only `parent | dependency | pr` (`view.ts:37`).
  - **Amount:** a deal's amount or probability has no field. It would also strain INV-19 (not a
    scoreboard).
  - **Lost deals:** Closed Lost as `Removed` hides them, where a CRM might want them shown as
    off-ladder instead.
  - **Quotes and contracts** could stand in for vessels, but `PrState.status` is the fixed enum
    `active|completed|abandoned`, and it requires a `repoKey`.
  - **Accents:** stage-change accents key on raw ADO state names (`accents.ts:37-44`), so CRM
    stages fall through to the defaults.

### Coupling and pain points

1. **ADO type names in `src/shared`:**
   - `hierarchy/backlog.ts:58` (`payload.type === 'Feature'`) and `:132` (`=== 'Task'`).
   - `hierarchy/sprints.ts:55` (`'User Story' || 'Bug'`).
   - `playback/describe.ts:70` (type → story object).

   Elsewhere, kind is resolved through the mapping (for example `backlog.ts:56`), so the same check
   is done two ways.
2. **ADO type names in main:**
   - `sync/sprintStream.ts:151,293,365` (`it.type === 'User Story' || 'Bug'`).
   - `ado/service.ts:405` (`'Epic'`).
   - `ado/probe.ts:107` (a fixed list of types).
   - `sync/wiql.ts:13,30,50,60,72,92` (WIQL literals).
3. **Raw state names, hard-coded:**
   - `playback/accents.ts:37-44` (`'Closed'`, `'Removed'`, `'Active'`, `'Resolved'`,
     `'Ready to Accept'`).
   - `playback/describe.ts:86` (verbs keyed by raw state).
   - `hierarchy/sprints.ts:80` (`rawState === 'Resolved' || 'Ready to Accept'`).

   These bypass the mapping, so a renamed state silently changes the art.
4. **Category literals.** `'Completed'` appears in `replay/snapshotAt.ts:45,86,96`,
   `playback/protect.ts:51` and `describe.ts:85`. `'Removed'` appears in `backlog.ts:19` and
   `sprints.ts:29,77`. Categories are free strings in `StateMapping` (`history.ts:37`), but behave
   as a closed set.
5. **Rungs are derived from stage-name suffixes.** `scene/board.ts:58-64` lists
   `terraforming|disturbance|active|lit…`, and `scene/layout.ts:122-126` lists `task.*`. A new stage
   name needs code changes, and the mapping has no `rung` field.
6. **Stage literals in layout.** `scene/project/field.ts:40` and `scene/project/system.ts:21` check
   `feature.whiteDwarf` (to shrink the star). `podStage` returns `feature.*` (`sprints.ts:78-84`).
7. **The closed `WorkKind` union** (`history.ts:32`, `view.ts:11`, the zod enum at `ipc.ts:184`, and
   the kind-keyed `priority.ts:5-31`). Kind means both "what it is" and "its role in the game".
8. **Feature, Story and Bug are baked into the bundle and coverage shapes:**
   - `entities.childCounts{stories,bugs}` (`history.ts:102`; `current.ts:129-134`).
   - `coverage.explored`, `more.features` and `played.scene` (`history.ts:86-91`).
   - `SyncLevel{kind:'feature'}` (`ipc.ts:72`), and `Level`/`Scene` (`levels.ts:30-36`).
9. **Membership rules hard-code kinds:** `derive.ts:216-223` (a sprint's roots are stories and bugs;
   a sector's roots are features) and `ingest/current.ts:51,54,64`. To keep AC-27 passing, the rules
   are repeated in the DSL (`fixtures/dsl.ts`, `scopeItems` and `inSprint`).
10. **The key grammar is shaped by ADO and parsed by string surgery.** See `keys.ts:7-15` and
    `ipc.ts:9` (the `KEY_RE` prefix list), and `split(':').pop()` in `current.ts:57,109`,
    `derive.ts:244-245,315` and `levels.ts:385`.
11. **Two families of entity instead of one.** Work items and PRs are separate in the facts, the
    bundle (`entities.workItems` vs `prs`), the snapshot (the `workItems` vs `prs` maps) and the
    links: a `pr` link runs pr → item, the reverse direction of parent.
12. **ADO vocabulary in the renderer and IPC:**
    - `src/renderer/src/vocab.ts:11-14,27` (`ado: 'Feature' | 'User Story' | 'Bug' | 'Task' |
      'Epic'`), and the stage descriptions from `:39`.
    - The `ViewNode.typeName` comment, "ADO work item type", and the `adoUrl` fields.
    - `CH.openInAdo`; `SourceCaps.openInAdo` and `areaTree` (`source.ts:11-13`).
    - `ChartSource.epics`, `searchEpics` and `areaTree` (`source/types.ts:14-19`).
13. **The fixture DSL is typed for ADO:** `WiType = 'Epic'|'Feature'|'User Story'|'Bug'|'Task'`
    (`fixtures/dsl.ts:26`), with the builder methods `feature`, `story`, `bug` and `task`
    (`dsl.ts:136-140`). A todo or CRM scenario can't be written without disguising itself as these
    types.
14. **Path semantics.** `underPath` assumes backslash paths (`src/shared/paths.ts:5`). Both
    `areaPath` and `iterationPath` are hierarchical classification strings.

### Candidate abstractions (sketch)

- **A neutral schema for items, links and events**, built on the current shapes:
  - `Item{key, type, title, state, assignee, axes: Record<string,string>}`, where `axes` replaces
    `areaPath` and `iterationPath` with named grouping paths.
  - `Link{kind, from, to, validFrom, validTo, endUnknown}`, with a link vocabulary declared by the
    pack: parent, dependency, attachment (PR), association (CRM).
  - Events: `item_created`, `item_field_changed{field, from, to}` (generalising the six `wi_*`
    kinds), `link_added` and `link_removed`, and a "vessel" lifecycle (`opened`, `completed`,
    `abandoned`) for attachments that behave like PRs.
  - Keep `occurredAt`/`observedAt`, `Observation`, evidence, deterministic keys and the ordering in
    02 §5. They're already domain-neutral.
- **Opaque keys:** `{domain}:{tenant}:{entity}:{id}` with string ids, and a codec supplied by the
  pack instead of `split(':').pop()`.
- **The mapping as the single source of meaning.** Extend `StateMapping` so that:
  - each type declares a `role` (container, body, subtask or vessel), replacing the `WorkKind`
    union;
  - each state declares its `category` (a closed, neutral set: Proposed, InProgress, Resolved,
    Completed, Removed, Unknown) and its `rung` explicitly.

  `columnOf`, `radarBand`, the accents, priority and describe would then read `rung`, `category` and
  `role`, never raw state names or stage suffixes.
- **A domain-pack interface** (an inferred design, built on the existing seams):
  ```ts
  interface DomainPack {
    id: string;
    keyCodec: KeyCodec;
    mapping: StateMapping;
    chains: Hierarchy[];
    vocab: LevelVocab;
    caps: SourceCaps;
    source: ChartSource;
    toHistory(facts): ScopeHistory;
    fixtures?: Scenario[];
  }
  ```
  - ADO becomes one pack, with its `parse`, `derive`, `wiql` and `client` moved behind `source` and
    `toHistory`.
  - Todo and CRM packs can be fixture-only: a neutral DSL emits the neutral bundle directly, with no
    fake transport.
  - `ChartSource` becomes generic: `projects` → workspaces, and `epics`, `areaTree` and
    `iterations` → "scope pickers" declared by the pack.
- **Kept in shared and domain-neutral:**
  - `snapshotAt`, once it folds generic field changes
  - the beat schedule, the lenses, INV-01 to INV-04 and INV-12 to INV-15
  - captains, the scheduler, the throttle and the checkpoints
  - the level and layout chain (`field`, `system`, `radar`), with sources reading roles instead of
    type names

---

## UI, accessibility and engineering standards

This covers the 2D DOM chrome over the Pixi canvas, the labels, theme and contrast, how INV-20 is
implemented, and the engineering workflow.

### Panels and chrome

All chrome is React DOM, laid out in `src/renderer/src/App.tsx:149-205` as a three-row grid:
titlebar, stage, status bar (`styles.css:24`). The canvas element has `tabIndex = -1`
(`chart/ChartApp.ts:209`), so the keyboard reaches the chart only through these panels and the
global key handler (`App.tsx:88-147`).

| Panel | Purpose | Code | Keyboard access |
|---|---|---|---|
| Titlebar | Brand, breadcrumb, Back, search, the Sprints/Backlog switch, the Names toggle (Star Chart or ADO names), Key button, mode chip | `App.tsx:151-165`; `ParadigmSwitch` at `App.tsx:265-275` | All buttons. Back: Esc or ⌘←. Key: K |
| Breadcrumb | The trail of scene levels. Each crumb goes back; ▾ opens a menu of siblings; a team pill; "+" adds a Project or Area Path | `panels/Breadcrumb.tsx`, with data from `src/shared/hierarchy/crumbs.ts` | Buttons. In the sibling menu, focus moves into it, ↑/↓ cycle, and Esc closes (`Breadcrumb.tsx:113-120`) |
| AddPicker | A search-first list for adding a project or Area Path | `panels/AddPicker.tsx` | Focus starts in the search box; Esc closes (`:59-60`); rows are `role=option` |
| Search | Find by ID or title in the loaded history; "Not in the chart" rows add new items | `App.tsx:311-368` | Enter picks the first result; Esc clears. ↑/↓ don't move through the results (a gap) |
| Transport (player) | Play/pause, step, jump to a date and time, the ruler with in-view ticks, rate, and the ⋯ menu (Highlights, lens, Activity level, Reduce motion). Also the request, loading and gathering states | `panels/Transport.tsx` | Space, ←/→ (one beat), Shift ←/→ (a big moment in view), Home/End, [ / ], H, L (`App.tsx:93-111`). The scrubber is a native `range` input. The ⋯ and rate pop-ups have no Esc or arrow handling (a gap) |
| ViewPanel tabs | The top of the side panel: the In view and History tabs | `panels/ViewPanel.tsx` | E toggles. The tabs are `role=tab`, but have no arrow keys between them (a gap) |
| ObjectList (In view) | The accessible equivalent of picking on the canvas, grouped by ADO type with counts. A filter appears over 20 rows. Load more | `panels/ObjectList.tsx` | ↑/↓ move and bring the row into view after 160 ms; Enter selects, and Enter again enters; Esc clears the filter (`:47-66`) |
| History | One card per beat, newest first, with the next three beats dimmed above. Clicking a card seeks | `panels/History.tsx` | The cards are buttons, and focusing one lights its object (`:161`) |
| Inspector | The selected object's record: project chooser (sprints, saved Area Paths, Epics), work item facts, PR, repo impact, captain (Follow, pictures), evidence, Open in ADO | `panels/Inspector.tsx` | Buttons and forms. `aria-live="polite"` on the whole aside (`:38`) |
| Trays | The "Uncharted" and "Unlinked PRs" chips, which expand into lists (INV-10) | `panels/Trays.tsx` | Chip buttons with `aria-expanded`. The list rows can't be acted on |
| MapKey | The chart name and ADO name for every kind, the looks in this view, line styles, the board's legend | `panels/MapKey.tsx` | K, or the close button. Esc doesn't close it: the global Esc goes back a level instead (a gap) |
| FollowBar | "Following ‹call sign›", Resume/Unfollow, "Keep in view (Z)" | `panels/FollowBar.tsx` | F, Z, buttons. `role=status` |
| ZoomControls and scrollbars | + / − / ↑ buttons; scrollbars only where a scene can't fit | `panels/ZoomControls.tsx`, `App.tsx:212-257` | The + − 0 keys. The scrollbars are `aria-hidden` and pointer-only; the zoom keys and `reveal` cover them for the keyboard |
| Coverage | Status bar: last sync time, Offline, Refresh, the coverage dialog, the cache and the frame-time profile | `panels/Coverage.tsx` | Buttons. The dialog has no Esc (a gap) |
| Connect | Data source (Fixture or ADO), org URL, PAT, Forget token, pinned projects, cache and Purge, the diagnostic log switch | `panels/Connect.tsx` | Form controls. Opened from the mode chip. No Esc (a gap) |
| EmptyCosmos | First launch: the black hole, a call to action, rotating quotes | `panels/EmptyCosmos.tsx` | Buttons |
| AreaChooser | Pick Area Paths for a project with none saved | `panels/AreaChooser.tsx` | Filter, checkboxes; Esc closes (`:52`) |
| LoadingPlate and the sync banner | The current step in plain words, progress, Cancel | `panels/LoadingPlate.tsx` | Esc cancels (`:52`). `role=status`, `aria-live` |
| Activity | The request "abacus" in the status bar, and the requests panel with errors | `panels/Activity.tsx` | Button. Esc closes the panel (`:78`) |
| Error alert, ErrorDetails, ErrorBoundary | A dismissable `role=alert`, expandable network details, the crash panel | `App.tsx:185-193`, `panels/ErrorDetails.tsx`, `panels/ErrorBoundary.tsx` | Native `<details>` |
| KeyHelp | The ? overlay that lists every shortcut | `App.tsx:278-292` | ? toggles; Esc closes. No focus trap (an inferred gap) |
| Tooltip | One shared tooltip, from `data-tip` and `data-tip-keys`, after 600 ms | `panels/Tooltip.tsx` | Also shows on `:focus-visible`; sets `aria-describedby`; Esc hides |
| Busy | An inline spinner with a label. Under reduced motion it shows a static "…" | `panels/Busy.tsx` | `role=status` |
| Status bar and DebugReadout | Coverage, "As of", a static help line, Activity. D shows the camera and frame readout | `App.tsx:197-203` | D, P (paint) |
| Gallery (development only) | Every object in every stage | `src/renderer/src/gallery/Gallery.tsx` | Space, ←/→, B, P (06 §8) |

### Typography and labels

**Fonts.**
- Bundled through `@fontsource` (`src/renderer/src/main.tsx:1-4`): Inter 400 and 600, IBM Plex Mono
  400, and Caveat 400. The type section of 06 doesn't mention Caveat.
- The tokens are `--sans` and `--mono` (`styles.css:15-16`).
- Mono is used for IDs, `meta` lines, section headers (10 px, uppercase, 0.22em tracking), captain
  titles and the status bar.

**Labels are DOM, not textures.**
- Labels are `div.callout` elements in `.labels`, over the canvas (`chart/labels.ts:104-132`).
- Each one is `aria-hidden`; the object list is the accessible equivalent (`labels.ts:112`).
- A selectable object's label is also its button: press selects, double-click enters, hover
  highlights (`labels.ts:117-119`).

**Rows per label.** The rows are hard-coded in `LabelLayer.render` (`labels.ts:160-193`), from
`ViewNode` fields (`src/shared/contracts/view.ts:86-132`):
1. **Title:** `capTitle(label)`, capped at `TITLE_MAX_CHARS`. The cap (about 41 characters) is
   derived from the longest ADO type name, an 8-digit ID and the longest state name
   (`src/shared/scene/sizing.ts:95-106`). The full title goes in `el.title`.
2. **`meta`:** `{type} #{id} · {state}`, built in the shared projection
   (`src/shared/scene/project/ctx.ts:67`, `traffic.ts:107`, `:254`).
3. **`meta2`:** the person, after a ◆ (`styles.css:382-383`).
4. **`tally`:** a fourth row on Stories, the radar count per band (`labels.ts:182-193`).

There's also an optional avatar circle at the left (`labels.ts:161-167`).

The nominal label height is `LABEL_PX = 48` ("three lines": `sizing.ts:8`), and mechanical objects'
sizes are floored to it.

**Modes** (06 §2, "Dynamic labels"; `labels.ts:204-312`):
- **Full:** when stopped and settled.
- **Compact:** title only, 10.5 px (`styles.css:548-550`), while playing or within
  `SETTLE_MS = 3000` of the object moving.
- **Minimal:** for ships, the captain's avatar alone, hugging the top of the hull
  (`labels.ts:276-284`; `styles.css:551-553`).
- **Hover-only:** `labelOnHover`, used for radar Tasks off the Underway band.
- **Always compact:** `labelCompact`, used for galaxy grids.
- **Flash:** `FLASH_MS = 3500`, with a fade.
- A label under the pointer opens to full, except on the followed ship.

**Placement.**
- Each label tries four sides in `sideOrder` (`labels.ts:35-47`). If none is free, it hides, unless
  it's focused (selected or hovered).
- Priority: focused first, then flashed, then `RANK` by kind (`:27`), then slot, then key.
- Lane heads are placed first, as obstacles.
- The radius factors per kind are hard-coded (`labels.ts:247`).

**Size tiers today.** There are no named tiers. Sizes are CSS overrides per kind
(`styles.css:45-79`, `233-237`, `382`, `528`, `548-553`):

| Text | Size |
|---|---|
| Title (default) | 12 px / 600 |
| Star title | 13 px, amber |
| Galaxy title | 15 px |
| Flight title | 11 px |
| Captain title | 10.5 px mono |
| Meta | 10 px mono |
| Who | 10.5 px |
| Compact title | 10.5 px |
| Maximum width | 260 px |

**Gaps against the target** (expanded, standard, compact and minimal tiers, each with a predictable
budget of title, subtitle and annotation rows):
- **Three modes, chosen by motion.** Only Full, Compact and Minimal exist, and they're chosen by
  motion, not by available space. No mode is chosen by zoom or density.
- **The row budget is implicit.** A full label can be 1 to 4 rows, depending on which optional
  fields are present (`meta2`, `tally`). So the measured height varies per label, and it's cached
  per mode (`label.w/h`, `labels.ts:269-272`).
- **Two caps.** The title cap is in characters and derived from ADO. The pixel cap is a separate CSS
  `max-width: 244px` (`styles.css:75`).
- **Hiding is the only fallback.** When there's no room, the label hides; there's no stepping down
  from full to title only to a glyph. 91 ("Labels yield to ships") asks whether labels should
  shorten first.
- **Per-kind overrides.** The galaxy, star, captain and flight overrides are per kind in CSS, not per
  tier, so a new kind of object needs new CSS (inferred).

### Theme and contrast

**Tokens.**
- The CSS custom properties in `src/renderer/src/styles.css:1-18` are the only theme for the DOM:

  | Token | Value |
  |---|---|
  | `--ink` | `#081629` |
  | `--cobalt` | `#355da1` |
  | `--violet` | `#79568f` |
  | `--ivory` | `#f4f0de`, plus `-60` and `-35` alphas |
  | `--amber` | `#f1b75b` |
  | `--cyan` | `#83dde2`, plus a `-30` alpha |
  | `--plate` | `rgba(21,38,63,.92)` |
  | `--coral` | `#e98973` |

- The documented palette is in 06 §2 (`docs/06-visual-brief.md:49-88`).
- **The colours are scattered.**
  - The signal ladder's hues are TS numbers in `src/renderer/src/chart/art/progress.ts:71-77`
    (`RUNG_COLOR`).
  - The same palette values are re-declared as hex literals in about ten art and effect files
    (`chart/art/*.ts`, `chart/fx/hero.ts`, `chart/fx/timing.ts`, `src/shared/scene/avatar.ts`,
    `cosmos.ts`).
  - MapKey hard-codes `#83dde2` in SVG (`panels/MapKey.tsx:55-57`).
- **The ambers disagree.** `--amber` (`#f1b75b`) isn't in 06's palette table, which lists gold as
  `#FFC76B`. And star titles are amber (`styles.css:77`), although 06 moved captain names off amber
  because it sat "too close to Accomplished gold" (an inferred inconsistency).

**The contrast rule** (06 §2). All text must meet WCAG AA, 4.5:1, against what it sits on. Label
text is 7.5:1 or better on the plate. Visual elements are judged by eye.

**How contrast is checked:**
- **VC-2** (`tests/e2e/slice1.spec.ts:100-131`, `@keystone`) checks only `.callout__title` and
  `.callout__meta`, composited over pure white, for ≥ 4.5. It doesn't check:
  - `.callout__who`, `.callout__tally` or the coloured `radar-count` bands;
  - lane heads, which have no plate, only a text shadow at 0.8 opacity (`styles.css:838-839`);
  - the amber star title on a sky that isn't white.
- Avatar initials: ≥ 4.5 on every swatch, and ≥ 3 against the ladder colours with nearby hues
  (`tests/unit/avatar.test.ts:48-56`).
- The cosmos quote: ≥ 4.5 against ink and against the brightest nebula
  (`tests/unit/scale.test.ts:90-92`).
- **Not checked at all:**
  - panel and HUD text, such as `--ivory-60` muted text on `--ink-70` over the chart;
  - the "Next" History cards at 0.45 opacity (`styles.css:143-146`);
  - the 9.5–10 px mono headers.

**Vital vs minor text.** From INV-20 and 06:
- **Vital:** titles, IDs, states and dates. These must be live DOM text (06 §2:88).
- **Minor:** the quotes, the day marks on the ruler, the status bar's help line, and the dimmed
  upcoming cards (inferred).

### Accessibility (INV-20)

| INV-20 clause | How it's implemented | Gaps |
|---|---|---|
| Live DOM text | Labels, the object list, the Inspector and History are DOM. Labels are `aria-hidden`, and the object list is their equivalent (`labels.ts:112`). VC-2 asserts that every selectable node has a row in the list (`slice1.spec.ts:104-109`) | The ruler's ticks and day marks are `aria-hidden` (`Transport.tsx:222`). Beyond the History list, there's no text equivalent of what's on the ruler |
| A keyboard equivalent for every pointer action | The global keys (`App.tsx:88-147`), the ? overlay (`:282-286`), arrow keys in lists (ObjectList, the sibling menu), Esc on several overlays | See the list below this table |
| Reduced motion | The store's default comes from `prefers-reduced-motion` (`store.ts:143`). There's a toggle in the Transport ⋯ menu (`Transport.tsx:287-289`) and a test hook, `setReduced`. Checked by VC-5 and AC-24 (`tests/e2e/slice3b.spec.ts:247`). Busy, History's scrolling, the quote's fade and Activity all honour it | There's only one CSS `@media (prefers-reduced-motion)` rule (`styles.css:625`). The other CSS transitions rely on the store's flag (inferred) |
| Never hue alone | Every stage has a distinct shape or texture (the 09 ladder; `vocab.ts` `LOOKS`). The tally pairs a word with each colour (`labels.ts:183-190`). MapKey says so (`MapKey.tsx:73`) | The ruler's in-view ticks and the collapsed bar's dots differ only by colour (`Transport.tsx:230,304`). History's card icons are tinted by rung, but their glyphs differ by kind, not by state |
| Minimum hit targets | VC-3: hit circles have r ≥ 12 px and don't overlap, at every scale (`slice1.spec.ts:133-170`); the size floors in `sizing.ts:11-16` | Nothing checks the size of DOM controls; some toggle buttons are 11 px (`styles.css:241`) |

Keyboard gaps:
- The KeyHelp rows are a second, hand-written copy of the handler (`App.tsx:282-286` vs `:93-139`).
- The rate and ⋯ menus, MapKey, Connect and Coverage have no Esc.
- The tabs have no arrow keys, and the arrow keys can't reach the search results.
- Panning has no keys; `reveal` is the only way there (inferred).
- IPC has `favorites.reorder`, which is drag to reorder, but no UI for it was found (inferred).

### Engineering workflow that v1 must keep

Each item is a standard that carries over, with its source.

**Tests**
- **Unit and golden tests in Vitest**: `npm test`, about 5 s. Goldens live in
  `tests/golden/__golden__/*.json` (scenes, schedule, seek and highlights per scenario) and are
  accepted with `-u` (tests/README.md; 07 "Test types").
- **E2E with Playwright `_electron`**, in specs mapped to areas of the code. Windows stay hidden
  unless `STAR_CHART_TEST_SHOW=1` (tests/README.md:17-26, 39-53).
- **The keystone subset.** 17 specs carry the `@keystone` tag. `npm run e2e:keystone` takes about
  40 s, and keystone tests must pass on their own after `beforeAll` (tests/README.md:55-61;
  `package.json` scripts).
- **Iteration discipline.** While iterating, run the changed-area specs plus the keystone; run the
  full `npm run e2e` once before handing back (CLAUDE.md; memory, e2e-iteration).
- **Each launch is isolated:** its own `userData`, four workers, and `STAR_CHART_DB_DIR` for
  relaunches (`tests/e2e/launch.ts`; tests/README.md:55-61).
- **The drive tool.** `npm run drive -- <steps.ts>` keeps numbered screenshots, a `dump` (view
  graph, stack, camera, store), the console output and the redacted dev log. Steps are in
  `tests/drive/steps/`: tour, explore, sprints, board, open-timing, panel-metrics
  (tests/README.md:63-76).
- **Test hooks exist only under `STAR_CHART_TEST=1`** (`__starChartReady` and `__starChartTest.*`),
  and are absent from production (03 §10:796-844).
- **Fake ADO** (`STAR_CHART_FAKE_ADO`, `fixture-org`), with offline and failure injection
  (`STAR_CHART_FAKE_FAIL*`), and no test-only surface in production (tests/README.md:28-37).
- **Visual checks VC-1 to VC-6** (06 §8): goldens at `maxDiffPixelRatio 0.02`, label/list parity and
  contrast, 12 px hit targets, a leak baseline after 10 navigation round trips, a reduced-motion
  check, and the gallery.
- **The density harness** writes `test-results/density-report.md`, and fails on collisions,
  overlaps and undersized objects (06 §2:204-208).
- **The art gallery.** `npm run gallery`, development only, gated by `STAR_CHART_GALLERY=1`. Its
  stages are listed from the `vocab.ts` descriptions, and it's reviewed by eye (06 §8:773-779;
  CLAUDE.md).

**Logging**
- **The dev log**: `logs/run-*.jsonl`, keeping the last 3, one JSON line per event, throttled at
  200 per second, every entry redacted (`src/main/devlog.ts`; 03 §10:854-869).
- **The diagnostic log in packaged builds**: opt-in, under `userData/logs`. Only on/off crosses IPC,
  never the path or contents (03 §10:846-852; `panels/Connect.tsx:239-263`).
- **Redaction** (`src/main/redact.ts`; INV-18):
  - Identifiers become `h:` plus a salted HMAC of 10 hex digits; the salt is in
    `userData/devlog-salt`.
  - URLs keep only API words and safe query keys.
  - Strings survive only in allowlisted fields, and only if they also pass `TOKENISH`.
  - Any line containing a known name, the org URL or the PAT's start is dropped.

**Security boundaries**
- **The renderer boundary** (INV-16, 03 §6):
  - `contextIsolation` and `sandbox` on, `nodeIntegration` off (`src/main/index.ts:125-127`).
  - Opening windows is denied, and navigation is guarded (`:141-142`).
  - A strict CSP (`src/renderer/index.html:6`).
  - Every IPC call is zod-validated on both sides (`src/preload/index.ts:10`).
- **Keys, not URLs, over IPC.** Main resolves and allowlists `https://dev.azure.com/{org}` before
  `openExternal` (03 §6:573-575; `src/main/index.ts:334-338`).
- **PAT hygiene** (`src/main/credentials/store.ts`; INV-17):
  - The PAT goes in an uncontrolled password field, which is cleared before the call
    (`Connect.tsx:83-87`).
  - `setPat` is the only channel that carries it, and nothing echoes it back
    (`preload/index.ts:41-42`).
  - It's stored with `safeStorage` (Keychain) as ciphertext with mode 0600, falling back to memory,
    and always in memory in development and tests.
- **The canary token** is the only token the tests use. AC-25 asserts that it never appears in logs,
  the DB, IPC other than `setPat`, or renderer state (`tests/e2e/slice4.spec.ts:10,102`;
  `tests/e2e/diagnostics.spec.ts:36`; `tests/drive/drive.ts:32`).
- **Read-only ADO** (INV-21). The client's types allow only `GET | POST`, and POST is used only for
  the WIQL and `workitemsbatch` reads (`src/main/ado/client.ts:89-182`). No automated test asserts
  that there are no writes (a gap).
- **The DB and pictures live under `userData`**, never in the repo (`src/main/index.ts:34,151-156`;
  CLAUDE.md).

**Data and design rules**
- **No real data:** synthetic fixtures only, invented names, and live checks run by the user and
  reported as pass or fail (INV-18; CLAUDE.md).
- **Not a scoreboard:** no counts or rankings of people. For example, History's intro names items
  and never gives counts (INV-19; `History.tsx:84-103`).
- **`src/shared/` stays pure** (no Electron, DOM or Pixi), and the app uses Pixi v8 only
  (CLAUDE.md).

**Process**
- **Slices** (07; CLAUDE.md):
  - One slice at a time, each with a `docs/progress/slice-N.md` handoff note in five parts
    (07:17-25).
  - Stop at human gates for sign-off: HG-1, 2, 3, 3a, 6, H2, H3 and H4.
  - Read `handoff.md` first, and make one commit per slice.
  - Update the normative docs 02 and 03 in the same change.
- **Deferred decisions** go in `docs/91-ux-polish.md`, not in slice notes (91:8-9).

### Coupling and pain points

- **The vocabulary is a two-value switch bound to ADO.** `Vocab = 'starChart' | 'ado'`
  (`vocab.ts:5`). `KINDS` maps each `NodeKind` to its ADO type (`vocab.ts:9-19`). `SECTORS`
  (`:25-28`), `FLIGHT_MEANING` (`:76-80`), the `'InProgress'` rewrite (`:96`) and `LINES`
  (`:103-107`) are all written in ADO terms, and the toggle is labelled "ADO" (`App.tsx:160-161`).
- **Panels branch on ADO key kinds.** The Inspector dispatches on the `keyKind` values
  `'proj' | 'area' | 'wi' | 'repo' | 'pr' | 'id'` (`Inspector.tsx:36-48`), and the redactor
  hard-codes the same prefixes (`redact.ts:9-10`).
- **ADO wording in UI strings, outside `vocab.ts`:**
  - `Inspector.tsx`: `:30-31` ("Area Path or Epic", "ADO record"), `:60` ("Open in Azure DevOps"),
    the fact labels at `:268-275`, and the PR merge wording at `:319`.
  - `Trays.tsx:30,48` ("Unlinked PRs"), and the stale tooltip at `ObjectList.tsx:107`.
  - `Coverage.tsx:28,73-75`, `EmptyCosmos.tsx:105,112`, and `LoadingPlate.tsx:11-12` ("Finding
    Features", "Reading pull requests").
  - `App.tsx:270-272` (the paradigm tooltips, which name the ADO hierarchies) and `App.tsx:200`
    (the status bar's help string).
- **Label subtitles are built in ADO terms, in the shared projection**, outside the vocabulary layer:
  `src/shared/scene/project/ctx.ts:67`, `traffic.ts:59,107,254`, and `galaxy.ts:41` ("Project · N
  saved areas · events this week"). The Names toggle can't reach them (inferred).
- **ADO state names, hard-coded in shared logic:** `src/shared/playback/describe.ts:86` ('Active',
  'Resolved', 'Closed', 'Removed'), `src/shared/playback/accents.ts:37-44`, and
  `src/shared/hierarchy/sprints.ts:80`.
- **The title cap is derived from ADO type and state names** (`sizing.ts:95-103`).
- **English plurals of ADO type names:** `ObjectList.tsx:87` (`${typeName}s`, with a ys → ies fix)
  and `:128`.
- **PR IDs are parsed from the key string** with `lastIndexOf(':')`, in `Trays.tsx:52`,
  `Inspector.tsx:345` and `Coverage.tsx:118`.
- **Duplicated logic.** `rungOfEvent` in `Transport.tsx:316-324` and `rungOf` in `History.tsx:41-49`
  both switch on the ADO event kinds `wi_*` and `pr_*`. Both files also have their own `hex()`
  helper.
- **Key bindings are written in three places:** the handler (`App.tsx:93-139`), the help rows
  (`:282-286`), and the status bar's help text (`:200`).
- **The colour palette is split** between CSS variables and TS hex literals in about ten art files,
  plus SVG literals in MapKey (`MapKey.tsx:55-57`).
- **Label layout is code per kind:** `RANK` (`labels.ts:27`), the radius factors (`:247`), a
  special case for captains (`:276`), and CSS per kind (`styles.css:233-237`).
- **The hierarchy's vocabulary is only partly abstracted.** `LevelVocab`
  (`src/shared/hierarchy/types.ts:65-79`) holds a `{ chart, ado }` pair, so it still assumes exactly
  two vocabularies, and the `ado(typeName)` callbacks take ADO type names.
- **Minor:** `Inspector.tsx:263` reads `useChart.getState().vocab` during render, so it doesn't
  react to changes.

### Candidate abstractions (sketch)

- **A terminology pack per domain.** It replaces `Vocab`, `KINDS`, `SECTORS`, `LINES` and
  `FLIGHT_MEANING` (`vocab.ts`), and `LevelVocab` (`hierarchy/types.ts:65-79`).
  - It's keyed by `(domain, register)`, where the register is chart, source, or another.
  - It owns type names and their plurals (removing `ObjectList.tsx:87`), state verbs (from
    `describe.ts:86`), the `meta` templates now built in `scene/project/*.ts`, and the panel strings
    listed above.
  - The projection would emit structured fields (`type`, `id`, `state`, `person`) instead of
    preformatted `meta` strings.
- **A label layout spec.** Promote the modes in `labels.ts` and the CSS overrides into named tiers:
  expanded, standard, compact and minimal.
  - Each tier declares its row budget (title, subtitle, annotation, avatar), font tokens, maximum
    characters and pixel width.
  - A resolver picks the tier from motion (today's `compactFor`), focus and available space, and
    steps down a tier before hiding.
  - `LABEL_PX` and the title cap come from the tier, not from ADO names.
- **One theme module.** A single source of tokens (in TS) generates both the CSS variables and the
  art constants, with `RUNG_COLOR`, the plate and the text roles marked as vital or minor. A
  contrast test would then iterate over every text role × background token, extending VC-2 to the
  person, tally, lane heads and panel text.
- **A command registry.** One table of `{ id, keys, label, run, when }` feeds the key handler,
  KeyHelp, the status bar's hint and `data-tip-keys`, so a test can assert keyboard parity.
- **Panels adapt by entity role.** Register the Inspector's bodies by role (container, item,
  change set, repository, person) rather than by ADO key prefix. Shared helpers would replace the
  duplicated `rungOf` and `rungOfEvent` and the PR-ID parsing.
