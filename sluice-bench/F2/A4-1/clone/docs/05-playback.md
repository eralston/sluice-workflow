# 05 — Playback

**Status:** built; current as of 2026-10-27 (through v1.3 Block B); §8 is the rulebook of Solar playback (rebuilt 2026-10-15, 22 C1).

This doc covers how recorded history turns into a timed, navigable replay. Types are in
[03 §7](03-contracts.md#7-playback-types), rules in [02](02-domain-rules.md), and visuals in
[06](06-visual-brief.md). v1's Solar view plays only at the region, with maneuvers instead of
accents: see §8. Every timing value (budgets, holds, gaps, marks, accent and maneuver lengths) lives
in [15](15-reference.md); this doc keeps the rules and the reasons.

## 1. Clocks
*Applies to: both views.*

Playback runs on three clocks:

- **Source time** (`playheadUtc`): the ADO instant being shown. It decides *which facts are true*.
  The state on screen is always `snapshotAt(history, playheadUtc, lens)` (INV-12).
- **Schedule time** (ms, measured at 1×): position within the `BeatSchedule`. Each frame advances it
  by `elapsedWallMs × rate × tempo`, where tempo is the schedule's `tempoAt(x)` (1 unless the director's adaptive speed plays that stretch faster, P-25). `schedule.toSource()` converts it to source time.
- **Wall time:** the real time elapsed per frame. Accent motion and camera tweens run on wall time,
  so a 400 ms beam lasts 400 ms at any rate. Slower rates lengthen the *holds between* beats, not the
  motion itself.

**The displayed state is always a function of schedule time `x`.**
- **State:** `stateUtc(x)` is the `sourceUtc` of the last beat with `presentationStartMs ≤ x`. Before
  the first beat, it's `range.startUtc − 1 ms`, so an event exactly at the range start isn't shown
  before its beat plays. The screen always shows
  `snapshotAt(history, stateUtc(x), lens)`. Play, seek, and step all go through this one definition,
  so they can't disagree (AC-09).
- **Ruler:** the ruler shows `toSource(x)`, which moves smoothly through the gaps.
- **When to recompute:** `stateUtc` changes only when a beat is crossed. Recompute `snapshotAt` then,
  or on a seek, and never on every frame.

## 2. Session behavior
*Applies to: both views. Under Solar, play is gated to the region (§8); every other row holds.*

