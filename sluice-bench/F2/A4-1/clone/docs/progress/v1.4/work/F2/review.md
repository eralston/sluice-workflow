# F2 Summon on the fly: review 1

Reviewer: fresh, adversarial. Reviewed the uncommitted working-tree diff on `bench` against the tests in a985a15, the item
F2 (27), 02 §1, 13 §1 (R1–R14), 13 §6, 15 §7/§8/§10, 05 §8, tests.md and build.md. Fixture data only (INV-18).

## Verdict: **changes requested** (1 Blocker, 3 Majors, 5 Minors, 3 Nits)

The choreography does what the item asks. The pass has no hold, there's one blip at the passing ship with the station's
`jump` at the same instant, and the hue and `r1/r` match. Reduced motion plays both at the ship's rest. The engine no
longer stretches the jump-in by the crew hold. The edits to existing tests are justified. The problems:

- **An existing e2e spec fails with this diff and passes at HEAD** (B1): the plate is whole for less than `NOTE_MIN_MS`
  and less than `CREW_OPEN_MIN_MS`, and the spec's "parked while named" check conflicts with the item's design. The
  builder didn't run `solar-dense` or the full e2e suite.
- The ledger's F2 rows run undirected and without rising tempo or late montage, so they don't show what the app plays.
  Directed, Pulsar gets *longer*.
- The new constant has no 15 row.
- 15 §8's effect inventory still describes the old jump-in.

## Checks run (this review)

| Check | Result |
|---|---|
| `npm run -s typecheck` | exit 0 |
| `npm run -s lint` | exit 0 |
| `npm test` | 110 files, 1729 tests passed |
| `npm run e2e:spec -- gallery-summon` | 1 passed (18.4 s) |
| `npm run e2e:spec -- solar-dense montage-names` (not run by the builder) | 12 passed, **1 failed**, 11 did not run: `solar-dense.spec.ts:400` *a captain's turn: named once parked, held a second past the work…* fails at `:459` with `Expected: > 1400, Received: 1202`. A second run gave 1151. |
| The same spec at HEAD (a985a15, in a temporary detached worktree, since removed) | **passed**, so F2 causes the failure |
| F2's `BUILT` rows re-run directed with rising tempo and late montage (a scratch script in `/tmp`, not committed) | Comet 0.3, Nova 2.3, Quasar 7.3, **Pulsar −1.8**, Convoy 7.0, Harbor 3.3, **Meteor 1.3** s saved |
| The same, undirected with rising tempo and late montage | Comet 0.3, Nova 2.3, Quasar 16.5, Pulsar 18.9, Convoy 7.0, Harbor 3.3, Meteor 34.3 (the same savings as the committed rows; only the absolute lengths differ) |

## Acceptance, line by line

| Acceptance | Met? | Evidence |
|---|---|---|
| Gallery demo cell, full and reduced motion, no console errors | Yes | `gallery-summon.spec.ts` passes. The `agentStillMs`, `agentTravel` and `reducedAgentTravel` stats are wired correctly (`maneuverDemos.ts` `trackAgent`; reset per loop; reduced-only loops gated by `reducedAll`). |
| Unit test: no hold between the flight and the next place; the act within 50 ms of the blip | Yes | `summonOnTheFly.test.ts` passes. The blip and `cmd.act(f.key,'jump')` come from the same `act` phase call (`stationJumpIn.ts:44-58`), so they share a frame. |
| 15 §7 row and `docTables.test.ts` | Yes for §7 (2515; matches `spanMs`). **Partly** for the rest of 15 | See M3 and M4. |
| Schedule goldens updated, and the packet names each change | Updated, but **misnamed** | See m3. |
| The ledger shows the saving per pod | Shows *a* saving per pod, but not what the app plays | See M2. |
| Decided: plate rides with the ship for `NOTE_MIN_MS` | **No** (whole only 1.28 s; an existing e2e spec fails) | See B1. |

## Findings

