# Slice 1.2-C2: story time, arcs and a story's day

**Status:** built 2026-10-15. [22 §3, Block C](../22-v1.2.md#3-blocks): C2 (I-1, I-6), phase 1 of 4. It
stops here for the user's eye.

## 1. What was built
- **Story time** (`src/shared/playback/storyTime.ts`, pure, new): `storyTime(h, tz)` returns a copy of
  a region's bundle with its events re-timed for presentation, plus each moved event's real time
  (`realAt`) and the focus an arc's events share (`focus`). It's memoised per bundle and zone. The input
  is never changed.
  - **Arcs (B-12).** A story or bug's close joins the last merge, the same local day and before it, of a
    PR that served the piece or one of its Tasks. The piece's work events that day move round the merge,
    in order: those before it go just ahead of it, and those after it (the close among them) go just
    behind it. All of them share the merge's focus `arc:<prKey>`, so the schedule groups them into one
    beat.
  - **A story's day (B-13).** With no arc, a piece's work events on one day (its Tasks' included,
    through their parent at the time) gather just ahead of the day's last one.
  - **What moves (B-14, B-15).** Only work moves: state, assignee and title changes. Creations, links,
    moves in or out of the region, and PR events keep their real time, since they place things on the
    board. Nothing crosses a day, and order within a piece is kept.
- **Where it plugs in.** `v1/story.ts` `presented(h)` gives the bundle in story time under Solar, and
  the bundle as recorded for every other chain.
  - `playback.ts` `attachHistory` uses it, so the schedule, the board, seeks and the ruler use it.
  - `nav.ts` reads its 12 history reads through `told(id)`.
  - `schedule.ts` groups by the story focus where one is given (`storyFocus`).
- **History shows the real time.** A row that story time moved ends with *· at Tue 2:05 PM* (muted),
  with a tooltip saying why (`History.tsx`, `.history-row__real`). It shows only where it reads
  differently from its card's own time, so a close moved by a millisecond past its merge stays plain.
- **A plate crossfade fix it exposed** (`castLabels.ts` `place()`). Story time packs a beat tighter,
  which showed three plates at once for a frame. A plate that is fading out now keeps its place until it
  has gone. One newcomer takes that place and crossfades in (`replaced`), so a third plate never shows
  (22 B8).
- **A drive:** `tests/drive/steps/v12-C2.ts` (pod-sprint's Harbor Pod, Sprint 13). It finds the arc
  beats (a station's merge and a piece's close in one beat) and plays two at 1× with History open, a
  still every 700 ms.

## 2. Contracts changed
- **02 §5, amended (normative, in Step 0):** Solar playback presents in story time, and the record
  keeps real time. INV-12 and INV-15 hold, because story time is pure and seeks read the same re-timed
  bundle.
- **05 §8.3a** is now marked built and matched to the code:
  - B-14 names what moves and the zone a day is read in (`STORY_TZ`, the viewer's);
  - B-1's notes say it groups in story time under Solar;
  - I-1 and I-6 are marked built.
- **03:** none (the `ScopeHistory` shape is unchanged; story time is a copy of it).
- **15:** none (no new value; `STORY_TZ` is the viewer's zone).

## 3. Checks
- **Unit:** `npm test` passes (965).
  - `storyTime.test.ts` (new) runs over meridian's Sprint 7 and pod-sprint's Sprint 13. It checks that:
    only work moves, never across a day, with the same events kept; each item's order is kept; a close
    is pulled to just after its same-day merge, in one beat with it; each day ends on the real board;
    the step is pure and memoised; a raw bundle has no story focus.
  - `castLabels.test.ts` gains the crossfade case (16 tests).
  - docTables and the rulebook guard pass. No golden moved: they replay raw bundles.
- **Typecheck, lint:** clean.
- **E2E, the mapped specs** (solar, solar-dense, solar-play, slice2, slice3b): 57 passed. **Keystone:**
  39 passed. After the History refinement, solar and solar-dense were rerun: 26 passed.
  - New in solar-dense: *story time: a seek draws exactly what playing drew*. It steps 8 beats from 30%
    of the sprint, letting each beat's looks land on the view graph. It requires that History showed
    moved rows on the way, then seeks away and back and requires the same graph drawn.
  - It fails with story time off: no moved rows.
  - A first version compared a mid-beat pause with a seek. That differs by design, since a pause freezes
    the beat's claimed looks in flight (P-13), with or without story time, so the guard compares at rest.
- **Drive:** `npm run drive -- tests/drive/steps/v12-C2.ts --paradigm solar`. It found six arcs in
  Harbor Pod (beats 23, 24, 27, 31, 32 and 35), and in each the merge's piece closes in its beat. The
  stills and the notes (`notes.log`) are in `review/v1.2/C2/`.
- **The full suite** runs once at Block C's close, not per phase.

## 4. Human gates
No gate signs here: C2 is covered by HG-C-team at the close. For the user's eye at this stop
(fixture data only, INV-18):
- **Scene:** pod-sprint, Tidewater Array, Sprint 13, Harbor Pod, played at 1× (or the drive's stills
  `review/v1.2/C2/`: `01–14` are the first arc, *Harbor alerts opt-in*, with its beam in `08`; `15–28` are the second, *Low-water warnings*).
- **Watch:** a merge, then its piece's close straight after it, in the same beat instead of hours later.
  History's rows for the close (and any Resolved before it) end with their real time.
- **Not yet:** the close still jumps to its platform (C3, phase 2), and the formation doesn't yet land
  the close at the beam's impact (C4).

## 5. Known limitations and open questions
- **The zone is the viewer's.** A team spread over zones sees days cut at the viewer's midnight.
- **An arc reaches the station's beat only through grouping.** The close plays as its own maneuver right
  after the merge, in the same beat. The single climax, where the close lands at the beam's impact, is
  C4.
- **A mid-beat pause shows the beat in flight,** so the board differs from a seek to the same x until
  play resumes (P-13, G-16, C9). It did before story time too.
