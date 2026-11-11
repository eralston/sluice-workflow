# Review F2, round 1 · Verdict: pass

1. Minor: the gate stills the packet asked for, `f2-jumpin-full.png` and `f2-jumpin-reduced.png` (the Station jump-in gallery cell at the blip), weren't captured.
   Evidence: `ls docs/progress/v1.4/work/F2/` shows only `f2-meteor-pass.png`. build-1.json, deviations: "Gallery stills … not captured". The acceptance itself is met: `gallery-assets` ("every maneuver demo runs and clears, in full and reduced motion, with no console errors") passed in my run.
   Acceptance line or rule: packet Checks, "Stills for the gate". HG sign-off will want to see the cell, so a fixer or the clerk should take the two stills.

2. Minor: on Meteor, the ledger's F2 Built row reads a loss (284.7 -> 292.5 s, -7.8 s), and nothing in the ledger says why.
   Evidence: `pacing-ledger.md:580`. The undirected totals do fall on every pod, in `pacing-ledger.json` `pods[].totalMs`: Meteor 483950 -> 437418, Quasar 491863 -> 482383, Pulsar 372570 -> 360090. The director fits Meteor, Quasar and Pulsar to 300 s, so it spends the room the change frees. The builder's explanation is in build-1.json only. Someone reading the ledger would conclude F2 cost its target pod (36 summons) 7.8 s.
   Acceptance line or rule: "The ledger shows the saving per pod". It does show a row on every pod, as the packet reads it, but for the pod the item is for, the row shows the opposite of a saving with no note. A one-line note, or reporting the undirected saving beside the row, would fix it.

3. Minor: the new F2 ledger test checks the live ledger against pre-F2 totals typed into the test, so it measures every later item too, not F2.
   Evidence: `tests/unit/pacingBuilt.test.ts`, `TOTAL_BEFORE_F2` and `saved = TOTAL_BEFORE_F2 - ledger.pods[].totalMs`. Any later item (F3, F4) that moves a pod's total changes what this test asserts. One that lengthens a pod fails F2's test, and one that shortens Meteor less than another pod breaks "Meteor saves most". The Built rows' own before/now (PRE_PASS vs today) would isolate F2, as the rows of E1 to E10 do.
   Acceptance line or rule: packet Checks (`pacingBuilt.test.ts`: "Meteor's saving is the largest"). This is a deviation the builder recorded, and the check is fragile.

4. Minor (for the human gate, not necessarily a fix): Pulsar's director jumps from tempo 1.1 with 72 light forms to `TEMPO_MAX` 2 with the light lever off.
   Evidence: `tests/golden/__golden__/director.json` diff: levers lose "light", `tempo` 1.1 -> 2, `forms.light` 72 removed, estimateMs 294434 -> 298298. `src/shared/engine/director.ts:232-250`: speed is tried before light, and now fits just under target at the cap. So every non-climax beat on Pulsar, a busy pod, now plays at about twice the speed it did. This follows the director's designed lever order (HG-C), not a bug in F2. The builder listed it under limitations.
   Acceptance line or rule: project lens "the effect where it's meant" (Pulsar). Worth a look at the gate or the final check.

5. Nit: test (e)'s "no `cmd hold` logged" can't fail. The old summon parked through `Sortie`'s `holdS`, not a `hold` command. The real no-hold proof is (b) (no `holdS`/`waitS`) together with (d) (the mover moves on every 10 ms step, given holdS 9 and waitS 9).

6. Nit: `solar-dense.spec.ts`'s check "a passing plate moved ≥ 12 px" only runs if a pass is seen on that scene, so it may never run. My drive re-run on Meteor did see one (below).

Not findings (checked and fine, the fixer shouldn't touch them):
- typecheck, lint and `npm test` are green: 109 files, 1728 tests, including docTables and the goldens.
- The 50 ms blip-to-act test is real. Both the ring and the jump act are stamped with the rig's own 20 ms-step clock. Under the old choreography the first ring was the tell, at 0 ms, so the test would fail. It passes in full and reduced motion, and no `pursue` is made under reduced motion.
- No hold remains. In pass mode `Sortie` zeroes `holdS` and `waitS`, and the interpreter's P4 `waitS` is ignored (movers.ts:128).
- `crewTimes(phases, true)` and `heldMs` match Approach 2. `durationMs` is 1915, and the same captain's next turn comes at ≥ +1915 (maneuvers.test).
- The builder's limitation, a summoner's next sortie cutting the pass's plate short, doesn't happen on any fixture. My probe `work/F2/probe-review-plate.ts` found, on all seven pods, 0 named summons whose summoner's next flying turn sets off before the plate's whole time ends (Meteor: the nearest is 9.6 s later).
- `pacing-built.json` only adds lines. Re-running `npm run pacing -- --candidates` reproduces all four committed files byte for byte. E1's candidate reads 0 on every pod, and the `facility.enter` rows read 1.9 s.
- Only `director.json` moved among the goldens, and every field that changed is listed in build-1.json.
- Docs: the 15 §7 row (Length 1915 and the What-you-see text), the 15 §8 audit rows (tell, fold and land cut, the act blip row added, the `pursue` Looks-like), and 15 §9 and §10. 13 §6 (the R8 sentence is present) and 05 M-13, P-7 and K-4. 03 is amended in both places plus the `crewTimes` note, and the build record calls it out.
- e2e: `gallery-assets solar solar-play solar-dense montage-names camera-directs` gave 38 passed and 1 failed: solar-dense "facing follows motion" at 2/37 = 5.4%. That stopped 15 serial tests behind it. Re-running solar-dense alone passed 21/21 (facing: 30 judged, 0 wrong). F1's build and review records report the same flake, so I treat it as pre-existing. `e2e:keystone` passed 43/43.
- Drive re-run (`npm run drive -- tests/drive/steps/f2-pass.ts`, output in `test-results/drive/f2review/`): on Meteor, Tobin Lindqvist's plate (`is-passing`, "Linked PR #21001") rides the moving ship, the station comes in beside the spot, and the blip ring is the station ring's shape in the same hue.