### B1 (Blocker): `solar-dense.spec.ts:400` fails; the passing plate is whole for 1280 ms, under `NOTE_MIN_MS` (1800) and `CREW_OPEN_MIN_MS` (1500)
- **Regression:** the existing e2e spec *a captain's turn: named once parked…* (`tests/e2e/solar-dense.spec.ts:459`)
  measures each acting plate's whole time. It got 1202 and 1151 ms in two runs, against a required > 1400. It passes at
  HEAD.
- **A second conflict:** its next assertion (`:461`, "Parked while named: moved < 12" screen px) contradicts F2's
  Decided ("its plate rides with the ship"). Once the whole time is fixed, a passing summoner will fail it too.
- **That spec needs a justified edit:** exempt `facility.enter` passes from the parked check, or assert that passes
  ride. Record the edit in the build's *Changes to existing tests*.
- **Where:** `src/renderer/src/chart/fx/movers.ts:348` (`crewOpen`), `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts:27,37`
  (`rideS: PASS_PLATE_MS`), and `src/shared/engine/maneuvers.ts:809`.
- **Evidence:**
  - `PASS_PLATE_MS = CREW_FOLD_MS + NOTE_MIN_MS` = 2320, documented as "its unfurl and the least time it is read".
  - `Sortie.crewOpen` returns `min(h/fold, (open − h)/fold)` with `open = rideS` = 2.32 s, so the *fold* is inside
    the 2.32 s as well. The plate unfurls over 0–0.52 s, is whole over 0.52–1.80 s (**1.28 s**), and folds over
    1.80–2.32 s.
  - The interpreter sets the label window to `[openMs, openMs + PASS_PLATE_MS]` (`interpreter.ts:620`), which would
    give 1.8 s whole with the fold after it. But `castLabels.crew` prefers the flown value (`open = flown ?? own`), so
    the Sortie's shorter opening wins.
  - 15 §10 defines both minima as times the plate is "whole (not unfurling or folding)", and R14 says "held long
    enough to read". The unit test only checks `u > 0` for at least 1760 ms (2320 passes), so it doesn't catch this.
- **Fix:** let a pass's plate stay whole for `NOTE_MIN_MS` (at least `CREW_OPEN_MIN_MS`) and then fold. For example,
  `rideS = (2·CREW_FOLD_MS + NOTE_MIN_MS)/1000`, or have `crewOpen` treat `rideS` as the start of the fold. Keep the
  leg on at least as long, so the plate doesn't ride a parked ship. Set the interpreter's `closeMs` to match.
  Optionally, tighten the unit test to measure `u === 1` time.

### M2 (Major): F2's ledger rows don't show the saving the app plays, and the ledger doesn't say so
- **Where:** `scripts/pacing-built.ts:158-170` (the F2 entry), and the rows in `docs/progress/v1.4/pacing-ledger.md:575-581`.
- **Evidence:**
  - The entry has no `directs`, `rises` or `late`. Both runs are therefore undirected, without rising tempo (E8), and
    without late-day montage (E10). The comment says "Now: today's rules", which is not true.
  - The builder's reason for running undirected is honest in `build.md`: directed, the budget fit re-spends the saving.
    My re-run confirms that with today's directed rules, Pulsar is **1.8 s longer** with F2, Meteor saves 1.3 s (not
    34.3), and Quasar saves 7.3 s (not 16.5). The director golden agrees: one speed pod's `estimateMs` rises
    296189 → 296950.
  - The ledger itself publishes only the undirected 18.9 s for Pulsar and 34.3 s for Meteor, with no note.
  - 27 Decisions 2026-11-01 (E5a review-1) and 2026-11-06 (block E audit) ask that the ledger describe the app's
    schedule. The ahead-written test's `savedMs ≥ 0` makes the directed figure untestable as written, so it isn't only
    the builder's choice. The rows still read as the user-facing saving.
