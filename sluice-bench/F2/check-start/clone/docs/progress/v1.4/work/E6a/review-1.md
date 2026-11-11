# Review E6a, round 1 · Verdict: pass

1. Minor — With every lever on, Quasar plays 1.9 s longer. It is now 3.6 s over the soft 300 s cap, up from 1.8 s. The cause is that volley carriers win P-22's daily climax, and a climax beat plays at 1×.
   Evidence: `pacing-built.json` E6+ Quasar: 301 760 → 303 640 ms. Probe `rv-quasar.ts` (scratchpad), Quasar default levers:
   - total x drops 511 740 → 499 780 ms;
   - the x in climax beats, which play at 1×, rises 82 080 → 97 800 ms;
   - k stays at the 2× ceiling.

   Four of Quasar's six volleys are now climaxes (fused beats 45, 93, 299, 325, 7.2–15.1 s each). Three closes lose their climax to them (golden `director.json`: 10405, 10406 and 10428 are out; 20302, 20323 and 20347 are in). Pulsar does the same with two carriers (20724, 20760), but there speed still re-fits (k 1.45 → 1.4). This follows P-22 as written (the union cast has the most people). It is reported honestly in build-1's limitations, but no doc records it. 05 P-22/M-31 and 27's decision log still say Quasar is 1.8 s over.
   Acceptance line or rule: none broken. "The ledger shows the saving" holds (row E6: Quasar −18.7 s, Pulsar −7.4 s), and the packet's yardsticks hold (Pulsar 293.5 s ≤ 300 s, Comet 61 845 ms). This one is for the orchestrator or the final check: accept it, or keep carriers from out-ranking a close for the climax.
2. Minor — The new 15 §7 paragraph gets the short-form numbers wrong. It says "under the short form (act at 720, disperse at 3600) a pair's echo grows by 2200 ms". The code has disperse at 3780 and a stretch of 2020 ms.
   Evidence: `volleyPhases(shortForm(merge).phases, <two turns>)` (scratchpad `rv-fused.ts`) gives echo 1800 → 3820 and disperse 3780 → 5800. `LINK` (`pace.ts:389`) × `SHORT_PACE` 0.6 gives tell 180, gather 540, act 960, land 300, echo 1800. `docs/15-reference.md` §7, the "A volley (27 E6a…)" paragraph.
   Acceptance line or rule: project notes, *Values*: 15 must match the code. `docTables.test.ts` doesn't check prose.
3. Nit — The built window sweep (10/20/30/60 s) is recorded only in `build-1.json`. The packet said E6a "records the table". The 15 §10 row quotes only Pulsar's counts. 27's 2026-11-01 row still carries the planner's Quasar figures (8, 14, 14, 16 of 66), but the built code gives 12 at every window. The record also lacks each pod's x total and k, which the packet's Ledger check asked for.
4. Nit — `pacingBuilt.test.ts`'s new "E1 to E5 … unchanged" case compares against the working-tree `pacing-built.json`. Once that file is regenerated, the check passes no matter what changed. I checked it against 3d4e402 instead: all 48 E1–E5 rows are identical.

Not findings:
- **perf.spec's seek check is red at the start commit too, in the same session.** I ran a clean copy of 3d4e402 (`git archive`, scratchpad `base/`) and the working tree, alternating:

  | Run | Seek max |
  |---|---|
  | base | 311.5 ms |
  | now | 279.3 ms |
  | now | 285.1 ms |
  | base | 277.7 ms |

  All four fail the < 250 ms check. Play 1×/4× p95 and the cuts gain are the same on both builds: 25.0/25.1–25.3 ms, cuts on 9.5–10.3 ms. E5b's 175 ms isn't reproducible on this machine today, so E6a doesn't cause the red.
- The warm schedule build, same session, base vs now: Quasar 131.6 → 146 ms (×1.11), Pulsar 95 → 107.5 ms (×1.13).
- INV-15 on the fused beats themselves (drive probe `rv-drive-fused.ts`): every fused volley beat in Pulsar (4) and Quasar (6) plays in the real app with no stage drift, and a seek to the same x draws the same.
- No other golden moved. The `director.json` diff only changes forms (`joined`), estimates, tempo and climaxes, as described above.
- `montage-names.spec.ts`: the swap is right. 2026-09-24T19:58Z now heads a volley, and carriers never fold to montage.
- The guard's stricter reading (every non-member base draft, not only moments) is a recorded deviation, and it errs safe. The B-21 numbering is justified, since B-20 is taken.
- 03 (normative) matches the signatures in code. 05 B-21/M-31/P-20/P-24, both 15 §10 rows, and tests/README are present.
- There are no banned words in the added `src/shared/engine` lines, and `src/shared/` stays pure.
