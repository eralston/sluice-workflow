# Review E5b, round 1 · Verdict: pass

1. Minor — 05's definition of the clock no longer matches the code: schedule time now moves by wall × rate × tempo, but 05 §1 still says "Each frame advances it by `elapsedWallMs × rate`", and B-19's safeguard ("a frame is at most 100 ms of wall time, 400 ms at 4×, … so no frame can cross two") no longer holds. At 4× with tempo 2, one frame can be up to 800 ms of x. `PlaybackClock.pace()` and the new meaning of `remainingMs` (wall time, tempo counted) are also missing from 03, where the clock's API sits (03 ~1731).
   Evidence: `docs/05-playback.md:18-19`, `docs/05-playback.md:672` (B-19); `src/shared/playback/clock.ts:35,41,105` (`pace()`, `remainingMs`, `advance` using `pace()`). The only text that names the tempo is P-25 (`05:779`).
   Acceptance line or rule: project notes, "docs that no longer match the code"; 05 §1 is the clock's own definition. B-19's built multi-crossing path still covers the case, so this is a doc fix only.

2. Minor — The human gate gets no still of a montage moment, though the packet's Checks ask for one ("E5b adds a montage moment"). The montage is the one visible change in E5b: one plate, one note, no crew named. No e2e spec exercises it either: `solar-dense` runs on Convoy Planning Pod, which pulls no levers. The builder's reason ("the app exposes no rule ids") is weak. `e5-director.ts` already finds its short Power link by fixture time. The ledger's montage beat at 2026-09-14T22:17Z, which is that same beat, is found in the app the same way: my probe found it as app beat 15, showing one note ("PR #20313 · … — Merged") and no acting captain at +500, +1100 and +1700 ms.
   Evidence: `tests/drive/steps/e5-director.ts` is unchanged since cf09a5b; `docs/progress/v1.4/work/E5/` has no `e5b-*.png`; `build-1.json` deviations[0]. Probe: scratchpad `review-e5b-drive.ts`, run with `--paradigm solar`.
   Acceptance line or rule: packet Checks, "Stills for the gate".

3. Nit — The determinism check and the director golden leave out `tempo`. `dirJson` in `director.test.ts` serialises forms, climaxes, levers and the estimate, and `director.json` has no k. The estimate depends on k, so k is pinned only indirectly.
   Evidence: `tests/unit/director.test.ts:24-26`; `tests/golden/__golden__/director.json`.

4. Nit — `advance` reads the tempo once, at the frame's start, so a frame that crosses from a sped beat into a climax beat runs the climax's first ≤ 100 × rate × (k − 1) ms of x at k. That is invisible at 60 fps.
   Evidence: `src/shared/playback/clock.ts:105`.

5. Nit — `build-1.json` doesn't follow formats.md: `verdict` "built-gate-lint-blocked-outside-item", `checks` as an object rather than `[{cmd, pass, detail}]`, and no `role`, `model_tier` or `files`.

**For the orchestrator (not a finding against this build).** Acceptance line 2 (Pulsar inside 300 s) is not met after E5b: Pulsar plays 321.6 s, 21.6 s over. The speed lever is at its ceiling (k = 2 on every non-climax beat; climax runs hold 77.4 s of x at 1×), so no E5b lever can do more. The packet's E5c steps ("while the estimate is still over the target after `speed`", then k is recomputed) expect this. The Checks line "E5b and E5c: Pulsar's now total is ≤ 300 000 ms" therefore has no E5b assertion in `pacingBuilt.test.ts`; it has to land with E5c. Also: the montage lever saves almost no time. Short plus montage against short alone is 807.5 → 802.8 s on Quasar (4.6 s) and 562.4 → 562.4 s on Pulsar (0 s; 6 montage moments, each the same length as its short form). Its value is visual, not length, so E5c carries Pulsar's 21.6 s.

Not findings (checked, fine; the fixer shouldn't touch these):
- **Gate:** typecheck and lint pass (the E5a probe files are gone), and `npm test` passes: 105 files, 1578 tests.
- **Mapped e2e:** `solar solar-play solar-dense gallery-assets` gave 43 passed and 1 failed: `solar.spec.ts:24`, a click timeout ("element is not stable") opening Halcyon Reach. A re-run of `solar.spec.ts` alone passed 15/15. `e2e:keystone` passed 43.
- **History-agreement case** (`solar-dense.spec.ts:295`, acceptance 3): passed (25.4 s).
- **Perf, relative, same machine** (start commit built separately in the scratchpad), before → after:
  - rest p95 17.3 → 16.9 ms; 1× 25 → 25; 4× 25.1 → 25.6.
  - seek p95 276.4 (the known red, failing) → 175.2 (passing).
  - Painted-chart and cuts tests pass both times.
- **Warm schedule build, interleaved runs, medians:** Quasar 140.6 / 142.4 → 143.2 / 144.4 ms (×1.01–1.02); Pulsar 99.7 / 101.0 → 103.4 / 103.1 ms (×1.02–1.04).
- **Adaptive speed in the real app** (Quasar Pod, drive probe):
  - x moves 2.00× wall at four points (beats 16, 57, 95 and 139), and Δx / Δremaining = 2.00, so the clock and `remainingMs` agree.
  - At x = 0 the app shows totalMs 759 580 and remainingMs 433 720. The ruler and seeks read x (`tempo.test.ts`).
- **Ledger:** Comet 61 845 → 61 845 ms (unchanged, inside 5%). Pulsar 562.4 → 321.6 s and Quasar 807.5 → 448.1 s, each with levers short, montage and speed. The committed `pacing-ledger.md` and `pacing-built.json` match a fresh run (pacingBuilt passes, and the Summary rows match my probe).
- **Line 1 under montage:** every merge author still has a volley, since a montage merge is still an `attachment.merge` play. A probe on Quasar and Pulsar found no captain whose only plays are montage or quiet; every captain is named somewhere.
- **The estimate bounds `wallMs` on all six pods:** Quasar 451.8 ≥ 448.2 s, Pulsar 324.0 ≥ 321.6 s.
- **Tempo beat indices:** the director's indices are the schedule's `Beat.index` (both index `drafts`). Climax beats have no tempo entry, and `tempoAt` is 1 on them.
- **Montage drafts:** short phases, `durMs = spanMs`, `releaseOf` and `crewHoldMs` like a quiet turn, `attends` 1. `plate` comes from `NOTED`, which equals the interpreter's `LABELLED`, so the plate can light. Montages are protected and never quiet, and limelight sees no people on them.
- **Docs:** 15 §10 TEMPO_MAX row (docTables passes); 05 P-23 to P-25; 03 `Direction.tempo`, `PlannedManeuver.plate`, `BeatSchedule.wallMs`, `tempoAt` and `wallAt`, `PacingOptions.levers`; `tests/README.md` maps `tempo`.
- **Golden:** only `director.json` moved, and only on Quasar and Pulsar (levers, estimate, form counts). The climax keys did not change.
