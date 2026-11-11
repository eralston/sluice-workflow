# v1.3 close-out audit: Blocks C, D and E · Verdict: fix needed

**Scope:** 23 §3 items C1–C11, D1–D6, E1–E8. Code read from `git diff 7fa80f2..HEAD -- src tests fixtures docs gallery scripts`
(sluice/ and .claude/ ignored), with every C, D and E slice note. This audit is a cross-item pass under the slice process.
It is not a sluice tranche run, so nothing goes to a ledger. The items' own adversarial reviews and fix rounds are taken as
settled and are not repeated here. **No code or docs were edited.**

**Checks run (2026-10-29, while another process ran the full e2e suite):**
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 1398 passed and 13 failed, in 9 files. All 13 failures are `Test timed out in 5000ms`, not assertion
  failures. Re-run alone with `--testTimeout=120000`, those 9 files pass (317 tests): `board`, `boardColumns`, `feed`,
  `frontierStations`, `maneuvers`, `refresh`, `stationSlotsInvariant`, `stream` and `vacantWorld`. See finding 13.
- I did not run e2e, drive or gallery, as instructed.

## Findings

### Blocker
None.

### Major

**1. The normative docs still state the slot rules that C6 and C9 replaced.**
- *Where:* `docs/02-domain-rules.md:222-225` (INV-14 says each attachment takes "the lowest compound slot free over its
  open interval and keeps it (interval first-fit)"). `docs/03-contracts.md:968-969` says "a visit made only while Off
  opens no seat and no slot". Also stale: `docs/08-layout-solver.md:343` ("Compounds. Interval first-fit in open-time
  order") and `docs/14-architecture.md:598-599` ("a visit made only while Off opens no slot", left in front of C9's
  new "unless" clause).
- *Code:* `src/shared/engine/solar/compound.ts:55` `attachmentSegments` does online first-fit with promotion: a PR
  waiting in "+N" gets a second segment in the first slot that frees. `src/shared/engine/solar/slots.ts:56-84`
  `rosters` now gives a ghost reseated while Off a slot at its new seat (`ghostSpans`).
- *Failure scenario:* a v1.4 planner or reviewer reads INV-14 as the contract. They "fix" promotion back to interval
  first-fit, which brings back `pr=1|pm=0` with a "+1" beside a free slot (the R9 bug C6's review closed). Or they reject
  C9's ghost slot because it breaks 03 §5d. The C6 note says "02 unchanged", so the departure was never called out, as
  CLAUDE.md requires for 02 and 03.
- *Fix:* amend INV-14's compound bullet to match 14 §4's *Compound slots* row (first-fit at open; a waiting PR is
  promoted into the first slot that frees; a drawn tender never changes slot). Amend 03 §5d's `visitsOf` bullet and
  14 §4 to say that a reseat made while Off to a seat already on the board takes a slot there (23 C9). Correct 08 §7's
  *Compounds* line. Record the departure in the C6 note or in the close-out commit message.

**2. Purge loses the Azure CLI sign-in flag and "who you are", although 04 §8 says Purge keeps the connection.**
- *Where:* `src/main/ado/service.ts:785-797` (`purge()` deletes the DB and restores only `org_url` and `org_key`). The
  meta keys added in E4 and E5 live in that same DB and are read at `service.ts:113-114` (`me_key`, `me_name`) and
  `:149` (`auth_az`).
- *Failure scenario:* a user signs in with the Azure CLI and has no saved PAT. In Settings › Connection they click
  Purge, then quit. On the next launch `resumeAz` finds no `auth_az`, so the app opens in ADO mode with no token and asks
  them to sign in again. The user's E-Q1 answer kept the quiet resume to avoid exactly that. In the same session,
  `auth.status().me` turns null at once, so *Your captain* stops asking "Is this you?". If they do have a saved PAT, the
  app quietly falls back to it, and `method` reads `pat` on the next launch. 04 §8 says Purge "keeps the token (its own
  store), the connection, `settings.json`…".
- *Fix:* in `purge()`, carry `auth_az`, `me_key` and `me_name` over as `org_url` and `org_key` are (or keep them outside
  the DB). Add them to 03 §9's `meta` key comment (`docs/03-contracts.md:1845` lists only `schema_version`,
  `derivation_version`, `derived_pending`, `org_key`, `org_url`). Add a unit test: purge, then `status().me`, and a
  `resumeAz` flag that is still set.

### Minor

