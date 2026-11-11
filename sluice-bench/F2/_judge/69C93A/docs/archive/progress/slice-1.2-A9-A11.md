# Slice 1.2-A9–A11: deliberate captains (rest off the planet, approach on the work's side, one thing at a time)

**Status:** built 2026-10-14. [22 §3](../22-v1.2.md#3-blocks): A9, A10 and A11. Built in the order A11,
A9, A10.

## 1. What was built
- **A11. One thing at a time, in the planner** (`engine/maneuvers.ts`).
  - Every maneuver now also waits for every maneuver placed before it that flies the same person (its
    `agent` or `support`, `crewBusy`). A captain's work in a beat plays back to back.
  - The beat's shape comes from the same sequencing, so it lengthens with the queue. The episode budget
    compresses gaps first, as before.
  - Light work skips anyone the beat's maneuvers already fly.
- **A9. Rest off the planet** (`scene/project/traffic.ts` `restAt`, Solar only, where `homes` is passed):
  - A ship whose last work is a piece on a planet attaches to that planet, pointing from its centre
    through the piece, so it stands just outside the planet's face on the piece's side.
  - With nothing worked yet, it rests by its own planet, `REST_BY_NAME` (0.9 rad) round from the name's
    way out, beside the name.
  - A frontier piece (no planet) is rested beside, as before.
  - `attach.work` keeps the piece it rests by. Its idle work, a faint tractor or a volley, aims at that
    piece, and only while the ship is parked and still.
  - Placement tries sixteenths of a turn in Solar, so the ship stays on the work's side.
- **A10. Deliberate interactions** (renderer):
  - **The approach.** A sortie comes in on the work's side of the work's planet (`approachOf`, new pure
    module `chart/fx/approach.ts`): the cast's seat, passed by Carve, Rig up, Landing, Engage, Strike run
    and Captain jump. A strike run fans its ships round that side, 0.6 rad apart.
  - **Parking.** It parks where it arrives and holds there while it works. Its parking point no longer
    follows the target live.
  - **The cut.** The cutting beam's sweep is narrowed from ±0.55 to ±0.35 rad.
  - **Waiting.** A captain whose turn comes later in a beat is held where it is (`HoldFor`) until its
    first sortie, so the beat's new layout doesn't glide it there first.
  - **The next target.** A ship whose next work starts at once flies straight from where it is.
- **Also fixed on the way:**
  - A star's plate no longer falls back to crossing bodies (a first try did, and covered a piece and
    took its click).
  - With no clear upright place it tries up-and-to-a-side, then hides unless pointed at or selected. The
    breadcrumb names the system.

**After the review (2026-10-14).** Six fixes:
- **The hold.** A waiting captain is now held by the runner's own delayed move. Its sortie takes over
  from the held spot. The first hold released a frame early, and the ship jumped to its glided spot.
  Should no sortie come, it flies home after.
- **The approach.** It now keeps at least the planet's radius plus the ship's gap from the centre, so
  work deep on a planet no longer parks the ship on its face. `approach.test.ts` adds a depth sweep.
- **Captain jump.** Its cast now carries the subject's seat, so it approaches on the work's side too.
- **Light work.** None for a captain the beat already flies; before, it played half, its support alone.
- **The idle beam.** It also needs the ship's glide to have arrived.
- **Guests.** Ships with no planet now rest off the planet of the piece they work, turned apart when
  several share it (`GUEST_FAN`). The goldens were accepted again.

**Facing and the ring (2026-10-14, the user's second look).**
- **Facing.** One rule in `GraphScene.faceByTravel` turns a ship or station by its actual drawn motion
  each frame (15 §10, *Ship facing*). Before, a gliding ship pointed at its rest piece or the star and
  a sortie chose its heading from its leg's end points: 66% of travelling samples pointed the wrong
  way in the dense pod; now under 5%. The movers' own turns and the resting rule stand aside while a
  ship moves; a ship holds its heading when still. `setFacing` now stores ±1, not a raw offset.
- **The ring.** Each seat drew its own short arc, near halves bright and far halves nearly gone, so
  the line broke wherever neighbouring arcs left a gap or doubled. Every planet stands on one ring
  (13 §3, v4), so it is now drawn once, whole, with a visible far half (`ringBack`). A unit test pins
  that all 12 seats share one ellipse.

## 2. Contracts changed
- **`ViewNode.attach.work`** (new, optional).
- **05 §8:** *One person does one thing at a time*, and light work skips busy people. 05 §8 amended, as
  22 A11 said.
- **13 §6.1:**
  - *How ships move*, rewritten: the queue, the sortie's approach, the parking, the work, at rest, and
    guests;
  - the cutting beam's sweep;
  - the idle tractor's row.
- **15 §5** hits: `REST_BY_NAME`.
- **15 §6:** the region-star row (its crowded fallback).

## 3. Checks
- **Unit:** `npm test` passes (895).
  - `maneuvers.test.ts`: new, one captain's two maneuvers back to back, another person's alongside, the
    beat as long as the two. The old "unrelated work alongside" test now uses an unrelated person.
  - `solarSeek.test.ts`: the fallback ship attaches to the work's planet, pointing through the work,
    before and after.
  - `approach.test.ts` (new): outside the planet on the work's side from any approach, the frontier
    case, the fan.
- **Goldens:** `solar.scenes.json` and `meridian.scenes.json` accepted on purpose (captains' rest spots
  and attach targets).
- **e2e:**
  - `solar-dense.spec` (5): captains off every planet's face at four playheads. The guard fails on the
    old rest ("Tove Lindgren on Rook's Landing").
  - `solar.spec`'s `worstContrast` now waits for plate transitions. A captain's plate lifts with its
    planet's now, and was read mid-fade at 1.6:1.
  - `solar`, `solar-dense`, `solar-play`, `slice3a`, `slice3b`, `density`, `gallery-v1` and `board`
    pass (71), and keystone passes (38).
- **Drives:**
  - `v12-dense`: every captain at rest 1.5 planet radii or more from the nearest planet's centre (before:
    0.39). The one reading under 1 is a ship in flight.
  - `solar-strike`: Ossian rests on his hive ships' side of Ossian's World.

## 4. Human gates
**HG-A-motion** (with A8). Watch Convoy Planning Pod play at 1×, and judge:
- where captains rest;
- whether each approach comes in on the work's side;
- whether travel and work now read as two acts;
- how the queue paces a busy captain (Mara, Bram and Esme have back-to-back beats);
- the strike run's fan.

## 5. Known limitations and open questions
- A-Q3: a captain whose queue outgrows the episode budget relies on gap compression; no case in the
  fixtures reaches the cut.
- A sortie's return leg can still be cut short by that captain's next sortie in the next beat: that is
  the change of attention, flown from where the ship is.
- Approach and parking are judged by eye and drives. The unit test covers the geometry, the e2e test the
  rest; no e2e test samples a sortie's parked frames.
