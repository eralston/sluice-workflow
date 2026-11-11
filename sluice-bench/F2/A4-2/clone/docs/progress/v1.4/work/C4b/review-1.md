# Review C4b, round 1 · Verdict: pass
1. Nit — `src/renderer/src/profile.ts` line 3 still says "Nothing reads it yet (v1.4 C4a)"; `playback.ts` `scheduleFor` now reads `activeProfile().pacing`.
   Evidence: `src/renderer/src/profile.ts:3` vs `src/renderer/src/playback.ts:106-110`.
   Acceptance line or rule: none (comment drift only; C4c will touch the file).
2. Nit — The packet's check "Pulsar's phone schedule is shorter or cuts more" is unreachable: Pulsar plays 702 s and 282 beats at any budget. The builder said so, asserted the effect on orbit-week instead, and logged it in the scope doc's Decisions. That is a sound deviation. C4c's `profile.spec` must not use Pulsar for its beats comparison.
Not findings:
- Acceptance "no pacing budget remains a separate constant": `grep BUDGET_MS|HIGHLIGHT_BUDGET_MS` over src, scripts, tests and config leaves only two "was BUDGET_MS" comments in `contracts/profile.ts`. `MAX_ACTIVE_FX` and `VSYNC_TOLERANCE_MS` are C4c's.
- Desktop reproduces today exactly: the goldens (schedule, scenes, seek) and `docTables` pass unchanged in value (the diff to `tests/golden/schedule.test.ts` only swaps the constant imports). The committed `pacing-ledger.*` and `pacing-candidates.json` are unmodified in git status.
- Seek and play (INV-15): `scheduleFor` is the only renderer site that builds a schedule; seek, step and play all run on the `PlaybackClock` built from it, so the budget is one input fixed at build time. `solar-dense` "a seek draws exactly what playing drew" and the "a seek while a guest waits" spec (both INV-15), `slice2`, `slice3a` and `slice3b` pass. `allEvents` still gets `Infinity`; `buildScene`'s `budgetMs ?` truthiness accepts `Infinity`. The hook spread in `buildScene` and `buildHighlights` comes before the budget, so the profile budget wins.
- `buildBeatSchedule` with no options equals one given the desktop budget (new unit test). The gallery's `maneuverDemos.ts` calls `buildScene` with no budget, so it keeps desktop numbers.
- `scripts/pacing.ts --profile` writes suffixed files, so the committed ledger can't be overwritten. An unknown id exits 1.
- Docs: 03 §ScheduleOptions, 05 (§3 step 7, B-7, B-10, B-18, X-1), 06 and the 15 §10 and §11 rows are retargeted and match the code. `docTables` passes.
