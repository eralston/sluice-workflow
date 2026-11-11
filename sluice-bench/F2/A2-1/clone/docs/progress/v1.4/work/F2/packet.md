# Packet F2: Summon on the fly
Risk: medium (schedule: every pod with a summon; the engine's sequencer and the renderer's movers) · Start commit: 61e4958

Built in one conversation without subagents (the run's instruction): this file is the plan as built, and it
records the decisions the scope left open. No planner or reviewer agent ran, so there is no `plan-1.json` or
`review-1.*`; `build-1.json` is the build record.

## Acceptance (27 F2, unchanged)
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

## Approach (as built)
1. **The rule** (`pace.ts`): `facility.enter`'s phases shrink to the flight plus the arrival: gather 715, act 1200
   (1915 ms; was tell 300, gather 715, act 1200, land 600 = 2815). A new `PaceRule.pass?: true` marks it a **pass**.
2. **The sequencer** (`maneuvers.ts`), for a flying pass (`Draft.pass`):
   - `crewTimes(phases, pass)`: the ship leaves at the claim (the act's start, the blip). Its plate opens there,
     is whole for `NOTE_MIN_MS`, then folds (`closeMs = claim + CREW_FOLD_MS + NOTE_MIN_MS`). `passNoteMs` is when the
     plate has folded.
   - `durMs` is its phases alone (no held turn). `releaseOf` gives the claim. `heldMs` (attention and the beat's
     length) runs to `passNoteMs`, so the plate keeps its place while it is read.
   - `crewBusy` (P4): the captain's next flying sortie may set its gather off at the blip (`nearStartMs` with no
     work end). A non-flying next maneuver (the tender's `attachment.open`, which waits for the summon anyway)
     still starts at the summon's end.
   - `nearWaits` never parks a pass. `releaseOfPlay` and `passPlay(m)` read the pass from the rule id, as
     `flyingPlay` does.
3. **The renderer.**
   - `Pass` mover (`movers.ts`): two Hermite legs share the spot and the velocity there. The ship reaches the spot
     as the gather ends, then carries on to its layout place (its rest), easing in. When the way on doubles back,
     it is heading square to the way in, so it swings past the spot and never brakes at it. The second leg's time
     is the flight's, scaled by the distances, within `PASS_ON_MIN_S` and `PASS_ON_MAX_S` (0.45–1.2 s, 15 §10).
   - The pass keeps the node until its plate has folded (`crewOpen`), at home if it gets there first.
   - Hand-off: when a move takes over a pass in flight (`FxRunner.move`), it gets the pass's velocity
     (`takeCarried`). A `Sortie` or another `Pass` then sets off at that speed, so a summoner whose next sortie
     starts at the blip flies straight on.
   - A ship new to the scene (K-13) drops in at the spot.
   - `pursue` takes `pass` and `noteS`. The interpreter names the crew with `crewTimes(m.phases, passPlay(m))`,
     and `crew()` reads a `Pass`'s `crewOpen`.
4. **The choreography** (`stationJumpIn.ts`): gather is the pass (or a guest at the spot for `fly + noteS`). The
   act's first call is **the call blip**, `jumpRing` on the summoner's live anchor (`drawnR × 1.6`). In the same
   instant come the art's `jump`, the At-rest blue flare, and `jumpRing` on the station. One function draws both
   rings, so the hue, the expansion ratio (0.7 → 1.6), the duration and the alpha are the same by construction.
   The tell ring, the gather's fold ring and the land ring are gone. Under reduced motion `pursue` snaps (it isn't
   issued), so the ship stays at its place: the blip plays there, and so does the arrival.
5. **The ledger.**
   - `beforeF2(rules)` (`scripts/pacing-ledger.ts`) restores the old rule: the four phases, no `pass`. Every Built
     row before F2, C2's candidates and `sweep.test`'s Comet pin run on it, so none of their numbers move.
   - New Built rows on all seven pods (Meteor too, `all`): **F2**, undirected (the schedule's own saving), and
     **F2+**, with every lever (what the app plays).
6. **Docs.** 15 §7 (the maneuvers row, 1915 ms; the actions row), 15 §8 (the effect audit's jump-in rows), 15 §10
   (a new row, *A pass's way on*), 13 §6 (the jump-in row), 05 §8 (M-13, T-1, P-7), 03 (`PaceRule.pass`,
   `crewTimes(…, pass)`, `PursueArgs.pass/noteS`; **an amendment to a normative doc**, called out here and in the
   block note).

## Decisions taken here (no one to ask; recorded per the run's instruction)
- **"Its plate rides with the ship for NOTE_MIN_MS"** reads as the plate being *whole* for `NOTE_MIN_MS`, with the
  unfurl and fold on top: 22 B9's rule that the animations count toward no minimum. A first cut that counted the
  fold inside 1.8 s left the name whole for about 0.65 s. `solar-dense`'s turn spec caught it: too short to read.
- **"The rule's phases shrink to the flight plus the arrival"**: gather and act only. The land's settle ring (a
  repeat the effect audit already muted) and the tell ring go. The gather's fold ring goes too, so the blip is the
  one call (the effect audit's rows are marked `cut`).
- **Blip size**: 1.6 × the summoner's drawn radius, in the station ring's shape. "The same ring shape" is the same
  ring at the caller's scale, not the station's size (a station-sized ring on the ship would cover the station).
- **The next place**: the ship carries on to its layout place unless a later move takes it over. The engine
  lets a flying next sortie set off at the blip, and the renderer hands the speed on. In today's beats the
  tender's `attachment.open` sits between two summons by one captain and keeps them busy, so in Meteor's opening
  the ship passes, heads home and is called out again. F3's summon chain replaces that run with one path.
- **The ledger's saving per pod** is two rows. Under the director's speed lever, a pod near the 300 s target uses
  the saving to pull fewer levers rather than to play shorter (F2+ Pulsar 1.7 s, Meteor −8.2 s; Pulsar keeps its
  72 light forms as moments). So the undirected F2 row is the schedule's own saving.

## Goldens and pinned numbers that moved (each named)
- `tests/golden/__golden__/director.json`: every pod's `estimateMs` (shorter summons). Quasar and Pulsar get a new
  tempo. Pulsar's levers lose `light` (72 light forms back to moments): the saving gives the director room.
- `docs/progress/v1.4/pacing-ledger.{md,json}`: every pod's tables, regenerated; the Built section gains the F2
  and F2+ rows. `pacing-built.json`: the 14 new rows, with no existing row changed. `pacing-candidates.json`:
  unchanged.
- No other golden moved (`sprint-pods.*`, `solar.*`, `meridian.*`, `halcyon-meteor.*` are projections or v0
  schedules that don't plan `facility.enter`'s phases).
- Tests changed with the rule: `commands.test` (the jump-in's calls; a new F2 test), `maneuvers.test` (two new F2
  tests; the acts-in-order property treats a pass as its captain's flight alone when only the crew ties two
  maneuvers), `sweep.test` (its Comet pin runs on `beforeF2`), `pacingBuilt.test` (new F2 rows; the frozen-rows
  filter leaves F rows out), `solar-dense.spec` (the turn spec reads a summon's event, from a new `summons()` test
  hook, as a pass riding with its ship: whole ≥ 1.65 s, not held to the parked check).
