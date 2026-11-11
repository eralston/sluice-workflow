# F2 Summon on the fly: tests written first

Tests only. Nothing here implements F2. Fixture data only (INV-18): the cases are Meteor Pod (27 F1), Harbor and Nova.

## Files

- `tests/unit/summonOnTheFly.test.ts` (vitest)
- `tests/e2e/summon-on-the-fly.spec.ts` (Playwright, `parallel` project)

## Acceptance line → tests → how they fail today (at 61e4958)

| Acceptance line | Test(s) | Today |
|---|---|---|
| A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors | e2e `A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors: it plays the flight plus the arrival, no crew hold` | Fails. The cell's note gives `4835 ms`, but it should be no more than the rule's phase span (2815). The loops, the stuck count and the console-error parts pass today. |
| A unit test: the summoner's pursue has no hold between its flight and its next place … | unit `the summoner's pursue has no hold … no hold, no wait, no hold command` | Fails: `holdS` 3.82 on the summoner's pursue. |
| (same) | unit `the summoner's pursue has no hold … flown, its ship never stops until it is there` | Fails: the ship stands still for 3817 ms at the spot. |
| (same) | e2e `full motion: the summoner never parks beside the station it summons, and carries on to its next place` (Meteor's lone summon in the app, captains sampled every frame) | Fails: `3811 ms still at 691.6 from the station` (the spot, 1.9 × the station's r of 364). |
| … and the station's act starts within 50 ms of the blip | unit `one call blip, in the arrival's hue and ring shape, given where the ship is` | Fails: no blip. Every jump-in effect today is drawn on the station. |
| (same) | unit `the station's act starts within 50 ms of the blip, as the ship passes the spot` | Fails: no blip. |
| (Decided: under reduced motion the ship doesn't fly; the blip and the arrival play at its place) | unit `under reduced motion the ship doesn't fly: the blip and the arrival play at its place` | Fails: no blip. |
| (same) | e2e `reduced motion: the summoner doesn't fly; the station still arrives` | **Passes today.** It's a guard: today's pursue already snaps under reduced motion. |
| 15 §7's row and `docTables.test.ts`. The schedule goldens are updated … | unit `<pod>: every planned jump-in lasts its phases, no crew hold or fly-back past the arrival` (Meteor, Harbor, Nova) | Fails: `durationMs` is 4835, but it should be `spanMs(phases)` = 2815. The 15 §7 row itself is already enforced by `docTables.test.ts` (Length ms = the phase span), which goes red once the phases change and the row doesn't. The goldens move with the build (`-u`). The packet names the changes, so no test is written for that. |
| The ledger shows the saving per pod | unit `no pod's facility.enter is charged a crew hold any more` | Fails: Nova's `facility.enter` hold is 2020 ms (Quasar 12120, Pulsar 15860, Meteor 35140 …). |
| (same) | unit `the Built section has an F2 row on all seven pods, Meteor included; …` | Fails: no `F2` rows in `buildBuilt()`. |

There is also a fixture check, `the real lone summon plans a jump-in with its summoner`, which passes. It guards the other tests' setup.

## How the unit test judges motion

The jump-in planned is the real one: Meteor Pod's lone summon (PR 21045, Thu 24 Sep 19:00Z), from
`planManeuvers`. The test plays the Star Chart choreography for `facility.enter`, found by rule id rather than by
file, on a lenient stub scene:

- Each phase runs at its `atMs` with live cast views. The ship's anchor follows where it is drawn.
- Each call is issued at its delay.
- Every move the summoner gets (`pursue`/`hold`, made by the registry's own command) runs frame by frame at 60 fps.

The test therefore judges where the ship is drawn and when, not argument names. One argument check remains: no
`holdS`/`waitS` > 0 and no `hold` command on the summoner. The *blip* is any effect that isn't a move or an act
and isn't drawn on the station. Today every jump-in effect is drawn on the station, so there are none. The
*arrival* is the act phase's effects on the station. "Same hue and ring shape" means that the arrival has a call of
the blip's command with the blip's `color`.

## Decisions (judgment calls, none answered by 27's Decisions)

1. **"No hold between its flight and its next place"** is judged as no run of more than two still frames (33 ms)
   between the ship leaving and reaching its layout target (`goalOf`), and no `holdS`/`waitS`/`hold`. An eased
   pass that slows near the spot but never stops passes.
2. **The station jumps in "at that instant"** means that, at the station's `jump` act, the ship is within 2.5 × the
   station's r of the station (the spot is 1.9 r today). Exactly one blip, within 50 ms of the act.
3. **"The blip and the arrival play at its place"** (reduced motion): the blip is drawn within one station-radius of
   the ship's unmoved place, which means it is anchored at the ship, not at the spot.
4. **"Phases shrink to the flight plus the arrival"** is read as this: the planned `facility.enter` lasts exactly its
   phases (no crew-turn extension from `crewTimes`, which made it 4835), and no longer than today's 2815. Whether
   `tell` stays is the builder's call, so it isn't pinned.
5. **The ledger's saving** is a `BUILT` row with id `F2` covering all seven pods, Meteor included (F1 measured
   Meteor "before F2", and `resolvePods` says "F2 to F4 opt in"). It must never cost time, and it must save more
   than zero on Nova, Convoy Planning, Harbor (not sped by the director) and Meteor. Comet's `facility.enter`
   holds no lead hold today, and Quasar and Pulsar are sped, so those three only need ≥ 0. A further check: no pod's
   `facility.enter` row in the ledger is charged `hold`.
6. **The e2e uses Meteor's lone summon in the app** (story time keeps it at 19:00Z), not a new fixture. The
   summoner is the captain whose drawn path comes nearest the new station. A still spell of 200 ms or more within
   3 × the station's drawn r (the hit circle, in world units) fails, unless it is where the ship ends up.
7. **Not tested** (not acceptance lines): the plate riding with the ship for `NOTE_MIN_MS`, and P4's injected
   `waitS` for a captain whose next turn follows (the interpreter adds it after the choreography). F3 covers the
   chained case.

## Existing tests the build will need to touch (heads-up, not written here)

- `tests/unit/commands.test.ts` › `Station jump-in issues no beacon, bearing or planet rings`: it expects exactly one
  ring in `gather` (the fold) and a pursue there. A blip in `gather` would change that count.
- `tests/unit/pacingBuilt.test.ts` › `E1 to E5 measure what they measured before volleys`: its filter keeps every id
  that doesn't start with E6/E7/E8/E10, so an `F2` row would land in it. The committed `pacing-built.json` also has
  to be regenerated.
- 15 §8's effect-audit rows for Station jump-in, and the `docTables` `effect-audit` check.
