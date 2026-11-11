# Packet E4: Short forms and overlaps
Risk: medium (the beat sequencer, the first merge's phases and the station art's transform change; seek and play read one plan, and the transform is art motion, not stage) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: efdd54b

**Split: three sequential builds from this packet**, each gated and committed before the next, named after C2's candidate rows: **E4a** (U1), then **E4bc** (P3 and P4: one function, `sequence`), then **E4d** (P7). Each build regenerates the ledger. Each build record gives every pod's total before (the committed `pacing-ledger.json` at that build's start) and after, beside C2's estimate.

## Acceptance
- Unit tests (`maneuvers.test.ts` and the schedule goldens): acts keep their order, and no actor is in two
  acts at once. The goldens are updated, and the packet names every change.
- `solarSeek` and the specs that check seek and play agree stay green.
- The ledger shows each part's saving per pod.

## Approach
**E4a, U1: transform from the gather.**
1. `pace.ts`: the merge's `first` variant becomes tell 300, gather 900, **act 2300**, land 500, echo 3000, disperse 900 (7900 ms, was 11100); `holds: ['facility']` stays. Why 2300, not C2's 3500: the station's charge is 700 ms (`LINK_CHARGE_MS`), so it fires at 300 + 900 + 2300 + 500 + 700 = 4700, exactly when the longest transformation (Wars, 4.4 s) started at the gather (300) ends. It fires off the energy chain as any merge does, only 0.7 s later. C2's 3500 waits an extra 1.2 s for nothing. Comment the arithmetic at the variant.
2. `powerLink.ts`: issue `cmd.act(f.key, 'transform')` at the start of `gather` (delay 0) when `m.variant === 'first'`, and remove it from `act`. `facility.ts`: `acts.transform = (art) => art.beginTransform()`.
3. `dreadnoughts.ts`, a new `beginTransform()`: if it can't transform, or under reduced motion, or before the first tick, do nothing (the look then cuts at the land as today). If it is already in the robot pose, `note('armed', 'already-second-form')`. Otherwise start the morph now (as `retarget`'s played branch does), set a private `leading = true`, and `note('played')`. In `retarget`, while `leading`, a stage whose form is `ship` (the dock act at the act's start, its rest, any act's stage) keeps the pose and the morph: `showForm()` and return. A stage whose form is `robot` (the look landing at the land) clears `leading` and takes the normal path, so the morph runs on or, if it has finished, nothing is cut. A new `settleForm()`: if `leading`, clear it, stop the morph, `setPose(this.state.form)`, `showForm()`, `note('interrupted', 'scrubbed-back')`. `StationView.settle()` (`standby.ts`) calls `this.art.settleForm?.()`. So a seek or scene entry mid-merge snaps the form to the stage (INV-15). Keep `expectTransform` (the gallery's `go=1` path doesn't use it, but leave it).

**E4bc, P3 and P4: in `maneuvers.ts` `sequence`.** Types: `SequenceOptions { seams: boolean; near: boolean }`, default `SEQUENCE_ON` (both true). Threaded as `PlanOptions.sequence?`, `PacingOptions.sequence?`, a trailing `seq?` on `shapeOf`, `turnsOf` and `limelightOf`, and `sequence(drafts, seq)`. The app never sets it: it exists so the ledger can measure each part with it undone.

