# Review B3, round 1 · Verdict: pass

1. Nit: the new `AsteroidView.setAuraFlare` sits between `contact()`'s JSDoc and `contact()`. That leaves the "Arriving (2026-10-13) …" doc block stranded above the new method's own doc.
   Evidence: `src/renderer/src/chart/art/asteroids.ts:885-893` (two `/** */` blocks stacked, then `setAuraFlare`, then `contact()` with no doc).
   Acceptance line or rule: none (readability).
2. Nit: the `AURA_BALANCE` comment still gives red's and blue's contrast as 4.7:1 and 4.9:1. B3's drive replaced those numbers in 15 §8 and 06 with 5.3 and 5.3.
   Evidence: `src/renderer/src/chart/art/aura.ts:65-66` against `docs/15-reference.md` §8 (Deadly red `2.3 → 5.3`, Opportunity blue `3.9 → 5.3`) and `docs/06-visual-brief.md:1200`.
   Acceptance line or rule: none. The comment reads as 23 C1's history, so it's only a mismatch.
3. Nit: in the §8 contrast table, gold's planet-face column now reads `4.9 → 6.2`, and its pixel count drops from 156 to 76. Gold dimmed (weight 1 → 0.68), so the arrow suggests a rise that the weight change can't have caused. It's sampling, which the paragraph under the table admits for the night-sky column only.
   Evidence: `docs/15-reference.md` §8, the Victory gold row; build-1.json, the drive detail.
   Acceptance line or rule: none (the record is honest that this is one run).

Not findings (checked and fine; the fixer shouldn't touch these):
- Acceptance 1: `auraContrast` asserts that nominal resting gold is within 10% of red and of blue, and that gold at `AURA_FLARE_WEIGHT` is above both. PINNED is updated. `npm test`: 96 files, 1423 passed.
- Acceptance 2: I re-ran `npm run e2e:spec -- gallery-assets` and got 4 of 4 passed, including the new victory test (43 s) with `errors` = []. I viewed the threat and seat stills (flare, settled, reduced) and objective reduced. The objective flare and settled stills were already seen by the builder.
- The arc variants, which the builder didn't check. My throwaway probe (scratchpad; it sampled the `flare` hook over loops) found every close variant flaring and settling smoothly to 0 in about 1.4–1.6 s: objective.accomplish (peak 0.94), objective.accomplish:arc (0.94), threat.accomplish (0.95), threat.accomplish:arc (0.95), threat.accomplish:beamed (0.94), seat.complete (0.94), with no console errors. `flareNow` counts gold only, so the arc strike's `breakup` act doesn't take the aura off gold while it flares. In the still, the gold ring is plainly visible: `review-1-threat-arc-flare.png`, plus `review-1-objective-arc-flare.png`.
- Timers that could cut the flare short: the adapter's `ACT_S` (3 s) rest from a `breakup` act, and GraphScene's `EVENT_LOOP_S` rest. With the strike run's act phases (1200 and 2600 ms, breakup at 0 and at 0.62 of the act), each fires at least 1.8 s after the land, after the 1.6 s flare. The probe's smooth series agrees.
- INV-15 and lifecycle: a seek goes through `landAllStages` → `act('rest')` → `rest` → `clearOverlay` → `end` → `setAuraFlare(0)`. `destroy` clears the overlay before `art.destroy()`. The atlas view re-applies the flare in `toProcedural`. The new registries test covers null acts and `end` on rest and expiry.
- Reduced motion: `victory` reads `motion.reduced`, which the demos set around both the tick and the dispatch (maneuverDemos.ts:376-389), and which the app sets in motion.ts. `reducedFlarePeak` is 0 in the spec.
- The outline-flare gallery cell: it mounts with no errors. Gold-ring pixel brightness, measured from cell screenshots, rises in a periodic pulse about every 4 s and falls back. Stills: `review-1-outline-flare-peak.png`, `review-1-outline-flare-rest.png`.
- Frame budget: no new filter or pass, only two matrix writes per flaring gold aura per frame, so no perf run is needed.
- Docs: 15 §2, §6 (role outlines), §8 (both aura rows, contrast table), §10 (the new budgets row), 09 :118 and :237, 06 :1195-1201 and 05 M-25 all match the code. docTables passes. Rewriting the red and blue contrast rows from the same drive run is a deviation, and the build record declares it.
- Out of scope respected: red on the planet face, the keyline, `RIM_ALPHA`, `AuraReading` and the hooks contract are untouched. Only gold flares, and only from the three victory choreographies.
