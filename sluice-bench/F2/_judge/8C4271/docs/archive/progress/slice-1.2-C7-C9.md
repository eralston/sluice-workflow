# Slice 1.2-C7–C9: where captains rest, the hand-off, guests, and the smaller gaps

**Status:** built 2026-10-16. [22 §3, Block C](../22-v1.2.md#3-blocks): C7 (G-7, G-8, G-10), C8 (I-5 for
guests, G-5, G-6) and C9 (G-12, G-14, G-16), phase 4: the last of I-1 to I-7. Built straight on at the
user's request, with one review at the end.

## 1. What was built
- **Where captains rest (C7, 05 §8 K-11; `pieceAnchors`, `traffic.ts`).** A captain with a planet
  rests off the planet of the **last story or bug they touched** in the region, even someone else's:
  - a Task's event counts as its parent's;
  - a PR's (opened, merged, abandoned, linked) as the work the PR serves;
  - never a station.

  Only pieces on the board count, so a Feature's own event, or a piece since moved away, leaves the
  last one before it. With none, the ship rests by the piece they've held longest, else by its planet's
  name.
- **The hand-off (C7, M-24).** `piece.reseat`'s agent is now the new holder.
  - Reassign sorties their captain to their own planet, arriving as the piece lands, named *Takes it*.
  - Whoever made the change isn't kept busy.
  - Unassigned: no ship.
- **No-fly turns (C7, P-16).** A rule may declare `turn: false`; the abandoned PR's settle does. No
  ship flies it, so it holds no turn, keeps no one busy, and names no crew.
- **Guests come and go (C8, K-13, K-14).**
  - **Presence:** a pure plan over the region's laid-out beats (`engine/guests.ts`, `guestPresence`).
    Each accented beat a guest helps in is a visit, and visits within `GUEST_STAY_MS` (10 s of playback
    at 1×) join. The schedule carries it (`BeatSchedule.guests`), and the renderer gives it to every
    projection of that scene (`ProjectOptions.guests`, `playback.ts` `projectOptions`), so a seek draws
    a guest exactly where playing does.
  - **Waiting:** a guest waits off the planet of the work they helped (`helpOf`: a PR's help is the
    work it serves), never a station while there's work to wait by.
  - **Arriving:** a guest ship new this beat, flown by its maneuver, is hidden. Its first sortie
    (`pursue`) drops out of hyperspace at the spot it parks at (`JUMP_IN_S`, 0.4 s), finishing as the out
    leg ends, instead of flying out from a rest. Should no sortie take it, the theme's entrance at rest
    plays as before.
  - **Leaving:** the agent asset departs by warping out (`departAct: 'warpOut'`, `WARP_OUT_S`): ahead
    along its heading, stretched, with a streak. GraphScene now plays a `departAct` for an asset that
    isn't `moving`.
- **Every crossed accent (C9, B-19).** A solar region plans every accented beat a frame crosses
  (`accentBeats`), each offset by how much later it began. The v0 views keep one per frame (AC-19).
- **Looks land on time (C9, P-18).** A claimed look the scene holds now ages on the travel clock its
  land is timed on, with a 30 s safety (`CLAIM_SAFETY_S`). It was 8 s of wall time, which a long
  queued beat at 1× or below could beat to its land.
- **No dead outcomes (C9, G-14).** The projection no longer writes a seat's `outcomes` (always zero).
  The field stays for the world art and its gallery.

## 2. Contracts changed
- **03 §5e (new): Block C's contract changes in one place,** from C2 on. C2–C6's notes said these
  were in 03; they weren't, so this note's change adds them:
  - `ProjectOptions`, `projectScene(…, opts)`;
  - `GuestPresence` and `BeatSchedule.guests`, `ScheduleOptions.guests`;
  - `PaceRule.turn`;
  - `BeatPlanArgs.accents`;
  - `Overlay.durS`;
  - `GraphScene.markJump` / `takeJump`;
  - `pieceAnchors`, `accentBeats`.
- **14 §1.1 and §2.6:** `limelight.ts`, `guests.ts`, and the Block C pacing note.
- **02 INV-07:** the Solar rest is K-11's (normative; see §5).
- **05 §8:**
  - K-11, K-12, K-13, K-14, M-24, P-16, P-18 and B-19 are built, and M-12, M-18, M-21, K-1, K-2, K-7,
    K-8, K-9, P-7, P-13 and S-7 noted;
  - G-5, G-6, G-7, G-8, G-10, G-12, G-14 and G-16 are closed.
- **13 §4.5** (guests) **and §6.2** (Reassign).
- **15:**
  - §7: Reassign and Satellite cycle;
  - §8: `pursue`;
  - §9: a reassign;
  - §10: `GUEST_STAY_MS`, `JUMP_IN_S`, `WARP_OUT_S`, `CLAIM_SAFETY_S`.

