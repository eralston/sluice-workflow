# Slice 1.2-C3–C4: the close in three acts, the art acts, and the arc climax

**Status:** built 2026-10-16. [22 §3, Block C](../22-v1.2.md#3-blocks): C3 (G-2, G-1) and C4 (I-1), phase 2.
Built straight on into phases 3 and 4 at the user's request ("continue implementation until you have
completed all of idea I-1 through I-7"), with one review at the end.

## 1. What was built
- **The close in three acts (C3, 05 §8 M-22).** Both closes (Landing, Strike run):
  - **The cause:** the captain's tractor or the strike pass, as before.
  - **The turn:** an initiating effect hides an instant swap to the done form. For an asteroid it's
    the new `stardust` theme command (Victory gold motes swirling in and out, densest as the land
    starts); for an enemy ship, a culminating explosion in Explosion orange.
  - **The glide:** a land of `CLOSE_SLIDE_MS` (1.2 s).
  - **The blossom:** the grand gold flare opens the echo where the piece settled, and the planet's new
    tally lands with it.
- **How the glide works.**
  - **No more rebuild:** `GraphScene` no longer destroys a v1 view whose radius changes. It keeps the
    view, scaled from the radius it was built at (`builtR`), so a closing piece moving to its smaller
    platform glides there instead of jumping (G-2).
  - **The release:** a maneuver may declare `slides`. The interpreter then releases its subject from
    the moment's protect as that phase starts (`Runner.release`, `Protect.release`), and the scene's
    glide carries it.
- **The art acts (C3, M-25; G-1).** `AdaptedView` gains overlays: an act may return an `Overlay`, drawn
  over the piece across `OVERLAY_S` and cleared. Its resting look stays the snapshot's (INV-12). The
  six (`assets/acts.ts`), listed by their assets:
  - `carve`: Progress blue cuts across the rock;
  - `rig`: Nearing violet gantry arches rising;
  - `ghost`: a grey veil and a breaking outline;
  - `engage`: an At-rest blue shield flare and Danger red gun ports waking;
  - `launch`: a tender sliding out of the bay;
  - `operate`: the station's ring of lights turning.
- **The arc climax (C4, M-23).** In the planner (`arcsOf`, `engine/maneuvers.ts`), a merge and the close
  of work it served, in one beat, are one moment:
  - **The close** becomes variant `arc`: its land, echo and disperse only. It starts at the merge's
    beam impact (`ARC_IMPACT_MS`, 1.3 s into the echo), unblocked by the merge's protect.
  - **Its holder** flies into the merge's formation as support (`PlannedManeuver.arc.holders`), named
    *Closed it*, unless already in it.
  - **Attention:** the close asks none of its own; the merge lights its plate.
  - **The renderer:** the Power link's hit flare uses the same impact time. An arc close's Landing
    swirls its stardust from the impact; its Strike run breaks up there.

## 2. Contracts changed
- **03 / 14 (as noted):**
  - `ManeuverDef.slides`;
  - `PlannedManeuver.arc`;
  - the `Act` type may return an `Overlay`;
  - `partOf(…, closedIt)`.
- **05 §8.4a** is marked built (M-22, M-23, M-25; G-1 and G-2 closed), with M-1, M-2 and M-3 noted.
- **13 §6.2:** the Landing, Strike run and Power link rows.
- **15:**
  - §2: Explosion orange;
  - §7: the closes' lengths (Landing 3400, Strike run 4200; `beamed` 5200 and 5600);
  - §8: `stardust`;
  - §10: `CLOSE_SLIDE_MS`, `ARC_IMPACT_MS`, `STARDUST_MS`, `OVERLAY_S`.

## 3. Checks
- **Unit:** `npm test` passes (987).
  - `artActs.test.ts` (new): every act a maneuver issues is one its asset plays.
  - `maneuvers.test.ts`: the arc's timing, cast and variant; the holder joining the formation; the
    sum-of-rules sanity bound given 5% headroom (one of every rule end to end is now 45.6 s against
    the 45 s budget, gaps compressing first in a real episode).
  - `commands.test.ts`: the closes' new timings (the swap at the land, the tally with the blossom).
  - `registries.test.ts`: the acts listed.
- **E2E:** solar-dense *a close glides to its platform* (new). The fastest step of any closing piece in
  30 s of play is under 12 px a frame, and it was 33.6 with the old rebuild. The rest runs with the
  full suite at the close of Block C.
- **Drive:** `v12-1b` shows the arc in Harbor Pod's beat 23 (`review/v1.2/C1b/23-…` to `38-…`).

## 4. Human gates
HG-C-team, at Block C's close: a close's turn, glide and blossom; an arc's single climax; the six acts
(watch Carve, Rig up, Warp out, Engage, Shuttle tender and Satellite cycle in `npm run gallery`'s
maneuver demos).

## 5. Known limitations and open questions
- **The acts are overlays,** drawn over each art rather than built into it: a first cut, to be judged in
  the gallery.
- **In an arc the close has no stardust lead-in:** the merge's hit flare covers the swap, and the
  stardust swirls from there.
- **The planet's tally waits for the blossom,** 1.2 s after the piece itself swaps.
