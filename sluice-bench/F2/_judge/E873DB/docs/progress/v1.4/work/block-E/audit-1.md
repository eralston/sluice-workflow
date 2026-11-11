# Audit block-E, round 1 · Verdict: fix needed

Items: E1, E2, E3, E4 (E4a, E4bc, E4d), E5 (E5a, E5b, E5c), E6 (E6a, E6b), E7 (E7a, E7b), E8, E9, E10 · Diff: 552d631..2125401
(the commit before `flow(E1)` to `sluice(E10)`). One Major, three Minors, one Nit. The carried questions are answered in
findings 1 (E10-Q1 and the ledger-vs-app Quasar mismatch) and 2 (E9-Q1). The carried items that are still open are
findings 3 and 4. The flakes are under "Not findings".

1. Major — The pacing ledger, the director's unit tests and golden, and the montage guard's beat list all read the
   **recorded** bundle. The app plays Solar in **story time**, so every block-E number and list built on the ledger
   describes a schedule the app doesn't play. That root cause explains both E10-Q1 and the carried Quasar mismatch.
   Evidence:
   - The app presents a Solar bundle as `storyTime(h, STORY_TZ).history` (`src/renderer/src/v1/story.ts:13-14`,
     `playback.ts:181`). `scripts/pacing-ledger.ts` `resolvePods`/`scheduleOf` pass `toHistory(...)` as recorded, and
     no script or unit test outside `maneuvers.test.ts:806` calls `storyTime`. `director.test.ts:12-20` (`plays`),
     `golden/director`, `pacingBuilt` and `MONTAGE_BEATS` (`tests/e2e/montageBeats.ts`, "found with
     scripts/pacing-ledger's planOf") all inherit this.
   - `probe-storytime.ts` (this folder) builds each pod's schedule both ways. Story time matches the app exactly:
     Quasar has 187 beats and x 462.5 s in both the probe and the app (`probe-app.ts`), and Comet 45.8 s, Nova 171.0 s
     and Pulsar x 308.2 s match the app too (`probe-pods.ts`). Per pod, recorded → story:

     | Pod | Beats | Wall |
     |---|---|---|
     | Comet | 18 → 13 | 60.8 → 45.8 s |
     | Nova | 96 → 50 | 209.3 → 171.0 s |
     | Quasar | 348 → 187 | 299.1 → 289.6 s |
     | Pulsar | 275 → 130 | 288.8 → 288.6 s |
     | Convoy Planning | 36 → 36 | 183.1 → 179.0 s |
     | Harbor | 38 → 39 | 178.3 → 179.8 s |

     At the block's start commit (552d631, a throwaway worktree, since removed) Comet was 67.3 s recorded and 50.3 s
     in story time, so the app's Comet has been about 15 s shorter than the ledger all along.
   - **E10-Q1.** 2026-09-15T19:25Z is work item 10422's state change in the recorded bundle (`probe-ledger-history.ts`).
     In the app's bundle, story time has moved it, along with 18:51Z (10402 is at 20:12:33.603Z there, beside 10434;
     `probe-history.ts`). So the app has no beat there. The app plays 18:59Z, 20:04Z and 20:12:33Z in that hour, and
     the ledger plays 18:59Z and 19:25Z (`probe-quasar.ts`).
   - **The montage guard (E10 acceptance 2) checks the wrong beats.** `probe-montage-story.ts` compares the beats the
     app lights with `MONTAGE_BEATS`:
     - Pulsar: the app lights **no** montage plate, so the guard's 4 Pulsar beats are all ordinary beats. 05 §6 item 4
       already says "Pulsar has no montage".
     - Quasar: the app lights 11. Two of them, 09-16T21:01Z and 09-24T20:19Z, aren't on the list. Four listed beats
       aren't montages in the app: 09-15T16:58, 18:59, 19:25 (absent) and 09-18T18:36.
     - Convoy Planning and Harbor match.

     So the spec's "every pod" passes while guarding none of Pulsar's beats and missing two of Quasar's.
   - **What still holds.** `probe-director-story.test.ts` is `director.test.ts` with the pods in story time, run by
     `probe.vitest.config.ts`. 79 of its 83 cases pass: every merge author's volley, every close a volley or its short
     form, one full-form climax per day, monotony, and volley authorship. The 4 failures are the montage list (Quasar,
     Pulsar), the determinism case (an artefact: its second build isn't story-timed), and E10's "folds some on the
     busy pods" (Pulsar folds none in story time). The goal's targets also hold in the app: Pulsar 288.6 s and Quasar
     289.6 s, both under the 300 s cap.
   - **Time zone.** The ledger reads days in the scenario's zone (`rp.tz`). The app reads them in the viewer's zone
     (`STORY_TZ` and `playback.ts:36`). The two agree only on a machine set to America/Los_Angeles, as this one is.

   Rule: 27 Goal ("Pulsar Pod … plays within a target time set from measured numbers, while Comet Pod keeps its full
   drama") and the final check's "Comet's feel at its new yardstick (~60.8 s)" (handoff). The app will play ~45.8 s,
   so the gate would judge one number against another. Also E5 acceptance 2 (the ledger is the instrument), E10
   acceptance 2 (the guard), and the project lens "the effect where it's meant".
   Fix direction:
   - Present the ledger's bundles as the app does: `storyTime(h, tz).history` in `resolvePods` for Solar pods (all six
     are). The orchestrator decides whether to re-base the frozen E1–E10 Built rows once, recorded as a decision, or
     keep them and add a story-time Summary column.
   - Re-derive `MONTAGE_BEATS` in story time. `montage-names.spec.ts` should fail on an absent beat again.
   - Restate the Comet yardstick for the final check from the app's number.

2. Minor — E9-Q1: the camera hold isn't stuck, and a real gesture does the same thing by design. E9's State line, its
   review and E9-Q1 blame a hold "stuck at Infinity". The real cause is that the drive pressed play inside the hold's
   1.5 s after the double-click, and a directed beat's one attempt is used up while the camera is held.
   Evidence:
   - `probe-e9path.ts` is `e9-camera.ts` with `cameraHeld()` noted at each step (Pulsar → Escape ×2 → Quasar). The
     hold is true at "Quasar Pod pod settled" (t=12193) and "after move" (t=12213), then **false** at "mid-montage"
     (t=13013) and at +3 s. Yet `directedCamera()` reads `shot: null` at mid-montage.
   - The montage beat (15, x 56400) starts 1 ms after the step's seek, so it lands inside the hold.
     `directBeat` sets `directedIndex = beat.index` and calls `chart.directBoard()`, which returns false under
     `cameraHeld()` (`ChartApp.ts:446`) without setting `directed`. Nothing retries that beat (`playback.ts:386-395`).
     `fireShot` likewise clears `pendingShot` before `directClimax` refuses (`playback.ts:374-379`).
   - This follows frame-the-action's pattern (`framedIndex`), and 05 §6 item 1 documents it ("no hold around a
     click"). With real input, a click within 1.5 s before a directed beat drops that beat's shot. After a climax
     shot, the board still comes back at the next beat, since `directedShot()` stays `climax`.
   - The E9 reviewer's probe (c), "a synthetic pointerup and a 1.7 s wait", worked because of the wait.
     `probe-app.ts` shows the hold releasing on its own on every navigation.

   Rule: docs against the record. The 27 E9 State line and E9-Q1 misstate the cause, and `work/E9/e9-montage-board.png`
   doesn't show the pull-back it's meant to show at the gate.
   Fix direction:
   - In `tests/drive/steps/e9-camera.ts`, wait out `CAMERA_HOLD_AFTER_MS` (≥ 1.6 s) after entering a pod and before
     `play()`, and offset the camera before the montage, as `camera-directs.spec.ts` does. Then re-shoot
     `e9-montage-board.png`.
   - Answer E9-Q1 in 27 ("not stuck; documented hold") and correct the E9 State line. No change to `cameraHeld`.

3. Minor (carried from E6b review 1, still open) — The volley e2e's "named ≥ people" check counts every acting captain
   in the fused beat, including other maneuvers' crews, so it can pass with a volley person never named.
   Evidence: `tests/e2e/solar-dense.spec.ts:948` (`named.size … toBeGreaterThanOrEqual(v.people)`) is unchanged since
   E6b. E6b's probe saw 8 distinct captains against 6 people on Pulsar volley 0 (two from PR #20733's Power link).
   Rule: E6 acceptance 2 ("a Pulsar volley names each cause"). It's met, but its guard has slack.
   Fix direction: have `volleys()` return the turns' names (not only the count), and assert that every name is among
   those seen acting.

