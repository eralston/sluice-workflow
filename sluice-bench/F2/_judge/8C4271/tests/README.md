# Tests, and how to iterate quickly

**Status:** current as of 2026-10-27 (through v1.3 Block B). The e2e specs and goldens are named below, and the unit tests and
drive steps mostly are; the v1.2 tests and steps are listed in the v1 table's v1.2 rows.

Decided 2026-10-07: the full e2e suite takes minutes, so iteration runs a few of its pieces, and the
full suite runs once before handing back.

| Command | What | Time |
|---|---|---|
| `npm test` | Unit and golden (Vitest) | ~5 s |
| `npm run e2e:keystone` | One path per area, tagged `@keystone`, specs in parallel | ~40 s |
| `npm run e2e:spec -- <name…>` | Named specs, e.g. `npm run e2e:spec -- explore slice4` | per spec |
| `npm run e2e` | Everything: the specs in parallel, then the pixel and frame-time specs alone | ~3 min |
| `npm run bake:asteroids` | Re-bake `assets/atlas/asteroids.{png,json}` from the procedural asteroids through the gallery (23 C7); `asteroid-atlas.spec.ts` checks the atlas path renders (no missing frames) with its flag on | seconds |
| `npm run drive -- <steps.ts>` | Launch the app, run steps, keep screenshots, state, console, and dev log | seconds |

**While iterating:** run the specs for what changed (below), plus `e2e:keystone` once things look
right. Run `npm run e2e` once before handing work back.

## Windows don't appear (decided 2026-10-09)

`npm run e2e` never shows its windows: they were opening centred, over whatever you were doing. A
hidden window still animates (`backgroundThrottling` is off in test mode) and Playwright still
composites it, so the pixel baselines and the review stills are unaffected — the whole suite passes
hidden.

- **To watch a run:** `STAR_CHART_TEST_SHOW=1 npm run e2e` (or any single spec). The window is pinned
  to the top-left of the primary display, and opens without taking focus.
- **`STAR_CHART_TEST_DPR=2`** launches with that devicePixelRatio (default 1), for checks that depend on it.
- **`npm run drive`** always shows its window: watching the app is the point of it.

## Taking ADO away (slice 5)

The fake ADO org can be switched off mid-run, from the main process, with no test-only surface in
production: `app.evaluate(() => globalThis.__starChartFakeTransport.offline = true)` (see
`tests/e2e/offline.spec.ts`). Three more affordances, all test-mode only:
- `STAR_CHART_FAKE_FAIL` (a regex on the URL) with `STAR_CHART_FAKE_FAIL_STATUS` (500 by default; 401
  for a dead token, 403/404 for a refusal that keeps the last known facts).
- `STAR_CHART_PROJECTS_TTL_MS=1`: the project list is normally remembered for 30 s, which would hide an
  offline start; this asks every time, as a real launch does.
- The `reboot()` and `forgetScopes()` test hooks start the app's data over, as a launch does.

## Which specs cover what

**Both views (the v0 suites, and code both views share).**

