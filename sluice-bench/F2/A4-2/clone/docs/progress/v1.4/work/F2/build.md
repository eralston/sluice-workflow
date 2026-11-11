# F2 Summon on the fly: build record

## What was built
- The summoner's `pursue` now has a `pass` mode (new `Flyby` mover in `chart/fx/movers.ts`): it flies out to the spot beside the station, speeding up, and carries on to its layout target without stopping (slowing only on arriving home). No `holdS`, no `waitS`, no fly-back.
- `stationJumpIn.ts`: gather is the passing `pursue` (0.715 s to the spot, 0.8 s on from it); the fold ring that repeated the flight is gone. The act gives **one call blip** (a `ring` in `HERO_GLOW`, same hue and ring shape as the station's own bloom, anchored at the ship via `a.at`) at delay 0, the same instant as `act jump`. Under reduced motion `pursue` snaps (skipped), so the blip and the arrival play at the ship's place. The guest (no ship) case is unchanged except its stay is gather + act + 600 (was gather + crew hold + 600).
- `PaceRule.onTheFly` (new, `pace.ts`, set on `facility.enter`): the planner no longer stretches the maneuver to the crew's turn (`durMs` = `spanMs(phases)` = 2815), and its release is the work's end (`releaseOf`, `releaseOfPlay`). New `onTheFly(id)` helper in `maneuvers.ts`; the gallery cell uses it.
- Plate: the interpreter names the summoner from the act (the blip) for `max(NOTE_MIN_MS, CREW_FOLD_MS + CREW_OPEN_MIN_MS + 250)` = 2270 ms, riding with the ship (`showCrew(..., rides)`; `castLabels.crew` doesn't gate a riding plate on a `Sortie`).
- Phases are unchanged (tell 300, gather 715, act 1200, land 600 = 2815): the saving is the crew hold and fly-back leaving the length (4835 -> 2815), so 15 §7's Length (2815) did not change; its "What you see" text did.
- Ledger: `scripts/pacing-built.ts` has an `F2` item on all seven pods (`allPods`), `flies`, directed with short+montage only (as E6) so adaptive speed does not re-fit the saving away (with every lever Pulsar went -3908 ms: the director relaxes its tempo). Items built before F2 now run with the summoner held (`flies` unset), so their committed rows stay as measured. Saved: Comet 0, Nova 2020, Quasar 12120, Pulsar 16160, Convoy 6060, Harbor 2420, Meteor 25644 ms.
- Docs: 15 §7 row, 15 §8 effect-audit (fold row replaced by the call-blip row), 13 §6 rows (Station jump-in, Station), 05 M-13 and T-1, 03 (`PaceRule.onTheFly`).

## Decisions (judgment calls)
1. Blip placed in `act` at delay 0 (not in gather), so it is the same instant as `act jump` by construction. Fold ring dropped (the blip is the call).
2. Phases kept as they were; "phases shrink to flight plus arrival" is met by the length being the phases'.
3. P4 (`nearWaits`) stays-near does not apply to a flyby; a next sortie takes over from where the ship is drawn (movers never jump). Not pinned by a test.
4. Plate window lengthened beyond NOTE_MIN_MS so it is whole >= CREW_OPEN_MIN_MS (an existing solar-dense test needs that of every named turn; at exactly NOTE_MIN_MS it measured 1231 ms whole, at +0 1397).
5. F2 ledger row runs short+montage levers only (see above).

## Test changes (none weakens the F2 tests)
- `tests/unit/commands.test.ts` "Station jump-in issues no beacon...": gather now has no ring (fold repeat gone) and a `pass` pursue with no hold; the act has two rings (blip + bloom). The Shuttle tender assertion is unchanged (variable renamed `tenderAct`). Reason: heads-up in tests.md; the old assertions pinned the fold ring that F2 removes.
- `tests/unit/pacingBuilt.test.ts` "E1 to E5 ...": filter also excludes ids starting `F` (the F2 row). Its committed values are untouched.
- `tests/golden/__golden__/director.json` regenerated (`-u`): the director's estimates/tempo move because every summon is 2.0 s shorter (Comet 53065 -> 51045 etc.).
- `docs/progress/v1.4/pacing-{built,candidates,ledger}.json/.md` regenerated with `npm run pacing -- --candidates`.
- No e2e spec changed.

## Checks
- `npm run -s typecheck`: clean. `npm run -s lint`: clean.
- `npm test`: 110 files, 1730 tests passed (includes summonOnTheFly 11/11, docTables, literalFence, pacingBuilt).
- e2e (after `electron-vite build`): summon-on-the-fly 3/3, gallery-assets 4/4, solar-play, montage-names, slice3a, solar, solar-dense passed; `npm run e2e:keystone` 43/43.
- Flaky, not F2: `solar-dense` "facing follows motion" fails under load (`--repeat-each=3`: six ships "wrong" at one playhead, a camera move) identically on the unmodified baseline (HEAD, built in a scratch worktree: 2 to 5 wrong of 34 to 41); it passes alone. `solar` Meteor "VC-3 at 1024x640" failed once and passed on retry.
- Full `npm run e2e` not run.

## Fix (review 1)

### M1: the summoner carries on to a waiting next sortie
- `Flyby` (`movers.ts`) now takes `waitS`. With none it flies the two legs as before. With a P4 wait it eases to a stop a little way on from the spot (`WAIT_COAST`, 35% of the way home), stays there, and only then goes home; the next sortie's `pursue` replaces the mover and starts from where the ship is drawn, so it never flies home and out again. `commands.ts` hands `waitS` to the `Flyby`.
- The interpreter's P4 wait is counted from the work's release, but a fly-by finishes its legs earlier (gather + 1.5 s against a release at the work's end). For a `pass` pursue it adds the gap (`releaseOfPlay - gatherAtOf - durS - backS`), so the ship is still parked when the next sortie sets off.
- Tests (`tests/unit/summonOnTheFlyFix.test.ts`): no wait goes home and ends; a wait of 2 s parks away from both the spot and home through the wait, then goes home; no frame jumps.

### M2: a new captain's jump-in
- The `pass` branch now calls `scene.takeJump(a.pk)`. A summoner new to the scene drops out of hyperspace at the spot (hidden, fades in over the last `JUMP_IN_S` of the out leg, no flight out) and then carries on. It is fully in as the act's blip is given. `destroy` leaves the view fully faded in.
- Tests: the jump is taken once, the ship is hidden at the start, sits at the spot (never flies out), is in by the call, and goes home after. A captain already here is shown and flies out.

### M3: the plate and the attention hold agree
- New `flyCrewTimes(phases)` in `maneuvers.ts`: the plate opens at the claim (the act) and lasts one naming turn, `VOLLEY_TURN_MS` (2540 ms: unfurl, 1500 ms whole, fold), so it is whole as long as any named turn (what the old `+ 250` bought) with no new constant. The interpreter's plate and the planner's `heldMs` (for an `onTheFly` rule that attends) both read it, so the budget holds the place until the plate is gone. The bare `+ 250` is gone. The plate is now 2540 ms, not 2270 ms, from the act.
- Tests: `flyCrewTimes` is the claim plus `VOLLEY_TURN_MS`; the beat holding the lone summon stays open until the plate is gone (`shapeOf(...).durationMs >= start + goneMs`; it was 2815 ms before the fix).

### m1, n1, n2, n3, m4
- m1: 13 §6 (Station jump-in) and 13 §1 R8 now state the decided exception, the plate's one-turn window (longer than `NOTE_MIN_MS`, as a departure from Decided, and why), the P4 wait and the K-13 jump. 15 `CREW_FOLD_MS` row names the exception to "shut in flight". `PaceRule.onTheFly` comment matches.
- n1: `Flyby` now reads `look` (it faces a jumping-in captain); `to`/`clearOfPlate` is no longer computed in the `pass` path; the `pass` doc says what `holdS`/`waitS` mean there.
- n2: `onTheFly(id)` uses `ruleById`.
- n3: 15 §10 row `PASS_ON_S` (unguarded) for the 0.8 s leg on, with `WAIT_COAST`.
- m4: an `F2+` ledger row (every lever) in `scripts/pacing-built.ts`. With the plate's hold the app's own saving is no longer a cost: Pulsar +0.2 s (it was -3.9 s), Quasar +3.8 s, Meteor +6.1 s. Ledger files regenerated (`npm run pacing -- --candidates`); the F2 row's savings are unchanged (Nova 2.0, Quasar 12.1, Pulsar 16.2, Convoy 6.1, Harbor 2.4, Meteor 25.6 s).
- m2 (the 300 ms tell stays) is a reading for the user to confirm; not changed. m3: the director golden's changes, per pod (estimate ms, tempo): Comet 53065 -> 51045; Nova 188375 -> 186355; Quasar 296189 -> 296041 (tempo 1.9 -> 1.85: speed relaxes as the pod is shorter, so the target re-fits); Pulsar 294434 -> 291949 (1.1 -> 1.05); Convoy 187265 -> 181205; Harbor 199565 -> 193505. (Before this fix Quasar read 298283 at tempo 1.8, a +2.1 s cost; the plate's hold moved it.)

### Test changes
- New: `tests/unit/summonOnTheFlyFix.test.ts` (7 tests, M1 to M3). Existing F2 tests are unchanged.
- `tests/golden/__golden__/director.json` regenerated again (above).
- `tests/e2e/solar-dense.spec.ts` "a captain's turn: named once parked ...": the summoner's riding plate is now left out of the *parked* judgement (episodes whose plate carries `data-rides`, set by `labels.ts` from the crew entry's new `rides` flag). Why: the test demands that a named ship does not travel, and F2's Decided is that the summoner's plate rides with a passing ship (a Linked PR summon moved 10 to 25 px with the plate open; it passes at HEAD, where the summoner parks). The rest of the test is not weakened: other turns still need whole >= 1.4 s and drift < 12 px, and the summoners' samples still count in the over-work and plate-flip checks.

### Checks
- `npm run -s typecheck`, `npm run -s lint`: clean. `npm test`: 111 files, 1737 tests passed.
- After `electron-vite build`: summon-on-the-fly, gallery-assets, solar-play, montage-names, slice3a, solar, solar-dense all passed; `npm run e2e:keystone` 43/43.
- `npm run e2e` (full, run to the end with `--max-failures=0`): 237 passed, 4 failed, 15 did not run (the serial tests after a failure). None is F2:
  - `perf.spec.ts` "p95 frame time stays within the profile vsync budget" (Pulsar) fails identically on an unmodified HEAD build (25 ms against 18.6 here); the sibling perf tests pass alone. This machine's frame times, not F2.
  - `solar.spec.ts` Meteor "VC-3 at 1024x640" and `solar-dense` "facing follows motion" are the known load flakes: each passes alone or on retry.
  - `demo.spec.ts` "no expanded station plate in Halcyon's five pods" times out in `sceneIs` under load; `demo.spec.ts` run as a file passes (15/15).
