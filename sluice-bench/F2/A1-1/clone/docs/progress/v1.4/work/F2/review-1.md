# Review F2, round 1 · Verdict: pass

Every acceptance line is met. The jump-in gallery cell passes in full and reduced motion with no console errors
(the new gallery-assets test, re-run here). `summonPass.test.ts` covers no hold through the spot, the blip at the
act's instant (delay 0), and enter 1915 / release 3035. The 15 §7 row reads 1915 and `docTables.test.ts` passes. The
only golden that moved is `director.json`, and build-1.json names it. The ledger's Built section has F2 and F2+ rows
for all seven pods. The scope doc's 2026-11-09 orchestrator row covers the negative F2+ Pulsar saving, so I treated it
as decided. Nothing below breaks acceptance.

1. Minor: the solar-dense 22 B9 guard "parked while named" no longer guards anything. Episodes are now split by
   movement (`moved >= 12` is a "ride"), so a non-summon turn whose ship drifts while named would count as a ride. The
   test would then only check it for > 1000 ms and stay green.
   Evidence: tests/e2e/solar-dense.spec.ts 457–467. `whole` is filtered on `e.moved < 12`, then
   `expect(Math.max(...whole.map((e) => e.moved))).toBeLessThan(12)` asserts the same filter, so it can never fail.
   A fix: tell summons apart by what they are, not by how they move. For example, match the captain plate's
   `.holo__note` `data-event-key` to the pod's `facility.enter` events, or expose the playing rule.
   Acceptance line or rule: it breaks no acceptance line. It weakens an existing regression guard (22 B9), so it
   counts as fragile.
2. Minor: the 15 §11 row for `CREW_OPEN_MIN_MS` still says "However short the work, the plate is whole at least this
   long" (1500 ms). A summon's plate is now whole for only 1800 − 520 = 1280 ms.
   Evidence: maneuvers.ts `crewTimes(…, true)` sets closeMs = openMs + NOTE_MIN_MS, and Sortie.crewOpen folds over
   CREW_FOLD_MS at each end. The builder's own solar-dense comment says "1800 - 520 ms". The CREW_HOLD_MS row and 05
   P-7 got the summon exception (docs/15-reference.md 1258, 05 P-7). The CREW_OPEN_MIN_MS row on the next line
   (docs/15-reference.md 1259) did not.
   Acceptance line or rule: the CLAUDE.md rule "values live in 15": a row that no longer matches the code.
3. Minor: when the goal lies roughly in line with the start and the spot, the pass Sortie backs up or nearly stops.
   Evidence: my probe, docs/progress/v1.4/work/F2/probe/collinear.probe.test.ts (run with
   `npx vitest run -c docs/progress/v1.4/work/F2/probe/vitest.probe.config.ts --silent=false`). Results:
   - start (0,0), spot (20,0), goal (400,0): the ship backs 19 px away from the spot, then slows to 2.6 px/s at
     t = 0.425 s.
   - spot (100,0), goal (−200,0): it overshoots the spot, then slows to 3.2 px/s at t = 0.59 s.
   - Out-and-back, the usual case: min speed 12 px/s, but only at arrival. Off-axis goals behind the start are also
     fine.
   The cause: the packet's Hermite tangent has no guard when T̂ = normalize(P2−P0) points against P1−P0, or when
   |m1| > 3·|P1−P0|. These geometries are rare: the start is normally the ship's rest, so P2 ≈ P0. This was built as
   the packet specified. Defer it to F3, which generalizes the pass mover, or add a clamp.
   Acceptance line or rule: the packet's "The ship's speed is above zero everywhere in (0, outS + backS)" holds only
   in the sense that the speed never reaches exactly 0. It nearly stops.
4. Nit: with every lever on, the director now settles Pulsar at tempo 2.0 without the `light` lever, where before it
   ran at tempo 1.1 with 72 light forms. Quasar's App s (story time) went up from 289.6 to 295.7 s. Comet's App s
   went from 45.8 to 45.0 s, now 10.5% under its 50.3 s yardstick (the block-E risk carried to the final check).
   These are director trade-offs, not F2 defects. They're worth raising at the final check.
   Evidence: tests/golden/__golden__/director.json diff; docs/progress/v1.4/pacing-ledger.md Summary.

Not findings (checked, leave alone):
- The blip uses `pointOf(a.at)`, which reads `scene.liveOf`, the drawn position. The interpreter calls each phase
  function at its phase start (interpreter.ts 679–700). So in full motion the blip is at the ship as it passes the
  spot. Under reduced motion the pursue snaps (`reduced: 'snap'`) and the ring plays `same`, so the blip is at the
  ship's place.
- Plate timing is consistent from end to end:
  - showCrew runs 715 → 2515 ms (interpreter.ts 618).
  - The Sortie's crewOpen folds out by 3035.
  - releaseOfPlay is 3035.
  - heldMs is 3035, so the attention budget covers the plate (R14).
- Summons followed by the same captain's next turn (P4): my probe (probe/near.probe.test.ts) finds 1 of 9 on Pulsar
  and 34 of 37 on Meteor. Every one of them is a chain of summons (the next turn is another `facility.enter`). In
  those, the ship goes to its rest and waits until 3035 before the next summon, which shows up as Meteor's 13.4 s
  "queue idle". That is F3 (chains of summons), which the packet puts out of scope.
- `solar-dense` "History and the scene … at most four labels" failed once for me (6 labels). It is flaky before this
  change too. Repeated 15×, it failed 2 times on the F2 tree and 3 times on the start commit 61e4958, using a temporary
  worktree that I have since removed. This is pre-existing and not F2's.
- pacing-built.json only adds the F2 and F2+ rows (126 additions, 0 deletions). pacing-candidates.json is unchanged.
  Re-running `npm run pacing -- --candidates` changes nothing. No schedule, seek, highlights, scenes, plan, round or
  awards golden moved.
- The volley path (maneuvers.ts 573) and crewBusy's non-near branch are untouched, as the packet asks.
