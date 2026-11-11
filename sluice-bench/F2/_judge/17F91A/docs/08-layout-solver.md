# 08 — Layout: the challenge, the principles, and the proposed solver

**Status:** current as of 2026-10-27 (through v1.3 Block B), checked against the code. This is the design record for layout:
what worked, what didn't, and why. The values themselves live in
[15 §5](15-reference.md#5-sizes-floors-and-layout) (floors, hits, `GEOMETRY`, pitches); where this
doc names a constant, 15 and the code win.

Sections 1–4 are what the slice 1 refinement rounds taught about laying out a star chart that stays
legible from 1 child to 20+. Section 5 is a proposed solver, deferred on 2026-10-01. Section 6 is the
v0 board, and section 7 is Solar's layout and what the density harness found. Related:
[06 §2–§4](06-visual-brief.md) (visual rules) and [03 §5](03-contracts.md) (view model).

**Mechanisms at a glance.**

| Mechanism | Status | Applies to | Code |
|---|---|---|---|
| Ring formation: two children per ring, mirrored (§2, §3) | Built | v0 views (Backlog's Feature systems) | `src/shared/scene/layout.ts` |
| Task rows in the close-up (§2) | Superseded 2026-10-03 by the Task radar (§4) | v0 views | `layout.ts` (`RADAR`, `radarAngles`) |
| Label-sized floors and hit radii (§2, §3) | Built | Both views | `src/shared/scene/sizing.ts` |
| Screen-space attachment of ships and berths (§3) | Built | Both views | `chart/scenes/placement.ts` |
| PR lane in screen px (§3) | Built | v0 views | `sizing.ts` (`laneRows`, `laneSlotsX`) |
| Label-aware fit (§3) | Built | Both views | `chart/framing.ts` |
| Label placement: role order, touch rule (§2, §3) | Built | Both views | `chart/labels.ts` |
| Big scenes scroll (§4) | Built for the galaxy grid | Both views | `sizing.ts` (`pageScale`), `chart/camera.ts` |
| Layout solver (§5) | Deferred 2026-10-01 | v0 views | — |
| The board: lanes by person, columns by state (§6) | Built 2026-10-09 | v0 views (Sprints) | `src/shared/scene/board.ts` |
| Strict orbit bands, one radius per seat (§7) | Superseded 2026-10-12 by the regular ring | Solar | — |
| Free pieces, the 3 + 3 cap and the moon ring (§7) | Superseded 2026-10-12 (layout v4) | Solar | — |
| One regular ring of seats (§7) | Built (v5, 2026-10-12) | Solar | `src/shared/engine/solar/{seats,plan}.ts` |
| Regions on the dark side (§7) | Superseded 2026-10-16 by the mandala | Solar | — |
| Platforms on the lit edge (§7) | Superseded 2026-10-16 by the mandala | Solar | — |
| The mandala: half-disc slots, the trophy ring, loiter rings (§7) | Built (v8, 22 Block D) | Solar | `engine/solar/mandala.ts`, `plan.ts`; `scene/project/loiter.ts` |
| The frontier belt (§7) | Built | Solar | `engine/solar/frontier.ts` |
| Stations: two rings, inner (many planets) and outer (one planet) (§7) | Built (v7, 22 C11) | Solar | `engine/solar/stations.ts` |
| Compounds: first-fit slots (§7) | Built | Solar | `engine/solar/compound.ts` |
| Screen pitch for groups and platforms (§7) | Superseded 2026-10-16: slots stay exact, sizes capped | Solar | — |
| Stations' first-free pass; the drawn loiter ring (§7) | Built | Solar | `chart/scenes/placeFormation.ts` |
| Guides: frontier belt, formation halos (§7) | Built (shown only when needed, 19 S2; the threat light retired) | Solar | `chart/scenes/solarGuides.ts` |
| Density harness (§1) | Built | Both views | `tests/e2e/density.spec.ts` |
| Dense regions scroll rather than shrink (§7, Open) | Open | Solar | — |

**Source:** the code files above; values in [15 §5](15-reference.md#5-sizes-floors-and-layout) ·
**Update when:** a layout mechanism is added, replaced or deferred, or moves to another file.

## 1. The challenge
*Applies to: both views.*

A scene mixes two kinds of size:

- **World-sized things.** Stars, planets, orbits, and the distances between them scale with the
  camera.
- **Screen-sized things.** Labels have a fixed pixel size (about 270 × 35–48 px). Mechanical objects
  (ships, PR vessels, stations, mission points) have a minimum on-screen size tied to label height.

The camera fit then chooses one scale per scene, so the two kinds trade off against each other:

- **Width-bound scenes cannot be spread out.** In a wide scene (many children, outward labels), the
  scale is roughly *viewport width ÷ formation width*. Spreading objects further apart in world
  units makes the camera zoom out by the same factor, so their on-screen spacing doesn't change.
- **Height-bound scenes shrink with every reserved row.** In a tall scene (many rings, a PR lane
  sized in screen pixels), each pixel reserved for labels shrinks everything else.
- **Greedy fixes oscillate.** Tuning a world-space constant fixes one density and breaks another.
  Observed examples:
  - Doubling the room above the lane fixed the dense system's PR labels but made the dense close-up
    collide.
  - Widening the station row fixed station labels but shrank the close-up.
  - A fixed absolute minimum zoom silently clamped the dense fit. That clamp made the dense view
    look right by accident, and made zoom-out-through unreachable.
- **The density harness is the referee.** `tests/e2e/density.spec.ts` measures the sparse extreme
  (Feature 112) and the dense extreme (Feature 111; Story 251 with 20 Tasks and 5 PRs to 5 repos),
  and, since v1, Solar's Harbor Pod (§7). It reports sizes in label units, hidden and clipped
  labels, collisions, off-lane vessels, and viewport fill. A layout change should be judged by this
  report, not by one screenshot.

## 2. Principles we agreed
*Applies to: both views.*

The label-as-unit, touch and determinism rules hold in both views. The grammar, the rings and the
label layouts by role are the v0 views'; Solar's equivalents are in §7.

**Grammar (every v0 scene, top to bottom).** Parent → children → PRs in transit (the lane) →
repositories (the station row). A zoom keeps the same reading positions, so the eye never hunts.

**Reading flow.** People read the chart roughly from top-left to bottom-right (the "golden
triangle"). Labels and layouts should present the parent first, then the children, then the
resources.

**The label is the unit of size.**
- Celestial bodies scale with the world. In the v0 views (doubled in slice 1): star r 240, planets
  about 120, close-up planet r 400.
- Mechanical objects never draw smaller than about one label on screen: a ship is about 1.2 labels
  long, a vessel 1.1, a station 1.8, a close-up Task 1. The floors, as radii in label units, are
  `FLOOR_PX` in [15 §5, Floors](15-reference.md#5-sizes-floors-and-layout).
- Sizes are judged by perceived size, so lighting and 3D form count, not just pixels.

**Rings (v0).**
- Two children per ring (a mirrored pair), nested outward and forward, so ring count reads as child
  count at every zoom, including the sector minis.
- Past a ring limit, rings take 3+ children instead of adding more rings. Feature systems allow 6
  rings (`FORMATION.maxRings`). Task formations allowed 4, because the window is landscape: wide and
  shallow beats tall. (Superseded 2026-10-03: Tasks moved to the radar, §4; `TASK_FORMATION` is gone.)

**Label layouts by role (v0)** (preference order; a label must stay attached to its own object):

| Object | Layout | Order |
|---|---|---|
| Parent (star; close-up planet) | horizontal | left → right → above → below |
| Child at a ring's right end | horizontal | right → left → above → below |
| Other children (left end, interior, lone) | horizontal | left → right → above → below |
| PR vessels, stations | vertical | below/above (vessels alternate) → right → left |
| Captain ships | vertical | above → below → right → left |

**Source:** `chart/labels.ts` (`sideOrder`) · **Update when:** a role's side order changes.

**Touch rule (revised 2026-10-09).** A label may touch only the object it annotates. Every other
object, and every placed label, is an obstacle. That now includes the captain ship working that
object: a star, planet, anomaly, vessel or station label changes sides rather than cover a ship. A
ship's label likewise no longer drops onto its assignment, since on a board the ship rides above it.
A board's lane heads are placed before any label, so labels go around them too. A label that can't
fit hides until hover or selection; it never drifts next to the wrong object.

**Label lines.**
1. The title, capped at the longest possible subtitle, "Pull Request #12345678 · Ready for Review"
   (`TITLE_MAX_CHARS`, [15 §6](15-reference.md#6-labels-and-type)).
2. `{type} #{id} · {state}`.
3. The person: assignee for work items, author for PRs. Omitted when unassigned; repositories have
   none.

Solar's holo plates and mega-labels vary these lines per asset ([15 §6](15-reference.md#6-labels-and-type)).

**Ships are the only free movers.** They search a ring of directions around their assignment for
the first clear spot. Everything else keeps a fixed slot in the grammar.

**Determinism.** Layout is a pure function of the history (everything ever linked), the viewport,
and the scale. Nothing moves during replay (INV-14).

## 3. What's implemented (mechanisms)
*Applies to: both views.*

The shared and v0 mechanisms. Solar's own are in §7 and the table at the top.

| Mechanism | View | Where | What it guarantees |
|---|---|---|---|
| Ring formation (`featureFormation`, `ringCounts`, `FORMATION`, `MINI_FORMATION`) | v0 views | `src/shared/scene/layout.ts` | Children on orbit lines; mirror symmetry; ring count ≈ child count |
| Label-sized floors (`screenRadius`, `hitRadius`) | Both | `src/shared/scene/sizing.ts` | Mechanical objects ≥ about 1 label; hit radii ≥ 16 px (radar dots 12 px). Values: [15 §5](15-reference.md#5-sizes-floors-and-layout) |
| Screen-space attachment | Both | `scenes/placement.ts` (`placeInScreen`, called from `GraphScene.setCameraScale`) | Ships and berths sit beside their target without collisions; in Solar it runs the formation, platform and station passes first (§7) |
| PR lane in screen px (`laneRows`, `laneSlotsX`) | v0 views | `sizing.ts`, renderer, and fit | A label's room above and below each vessel, and half a label between neighbours |
| Label-aware fit (`fitFor`, `boundsOf`) | Both | `chart/framing.ts` | Fixed-point fit that includes screen-sized labels, floors, and the lane (Solar: the frontier belt and every formation's spread) |
| Label placement (`sideOrder`, touch rule, `data-why`) | Both | `chart/labels.ts` | Role-based side order, no overlaps, a recorded reason per rejection |
| Density harness | Both | `tests/e2e/density.spec.ts` | Objective checks plus a report and screenshots for judging aesthetics |

**Source:** the files in the table · **Update when:** a mechanism is added, renamed or moved.

## 4. Conclusions
*Applies to: both views.*

- **Some fixes need screen space.** A layout parameter that protects a screen-sized thing (label
  room, vessel spacing, station spacing) must be expressed in screen pixels and fed through the
  same fixed-point fit. Expressed in world units, it fails at one end of the density range. (Solar
  learned it again: §7.)
- **Moving labels alone can't solve density.** When objects are packed tighter than their labels,
  the objects themselves have to reflow.
- **Viewport aspect matters.** Formations should match the window's shape (wide and shallow for
  landscape) rather than one fixed geometry.
- **Sizes are in screen points, and big scenes scroll (decided 2026-10-07).** A scene too big to
  show whole at a usable size opens as a page and scrolls, rather than shrinking past the minimum
  target (`MIN_TARGET_PX`; `TOUCH_TARGET_PX` at the opening; [15 §5](15-reference.md#5-sizes-floors-and-layout)).
  Applied to the galaxy grid first (188 projects; `pageScale` in `sizing.ts`); sectors are capped at
  15 Features and Feature systems are still seen whole. See 06 §3.
- **Priority has to be explicit.** When space runs out, the layout must know who yields. Today
  that's implicit in label order: parent, children, stations, vessels, ships. (Solar makes it
  explicit with each asset's label rank, [15 §4](15-reference.md#4-roles-kinds-and-assets).)
- **Accepted limits** (status at the time of writing, v0 views):
  - In the dense system about a third of planet labels hide (show on hover).
  - ~~In the dense close-up, 4 interior Task buoys touch.~~ Fixed in slice 3a by the **Task radar**
    (06 §3): Tasks sit in bands by rung as half-label dots, only Underway ones labelled, with a
    tally on the body's label. What worked: dropping per-object labels for a summary, and using the
    full front arc for spacing. The 20-Task close-up now passes the harness.
  - Sparse systems fill only about 30% of the viewport.

## 5. Proposed solver (deferred)
*Applies to: the v0 views.*

Deferred on 2026-10-01 because the view was good enough; **closed 2026-10-27, superseded by the mandala** (23 §5).
Solar took a different route: a fixed plan in shared code plus screen-terms passes (§7).

A deterministic layout solver that reflows objects as well as labels. It runs on scene entry, on
viewport resize, and when a sync adds children.

1. **Generate candidates.** Enumerate a small grid of layout parameters per scene, each preserving
   the grammar:
   - ring step and depth;
   - children per ring (2, 3, or 5) and the ring limit;
   - per-ring angular offset;
   - station spacing and staggering (alternate stations one label row lower);
   - Task row count in the system view;
   - the lane's label rows.

   That's about 20–60 candidates.
2. **Score each candidate headlessly.** The candidate's positions, the floors, the lane rule, the
   fit, and the label placer are all pure, about 1 ms per candidate. In order:
   1. **Hard:** zero hit-area collisions, nothing outside the usable viewport, and floors respected.
   2. **Visible labels weighted by priority.** Suggested weights: parent 10, PR vessels 8,
      stations 7, children 5, ships 3. These are open for review.
   3. **Reading order:** visible labels progress from top-left to bottom-right.
   4. **Viewport fill,** within limits; sparse scenes may zoom in.
   5. **Stability:** prefer the previous layout's parameters when scores are close, so small
      changes don't re-flow everything.
3. **Choose deterministically.** Same history, viewport, and weights give the same layout. Cache the
   choice per scene and viewport bucket.
4. **Animate the change.** When the chosen layout differs from what's on screen, move each child
   along its orbit arc over 300–600 ms, then stop. Nothing orbits indefinitely, and the animation
   isn't needed to hide computation, since the solver is fast enough.
5. **Budget overflow.** If the best candidate still can't show every label, show the highest
   priority ones. Hidden children can be summarized as a "+K more" chip on the parent's label (open
   question: chips, or hover-only as now).
6. **Verification.** Extend the density harness: assert the hard constraints at both extremes and
   at two or three window sizes (1280 × 800, 1440 × 900, 1920 × 1080). Record the score and the
   chosen parameters in the report. Golden-test that the choice is stable.

**Open questions for when this is picked up:** the priority weights (PRs above children, or the
reverse?), "+K more" chips versus hover-only, and whether sparse systems should zoom in to fill
the screen or keep a consistent scale between scenes.

## 6. The board (built 2026-10-09)
*Applies to: the v0 views.*

Sprints' pod systems lay out as the team's kanban board (06 §3; `src/shared/scene/board.ts`): rings
are people's lanes, A–Z from the top, and the front arc is the board's columns. The numbers are
`BOARD` in `board.ts` (v0 only; not in 15). What it does, against the principles above:
- **Objects reflow, not just labels.** Each ring is packed by isotonic regression along its arc, so
  bodies never overlap at any instant (`tests/unit/board.test.ts` checks every event instant of every
  fixture system).
- **Columns are slots (v1.3 B4).** The frame's columns are `BoardSlots` (`slotsOf`): the four ladder columns, or the team board's columns in order with a split
  one as two (one heading over the pair). Monotonic ladder map: Ready to the first slot, Underway to the first In Progress, Nearing to the last In Progress (never left of Underway), Accomplished to the last. A body's slot is its latest placement at the playhead (`ScopeHistory.board.placements`), else its ladder column mapped onto the slots
  (`ladder`). The same packing, frame and fixed-over-history rules apply; the minimum column share is `min(minShare, minTotal / slots)`, so four
  columns are unchanged and a seven-column board still reads. Pulsar's board is as wide as before per lane, and still shrinks to fit (the open row below).
- **Wide and shallow.** Rings are sized by how many bodies they must hold side by side (`sep` 620,
  at least 6), so a board uses the landscape width.
- **A fixed frame.** Lanes, ring sizes and column widths come from peaks over the loaded history, so
  the frame never moves on a seek.
- **Priority made explicit for ships:** on a packed ring there's no room beside a body, so ships ride
  above their work, between lanes. With ships beside it, the 20-Story density case failed its
  hit-area check.
- **Declined:** rotating the whole system with time to recycle the left side. Compressing Done does
  that job without moving everything.
- **One ring per person, drawn as a swimlane (revised 2026-10-09).** No shared lanes and no second
  rings: a busy person's ring is just longer. Each ring is a soft band `bandWidth` (330) thick that
  the bodies sit in, with faint edges, and the lane's head shows the person's avatar and full name.
- **Open (from the archived 91; v0 Sprints board only):** the `BOARD` numbers, and whether dense
  boards should scroll rather than shrink. With the touch rule above, a crowded pod can hide a label
  (a three-body pod hid one planet's label between two lane heads, a ship and a Bug).

## 7. The solar system (v1, built 2026-10-10 to 2026-10-12)
*Applies to: Solar.*

The Solar view (13 §3, 14 §4) lays a region out as planets on orbits, not as a board. Its layout is
in two halves, and the split follows §4's first conclusion: **geometry in world units is planned once
in shared code; everything that protects a screen-sized thing is done in screen terms by the
renderer.** Every number below that is a constant is in [15 §5](15-reference.md#5-sizes-floors-and-layout)
(the floors, hits and geometry tables); this section keeps the rules and why.

**The plan (`src/shared/engine/solar/`, pure; `SOLAR_LAYOUT_VERSION` 9).** `planSolar(facts, pack)`
reads the whole loaded history and the scene, never the playhead (INV-14), and is memoised per facts
object. Every size and gap is a `GEOMETRY` field (`version.ts`): the star, one planet size for every
seat (INV-19), a piece, a trophy (`platformR`), a ship (`shipR`), a facility with its satellites (`FACILITY_REACH`), and the gaps
that drive the packing (`seatGap` between seats, `starGap` from the star, `facilityGap` round a
facility). The solar orbits tilt at `SQUASH`, a
rounder tilt than v0's boards. Bump the version with any change, and regenerate `solar.plan.json` and
`solar.scenes.json` in the same change.
- **A regular ring (v5).** Seat *i* takes angle slot `(i·s) mod n`, where *s* is the integer nearest
  n/φ that is coprime to *n* (ties to the lower; 1 for n ≤ 2), so neighbours in join order sit far
  apart. The slots are exactly 2π / n apart, starting at the top, and **every seat has the same
  radius**: the smallest (in `radiusStep` steps from the star's radius) at which every footprint is
  at least `starGap` from the star and `seatGap` from every other footprint. A footprint is the seat's
  whole mandala: its loiter ring and a ship's length past it (v8). Orbits are short arcs through each planet. (Superseded 2026-10-12: v2 to v4 packed
  each seat at its own radius, which interleaved; the user asked for perfect symmetry.)
- **The mandala (v8, 22 Block D, 2026-10-16).** The user, on the station rings: "a revolution in
  readability… we should find and implement more opportunities for this rational, geometric alignment
  of objects." A slot is an idealised circle for its class, as wide as its largest dimension, padded
  by a slot (small objects) or half one (large), on rings round a parent or spread over its area.
  - **Pieces on the planet** (`halfDiscSlots`). Stories on the left half-disc, bugs on the right. A
    class's n slots split its half into equal areas: m rows (bands of equal area, mirrored across the
    equator), each band cut into equal-area cells, each slot at its cell's centroid. The row counts are
    searched near each band's share of the area, and the arrangement that leaves the most room wins
    (an equator row on a tie). Room is the largest slot radius that keeps half a slot's padding
    (`PIECE_PAD`), the meridian and the rim. Both sides take the busier side's size, at most `pieceR`,
    so a busy planet's pieces are smaller. Filled by arrival from the planet's centre out.
    About 4 slots a side fit at full size; 14 a side shrink to about 0.47.
  - **Trophies** (`trophyShells`, `trophyOffset`). Every piece that closes at the planet in the round,
    by close order (`closeOrder`): shell 0 at `planetR + 1.5 · TROPHY_W` (a full trophy off the rim, 2026-10-24; the planet's name overlaps the planet by half its height, in that gap), with
    `ceil(2π r / 2·TROPHY_W)` slots, so the gap is at most one slot. The first is on the star line, the
    rest alternate either side of it. Further shells sit `√3·TROPHY_W` out, turned half a slot.
  - **The loiter ring** (`loiterRadius`, `loiterOffset`). One trophy slot past the last shell. Slot 0 on
    the far side from the star, the rest alternating, `4·shipR` apart. Who takes which is the
    projection's (`loiterSlots`: first to arrive, kept while they stay).
- **The frontier belt.** An annulus one `lane` outside the outermost footprint, as wide as a piece
  plus pads, moved out until its pieces clear each other. Slots evenly round it, in first-unassigned
  order from the top, either side in turn (22 D5).
- **A ghost reseated while Off (23 C9).** A reseat made while a piece is Off waits until it is back on
  the ladder, unless the new seat is already on the board (someone else holds work there on the ladder at
  some instant of the round): then the ghost goes there at once and has a slot in that seat's mandala
  (`ghostSpans`, `rosters`). Its slot comes **after** every piece that was on the ladder there, so no
  other piece's slot moves for it (R4); it counts toward the half-disc's size like any member, so a
  planet that gains a ghost may shrink its slots. It holds nothing: the planet's vacancy (`seatReason`,
  23 C3), the seats and the trophies read the held spans, which it isn't in. To a person with no seat, or
  to no one, the ghost stays where it went Off. No fixture has one; `solarSeek` pins it.
- **Stations, on two regular rings (v7, 22 C11; settled 2026-10-16 on the user's third look).** Each
  serves the seats holding a piece linked to one of its attachments, weighted by link count; they
  arrive in order of the region's first need of each (`firstNeeds`). The user's brief: "regular
  intervals around the radius… a rotation equal to half the angle between planets… nicely interlock
  visually with the planets… within a 'one station padding' from all objects around them while still
  packing the objects together as tightly as concentric circles of spherical objects can pack into a
  flat plane." Earlier cuts (a search for a clear point, then rings turned and sized to fit) read as
  random on real data.
  - **Slots** (`gapAngles`): half-way between neighbouring planets, `perGap` side by side in each gap.
    The first planet stands at the top, so the pattern is symmetric about the vertical; with an odd
    count the bottom slot is the middle of the bottom.
  - **The inner ring** (`placeRings`): one slot per gap, or `ceil(multi / planets)` when the
    multi-planet stations outnumber the gaps. Who sits where depends on the angles alone:
    - single-planet stations first, by arrival, each the gap beside its planet, leaving one for each
      multi-planet station;
    - then those, the gap nearest their weighted aim (`AIM_MIN`; aimless ones the first free).

    Then one radius, the largest inside the planets at which every taken slot keeps `STATION_PAD` (a
    station's width, 760) from the other taken slots, half that (`BODY_PAD`) from the star and every
    planet, piece, platform and formation disc, and `facilityGap` from the planets' orbit line. None:
    the plan moves the planets out (at least 5% a time, `MAX_PUSHES`). Harbor Pod (4 planets, 3
    stations, busy planets): 1,702 → 2,519. Signals Pod (2 planets, 2 stations) and the dense pod (12
    planets): none. A full width from the bodies too pushed Harbor to 3,217, where at 1024×640 floored
    hits overlapped (VC-3).
  - **The outer ring:** the single-planet stations left over, at `OUTER_SIZE` (0.7, padding and floor
    too), in the gaps, at the smallest radius past the planets where every taken slot is clear. The
    frontier belt lies beyond.
  - **On screen:** a ring station sits exactly on its slot, with no nudging. At a small fit a station's
    floor would draw it well past its planned size (the dense pod at 0.062: a radius of 922 against
    380), so its drawn size is capped at `RING_MAX_SCALE` (2, into half its padding; `ViewNode.maxScale`):
    at a far zoom it looks smaller, and the pattern stays exact. The fit includes every planned station
    at that reach (`stationReach`).
  - Superseded: the midpoint spiral and the beside search (until 2026-10-15); the first two-ring cut,
    with every single-planet station outside and the inner ring turned and leaning toward its work
    (2026-10-15); and the on-screen slide along the ring (2026-10-16).
- **Compounds.** Online first-fit in open-time order (23 C6): each attachment takes the lowest slot free
  when it opens and keeps it; with every slot held a PR waits in "+N" and is promoted into the first slot
  that frees, and a drawn tender never changes slot. `compoundCap` slots on the front arc, then the "+N" mark;
  guards (`fnv1a32(repo) % 4`) on the back arc.

**On screen (the renderer, `scenes/placeFormation.ts`, `placement.ts`, `framing.ts`).**
- **Slots stay exact (22 Block D).** Pieces and trophies are drawn on their planned slots at any scale.
  Where a floor would draw one past its slot's room, its size is capped (`ViewNode.maxScale`: a piece's
  room, a trophy's own size), as the ring stations are (22 C11: keep the symmetry). The frontier's
  pieces still move out from the star, until their hits clear every planet's pieces and loiter ring
  and every planned station (23 C8).
- **The loiter ring as drawn** (`drawnMandalas`, `placeLoiterRings`). Ships keep their floor (to stay
  readable), so at a far zoom the ring moves out just far enough that a ship's hit clears the trophies
  (or the pieces), on every side alike. The drawn radius is written onto the seat's effective node, so
  resting ships, the planet's name (not on it now: under the planet) and sorties (parked on it) agree.
- **The order** (`placeInScreen`): formations, platforms, loiter rings, stations, then the attached
  and travelling objects; a ship with a loiter slot goes exactly on its ring.
- **Tried and dropped (2026-10-16):** pushing the trophy shells out at a far zoom. Their floored hits
  cleared the pieces, but the shells then reached the star and the inner stations at 1024×640.
- **Formation hits** stop halfway to the nearest neighbour, even below the visual size, because
  members touch and v0's `max(visual, floor)` would make their hits overlap.
- **The fit** includes the whole frontier belt and every formation's spread at the fit's scale, so it
  doesn't change as pieces come and go.
- **The Power link formation stays on the board** (27 D2): `formationSpots` takes the frontier rectangle from the plan, so the board is scale- and camera-free; the spacing follows the station's drawn size.
- **The Power link formation keeps clear of the beam** (27 D3): the same pure rule, given the far ends of the strands (station to each piece the work served). A line whose ships come within `CORRIDOR_HALF` (1.5 ship sizes) of a strand is turned in 15 degree steps, nearest first, to the first line that is on the board (D2 still wins) and clear of the plates; failing the plates, the first on the board and clear of the strands (a corridor beats a plate); failing both, D2's place is kept (`blocked`) and the beam draws at `VEIL_ALPHA` along the stretch that passes the ships. The search runs once at gather, from the station's centre.
- **Guides** (`solarGuides.ts`, through the theme's `guides`): the frontier belt and formation halos.
  The belt is drawn only while unassigned work is in it at the playhead (19 S2), but always on the
  plan's fixed belt, so showing it adds nothing to the layout and the fit never changes. (The threat
  light, a red glow on its outer edge from 2026-10-13, retired in 19 S2.)

**What the density harness found** (2026-10-10 to 2026-10-12; [slice-V1-W1-T3](archive/progress/slice-V1-W1-T3.md),
[slice-V1-W2-T2](archive/progress/slice-V1-W2-T2.md), [slice-V1-W3-T1](archive/progress/slice-V1-W3-T1.md)):
- **Strict band separation makes crowded boards big.** Outermost orbit radii: 3 seats with 3 + 2
  pieces, about 2,400; 6 seats with 3 + 3, about 4,700; 6 seats with 6 + 5, about 6,000. At fit the
  region's scale is small: `pod-sprint`'s Harbor Pod (4 seats, 3 stations) fits at about 0.13.
  (Superseded 2026-10-12: the regular ring packs by footprint, below.)
- **World-unit clearance stops holding on screen.** At 0.13 the free pieces' 200-unit moon ring is
  about 26 px, while a threat's screen floor gives it a 29 px hit. So pieces sit inside their seat's
  hit and each other's, and midpoint stations sit inside the star's: **21 overlapping hit pairs**
  (VC-3) on `pod-sprint`. This is §4's lesson again: a world-unit gap protecting screen-sized
  objects fails at one end of the scale range.
- **A screen-terms moon ring alone can't fix it at the old floors (0.55 / 0.9).** (Superseded: the
  ring went with free pieces in v4, when every piece moved into its seat's region; `placeFormation.ts`
  has no moon ring. The threat floor and the station spiral below still stand.) An offline replay of
  the drive's dump at scale 0.1298 (same hit rule, 6 px gap):

  | Threat / facility floor (×`LABEL_PX`) | Screen spread of free slots | Moon ring (px) | Overlaps left |
  |---|---|---|---|
  | The first placement (200-unit world ring) | 36° | about 26 | 21 |
  | 0.55 / 0.9, screen-terms ring | 36° | threat 104, objective 62 | 2 |
  | 0.55 / 0.9 | 60° | threat 64 | 4 |
  | **0.3 / 0.5, with a first-free spiral for stations** | **60°** | **39 (about 300 world)** | **1** |
  | 0.4 / 0.6 | 60° | threat 48 | 1 |

  At the old floors a threat needs a 104 px ring, about 800 world units, more than an orbit's
  spacing, so pieces would stop reading as their planet's. What works is smaller floors for threats
  and stations (an art call: a threat's ship is drawn bigger than its planet today), a wider
  on-screen spread for the free slots, and a first-free pass for stations, which then move only
  0–21 px. The one overlap left is a free threat against its seat's one-member threat formation, so
  the formation shift must give screen clearance: `centre ≥ ring + pieceHit + gap + formation outer
  hit`, not just the ring's growth.
- **Pitch spreading changes clearance.** At small scales a spread formation can reach orbit lines,
  other seats or stations, which the plan cleared only in world units. The harness's solar case
  checks formations against orbits, seats and stations, threat footprints (2r) and station hulls
  against captains and planets.
- **Status (2026-10-12): met.** 17 W4-T2 adopted the 0.3 / 0.5 row (the threat floor stands; the
  facility floor was raised later, below; current values in [15 §5, Floors](15-reference.md#5-sizes-floors-and-layout)),
  with a first-free spiral for stations in `placeFormation.ts`. Stations settle in the plan's order
  (arrival, then key) against the fixed board (star, planets, every group's disc, the frontier belt)
  and the stations settled before them, never against what is drawn now, so a spot depends on the
  plan and the scale alone (INV-14). `solar.spec.ts` has no expected-failure mark on VC-3. The density
  solar case reports 0 hit overlaps, 0 formation issues, 0 footprint overlaps and 0 station issues on
  Harbor Pod at 1440×900 and 1024×640, at 5%, 50% and 100% of the round
  ([slice-V1-W4-T2](archive/progress/slice-V1-W4-T2.md)). Orbit-line crossings at the smallest window
  are reported, not asserted (for HG-V3).
- **Stations twice a ship (2026-10-12, art session; `SOLAR_LAYOUT_VERSION` 6).** The facility floor
  is now twice a captain ship's, and `GEOMETRY.facilityR` half a planet, with its satellites scaled to
  match. The 0.5 row above held because a station couldn't reach a platform; at the larger floor it
  can (`harbor-console` × two orbit platforms at 1024×640), so the station pass now also keeps clear
  of **every platform spot** (`platformSpots`, fixed by the plan and the scale, so still INV-14). The
  density solar case is back to 0 issues at both windows.

**Answered 2026-10-12: loosen the bands.** Doubling the object sizes (`OBJECT_SCALE`) alone changed
nothing on screen: the camera fits the whole region, and strict bands grew the orbits by 1.8× with the
objects (Harbor Pod's outermost orbit went from 2,802 to 5,030), so the fit zoomed out by the same
factor. The packer above spaces seats by footprint collision instead. `pod-sprint`'s Harbor Pod
(4 seats, 3 + 3 pieces) now fits with its frontier belt at 2,238 where the strict bands put it at
6,402; a 9-seat region with 3 + 3 pieces each fits in about 3,600 × 2,800, close to the stage's
aspect. The star measures about 170 px across and a planet about 90 px at 1440 × 900, against 62 and
30 before. Two smaller finds on the way: a rounder tilt (`SQUASH`) uses the stage's height, and at the
smallest window a piece's or a station's minimum screen size outgrows a narrow world-unit gap, hence
`starGap` and `facilityGap`.

**Open.** Whether a dense region should scroll rather than shrink (§4, *big scenes scroll*), and
whether the mandala's half-discs should turn with the planet's angle (today they're screen left and
right, as the user asked). The knobs are `OBJECT_SCALE`, `SQUASH`, `seatGap`, `starGap`, `PIECE_PAD`,
`TROPHY_W`, `shipR`, and the v1 kind floors, all
in [15 §5](15-reference.md#5-sizes-floors-and-layout). The frontier push-out (`placeFormations`) also clears
every planned station (drawn yet or not, at the plan's spot and a ring station's largest drawn size), so a
frontier piece pushed out past a group never lands on one (23 C8; `frontierStations.test.ts`). It takes the
first spot along its ray clear of everything; when none is, the first clear of the groups and loiter
rings, as before. On the fixtures it never changes a position (stations clear the belt's middle already).