4. Minor (carried from E5c review 2, still open) — The noted-plate fallback contradicts 06, and 05 confines it to
   montage while the code covers every noted cast plate.
   Evidence:
   - `labels.ts:983` guards on `castOnly > 0 && motion?.notes?.has(node.projectionKey)`, which is every cast piece
     that wears a note in play. The comment at `:980-982` and 05 P-24 justify the fallback "as a flash may cross
     labels".
   - 06 §9 (`docs/06-visual-brief.md:1144`) still says a cast plate "may cross a body but never another label". 06's
     flash rule (`:135-137`) says flashes cross "never another label".
   - 05 P-24 (`docs/05-playback.md:791`) presents the fallback as a montage property. 05 §8.9 A-3 to A-5 don't mention
     it.

   Rule: docs against code (project notes); 06 is the reference the label work is reviewed against.
   Fix direction:
   - Amend 06 §9's sentence to "…never another label, unless it names its event's cause and no clear place exists:
     then where it covers the least".
   - Drop or reword the flash analogy in the code comment and in P-24.
   - Put the rule beside A-3 to A-5 in 05 §8.9, with P-24 pointing to it.

5. Nit — `tests/README.md:59` (the `src/shared/playback/` row) lists `tempo` but not E8's `rising.test.ts`, which
   guards `risingShare`/`risingMs` and the day turns in `schedule.ts`. A change to the tempo curve that follows the
   map would skip that unit file. `npm test` still runs it.

