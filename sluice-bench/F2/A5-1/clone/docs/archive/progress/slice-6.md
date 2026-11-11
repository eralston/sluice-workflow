# Slice 6: UX polish

Started 2026-10-09. A decision slice: every question in [91](../91-ux-polish.md) was ruled on with the
user, area by area, in 91's order. Questions the user had no view on yet stay open (their choice).

## Decided and built
- **The camera holds still around a click** (Follow area). Zoom/pan movement from `frameAction` and
  `followFrame` is suppressed while the pointer is pressed and for 1.5 s after (`cameraHeld()`), on the
  canvas and on labels. 05 §6; `slice3b.spec.ts` (two specs).
- **Upcoming beats in History.** The next three beats sit above the present card, dimmed, under a "Next"
  label; clicking one seeks to it. The list is newest-first, so the future is above the present, which is
  why it is above and not "below" as 91 first said. `panels/History.tsx`; `slice2.spec.ts`.
- **Pacing: "it dragged".** Real plays measured 60 s, 60 s, and 93 s at 1×. Cutting the budget alone
  couldn't help (with every Medium accent cut, orbit-week still ran 44.7 s and busy-week 53.5 s, because
  High beats and the 0.7 s minimum gaps are the floor), so the user chose **tighter gaps and holds**:
  budget 60 → 45 s, `GAP_MIN_MS` 700 → 500 (and the gap curve's base), `ORIENT_MS` and `FINAL_HOLD_MS`
  2000 → 1200, `TRAIL_MS` 18 000 → 14 000 so a late departure's trail still fades. High beats are still
  never cut, so the densest weeks run a little over 45 s (busy-week 48.9 s). Every schedule golden moved
  in timing; the only structural change was two Medium accents cut in orbit-week. 05 §3.
- **No true red in avatar swatches.** Crimson and raspberry became indigo and bronze: with no pictures
  readable, every captain wears one of these colours, and red means a real alert (09).
- **Sparse radars cluster.** Fewer than six Tasks keep six Tasks' spacing, centered at the front
  (`radarAngles`, `RADAR_SPREAD_MAX`); only radar Task positions in the scenes golden moved.
- **Pictures you add by hand.** Inspector card on a captain: Add / Change / Remove picture. The main
  process opens the file chooser, cuts a centered 128 px square, and keeps it at
  `<userData>/pictures/<org>/<identity id>.png`, outside the cache so Purge leaves it. It is overlaid
  on the identities when a scope loads, so it wins over ADO's picture and initials; the bundle marks
  the captain `handAdded`. Neither the path nor the bytes cross IPC; the dev log notes only that one was
  added. `main/avatars/pictures.ts`, `tests/unit/pictures.test.ts`, `tests/e2e/pictures.spec.ts`.

## Added after the first pass (2026-10-09)
- **Activity: how much the ships do.** ⋯ → Calm · Lively · Maximum, remembered, Maximum by default
  (test runs start at Calm). One table, `ENGAGEMENT` in `src/shared/playback/engagement.ts`.
  - At Lively and Maximum, every Medium-or-better change gets a ship and a tractor beam, even on
    beats whose accents the budget cut. These ship actions cost no schedule time.
  - The other person in a change works it too: a new assignee, a PR's author.
  - People with no ship in the scene come in as guests.
  - Every ship flying in from out of view now beams on arrival, which fixes "approaches without a beam".
  - On orbit-week at 4×, Maximum started 10 tractor beams against Calm's 6, and a beam was up 63% of
    the time against 46%. 05 §5; `tests/unit/engagement.test.ts`, `tests/e2e/activity-level.spec.ts`.
- **The board in the orbit.** Feature systems and pods read like the team's kanban board.
  - Rings are people's lanes, A–Z from the top, Unassigned outermost.
  - Along a ring the columns run Ready → Underway → Nearing → Accomplished, left to right.
  - The frame (lanes, rings, column widths) is fixed over the loaded history. Bodies are packed so
    they never overlap.
  - Faint lane-head avatars and column ticks; the map key explains them.
  - Done more than 2 days ago shrinks and tucks right.
  - A move along a ring travels the orbit, bowing out to the next ring to pass, with an eclipse
    when there's no room.
  - Ships ride above their work.
  - **02 INV-14 is amended for systems** (the frame is stable; the place follows the playhead, like
    the Task radar). 03 §5, 05 §5, 06 §3, 08 §6, 90 (BoardColumn), 91 (the `BOARD` numbers).
  - Checks: `tests/unit/board.test.ts` checks order, no overlap, a fixed frame, and seek equals play
    at every event instant of every fixture system. `tests/e2e/board.spec.ts` covers the travel
    along the ring and the lane heads.
  - Three unit tests of the old "bodies never move on a seek" rule were rewritten to the amended rule.
  - Scene and seek goldens moved in positions only (the same nodes and edges in every scenario).
  - `LAYOUT_VERSION` 2. `SYSTEM_LAYOUT = 'formation'` in `limits.ts` brings back the old rings.
  - **Revised the same day, after review:**
    - One ring per contributor.
    - Each ring drawn as a thick swimlane band, with the person's avatar and full name at its head.
    - Ships are obstacles for every other label, which changes sides or hides rather than cover a
      ship. Ship labels avoid their own assignment, and labels go around lane heads.
  - **Revised again, after the real org:**
    - A lane appears only for someone whose work is on screen at some point in the range.
    - Bands only: no edge lines, no thin orbit line.
    - Lanes are 950 apart, so a ship fits between them.
    - Each ship lives on a home track above its own lane, under its latest work there. It flies over
      only to work outside the lane, and drifts home after 6 source hours.
    - In a dense board a ship slides along its track to a clear spot.
    - Two ship tests now check the home track; a new check confirms every lane belongs to someone
      with on-screen work.
  - Fixes and test changes this brought:
    - Departure trails are kept inside the view: a wide board sent one under the side panel.
    - A merge now holds the linked work's move (`ProtectedMoment.linked`).
    - AC-49's "stays put" is measured in screen pixels (under 2 px): the wide board fits far out,
      where 3 world units is a fraction of a pixel.
    - The legibility check lets a compacted done item's label hide.
    - The sprints spec enters the planet rather than double-clicking its (possibly hidden) label.
    - The pixel baselines were re-accepted after looking at them.

## Settled as built (recorded in 91)
Camera: re-frame at the next beat, hold after press, the aura/tractor beam both cyan, and the rest of
the Follow area; History: the intro line and the passive sentences for actor-less events, accents above
2×; Feature systems at touch size; pinned-first order.

## Still open (by choice, or needs a decision)
- **Area-move Go** opens the Feature under the current sector, not the new one. The user asked for the
  new sector. It isn't a small fix: `goTo` navigates inside the open sector, so reaching another needs an
  Area Path that may not be saved. Open question in 91: may Go open an unsaved Area Path as a one-off
  sector (or offer to save it), and how does Back return?
- Review formation over a neighbouring label; the recent-work window (90 days); the 12 quotes; the
  Backlog-only loading numbers; Loading energy; Cancel by clicking elsewhere; Arrive/Depart tunables.
- A **settings surface** (People, Purge, where files are kept): the hand-added pictures want one; the
  Inspector card is the only entry for now. Drag-a-file-onto-a-captain is also open.

## Checks
`npm test` 277 pass; `npm run e2e` 103 + 21 pass; typecheck and lint clean. **HG-6** is the user's
review of a real week at 1×, in following and in everyone's view.