**3. A resumed Azure CLI token that the org refuses still wins over a saved PAT.**
- *Where:* `src/main/ado/service.ts:154-162` (`doResumeAz`): on a 401 from `connectionData` it only clears `me`. The
  session stays active, and `AzOverlayStore.get()` (`src/main/credentials/store.ts`) returns the az token ahead of the
  PAT.
- *Failure scenario:* the user once signed in with `az` and also keeps a PAT for org X. Later they `az login` as an
  account with no access to X. On relaunch the resume gets a token, every call returns 401, and after one refetch the
  app shows the dead-token notice. Their working PAT is shadowed until they find *Sign out of Azure CLI*.
- *Fix:* when the resume's `connectionData` returns 401, stop the session (`az.session.stop()`) and clear `auth_az`, so
  the saved PAT or the sign-in prompt takes over. Unit-test it beside `azSignin.test.ts`.

**4. The Azure CLI resume runs only for a launch in ADO mode, not when the user switches to ADO.**
- *Where:* `src/main/index.ts:232` (`if (mode === 'ado') service.resumeAz()`). `mode.set` (`index.ts:327`, the `CH.modeSet`
  handler) and `Connect.tsx:140` `switchMode` never call it.
- *Failure scenario:* the user last connected with `az`, and the saved mode is Fixture. They switch to ADO in the
  Connection tab. `auth_az` is still `1`, but nothing asks `az`, so they are asked to sign in (or fall back to a saved
  PAT) until the next launch.
- *Fix:* call `service.resumeAz()` from the mode handler when `m === 'ado'` and no az session is active. The IPC gate
  already makes ADO channels wait for `ready()`.

**5. E3 remembers the developer view through one of its two switches only.**
- *Where:* `src/renderer/src/settings/views.ts:30-31` saves `devParadigm`. The title-bar Sprints/Backlog switch
  (`src/renderer/src/App.tsx:301-303`, shown in any v0 view) calls `nav.setParadigm` and saves nothing.
- *Failure scenario:* the user picks Sprints with Settings' toggle, then Backlog from the title bar, then quits. The next
  launch opens Sprints.
- *Fix:* save `devParadigm` in one place, `nav.setParadigm` (or the IPC `paradigm.set` handler), so both switches
  agree. Then drop the main process cache's dead `paradigm` write (`index.ts:321`, the `CH.paradigmSet` handler), which
  03 §5b and 14 §7 call "written, no longer read".

**6. 14 §7 still says the developer toggle lasts "for the run only".**
- *Where:* `docs/14-architecture.md:734-739` says "otherwise the paradigm is `solar`" and "for the run only". E3 updated
  03 §5b, 13 §7 and Q9, but not 14.
- *Failure scenario:* a reader of 14 expects a v0 view to reset at launch. It doesn't: `index.ts` reads
  `userSettings().get().devParadigm`.
- *Fix:* say that `UserSettings.devParadigm` is read when nothing pins a view, with a pointer to 03 §5b.

**7. 03 §10 is missing four new launch variables and three new test hooks.**
- *Where:* the launch-variable table (`docs/03-contracts.md:2016-2030`, "Update when: a launch variable is added")
  lacks `STAR_CHART_CAPTAIN_FILE` (E2), `STAR_CHART_FAKE_ME` (E4), `STAR_CHART_TEST_AZ_DIR` (E5) and
  `STAR_CHART_TOUR_OFFER` (E7). Gaps from before C–E: `PICK_DIR`, `PODS`, `FEED_THRESHOLD`, `WINDOW_SIZE`. The hooks
  block (`:1927-1990`, "Update when: a hook is added") lacks `setAtlasAsteroids()` and `atlasStats()` (C7) and
  `captainPreview()` (E1). Its `viewTints` line still says "root tint", but C3's seats report through
  `AssetView.lightShare`.
- *Failure scenario:* `STAR_CHART_TEST_AZ_DIR` is the one way a test reaches a fake `az` (the INV-17 seam). A v1.4
  spec author working from 03 cannot find it, and may put a real `az` on the PATH instead.
- *Fix:* add the four rows (each marked test-only and unpackaged-only, as `testMode` now is) and the three hooks. Run
  the table's own Source command (`grep -o 'STAR_CHART_[A-Z_]*' src/main`) to catch the older gaps.

**8. 06's tour section describes the placement and hold from before E7's fix round.**
- *Where:* `docs/06-visual-brief.md:1336-1339` says the plate "takes the first `holoCandidates` place that fits… on the
  side away from the chart's centre" and holds "the moment the object is on screen". As built
  (`src/renderer/src/tour/Tour.tsx`, `obstacles` and `candidatesFor`), fix 6 picks the candidate that covers the least
  (chrome 100, the ringed object 50, objects 5, labels 3). Fix 2 holds only after drawn alpha reaches 0.95 and
  `SETTLE_MS` (900 ms) more of play.
