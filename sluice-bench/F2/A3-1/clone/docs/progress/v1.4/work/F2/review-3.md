# Review F2, round 3 · Verdict: pass
A fresh review of the uncommitted diff against HEAD 61e4958, judged on packet.md's acceptance, 27 F2's Decided text, 02 §1, R1–R14 and the 15 tables. Every acceptance line is met and I found no regression. There are three Minors and two Nits.

1. Minor: the docs say the ship goes on to its next sortie if one is waiting, but the code always flies it to its rest.
   Evidence: 13 §6 (docs/13-game-design.md:685) says "to its next sortie if one is waiting, else its rest", and 05 M-13 (docs/05-playback.md:716) says "carries on to its next sortie or its rest". The code doesn't do that. `Sortie` aims the pass leg at `this.scene.goalOf(this.pk)` (movers.ts:306), and the interpreter's P4 `waitS` is skipped for a pass (interpreter.ts:700). Because `releaseOf` keeps `crewBusy` until leaveMs (3555 ms), the captain's next sortie starts only after the ship has reached its rest. So a summoner with a sortie waiting flies spot → rest → out again. The build record lists this as a deviation from 27 F2's "its next sortie if one is waiting (E4's P4)", and the packet's Approach step 3 chose it.
   Acceptance line or rule: 27 F2 Decided ("carries on to its next place: its next sortie if one is waiting"), and docs that no longer match the code. The acceptance line still holds, because nothing holds between the flight and the next place. Either the docs should drop the "next sortie" clause, or the human gate should accept the deviation.
2. Minor: two 15 §8 effect-audit rows got wrong Beat ms values.
   Evidence: docs/15-reference.md:956. The tell row now reads `585 | cut`, but the tell was 300 ms (the old phases were `['tell', 300]`, heldSummon in scripts/pacing-ledger.ts). The 585 was copied from the beacon row on :958. At :959 the fold ring went from `0 | mutes first` to `600 | cut`. That ring played inside the gather (`repeats(..., gather - 600)`), so on its own it held no schedule time. The land row's 600 is correct. docTables passes because it doesn't check this column against code.
   Acceptance line or rule: 15 is the values authority ("15 §8 rows" in the packet). The table's header says Beat ms is "the schedule time that cue alone holds open".
3. Minor: the `solar-dense` parked-ship check is now weaker for every event that also plans a jump-in.
   Evidence: tests/e2e/solar-dense.spec.ts:457–467 and :475–477. The exemption is keyed on `ruleIdsOf(key).includes('facility.enter')`, so the held turn of a first-station merge or opening is exempt too. The check still requires at least one held episode, and it passed when I re-ran it. The builder disclosed this, and it doesn't break an acceptance line. It does leave a gap in what the test catches.
   Acceptance line or rule: Risk section of the packet. This is test coverage, not behaviour.
4. Nit: the guest path asserts that the facility's position exists, where the old code had a fallback.
   Evidence: stationJumpIn.ts:40 uses `pointOf(f.at)![0]`, and `GraphScene.liveOf` returns null when the node has no entry. The old code fell back to `f.node.world`. `spotOf` keeps that fallback. I found no case where it is null.
5. Nit: under reduced motion, a guest summoner is skipped, so its blip plays at an empty spot.
   Evidence: stationJumpIn.ts:49 falls back to `spotOf(f, [0, 0])` when there is no present agent, and `guest` has `reduced: 'skip'`.

Not findings (checked and found fine, so the fixer shouldn't touch them):
- **Timing:** the blip is a ring with `fixed(a.at)` resolved at make time. The interpreter defers make to the act's `delayMs` (interpreter.ts:872), and `a.at` is the agent's live `scene.liveOf`. So in full motion the blip sits where the ship is as it reaches the spot (outS = gather = 715 ms = the act's atMs).
- **Reduced motion:** `pursue` is `reduced: 'snap'`, which `reducedCall` drops (commands.ts:449), so the blip and the arrival play at the ship's own place.
- **The plate's ride:** crewTimes(pass) opens at 715 ms, closes at 715 + 520 + 1800, and leaves at 3555 ms. Sortie's `backS` equals `releaseOfPlay − act` (2.84 s), and `crewOpen` spans `backS`, so the plate is whole for exactly NOTE_MIN_MS. The 15 §7 row says "1.8 s" and NOTE_MIN_MS is 1800.
- **No hold:** for a pass, `durMs` is still max(span, leave), so the same captain's next work still waits for the fold.
- **Earlier ledger rows:** they stay as measured. The `pacingBuilt` "rows committed before E6" equality passes with heldSummon, and pacing-built.json only gains rows.
- **The director golden:** I checked it line by line, and it matches the packet's list (6 estimates, plus Quasar 1.9→1.85 and Pulsar 1.1→1.05).
- **Hard rules:** fixture data only, no PAT, no ADO writes, `src/shared` stays pure (contracts and engine only gain a flag), and no Pixi v7 idioms.

Checks re-run:
- `npm test`: 1721 of 1721 passed, goldens without -u. That includes commands.test, maneuvers.test, docTables, pacingBuilt, sweep and the golden suite.
- `npm run -s typecheck` and `npm run -s lint`: clean.
- `npm run e2e:spec -- gallery-assets`: 4 of 4 passed, including "every maneuver demo runs and clears, in full and reduced motion, with no console errors".
- `npm run e2e:spec -- solar-dense -g "captain’s turn"`: 1 of 1 passed.
