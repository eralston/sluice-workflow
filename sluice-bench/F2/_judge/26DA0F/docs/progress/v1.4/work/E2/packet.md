# Packet E2: Labels on arrival; travel is free
Risk: medium (the beat schedule and label timing change; seek and play agree because plates are effect state cleared on seek) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 274c737

## Acceptance
- A unit test (`maneuvers.test.ts`): a maneuver whose labels don't fit starts its gather on time and claims
  its slots at its act, and there are never more than four labels at once.
- The attention case in `solar-dense.spec.ts` (at most four labels, each matching its History row's action)
  still passes.

## Approach
1. **The claim.** New export in `maneuvers.ts`: `claimMs(phases)` is the `act` phase's `atMs`, or 0 if there is no act. The tell and the gather (travel) ask for no places. `crewTimes().openMs` uses it, so a crew's names and its plates open at the same instant. Every current rule claims before `NOTE_MIN_MS`: the longest tell plus gather is 1200 ms.
2. **The window.** A labelled draft holds its places over `[startMs + claimMs, startMs + heldMs)`. `heldMs` is unchanged (`max(durMs, NOTE_MIN_MS)` from the start). Why: C2's model ("no budget re-fit") assumes this, beat lengths stay the same where nothing waited, and the plate still lingers 1500 ms past its land in the renderer. `shapeOf` and `turnsOf` are unchanged.
3. **`attentionFrom`** works in claim windows. The candidate starts are `fromMs`, plus each placed labelled hold's end minus `d`'s claim, keeping those above `fromMs`, sorted. At each candidate `t`, the check points are `t + claim(d)`, plus every placed window's start inside `(t + claim(d), t + heldMs(d))`. `lit(at)` counts placed drafts with `p.startMs + claim(p) <= at < p.startMs + heldMs(p)`. A waiting maneuver therefore sets off early enough to arrive just as places free. All other constraints (P-3, P-4, P-5, protects, arcs, limelight and montage's `asked` sum) stay as they are.
4. **"On time"** is read as C2 modelled E2: a wait no longer delays the travel. The maneuver starts at `max(fromMs, freeAt − claimMs)`, not at `freeAt`. With no other constraint, its act (its claim) begins exactly when the places free. The unit test asserts this, and that the start is earlier than the old `freeAt`.
5. **The renderer: plates on arrival (R11).** In `interpreter.ts` `play()`, a piece's plate opens at `at(claimMs(m.phases))` (the same instant as `revealS`) for every maneuver, and `holdFromS` is that same instant. The old `s − CAST_LABEL_LEAD_MS` lead and the told-window carry go. The crew naming (already from the act) is unchanged.
6. **The tell lights no plates.** In `tell()`, delete the `labelCast(…, { tag: toldTag(m) })` loop. Keep the glow tells. In `spawn()`, delete the `retire(toldTag(m))` loop, then delete `toldTag()`. Remove `CAST_LABEL_LEAD_MS` from `timing.ts` and from its import. Leave `CastLabels`' `tag`, `retire` and `showing` API alone: its unit tests use it.
7. **`castLabels.ts`:** comments only. The header says plates show from their maneuver's act, not "from the beat's tell (or a short lead…)". The runtime cap (`place()`) is unchanged and still hard-caps at four.
8. **The ledger keeps attributing P-6 waits.** In `scripts/pacing-ledger.ts` `bindingOf`, add a third anchor, `'claim'`: `|x.afterMs + nm(x) − (m.afterMs + claimMs(m.phases))| < 0.5`. Resolve anchors in the order `end`, `noteEnd`, `claim`, and give a `claim` anchor the cause `P-6` directly. Widen `Binding['anchor']`. In `scripts/pacing-candidates.ts` `advanceOf`, a `claim`-anchored wait already travels, so neither E2 nor E4b advances it (push nothing for it). Prefix E2's assumption with "Built (E2): today's rules already have it, so this row reads about 0; see the build record." (E1 did the same.)
9. **Regenerate** with `npm run pacing -- --candidates`, which rewrites `pacing-ledger.{json,md}`, `pacing-candidates.json` and `pacing-built.json`. If E1's exact check in `pacingBuilt.test.ts` now fails, that is a real interaction: C2 estimated E1 on the pre-E2 baseline. In that case, relax it to `Math.abs(diffMs) <= 0.05 * estimateMs` per pod, and record the numbers. Add no Built row for E2: method P has no `before` hook (`pacing-built.ts`'s comment).
10. **Docs**, in the same change (03 is normative, so call it out in the record): 05 §8.5 P-6 and §8.9 A-3/A-4; 15 §10 (the `ATTENTION_MAX` and `NOTE_MIN_MS` rows edited, the `CAST_LABEL_LEAD_MS` row deleted); 03's "Pieces' labels in play" paragraph (`tell` opens no windows; `play` opens one from its act); 13 §3 (line 171) ("from its beat's tell, or a short lead" becomes "from its maneuver's act, once its cast has arrived").

