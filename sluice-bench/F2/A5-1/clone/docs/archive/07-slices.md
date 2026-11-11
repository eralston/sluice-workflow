# 07 — Implementation slices

Build one slice at a time. Slices 0–3 run entirely on synthetic fixtures. ADO arrives in slice 4.
Don't start a slice until the previous slice's checks pass and its human gate (if it has one) is
signed off.

**Commands** (created in slice 0 and kept working afterwards):

| Command | Does |
|---|---|
| `npm run dev` | Runs the app in fixture mode, which is the default |
| `npm test` | Vitest unit and golden tests |
| `npm run e2e` | Playwright against the built app |
| `npm run fixtures` | Rebuilds `fixtures/generated/` |
| `npm run typecheck` / `npm run lint` | Type and lint checks |

**Every slice ends with a handoff note** in `docs/progress/slice-N.md`:
1. What was built.
2. Contracts changed, if any, with the matching doc edits.
3. The AC/VC results.
4. Screenshots for any human gate.
5. Known limitations and open questions.

The note must never contain real ADO data (INV-18).

## Test types
- **U**: unit test in `tests/unit`, run by Vitest.
- **G**: golden test in `tests/golden`, which compares output to a checked-in expected file.
- **E**: e2e test in `tests/e2e`, run by Playwright `_electron`.
- **M**: manual check, performed and reported **by the user**.
- **HG**: human review gate ([06 §8](06-visual-brief.md#8-visual-checks)).

## Slice 0 — Boot and one procedural Feature system
**Read:** [CLAUDE.md](../CLAUDE.md), [02](02-domain-rules.md) §§1, 4, 5, [03](03-contracts.md)
§§0, 1, 3, 4, 5, 6, 8, 10, [06](06-visual-brief.md) §§1, 2, 4, 6, 7, 8.

**Build:**
- Scaffold electron-vite with the pins from 03 §0.
- The main / preload / renderer split, with `window.starChart` exposing `mode`, `fixtures.list`,
  and `history.load` (fixture mode only). Every other API call throws `NotImplemented` until its
  slice.
- The fixture DSL plus `toHistory`, with enough of `orbit-week` for one Feature and two Stories.
- The real `config/state-mapping.json`, loaded into `ScopeHistory.stateMapping`.
- A minimal `snapshotAt` covering `wi_created`, `wi_state_changed`, and `link_parent_added`.
- `projectScene` for `feature:` scenes only. The renderer opens the first fixture's first Feature.
- A Pixi app with the stage layers and a `FeatureScene` that implements `mount`, `apply`,
  `setSelection`, and `dispose` (the diffing happens inside `apply`).
- Only the stages the fixture uses; full stage coverage comes in slice 2.
- Procedural art: the nebula, star, and planet shaders.
- DOM callout labels, a skeleton inspector, the map-debug toggle, and the `__starChartReady` hook.

**Checks:**
- **AC-01 (E)** The app launches with no PAT and shows the fixture Feature system.
- **AC-02 (E)** Selecting the star and a planet works by pointer **and** keyboard. The inspector
  shows the raw type and state, and evidence; the canonical and projection keys show in map debug (D;
  revised 2026-10-04). The ADO link is visibly
  disabled in fixture mode.
- **AC-03 (E)** Unmounting and remounting the scene 10 times leaves
  `__starChartTest.counts()` equal to the baseline taken after the first mount (03 §10).
- **HG-1.**

## Slice 1 — Complete static hierarchy
**Read:** 02 §§2–3, 03 §§5, 8, 06 §§3–6.

**Build:**
- The full `orbit-week` fixture.
- `GalaxyScene`, `SectorScene`, and `BodyScene`, plus scene keys, breadcrumbs, and the sector
  chooser (Saved Area Paths, then Epics).
- Deterministic slot layout, stations, flights, routes, and captain ships (the ship kit).
- The Uncharted and unlinked trays.
- `CameraController` and the wipe transitions.
- Search by ID or title.
- A static snapshot at the end of the range.

**Checks:**
- **AC-04 (U)** The same Feature projected under an Area sector and an Epic sector has the same
  canonical key and the same history, and no event is duplicated.
- **AC-05 (U)** Routes are drawn correctly:
  - PR → Task, with a continuation to the Story.
  - PR → Story direct, with no Task node.
  - PR → Bug direct.
  - An unlinked PR goes to its station's tray.
- **AC-06 (U)** A shared repo is one entity with a projection in each Feature scene that uses it.
- **AC-07 (U)** Slot positions stay the same across 20 random seeks. A child added later takes a
  free slot without moving existing ones.
- **AC-08 (E)** Star → planet → Back → Back restores the camera and selection each time. Five rapid
  clicks mid-transition never snap backward or leak objects.
- **VC-1 … VC-4.**
- **HG-2.**

## Slice 2 — Replay
**Read:** 02 §§2, 4–6, 03 §§3, 4, 5, 7, 8, 05 §§1–5, 06 §5.

**Build:**
- The full `snapshotAt` reducer with checkpoints, and both lenses.
- The state mapping from `config/state-mapping.json`.
- The `edge-history`, `quiet-week`, and `busy-week` fixtures.
- `buildBeatSchedule`.
- `PlaybackSession`, with controls: play, pause, step, seek, rate, and date entry.
- An event list synchronized with the playhead.
- The AnimationDirector and all accents in the Feature and body scenes.
- A lens toggle, with the retrospective lens labeled.

**Checks:**
- **AC-09 (G)** Seeking to the same instant from different prior states gives identical `Snapshot`
  and `ViewGraph` results.
- **AC-10 (U)** A PR completion never changes the stage of a Story or Bug.
- **AC-11 (U)** An undated link (an `Observation`) is absent in the `knownThen` lens, marked
  uncertain in `currentObserved`, and never produces an accent. A link added later is also
  uncertain in `currentObserved` before its time.
- **AC-12 (U)** A PR link added after the PR opened appears only from the link time. There's no
  launch at the PR's creation that routes to that Story.
- **AC-13 (U)** After a reparent, the child is under the old Feature before the event and under the
  new one after it.
- **AC-14 (U)** A reopen sets `reopened`, and the earlier Closed event stays in history.
- **AC-15 (U)** An unknown state gets stage `unknown` and keeps its raw name.
- **AC-16 (U)** An area change moves the Feature's sector membership at exactly its source time.
- **AC-17 (G)** Beat schedule totals are right:
  - `orbit-week` at 1× takes 20–30 s (target ≈22 s); ½× and ¼× take ×2 and ×4.
  - `quiet-week` takes under 30 s.
  - `busy-week` takes 30 s or less, with some accents dropped but every event still applied.
- **AC-18 (U)** Changing the rate mid-beat leaves source time, scene, and event order unchanged.
- **AC-19 (U)** Seeking produces zero accents. When several beats are crossed in one frame, at most
  one gets an accent: the latest accented one. Scene-diff accents never fire on seek or lens toggle.
- **AC-21 (U, E)** Two concurrent assignments show the captain at both and no relocation: a ship in
  each scene, and an assignment in another scene never moves the ship here. (Since slice 3a a ship
  rests where its captain last worked; before any activity, beside a body, then the assignment held
  longest.) A second item in the same scene gets the name on its label (beacons are off since slice 1).
- **AC-22 (U)** `pr_opened` with an author produces `authorBeam` (since slice 3a played as the
  author's ship flying to the vessel with its tractor beam) and never moves the assignee's ship.

## Slice 3a — Story grammar
**Read:** 02 INV-14, 03 §§3, 5, 7, 10, 05 §§2–3, 5, 7, 06 §§2–3, 5.

Split from slice 3 at the slice 2 review (2026-10-03), so every motion and effect is judged together
for storytelling against chaos.

**Build:**
- The Task radar: bands by rung, fixed spokes, accretion glow, tally, hover-only labels (06 §3),
  with INV-14 amended.
- The radar ping and echoes; the cause → effect beam from `changedBy` (contract, DSL, fixtures).
- Tells and the lead-in; stagger, ducking, and one grand burst at a time.
- New accents: PR delivery run, abandon, reopen, seed spark, reparent and area-move trails, recap
  bloom, dawn sweep.
- The simplified transport (rate chip, ⋯ menu, Retrospective chip, in-view ticks with hover lines,
  auto-fade), the hotkeys and ? overlay, and Highlights.

**Checks:**
- **AC-36 (U)** A Task's radar angle is identical at every instant; its band follows its stage; no
  two Tasks share an angle; seeks are idempotent; a state change moves a Task only radially.
- **AC-37 (E)** Across a beat, every Task move is radial only, and the Task wave lands in its new
  bands. The 20-Task close-up passes the density harness (no hit or label overlaps, every PR and
  station label shown).
- **AC-38 (E)** While playing, a beat's tells run in the gap before it; a seek mid-lead-in leaves no
  effects. Seeks and steps never play tells.
- **AC-39 (U)** `changedBy` defaults to the assignee and an explicit actor overrides it; the tractor
  beam's ship is the actor's, never the assignee's; a ship rests where its captain last worked.
- **AC-40 (G)** Highlights: every scenario's busiest Feature has a golden highlights schedule
  within its budget (or High-only); every beat touches the scene; the state is the full snapshot.
- **AC-41 (E)** The hotkeys drive the session; the rate popover works; the bar fades while playing
  and returns on a mouse move; the Retrospective chip shows; H rebuilds the schedule at the same
  source time.
- **AC-42 (E)** The recap plays only when playing reaches the end, not on End or a seek.
- **AC-43 (E)** Continuity: playing Lantern's launch beats at 1×, no node on screen moves faster than
  1500 px/s between frames (no teleports); a launch holds its routes until their ink has drawn them;
  after a seek nothing glides.
- **AC-44 (E)** Tiers: with the scene busy, a Task wave plays at most 3 echoes; overloaded, none, while
  every radar ping (essential) still plays.
- **AC-45 (E)** The review formation: at PR 9202's merge, one ship per approver (two guests with name
  tags) gathers and every approver's beam joins before the grand flare; afterwards no guest ship or
  tag remains, and the scene's object count matches its count before the merge.
- **AC-47 (E)** Dynamic labels: while playing, every visible unfocused label is compact and ships show
  only their captain's picture; after a pause, full labels return within a few seconds. A Task that
  changes band flashes its title, then hides once settled.
- **AC-48 (U, E)** A sector that only ever holds one Feature passes through: choosing it opens the
  Feature system, and Back returns to the galaxy with the project's chooser open. Multi-Feature
  sectors and Epics are unchanged. **The team switcher** (revised 2026-10-04) always shows the team
  as a pill: its ▾ switches to another Area Path or Epic (landing in that team's sky), and its name
  goes to the team's home (its sky, or its one Feature).
- **AC-50 (E)** Minor refinements (2026-10-04): History shows the newest card on top, highlighted,
  with older ones below; the collapsed player keeps small dots for the in-view big moments; the
  followed ship wears a hero aura with an entrance as play starts; and paused away from the
  followed ship's scene, following ends (playing, it only suspends).
- **AC-49 (U, E)** Protected moments (05 §5): a merge, and a Feature, Story, or Bug closing,
  protect their cast. Same-beat accents that would move it start after it, and the beat holds both
  (unit). Played at 1× and at 4× through Kestrel's first merge: the crew's ships keep their places in
  the V, the berthed vessel stays put, and the next PR's vessel waits at its bay until the formation
  is over (e2e).
- **AC-46 (E)** A seek mid-formation leaves no effects and no guest ships. *(Unit: approvers come
  through to the plan; approving never moves a resting place; guests are never projection nodes.)*
- **AC-17, re-targeted (2026-10-03):** orbit-week 35–60 s at 1×, every beat accented (gaps compress
  first); the Lantern Squad week 50–60 s; busy-week fits 60 s only by cutting Medium accents, never
  High.
- **Regression:** all slice 0–2 checks, including the 4× full-play leak check.
- **HG-3a:** in `npm run dev`, Lantern Squad → Billing statement redesign → Statement summary panel,
  and Comet Crew → Unified quote ledger, at 1× and 4×; plus the stills `test-results/slice3a-*.png`.

## Slice 3b — Perspectives
**Read:** 05 §§5–7, 06 §§5–8.

**Build:**
- Continuous playback across every scene.
- Sector-scale glyphs and `sectorPulse`.
- Follow mode: follow, suspend, resume, unfollow, and the out-of-scope note.
- Reduced motion.
- Visual polish on stage transitions.
- The frame-the-action camera (Z): pan or zoom out only when a High beat's objects are off-screen,
  never zoom in on its own. F follows (with follow mode).

**Checks:**
- **AC-20 (E)** Navigating galaxy → sector → Feature → body while playing keeps the playhead
  advancing. Each entered scene shows its current state with no accent replay.
- **AC-23 (E, U)** Follow mode tells the captain's story end to end (revised 2026-10-04):
  - One click follows a captain.
  - The schedule becomes their story: fewer beats, and History with their intro line.
  - The camera travels with their work between Feature systems and keeps the ship on screen.
  - A manual pan suspends following and shows Resume Follow; resuming recenters without replaying.
  - An anchor outside the scope shows the note.
  - Unfollow restores everyone's story.
  - Unit: the story holds others' changes to their work and leaves out unrelated work; its schedule
    is shorter; each anchor names its Feature.
- **AC-24 (E)** = VC-5.
- **HG-3.**

## Slice 4 — ADO ingestion via fake transport
**Read:** [04](04-ado-ingestion.md) in full, 02 §§2–6, 03 §§1–4, 6, 8, 9.

**Build:**
- The `CredentialStore` (Keychain and memory versions) and the PAT entry UI.
- The ADO client with a `Transport` interface, in two versions:
  - `HttpTransport`, with the allowlist, throttling, and backoff.
  - `FakeAdoTransport`, which serves `toAdoPayloads(scenario)`.
- The capability probe and its UI.
- SQLite migrations.
- Discovery, hydration, history, PRs, and the unlinked reconcile.
- Deriving links and events.
- `history.load` in ADO mode.
- Projects and pinning, the area tree, favorites, and the Epic chooser.
- The fixture / ADO mode switch.

**Checks:**
- **AC-25 (E)** A canary PAT string entered in the UI never appears in log files, the SQLite DB,
  IPC traffic other than `setPat`, or renderer state after submit.
- **AC-26 (U)** The probe matrix tells apart 401 (expired), 403 (denied, with the Basic-license
  hint), 404, 429, and empty results.
- **AC-27 (G)** For every scenario, `ingest(toAdoPayloads(s))` produces the same bundle as
  `toHistory(s)`.
- **AC-28 (U)** Two overlapping syncs produce identical event keys and counts.
- **AC-29 (U)** Update `revisedDate` is never used as an event time. A relation-only update takes
  its time from the matching revision; without one, it's undated.
- **AC-32 (U, E)** Favorites persist per project. A favorite whose area no longer resolves shows as
  unavailable and can be repaired or removed.
- **AC-33 (E)** Cache size and path are shown, and Purge recreates an empty DB.

## Slice H1 — The pluggable hierarchy (decided 2026-10-07)
**Read:** 03 §5, §5a; 06 §3.

**Build:** with no change in behaviour:
- The scene levels under the galaxy become a chain: layouts (field, system, radar) fed by
  per-level sources, with the scene key codec, the builder, and the Backlog chain.
- Playback, follow, highlights, and the director walk the hierarchy.
- The breadcrumb becomes a pure model.
- Data sources sit behind `ChartSource`, described by `SourceCaps`.

**Checks:**
- **H1-1 (G)** Every scene of every scope projects byte-identically (`tests/golden/scenes.test.ts`).
- **H1-2 (U)** Every Backlog scene key round-trips, and the codec reads canonical keys that contain
  colons.
- **H1-3 (U)** A toy chain with other levels projects, walks, and builds its breadcrumb.
- **H1-4 (E)** The full e2e suite passes, with its pixel baselines unchanged.

**Human gate H1:** the user reviews the refactor before the Sprints paradigm (slice H2) is built on it.

## Slice H2 — The Sprints view (decided 2026-10-07)
**Read:** 02 §2 (Two hierarchies), INV-05 (Pods); 03 §5a–5b; 04 §5b; 06 §3; 09 (Pods).

**Build:** sprints at every layer:
- The iteration tree, `System.IterationPath`, and `wi_iteration_changed`.
- The fake ADO and DSL: `.iteration`, `moveIteration`, and the `sprint-pods` scenario.
- The sprint scope and its full sync; the cache migration.
- The `SPRINTS` chain, and the Sprints | Backlog switch (Sprints the default, remembered).
- The Inspector's sprint list and pod panel; the probe's Iterations row.

**Checks:**
- **H2-1 (G)** AC-27 for every sprint scope: ingest through the fake ADO ≡ `toHistory`.
- **H2-2 (U)** On `sprint-pods`: pods as stars; a mid-sprint Bug arrives, and a Story leaves for the
  next sprint; the carry-over shows in both sprints; slots hold across seeks; the pod star's ladder;
  following travels to the pod (`tests/unit/sprints.test.ts`).
- **H2-3 (E)** Fixture mode walks sprint → pod → story, the sprint is the clock, the ▾ switches sprints,
  and the switch is remembered. ADO mode picks pods, then the current sprint loads whole
  (`tests/e2e/sprints.spec.ts`).
- **HG-H2:** the user opens Sprints on the real org (pass or fail, and what reads well).

## Slice H3 — Time to first look (decided 2026-10-08)
**Read:** 02 INV-10 (Removed items leave); 03 §5c; 04 §5b; 05 §5 (Arrive and Depart); 06 §3 (the
loading plate).

**Build:**
- The request scheduler; the sprint stream (the look, fill, and idle stages); `sync.focus` and `scope.updated`.
- `IN`-list cache reads, and pictures fetched only for the scope's people.
- The loading plate, "Filling in", and the player's "Gathering history".
- Arrive and Depart in `GraphScene`, used by playback's emerge and rekey.
- Removed items leave the scene.
- **Playback is the scene's own** (decided 2026-10-08): leaving a scene pauses, following stays in the
  scene, and a streaming sprint fetches history only for the scene on screen and what's under it.
- **The + crumb:** add projects and Area Paths from the breadcrumb, remove them from its ▾ menus, and
  add from search. A sprint changes in place.

**Checks:**
- **H3-1 (U)** The scheduler orders, coalesces and cancels. A sprint's look takes at most 3 calls. AC-27
  holds for every sprint once streamed. A reopen fetches no history. (`tests/unit/stream.test.ts`)
- **H3-2 (E)** With the fake slowed to 150 ms per call, the plate shows, the sprint opens while
  history streams, the player gathers then readies, and a pod opens with its planets
  (`tests/e2e/sprints.spec.ts`). A Rejected Bug departs and a seek back restores it with no motion
  (`tests/e2e/motions.spec.ts`).
- **H3-3 (U, E)** In a pod, only its items get history; back at the sprint, the rest arrives
  (`stream.test.ts`). Moving while playing pauses (AC-20, revised). Following stays in its Feature
  system (AC-23, revised). Adding Quasar Pod with + gives the open sprint a third star that Arrives;
  removing it from the ▾ menu makes it Depart (`sprints.spec.ts`).
- **HG-H3:** the user opens SwiftTerm's sprint on the real org and reports pass or fail, plus the dev
  log's `stream-look` and `stream-fill` times.

## Slice H4 — Playback in the scene (decided 2026-10-08)
**Read:** 02 (ever in the sprint); 03 §5c; 04 §5b; 05 §2–3.

**Build:**
- Bound the sprint's scope: the closure walks out from its roots only, once per set of roots, with a
  member cap. A failed closure doesn't claim to be filled.
- A scene plays its own events: real `sceneKeys` at every level (captains included), an indexed
  `subtreeKeys`, a memoised `sceneEntityKeys`, and the filter on by default. H becomes the big moments.
- Every scene opens at its end state, and the play button says it rewinds.
- Complete coverage below the scene: ever-semantics in `inScene`, PRs and their votes and pictures at
  `fill`, and a PR that docks before its item's history lands.
- One `EVER` query for everything ever in the sprint, with the daily samples as a backstop.

**Checks:**
- **H4-1 (U)** The streamed scope's members equal the full sync's, before and after focus changes.
  The `EVER` query takes one call and finds the moved Story; a 400 falls back to sampling; a leaver
  materialises under a pod focus; a PR docks with no item history (`tests/unit/stream.test.ts`).
- **H4-2 (U)** A pod plays only its own events, a pod's are part of its sprint's, filtering only
  drops beats, and state is still the whole scope's (`tests/unit/sceneplay.test.ts`).
- **H4-3 (E)** Each scene opens at its end with ↻, a pod's ruler has no out-of-view ticks, and Play
  starts from the beginning (`tests/e2e/sprints.spec.ts`).
- **HG-H4:** the user plays their sprint on the real org. The dev log should show
  `stream-done.members` within about 2× the sprint's item count, no `stream-capped`, and total calls
  down roughly an order of magnitude from 11,691. Pass or fail only.

## Slice 5 — Live hardening and incremental refresh
**Read:** 04 §§5–6, 5a.

**Already built ahead of this slice (decided 2026-10-07):** loading by level (04 §5a). That covers
current state first, Load more, history on request with Go further back, and quiet catch-up for
scenes played before (`tests/e2e/explore.spec.ts`, `tests/unit/levels.test.ts`). Incremental
refresh below builds on it. AC-31 (offline from cache) still applies.

**And by H3 and H4 (2026-10-08):** cancellation (the scheduler drops work not yet started, and Esc
cancels a load), partial-coverage notes (the sampling note, `SCOPE_CAPPED_NOTE`), and incremental
updates to the renderer (`scope.updated`, 03 §5c). What remains below is offline mode, the stale
badges, the last-sync header, the overlap rescan, and the two live checks.

**Deferred to just after this slice (decided 2026-10-09):** move **Backlog** off `loadLevel` and onto
H3's streaming engine, so both views share one loader. Sprints streams today; Backlog still asks for
history with a button. Doing it after this slice means moving it once, onto the finished loader.

**Build:**
- Incremental refresh with the overlap rescan.
- Cancellation.
- Offline mode and stale badges.
- Partial-coverage banners.
- The last-sync header.
- Profiling of SQLite size and frame time.

**Checks:**
- **AC-30 (U)** A 429 with `Retry-After` is honored. Cancelling mid-sync keeps committed
  checkpoints, and the next sync resumes from them.
- **AC-31 (E)** With the transport offline, the cached history loads and the header shows the last
  sync time.
- **AC-34 (M)** The user runs the probe against the real org and reports only the pass/fail matrix,
  including the timestamp-rule row. No work data is shared. If a row fails, fix 04 first, then the
  code.
- **AC-35 (M)** The user syncs a real Area Path and confirms the Feature → Story → Task → PR → repo
  trace matches ADO for 2 or 3 items they know well.

## Slice 6 — UX polish
**Read:** [91](91-ux-polish.md) in full; 05 §§5–6, 06 §§3–5, 09 as each item needs.

Comes after slice 5, once the app runs on real data. Many UX questions only get enough evidence for
a decision with real team sizes, real weeks, and real PR volume. **91 is the backlog:** every
deferred UX decision is recorded there with what's built today and what would settle it, and new
ones go there too.

**Removed items** (deferred here on 2026-10-07) were brought forward and built in slice H3.
See 91, Removed items.

**Added here on 2026-10-09: pictures you add by hand.** The user's PAT can't read teammates' pictures, so
captains show initials. Design a way to load a teammate's picture by hand and keep it indefinitely
(outside the cache, so Purge doesn't lose it), which will also mean designing the app's first settings
surface. Not before this slice. See 91, Pictures you add by hand. **Built in this slice (2026-10-09)**
as an Inspector card; the settings surface stays open.

**Build:** decide each item in 91 with the user, in review order:
- Some become changes (with their own checks).
- Some are confirmed as built (noted in 91 as settled).
- Some move to [90](90-later.md).

**Checks:**
- Each change gets a check alongside it, in the same style as the earlier slices (U, E, or M).
- **HG-6:** the user reviews a real week at 1×, in following and in everyone's view, and signs off.

## Slice 7 — Logging, errors, and missing data (built 2026-10-10)
**Read:** 04 §§5–6, 02 §3 ("Inaccessible"), `src/shared/contracts/neterror.ts`.

Added 2026-10-07, after the first syncs of a real org. Today some failures are handled quietly to keep
the chart usable, and the ideal handling is still open. Decide with the user, then build:
- **Missing data.** A PR linked from a work item that can't be read now (abandoned and gone, a deleted
  or forbidden repo, TF401019) is left out of the bundle, with its links, and nothing says so. The
  unlinked-PR search skips repos outside the scope's project, and any repo or PR that answers 403/404.
  Options to weigh: keep the last known facts with a stale badge (02 §3), a quiet "N items couldn't be
  read" note with the list, retry on the next sync.
- **Logging.** Start from the dev log built 2026-10-07 (03 §10: redacted, the last 3 runs, developer
  runs only). Decide whether a production build needs its own (opt-in) version of it. Originally: a local, rotating diagnostic log (endpoint family, status, ADO code, timings; never
  headers, tokens, or work data, INV-17/18) the user can open or attach when reporting a problem.
- **Errors.** Every failure already carries `NetError` details (status, meaning, request, ADO's code
  and message, attempts, throttling, the literal response) in an expandable Details panel. Decide
  which failures stop a sync, which degrade it to partial, and how each is retried.
- **Recovering.** Resuming a failed sync from its checkpoints (slice 5's cancellation work), and
  repairing a cache that holds facts for items that no longer exist.

**Deferred here from the hierarchy slices (decided 2026-10-09), once H1–H4 closed:**
- **Sprint coverage we know we don't gather (from H2 and H4).** Each is a gap in what the chart can
  see, so each belongs with the missing-data decisions above:
  - **Teams on different cadences.** Only the project's iteration tree is read, not each team's own
    sprint list, so pods that run their own sprints share one list. Weigh reading per-team iterations
    against the extra calls, and what the Sprints chooser should then show.
  - **Iteration paths are matched exactly.** A sprint's *child* iterations aren't gathered into it, so
    work parked in `Sprint 41\Hardening` is outside Sprint 41. Weigh `UNDER` against exact match, and
    what that does to `inSprint` and the `EVER` query (04 §5b).
  - **A body that left both the sprint and its pod's Area Path** is found only by the daily `ASOF`
    samples, at `idle`, because `EVER` has no `UNDER` form. Weigh a second `EVER` query per pod
    against leaving it to the samples.
- **Two cosmetic leftovers from H3 and H4:**
  - The **gallery** has no Arrive/Depart row, so those two motions can't be reviewed there (06 §8).
  - **"Filling in · N to go"** counts the queue, not N of M: main doesn't know the total up front.
    Either estimate it from the scope's member count or leave the wording as it is.

**Decided with the user (2026-10-10):**
- **Missing data:** last known + stale + note.
- **Logging:** an opt-in diagnostic log in packaged builds.
- **Errors:** tiered (04 §6).
- **Cache repair:** a 404 on a rescan.
- **Sprint coverage:** child iterations (`UNDER`), a second `EVER` per pod, and per-team cadences.
- **Moved to [90](90-later.md):** the gallery's Arrive/Depart row and "N of M", which weren't chosen.

**Checks:**
- **Unit (`tests/unit/slice7.test.ts`, `devlog.test.ts`):**
  - `failureTier`.
  - Retries (502 then 200; dropped connections; exhausted → `gone`; a 400 never retried).
  - A forbidden PR seen before is kept, stale and listed, then cleared when it answers.
  - A PR never seen is only listed.
  - `mergeMissing`.
  - A rescan 404 forgets the item; a 403 keeps it.
  - The Hardening Story is in Sprint 7.
  - The per-pod `EVER` finds the double leaver.
  - AC-27 on `sprint-gaps`.
  - Team matching (`podsBySprint`, ambiguity).
  - The opt-in rule.
- **e2e:**
  - `slice7.spec.ts`: the coverage panel lists a forbidden PR; each team's sprint opens with its own
    pod; the Hardening Story is on its pod.
  - `diagnostics.spec.ts`: off by default, on at once, redacted, and off again at once.
- **Human:** the user re-runs AC-34 (the probe now has a Team settings row) and AC-35, pass or fail
  only.