- *Fix:* replace the two sentences with the cost rule and the alpha and settle hold.

**9. The 15-reference rule is applied two ways: C added rows for its new timings, E did not.**
- *Where:* C3 and C10 put their new constants in 15 (`VACANT_FADE_MS`, `ENERGY_*`), guarded by `docTables`. E added
  named timing and size values with no 15 row: `TOUR_WAIT_MS` 25 s, `SETTLE_MS` 900 ms and `SEEN_ALPHA` 0.95
  (`tour/tourRun.ts:17-21`); the drop notice's 6 s (`panels/dropNoteStore.ts:10`, a bare literal); Azure CLI
  `REFRESH_MARGIN_MS` 5 min, `MIN_REFRESH_MS` 60 s, `REFETCH_GAP_MS` 20 s and `AZ_TIMEOUT_MS` 15 s
  (`main/credentials/azCli.ts:9-19`, described only in 04 §1a prose); `CAPTAIN_FILE_MAX_BYTES` 4096
  (`shared/captainFile.ts:10`). CLAUDE.md says "Values live in docs/15-reference.md … timings".
- *Failure scenario:* someone retunes the az refresh or the tour wait, and nothing fails to say 04 or 06 is now wrong.
  This is how 06 already drifted (finding 8).
- *Fix:* add a 15 §10 group (Onboarding and sign-in) for these rows and name the 6 s literal. Or record in 23 that UI
  and IO timings outside the chart stay out of 15 by decision.

