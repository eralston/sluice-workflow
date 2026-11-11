# Packet F2: Summon on the fly
Risk: medium (top of the band: every pod's schedule moves where a station is summoned, and one motion change crosses the engine, the mover, the interpreter and the label layer) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 61e4958

## Acceptance
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

How to read it (decided here): **"its next place"** is the ship's own place (`scene.goalOf`, its rest beside its work, 13 §4). See Approach 6 for the case where a next sortie is waiting. **"The ledger shows the saving per pod"** means a new Built row, `F2`, on all seven pods, Meteor included.

## Approach
1. **The rule** (`pace.ts`). Add `PaceRule.pass?: true`, documented as: "a pass (27 F2): its crew's ship flies through the act's spot without stopping. It holds no turn: the ship is released as it passes, at the act's start, and its plate rides with it from then on (`crewTimes(phases, true)`)." `facility.enter` gets `pass: true` and `phases(['gather', 715], ['act', 1200])`, which is 1915 ms. The tell ring and the land ring go: the flight already announces the station, the blip is the call, and the land ring only muted first (a repeat).
2. **Crew times** (`maneuvers.ts`). `crewTimes(phases, pass = false)`. When `pass` is set it returns `openMs = claimMs` (the blip), `closeMs = openMs + CREW_FOLD_MS + NOTE_MIN_MS` (the plate unfurls at the blip, stays whole for `NOTE_MIN_MS` so its name can be read on a moving ship, then folds), and `leaveMs = openMs` (the release). Pass `rule.pass` at every call site that knows the rule: `draftsOf`'s `durMs` (378, which becomes `max(span, 715) = 1915`), `releaseOf` (308), `releaseOfPlay` (800: look the rule up as `flyingPlay` does), and the interpreter's crew window (618). `heldMs`: for a pass it is `max(durMs, closeMs + CREW_FOLD_MS)`, so the attention budget and the beat hold the plate's whole window. Otherwise it is unchanged. `crewBusy` and `nearStartMs` don't change. With `workEndOf` = the act's end (1915), the same captain's next turn still starts no sooner than the station's arrival ends.
3. **The pass mover** (`movers.ts` `Sortie`). Add a last constructor argument, `pass?: { nameS: number }`. In pass mode `holdS` and `waitS` are 0, whatever is passed. The path is two cubic Hermite legs in time, C1 at the spot:
   - Leg 1 runs from `start` (velocity 0) to `slot` (velocity `vP`) over `outS`.
   - Leg 2 runs from the passed point (velocity `vP`) to the ship's own place, `goalOf(pk) ?? start` read live (velocity 0), over `backS`.
   - `vP`: take `u_in = unit(slot − start)` and `u_out = unit(home − slot)`. If `|u_in + u_out| ≥ 0.5`, the direction is `unit(u_in + u_out)`. Otherwise the turn is sharper (the usual there-and-back), and the direction is `u_in`'s left normal `(−u_in.y, u_in.x)`, so the ship swings past the spot in a loop. Its speed is `|slot − start| / outS`. `vP` is computed once, on the first frame, and kept.
   - After leg 2 the ship sits at `goalOf` until `outS + max(backS, nameS)`, then the mover ends.
   - The ship faces along the sign of its x-velocity. The wake draws only on leg 1.
   - A guest new this beat (`jump`) jumps in at the spot as today (K-13 ends at rest), then takes leg 2 from rest.
   - `crewOpen(foldS)` in pass mode: `h = t − outS`; it is open over `[0, nameS]` as `min(1, h/foldS, (nameS − h)/foldS)`.
4. **The command** (`commands.ts`). Add `PursueArgs.pass?: true; nameS?: number`, documented as "a pass (27 F2): through `to` at `durS` without stopping, on to its own place over `backS`; its plate rides with it `nameS` from the pass". The `pursue` make forwards `{ nameS }` when `a.pass` is set. The reduced substitute stays `snap`.
5. **The choreography** (`stationJumpIn.ts`). Drop `tell`, `land` and the fold ring. The file then calls no `repeats(`, so it imports none.
   - The gather issues `cmd.pursue({ pk, durS: gather/1000, backS: 0.8, pass: true, nameS: (2*CREW_FOLD_MS + NOTE_MIN_MS)/1000, to: spot, look: f.at, wake: 4 })`. `spot` is computed as today (1.9 R out on the summoner's side), and 0.8 s is today's fly-back, now the carry-on.
   - With no ship there, the guest jumps in at the spot with `durS: (gather + NOTE_MIN_MS)/1000`.
   - The act issues the **call blip** first: `cmd.ring({ at: a?.at ?? spot, r: drawnR(a)*1.4, r1: drawnR(a)*3.2, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })`. That is the station ring's 0.7→1.6 shape, at twice the ship's radius, in the same hue. With no ship, use `R*0.35`/`R*0.8`. Then `cmd.act(f.key, 'jump')`, the flare and the station's bloom ring, unchanged. All of these are at delay 0 in one phase callback, so the blip and the jump fall in the same tick.
   - The blip's anchor is the ship's live anchor. In full motion that is the spot, because leg 1 ends at the act's start. Under reduced motion the pursue snaps (it is skipped), so the blip and the arrival play at the ship's own place, as decided.
6. **A next sortie waiting (P4).** The pass never parks, so the `waitS` the interpreter adds (690–705) is ignored in pass mode. The engine starts the same captain's next flying turn no sooner than the arrival ends (1200 ms after the blip), so the 0.8 s carry-on has already put the ship at its place. The next sortie sets off from there, from rest, as every sortie does. Smoothing one pass straight into the next is F3's chain path, not this item. Record this as the reading of "its next sortie if one is waiting".
7. **Labels.** `castLabels.showCrew(…, turn, pass = false)` stores `pass`, and `crew()` returns `pass: true` for it. Widen the crew map's type wherever it is declared (interpreter 279, `switching.ts` 95, `labels.ts` 114). `labels.ts` toggles the class `is-passing` beside `is-acting` (836–840). The interpreter passes `rule.pass` when it names the crew (618–626).
8. **The ledger** (`pacing-built.ts`).
   - Add `BuiltItem.passes?: true` and `all?: true`.
   - Add `const PRE_PASS = (rules) => rules.map((r) => r.id === RULE.facilityEnter ? { ...r, pass: undefined, phases: phases(['tell', 300], ['gather', 715], ['act', 1200], ['land', 600]) } : r)`.
   - In `buildBuilt`, apply `PRE_PASS` to `rules` before `item.before` for every item without `passes`, and pass `rules` explicitly to both runs. This keeps every existing row byte-identical (E1's `before` spreads the pre-pass rule).
   - Append `{ id: 'F2', name: 'Summon on the fly', before: PRE_PASS, directs: true, sweeps: true, rises: true, late: true, passes: true, all: true, estimateMs: {} }`. C2 never modelled it, so it reads 0.
   - Iterate `resolvePods(item.all ? { all: true } : {})`.
   - In `pacing-candidates.ts` 238, E1's candidate rewrites only the gather's length (`phases(...r.phases.map((s) => [s.phase, s.phase === 'gather' ? E1_GATHER_MS : s.durMs]))`), so it still reads 0 on today's rules, as its assumption says.
9. **Docs** (same change):
   - **15 §7:** `facility.enter` row: Length 1915; What you see: "The author flies through the spot where it comes in without stopping; as it passes, one At-rest blue call blip, and the station slides in at that instant with an At-rest blue flare and ring; the author carries on to its rest, named (27 F2)".
   - **15 §8 effect audit:** the tell, fold and land rows become `cut`. The gather `pursue` row reads "passes through the spot (a pass)". Add a new act row: `ring` call blip from the summoner, "Who summoned it, at the instant it arrives", carried by "The cast label", 0, keep. The `pursue` command's Looks like gains "or a pass through a point, on to its place without stopping (27 F2)".
   - **15 §9:** the row at 1123.
   - **15 §10:** the rows at 1213 (a pass never parks), 1256 (a pass's plate: from the blip, whole for this long) and 1257 (a pass holds no turn).
   - **13 §6:** the row at 685, and the station row at 570.
   - **05 §8:** M-13, P-7 (a pass holds no turn) and K-4 (a pass's plate rides a moving ship).
   - **03** (normative): add `PaceRule.pass?: true` to the 1027–1033 list and beside 1498, and the `crewTimes(phases, pass)` note at 1104. Call out the 03 amendment in the build record.

## Files
- `src/shared/engine/pace.ts` 44–90 (`PaceRule`), 500–515 (`facility.enter`)
- `src/shared/engine/maneuvers.ts` 41–92 (`NOTE_MIN_MS`, `CREW_*`, `claimMs`, `crewTimes`, `flies`), 300–330 (`workEndOf`, `releaseOf`, `crewBusy`), 370–385, 616–640 (`heldMs`, `attentionFrom`), 653–700 (`sequence`), 798–835 (`releaseOfPlay`, `flyingPlay`, `nearWaits`)
- `src/renderer/src/chart/fx/movers.ts` 238–344 (`Sortie`)
- `src/renderer/src/chart/fx/commands.ts` 45–59, 111–126, 357–370
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 278–287, 515–530, 600–630, 690–705
- `src/renderer/src/chart/fx/v1/castLabels.ts` 38–42, 72–76, 99–113; `chart/fx/v1/switching.ts` 95; `chart/labels.ts` 110–116, 805–840
- `scripts/pacing-built.ts` 8–40, 143–165; `scripts/pacing-candidates.ts` 236–240; `scripts/pacing-ledger.ts` 100–106, 193–222
- Tests: `tests/unit/commands.test.ts` 150–230 (stub scene, recorders, `rig`, `planned`), 481–497; `tests/unit/maneuvers.test.ts` 330–345, 600–610; `tests/unit/pacingBuilt.test.ts` 1–80; `tests/e2e/solar-dense.spec.ts` 400–470; `tests/e2e/gallery-assets.spec.ts` 44–76
- Docs: 15 l.818, 884, 956–963, 1123, 1213, 1256–1257; 13 l.570, 685; 05 l.716, 763, 812; 03 l.1027–1033, 1104, 1498

## Excerpts
- 27 F2 Decided: "The summoner's path passes through the spot without stopping. As it passes, it gives **one call blip**, and the station jumps in at that instant, in the same hue and with the same ring shape … The hold and the fly-back go. The ship carries on to its next place: its next sortie if one is waiting (E4's P4), else its rest beside its work (13 §4). The summoner is named from the blip (E2: plates from the act) and its plate rides with the ship for `NOTE_MIN_MS`. The rule's phases shrink to the flight plus the arrival … Under reduced motion the ship doesn't fly: the blip and the arrival play at its place."
- R8 (13 §1): "A ship travels to a target, interacts, finishes, then moves on." Here the interaction is the instant of the blip. Say so in the 13 §6 row; R8 itself doesn't change. R10: "Identity by more than one cue". The blip and the arrival share a hue and a shape, and they share an instant. R11: "A plate appears once its body is drawn."
- INV-15: "Only forward play animates; seeks snap". INV-20: "Never hue alone … reduced motion".
- 15 §10 (1256): `NOTE_MIN_MS` 1800, "the least a labelled interaction holds its place in the budget … so its note can be read". (1213): `STAY_NEAR_MS` 3000, "waits parked near the work … instead of flying home and out again".
- docTables (§8 effect audit): "a `mutes first` row iff the file marks a call `repeats(`". The maneuvers table's Length must equal `spanMs(rule.phases)`. "each choreography only fills phases its rule plays" (commands.test).
- Project notes: "Goldens: update only the golden your item meant to move; check its diff line by line." "Check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)", which here also means Meteor's 36 summons.

## Checks
New tests:
- `commands.test.ts`, `describe('Station jump-in passes (27 F2)')`:
  - (a) The rule's phases are exactly gather 715 and act 1200, and the choreography fills only those.
  - (b) The gather issues one `pursue` with `pass: true`, no `holdS`/`waitS`, `durS*1000 === phaseMs(m, 'gather')`, `nameS*1000 === 2*CREW_FOLD_MS + NOTE_MIN_MS`, and no `ring`.
  - (c) The act's first call is the blip `ring` at the agent's anchor in `HERO_GLOW`, with `r1/r` equal to the station ring's.
  - (d) A `Sortie` in pass mode on a minimal stub scene (`wake` 0, no jump), sampled every 10 ms. Every step moves (displacement > 1e-6) from the first step until `outS + backS`. At `outS` it is within 1e-6 of the slot, at a speed ≥ 0.5 × `|slot − start|/outS`. It ends at `goalOf`. `crewOpen` is 0 before `outS`, 1 over `[outS + fold, outS + fold + NOTE_MIN_MS/1000]`, and 0 after `outS + nameS`. Run it for a there-and-back case (home = start) and an onward case.
  - (e) The interpreter `rig` with a planned `facility.enter` whose station is new in `after`. Add a logging `act` to the rig's host. The jump act and the blip ring are logged within 50 ms of each other, both within 40 ms after the act's start, and no `hold` is logged. Repeat with `motion.reduced = true`: no `pursue` is made, and the blip and the jump are still within 50 ms.
- `maneuvers.test.ts`: a summon holds no turn. `enter.durationMs === 1915`, `open.afterMs === enter.durationMs`, `crewTimes(phases, true)` gives the values in Approach 2, and the same captain's next flying turn in the beat starts at ≥ `enter.afterMs + 1915`. Use the open-and-merge case at 330.
- `pacingBuilt.test.ts`: `BEFORE_VOLLEYS` stays as is (it proves `PRE_PASS` isolates the old rows). `F2` has seven rows, Meteor last, `savedMs > 0` on every pod with a summon, and Meteor's saving is the largest.
- `solar-dense.spec.ts` 400: sample `is-passing` too. Leave passing episodes out of the "whole ≥ 1400" and "moved < 12" checks. If any are seen, at least one moved ≥ 12 px (the plate rides a moving ship).

Run:
- `npm test`. If a unit test pins a number the summon's saving moves (a beat length, a total, an estimate), update it and list it. **If a property fails (attention budget, B-15, seek = play, one actor one act), stop and report it with the assertion.**
- `npm run pacing -- --candidates`. Expected to change: `pacing-ledger.{md,json}` (every pod's totals; the `facility.enter` rows lose their `hold` and show 1.9 s each), `pacing-built.json` (**only** the F2 rows are added; every earlier row byte-identical, so check that `git diff` only adds lines), and `pacing-candidates.json` (re-run on today's rules, as every E build did). Copy the F2 Built table into the build record.
- Goldens: `npx vitest run tests/golden -u`, then `git diff --stat tests/golden`. Expected to move: **`director.json` only** (each pod's `estimateMs`, and any `forms` or `climaxes` the shorter summons shift; list every changed field). Must not move: every `*.schedule.json`, `*.highlights.json`, `*.seek.json` and `*.scenes.json`, `solar.*`, `meridian.*`, `halcyon-meteor.*`, `v1-awards.json`. They use the v0 schedule (no `beatShape`) or project at UTC playheads. If one moves, stop and explain why before accepting it.
- e2e: `npm run e2e:spec -- gallery-assets solar solar-play solar-dense montage-names camera-directs`, then `npm run e2e:keystone`.
- Stills for the gate: the Station jump-in cell at the blip, in full and reduced motion, saved as `work/F2/f2-jumpin-full.png` and `f2-jumpin-reduced.png` (from the gallery, R toggles reduced motion), plus one drive still of a Meteor summon mid-pass. Name them in the build record.

## Out of scope
- Chaining summons, one smooth path through several spots, and proximity order (F3). A pass flowing straight into the next sortie without coming to rest (F3's path).
- Any other rule's sortie. `crewHoldMs` stays for them.
- Comet getting shorter: report its new App s from the ledger under limitations, for the final check (27 Decisions, 2026-11-06), and don't tune anything back.
- Reduced motion naming no flying crew today (`crew()` reads the mover, and there is none under reduced motion). Note it if seen; don't fix it.
