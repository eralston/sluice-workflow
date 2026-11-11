# Slice V1-W3-T1: Integration (nav, App, ChartApp, playback)

Built 2026-10-10 to 2026-10-12, following
[17 W3-T1](../17-v1-phases.md#w3-t1-integration-nav-app-chartapp-playback) and 14 §1.4, §3 and §8.
This is the task that wires the W2 modules into the hub files. Unpinned, the app now opens in Solar.
The `pod-sprint` episode plays end to end on fixtures:
- the round shows a plate, and Space does nothing there;
- the region plays its maneuvers through the `SwitchingDirector`;
- the theme's assets draw the board;
- mega-labels open on seats;
- Settings chooses the viewer;
- the viewer's awards light on their own ship and close the recap.

v0 (`STAR_CHART_PARADIGM=sprints|backlog`) is unchanged, and so are its pixel baselines and every
golden.

> **Status: partial. One listed check is not met.** 17 lists "VC-2 and VC-3 in a solar scene" among
> this task's checks. VC-2 holds; **VC-3 does not.** On `pod-sprint` the region's hits overlap (21
> pairs at the fit scale). The cause is the solar placement, in `scenes/placement.ts` and
> `placeFormation.ts`. Those are W2-T2's files, not this task's, so the fix goes to W4-T2 (17 W4-T2:
> "bugs found here are fixed in the module that owns them, by this task's owner"). **HG-V3 is gated
> on that fix.** See 5 for the measurements and the fix.

The task was resumed after an outage. The earlier agent had written most of the wiring, and this
pass kept it, checked it, fixed what the checks found (see 1, "Fixes in this pass"), and ran every
check.

## 1. What was built
- **`playGate.ts`** (new): `gatesPlay(hier)`, `playableAt(sceneKey)` and `playableHere()`.
  - A chain gates play when any of its levels says `playable: false`. A gated chain never plays its
    galaxy or a `playable: false` level, so in Solar only the region plays.
  - v0 chains declare no gate, so every level plays as before.
- **`playHooks.ts`** (new): the only two seams `playback.ts` calls into v1.
  - `registerBeatPlanner` and `planBeat`. A planner answers `null` for a scene it doesn't own, and
    the v0 accents then play.
  - `registerRecapHook`, `recapAwards`, and `beatAwards`, which picks the awards a beat's own
    events earned.
  - `ShownAward = Award & { holder }`.
- **`v1/plan.ts`** (new, registers on import): `isSolarScene` and `planSolarBeat`.
  - A beat in a solar region is planned with
    `planManeuvers(h, beat, paceFacts(h), PACE_RULES, eng, { priorityOf })`. These are the same
    facts and the same priority that pacing sized the schedule from.
  - Beats crossed in the same frame get light work only (`accented: false`), and only when
    `eng.lightActions` is set.
- **`v1/awards.ts`** (new, registers the recap hook on import): `awardsIn`, `currentAwards` and
  `useAwards`.
  - It runs `achievementsFor(roundFacts(h, ref, pack), viewer, pack, { tz, terms })` only in a
    solar region, only with the switch on, and only once a viewer is chosen.
  - The terms are the chart register.
  - The result is cached per bundle, scene and viewer.
  - Every award gets `holder: viewer`, so its insignia only ever goes on the viewer's ship.
- **`v1/lines.ts`** (new; 17 lists only `plan` and `awards`, and this is the third file): what the
  player and History say under Solar, read through the pack.
  - `solarChain`, `termsFor` (pack words, or the theme's words in the chart register),
    `solarLine` (the pack adapter's `describe`), `solarRung`, `solarSubject` and `playPlate`.
- **`ChartApp.ts`**
  - Imports `fx/v1/registry` before `theme/starChart`, so the maneuvers fill as the theme becomes
    active.
  - `director = new SwitchingDirector(host)`. `playBeat` and `tellBeat` take an `FxBeat` with
    `maneuvers`, `recap(keys, awards)` passes the awards on, and `insignia(awards)` lights an award
    as its beat plays.
  - `fxCensus(): SwitchingCensus`, and a new `liveCommands()` that returns `activeCount()`.
  - `setAssetCtx(ctx)` switches the theme if `ctx.theme` differs, keeps the context for every
    scene mounted later, and passes it to the mounted scene, which rebuilds its asset views.
  - `megaLabels` is imported once.
    `createOverlays(labelHost, { light, press, open })` wires them:
    - `light` brings the row's object's label forward and drives the hover ring;
    - `press` calls `onPick`;
    - `open(url, key)` calls `onOpenContainer`, by the container's key, or else by the row's
      piece.
  - Overlays sync with the labels in `show` and clear with them. Each frame,
    `overlays.focus` and `overlays.position` run after `labels.position`, and then
    `labels.obstacles(overlays.rects())`.
- **`playback.ts`**
  - `playableHere()` guards `play`, `togglePlay`, `step`, `prevBeat`, `nextInView` and
    `prevInView`.
  - `applyBeats` makes one `planBeat` call. When it returns maneuvers, they replace the accents.
  - The lead-in plans the next beat the same way, so the tell has subjects to glow.
  - Frame and follow use the maneuvers' `keys` (`keysOf`).
  - `recap()` passes `recapAwards(...)`, and each beat passes `beatAwards(...)` to
    `chart.insignia`.
- **`nav.ts`**: `setParadigm(p: Paradigm)`, and a pass-through label that is solar-only (see
  "Fixes").
- **`App.tsx`**
  - `data-paradigm={paradigm}` on `.app`.
  - `<SettingsButton/>` after `<ModeChip/>`. It shows itself only under Solar, or under a v0 view
    the developer toggle chose (W3-T4).
  - `<SettingsModal awards={useAwards()}/>` beside `KeyHelp`. It is mounted in every paradigm, as
    W3-T4 asked.
  - A settings guard at the top of `onKey`.
  - `ParadigmSwitch` returns null under Solar.
  - The asset context comes from `assetCtxFor(settings, history)`. It is applied after
    `loadSettings()`, and again on `onSettingsChange` and whenever the bundle changes.
  - `onPick` selects and reveals the row's object.
  - `onOpenContainer` calls `window.starChart.openInAdo(key)`, read-only (INV-21), and only when
    `caps().openInAdo` is true.
  - Imports `v1/plan` and `v1/awards` once, which registers both hooks.
- **`panels/Transport.tsx`**
  - Where `playableAt` is false, the player is the plate `.transport--gate`. It reads
    "Open a solar system to play", in the register's own word for a region.
  - Under Solar, the ruler's tick rungs and the beat lines come from the pack (`v1/lines.ts`).
- **`panels/History.tsx`**: under Solar, each card's line, rung and icon kind come from the pack.
  The icon kind is chosen by role.
- **`testHooks.ts`**: `liveCommands()`, `awards()`, and `fxCensus().maneuvers`.
- **`main/index.ts`**
  - `registerSettingsIpc()`.
  - The fake ADO org can serve `v1Scenarios`, but only SDLC ones (17 A3), plus the solar default
    and the `paradigmSchema` pin that W1-T5 added.
- **`tests/e2e/solar.spec.ts`**: the play gate and VC part, run on `pod-sprint`.
  - The round shows the plate, and Space and → change nothing.
  - The region plays: `fxCensus().maneuvers > 0`, and after a seek `liveCommands() === 0`.
  - VC-2: every selectable node is listed, and every hit is at least 12 px.
  - VC-3: no hits overlap. **This check fails today.** It is marked `test.fail()`, which Playwright
    reports as an expected failure, not as a pass. It trips once the placement fix lands. See 5.
  - Pointing at a seat opens `.callout--mega`. Hovering a row whose object is drawn shows
    `.mega-ring`.
  - Callout contrast is at least 4.5, mega-labels included. Only drawn text is measured, so a
    compact captain's hidden meta line is skipped.
- **Fixes in this pass**
  - **nav pass-through (a v0 regression).** `hier.labelOf` gave a Sprints pod a label, so picking
    one pod in the area chooser passed straight through to it. That broke `pictures.spec`
    (keystone). `labelOf` is now used only when the member level's layout is `solar`. v0 again
    uses the work item's title, so a pod never passes through.
  - **solar.spec, three fixes.**
    - The seat to point at is now one whose centre no other hit covers.
    - The test searches mid-round playheads, where the seat has a drawn piece.
    - The ring check now hovers that piece's row. A landed objective is listed, but it isn't
      drawn, so its row has nothing to ring.
- **Already in the tree from W2-T2 and W2-T4 (verified, not re-done):**
  - `GraphScene.actView` and `capsOf`;
  - resting every act in `landAllStages`;
  - lighting a new asset after `settle()` places its root;
  - acts timed on `motion.pulseTime` (one `EVENT_LOOP_S` loop), so at 2× a station act shows one
    loop, not two;
  - the interpreter skips cast keys the board doesn't draw in the preferred kind: a ghost's
    `toSeat` that isn't a seat, or a reviewer with no ship;
  - `MegaRow.subtitle.key`, filled by `lists.ts`.

## 2. Contracts changed
- No shared contract changed in this pass. Every shape used is W0–W2's.
- **Renderer seams to record in 03 §5d and §6 (for W4-T3):**
  - `playGate.ts`: `gatesPlay`, `playableAt` and `playableHere`.
  - `playHooks.ts`: `BeatPlanArgs`, `BeatPlanner`, `RecapHook`, `ShownAward`, the two
    `register*` functions, `planBeat`, `recapAwards` and `beatAwards`.
  - `ChartCallbacks.onPick` and `onOpenContainer`.
  - `ChartApp.setAssetCtx`, `insignia` and `liveCommands`.
  - The test hooks `liveCommands` and `awards`.
  - The `.transport--gate` plate.
- **Departures:**
  - `v1/lines.ts` is a third file under `v1/`.
  - The nav pass-through is solar-only, so v0 behaviour holds.
  - `docs/progress/handoff.md` (W4-T3's file) has one added row, "V1, Solar", which marks HG-V3
    gated on VC-3. The reviewers asked for it, and W4-T3 replaces it with the full v1 status.
- 02 is unchanged.

## 3. Checks
- **Base**: `npm run typecheck` clean, `npm run lint` clean. `npm test`: 49 files, 758 tests, all
  passing.
- **Goldens unchanged**: `git status tests/golden` shows only earlier waves' untracked files.
- **Keystone**: 38 of 38. The first run failed `pictures.spec` because of the pass-through
  regression; after the fix it passed.
- **Spec `solar`: VC-3 NOT MET.** Six of seven tests pass. The VC-3 test fails, and Playwright
  counts it as passing only because it is marked `test.fail()`. It was re-run twice on
  2026-10-12, the second time after a fresh build at 12:40, and still fails. The first re-run
  counted 21 overlapping hit pairs on `pod-sprint`'s region. The play gate, the region playing,
  VC-2, the mega-label, the hover ring and contrast all hold.
- **Spec `sprints`** and **Spec `slice1`**: 27 of 27, including the pixel baselines, VC-2, VC-3 and
  VC-4.
- **Spec `pictures`**: 2 of 2.
- **Full** (`--project=parallel`, then `--project=alone`): 121 and 21 passed. The only ✘ is
  VC-3, which is the unmet check above.
- **`npm run drive -- tests/drive/steps/solar-episode.ts --paradigm solar`, reviewed by eye.** No
  console errors.
  - The round's plate reads "Open a solar system to play".
  - Wren is chosen as viewer and earns 7 awards: Swift passage, Clean landing, Wingman, Hat trick:
    reviews, Clear skies, Hat trick: landings and Steady hands.
  - Playing reached 55 maneuvers by beat 18 and 99 by the end.
  - A seek leaves 0 live commands.
  - The recap shows 5 insignia glyphs.
- **Ad hoc drives** (in `/tmp`, not kept)
  - The developer toggle goes Solar → Sprints → Backlog → Solar.
    - `data-paradigm` follows each view.
    - The cog stays under the toggle-chosen v0 views.
    - The paradigm switch shows only under v0.
  - A captain's ship is clickable, and the Inspector shows Follow (13 Q11).

## 4. Screenshots (HG-V3, fixture data only)
These are in `test-results/drive/solar-episode/` (gitignored), from the drive above:
- `02-round.png`: the round and its plate.
- `03-region-end.png`: the board at the round's end.
- `05-settings-captain.png`: Settings → Your captain.
- `06-seat-mega-label.png`: a seat's mega-label.
- `07`–`12-playing-*.png`: the episode at 2×.
- `13-after-seek.png`: after a seek.
- `14-recap.png`: the recap.

**HG-V3 (the board) is gated.** Don't take it to the user until VC-3 holds. `03-region-end.png`
shows the fault: stations sit on the star, and pieces sit inside their seats' hits. Once the
placement fix lands and `test.fail()` is gone, re-run the drive and offer these screenshots for
sign-off.

## 5. Known limitations and open questions
- **VC-3 fails in the solar region. This blocks HG-V3. Routed to W4-T2, which fixes it in W2-T2's
  `scenes/placement.ts` / `placeFormation.ts`.** This is a real usability fault, not a test
  artefact. The region fits at a scale of about 0.13, and at that scale:
  - The free pieces' moon ring is 200 world units, about 26 px. A threat's screen floor is 26 px,
    so its hit is 29 px.
  - So pieces sit inside their seat's hit and inside each other's. Ossian Vale's three free
    threats are 16–31 px apart against the 58 px they need.
  - The midpoint stations sit inside the star's hit: ledger-sync's centre is 62 px from the star's
    against the 82 px needed, and from tide-gateway 42 px against 95 px.

  The fix belongs in placement: a screen-terms moon ring, `D = max(d, seatHit + pieceHit + gap,
  (pieceHit + gap/2) / sin(moonSpread/2))`, like the formation pitch. The formation shifts out by
  the ring's growth (inside `formationLayouts`, so the halos follow it), and the stations get a
  first-free spot pass. The other option is smaller threat and facility floors in the theme
  (W2-T3's `theme/starChart` files). When this lands:
  - remove `test.fail()` from solar.spec's VC-3 test;
  - drop the "no other hit covers its centre" seat search from the mega-label test;
  - re-run Spec `solar` and the drive;
  - then take HG-V3 to the user.

  This task didn't make the fix itself because the files belong to another task, and 17's rules
  say a task edits only the files it owns.

  **Fix recipe, checked by simulation (2026-10-12, third review).** The pass replayed the drive's
  `04-region-end.json` dump (camera scale 0.1298) offline. It used the same `hitRadius` rule, a 6 px
  gap, and four placement variants. Results:

  | Threat / facility floor (×`LABEL_PX`) | Screen spread of free slots | Moon ring (px) | Overlaps left |
  |---|---|---|---|
  | Baseline: today's placement (200-unit world ring) | 36° | about 26 | 21 |
  | 0.55 / 0.9 (screen-terms ring at today's floors and spread) | 36° | threat 104, objective 62 | 2 |
  | 0.55 / 0.9 | 60° | threat 64 | 4 |
  | **0.3 / 0.5** | **60°** | **39 (about 300 world units)** | **1** |
  | 0.4 / 0.6 | 60° | threat 48 | 1 |

  What the numbers show:
  - The screen-terms ring alone can't fix it at today's floors. A threat's hit (29 px) needs a
    104 px ring at the plan's 36° spread. That is about 800 world units, more than one orbit's
    spacing, so the pieces would no longer read as their planet's.
  - The variant that works lowers the floors, widens the free slots' spread on screen, and uses a
    first-free spiral for the stations. With it, the stations move only 0–21 px. The one overlap
    left is a free threat against its seat's one-member threat formation.
  - So the formation shift has to give screen clearance:
    `centre ≥ D + pieceHit + gap + formation outer hit`. Shifting it by the ring's growth alone
    isn't enough.

  The sizes are an art call: today a threat's ship is drawn bigger than its planet. The floors live
  in `src/shared/scene/sizing.ts` (`FLOOR_PX.threat` / `.facility`, which only v1 kinds use, so v0
  is safe). The ring and the station pass go in `scenes/placement.ts` and `placeFormation.ts`.

  **Ordering.** 17 makes W4-T2 depend on W3-T1, and W4-T2 owns this fix. So W4-T2 has to start
  while W3-T1 is still partial on VC-3. This VC-3 test is how W4-T2 shows the fix holds.
- **Pointing lands on the topmost hit.** Until VC-3 holds, pointing at some seats lands on a piece
  instead. `clickNode` by person key can then select a threat over the seat.
- **History and ruler lines read through the pack adapter**, and some are still rough. An area
  move reads "asteroid #20141 · wi area changed", and pieces show by role noun and number, not
  title. This is the SDLC adapter's `describe` (W1-T1's file).
- **Insignia during a beat** use the director's recap path (`recap([], awards)`), which waits up
  to 4 s for calm, so a busy beat's insignia can land a little late.
- **The asset context is re-applied whenever the bundle changes.** The scene rebuilds asset views
  only when the context actually changed.
- Carried over, owned elsewhere:
  - W4-T1: gallery samples and maneuver demo tuning, and `HOSTILE` vs the swarm palette.
  - W4-T2: the density solar case, and the `settings.spec` selectors listed in the wave notes.
  - W4-T3: recording every seam above in 03.
