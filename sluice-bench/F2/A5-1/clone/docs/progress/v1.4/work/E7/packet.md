# Packet E7: Sector sweep
Risk: medium (shared planner and labels code that seek and play both read; renderer look needs the gallery) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 71e98cc06a7be6736a0f6e6ba1d6b0157efefec8

Two sequential builds from this one packet: **E7a** (the sweep inside one beat, end to end) and then **E7b** (the round's first beats fuse into one beat). Records go in `work/E7a/` and `work/E7b/`.

## Acceptance
- A gallery demo, and a unit test: the sweep reveals exactly the beat's creations, and a seek lands on the same board.

## Approach
Measured at the start commit (planner probe; nothing committed). **Halcyon has no creations in the round**: Pulsar 0, Quasar 0, Comet 1, Nova 1. The bursts are in **Harbor Pod** (pod-sprint, Sprint 13: beat 0, 17 arrivals from 4 creators, 12.7 s long because each creator's contacts run one after another) and **Convoy Planning Pod** (meridian-sprint, Sprint 7: beat 0, 23 arrivals from 11 creators, 6.4 s). Check the effect on those two pods, not on Halcyon. Both bursts sit inside a single beat, so no fixture uses the opening fuse (E7b): E7b needs its own synthetic test.

**E7a: one sweep per beat.**
1. **Threshold.** A beat with at least `CROWD_MIN` (4) creations sweeps. A creation is a draft of `piece.appear` or `threat.emerge` whose move is `appear` (a sketch firming up is not a creation). This is where today's crowd already plays quietly and unnamed, so the sweep takes no name away. Below 4, Sensor contact plays as it does today.
2. **New rule** in `pace.ts`: `RULE.regionSweep = 'region.sweep'`, tier `narrative`, `turn: false`, `match: () => false` (the planner drafts it, as `agent.progress` is drafted). Its phases are `sweepPhases(n)` = tell 300, act `min(SWEEP_SPREAD_MAX_MS, n × SWEEP_STEP_MS) + SWEEP_ENTER_MS`, echo 400, with `SWEEP_STEP_MS = 110`, `SWEEP_SPREAD_MAX_MS = 2000` and `SWEEP_ENTER_MS = 1000`. That is the opening's own rhythm (110 ms apart, a 2 s spread at most) plus the 1 s quiet entrance. The rule's nominal `phases` are `sweepPhases(4)` = 2140 ms; the longest sweep is 3700 ms. Put the rule **last** in `PACE_RULES`. Use the literal 4 (pace.ts can't import maneuvers.ts), and add a test that it equals `CROWD_MIN`.
3. **The collapse** happens in `draftsOf`, right after the crowd line and before `joinVolleys`, and only when `rules` contains the sweep rule (so the ledger can switch it off by filtering the rules).
   - The first creation in event order becomes the carrier. Its rule becomes the sweep rule, and its cast is `castOf({ subject: every created piece, seat: their non-null seats })`. It has no agent, support or frontier.
   - Its fields: phases `sweepPhases(n)`, `durMs = spanMs`, `protect: false`, empty `crew` and `holds`, `flying: false`.
   - `attends = 1`: the star's note. The planner and `castLabels` both count it.
   - `sweep = { members: eventKeys in order, counts: { objective, threat } }`, with the counts taken from the pieces' roles.
   - The other creation drafts are dropped.
4. **Sequencing.** In `sequence`, place the sweep first, at 0, before `ahead`. Every other draft whose `all` shares a swept piece starts no earlier than the sweep's end. Today's code doesn't hold a non-protected draft back for a non-protected one, and without this rule a same-beat `underway` would carve a piece that is still hidden.
5. **Limelight and the director.** `applyLimelight` skips a sweep, as it skips `directed`. In `turnsOf` the sweep has `people: []` and `always: true`. `BaseMoment` gains `swept?: CanonicalKey[]`, and `volleysOf`'s `touches` includes it (the B-15 guard sees every swept piece). The director otherwise ignores the sweep: it isn't protected, so it is not a moment.
6. **Plan.** `PlannedManeuver.sweep?: { members: readonly string[]; counts: { objective: number; threat: number } }` is a 03 amendment. In `planManeuvers`, `played` includes the members' event keys, so no member gets light work.
7. **Note.** `sweepNote(h, counts)` goes in `src/shared/packs/events.ts`. It reads `` `${countsLine(t, {...counts, done: 0})} created in ${sprint leaf}` ``, using the source-register `terminology` as `partsOf` does. The sprint leaf is the last `\` segment of `h.scope.sector.path` when the sector is a sprint; without a sprint it drops ` in …`. ADO words come first (R12), and the count is the number revealed (R9).
8. **Choreography.** New file `theme/starChart/maneuvers/sectorSweep.ts`, a `ManeuverDef` with id `region.sweep`, title `Sector sweep` and `reveals: true`. Register it in `index.ts`.
   - Star centre and radii come from `c.board` (centre = the midpoints; rx1 and ry1 = the half-sizes).
   - **tell:** a Nav cyan `ring` tightens on the star (`GEOMETRY.starR` × 2.4 → × 1.1, 0.3 s).
   - **act:** order the subjects with a pure `sweepOrder(subjects, board)` in a pixi-free file, `maneuvers/sweepOrder.ts`. It sorts by normalized elliptical distance `hypot(dx/rx1, dy/ry1)`, then by pk. Let `step = min(SWEEP_STEP_MS, SWEEP_SPREAD_MAX_MS / n)`. Piece i makes its quiet entrance, `enterCmd({ pk, quiet: true }, (i + 1) × step)`.
   - Also in the act: one new `sweep` command, `finaleCmd.sweep({ stops, stepMs, durS: act })`. Its Nav cyan ring runs piecewise-linear through (0, 0.05), ((i+1)·step, stops[i]), and (act, max(1.1, last + 0.05)), so it passes each piece as that piece enters. Its look follows `AllClear`: an ellipse at the frontier ratio, a 16 px glow at 0.1 and a 2.5 px core at 0.6, fading in and out. Define it in `finales.ts` (one of docTables' known command owners) with tier `narrative`, weight 0.5, value 3, cuttable yes, clock `accent`, reduced `skip`.
   - No echo cues (E1: fewer signals). The echo is the note's read time.
9. **Interpreter.**
   - In `play`, a branch ahead of `nameVolley`: when `m.sweep` is set, find the star node and `castLabels.show(starPk, at(claimMs), at(endOfLandMs) + linger, { holdFromS, holdToS, eventKey: m.eventKey, note: sweepNote(...) })`. Don't call `labelCast` and don't name any crew.
   - In `spawn`, keep sweeps out of the crowd: `arrivals = plays.filter((m) => !m.sweep && maneuverFor(m.id)?.reveals)`.
10. **labels.ts (about line 855).** A plate that isn't hover-only wears its cast note when `motion.notes` has one. Today only the star gets such a window: `said = castOnly > 0 ? notes.get(pk) : acting ? {...} : !node.labelOnHover ? notes.get(pk) : undefined`. `raisedTier` already raises a cast plate (`motion.cast`).
11. **Gallery.** `demoCases` picks up Harbor's sweep by itself: it plans pod-sprint without limelight. Check that the cell is titled `Sector sweep`, frames the system with the star in the crop, and loops and clears in both motion modes (`gallery-assets`). If the crop drops `solar` or the star, fix `crop` or `frameOf` for this case only.
12. **Ledger.**
    - `pacing-built.ts`: every item before E7 runs both of its schedules with `rules` minus `region.sweep` (on `now` too, as `after ?? PACE_RULES`). The probe shows that the rules path equals the app path on all six pods, so E1–E6 rows stay exactly as committed.
    - Add `BuiltItem` E7 "Sector sweep": `before: rules.filter(r => r.id !== RULE.regionSweep)`, `directs: true`, and C2's estimates: Comet 0, Nova 0, Quasar 0, Pulsar 0, Convoy Planning −2420, Harbor 5080.
    - `pacing-candidates.ts`: C2's base and `compose` start from `PACE_RULES` minus the sweep, so its committed numbers don't move. Add "Built (E7) … see *Built*" to the E7 assumption.
    - Regenerate with `npm run pacing -- --candidates`. Only the Convoy and Harbor sections of the main ledger should move.

**E7b: the round's first beats.**
13. `openingSweep(h, beats, f, rules, prio, tz): [lo, hi] | null` in `maneuvers.ts`, exported for tests and only when `rules` has the sweep.
    - `lo` is the first raw beat that drafts anything. Extend over consecutive raw beats where every draft is a creation (or the sweep), each beat lies on one local day equal to `lo`'s, and none is empty.
    - Fuse only if `hi > lo` and the creations total at least `CROWD_MIN`. The fused beat then sweeps through step 3.
14. In `pacing().limelight` (directing only; `direct: false` keeps today's beats): compute `op = openingSweep(...)` over the raw beats, and `vs = volleysOf(...)` over the raw beats as today. The fuse is `sort([op, ...vs.fuse])`. The two are disjoint because an opening beat holds no merge. Fuse the beats with it, and pass `{ fuse, volleys: vs.volleys }` to `directorOf`.
    - In `directorOf`, `carried` (and `base`) must carry `fuse` when it is non-empty even with no volleys. Today it is dropped unless `volleys.size > 0`. Nothing changes when the only fuse comes from volleys.
    - Volley x stays measured on the raw beats. That is slightly off after an opening run; accept it and note it in 05 B-22.

Docs, in the same builds: 05 §8 (P-12 revised; a new **M-32** Sector sweep, E7a; a new **B-22** The opening's creations fuse, E7b; and `region.sweep` in the "what plays" table, which `rulebook.test` requires); 03 (`RULE`, `PlannedManeuver.sweep`, `BaseMoment.swept`, `openingSweep`, `sweepNote`); 13 §6 (a Sector sweep row); 15 §7 (a maneuvers row with Length 2140), §8 (a `sweep` command row and Sector sweep effect-audit rows), §9 (the Story created and Bug created rows: "four or more in a beat: Sector sweep"), §10 (one row for the three `SWEEP_*` constants; the `CROWD_MIN` row's meaning revised); tests/README (a mapping row).

## Files
- `src/shared/engine/pace.ts` 19–37 (RULE), 91–124, 400–613
- `src/shared/engine/maneuvers.ts` 35–45, 85–90, 155–253 (Draft, applyLimelight, turnsOf, BaseMoment, momentsOf), 316–420 (draftsOf, joinVolleys), 555–620 (sequence), 645–662 (planned), 720–735 (planManeuvers), 765–828 (pacing)
- `src/shared/engine/director.ts` 65–72 (carried), 255–283 (volleysOf touches)
- `src/shared/contracts/maneuver.ts` 60–96; `src/shared/contracts/playback.ts` 76–90 (Direction.fuse)
- `src/shared/packs/events.ts` 1–35; `src/shared/engine/terminology.ts` 75–86 (`countsLine`)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 540–575 (crowd), 577–610 (play's label branch), 735–765 (enterQuietly)
- `src/renderer/src/chart/labels.ts` 770–860
- `src/renderer/src/theme/starChart/maneuvers/sensorContact.ts`, `regionClear.ts`, `index.ts`; `theme/starChart/finales.ts` 81–160; `theme/starChart/entrance.ts` 105–113
- `src/renderer/src/gallery/maneuverDemos.ts` 196–330
- `scripts/pacing-built.ts` 30–125; `scripts/pacing-candidates.ts` 283–300, 330–350
- Tests: `tests/unit/maneuvers.test.ts` 50–75 (board helper), 566–575 (crowd test); `tests/unit/pacingBuilt.test.ts` 100–140; `tests/unit/solarSeek.test.ts` 100–112, ~357 (`mini` DSL scenario); `tests/golden/director.test.ts`
- `tests/drive/steps/e6-volley.ts`, `c11-labels.ts` (opening Tidewater Array → Sprint 13 → Harbor Pod)

## Excerpts
- 27 E7 Decided: "Creations within one beat, or in the round's first beats, play as one sweep from the star that reveals each in turn, with one note naming the count and the sprint."
- 05 P-12 (today): "4+ arrivals in a beat come in quietly, a little apart, with no plates" (`enterQuietly`, `entrance.ts`).
- 05 P-6: "At most `ATTENTION_MAX` (4) labels at once … A crowd of arrivals (`CROWD_MIN`, 4) asks for none."
- 05 B-21: "No event is re-timed (B-14 holds) and a seek snaps to the fused beat's end state (INV-15). A fuse never crosses a day turn."
- Scope rules: INV-12 and INV-15 ("playing to *x* and seeking to *x* draw the same thing"); B-15 ("order within a piece is never broken"); R9; R11; R12; R13.
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "The effect where it's meant: check the change on the busy fixtures it's for." For E7 those are Harbor and Convoy Planning. "Goldens: update only the golden your item meant to move; check its diff line by line."
- Literal fence (`literalFence.test.ts`): engine files must not contain `'User Story'`, `'Bug'`, `'Task'`, `'Feature'`, `'Pull Request'` as string literals, nor the whole words asteroid, hive, enemy, dreadnought, station or shuttle, **comments included**.
- docTables §7: every `PACE_RULES` rule needs a row and a registered choreography. Effect audit: every registered choreography title needs its cue rows, and a `mutes first` row iff its file calls `repeats(`.
- `maneuvers.test.ts` asserts `PACE_RULES` ids equal `Object.values(RULE)`.

## Checks
New `tests/unit/sweep.test.ts`, using `resolvePods`, `scheduleOf` and `planOf` from `scripts/pacing-ledger`:
1. On Harbor and Convoy Planning, every played beat with at least 4 creations (appear moves of objectives and threats among its events, not Low) plans exactly one `region.sweep`. Its sorted `cast.subject` equals those keys, `sweep.members` equals their event keys, the counts sum to n, `phases` equals `sweepPhases(n)`, and no creation draft is left in that beat. Each of the two pods has at least one such beat.
2. Comet's single creation still plays `piece.appear`. Comet, Nova, Quasar and Pulsar have the same `wallMs` with and without the sweep rule; Comet stays at 61 845.
3. Harbor and Convoy are shorter with the sweep than without it.
4. **The seek.** For the sweep beat b, on a fresh `structuredClone` of the history: the graph at `stateUtc(b.start)` and at `stateUtc(b.start + b.duration − 1)` equals `graphAt(b.sourceUtc)` and holds every swept piece. The graph at `stateUtc(b.start − 1)` holds none of them.
5. The plans are deterministic over two builds. With limelight, the sweep is not `quiet` and has no agent or support.
6. Hand-built board: 4 creations plus an `underway` on one of the created pieces, in one beat. The underway's `afterMs` is at least the sweep's `durationMs`.
7. `sweepOrder` sorts by distance, then pk. `sweepNote` contains n and `Sprint 13`.
8. **E7b.** Hand-built `openingSweep` cases: three consecutive creation beats → [0, 2]; a run cut by a reseat beat; a run cut at a day turn; fewer than 4 creations → null. On all six pods, `openingSweep` is null and the director golden is unchanged by E7b. One end-to-end case on a DSL mini sprint (solarSeek's `mini` pattern): one fused first beat, one sweep, and the seek check from case 4.

Update: the `maneuvers.test.ts` crowd test (566–575) becomes one sweep play. This is a test meant to move; say so. In `pacingBuilt.test.ts`, add E7 rows (six pods, never costing time, Harbor saves) and widen the 130 filter to `!E6 && !E7`. `tests/golden/__golden__/director.json` may move only in Convoy and Harbor's `estimateMs`, `levers` or `tempo`: check it line by line.

Run: `npm test` (sweep, maneuvers, director, volleys, limelight, pacing, pacingBuilt, pacingCandidates, docTables, rulebook, literalFence, castLabels, commands, golden/director); then `npm run e2e:spec -- gallery-assets solar solar-play solar-dense`, plus `npm run e2e:keystone`.

Stills for the gate (E7a): a drive step `tests/drive/steps/e7-sweep.ts`. Open Harbor (as `c11-labels.ts` does), find the first accented beat in `beatTimes()`, play at 1× from just before it, and shoot at the tell, mid-act and the act's end, noting `annotations().notes` (the star's note) and each swept piece's `viewAlphas` reveal time. Then pause, seek to the beat's end and shoot (the same board). Copy the stills to `work/E7/e7-*.png`, with one gallery still of the Sector sweep cell.

## Out of scope
- Sweeps for Halcyon, which has no creation burst. Report this; don't add fixture data.
- Fusing creations later in the round, beyond the opening run.
- History marking every swept event *now*: the note carries the carrier's event key only. Note it under limitations.
- E8 (tempo), E9 (camera), and the block E audit's carried items.

Questions for the builder (decide and record): if `GEOMETRY.starR` doesn't exist, use the plan's star radius, reached through `currentGraph()`. If `c.board` is missing in the gallery crop, take the star centre from `currentGraph().solar.star` inside the `sweep` command, and order by the subjects' distance from (0, 0), the plan's star (`plan.ts:151`).
