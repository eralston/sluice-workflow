# Packet E6: Multi-fire volleys
Risk: large (it changes how the schedule groups beats, which seek and play both read (INV-15), and it adds per-cause naming to Power link; E5a and E5c both failed their first review at medium) · Score: blast 1, verify 1, design 1, acceptance 1, track 2
Start commit: 3d4e402

**Split: two sequential builds from this packet**, each gated and committed before the next. **E6a** is the engine: grouping, fused beats, the volley draft, its naming turns, the director, the ledger and the docs. **E6b** is the renderer: every tender docks, causes are named in turns, the e2e case, the gallery cell and the stills. Records go in `work/E6a/` and `work/E6b/`. E6a meets acceptance lines 1 and 3. E6b meets line 2. Between the two builds a volley already plays as one Power link with the union crew, but with one dock and the carrier's note.

## Acceptance
- Unit tests: grouping is deterministic and respects B-15; no group spans a day turn; every participant is in
  its formation.
- `solar-dense.spec.ts`: a Pulsar volley names each cause, with at most four labels at once.
- The ledger shows the saving.

## Approach
**The window (the planner's sweep, 27 Decisions).** These are merges in volleys of two or more, out of all merges, using the B-15 guard below. Playback x comes from today's directed schedule, and `first` merges are eligible:

| Window | Pulsar | Quasar | Nova | Harbor | Comet, Convoy |
|---|---|---|---|---|---|
| 10 s | 6 / 30 | 8 / 66 | 2 / 10 | 2 / 7 | 0 |
| 20 s | **8 / 30** | 14 / 66 | 4 / 10 | 2 / 7 | 0 |
| 30 s | 8 / 30 | 14 / 66 | 4 / 10 | 2 / 7 | 0 |
| 60 s | 8 / 30 | 16 / 66 | 4 / 10 | 2 / 7 | 0 |

No window reaches a third of Pulsar's merges (10). Pulsar's same-repo merges lie far apart, and B-15 caps it at 8. Without the guard, 60 s reaches 10, but the guard is required. So **`VOLLEY_WINDOW_MS = 20_000`**: the smallest window that reaches Pulsar's most (27%). Every Pulsar volley is a pair. E6a re-runs this sweep on the built code (10, 20, 30 and 60 s), records the table, and keeps the same rule: the smallest window at Pulsar's highest count.

**Terms.**
- The *raw beats* are the schedule's groups before fusion.
- *D0* is the director's pass on the raw beats, with no volleys.
- A merge's *x* is its raw beat's start under D0 plus its turn's start in that beat under D0. The beat's start follows the director's own estimate: from `OPENING_ORIENT_MS`, each kept beat (it holds a moment or a High event, with a positive length) starts `GAP_MIN_MS` after the previous one ends. This is x at 1×, the ruler's time, not wall time.
- A merge's *touches* are its moment's subject and targets, with a step mapped to its parent at the event's time.

**E6a: the engine**
1. **Contracts.**
   - `contracts/playback.ts`:
     - `MomentForm` gains `'joined'`: a merge drafted into its volley's carrier.
     - `Volley { members: readonly string[]; lead: CanonicalKey; atMs: readonly number[] }` holds member turn keys in episode order, the carrier (the first) first, and each member's x.
     - `Direction` gains `volleys?: ReadonlyMap<carrierKey, Volley>` and `fuse?: readonly (readonly [number, number])[]`: inclusive raw-beat ranges, sorted and disjoint, only those with last > first.
   - `contracts/maneuver.ts`:
     - `VolleyTurn { eventKey: string; plates: readonly CanonicalKey[]; names: readonly { key: CanonicalKey; eventKey: string; part: 'agent' | 'support' | 'holder' }[] }`.
     - `PlannedManeuver.volley?: { lead: CanonicalKey; members: readonly string[] /* event keys */; turns: readonly VolleyTurn[] }`.
2. **Grouping: `volleysOf(h, beats, f, rules, prio, tz, seq, targetMs, levers)` in `director.ts`.** It returns `{ fuse, volleys }`.
   - Run D0 and take each merge's x.
   - **Candidates** are every merge moment (`attachment.merge`, protected, not an arc close), `first` and D0's progress beams included. That way everyone becomes a hero.
   - **Per facility,** in episode order, greedily: a candidate joins the open group when all of these hold:
     - its raw beat's first and last events and the head's first event fall on one local day (no day turn inside);
     - x − head's x ≤ `VOLLEY_WINDOW_MS`;
     - the **B-15 guard** holds over the range from the head's beat to its own.

     Otherwise it heads a new group. Single-merge groups are dropped.
   - **The guard.** Take the non-member moments in the range and, for each key they touch, the raw beats that hold them. (a) There is at most one such beat per key. (b) If a member touches the key, that beat is at or after the latest member beat touching it.

     Why: in a fused beat the sequencer puts merges first (`leads`, P-3) and protected moments before the rest. So two raw beats' work on one piece, or a member's beam on work touched earlier in the range, would play out of order.
   - **Overlaps.** Sort groups by their head's order and accept each whose range doesn't overlap one already accepted; a rejected group dissolves. Why: it is simple and deterministic, and the guard was computed with those merges counted as non-members.
   - **The lead (E6-Q1).** The author with the most member merges; on a tie, the tied author whose last member merge is latest.
3. **Fusion.** In `schedule.ts`, export `fuseRanges<T>(groups: T[][], ranges): T[][]` (it concatenates each range). `buildBeatSchedule` applies `limelight?.direction?.fuse` to its drafts right after the limelight call and before shaping:
   - events concatenated, foci unioned;
   - `firstUtc` from the first beat, `lastUtc` from the last.

   Beat indices are then the fused ones, which is what the director and limelight used. No event is re-timed (B-14 holds), and seeks snap to the fused beat's end state (INV-15).
4. **`pacing()`'s limelight hook.**
   - With `opts.direct !== false && opts.volleys !== false`: run `volleysOf` on the raw beats, apply `fuseRanges` to the events, then `directorOf(…fused, volleys)` and `limelightOf(…fused, direction)`.
   - Return `direction` with `volleys` and `fuse`.
   - `PacingOptions.volleys?: false` and `EngineInputs.volleys?: false` are the ledger's "before". The app never sets them, and `scheduleOf` takes the explicit path when it is set.
5. **The volley draft (`maneuvers.ts`).**
   - `draftsOf` drafts each member as today. Then, before `arcsOf`, the carrier (its key in `dir.volleys`) takes the union and the `joined` drafts are removed:
     - `agent: [lead]`;
     - `support`: the other authors in member order, then every member's approvers, deduplicated, without the lead;
     - `subject` and `attachment`: every member's attachment;
     - `target`: the union in member order;
     - `facility` as is.
   - The carrier keeps its own form's phases and holds: full, `first` (the facility transforms while every tender docks) or short.
   - `arcsOf` treats the carrier as any merge. It also records each holder on the member whose targets hold the closed piece.
   - Then:
     - `volleyTurns(members, lit)` (exported, pure): one turn per member in order. Its plates are that member's noted targets (the same piece may show again with the next member's note), capped at `ATTENTION_MAX`. Its names are that member's author, approvers and holders not yet named, up to `ATTENTION_MAX − plates`; the overflow carries into the next turn, and extra name-only turns follow the last member.
     - `volleyPhases(ps, turns)` lengthens the echo so that `disperse.atMs ≥ claimMs + turns × VOLLEY_TURN_MS`, where `VOLLEY_TURN_MS = 2 × CREW_FOLD_MS + CREW_OPEN_MIN_MS` (2540, 15 §10). A pair under the full LINK needs no stretch: 1200 + 5080 ≤ 6300.
     - Then recompute `durMs`, `acting`, `crew`, `all` and `attends`.
   - `planned()` writes `volley`. `planManeuvers` counts every member's event as played, so they get no light work.
   - `momentsOf` gains a trailing `dir?`, so the director reads the carrier with the union. `BaseMoment` gains `facility?` and `volley?: { authors }`.
