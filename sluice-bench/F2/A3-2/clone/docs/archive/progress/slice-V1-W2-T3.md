# Slice V1-W2-T3: Star Chart theme assets

Built 2026-10-10, following [17 W2-T3](../17-v1-phases.md#w2-t3-star-chart-theme-assets) and
[14 §1.4, §2.8, §5](../14-architecture.md#28-renderer-registries), with 13 §4 and §7. It's additive:
nothing imports `theme/starChart` yet (W3-T1 does), so v0 behaviour doesn't change. No shared file
and no art file was edited.

## 1. What was built
All of it is under `src/renderer/src/theme/starChart/`.
- **`factions.ts`**
  - One `Faction` type (`trek | wars | mecha`) and `FACTIONS`, in the art's order.
  - A compile-time check that it equals `fleet.ts`'s `Faction`, `dreadnoughts.ts`'s `Faction` and
    `CaptainStyle['faction']`. `ART_FACTIONS` exposes both art lists for the order test.
  - `hullsOf(faction)`: that faction's indices into `FLEET_HULLS`.
  - `designOfStyle(style)`: a `CaptainStyle` as a `FleetDesign`. `hull` is an index *within* the
    faction, and both `hull` and `colourway` wrap, so an out-of-range saved value still gives a
    valid ship.
  - `agentDesign(seed, style | null)`: the style if given, else `fleetDesign(seed)`.
  - `stationLook(seed, faction?)`: the faction is `seed mod 3`, or the given one, and the colourway
    is `floor(seed / 3) mod` that faction's colourway count. So a summoned station keeps the repo's
    pick within the viewer's faction, and is the same on every run (13 §7).
- **`words.ts`**: the chart register (12 §2–§3 game forms).
  - Roles: asteroid, hive ship, augmentation, station, tender shuttle and point defense. The agent
    is a captain.
  - Levels: galaxy, sector, solar system, planet and frontier belt.
  - The rungs and the container fall back to the engine's words.
- **`stageCodec.ts`**: pure, with only type imports from the art. It decodes through
  `engine/stageCode.ts` (`decodePiece`), not 14 §2.4's stale examples.
  - `pieceOf(stage, role)` gives the piece, or null when the stage doesn't decode or names another
    role (INV-11).
  - `seatLook`: `world.<percent>.m<m>r<r>`. The outcomes are always written (0 when unset), so a
    stale count never stays on the world. The line isn't written: it comes from the seed.
  - `objectiveLook(p, material?)`: `asteroid[.<material>].<state>:<steps>`, through
    `asteroidState`.
    - Ready is sketch, deferred or ready, by its flags.
    - Nearing is `resolved` below step 0.5 and `accept` from 0.5 (`ACCEPT_STEP`).
    - Off is `ghost`, and unknown is `unknown` (the grey "?").
    - Steps are always written, so `:` alone clears them.
  - `threatLook(p, swarm, look?)`: `threat.<swarm>.<look>|<steps>`, through `threatState`.
    - Accomplished rests as `ruin` (14 §4).
    - Off is `rejected` when struck, else `ghost`.
    - Unknown is `ghost`.
    - No steps is written `-`, so the art's default locks never appear.
    - `THREAT_ACTS` maps `emerge`, `breakup` and `warp` to the art's moments.
  - `facilityLook(p, act?)` gives the parameters for the art's own `stationStage`: the
    intensity (when set), `pr` = the open count, and `pd: 'idle'`. `STATION_ACTS` lists `jump`,
    `intake`, `cover` and `dock`.
  - **Steps unset and steps `[]` draw identically** on both the asteroid and the hive. That settles
    the W0-T2 question on the art side; builders still pick one for the stage string itself.
- **`assets/adapt.ts`** (one more file than 17 lists; see 2)
  - `AdaptedView`: an `AssetView` over an art view.
    - `setStage` takes the neutral stage and hands the art its own grammar.
    - `act(name)` plays a transient look, which **ends by itself** after `ACT_S` (the art's
      `EVENT_LOOP_S`, 3 s) of the clock the view is ticked with. `act('rest')`, or the next stage,
      ends it sooner, and a replay restarts the count. So a resting look stays a pure function of
      the snapshot (14 §4, INV-12) without anyone having to call `rest`.
    - An optional `restore(art)` undoes what an act changed outside the stage's look. The agent
      uses it to put a transformed hull back in its first pose.
    - It exposes `face` and `setLightFrom` only when the art has them, so W2-T2's shape checks see
      the art's own shape.
  - `sampleNode`, `samplePiece`, `sampleKey` (invented keys) and `NO_VIEWER`, for gallery samples.
- **`assets/{seat,objective,threat,facility,agent}.ts`**: one `AssetDef` each.

  | Role | Asset id | Art | Layer | moving / framed / flare / body | Floor, hit floor | Rank | Acts |
  |---|---|---|---|---|---|---|---|
  | seat | `world` | `WorldView(r, seed)` | celestial | ✓ ✓ ✓ · | — | 1 | — |
  | objective | `asteroid` | `AsteroidView(r, seed, asteroidMaterial(seed))` | celestial | ✓ ✓ ✓ ✓ | —, 12 | 3 | — |
  | threat | `hive` | `HiveShipView(hiveDesign(seed), 2r)` | infrastructure | ✓ ✓ ✓ ✓ | 0.55 label, 12 | 3 | emerge, breakup, warp |
  | facility | `dreadnought` | `DreadnoughtView({ faction, colourway, length: 2r, seed, guardCount })` | infrastructure | · ✓ · · | 0.9 label | 2 | jump, intake, cover, dock |
  | agent | `captain` | `CaptainView(design, r)` | traffic | · · · · | 0.6 label | 4 | transform |

  - The floors equal `sizing.ts` `FLOOR_PX` for the matching kinds, so W2-T2's `boundsOf` (which
    still reads kind floors) agrees with them.
  - **Facility**: when `compound.summoner` is the viewer and the viewer chose a style, the
    station takes the viewer's faction (`facilityStyle`). Guards are `compound.guards`, clamped to
    the art's 3 mounts.
  - **Agent**: `CaptainStyle` is applied to the viewer's own ship only (`agentStyle`). The neutral
    stage leaves a captain as it is, since a captain carries no rung. `transform` steps through a
    hull's poses (the Mecha fighter), and the hull returns to its first pose when the act ends.
  - **`rebuildOn`** (facility and agent) compares what the view was built with (faction,
    colourway and guards, or hull and colourway) to what the node and context give now. So a
    viewer or style change rebuilds only the viewer's ship and the stations they summoned.
  - **`samples()`** for every def, built through the same `make`:
    - seats: three people, share 0 → 1, with outcomes;
    - objectives: one cell per material, every rung with steps;
    - threats: one cell per swarm, every rung with locks;
    - facilities: one per seeded faction, plus one summoned by the viewer in each faction;
    - agents: seeded ships, and the viewer's style across every hull.
- **`assets/index.ts`**: `assets` (all five), plus the named exports.
- **`index.ts`** (the remix table)
  - `words` is filled.
  - The `roleAsset` ids are kept (`world`, `asteroid`, `hive`, `dreadnought`, `captain`), and are
    now real registered assets.
  - New `INNER_PARTS` lists the ids of roles drawn inside a parent, or not drawn at all:
    `augmentation`, `shuttle`, `point-defense` and `none`. No asset registers them, so a stray
    node of one of those roles falls through to the v0 switch.
- **Tests**
  - `tests/unit/assetStage.test.ts`: 12 tests.
  - `tests/unit/registries.test.ts`: 14 tests.

## 2. Contracts changed
- **No shared contract changed**, and no file outside this task's list was edited.
- **One extra file, `theme/starChart/assets/adapt.ts`.** It's new, in this task's own folder, and
  holds the wrapper the five adapters share. It isn't in 17's Creates list.
- **One extra export, `INNER_PARTS`** in `theme/starChart/index.ts`. `registries.test.ts` reads it
  to tell the inner parts from the drawn roles (as W0-T1's note asked).
- **Departures, as built:**
  - **Threats are in the `infrastructure` sublayer**, not `traffic`, so captains fly over them.
  - **Unknown and deferred threats.** The hive has no unknown or deferred look, so an unknown
    threat shows as a ghost and a deferred one as `ready`. The asteroid has both looks.
  - **Struck objectives.** The asteroid has no struck look, so a struck objective is a plain
    `ghost`.
  - **The viewer's faction for a station applies only once the viewer has chosen a style**
    (`ctx.captain`). `AssetCtx` carries no viewer seed, so with no style chosen, a summoned station
    keeps its repo's seed. If the viewer's *seeded* faction should apply too, `AssetCtx` needs a
    `viewerSeed` (a type-only change in `chart/assets/types.ts`).
- **Follow-up for W4-T3 (03 §5d):** add the art grammar table above (the `stageCodec`
  functions), the asset ids and capabilities, `INNER_PARTS`, the acts per asset, and the `rest`
  act.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean (node, web and e2e).
  - `npm run lint`: clean.
  - `npm test`: 47 files and 696 tests pass. That includes the other W2 tasks' tests that were in
    the tree.
- **Goldens unchanged**: `git status tests/golden` shows only other tasks' new files (W1-T2,
  W2-T1 and W2-T7). This task wrote none.
- **`assetStage.test.ts`** reads every string back through the art's own parser.
  - **Objectives** (`asteroidStage`): all 9 SDLC Story states give the expected state, in every
    material, and the art reads back the exact signal. Steps keep socket order, cut to 6, and unset
    equals `[]`. Over every rung × flag × step combination (480 signals), only an unknown signal is
    `unknown`, and every other one parses on its own rung.
  - **Threats** (`parseThreatStage`): all 9 SDLC Bug states give the expected look, in every
    swarm, on its own rung (`THREAT_LOOKS`). Locks round-trip, and unset or `[]` mean none. All
    480 signals land on their rung (unknown → off). The acts give the art's moments and keep the
    steps.
  - **Seats** (`parseWorldStage`): every share from 0 to 1 in 0.05 steps, with outcomes, reads
    back exactly, and `worldRung` agrees with the seat's rung. No share means a share-0 world.
  - **Facilities** (`parseStationStage` over the art's `stationStage`): intensity, the open count
    and the idle guards read back in every faction, at rest and in every act.
  - **INV-11**: v0 keys, empty or malformed stages, `toString`, `__proto__` and another role's
    stage are all unknown, and each art shows its neutral look for them.
- **`registries.test.ts`**
  - Every drawn `roleAsset` is registered, and every registered asset is some role's. After
    `useTheme('star-chart')`, `assetFor({ asset: role })` finds each one. The inner parts, and v0
    nodes, find none.
  - The capabilities, floors, hit floors, ranks and acts are checked, as are the sample cells'
    stages (each decodes to its def's role).
  - Faction order equals both art files. A chosen style always gives a hull of its own faction
    and a valid colourway. A station keeps its seed's colourway in any faction.
  - The viewer's style reaches only their own ship and the stations they summoned. Someone else's
    summon, no viewer, or no style chosen all give the seed's look.
  - The chart-register words name the roles and levels in theme words, never SDLC names.
  - **Acts end on their own** (3 tests, over a fake art): the resting look comes back `ACT_S`
    after the act's first tick and not before; `rest`, the next stage and a replay end or restart
    it; an unknown act does nothing; and a view whose stage draws nothing (a captain) still ends
    through `restore`.
- **Review fix (acts never ended).** After it: `npm run typecheck` shows only 20 errors in
  `tests/unit/commands.test.ts` (W2-T4's file, in flight: string literals as `CanonicalKey`), none
  in this task's files. Lint is clean on `theme/` and the tests. `npm test`: 48 files, 714 tests
  pass. The gallery wasn't re-run: it doesn't load the theme, and the probe that did is gone.
- **`npm run gallery` starts with no console errors.** It ran inside the build lock, hidden
  (`STAR_CHART_TEST=1`), with a CDP connection.
  - The gallery logged no errors. It logged two Pixi `[BindGroup]` warnings, which come from the
    existing gallery: none of this task's code was loaded at that point.
  - A temporary probe, since deleted, then imported the theme through Vite in the live renderer
    and ran the real WebGL path, with no errors or warnings. For every def's samples, it built all
    33 views, set every cycle stage, played every act and `rest`, called `face` and
    `setLightFrom`, ticked, rendered and destroyed them.
  - `rebuildOn` was checked there too. It's false for an unchanged context, and true when the
    viewer takes a style, for both their ship and their summoned station.
- Keystone and Full weren't run. They aren't among this task's checks, nothing in the app imports
  the theme yet, and W2-T1, T4 and T6 are still in flight (so this isn't the wave's last task).

## 4. Screenshots
No human gate. The probe's still, from fixture-style invented keys, is at
`/tmp/star-chart-w2t3/still.png` (outside the repo). At the plan's world sizes, half scale, it
shows:
- a Nearing world with outcomes;
- an Underway asteroid and a Ready-to-Accept asteroid, with their augmentations;
- an engaged hive with locks, and a ruin cloud;
- a station summoned by the viewer, in Wars, with 8 open attachments (its tenders round the hull);
- a seeded ship and the viewer's styled ship.

## 5. Known limitations and open questions
- **Not seen on a real solar scene yet.** W3-T1 imports `theme/starChart`, which activates it,
  and calls `scene.setAssetCtx`. W2-T1's projection must set `asset` to the neutral role (`seat`,
  `objective`, `threat`, `facility`, `agent`) and `stage = encodePiece(piece)`. A facility's piece
  needs `open` (the count of open attachments) and `intensity`, because the adapter draws only the
  stage.
- **Tender gaps aren't drawn** (14 §9 D2). The art fills shuttles by count, so first-fit slots
  with gaps show packed. This needs a slot mask in the art (`pm=<bits>`).
- **Acts are whole-view looks, and end by themselves after `ACT_S` (3 s).** An earlier version of
  this note said `landStage` undoes an act. It doesn't: `landStage` and `landAllStages` re-apply
  only *pending* stage changes, and `stageTo` skips an unchanged stage. That's why acts now time
  out inside the adapter.
  - **Follow-up (W2-T4 / W3-T1):** a seek should still land the resting look at once, not up to 3 s
    later. `GraphScene.landAllStages` (or the interpreter's `clear()`) should call `act('rest')`
    on every asset view. Neither file is this task's.
  - The act's clock is the one `GraphScene.tick` passes (`ChartApp.elapsed`). With the clock frozen
    (`frozenAt`, e2e stills), an act played just before the freeze keeps its look until a `rest`
    or the next stage, which the follow-up above covers.
  - The length is wall-clock seconds, while the station's own moment loops on `motion.pulseTime`
    (up to 2× at fast playback), so at 2× a station act shows two loops.
- **The `built` maps in `facility.ts` and `agent.ts`** (projection key → what the view was built
  with) are never pruned. They're bounded by the facility and captain nodes ever made, which is
  small. A `forget(pk)` hook would need an `AssetDef` change.
- **The threat's size is `2r` for its length**, the same footprint as a captain's (13 §4.5), and
  the station's is `2r` for its hull. The density harness (W4-T2) should referee both.
- **The gallery doesn't list these samples yet.** W4-T1's registry section mounts
  `def.samples()` through the registry. `Gallery.tsx` isn't this task's file.
- From the known follow-ups, this task closed:
  - the stage codec builds on `stageCode.ts`;
  - the facility passes the open count;
  - agents use `CaptainView`;
  - steps unset and `[]` draw alike.
  The rest (`signal.ts`, facts, pacing) aren't in this task's files.