**10. C6 and C9 changed the layout rules without bumping `SOLAR_LAYOUT_VERSION`.**
- *Where:* `src/shared/engine/solar/version.ts:1-5` ("Bump SOLAR_LAYOUT_VERSION with any change … to the rules in this
  folder") and 02 INV-14 ("any change bumps"). C6 changed `compound.ts`, and `solar.plan.json` gained a segment; C9
  changed `slots.ts`. The version stays 9.
- *Failure scenario:* the plan memo is in memory and keyed on the version, so nothing breaks today. But the version
  stops dating the layout, and a future persisted plan or plan-keyed cache would serve C5-era plans.
- *Fix:* bump to 10 with a comment for C6 promotion and the C9 ghost slot, and regenerate the plan golden. Or state in
  version.ts that a change which leaves existing plans identical needs no bump (C9's case), and bump for C6.

**11. The tour's step titles name the metaphor only (R12).**
- *Where:* `src/renderer/src/theme/starChart/readCopy.ts:22-30`. The titles are `cap(c.noun(...))` ("Asteroid", "Hive
  ship", "Station"). Bodies open metaphor-first ("An asteroid is a User Story").
- *Failure scenario:* R12 says the ADO identity comes first and the metaphor beside it, the same on every surface. The
  tour is the first surface a new user sees, and it teaches the reverse order.
- *Fix:* title each step `s.noun(...) · c.noun(...)` (e.g. "User Story · asteroid"), with the metaphor in lower
  contrast as the plates do, or record the tour as a deliberate R12 exception in 13 §7. The "How to read" paragraph E6
  moved over unchanged has the same order; decide both together.

**12. While the Azure CLI is signed in, the dev log's guard no longer screens the saved PAT.**
- *Where:* `src/main/index.ts:82-83`. The guard adds `creds?.get().slice(0, 8)`. With az active, `get()` is the az
  token, whose first 8 characters are the generic JWT header `eyJ0eXAi`, and the stored PAT's prefix is not added
  (`AzOverlayStore.stored()` is never read here). 02 INV-17 says the dev log drops "any line holding its start".
- *Failure scenario:* this is defence in depth only, since nothing is known to log the PAT. But the second net INV-17
  promises is off for the PAT whenever az is in use.
- *Fix:* add both `stored()?.slice(0, 8)` and the az token's prefix to the guard terms.

**13. C and D's new fixture sweeps keep vitest's 5 s default and time out under load.**
- *Where:* `tests/unit/vacantWorld.test.ts:159`, `stationSlotsInvariant.test.ts`, `frontierStations.test.ts`, and
  `maneuvers.test.ts` (*All events* on Halcyon) each sweep every fixture at dozens of playheads. Under a concurrent
  e2e run they and five older heavy files timed out (above). They pass alone.
- *Failure scenario:* from v1.4, `npm test` is the sluice's gate for every builder and fixer (`.claude/sluice/config.json`
  `gate`). A gate run beside another agent's e2e goes red for reasons outside the item.
- *Fix:* give the sweep tests an explicit timeout (e.g. `it(..., 60_000)`), or sample fewer playheads in the unit
  suite and keep the full sweep in a slower spec.

### Nits
- `docs/progress/slice-1.3-C1-C10.md:12` says `objective` "1.1 → 0.99". The code, 15 §8, 06 §9 and the note's own
  table say 1.04.
- `tests/drive/steps/c11-labels.ts` is missing from tests/README's drive-step table. The other C steps are listed.
- `insigniaLog` (`chart/fx/commands.ts`) and `previewCensus` are test-hook data kept in production modules. Both are
  bounded and harmless; consider gating them on `env.testMode`.

## Checked and fine (not findings)
- **C3 × C6 × D1:** `vc=1` and `pm=` are computed from the playhead's state, not the schedule. `setAllEvents` rebuilds
  at the same source time, so no stage string changes. `buildScene` and `buildBeatSchedule` handle
  `budgetMs: Infinity`: `schedule.ts:217-285` only compares against it.
- **C3 × C9:** a ghost at its new seat is `knownOff`, so `vacant` ignores it, matching `seatReason` (guarded by
  `vacantWorld.test.ts`). `boardFacts`' ghost pass draws only from first-pass seats, so no seat opens for a ghost.
- **D3 × C9:** pacing and the scene share `boardFacts`, so the ghost reseat is the same in both.
- **C4 × C2:** `StationView` passes `setPower(1 - level)`. `DreadnoughtView.setStage` re-finds the lights and re-tints
  after a per-slot `dock` act (C6), so a standby station stays dim through a stage change.
- **C7 × the Pixi lens:** `AtlasAsteroidView.destroy` uses `{ children: true }` without textures, so the shared sheet
  survives a remount.
- **E7 × E3:** `tourAvailable()` needs Solar, so a remembered v0 view gets no offer and does not use up `tourOffered`.
- **E7 × E5:** `mode.set(…, { transient: true })` is never saved, so a quit mid-tour boots into the saved mode and runs
  `resumeAz`. The az session is in main's memory and outlives the tour's reboot.
- **E8:** `will-navigate` (`isOwnPage`) and the window-level `dragover`/`drop` claim cover a drop before the chart
  mounts and one off the chart. Pictures stay local (INV-21).
- **INV-17, E5:** the token is not in IPC, SQLite or files (the e2e checks every file under userData and the DB for
  the canary). It is `execFile` with no shell and fixed arguments. Tests reach `az` only through
  `STAR_CHART_TEST_AZ_DIR`, and only when `testMode` (now `!app.isPackaged`) is on.
- **INV-18:** `STAR_CHART_FAKE_ME` names a scenario handle. The captain file holds only faction, hull and colourway.
- **INV-21:** E4 reads `connectionData` only, E5 reads only, and the tour runs on fixtures.
- **15 tables:** every value C1, C3, C4 and C10 changed has its row (`docTables` passes). 06 §9 and 09 match the aura
  weights (1.25 / 1.04 / 1).

## Handoff paragraph for C–E
Blocks C–E (built 2026-10-28, signed at HG-C, HG-D and HG-E on 2026-10-29) finished v1.3's scene, playback and
onboarding backlog:
- **C:** measured outline contrast with a dark keyline (red stays under 3:1 on a lit face, accepted); Quasar's standby
  in play; vacated homeworlds dim (`vc=1`); the art owns `setPower` and an `emitter` anchor; per-slot tenders (`pm=`,
  `ds=`, promotion so "+N" never sits beside a free slot); a dev-flag asteroid atlas; the frontier push-out clears
  stations; a ghost reseated while Off takes a slot on a seat already on the board; softer loading energy.
- **D:** an `All events` chip (no budget, session only); insignia on the beat's start; one facts core for pacing and
  the scene; Todo and CRM regions play, count and speak their own chrome words; whole-quarter CRM ranges.
- **E:** a live ship preview; captain export and import; the remembered developer view; "Is this you?" from
  `connectionData`; Azure CLI sign-in (memory-only Bearer token, hourly refresh, a quiet resume at launch); theme-owned
  reading copy; a seven-step Comet Pod tour (offered once, fixture-only, transient mode); dropping a picture on a ship.

Open from the close-out audit (`slice-1.3-audit-C-E.md`): amend 02 INV-14 and 03 §5d for C6 and C9, and keep the az flag
and `me` through Purge.