6. **The director on fused beats.**
   - `directorOf` gains a trailing `volleys?: { fuse; volleys }`. Every Direction it builds carries `volleys`, `fuse` and the `joined` forms, so its estimates fuse too.
   - Step b skips carriers: a volley never plays progress.
   - Step d counts a carrier's `volley.authors` as having a volley.
   - Montage skips carriers: a montage names no one.
   - Monotony and the short lever may shorten a carrier, and its turns still stretch it.
7. **The ledger.**
   - `pacing-built.ts`: every existing directed row (E5a–E5c) runs with `volleys: false` in both runs, so its committed numbers stay. Check that pacing-built.json's E1–E5 rows don't move.
   - Two new rows:
     - **E6** "Multi-fire volleys (before adaptive speed)": both runs with `levers: ['short', 'montage']`, before `{ volleys: false }`. This shows the saving before speed re-fits.
     - **E6+** "with every lever": the default levers, before `{ volleys: false }`. Pulsar's wall time stays near its target here, because speed re-fits.
   - C2's estimates are the E6 `savingMs` in pacing-candidates.json.
   - `pacing-candidates.ts`: rename its model constant to `C2_VOLLEY_WINDOW_MS` (its outputs are unchanged), and prefix E6's assumption with "Built (E6): …; see *Built*."