## 3. Checks
- **Unit:** `npm test` passes (1009 after the review's fixes). New:
  - `restAnchors.test.ts`: a Task counts as its parent, a PR as its work, a Feature's event or a gone
    piece leaves the last one, no piece means no anchor.
  - `guests.test.ts`: a stay joins visits, a longer wait leaves and comes back, seated people and
    silent beats never summon, a PR's help is on its work.
  - `crossedAccents.test.ts`: every crossed accent planned at its offset, and that today no frame
    crosses two.
  - `maneuvers.test.ts`: the hand-off's cast; an abandoned PR holds no turn.

  Both of the maneuvers cases fail on the old code. The solar goldens were accepted on purpose three
  times: captains' rests (K-11), guests' rests (by their work, not the station), and the seats'
  stages without `o=m0r0`.
- **E2E:**
  - solar-dense *guests come and go* (new): no planet captain ever leaves; a guest is first drawn
    where it parks (it moves under 90 px in its first 300 ms); at least one guest leaves. It fails on
    the old code both ways: with the jump-in off, *a guest flew out after arriving*; with presence off,
    *no guest ever left*.
  - Mapped specs: 54 passed, 1 failed. The failure was solar.spec's *pieces are hover-only*, which
    passes when its spec runs alone (15/15); it's watched in the full run.
  - Keystone: 39 passed.
  - **The full suite** before the review: 160 + 21 passed. After the review's fixes, 159 + 20 passed
    and 2 failed. Both failures were an app that didn't close within 60 s in `afterAll`
    (solar-play.spec, solar.spec's standby), not assertions; the two specs pass on a rerun (21/21).
  - solar-dense *a seek while a guest waits to jump in* (new with the review).
- **Drive:** `v12-C7C9` on meridian's Convoy Planning Pod (`review/v1.2/C7-C9/`):
  - a guest in the opening crowd (it enters at its rest, since no ship flies in a crowd) and leaving
    with the next beat (`01-…` to `24-…`);
  - a guest approver jumping in to a merge formation (`25-…` to `36-…`).

  The drive's hand-off mark found that merge, not a reassign, so the hand-off has no stills of its
  own; watch one in play.

## 3a. The review of Block C (fresh context, 2026-10-16)
One reviewer read all of Block C (C2–C12) and found nine kinds of problem. All are fixed, each with
a guard where one fits.
1. **Story time could move a close to before its piece existed** (high). A Bug created and linked
   after a merge had its close pulled back onto the merge, and the snapshot dropped it, so the Bug
   ended the round New.
   - **Fix:** no work moves across what places its piece or item (its creation, area or sprint moves,
     parent and PR links), and an arc that would cross one doesn't form. A story's day gathers only
     between them.
   - **Guard:** `storyTime.test.ts` *never moves work across what places it*. It fails on the old code
     (*Received: "New"*).
   - **Docs:** 02 §5 and 05 B-15 amended.
2. **A seek while a guest waited to jump in left its ship invisible** (high). The scene now owns the
   hiding (`markJump`), and a seek or a cleared director shows any waiting jumper (`endJumps`).
   - **Guard:** solar-dense *a seek while a guest waits to jump in*. It fails with `endJumps` off.
3. **A station's jump-in was planned in regions that already showed it** (high). That gave dead air,
   since `isFirstNeed` read every region of the round.
   - **Fix:** the schedule and the planner read the round's facts as the scene's region plans them
     (`sceneFacts`, `RoundFacts.scene`).
   - **Guard:** `stationArrival.test.ts` *a scene plans only its own region's first needs*, on a
     hand-built station shared by two regions.
4. **Day turns could be lost or mistimed** (medium-high).
   - **Lost:** `opensDay` was read against the previous draft, so a day whose first beats were silent
     lost its turn. It's now decided in `layout`, against the last played beat.
   - **Moved:** each day's spotlight moves onto the beat that opens the day (`spotlightsOnTurns`).
   - **Mistimed:** the breather fired on the ruler crossing 07:00, and can't be keyed to that now. It
     now plays once as the turn's gap begins (`dayTurnAt`). Schedules without day turns keep the 07:00
     dawn.
5. **A spotlight used up a person's first named turn,** though it may never show. It now counts
   toward the rotation only.
6. **02 §5 said story time never moves events later,** which a story's day does. The text is
   corrected.
7. **Story time was applied twice on opening a sector.** nav now passes the recorded bundle, and
   `storyTime` returns a bundle already in story time as it is.
8. **Limelight tests that could pass on nothing** now assert their cases.
   - The fair-share test asserts at least one fair turn checked.
   - The montage test asserts at least one montage, and so reads Harbor Pod too. Montage is rare: once
     in Harbor Pod, never in the dense pod.
   - Day turns are checked against played beats, and spotlights sit on played beats that open a day.
9. **Smaller fixes:**
   - The warp-out's tail had been drawn ahead of the ship.
   - `stardust` is now essential (it covers the close's swap).
   - The arc search checks `served` and a week's bound before counting working hours.
   - 05 §8.1, the stale *Planned* notes, and A-5's exception for the roll call (it names every
     chevron captain at once).
   - 03 §5e's `roundMerges` and `realTimeOf`.

## 4. Human gates
HG-C-ships, at Block C's close:
- rests by the last piece touched, never a station;
- the hand-off;
- a guest's jump in at the work, its wait, and its warp out.

## 5. Known limitations and open questions
- **The planned jump lead (`GUEST_JUMP_MS`) wasn't needed.** The jump fits inside every rule's gather
  (≥ 400 ms), so plans and seeks are unchanged. If a longer jump reads better, it needs that lead.
- **B-19 is a safeguard, not a fix.** A frame is capped at 100 ms of wall time (400 ms at 4×), and
  accented beats start over 500 ms apart, so G-12 never happened. It would at a faster rate or a
  larger frame cap.
- **Presence is planned on the schedule playing.** Highlights and Follow have their own schedules,
  hence their own windows. A sibling preview (no clock) keeps a guest once they've helped.
- **The warp-out shows the ship's real view,** stretched and slid ahead. The viewer's own style is
  kept, but its plate goes at once.
- **A guest in a crowd beat** (many arrivals at once) enters at its rest: no ship flies there to jump.