## Files
- `src/shared/engine/maneuvers.ts` 1-6, 25-72, 105-125, 266-358
- `src/renderer/src/chart/fx/v1/interpreter.ts` 30-40, 299-345, 474-490, 588-630, 885-902
- `src/renderer/src/chart/fx/v1/castLabels.ts` 1-14, 144-191 (read; comments only)
- `src/renderer/src/chart/fx/timing.ts` 105-115
- `scripts/pacing-ledger.ts` 124-146; `scripts/pacing-candidates.ts` 67-80, 305-310; `scripts/pacing-built.ts` (read)
- `tests/unit/maneuvers.test.ts` 1-20, 445-503; `tests/unit/pacingBuilt.test.ts`
- `docs/05-playback.md` 747, 823-824; `docs/15-reference.md` 1223, 1230, 1240; `docs/03-contracts.md` 1304-1313; `docs/13-game-design.md` 171-173

## Excerpts
- Scope Decided (27 E2): "A maneuver may start travelling without attention slots. It claims them when its cast arrives (at the act), and its plates show then (R11). Travel isn't counted, and the budget of four is unchanged."
- The user (U5): "starting the maneuver, but then only showing labels of relevant objects on arrival, then don't count that parallel motion as the same amount of visual density".
- C2's model (`pacing-candidates.ts:308`): "A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit." Estimates (s): Comet 0, Nova 0, Quasar 0, Pulsar 0.8, Convoy Planning 4.1, Harbor 1.2.
- P-6 today (05 §8.5): "At most `ATTENTION_MAX` (4) labels at once, counting the pieces' plates the interactions light … and the captains they name …; each holds its place for its length, at least `NOTE_MIN_MS`; what doesn't fit waits".
- R11: "An object arrives before its label: a plate appears once its body is drawn". R14: "Attention is budgeted". INV-15: "Only forward play animates; seeks snap". A seek clears every plate window (05 R-1).
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "Normative docs … A departure means amending the doc in the same change, and saying so in the run record." "Goldens: update only the golden your item meant to move; check its diff line by line." Lens: "check the change on the busy fixtures it's for".

## Checks
- **New unit test** in `maneuvers.test.ts`, named for 27 E2. Use the four sorties of the existing budget test (`:445`): Ann, Ben, Cy and Dee climb wi1 to wi4, two labels each. With `held = max(durationMs, NOTE_MIN_MS)` and `win(m) = [afterMs + claimMs(phases), afterMs + held)`, assert:
  - (a) plans 0 and 1 start at 0;
  - (b) plan 2's `afterMs === held(plan0) − claimMs(plan2.phases)`, and it is `> 0` and `< held(plan0)`. It sets off while all four places are taken, and its act begins as they free;
  - (c) plan 2's claim `=== held(plan0)`;
  - (d) at every window start, the labels summed over the windows that contain it are `<= ATTENTION_MAX`.
  Update the existing expectations that move only because of this, at `:458`, `:460`, `:479` and `:502` (use claim windows and `held − claim` starts). Say which ones in the record.
- `npx vitest run tests/unit/maneuvers.test.ts tests/unit/castLabels.test.ts tests/unit/limelight.test.ts tests/unit/scheduleHooks.test.ts tests/unit/docTables.test.ts tests/unit/pacing.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacingBuilt.test.ts tests/unit/solarSeek.test.ts tests/unit/sceneplay.test.ts`, then the gate.
- **Goldens:** none are expected to move (they don't use the maneuver hooks). If one does, only P-6 starts may move it. Check it line by line, or stop and record it.
- **E2E**, one at a time: `npm run e2e:spec -- solar-dense solar-play solar` (solar-dense is acceptance line 2), then `npm run e2e:keystone`.
- **R11 check:** `npm run drive -- tests/drive/steps/c11-labels.ts --paradigm solar` should count 0 labels before arrival.
- **For the gate:** add `work/E2/stills.ts`, a drive script on Meridian's Convoy Planning Pod (where E2 bites most) at 1×. Take two stills: a captain in flight while four labels show, then the same captain parked with its plate and its piece's plate up. Name them in the record.
- **In the record:** each pod's total before (the committed `pacing-ledger.json` at 274c737) and after, beside C2's estimate.

## Out of scope
- Changing `NOTE_MIN_MS`, `ATTENTION_MAX`, the linger or fade, montage, limelight, or the runtime `place()` rules.
- A `before` hook for method-P items in `pacing-built.ts`.
- Removing `CastLabels`' tag API, and E3–E9.
