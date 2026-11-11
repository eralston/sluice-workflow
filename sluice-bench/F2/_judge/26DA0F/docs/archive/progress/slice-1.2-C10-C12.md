# Slice 1.2-C10–C12: after real runs (24-hour arcs, four labels, stations on two rings, a region's own PRs)

**Status:** built 2026-10-15. [22 §3, Block C](../22-v1.2.md#3-blocks): C2's revision, C10, C11 and C12, as
phase 1b (between story time and phase 2). It stops here for the user's eye.

## 1. What was built
- **Arcs reach back 24 working hours (C2 revised).** A close now joins the last merge serving it at most
  `ARC_WORK_HOURS` (24) working hours before it, instead of on the same calendar day.
  - **What counts:** weekdays 07:00–19:00 in the viewer's zone, so the reach is two working days. A
    Friday-afternoon merge reaches Tuesday afternoon.
  - **What comes along:** the piece's work from the start of the merge's day to the end of the
    close's day (up to its next close). What came before the merge that day goes just ahead of it; the
    rest goes just behind it.
  - **Where:** `playback/workHours.ts` is new; the schedule's weights now share it. `storyTime.ts`
    claims each arc's span first, and the rest of a piece's work still gathers by day.
- **Four labels at once (C10).** `ATTENTION_MAX` is 4 and counts pieces' plates and named captains
  together.
  - **The planner:** a maneuver's `attends` is its lit pieces plus its flying crew, at most 4. A sortie
    takes two; a merge with its author and two reviewers takes all four.
  - **The interpreter:** names the crew within what the pieces leave: the author first, then reviewers
    in order.
  - **`CastLabels`:** counts named captains in the budget. A lingering plate crossfades out for a
    captain being named.
  - **`labels.ts`:** places named captains right after focused plates, before the standing ones.
- **Stations on two regular rings (C11, `SOLAR_LAYOUT_VERSION` 7; `engine/solar/stations.ts`,
  `plan.ts`).** Settled on the user's third look (2026-10-16), after two cuts that read as random on
  real data.
  - **Slots** (`gapAngles`): half-way between neighbouring planets, the first planet at the top. Each
    ring has one fixed radius.
  - **The inner ring** is every station's first choice. It has one slot per gap, side by side when the
    multi-planet stations outnumber the gaps. It sits at the largest radius inside the planets where
    each taken slot keeps a station's width (`STATION_PAD`) from everything and clears the orbit line.
  - **Who sits where:** single-planet stations choose first, the gap beside their planet, leaving a slot
    for each multi-planet station; those take the gap nearest their work.
  - **Room:** the planets move out (`placeSeats`' new `minRx`) when there's no such radius.
  - **The outer ring** takes only the single-planet stations left over, at 70% (`OUTER_SIZE`;
    `ViewNode.floorScale`), in the gaps just past the planets.
  - **On screen,** a ring station sits exactly on its slot, its drawn size capped at `RING_MAX_SCALE`
    (`ViewNode.maxScale`). The fit includes every planned station at that reach.
  - **Along the way:** guests no longer count a PR's help where the PR doesn't serve the region (C12;
    Wil Castellane had stood in Convoy for a Signals merge).
- **The merge formation (C11 revised).** `powerLink.ts` `formation()` is one line through the station:
  - horizontal near the top or bottom of the circle, vertical on the sides;
  - the author beside the station, the approvers beyond, a little staggered;
  - toward the view's middle, unless that covers the station's or the work's plate (cast views gain a
    `plate()` from the host's `plateWorld`).
- **Stations start off the map (C11).** `firstNeeds` (`pace.ts`) gives each station's first PR event
  in a region, while that PR serves the region's work.
  - **The plan:** a station's `enterAt` is that event's time; one with no such event in the round is
    there from the opening.
  - **The jump-in rule:** `facility.enter` matches that event, region by region (`isFirstNeed`), so a
    station first needed at a merge jumps in just before it.
  - **The interpreter:** never plays a jump-in for a station already drawn. This closes G-4.
- **A region plays only its own PR work (C12).** A PR's events play in a region only while the PR
  serves a story or bug (or a Task of one) in that area path and sprint at that moment.
  - **The predicate:** `servesAt` (`engine/facts.ts`), used by the Solar region's new `sceneEvents`
    hook (`hierarchy/types.ts`, `highlights.ts` `sceneEvents`).
  - **The region's facts:** keep only the PRs that served the region's work while open, and count only
    the merges a region plays toward its stations' form (`roundMerges`' new `keep`).
- **A fixture case (C12).** In meridian, Rook opens a kiosk-firmware PR for his Convoy story, the story
  moves to Signals Pod, and the PR merges there. Today's code played that merge in Convoy.
- **A drive:** `tests/drive/steps/v12-1b.ts`.

## 2. Contracts changed
- **02 §5 (normative):** story time may move work back a day or two onto its arc's merge, never later
  and never out of order within a piece. It was "never across days".
- **03:** `StationSlot.mode` is `inner | outer` (it was `midpoint | beside`); `enterAt` is the region's
  first need.
- **`LevelDef.sceneEvents`** is a new optional hook (14 and 03 as noted).
- **05 §8:**
  - B-12, B-13, B-15 (24 working hours);
  - **B-20** (new: a region's own PRs);
  - S-8 (the rings), S-9 and T-1 (first need), M-13; M-26 is built, G-4 is closed;
  - P-6, A-5, A-6 (four labels).
- **08 §7** (the rings, the push and why Harbor needs it), **13** (stations), **14** (StationSlot,
  stations row).
- **03:** `ViewNode.floorScale`, `StationSlot.size`, `solar.stations[].mode`/`size`, `CastView.plate`.
- **15:**
  - §5: `SOLAR_LAYOUT_VERSION` 7, `OUTER_SIZE`, and the ring constants (unguarded);
  - §10: the attention budget of 4, `ARC_WORK_HOURS`.

## 3. Checks
- **Unit:** (see below). New and rewritten tests:
  - `storyTime.test.ts`: cross-day moves only into an arc and only back, within the reach; working
    hours.
  - `regionPrs.test.ts` (new): fails three of four on the old code.
  - `stationArrival.test.ts` (new): one jump-in per station, at its first need, else there from the
    opening. Its Signals Pod case fails with the old jump-in rule.
  - `castLabels.test.ts`: the budget cases with two captains named, four plates at most, and a captain
    displacing a lingering plate.
  - `maneuvers.test.ts`: four labels.
  - `solarLayout.test.ts`: the rings, padding, half-way slots, symmetry with an odd count, who sits
    where, the overflow outside at 70%, and the push.
- **Goldens:** the four solar goldens were accepted on purpose. They move for the layout version, the
  rings, Harbor Pod's planets (1,702 → 2,519), the new fixture PR's station in Convoy and Signals, and
  Wil Castellane no longer a guest in Convoy.
- **E2E:** (see below). solar-dense's B8 guard now counts piece plates plus named captains, at most 4.

## 4. Human gates
For the user's eye (fixture data only, INV-18); stills in `review/v1.2/C1b/`:
- **The rings:** `*-convoy-end`, `*-signals-end`, `*-harbor-end` (every station on the inner ring).
- **The merge formation:** `harbor-merge-*` (horizontal, toward the middle).
- **Nothing summoned twice:** `*-start` stills show only the stations needed from the opening.
- **A jump-in at first need:** `harbor-jump-*`.
- **A merge's whole crew named:** `harbor-merge-*`.

## 5. Known limitations and open questions
- **Small, busy systems grow, and the padding departs from the decision.** The user chose a full
  station width of padding. It holds between stations (`STATION_PAD`, 760), but from the star and the
  planets a ring station keeps half that (`BODY_PAD`, 0.5).
  - **Why:** a full width there pushed Harbor Pod's planets from 1,702 to 3,217, and at 1024×640 its
    floored hits overlapped (VC-3).
  - **With half:** Harbor Pod moves out to 2,519 (three stations, busy planets); Signals Pod and the
    dense pod don't move at all.

  For the user to confirm at HG-C-ships.
- **At a far zoom, stations look smaller** than their usual minimum size: their drawn size is capped at
  twice their planned size, so they keep to their slots and the pattern stays exact.
- **A merge with three or more reviewers** names its author and reviewers in order up to four labels;
  the rest keep their picture.
- **A sortie now takes two labels** (its piece and its captain), so at most two sorties run labelled
  at once, as before. Light, unlabelled work is unaffected.
- **Outer stations are rare in the fixtures:** none uses the outer ring now; the unit tests cover it
  (`solarLayout.test.ts`).
