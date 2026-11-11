# Slice 1.3 C8 and C9: Frontier clears stations; a reseated ghost takes a slot

**Status:** built 2026-10-28. Items: [23 §3 Block C](../23-v1.3.md#3-blocks), C8 and C9.

## 1. What was built
- **C8, the frontier push-out clears stations.** `placeFormations` (`scenes/placeFormation.ts`) already moved
  a frontier piece outward until its hit cleared every group and every planet's loiter ring. It now also
  clears every planned station (`solar.stations`, drawn yet or not, so INV-14 holds): each at its plan spot,
  hit radius at a ring station's largest drawn size (`RING_MAX_SCALE`). It takes the first spot along its ray
  clear of everything; if none is within the 80 steps, the first clear of groups and rings, as before.
  Stations never move for it (a ring station sits exactly on its slot).
- **Finding on Pulsar and the other pods:** on every fixture, at 24 sampled playheads and five camera scales
  (0.02 to 0.12), no frontier piece's hit overlaps a station's, **before or after**; positions are identical
  with and without the fix (diffed 3,765 placements). Stations already clear the belt's middle ellipse by a
  piece's hit (`computeStations`), and the push only goes outward, so the fixtures never trigger it. The
  smallest gap seen in the sweep was about 95 px. The fix is for boards where the push reaches a station
  (proved on a hand-built board that fails without it). Drive stills: `review/v1.3/C/C8-before.png` (fix
  disabled) and `C8-after.png` (Pulsar Pod, 1 frontier piece, 14 stations, smallest gap 151 px at scale
  0.029); they differ only by ambient motion.
- **C9, a reseated ghost takes a mandala slot at its new seat.** A reseat made while a piece is Off used to
  wait until it came back on the ladder. Now, when the new seat is **already on the board** (someone holds
  work there on the ladder at some instant of the round), the ghost goes there at once:
  - `boardFacts` (`scene/project/solar.ts`) runs a second pass with those seats (`boardSeatAt(p, ghostSeats)`);
    the seats themselves are the first pass's, so a ghost never opens a seat. A reseat to a person with no
    seat, or to no one, still waits (the existing mini sprint, where Bram holds only the ghost, is unchanged).
  - `ghostSpans` / `offSpans` (`engine/facts.ts`): the stretches a piece stands Off at a seat. `rosters`
    (`engine/solar/slots.ts`) adds a ghost-only visit to the new seat's roster, **after** every piece that was
    on the ladder there, so no other piece's slot moves for it (R4). It does count in the half-disc's size, so a
    planet gaining a ghost may shrink its slots.
  - It holds nothing: `heldSpans`, `seatsOf`, `seatReason` and trophies don't see it, so a seat whose only
    piece is a ghost still reads vacant (C3, `PieceState.vacant`); the vacant check in `projectSolar`
    counts only on-ladder pieces. The captain anchor filter now also excludes a ghost that went Off at another
    seat than the one it stands at, so it is no anchor for its new assignee's ship (as before, 03 §5d).
- **No fixture has an Off reseat**, so no golden moved (checked: `halcyon`, `pod-sprint`, `meridian-sprint`
  pieces with an Off signal; none reseated while Off).

- **Fix round:** `ghostSpans` now counts only a stay a reseat made while Off began (not the first stay, nor
  one entered on the ladder), so an Off stretch with no reseat gets no slot, as before (probe added to
  `solarSeek`). The C8 hand-built board is not a layout the planner makes for ring stations (it keeps them
  inside the belt and the push only goes outward); it proves the rule, and a new test covers the reachable
  case, a modeless station that settles on its spiral just outside the belt: the push-out keeps clear of the
  station's plan spot plus the spiral's reach (`STATION_REACH_PX`), failing without it (1320 against 1464).
  Smaller: `wentOffAt` reads spans up to the playhead; `rosters` calls `visitsOf` once; the file header names stations.

## 2. Contracts changed
- 02 (the Solar ghost bullet), 03 (`boardFacts` bullet; the agent row), 14 (one timeline), 08 §7 (a ghost
  reseated while Off; the frontier push-out), 05 §8.2a (S-13, S-16) amended. No type or value changed;
  `SOLAR_LAYOUT_VERSION` unchanged (plans of existing data are identical).
- New pure exports in `engine/facts.ts`: `offSpans`, `ghostSpans`.

## 3. Checks
- `tests/unit/frontierStations.test.ts` (new): the sweep over the three sprint fixtures through `placeInScreen`
  (no frontier hit overlaps a station's hit); a hand-built board where the group pushes a piece toward a
  station planned on its landing spot (fails without the fix: 600 against 892 needed), drawn or not.
- `tests/unit/solarSeek.test.ts`: the old "keeps a ghost where it went off" test updated (the ghost goes to a
  seat on the board at the reseat; stays when the seat isn't one; waits for no one or a non-seat); a plan
  test (ghost slot at the new seat, after the on-ladder pieces, others' indices unchanged, `seatReason`
  `holds` count excludes it); a projected mini sprint (ghost in Bram's mandala, no anchor, vacant once his own
  piece goes Off). The mini sprint "gives no ship to the new assignee" still passes.
- typecheck, lint, `npm test` (89 files, 1360 tests), `e2e:spec solar density` (42 passed), `e2e:keystone` (42 passed).

## 4. Human gates
None new. Glance at `review/v1.3/C/C8-after.png` (Pulsar's frontier, unchanged by design).

## 5. Known limitations and open questions
- C8 is preventive: no fixture shows the bug, so the stills are the same picture. A modeless (older-graph)
  station is avoided at its planned spot widened by the spiral's reach, a conservative area.
- A ghost reseated to a seat not on the board still stays at its old seat; if the user wants it on the new
  person's planet that person must hold work there (otherwise a ghost would open a planet, against INV-10/R9).
- A ghost-only visit isn't added to `visited`, so it does not draw a station toward its new seat.
