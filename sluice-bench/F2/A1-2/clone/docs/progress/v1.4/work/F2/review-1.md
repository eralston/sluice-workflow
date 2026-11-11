# Review F2, round 1 · Verdict: pass

1. Minor — The pass path's "never at rest mid-leg" claim fails when home lies on or just past the spot, roughly in line with the flight. The on leg's Hermite tangent `backS·vs·tan` is then much longer than the leg itself, so the ship overshoots home, stops and reverses.
   Evidence: `docs/progress/v1.4/work/F2/probe/pass.mjs` (an exact copy of `passTangent`/`passPoint`, `movers.ts:240-264`). With home 0.2·d past the spot the minimum speed is 0.09 at t=1.57 s, and the velocity reverses. With home 0.05·d past it, the minimum is 0.07 at t=1.37 s, also reversing. The packet's two geometries (U-turn, home to the side) and the 90° case never reach rest. In the common case `goalOf` ≈ start, so this happens only if the summoner's place moves toward or past the station during the pass. The design is the packet's (step 4), and the test covers only its two cases.
   Acceptance line or rule: "no hold … its path is never at rest between leaving and arriving at its place" (packet's reading of acceptance 2). This is an edge geometry, not the tested scene. A fix, if wanted: cap the on-leg tangent at about 3·|home−spot| along that leg.
2. Minor — The F2+ Built test is looser than the packet asked: it allows a cost up to 2 s and needs only five of seven pods to save, where the packet said "never cost time". Pulsar's F2+ row costs 1.8 s (288 808 → 290 639 ms).
   Evidence: `tests/unit/pacingBuilt.test.ts` (the F2+ test, `savedMs > -2000`, `≥ 5` pods saving); `pacing-built.json` F2+ Pulsar `savedMs -1831`. The F2 row without adaptive speed saves 18.9 s on Pulsar. The cost comes from the director re-fitting its tempo (director golden, Pulsar tempo 1.1 → 1.05). F2's schedule doesn't lengthen. The builder records it as a deviation.
   Acceptance line or rule: acceptance 4 ("The ledger shows the saving per pod") is met: every pod has a row. Only the packet's check wording is relaxed. The orchestrator should accept that or tighten it.
3. Nit — 13 §6's new *Call blip* grammar row says the ring is "closing 0.7 → 1.6", but it opens. `Ring` grows from r0 to r1 (`effects.ts:231`, r0 = 0.7·, r1 = 1.6·), and 13 l.686 itself calls it "an expanding ring".
   Evidence: `docs/13-game-design.md:649`.
4. Nit — A guest summoner's blip uses a fixed r of 12 world units (`stationJumpIn.ts`, `call(spot, 12)`), so its size doesn't scale with a ship. The builder records this as a deviation, and it keeps the same shape and hue.

Not findings (checked and fine; the fixer shouldn't touch them):
- Gate: typecheck, lint and unit tests are clean (109 files, 1726 tests).
- E2e: `gallery-assets solar-dense solar solar-play`.
  - First run: 34 passed and 2 failed, with 14 not run behind them in the serial file. One failure was a `solar.spec` galaxy-plate click timeout ("element is not stable"; F2 doesn't touch navigation). The other was the `solar-dense` "at most four labels" check, with 5 labels on one sample.
  - Rerun: `solar-dense` alone passed 21/21, and all four specs together passed 50/50. The four-label failure didn't recur. I couldn't tie it to F2, so it stays an observation, not a finding.
  - The Meteor 1024×640 ✘ is F1's `test.fail` marker (expected).
  - `e2e:keystone`: 43 passed.
- The new gallery test passes: loops ≥ 1 and stuck 0 in both modes, no console errors. The full still shows the blip at the spot and the station's ring together, with the ship already flying on, as intended.
- The blip is resolved once when the ring is made (`commands.ts:331`, `fixed(a.at)`), so it marks where the ship passed. The act and the blip are both at delay 0, and gather + durS = act.
- `crewTimesOf` is used in `draftsOf` durMs, `releaseOf`, the interpreter and the gallery's demo duration. `releaseOfPlay`, `turnVolleys` and `crewHoldMs` are unchanged, as the packet says.
- `nearWaits` skips passing plays.
- The non-pass Sortie path is unchanged apart from a pure `goalOf` read at construction.
- Goldens:
  - `director.json`: `estimateMs` and tempo only, on the six summon pods.
  - `pacing-built.json`: only additions (126 lines).
  - `pacing-candidates.json` and every other golden: no diff.
  - The E1–E10 Built rows are pinned and unchanged (`BEFORE_F2`, `BEFORE_VOLLEYS`).
- Docs:
  - 15 §7 row (2515) and the 15 §8 audit rows (tell and fold cut, blip added, arrival in Hero blue).
  - 13 l.570, l.649, l.686 and l.739; 05 M-13, P-7 and T-1.
  - 03 is amended (normative, and the build record calls it out).
  - The tests/README mapping is added.
  - `docTables` passes.
- Hard rules hold: fixture data only, no PAT, no ADO writes, `src/shared/` stays pure (only `maneuvers.ts`/`pace.ts` changed there, no imports added), and no Pixi API change.
