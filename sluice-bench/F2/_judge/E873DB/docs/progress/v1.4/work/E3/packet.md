# Packet E3: The progress beam
Risk: medium (a new rule in `PACE_RULES` that never matches, so the schedule and goldens can't move; the gallery and a shared beam command change) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 3fd7800

## Acceptance
- A gallery demo cell, in full and reduced motion, with no console errors.
- A 15 §7 row, and `docTables.test.ts` passes.

## Approach
1. **The rule** (`pace.ts`). Add `agentProgress: 'agent.progress'` to `RULE`, and append a rule to the **end** of `PACE_RULES`, after `agent.light`: `id: RULE.agentProgress, tier: 'narrative'`, with no `protect`, `light`, `variant` or `leads`. `match: () => false`, with the comment "No move triggers it: the director (27 E5) chooses it. Until then only the gallery plays it." Why `match: () => false` and not a new flag: the planner, the ledger and every `matched()` test stay exactly as they are, and E5 can call `rule.cast` itself. Phases: `phases(['gather', 300], ['act', 800], ['echo', 400])`, which is 1500 ms. That is inside 1.2–1.6 s, and it is the length C2 modelled for E5 ("a 1.5 s progress beam"). Why a gather: it makes the beam a turn (a captain does one thing at a time, K rules), and the interpreter names a crew only for a maneuver with a gather (`interpreter.ts` `play()`). The captain is a hero, so the crew gets named. The gather is light gathering, not travel.
2. **Its cast.** For a `settle` move (a merge): `castOf({ subject: [mv.key], attachment: [mv.key], facility: [mv.facility], agent: [author ?? actorOf(mv, e)], target: workOf(f, mv.key, e.occurredAt) })`. This is the merge's cast without `support`, because approvers don't form up. For any other move: `pieceCast(mv, e, f, more)`, where `more` is `{ target: [parentAt(p, e.occurredAt)] }` when the subject is a step (a Task update aims at its Story or Bug), else `{}`. History words are untouched (R13). The plate's note comes from the event (`noteOf` in `play()`), not from the rule.
3. **The choreography**: a new file, `theme/starChart/maneuvers/progressBeam.ts`, exporting `progressBeam: ManeuverDef` with `id: RULE.agentProgress` and `title: 'Progress beam'`. The aims are `present(c, 'target')`. If there are none, use `[aimOf(subject)]` when there's a subject. The captain is `one(c, 'agent')`. It never moves, so issue no `sortie`/`pursue`.
   - **gather**: if the captain is present, a ring of at-rest blue tightens on it: `cmd.ring({ at: a.at, r: drawnR(a) * 2.2, r1: drawnR(a) * 1.1, color: HERO_GLOW, durS: gather / 1000, alpha: 0.7 })`. This is Power link's charge ring, at captain scale.
   - **act**: if the captain is present, one beam from it to each aim, 150 ms apart (most merges serve one piece; every piece whose plate lights gets its beam). At a threat, `themeCmd.phaser({ from: a.at, to: t.at, toR: drawnR(t), durS: act / 1000, scale: PROGRESS_BEAM_SCALE })`. At anything else, `themeCmd.mine({ from, to, toR, durS, seed: t.node.seed, scale: PROGRESS_BEAM_SCALE })`. Weapons go only at enemies, and mining goes at asteroids (13 §6.1). These are the stations' two beams at captain weight: the user's "simple beam shot" next to the stations' "big beam shots". `PROGRESS_BEAM_SCALE = 0.5` is a file-local const (like `powerLink.ts`'s `LINK_MS`; it has no 15 row). Also on a merge, when `one(c, 'facility')` and `one(c, 'attachment')` are both present: `cmd.act(f.key, 'dock', 0, one(c, 'attachment')?.slot)`. Why: the merged tender has to visibly leave its slot (R8: no unexplained change). The station doesn't charge, transform or fire. With no captain present: no beam and no dock ring; the echo still lands.
   - **echo**: a small hit flare on each aim, as the look lands (the look lands at the end of the act, since there is no `land`): `cmd.flare({ at: t.at, r: drawnR(t), color: brighten(HERO, t.node.kind === 'threat' ? 0.2 : 0.3), scale: 1.1, linger: 1 })`. It is the beam's blue, a hit and never a finish (INV-06), and smaller than Power link's 1.5 impact.
