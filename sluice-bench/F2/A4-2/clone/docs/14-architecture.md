# 14 — v1 architecture

**Status:** current as of 2026-10-26 (through v1.2), checked against the working tree. Built through W4
(2026-10-10 to 2026-10-13), with the art sessions' additions and the finales (17, "As built after
W4"). W5-T1's automated checks ran on 2026-10-13; HG-V2, HG-V3, HG-V3′ and HG-V4 are still to come
(17). This doc was the P3 design. Where the build departs from it, an **As built** note says so here,
and [03 §5d](03-contracts.md#5d-v1-additions-17-built-2026-10-10-to-2026-10-12) holds the shapes as
built (03 is normative). Values (rule lists, lengths, sizes, commands) live in
[15](15-reference.md); this doc names the constants and links there. The task handoffs are
`docs/archive/progress/slice-V1-*.md` (W5-T1's is still in `docs/progress/`).

This doc describes how v1 is built: the modules, the interfaces between them, and the rules that
keep replay deterministic. It implements [13-game-design.md](13-game-design.md) in the vocabulary
of [12-glossary.md](12-glossary.md). [03](03-contracts.md) stays normative for every contract it
already defines; the v1 additions below are copied into 03 by the first task that builds them
(17, W0-T1).

The shape is a **strangler**. v1 is a third hierarchy chain, `solar`, built beside v0. It reuses
v0's data model end to end (the Sprints sector, pods, streaming, the scheduler and the clock), and
it reaches its new modules through a small number of registration hooks. v0 behaviour doesn't
change, and v0 stays reachable through `STAR_CHART_PARADIGM`.

Three kinds of code, and what each may know:

| Layer | Lives in | Knows | Never knows |
|---|---|---|---|
| **Engine** | `src/shared/engine/**`, `src/shared/scene/project/solar.ts`, `lists.ts` | Roles, categories, rungs, signals, seats, rounds, regions, moves, phases | Type or state names ("User Story", "Closed"), theme words ("asteroid") |
| **Domain pack** | `src/shared/packs/<id>/**`, `config/packs/*.json`, `config/state-mapping.json` | Its own type, state and source names, its thresholds and its words | Theme words, Pixi, DOM |
| **Theme pack** | `src/renderer/src/theme/<id>/**` | Assets, factions, choreography names (Landing, Strike run), art stage grammars | Type or state names |

Two checks enforce the split mechanically (17, W0-T1 and W1-T1):
- **An ESLint import fence** in `eslint.config.mjs`: `src/shared/engine/**` and
  `src/shared/scene/project/{solar,lists}.ts` may not import `src/shared/packs/**`,
  `src/shared/hierarchy/{backlog,sprints}.ts` or `src/shared/scene/project/{field,system,radar,traffic}.ts`,
  with one carve-out: they may import `projectCaptains` and `projectGuests` (and only those names) from
  `project/traffic.ts`, because solar draws its ships with the shared captain projection (§6);
  `projectGuests` (2026-10-12) adds a ship for a helper who has no seat. A
  namespace import of `traffic`, or any other name from it, still fails.
  `src/shared/**` may not import `src/renderer/**` (it already can't import Pixi or the DOM).
- **A literal fence test** (`tests/unit/literalFence.test.ts`) that greps the engine files above for
  SDLC names (`'User Story'`, `'Bug'`, `'Task'`, `'Feature'`, `'Closed'`, `'Active'`, `'Resolved'`,
  `'Pull Request'`) and theme words (`asteroid`, `hive`, `dreadnought`, `station`, `shuttle`).

---

## 1. Module map
*Applies to: Solar.*

Every path below was checked with `ls` on 2026-10-13. v0 modules are in §7.

### 1.1 Shared engine (pure)

| Path | Contents |
|---|---|
| `src/shared/engine/types.ts` | Every engine type in §2.1–2.4, in one file so later tasks compile against it |
| `src/shared/engine/signal.ts` | `resolveRole`, `resolveSignal`, `attachmentSignal`, with v0 fallbacks; `RUNG_OF_STAGE`, a mirror of `art/progress.ts` `SIGNALS`, kept equal by a parity test |
| `src/shared/engine/stageCode.ts` | `encodePiece(piece)` and `decodePiece(stage)`: the theme-neutral stage string GraphScene diffs |
| `src/shared/engine/facts.ts` | `roundFacts(h, ref, pack)`: memoised intervals per piece (membership, seat, signal, parent), attachment links, authors and approvers, event times. **As built:** the only home of the timeline readers (`memberAt`, `seatAtTime`, `heldSpans`, `seatAtEvent`, …; 03 §5d) |
| `src/shared/engine/moves.ts` | `movesOf(h, pack)`: every event normalised once into `Move[]`, memoised per bundle |
| `src/shared/engine/terminology.ts` | `terminology(pack, register)`: nouns per role and level, in the chart or source register |
| `src/shared/engine/solar/*.ts` | The fixed setup (§4): `plan`, `seats`, `slots`, `formations`, `frontier`, `stations`, `compound`, `version` |
| `src/shared/engine/pace.ts` | Engine-named maneuver rules: phases and durations per rule id (`objective.accomplish`), `RULE`, `PACE_RULES`. **As built (2026-10-13):** 16 rules, including the milestones `seat.complete` and `region.clear` (`seatCompletedBy`, `regionClearedBy`). The list and lengths: [15 §7](15-reference.md#7-maneuvers) |
| `src/shared/engine/maneuvers.ts` | `planManeuvers(...)`, `pacing(pack)`: the schedule hooks that size beats from pace data. **As built:** also `shapeOf`, `scheduleFacts` (a view of `roundFacts`, 23 D3), `priorityFor`, `OPENING_ORIENT_MS` |
| `src/shared/engine/limelight.ts` | 22 C6: `limelightOf(...)`, who is named across an episode (first turns, a fair share, moments) and each day turn's spotlight; `FAIR_TURN_MS` |
| `src/shared/engine/guests.ts` | 22 C8: `helpOf`, `guestPresence`, `presentAt`, `GUEST_STAY_MS`: when each guest is in a region, planned over its schedule (05 §8 K-13, K-14) |
| `src/shared/engine/achievements.ts` | `achievementsFor(facts, viewer, pack, opts?)` and the v1 rule set (13 §8). `Award` and `AchievementRule` live in `engine/types.ts` |

### 1.2 Shared packs, hierarchy and projection (pure)

| Path | Contents |
|---|---|
| `src/shared/packs/registry.ts` | `registerPack`, `packFor(h)` (`h.domainPack ?? 'sdlc'`), `packById(id)` |
| `src/shared/packs/all.ts` | Imports and registers every pack |
| `src/shared/packs/sdlc/{index,words,adapter,thresholds,links}.ts` | The SDLC pack. `links.containerUrl` builds a read-only ADO web URL (INV-21) |
| `src/shared/packs/{todo,crm}/{index,words,adapter}.ts` | Fixture-only demo packs. **As built:** each pack's thresholds live in its `index.ts` (no `thresholds.ts`): Todo 2 working days, K = 3; CRM 10, K = 4 (13 §8) |
| `src/shared/hierarchy/solar.ts` | `SOLAR`: `chain('solar')` with a round level (its own field source, `solarRoundField`, since 19 P1) and a region level (`layout: 'solar'`) |
| `src/shared/hierarchy/solarRound.ts` | 19 P1: `solarRoundField`, Solar's round. It reuses the Sprints sector's order, members and pass-through, gives each pod star the Solar plate, and in place of the v0 miniature a preview of its region (`regionPreview`: the region's seats in fixed slots, today's assignees first and the seats history adds once the region's history is in; its objectives and threats as counts) |
| `src/shared/hierarchy/solarSource.ts` | The SDLC-neutral `SolarSource`: the region's star (reusing the Sprints pod centre), its board facts and its pack. **As built:** also `paceFacts(h)`, the facts pacing and the planner share; since 2026-10-13 memoised per bundle and carrying each pod's own facts (`RoundFacts.regions`) for the milestones. Since 19 P1, `regionCounts` and `solarPodStar` (the pod star's path-and-count subtitle, in the round and at the region's centre) |
| `src/shared/scene/project/solar.ts` | `projectSolar(ctx, ref, src)`: fixed setup plus snapshot gives nodes, orbit edges, `graph.solar`, `graph.lists`. **As built:** also `boardFacts`, `slotAt` and `seatPiece` |
| `src/shared/scene/project/preview.ts` | 19 P1: places a `FieldPreview` round its pod star (`projectPreview`): seat planets in fixed slots on rings (`previewSlot`, a slot's place by its number alone), the asteroid cluster and the hive marks, all decorative. `PREVIEW`'s sizes and fixed footprint are 15 §5, *Preview* |
| `src/shared/scene/project/lists.ts` | `MegaList` builders for a seat, an objective or threat, and a facility. `ROW_BUDGET` (defined here only; the renderer imports it; value in [15 §6](15-reference.md#6-labels-and-type)) |

### 1.3 Config, fixtures and main

| Path | Contents |
|---|---|
| `config/state-mapping.json` | Gains `role` per type, `rung` and signal flags per state, and `entities.attachment` (names unchanged) |
| `config/packs/{todo,crm}.mapping.json` | Pack mappings, same shape |
| `fixtures/scenarios/v1/index.ts` | `v1Scenarios`, kept out of `scenarios` so AC-27 and the v0 goldens stay put |
| `fixtures/scenarios/v1/{pod-sprint,todo-week,crm-quarter}.ts` | The three served v1 scenarios |
| `fixtures/scenarios/v1/achievementCases.ts` | Test-only mini scenarios: one earn and one near miss per achievement |
| `src/main/userSettings.ts` | `userData/settings.json` (modelled on `windowState.ts`, so it survives Purge) and `registerSettingsIpc()` |

### 1.4 Renderer

| Path | Contents |
|---|---|
| `src/renderer/src/hierarchy/registry.ts` | `registerHierarchyUi(paradigm, ui)`, `uiFor(paradigm)` |
| `src/renderer/src/hierarchy/solarUi.ts` | `{ ...sprintsUi, hierarchy: SOLAR, chooser: 'sprints' }` |
| `src/renderer/src/playGate.ts` | `playableHere()`: false at the galaxy and on any level with `playable: false` |
| `src/renderer/src/playHooks.ts` | `registerBeatPlanner`, `registerRecapHook`: the two calls `playback.ts` makes into v1 |
| `src/renderer/src/v1/{plan,awards}.ts` | Registers the solar beat planner and the achievements recap hook |
| `src/renderer/src/v1/lines.ts` | **As built (W3-T1):** the Transport's and History's lines, rungs and subjects under Solar, read through the pack |
| `src/renderer/src/chart/assets/{types,registry}.ts` | `AssetDef`, `AssetCtx`, `registerAsset`, `assetFor` |
| `src/renderer/src/chart/scenes/{solarGuides,guidePresence,placeFormation}.ts` | The frontier belt (`solarGuide`, shown only while unassigned work is in it, 19 S2; the threat light retired) and when a guide that shows for its nodes is wanted in play (`guidePresence`); the formation and platform pitches and the station pass (08 §7) |
| `src/renderer/src/chart/overlays.ts`, `overlays.css` | `ChartOverlay` registry (the hover ring; the mega-label overlay retired in v1.1, 19 L2) |
| `src/renderer/src/chart/labelTiers.ts`, `chart/holo/holoRows.ts` | `tierFor`; `HoloRows`, an expanded holo plate's rows (19 L2) |
| `src/renderer/src/chart/fx/types.ts` | `FxDirector`, `FxHost`, `CommandDef`, `ManeuverDef`. **As built:** also `AmbientWork`, `Entrance`, and (2026-10-13) `Finale`, `FinaleCast` |
| `src/renderer/src/chart/fx/{commands,movers,host}.ts` | The command registry over `effects.ts` and `moves.ts`; movers copied from `director.ts` (the v0 copy stays) |
| `src/renderer/src/chart/fx/v1/{interpreter,registry,switching}.ts` | `ManeuverInterpreter`, `registerManeuver`, `SwitchingDirector` |
| `src/renderer/src/theme/{types,registry}.ts` | `ThemePack`, `activeTheme()`; `moreText(n)` is every `+N more` site's string (23 E6) |
| `src/renderer/src/theme/starChart/readCopy.ts` | 23 E6/E7: the theme's `ReadCopy` (`ThemePack.readCopy`): the "How to read the chart" sentences, the guided tour's seven steps and `+N more`. Every noun is read through terminology (chart register `c`, source register `s`), so a theme or pack swap rewrites them |
| `src/renderer/src/tour/{tourRun.ts,tourStore.ts,Tour.tsx,tour.css}` | 23 E7: the guided tour. `tourRun` opens Halcyon Reach's Comet Pod in the fixture (from ADO mode it switches the data source and `endTour` puts it back), `reach` plays the pod until a step's object is drawn, `targetNow` finds it through `nav.liveScreen()`; `Tour.tsx` is the overlay and the first-launch `TourOffer` |
| `src/renderer/src/theme/starChart/index.ts` | **The remix table**: role → asset, rule id → maneuver, command overrides, guides (`solarGuide`), words, `seatTitle`, and the `ambient`, `entrance` and `finale` hooks. **As built:** holo labels are chosen per asset (`AssetDef.label`), not here |
| `src/renderer/src/theme/starChart/{factions,words,stageCodec}.ts` | One `Faction` type; chart-register words; neutral → art stage strings (pure) |
| `src/renderer/src/theme/starChart/{commands,entrance,ambient,homeworlds}.ts` | **As built:** the theme's own commands (`commands`); entrances and the `enter` command (`entranceCommands`); captains' idle work (`AmbientWork`); homeworld seat titles. The command list: [15 §8](15-reference.md#8-effects) |
| `src/renderer/src/theme/starChart/finales.ts` | **As built (2026-10-13):** the theme's `finale` (a finished round's end, in the recap's place), and the commands `glint` and `allClear` (`finaleCommands`, `finaleCmd`). Kept apart from `commands.ts` and `entrance.ts` |
| `src/renderer/src/theme/starChart/assets/{seat,objective,threat,facility,agent}.ts` | Adapters over `WorldView`, `AsteroidView`, `HiveShipView`, `DreadnoughtView`, `CaptainView`. **As built:** they share `assets/adapt.ts` (`AdaptedView`: stage and acts); the station's view is `assets/standby.ts` (`StationView`, 19 M1: its standby, eased and dimmed at the adapter until the art has a power hook) |
| `src/renderer/src/theme/starChart/maneuvers/*.ts` | One choreography per rule id (13 §6). **As built:** 16, listed in `maneuvers/index.ts` (since 2026-10-13 with `seatComplete.ts`, Homeworld complete, and `regionClear.ts`, All clear), plus unregistered helpers (`haul.ts`, `stationFire.ts`). The table: [15 §7](15-reference.md#7-maneuvers) |
| `src/renderer/src/chart/holo/{holoLabel.ts,holo.css}` | **As built (2026-10-12):** holographic labels for planets, stations and ships, per `AssetDef.label` (06 §9) |
| `src/renderer/src/chart/art/{mechaStation,trekStation,warsStation,stationRig,aura,energy}.ts` | **As built (art sessions):** each faction's station forms and the shared transformation rig; the role aura; hero energy's one blue |
| `src/renderer/src/chart/art/asteroidAtlas.ts`, `asteroidAtlasKeys.ts` | The asteroid atlas pilot (23 C7): the key set and fallback rules (pure), the loader (Pixi `Assets` + `Spritesheet`, main-thread decode because the CSP has no `worker-src`), `AtlasAsteroidView` (sprites, procedural fallback), the bake, and the dev flag. `assets/atlas/*` is imported with `?url` so it is bundled; `assets/LEDGER.md` records it (06 §7) |
| `src/renderer/src/settings/**` | `SettingsModal`, `SettingsButton`, its store, `viewer.ts`, tabs `Connection`, `Theme`, `Captain`, `Read`. **As built:** also `views.ts`, the developer toggle (13 Q9) |
| `src/renderer/src/gallery/{registrySection,maneuverDemos,motionDemos,extraSections}.ts` | Gallery cells built through the asset registry, looping maneuver demos, and (`motionDemos`) the Arrive/Depart row and the finale cell |
| `src/renderer/src/gallery/types.ts` | **As built:** the gallery's item and section shapes, shared by the v0 sections in `Gallery.tsx` and the art families in `gallery/v1/` |

**Source:** `ls` of each path, and `git status` for new files · **Update when:** a v1 module is added,
moved, split or deleted.

**Not edited by v1:** `src/renderer/src/chart/art/{worlds,asteroids,swarm,dreadnoughts,fleet}.ts`
and `src/renderer/src/gallery/v1/*.ts` (owned by the art effort; **as built**, the art sessions edit
them and add the art files above, but v1's integration code doesn't), `art/progress.ts`, `chain.ts`,
`sceneKey.ts`, `crumbs.ts`, `sprints.ts`, `backlog.ts`, `effects.ts`, `moves.ts`, `protect.ts`,
`snapshotAt.ts`. `fx/director.ts` gains only `implements FxDirector`. **As built (checked
2026-10-13):** these hold, except that an art session moved `effects.ts`'s tractor highlights from
`lighten` to `brighten` (hero energy never goes white; 15 §2).

---

## 2. Interfaces
*Applies to: Solar.*

The blocks below are the P3 design; each **As built** note records where the code differs (03 §5d
holds the shapes as built).

### 2.1 Mapping and bundle (additions to `contracts/history.ts`; all optional)

```ts
export type Role = 'objective' | 'threat' | 'step' | 'container' | 'facility' | 'attachment' | 'guard';
export type Rung = 'ready' | 'underway' | 'nearing' | 'accomplished' | 'off';

/** v0's category and stage stay required, so v0 code reads the same mapping unchanged. */
export interface MappedState {
  category: string; stage: string;
  rung?: Rung; sketch?: boolean; step?: number; deferred?: boolean; ghost?: boolean; strike?: boolean;
}
export interface StateMapping {
  version: number; unknownStage: string;
  types: Record<string, { kind: WorkKind; role?: Role; states: Record<string, MappedState> }>;
  /** Non-work-item pieces. SDLC: repo → facility, PR → attachment. */
  entities?: {
    facility?: { noun?: string };
    attachment?: { states: Partial<Record<'active' | 'completed' | 'abandoned', MappedState>> };
  };
}
// ScopeHistory.domainPack?: string  — /^[a-z][a-z0-9-]{0,39}$/. Omitted means 'sdlc'.
// SDLC bundles always omit it, on both sides, so AC-27 (fixture ↔ fake ADO) stays equal.
```

Zod 4 strips unknown keys, so every field above is declared in `scopeHistorySchema` (`ipc.ts`).
Without that, main and preload both drop them silently. A round-trip test guards it.

`WorkItemState` does **not** change. Role and signal are resolved through `resolveRole` and
`resolveSignal` (a side index), so every `*.seek.json` golden stays byte-identical.

### 2.2 Engine types (`src/shared/engine/types.ts`)

```ts
export interface Signal { rung: Rung; sketch?: boolean; step?: number; deferred?: boolean;
  ghost?: boolean; strike?: boolean; unknown?: boolean }

/** A piece as the engine sees it at one instant. `type` is opaque: a mapping lookup key only. */
export interface Piece { key: CanonicalKey; role: Role; type: string; title: string; category: string;
  signal: Signal; seat: CanonicalKey | null; parent: CanonicalKey | null; steps: CanonicalKey[];
  region: string | null; reopened: boolean }

/** Every event, normalised once. Maneuver rules and achievements read moves, never raw events. */
export type Move =
  | { m: 'appear'; key: CanonicalKey; role: Role; to: Signal; seat: CanonicalKey | null }
  | { m: 'climb'; key: CanonicalKey; role: Role; from: Signal; to: Signal; actor: CanonicalKey | null }
  | { m: 'reseat'; key: CanonicalKey; role: Role; from: CanonicalKey | null; to: CanonicalKey | null; actor: CanonicalKey | null }
  | { m: 'enter' | 'leave'; key: CanonicalKey; role: Role }          // round or region membership
  | { m: 'bind' | 'unbind'; child: CanonicalKey; parent: CanonicalKey; rel: 'step' | 'container' | 'attachment' }
  | { m: 'attach'; key: CanonicalKey; facility: CanonicalKey; author: CanonicalKey | null }
  | { m: 'settle'; key: CanonicalKey; facility: CanonicalKey; to: Signal; approvers: CanonicalKey[]; actor: CanonicalKey | null }
  | { m: 'retitle'; key: CanonicalKey };

export interface EventAdapter {
  id: string;
  /** Pure; reads the mapping and the bundle's entity facts only. */
  moves(h: ScopeHistory, e: AnyTimelineEvent): Move[];
  /** Optional overrides. Unset means the ingest-baked e.priority and v0 focus. */
  priority?(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[]): Priority;
  focusOf?(h: ScopeHistory, e: AnyTimelineEvent, s: Snapshot): CanonicalKey;
  describe(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): EventLine;
  event?(h: ScopeHistory, e: AnyTimelineEvent, t: Terminology): EventParts;   // 22 B4: the one wording
}

export interface Noun { one: string; many: string; short?: string /* "PR", 22 B3 */ }
export type Register = 'chart' | 'source';
export type LevelWord = 'workspace' | 'round' | 'region' | 'seat' | 'frontier';
export interface SourceWords { role: Partial<Record<Role, Noun>>; level: Record<LevelWord, Noun>;
  rung: Record<Rung, string>; source: string /* "Azure DevOps" */ }
export interface Terminology { register: Register; noun(r: Role | 'agent', n?: number): string;
  short(r: Role): string; level(k: LevelWord): string; rung(r: Rung): string; typeName(type: string): string }

export interface PackThresholds { swiftDays: number; wipK: number; dayHours: number }   // SDLC: 3, 2, 12
export interface DomainPack {
  id: string; title: string;
  mapping?: StateMapping;                  // fixture packs ship their own; SDLC uses config/state-mapping.json
  words: SourceWords; adapter: EventAdapter; thresholds: PackThresholds;
  containerUrl?(h: ScopeHistory, key: CanonicalKey): string | null;   // read-only (INV-21)
}

/** Precomputed over the loaded history: the input to the solar plan and to achievements. */
export interface RoundFacts { round: UtcRange; region: string;
  pieces: ReadonlyMap<CanonicalKey, PieceFacts>; seats: CanonicalKey[];
  attachments: ReadonlyMap<CanonicalKey, AttachmentFacts>; moves: ReadonlyMap<string /*eventKey*/, Move[]> }
export interface PieceFacts { key: CanonicalKey; role: Role;
  member: Interval[]; seatAt: { from: UtcMs; seat: CanonicalKey | null }[];
  signalAt: { from: UtcMs; signal: Signal }[]; steps: CanonicalKey[]; parent: CanonicalKey | null }
export interface AttachmentFacts { key: CanonicalKey; facility: CanonicalKey; author: CanonicalKey | null;
  open: Interval; links: CanonicalKey[]; approvers: CanonicalKey[]; signalAt: { from: UtcMs; signal: Signal }[] }
export interface Interval { from: UtcMs; to: UtcMs | null }
```

**As built:** `SourceWords.agent?: Noun` (what a person is called); `PieceFacts.parentAt?` (the parent
series) and `RoundFacts.at?` (each board event's time), both optional so hand-built facts still read;
`Award` and `AchievementRule` (§2.9) live in this file too. `terminology` takes a third argument,
`{ chart?, mapping? }`, because the chart register's words are the theme's and the engine can't
import the theme. `planSolar` takes `PlanPack = Pick<DomainPack, 'id'>` (`NO_FREE_CAP` in `plan.ts`: no
free cap; the pack's old crowding cap, `crowd`, was removed in v1.3 F3). `RoundFacts` gains `firstMerge?` and `merges?`
(each facility's merges in the round) and, since 2026-10-13, `regions?`: a whole round's facts carry
each region's own, by region key, so a milestone about one region (`seat.complete`, `region.clear`)
reads the facts that region's scene is drawn from.

### 2.3 Solar layout outputs

```ts
export interface SeatSlot { person: CanonicalKey; index: number; angle: number; rx: number; ry: number; x: number; y: number }
export interface PieceSlot { seat: CanonicalKey | 'frontier'; piece: CanonicalKey; mode: 'free' | 'formation' | 'frontier';
  x: number; y: number; r: number; formation?: string; index: number }
export interface Formation { id: string; seat: CanonicalKey; role: 'objective' | 'threat';
  cx: number; cy: number; memberR: number; members: CanonicalKey[] }
export interface CompoundSlot { key: CanonicalKey; role: 'attachment' | 'guard'; slot: number; angle: number; dist: number;
  from: UtcMs; to: UtcMs | null }
export interface StationSlot { facility: CanonicalKey; serves: CanonicalKey[]; mode: 'inner' | 'outer';
  x: number; y: number; enterAt: UtcMs; summoner: CanonicalKey | null; slots: CompoundSlot[]; cap: number }
export interface SolarPlan { version: number; star: { x: number; y: number; r: number }; seats: SeatSlot[];
  slots: ReadonlyMap<string /* `${seat}|${piece}` */, PieceSlot>; formations: Formation[];
  frontier: { rx0: number; rx1: number; ry0: number; ry1: number }; stations: StationSlot[] }

export function planSolar(f: RoundFacts, pack: DomainPack): SolarPlan;   // memoised on (facts, version)
```

### 2.4 View graph additions (`contracts/view.ts`; all optional, never set by v0 builders)

```ts
// NodeKind gains: 'seat' | 'objective' | 'threat' | 'facility'. The v1 ship stays kind 'captain'
// (Follow, the hero aura and the director key on it) and is told apart by asset: 'agent'.
//
// ViewNode gains:
//   asset?: string;                    // registry id; v0 nodes leave it unset and keep the v0 switch
//   piece?: PieceState;                // theme-neutral state; stage = encodePiece(piece)
//   cluster?: { id: string; index: number; size: number };     // formation member
//   compound?: { slots: (CompoundSlot & { signal: Signal })[]; more: number;
//                intensity: number; summoner: CanonicalKey | null; guards: number };
// ViewGraph gains:
//   solar?: { star: { x: number; y: number }; seats: SeatSlot[]; frontier: SolarPlan['frontier']; formations: Formation[] };
//   lists?: Record<string /* projectionKey */, MegaList>;

export interface PieceState { role: Role | 'seat' | 'agent'; signal: Signal; category: string;
  steps?: ('n' | 'a' | 'c')[];              // children of role 'step', in slot order, max 6
  share?: number;                           // seat: own share, 0..1, quantised to 0.05
  intensity?: number; open?: number; slots?: number }       // facility (slots: the filled tender slots, a bit mask, 23 C6)
// encodePiece (as built; the grammar is in 03 §5d): every stage carries its signal and category,
// and every optional field is key=value, so the string round-trips losslessly:
//   'v1|objective|underway|c=InProgress|s=nac'
//   'v1|seat|underway|c=InProgress|sh=0.50'
//   'v1|facility|underway|c=InProgress|i=0.60|pr=3|mg=1'
// As built: PieceState gains vacant? (`vc=1`) and awaiting? (`aw=1`, only with vacant; v1.4 B4), and merged? (a facility's merges so far; `mg=`, written only above zero);
// ViewNode gains platform? ({ seat, role, index }: a finished piece's slot on its seat's trophy ring)
// and activity? (how lately anyone worked the piece, 0..1 in quarters; the theme's idle life).

export interface MegaList { title: string; rows: MegaRow[]; more: number }
export interface MegaRow { key: CanonicalKey; label: string; meta?: string; rung: Rung;
  serves?: CanonicalKey[];                                                  // a PR's row (19 L6): the pieces it lights
  subtitle?: { label: string; url: string | null; key?: CanonicalKey } }   // a PR's served work; key: a linked container, for openInAdo
```

### 2.5 Hierarchy additions (`hierarchy/types.ts`)

```ts
// LevelBase.playable?: boolean           — default true; the round level sets false (13 §2)
// LevelDef gains the arm { layout: 'solar'; source: SolarSource }
// Hierarchy.pacing?: (h: ScopeHistory) => Partial<ScheduleOptions>   — unset for v0 chains
export interface SolarSource {
  center(ctx: ProjectCtx, ref: SceneRef, pk: string): ViewNode | null;   // the region's star (v0 aggregate look)
  facts(h: ScopeHistory, ref: SceneRef): RoundFacts;                       // as built: boardFacts(roundFacts(…))
  pack?(h: ScopeHistory): DomainPack;   // as built: words and links; the fence keeps projection from packFor
}
```

**As built:** the boot `fallback` (W1-T5) is gone, with its `projectSystem` branch in `projectScene`;
the solar arm always calls `projectSolar`. `HierarchyUi.chooser?` ('sprints' | 'backlog') tells the
renderer which chooser a chain uses.

Level ids stay `sprint` and `pod`. `main/ado/service.ts` `focus()` hard-codes `'pod'`, and
`field.ts` derives `zoomTo` from the next level's id. The words *round* and *region* come only
from `vocab` and terminology. `SOLAR.pathTo` filters out `body` refs, because `nav.ts` `goTo`
resolves every ref with `resolve(...)!` and a chain without a body level would crash there.

### 2.6 Schedule hooks (`playback/schedule.ts`; optional)

```ts
export interface ScheduleOptions {
  include?; budgetMs?; hier?;                                         // as today
  priorityOf?(h: ScopeHistory, e: AnyTimelineEvent): Priority;        // default e.priority
  focusOf?(h: ScopeHistory, e: AnyTimelineEvent, s: Snapshot): CanonicalKey;   // default v0 focus
  beatShape?(h: ScopeHistory, events: AnyTimelineEvent[]): { afterMs: Map<string, number>; durationMs: number };
                                                                       // default protectBeat + group burst
  orientMs?: number;                                                   // the opening's orientation (2026-10-13)
}
```

With all four unset the code path is literally unchanged, so `tests/golden/schedule.test.ts` stays
byte-identical. `buildScene` and `buildHighlights` spread `hier.pacing?.(h)` into the options they
already pass, so `playback.ts` `scheduleFor` needs no change to pick the v1 pacing.

**As built:** `beatShape` returns `BeatShape`; `v0BeatShape`, `prLinkTimesOf` and the v0 `focusOf`
are exported. `pacing(pack, { rules?, facts? })` returns the hooks object directly, since every hook
receives `h`; `SOLAR.pacing = (h) => pacing(packFor(h), { facts: paceFacts })`. Pacing reads the whole
round's facts (`paceFacts`), not one region's, and the planner must use the same object (since
2026-10-13 `paceFacts` memoises it per bundle). `BeatShape` gains `essential?` (2026-10-13): a beat
with an essential moment is never cut over budget, as a High beat isn't. The rules that result are
[05 §8.3](05-playback.md#83-from-events-to-beats) (B-1 to B-11).

**Block C (22 C2–C12, 2026-10-15 to 16).** Solar plays its bundle in story time (`playback/storyTime.ts`,
through `v1/story.ts` `presented`), and its pacing gains `limelight` (before shaping), `guests`
(after layout), `dayTurns` and `gapMaxMs`; `SOLAR.pacing(h, ref)` takes the region's ref, so the
limelight and guests read that region's seats and facts. The schedule carries `limelight` and
`guests`; the renderer plans each beat with the limelight and projects each scene with the guests
(`ProjectOptions`), so a seek agrees with play. The full list: [03 §5e](03-contracts.md#5e-block-c-additions-22-c2c12-built-2026-10-15-to-2026-10-16).

### 2.7 Maneuvers (`contracts/maneuver.ts`, shared)

```ts
export type Phase = 'tell' | 'gather' | 'act' | 'land' | 'echo' | 'disperse';
export type CastRole = 'subject' | 'agent' | 'support' | 'seat' | 'fromSeat' | 'toSeat'
  | 'facility' | 'attachment' | 'guard' | 'frontier';
export interface PhaseSpan { phase: Phase; atMs: number; durMs: number }
/** Engine pace data: an engine-named rule. The theme names the choreography. */
export interface ManeuverRule { id: string;              // 'objective.accomplish', 'threat.accomplish', ...
  tier: 'essential' | 'narrative' | 'ornament'; protect?: boolean;
  match(mv: Move, f: RoundFacts): boolean;
  cast(mv: Move, e: AnyTimelineEvent, f: RoundFacts): Partial<Record<CastRole, CanonicalKey[]>>;
  phases: readonly PhaseSpan[] }
export interface PlannedManeuver { id: string; eventKey: string; seed: number;
  cast: Partial<Record<CastRole, CanonicalKey[]>>; phases: readonly PhaseSpan[];
  afterMs: number; durationMs: number;
  protect?: { keys: CanonicalKey[]; windowMs: number };
  from?: Signal; to?: Signal;
  keys: CanonicalKey[] }                                  // what frame and follow look at
export function planManeuvers(h: ScopeHistory, beat: Beat, f: RoundFacts,
  rules: readonly ManeuverRule[], eng: Engagement): PlannedManeuver[];
```

**As built:** `rules` and `eng` default to `PACE_RULES` and Calm, and a sixth argument
`opts: { priorityOf? }` carries the schedule's priority. Conditional protection, in-event ordering and
light work are fields of `PaceRule extends ManeuverRule` in `engine/pace.ts` (`protectWhen`,
`waitsFor`, `light`; since 2026-10-12, also `introduces`, `variant` and `leads`; since 2026-10-13,
`when(mv, e, f)`, the event-time test a milestone needs). `contracts/maneuver.ts` gains only the cast
role `target` and `PlannedManeuver.variant?` and `holds?`. There are 16 rule ids (`attachment.merge`
joined on 2026-10-12, `seat.complete` and `region.clear` on 2026-10-13); the list, lengths, tiers and
variants are in [15 §7](15-reference.md#7-maneuvers), the rationale in 05 §8, and the sequencing rule
(who counts as an actor) in 03 §5d. `pacing` also sets `orientMs` to `OPENING_ORIENT_MS`, the opening
before a region's first beat ([15 §10](15-reference.md#10-timing-and-budgets)).

### 2.8 Renderer registries

```ts
// chart/assets/types.ts
export interface AssetCtx { theme: string; viewer: CanonicalKey | null; captain: CaptainStyle | null }
export interface AssetView extends ArtView { act?(name: string): void }      // transient art act: jump, breakup
// As built: also ambient?(a) (2026-10-12), settle?() (19 M1: an eased look, a station's standby, lands now on a seek)
// and anchor?(name) (23 C5: a named hardpoint, `emitter`, in px from the view's origin; CastView.anchor is its world-unit read, GraphScene.anchorOf)
export interface AssetDef { id: string;
  layer: 'celestial' | 'infrastructure' | 'traffic';    // ArtView.layer is only celestial|hardware; the def picks the sublayer
  moving: boolean; framed: boolean; flare: boolean; body: boolean;   // replace MOVING_KINDS, FRAMED_KINDS, FLARE_KINDS, BODY_KINDS
  floorPx?: number; hitFloorPx?: number; rank: number;               // screen floor, hit floor (VC-3), label rank
  acts?: readonly string[];
  make(node: ViewNode, ctx: AssetCtx): AssetView;                    // decodes node.stage into the art's grammar
  rebuildOn?(prev: ViewNode, next: ViewNode, ctx: AssetCtx): boolean; // e.g. the viewer changed
  samples?(): Item[] }                                               // gallery cells through the same factory
export function registerAsset(def: AssetDef): void;
export function assetFor(n: ViewNode): AssetDef | undefined;          // by n.asset; undefined → the v0 switch

// chart/fx/types.ts
export interface FxDirector { queue(ctx: BeatContext & { maneuvers?: PlannedManeuver[] }): void;
  tell(ctx: BeatContext & { maneuvers?: PlannedManeuver[] }, i: number, leadS: number): void;
  clear(): void; recap(keys: CanonicalKey[], awards?: Award[]): void;
  update(dtMs: number, scheduleDtMs: number, frozen: boolean): void;
  volatility(): number; census(): Record<string, number>; calm(): boolean;
  activeCount(): number; trailCount(): number; bias(v: number): void }
export interface CommandDef<A = unknown> { name: string; tier: 'essential' | 'narrative' | 'ornament';
  weight: number; cuttable: boolean; clock: 'travel' | 'accent'; moves?: boolean;
  reduced: 'same' | 'ring' | 'snap' | 'skip' | { use: string };      // reduced-motion substitute (INV-20)
  make(host: FxHost, args: A): Fx }
export interface ManeuverDef { id: string;                            // matches ManeuverRule.id
  title: string;                                                      // the theme's name: 'Landing', 'Strike run'
  phase: Partial<Record<Phase, (cast: CastViews, m: PlannedManeuver) => CommandCall[]>> }
export type CommandCall = { cmd: string; args: unknown; delayMs?: number } | { act: { key: CanonicalKey; act: string } };

// theme/types.ts — the one remix table
export interface ThemePack { id: string; title: string;
  readCopy: ReadCopy;   // 23 E6: { paragraph(c, s), tour(c, s), more(n) } — see below
  roleAsset: Record<PieceState['role'], string>;   // 'objective' → 'asteroid', 'threat' → 'hive', ...
  assets: AssetDef[]; commands: CommandDef[]; maneuvers: ManeuverDef[];
  guides: { id: string; draw(g: Graphics, graph: ViewGraph, px: number): void }[];
  words: Partial<SourceWords> }                    // the chart register
```

**As built** (details in 03 §5d):
- `ViewNode.asset` holds a **neutral role id** (`'objective'`, `'agent'`), not a theme asset id, since
  shared projection can't know theme words. The theme binds each role to its asset (`bindAsset`, run
  by `useTheme`); `assetFor` resolves the binding first. Asset ids: `world`, `asteroid`, `hive`,
  `dreadnought`, `captain`; `INNER_PARTS` lists the roles drawn inside a parent.
- `FxDirector.bias` is a **field**, as on `AnimationDirector`, not `bias(v)`. `FxHost` (`fx/host.ts`) is
  the director's host plus the runner's services and the art-act seam `act(pk, act)`, which calls
  `GraphScene.actView`. `CastView` gains `gone?`.
- Acts end by themselves after one `EVENT_LOOP_S` loop on `motion.pulseTime`; a seek rests them
  (`landAllStages` → `act('rest')`).
- `GraphScene` gains `setAssetCtx`, `setGuides`, `capsOf`, `actView` and `EntryCaps`; `framing.ts`
  gains `isFramed`; `fx/timing.ts`'s kind tables are `KindTable`s; `placeFormation.ts` holds the pitch.
- Added by the art sessions (2026-10-12 to 2026-10-13): `AssetDef` gains `label?` (a holo `HoloSpec`),
  `over?`, `labelRim?`, `departAct?` and `departS?`; `AssetView` gains `ambient?()`. `ThemePack` gains
  `entrance?`, `ambient?` and `seatTitle?`, installed by `installTheme` (`fx/v1/registry.ts`).
  `FxDirector` gains `opening?()` (the episode's opening); `ManeuverDef` gains `reveals?` (the
  choreography brings its subject in itself).
- Added for the finales (2026-10-13): `ThemePack` gains `finale?` (a `Finale`: `FinaleCast` → calls
  and a length), installed by `installTheme` and read through `finaleOf()`; `FxDirector.recap` gains a
  third argument `{ finale? }`, set by `playback.ts` when playing reaches the end of a finished round,
  so the theme's finale plays in the bloom's place, then the awards. `ManeuverDef` gains `owns?` (cast
  parts whose new look it lands itself, over any other moment in the beat) and `freezes?` (a guide
  held as it was before the beat until a phase starts: Reassign holds the frontier belt until its
  piece flies, 19 S2; until then All clear held the retired threat light). `GraphScene` gains
  `freezeGuide` and `thawGuide` for it, which hold only the subjects' part in the guide (counted per
  node); a seek thaws every guide. `ThemeGuide.shownBy?` (19 S2): the nodes that keep a guide shown.
  In play it shows while one of them is drawn or still departing, fading over `GUIDE_FADE_MS`
  (`chart/scenes/guidePresence.ts`, pure), so the belt comes in with its first piece's entrance, not
  with the beat; a seek snaps it to whether the list is empty, and the opening hides it with the cast.

### 2.9 Labels, settings, achievements

**Device profile (v1.4 C4a, 15 §11).** `deviceProfileSchema` (`src/shared/contracts/profile.ts`, strict, `version: 1`) holds
`pacing { budgetMs, highlightBudgetMs }` and `render { budget { frameVsyncs, toleranceMs }, limits { maxActiveFx },
switches { paint, twinkle, ornament, auraBake } }`. Four bundled files in `config/profiles/` (`@shared/profile/bundled.ts`: `BUNDLED`,
`DESKTOP`). `resolveProfile({ overrideText, pinned })` (`@shared/profile/resolve.ts`, pure) answers a `ProfileState`
`{ profile, source, overridden, notice, reason }`; any fault in `userData/profile.json` or the pin uses the bundled
base with a notice. Main (`src/main/profile.ts`) resolves before the window opens and passes the state as the
`--star-chart-profile=` launch argument; preload exposes it as `env.profile`; the renderer reads it through
`activeProfile()` (`src/renderer/src/profile.ts`) at the moment of use. The schedule builders, playback, the director and
the interpreter's gates, the ChartApp's paint and twinkle, and the aura bake (27 C3) all read it there (C4b, C4c).

```ts
// chart/labelTiers.ts
export type LabelTier = 'expanded' | 'full' | 'title' | 'picture';  // v1.1 names (19 Q5)
export const ROW_BUDGET = 16;
export function tierFor(n: ViewNode, s: { pointed: boolean; selected: boolean; followed: boolean;
  recent: boolean; moving: boolean; flashed: boolean }): LabelTier;
// chart/overlays.ts
export interface ChartOverlay { sync(graph: ViewGraph): void; position(cam: Camera, w: number, h: number, live: ViewNode[]): void;
  rects(): Rect[]; clear(): void }
// As built: ROW_BUDGET lives in shared scene/project/lists.ts only (value and tier rules: 15 §6); tierFor's
// second argument is the named TierState; ChartOverlay gains focus?({ expanded }) and light?(key);
// OverlayInput.open(url | null, key?).
// v1.1 (19 L2): the mega-label overlay retired; an expanded holo plate grows its rows in place.
// chart/holo/holoRows.ts
export class HoloRows { constructor(plate: HTMLElement, input?: RowInput); set(list: MegaList): void; attach(): void; detach(): void }
export interface RowInput { light?(keys: readonly CanonicalKey[] | null): void; press?(key: CanonicalKey, e: PointerEvent): void;
  open?(url: string | null, key?: CanonicalKey): void }
// v1.1 (19 L6): light takes a row's targets (its `serves`, else its own key), so ChartOverlay.light,
// OverlayInput.light and LabelInput.light take `readonly CanonicalKey[] | null`, the hover ring draws
// one ring per lit object, and LabelLayer.setHighlight(hovered: string | readonly string[] | null, selected).
// v1.1 (19 L7): pieces are hover-only. HoloRows.markObjects(lit: ReadonlySet<string>, selected: string | null)
// lights and marks rows from the chart's side; LabelMotion.cast?: ReadonlyMap<pk, opacity> comes from
// FxDirector.labelled?() (the interpreter's CastLabels, chart/fx/v1/castLabels.ts, pure).
// chart/holo/holoLabel.ts (pure)
export function growPlacement(at: HoloPlacement, w: number, h: number): HoloPlacement;
export function slidePlacement(at: HoloPlacement, viewW: number, viewH: number): HoloPlacement;
export function expandAt(cands: HoloPlacement[], k: number, w: number, h: number, viewW: number, viewH: number,
  clear?: (r: Rect) => boolean): number;
// LabelLayer.sync(nodes, level?, lists?); LabelInput gains light?, pick?, open?.

// contracts/settings.ts (zod-validated; stored at userData/settings.json)
export interface CaptainStyle { faction: 'trek' | 'wars' | 'mecha'; hull: number; colourway: number }
export interface UserSettings { version: 1; theme: string /* 'star-chart' */; achievements: boolean;
  viewer: Record<string /* orgKey */, CanonicalKey | null>;     // an 'id:' key, never a name
  captain: Record<string /* orgKey */, CaptainStyle | null> }
// IPC: CH.settingsGet → UserSettings; CH.settingsSet(patch) → UserSettings.
// Devlog: { 'settings-set', field, valueHash } only, through the salted hash (03 §10).
// As built: valueHash is a whole number (48 bits of the salted HMAC); hull indexes FLEET_HULLS (0–8) and
// belongs to faction; the settings channels bypass the logging handle (03 §6).

// engine/achievements.ts
export interface Award { id: string; earnedAt: { eventKey: string; atUtc: UtcMs }; pieces: CanonicalKey[]; reason: string }
export interface AchievementRule { id: string; shape: string /* insignia id */;
  earn(f: RoundFacts, viewer: CanonicalKey, th: PackThresholds): Award | null }
export function achievementsFor(f: RoundFacts, viewer: CanonicalKey | null, pack: DomainPack): Award[];  // null → []
// As built: a fourth argument, AchievementOptions { tz?, terms? } (working hours, the reasons' words); the rule
// ids and insignia shapes are in 03 §5d.
```

---

## 3. Data flow
*Applies to: Solar.*

```
 fixture scenario (DSL)        fake ADO / ADO sync
        │ toHistory                 │ derive
        └──────────┬────────────────┘
                   ▼
   ScopeHistory  (events, entities, stateMapping, domainPack?)        contracts/history.ts
                   │  zod (main, preload) keeps role/rung/domainPack
                   ▼
   DomainPack = packFor(h)        mapping + adapter + words + thresholds   packs/*
                   │  resolveRole / resolveSignal / movesOf
                   ▼
   RoundFacts  (neutral board: pieces, seats, intervals, attachments, moves)   engine/facts.ts
        │                                 │
        │ planSolar (history only)        │ planManeuvers (per beat)  ◄── buildBeatSchedule + hier.pacing
        ▼                                 │                                 (engine/pace.ts)
   SolarPlan (fixed setup)                │
        │ + snapshotAt(x)                 │
        ▼                                 │
   projectSolar → ViewGraph (nodes with asset, piece, cluster, compound; solar; lists)
        │                                 │
        ▼                                 ▼
   GraphScene ── assetFor(node) ──► AssetDef.make ──► art view       PlannedManeuver[] in BeatContext
        │  (theme/starChart/assets/*: stageCodec → art grammar)       │
        │                                                            ▼
        └──────────── FxHost ◄─────────────── SwitchingDirector → ManeuverInterpreter
                                                 (ManeuverDef phases → CommandDef → effects/moves; art acts)
```

Step by step:
1. **Bundle.** Fixtures build it with `toHistory(s, mappingFor(s), scope)`; ADO builds it with
   `derive`. Each bundle carries its own mapping. Only non-SDLC bundles carry `domainPack`.
2. **Pack.** `packFor(h)` picks the pack. Everything after this point reads role, category, rung
   and signal, never type or state names.
3. **Neutral board.** `roundFacts(h, ref, pack)` folds the bundle's dated events over the round
   and region once, memoised per bundle. Undated observations seed the start state and never
   become moves (INV-02).
4. **Fixed setup.** `planSolar(facts, pack)` places seats, slots, formations, the frontier and
   stations from the whole loaded history (§4).
5. **View graph.** `projectSolar` reads the plan and `snapshotAt(x)`, and decides only which slots
   are filled and which neutral stage each node shows.
6. **Render.** `GraphScene.createEntry` asks `assetFor(node)` first. A v1 node gets its theme
   adapter, which decodes the neutral stage into the art's own grammar. A v0 node falls through to
   the existing switch.
7. **Schedule.** `buildScene` / `buildHighlights` spread `SOLAR.pacing(h)`: beats are sized from
   pace data and protected windows come from protected rules.
8. **Plan.** On each forward beat, the registered solar planner (`v1/plan.ts`) calls
   `planManeuvers` and adds `maneuvers` to the `BeatContext`.
9. **Interpret.** `SwitchingDirector` hands solar scenes to `ManeuverInterpreter`, which registers
   protects, schedules phases with `After`, issues commands through the registry and drives art
   acts with `claimStage` → `act()` → `landStage`. Other scenes keep `AnimationDirector`.
10. **End.** When playing reaches the end, `playback.ts` asks the recap hook (`v1/awards.ts`) for the
    viewer's awards and calls `FxDirector.recap`. In a finished round the theme's `finale` plays in the bloom's place, then
    the viewer's awards (as built, 2026-10-13).

---

## 4. Determinism and seek-stability
*Applies to: Solar.*

The rules below implement INV-12..15 for v1. Each has a test (§5).

**The fixed setup depends on the loaded history and the scene ref only, never on the playhead.**

| Part | Rule |
|---|---|
| Seats | Everyone who held an objective or threat **on the ladder** in the region at any instant of the round (`heldSpans`; Off excluded). Order by when each first held one (clipped to the round start, ties by key). Seat *i* takes angle slot `(i·s) mod n`, where *s* is the integer nearest `n/φ` with `gcd(s, n) = 1` (ties to the lower; `s = 1` for n ≤ 2). Base angle from `artSeed(regionKey)`. **As built (v5, 2026-10-12):** one regular ring. Angles are even (`2π / n`), starting at the top: `baseAngle` in `seats.ts` returns −π/2 and ignores the region, so no seed turns the ring; every seat takes the same radius, the smallest at which every footprint clears the star (`starGap`) and the other footprints (`seatGap`) (08 §7); `ry = rx·SQUASH` (values in [15 §5](15-reference.md#5-sizes-floors-and-layout)); each orbit is an arc (`SeatSlot.arc`) through the planet. Planets don't orbit during playback. |
| Many seats | **As built (13 Q11, superseded 2026-10-12):** no second ring. Any number of seats share the one ring, at even angles. No tray: lists and boards are out (13 §2). |
| Pieces (Q6, closed 2026-10-12) | Per (seat, role), every piece ever at that seat, ordered by arrival there (pieces held at the round start first, then by reseat time, ties by key). All of them take group indices in that order: **there is no free cap** (13 §3). Nothing is promoted on a seek. |
| Moves between seats | A piece has a slot at every seat it ever visited. At *x* it shows at its current seat's slot, so reassignment is travel between two fixed points. |
| The mandala (22 Block D, layout v8) | On the planet: stories on its left half-disc, bugs on its right, equal-area slots mirrored across the equator, filled by arrival from the centre out (`halfDiscSlots`); both sides one size, a busy planet's smaller (`SeatMandala.pieceR`). Trophies: one ring by close order from the star line, shells past a full ring (`trophyShells`, `trophyOffset`, `SolarPlan.platforms`). The loiter ring past them; ships take its slots by arrival in the projection (`loiterSlots`). The renderer keeps every slot exact and caps drawn sizes, the loiter ring aside (`drawnMandalas`). |
| Frontier | An annulus outside the outermost orbit. Pieces ever unassigned while members take slots by first-unassigned time. |
| Stations | Serve every seat with a piece ever linked to an attachment into the facility in the round, weighted by link count; only attachments that served the region's work while open count (22 C12). Two rings (22 C11, layout v7): one seat, the outer ring past the planets' pieces, nearest the planet's outward side, a station's width apart; otherwise the inner ring between the star and the planets, one evenly spaced slot each, nearest the weighted direction of its seats, leaning up to a quarter step; the planets move out when the inner ring won't fit. `enterAt` = the region's first need (`firstNeeds`), else the round's start; `summoner` = who made it. Attachments linked only to dropped pieces make no station (`boardFacts`); a linked step stands in by its final parent. |
| Compound slots | Online first-fit in time order (`attachmentSegments`): an attachment takes the lowest slot free when it opens and keeps it until it leaves. With all `cap` (`GEOMETRY.compoundCap`) held it waits past the cap (counted in `more`) and is **promoted** into the first slot that frees, the earliest-opened waiting PR first (23 C6; from that instant it is a second `CompoundSlot` segment of the same key, so one key can have a waiting and then a drawn segment). A drawn tender never changes slot. So at every playhead drawn = min(open, cap) and `more` = open minus drawn. Guards: `fnv(repoKey) % 4` fixed slots opposite the shuttle arc, visual only. |

**What the playhead decides.** Visibility (membership at *x*), which of a piece's slots it
occupies, and its neutral stage. Nothing else.

**As built: one timeline.** The plan, the projection and the fold read the same readers in
`engine/facts.ts` (`memberAt`, `seatAtTime`, `heldSpans`). Before its first seat entry a piece is
unassigned (a frontier slot), and a visit made only while Off opens no slot (unless a reseat made while Off lands on a seat already on the board: then the ghost takes a slot there, 23 C9). The board's facts are
`boardFacts(roundFacts(…))`, which also holds a reseat made while Off until the piece is back on the
ladder, unless the new seat is already on the board: then the ghost takes a slot there (23 C9, 08 §7). The geometry and what the density harness found are in
[08 §7](08-layout-solver.md#7-the-solar-system-v1-built-2026-10-10-to-2026-10-12).

**Resting looks are pure functions of the snapshot.** An Accomplished piece rests in its slot on
the seat's trophy ring (a gold orb, or an enemy ship's caged asterisk, 22 A12), picked by its rung at the
playhead; nothing is counted on the seat (no `outcomes` field since v1.4 A2, 05 §8 G-14); Off pieces show as
ghosts. A seek to *x* and a play to *x* give the same graph. (Superseded 2026-10-12: an Accomplished
objective hidden and counted, a threat resting as a ruin.)

**The viewer never enters `src/shared` projection.** The viewer's ship style and the faction of
stations they summon are applied at asset time from `AssetCtx`. Goldens are viewer-free. The
viewer enters shared code only as an argument to `achievementsFor`.

**Other rules:**
- Keys are sorted everywhere. No `Math.random`, no `Date.now`, no dependence on Map insertion
  order. Art randomness for a maneuver is seeded by `PlannedManeuver.seed = fnv(eventKey)`.
- `SOLAR_LAYOUT_VERSION` (`engine/solar/version.ts`) is bumped with any geometry change, and the
  solar goldens are regenerated in the same change.
- **INV-15.** `PlaybackClock.seek` returns no crossings, so nothing is planned on a seek. Every jump
  calls `clearAccents` → `FxDirector.clear()`, which destroys every command, tell and trail, then
  calls `releaseAllEdges`, `thawAll` and `landAllStages`.
- **Station jump-in is event-derived** (the first attachment per facility in the round), not v0's
  scene diff, so it replays the same under per-scene schedules. This differs from v0 on purpose.
- Seeded looks (world line, material, swarm, faction, hull, colourway) come from `artSeed` or
  `shipSeedFor` of the entity's own ID (13 §4), never from load order.

---

## 5. Testing strategy
*Applies to: both views.*

The v1 tests, and how the v0 suites stay green. Which spec to run for a change is in
[tests/README.md](../tests/README.md).

| Area | Unit (`tests/unit`) | Golden (`tests/golden`) | E2E / gallery |
|---|---|---|---|
| Contracts | Zod round-trip of every new optional field through `scopeHistorySchema` and `userSettingsSchema` | Every existing golden byte-identical | — |
| Signals | `signal.test.ts`: every SDLC state's `rung` equals `signalOf(stage).rung`; every pack type has a role and every state a rung; fallbacks for old bundles | — | — |
| Boundary | `literalFence.test.ts`; ESLint import fence in `npm run lint` | — | — |
| Moves and facts | `moves.test.ts`: one case per event kind; memoisation; undated observations ignored | — | — |
| Solar plan | `solarLayout.test.ts`: angles fixed and coprime for n = 1..12; orbits don't overlap; 3+3 cap and Q6 order; hex packing touches without overlap; station clear of orbits; first-fit never swaps a live slot; same plan at 50 seeded playheads. **As built:** one regular ring and no free cap (the pack has no crowding cap since v1.3 F3), in place of the 3+3 cap; platforms clear of the planet and each other | `solar.plan.json` per v1 scenario | — |
| Projection | `solarSeek.test.ts`: each `(key, seat)` keeps one world position at every beat time; seek to *x* equals play to *x* | `solar.scenes.json` at 5 playheads per v1 scenario | `solar.spec.ts`: VC-2, VC-3 (hit ≥ 12 px, no overlap, formations included), callout contrast ≥ 4.5 including expanded plates' rows (`.holo__row`) |
| Schedule | `scheduleHooks.test.ts`: hooks unset → identical schedule on every v0 scenario | `schedule.test.ts` unchanged. **As built:** no `v1-schedule.json` golden was written; `maneuvers.test.ts` (*paced schedules*) checks the v1 schedules instead | — |
| Maneuvers | `maneuvers.test.ts`: rule matching per move; determinism (plan twice, deep-equal); protect windows inside the beat; durations fit the budget. **As built:** also the merge and beamed closes, and (2026-10-13) the milestones `seat.complete` and `region.clear` | — | `solar-play.spec.ts`: play through a strike run, seek back and forward, `activeCount() === 0`, resting stages equal `viewGraph` |
| Achievements | `achievements.test.ts`: one earn and one near miss per rule; no viewer → `[]` | `v1-awards.json` | Insignia only on the viewer's ship; static badge under reduced motion |
| Assets | `assetStage.test.ts`: every neutral stage → art stage string parses through the art's own parser (`asteroidStage`, `parseThreatStage`, `parseWorldStage`, `parseStationStage`) | — | `gallery-assets.spec.ts`: registry section, maneuver demos, the Arrive/Depart row and the finale cell mount with no console errors |
| Registries | `registries.test.ts`: every `roleAsset` is registered. `commands.test.ts`: every `ManeuverRule.id` has a `ManeuverDef`; every `CommandDef` declares `reduced` | — | — |
| Settings | `userSettings.test.ts`: round trip; corrupt file → defaults; Purge leaves it; devlog line has only the hash | — | `settings.spec.ts`: cog, ↑/↓ tabs, Esc, focus trap, 44 pt targets, `.connect…` selectors, viewer survives relaunch |
| Ingest | — | `v1-ingest.test.ts`: AC-27 for `pod-sprint` (fixture ↔ fake ADO) | — |
| Density | — | — | `density.spec.ts` solar case on `pod-sprint`: no hit overlaps, formation hits don't overlap, footprints and stations clear, frontier in view (the "cap holds" check went with the free cap in v4) |
| Doc values | `docTables.test.ts` (new, 2026-10-13): every marked table in [15](15-reference.md) equals the constant it cites | — | — |

**As built:** also `stageCode.test.ts` (the grammar and INV-11 refusals), `solarChain.test.ts` (the
chain, `pathTo` without `body`), `labelTiers.test.ts` (`tierFor` against v0's rule, `placePlate`) and
`contracts-v1.test.ts` (zod round trips), `homeworlds.test.ts` (seat titles) and
`placeStations.test.ts` (the renderer's station pass, W4-T2). Pixi loads under Vitest, so `assetStage.test.ts`,
`registries.test.ts` and `commands.test.ts` load renderer modules by runtime path, as
`signal.test.ts` does. In `solar.spec.ts`, VC-3 holds with no expected-failure mark since the placement fix
(08 §7, 17 W4-T2).

If Pixi can't load under Vitest's Node environment, `assetStage.test.ts` moves into
`gallery-assets.spec.ts` as a `page.evaluate` check. The pure `stageCodec.ts` keeps its own unit
test either way.

**Keeping the existing suites green.** v0 default arguments don't change. New fields are
optional and v0 builders never set them. `tests/e2e/launch.ts` keeps pinning `backlog`; specs that
relied on the unpinned default (`sprints.spec.ts`) are pinned to `sprints`. The cog and the v1 CSS
render only under `[data-paradigm="solar"]`, so the `slice1` pixel baselines hold.
`fixtures/generated/` is regenerated after the mapping change.

---

## 6. Glossary terms and where they live
*Applies to: Solar.*

| Term (12) | Module or type |
|---|---|
| Engine | `src/shared/engine/**` |
| Domain pack | `DomainPack`, `packs/registry.ts`, `packs/<id>/` |
| Theme pack | `ThemePack`, `theme/registry.ts`, `theme/starChart/index.ts` |
| Terminology, register | `Terminology`, `engine/terminology.ts`; pack `words.ts`, theme `words.ts`. Both registers show together, the source register first (22 B1; the Names toggle is gone) |
| Tenant | `OrgKey` (unchanged) |
| Workspace | Galaxy scene; `ProjectFact` (unchanged) |
| Round | `SOLAR.levels[0]` (id `sprint`, `playable: false`); `SprintSector`; `RoundFacts.round` |
| Region | `SOLAR.levels[1]` (id `pod`, `layout: 'solar'`); `SolarSource`; `RoundFacts.region` |
| Seat | `SeatSlot`; node kind `seat`; asset `seat` → `WorldView` |
| Frontier | `SolarPlan.frontier`, `PieceSlot.mode: 'frontier'`; `solarGuides.ts`; cast role `frontier` |
| Tray | `ViewGraph.trays` (unchanged; not used for seats) |
| Chain | `SOLAR` in `hierarchy/solar.ts` |
| Objective, threat, step, container, facility, attachment, guard | `Role`; `resolveRole`; node kinds `objective`, `threat`, `facility`; steps in `PieceState.steps`; attachments and guards in `ViewNode.compound`; containers not shown (since 19 L6 a facility's `MegaRow`s are its attachments, with `serves`) |
| Agent | Node kind `captain` with asset `agent` → `CaptainView`; `projectCaptains` |
| Viewer | `UserSettings.viewer`; `AssetCtx.viewer`; `settings/viewer.ts` |
| Raw state, category | `WorkItemState.rawState`, `MappedState.category` (unchanged) |
| Rung, sketch, signal | `Rung`, `Signal`; `MappedState.rung`; `resolveSignal` |
| Signal ladder | `art/progress.ts` (theme); `engine/signal.ts` `RUNG_OF_STAGE` mirror |
| Own share | `PieceState.share` on a seat node |
| Outcome | **Removed from the contract (v1.4 A2).** The world art still takes `megastructures`/`research` as options and the `.m<n>r<n>` stage suffix, set only by the gallery; finished pieces are platforms in orbit, not structures on the surface |
| Fact, event, observation, snapshot, lens, playhead | Unchanged v0 modules |
| Episode, beat | `buildBeatSchedule` with `SOLAR.pacing`; `Beat` |
| Accent | v0 only (`PlannedAccent`); v1 uses `PlannedManeuver` |
| Protected moment | `ManeuverRule.protect`, `PlannedManeuver.protect`; registered as `Protect` |
| Recap | `FxDirector.recap(keys, awards, opts?)`; `registerRecapHook` |
| Finale (not yet in 12) | `ThemePack.finale`, `Finale`, `FinaleCast`; `theme/starChart/finales.ts` (2026-10-13) |
| Milestone (not yet in 12) | The rules `seat.complete` and `region.clear` (`PaceRule.when`); `RoundFacts.regions` (2026-10-13) |
| Pace | `engine/pace.ts` (phase durations); `constants.ts` budgets |
| Asset, look, transformation | `AssetDef`, `PieceState` + `encodePiece`, `AssetView.setStage` |
| Effect, motion | `CommandDef` over `Fx` and `moves.ts` |
| Maneuver | `ManeuverRule` (shared pace) + `ManeuverDef` (theme choreography) |
| Tier, volatility | `CommandDef.tier`, `weight`; `FxDirector.volatility()` |
| Faction, hull, colourway | `theme/starChart/factions.ts`; `CaptainStyle` |
| Seed | `artSeed`, `shipSeedFor`; `PlannedManeuver.seed` |
| Summon | `StationSlot.summoner`, `compound.summoner`; facility adapter applies the viewer's faction |
| Swarm, hostile palette | Threat adapter via `hiveDesign(seed)`; art-owned |
| Mega-label | `MegaList`, `lists.ts`; the Expanded holo plate: `HoloRows`, `growPlacement`, `expandAt` (19 L2) |
| Compound, slot, satellite | `CompoundSlot`, `engine/solar/compound.ts`; `ViewNode.compound`; drawn inside `DreadnoughtView` |
| Formation | `Formation`, `ViewNode.cluster`, `placeFormation.ts` |
| Label tier | `LabelTier`, `tierFor`, `ROW_BUDGET` |
| Achievements | `engine/achievements.ts`, `Award`; Settings → Your captain; `v1/awards.ts` |

---

## 7. What v0 code stays, and how it is pinned
*Applies to: the v0 views.*

| v0 path | Status in v1 | How to reach it |
|---|---|---|
| Backlog chain (`backlog.ts`, field/system/radar projectors) | Parked, unchanged | `STAR_CHART_PARADIGM=backlog` (the e2e default in `launch.ts`) |
| Sprints chain (`sprints.ts`, the `body` close-up) | Unchanged; its levels' sources are reused by `SOLAR` | `STAR_CHART_PARADIGM=sprints` |
| `AnimationDirector`, `planAccents`, `accents.ts`, `protect.ts` | Unchanged; used for every non-solar scene | Through `SwitchingDirector` |
| v0 view classes and the `createEntry` switch | Unchanged; the fallback when `assetFor` returns nothing | Any node without `asset` |
| `WorkItemState.kind/stage`, `columnOf`, `SIGNALS` | Unchanged | — |
| `paradigm` setting in SQLite | **Neither written nor read** (the developer toggle's choice lives in `UserSettings.devParadigm`, 03 §5b) | — |

**Boot.** `main/index.ts` parses `STAR_CHART_PARADIGM` with `paradigmSchema`. A valid pin wins;
otherwise the paradigm is `UserSettings.devParadigm` (the developer toggle's last choice, 03 §5b, 23 E3), else `solar`. The cache's old v0 value is ignored on purpose: the developer's cache
likely holds `sprints`, which would otherwise hide v1. The title-bar paradigm switch is hidden when
the paradigm is `solar`. **As built (13 Q9):** v0 is also reachable through Settings → Theme's
developer toggle (`settings/views.ts`) or the title-bar switch, remembered across launches (`nav.setParadigm` saves `devParadigm`); the cog stays visible under a toggle-chosen
v0 view, so one click goes back to Solar. A pinned v0 launch never shows it, so its baselines hold.

---

## 8. How to remix
*Applies to: Solar.*

Each row's file and check was verified on 2026-10-13. Where the change touches a value 15 lists,
change its row in [15](15-reference.md) too (`docTables.test.ts` fails until they match).

| To change | Edit | Check with |
|---|---|---|
| Which asset draws a role | `roleAsset` in `theme/starChart/index.ts` | `npm run gallery`; `registries.test.ts` |
| How an asset looks at a signal | `theme/starChart/stageCodec.ts` and the role's adapter in `theme/starChart/assets/` | `assetStage.test.ts`; the gallery registry section |
| An asset's size, layer, floors or label rank | Its `AssetDef` fields (and `FLOOR_PX` in `sizing.ts` with a floor) | `registries.test.ts`; `density.spec.ts` solar case; `solar.spec.ts` VC-3 |
| A maneuver's choreography | `theme/starChart/maneuvers/<choreography>.ts` (phase → commands), listed by rule id in `maneuvers/index.ts` | Gallery maneuver demos; `gallery-assets.spec.ts`; `solar-play.spec.ts` |
| A maneuver's timing, cast or protection | The rule in `src/shared/engine/pace.ts` | `maneuvers.test.ts` (including *paced schedules*) |
| Which move triggers a maneuver | The rule's `match` in `pace.ts` (and `when`, for a milestone that needs the event's time) | `maneuvers.test.ts` |
| An effect's weight, tier or reduced-motion substitute | Its `CommandDef` in `chart/fx/commands.ts`, or in the theme's `theme/starChart/{commands,entrance,finales}.ts` | `commands.test.ts` |
| The round's finale | `finale` in `theme/starChart/finales.ts` (its timing constants are there too) | The gallery's *The round's end* cell (`gallery/motionDemos.ts`, `npm run gallery`); drive step `solar-episode.ts` plays it at the end of a real finished round |
| A pack's types, states or rungs | Its mapping JSON (`config/state-mapping.json` or `config/packs/*.json`) | `signal.test.ts`; `npm run fixtures` |
| A pack's words | `packs/<id>/words.ts` | Settings → How to read; ObjectList |
| A pack's chrome words (the round and region in the breadcrumb, player, inspector and sibling menu) | The pack's `level.round` and `level.region` words, read by `hierarchy/chrome.ts` (`chromeWords`); Solar's vocab and `solarUi.ts` draw them | `packsPlay.test.ts`; `packs-play.spec.ts` |
| A pack's thresholds | `packs/<id>/thresholds.ts` (Todo and CRM: their `index.ts`). The crowding cap, `DomainPack.crowd`, was removed in v1.3 F3 | `achievements.test.ts` |
| A new pack | `packs/<id>/`, a mapping JSON, fixtures in `fixtures/scenarios/v1/`, one line in `packs/all.ts` | `packs.test.ts`; the galaxy list in fixture mode |
| An achievement | Its rule in `engine/achievements.ts` | `achievements.test.ts` (earn and near miss) |
| The layout geometry | `engine/solar/*.ts`, then bump `SOLAR_LAYOUT_VERSION` | `solarLayout.test.ts`; regenerate `solar.*.json`; density |
| The guide drawings (the frontier belt) | `chart/scenes/solarGuides.ts` via the theme's `guides` | `npm run gallery`; drive run |
| A value: a colour, floor, size, timing or label budget | The constant 15 cites, and its row in `docs/15-reference.md` | `docTables.test.ts`; the guard 15 lists under the table |

**Source:** the files named in each row · **Update when:** a remix point moves, or a new one (a hook on
`ThemePack`, a registry) is added.

---

## 9. Open decisions
*Applies to: Solar.*

Every decision below is now decided (checked against the code 2026-10-13). D1 still waits on the
user's sign-off at HG-V3.

| # | Decision | Recommendation (used until signed off) | Status, as built |
|---|---|---|---|
| D1 | Seat and captain share the person's `id:` key | Both stay selectable. ObjectList shows one row per person; selecting lights both; the reticle prefers the seat. No change to click or Follow | **Decided: built as recommended** (one ObjectList row per person; the interpreter's seat parts prefer the seat). Sign-off at HG-V3 |
| D2 | Shuttle slots: the art filled shuttles by count (`pr=`), so a first-fit gap couldn't be drawn | Pass the count now. Ask the art owners for a slot-mask parameter (`pm=<bits>`) | **Decided and built (23 C6):** the mask is passed (`pm=`, `PieceState.slots`, from the attachments live in their slots), so a gap stays where it is. A PR waiting in "+N" is promoted into the first slot that frees (orchestrator decision, 2026-10-28), so "+N" never shows with a free slot. `pr=` stays: the count of every open PR, for "+N" past the cap. Without `pm` the art still fills by count (the gallery's) |
| D3 | Seats beyond 8 orbits | — | **Superseded by 13 Q11 (2026-10-12):** even angles on one regular ring at one radius, no second ring (§4, 08 §7) |
| D4 | Q6 who stands free | First three to arrive at the seat (13 §11) | **Superseded (Q6 closed 2026-10-12):** nobody; there is no free cap since v4 (§4) |
| D5 | Purge and settings | `settings.json` survives Purge; the Purge copy says the viewer choice stays | **Decided: built.** The Connection tab says settings survive Purge (`PURGE_KEEPS`), not the Purge button's copy |
| D6 | Per-satellite charge and operate | Whole-station acts (`dock`, `intake`) until the art exposes per-slot acts | **Decided and built (23 C6):** `dock`, `launch` and `operate` carry the PR's slot (`CommandCall.act.slot`, `CastView.slot`, `AssetView.act(name, slot)`) and play on that tender; `dock` puts `ds=<slot>` in the stage. `jump`, `intake`, `cover`, `charge`, `transform` and `muster` stay whole-station |

**Source:** the code each row names · **Update when:** a decision is signed off, reversed or built.