| Action | Result |
|---|---|
| Set range / start date | Build the schedule. The first scope loaded holds the **end** of the range (status `ended`), so the chart opens on the week's outcome; Play restarts from the start (decided in slice 2, 2026-10-02). A later scope keeps the playhead's source time. Paused. Default range: last Monday 00:00 local through the following Monday 00:00 (7 days; the weekend compresses per §3). Adjustable up to `BACKFILL_MAX_WEEKS` |
| Play | Advance schedule time at `rate`. At the end, `status = 'ended'` and the final state is held |
| Pause | Freeze schedule time and all effects in place. Resume continues from the same spot |
| Seek (ruler drag, date entry, or selecting an event in the list) | Schedule time `x = toPresentation(t)`. Selecting an event seeks to the start of its beat, so the whole beat is applied. Cancel all effects and render `snapshotAt(stateUtc(x))`. **No accents** (INV-15) |
| Step ▶︎ (→) | Jump to the next beat, play its accents once, then pause |
| Previous beat (←) | Seek to the start of the current beat, or the one before if already there. No accents |
| Next big moment in view (Shift →) | Jump to the next **High** beat that touches the current scene (`sceneEntityKeys`, §3): every beat on the way applies silently, and only the target plays its accents (AC-19's rule). Shift ← seeks back to the previous one |
| Start / end (Home / End) | Seek to 0, or to the end (status `ended`). No accents, no recap |
| Highlights (H) | Toggle a schedule of only the beats that touch the current scene (§3). Keeps the source time, rate, and status; entering another scene rebuilds it for that scene |
| Rate ¼×/½×/1×/2×/4× | Change the multiplier immediately. Source time, scene, and event order don't change; only the remaining time rescales |
| Navigate (zoom, breadcrumb, search) | **Playback is the scene's own (decided 2026-10-08):** entering a scene builds *its* schedule (§3) and holds it at the end, so the scene opens on its outcome — what ADO would show for that scope now. Nothing replays on the way in (AC-20), and Play there starts that scene's story from the beginning, with the button showing **↻**. So a history load only ever serves the scene on screen and what's under it |
| Follow (click a ship, F, a captain card's Follow, or Go on a departure trail) | Follow its captain (§6) |
| Frame the action (Z) | On while playing (slice 3b, decided 2026-10-03): when a High beat's objects are off-screen, the camera pans (or zooms out, never in) as its lead-in begins (`FRAME_MS`, [15 §10](15-reference.md#10-timing-and-budgets)). A manual pan or zoom suspends it until Z or Play; Z also turns it off and on. It skips the beats the director's camera handles (§6, 27 E9) |

The control bar shows the source date and time and the day of the week; the estimated remaining
presentation time shows on hover over the ruler. Keys: Space, ← / →, Shift ← / →, Home / End, [ / ]
(slower / faster), H (highlights), L (lens), E (In view / History tab), F (follow the selected captain, or
resume), Z (frame the action), ? (all keys). The bar's layout is in
[06 §5](06-visual-brief.md#5-accents).

**History on request (decided 2026-10-07; 04 §5a).** In ADO mode a scene opens on its current
state, and the player has three states:
1. **Request:** "Now" and "▶ Load history to play this team / Feature", with 1 · 7 · 14 · 30 days
   (7 preselected).
2. **Loading:** "Loading N days of history… done/total", a progress line, and Cancel. The scene stays
   explorable, and its subject gathers loading energy (06 §3).
3. **Ready:** the full player. Its ⋯ menu offers **Go further back** to the next range, which re-times
   the player at the same source time.

The click on *Load history* answers at once: the Loading widget reads "Starting…" until the first
progress event (23 B8, 06 §3).

**Partial history (23 B7).** A scene's history can finish with gaps, and the ready player says so rather
than looking whole. The bundle names them per played scene (`coverage.played[].missing`, `.capped`; 03 §4):
- **Items missing** (their reads failed with a 5xx, a timeout, or no response; 04 §5a): a line under the
  bar reads "⚠ History partial · N missing · **Retry**". Retry asks ADO again for those items **only**
  (`SyncLevel` `history` with `retry`); what answers leaves the set, and the line goes when none are left.
- **A capped crawl** (the revisions feed stopped at its page cap, 04 §5c, and nothing else is missing):
  the line reads "⚠ History partial · more on the next load", with no button. Nothing was refused and
  nothing failed: the crawl keeps its place, and the next load of the scene (reopening it, a refresh, or
  *Go further back*) carries on, so a button that re-asked now would only repeat the same capped request.
  With items also missing the line shows the missing count and Retry; the cap note stays in the Coverage panel.
- A 403 or 404 is not "missing" (kept as last known, marked stale, 02 §3).
- A streamed sprint has no such line: its gathering widget already reads "History stopped" with Retry.

**When a request doesn't finish (decided 2026-10-22).** The player says so and offers to ask again:
- **A request that failed or was cancelled:** the Request state reads "⚠ Didn't finish" or "⚠ Stopped
  before it finished", with **Retry** in the place of the load button (the same range; the others stay).
  What came back is kept.
- **A streamed sprint's history that stopped short:** "Gathering history N / M" reads "History stopped"
  with **Retry** (it reads the open scope again, so what's missing is asked for) when its stream has
  ended for `GATHER_STOP_GRACE_MS` with items still lacking history, or no request has started or
  finished for `GATHER_STALL_MS`.
- **A refused token** replaces both with the same words and *Enter a new token* (04 §6): asking again
  can't help until it's replaced.

A team's bundle has one range: the longest requested in it. Moving into a scene without history while
playing pauses, and its player offers the request. A scene played before catches up quietly in the
background ("Catching up…"), so its player is ready on arrival. Fixture mode is unchanged: everything
is loaded, and the player is ready at once.

**Camera input (decided 2026-10-07; 06 §3):** the wheel (and a trackpad's scroll, and a pinch)
zooms, in every scene; **+ / −** and the zoom buttons too; **0** returns to the opening view; ↑ or
Esc goes up a level. Drag pans; scrollbars appear only where a scene can't fit zoomed all the way out.
A pan or zoom by the user suspends following and framing, as before.

## 3. Beat schedule
*Applies to: both views. Solar sizes its beats through the hooks in §8.*

`buildBeatSchedule(history, range, tz)` is pure and deterministic, and golden-tested against the
`orbit-week`, `quiet-week`, and `busy-week` fixtures. Constants live in `src/shared/playback/constants.ts`;
their values are in [15 §10](15-reference.md#10-timing-and-budgets).

*All events (23 D1):* a player chip, for the session only (never saved), rebuilds the schedule from the playhead
(by source time, as Highlights does) with no budget at all (no gap squeezed, no accent cut), so the episode runs as long as its beats and gaps do. A beat still
plays no accent when it is Low, or when no maneuver rule plays any of its events (a zero-length shape: for example a
field edit that moves nothing on the board); those get light ship actions only. That is a rule, not a cut, so "every
beat" means every beat that has something to play. The chip is dimmed and disabled while Highlights is on (Highlights
owns the budget then).

1. **Input:** the bundle's events with `occurredAt` in `[range.startUtc, range.endUtc)`, in 02 §5 order. Observations are never scheduled.
2. **Focus of an event.** Relationships are evaluated in the `knownThen` snapshot *at the event's
   `occurredAt`*.
   - Task events focus on the Task's parent Story or Bug. A parentless Task focuses on itself.
   - `pr_*` and `link_pr_*` events: take the PR's links valid at that time, ordered by
     `(link time, itemKey)`. Map each linked item to a Story or Bug, following a Task to its parent.
     The focus is the first such Story or Bug; if there is none, the focus is the PR.
   - Every other event focuses on its own entity.
3. **Grouping.** Only the *current* (most recent) beat can absorb an event. An event joins it when
   it has the **same `occurredAt`**, or the **same focus within `GROUP_WINDOW = 30 source-min`** of
   the beat's first event. Otherwise it starts a new beat, so an X, Y, X focus sequence makes three
   beats. `beat.sourceUtc` = the beat's last `occurredAt`.
4. **Beat priority and duration:**
   - The priority is the highest priority among the beat's events.
   - `durationMs` = the longest accent target duration among its events (see §4), with protected
     moments played first (`protectBeat`, §5). Under Solar, `beatShape` sizes it instead (§8).
   - When the beat holds 2 or more `mediumGroup` Task events, the duration becomes
     `max(longest accent, GROUP_BURST_MS)` (a wave of Tasks: collapse, run, re-expand, echo; 15 §8,
     `stageShift.task`).
   - A beat of only Low events gets `durationMs = 0` and `accented = false`.
5. **Gaps.** Gaps are measured only between consecutive **timed** beats (`durationMs > 0`), and from
   the range edges to the nearest timed beat. Each gap runs from the earlier beat's `sourceUtc` to
   the later beat's *first* `occurredAt`.
   - `wHours` = the hours in the gap, weighted 1.0 on weekdays 07:00–19:00 local and 0.1 at all
     other times.
   - `gapMs = clamp(GAP_BASE_MS + GAP_LOG_MS·log2(1 + wHours), GAP_MIN_MS, GAP_MAX_MS)`: a
     leisurely pace (decided 2026-10-03; superseded 2026-10-09: the floor was cut, "it dragged").
   - A zero-duration beat sits at its interpolated position inside the surrounding gap.
6. **Frame:** add `ORIENT_MS` at the start (source held at the range start) and `FINAL_HOLD_MS` at
   the end (superseded 2026-10-09: both were longer). A solar region's orientation is
   `OPENING_ORIENT_MS` (step 8).
7. **Budget** (`pacing.budgetMs` (DESKTOP: 45000); superseded 2026-10-09: it was a minute). Over budget, **first compress the gaps**: every gap shrinks
   proportionally toward `GAP_MIN_MS`, by the largest factor that fits. Only if every gap at the
   minimum is still over budget, take the accented beat with the lowest priority (ties go to the
   latest index), set it to `accented = false, durationMs = 0` (its state still applies), and
   compress again. **High beats are never cut**, nor (v1, 2026-10-13) a beat whose shape says it
   plays an **essential** moment (`BeatShape.essential`: a close, a merge, a milestone). A Bug's
   change is Medium (02 §4), so before this the strike run at the end of a long sprint was the first
   thing cut, and with it the region's all-clear. If only uncuttable beats remain and the total is
   still over, accept the minimum gaps; the control bar shows the true estimate.
8. **Map:** build piecewise-linear segments.
   - During the orientation, the source value is held at `range.startUtc`.
   - A solar region's orientation is `OPENING_ORIENT_MS` (2026-10-13; the `orientMs` hook, §8): the
     opening plays in it, everything already there making its entrance (13 §4, Entrances and exits).
   - At each timed beat's start, the source value jumps from the beat's first `occurredAt` to its
     `sourceUtc`, then holds for the beat's duration.
   - Across each gap, it is interpolated linearly between the neighboring beats' source times.
   - `toSource` is monotonic and never decreases.
   - `toPresentation(t)` returns the first schedule time at which `toSource ≥ t`.

**Targets at 1× (decided 2026-10-03: "a cozy campfire, not fireworks").** A busy week, at the scale
of a typical Story (20+ Tasks, 5 PRs, 3 people: Lantern Squad), runs **about 45 s**; `orbit-week`
(Comet Crew) runs 35–45 s. (Tightened 2026-10-09 after real sprints at 60 s and 93 s "dragged"; with only
High beats left the floor is a little over 45 s on the densest weeks, and Medium accents go first.) At ½× and ¼× the same schedule takes 2× and 4× as long; 4× is the quick,
lively look. A quiet week may end in well under that, and that's fine: never invent activity to fill
the time.

**The scene's own schedule (decided 2026-10-08).** The default schedule is the one above over only
the events that touch the scene on screen, at the full `pacing.budgetMs` (DESKTOP: 45000). Playback is the scene's own, so it
never spends time on another pod's or Feature's work.
- A scene's keys (`sceneEntityKeys`) are its focus, everything ever linked beneath it (dated links
  and observations), their PRs, and **the captains who ever held that work** — the scene draws their
  ships, so a reassignment that takes one away is its news too (its jump trail, §5). Like slots,
  membership is over the whole history, so it never changes on seek.
- **Every level has keys.** A sprint's are its pods and everything ever beneath their members; a
  Backlog sector's are its Features' subtrees. Only the galaxy, which no level draws, has no filter.
- An event touches a scene if its entity, either end of a link it makes or breaks, or (for a
  reassignment) the captain, is a scene key.
- **State is still the full snapshot** at `stateUtc`: events outside the view apply as they happen;
  they just get no beat of their own.
- The same membership drives the ruler's in-view ticks ([06 §5](06-visual-brief.md#5-accents)), which
  in a filtered scene are all in view.
- **Beat indices are per scene**, so nothing outside a schedule should refer to one.

**Highlights (H) — the big moments (decided 2026-10-08).** The same scene filter *and* only the
**High**-priority beats, in `pacing.highlightBudgetMs` ([15 §10](15-reference.md#10-timing-and-budgets)): the quick pass over a busy sprint, where
the full schedule de-accents a lot. It was "play only this view", which is now the default.

## 4. Accent target durations (wall time)
*Applies to: the v0 views. Solar plays maneuvers instead (§8).*

Accent names are shared with [06 §5](06-visual-brief.md#5-accents), which defines how each one looks.
Each accent's trigger, look, target duration and tier is one row of
[15 §8, *v0 accents*](15-reference.md#8-effects); the scene-diff accents (`starBloom`,
`stationPowerUp`, `sectorPulse`, 02 §4), the echo and the recap are under *v0 extras*. The source is
`src/shared/playback/accents.ts`, golden-tested by `tests/golden/schedule.test.ts`. (Superseded
2026-10-13: the duration table here, now in 15.)

Each duration is the beat's **whole choreography** (decided 2026-10-03): the tell lands, the act
plays, the flare swells, and the echo reaches the parent, all inside the beat, so beats don't pile
up. Flares still linger after their beat, as ambient afterglow.

## 5. AnimationDirector
*Applies to: the v0 views (`AnimationDirector`). Solar shares the glide layer, measured motion, the activity levels and the load marks; its director is §8's `ManeuverInterpreter`.*

**Arrive and Depart (decided 2026-10-08).** There's one motion for a body coming into a scene and one
for a body leaving it, whatever the cause: data streaming in, a creation or removal in playback, or a
move between sprints, pods or sectors. They belong to the scene (`GraphScene`'s enter / update / exit
join), not the director's budget, so they're never cut.
- **Arrive:** the body comes in along its orbit from about 40° back, easing out over `ARRIVE_S`,
  fading up over the first 40%. A thin cyan streak trails it, and a soft ring marks where it settles.
  `emerge.*` and `sectorRekey` call it in playback. With cause `'data'`, it plays for every new
  body.
- **Depart:** the body carries on along its orbit and outward, easing in over `DEPART_S`, fading over
  its last 45%, with the same streak. It plays for every body that leaves on a beat or a data update.
  Its entry is kept until it's done, and it isn't clickable. A move elsewhere still leaves its jump
  trail.
- **Budget:** at most `MOTION_PER_S` full motions start each second, evenly apart. The rest, and
  every motion in reduced motion, take a short fade (`CHEAP_S`; values in
  [15 §10](15-reference.md#10-timing-and-budgets), *Arrive and depart*). They run on wall time, so live arrivals play while paused. A
  seek or scene change ends them at once (INV-15).

The director runs in the renderer and is called once per ticker frame. It takes the previous and
current schedule times, the current `ViewGraph`, and the snapshot diff.

- **Crossed beats:** collect the beats whose `presentationStartMs` falls in `(prev, now]`.
  - Apply state for all of them, through `stateUtc`.
  - Play accents for **at most one**: the latest crossed beat that is accented.
  - Other beats crossed in the same frame (after lag, sleep, or at high rates) get no accent
    (INV-15).
- **Scene-diff accents** (02 §4): compute them only on the frame where an accented beat plays. Use
  the diff between the snapshots just before and just after that beat, and only for entities
  touched by the beat's events. They never fire on seek, lens toggle, scene entry, or silent beats.
- **Placing accents:** an event's accent spawns only if its entity has a projection in the current
  scene. Key the accent by `eventKey|projectionKey`, so it never plays twice. Events offscreen are
  skipped, never deferred.
- **Sector scale (built in slice 3b):** descendant events become a star-side glyph on their Feature's star:
  - a Feature state change → a core pulse (the star's own flare)
  - a Story or Bug state change or emerge → an orbital glint: a bright point running half an orbit
    across the front of the star, in the new rung's color
  - Task events → satellite specks: three small lights circling close in
  - PR events → a spoke reaching down toward the resources, with a mote running along it (blue for a
    launch, gold for a merge, grey for an abandon)

  Each glyph lasts about 1.6 s, at most one of each kind per star per beat, and it ducks under a
  grand flare. The scene also shows at most one `sectorPulse` wash per sector per beat. Reduced
  motion keeps only the wash, as a static ring.
- **Spawning:** a beat's accents spawn on the frame *after* its state is applied, once the scene has
  laid out screen-space positions (attached ships, the PR lane). Captain flights come from diffing
  each involved ship's drawn position before and after: moved (an in-scene flight), appeared (an
  arrival from out of view), or gone (a departure and a jump trail). An assignment elsewhere never
  moves a ship here (AC-21).
- **Pause and step:** Pause freezes effects in place; Step plays its beat's effects through, then
  holds the playhead.
- **Story grammar (slice 3a, decided 2026-10-03).** Each change plays as **tell → act → land →
  echo**, along geometry that already exists (orbits, routes, spokes):
  - **Tell (the lead-in):** while *playing*, when the playhead is within `LEAD_MS` (15 §10) of an
    accented beat (or the whole gap before it, if shorter), the beat's actors wind up: a departing
    or moving captain turns and its engines glow (no back-off); a body's rim brightens in its coming rung's color; a station's bay glows
    before a launch. The tell belongs to its beat's accent window: it plays once per beat, ends as
    the beat lands, and never plays on a seek or a step (a seek mid-lead-in cancels it). Tells are
    travel-kind, so they finish on the beat at any rate.
  - **Ships go to their work, and stay (decided 2026-10-03).** A ship's resting place is where its
    captain last worked (02 INV-07, 03 §5), so new work is **one flight** to the new object (pursuing
    its live place) and the ship stays there: it never commutes back to the parent, since the work
    benefits this system. On arrival (or at once, if it was already beside it) it takes the object in
    its **tractor beam** (06 §5), and the change shows 0.5 s after the beam engages. This covers state
    changes and completions by the actor (`changedBy`, never the assignee: INV-07), and PRs: the
    author's ship flies to meet its launching vessel in the lane. One per ship per beat. The long
    streaks across the screen are kept for navigation: jump trails.
    If the tell already drew it, the beat doesn't repeat it.
  - **Activity: how much the ships do (decided 2026-10-09, slice 6).** The user found playback moving
    only every 5–10 s, with assignments and approaches that had no ship at work. One level, set in ⋯ and
    remembered, chooses a row of `ENGAGEMENT` (`src/shared/playback/engagement.ts`). **Maximum** is the
    default; test runs start at **Calm**, the behaviour before the dial.

    | Level | Unaccented beats | Subjects | Load tiers | Ship actions per beat | Guests | Stagger |
    |---|---|---|---|---|---|---|
    | Calm | nothing | no | as below | no limit | 0 | 0 |
    | Lively | ship actions | yes | as below | 3 | 2 | 0.3 s |
    | Maximum | ship actions | yes | ignored for beams and tells | no limit | 6 | 0.2 s |

    - **Ship actions on unaccented beats.** A beat whose accents the budget cut, or that shared a frame
      with a later accented beat, still sends a ship to each Medium-or-better change and engages the
      tractor beam (`lightActions`, `name: 'shipAction'`). They cost the schedule nothing, so the
      chart moves between the big moments.
    - **Subjects.** Besides the actor (`changedBy`), the other person in the change also works it: a
      new assignee (an assignment is a reassigner's beam *and* the new captain flying in and taking
      hold), a PR's author, or the item's assignee when someone else changed it.
    - **Guests.** A person with no ship in the scene comes in as a guest, beams the item, and leaves.
    - **Every arrival beams.** A ship flying in from out of view now takes its item in the tractor
      beam on arrival (before, only ships already in the scene did, so an approach could end with no
      beam).
    - Beams in one beat start `stagger` apart, so they read as many hands at once.
  - **Along the board (decided 2026-10-09, slice 6).** In a system laid out as a board (06 §3), a
    body moving on its own ring follows the orbit's ellipse from where it was drawn to its live goal
    (`OrbitTravel`, 1.8–2.9 s by distance). If it passes another body on the ring, its path bows out
    to the emptier neighbouring ring's radii (`BOARD.passLift`) for the pass. When both neighbours
    are occupied there, it stays on the ring and the passed body takes a 0.5 s eclipse shadow. A
    change of ring (reassignment) keeps the usual arc. Seeks snap; reduced motion glides. A body's
    move starts with its own change, so it waits behind a protected moment like any accent. During a
    merge, a state or assignee change to the work the PR links to counts as moving the cast
    (`ProtectedMoment.linked`): the vessel's lane place follows that work.
  - **Ships on their home track (decided 2026-10-09).** A ship moving from one place on its lane's
    track to another follows the track's curve (`OrbitTravel` on the track), then takes its work below
    in the tractor beam. Going to work outside its lane, and coming home afterwards, is the usual arc.
  - **Stagger:** a beat's accents start parent outward: Features, then Stories and Bugs, then
    Tasks, then PRs, 400 ms apart. Every Task in a beat shares one delay, so a wave of Tasks moves
    as one. Stagger never crosses beats (INV-15).
  - **Protected moments (decided 2026-10-03):** success is what the chart exists to show, so a
    merge (with or without approvers) and a Feature, Story, or Bug **closing** play without
    interruption. For the moment's window (its whole choreography), nothing else may move its
    **cast**:

    | Moment | Window | Cast |
    |---|---|---|
    | Merge with approvers | Its `dock` with approvers (the formation, through dispersal) | The PR lane (no vessel launches, docks, or re-spreads it), the author's and approvers' ships |
    | Merge alone | Its `dock` | The PR lane and the author's ship |
    | Feature closing | Its stage-shift beat | Everything that moves in that Feature's system |
    | Story or Bug closing | Its stage-shift beat | The body, and the closer's ship |

    The windows' lengths are the accents' ([15 §8, *v0 accents*](15-reference.md#8-effects)).

    - An accent in the same beat that would move the cast (a launch, a cast member's flight, a
      reparent) starts **after** the moment, and the beat holds both (`protectBeat`, 03 §7). Two
      moments that share cast run one after the other: orbit-week's two Thursday merges share Rafe,
      so that beat is 10.2 s.
    - Unrelated accents, such as another body's stage change, play alongside.
    - In the renderer, the cast is frozen in the glide layer for the window, so a silent beat or a
      lane re-spread waits, and any other mover takes over only once the moment ends.
    - The formation keeps one clock (the accent clock, at most 2×), so its ships and beams stay
      together at every rate.
    - This is a stagger inside a beat, never a queue across beats: a seek clears it (INV-15).
  - **Ducking:** while a grand flare bursts (its first ~2.5 s), decorative effects dim to `DUCK`, and
    lesser flares that start meanwhile are smaller. One grand burst at a time: a second waits for the
    first to settle (`GRAND_BURST_S`), but always starts within its own beat (values: 15 §10).
  - **Echo:** when something reaches Accomplished, once its flare has swelled, a spark runs along its
    spoke or orbit to its parent's limb, and on arrival the parent rings, once per beat (timing: 15 §8,
    *v0 extras*). An accent only: the parent's look is its own stage
    (INV-04). Sector scenes keep their one `sectorPulse` instead.
  - **Recap bloom:** when *playing* reaches the end, everything that reached Accomplished in the
    range glows once, in the order it got there (at most `RECAP_MAX`, `RECAP_STEP_S` apart; 15 §10).
    Never on open, End, or a seek. Under Solar, a finished round plays the theme's finale instead (§8).
  - **Dawn sweep:** while playing, when the ruler passes 07:00 local (a compressed night ending), a
    faint band of morning light crosses the sky. Ambient: it carries no event. Off in reduced motion.
- **Continuity (slice 3a refinement, decided 2026-10-03).** Objects pursue their goals; nothing jumps.
  - **Glide layer:** every node is drawn at a *shown* position that eases toward its layout target
    with a critically damped spring (`GLIDE_W`, 15 §10: settling in about a second). A beat's re-layout (a
    new vessel re-spreading the lane, a ship re-attaching, a Task changing band) becomes a glide, and
    lines follow every frame. On a seek, a lens toggle, scene entry, or a remount, positions **snap**
    (INV-15: no catch-up motion). Zooming keeps each node's lag, so it never sets anything gliding.
    Paused freezes the glide; reduced motion snaps.
  - **Pursuit:** an effect that moves a node takes it over and draws it from an absolute start toward
    its *live* target, read every frame, so if the target moves mid-flight the node bends toward it.
    A new move on a node already moving starts from where it is.
  - **The review formation (decided 2026-10-03):** a merged PR with approvers (`approvedBy`) plays
    as one moment led by its **author** (from `pr_opened`): the crew gathers (1.2 s; residents pursue
    from where they are, guests fly in from out of view wearing their captain's picture, like any ship while playing), the author at the point just
    above the vessel and the reviewers on the wings of a V behind. The reviewers' **support streams**
    flow into the author, then the author's tractor beam takes the vessel (0.4 s later) and sees it
    into its berth (1.0 s) for the grand flare. Then the crew disperses: guests out of view without a trail, residents back to their resting places. The vessel
    is held in the lane until the beams have it. Essential tier: when busy, guests fade in at their
    slots; reduced motion shows a ring per approver. Guests are effect views, never projection
    nodes, so layout and seeks are untouched; a seek removes them.
  - **Live anchors:** tractor beams, ink, and sparks reach for live positions: a tractor beam holds
    on a vessel that's still moving; a route inks from the vessel to its Task wherever both are.
  - **Intent chains:** a line is an intention, then the object follows it. A launch: the bay glows
    (tell); an intent line inks from the station to the vessel's lane slot; the vessel undocks and
    follows it, consuming the line behind it, as the author's ship flies to meet it; on arrival its route
    inks on to the linked work, and only then do the cargo motes flow.
  - **Lines are revealed, never popped:** an edge being inked isn't drawn statically until its ink
    finishes (routes, orbits, a radar Task's spoke). A seek releases every held edge.
- **When motion is justified (decided 2026-10-03).** Every accent part belongs to a tier, gated by a
  **volatility meter**: the weight of what is moving (flights, flares, the grand ones triple, lines,
  rings, gliding nodes), sampled at each beat plus a load per planned accent. Solar's seed commands
  took their weights from this meter ([15 §8](15-reference.md#8-effects)); the marks `CALM`, `BUSY` and `OVERLOAD`, and the
  per-accent and per-glide loads, are in [15 §10](15-reference.md#10-timing-and-budgets).

  | Tier | Parts | Plays |
  |---|---|---|
  | Essential (the change itself) | Stage flare or ring; radar ping; launch; captain arrival and departure; dock flare; dissolve; reverse flare; sector pulse | Always |
  | Narrative (cause and effect) | Tractor beams; tells; echoes; intent lines and route ink | Unless overloaded (`OVERLOAD`). When busy (`BUSY`): one tractor beam per beat and at most `BUSY_ECHOES` echoes; no tells. Ships still move to their new resting places (by glide or flight). **At Activity Maximum the busy and overload marks don't apply to beams and tells** (above) |
  | Ornament | Seed sparks; lesser flares' sparks; the recap bloom; the dawn sweep | Only when calm (below `CALM`). The recap waits up to 4 s for calm |

  This is v0's table. Solar's gates differ: maneuvers by tier at `BUSY` and `OVERLOAD`, and every
  command by value per cost (Value ÷ Weight, 15 §8) against the floor for the load (`MUTE_FLOOR`, 15 §10), so ornament and repeats stop from `CALM`, even at Maximum ([§8.5 P-9](#85-coordinating-a-beat), X-2).

  **Dropped outright:** arrival overshoot; the ship's back-off; the abandoned PR's drift; a merged
  PR's trip to its work (it eases into its berth, then flares). **"Worth an inch":** a change of
  place under `INCH_PX` screen px (15 §10) never gets a flight; the glide carries it.
- **Budget:**
  - the profile's `render.limits.maxActiveFx` (15 §11). When full, the oldest decorative effect is cut first.
  - Effect sprites are pooled.
  - Ticker deltas are clamped to 100 ms.
  - Ambient effects pause while the window is hidden.
- **Decorative motion:** idle ship bob, planet and star rotation, galaxy swirl, scans, pulses, and
  glints run on wall time, stay small, and are visibly different from accents. They never imply
  events. The tempos are in [06 §7, Ambient motion](06-visual-brief.md).
- **Measured motion at higher rates (decided 2026-10-02).** Above 1×, motion speeds up by kind, so
  fast playback stays legible instead of frantic. At 1× and below, everything runs at wall time.

  | Kind of motion | At rate r > 1 | Examples |
  |---|---|---|
  | Travel (things going somewhere) | × r | Captain flights, route ink, vessel launch and dock |
  | Accents' timing and flares | × min(r, 2) | Flare growth and linger, arrival rings |
  | Blinks and pulses | × min(r, 2) | Cargo strobes, running lights, the progress beat |
  | Idle jiggle | Amplitude fades as 1/r (gone in effect at 4×) | Ship bob |
  | Ambient rotation and drift | Unchanged | Planet and star rotation, galaxy swirl, window shimmer |

  Accents keep their shape above 2×: their timing runs at most 2×, so at faster rates an accent may
  outlast its beat (decided 2026-10-03). It's never shortened and never queued (INV-15). A protected
  moment still holds its cast until it ends.
- **Jump trails (decided 2026-10-02).** Each `captainJump` leaves a `jumpTrail` in the scene the
  ship departed: a streak toward the destination with a "→ ‹destination›" label and a **Go**
  button. Go opens the destination's scene and follows the captain (§6).
  - **Lifetime:** `TRAIL_MS` of schedule time, fading over its last `TRAIL_FADE_MS`; at most
    `MAX_TRAILS` per scene, the oldest going first (values: 15 §10; superseded 2026-10-09: it was
    longer, lengthened with the leisurely pace and the merge formation, then cut with the pace). Pausing or reaching the end holds them, so a
    departure seen near the end stays followable.
  - Seeking clears trails and never creates them (INV-15). Reduced motion keeps the trail as a
    static line with its label.
  - When the destination is in the same scene, the ship's arrival is visible, so the trail is only
    a brief fading streak, with no label.

## 6. Follow a captain: their story (within the loaded scope)
*Applies to: both views. "Feature" below is the v0 views' stage; in Solar the stage is the region on screen.*

Following tells **that person's story for the period**, not just highlights them while everyone's
plays (revised 2026-10-04).

- **Enter:** clicking a captain ship, choosing Follow on a captain card, F on a selected ship, or Go
  on a departure trail. Each one both selects and follows.
- **The story** (`storyOf`, 03 §7) is what they did, and what happened to their work:
  - their own changes (`changedBy`);
  - assignments to or from them;
  - the PRs they authored, open to merge;
  - the merges they approved;
  - and others' changes to items assigned to them at that moment.
- **The story schedule:**
  - While following, playback plays only the story: `buildBeatSchedule` with the story as its
    `include`. It works like highlights, and the state stays the full snapshot.
  - The gaps between their events compress to the normal pacing, so the ship is rarely idle. The
    rest of the world changes underneath with no accents.
  - Following or unfollowing rebuilds the schedule at the same source time. Following overrides
    highlights.
  - History shows only their cards, ending (at the bottom, where it starts) with an intro line:
    "This period, ‹name› worked on ‹title›, ‹title›, and others". Names only, never counts
    (INV-19).
  - At the end, the recap shows only their accomplishments.
- **The stage is the Feature system** that holds the work of each story event (`storyAnchors`).
  - **Following stays in the scene on screen (decided 2026-10-08).** When the next event is in another
    Feature, the camera stays and the follow bar notes "Next recorded event for ‹call sign› is outside
    this view". Following picks the story up again when the captain's work returns here. Leaving
    the scene pauses playback, which ends following (it had travelled, before).
  - Close-ups stay opt-in, for inspection.
  - An unlinked PR stays put.
- **The camera holds still around a click (decided 2026-10-09).** While a pointer is pressed on the
  chart — on the canvas or on a label — and for `CAMERA_HOLD_AFTER_MS` (15 §10) after it is released, frame-the-action and the
  follow camera make no moves, so the view never slides just as you go to click or double-click. The
  follow camera's working set keeps growing meanwhile, so nothing is lost. This is separate from a
  manual pan or zoom, which suspends them until Resume or Z.
- **The follow camera** works like a camera operator. Its principles (revised 2026-10-04 after
  review: framing only the current beat lost the PR's shuttle and station):
  1. **Frame the working set, not the moment.** That's everything the captain's story has touched
     in this Feature: their work items, and each PR with its station and linked work (a PR always
     brings its repository).
  2. **Context only grows** within a Feature, like a ratchet. The frame never tightens again
     mid-story, so it never pumps in and out, and you never lose where they were.
  3. **When the work spans the network** (about 55% of the scene's width or height), show the whole
     system, and stay there until the captain leaves the Feature.
  4. **Zoom in only at the start:** Play, Resume, or arriving in a Feature. That frame may come in
     to the ship and its first work, within `FOLLOW_MIN_ZOOM` to `FOLLOW_MAX_ZOOM` of the scene's fit.
     After that the camera only zooms out.
  5. **Move before the act:** it reframes as the beat's lead-in begins.
  6. **Calm:** small changes are ignored, moves take `FOLLOW_MS` (instant in reduced motion; values:
     [15 §10](15-reference.md#10-timing-and-budgets)), and it
     keeps clear of the player, the follow bar, and the side panel. It supersedes frame-the-action
     while following.
- **Anchors out of scope:** an event whose item is in no Feature here (an uncharted Task, say) keeps
  the camera where it is, and a note reads "Next recorded event for ‹call sign› is outside this
  view". Cross-project follow isn't planned (removed 2026-10-27, 23 §5).
- **Suspend:**
  - A manual pan, zoom, breadcrumb, Back, entering a scene yourself, or search sets
    `suspended = true` and shows **Resume Follow**.
  - Clicking other objects only inspects.
  - Resuming goes to the latest story anchor at or before the playhead and reframes, with no replay.
  - Clicking another ship replaces the target, and **Unfollow** returns to everyone's story.
- **The hero aura (decided 2026-10-04):** while following, the ship wears a gentle spotlight in the
  timeline's cyan (06 §5), with a soft entrance as play starts (or as you follow while it plays).
- **Abandoning the journey (decided 2026-10-04):**
  - If playback isn't running and the user leaves the scene the ship is in (Back, a breadcrumb,
    search, entering a scene), following ends: they've wandered off.
  - While playing, leaving only suspends (Resume Follow).
  - The scene is where following began, or where the app last travelled. Pausing away from it ends
    following too.
- **Where it shows:**
  - A bar under the player reads "Following ‹call sign›: ‹event›", with Resume Follow (when
    suspended) and Unfollow.
  - The out-of-view note sits under it.
  - A captain's inspector card has Follow and Unfollow.
  - It's perspective, not an assignment (INV-07, INV-08).
- **Seek while following:** recenter once, on the latest story anchor at or before the new playhead.
- **The directed camera (27 E9):** in a Solar scene whose schedule has a director, the camera plays the day's climax and the pull-back to the board.
  1. **Who directs.** Playing, with the director's direction, framing on (Z), no unsuspended follow (follow has priority), reduced motion off, no scene transition, and no hold around a click. v0 views and stepped beats (a step leaves the clock paused) never direct.
  2. **The climax shot.** A beat with a climax maneuver (`PlannedManeuver.climax`, P-22) sets a pending shot to fire at its gather's start (`presentationStartMs + afterMs +` the gather phase's `atMs`). It eases to the frame of the climax's whole cast, people included, over `CLIMAX_MS` (900 ms: a gather is too short for a calm move).
  3. **The frame** (`climaxFrame`). The cast's centres are padded as the follow camera pads them; the scale is that padded fit, clamped to the board's fit up to `CLIMAX_MAX_ZOOM` (1.5×), so it eases in and never out past the board; the centre is the padded box's, clamped into the box of the cast's centres, so the target is always within the cast's bounds.
  4. **Back to the board.** `BOARD_MS` (900 ms) to the fitted board at a beat with a montage maneuver (P-24, C5); at the first beat after a climax shot that still holds (Pulsar has no montage, so otherwise the zoom would last the day); and when playing reaches the end. Once per beat, at the lead-in or else as the beat lands. A beat the director handles skips frame-the-action; other beats keep it.
  5. **Whose camera.** The director owns the camera only while the camera's target is still what it asked for. A pan or zoom, frame-the-action, follow, reveal, reset view and a test placement all change the target and end it.
  6. **Seeks (INV-15).** A seek clears the pending shot, and if the director's shot still holds the camera snaps to the fitted board with no tween. A camera someone else moved is left alone.
  7. **Reduced motion.** No climax shot and no pull-back. Z (framing off) stops the directed camera too.

## 7. Reduced motion
*Applies to: both views. The bullets below are the v0 views' accents; Solar's commands each declare a substitute (§8, 15 §8).*

This mode follows the OS setting, and a toggle in the app can override it.
- Accents become a 1.5 s static outline plus focus on the matching row in the event list. Flares
  become a static ring in the rung's color, and captain flights become a 0.3 s crossfade at each end
  (as built, confirmed 2026-10-03).
  Radar pings, tells, tractor beams, echoes, and the dawn sweep are off; a Task that changes band shows a
  static ring at its new place. The glide layer snaps instead of easing.
- Idle jiggle and blinking are off; window lights hold steady.
- Camera transitions become a 150 ms crossfade.
- Captain jumps become an instant move with a static highlight.
- No information is lost (INV-20).

## 8. The rules of Solar playback (the rulebook, rebuilt 2026-10-15, 22 C1)
*Applies to: Solar · packs: SDLC, Todo, CRM.*

This section is the one place that says what a solar system shows and how its playback is triggered,
prioritised and coordinated. It states the code **as built**, with the file it lives in. Values live
in [15](15-reference.md) and are linked, never copied. Every gap between the rules and the intent is
numbered in §8.12, and every idea to try in §8.13, so they can be worked through one at a time
([22 Block C](archive/22-v1.2.md)). Other docs point here for rules: 13 keeps the design and the looks, 06 the
visuals, 03 the contract shapes, 15 the values.

§1–§3 (clocks, the session, the beat schedule) apply to Solar too, through the hooks in §8.3. §4–§7 are
v0's director (the Backlog and Sprints views) plus the parts both share (glide, arrive and depart, the
motion budget, Follow, reduced motion); where Solar differs, the rule here wins.

### 8.1 How to read it
- **Block C's rules.** §8.3a, §8.3b, §8.4a, §8.5a, §8.5b and §8.6a hold the rules decided with the
  user (22 Block C, 2026-10-15), all built by 2026-10-16. A rule they revise carries a note pointing
  to its replacement; the older text stays for the reasoning.
- **Every rule has an id** (`S-` the board, `B-` beats, `M-` what plays, `P-` coordination, `K-` captains,
  `T-` stations, `L-` pieces, `A-` labels and attention, `R-` seeks and reduced motion). Ids are stable:
  an item cites "05 §8 K-4". A table row's **As built** column is the code; **Notes** link values (15),
  conflicts (`X-`), gaps (`G-`) and ideas (`I-`).
- **The standing rules** this serves ([13 §1](13-game-design.md#design-pillars)): every motion means
  something (R8); the drawn count is the true count (R9); identity by more than one cue (R10); an object
  arrives before its label (R11); one vocabulary, two layers (R12); playback explains itself (R13);
  attention is budgeted (R14).
- **Four kinds of motion**, from loudest to quietest:
  1. **A moment** (essential, protected): always played, whole, with labels and its crew named; never
     cut by the budget, never dropped by load.
  2. **A beat's maneuver** (narrative): played unless the scene is overloaded; labelled within the
     attention budget.
  3. **Light work** (ornament, `agent.light`): a short sortie for a change nothing else plays, by
     Activity level; never labelled.
  4. **Ambient** (outside the schedule): idle beams and volleys, standby, the opening, the finale, the
     recap; never labelled.

### 8.2 The static board at a playhead
A region at time *x* is a pure function of (history, *x*, lens) (INV-12, INV-14). Layout is fixed over
the loaded history: nothing reflows as it plays. Values: [15 §5](15-reference.md#5-sizes-floors-and-layout),
[08 §7](08-layout-solver.md).

| Rule | What | As built |
|---|---|---|
| **S-1** Who has a planet | Anyone who held an objective or threat in the region at some instant of the round (a member, on the ladder, assigned to them) | `seatsOf` over `heldSpans` (`engine/facts.ts`); ordered by first hold. Fixed for the round: a late joiner has a planet from the first frame (G-9). A planet says why it's there (22 A2, `seatReason`) |
| **S-2** One ring | Every planet on one ring round the star, at even angles in a stride order (seat 0 at the top), at the smallest radius that clears the star and its neighbours | `engine/solar/seats.ts`. Each draws a short orbit arc; planets never orbit in play |
| **S-3** Pieces on a planet | Now S-13 (the mandala, 22 D1). Before: one hex lattice over the planet's dark side; asteroids left, enemy ships right, the middle column empty; a piece's slot is its arrival order there | `formations.ts`, `slots.ts`. No crowding cap (v4). A piece has a slot at every seat it visited, so a reassignment is a flight between fixed points; a freed slot stays empty |
| **S-4** Finished pieces | Now S-14 (one trophy ring by close order, 22 D2). Before: on a platform in low orbit at the planet's lit edge (asteroids left of the star line, enemy ships right) | the plan's `platforms` (`plan.ts`). An unassigned piece never goes to a platform |
| **S-5** The frontier belt | An annulus outside the planets for unassigned work; drawn only while some is unassigned | `frontier.ts`; the guide fades over `GUIDE_FADE_MS` (15 §10). In play it follows what's drawn, not the beat: it fades in as the first unassigned piece comes into view and out once the last has left (19 S2); the opening hides it with the cast |
| **S-6** What's drawn | Every objective and threat with a slot at *x*, Off ghosts included (they stay where they went Off); Tasks as steps on their parent | `solar.ts` (`buildSolar`) |
| **S-7** A planet's look | Its share done of what it holds now, on the ladder (all done: accomplished; ≥ 75% nearing or done: nearing; anything moving: underway) | `aggregate` (`solar.ts`). No outcome counts: finished pieces are platforms in orbit (G-14 closed, C9) |
| **S-8** Stations: where | **Two regular rings** (22 C11; the user's third look, 2026-10-16), concentric with the orbits, each at one fixed radius, their slots at the angles **half-way between the planets** (the first planet at the top, so with an odd count the bottom slot is the middle of the bottom), so the stations interlock with the planets. **The inner ring** is every station's first choice: as close to the planets as it can be with a station's width of padding from everything (`STATION_PAD`) and clear of the planets' orbit line; one slot per gap, or more side by side when the multi-planet stations outnumber the gaps (the planets move out to make the room). Single-planet stations choose first, by arrival, the gap beside their planet, leaving a slot for every multi-planet station; those take the gap nearest their work. **The outer ring** takes only the single-planet stations left over: at 70% (`OUTER_SIZE`), in the gaps again, just past the planets; the frontier belt beyond | `engine/solar/stations.ts` (`gapAngles`, `placeRings`), `plan.ts` (`MAX_PUSHES`). On screen a ring station sits exactly on its slot, its drawn size capped at `RING_MAX_SCALE` (`ViewNode.maxScale`). Harbor Pod's planets move out (1,702 → 3,217) for its three stations; the dense pod's don't |
| **S-9** Stations: when | Every station starts off the map and arrives when this region first needs it: its first PR event here in the round (an opening, a merge, a link) while that PR serves the region's work (B-20); one needed only by a PR opened before the round, with nothing happening to it inside, is there from the opening. Then it stays for the rest of the round | `firstNeeds` (`pace.ts`) → `enterAt` (22 C11); never leaves (K-15). See T-1 for how it comes in |
| **S-10** Tenders and guards | One tender per open PR on the station's front arc (6, then "+N"); 0–3 guards on its back arc, by seed | `compound.ts`. Guards are always idle (G-15) |
| **S-11** Standby | A station with nothing open and PR activity under `STANDBY_BELOW` dims | `solar.ts`; T-4 |
| **S-12** The round's previews | Each region's star in the round previews its planets and one mark per asteroid and enemy ship, in groups of five | `preview.ts` (22 A1) |

### 8.2a The mandala (built, 22 Block D; decided and built 2026-10-16)
Every object near a planet sits in a predetermined slot: an idealised circle sized to its class (its
largest dimension), padded by a slot for small objects or half one for large, on rings round a parent
or spread over its area with radial symmetry. The pattern is fixed for the round (INV-14) and kept at
any zoom: where screen floors outgrow a slot, the object is drawn smaller (`ViewNode.maxScale`), not
moved. The one exception is the loiter ring, which moves out at a far zoom (S-15). Values:
[15 §5](15-reference.md#5-sizes-floors-and-layout); geometry: [08 §7](08-layout-solver.md).

| Rule | What | As built |
|---|---|---|
| **S-13** Pieces on a planet | **Stories on the planet's left half-disc, bugs on its right.** Each class's slots split its half into equal areas, mirrored across the equator, filled from the planet's centre out (up before down) by arrival. Between two slots (and across the meridian) at least half a slot of padding (`PIECE_PAD`); a planet whose busier side won't fit **shrinks its slots**, both sides one size. The two sides match only by coincidence | `halfDiscSlots` (`engine/solar/mandala.ts`), `mandalaOf` (`plan.ts`); the row counts that leave the most room, an equator row on a tie. Replaces S-3's lattice. A ghost reseated while Off to a seat already on the board takes a slot there, after every piece that was on the ladder, so no other slot's place in the order moves (the slot pitch may shrink for the whole round; 23 C9; 08 §7) |
| **S-14** Trophies | Every piece that closes at the planet in the round, stories and bugs together, on **one ring**, **in the order they closed**: the first on the star line, the next either side of it in turn, a full trophy's width off the rim (the planet's name sits in that gap); neighbours at most one slot apart; a full ring starts another shell, √3 slots out, turned half a slot. Slots are one size (`TROPHY_W`) | `trophyShells`, `trophyOffset`, `closeOrder` (`plan.ts`). A piece that reopens keeps its slot, left empty. Replaces S-4 |
| **S-15** The loiter ring | Past the trophy shells by one more trophy slot (two and a half slots off a bare planet). Its slots run from the planet's **far side from the star**, either side in turn, a ship's length apart plus one more. At a far zoom, where ships keep their floor, the ring moves just far enough out that their hits clear the trophies or the pieces, on every side alike | `loiterRadius`, `loiterOffset`, `loiterRingAt`; the renderer's `placeLoiterRings` writes the drawn ring onto the seat's effective node, which the ships, the planet's plate and sorties all read |
| **S-16** The frontier belt's order | Unassigned pieces evenly round the belt, by arrival: the first at the top, then either side in turn | `frontierSlots` (`frontier.ts`). At a far zoom a frontier piece moves out until it clears every planet's pieces and loiter ring and every planned station (23 C8). Revises S-5's stride order |
| **K-16** Loiter slots | A ship at rest by a planet (K-11's rest, or a guest's, K-14) sits on that planet's loiter ring. **The first to arrive takes the far-side slot**; the rest fill ±1, ±2… by arrival, and **each keeps its slot while it stays** | `loiterSlots` (`scene/project/loiter.ts`): a pure walk of the history to the playhead, so a seek agrees with play; `ViewNode.attach.loiter`. A ship whose rest the walk reads differently takes the next free slot. Guard: solar-dense *the mandala* |
| **M-30** Sortie parking | A captain working a planet's piece parks on that planet's loiter ring, at the slot nearest the work's direction; ships fanned on one target (a strike run) take adjacent slots, and the plate-dodging choices are the neighbouring slots | `ringApproachOf` (`fx/approach.ts`) in `sortie` (`fx/commands.ts`). Revises K-4's park point |
| **A-9** Plates on their rays | A planet's name sits **centred under the planet, its top edge touching the planet's bottom**, with no pointer line (revised 2026-10-22; it was on the far-side ray past the loiter ring). It is the **lowest of the labels**: it takes no other place, the other plates don't move for it, and they draw over it (it lifts only while opened into its rows). A piece's plate hangs outward along its ray from its planet's centre (stories' to the left, bugs' to the right, trophies' outward), reaching further along it before it would turn off it; the label budget still fades and limits them | `ViewNode.labelDir`, `labelFixed`; `labels.ts` (`FIXED_RAY`, `FIXED_REACHES`; `holoUnderCandidate` for the planet's name). Only when nothing on the ray is clear does a plate turn off it |

### 8.2b Facts for pacing and the beat insignia (23 D2, D3)
Pacing and the planner read one facts object. For a round it is the round's board (`paceFacts`); for a bundle that
isn't a round (an area or epic), `scheduleFacts` is `roundFacts` over the whole scope through the same fold (it used to
be a coarser copy), so the two can't drift: a piece never in scope isn't a piece, and only moves that touch the board
are held. A beat's award insignia light from the beat's start (`Director.insignia`): no wait for calm, not dropped by
load (the recap's wait made them lag up to 4 s). The `insignias()` hook reports each one's lag.

### 8.2c A region's scene keys, by pack (23 D4)

A region plays the events touching its **scene keys**: the region star, then everything ever beneath its objectives
and threats (links, PRs, the captains who held them). SDLC keeps Sprints' own membership (`podOrder`: User Stories and Bugs),
so ADO mode is byte-identical. A fixture pack (Todo, CRM) names other types, so its keys come from the region's board facts
(`facts`): every piece the pack's mapping gives the objective or threat role, whatever the type is called. The round's keys
are the union of its regions'. Packs stay out of ADO mode.

### 8.3 From events to beats
A beat is a set of events played together. The schedule is built once per scene (§3), with Solar's
hooks (`SOLAR.pacing`: `beatShape`, `orientMs`; `priorityOf` and `focusOf` only if the pack has them,
and none does). The planner and the schedule read the same facts (`paceFacts`), so a beat is always
exactly as long as what it plays. With every hook unset the code path is v0's, so v0's schedules are
byte-identical (`scheduleHooks.test.ts`).

| Rule | What | As built | Notes |
|---|---|---|---|
| **B-1** Grouping | Only the newest beat takes a new event: one at the same instant as its last, or one about a story already in it within `GROUP_WINDOW_MS` (30 min) of its first event. Work on another story in between starts a new beat | `buildBeatSchedule` (`playback/schedule.ts`). The window doesn't slide; the beat's set of stories grows as events join | Under Solar it groups in **story time** (§8.3a): an arc's events share its merge's focus, and a story's day has already gathered (B-12, B-13) |
| **B-2** Focus (what an event is "about") | A Story or Bug is its own; a Task its parent; a PR event its oldest linked item | `focusOf` (`schedule.ts`, `SPRINTS.focusOf`) | |
| **B-3** Priority | Per event, baked at ingest; a beat takes its highest | `eventPriority` (`priority.ts`), below | A Bug's state change is only *medium*: its engage can be cut; its close cannot (essential) |
| **B-4** A beat's length | Exactly its maneuvers, sequenced (P-1 to P-6); a beat no rule plays lasts 0 and is silent | `shapeOf` (`engine/maneuvers.ts`) | A High event no rule plays (a Feature created, a Task-only change) is silent (G-11) |
| **B-5** Gaps | Between beats, by how much *work time* passed: `500 + 450·log2(1 + weighted hours)`, clamped 500–2500 ms; weekday hours 07–19 weigh 1, the rest 0.1 | `gapMs`, `weightedHours` (`schedule.ts`); 15 §10 | An hour ≈ 950 ms, a night ≈ 1 s, a weekend ≈ 1.8 s. The cap is reached at about 21 working hours (G-13) · In Solar: capped at 1.2 s, with day turns (B-16, B-17, built) |
| **B-6** The frame | `OPENING_ORIENT_MS` (3 s, the opening plays in it), then the beats, then `FINAL_HOLD_MS` (1.2 s) | `pacing()` | 15 §10 |
| **B-7** The budget | An episode aims at `pacing.budgetMs` (DESKTOP: 45000) (45 s at 1×). Over it: squeeze every gap toward 500 ms; still over, cut the lowest-priority beat (the latest of equals) and refit; repeat | `schedule.ts` | **Never cut:** High beats, and beats holding an essential maneuver. So a busy round can run past 45 s. A cut beat plays light work only · Measured after montage (B-18, built) |
| **B-8** The lead-in | While playing, the next accented beat's opening maneuvers are told up to `LEAD_MS` (700 ms) ahead: their pieces glow and show their titles, and the camera frames them | `leadIn` (`renderer/playback.ts`), `tell` (`interpreter.ts`) | Only maneuvers that start the beat (22 B7). Framing and Follow read the maneuvers' `keys` |
| **B-9** One accent per frame | A frame that crosses several beats plays the latest accented one; the rest get light work only | `accentBeat` (`clock.ts`) | In Solar every crossed accent plays (B-19, built); the v0 views keep one a frame (AC-19) |
| **B-10** Highlights (H) | High events only, budget `pacing.highlightBudgetMs` (30 s) | `buildHighlights` (`highlights.ts`) | Uses the baked priority |
| **B-11** Region-only play | Only a region plays; the galaxy and the round show a gate plate | `playGate.ts` | |
| **B-20** A region's own PRs | A PR's events (opened, merged, abandoned, linked) play in a region only while the PR serves a story or bug (or one of its Tasks) in that area path and sprint at that moment. A PR serving another region's work, or work that has moved away, never plays its merge here; a region's stations, and the merges that count toward their form, come only from its own PRs | `regionEvents` (`hierarchy/solar.ts`, the level's `sceneEvents`), `servesAt` (`engine/facts.ts`); `roundFacts` keeps only the PRs that served the region while open (22 C12, the user's real runs, 2026-10-15) |

**Priority by event** (`priority.ts`, 02 §4):

| Event | Story / Feature | Bug | Task | Other | PR |
|---|---|---|---|---|---|
| Created, state changed | high | medium | mediumGroup | low | |
| Parent link added/removed (by the child) | high | high | mediumGroup | mediumGroup | |
| Assigned, moved area/sprint, dependency, PR linked | medium | medium | medium | medium | |
| Renamed | low | low | low | low | |
| PR opened, completed, abandoned | | | | | high |

Low events play nothing, not even light work.

### 8.3a Story time (built, 22 C2; decided and built 2026-10-15)
Playback tells the day's story, not a strict log. One pure step, **story time** (`playback/storyTime.ts`),
gives each event a presentation time before anything is scheduled; the schedule, the board's looks,
seeks and the ruler all read it, so playing to *x* and seeking to *x* still draw the same thing (INV-12,
INV-15). The record keeps the real time: a History row story time moved shows it (*· at Tue 14:05*). The
region's playback reads the re-timed bundle (`v1/story.ts` `presented`, from `playback.ts` and `nav.ts`);
an arc's events share its merge's focus (`storyFocus`), so the schedule groups them into one beat (B-1).

| Rule | What | Notes |
|---|---|---|
| **B-12** Arcs | A story or bug's close joins the moment of the **last merge** of a PR that served it (`workOf`), at most **`ARC_WORK_HOURS` (24) working hours** before it (weekdays 07:00–19:00 in the viewer's zone: two working days; nights and weekends don't count). The piece's work from the start of the merge's day to the end of the close's day (up to its next close) moves with it, in order: what came before the merge that day just ahead of it, the rest (the close among it) just behind it | The heroic version of the day: the team that merged also wins it (§8.4a). The user's real runs: "most of the time a PR merges, then a break, then the work item closes" (it was the same calendar day until 2026-10-15). Too far apart, or a close before the merge: no arc |
| **B-13** A story's day | A story or bug's work on one local day that no arc took (its Tasks' included: their focus is the story, B-2) gathers at its **culmination**, its last work event that day, in its own order | One scene per story per day: picked up, worked, resolved, merged and won. Other stories keep their own times |
| **B-14** The rest | Every other event keeps its real time. Only a piece's **work** moves (its state, assignee and title changes, its Tasks' included); creations, links, moves in or out of the region and PR events never move, since they place things on the board | A day is read in the viewer's zone (`STORY_TZ`) |
| **B-15** What it keeps | Order within a piece is never broken; only an arc moves work to another day, and only back, onto its merge; no work moves across what places its piece or item (its creation, a move into or out of the area or sprint, a parent or PR link): an arc that would doesn't form, and a story's day gathers only between them; v0 views don't use story time | 02 §5 amended. The barriers since the C9 review: a close moved before its piece's creation had been dropped by the snapshot |

### 8.3b Rhythm (built, 22 C5, C9; decided 2026-10-15, built 2026-10-16)
A steady pulse: no long silences, no long queues.

| Rule | What | Notes |
|---|---|---|
| **B-16** Dead air is capped | No gap longer than `PULSE_GAP_MAX_MS` (1.2 s at 1×; it was 2.5 s, which the v0 views keep) | Revises B-5. **Built** (`ScheduleOptions.gapMaxMs`) |
| **B-17** Day turns | Where a working day changes between beats, a **day turn** (`DAY_TURN_MS`, 1.5 s) replaces the gap: a chapter break. Nights and weekends fold into the next morning's. It opens with a breather (§8.5b) | Revises B-5. **Built** (`Beat.opensDay`, `dayTurns`). On a dense episode it is B-23's floor |
| **B-18** The budget | `pacing.budgetMs` (DESKTOP: 45000) still aims at 45 s, measured after montage (P-15) shortens crowded beats; it squeezes gaps first, as ever | Revises B-7 |
| **B-19** Every accent | A frame that crosses several accented beats plays each, at its own offset; none is dropped to light work | Revises B-9 (G-12). **Built** with 22 C9 (`accentBeats`, `BeatPlanArgs.accents`): each crossed accented beat is planned, the later ones offset by how much later they began. A safeguard: at 1× to 4× with no tempo no frame can cross two (a frame is at most 100 ms of wall time, 400 ms at 4×, and accented beats start over 300 ms apart (B-23's floor)), so G-12 was never seen. Adaptive speed (P-25, up to 2×) makes a frame up to 800 ms of x at 4×, so one frame can cross two; the multi-crossing path above covers it |
| **B-21** A volley's beats fuse | The raw beats from a volley's first merge to its last (M-31) fuse into **one beat**: their events concatenated, its first time the first beat's and its source time the last's. No event is re-timed (B-14 holds) and a seek snaps to the fused beat's end state (INV-15). A fuse never crosses a day turn, and the B-15 guard decides which merges may group: over the range, the other drafts touching any piece (a step standing for its parent) lie in one raw beat, at or after the latest member's beat touching it, so the sequencer (merges first, P-3) keeps each piece's order | **Built** with 27 E6a: `Direction.fuse` (inclusive raw-beat ranges), `fuseRanges` (`schedule.ts`), applied right after the limelight call in `buildBeatSchedule`; `volleysOf` (`director.ts`). The number is B-21 because B-20 is a region's own PRs (§8.3) |
| **B-22** The opening's creations fuse | The round's first raw beats that hold only creations fuse into **one beat**, which then plays one Sector sweep (M-32): from the first raw beat that drafts anything, over the consecutive beats whose every draft is a creation (or a sweep of them), each on the first's local day, none drafting nothing. They fuse only when the run spans two beats or more and holds `CROWD_MIN` (4) creations or more. Like B-21, no event is re-timed (B-14), a seek snaps to the fused beat's end state (INV-15), and a fuse never crosses a day turn. Only when directing (`direct: false` keeps today's beats). A volley's x stays measured on the raw beats, slightly off after an opening run; accepted | **Built** with 27 E7b: `openingSweep` (`engine/maneuvers.ts`); `pacing().limelight` sorts its range with the volleys' into `Direction.fuse` (disjoint: an opening beat holds no merge), and `directorOf` carries a fuse with no volley. No fixture opens with such a run (the creation bursts of Harbor and Convoy Planning each sit in one beat), so it is checked on hand-built beats and a mini sprint (`sweep.test.ts`). Later creations in the round don't fuse |
| **B-23** Rising tempo | A solar episode tightens as it goes. Each gap, day turn and the tail gap is first laid out as B-16 to B-18 say (squeezed over budget), then keeps a share of itself that falls linearly from `RISING_FIRST_DAY` (1.1: the first day a little wider) to `RISING_LAST_DAY` (0.5: the last day half), never below `RISING_FLOOR_MS` (300 ms) and never above its cap (`PULSE_GAP_MAX_MS` for a gap, `DAY_TURN_MS` for a day turn). Where it is, p, counts chapters: a played beat's p is the day turns at or before it over the episode's day turns; the tail gap's is 1. An episode of one day keeps its gaps. **Dense** (over the director's target: it pulled any lever, P-23), every day turn is the floor, 300 ms (P10) | Revises B-5, B-17. **Built** with 27 E8 (`risingShare`, `risingMs`, `ScheduleOptions.risingTempo`, set by Solar's pacing). Its tight end (p ≥ 2/3, `RISING_TIGHT_SHARE`) also folds routine repeats to montage (P-24's late-day montage, 27 E10). The director's estimate (`GAP_MIN_MS` a beat) and limelight's fair-turn clock (`DAY_TURN_MS`) are unchanged |

### 8.4 What plays, by priority
Each rule is engine pace data (`PACE_RULES`, `engine/pace.ts`) and the theme's choreography
(`theme/starChart/maneuvers/*.ts`). Phases, lengths and variants: [15 §7](15-reference.md#7-maneuvers);
the change → maneuver map: [15 §9](15-reference.md#9-actions--what-you-see); the event's words: 15 §9
*Event wording*. A rule matches one **move** of an event (`contractMoves`, `engine/moves.ts`: created →
`appear`, state → `climb`, assigned → `reseat`, area/sprint across the region's edge → `enter`/`leave`,
links → `bind`/`unbind`, PR opened → `attach`, completed or abandoned → `settle`, renamed → `retitle`;
dependencies make none).

**(a) Moments: always whole, labelled, the crew named** (essential, protected; never cut, never dropped)

| Rule | Trigger | Cast | What you see | Labels |
|---|---|---|---|---|
| **M-1** `attachment.merge` (Power link) | A PR merges | Author (agent), approvers (support), its station, the work it served (targets) | Author and approvers fly into a formation beside the station, one line through it: horizontal when the station is near the top or bottom of the circle, vertical on the sides, toward the view's middle unless that covers the station's or the work's plate (22 C11, 2026-10-16); energy chain approvers → author → station; the tender docks; on the station's first merge it transforms, from the gather (the station fires as the transformation ends); then it charges and fires one split beam at every piece the PR served | Each target piece wears `PR #n · Title — Merged`; author *Author*, approvers *Approved*. `leads`: plays before a close it served in the same beat. A first merge `holds` its station · **Built:** the arc climax (M-23) |
| **M-2** `objective.accomplish` (Landing) | A story closes | The holder's captain, the piece, its seat (+ stations its merged work went to: `beamed`) | The captain sorties; a tractor and a gold streak; *beamed*: each station charges and fires its mining beam; the grand gold flare as it lands on its platform as a gold orb | The piece wears its state change; the captain is named · **Built:** the close in three acts (M-22) |
| **M-3** `threat.accomplish` (Strike run) | A bug closes | The holder's captain, the fix's approvers (support), stations linked or merged | Captain and reviewers fly a fanned pass; bolts; reviewers' energy; station fire (*beamed*: phasers); the enemy ship breaks up; grand gold flare; its caged hulk goes to orbit | As M-2 · **Built:** the close in three acts (M-22) |
| **M-4** `seat.complete` (Homeworld complete) | The close that leaves a planet's every counted piece done | That captain, the planet | After the close: the captain sorties home; gold rings gather on the world; grand flare; city glints | The captain is named |
| **M-5** `region.clear` (All clear) | The close of a region's last open enemy ship | Every planet with counted work | An all-clear sweeps from the star past the belt, each planet ringing as it passes | None |

**(b) A beat's maneuvers: always animated, labelled within the budget** (narrative; dropped only when
overloaded, below Maximum)

| Rule | Trigger | What you see | Labels |
|---|---|---|---|
| **M-6** `piece.appear` (Sensor contact) | A story created, or a bug created as New | A cyan contact ring; the asteroid spirals in round its planet (a bug's radar sketch shows) | The piece, *Created* |
| **M-7** `threat.emerge` (Hyperspace emergence) | A bug created past New, or a New bug made Ready | A red rift; the enemy ship slides out | The piece |
| **M-8** `objective.underway` (Carve) | A story to Underway (Active) | The captain sorties; a cutting beam across the asteroid; a blue flare | The piece, its state change; the captain named |
| **M-9** `objective.nearing` (Rig up + Haul) | A story to Nearing (Resolved, Ready to Accept) | Sortie; tractor; a violet ring; each linked station tractors the asteroid and hauls supplies home | As M-8 |
| **M-10** `threat.engage` (Engage) | A bug to Underway or Nearing | Sortie; target lock; hero bolts; red return fire on the shield; linked stations fire | As M-8 |
| **M-11** `piece.off` (Warp out) | Removed or Rejected | A grey ring; an enemy ship's warp spark; the piece stays as a ghost | The piece |
| **M-12** `piece.reseat` (Reassign) | Assigned to someone else, or unassigned | A cyan route inks from the old seat to the new; the piece flies the arc; the belt fades with it | The piece, *Assigned to …* · Now the hand-off (M-24, built) |
| **M-13** `facility.enter` (Station jump-in) | The moment a region first needs a station (S-9): its first PR event there in the round, an opening, a merge or a link (`introduces`; `isFirstNeed`, region by region) | Who made it flies ahead and passes the spot without stopping; at the pass, one call blip at the ship and the station folds in at that instant, in the blip's hue and ring shape (27 F2; the beacon and the planets' rings are retired, 27 E1); the ship carries on to its next place | The summoner named (*Opened it*) from the blip, its plate riding with the moving ship (`NOTE_MIN_MS`). A station already on the board never jumps in (the interpreter checks; 22 C11, closing G-4) |
| **M-14** `attachment.open` (Shuttle tender) | Any PR opened (`introduces`; after M-13) | A ring at the station; the new tender appears | None (no piece cast) |
| **M-15** `attachment.settle` (Satellite cycle) | A PR abandoned (settles other than merged) | Charge ring; author and others energise the station | None |

**(c) Light work** (ornament, light; the Activity level decides; never labelled)

| Rule | Trigger | What you see | As built |
|---|---|---|---|
| **M-16** `agent.light` (Captain jump) | Any move of an event no rule above plays (links, area moves, steps, containers), or every event of a cut or crossed beat | The person who made the change jumps over and holds the work in a tractor (bolts at an enemy ship); at higher levels the other person lends a beam | Calm: none. Lively: up to 3 per beat, 0.3 s apart. Maximum (default): all, 0.2 s apart (`engagement.ts`). Costs the schedule no time; skips anyone already flying in the beat. Nothing shows when the actor has no ship |

`agent.progress` (Progress beam, 27 E3), a captain's 1.5 s beam at the work with no formation, matches no move: the director (27 E5a, §8.5c, P-20) plays it in place of a merge's volley when the merge does not close its work. Task updates do not trigger it (27 E5 puts them out of scope).

**(d) Ambient** (outside the schedule; never labelled)

| Rule | When | What you see | As built |
|---|---|---|---|
| **M-17** The opening | Play from the start (x ≤ 1, or before the first beat) | The star flares; what's already there comes in seat by seat (asteroids, enemy ships, then the captain), then the frontier and guests; stations muster | `ManeuverInterpreter.opening`; up to `OPENING_MAX` staggered, in `OPENING_ORIENT_MS` (15 §10) |
| **M-18** Idle work | A captain at rest beside work Underway or Nearing, parked and settled, the scene calm | Every (22 − 13·activity) s: a faint tractor at an asteroid, or 2–3 bolts at an enemy ship | `interpreter.ts` idle loop, `ambient.ts`; 400 ms checks on wall time. A planet captain no longer rests by a station (K-11, G-8 closed); the day's spotlight is built (M-28) |
| **M-19** Idle life | Always | Enemy ships at Underway/Nearing take fire on their shields (Nearing vents); every live enemy ship breathes a red aura; an Underway asteroid's welding glints scale with activity | Art `tick` (`swarm.ts`, `asteroids.ts`) |
| **M-20** Standby | A station quiet a while | It dims and its drift stops; wakes on its next PR | T-4 |
| **M-21** Recap / finale | Playing reaches the end | An open sprint: each finished piece blooms gold (≤ 14), then the viewer's awards. An ended sprint: the finale (the star flares warm, finished platforms glint, the ships form a chevron over the star and salute) | `recap`, `finales.ts`; waits up to 4 s for calm. Never on End or a seek. A beat that earns an award lights its insignia as it plays. The finale's and recap's commands are issued essential, so no load gate drops them; the roll call names the chevron (M-27, M-29, built) |

### 8.4a Arcs and closes (built, 22 C3, C4; decided 2026-10-15, built 2026-10-16)

| Rule | What | Notes |
|---|---|---|
| **M-22** The close | Every close (an asteroid or an enemy ship to Accomplished, alone or in an arc) plays in three acts: **the cause** (its captain's tractor, or the strike pass, or the station's beam in an arc); **the turn**: an initiating effect, a swirl of glittering stardust round an asteroid or a culminating explosion of an enemy ship, hides an instant swap to its done form; **the glide**: the trophy glides (`CLOSE_SLIDE_MS`, about 1.2 s, eased) to its platform; and **the blossom**: the grand gold flare opens as it settles, so success lands where it rests | **Built** (G-2 closed): `CLOSE_SLIDE_MS` lands, `ManeuverDef.slides`, `stardust`, `EXPLOSION`; a v1 view keeps itself when its radius changes (`GraphScene` `builtR`), so the piece glides. The planet's new tally lands with the blossom. Guard: solar-dense *a close glides* |
| **M-23** The arc climax | A merge with a target closing in its arc plays as **one** moment (the merge's `victory` variant): the formation gathers, the energy chain powers the station, the tender docks; then the station's split beam is the finishing blow, and where it strikes a piece closing in the arc, that piece's close (M-22) plays at the impact. The piece's holder flies in to join the formation if they aren't in it (named *Closed it*); every member stays named until the blossom | **Built**: `arcsOf` and `ARC_IMPACT_MS` (`engine/maneuvers.ts`); the close's variant `arc` (land, echo, disperse); `PlannedManeuver.arc`. "Win as a Team": the people who wrote, reviewed and held the work share the victory |
| **M-24** The hand-off | A reassign is a hand-off: the new holder's captain flies to meet the piece at its new slot and is named *Takes it* while it lands; unassigned, the piece drifts to the belt with no ship | Revises M-12 (G-7). **Built** with 22 C7: `piece.reseat`'s agent is the new holder (`mv.to`), and `reassign.ts` sorties them to their own planet, arriving as the piece lands. Whoever made the change isn't kept busy |
| **M-25** The art acts | Each maneuver's act shows the change of look as it happens: `carve` (facets cut under the beam), `rig` (gantry arches rising), `ghost` (fading to its ghost), `engage` (an enemy ship's shields flaring, its guns waking), `launch` (a tender sliding out of the bay), `operate` (the station's ring turning), `victory` (a closed piece's gold outline flaring at the land of a victory, then settling over `AURA_FLARE_MS`; none under reduced motion) | G-1 |
| **M-26** A station's jump-in | Plays only when the station first appears in **this region's** scene (its first PR in the region's own facts); a station already shown never jumps in | **Built** with 22 C11 (M-13, T-1, S-9) |
| **M-27** The finale's own | The finale's and recap's commands are part of the moment: no load gate drops them. The chevron's captains are named as they form (the roll call, §8.5b) | Revises M-21 (G-3). **Built** (`issue(…, essential)`) |
| **M-31** The volley | Merges into one station whose x (at 1×, under the director's first pass) lies within `VOLLEY_WINDOW_MS` (20 s) of the group's first, on one local day, under the B-15 guard (B-21), play as **one Power link**, the carrier (the first merge): the **lead** fires, the author with the most member merges (on a tie, the one whose last member merge is latest, E6-Q1); the other authors, then every member's approvers, fly as support; every member's tender docks; the targets are the union. Each other member's form is `joined`. The causes are named in **turns**, one per member: its work's plates with its note, then its author, approvers and holders not yet named, at most four labels a turn, the overflow in further turns; the echo lengthens to hold every turn (`VOLLEY_TURN_MS` each). The carrier keeps its own form (full, `first` or short) | **Built** with 27 E6a: `volleysOf` (`director.ts`), `joinVolleys`, `volleyTurns`, `volleyPhases` (`engine/maneuvers.ts`), `PlannedManeuver.volley`. 27 E6b built the renderer: every member's tender docks together (`shuttleSlots` takes a slot mask, the stage's `ds=` a list), the interpreter's `nameVolley` opens a turn every `VOLLEY_TURN_MS` (plates and note, then names that fold on the turn's own window), the `volleys()` test hook. Per-person order across the fused beats is not guarded beyond B-15's pieces |
| **M-32** `region.sweep` (Sector sweep) | A beat with `CROWD_MIN` (4) or more **creations** (a `piece.appear` or `threat.emerge` draft whose move is `appear`; a sketch firming up is not one) plays them as **one sweep from the star**: a Nav cyan ring tightens on the star (the tell), then one calm ring sweeps out across the frontier and each new piece makes its quiet entrance as the ring passes it, nearest the star first (normalized elliptical distance, then key), `SWEEP_STEP_MS` (110 ms) apart and spread over `SWEEP_SPREAD_MAX_MS` (2 s) at most. No plates and no crew named: the star wears **one note**, the count by type in the source's words and the sprint (*5 User Stories, 2 Bugs created in Sprint 13*, R9, R12). The echo is the note's read time; no echo cues. Below 4, each creation plays its Sensor contact (M-6) or emergence (M-7) as before. The round's first beats, when they hold only creations, fuse into one beat first and sweep together (B-22, 27 E7b) | **Built** with 27 E7a: `sweepCreations` (`engine/maneuvers.ts`; the first creation carries it, its cast every created piece and their seats, the others' drafts dropped), `sweepPhases` and `RULE.regionSweep` (`pace.ts`, the rule last, `match: () => false`), `PlannedManeuver.sweep`, `BaseMoment.swept` (the B-15 guard counts every swept piece), `sweepNote` (`packs/events.ts`), `sectorSweep.ts`, `sweepOrder.ts` and the `sweep` command (`finales.ts`). The sequencer places it first, at 0; any other draft casting a swept piece starts after it ends. Not a moment: never protected, held or limelit. History marks the carrier's event only. The note counts what the board shows (a piece the pace facts place in the region before the board does isn't counted) |

### 8.5 Coordinating a beat
How the planner orders a beat's maneuvers (`sequence`, `engine/maneuvers.ts`) and how the renderer
adjusts them at run time (`ManeuverInterpreter.spawn`). Values: 15 §10.

| Rule | What | As built |
|---|---|---|
| **P-1** Drafts | One maneuver per (event, move, rule) match, in event, move and rule order; Low events skipped | `draftsOf` |
| **P-2** Introductions first | What brings a moment's cast into the scene goes first: a station's jump-in, then the PR's opening, then its merge | `introduces`, placed ahead |
| **P-3** Moments next | Protected moments, a merge first (`leads`); each waits for earlier moments it shares an actor with (subject, agent, support, attachment, target) or that hold a member of its cast. Where the wait is only a hold (they share no actor at the act: a first merge's station), the later one's tell and gather play in the earlier's echo and disperse: its act starts when the moment ends (27 E4, P3) | `blocks`, `holds`, `seamStartMs`; `SequenceOptions.seams` |
| **P-4** The rest | Each waits for the protected moments it shares actors with and for its `waitsFor` rules, overlapping their echo and disperse as in P-3 when it only shares a hold; otherwise unrelated work plays alongside | `blockedUntil` |
| **P-5** One person, one thing | Any maneuver waits for every earlier one that flies the same person (agent or support), starting once that one's ship leaves (`nearStartMs`: the work's end, or the release less this one's gather): its tell plays in the earlier plate's fold and its ship sets off as the earlier's leaves, so a captain never flies home between. A protected pair still waits for the end (P-3: a shared captain is a shared actor) (27 E4, P4) | `crewBusy` (22 A11, R8); `SequenceOptions.near` |
| **P-6** The attention budget | At most `ATTENTION_MAX` (4) labels at once, counting the pieces' plates the interactions light (one per objective or threat cast as subject, frontier or target) and the captains they name (their flying crew, K-4): a sortie takes two, a merge with its author and two reviewers all four; each holds its place for its length, at least `NOTE_MIN_MS`, claimed at its act (`claimMs`: travel is free, 27 E2, R11), so a maneuver that must wait sets off early enough to arrive as places free; what doesn't fit waits | `attentionFrom` works in claim windows `[start + claimMs, start + held)` (22 B7; four, counting captains, from 22 C10). A crowd of arrivals (`CROWD_MIN`, 4) asks for none · In a crowded beat, montage (P-15, built; rare once limelight quiets the routine work) |
| **P-7** A captain's turn | A maneuver a captain flies (it has a gather) lasts until they leave: parked at the act's start, whole at least `CREW_HOLD_MS` past the work and `CREW_OPEN_MIN_MS` in all, folded over `CREW_FOLD_MS`. A captain whose next turn's gather sets off within `STAY_NEAR_MS` (3 s) of their release waits parked near the work, plate shut, then sets off from there, instead of flying home first (27 E4, P4) | `crewTimes` (22 B9). Now only where a ship flies (P-16, built). `nearWaits`, `Sortie`'s `waitS` |
| **P-8** The beat's length | The latest start + hold of its maneuvers (P-6, P-7) | `shapeOf` |
| **P-9** Load at run time | Below Maximum: essential always, narrative unless overloaded (`OVERLOAD`), ornament unless busy (`BUSY`); per command (27 E1), it plays only while its value per cost (Value ÷ Weight, 15 §8) clears the floor for the load: none under `CALM`, `MUTE_FLOOR.calm` from `CALM` (even at Maximum, so ornament and repeats stop), `MUTE_FLOOR.busy` from `BUSY`, nothing but essential from `OVERLOAD` (15 §10); a `repeats` call has value 0. The profile's `ornament` switch applies the calm floor at every load; light work (`agentLight`, the ornament-tier maneuver) names a real cause (R13) and follows the activity level and `BUSY` (27 Decisions, 2026-11-01) | `spawn`, `make` (`interpreter.ts`); X-2 |
| **P-10** Carry | A maneuver waits for an earlier beat's protected moment that holds one of its actors (never its own beat's) | `runner.protectedFor` |
| **P-11** Waiting captains | A captain whose turn comes later in the beat is held where it is until then, so the new layout doesn't glide it ahead | `HoldFor` via `runner.move` |
| **P-12** Arrivals | A choreography that `reveals` its subject brings it in itself; anything else new makes the theme's entrance, or fades up; 4+ arrivals in a beat come in quietly, a little apart, with no plates. When 4+ of them are creations, they play as one Sector sweep (M-32, 27 E7a) instead, which brings each in quietly as its ring passes; the crowd's quiet entrance remains for other arrivals (pieces entering across the region's edge) | `enterQuietly`, `entrance.ts`; `sectorSweep.ts` (the sweep stays out of the crowd) |
| **P-13** Looks land | Each cast member's new look is claimed and lands once, at its maneuver's land (or its act's end); a choreography that `owns` a role's look wins, then a protected one, then the earliest. An unclaimed look shows after 2 frames; a claimed one that hasn't landed after `CLAIM_SAFETY_S` (30 s) on the travel clock shows anyway (P-18) | `claim` (`interpreter.ts`), `GraphScene` pending looks |
| **P-14** Frozen guides | A choreography that `freezes` a guide holds it as it was until its phase (the belt during a reassign) | `freezes` |

### 8.5a Montage (built, 22 C5, C7, C9; 2026-10-16)

| Rule | What | Notes |
|---|---|---|
| **P-15** Montage | In a beat where labelled work would wait for a place (P-6), the routine work limelight doesn't name (P-17) plays **alongside**: unlabelled, quicker (`MONTAGE_PACE`, its phases × 0.6), with no held turn. Moments, arcs and named turns keep their full labelled turns. One person still does one thing at a time (P-5) | Revises P-6. A busy hour stays lively instead of a long queue. **Built** (`applyLimelight`, `PlannedManeuver.quiet`, `montage`) |
| **P-16** Turns | A held, named turn (P-7) belongs to a maneuver whose captain flies (a sortie or the hand-off); a rule may declare none (`turn: false`: an abandoned PR) | Revises P-7 (G-7). **Built** with 22 C7: `PaceRule.turn`; `flies` and the crew read it, and the interpreter names no crew for such a rule |
| **P-18** Looks land on time | A claimed look lands at its maneuver's land on the schedule clock; the wall-time fallback is a 30 s safety | Revises P-13 (G-16). **Built** with 22 C9: the land was already on the travel clock (`max(1, rate)`); the fallback now ages on that clock too, with a 30 s safety (`CLAIM_SAFETY_S`) |
| **P-19** Short forms | Each protected rule has a **short form** for the director (27 E5) to choose: its phases at `SHORT_PACE` (0.6), rounded, a close's `land` kept at `CLOSE_SLIDE_MS`. A first merge has none (it happens once per station and the transformation floors it). The planner never picks one | Built with 27 E4d: `PaceRule.short`, `shortForm` (`pace.ts`), listed in 15 §7 variants. The director (P-20..P-23) plays them |

### 8.5c The director (built, 27 E5a to E5c; decided 2026-11-01)

A pure pass beside limelight (`engine/director.ts`, `directorOf`) picks every moment's **form** once over the episode: `full`, `short` (P-19), `progress`, `montage` (P-24), `light` (P-26) or `joined` (a merge in its volley's carrier, M-31). Its answer rides on `Limelight.direction`, so the planner, the schedule and a seek read the same choices (INV-12). A moment is a protected draft that is not an arc close. A directed draft (a progress beam) is always named (PA-Q3: abstract the motion, never the names).

| ID | Rule | Notes |
|---|---|---|
| **P-20** Volley, progress, hero shot | A merge **closes its work** when, for some piece it serves, it is the last merge before that piece's next close and within `ARC_WORK_HOURS` of it (real times, B-12), or it is an arc merge: it plays the volley. Any other merge that is not a facility's first plays the **progress beam** (`agent.progress`, with its own cast). A captain left with merges but no volley gets their earliest merge back as a volley, their **hero shot** | `directorOf` steps a, b, d. Every close still plays as a close, never as progress. A volley (M-31, 27 E6) never plays progress, and every author in one has a volley |
| **P-21** Monotony | Within a working day, a full moment whose rule equals the previous moment's played rule trades down to its short form (not the climax; not a moment with no short form) | Step e |
| **P-22** Daily climax | Each day with a moment keeps one **full** moment: the one with the most people, then a close, then the longer full form, then episode order. `PlannedManeuver.climax` marks it | Step c; the camera eases toward it as its gather begins (§6, 27 E9) |
| **P-23** Target and levers | The director estimates the episode's length from above (`estimateMs`, in wall ms). Past `DIRECTOR_TARGET_MS` (300 s, 15 §10) it pulls its levers in order, **short**, **montage**, **speed**, **light**, **fewer-heroes**, each only while the estimate is still over (after speed, the length at the sped pace) and listed in `levers` only if it changed a form (a pod with no hero shot never lists fewer-heroes), re-estimating after each; after light and after fewer-heroes the speed factor is recomputed as the least that meets the target. The target is soft: a pod that stays over it reports so in the ledger | Step f; `npm run pacing` Summary: Target and Levers |
| **P-24** Montage | The **montage** lever turns a short-form moment into a **montage**: the short form with no held turn and no crew named, lighting one plate (the first piece it serves) with its event's note, `PlannedManeuver.montage` and `plate`. Eligible: not the day's climax, not a progress beam, not a facility's first merge, not an arc merge, not a volley (M-31: a montage names no one), and its rule equals the previous moment's that day. **Late-day montage** (27 E10): in rising tempo's tight end (B-23: where `risingShare(p)` is at most `RISING_TIGHT_SHARE`, 0.7, the last third of the day turns or, on a sprint of three days or fewer, its last day), the same eligible repeats fold to montage even under the target, before the levers run. It is no lever: `levers` doesn't list it. History still names everyone. Its one plate is its only on-screen name, so it always draws its note: A-4's fallback places it (§8.9) | Built with 27 E5b: `draftsOf`, `turnsOf` (no people), the interpreter's `labelCast`/`litOf` `only`; E5c: `labels.ts` fallback placement, `montage-names.spec.ts`. E10: `directorOf` step e2, `chapterPs`, `inTightEnd`; `montage-names.spec.ts` covers every pod (`MONTAGE_BEATS`) |
| **P-25** Adaptive speed | The **speed** lever plays the beats that hold no climax faster, by the least k in 1.00..`TEMPO_MAX` (2, 15 §10) in steps of 0.05 that brings the estimate to the target (else 2). A beat's tempo runs from its start to the next played beat's start; the orientation, the gap before the first beat and every climax beat play at 1x. The ruler, x and seeks are unchanged (INV-15): only the wall time per x changes (`BeatSchedule.tempoAt`, `wallAt`, `wallMs`; `clock.pace()` = rate × tempo) | Built with 27 E5b: `directorOf` step f, `tempoOf` (`schedule.ts`), `clock.ts` |
| **P-26** Light work | The **light** lever takes every `attachment.open` (except one placed ahead of a moment in its beat: the sequencer's introduction of a piece the moment acts on), `objective.underway`, `objective.nearing` and `threat.engage` (a Bug's underway and nearing) out of the schedule: `draftsOf` drops the draft, so its event falls to light work (`lights`), which costs the schedule nothing. History still lists the event; at Calm, light work shows no sortie | Built with 27 E5c: `Direction.forms` `light`, `draftsOf`, `BaseMoment.ahead` |
| **P-27** Fewer hero shots | The **fewer-heroes** lever undoes the hero shots of P-20: each goes back to a progress beam (the day's climax stays a volley). "Each captain is named at least once" replaces "at least one volley": limelight names everyone's first turn and a progress beam is always named, so every merge still names its ADO cause (PA-Q3) | Built with 27 E5c: `directorOf` step 5 |

### 8.5b Limelight (built, 22 C6; decided 2026-10-15, built 2026-10-16)
Everyone's effort gets at least one moment; every victory is the team's. One pure pass over the
episode (`engine/limelight.ts`) decides who is named, so the planner, the renderer and a seek agree.

| Rule | What | Notes |
|---|---|---|
| **P-17** Who is named | Moments and arcs always; each person's **first turn** of the episode, whatever it is (light work or montage included); then at most one named turn per person per `FAIR_TURN_MS` (8 s of playback), so no one crowds others out. The rest of their work still plays, unlabelled | A Task's event is its parent's work (B-2). **Built** (`engine/limelight.ts`, `Limelight` on the schedule; the renderer plans each beat with it) |
| **M-28** The day's breather | Each day turn (B-17) opens with a breather: the star breathes, the day's name shows on the ruler, and one captain gets a **spotlight**: an idle bout at their current work, named (*On {title}*). The spotlight goes to someone not yet seen this episode, else round a fair rotation (fewest named turns, then seat order) | M-18 gains a named form. **Built** (the dawn inside a day turn: `chart.dawn`, `spotlight`; named only while the budget has room, folded before the day's first beat) |
| **M-29** The roll call | At the round's end, every captain flying in the chevron is named as they form up; their finished pieces glint in turn | Revises M-21. **Built** (the finale's `rollCall`; part *Crew*, never a count, INV-19) |

### 8.6 Captains
| Rule | What | As built | The intent (22 C) |
|---|---|---|---|
| **K-1** Who has a ship | Every planet's holder, for the whole round; anyone assigned a shown piece; guests (K-7) | `projectCaptains` (`traffic.ts`), the `homes` loop | ✓ start near their planet. ✗ "jump in shortly before needed": a holder is there from the opening even if their work comes late (G-9, by design) · Guests now come and go (K-13, K-14, built) |
| **K-2** Where it rests | Off a planet's face, never on it: by the piece of their last event here (any edit; a step counts as its parent); else the piece they've held longest; else beside their own planet's name | `activityAnchors`, `restAt` (`traffic.ts`; 22 A9, `REST_BY_NAME`) | Now K-11 (built): the last piece touched, never a station |
| **K-3** A sortie | It flies out on a gentle arc to the work's side of the work's planet, outside its face, turning ±0.45 or ±0.9 rad if it would park over the work's plate; several ships fan round that side | `sortie`, `approachOf`, `clearOfPlate` (`chart/fx/commands.ts`, `approach.ts`) | |
| **K-4** Its turn | Travel, then work, then a held moment named, then away (P-7). The plate opens only once parked; a ship a protect held back is named only when it arrives | `Sortie.crewOpen`; 22 B9 | |
| **K-5** Waiting | Held still until its turn (P-11) | | |
| **K-6** Facing | Points the way it moves, strictly; holds its heading still | `faceByTravel` (15 §10 *Ship facing*) | |
| **K-7** Guests | Someone with no planet who helped here (authored or approved a PR, changed a piece's state, made a step) gets a ship from then on, resting off the planet of the piece they helped (fanned), or beside the station | `projectGuests` (`solar.ts`), `GUEST_FAN` | Now K-13, K-14 (built): only while present, resting by the work they helped, never a station |
| **K-8** Away people | Someone with no ship at all, cast in a jump-in or merge, jumps in out of hyperspace, holds, and jumps out | `GuestShip` (theme `guest` command) | Rare: anyone who helped already has a guest ship. K-13 (built) is the same jump for a guest ship new this beat |
| **K-9** Leaving | None: nobody leaves mid-round. A captain with nothing held rests by their planet's name | Captain and station assets aren't `moving`, so a removal would vanish instantly | Now K-12, K-14 (built): planet captains stay, guests jump out |
| **K-10** Formations | Merge: the author beside the station on the star's side, the approvers in a row further out (`APPROVER_STEP`, `APPROVER_OUT`). Strike run: fanned `STRIKE_FAN`. Finale: a chevron over the star | `powerLink.ts`, `strikeRun.ts`, `finales.ts`; 15 §10 | |

### 8.6a Captains and guests (built, 22 C7, C8; decided 2026-10-15, built 2026-10-16)

| Rule | What | Notes |
|---|---|---|
| **K-11** A planet captain's rest | Off the planet of the **last asteroid or enemy ship they touched** in this region, even someone else's: a Task's event counts as its parent's, PR work as the work the PR serves (its linked pieces, a Task standing for its parent). **Never by a station.** Only pieces still on the board count: a Feature's own event, or a piece since moved away, leaves the last one before it. With none, by the piece they've held longest, else beside their own planet's name, as at the start | Revises K-2 (G-8, G-10). **Built** with 22 C7: `pieceAnchors` (`traffic.ts`), guarded by `restAnchors.test.ts`. Where by that planet: its loiter slot (K-16, 22 D3) |
| **K-12** Planet captains stay | A captain with a planet never leaves the system: after any work they sortie back to their rest (K-11) | Revises K-9 (G-6). **Built** as it stood: no planet captain is ever removed (K-1) |
| **K-13** A guest arrives | A guest (no planet here) jumps in from hyperspace **right at their destination**, the spot they'd have parked at, with no sortie; they finish the jump completely, and only then does their part begin (a beam of approval, the bolts of a strike) | Revises K-7, K-8 (G-5). **Built** with 22 C8: a guest ship new this beat and flown by its maneuver is hidden, and its first sortie (`pursue`) drops out of hyperspace at its spot (`JUMP_IN_S`, 0.4 s) instead of flying out; the theme's entrance at rest stays the fallback when no sortie takes it. The jump fits every rule's gather (≥ 400 ms), so the planner needs no lead (the planned `GUEST_JUMP_MS` dropped) |
| **K-14** A guest waits or leaves | After their part, if they're needed again within `GUEST_STAY_MS` (10 s of playback at 1×), they sortie to a nearby planet, preferably one whose work they helped, and wait there; otherwise they **jump out**. They can always jump back in later. Their presence is planned over the schedule, so a seek shows a guest exactly where playing would | Revises K-9 (G-6). **Built** with 22 C8: `guestPresence` (`engine/guests.ts`) over the laid-out beats, carried on `BeatSchedule.guests` and given to the projection (`ProjectOptions.guests`); a guest waits off the planet of the work they helped (a PR's: the work it serves); the agent asset departs by warping out (`departAct`, `WARP_OUT_S`). Guard: solar-dense *guests come and go* |
| **K-15** Stations stay | Stations never leave; standby's low contrast is enough | T-5 confirmed |

### 8.7 Stations
| Rule | What | As built | The intent (22 C) |
|---|---|---|---|
| **T-1** Coming in | When the region first needs it (S-9): summoned (M-13), it jumps in as its summoner passes (27 F2), then that PR event plays (an opening's tender launches; a merge's formation forms). Needed only by a PR opened before the round with nothing inside it: there from the opening, mustering with the rest (M-17) | `facility.enter`, `isFirstNeed` and `firstNeeds` (`pace.ts`), `enterAt` (`stations.ts`) | ✓ only when needed; never shown, then summoned (22 C11, closing G-4) |
| **T-2** Tenders | One per open PR; launches at its opening (M-14), docks at its merge (M-1) | `compound.ts`; art | |
| **T-3** Firing | Only inside maneuvers: Engage (2 bolts each linked station), Strike run (a bolt, or a phaser when *beamed*), Landing *beamed* (a mining beam), Power link's echo (a split beam at the work), Rig up's haul | `stationFire.ts`, `haul.ts`, `powerLink.ts` | ✓ part of merges. Guards never fire (G-15) |
| **T-4** Standby | Nothing open and PR activity below `STANDBY_BELOW`: the hull dims and its lights fade over `STANDBY_FADE_MS`, its plate drops to the Place tier; its next PR wakes it at that tender's land (`STANDBY_WAKE_MS`) | `solar.ts`, `standby.ts`; 15 §10 | ✓ low contrast when unused |
| **T-5** Leaving | None | | ✗ a long-quiet station never jumps out (G-6, I-5) · **Decided:** stations stay (K-15) |

### 8.8 Asteroids and enemy ships
| Rule | What | As built |
|---|---|---|
| **L-1** The ladder | A piece's look is its rung: Ready (a sketch while New), Underway, Nearing (a step toward done), Accomplished, Off. Unmapped states are neutral (INV-11) | `stageCodec.ts`; [09](09-signal-ladder.md), 15 §3 |
| **L-2** What changes a look | Its state (climb), its assignment (it flies to the new seat's slot), its membership (enters or leaves the region), its steps. A rename changes nothing drawn | The moves (§8.4) |
| **L-3** Idle life by rung | M-19 | |
| **L-4** Done forms | A story: a round gold orb on its platform; a bug: a caged hulk with an asterisk of spikes, outlined in gold (22 A12) | `asteroids.ts`, `swarm.ts`. The move to the platform is a jump, not a glide (G-2, confirmed) · Now M-22 (built): the swap under cover, the glide, the blossom |
| **L-5** Off | A ghost at its old slot; a Rejected bug struck through | |
| **L-6** Entrances and exits | An asteroid spirals in round its planet; an enemy ship comes through a rift (or shows as a sketch); one leaving the region backs into a rift (`retreat`) | `entrance.ts`, `threat.ts` |

### 8.9 Labels and attention in play
| Rule | What | As built |
|---|---|---|
| **A-1** At rest | Every plate rests at T4 Sky and rises to its own tier (stars T4, captains and stations T1, planets T3) while pointed, selected, followed, expanded, cast or acting (13 §1 R1); asteroids and enemy ships are hover-only (a seated piece speaks through its planet's rows) | `labelTiers.ts`, 15 §6 |
| **A-2** In play | Plates show their title alone; captains their picture; only what's pointed at opens fully | `tierFor` |
| **A-3** A piece's plate in play | Shows while a maneuver casts it (subject, frontier, target): from its act (`claimMs`: the cast has arrived, R11; the tell lights none, 27 E2) to `CAST_LABEL_LINGER_MS` after its land; fades over `CAST_LABEL_FADE_MS`; paused, it fades out and back on resume; a seek clears it | `castLabels.ts`; X-3 |
| **A-4** The note | While its maneuver plays (from its act; not paused) the plate wears the event's action in History's words (`Assigned to Mara Lind`, `PR #12 · Title — Merged`). A plate wearing its note names its event's cause (R13), so it never vanishes for want of room: failing a clear place (one crossing no other label, A-5's budget kept), it stands where it covers the least of other labels, and the least off the view or under the side panel. Any cast plate in play that wears a note, not only a montage's (P-24), whose one plate is its only name | `eventLine.ts` `noteOf` (22 B6); the fallback: `labels.ts` (27 E5c), 06 §9 |
| **A-5** Four at a time | At most `ATTENTION_MAX` (4) labels, pieces' plates and named captains together: one lingering past its maneuver crossfades out for one starting or a captain being named; others wait. Named captains are placed right after focused plates, before the standing ones. One exception: the finale's roll call names every captain in the chevron at once, the team's victory (M-29) | P-6 (22 C10) |
| **A-6** The crew named | A flying captain's plate opens to name and part while parked (K-4), within the budget (A-5): the author first, then reviewers in order; any beyond keep their picture | 22 B9, C10 · Also the day's spotlight and the roll call (M-28, M-29, built) |
| **A-7** Arrivals | A ship's or station's plate waits for its entrance, a glance, then unfurls | 22 A8 (`EMERGE_DELAY_MS`, `EMERGE_MS`) |
| **A-8** History follows | History's rows for the events the plates are noting are marked *now*; History lights nothing itself in play | 22 B5 |

### 8.10 Seeks, reduced motion and rates
- **R-1 Seeks (INV-15).** A seek plans nothing: `FxDirector.clear()` destroys every command and tell,
  releases held edges, thaws frozen views, lands every pending look, rests every act and settles every
  eased look (standby), and clears every plate window. A resting look is a pure function of the
  snapshot. `liveCommands()` is 0 after any seek. A directed camera lands on the fitted board (§6, 27 E9).
- **R-2 Reduced motion (§7, INV-20).** Every command declares its substitute: flights snap, beams and
  sparks are skipped, flares become rings; every look still lands; plates show and go without fades; the
  opening is skipped.
- **R-3 Rates.** Effects run on the schedule clock, so at 2× everything, the captains' turns included,
  takes half the wall time. Art acts run one loop (`EVENT_LOOP_S`); fades and standby run on wall time.

### 8.11 Conflicts found (resolved in this pass)
Each was a disagreement between docs, or a doc and the code. The code was taken as true unless noted;
the losing text was corrected or replaced by a pointer here.

| # | Topic | One side | The other | Resolved |
|---|---|---|---|---|
| X-1 | Episode length | 06 §5: "a busy week runs about a minute" | 05 §3, 13 §1, 15: 45 s (`pacing.budgetMs` (DESKTOP: 45000)) | 45 s |
| X-2 | The ornament gate | 05 §5's tier table: "only when calm"; 13: idle life "cut when busy" | Code: maneuvers at `BUSY`, commands at `CALM`, even at Maximum | Both gates stated (P-9) |
| X-3 | Plates paused | 15 §10: "Paused, it holds" | 06, 03 and the code: fade out on the wall clock, back on resume | Fade (A-3) |
| X-4 | The crew's hold | 13 §6.2, 22 B9: "1 s past the work" | Code and 15: 1.5 s whole (`CREW_HOLD_MS`), plus `CREW_OPEN_MIN_MS` | 1.5 s (P-7) |
| X-5 | Where an idle captain rests | 02 INV-07: "beside a piece they hold; else beside their planet" | Code, 22 A9: last worked, else longest held, else by the planet's name | Code (K-2) |
| X-6 | Schedule hooks | 14 §2.6: three | Code, 05 §8, 03 §7: four (`orientMs`) | Four |
| X-7 | Star plates | 06 §9, 13 §2, 14: path and item count, T2/T3 | Code, 15, 22 A3–A5, B1: name over counts, T4 Sky, no path | Code |
| X-8 | Preview caps | 13 §2: "up to a cap" | Code, 15, 22 A1: no cap | No cap |
| X-9 | Holo tiers | 12, 22 R1: three | Code, 15 §6: four (T4 Sky) | Four |
| X-10 | Where `CROWD_MIN` lives | 12: the interpreter | Code, 15: `engine/maneuvers.ts` | The engine |
| X-11 | Sequencing in 03 | 03 §5d: no one-person queue, attention or crew turn | Code, 05 | Pointer to here |
| X-12 | Names | Prose saying "hive ship", "dreadnought" | 22 B2: Enemy ship, Station (internal ids unchanged) | User-facing prose renamed |
| X-13 | A defeated bug at rest | 05, 14: "a ruin" | 22 A12, 09, 06: a caged asterisk platform | The platform |
| X-14 | Formation halos | 08 §7: guides include formation halos | 09, 06: removed | Removed |
| X-15 | The PR identity line | 22 B3/B4 text: `Pull Request · #…` | Code and 13/06: `PR · #…` | `PR` |

### 8.12 Gaps: where the code and the intent part
Confirmed by a probe, or **from code** (read and cited), or *suspected* (to confirm before fixing).

| # | Gap | Evidence | Rules touched | Decided (2026-10-15) |
|---|---|---|---|---|
| G-1 | Several art acts do nothing: `carve`, `rig` and `ghost` on asteroids, `engage` on enemy ships, `launch` and `operate` on stations; `cover` is never issued | From code: `actView` refuses acts an asset doesn't list (`GraphScene.ts`; `objective.ts`, `stageCodec.ts`, `facility.ts`) | M-8, M-9, M-10, M-11, M-14, M-15 | Build all six (M-25; C3) |
| G-2 | A closing piece jumps to its platform in its done look instead of gliding there under the gold streak | **Confirmed** (probe, meridian at 2×): 16 closes, each 22–74 px in one 40 ms sample, its look landing the same frame. A changed radius rebuilds the view (`GraphScene.apply`) | M-2, M-3, L-4 | The close in three acts, glided (M-22; C3) |
| G-3 | The finale's glints and award insignia are dropped once the formation is flying | From code: ornament commands drop at `CALM` even at Maximum (`make`); each formation flight weighs 1.5 | M-21, P-9 | No load gate for the finale and recap (M-27; C6) |
| G-4 | A station shown from the first frame (an older open PR) still plays its jump-in at its first in-round PR; in a region whose first PR isn't the round's, it never jumps in, just fades up | From code: `firstAttachment` (in-round only, whole sprint) vs `enterAt` (includes earlier open PRs) | T-1, M-13 | **Closed** by 22 C11: every station starts off the map and jumps in at the region's first need (S-9, M-26) |
| G-5 | A first-time guest arrives twice: warps in at its rest spot, then sorties to the merge or jump-in in the same beat | From code (`projectGuests` adds the node at that beat; the entrance plays; the maneuver flies it) | K-7 | **Closed** (C8): guests jump in at their destination (K-13) |
| G-6 | Nobody leaves: captains and stations stay for the round, and if removed would vanish instantly | From code (`agent.ts`, `facility.ts`: not `moving`) | K-9, T-5 | **Closed** (C8): planet captains and stations stay; guests jump out (K-12, K-14, K-15) |
| G-7 | The planner stretches Reassign and Satellite cycle for a captain's turn, and holds the captain busy, though their ships never fly | From code (`flies` in `maneuvers.ts`; no sortie in `reassign.ts`, `satelliteCycle.ts`) | P-7 | **Closed** (C7): Reassign is a hand-off with a turn; an abandoned PR has none (M-24, P-16) |
| G-8 | Idle work can beam a station (it aims at whatever the ship rests by) | From code (`attach.work ?? attach.to`) | M-18 | **Closed** (C7): a planet captain never rests by a station (K-11) |
| G-9 | Late joiners are on stage from the opening, resting by an empty planet's name | From code (S-1, K-1) | K-1 | By design: a planet captain is home from the start (K-12) |
| G-10 | A captain's rest ignores PR work: a PR event never anchors where they rest | From code (`activityAnchors`: PR keys aren't drawn nodes) | K-2 | **Closed** (C7): PR work anchors to the work it serves (K-11) |
| G-11 | A High event no rule plays makes a silent beat (a Feature created, a Task-only change) | From code (`shapeOf`) | B-4 | Accepted: containers aren't drawn; steps play light work |
| G-12 | At high rates, beats crossed in one frame lose their maneuvers to light work | From code (`accentBeat`) | B-9 | **Closed** (C9): every crossed accent plays (B-19); at today's rates it never happened |
| G-13 | Peaks and lulls: a working day's events crowd into long serialized beats (one person, two plates, crew turns), while quiet hours and nights still take up to 2.5 s each; the budget squeezes gaps evenly | From code (B-5, B-7, P-5–P-7); the user's observation on real data | B-5, B-7, P-5, P-6, P-7 | Dead air capped, day turns, montage (B-16, B-17, P-15; C5) |
| G-14 | Planets' outcome counts are hard-coded to 0 | From code (`solar.ts`) | S-7 | **Closed** (C9): the projection no longer writes `outcomes`; v1.4 A2 removed the field from `PieceState`, and the world art takes `megastructures`/`research` as options set only by the gallery |
| G-15 | Guards are always idle | From code (`stageCodec.ts`) | S-10, T-3 | Accepted: guards are decorative |
| G-16 | A claimed look that hasn't landed after 8 s of wall time shows anyway, so long queued beats or slow rates show looks before their land | From code (`GraphScene`) | P-13 | **Closed** (C9): the fallback ages on the travel clock, 30 s safety (P-18) |

### 8.13 Ideas to try
Starting points for Block C. Each was decided with the user on 2026-10-15 (22 Block C, its decisions);
the decided rules are in Block C's sections above, all built.

| # | Idea | Why | Rules it would touch | Decided (2026-10-15) |
|---|---|---|---|---|
| I-1 | **Story arcs:** when a story or bug closes the same day as (after) the last merge of a PR that served it, play the close inside that merge's moment, so the formation that merged and powered the station also lands the victory | The user's example: real data closes after merges most of the time; one heroic moment tells the day's story | B-1, M-1, M-2, M-3, P-3; the schedule's beats (a beat may then hold events from different hours: INV-15 still holds, since seeks snap) | **Taken:** same-day arcs in story time, one climax (B-12, M-23; C2 built, C4) |
| I-2 | **Even out the flow:** compress quiet hours harder and spread a crowded hour's beats, so the episode keeps a steady pulse (a target beats-per-minute, not only a total) | G-13 | B-5, B-7 | **Taken:** a steady pulse with montage (B-16 to B-18, P-15; C5) |
| I-3 | **A breather in long gaps:** let ambient life fill a long quiet stretch (an idle bout, a station's muster) rather than empty sky | G-13 | M-18, B-5 | **Taken:** chapter breaks with a spotlight (B-17, M-28; C6) |
| I-4 | **Everyone seen:** a soft rotation, so each captain gets at least one named turn per episode (an idle bout, or their light work promoted) | The user: "give everyone a chance to be seen" | M-16, M-18, P-6 | **Taken:** first turns, fair share, spotlights, roll call (P-17, M-28, M-29; C6) |
| I-5 | **Arrive when needed, leave when done:** a captain jumps in shortly before their first work and jumps out after a linger once they hold nothing; a long-quiet station jumps out | The user's expectations (K-1, K-9, T-5) | S-1, S-9, K-1, K-9, T-5; INV-14 (seats stay fixed; only ships come and go) | **Taken for guests only:** planet captains stay (K-12 to K-14; C8) |
| I-6 | **Group by story across the day:** join a story's events across a day into one beat when nothing else happened to it in between | Fewer, fuller moments | B-1 | **Taken:** at its culmination (B-13; C2 built) |
| I-7 | **Fix the visible gaps first:** the close glide (G-2), the no-op acts (G-1), the finale ornaments (G-3), the double arrival (G-5) | Small, high-visibility | as listed | **Taken:** G-1, G-2, G-3, G-5 in C3, C6, C8 |