4. **P3 (seams).** "Share no actor at the act" means the code's `ACTING` roles (subject, agent, support, attachment, target). Where `d` waits for `p` through `blocks` (P-3, P-4) and `!shares(p.acting, d.acting)` (only `holds` binds them: a first merge's station), the bound is `seamStartMs(p, d) = end(p) − min(echo + disperse of p, claimMs(d.phases))` instead of `end(p)`. So `d`'s act starts at or after `end(p)`, and only its tell and gather overlap `p`'s echo and disperse. Sharing an actor keeps `end(p)` (C2's reading too: its E4b estimate is about 0 s).
5. **P4 (stay near), the schedule.** Add `flying` to `Draft` (`flies(...)`). In `crewBusy`, when `seq.near` and both `p` and `d` fly, the bound is `nearStartMs(p, d) = p.start + max(workEnd(p), releaseMs(p) − gatherAt(d))`. Here `releaseMs` is `crewTimes(phases).leaveMs`, or for a quiet `p` its work's end (its ship leaves then, `crewHoldMs`). `d`'s tell overlaps `p`'s fold, and `d`'s ship sets off as `p`'s leaves, so it never flies home. Otherwise the bound is `end(p)`, as today. Why not C2's `closeMs` start: `d`'s sortie would take the ship over mid-fold, and `crew()` reads the new sortie, so the plate would snap shut. In practice P4 binds only between non-protected sorties, since a shared captain is also a shared actor (`blocks` still holds protected pairs to `end(p)`).
6. **P4, the renderer.** Add `STAY_NEAR_MS = 3000` to `maneuvers.ts` (a 15 §10 row). Add a pure `nearWaits(plays, startOf = (m) => m.afterMs): Map<PlannedManeuver, Map<CanonicalKey, number>>`. For each flying maneuver (it has a gather, its rule is not light, not `turn: false` and not ornament) and each of its crew, find the next flying play in the beat that flies the same person and whose gather starts at or after this one's claim. Its wait is `nextGather − (start + releaseMs)`, kept when it is from 0 to `STAY_NEAR_MS`. In `interpreter.ts` `spawn`, compute this once from `startS` (in ms, after the light-protect adjustment) and pass each maneuver's map to `play()`. In `play()`'s phase loop, a `pursue` call whose `args.pk` is one of that maneuver's captains (map canonical key to projection key through its cast views) gets `waitS = wait / 1000 + 0.2`. `PursueArgs.waitS?`; `Sortie` takes a trailing `waitS = 0` and stays parked after its hold (nosed to the work, plate shut: `crewOpen` still uses `holdS`) for `waitS`, then flies back. The next sortie takes it over from where it is parked, as today. Guests (jumps) are unchanged. The ship waits where it parked, not at the next work, because that spot is only chosen as the next sortie sets off (`clearOfPlate`).

**E4d, P7: short forms.**
7. `pace.ts`: add `SHORT_PACE = 0.6` (a 15 §10 row) and `PaceRule.short?: Readonly<Record<string, readonly PhaseSpan[]>>`, keyed by the form it shortens (`plain`, or a variant name). Add a helper `shortOf(ps, keep: Phase[])` that multiplies each phase by `SHORT_PACE`, rounded, except the phases in `keep`. Add an exported `shortForm(rule, variant?): { name, phases } | null`, whose name is `short`, or `<variant>-short`. The values:
   - `objective.accomplish`: `plain` 2520 and `beamed` 3600, the `land` kept at `CLOSE_SLIDE_MS`.
   - `threat.accomplish`: `plain` 3000 and `beamed` 3840, the `land` kept.
   - `attachment.merge`: `plain` 4320. `first` has no short form: it happens once per station, and the transform floors it.
   - `seat.complete`: 2400.
   - `region.clear`: 1770.

   Nothing plays them until the director (E5) does. `ManeuverRule` (the contract) is unchanged.
8. `docTables.test.ts` `variantsOf`: before its `if (!rule.variant) return out`, add each `shortForm` (all keys of `rule.short`). 15 §7's variants table gains the seven rows.

**All three: the ledger.**
9. Built rows:
   - `pacing-built.ts`: `BuiltItem` gains an optional `inputs?: Partial<EngineInputs>` (what `before` runs with) and `after?: (rules) => PaceRule[]` (what "now" runs with). `EngineInputs.sequence?` reaches `pacing(...)` and `planOf` (`scheduleOf` takes the explicit path when `rules` or `sequence` is set).
   - Rows: **E4a**, `before` = the old `first` phases (act 1600, land 4400). **E4b**, `inputs: { sequence: { seams: false, near: true } }`. **E4c**, `inputs: { sequence: { seams: true, near: false } }`. **E4d**, `after` = every protected rule's variant wrapped to return `shortForm(r, v?.name) ?? v`, named "Short forms (ceiling: every protected moment short; E5 picks)".
   - Estimates are C2's committed `savingMs` (Excerpts).
10. `pacing-ledger.ts` `bindingOf`:
    - A new anchor `seam` (`|seamStartMs − m.afterMs| < 0.5`), keeping the existing cause classification.
    - A new anchor `near` (crew shared, `|nearStartMs − m.afterMs| < 0.5`, cause P-5).
    - Resolve the anchors in the order `end`, `noteEnd`, `claim`, `seam`, `near`, so a 0 ms overlap reads as `end`.
    - The ledger uses `seamStartMs` and `nearStartMs`, exported from `maneuvers.ts` with numeric arguments, so it can't drift from the sequencer.
11. `pacing-candidates.ts`:
    - `advanceOf` returns 0 for the `seam` and `near` anchors (built).
    - `E4A_FIRST` becomes the built phases.
    - Prefix the E4a, E4b and E4c assumptions with "Built (E4x): today's rules already have it, so this row reads about 0; see *Built*." Any residual is a wait the part doesn't cover (say so in the record).
    - E4d stays C2's ceiling model, prefixed "Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling."
    - Regenerate with `npm run pacing -- --candidates`.
12. **Docs, in the same change.** 03 is normative: call it out in each record.
    - **15 §7:** the `first` row (7900; "transforms from its gather; fires as the longest transform ends; nothing else casting the station acts until it ends") and the short rows.
    - **15 §10:** `STAY_NEAR_MS` and `SHORT_PACE`.
    - **05 §8.5:** P-3 and P-4 (P3's overlap), P-5 (P4's start), P-7 ("waits near when the next turn sets off within `STAY_NEAR_MS`"), and a new **P-19** short forms row.
    - **05 §8.4:** the M-1 row (transforms from the gather).
    - **13 §6:** the Power link row ("on a *first* merge the transformation starts with the gather; Act 2.3 s; Land 0.5 s").
    - **13 §4.4** (lines 406–408): its tell and gather may play in the echo and disperse.
    - **03:** lines 1026–1034 (`PaceRule.short?`); 1052–1053 (the `first` act covers the transform, from its gather); 1089–1098 (`PlanOptions.sequence?`, P3 and P4 in Sequencing); the v1.2 field list near 1445 (`PlanOptions.sequence?`, `PacingOptions.sequence?`, `PaceRule.short?`, `STAY_NEAR_MS`, `nearWaits`, `PursueArgs.waitS?`); 2072–2080 (the `transform` act begins it: `played` at the gather).

## Files
- `src/shared/engine/pace.ts` 40–100, 380–412, 474–522
- `src/shared/engine/maneuvers.ts` 54–80, 112–132, 184–225, 273–368, 426–441, 455–509
- `src/shared/engine/limelight.ts` 20–36, 60–66 (E4bc: thread `seq`)
- `src/renderer/src/theme/starChart/maneuvers/powerLink.ts` 73–120; `theme/starChart/assets/facility.ts` 44–60; `theme/starChart/assets/standby.ts` 25–60
- `src/renderer/src/chart/art/dreadnoughts.ts` 820–830, 1008–1160, 1167–1190, 1525–1545
- `src/renderer/src/chart/fx/v1/interpreter.ts` 465–530, 567–575, 667–683; `chart/fx/movers.ts` 233–335; `chart/fx/commands.ts` 45–57, 105–124, 355–366
- `scripts/pacing-ledger.ts` 28–58, 124–146; `scripts/pacing-candidates.ts` 20–24, 67–80, 236–260, 309–330; `scripts/pacing-built.ts` (all)
- `tests/unit/maneuvers.test.ts` 1–30, 226–318, 427–443, 493–506, 784–815; `tests/unit/pacingBuilt.test.ts`; `tests/unit/docTables.test.ts` 628–695; `tests/unit/stationStandby.test.ts` 1–60 (its stand-in art has no `settleForm`: hence `?.`)
- `docs/15-reference.md` 806–841, 1183–1240; `docs/05-playback.md` 687, 744–765; `docs/13-game-design.md` 395–410, 687; `docs/03-contracts.md` as in step 12

## Excerpts
- Scope (27 E4, Decided): "U1: the station's transform runs from the merge's gather, and the station fires when the energy chain reaches the author. P3: a maneuver's tell and gather may run during the previous one's echo and disperse, when they share no actor at the act. P4: a captain whose next turn starts within a window (a 15 §10 value) waits near it. P7: each protected rule gains a `short` variant, which the director (E5) chooses."
- The user (U1): "allowing stations to start their transformations at the start of the maneuver then firing based on the energy beam exchange between captain ships rather than playing the transform on the energy beams of the formation".
- Intake P3: "A beat's length becomes the sum of its acts, not of whole maneuvers; causality is kept, since the acts stay in order". P4: "waits near it instead of flying home and sortieing again … reads as one person working a streak (R8)".
- C2's estimates, ms (`pacing-candidates.json` at efdd54b), as Comet, Nova, Quasar, Pulsar, Convoy Planning, Harbor:
  - **E4a:** 2000, 2000, 16000, 16000, 4000, 6000.
  - **E4b:** 0, 0, 0, 0, 0, 300.
  - **E4c:** 3360, 2980, 23400, 16080, 4400, 6340.
  - **E4d:** 14090, 48240, 250740, 144980, 17020, 29930.

  E4a should save more (3200 per first merge, against 2000). E4c should save less (about the tell, 300 ms, per chained sortie, against C2's fold).
- 05 P-3: "each waits for earlier moments it shares an actor with (subject, agent, support, attachment, target) or that hold a member of its cast". P-5: "Any maneuver waits for every earlier one that flies the same person". P-7: "parked at the act's start, whole at least `CREW_HOLD_MS` past the work … folded over `CREW_FOLD_MS`".
- 13 §4.4: "Nothing else plays at a transforming station. A first merge has its station to itself: another moment that casts it in the same beat … waits for it, so nothing lands the station's second form before the transformation starts." (The look still lands at the merge's land: protected, earliest.)
- INV-15: "Only forward play animates; seeks snap". R8: "every motion means something". R11: a plate shows once its object has arrived.
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "Normative docs … A departure means amending the doc in the same change, and saying so in the run record." "Goldens: update only the golden your item meant to move; check its diff line by line." Lens: "check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)".

## Checks
- **Acceptance 1, a new sweep in `maneuvers.test.ts`** (E4bc; 120 s timeout). For each pod of `resolvePods()` (`scripts/pacing-ledger`), plan every played beat (`scheduleOf`, `planOf`), skipping light maneuvers. A maneuver's *work* is `[start + (act ?? land).atMs, start + workEnd)`. Two maneuvers *depend* if:
  - they share crew and both rules have a turn;
  - either is protected and they share an `ACTING` key;
  - or one's `holds` meets the other's keys.

  For every dependent pair with `p.afterMs < d.afterMs`, assert `work(p).end <= work(d).start`: acts in order, and no actor in two at once. First run it at the start commit. If it fails there (a pre-existing case), narrow it to `act` windows and record why.
- **Unit tests, new or moved** (name each moved expectation in the record):
  - **E4a:** `:236` "room to transform" becomes a check that the first variant fires after the longest transform (`gather + act + land + 700 >= 4400`) and is shorter than 11100.
  - **E4bc, P3:** the `:276` case. `c.afterMs === m.durationMs − min(echo + disperse of m, claimMs(c.phases))`, `c`'s act starts at `m.durationMs` or later, and with `sequence: { seams: false, near: true }` the start is `m.durationMs`.
  - **E4bc, P4:** the `:800` case. `second.afterMs === crewTimes(first.phases).leaveMs − gatherAt(second)`, and with `near: false` it is `first.durationMs`.
  - **E4bc, the cases that move with P4:** `:427` (the starts and the beat length) and `:493` (`a2` after `a1`'s release, not its end).
  - **E4bc, `nearWaits`:** on hand-built plans, a wait within `STAY_NEAR_MS` gives an entry; beyond it, another captain, a light maneuver or `turn: false` give none.
  - **E4d:** each `shortForm` keeps its phase order, the close's land is `CLOSE_SLIDE_MS`, `first` gives null, and the lengths match 15.
  - **`pacingBuilt.test.ts`:**
    - E4a: `savedMs >= estimateMs` on every pod.
    - E4b, E4c and E4d: the rows exist for all six pods, `savedMs >= 0`, and E4d `> 0`.
    - The committed JSON is current.
    - If E1's exact check breaks (a real interaction), relax it to within 5% per pod and record the numbers.
- **Mapped units:** `npx vitest run tests/unit/maneuvers.test.ts tests/unit/limelight.test.ts tests/unit/scheduleHooks.test.ts tests/unit/sceneplay.test.ts tests/unit/solarSeek.test.ts tests/unit/castLabels.test.ts tests/unit/commands.test.ts tests/unit/stationStandby.test.ts tests/unit/docTables.test.ts tests/unit/pacing.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacingBuilt.test.ts`, then the gate.
- **Goldens:** no change is expected to `tests/golden/__golden__/*`. The schedule goldens build v0 schedules with no Solar pacing hooks, and the solar goldens are plans and scenes, not schedules (E2 found the same). If one moves, stop and record it.
- **E2E, one at a time:**
  - **E4a:** `npm run e2e:spec -- solar solar-play gallery-assets`.
  - **E4bc:** `npm run e2e:spec -- solar solar-play solar-dense motions`.
  - **Each build:** `npm run e2e:keystone`.
- **E4a for the gate:** `npm run drive -- tests/drive/steps/solar-merge.ts --paradigm solar` (Harbor Pod, a first merge every 500 ms).
  - Copy the first merge's stills at about 0.5, 2, 3.5 and 5 s into `work/E4/` as `e4a-*.png`.
  - In its dev log, the first merge's `station-form` lines must read `played`, then `finished`, with no `interrupted` or `cut`. Quote them in the record.
- **E4bc on the busy pods:** in the record, give the number of `nearWaits` entries and the mean wait per pod (Pulsar, Quasar), from a throwaway script over `planOf`.

## Out of scope
- The director choosing short forms (E5), volleys (E6), tempo (E8).
- Overlap across beats: beats stay sequential, and P4 is within a beat.
- Shortening a waiting captain's next gather.
- The morph's wall clock at 4× (it outlasts the beat, as today).
- `PursueArgs` for guests.
- Device-profile switches for P3 and P4.