8. **Docs, in the same change** (03 is normative: call it out in the record).
   - **05:** B-20 (a volley's beats fuse) in §8.3b; M-31 *The volley* in §8.4a; notes on P-20 (a volley never plays progress, and its authors have a volley) and P-24 (montage skips a volley).
   - **15 §10:** two rows, `VOLLEY_WINDOW_MS` and `VOLLEY_TURN_MS`, plus a §7 paragraph after the variants table.
   - **03 (1445–1451):** the new types and fields, the `momentsOf`/`directorOf` params and `PacingOptions.volleys`.
   - **`tests/README.md`:** map `volleys` under the director row.

**E6b: the renderer**

9. **Every tender docks.**
   - `cmd.act(key, act, delay, slot)` accepts `slot: number | readonly number[]`.
   - `powerLink.ts` act docks every `attachment` slot at once.
   - The station art's dock (`dreadnoughts.ts` `dockSlot`, `shuttleSlots`) takes a set of slots, a mask. Trace `interpreter.ts:775` → `host.act` → the art.
   - Add a gallery cell "Merged · two tenders dock" in `gallery/v1/stations.ts`, and a `shuttleSlots` unit case.
   - Energy chains every support member → the lead → the facility, as today's `approversOf` does. The split beam already strikes every target.
10. **Naming in turns.** In `interpreter.ts` `play()`, when `m.volley` is set, turn i opens at `claimMs + i × VOLLEY_TURN_MS`. Its plates (`labelCast` with a set in place of `only`) wear `eventOf(turn.eventKey)`'s note and `eventKey`. They end as turn i+1 opens, less `CAST_LABEL_FADE_MS` if the budget needs it; the last turn lingers as today. Its names are `showCrew(pk, from, from + (CREW_FOLD_MS + CREW_OPEN_MIN_MS)/1000, partOf(member event, …, part), eventKey)`, and only for drawn captains, as today. History marks each member's row *now* through its note.
11. **A test hook:** `volleys(): { startMs; endMs; members: string[]; people: number }[]` (the fused beat's start and end, the member event keys, the drawn participants).
12. **Docs:** 13 §6's Power link row (line 688), 15 §7's merge *What you see*, and M-31 marked built.

## Files
- E6a:
  - `src/shared/engine/director.ts` (all).
  - `src/shared/engine/maneuvers.ts` 151–177, 186–265, 300–368, 379–417, 515–531, 576–588, 639–700.
  - `src/shared/playback/schedule.ts` 90–103, 255–290, 320–343.
  - `src/shared/contracts/playback.ts` 37–70; `src/shared/contracts/maneuver.ts` 38–78; `src/shared/engine/pace.ts` 243–270 (`parentAt`, `workOf`), 383, 470–495.
  - `scripts/pacing-ledger.ts` 28–62; `scripts/pacing-built.ts` (all); `scripts/pacing-candidates.ts` 24–30, 186–206, 278–282, 319.
  - `tests/unit/director.test.ts` 1–60; `tests/unit/pacingBuilt.test.ts` 30–70; `tests/golden/director.test.ts`.
  - `docs/05-playback.md` 615–672, 727–737, 768–781; `docs/15-reference.md` 800–860, 1185–1210; `docs/03-contracts.md` 1440–1455.
- E6b:
  - `src/renderer/src/theme/starChart/maneuvers/powerLink.ts` 100–163, `formationSpots.ts`.
  - `src/renderer/src/chart/art/dreadnoughts.ts` 39–110; `src/renderer/src/chart/fx/commands.ts` 95.
  - `src/renderer/src/chart/fx/v1/interpreter.ts` 303–323, 580–622, 770–780; `castLabels.ts` 1–80, 140–170.
  - `src/renderer/src/testHooks.ts` 60–200; `src/renderer/src/gallery/v1/stations.ts` 170–180.
  - `tests/e2e/solar-dense.spec.ts` 295–361 (the sampling), 709–760 (the Halcyon per-test launch); `tests/drive/steps/e5-director.ts`; `docs/13-game-design.md` 688.

## Excerpts
- Scope (27 E6, Decided): "Merges into one repo that would play within a window of playback time (`VOLLEY_WINDOW_MS`, a 15 §10 value tuned at HG-C), and the closes their arcs carry, form one volley: one formation of the union of their authors and approvers, energy chaining to the lead author (see E6-Q1), the tenders docking together, and one split beam to every target. Every participant is named within the attention budget (fair turns, P-17)."
- E6-Q1: "the author with the most merges in the window leads the volley (tie: the last merge's author); the other authors and every approver chain to them".
- The window row: "E6's planner sweeps the ledger at 10, 20, 30 and 60 s and picks the smallest window that groups about a third of Pulsar's merges (10 s groups 1 of 30); judged at the final check".
- B-15 (05 §8.3a): "Order within a piece is never broken; only an arc moves work to another day … no work moves across what places its piece or item". B-14: "PR events never move, since they place things on the board" (fusion moves none).
- INV-15: "Only forward play animates; seeks snap." R13: "Every emphasized interaction names its ADO cause, in the same words as History." P-6: "At most `ATTENTION_MAX` (4) labels at once, counting the pieces' plates … and the captains they name."
- E5's yardsticks hold: Comet within 5% of 61 845 ms (it has no volleys), and Pulsar ≤ 300 000 ms (`pacingBuilt` E5c).
- `literalFence.test.ts`: no `station`, `asteroid`, `enemy`, `shuttle`, `hive` or `dreadnought` in `src/shared/engine/**`, comments included. Write *facility*, *attachment*, *piece*.
- Project notes: "Values: every constant with a row in `docs/15-reference.md` changes with its row, in the same edit." "Normative docs … a departure means amending the doc in the same change, and saying so in the run record." "Goldens: update only the golden your item meant to move; check its diff line by line." Lenses: "check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)"; "Frame budget … any per-object filter or extra pass needs a before-and-after perf run".

## Checks
- **E6a, new `tests/unit/volleys.test.ts`** (180 s timeout), over `resolvePods()`:
  - Deterministic: two fresh builds give the same `{ fuse, volleys }`, serialised in sorted order.
  - B-15, end to end. For each key touched in a fused beat, sort that beat's planned maneuvers touching it by `afterMs`. Their *history beats* must not decrease. A maneuver's history beat is its raw beat, and for the carrier it is the beat of the member touching that key. Raw beats come from the same pod with `volleys: false`.
  - The guard refuses at least one candidate on Quasar, so it is exercised.
  - No day turn inside a group: each range's first and last events fall on one local day; `atMs[i] − atMs[0] ≤ VOLLEY_WINDOW_MS`; the ranges are disjoint.
  - Every participant is in its formation: the carrier's planned cast has agent = [lead] by E6-Q1; agent ∪ support covers every member's author and approvers (take them from the `direct: false` plans) and arc holders; `attachment` and `target` cover the members'.
  - The turns: each turn has at most 4 labels (plates + names); each participant is named exactly once; every member has a turn.
  - Pulsar has at least one volley.
- **E6a, moved tests:**
  - `director.test.ts`: authors in a volley count as having one.
  - `pacingBuilt.test.ts`: E6 has `savedMs ≥ 0` on all six pods and > 0 on Pulsar; E6+ has Pulsar `nowMs ≤ 300 000` and Comet's `savedMs` = 0; E1–E5 are unchanged.
  - The `director.json` golden moves (that is its job): check its diff. If any other golden moves, stop and record it.
- **Ledger:** `npm run pacing -- --candidates`. Give every pod's x total, wall, k and levers before and after, the sweep table, and the volley counts.
- **Mapped units:** `npx vitest run tests/unit/volleys.test.ts tests/unit/director.test.ts tests/unit/maneuvers.test.ts tests/unit/limelight.test.ts tests/unit/scheduleHooks.test.ts tests/unit/sceneplay.test.ts tests/unit/solarSeek.test.ts tests/unit/castLabels.test.ts tests/unit/commands.test.ts tests/unit/docTables.test.ts tests/unit/literalFence.test.ts tests/unit/pacing.test.ts tests/unit/pacingCandidates.test.ts tests/unit/pacingBuilt.test.ts tests/golden` (E6b adds `stationStandby`/`shuttleSlots`), then the gate.
- **E2E, one at a time, each build:** `npm run e2e:spec -- solar solar-play solar-dense montage-names gallery-assets`, then `npm run e2e:keystone`. Then `perf`, before and after in the same run, reported relatively (the seek check is a known red from 274c737).
- **Perf:** time the warm schedule build for Quasar and Pulsar before and after in one run, and report the ratio (D0 adds a director pass; today's build is about 130 ms and 95 ms).
- **E6b, new case in `solar-dense.spec.ts`** (Halcyon, a fresh app as in 27 D1). In Pulsar Pod, for the first two entries of `volleys()`: seek to just before the start, play at 1×, and sample every 80 ms to the end. Assert:
  - every member's event key shows on a note;
  - plates plus acting captains (opacity > 0.55) are at most 4 at every sample;
  - the distinct acting captains seen are at least `people`.
- **E6b stills:** `tests/drive/steps/e6-volley.ts` (modelled on `e5-director.ts`): Pulsar's first volley at its act (the formation and the energy chain), at each turn, and at the split beam. Copy them to `work/E6/` as `e6-*.png` and name them in the record.

## Out of scope
- Re-timing merges in story time (B-14 forbids it, and story time is scene-blind).
- Volleys across facilities, or across a day.
- The window as a device-profile value: it is story pacing, like `DIRECTOR_TARGET_MS`.
- `placeFormation.ts` (a planet's pieces) and `stationFire.ts` (beamed closes): neither draws Power link's formation or its beam (27 D1, D3), so neither changes.
- Per-person order across fused beats: a captain's earlier work may now follow the volley. B-15 is about pieces; note it under limitations.
- A close inside a fused range that becomes an arc of a merge there (M-23 by construction): note it.
- E7–E9.
