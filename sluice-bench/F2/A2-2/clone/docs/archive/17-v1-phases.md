# 17 — v1 phases

**Status:** current as of 2026-10-13. The active plan until HG-V4. Built through W4 (commits
`b37f4fc`, `0c432ee`). Drafted 2026-10-10, amended 2026-10-13 to match the code. Replaces
[07](07-slices.md) (archived) for v1 work, and its *Handoff notes* section below is now the
canonical slice-note format. The architecture it builds is [14-architecture.md](../14-architecture.md);
the game it builds is [13-game-design.md](../13-game-design.md); the values it settled are in
[15-reference.md](../15-reference.md).

**W5-T1 ran on 2026-10-13** ([slice-V1-W5-T1.md](progress/slice-V1-W5-T1.md)): an audit of every task
against the code, then Base, Full and fixtures, all passing. HG-V2, HG-V3, HG-V3′ and HG-V4 are still
to come. Work since then (the milestones `seat.complete` and `region.clear`, the round's finale, the
threat light) is in the tree, uncommitted, and listed in
[*As built after W4*](#as-built-after-w4-2026-10-12-to-2026-10-13).

The plan has six waves and 20 tasks. Within a wave, tasks own **disjoint files** and can run in
parallel. A task may depend only on earlier waves, except where a dependency inside a wave is
named (W0 is serial). Each task is one slice: it ends with its checks passing, a handoff note, and
one commit.

**Never edited by any task:** `src/renderer/src/chart/art/{worlds,asteroids,swarm,dreadnoughts,fleet}.ts`
and `src/renderer/src/gallery/v1/*.ts`. Those belong to the art effort. v1 reaches them only
through exported names, in the theme adapters (W2-T3).

## Before W0

- **P0 freeze.** The working tree holds uncommitted peer work (`framing.ts`, `scenes/placement.ts`,
  `navSiblings.ts`, edits to `ChartApp.ts`, `GraphScene.ts`, `nav.ts`, `Gallery.tsx`, the art files
  and docs 10–13, 18). The user commits it, or tells us to, before W0 starts, so the first v1
  commit carries only v1 work.
- Read for every task: [02 §1](../02-domain-rules.md#1-invariants), 12, 13, 14, and the 03 sections
  the task's files touch.

## Checks used below

| Name | Commands |
|---|---|
| **Base** | `npm run typecheck`, `npm run lint`, `npm test` |
| **Keystone** | `npm run e2e:keystone` |
| **Spec X** | `npm run e2e:spec -- X` |
| **Full** | `npm run e2e` (once per wave, by the last task to finish in it) |

"Goldens unchanged" means `npm test` passes with no file under `tests/golden/__golden__/` modified
(`git status tests/golden` is clean), except files the task creates.

## Handoff notes

**This is the canonical slice-note format** (2026-10-13; it was 07's, and 07 is archived). CLAUDE.md
points here. Every slice, v1 task or not, ends with a note in `docs/progress/`: for a v1 task
`slice-V1-<task id>.md` (for example `slice-V1-W1-T3.md`), otherwise `slice-<id>.md`. A closed
slice's note moves to `docs/archive/progress/`. The note has five numbered parts, in this order:
1. **What was built.**
2. **Contracts changed,** with the matching edits to 03 (and 02, 05, 06, 08, 09, 15 where a rule or
   a value changed). "None" if none.
3. **Checks:** the results, by name (Base, Keystone, Spec X, Full; the goldens).
4. **Human gates:** screenshots or the scene and moment to watch, for any gate (fixture data only;
   never real ADO data, INV-18).
5. **Known limitations and open questions.**

---

## Decisions and assumptions

| # | Assumption | Status | As built |
|---|---|---|---|
| A1 | v1 is a new chain and the default when unpinned; v0 only by pin; switch hidden | **Accepted, refined** | Paradigm `solar`, chain `SOLAR` (round → region). Level ids stay `sprint` and `pod` (ADO `focus()` and `field.ts` depend on them). `SOLAR.pathTo` drops `body` refs. The stored v0 `paradigm` setting is no longer read at boot. v0 is also reachable without a pin, for the run only, through Settings → Theme's developer toggle (`settings/views.ts`, 13 Q9) |
| A2 | Domain meaning travels with the bundle: `domainPack`, role per type, rung per state | **Accepted, changed** | Role and signal are read through `resolveRole` / `resolveSignal` (a side index), never added to `WorkItemState`, so the seek goldens hold. SDLC bundles omit `domainPack` (AC-27). Every new field is declared in zod |
| A3 | Todo and CRM are fixture-only packs with their own galaxies | **Accepted** | Served from the fixture source under `solar` only, never through fake ADO (its WIQL hard-codes SDLC types). Scenarios live in `fixtures/scenarios/v1/`, outside `scenarios` |
| A4 | Art comes from other agents; scene code reaches it through an asset registry | **Accepted, refined** | Adapters bind to exported names, not line numbers. Only `stationStage` builds a stage string; the asteroid, world and threat strings are composed by `stageCodec.ts` and checked against the art's own parsers. `ArtView.layer` is celestial or hardware, so each `AssetDef` picks the hardware sublayer |
| A5 | Effects and motions become commands; maneuvers are data planned in shared | **Accepted, refined** | Events become a normalised `Move` list per bundle. Rule ids and phase durations are engine-named pace data in `src/shared/engine/pace.ts`; choreography names (Landing, Strike run) exist only in the renderer theme |
| A6 | Build on the peers' working tree as is | **Accepted** | With the P0 freeze above |
| A7 | New modules with small hooks; few edits to hub files | **Accepted** | One task (W3-T1) wires the new modules into `nav.ts`, `App.tsx`, `ChartApp.ts` and `playback.ts`. Earlier edits to hub files are limited to the type widenings and flags listed in W0-T1 and W1-T5 |
| A8 | Settings modal, viewer in userData, viewer-only achievements | **Accepted, changed** | The viewer, captain style and achievements switch live in `userData/settings.json`, not SQLite, so they survive Purge. Achievements: the archived 18 §5's recommendations A1–A5, now in 13 §8 (the eight of A1; 3 working days; K = 2; per round only; opt-out switch) |

Further decisions taken for this plan (see 14 §9 for the open ones):

| # | Decision |
|---|---|
| D7 | Real node kinds `seat`, `objective`, `threat`, `facility`. The v1 ship stays kind `captain` with asset `agent`. Kind tables (`MOVING_KINDS`, `FRAMED_KINDS`, `FLARE_KINDS`, `BODY_KINDS`, label `RANK`, `FLOOR_PX`) read `AssetDef` capabilities for v1 nodes; `KIND_ORDER` lists the new kinds so VC-2 holds |
| D8 | One renderer theme table (`theme/starChart/index.ts`) fills the asset, command, maneuver and guide registries |
| D9 | Schedule changes are optional hooks; with them unset, v0 schedules are byte-identical |
| D10 | `SwitchingDirector`: `ManeuverInterpreter` for solar scenes, `AnimationDirector` for the rest |
| D11 | Compound slots by interval first-fit, computed in shared |
| D12 | Formation pitch on screen = `max(2·r_world, 25 px / scale)`, so hit circles keep the 12 px floor (VC-3). As built 25 px (`FORMATION_PITCH_PX`; [15 §5](../15-reference.md#5-sizes-floors-and-layout)): a hit is half the gap to the nearest neighbour less 0.5 px, so 24 px gave 11.5 px hits. As built the pitch is `max(plan pitch, 2r, 25 px / scale)`, with r the larger of the planned `memberR` and the drawn radius (`formationLayout` in `placeFormation.ts`) |
| D13 | v1 CSS is scoped under `[data-paradigm="solar"]`; the cog renders only in solar. The v0 pixel baselines hold. As built, two exceptions: the cog also shows under a v0 view chosen with the developer toggle (`showsSettings` in `settings/views.ts`), never under a pinned launch; and `chart/holo/holo.css` isn't scoped, but only asset nodes get `.callout--holo` (`labels.ts`), so v0 labels are unaffected |
| D14 | Cut order if time runs short: Todo/CRM packs (W3-T2), then mega-labels (W2-T5), then the achievements UI (part of W3-T1). Keep the plan, the assets and the interpreter |

---

## Wave summary

| Wave | Task | Title | Depends on | State (2026-10-13) |
|---|---|---|---|---|
| W0 | T1 | Contracts, stubs and fences | P0 | Done |
| W0 | T2 | Mapping, signals and the pack registry | W0-T1 | Done |
| W1 | T1 | SDLC pack, moves and round facts | W0 | Done |
| W1 | T2 | SDLC v1 fixture (`pod-sprint`) | W0 | Done |
| W1 | T3 | Solar plan (pure geometry) | W0 | Done; replaced by layout v4–v6 (08 §7) |
| W1 | T4 | Maneuver rules and schedule hooks | W0 | Done; 16 rules now |
| W1 | T5 | Solar chain boot and paradigm default | W0 | Done |
| W2 | T1 | Solar projection and mega-lists | W1-T1, T2, T3, T4, T5 | Done |
| W2 | T2 | Scene seams and the asset registry hook | W0 | Done |
| W2 | T3 | Star Chart theme assets | W0 | Done |
| W2 | T4 | Commands and the maneuver interpreter | W0, W1-T4 | Done |
| W2 | T5 | Label tiers and mega-labels | W0 | Done |
| W2 | T6 | Settings modal and the viewer | W0 | Done |
| W2 | T7 | Achievements | W1-T1 | Done |
| W3 | T1 | Integration: nav, App, ChartApp, playback | all of W2 | Done; HG-V3 waiting |
| W3 | T2 | Todo and CRM packs | W1-T1, W1-T2 | Done |
| W3 | T3 | Solar consistency (extra, as built: one timeline, board facts, achievements at the event; `slice-V1-W3-T3.md`) | W2 | Done |
| W3 | T4 | Mega-label and settings polish (extra, as built: the developer toggle, placement, the save queue; `slice-V1-W3-T4.md`) | W2 | Done |
| W3 | T5 | Flake and density guard (extra, as built: `board.spec.ts`; `slice-V1-W3-T5.md`) | W2 | Done |
| W4 | T1 | Gallery: registry section and maneuver demos | W3-T1 | Done; HG-V3′ waiting |
| W4 | T2 | Verification specs | W3-T1, W3-T2 | Done |
| W4 | T3 | Docs amendments | W3-T1 | Done |
| W5 | T1 | Release check and sign-off | W4 | Checks pass (2026-10-13); HG-V4 waiting |

**Source:** the slice notes in `docs/archive/progress/` and `docs/progress/` · **Update when:** a task
closes, a gate is signed off, or a task is added.

---

## W0 — Foundations (serial)

### W0-T1 Contracts, stubs and fences

Every type in 14 §2, plus working stubs, so later tasks compile against final shapes. Additive
only: no behaviour changes.

| | |
|---|---|
| **Creates** | `src/shared/engine/types.ts`; `src/shared/contracts/{maneuver,settings}.ts`; `src/shared/scene/project/solar.ts` (stub: `projectSystem` over `src.fallback`); `src/renderer/src/chart/assets/{types,registry}.ts`; `src/renderer/src/chart/fx/types.ts`; `src/renderer/src/theme/{types,registry}.ts`; `src/renderer/src/theme/starChart/index.ts` (the table, importing the two stubs that follow); `src/renderer/src/theme/starChart/assets/index.ts` and `maneuvers/index.ts` (empty arrays); `src/renderer/src/chart/scenes/solarGuides.ts` (a no-op guide the table lists); `tests/unit/contracts-v1.test.ts`; `tests/unit/literalFence.test.ts` |
| **Modifies** | `src/shared/contracts/{history,view,ipc}.ts` (14 §2.1, §2.4; `paradigmSchema` gains `'solar'`; `CH.settingsGet/settingsSet` and the API type); `src/shared/hierarchy/types.ts` (`playable?`, the solar arm, `SolarSource`, `pacing?`); `src/shared/scene/projectScene.ts` (one `solar` branch); `src/shared/scene/sizing.ts` (`FLOOR_PX` for `threat`, `facility`); `src/renderer/src/vocab.ts` (`KINDS`, `KIND_ORDER`); `src/main/index.ts` and `src/main/fixtures.ts` (the `Paradigm` type only); `eslint.config.mjs` (import fence); `docs/03-contracts.md` |
| **Checks** | Base; Keystone; goldens unchanged; the zod round-trip test; the fence test passes on the (empty) engine; a deliberate fence violation fails `npm run lint` (checked once, then reverted) |
| **As built** | `FLOOR_PX.threat` and `.facility` were retuned after W4-T2 and the art session (values: [15 §5](../15-reference.md#5-sizes-floors-and-layout); why: 08 §7). The fence's carve-out allows `projectGuests` as well as `projectCaptains` from `traffic` (`eslint.config.mjs`). `SolarSource.fallback` and the stub's `projectSystem` branch were removed in W2-T1 |
| **Handoff** | `docs/archive/progress/slice-V1-W0-T1.md` |

### W0-T2 Mapping, signals and the pack registry

| | |
|---|---|
| **Creates** | `src/shared/engine/signal.ts`; `src/shared/engine/stageCode.ts`; `src/shared/packs/registry.ts`; `fixtures/scenarios/v1/index.ts` (`export const v1Scenarios = []`); `tests/unit/signal.test.ts`; `tests/unit/stageCode.test.ts` |
| **Modifies** | `config/state-mapping.json` (role per type; rung and flags per state, copied from `SIGNALS`; `entities.attachment`: active → underway, completed → accomplished, abandoned → off); `fixtures/dsl.ts` (types only: `Scenario.pack?`, `Scenario.mapping?`; `toHistory` emits `domainPack` only when the pack isn't `sdlc`) |
| **Depends on** | W0-T1 |
| **Checks** | Base; goldens unchanged; `npm run fixtures`; `signal.test.ts` (parity with `art/progress.ts` for every SDLC state; fallbacks for a bundle with no `role` or `rung`); `stageCode.test.ts` (round trip; unknown → `null`, INV-11) |
| **Handoff** | `docs/archive/progress/slice-V1-W0-T2.md` |

---

## W1 — Packs, layout, rules, fixtures and boot (parallel)

### W1-T1 SDLC pack, moves and round facts

| | |
|---|---|
| **Creates** | `src/shared/engine/{moves,facts,terminology}.ts`; `src/shared/packs/sdlc/{index,words,adapter,thresholds,links}.ts`; `src/shared/packs/all.ts`; `tests/unit/{moves,facts,packs}.test.ts` |
| **Modifies** | `tests/unit/literalFence.test.ts` (covers the new engine files) |
| **Checks** | Base; `moves.test.ts` (one case per event kind, on `sprint-pods` and hand-built bundles; memoised; undated observations never move); `facts.test.ts` (intervals for membership, seat and signal; approvers at completion); `packs.test.ts` (every SDLC type has a role and every state a rung); the literal fence passes |
| **Handoff** | `docs/archive/progress/slice-V1-W1-T1.md` |

### W1-T2 SDLC v1 fixture (`pod-sprint`)

Project *Tidewater Array*; work items 20000–20999, PRs 21000+; invented names only. As built: PRs
21000–21008; area and iteration node ids 22000+.

| | |
|---|---|
| **Creates** | `fixtures/scenarios/v1/pod-sprint.ts`; `tests/golden/v1-ingest.test.ts` |
| **Modifies** | `fixtures/dsl.ts` (`item(type, …)`; sprint membership by kind, as `derive.ts` does; `Feature`/`Epic` comparisons by kind); `fixtures/scenarios/v1/index.ts` (registers it); `scripts/build-fixtures.ts` (per-scenario mapping; emits v1 scenarios) |
| **Scenario content** | Areas: root plus 2 favourite pods (one default) and 1 unsaved. Iterations S-1, S0, S+1. 3 Features in the root. 5 assignees, the intended viewer first, and 2 reviewer-only guests. One seat with 5 Stories and 4 Bugs (past both caps); two light seats; one person with Tasks only. Frontier: 2 Stories and 1 Bug, one picked up and closed. Every rung, plus Deferred, Rejected, a reopen, a mid-sprint Bug, moves into and out of the iteration, a pod move and a reassignment. Tasks closed by a non-assignee. 3 repos, about 9 PRs: the viewer approves 3 merges, one abandoned, one open at the end, one linked to 2 items, one repo with 7 open at once ("+N"), one repo serving one seat and one serving three |
| **Checks** | Base; goldens unchanged; `npm run fixtures`; `v1-ingest.test.ts` (AC-27 for `pod-sprint`: fixture ↔ fake ADO) |
| **Handoff** | `docs/archive/progress/slice-V1-W1-T2.md` |

### W1-T3 Solar plan (pure geometry)

Implements 14 §4 over `RoundFacts`. Tests use hand-built facts, so this task needs no pack code.

| | |
|---|---|
| **Creates** | `src/shared/engine/solar/{plan,seats,slots,formations,frontier,stations,compound,version}.ts`; `tests/unit/solarLayout.test.ts` |
| **Checks** | Base; `solarLayout.test.ts`: angles fixed and the stride coprime for n = 1..12; orbits don't overlap; 3+3 cap and Q6 arrival order; a piece moved between seats has both slots; hex packing touches without overlap; `memberR` set by the largest size; midpoint and beside stations clear planets, slots, formations and orbit bands; first-fit never swaps a live slot and fills `more` past 6; the plan is identical for 50 seeded playheads; the literal fence passes |
| **As built** | The design was replaced on 2026-10-12 ([08 §7](../08-layout-solver.md#7-the-solar-system-v1-built-2026-10-10-to-2026-10-12)). The seats form one regular ring at one radius: even angles, the coprime stride, no second ring and no band packing. There is no 3 + 3 free cap: `plan.ts` passes `NO_FREE_CAP`, so `DomainPack.crowd` is unused. Every piece is standalone in its seat's region on the planet's dark side; `formationShape()` takes no count. A finished piece moves to a platform on the lit edge (`SolarPlan.platforms`, `PieceSlot.mode` `'platform'`). `SOLAR_LAYOUT_VERSION = 6`. The checks changed to match: `solarLayout.test.ts` asserts one regular ring, no free cap (the pack's crowding is ignored), the lattice and the platforms, in place of the 3 + 3 cap |
| **Handoff** | `docs/archive/progress/slice-V1-W1-T3.md` |

### W1-T4 Maneuver rules and schedule hooks

| | |
|---|---|
| **Creates** | `src/shared/engine/{pace,maneuvers}.ts`; `tests/unit/{maneuvers,scheduleHooks}.test.ts` |
| **Modifies** | `src/shared/playback/schedule.ts` (optional `priorityOf`, `focusOf`, `beatShape` in `ScheduleOptions`); `src/shared/playback/highlights.ts` (`buildScene` / `buildHighlights` spread `hier.pacing?.(h)`) |
| **Rules** | `piece.appear`, `threat.emerge`, `objective.underway`, `objective.nearing`, `objective.accomplish` (protected), `threat.engage`, `threat.accomplish` (protected), `piece.off`, `piece.reseat`, `facility.enter`, `attachment.open`, `attachment.settle` (protected when merged), `agent.light` (unaccented beats, gated by `Engagement`). As built there are 16. `attachment.merge` (essential, protected, `leads`; with a `first` variant on a facility's first merge) takes the merge (2026-10-12), so `attachment.settle` matches any settle except a merge and is never protected. The milestones `seat.complete` and `region.clear` (essential, protected) joined on 2026-10-13. Lengths, tiers and variants: [15 §7](../15-reference.md#7-maneuvers) |
| **Checks** | Base; `schedule.test.ts` golden byte-identical; `scheduleHooks.test.ts` (hooks unset → deep-equal schedules on every v0 scenario); `maneuvers.test.ts` (matching per move; determinism; protect windows inside the beat; beat durations fit `BUDGET_MS`) |
| **As built** | `PaceRule` gains `introduces`, `variant` and `leads`, and (2026-10-13) `when`; `PlannedManeuver` gains `variant` and `holds`; `BeatShape` gains `essential` (a beat with an essential moment is never cut over budget; 2026-10-13); `pacing` sets `orientMs` to `OPENING_ORIENT_MS` (the opening). The budget checks are looser: a rule's phases fit 5 s, the merge's 7.5 s; each beat still fits `BUDGET_MS`; an episode's `totalMs` fits 1.1 × `BUDGET_MS` plus its merges' time |
| **Handoff** | `docs/archive/progress/slice-V1-W1-T4.md` |

### W1-T5 Solar chain boot and paradigm default

The app boots into `solar` and shows pod systems through the fallback projection. Playback and
the new art come later.

| | |
|---|---|
| **Creates** | `src/shared/hierarchy/{solar,solarSource}.ts` (with `fallback`; `facts` returns empty facts until W2-T1); `src/renderer/src/hierarchy/{registry,solarUi}.ts`; `tests/unit/solarChain.test.ts`; `tests/e2e/solar.spec.ts` (navigation part) |
| **Modifies** | `src/renderer/src/hierarchy/index.ts` (registry lookup); `src/renderer/src/hierarchy/types.ts` (`HierarchyUi.chooser`); `src/renderer/src/store.ts` (default `'solar'`); `src/renderer/src/nav.ts` (`setParadigm(p: Paradigm)` and `loadChooser` reads `activeUi().chooser`, nothing else); `src/renderer/src/panels/Inspector.tsx` (reads `chooser`); `src/renderer/src/App.tsx` (`ParadigmSwitch` returns null under `solar`, nothing else); `src/main/index.ts` (pin parsed with `paradigmSchema`; default `solar`; stored value not read); `src/main/fixtures.ts` (`served()` adds `sprintPods` and `v1Scenarios` unless the paradigm is `backlog`; as built, the non-SDLC packs' scenarios only under `solar`, and fake ADO gets only the SDLC v1 scenarios; `mappingFor(s)`); `tests/e2e/sprints.spec.ts` (pin `'sprints'` at both launches; drop the default assertion; replace the remembered-switch test with "a pin wins over the stored value") |
| **Checks** | Base; Keystone; Spec `sprints`; Spec `solar` (unpinned default is solar; `.toggle--paradigm` count 0; galaxy → round → region; no level below the region; the round level has `playable: false`); `solarChain.test.ts` (`pathTo` never returns `body`; `stageOf` lands on a `pod` ref) |
| **Handoff** | `docs/archive/progress/slice-V1-W1-T5.md` |

---

## W2 — Projection, renderer, labels, settings and achievements (parallel)

### W2-T1 Solar projection and mega-lists

| | |
|---|---|
| **Creates** | `src/shared/scene/project/lists.ts`; `tests/golden/solar.test.ts` (writes `solar.plan.json`, `solar.scenes.json` for `pod-sprint` at 5 playheads); `tests/unit/solarSeek.test.ts` |
| **Modifies** | `src/shared/scene/project/solar.ts` (the real projection: seats, pieces, formations, frontier, stations with compounds, captains via `projectCaptains`, `graph.solar`, `graph.lists`); `src/shared/hierarchy/solarSource.ts` (drops `fallback`); `src/shared/hierarchy/solar.ts` (`pacing`) |
| **Depends on** | W1-T1, T2, T3, T4, T5 |
| **Checks** | Base; v0 goldens unchanged; new goldens written and reviewed; `solarSeek.test.ts` (each `(key, seat)` keeps one position at every beat time; seek to *x* equals play to *x*; free pieces ≤ 3 + 3 per seat, as built no free pieces at all, since v4 has no cap); mega-lists ≤ 16 rows with `more`; facility rows carry the Feature subtitle and a read-only URL; Spec `solar` still passes |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T1.md` |

### W2-T2 Scene seams and the asset registry hook

With the registry empty, v0 behaviour is identical.

| | |
|---|---|
| **Creates** | `src/renderer/src/chart/scenes/placeFormation.ts` |
| **Modifies** | `src/renderer/src/chart/scenes/GraphScene.ts` (`assetFor` tried before the switch in `createEntry`; per-entry `celestial`, `moving`, `flare`, `body` flags replacing `MOVING_KINDS` and the celestial kind list (as built, `MOVING_KINDS` stays as the v0 fallback inside `capsFor`); `setLightFrom?` / `face?` instead of `instanceof` for asset entries; a guides hook at the end of `drawOrbits`; `tick` copies the root's scale onto `marks`); `src/renderer/src/chart/scenes/placement.ts` (`cluster` branch via `placeFormation`; as built, also `placePlatforms` and `placeStations`, with `PLATFORM_PITCH_PX` and `platformSpots` in `placeFormation.ts`); `src/renderer/src/chart/framing.ts` (framed from capability; `graph.solar.frontier` bounds); `src/renderer/src/chart/fx/timing.ts` (`FLARE_KINDS`, `BODY_KINDS` also accept capability); `src/renderer/src/chart/scenes/solarGuides.ts` (draws the frontier belt and formation halos from `graph.solar`) |
| **Checks** | Base; Keystone; Spec `slice1` (pixel baselines, VC-2, VC-3); Spec `density`; Spec `motions` |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T2.md` |

### W2-T3 Star Chart theme assets

| | |
|---|---|
| **Creates** | `src/renderer/src/theme/starChart/{factions,words,stageCodec}.ts`; `src/renderer/src/theme/starChart/assets/{seat,objective,threat,facility,agent}.ts`; `tests/unit/{assetStage,registries}.test.ts` |
| **Modifies** | `src/renderer/src/theme/starChart/assets/index.ts`; `src/renderer/src/theme/starChart/index.ts` (`roleAsset`, `assets`, `words`) |
| **Notes** | `factions.ts` declares one `Faction` and asserts it equals both art declarations. The facility adapter applies the viewer's faction when `compound.summoner === viewer` (design and colourway by repo seed within that faction). The agent adapter applies `CaptainStyle` for the viewer's ship only. Each def sets `samples()` for the gallery. As built, the adapters share `assets/adapt.ts`; `AssetDef` gains `label` (a holo `HoloSpec`), `over`, `labelRim`, `departAct` and `departS`, and `AssetView` gains `ambient?()` |
| **Checks** | Base; `assetStage.test.ts` (every neutral stage → art string parses through the art's own parser, with the expected state); `registries.test.ts` (every `roleAsset` registered); `npm run gallery` starts with no console errors |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T3.md` |

### W2-T4 Commands and the maneuver interpreter

| | |
|---|---|
| **Creates** | `src/renderer/src/chart/fx/{commands,movers,host}.ts`; `src/renderer/src/chart/fx/v1/{interpreter,registry,switching}.ts`; `src/renderer/src/theme/starChart/maneuvers/{sensorContact,emergence,carve,rigUp,haul,landing,engage,strikeRun,stationJumpIn,shuttleTender,satelliteCycle,reassign,warpOut,captainJump}.ts`; `tests/unit/commands.test.ts` |
| **Modifies** | `src/renderer/src/theme/starChart/maneuvers/index.ts`; `src/renderer/src/chart/fx/director.ts` (`implements FxDirector` only) |
| **Depends on** | W0, W1-T4 |
| **Notes** | Seed commands: `flare`, `ring`, `ink`, `spark`, `tractor`, `support`, `pursue`, `hold`, `protect`, `insignia`, with weights and tiers from `director.ts`. Volatility = Σ weights + 0.3 × gliding + bias, with `CALM`, `BUSY`, `OVERLOAD` and the one-grand-burst rule. `clear()` follows 14 §4 |
| **As built** | Creates also `maneuvers/powerLink.ts` (Power link, which plays `attachment.merge`; 2026-10-12) and the helper `maneuvers/stationFire.ts`; helpers aren't registered (`haul.ts` plays inside Rig up). Since 2026-10-13 also `maneuvers/seatComplete.ts` (Homeworld complete) and `maneuvers/regionClear.ts` (All clear): 16 registered. The theme registers its own commands in `theme/starChart/commands.ts`, `entrance.ts` and `finales.ts` (the list: [15 §8](../15-reference.md#8-effects)), and its `ambient`, `entrance` and `finale` hooks, which `installTheme` in `fx/v1/registry.ts` installs. `FxDirector` gains `opening?()` and a `{ finale? }` option on `recap`; `ManeuverDef` gains `reveals?`, `owns?` and `freezes?` (14 §2.8) |
| **Checks** | Base; Keystone; Spec `motions`; Spec `activity`; `commands.test.ts` (every command has `reduced`; every rule id in `pace.ts` has a `ManeuverDef`; as built, since 2026-10-13, the theme's own commands' `reduced` resolves too, INV-20) |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T4.md` |

### W2-T5 Label tiers and mega-labels

| | |
|---|---|
| **Creates** | `src/renderer/src/chart/{labelTiers,megaLabels,overlays}.ts`; `src/renderer/src/chart/megaLabels.css` (imported by `megaLabels.ts`; scoped under `[data-paradigm="solar"]`) |
| **Modifies** | `src/renderer/src/chart/labels.ts` (`tierFor` replaces the inline compact rule, toggling `data-tier`; `obstacles(rects)` beside lanes; `RANK` falls back to `AssetDef.rank`) |
| **Notes** | Mega-labels render as `.callout.callout--mega` with rows in `.callout__title` / `.callout__meta`, so the existing contrast check covers them. Hidden unless pointed or selected. As built, planets, stations and ships also take holo labels (`chart/holo/holoLabel.ts`, `holo.css`, chosen per `AssetDef.label`; 06 §9). `holo.css` isn't scoped under `[data-paradigm="solar"]` (D13's exception) |
| **Checks** | Base; Keystone; Spec `density` (v0 unchanged); Spec `slice1`; `tierFor` reproduces today's compact and captain-hug behaviour (checked through Spec `slice2`) |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T5.md` |

### W2-T6 Settings modal and the viewer

| | |
|---|---|
| **Creates** | `src/main/userSettings.ts` (with `registerSettingsIpc()`); `src/renderer/src/settings/{store.ts,SettingsModal.tsx,SettingsButton.tsx,viewer.ts,settings.css}`; `src/renderer/src/settings/tabs/{Connection,Theme,Captain,Read}.tsx`; `tests/unit/userSettings.test.ts` |
| **Modifies** | `src/preload/index.ts` (`settings`); `src/renderer/src/panels/Connect.tsx` (split into `ConnectBody` and the shell, same class names) |
| **Notes** | `connectOpen` stays the source of truth for the Connection tab, so `ModeChip`, `EmptyCosmos` and `ObjectList` work unchanged. *Your captain* lists the loaded history's people by full name; fixtures have no signed-in user, so it always asks (Q8). The awards list takes `Award[]` as a prop (filled in W3-T1). Read copy comes from 13 §7 through `terminology`. As built, also `settings/views.ts`, the developer toggle (13 Q9; W3-T4) |
| **Checks** | Base; Spec `onboarding`; Spec `slice4`; Spec `diagnostics` (Connect selectors unchanged while the modal isn't mounted yet); `userSettings.test.ts` (round trip; corrupt → defaults; Purge leaves it; devlog carries a hash only) |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T6.md` |

### W2-T7 Achievements

| | |
|---|---|
| **Creates** | `src/shared/engine/achievements.ts`; `fixtures/scenarios/v1/achievementCases.ts`; `tests/unit/achievements.test.ts`; `tests/golden/v1-awards.test.ts` |
| **Depends on** | W1-T1 |
| **Rules** | Clear skies, Hat trick: landings, Hat trick: defences, Hat trick: reviews, Swift passage (3 working days = 36 weighted hours), Steady hands (K = 2, at least one Accomplished), Clean landing, Wingman |
| **Checks** | Base; one earn and one near miss per rule; no viewer → `[]`; undated observations ignored; `pod-sprint`'s viewer earns at least five; the literal fence passes |
| **Handoff** | `docs/archive/progress/slice-V1-W2-T7.md` |

**Wave end:** the last W2 task to finish runs Full.

---

## W3 — Integration and the demo packs (parallel)

### W3-T1 Integration: nav, App, ChartApp, playback

The single task that wires the v1 modules into the hub files.

| | |
|---|---|
| **Creates** | `src/renderer/src/{playGate,playHooks}.ts`; `src/renderer/src/v1/{plan,awards}.ts` (as built, also `v1/lines.ts`: the Transport's and History's lines under Solar) |
| **Modifies** | `src/renderer/src/chart/ChartApp.ts` (pass `assetFor` and `AssetCtx` to `GraphScene`; `director = new SwitchingDirector(...)` typed `FxDirector`; loop overlays in `show` and `onTick`; re-show after a settings change); `src/renderer/src/playback.ts` (`playableHere()` guards on play, step, toggle, next/prev; one `planBeat` hook call in `applyBeats`; one recap hook; frame and follow by `PlannedManeuver.keys`); `src/renderer/src/nav.ts` (pass-through label via `hier.labelOf`); `src/renderer/src/App.tsx` (cog after `ModeChip`, solar only; `SettingsModal` beside `KeyHelp`; settings guard at the top of `onKey`; `data-paradigm` on the root); `src/renderer/src/panels/{Transport,History}.tsx` (the "Open a solar system to play" plate; rung and story lines from the pack adapter under solar); `src/renderer/src/testHooks.ts` (`liveCommands`, `awards`); `src/main/index.ts` (`registerSettingsIpc()`; `v1Scenarios` in the fake-ADO list); `tests/e2e/solar.spec.ts` (play gate and VC parts) |
| **Depends on** | All of W2 |
| **Checks** | Base; Keystone; Spec `solar` (round not playable: plate shown, Space does nothing; region plays; VC-2 and VC-3 in a solar scene; mega-label hover lights its row's object; contrast ≥ 4.5); Spec `sprints`; Spec `slice1`; `npm run drive -- tests/drive/steps/solar-episode.ts` reviewed by eye; Full |
| **Gate** | **HG-V3 The board**: the user plays the `pod-sprint` episode on fixtures and signs off the board, the seats, the formations, the frontier and the stations |
| **Handoff** | `docs/archive/progress/slice-V1-W3-T1.md` |

### W3-T2 Todo and CRM packs

*Juniper Household* (Todo: work items 30000+, PRs 31000+) and *Larch & Pine Trading* (CRM:
40000+, 41000+), about 12 items and 3 seats each, invented names only.

| | |
|---|---|
| **Creates** | `config/packs/{todo,crm}.mapping.json`; `src/shared/packs/{todo,crm}/{index,words,adapter}.ts`; `fixtures/scenarios/v1/{todo-week,crm-quarter}.ts` |
| **Modifies** | `src/shared/packs/all.ts`; `fixtures/scenarios/v1/index.ts`; `tests/unit/packs.test.ts` |
| **Depends on** | W1-T1, W1-T2 |
| **Notes** | Todo: Todo (objective, kind `story`), Problem (threat, `bug`), Checklist Item (step, `task`); repo `Home`. CRM: Deal, Escalation, Follow-up; accounts as repos, quotes as PRs, the discount desk as `approvedBy`, a lost quote as `abandonPr`. States reuse v0 stage keys; raw state names ≤ 16 characters. Thresholds per pack (the archived 18 §5 A6; now 13 §8) |
| **Checks** | Base; goldens unchanged; `npm run fixtures`; `packs.test.ts` (every type has a role, every state a rung, `domainPack` set); both galaxies list in fixture mode under `solar` and their systems project (checked through Spec `solar` once W3-T1 lands, else by a unit projection test). As built, by the unit test: `packs.test.ts` lists both through `main/fixtures.ts` and projects each region through `SOLAR` at 5 playheads; no e2e spec covers the Todo or CRM galaxies |
| **Handoff** | `docs/archive/progress/slice-V1-W3-T2.md` |

---

## W4 — Gallery, verification and docs (parallel)

### W4-T1 Gallery: registry section and maneuver demos

| | |
|---|---|
| **Creates** | `src/renderer/src/gallery/{registrySection,maneuverDemos,extraSections}.ts`; `tests/e2e/gallery-assets.spec.ts` |
| **Modifies** | `src/renderer/src/gallery/Gallery.tsx` (one line: append `extraSections()` to `SECTIONS`; as built, two lines: the import, and `extraSections()` placed between `V1_SECTIONS` and the v0 `RAW_SECTIONS`) |
| **Notes** | The registry section draws every asset at chart size in every neutral stage through `AssetDef.samples`. Each maneuver demo mounts a `GraphScene` on a small canned solar graph (from `pod-sprint` at a fixed instant) and loops one `PlannedManeuver` through `ManeuverInterpreter`, with a reduced-motion toggle |
| **Checks** | Base; Spec `gallery-assets` (sections mount, no console errors, every maneuver runs and clears to `activeCount() === 0`); Spec `gallery-v1` and `gallery-layout` unchanged |
| **Gate** | **HG-V3′ Maneuvers**: the user reviews every maneuver in `npm run gallery` |
| **Handoff** | `docs/archive/progress/slice-V1-W4-T1.md` |

### W4-T2 Verification specs

Bugs found here are fixed in the module that owns them, by this task's owner. The only product
code another W4 task owns is W4-T1's gallery files; a gallery bug goes to W4-T1.

| | |
|---|---|
| **Creates** | `tests/e2e/{solar-play,settings}.spec.ts`; `tests/drive/steps/solar-*.ts` (as built, also `tests/unit/placeStations.test.ts`) |
| **Modifies** | `tests/e2e/density.spec.ts` (solar case on `pod-sprint`; as built, also the threat and facility floors in `sizing.ts` and the theme's `AssetDef` floors, for VC-3) |
| **Checks** | Spec `solar-play` (strike run played, then seeks back and forward: no live commands, resting stages equal `viewGraph`; reduced motion keeps the information); Spec `settings` (cog, ↑/↓ tabs, Esc, focus trap, 44 pt targets, `.connect…` selectors, the viewer survives a relaunch, insignia only on the viewer's ship); Spec `density` (cap holds, formation hits don't overlap, frontier in view, stations clear, no label overlap); Full |
| **Handoff** | `docs/archive/progress/slice-V1-W4-T2.md` |

### W4-T3 Docs amendments

| | |
|---|---|
| **Modifies** | `docs/02-domain-rules.md` (INV-05, INV-14, INV-19 and the ships rule, per 13 §9); `docs/05-playback.md` (playback at the region only; maneuvers; pacing hooks); `docs/06-visual-brief.md` (hostile palette; seeds; containers not drawn); `docs/08-layout-solver.md` (the solar solver and what the density harness found); `docs/09-signal-ladder.md` (rung carried by light on fixed-colour objects); `docs/03-contracts.md` (final pass); `tests/README.md` (solar specs; `--paradigm solar` for drive); `docs/90-later.md`; `docs/progress/handoff.md`; `docs/14-architecture.md` (status and as-built changes) |
| **Checks** | `npm run lint`; every rule change in 13 §9 has its doc edit; no real ADO data in any doc (INV-18) |
| **Handoff** | `docs/archive/progress/slice-V1-W4-T3.md` |

---

## W5 — Release check (serial)

### W5-T1 Release check and sign-off

| | |
|---|---|
| **Creates** | `docs/progress/slice-V1-W5-T1.md` |
| **Checks** | Base; Full; `npm run fixtures`; a fresh-profile launch boots into solar; `STAR_CHART_PARADIGM=sprints` and `=backlog` launches behave as v0 |
| **Gate** | **HG-V4 v1 sign-off.** The user signs off the episode, Settings and achievements on fixtures, then runs the live checks (AC-34/35 style, SDLC pack in ADO mode) and reports pass or fail only (INV-18) |
| **As built** | Ran 2026-10-13. An audit first (every **Creates** and **Modifies** present; nothing cut, D14; docs corrected), then Base (806 unit tests), Full (133 parallel + 21 alone), fixtures unchanged, a fresh fixture profile boots into Solar, and both pins behave as v0. All pass. A fresh unpinned ADO start is left to the user's live check. Waiting on HG-V4 |
| **Handoff** | `docs/progress/slice-V1-W5-T1.md` |

---

## As built after W4 (2026-10-12 to 2026-10-13)

The art sessions added these after the W4 tasks, outside the task plan:
- **Station forms.** Each faction's station has a first form and a second, taken on its first merge
  (mecha, trek, wars; `chart/art/stationRig.ts`; 13 §4.4).
- **Power link.** The rule `attachment.merge` and its choreography (`maneuvers/powerLink.ts`; 13 §6,
  05 §8).
- **Stations beam work closes.** Every station a merged PR went to beams the work's own close
  (`maneuvers/stationFire.ts`; INV-08): its phaser at a hive ship, and since 2026-10-13 its mining
  beam (`mine`) at an asteroid, in hero blue (it had been a cutting beam).
- **Idle life.** Captains at rest work the piece beside them (`ViewNode.activity`, the theme's
  `ambient`; 13 §4).
- **Entrances and the opening.** How each object comes in, and what's already there entering before
  the first beat (`theme/starChart/entrance.ts`, `ManeuverInterpreter.opening`; 13 §4).
- **Homeworld seat titles.** Each seat's planet is named for its person (`theme/starChart/homeworlds.ts`,
  `ThemePack.seatTitle`).
- **Holo labels.** Planets, stations and ships take holographic plates (`chart/holo/`; 06 §9).
- **Layout v6.** One regular ring, no free cap, platforms, stations half a planet's size (08 §7).
- **Dev-log lines.** `station-form` and `station-look` (03 §10).

The Look & Feel session added these on 2026-10-13, after W5-T1's checks (in the tree, uncommitted; the
W5-T1 results above predate them):
- **Milestones.** Two protected rules: `seat.complete` (Homeworld complete, `maneuvers/seatComplete.ts`:
  the close that leaves every piece an assignee holds here Closed) and `region.clear` (All clear,
  `maneuvers/regionClear.ts`: the close of the region's last open threat). Each plays after the close
  that made it. They match through `PaceRule.when` and read the region's own facts
  (`RoundFacts.regions`, built by `paceFacts`). Rows in [15 §7](../15-reference.md#7-maneuvers).
- **The finale.** At the end of a finished round the theme's `finale` (`theme/starChart/finales.ts`)
  plays in the recap bloom's place, then the viewer's awards: the star flares, finished platforms
  glint in the order they finished, the ships form up over the star. `ThemePack.finale`,
  `FxDirector.recap(…, { finale })` (14 §2.8). New commands `glint` and `allClear` ([15 §8](../15-reference.md#8-effects)).
- **The threat light.** A still Deadly Red glow on the frontier belt's outer edge while any threat is
  open (`threatGuide` in `solarGuides.ts`); All clear holds it through the strike run
  (`ManeuverDef.freezes`), then lifts it.
- **Essential beats are kept.** Over budget, a beat with an essential moment is never cut
  (`BeatShape.essential`), as a High beat isn't.

The audit on 2026-10-13 also fixed:
- The map key hides the four solar kinds outside Solar (`SOLAR_KINDS` in `vocab.ts`, `MapKey.tsx`;
  asserted in `slice1.spec.ts`).
- The debug spec `tests/e2e/zzdbg.spec.ts` was deleted.
- The INV-20 test in `commands.test.ts` covers the theme's own commands too.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The art changes under the adapters (A4) | Thin adapters on exported names; `assetStage.test.ts` runs each art's own parser, so a grammar change breaks one test |
| R2 | W0 contract shapes are wrong | Additive-only changes after W0; each change goes into 03 with a note in the task's handoff |
| R3 | Shuttle slots: art draws by count, the engine assigns by first-fit (D2) | Count for now; slot-mask parameter requested from the art owners |
| R4 | Formation hit floor at small window sizes (VC-3) | D12 pitch; the density solar case is the referee |
| R5 | Seat and captain share a key (D1) | One row per person; reticle prefers the seat; sign-off at HG-V3 |
| R6 | Pixi may not load under Vitest's Node environment | The parser check moves into `gallery-assets.spec.ts`; `stageCodec` keeps its unit test |
| R7 | Many 3D hive and asteroid views in formations are slow | `scene.cull`; an `AssetDef` LOD for small members; measured in P7 |
| R8 | `Gallery.tsx` and the hub files hold uncommitted peer work (A6) | The P0 freeze before W0 |
| R9 | The unpinned default changes | `launch.ts` keeps pinning backlog; `sprints.spec.ts` pinned in W1-T5 |
| R10 | Purge doesn't forget the viewer | Said in the Purge copy (D5). As built, the Connection tab says it, below Purge: settings survive a Purge (`PURGE_KEEPS` in `settings/tabs/Connection.tsx`) |
| R11 | v0 leaks for non-SDLC packs (`accents.ts` state literals, `protect.ts` kind switch, the Task group burst) | Solar never calls them: pacing comes from `pace.ts` through the hooks |
