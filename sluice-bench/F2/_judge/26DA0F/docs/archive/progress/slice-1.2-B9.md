# Slice 1.2-B9: acting captains name themselves for their maneuver

**Status:** built 2026-10-15. [22 §3, B9](../22-v1.2.md#3-blocks).

## 1. What was built
- **The window.** `CastLabels.showCrew` opens a captain's window for a maneuver's cast agent and
  support (a merge's author and approvers), from its start to its land plus 0.4 s. `crew()` gives each
  captain's unfurl, 0 to 1 (520 ms up and down), their part and the event. The windows are free of the
  attention budget, which counts piece plates only. A seek clears them, a pause folds them on the wall
  clock, and reduced motion is on or off.
- **The part** (`partOf`, `engine/eventLine.ts`): `Author` and `Approved` on a merge, `Opened it`,
  `Takes it` for a new holder, else the action (`Resolved → Closed`, `Lends a hand` for support).
- **The plate.** An acting captain's tier is *title* in place of *picture*, with `is-acting`: the
  lines show beside the picture, with the part under the name. The plate unfurls and folds with the
  A8 mask and tracing frame, driven by the window.

**The second look (2026-10-15).** The user found three things in play.
- **The plate was crowded,** with a gap under the picture. An acting plate is now wider (up to 300 px)
  and roomier, and the picture fills its whole height.
- **A ship could fly in, name itself and leave at once.** The turn now has its own timing, shared by
  the planner and the renderer (`crewTimes`): the ship parks as the work starts, is named through it
  and at least 1 s after, folds, then leaves.
  - Every sortie holds for it (`crewHoldMs`), and the planner counts it, so the captain's next work
    waits.
  - The plate follows the sortie as flown (`Sortie.crewOpen`). A protect can hold a ship back, and a
    probe showed Mara named for 2 s at rest and then flying away named; now nobody is named in flight.
  - Only a maneuver the crew travels for names them. One that keeps its ship put doesn't, since that
    ship may glide to a new rest.
  - The summoner of a station's jump-in holds through its turn too.
- **Plates fought each other.**
  - A holo plate now keeps its place while that place is clear.
  - A sortie parks off its work's plate, turning ±0.45 rad and then ±0.9 rad round the planet, chosen
    once (`clearOfPlate`).
  - The merge formation's approvers stand further apart (3.4 and 4 ship sizes, from 2.6 and 3.2), and
    a strike run fans at 0.8 rad (from 0.6).
- **Also fixed:** a PR's note was cut to one line, losing its action ("…reconciliation… —"). Notes wrap
  now, and B8 fails on a clipped note.

**The third look (2026-10-15).** The plate still read too briefly.
- It was whole for exactly 1 s past the work. The unfurl wasn't part of that second, but it ate into
  the time the plate was whole during a short act.
- **Now:** whole at least 1.5 s past the work (`CREW_HOLD_MS`), and at least 1.5 s in all
  (`CREW_OPEN_MIN_MS`), from the unfurl's end to the fold's start. Neither animation counts.
- **The cost:** a flying maneuver with a short payoff now lasts about 2.1 s longer than its phases.
- **The guard** checks that each whole open lasts more than 1.4 s at 1×.

## 2. Contracts changed
15 §10 (*Acting captain's plate*), 13 §6, 22 (B9, decided with the user: free of the budget; name and
part). No change to 02 or 03.

## 3. Checks
- **Unit:**
  - `castLabels.test.ts`: an unfurl and fold, free of the two places; pause and seek; a flight as
    flown (shut in flight, a late flight still speaking).
  - `maneuvers.test.ts`: `crewTimes`, and a captain's next work waiting for the turn.
  - `approach.test.ts`: `clearOfPlate` (the first clear spot, kept; none clear, the furthest).
- **e2e:** `solar-dense.spec` (acting captain): captains are named while their maneuvers play, each with
  a part, the plate is seen unfurling, and none is open after the play.
- **e2e** `solar-dense.spec` (a captain's turn), played at 1×:
  - every whole open lasts more than 0.9 s; the probe saw 1.5 s and more;
  - no ship moves more than 12 px while named; before, one moved 207 px;
  - ships stand over their work's plate under 5% of the time;
  - the noted plates change side under 2% of frames.

  It failed on the ship that flew while named.
- **Drive:** `v12-B` stills (`playing-10`: Mara Ellingsen *Author*, Quin Delacroix-Hart *Approved*).

## 4. Human gates
**HG-B-play** (with the rest of B): the unfurl's pace and the parts' wording.

## 5. Known limitations
- **Episodes are longer:** about 1.1 s per flying maneuver whose payoff is short, which the episode
  budget absorbs by compressing gaps.
- **The parking check** uses the work's plate as it stands when the ship sets off. A plate that moves
  after the ship parks isn't chased.
- A captain with back-to-back maneuvers stays open through them (the windows overlap) and shows the
  later part.
- A state change's part repeats the piece's note (`Resolved → Closed`); say if you want a shorter word.
