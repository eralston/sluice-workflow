# Review E4bc, round 1 · Verdict: pass

1. Nit — `play()` now calls `this.views(live, ctx, m)` a second time at every phase start of every maneuver, even when `near` is empty. That's another `scene.targetNodes()` scan per cast key on dense beats.
   Evidence: `src/renderer/src/chart/fx/v1/interpreter.ts`, the `const cast = this.views(live, ctx, m);` before `if (near?.size)` in the phase loop. Guarding it with `near?.size` would remove the extra scan.
   Acceptance line or rule: none (frame-budget lens: it runs per phase, not per frame, so the cost is small).
2. Nit — `workEndOf` (maneuvers.ts) repeats `workEndMs` (commands.ts:122–126) line for line, so there are now two copies of "the work's end".
   Evidence: `src/shared/engine/maneuvers.ts` `workEndOf`; `src/renderer/src/chart/fx/commands.ts:123`.
   Acceptance line or rule: none.
3. Nit — the E4b and E4c candidate assumptions say "this row reads about 0", but the E4c row still reads 23.4 s on Quasar and 16.1 s on Pulsar. The residual sentence explains why (protected pairs, attention), but the first sentence reads wrong next to the number.
   Evidence: `docs/progress/v1.4/pacing-ledger.md:298`, `:361`, `:383`.
   Acceptance line or rule: none (the packet expected residuals and asked for them to be explained).
4. Nit — `build-1.json` departs from formats.md: verdict `built` (should be `done`), `checks` is an object rather than `[{cmd, pass, detail}]`, and it has no `role` or `model_tier`. It gives C2's estimate beside the totals only for Quasar.
   Evidence: `docs/progress/v1.4/work/E4bc/build-1.json`.
   Acceptance line or rule: the item contract's record format (process only).

Not findings:
- **Acceptance 1 is met.** The new sweep (`maneuvers.test.ts`, "overlaps keep acts in order and give no actor two at once") covers every pod of `resolvePods()` with the packet's three dependency tests, and asserts that `pairs > 0`. I re-ran it with the mapped units: 12 files, 229 tests, green. By construction, `nearStartMs` is at least `p.start + workEnd(p)`, and `seamStartMs` keeps `d`'s act at or after `end(p)`, so the invariant holds and is not just untested.
- **The moved unit expectations match the packet.** These are `:276` (the seam, plus the flat case with seams off), `:427` (starts and beat length, plus near off), `:493` (`a2` after `a1`'s release) and `:800` (`leaveMs − gatherAt`, plus near off). The `nearWaits` cases cover: inside the window, beyond it, another captain, light, `turn: false`, a turn before the claim, and a quiet release.
- **Seek and play still agree.** `solarSeek` is green, and so is e2e `solar solar-play solar-dense motions` (42 passed; I re-ran it). `e2e:keystone` gave 43 passed (re-run). `formationBounds` and `formationCorridor` are green. Typecheck and lint are clean. No golden moved.
- **The ledger shows each part per pod.** The E4b and E4c rows in `pacing-built.json` cover all six pods, and `pacingBuilt` checks that the JSON is current. `bindingOf` resolves the anchors in the order end, noteEnd, claim, seam, near, using the exported `seamStartMs` and `nearStartMs`.
- **The effect on the busy pods.** A throwaway probe over `planOf` with each part switched off found:
  - P3 moves no start on any pod.
  - P4 moves no start on Quasar or Pulsar, one on Convoy (400 ms) and two on Harbor (700 ms).
  - In the renderer, `nearWaits` fires 13 times on Quasar (mean 785 ms) and 16 times on Pulsar (mean 575 ms), matching the builder's record.

  The near-zero schedule saving is already decided as E4-Q1 ("Accept as built", 27). It is not a finding here.
- **The renderer's P4 is sound.** It uses the right keys: `near` is keyed by canonical key, and the pursue's `pk` is matched through the cast views' `projectionKey`. Its timing uses the post-carry `startS`, in ms. Under reduced motion it adds no waits (INV-15). While waiting, `crewOpen` still reads `holdS`, so the plate stays shut. The next sortie takes over through `runner.move`, which retires the parked one. Guests are unchanged. No drive or unit test exercises `Sortie`'s `waitS` end to end; the packet asked for neither.
- **The docs match the code:**
  - 03: `PlanOptions.sequence?`, P3 and P4 in Sequencing, the v1.2 field list, and the `shapeOf` and `pacing` signatures.
  - 05 §8.5: P-3, P-4, P-5 and P-7.
  - 13 §4.4.
  - 13 §6 and 15's effect audit: the surge rings are removed with the code (the E4a Minor).
  - 15 §10: the `STAY_NEAR_MS` row, which `docTables` checks.
- **Orchestrator files are outside this review.** The changes to `sluice-state.mjs`, `sluice/` and the `ledger.jsonl` entries are the orchestrator's.