| Changed | Run |
|---|---|
| `src/main/index.ts`, `src/preload/`, boot, selection and the inspector | `slice0` (AC-01 to AC-03) |
| `src/main/sync/`, `src/main/ado/`, `src/main/db/` (`derivationVersion`: a bump clears the derived tables at boot), `fixtures/ado.ts` | `slice4`, `explore`, `activity`, `offline` (and `npm test`: `levels`, `ado`, `refresh`, `stream`, `prStats` (23 B1: the stat line's four reads, parsed, stored, refused one at a time), `backgroundReads` (23 B audit: the deferred stat and run reads are one queue per org on one stoppable controller), `repoRuns` (23 B2: the station's run line: build mapping, failure tiers, re-read gating), `feed` (23 B5: the revisions feed: equivalence with per-item reads over every scenario, paging, resume, cap, abort, throttle, failures, seed; `activity` has its e2e); golden `ingest`, AC-27) |
| `src/main/avatars/pictures.ts`, the Inspector's picture card | `npm test` (`pictures`), `pictures` |
| `src/main/avatars/strategies.ts`, `ado/http.ts` allowlist | `npm test` (`avatarStrategies`, `ado`) |
| Settings → Your captain (`settings/CaptainPreview.tsx`, `main/captainFile.ts`, `shared/captainFile.ts`; 23 E1–E3) and the remembered view (`settings/views.ts`, `devParadigm`) | `npm test` (`captainFile`, `userSettings`), `captain-settings`, `settings` |
| Drop on a ship (`chart/pictureDrop.ts`, `shared/pictureFile.ts`, `ChartApp.captainAt`) | `npm test` (`pictureFile`), `pictures-drop` |
| Settings → Captain Avatars (`settings/tabs/CaptainAvatars.tsx`, `src/shared/captainRoster.ts`, `nav.ts` roster) | `npm test` (`captainRoster`, `pictures`), `avatars`, `settings` |
| `src/shared/hierarchy/sprints.ts`, sprint data (iterations) | `npm test` (`sprints`, `ingest` sprint cases), `sprints` |
| `src/shared/scene/` (layout, projection, sizing, avatar, board), `src/shared/hierarchy/`, `src/shared/stateMapping.ts`, `contracts/keys.ts` | `npm test` (goldens `scenes`, every scene of every scope, and `seek`; unit `core`, `slice1`, `hierarchy`, `nav-rules`, `radar`, `board`, `boardColumns` (B4: also `ingest/board.ts`, `teams.ts`, `sync/boards.ts`, migration 007), `avatar`, `scale`; `-u` to accept a deliberate change), `slice1`, `density`, `scale` |
| `src/shared/replay/`, `src/shared/playback/`, `src/renderer/src/playback.ts` | `npm test` (`replay`, `story`, `story-line`, `sceneplay`, `protect`, `follow`, `engagement`, `tempo`, `rising` (27 E8: `risingShare`, `risingMs`, the day turns); golden `schedule`), `slice2`, `slice3a`, `slice3b` |
| `src/renderer/src/chart/fx/` (director, moves, ships, moments, trails, timing, effects) | `slice3a`, `review-scenes`, `perf`, `board`, `activity-level`, `profile` (the paint, twinkle and ornament switches act; the effects cap is read back only) |
| `src/renderer/src/chart/art/`, the loading energy | `gallery`, `gallery-layout`, `gallery-v1` (look at `test-results/gallery/`); the role outlines (`art/aura.ts`, 23 C1): `npm test` (`auraContrast`) and drive `c1-contrast --paradigm solar` (WCAG contrast from the pixels; re-run after a weight change); the baked outlines (`auraBake`, 27 C3): drive `c3-aura-diff --paradigm solar` (baked against live pixels) and `c1-contrast` with `C1_AURABAKE=off|on`, and `perf` (the cuts test), `profile`; loading energy constants (`fx/explore.ts`, 23 C10): the gallery's energy cells; a station's `setPower` and `anchor` (23 C4, C5): `npm test` (`stationStandby`, `stationFire`) and drive `v11-M1`, `c5-emitter`; per-slot satellites (23 C6, `compound.ts` `slotMask`, the art's `shuttleSlots`, `stageCode` `pm=`): `npm test` (`shuttleSlots`) and drive `c6-slots`, the gallery's tender cells; standby in play (23 C2): `halcyonCoverage` and drive `c2-standby`; a vacated homeworld (23 C3, `worlds.ts`, `assets/seat.ts`): `vacantWorld` and drive `c3-vacant` (pod-sprint's Lantern Pod: Halcyon's seats never empty); the frontier push-out and stations (23 C8, `placeFormation.ts`): `frontierStations` and drive `c8-frontier` (Pulsar Pod); a ghost reseated while Off (23 C9, `boardFacts`, `rosters`, `ghostSpans`): `solarSeek` |
| `src/renderer/src/chart/ChartApp.ts`, `framing.ts`, `camera.ts`, `scenes/placement.ts`, `nav.ts`, `navSiblings.ts` | `slice1`, `scale`, `explore`, `density`, `slice3b` |
| `src/main/sync/missing.ts`, `ado/http.ts` retries, `src/shared/teams.ts`, `fixtures/scenarios/sprint-gaps.ts` | `npm test` (`slice7`), `slice7`, `diagnostics` |
| `panels/Transport.tsx` | `allevents` (23 D1 the `All events` chip; D2 insignia lag via the `insignias()` hook), `slice3a`, `explore`, `partial-history` (23 B7 to B9: the partial line and Retry via `STAR_CHART_FAKE_FAIL` lifted from main, Starting…, the banner's rects at two sizes, the `N of ~M` banner); `npm test` (`historyPartial`, `stream`) |
| `panels/EmptyCosmos.tsx`, `AreaChooser.tsx`, `Connect` | `onboarding`, `slice4` |
| The Inspector's Remove from View and + Add an Area Path (19 N1), `panels/AddPicker.tsx` | `onboarding` (a galaxy), `slice4` (the Solar round on `pod-sprint`), `sprints` (the + crumb), `slice0` |
| `vocab.ts`, `panels/{MapKey,ObjectList}.tsx`, the Inspector's kind line (19 P2) | `npm test` (`docTables`: `kinds`, `solar-kinds`), `solar` (the key under Solar in the round and a region; a person pressed as their captain), `slice1` (v0's key, the object list's groups, the ADO toggle), `board` |
| `panels/Activity.tsx`, `src/shared/activity.ts` | `npm test` (`activity`), `activity` (its pictures cases keep the panel open through the load and watch the Recent list, which holds only the last 50 calls, `RECENT_MAX`) |
| `src/main/devlog.ts`, `redact.ts` | `npm test` (`devlog`), `devlog` |
| `docs/15-reference.md`, or any constant it cites | `npm test` (`docTables`: every marked table in 15 against the code; new, 2026-10-13) |

**v1 (the Solar view, 17).** The e2e suite pins `backlog` (`launch.ts`), so a solar spec launches
unpinned or with `STAR_CHART_PARADIGM: 'solar'`; `sprints.spec.ts` pins `sprints`.

| Changed | Run |
|---|---|
| `src/shared/engine/**` (signals, moves, facts, pace, maneuvers, achievements), `src/shared/packs/**`, `config/*mapping.json` | `npm test` (`signal`, `stageCode`, `moves`, `facts`, `packs`, `maneuvers`, `scheduleHooks`, `achievements`, `literalFence`; goldens `v1-awards`, `v1-ingest`), `npm run fixtures`, `gallery-assets` (every rule has a demo) |
| `src/shared/contracts/**` (the v1 fields), `src/shared/contracts/settings.ts` | `npm test` (`contracts-v1`, `userSettings`) |
| `src/shared/engine/solar/**`, `scene/project/{solar,lists}.ts`, `hierarchy/{solar,solarSource}.ts` | `npm test` (`solarLayout`, `solarSeek`, `solarChain`; goldens `solar.plan.json`, `solar.scenes.json`, `-u` with a `SOLAR_LAYOUT_VERSION` bump), `solar` (on crm-quarter too: a station on standby, 19 M1), `density` |
| `hierarchy/solarRound.ts`, `scene/project/{preview,field}.ts` (Solar's round previews, 19 P1) | `npm test` (`solarRound`, `docTables`; golden `solar.round.json`, `-u` for a deliberate change; v0 `sprint-pods.scenes.json` must not change), `solar`, `explore`, `sprints`, `density` |
| `src/renderer/src/gallery/**` (the harness, the maneuver demos, `motionDemos.ts`) | `gallery`, `gallery-layout`, `gallery-v1`, `gallery-assets` (`gallery-assets` loops the Arrive/Depart row and finale cell in both motion modes) |
| `theme/starChart/**`, `chart/assets/**`, `chart/holo/**`, `hierarchy/solarPlates.ts` | `npm test` (`assetStage`, `registries`, `homeworlds`, `commands`, `docTables`, `stationStandby`), `gallery-assets`, `gallery-v1` (`GALLERY_FAMILY=labels` for the *Label hierarchy* cells), `solar`, `slice1` (no holo plate in v0) |
| `chart/fx/{commands,movers,host}.ts`, `chart/fx/v1/**`, `theme/starChart/maneuvers/**`, `theme/starChart/{commands,entrance,finales}.ts` (27 F2: the `Pass` mover, a summon on the fly; `solar-dense`'s turn spec reads the `summons()` hook) | `npm test` (`commands`, `maneuvers`, `castLabels`, `formationBounds`, `formationCorridor`), `solar`, `solar-play`, `solar-dense` (D2's "formations stay on screen"), `gallery-assets`; the finale in the gallery's *The round's end* cell (`gallery-assets`) and by eye in `solar-episode.ts` |
| `scenes/{placeFormation,placement,solarGuides,guidePresence}.ts`, `GraphScene.ts`, `framing.ts`, `src/shared/scene/sizing.ts` | `npm test` (`placeStations`, `frontierStations` (23 C8), `guidePresence`), `solar` (VC-2, VC-3), `density`, `slice1`, `motions` |
| `chart/{labelTiers,labels,overlays}.ts`, `overlays.css`, `chart/holo/holoRows.ts`, `@shared/prStat.ts` (the PR stat line, 23 B1) | `solar-dense` (D1's "formation plates"), `npm test` (`labelTiers`: tiers, the expanded plate's placement, a formation's plate sides; `prStats`: the line and the size band), `solar` (the expanded plate, contrast), `demo` (Quasar's station plate shows each PR's stat line; the star plate names its top Feature and `+N more` on one line, and pointing at it opens the list, 23 B3, 27 B2), `featureRow` (unit), `slice1`, `slice2`, `density`, `gallery-v1` (`GALLERY_FAMILY=labels`) |
| `@shared` `prStat.ts` (23 B1), `runLine.ts` (23 B2: the run line's text and as-of time), `featureRow.ts` (23 B3: ranking the star plate's Features), `streamCount.ts` (23 B6: `N of ~M`), `feed.ts` (23 B5: the feed's constants and window), `plateInset.ts` (23 B9: `plateTopInset`) | `npm test`: `prStats`, `repoRuns`, `featureRow`, `historyPartial`/`stream` (the count), `feed`, `plateTopInset` (the plate cap's top inset under the overlay stack); `partial-history` (e2e) for the stack |
| Touch input: `chart/holo/holoRows.ts` (the long press, `LONG_PRESS_MS`), `ChartApp.ts`'s label press (`DOUBLE_TAP_MS`) and the stage's tap (23 F5) | `touch` (`@keystone`: a tap selects, a double tap enters, a canvas tap selects; a long press on a row lights its object and selects nothing, a tap selects it) |
| `settings/**`, `src/main/userSettings.ts`, `panels/Connect.tsx` | `npm test` (`userSettings`), `settings`, `onboarding`, `slice4`, `diagnostics` |
| `src/renderer/src/tour/**`, `theme/starChart/readCopy.ts`, `theme/registry.ts` (`moreText`), `settings/tabs/Read.tsx` (23 E6, E7) | `npm test` (`readCopy`), `tour` (`STAR_CHART_TOUR_OFFER=1` lets a spec see the first-launch offer; otherwise test runs never show it); stills in `review/v1.3/E/E7-step-*.png` |
| `src/main/credentials/azCli.ts`, `credentials/store.ts` (`AzOverlayStore`), `ado/http.ts` (Bearer, 401 re-fetch), `settings/tabs/SuggestViewer.tsx` (23 E4, E5) | `npm test` (`azCli`), `az-signin` (a fake `az` on a test PATH, `STAR_CHART_FAKE_ME` names the signed-in fake user) |
| `hierarchy/{solar,chrome,crumbs}.ts`, `data/scopeData.ts` `rangeFor`, `main/fixtures.ts` `ownClock`, `panels/{Breadcrumb,Inspector}.tsx` chrome words | `npm test` (`packsPlay`), `packs-play` |
| `playGate.ts`, `playHooks.ts`, `v1/**`, `playback.ts`, `panels/{Transport,History}.tsx` | `solar`, `solar-play`, `slice2`, `slice3a` |
| The director (27 E5): `engine/director.ts`, `momentsOf`/`draftsOf` forms; volleys (27 E6a): `volleysOf`, `fuseRanges`, `joinVolleys`, `volleyTurns`, `volleyPhases`; their renderer (27 E6b): the interpreter's `nameVolley`, a turn crew (`castLabels`), every tender docking (`shuttleSlots`, `ds=1,3`) | `npm test`: `director`, `volleys`, `maneuvers`, `pacingBuilt`, `golden/director`, `castLabels`, `shuttleSlots`; late-day montage (27 E10): `schedule.ts` `chapterPs`/`inTightEnd`, `tests/e2e/montageBeats.ts`; e2e: `solar-dense` ("volleys name each cause"), `solar-play`, `montage-names` (every pod); drive `e6-volley --paradigm solar` |
| The directed camera (27 E9): `climaxFrame` (`framing.ts`), `CameraController.target`, `ChartApp` `directClimax`/`directBoard`/`directSeek`, `playback.ts` `directBeat`/`planShot`, the `shots()` and `directedCamera()` hooks | `npm test`: `climaxFrame`, `docTables`; e2e: `camera-directs`, `solar-play`, `solar-dense`, `montage-names`; drive `e9-camera --paradigm solar` |
| The sector sweep (27 E7a): `RULE.regionSweep`, `sweepPhases` (`pace.ts`), `sweepCreations` and the sequencer's sweep-first (`maneuvers.ts`), `sweepNote` (`packs/events.ts`), `sectorSweep.ts`, `sweepOrder.ts`, the `sweep` command (`finales.ts`), the interpreter's `noteSweep`, a plate's cast note (`labels.ts`) | `npm test`: `sweep`, `maneuvers`, `volleys`, `director`, `pacingBuilt`, `pacingCandidates`, `golden/director`, `docTables`, `rulebook`; e2e: `gallery-assets` (the Sector sweep cell), `solar`, `solar-play`, `solar-dense`; drive `e7-sweep --paradigm solar` |
| v1.2 playback and mandala (22): `chart/fx/approach.ts`, `engine/guests.ts`, `engine/solar/mandala.ts`, `scene/project/loiter.ts`, `pieceAnchors`, `captains.ts` `plainName`, the rulebook in 05 §8 | `npm test`: `approach`, `artActs`, `crossedAccents`, `guests`, `limelight`, `mandala`, `plainName`, `regionPrs`, `restAnchors`, `rulebook`, `stationArrival`, `storyTime` |
| `fixtures/scenarios/v1/**`, `fixtures/dsl.ts` | `npm run fixtures`, `npm test` (`v1-ingest`, `packs`, `achievements`; golden `solar`), `solar` |
| `fixtures/scenarios/sprint-pods.ts`, `fixtures/scenarios/halcyon/**`, `scripts/find-cast.ts` (Halcyon Reach, the demo; 2026-10-27) | `npm test` (`halcyonCoverage`: every pod's rules and every visual variant; `board`; goldens `sprint-pods.*`, `-u` for a deliberate change; `ingest`, AC-27), `demo` (the five pods and their seats), `solar` (Meteor's 37 stations hit-testable, 27 F1). A new look can't be wished in: re-run `find-cast.ts`, which rewrites `halcyon/cast.ts` |
| `fixtures/scenarios/sprint-mechanics.ts` (the old Halcyon Reach, test-only) | `npm test` (`facts`, `moves`, `sprints`, `stream`, `refresh`, `slice7`, `eventLine`, `pictures`, `packs`, `scheduleHooks`, `sceneplay`, `solarChain`, `contracts-v1`, `board`; goldens `sprint-mechanics.*`), `sprints`, `solar`, `activity`, `avatars`, `pictures`, `slice7`, `offline`, `token-notice`, `diagnostics`. `STAR_CHART_PODS=mechanics` serves it in the demo's place in fixture mode |
| `config/profiles/*.json`, `src/shared/contracts/profile.ts`, `src/shared/profile/**`, `src/main/profile.ts`, `src/renderer/src/profile.ts`, Settings › Theme's Device profile fieldset (v1.4 C4a) | `npm test` (`profile`, `docTables` §11), `profile` (e2e, C4c) |

**Source:** `ls tests/e2e tests/unit tests/golden` · **Update when:** a spec or test file is added,
renamed or deleted, or what it covers moves.

## Shared helpers (`tests/e2e/launch.ts`)

`launchApp`, `settle`, `clickNode`, `enterNodeByKey`, `keyOf`, the v0 walks (`openCometCrew`,
`openFeature101`) and `launchGallery` live here, and so does **`frames(page, n = 2)`** (23 F5): it
resolves once the page has drawn `n` more frames. Read what a seek or a setter drew after
`await frames(page)`, never after a fixed `waitForTimeout`, which under load can pass with no frame
drawn; don't write another copy in a spec. (In-page loops that sample every frame,
`await new Promise((r) => requestAnimationFrame(r))` inside one `page.evaluate`, are samplers, not
waits, and stay where they are.)

**Waiting under load.** A machine running four specs draws fewer, longer frames, and the chart's
clock advances at most 100 ms a frame (`ChartApp.ts`). So bound a played stretch by the playhead
(`session().x`) or by the condition itself (the body arrived, enough moves judged), not by wall time:
`board`'s travel runs until the body arrives (bounded by 8 s of playhead), and `solar-dense`'s facing
check plays until 30 decisive moves are judged. To prove a de-flake, run the spec under load, e.g.
`npx playwright test --grep @keystone &` beside `npx playwright test <spec> --repeat-each=3` (build once
first, `npx electron-vite build`: the two runs share `out/`).

**Touch.** `touch.spec.ts` sends real touches through the DevTools protocol
(`page.context().newCDPSession(page)`, `Input.dispatchTouchEvent`): Playwright's `touchscreen` needs a
context made with `hasTouch`, which an Electron window can't be given. Chromium turns them into touch
events and pointer events with `pointerType: 'touch'`, as a touchscreen would.

## Isolation and parallel runs

Every launch gets its own `userData` (`tests/e2e/launch.ts`): never the developer's real cache. A spec
that relaunches on the same cache passes `STAR_CHART_DB_DIR`, and its `userData` sits beside that
folder. Specs run four at a time (`E2E_WORKERS` to change it). Tests inside a spec run in order; most
share one app and walk a story, so a test can depend on the ones before it. Keystone tests are chosen
to pass on their own after the spec's `beforeAll`.

## The driver (`tests/drive/`)

For looking at a change for real, not gating it:

```
npm run drive -- tests/drive/steps/tour.ts                                 # fixture mode
npm run drive -- tests/drive/steps/explore.ts --fake-ado crowded-org --delay 150
npm run drive -- tests/drive/steps/solar-episode.ts --paradigm solar       # the v1 episode (HG-V3)
npm run drive -- tests/drive/steps/demo.ts --paradigm solar                # Halcyon Reach's four pods (HG-A-demo)
npm run drive -- tests/drive/steps/c2-standby.ts --paradigm solar --name c2 # Quasar's search-api going on standby in play (23 C2)
npm run drive -- tests/drive/steps/c3-vacant.ts --paradigm solar --name c3 # a homeworld empties in play: pod-sprint Lantern Pod (23 C3)
npm run drive -- tests/drive/steps/c1-contrast.ts --paradigm solar --name c1 # WCAG contrast of the role outlines, by backdrop, keyline on and off (23 C1)
```

The driver launches through `launch.ts`, which pins `backlog`, so pass `--paradigm solar` (or
`sprints`) for the other views. `solar-episode.ts` walks galaxy → Tidewater Array's Sprint 13 (the
round: it doesn't play) → Harbor Pod, chooses Wren as the viewer, plays the episode at 2×, seeks back
and ends on the recap; its stills are HG-V3's review set. The other solar walks, all on `pod-sprint`'s
Harbor Pod and all run with `--paradigm solar`:

| Steps | What it shoots | Knobs |
|---|---|---|
| `solar-board.ts` | The board at the test window and at 1024×640, at the round's end, middle and start; then one seat's formations (HG-V3) | |
| `solar-look.ts` | The fitted region at the round's end, then partway through playing | |
| `solar-pieces.ts` | Close crops of each objective and threat, at the fitted zoom and two steps in | |
| `solar-strike.ts` | A threat's Strike run every 250 ms, then again under reduced motion (HG-V3′) | |
| `solar-merge.ts` | A station's first merge (Power link and the transformation) every 500 ms, then a later merge | `MERGE_PICK`, `MERGE_AT`, `MERGE_SHOTS` |
| `solar-station.ts` | A station's jump-in every 400 ms, then its drift and tenders every 8 s | `STATION_SHOTS`, `IDLE_SHOTS` |
| `solar-idle.ts` | The board at rest every 1.5 s, with the live effects logged | `IDLE_AT`, `IDLE_SHOTS`, `IDLE_ZOOM`, `IDLE_ZX`, `IDLE_ZY` |
| `solar-opening.ts` | The opening from Play at the start, every 300 ms | `OPEN_SHOTS` |
| `solar-tap.ts` | Taps on every kind of piece, stopped and playing, logging page errors (a repro walk) | |
| `v11-L1.ts` | HG-L1 (19 L1, L3, L4): the galaxy at rest and pointed at, the round at rest and with Harbor Pod pointed at, the region with its star selected, at rest, pointed at, and a homeworld pointed at, then playing at 2× | |
| `v11-L2.ts` | 19 L2, L5: the one expandable plate in Harbor Pod mid-round: a homeworld at rest, pointed at on its disc (expanded in place), a row lit, folded after the grace, its plate pointed at, a dreadnought and a piece expanded, a homeworld selected (expanded) and playing (its title) | |
| `v11-L6.ts` | 19 L6: a dreadnought's plate expands into its PRs: tide-gateway mid-round pointed at on its hull, a PR row lit (its piece ringed); at the round's end ledger-sync's one PR serving two pieces (two rings), its plate pointed at, a row press (selects the first piece) | |
| `v11-L7.ts` | 19 L7: pieces hover-only. Harbor Pod a third of the way in, at rest (no piece plates); a seated piece pointed at (its planet's plate, its row lit) and selected (its row marked); a frontier piece pointed at (its own T2 plate); a piece with Tasks selected (the inspector's Steps); the strike run stepped into (the cast pieces' titles) and after; four frames of play at 1×; then paused (the cast labels fade) | |
| `v11-L8.ts` | 19 L8: captains' square pictures. Harbor Pod a third of the way in, at rest (initials on their swatches, square at each plate's near end), a captain pointed at (lifted), invented pictures laid into two plates (a square one and a wide one, cropped to its centre), then playing at 1× (each captain the picture alone: a small cut square with its frame line), with pictures laid in again. Each still has `close-*` close-ups of two captains | |
| `v11-N1.ts` | 19 N1 (run with `--fake-ado pod-sprint --paradigm solar`): the one galaxy selected (its Remove from View disabled, with the reason), the round with nothing selected (+ Add an Area Path), the inspector's picker, Reef Pod added, its star selected, removed (departing, then gone) | |
| `v11-P1.ts` | HG-P1 (19 P1): the round's previews. With `--paradigm solar`: the round at rest (each pod star's planets, asteroid cluster and hive marks), a deeper Area Path set on Harbor Pod's plate (the path gives way, the count stays), Harbor Pod pointed at, then close up, then its region to compare. With `--fake-ado pod-sprint --delay 400 --paradigm solar`: the round at its first look (today's assignees), then once history has streamed (Lantern Pod's second planet). Each still's note counts each star's planets, rocks and hives | |
| `v11-P2.ts` | 19 P2 (run with `--paradigm solar`): the map key at All projects, in the round and in Harbor Pod's region, then in ADO wording. Each still's notes give the key's rows (`*` where the kind is here), its looks and lines, the object list's group heads and the inspector's kind line for each Solar kind, in both wordings | |
| `v11-S1.ts` | 19 S1: one outline weight. Harbor Pod a third of the way in, reduced motion: the fit, then three open asteroids and three open hive ships, each cropped at the fit, 2× and 4×, with and without the outlines (`showAuras`). Each crop's note measures the outline (its band at half peak, peak, ΔE against the bare sky, the glow's reach past it) and the aura's own rim and blur in screen px; `measure.json` has the rows, `sheet.png` a row per zoom | `S1_ZOOMS`, `S1_PART`, `S1_PAINT` |
| `v11-S2.ts` | 19 S2: the frontier belt only when needed, never red. Harbor Pod at the round's start (no belt: nothing unassigned), the beat that brings the first unassigned pieces stepped into (no belt before the first piece shows, then the belt fading in with it, then shown), a seek back (gone at once), a frontier piece's reassign (the belt holds through the route), then All clear after the last strike run (the hero-blue sweep; no red on the belt). Each still's note gives the belt's presence (0..1) and the live commands; the All clear timeline is noted every 100 ms | `S2_CLEAR_FROM` |
| `v11-M1.ts` | HG-M1 (19 M1): a station on standby. pod-sprint's Harbor Pod at its last beat (no station reaches standby in play there; harbor-console, quiet a day and a bit, is the closest), then crm-quarter's North Territory, drawn at its round's end (a CRM region has no beats): Birchwood Mills and Osprey Freight on standby beside Quillon Dairy awake, Birchwood pointed at (its plate lifts and expands), then reduced motion. Each still's note gives every station's open PRs, standby, activity, tint and plate tier; `*-crop.png` frames one station. For the fade itself, shoot the gallery's facility cells: `GALLERY_FAMILY=registry-dreadnought GALLERY_SHOTS=test-results/drive/v11-M1-gallery npm run e2e:spec -- tests/e2e/gallery-v1.spec.ts` (run it before the drive: a Playwright run clears `test-results/`) | |
| `c6-slots.ts` | 23 C6: walks Harbor Pod's beats, logs each station's `pr=`/`pm=`, shoots the gaps, then steps tide-gateway's first merge and open beats in slow motion at 5x, reading `tenders(pk)` each frame (only the merged PR's slot flies to the bay; the others keep their slots) and saving `review/v1.3/C/C6-dock-frames-*` and `C6-launch-frames-*` (`--paradigm solar`) | |
| `c5-emitter.ts` | 23 C5: scans Harbor Pod's beats for ones that put a beam on screen and shoots up to six (a station's beam leaves its emitter; run with `--paradigm solar`) | |
| `c11-labels.ts` | 23 C11: labels before arrivals (R11). In Tidewater Array's pods, plays at 2x and seeks, sampling every visible plate against its node's drawn alpha; notes the count of plates showing while their body is under 30% drawn (expect 0). `--paradigm solar` | |
| `c1-contrast.ts` | 23 C1: the role outlines' contrast from the rendered pixels. Harbor Pod, reduced motion: up to six open asteroids, six hive ships and six Closed pieces at the fit and 2×, shot four ways (rim only, no keyline, everything, no aura) at device scale; 32 rays each; WCAG 2 ratios against the bare backdrop and the pixel past the rim, pooled per role and split night sky / planet face. Notes and `measure.json`; re-run after changing `AURA_BALANCE`, `KEYLINE_*` or `RIM_ALPHA` and update `auraContrast.test.ts`; `C1_POD="Meridian Works|Sprint 7|Convoy Planning Pod" C1_PICKS=12` measures hive ships on lit planet faces (run with `--paradigm solar`) | |
| `v11-tour.ts` | The v1.1 review tour (19; [slice-1.1-review.md](../docs/archive/progress/slice-1.1-review.md)): the galaxy at rest, Tidewater Array pointed at and selected; the round at rest (its previews), Harbor Pod pointed at and selected (the inspector); Harbor Pod's region at its end, then mid-round at rest, a homeworld's plate expanded, a seated piece pointed at (its planet's row lit), a dreadnought expanded (its PRs), the map key; then play from the start at 2× with a still every 2.5 s, and the end. Each still's note lists the shown piece plates, the expanded plates, the belt's presence and every station's open PRs, standby and tint. With `--fake-ado pod-sprint --name v11-tour-ado` it connects to the fake org first, so the pod star's inspector has Remove from View | |
| `v12-dense.ts` | 22 Block A (A13), with `--paradigm solar`: meridian-sprint's dense pod, Convoy Planning Pod (12 homeworlds). The round at rest, Convoy pointed at and selected (its inspector); the region at its end and mid-round; each empty homeworld (Rook moved out, Tove handed on, Ulla Removed) selected, with its inspector; the busiest homeworld expanded; the longest-titled piece pointed at; then play from the start at 1× with a still every 1.5 s, and the end. Each still's note lists the piece, captain and station plates shown and every captain's distance from the nearest planet in planet radii | |
| `v12-1b.ts` | 22 C10-C12: stations on two rings, arriving at first need, four labels at once (Convoy Planning Pod, Signals Pod, Harbor Pod) | |
| `v12-C2.ts` | 22 C2: story time. Harbor Pod beats where a merge and a close play together, at 1× with History open | |
| `v12-C7C9.ts` | 22 C7-C9: guests arriving and leaving, the hand-off (Convoy Planning Pod) | |
| `v12-D.ts` | 22 D1-D7: the mandala, Convoy and Harbor Pod close up, then loiter rings in play | |
| `v12-B.ts` | 22 Block B, with `--paradigm solar`: meridian-sprint's Convoy Planning Pod. The round with Convoy selected (its count line and identity line) and the map key; in the region a story, a bug, a homeworld and a station selected, each with its inspector; In view; a homeworld expanded; then play from a quarter in at 1×, a still every 1.2 s with History open, each note giving the plates' notes and History's *now* rows | |

A steps file exports `default async (d: Drive) => { … }`. It gets `d.page` and `d.app` (Playwright),
`d.shot(name)`, `d.dump(name)` (view graph, stack, camera, store), `d.note(msg)`, the navigation
helpers, and `d.canary` (the test token; never a real PAT). Output goes to
`test-results/drive/<steps name>/`, numbered in order, with `console.log` and the redacted `devlog/`.

The v0 walks: `tour.ts` and `explore.ts` (above); `board.ts`, Feature 101's board in orbit-week at
its start, middle and end, then a stretch of play; `sprints.ts` (run with `--paradigm sprints`),
galaxy → Sprint 41 → Comet Pod → a Story, then a little play (run it as `STAR_CHART_PODS=mechanics npm run drive -- …`: it opens the old Halcyon Reach's Story, see 03 §8); `demo.ts`, the four pods of the current Halcyon Reach, each with its end state, its length and stills a quarter, half and three quarters through (`--paradigm solar`); `open-timing.ts`, which samples the
loading energy every 50 ms, from a click to its scene; and `panel-metrics.ts`, the side panel's row
heights and scroll state (a debugging aid). The v1.3 Block B walks (all `--paradigm solar`, on the Halcyon demo): `pr-stat.ts` (B1: a station's plate with each PR's stat line, and the Inspector's), `run-line.ts` (B2: the `Last run:` line), `feature-row.ts` (B3: the star plate's Features row, at rest and pointed at) and `board-columns.ts` (B4: the v0 board's ADO columns, run with `--paradigm sprints`).
