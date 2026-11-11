# Slice V1-W0-T1: Contracts, stubs and fences

Built 2026-10-10, following [17 W0-T1](../17-v1-phases.md#w0-t1-contracts-stubs-and-fences) and
[14 §2](../14-architecture.md#2-interfaces). It's additive only: no v0 behaviour changes (one small
exception, the map key, is under 5).

## 1. What was built
- **Shared contracts**
  - `contracts/history.ts`: `Role`, `Rung`, `MappedState`, the widened `StateMapping` (`role?`,
    `entities?`) and `ScopeHistory.domainPack?`.
  - `contracts/view.ts`: the kinds `seat`, `objective`, `threat` and `facility`. `ViewNode` gains
    `asset?`, `piece?`, `cluster?` and `compound?`, and `ViewGraph` gains `solar?` and `lists?`. It
    also holds `PieceState`, `MegaList` and `MegaRow`.
  - `contracts/ipc.ts`:
    - `paradigmSchema` gains `'solar'`.
    - `stateMappingSchema` is now exported and declares every v1 field. `scopeHistorySchema` uses
      it, plus `domainPack` (regex-checked).
    - `CH.settingsGet` and `CH.settingsSet` are added, and `StarChartApi.settings?` is typed.
  - `contracts/maneuver.ts` (new): `Phase`, `PHASES`, `CastRole`, `Cast`, `PhaseSpan`,
    `ManeuverRule` and `PlannedManeuver`.
  - `contracts/settings.ts` (new):
    - The `CaptainStyle` and `UserSettings` types.
    - The zod schemas `captainStyleSchema`, `userSettingsSchema` and `userSettingsPatchSchema`.
    - The helpers `defaultUserSettings()`, `mergeUserSettings()` (viewer and captain merge per
      org) and `DEFAULT_THEME = 'star-chart'`.
- **Engine types** (`engine/types.ts`, new):
  - Everything in 14 §2.2–2.3: signals, pieces, moves, the event adapter, terminology, the domain
    pack, round facts and the solar layout outputs.
  - `Award` and `AchievementRule` (§2.9), so the FX types compile now.
  - `emptyRoundFacts()`, for W1-T5's stub `facts`.
- **Hierarchy** (`hierarchy/types.ts`): `LevelBase.playable?`, the `{ layout: 'solar'; source:
  SolarSource }` arm, `SolarSource` (with `fallback?`) and `Hierarchy.pacing?`.
- **Projection**
  - `scene/project/solar.ts` (new) is a stub `projectSolar(ctx, ref, src)` that places only the
    region's star at the centre (r 240).
  - `projectScene.ts` has one solar branch. If the source still has its `fallback`, the region is
    drawn with `projectSystem` over that fallback; otherwise with `projectSolar`.
- **Sizing** (`sizing.ts`): `FLOOR_PX.threat` is 0.55 of a label (like a vessel) and
  `FLOOR_PX.facility` is 0.9 (like a station).
- **Renderer**
  - `vocab.ts`: `KINDS` entries for the four new kinds, appended to `KIND_ORDER`.
  - `chart/assets/{types,registry}.ts`: `AssetCtx`, `AssetView`, `AssetDef`, and the functions
    `registerAsset`, `bindAsset`, `assetById`, `assetFor`, `allAssets` and `resetAssets`.
  - `chart/fx/types.ts`: `FxBeat`, `FxDirector`, `FxHost` (the director's host for now),
    `CommandDef`, `CastView`, `CastViews`, `CommandCall` and `ManeuverDef`.
  - `theme/types.ts`: `ThemeGuide` and `ThemePack`.
  - `theme/registry.ts`: `registerTheme`, `themeById`, `allThemes`, `onThemeInstall`, `useTheme` and
    `activeTheme`.
  - `theme/starChart/index.ts` is the remix table. It registers itself on import and fills
    `roleAsset` for all nine neutral roles.
  - `theme/starChart/{assets,maneuvers}/index.ts` are empty arrays.
  - `chart/scenes/solarGuides.ts` is a no-op `solarGuide` that the table lists.
- **Main**: `index.ts` and `fixtures.ts` take the `Paradigm` type. Nothing else changed there.
- **Fences**
  - **Import fence** (`eslint.config.mjs`):
    - All of `src/shared` may not import the renderer, in addition to the existing purity
      patterns.
    - Engine files (`engine/**` and `project/{solar,lists}.ts`) may not import `packs/**`,
      `hierarchy/{backlog,sprints}` or `project/{field,system,radar,traffic}`, with one carve-out:
      `projectCaptains` (and only that name) may be imported from `project/traffic.ts`. The
      traffic pattern uses ESLint's `allowImportNames`, so another name or a namespace import
      (`import * as`) still fails.
  - **Literal fence** (`tests/unit/literalFence.test.ts`): it fails on SDLC names written as
    string literals, or on theme words used as whole words (any case), in any engine file. It
    globs the files, so new engine files are covered automatically.
- **Tests**: `tests/unit/contracts-v1.test.ts` and `tests/unit/literalFence.test.ts`.

## 2. Contracts changed
- [03 §4](../03-contracts.md#4-scopehistory--the-main--renderer-bundle): a pointer to the v1
  mapping fields.
- [03 §5b](../03-contracts.md#5b-sprints-decided-2026-10-07): the paradigm gains `solar`. Sprints
  stays the default until W1-T5.
- **03 §5d (new)**: every v1 shape as built, the solar branch, the fences and the renderer
  registries.
- [03 §6](../03-contracts.md#6-ipc-api): `settings?` and `UserSettings`.
- **Departures from 14, recorded in 03 §5d:**
  - **The fallback dispatch is in `projectScene`, not `solar.ts`.** 17 describes the stub as
    "`projectSystem` over `src.fallback`", but the import fence forbids `solar.ts` from importing
    `project/system.ts`. Because the branch prefers the fallback while one exists, W2-T1 only
    needs to drop `fallback` from `solarSource.ts` and fill in `projectSolar`. It doesn't need to
    touch `projectScene`.
  - **The import fence lets `projectCaptains` through from `traffic`.** 17 W2-T1 and 14 §6 have
    the real `solar.ts` draw captains via `projectCaptains`, which only `project/traffic.ts`
    exports. A full traffic ban would have failed W2-T1's lint on a file it can't change. So the
    carve-out is made here, in `eslint.config.mjs`, and recorded in 03 §5d. 14's fence text
    (line 27, "`project/{field,system,radar,traffic}`") doesn't mention the carve-out yet.
    **Follow-up (W4-T3, docs):** add the `projectCaptains` exception to 14's fence paragraph.
  - **`FxDirector.bias` is a field (`bias: number`), not `bias(v)`.** `AnimationDirector` already
    has `bias = 0` as a property, so W2-T4's "`implements FxDirector` only" holds without
    changing the director.
  - **`ViewNode.asset` holds a neutral role id** (`'objective'`, `'agent'`), not a theme asset id.
    Shared projection can't know theme words, and the literal fence forbids them. The theme binds
    each role to its asset through `bindAsset` (done by `useTheme`). `assetFor` resolves the
    binding first, then the raw id.
  - **`StarChartApi.settings` is optional.** If it were required, the preload (W2-T6's file)
    would fail typecheck until W2-T6 lands. W2-T6 can make it required.
  - **`Award` and `AchievementRule` live in `engine/types.ts`**, not `engine/achievements.ts`.
    W2-T7 should import them from there (or re-export them).
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**: `npm run typecheck` is clean and `npm run lint` is clean. `npm test` passes: 30 files,
  372 tests, including the 12 new ones.
- **Goldens unchanged**: `git status tests/golden` is clean.
- **Zod round trip** (`contracts-v1.test.ts`):
  - A v0 bundle parses to exactly itself, apart from the mapping's `$comment` notes, which zod
    already dropped before this change. No `domainPack` key appears.
  - Every v1 field round-trips.
  - A bad role, rung or pack id is refused.
  - Schema and type agree both ways (`expectTypeOf`).
  - User settings: defaults and a full file round-trip; a viewer given by name, a bad faction or
    another version is refused; a patch merges per org.
  - The solar arm with its fallback equals the v0 pod system's graph. Without the fallback, it
    draws the star alone.
- **Literal fence**: passes on the engine (`engine/types.ts`, `scene/project/solar.ts`). A planted
  `asteroid` comment and `'Closed'` literal in a probe engine file failed it, and the probe was
  then removed.
- **Deliberate import-fence violation**, checked once and reverted. A probe engine file imported
  `../packs/registry`, `../hierarchy/sprints`, `../scene/project/system`,
  `../../renderer/src/vocab` and `pixi.js`, and `solar.ts` imported `./system`. `eslint` reported
  all 6 with the fence messages. With the probe removed, `eslint src/shared` is clean.
- **Traffic carve-out** (after review), checked with probes that were then removed. Importing
  `{ projectCaptains }` from `../scene/project/traffic` in an engine file lints clean, and so
  does `./traffic` from `solar.ts`. `{ projectTraffic }`, `import * as traffic`,
  `{ projectCaptains, stationStep }` (only `stationStep` reported), `prLane` from `solar.ts`,
  and `../scene/project/system` all fail. After that, `npm run lint` and `npm run typecheck` are
  clean, and `contracts-v1` plus `literalFence` pass (12 tests). Keystone wasn't re-run: the change
  is lint config and docs only, and touches no built code.
- **Keystone**: 37 of 38 passed in the batch. `devlog.spec.ts` "a session is recorded" timed out
  waiting for `.area-chooser`. Re-run alone, after a fresh build, both devlog tests passed. This
  looks like load flakiness from other agents' builds and runs, not this change: nothing here
  touches the chooser, and the e2e suite pins `backlog`.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **The map key now lists the four v1 kinds in v0 too.** `MapKey.tsx` renders a row for every
  `KIND_ORDER` entry, and 17 asks for the new kinds in `KIND_ORDER` so VC-2's object list groups
  them. No test checks it, and the slice1 pixel baselines are canvas-only.
  - **Follow-up (W3-T1, which owns `App.tsx` and the panels, or W4-T3):** show v1 rows in
    `MapKey` only when one is present or the paradigm is `solar`.
- **The stub `roleAsset` ids are placeholders** (`world`, `asteroid`, `hive`, `dreadnought`,
  `captain`, `augmentation`, `shuttle`, `point-defense`, `none`). W2-T3 sets the real ids, and
  `registries.test.ts` should skip `step`, `attachment`, `guard` and `container`: those are drawn
  inside their parent's asset, or not at all.
- **Nobody calls `useTheme` yet, and nobody imports `theme/starChart` yet.** W3-T1 (or W2-T2's
  hook in `GraphScene`) imports `theme/starChart` once and calls `activeTheme()`.
- **`FxHost` is only an alias for `DirectorHost`.** W2-T4 can widen it in `fx/types.ts` if its
  host needs more (an effect layer, reduced motion), as a small additive change.
- **`Hierarchy.pacing` imports `ScheduleOptions` type-only from `playback/schedule.ts`.** That file
  imports `hierarchy/types` back, which is a type-only cycle and harmless.
- **The `userSettingsSchema` bounds are guesses**: hull 0–63, colourway 0–255, and theme and org
  keys up to 60 and 200 characters. W2-T6 can tighten them to the art's real counts.
