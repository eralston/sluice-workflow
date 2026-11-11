# Packet F2: Summon on the fly
Risk: medium (every pod with a summon moves; the engine's crew timing gains one flag) . Round 2 (round 1 had no packet; its planner probe was reviewed and reworked, then deleted)
Start commit: 61e4958

## Acceptance
- A gallery jump-in cell plays in full and reduced motion with no console errors (`gallery-assets`).
- Unit: the summoner's `pursue` has `pass` and no hold, and the station's act starts within 50 ms of the blip (`commands.test`).
- 15 §7 row (length 1915) and 15 §8 rows; `docTables.test.ts` passes.
- Goldens updated and named below; the ledger shows the saving per pod (rows F2, F2+).

## Approach (probe reviewed)
The probe made three engine edits beyond the rule (`crewBusy`, `heldMs`, `durMs` for passes). Dropped: the maneuver keeps `durMs = max(span, release)`, so nothing else changes and the same captain's next work still waits for the plate to fold. Kept: the `passes` flag (moved to `ManeuverRule`/`PlannedManeuver`, no casts), the held-summon helper for "before" runs.
1. `facility.enter` (pace.ts): phases gather 715 + act 1200 (tell and land go), `passes: true`. 1915 ms, was 2815.
2. `crewTimes(phases, passes)` (maneuvers.ts): open at the act (the blip), closed at open + fold + `NOTE_MIN_MS`, leave one fold later. `releaseOf`, `durMs` and `releaseOfPlay` read it; the plan carries `passes`.
3. `pursue` gains `pass` (commands.ts); `Sortie` flies out ease-in to the spot and on ease-out to its rest over `backS`, with no hold; its plate's `crewOpen` spans `backS`. `backS` = the plate's ride (`releaseOfPlay - act`, 2.84 s), so the plate lives as long as the ship flies. The interpreter's P4 `waitS` is not applied to a pass.
4. `stationJumpIn.ts`: gather = the pass (or the guest); act = the call blip (a ring on the ship, `HERO_GLOW`, the arrival's ring shape) with `act jump`, flare and ring, all at delay 0. The blip is anchored to the ship's live place, so under reduced motion (pursue skipped) it and the arrival play at its place.
5. Ledger: `heldSummon(rules)` (the old phases, no `passes`); every earlier Built row and C2's `NO_SWEEP` use it, so they stay as measured; F2 (undirected) and F2+ (directed) rows on seven pods (`all`).
6. Docs: 13 §6 row and station line, 05 M-13, 15 §7 row, 15 §8 rows (tell/fold/land cut, blip added), 27 F2 note.

## Schedule goldens that change
- `tests/golden/__golden__/director.json`: estimateMs on 6 pods fall by 1.3 to 3.8 s (Comet 53065 to 51785, Nova 188375 to 187095, Quasar 296189 to 296041, Pulsar 294434 to 293358, Convoy 187265 to 183425, Harbor 199565 to 195725); Quasar tempo 1.9 to 1.85, Pulsar 1.1 to 1.05. Nothing else moves (the sprint-pods, solar and meridian goldens are unchanged).
- `docs/progress/v1.4/pacing-ledger.{md,json}` (current-engine lengths), `pacing-built.json` (+F2, F2+ rows); `pacing-candidates.json` unchanged.
- Pinned numbers kept as measured: `sweep.test` Comet 61 845 now runs `heldSummon(PACE_RULES)`.

## Risk
Medium: a summoner's plate and flight now overlap the next work for the same captain only after the plate folds (crew busy to release). The e2e "captain's turn" parked check now exempts a jump-in (needs the `ruleIdsOf` test hook).