4. **Register** it in `maneuvers/index.ts`: import it, append it to `maneuvers` after `captainJump`, and add `agent.progress  Progress beam` to the header comment's table.
5. **`mine` gains a scale** (`theme/starChart/commands.ts`). Add `scale?: number` to `MineArgs`, with the doc "The beam's weight against a station's (27 E3: a captain's progress beam, 0.5)." In `MiningBeam.update`, let `k = this.a.scale ?? 1` and multiply by it: the four beam-layer widths, the muzzle size (26 px), the head size (18 px), the bloom size (the whole `Math.max(R * 2.6, 34 * px)` term), the hot spot size, and the sparks' `r0` and `r1`. The sheath, kerf, debris and ore are unchanged. At the default of 1 every existing call is unchanged. The phaser already has `scale`.
6. **The gallery cell** (`gallery/maneuverDemos.ts` `demoCases`). The rule never plays in `pod-sprint`, so build its case from a merge: in the beat loop, take the first planned `attachment.merge` (any variant) whose `castResolves` passes and one of whose `cast.target` keys is a node in `graphs.after`. Then `e = eventOf(h, m.eventKey)` (`@shared/packs/events`), `mv = f.moves.get(m.eventKey)?.find((x) => x.m === 'settle' && x.to.rung === 'accomplished')`, and `cast = ruleById(RULE.agentProgress)!.cast(mv, e, f)`. The PlannedManeuver is `{ id, eventKey, seed, cast, phases: rule.phases, afterMs: 0, durationMs: spanMs(rule.phases), from/to as the merge's, keys: sorted unique cast keys }`, with no `protect`, `variant`, `holds` or `arc`. The case reuses that beat's cropped before and after graphs, and `box = frameOf(pm, [...before.nodes, ...after.nodes])`. The title is `Progress beam`, and `region` is the region's label. Put it in `found` under `RULE.agentProgress` before the final `PACE_RULES.flatMap`, so it sorts as the last cell. Add a comment saying why the case is derived ("27 E3: no trigger until the director, E5; it replays a fixture merge as the beam").
7. **Docs, in the same change.**
   - 15 §7 `maneuvers`: a row after `agent.light`: `` `agent.progress` | Progress beam | (new, 27 E3) None yet: the director (E5) will choose it for progress short of a close (a merge that doesn't close its work, a Task update); until then only the gallery plays it · none | 1500 | narrative | no | <what you see, from step 3> | `theme/starChart/maneuvers/progressBeam.ts` ``.
   - 15 §8 `effect-audit`: three rows for Progress beam: gather `ring` at-rest blue on the captain, "The captain is about to fire"; act `mine` at an asteroid or `phaser` at an enemy ship, at captain weight, plus `act` dock on a merge, "The captain made progress on the work (on a merge, the PR is in)"; echo `flare` Hero blue, small, "The progress landed". Each row is `—`, `0` and `keep`. The `progressBeam.ts` file marks no `repeats(`.
   - 15 §8 `commands`: on `phaser` and `mine`, add to Meaning ", or (at half weight) a captain's progress on it (27 E3)" and to Looks like ", or a captain's at half weight (`scale`)".
   - 13 §6.2: a Progress beam row (trigger, the sequence from step 3, "None: the captain fires from where it is"). 13 §6.1: on the Mining beam and Phaser rows, add to For "; at half weight from a captain with no charge, the progress beam (27 E3)".

## Files
- `src/shared/engine/pace.ts` 20-37 (RULE), 209-245 (`actorOf`, `subjectOf`, `parentAt`, `workOf`), 268-273 (`pieceCast`), 520-535 (agent.light, the end of the list)
- `src/renderer/src/theme/starChart/maneuvers/captainJump.ts` (the model), `powerLink.ts` 99-160 (dock, ring, flare idioms), `index.ts`
- `src/renderer/src/theme/starChart/commands.ts` 160-175 (FireArgs), 476-616 (`MineArgs`, `MiningBeam`), 720-786
- `src/renderer/src/chart/fx/commands.ts` 25-35, 81-145 (`cmd`, `one`, `present`, `aimOf`, `drawnR`, `phaseMs`); `chart/fx/types.ts` 113-140
- `src/renderer/src/chart/fx/v1/interpreter.ts` 580-620 (read only: plates, crew naming, the look lands at the end of the act)
- `src/renderer/src/gallery/maneuverDemos.ts` 1-30, 120-140, 250-293
- `tests/unit/maneuvers.test.ts` 70-145 (the rule tests), 206-240 (the merge tests and their board); `tests/unit/commands.test.ts` 113-136; `tests/unit/docTables.test.ts` 656-677, 739-769
- `tests/e2e/gallery-assets.spec.ts` 44-70
- `docs/15-reference.md` 806-826, 864-893 (commands), 894-985 (effect-audit); `docs/13-game-design.md` 641-650, 664-690

## Excerpts
- Scope Decided (27 E3): "the captain fires one beam from where it is to the work (an asteroid or an enemy ship), with a small flare as the progress look lands. No formation, no station. It takes about 1.2–1.6 s, is in the narrative tier, and isn't protected. Its History words are unchanged (R13). The director (E5) chooses it; until then, only the gallery uses it."
- The user (U6): "a simple beam shot from captain to asteroid/enemy with no maneuver to make a formation and shoot from the station."
- 13 §6.1: "Ships help people and **fight only threats** … only an enemy takes **weapons fire** … weapons in hero blue, what's given in the softer given blue." Power link's echo: "A hit flare in the beam's blue … a strong hit, never a finish (INV-06)."
- C2's model for E5 (pacing-ledger.md): "Merges with no arc close … become a 1.5 s progress beam."
- docTables §7: every `PACE_RULES` rule needs a row, and each row's Length = the sum of its phases, its Tier, its Protected, its Choreography = `ManeuverDef.title`, and its File exports the def. The effect audit: "choreography … has no row in the effect audit: add its cues."
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." Lens: "Shared Pixi resources … Check that the chart still renders after the new view closes."

## Checks
- **Unit** (`maneuvers.test.ts`, a new `describe('the progress beam (27 E3)')`):
  - (a) `agent.progress` is in `PACE_RULES`: narrative, not protected, 1200 ≤ length ≤ 1600, with a gather, an act and an echo. Its `match` is false for the merge and step-climb moves of the existing `it.each`.
  - (b) Its cast on a merge (reuse the merge board helpers): agent = the author, target = the work, and no `support`.
  - (c) Its cast on a step's climb: target = the step's parent.
  The existing tests should pass untouched. The one-of-every-rule sum goes from 44 815 to 46 315 ms, which is under 47 250. Say so if anything else moves.
- `npx vitest run tests/unit/maneuvers.test.ts tests/unit/commands.test.ts tests/unit/docTables.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacingBuilt.test.ts tests/unit/solarSeek.test.ts`, then the gate.
- **E2E** (acceptance 1): in `gallery-assets.spec.ts`, change `toBe(16)` to `toBe(17)` and update its comment ("…plays somewhere in pod-sprint, or (the progress beam, 27 E3) replays one of its merges"). Add `expect(list.some((d) => d.rule === 'agent.progress')).toBe(true)`. Then `npm run e2e:spec -- gallery-assets solar-play`, then `npm run e2e:keystone`.
- **Goldens and the ledger:** none should move, because the rule never matches. If `npm run pacing` or any golden changes, stop and record it.
- **Look:** open `npm run gallery`, find the *Progress beam* cell (`maneuvers:agent.progress`), and watch one loop in full motion and one with R. In the record, say what aim it drew (an asteroid or an enemy ship) and from which fixture merge, for the gate.

## Out of scope
- Choosing it anywhere in the schedule (E5); a 15 §9 actions row; 05 §8 rules.
- A facility's first merge (`first`, the transform) as a progress beam: E5 decides.
- Retuning Power link, Captain jump or Carve; the cutter; `pacing-candidates.ts`'s 1.5 s constant (E5 should read the rule's length).
