# Packet E5: The director
Risk: medium (a new pure pass that picks every moment's form, read by the schedule and the planner through the schedule's limelight, so seek and play share it; E5b also changes the clock's pace) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 390d2cd

**Split: three sequential builds from this packet**, each gated and committed before the next: **E5a** (the director's pass: the item's Decided rules, and the trade-down to short forms over the target), **E5b** (the first two levers past the target: montage the routine, adaptive speed), **E5c** (the last two: light work for more rules, fewer hero shots). Records go in `work/E5a/`, `work/E5b/` and `work/E5c/`. Each build regenerates the ledger (`npm run pacing -- --candidates`) and gives every pod's total before (the committed `pacing-ledger.json` at that build's start) and after, with the levers used.

## Acceptance
- Unit tests: every captain with a merge gets at least one volley; every close is a volley or its short form;
  each day has exactly one full-form climax; the pass is deterministic over the goldens.
- The ledger: Pulsar is inside HG-C's target, and Comet is within 5% of its measured length.
- The History-agreement case in `solar-dense.spec.ts` passes.

**Which part meets which line.** E5a meets lines 1 and 3, and reports line 2's numbers. E5b and E5c meet line 2. HG-C's levers row extends line 1 (see Excerpts): on a pod where the director used `fewer-heroes`, "every captain is named at least once" replaces "at least one volley".

**Comet's yardstick (the orchestrator decides).** HG-C wrote "Comet within 5% of its 67.3 s" (C1's measure). E1 to E4, all accepted, have already taken Comet to 61.8 s (61 845 ms, −8.2%). This packet reads "its measured length" as the ledger's Comet total at this packet's start commit (61 845 ms): the director must move Comet by less than 5%. E5a's rules leave Comet unchanged: both its merges close their work, no rule plays twice in a row, and it is under the target. If the human meant 67.3 s, line 2 can't be met by a director that only shortens.