Not findings (checked; leave as is):
- **Flakes (carried).**
  - `solar-dense.spec.ts:295` passed 4 of 4 (`--repeat-each=4`, four workers at once). It didn't reproduce.
  - `devlog.spec.ts:16` passed.
  - `perf.spec.ts`'s soft seek check is red, with max 328.4 ms and p50 136.4 ms against < 250. It was red at E2's base
    (306 ms) and at E6a's base (311.5, 277.7 ms) too, so it predates block E. Keep it on the handoff's known-red list,
    with numbers.
  - The same run: rest p95 18.0, play 1× 33.3 and 4× 33.4 ms, against a budget of 35.4 ms at 60 Hz. The cuts test
    passes (1×: 33.3 → 17.9 ms).
- **Rising tempo and the tight end agree.** `RISING_TIGHT_SHARE` 0.7 with `risingShare(p) = 1.1 − 0.6p` is p ≥ 2/3.
  05 B-23, 05 P-24 and 15 §10 all say so.
- **Adaptive speed reaches the art.** `setMotionRate(clock.pace(), …)` (`playback.ts:250`), so E5b's tempo speeds
  travel as a user rate does. The wall-clock morph under speed is E4a's settled Nit.
- **The volley and sweep fuses compose.** E6a's and E7b's `Direction.fuse` are disjoint, and E7b's review mutated
  every branch. E8's P10 reads `levers.length`, and E10's late montage is no lever (B-23's dense test is unchanged).
- **Docs and tables.** `npx vitest run docTables pacingBuilt director rulebook` passes (5 files, 140 tests).
  `npm run -s lint` and `npm run -s typecheck` are clean with this folder's probes present. The scope doc's E1–E10
  State lines read accepted and match the records, apart from E9's cause (finding 2).
- **Hard rules.** Fixture data only; `src/shared/` stays pure. The working tree is clean apart from this folder. The
  file-mode flip in E10's review isn't present now.
- **Settled by the item reviews, so not repeated here:** E4d's hand-copied short forms, E7a's untested on-board count,
  E7b's "none is empty" case, E8's B-19 wording and `volleysOf`'s flat gap, E9's pan-only Pulsar shot, and the E5a/E5b
  record-format Nits.

Checks run: read every item's packet summary and final review, the E9 fix and E10 build records, and block E's source
and test diffs where findings pointed. The probes are in this folder:
- `probe-quasar.ts`, `probe-ledger-history.ts`, `probe-storytime.ts` and `probe-montage-story.ts` (vite-node);
- `probe-director-story.test.ts` (vitest, its own config);
- `probe-app.ts`, `probe-history.ts`, `probe-e9path.ts` and `probe-pods.ts` (drive, `--paradigm solar`; output in
  `test-results/drive/blockE-*`).

I also ran the start commit's story-time lengths in a throwaway worktree, since removed, and these e2e runs:
`e2e:spec -- devlog perf`, and `solar-dense -g "History and the scene explain" --repeat-each=4`. I didn't run the full
e2e suite or the gallery.
