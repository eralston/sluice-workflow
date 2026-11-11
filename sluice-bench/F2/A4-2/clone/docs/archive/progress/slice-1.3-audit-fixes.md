# v1.3 close-out: fixes for the Blocks C–E audit

Fixes for `slice-1.3-audit-C-E.md` (findings 1–13 and the nits). Slice process, no tranche.

## 1. What was built, by finding

1. **Major, slot rules in the docs.** 02 INV-14's compound bullet now says online first-fit, promotion of a waiting PR, and
   that a drawn tender never changes slot (23 C6). 03 §5d's `visitsOf` bullet and 14 §4's "As built" line carry C9's
   exception (a reseat made while Off to a seat already on the board takes a slot). 08 §7's *Compounds* line is corrected.
2. **Major, Purge.** `AdoService.purge()` carries `auth_az`, `me_key` and `me_name` over, as it does `org_url` and `org_key`.
   03 §9's `meta` comment lists them; 04 §8 says Purge keeps them. Test in `azSignin.test.ts`.
3. **Resume refused by the org.** `doResumeAz` on a 401 now stops the az session and clears `auth_az` (and `me`), so the saved
   PAT or the sign-in prompt takes over. Test beside the others in `azSignin.test.ts`.
4. **Resume on a switch to ADO.** The `modeSet` handler calls `service.resumeAz()` when the mode becomes `ado` and az is
   not the active method (`resumeAz` itself checks the flag).
5. **Both view switches remember.** `nav.setParadigm` saves `devParadigm` (decision: the title-bar switch saves too);
   `chooseView` no longer saves separately. The main cache's dead `paradigm` write is gone, and 03 §5b and 14 §7 say so.
6. **14 §7.** Boot reads `UserSettings.devParadigm` when nothing pins a view; the toggle is no longer "for the run only".
7. **03 §10.** Added `STAR_CHART_PICK_DIR`, `PODS`, `FEED_THRESHOLD`, `WINDOW_SIZE`, `CAPTAIN_FILE`, `FAKE_ME`,
   `TEST_AZ_DIR`, `TOUR_OFFER` (the last three, and CAPTAIN_FILE, marked test-only and unpackaged-only), plus the hooks
   `setAtlasAsteroids`, `atlasStats` and `captainPreview`; the `viewTints` line now names `AssetView.lightShare`.
8. **06 tour section.** Now describes the least-covered-place cost rule (chrome 100, ringed object 50, objects 5, labels 3)
   and the hold at alpha 0.95 plus 900 ms.
9. **15 rows.** Added to §10 (budgets): `TOUR_WAIT_MS`, `SEEN_ALPHA` and `SETTLE_MS`, the drop notice (now the exported
   `DROP_NOTE_MS`, was a bare 6000), `CAPTAIN_FILE_MAX_BYTES`, and the four az timings (marked `unguarded`: `docTables`
   can only resolve renderer and shared files, so they cite `../../main/credentials/azCli.ts`).
10. **Layout version.** `SOLAR_LAYOUT_VERSION` 9 → 10 with a comment (C6 promotion, C9 ghost slot); 15 §5's row follows.
    `solar.plan.json` and `meridian.plan.json` goldens regenerated: the diff is the `"version"` line only (4 lines).
11. **R12 in the tour.** Step titles are the ADO word with the chart word beside it in the `.metaphor` style ("Story ·
    Asteroid"; no alias when the two words are the same). `TourStep` gained an optional `alias`; `Tour.tsx` renders it (one
    line in the title element; the step-reset effect and the spec's anchored wait are untouched). Decided with it: the
    definitional sentences in the tour bodies and in "How to read the chart" now lead with the ADO word ("User Stories are
    asteroids, Bugs are enemy ships"; "Repositories are stations, and the Pull Requests and Pipeline runs around them are
    tender shuttles and point defenses"; "A User Story is drawn as an asteroid"). `readCopy.test.ts` and 13 §7 carry the
    new paragraph.
12. **Dev-log guard.** It screens the saved PAT's first 8 characters (`stored()`) whatever the method, the live token's
    first 8, and, for a live token of 16+ characters, its last 8 (an az token's head is the generic JWT header).
13. **Slow sweeps.** Nine test files that sweep fixtures (`board`, `boardColumns`, `feed`, `frontierStations`, `maneuvers`,
    `refresh`, `stationSlotsInvariant`, `stream`, `vacantWorld`) call `vi.setConfig({ testTimeout: 60_000 })`. The
    global default is unchanged.
- **Nits:** C1–C10 note now says 1.04; `c11-labels.ts` is in tests/README's drive table. **Not done:** gating
  `insigniaLog` and `previewCensus` on `env.testMode` (the audit calls them harmless and optional).

## 2. Contracts changed
Departures from 02 and 03, called out as CLAUDE.md asks: **02 INV-14** (compound slots: first-fit with promotion, was
interval first-fit), **03 §5d** (`visitsOf`: the Off-reseat exception), **03 §5b** (the paradigm setting is neither
written nor read; `devParadigm` is saved by both switches), **03 §9** (`meta` keys), **03 §10** (launch variables, hooks),
**04 §8** (what Purge keeps), **06** (tour), **08 §7**, **13 §7** (paragraph order), **14 §4 and §7**, **15 §5 and §10**.
These record what the code already did, except the new behaviour in 2, 3, 4, 5, 10, 11 and 12.

## 3. Checks
- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 96 files, 1413 tests pass (before the fixes the same run alone had four failures from my own doc and golden
  changes, since fixed). Goldens moved on purpose: `solar.plan.json`, `meridian.plan.json`, the version line only.
- e2e: `az-signin`, `settings`, `tour`, `captain-settings`, `slice4`, `pictures` (24 tests) pass; `npm run e2e:keystone`
  passes (43 tests); the `solar` and `sprints` spec files (45 tests) pass.

## 4. Human gates
None new. Worth a look at HG time: a tour step's title (ADO word, then the quieter chart word).

## 5. Known limitations and open questions
- The e2e suite has no test for the title-bar switch remembering the view (finding 5); the toggle's relaunch test
  (`captain-settings`) still passes through the same `nav.setParadigm`.
- Finding 4 (resume on a mode switch) has no automated test: the mode handler is in main's wiring.
