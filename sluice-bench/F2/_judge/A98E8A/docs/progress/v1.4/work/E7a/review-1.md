# Review E7a, round 1 · Verdict: pass

1. Minor — The count the user reads is tested nowhere. The on-board count that keeps the note true (R9) lives only in the interpreter's `noteSweep`. `sweep.test` Check 7 tests a different string: the note built from the plan's `m.sweep.counts`.
   Evidence: on Harbor, the plan's sweep has 17 subjects with counts `{"objective":12,"threat":5}`, so the test's note reads "12 User Stories · 5 Bugs created in Sprint 13" (probe below). The app shows "11 User Stories · 5 Bugs created in Sprint 13" (`work/E7/e7-sweep-mid-act.png`, the drive notes). `tests/unit/sweep.test.ts` ("the note names the count and the sprint") asserts that the numbers sum to `cast.subject.length` (17). No unit or e2e test checks `interpreter.ts` `noteSweep` (lines ~758-771): if it fell back to `m.sweep.counts`, the star would say 17 over 16 revealed pieces, and every check would still pass. Related: the plan's `sweep.counts` and `sweepPhases(17)` include 20141, which isn't drawn. That's 110 ms of extra act (act 2870 ms vs 2760 ms), and it contradicts 03's gloss "`counts` the pieces swept, by role".
   Acceptance line or rule: R9 (the drawn count is the true count) is only guarded by hand. Fragile, not broken.
2. Minor — The packet's gate stills ask for "one gallery still of the Sector sweep cell". It isn't in `work/E7/`, and the build record says so ("No gallery still of the Sector sweep cell is saved").
   Evidence: `ls docs/progress/v1.4/work/E7/` holds only the four drive stills. The cell's run and clear are covered by `gallery-assets` (it passed on re-run), so this is a missing input for the human gate, not a failed acceptance.
   Acceptance line or rule: Packet, Checks, "Stills for the gate (E7a)".
3. Nit — Check 4 tolerates the stray piece by pod label (`<= (Harbor ? 1 : 0)`) rather than naming `20141`. It also confirms the piece is present at the round's end. Naming the key would stop the allowance from quietly covering a different missing piece later.
   Evidence: `tests/unit/sweep.test.ts`, Check 4, the `missing.length` assertion.

## On the points the orchestrator asked about

**(1) 17 planned, 16 drawn (20141).** This doesn't break R9 or the acceptance.
- **Where it comes from.** The gap is upstream and predates E7. Without the sweep rule, the same beat (Harbor beat 1, 2026-09-28T16:00Z) already planned a `piece.appear` for 20141, which isn't on the board. Beat 4 plans an `objective.underway` on it, also off the board. Both are in probe output p1, with and without the rule.
- **The board.** The knownThen board just before the beat holds 1 objective. At `sourceUtc` it holds 12 objectives and 5 threats (probe p2). So the beat draws 16 new pieces: 11 Stories and 5 Bugs.
- **What the user sees.** The star's note says "11 User Stories · 5 Bugs created". The inspector's count after the beat says "12 User Stories · 5 Bugs" (one Story was already there). The drive shows 16 of 16 revealed, between +572 and +2221 ms. On screen, then, the sweep reveals exactly the beat's drawn creations, and the note's count matches what is drawn.
- **The seek.** `sweep.test` Check 4 holds: the graph at the beat's start and at end-1 deep-equals `graphAt(sourceUtc)`, and none of the swept pieces is there just before. The seek-end still matches the act-end still.
- **What's left** is the plan-level counts (finding 1). Fixing 20141 itself belongs in pace facts, not in E7a.

**(2) The four moved tests.** All four were loosened legitimately.
- **The crowd test (`maneuvers.test`).** The packet named it as meant to move. It now asserts one `region.sweep` at 0 with the members in order. It keeps the old assertion (4 quiet plays at 0) under the rules minus the sweep.
- **The "every rule fits" sum.** Leaving the sweep out of the sum (48455 > 47250 with it) comes with a new assertion: the sweep's span is under `CROWD_MIN` × `piece.appear`'s span. That states why it is safe.
- **`gallery-assets`.** It is tighter: 17 → 18 rules, and it now requires `region.sweep`.
- **`solar-dense`.** The tier check lets a noted star stay at `sky`, and still requires `door` for a noted piece. `raisedTier` returns the plate's own tier when it is raised, and the star's own tier is `sky` (15 §6, the `SOLAR_PLATES.*.star.label` rows), so a raised star correctly stays at sky.

**(3) 03 normative change.** 03 now has the 17 rule ids and the E7a block (`RULE.regionSweep`, `sweepPhases`, `PlannedManeuver.sweep`, `BaseMoment.swept`, `sweepNote`). The build record calls it out under `deviations` ("03 (normative) changed; call it out in the block note"). No `block-E.md` exists yet, so the orchestrator must carry that line into the block note.

**(4) E1–E6 frozen.**
- `git diff 71e98cc -- docs/progress/v1.4/pacing-built.json` removes no lines and only adds the six E7 rows.
- `pacingBuilt` passes: E1–E5 match `BEFORE_VOLLEYS`, and the committed JSON is current.
- The C2 candidates change only the E7 assumption text.
- In `pacing-ledger.json`, the hunks all fall at or after line 1056 (Convoy Planning starts at 1056, Harbor at 1300).
- In `director.json`, only Convoy's and Harbor's `estimateMs` moved.

Not findings:
- **Sequencer and director.** The sweep is placed at 0, and the hold-back covers swept subjects only (seats are captains, not pieces, as the packet's "shares a swept piece" says). Limelight and turns skip it, `swept` feeds `touches`, and the `played` set includes the members.
- **Docs.** The 05 M-32 and P-12 rows, 13 §6 and 15 §7/§8/§9/§10 rows, and the tests/README row match the code.
- **Rendering.** The `Sweep` fx uses Pixi v8 calls (`ellipse().stroke({...})`, `blendMode = 'add'`) and destroys only its own Graphics, so there's no shared-resource teardown. The star's note sits at T4 Sky and is legible in the stills.
- **Purity.** `src/shared/` stays pure: `events.ts` only adds `countsLine`.
- **Halcyon.** Its pods are untouched (Check 2; Comet 61 845 ms).
- **Gallery fallback.** The gallery's second pass (rules without the sweep, for rules the first pass never showed) keeps `threat.emerge`'s cell. Variant demos are unaffected: only accomplish and merge have variants, and creations don't touch them.

Probes (scratch, not committed): `/private/tmp/claude-501/-Users-amorgan-Code-star-chart/2ccdb46d-3f3d-4c1f-bb6c-ddd82da8a67e/scratchpad/probe/p1.ts` (plans with and without the sweep, and 20141's presence on the board), `p2.ts` (Harbor's board counts across beat 1).