- **Fix:**
  - At least, correct the comment and add an F2 note to the ledger's Built section: "undirected, recorded time, the
    rule's own saving; directed the budget fit re-spends it: Pulsar −1.8 s, Meteor 1.3 s, …".
  - Better, also record a directed row set (a separate id such as `F2d`, exempt from `savedMs ≥ 0`) so the final
    check sees the real effect.
  - Set `rises: true, late: true` so "now" is today's rules. The savings don't change; I checked.

### M3 (Major): new constant `PASS_PLATE_MS` has no 15 §10 row
- **Where:** `src/shared/engine/maneuvers.ts:809`, and `docs/15-reference.md` §10 (rows 1256–1259 hold
  `NOTE_MIN_MS`, `CREW_HOLD_MS`, `CREW_OPEN_MIN_MS` and `CREW_FOLD_MS`; the derived `VOLLEY_TURN_MS` has its own row at
  1218).
- **Evidence:** CLAUDE.md says "Change a constant and its row in the same change". `docTables` passes only because §10's
  check doesn't enumerate it.
- **Fix:**
  - Add a row: "A pass's plate (new, 27 F2) | 2320 ms (or the B1-corrected value) | `@shared/engine/maneuvers.ts`
    PASS_PLATE_MS | …".
  - Amend the `CREW_HOLD_MS` row ("Their sortie holds that long, and the planner counts it (`durMs`)") to note that a
    passing rule (`passes`) holds no turn.
  - Amend the `CREW_FOLD_MS` row ("once the ship is parked") for the pass.

### M4 (Major): 15 §8's effect inventory still lists the retired jump-in effects and omits the blip
- **Where:** `docs/15-reference.md:956-963`.
- **Evidence:**
  - Line 956 still lists "Station jump-in | tell | `ring` closing on the station's spot | … | keep", but the tell is gone
    from the code and the rule.
  - Line 959 still lists the gather's `ring` fold ("mutes first"), which `stationJumpIn.ts` no longer issues.
  - There's no row for the act's call blip (`ring` at the passing ship), which is the item's main new effect.
  - The table is 15's authority on what each effect is for. The diff updated §7, 13 §6 and 05 §8 but not this table.
- **Fix:** remove or mark as cut the tell and fold rows, citing 27 F2. Add "Station jump-in | act | `ring` call blip at
  the passing ship, At-rest blue, the arrival's shape | Who summoned it, and that the arrival is its effect | — | 0 |
  keep". Also update the `pursue` row at 884 ("a sortie out, a hold and home") to cover a pass.

### m1 (Minor): the plate outlives the jump-in's attention hold by about 520 ms
- **Where:** `src/shared/engine/maneuvers.ts:621` (`heldMs`) against `movers.ts:348`.
- **Evidence:**
  - `heldMs = max(durMs, NOTE_MIN_MS)` = 2515 from the start, so the places are held from the claim (715) to 2515.
  - The plate shows from 715 to 3035.
  - Before F2, `durMs` was stretched to `leaveMs`, which covered the plate.
  - A neighbour placed by the budget at 2515 can now overlap a still-visible summoner plate (R14, ATTENTION_MAX). The
    renderer's `hasRoom` mitigates this but doesn't prevent it for windows already issued.
- **Fix:** for a passing rule, hold the places to `claim + PASS_PLATE_MS (+ fold)`, for example through `heldMs`.
  Re-run the goldens if the length moves.

