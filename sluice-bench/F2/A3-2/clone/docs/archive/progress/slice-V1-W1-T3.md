# Slice V1-W1-T3: Solar plan (pure geometry)

Built 2026-10-10, following [17 W1-T3](../17-v1-phases.md#w1-t3-solar-plan-pure-geometry) and
[14 §2.3, §4](../14-architecture.md#4-determinism-and-seek-stability), with 13 Q11 (decided) for
many seats. It reads only `RoundFacts` and the pack's crowding cap, so it needs no pack code, and it
changes no v0 behaviour: nothing calls it yet (W2-T1 does).

## 1. What was built
All of it is in `src/shared/engine/solar/`. Every file is pure, and the literal fence covers them.

- **`version.ts`**
  - `SOLAR_LAYOUT_VERSION = 1`.
  - `GEOMETRY`: every size and spacing the plan uses, in world units. The star is r 240, a planet
    120, a free piece 52, a facility 100 with satellites out to `FACILITY_REACH` (146). It also
    holds the lane between orbit bands (96), the gap before the outer ring (320), the free and
    formation spacing, the frontier belt, the compound cap (6) and the arcs.
  - `SQUASH`: `ORBIT_SQUASH` (0.5) from `scene/layout.ts`.
  - Bump the version with any change here.
- **`seats.ts`**
  - `strideFor(n)` returns the coprime integer nearest n/φ. Ties go to the lower one, and it's 1
    for n ≤ 2. For n = 3..12 that gives 2, 3, 3, 5, 4, 5, 5, 7, 7, 7.
  - `angleSlots(n)` gives each seat its slot, `(i·s) mod n`.
  - `baseAngle(region)` comes from `artSeed(region)`.
  - `seatSpots(n, base)` (13 Q11):
    - The first 6 seats get an orbit each on the inner ring, with angles from the stride over
      that ring.
    - The rest pair up on a second, wider ring, two seats to an orbit at opposite angles. The
      pairs are spread over a half turn by their own stride, offset half an inner slot.
  - `placeSeats` packs the orbits **by band**:
    - ρ = hypot(x, y / SQUASH), so every orbit is a circle in ρ.
    - A seat's band is the ρ-range its planet, free slots and formations cover.
    - Each orbit takes the smallest whole radius at which its band clears the band inside it by
      a lane (or the star's disc, or the ring gap before the outer ring).
  - Helpers: `rhoOf`, `rhoRange`, `onOrbit`, `normAngle`, `footprintRange`.
- **`slots.ts`**
  - `visitsOf(piece, round)` lists every seat a piece held while a member **during the round**,
    and when it first arrived there. `null` stands for unassigned, which means the frontier.
    Before its first `seatAt` entry, a piece holds that entry's seat.
    - Each seat segment is intersected with membership and `[startUtc, endUtc)`. A visit held at
      the start arrives at the start; one that ended by the start, or began at or after the end,
      is dropped. So seats, slots, the frontier belt and facilities' `serves` see only the round
      (14 §4: seats are people who held a piece at some instant of the round).
  - `rosters(facts, free)` orders each seat's pieces by role, in arrival order (Q6):
    - Visits held at the start arrive at the start, so they order by key alone.
    - After them come later arrivals, by time, ties by key.
    - The first `crowd.free[role]` stand free; the rest take formation indices.
    - The frontier is ordered by first-unassigned time.
  - `seatOrder` uses `facts.seats` as given. Any visited seat the facts didn't list is appended
    after it, as a defence.
  - `freeOffset(role, i)` puts objectives on the planet's left arc and threats on its right, 36°
    apart. Index 0 is level with the planet; the next go above, then below, alternately.
  - `seatAtTime` and `memberAt` read the same timeline the visits use, so the two always agree.
- **`formations.ts`**
  - `hexRings`, and `hexOffsets(n, pitch)`, which hex-packs members by index: the centre, then
    ring by ring.
  - `formationShape(n)` gives `memberR` = 110 / (2k + 1), clamped to 16..36.4, and
    `outerR = (2k + 1)·memberR`.
  - `formationAnchor(role, outerR)` puts objectives to the left and threats to the right, just past
    the role's free slots (wide and shallow, 08 §2).
- **`frontier.ts`**
  - `frontierBelt(reach, count)` is an annulus one lane outside the outermost band. It's as wide as a
    piece's full ρ-extent plus pads. It moves out until `count` pieces clear each other: the
    nearest neighbours' chord is 2·ry·sin(π/count).
  - `frontierSlots` sets the angles by stride, so early arrivals spread apart.
- **`stations.ts`** (facility placement; the file name follows 17)
  - The seats a facility serves are those holding a piece linked to one of its attachments,
    weighted by link count. A linked piece without a slot (a step) stands in for its parent.
  - Two or more seats: the weighted centroid, then the first clear point on a fixed spiral round
    it (rings 40 apart, ties by angle).
  - One seat: beside the planet. The search starts on the orbit's outward normal and turns up to 90°
    away from the seat's formations first. At each distance it tries those angles, and it moves out
    a step at a time until a spot is clear.
  - **Clear** means clear of all of these:
    - the star, every planet, free slot and formation disc;
    - every orbit line (±24 in ρ);
    - the frontier belt;
    - every facility placed before this one.
  - `enterAt` is the first attachment's open time, and `summoner` is that attachment's author.
  - Facilities are placed in order of `enterAt`, then key.
- **`compound.ts`**
  - `firstFit` assigns slots by interval first-fit in open-time order, over `[from, to)`.
  - `compoundSlots` adds the guards: `fnv1a32(facility) % 4` of them, on the back arc.
  - `attachmentAngle` puts the cap's 6 slots on the front arc, then the "+N" mark. Every slot past
    the cap shares the mark's place.
  - `compoundAt(slots, t)` gives `{ live, more }` for the projection.
- **`plan.ts`**
  - `planSolar(facts, pack)`, memoised per facts object on (pack id, crowd, version).
  - `pieceAt(plan, facts, piece, t)`: the slot a piece shows at the playhead, which is always one of
    `plan.slots`, or null. This is the projection's hook (W2-T1).
  - `slotKey`, `formationId`, and the `PlanPack` type.
  - `plan.slots` is inserted in sorted key order, so goldens serialise stably.
- **Test**: `tests/unit/solarLayout.test.ts`, 19 tests.

## 2. Contracts changed
No shape in `engine/types.ts` or 03 changed. These departures from 14 §4 are recorded here, for
W4-T3's 03 and 14 pass:
- **Many seats follow 13 Q11, not 14's `MAX_ORBITS = 8`.** Up to 6 seats get an orbit each on the
  inner ring. Beyond that, seats pair on a second ring, outside a 320-unit gap, at opposite angles.
  The stride rule (`(i·s) mod n`) applies per ring: n is the inner ring's seat count, or the outer
  ring's pair count.
- **Orbit radii aren't `R0 + i·ΔR`.** Each orbit is the smallest whole radius whose band clears the
  one inside it by a lane. The result is still fixed over the loaded history, and seats with
  formations get the room they need.
- **`memberR` is sized by every member the formation ever had**, which is also its largest size,
  because each member's hex index is fixed. A formation with nine pieces over the round, at most
  two at once, sizes by everyone who ever took one of its indices.
- **A facility serving no seat** (its links are all unassigned or missing) has `mode: 'midpoint'`
  and `serves: []`, and it sits at the first clear spiral point round the star.
- **A guard's `CompoundSlot.key` is its facility's key.** Guards have no entity of their own, so
  `role` and `slot` tell them apart.
- **`planSolar` takes `PlanPack = Pick<DomainPack, 'id' | 'crowd'>`.** A `DomainPack` still
  fits, so 14 §2.3's call is unchanged.
- **Helpers 14 doesn't name:** `pieceAt`, `slotKey`, `formationId`, `compoundAt` and `GEOMETRY`.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run lint`: clean.
  - `npm test`: 40 files and 611 tests pass, including the 19 in `solarLayout.test.ts`.
  - `npm run typecheck`: clean (the earlier `moves.test.ts` errors, W1-T1's, are gone).
- **Goldens unchanged**: no file under `tests/golden/__golden__/` changed. `git status tests/golden`
  shows only `v1-ingest.test.ts`, which is W1-T2's.
- **`solarLayout.test.ts`**
  - **Stride and angles, n = 1..12.** The stride is coprime and the nearest such to n/φ. The angle
    slots form a permutation. Seat angles depend only on the seat count and the region: they're
    identical for sparse and crowded facts.
  - **The second ring (Q11).** Its seats sit past the inner ring plus the gap, in pairs on one
    orbit at opposite angles.
  - **Orbits don't overlap, n = 1..12**, with 1+0, 3+3 and 9+14 pieces per seat. Each orbit's band
    clears the next by a lane, the first clears the star, and no two seats' discs meet. The
    frontier belt lies outside every band.
  - **The 3+3 cap and Q6 order.** Pieces held at the start order by key, then later arrivals by
    time, ties by key. The rest go into formations in the same order. The pack's own cap is
    honoured, and steps get no slot.
  - **Only the round counts** (review fix). Pieces assigned and reassigned before the start,
    unassigned only before it, or reseated at the round's end: no seat for someone who held
    nothing in the round, no slot at a seat left before the start, no frontier slot, and the
    in-round arrivals keep their free slots. The plan deep-equals the one built from the in-round
    history alone. The test fails with the old, unclipped `visitsOf`.
  - **A piece moved between seats** has a slot at both, and a frontier slot while it was
    unassigned. `pieceAt` returns the right one before and after. A piece that isn't a member
    shows nowhere.
  - **Hex packing, 1..40 members.** Members never overlap, each one touches an earlier member at
    exactly 2r, and all of them sit inside `outerR`. Free slots and formations clear their planet
    and each other.
  - **`memberR`** never grows with size, is set by the largest size, and is shared by every member.
  - **Facilities.** The midpoint and beside cases, a step standing in for its parent, and a
    facility serving no seat. Every facility clears the star, planets, slots, formations, orbit
    lines, the belt and the other facilities. A beside facility is nearer its own planet than any
    other and clears that seat's formations. `enterAt` and `summoner` come from the first
    attachment.
  - **First-fit.** A hand-checked case, plus 40 seeded intervals. No two live attachments share a
    slot at any boundary time, and every lower slot was taken by an earlier, overlapping opener.
    `more` counts the slots past 6, and a freed slot is reused. Guards sit on the back arc.
  - **The plan is identical at 50 seeded playheads.** It deep-equals a plan built from fresh facts
    in the reverse insertion order, `pieceAt` always returns one of `plan.slots`, and the memo
    returns the same object.
- **Literal fence**: passes and covers the 8 new engine files.
- Keystone and e2e weren't run: 17 doesn't ask for them here, and nothing in the app calls this
  code yet.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **Crowded boards are big.** Strict band separation keeps every seat's pieces out of every other
  orbit, but the scene grows fast. Outermost orbit radii:

  | Seats | Pieces per seat | Outermost orbit |
  |---|---|---|
  | 3 | 3 + 2 | about 2,400 |
  | 6 | 3 + 3 | about 4,700 |
  | 6 | 6 + 5 | about 6,000 |

  Planets will be small at fit. The knobs are `GEOMETRY.lane` and the piece sizes, or a looser
  rule: pairwise clearance instead of bands, since the stride already keeps neighbouring orbits'
  seats far apart in angle. Bump the version when you change it. The density harness (W4-T2)
  should referee.
- **Clearance is in world units.** D12's renderer pitch (W2-T2's `placeFormation`) can spread a
  formation wider than its planned disc at small scales. When that happens, facilities and other
  orbits may no longer be clear on screen.
- **No room is reserved for captains.** They're placed by the projection (`projectCaptains`).
- **Visits are clipped to the round** (review fix). `pieceAt` at a time outside the round can
  return null for a piece that sits at a seat it only held then. Playback runs inside the round
  (`roundFacts` takes the round from the history's range), so this doesn't show.
  `SOLAR_LAYOUT_VERSION` stays 1: no plan has been persisted or shipped yet.
- **The seat before a piece's first `seatAt` entry is that entry's seat.** If W1-T1's facts mean
  "unassigned" before the first entry, that rule should change in `slots.ts`. It's one line,
  `seatSegments`.
- **The frontier is a single lane.** Many unassigned pieces push the belt outward rather than
  adding lanes.
- **Follow-ups for W4-T3 (docs):** copy §2's departures into 03 §5d and 14 §4, the Q11 rings and
  the band packing in particular.
