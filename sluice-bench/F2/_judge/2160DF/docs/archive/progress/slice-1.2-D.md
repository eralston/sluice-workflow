# Slice 1.2-D: the mandala

**Status:** built 2026-10-16. [22 §3, Block D](../22-v1.2.md#3-blocks): D1–D7, from the user's review of
Block C on real data ("a revolution in readability… find and implement more opportunities for this
rational, geometric alignment of objects"). Built in one pass; gate HG-D-mandala.

## 1. What was built
The rules are 05 §8.2a: S-13 to S-16, K-16, M-30, A-9. The geometry is 08 §7. The layout version goes
to 8.
- **Pieces on a planet (D1).** Stories sit on the left half-disc and bugs on the right.
  - **Equal areas:** each class's slots split its half into equal areas, in rows mirrored across the
    equator, each slot at its cell's centroid.
  - **The arrangement:** the one that leaves the most room wins, an equator row on a tie. Slots fill by
    arrival from the planet's centre out (`engine/solar/mandala.ts` `halfDiscSlots`).
  - **Size:** both sides take the busier side's size, at most full size, keeping half a slot of padding
    (`PIECE_PAD`). A busy planet's pieces are smaller: about four a side fit at full size, and 14 a side
    draw at about 0.47.
- **Trophies (D2).** Every piece that closes at the planet in the round goes onto one ring, stories and
  bugs together, in close order (`closeOrder`).
  - **The first** sits on the star line, half a trophy's width off the rim.
  - **The rest** go either side of it in turn, the gap between neighbours at most one slot.
  - **More shells:** a full ring starts another, √3 slots out and turned half a slot.
  - **Reopened pieces:** one that reopens keeps its slot, left empty.
- **Loiter slots (D3, D4).** A ring sits one trophy slot past the last shell, slot 0 on the planet's
  far side from the star.
  - **Who sits where:** a pure walk of the history to the playhead (`scene/project/loiter.ts`
    `loiterSlots`). The first to arrive by a planet takes slot 0; the rest fill ±1, ±2… by arrival, and
    each keeps its slot while it stays.
  - **What counts as arriving:** a seated captain's rest per K-11, a guest's per K-14.
  - **Spacing:** slots are a ship length apart plus another, or the drawn length at a far zoom.
- **The frontier belt (D5).** Unassigned pieces sit evenly round it by arrival, from the top, either
  side in turn.
- **Sortie parking (D6).** A captain working a planet's piece parks on that planet's loiter ring, at the
  slot nearest the work (`ringApproachOf`).
  - A strike run's fanned ships take adjacent slots.
  - The plate-dodging choices are the neighbouring slots.
- **Plates (D7).**
  - **The planet's name** (revised 2026-10-22, see §6) sits centred under the planet, touching its bottom, with no pointer and the lowest label. (Built first on the far-side ray, just past the loiter ring as drawn.)
  - **A piece's plate** hangs outward along its ray from the planet's centre (`ViewNode.labelFixed`),
    reaching further along it before it would turn off it.
- **On screen: keep the symmetry.** Pieces and trophies stay on their slots at any scale. Their drawn
  size is capped instead (`maxScale`: a piece to its slot's room, a trophy to its world size).
  - **The loiter ring:** ships keep their floor to stay readable, so at a far zoom the ring moves out
    just far enough that their hits clear the trophies or the pieces (`drawnMandalas`,
    `placeLoiterRings`). The drawn ring goes onto the seat's effective node, which ships, the name and
    sorties all read.
  - **Frontier pieces** move out until they clear every planet's pieces and loiter ring.
- **Removed:**
  - the hex lattice and the lit-edge platforms (`formations.ts`);
  - `shadowShift`, `orbitGap`, `pitchFactor`, `PLATFORM_PITCH_PX`;
  - the screen pass that spread formations and pushed platforms.

## 2. Contracts changed
- **03 §5e (Block D) and §5d:**
  - `SeatSlot.mandala` (`SeatMandala`), `GEOMETRY.shipR`, `TROPHY_W`;
  - `ViewNode.attach.loiter`, `loiterR`, `loiterWithin`, `labelFixed`;
  - `loiterSlots`, `drawnMandalas`, `ringApproachOf`;
  - `holoCandidates(…, turns?, reaches?)`.
- **02 INV-07:** the Solar rest is on the loiter ring (normative).
- **05 §8.2a:** new; S-3, S-4, K-11 noted.
- **08 §7**, **13 §3**, **14 §4**.
- **15 §5:** the geometry rows (version 8, `PIECE_PAD`, `TROPHY_W`, `shipR`; three rows removed).

## 3. Checks
- **Unit:** `npm test` passes (1014).
  - `mandala.test.ts` (new): the fill order; equal-area, mirrored, centre-out slots, the bugs' side the
    stories' mirror, and less room for more slots; shells turned half a slot; loiter slots by arrival,
    kept while they stay, the same at a seek.
  - `solarLayout.test.ts`: D1 (sides, mirror, inside the disc, padding, one size, a busy planet smaller)
    and D2 (close order, the star line, alternating sides, the pitch, shells, the loiter radius).
  - `solarSeek.test.ts`: the fallback ship on its planet's loiter slots.
  - The solar goldens were accepted on purpose (layout v8).
- **E2E:**
  - solar-dense *the mandala* (new): at four playheads every resting captain sits on its planet's
    ring, slot 0 on the far side and the rest on their sides, and every piece on its class's half.
  - The density guard's formation check is now "hits as large as their spacing allows, never
    overlapping": the slots no longer spread at a far zoom, so a crowded planet's pitch can be under 25
    px.
  - VC-2's 12 px floor allows a piece's hit to be half the gap to its nearest neighbour, for the same
    reason.
  - Mapped specs: 50 passed. density: 5 passed. Keystone: 39 passed. Full suite: 162 + 21 passed.
- **Drive:** `v12-D` (`review/v1.2/D/close/`): Convoy and Harbor, each region and its three busiest
  planets close up, at the round's end and mid-sprint, then Harbor in play.

## 4. Human gates
HG-D-mandala (22 §2).

## 5. Known limitations and open questions
- **Hits on a crowded planet** at the fit zoom can be under 12 px (11.6 on Harbor's busiest) because
  the slots no longer spread. That's the trade the user chose with "keep the symmetry". Zooming in
  restores them.
- **Tried and dropped:** pushing trophy shells out at a far zoom (they reached the star and the inner
  stations at 1024×640). Trophies are drawn at their world size instead.
- **The loiter ring moves out at the fit zoom** (ships keep their floor), so planet names hang well
  out from small planets there.
- **Bigger systems:** the seat footprint is now the whole mandala (loiter ring plus a ship), so planets
  sit further out:
  - Convoy's 12 planets at 6,278 against 5,046 (+24%);
  - Signals and Lantern at 2,022 against 1,702.

  Harbor's moves in a little (2,461 against 2,519): its pieces no longer spill past the rim. The knob is
  the loiter ring's distance (one trophy slot past the shells).
- **Ships between planets:** the loiter ring's slots beyond ±2 can wrap toward the star, and the inner
  station ring doesn't avoid them.
- **The half-discs are screen left and right,** as asked. They don't turn with the planet's angle.

## 6. Revision: the planet's name under the planet (2026-10-22)
From the user's review: names hanging so far out broke the mapping to their planets. Now the name:
- **Sits centred under the planet, its top edge touching the planet's rim** (`holoUnderCandidate`), with no
  pointer line or dot (`HoloFrame.place` draws none for a pointer that starts where it ends).
- **Is its own class of label:** the lowest layer (`z-index: -1` inside `.labels`, now an isolated stacking
  context; it still draws over the planet's picture). It takes no place from the other plates and isn't
  an obstacle to them, so ships' and pieces' plates may cross it. Opened into its rows it lifts over the rest, to be read.
- **Left alone:** `ViewNode.loiterR`/`loiterWithin` (ships, sorties and the footprint still read them); `labelDir` for a seat is now unused by labels.
- **Checks:** unit `holoUnderCandidate`; e2e solar-dense *a planet's name sits touching the planet's bottom*; stills in `review/v1.2/D/names/`.
- **Gate:** HG-D-mandala (the planet names are part of what's to review).

## 7. Revision: the name over the planet's rim, trophies a trophy out, the name drawn under the objects (2026-10-24)
From the user's look at the real data (the name overlapped the closed pieces on the top planet):
- **The name overlaps the planet by half its height** (`holoUnderCandidate`, middle on the rim).
- **Trophies sit a full trophy's width off the rim** (shell 0 at `planetR + 1.5 · TROPHY_W`; the loiter ring and
  every footprint follow). `SOLAR_LAYOUT_VERSION` 9; goldens accepted on purpose; 15 §5, 08 §7, 05 S-14/S-15 updated.
- **The name is drawn by the scene, between the planet and what is over it** (`GraphScene.setNamePlates`): the
  painted pieces that overlay their planet (`AssetDef.over`, the asteroids) moved to a new `overBodies` layer above a
  crisp `nameLayer`; ships, stations and enemy ships were already above. So the planet is the lowest layer, the
  name on it, and everything in orbit passes over the name. The DOM plate stays (invisible) for the pointer and the
  rows; opened into its rows it is DOM again, over everything, to be read.
- **Known:** the name layer is global, so a planet's name also draws over a nearer planet that overlaps it
  (planets are spaced by their footprints, so this doesn't happen in the fixtures). `overBodies` is a second paint pass
  with the same filters.
- **Checks:** unit and e2e as §6 (e2e now expects the name's middle on the rim); stills in `review/v1.2/D/names/`.
