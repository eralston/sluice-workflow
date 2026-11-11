# Review F2, round 1 · Verdict: fix needed

1. Major — The new F2 test in `pacingBuilt.test.ts` reads the start commit's ledger with `git show 2b33931:…`. CI's checks job checks out only the tip commit, so `npm test` will fail on the first push to main.
   Evidence: `tests/unit/pacingBuilt.test.ts:165` calls `execSync('git show 2b33931:docs/progress/v1.4/pacing-ledger.json')`. `.github/workflows/ci.yml:27` (`checks` job) uses `actions/checkout@v4` with no `fetch-depth`, so the depth is 1. The `version` job at l.69–71 sets `fetch-depth: 0` because it needs history; the checks job doesn't have it. Once F2 is committed, 2b33931 (a "bench" commit) is not in a depth-1 clone, and `git show` exits fatally, which fails the test. The builder noted the dependency under limitations but didn't connect it to CI. Fix: hard-code the seven start-commit `wallMs` values as constants in the test. The same file already does this with `BEFORE_VOLLEYS`. The values are Comet 60795, Nova 209348, Quasar 299132, Pulsar 288808, Convoy Planning 183105, Harbor 178335, Meteor 284681 (they equal F2+'s `beforeMs` in `pacing-built.json`).
   Acceptance line or rule: CLAUDE.md Releases (every push to main runs the checks in ci.yml). This breaks something that worked in a real environment.
   Lens: none.

2. Minor — The weakened 22 B9 check in `solar-dense.spec.ts` accepts any plate that rides with its ship for under 2.2 s, not just a summon's. It also drops those episodes from the "whole ≥ 1400 ms" and "parked < 12 px" checks.
   Evidence: `tests/e2e/solar-dense.spec.ts:455–460`. The exemption itself is right: by design (scope "its plate rides with the ship for NOTE_MIN_MS") a summon's plate now moves. But the check can't tell a summon from a regression. Suppose a non-summon sortie started to travel while named for less than 2.2 s, or a parked turn got cut to under 1.4 s while drifting 12 px or more. Either would pass. The check could be tied to summons without a new seam. For example: cap the riding episodes at the number of stations that appear during the sample (count `kind === 'facility'` nodes in `viewGraph()` at the start and end), or require each riding episode to begin within a sample or two of a new facility node.
   Acceptance line or rule: none broken. This makes an existing guard fragile (deviation 3 in the build record).
   Lens: none.

3. Minor — The gallery stills the builder took for the gate don't show the act. The reduced-motion still is at rest, with no station and no blip.
   Evidence: `f2-jump-in-reduced.png`: the cell's footer reads "reduced motion · R toggles · rest", with no station on the board. `f2-jump-in-full.png`: the station is in, the ship is back near its rest, and no blip ring shows. The test waits 750 ms after `state === 'play'` without first waiting for a fresh play, so the frame lands at an arbitrary point (`gallery-assets.spec.ts:183–188`). The packet asks for "stills in the act". My stills `review-1-gallery-full-act.png` and `review-1-gallery-reduced-act.png` show both blips and can stand in for the gate. The spec should still be fixed: wait for the state to leave `play` and then re-enter it, as the reviewer's probe did.
   Acceptance line or rule: packet Checks (gallery-assets stills in the act).
   Lens: none.

4. Nit — The coast deviation (hyperbolic in place of exponential) is accepted. In practice it reads as a short overshoot followed by a near-park.
   Evidence: `movers.ts` `coasted`: speed is `v0/(1+s/τ)²` with `τ = turnR/v0`, which is tens of ms for a real flight. In the P4-waiting case `waitS` is always ≥ 1.8 s, because `nearStartMs` holds the next turn until the summon's work ends at 2515 ms. So the ship slows to a crawl about 0.2 s past the spot and creeps for 1.8–3 s with its plate open. The packet's exponential would do the same, and only the hyperbolic satisfies the packet's own "every frame moves" check. If a true cruise is wanted, that is a design question for the planner, not a defect here.
   Lens: none.

5. Nit — F2+ Pulsar's −1831 ms and the test's `≥ −2000` tolerance are accepted.
   Evidence: there is precedent: E6+ Quasar is −1880 in `pacing-built.json`. The director golden shows the saving went into tempo (Pulsar 1.1 → 1.05, Quasar 1.9 → 1.8). The F2 rows (short and montage only) save 18.9 s on Pulsar and 14.5 s on Quasar. The −2000 bound is a bare number. A comment naming the E6+ precedent would help.
   Lens: The effect where it's meant.

6. Nit — In the guest path, `stationJumpIn.ts` uses `pointOf(f.at)![0]`. This drops the `f.node.world` fallback that `spotOf` keeps (and that the old code had), so a facility with no live point would throw. Reusing `spotOf`'s point avoids the non-null assertion.

7. Nit — The assertions in `commands.test.ts` test (b) and (c) are looser than they read. In (b), `openBefore = Math.min(openBefore, 0) + crewOpen` effectively checks only the last frame before 0.7 s. In (c), the blip is matched with `endsWith(' 0,0') || includes(' ring 7.00 ')`, so any ring at the origin counts.

Looked at:
- I drove `STAR_CHART_WINDOW_SIZE=1024x640 npm run drive -- tests/drive/steps/solar-station.ts --paradigm solar` myself (Harbor Pod, Sprint 13, the tide-gateway arrival stepped at 1×). Stills: `review-1-drive-blip-1024.png` and `review-1-drive-after-1024.png`.
- In the blip frame, the station folds in at its spot, a small at-rest-blue ring of the same shape sits where the ship passed, and Ossian Vale is already moving on with its plate unfurled (named from the act). In the next frame the ship is near its rest, its plate is clear of the "Ossian's World" and "tide-gateway" labels, and the station label is clear.
- While travelling, the ship's sprite briefly crosses the "Ossian's World" planet label. This is travel, and it is gone 400 ms later. The zoom buttons, side panel and timeline don't cover the scene. No plate overlaps another plate.
- Without the waiting sortie, the onward leg swings about turnR past the spot and curves back toward the rest. The rest lies on the side the summoner came from. This matches the packet: it never reverses at the spot.
- Gallery, via a throwaway probe (now deleted) that waited for a fresh play: in full motion (`review-1-gallery-full-act.png`) the blip ring sits on the ship just past the spot as the station's fold ring opens, in the same hue and shape. Under reduced motion (`review-1-gallery-reduced-act.png`) the blip plays at the ship's own place and the arrival at the station. `stuck` 0, errors `[]`.

Not findings:
- Gate: typecheck, lint and unit (109 files, 1725 tests) are green.
- `npm run pacing -- --candidates` reproduces the committed ledger md/json byte for byte. `pacing-candidates.json` is unmoved. `pacing-built.json` only gains its 14 rows.
- Mapped e2e (`gallery-assets solar solar-play solar-dense montage-names`): 53 passed. The Meteor 1024×640 ✘ is F1's pre-existing `test.fail` marker, and passes as expected. `e2e:keystone`: 43 passed.
- Only `director.json` moved among the goldens. Its estimate and tempo changes are as listed in the build record, and no forms or climaxes moved. The v0 and Solar plan/scenes goldens are untouched.
- 15 §7 is 2515 and the §8 audit rows are as the packet says. The 03 amendment covers `PaceRule.passes`, `PlannedManeuver.passes`, `PursueArgs.pass` and `crewTimes(…, passes)`. 05 M-13/P-7/P-16 and 13 §6 are consistent with the code.
- `releaseOf`/`releaseOfPlay` at the claim cannot cut the plate's ride: `nearStartMs` still waits for the work's end (2515 = claim + `NOTE_MIN_MS`).
- The Comet sweep pin moves 61845 → 61545, explained in its comment.
