# Review E5a, round 1 · Verdict: fix needed

1. Blocker: the unit test for "every close is a volley or its short form" can never fail. It keeps only the plays whose id is a close rule, then asserts that their id isn't `agent.progress`. It never checks that no close is missing, which the packet asked for.
   Evidence: `tests/unit/director.test.ts:41-44`: `const closes = out.filter(({ m }) => CLOSE_IDS.includes(m.id)); for (const { m } of closes) expect(m.id).not.toBe(RULE.agentProgress);`. The code itself is right. A reviewer probe compared each pod's undirected plan (`direct: false`) with its directed plan, and every close still plays as its close rule: Comet 2/2, Nova 9/9, Quasar 25/25, Pulsar 21/21, Convoy 11/11, Harbor 11/11. Their variants are `beamed`, `beamed-short`, `short`, `arc` and plain, and none is a progress beam. The fix is to the test only. For each pod, collect the `objective.accomplish`/`threat.accomplish` plays of the undirected schedule's played beats (`scheduleOf(..., { direct: false })` and `planOf`). Then assert that each one is in the directed plan under the same `eventKey|id`, in a full, `beamed`, `arc` or `*short` variant.
   Acceptance line or rule: acceptance line 1 ("Unit tests: … every close is a volley or its short form"); packet Checks ("none is a progress beam, and none is missing").

2. Minor: the gate's drive step doesn't show the forms. So the three stills for the human gate (`work/E5/e5a-*.png`) show a paused pod with nothing playing.
   Evidence: `docs/progress/v1.4/work/E5/e5a-progress-act.png` has no beam, no note and no crew. The builder's own record says so. `tests/drive/steps/e5-director.ts` calls `play()` after a seek and picks beats by the ledger's UTCs. Its header doesn't say to run it with `--paradigm solar`, and without that the app opens in Backlog or Sprints, where Quasar's schedule isn't the solar one (362 beats, 791.8 s). A seek followed by `stepBeat()` (as `solar-play`'s `stepInto` does) does play the beat. The reviewer's step `work/E5a/review-stills.ts` (run with `--paradigm solar`) shot three stills:
   - `review-1-progress-act.png`: 15 Sep 16:03, Ulla Kowalczyk's half-weight beam at Ulla Prime, note "PR #20360 · Show host digests — Merged".
   - `review-1-short-link-echo.png`: 14 Sep 22:17, a short Power link, its crew named, the station charging.
   - `review-1-beamed-close-act.png`: 15 Sep 16:31, a beamed strike, the station's phaser on the Bug.

   The fixer should fix the step: solar paradigm, seek then `stepBeat`, and beats found in the app (as `work/E5a/review-scan.ts` does), not by ledger index. Then re-shoot, including a still known to be the day's climax.
   Acceptance line or rule: packet Checks, "Stills for the gate".

3. Minor: three docs promise that E5b will play Task updates as progress beams. The packet puts that out of scope, and E5b is montage and adaptive speed.
   Evidence:
   - `docs/05-playback.md:715`: "Task updates still do not play it (27 E5b)."
   - `docs/13-game-design.md:692`: "a Task update will too (E5b)".
   - `docs/15-reference.md:825`: "a Task update will (E5b)".

   The packet's Out of scope says: "Task updates as progress beams (U6 named them; the item's Decided names merges only)." The three lines should say that Task updates don't trigger it, and drop the E5b promise.
   Acceptance line or rule: Out of scope; docs must match the code and plan (the lens on docs that no longer match).

4. Minor: the monotony test is fragile. Its moment list drops progress beams (`m.protect`) and follows plan order, not episode order. Take a full merge, then a progress beam, then a full merge on one day. The director rightly leaves that full (P-21 compares with the previous *played* rule), but the test would `expect.fail` on it. It passes today only because the `short` lever flattens Quasar and Pulsar, and the smaller pods don't hit the pattern. E5b and E5c will move these forms.
   Evidence: `tests/unit/director.test.ts:56-66` (`moments = out.filter(({ m }) => m.protect && !m.arc?.merge)`). Compare `src/shared/engine/director.ts` step e, `played(today[i - 1]) === m.rule`. The builder's record notes that the check is weak.
   Acceptance line or rule: packet Checks (the monotony check).

5. Nit: two comments still say only the gallery plays the progress beam.
   Evidence:
   - `src/shared/engine/pace.ts:583`: "No move triggers it: the director (27 E5) chooses it. Until then only the gallery plays it."
   - `src/renderer/src/theme/starChart/maneuvers/progressBeam.ts:5-6`: "No move triggers it until the director (27 E5) chooses it; until then only the gallery plays it."

6. Nit: the packet asked for the `agent.progress` note in 05 §8.4(b) to become an M-30 row. M-30 is already taken (Sortie parking, `docs/05-playback.md:597`), so the builder rewrote the note as prose. That was reasonable, but the record's deviations don't mention it.

Not findings (checked and fine; the fixer shouldn't touch them):
- Typecheck and lint are clean. The mapped units plus the goldens pass: 23 files, 364 tests. No existing golden moved; only `director.json` is new.
- E2E `solar-dense gallery-assets`: 24 passed. The History-agreement case passed: "History and the scene explain the same events: at most four labels, each note its History row's action", solar-dense.spec.ts:295, 25.5 s. `e2e:keystone`: 43 passed.
- The effect on the busy pods (engine): every directed form is played. Quasar plays 33 of 33 progress beams and 48 of 48 short forms, with 10 of 10 climaxes flagged in the plan. Pulsar plays 8 of 8 beams, 40 of 40 short forms and 8 of 8 climaxes. A progress beam's beat is non-essential, but none was cut.
- In the app (solar, Quasar): merges that don't close play as a 3.1 s named beam with a "— Merged" note (see the still). The `beamed-short` strike fires its station (the `startsWith('beamed')` fix works).
- Short arc merges keep the arc impact inside the echo: the short echo is 1800 ms, against `ARC_IMPACT_MS` 1300. The short Power link's act still covers `LINK_MS`.
- The `pace.ts` form constants, the new `maneuvers.test` case (all five rules and both beamed variants), and the gallery's short cells are fine.
- Ledger: the E1 to E4d Built rows are unchanged (they run `direct: false`), and E5a has 6 rows. Comet 61,845 → 61,845 ms (0%). Summary Target and Levers: Quasar 507.5 s over, Pulsar 262.4 s over, with `short`. That is expected for E5a, and line 2 belongs to E5b and E5c.
- Perf, a warm schedule build on the explicit path, median of 7, same run: Quasar 132 → 141 ms (1.06×), Pulsar 93 → 101 ms (1.08×).
- 03, 05 §8.5c (P-20 to P-23), 15 §7 and §10 (the `DIRECTOR_TARGET_MS` row, which docTables guards) and the tests/README map are updated. 03 is normative, and the builder recorded the change.
- Observation, outside this item: the pacing ledger's Quasar schedule isn't the one the solar app plays. The app has 198 beats and 763.1 s. The ledger has 807.5 s, and its 15 Sep 16:31 strike runs 7.3 s against the app's 5.9 s. So the ledger's per-beat forms and climaxes (and the director golden) describe the ledger's scene, not exactly what the app shows. This was probably there before E5a; it's worth a look at the block audit.