## Approach
**Terms.** A *moment* is a protected draft that isn't an arc close (an arc close rides its merge, M-23). *Episode order* is beat index, then base start, then turn key. A *day* is `localDay(beat's first event, tz)`, as limelight reads it. A moment's *played rule* is `agent.progress` for a progress beam, else its rule id. Its *people* are |agent ∪ support| after `arcsOf`. A *volley* is an `attachment.merge` play in any form (full, `first`, short; montage in E5b).

**E5a: the pass**
1. **Types.** In `contracts/playback.ts`:
   - `MomentForm = 'full' | 'short' | 'progress'` (E5b adds `'montage'`, E5c `'light'`).
   - `Direction { forms: ReadonlyMap<turnKey, MomentForm>; climaxes: ReadonlySet<turnKey>; levers: readonly string[]; estimateMs: number }`.
   - `Limelight.direction?: Direction`.
   - In `contracts/maneuver.ts`: `PlannedManeuver.climax?: true`.

   Forms are keyed by the turn key as drafted (`eventKey|attachment.merge`); no entry means `full`. Why on the limelight: it already reaches every planner call (play, tell, the ledger, the seek-adjacent tell) from the one schedule. So seek and play can't diverge, and no renderer glue changes.
2. **`maneuvers.ts`.**
   - Export `momentsOf(h, events, f, rules, prio, seq)`: one beat's base drafts (no limelight, no direction) after `sequence`, as plain `{ key, eventKey, rule, variant?, protect, arcClose, arcMerge, agent?, people, targets, subject?, startMs }`.
   - `draftsOf(…, ll?, dir = ll?.direction)` applies the forms as each draft is built, before `arcsOf`:
     - `short` takes `shortForm(rule, v?.name)`'s phases and name (with none, the moment stays full).
     - `progress` (merges only) takes the `agent.progress` rule from `rules`, its own `cast(mv, e, f)` and phases: not protected, no holds, and `directed: true`.
   - A directed draft is always named: `applyLimelight` skips it, and `turnsOf` marks it `always`. So every moment names its ADO cause (PA-Q3).
   - `dir.climaxes` sets `climax` through `planned()`. `turnsOf` gains a trailing `dir?`.
3. **`engine/director.ts`** (new): `DIRECTOR_TARGET_MS = 300_000` (a 15 §10 row) and `directorOf(h, beats, f, rules, prio, tz, seq?, targetMs = DIRECTOR_TARGET_MS): Direction`. The steps run in this order:
   - **a. Closing merges (E5-Q1).** A merge closes its work when, for some piece in its `targets`, it is the last merge targeting that piece at or before that piece's next close moment (arc closes included), and `workingHours(merge, close, tz) <= ARC_WORK_HOURS`. Times are real (`realTimeOf ?? occurredAt`), with ties broken by event key. This is B-12's own test, read per merge. `arcsOf` alone won't do: Halcyon has no same-beat arcs, so it would turn every merge into a beam.
   - **b.** Every moment starts `full`. A merge that doesn't close its work and isn't `first` becomes `progress`.
   - **c. The daily climax.** For each day, the moment with the most people; on a tie, a close (a close rule, or an arc merge); then the longer full form; then episode order. The climax is `full`: a `progress` candidate is promoted to a volley.
   - **d. Hero shots.** Each merge author left with no volley gets their earliest merge back as `full` (C2's model used the first merge too).
   - **e. Monotony.** Within a day, in episode order, a `full` moment whose played rule equals the previous moment's becomes `short`. Exceptions: the climax, and a moment with no short form (`first`).
   - **f. The target.** `estimateMs = OPENING_ORIENT_MS + FINAL_HOLD_MS + GAP_MIN_MS + Σ (turnsOf(beat, dir).durationMs + GAP_MIN_MS)`, summed over the beats with a positive length that hold a moment or are High. Why it bounds the real length from above: the schedule's 45 s budget is far below the 5 min target, so every gap is squeezed to `GAP_MIN_MS` and every other beat is cut, and limelight only shortens. When the estimate is over `targetMs`, every `full` non-climax moment with a short form becomes `short`, `levers` becomes `['short']`, and the estimate is re-run.

   Deterministic: iterate sorted arrays only, and build every Map in episode order.
4. **`pacing()`.** The limelight hook calls `directorOf` first, then `limelightOf(…, seq, direction)` (a new trailing `dir`, passed on to `turnsOf`), and returns `{ ...ll, direction }`. `PacingOptions` gains `direct?: false` (the ledger's "before") and `targetMs?`. In `schedule.ts`, `spotlightsOnTurns` returns `{ ...ll, spotlights }`: today it drops every other field.
5. **`pace.ts`** (the E4d review's Minor). Name each form's phases once (`LANDING`, `LANDING_BEAMED`, `STRIKE`, `STRIKE_BEAMED`, `LINK`, `HOMEWORLD`, `ALL_CLEAR`), and use the same constant in `phases` or `variant` and in `short`. Then a retime can't leave a short form stale.
6. **The renderer** (the E4d review's nit).
   - `landing.ts:46` and `strikeRun.ts:51` test `m.variant?.startsWith('beamed')`, so `beamed-short` fires its stations. `stationFire` already fits a 1.56 s act (0.6 s charge, 0.81 s fire).
   - In `maneuverDemos.ts` `demoCases`: for each case whose rule has a short form for its variant, add a `<id>:<short name>` case: the same play with the short phases and name. Then every short variant has a gallery cell.
7. **The ledger.**
   - `EngineInputs.direct?: false` and `targetMs?` reach `pacing(...)` (`scheduleOf` takes the explicit path when either is set).
   - `pacing-built.ts`: every existing row runs with `direct: false` in both of its runs, so it keeps measuring what it measured. A new **E5a** row: before `{ direct: false }`, now today's, with C2's E5 `savingMs` as its estimates.
   - `pacing-candidates.ts`: prefix E5's assumption with "Built (E5a): …; see *Built*."
   - The ledger's Summary gains a Target column (`ok`, or the seconds over 300) and a Levers column.
8. **Docs, in the same change.** 03 is normative: call it out in the record.
   - **05:** a new **§8.5c The director**, with P-20 (the forms: the volley, the progress beam, the hero shot), P-21 (monotony), P-22 (the daily climax) and P-23 (the target and its levers, in order). In §8.4(b), the `agent.progress` note becomes an M-30 row.
   - **15:** in §7, `agent.progress`'s trigger and the short variants' *When*; in §10, the target row.
   - **13:** §6's Progress beam row (`docs/13-game-design.md:692`).
   - **03:** the v1.2 field list near line 1444: `Direction`, `Limelight.direction`, `PlannedManeuver.climax`, `directorOf`, `momentsOf`, `PacingOptions.direct` and `targetMs`, and `turnsOf` and `limelightOf` with `dir`. Also the `planManeuvers` prose at 1092.
   - **`tests/README.md`:** map `engine/director.ts` to `director`, `maneuvers`, `solar-dense` and `solar-play`.

**E5b: montage and speed.** Each lever runs only while `estimateMs > targetMs` after `short`, in this order, with a re-estimate after each.

9. **Montage the routine** (`'montage'`).
   - Which moments: a non-climax moment whose played rule equals the previous moment's that day, other than a `first` merge or an arc merge (its holder is named *Closed it*).
   - How it plays: its short form, still protected, with no held turn (`durMs = spanMs`) and no crew named. It lights one plate: `PlannedManeuver.plate`, its first lit piece (`attends` 1), with `montage: true`.
   - The interpreter's label path lights only `m.plate`, with its event's note, and names no crew when `plate` is set. `crewHoldMs`, `releaseOfPlay` and `releaseOf` treat `plate` like `quiet`: the ships leave as the work ends.
   - So each moment is named in History and on one note.
10. **Adaptive speed** (`'speed'`).
    - `Direction.tempo: ReadonlyMap<beatIndex, number>` holds one factor k for every beat with no climax.
    - k is the least multiple of 0.05 in [1, `TEMPO_MAX` = 2] (a 15 §10 row) with `C + (E − C) / k <= target`, where C is the climax beats' share of the estimate (their length plus the gap before each); if none works, 2.
    - **Schedule:** a beat's tempo runs from its start to the next beat's start; the orientation plays at 1×. Add `BeatSchedule.tempoAt(x)` and `wallMs` (Σ length ÷ tempo).
    - **Clock:** `advance` moves x by wall × rate × `tempoAt(x)`.
    - **`playback.ts`:** `setMotionRate(clock.rate × tempo)`; tempo changes only at beat starts, where `publish()` runs. `followGate`'s reach and advance use rate × tempo.
    - x, the ruler and every seek are unchanged, so INV-15 holds by construction.
    - The ledger reports `wallMs` as Total, and `pacing.test`'s total check compares against `wallMs ?? totalMs`.

**E5c: light work and fewer heroes.** Each lever runs only while the estimate is still over the target after `speed`. Then k is recomputed as the least that meets the target.

11. **Light work for more rules** (`'light'`).
    - Which drafts: every `attachment.open` (except one placed ahead of a moment in its beat), `objective.underway`, `objective.nearing` and `threat.engage` (a Bug's underway and nearing).
    - These become `light`: `draftsOf` drops them, so the event falls to light work (`lights`) and costs the schedule nothing.
12. **Fewer hero shots** (`'fewer-heroes'`): undo step d, so hero shots return to `progress`. Each captain is still named at least once, because limelight names everyone's first turn and a directed beam is always named.

## Files
- `src/shared/engine/maneuvers.ts` 54–80, 150–284 (`Draft`, `applyLimelight`, `turnsOf`, `draftsOf`), 286–330 (`arcsOf`), 357–446 (`sequence`, `shapeOf`, `planned`), 486–535, 554–605 (`PacingOptions`, `pacing`)
- `src/shared/engine/limelight.ts` 29–76; `src/shared/engine/pace.ts` 83–124, 406–590
- `src/shared/playback/schedule.ts` 91–142, 249–316; `storyTime.ts` 67–75, 148–165; `workHours.ts` 30–39; `constants.ts` 7, 27–28
- `src/shared/contracts/playback.ts` 21–70; `src/shared/contracts/maneuver.ts` 38–72
- E5b: `src/shared/playback/clock.ts` 96–103; `src/renderer/src/playback.ts` 241, 376–400; `src/renderer/src/chart/art/motion.ts` 20–26; `src/renderer/src/chart/fx/commands.ts` 115–120; `src/renderer/src/chart/fx/v1/interpreter.ts` 592–622
- `src/renderer/src/theme/starChart/maneuvers/landing.ts` 40–55, `strikeRun.ts` 45–60, `stationFire.ts` 11–14, `progressBeam.ts`, `powerLink.ts` 100–160
- `src/renderer/src/gallery/maneuverDemos.ts` 246–320
- `scripts/pacing-ledger.ts` 28–60; `scripts/pacing-built.ts` (all); `scripts/pacing-candidates.ts` 150–180, 262–280, 318
- `tests/unit/maneuvers.test.ts` (the E4 dependency sweep: the pod loop to copy), `pacingBuilt.test.ts`, `pacing.test.ts` 31–45, `limelight.test.ts`, `docTables.test.ts` 628–695, `replay.test.ts` (the clock's cases); `tests/golden/solar.test.ts` 1–60; `tests/e2e/solar-dense.spec.ts` 295–361; `tests/drive/steps/c2-standby.ts` 1–40
- `docs/05-playback.md` 674–777; `docs/15-reference.md` 806–841, 1183–1215; `docs/13-game-design.md` 692; `docs/03-contracts.md` 1026–1040, 1089–1098, 1436–1470

## Excerpts
- Scope (27 E5, Decided): "A close plays the station volley. A merge that doesn't close its work within the arc window is a progress beam (E3), except that each captain with a merge in the episode gets at least one volley: their hero shot. When the same choreography would play back to back, or the episode would run over HG-C's target, the moment trades down to its short form (E4). *Daily climax:* each working day's biggest moment (most participants, then the close) keeps its full form. Seek and play read the same pass (INV-12). Abstract the motion, never the names (PA-Q3, decided): every moment names its ADO cause."
- HG-C (27 Decisions, 2026-11-01): "a **5 min cap** at 1× for every pod, and Comet within 5% of its 67.3 s. The cap is the director's target and is soft: a pod that misses it after E is built is reported with numbers at the final check; the hard check is 'no worse than the modelled stack'."
- HG-C's levers: "past the target, the director (E5) may use, in order: montage the routine (non-climax moments of one kind fold into a quick montage, each named in History and on one note), adaptive speed (stretches between climaxes play faster, up to about 2×; climaxes at 1×; the drawn sequence is unchanged), light work for more rules (open, underway, nearing), then fewer hero shots ('each captain named at least once' in place of 'one volley each'). R13 holds throughout. E5's acceptance gains these levers."
- E5-Q1: "the arc window is 24 working hours (B-12's arc)". B-12 (`storyTime.ts`): "A story or bug's close joins the moment of the last merge of a PR that served it, at most `ARC_WORK_HOURS` working hours before it."
- The E4d review: "the Minor (short forms copy their source phases by hand; only the plain closes are tested against their source) and the nit (the renderer keys station beams on `variant === 'beamed'`, so `beamed-short` would draw none …) go to E5, which first plays short forms."
- Block C audit Minor 1: light work "names a real cause (R13), so it isn't ornament … E5's 'light work for more rules' lever is unaffected."
- INV-15: "Only forward play animates; seeks snap." R13: playback explains itself.
- `literalFence.test.ts`: no `station`, `asteroid`, `enemy`, `shuttle`, `hive` or `dreadnought` in `src/shared/engine/**`, comments included. Write *facility* and *piece*.
- C2's E5 estimates (ms; Comet, Nova, Quasar, Pulsar, Convoy Planning, Harbor): 0, 11100, 308880, 80220, 0, 3980.
- Totals at the start commit (s; same order): 61.8, 235.8, 1050.2, 670.4, 189.6, 199.4. The E4d ceiling (every protected moment short) puts Pulsar at 562.9 s, so the levers are needed.
- A planner probe of step a: the merges that don't close their work are 0, 1, 34, 9, 0 and 0 (same order), and every author already has a volley.
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "Normative docs … a departure means amending the doc in the same change, and saying so in the run record." "Goldens: update only the golden your item meant to move; check its diff line by line." Lens: "check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)."

## Checks
- **New `tests/unit/director.test.ts`** (180 s timeout). Over every pod of `resolvePods()`, with `scheduleOf` and `planOf` for each played beat:
  - every merge author (the agent of each `attachment.merge` play, and of each `agent.progress` play whose event is `pr_completed`) is the agent of a volley. With `fewer-heroes` in `levers`, of a named play instead.
  - every close move drafted in a played beat plays as its close rule, in a full, `beamed`, `arc`, short or montage form; none is a progress beam, and none is missing.
  - each day that has a moment has exactly one `climax` play, and its phases are its rule's or variant's own (not short, montage or progress).
  - within a day, no two consecutive moments are both full forms of one rule, unless the later one is the climax or has no short form.
  - two fresh `resolvePods()` builds give identical Directions (serialised in sorted order).
  - with empty `levers`, `estimateMs <= targetMs`; on every pod, `estimateMs >= sch.totalMs` (`wallMs` from E5b).
  - with `targetMs: 1` on Harbor, `levers` holds `short`, and every non-climax moment with a short form plays it.
- **New golden: `tests/golden/director.test.ts`** writes `__golden__/director.json`: per pod, the levers, the estimate, the form counts and each day's climax key. That is "deterministic over the goldens". No existing golden should move: the schedule goldens are v0 schedules, and the solar goldens are plans and scenes. If one moves, stop and record it.
- **Other tests, new or moved** (name each in the record):
  - `maneuvers.test.ts`: every short form equals `shortOf(its source, keep)`, for all five rules and both beamed variants.
  - `pacingBuilt.test.ts`: the E5a rows exist on all six pods with `savedMs >= 0`, and Comet's |saved| is under 5% of its before. Relax E1's exact check to 5% per pod only if `direct: false` doesn't keep it, and record the numbers. E5b and E5c: Pulsar's now total is ≤ 300 000 ms, and Comet is within 5% of 61 845 ms.
  - E5b, in `replay.test.ts` or a new `tempo.test.ts`: at tempo 2, `advance` moves x twice as far; a seek lands on its x whatever the tempo; `wallMs` = Σ length ÷ tempo; `tempoAt` is 1 on a climax beat.
- **Mapped units:** `npx vitest run tests/unit/director.test.ts tests/unit/maneuvers.test.ts tests/unit/limelight.test.ts tests/unit/scheduleHooks.test.ts tests/unit/sceneplay.test.ts tests/unit/solarSeek.test.ts tests/unit/crossedAccents.test.ts tests/unit/castLabels.test.ts tests/unit/commands.test.ts tests/unit/docTables.test.ts tests/unit/rulebook.test.ts tests/unit/literalFence.test.ts tests/unit/pacing.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacingBuilt.test.ts tests/golden` (E5b adds the clock's file), then the gate.
- **E2E, one at a time.** Each build: `npm run e2e:spec -- solar solar-play solar-dense gallery-assets`, then `npm run e2e:keystone`. Quote the History-agreement case's result (acceptance 3). E5b also runs `perf`: the seek check fails at 274c737 too (a known red), so report it before and after.
- **Perf, relative:** time the warm schedule build for Quasar and Pulsar before and after, in the same run, and report the ratio.
- **Stills for the gate.** A drive step, `tests/drive/steps/e5-director.ts` (modelled on `c2-standby.ts`: into Quasar Pod, `beatTimes()`, `setScheduleMs`), shoots a progress beam at its act, a `short` Power link at its echo, and a day's climax; E5b adds a montage moment. Copy the stills to `work/E5/` as `e5a-*.png` or `e5b-*.png`, and name them in the record. The gallery's short cells, in full and reduced motion, are covered by `gallery-assets`.

## Out of scope
- E6's volleys (merges grouped into one formation), E7's sweep, E8's tempo curve and shorter day turns, and E9's camera, which will read `climax`.
- The target as a device-profile value. HG-C set one cap for every pod and device, and the hierarchy's pacing hook doesn't see the profile: a constant with a 15 §10 row and a `PacingOptions.targetMs` override.
- *All events* mode (budget Infinity): the estimate assumes cut beats, so the director may use fewer levers there.
- Task updates as progress beams (U6 named them; the item's Decided names merges only).
- The morph's wall clock under adaptive speed (as at 2× today).
- The activity level's gate on light work: at Calm, a `light` move shows no sortie, and History still lists it.