### m2 (Minor): R8's tension isn't recorded
- **Where:** `docs/13-game-design.md:50` (R8: "movement and interaction never blur into one").
- **Evidence:** F2 deliberately interacts while moving (the user's Decided), and 13 §6 cites R8 and R10 in support. R8
  as written forbids it, and there's no note of the exception.
- **Fix:** add one clause to R8, or to the 13 §6 row: "a summons may be given in passing (27 F2)".

### m3 (Minor): build.md misnames two of the golden changes
- **Where:** `docs/progress/v1.4/work/F2/build.md`, *Golden changes*.
- **Evidence:**
  - It says "Pulsar 296189 → 296950 and tempo 1.9 → 1.8", but in `tests/golden/__golden__/director.json` that entry
    (line 35) is **Quasar Pod**.
  - It says "Quasar-side pod (second speed pod) 294434 → 284444, tempo 1.1 → 1.05", but that entry (line 65) is
    **Pulsar Pod**.
  - The acceptance requires the packet to name each change.
- **Fix:** swap the names, and say plainly that Quasar's directed estimate *grows* by 0.76 s.

### m4 (Minor): 05 §8 T-1 still says the station "jumps in where its summoner waits"
- **Where:** `docs/05-playback.md:833`.
- **Evidence:** the summoner no longer waits.
- **Fix:** "… it jumps in as its summoner passes (27 F2) …".

### m5 (Minor): `releaseOfPlay` reads the global `PACE_RULES`, not the plan's rules
- **Where:** `src/shared/engine/maneuvers.ts:802-803`.
- **Evidence:**
  - The planner's `releaseOf` reads `d.rule.passes`, which respects custom `rules`, such as `withoutSummonOnTheFly`.
  - `releaseOfPlay` (and so `nearWaits`) always treats `facility.enter` as passing.
  - That's harmless in the app, which uses `PACE_RULES`. It's inconsistent for any caller that plans with substituted
    rules.
  - It also duplicates `flyingPlay`'s lookup.
- **Fix:** share one lookup helper (as `ruleById` is in the interpreter), or document the assumption.

### n1 (Nit): `sweep.test.ts:171` comment
"Comet's length as E7 measured it … less the 300 ms" now pins a post-F2 value. That's fine, but the earlier items
otherwise undo F2 through `withoutSummonOnTheFly`. Either run this check with that helper, so the E7 number stays
61_845, or keep it as is. The justification in build.md holds either way.

### n2 (Nit): build.md's leg-on speed
build.md says "fast in, slower out; accepted". There's a speed discontinuity at the pass: ease-in arrives at about 2×
the average speed, and ease-out leaves at about 2× the leg-on's average over a 2.3 s leg. It's worth a look in
`npm run gallery`. It isn't wrong.

### n3 (Nit): naming
`Sortie`'s `pass` mode shares a word with the Strike run's "sortie as a pass" (13 §6). A name like `through` or
`onTheFly` would avoid confusion.

## Things checked and found sound
- **Edited tests:**
  - `commands.test.ts` replaces the fold-ring assertion with stronger ones (no rings in the gather, no `holdS`,
    `rideS > 0`, and an act with blip plus arrival). That's justified.
  - `sweep.test.ts` changes a pinned length by exactly the removed tell (300 ms), which is consistent with Comet's
    ledger row.
  - The committed F2 tests and `pacingBuilt` frozen rows are untouched in this diff. The `F*` filter is in a985a15, the
    test author's Decision 8.
- **Frozen earlier rows:** they hold honestly. `withoutSummonOnTheFly` restores E1's phases and drops `passes`, so
  `holdsCrew` and `releaseOf` behave as before.
- **`src/shared` purity:** no new imports in `pace.ts` or `maneuvers.ts`.
- **Pixi:** no Pixi API in the diff (the gallery stats read `scene.liveOf` only).
- **Other `Sortie`/`pursue` users:** `pass` defaults to `null`, `arc`'s ease defaults to `easeInOut`, and the end
  condition and `crewOpen` are unchanged when `pass` is null. `solar-dense` and `montage-names` pass. Per the build,
  `solar-play` and the keystone pass too.
- **Reduced motion:** `pursue` snaps, so the blip is drawn at the ship's live anchor (its rest), with the arrival in the
  same act call. This is covered by the unit test and the e2e test.
- **Director/`ARRIVING`:** summons stay unprotected and outside `ARRIVING`, as the item leaves them. `crewBusy`/
  `nearStartMs` floor the next flying turn at the jump-in's work end (2515), so a P4 takeover doesn't cut the plate
  before `claim + 1800`.
- **Goldens:** only `director.json` moved. `npm run fixtures` moved no layout or v0 golden (per the build; consistent
  with the diff).
