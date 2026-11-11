# Slice 3a — Story grammar

Split from slice 3 at the slice 2 review (2026-10-03). Every change now plays as **tell → act →
land → echo**, along geometry already on the chart, and the transport keeps the rare controls one
click deeper. Slice 3b (continuous playback across scenes, follow mode, the frame-the-action
camera, VC-5) is next, after HG-3a.

## Built
- **The Task radar** (`src/shared/scene/layout.ts`, `projectScene.ts`; 06 §3):
  - Three front-arc bands (about 240°, the gap behind the planet), one per rung, Ready outermost and
    Accomplished hugging the planet.
  - Each Task keeps one **spoke** (an angle from its slot, evenly spread by arc length) for the
    whole history. Its band follows its displayed stage, so a change moves it only along its spoke.
    Removed Tasks leave the radar.
  - A gold **accretion glow** under the inner band grows with the share of Tasks done.
  - Underway Tasks are labelled when there's room, earliest slots first. Ready and Accomplished
    ones label on hover or selection.
  - The body's label gains a **tally**: "14 accomplished · 6 underway · 1 ready", each part in its
    rung's color.
  - The PR lane and station row are sized by the outer band, so they never move.
- **Radar motion:** the **radar ping** (collapse, a spark along the spoke, re-expand with a slight
  overshoot, then the rung's flare). Same-beat Tasks move as one wave. A removed Task dissolves.
- **Echoes:** reaching Accomplished sends a gold spark up the spoke or orbit to the parent's limb or
  corona, which rings once per beat. This works in the close-up and in the Feature system (from the
  Task dots and from planets to the star).
- **Cause → effect beams:**
  - `changedBy` on every event, the DSL's `by` option (it defaults to the assignee), and IPC
    validation.
  - A short beam from the **actor's** ship leads the flare. It's never the assignee's ship, there's
    one per ship per beat, and none if the actor has no ship in the scene.
  - Fixtures: Rafe resolves Ava's Story 201 in orbit-week; Ivy closes Story 1011 in busy-week.
- **Tells and the lead-in:**
  - While playing, within 400 ms of an accented beat (or the whole gap if shorter), its actors wind
    up:
    - ships turn, back off, and their engines glow;
    - the actor's beam reaches for the item;
    - a body's rim brightens in its coming rung's color;
    - a station's bay glows before a launch.
  - Tells never play on a seek or a step, and a seek cancels them.
- **Chaos controls:**
  - Accents stagger parent outward within a beat, 120 ms apart; all of a beat's Tasks share one
    delay.
  - Decorative effects duck to 40% while a grand flare bursts, and lesser flares shrink.
  - One grand burst at a time, always within its own beat.
- **New accents:**
  - The PR **delivery run**: out to the linked work, home, a docking bob, then the grand flare and
    the station's bay flashing gold.
  - An abandoned PR's lights go out and it drifts to ash.
  - The **reverse flare** on a reopen.
  - A **seed spark** before every emerge.
  - Launches undock slowly, then accelerate, over about 1.8 s.
  - Arrivals overshoot and settle, and in-scene flights bow along an arc.
  - A reparent within a scene travels an arc; out of a scene, it leaves a jump trail with Go to the
    new parent. An area move leaves a jump trail with the new sector's name.
  - The **recap bloom** when playing reaches the end.
  - The **dawn sweep** as the ruler passes 07:00.
- **Transport** (06 §5):
  - The bar reads ▶ ▶❘ · date · ruler · **1×** chip (opens a popover) · **Highlights** · **Events** ·
    **⋯** (the lens, reduced motion).
  - An amber **Retrospective ✕** chip shows whenever that lens is on.
  - **In-view ticks** in ladder colors, with diamonds for High beats; hovering the ruler shows the
    beat's event lines and the remaining time.
  - **Auto-fade** to a thin progress line after 3 s idle while playing.
- **Hotkeys** (05 §2): Space, ← / →, Shift ← / → (previous / next big moment in this view),
  Home / End, [ / ], H, L, E, and a **?** overlay.
- **Highlights** (`src/shared/playback/highlights.ts`, 05 §3): a schedule of only the beats touching
  the scene, with a 15 s budget. The state is still the full snapshot. Entering another scene
  rebuilds it at the same source time.
- **Fixtures:** Lantern Squad's Story 251 gets a radar week: waves of closures, a new Task, a
  removal, a reopen, and a merge.

## Contracts changed (docs updated in the same change)
- **02, INV-14 amended:** a radar Task's angle comes from its slot and never changes; its radius
  comes from its displayed stage. Position stays a pure function of (history, t, lens).
- **03:**
  - §3: `changedBy`.
  - §5:
    - `ViewNode.radar`, `labelOnHover`, and `tally`;
    - `ViewEdge.geometry.band`;
    - `ViewGraph.radar`/`RadarSpec` (and `lane`, which existed but wasn't listed);
    - the radar layout rule.
  - §7: `ScheduleOptions`, `sceneEntityKeys`, `touches`, `buildHighlights`, and
    `PlaybackClock.stepTo`.
  - §10, test hooks: `radar()`, `beatTimes()`, `play()`, `pause()`, and `setRate()`.
- **04:** the `changedBy` mapping (`System.ChangedBy`, `createdBy`, `closedBy`).
- **05:**
  - §2: the new actions and keys.
  - §3: highlights.
  - §5: story grammar (tell, beam, stagger, ducking, echo, recap, dawn).
  - §7: reduced motion.
- **06:**
  - §2: radar dot floors (half a label, about 0.4 for Accomplished).
  - §3: the radar.
  - §5: the new accent rows, chaos controls, and the transport.
- **07:** slice 3 split into **3a** and **3b**; new AC-36 to AC-42; the frame-the-action camera
  is in 3b.
- **08:** the dense close-up limit is marked fixed by the radar.

**Departures from the approved plan:**
- **Band counts** live in the body's label as a tally line, not at the band ends. At the band ends
  they collided with ship and Task labels; inside the label, the label layer places them without
  collisions.
- **HG-3a uses Lantern Squad's Story 251,** not a busy-week Story, because busy-week has no Tasks.
  Giving it some would have shifted its budget-cut goldens.
- **Launch timing:** the launch effect runs about 1.8 s, but its beat duration in the schedule stays
  900 ms. Effects may outlast their beat (as flares do), so AC-17's totals are unchanged
  (orbit-week still 28.8 s).

## Checks
| Check | Result |
|---|---|
| AC-36 (U) | ✅ Story 251's 21 spokes keep one angle at every instant of the week, bands match stages, no shared angles, moves are radial, and seeks are idempotent (`tests/unit/radar.test.ts`) |
| AC-37 (E) | ✅ The Thursday wave moves five Tasks, all radially, into the inner band. The 20-Task close-up passes the density harness: 0 hit overlaps, 0 label overlaps, every PR and station label shown. `test.fail` is removed |
| AC-38 (E) | ✅ The tells run inside the last 400 ms before the beat while playing; a seek mid-lead-in leaves 0 effects |
| AC-39 (U) | ✅ `changedBy` defaults to the assignee; Rafe, not Ava, is the source of Story 201's beam |
| AC-40 (G) | ✅ `__golden__/*.highlights.json` for every scenario's busiest Feature, within 15 s (orbit-week Feature 101: 12.6 s), every beat touching the scene, and the state the full snapshot |
| AC-41 (E) | ✅ Every hotkey; the rate popover; the fade and its return; the Retrospective chip; H at the same source time |
| AC-42 (E) | ✅ The recap plays on playing into the end, not on End |
| Regression | ✅ 94 unit and golden tests. All 47 e2e tests pass, including the 4× leak check and perf. Typecheck and lint are clean. The VC-1 `body` baseline was re-recorded (the radar); the other scales are unchanged |

**Review stills** (`test-results/slice3a-*.png`):
1. The radar collapse.
2. The sparks running along their spokes.
3. The wave landing, with the echo ring.
4. The reopen and a close.
5. The PR delivery run.
6. Story 251 resolved.
7. The same wave from the Feature system.
8. The resolve's beam from the Feature system.
9. The resolve's echo from the Feature system.

## Known limitations and open questions
- **Watch for chaos at HG-3a.** The tells, beams, echoes, and ducking are all on. The Thursday wave
  (five Tasks, an echo, and a beam) is the busiest moment; tell me which to dial back.
- **Sparse radars look thin.** With three Tasks, the 240° arc puts the outer ones at the band
  ends. A narrower arc for few Tasks would group them, but it's another rule.
- **Area-move Go** opens the Feature under the current sector's breadcrumb, not its new sector's.
  Cross-sector navigation belongs with 3b's continuous playback.
- **A reparent within a scene** only happens in sector scenes with today's projections. It's
  implemented but has no fixture.
- **The tally adds a fourth label line** that the camera fit doesn't reserve. The label still
  fits in every scenario.
- **The beam in the Feature system** is small at that zoom. The stills show the flare and echo
  clearly; the beam is best judged live.

---

# Refinement after HG-3a review (2026-10-03)

Your review found each effect reasonable alone, but **too much too fast** together: "fireworks, not
a cozy campfire". Statement summary panel is a *typical* Story (real ones have 3–9 PRs, 6–12 Tasks,
and 2–4 people per sprint), so 1× must stay calm at that density. Then three mid-course notes:
- the thin beams read as lasers;
- reaching across the screen to a shuttle is too far;
- ships commute back to the parent too often.

## Changed
- **Pace (05 §§3–4):**
  - A busy week now runs **about 60 s** at 1× (it was 20–30 s); 4× is the quick look.
  - Each accent's duration is its whole choreography, so it lands inside its beat.
  - Gaps are 700–2500 ms (they were 250–1500).
  - Over budget, the **gaps compress first**; only then are Medium accents cut.
  - Effects run at about half speed: flares swell over 1 s, the radar ping takes about 2 s, and ship
    flights take 1.8 s.
  - The stagger is 400 ms, the lead-in 700 ms, and jump trails last 12 s.
- **Continuity (05 §5):**
  - **Glide layer:** every node eases to its new layout on a critically damped spring, and lines
    follow every frame. Seeks, lens toggles, and scene entry **snap** (INV-15); zooming never glides.
  - **Pursuit:** moving effects chase the node's gliding goal, so a target that jumps mid-flight
    bends the path instead of teleporting the object. A new move starts from wherever the node is
    drawn.
  - **Live anchors** for tractor beams, ink, sparks, and intent lines.
  - **Intent chain for launches:** an intent line reaches from the bay to the lane slot, the vessel
    follows it and consumes it, and then the route inks on to its Task.
  - **Lines are revealed, never popped:** a held edge isn't drawn until its ink finishes.
  - A delayed move **holds** its node in place, so nothing drifts and snaps back.
- **Justified motion (05 §5 tiers):**
  - A volatility meter gates three tiers:
    - **essential** always plays;
    - **narrative** (tractor beams, tells, echoes) is rationed when busy (one beam, three echoes);
    - **ornament** (seed sparks, flare sparks, the recap, the dawn sweep) plays only when calm.
  - **Dropped:** arrival overshoot, the ship back-off, the abandoned PR's drift, and the merged PR's
    trip to its work (it now eases into its berth, then flares).
  - **"Worth an inch":** a move under 60 screen px just glides.
- **Ships go to their work and stay (02 INV-07, INV-08 amended; 03 §5):**
  - A ship rests beside **where its captain last worked** in the scene: the latest event they made
    (`changedBy`, or opening a PR), on the nearest shown object. PR work rests at the vessel.
  - New work is one flight there, and the ship stays; it never commutes back to the parent.
  - Before any activity in the scene, the ship sits at its assignment, as before.
- **Tractor beam (06 §5):** this replaces every thin beam. It's a broad, soft cyan cone that wraps
  the object, with drifting bands and motes, and reads as assisting, never attacking. It engages
  when the ship arrives. The author's ship flies to meet its launching vessel in the lane. Long
  streaks across the screen are kept for navigation: the jump trails.

**Found and fixed along the way:**
- The effect budget could cut a moving vessel's pursuit, snapping the vessel. Moves, pending steps,
  and revealing ink are now never cut.
- A retired effect could keep updating because the update pass works on a copy of the list, so a
  destroyed `Hold` pinned a vessel to its dock. Retired effects are now skipped.

## Checks
| Check | Result |
|---|---|
| AC-17, re-targeted | ✅ orbit-week 60 s with every beat accented (its gaps compress); Lantern 60 s; busy-week fits 60 s only by cutting Medium accents, never High; quiet-week 15.5 s |
| AC-43 (E), continuity | ✅ Across Lantern's launch beats at 1×, no node moves faster than 1500 px/s between frames. Routes are held until inked, and nothing glides after a seek |
| AC-44 (E), tiers | ✅ Busy: at most 3 echoes. Overloaded: no echoes, every radar ping still plays |
| AC-39, ships | ✅ After Rafe resolves Ava's Story 201, his ship rests beside 201 and stays; Mina's ship rests at PR 9003; Rafe's doesn't move for it |
| Earlier checks | ✅ 97 unit and golden tests. The schedule, highlights, and seek goldens were regenerated (only times and captain positions changed). AC-21's e2e check now compares resting places. The VC-1 `body` baseline was re-recorded (ships at their work) |

**Not from this change:** the gallery's screenshot check fails because every section renders
15 px narrower (1385 vs 1400). The gallery window now shows a scrollbar; your display settings
changed again. The art is unchanged, so I haven't re-recorded it. Say the word and I will.

---

# The review formation (2026-10-03)

At a merge, the PR's **approvers' ships come together in formation**, join their tractor beams on the
vessel, and that joined beam carries it home to the grand gold flare. It shows, in the team's eyes,
the people who finished the work together.

- **Data:**
  - `pr_completed.payload.approvedBy`: reviewers whose vote *standing at completion* approved
    (`10`, or `5` with suggestions).
  - ADO has it: the PR's `reviewers`, plus `VoteUpdate` threads replayed to `closedDate`. That's the
    04 §6a recipe, with a new probe row for thread access and a fallback to the final votes.
  - Approvers become captains with ships, but approving never counts as activity (INV-07/08).
- **Fixtures:**
  - orbit-week's PR 9001 (Ava and the guest Jo) and PR 9003 (Rafe and the guest Sana).
  - Lantern's PR 9202 (Ava, Jo, and Sana).
  - busy-week's two merges (with the guest Lu).
- **Choreography** (05 §5, 06 §5): gather (1.2 s), join beams (1.0 s), berth and grand flare
  (1.0 s), then disperse.
  - Guests fly in from out of view with a name tag and leave without a trail.
  - Residents return to their resting places.
  - Essential tier: when busy, guests fade in at their slots.
  - Reduced motion shows a ring per approver.
- **Checks:**
  - AC-45: at PR 9202's merge, two guests with tags appear; three beams join before the flare; no
    leaks.
  - AC-46: a seek mid-formation clears everything.
  - Unit: approvers flow through to the plan; resting places are unchanged; guests are never nodes.
  - Goldens regenerated (a merge with approvers now lasts 3.8 s).
- **Stills:** `test-results/slice3a-13-formation-gather.png`, `14-formation-beams`,
  `15-formation-flare`.
- **Open for review:**
  - The formation's arc can sit over a neighbouring PR label for a moment.
  - At a wide zoom the beams are faint.

## Update: the author leads, the reviewers support (2026-10-03)
- **Who's who:** the PR's author (from `pr_opened`) takes the **point** just above the vessel and
  works it with the tractor beam. The reviewers take the **wings of a V** behind.
- **Support stream:** each reviewer sends a warm stream of gold motes (ship to ship, visibly
  different from the cyan tractor cone) into the author, who glows with it.
- **Role chips:** every participant wears one: **Author** (cyan) or **Reviewer** (gold). Guests
  show their name and role.
- **Bug fixed:** a support stream could read a guest ship that had already gone. That threw every
  frame and **stopped playback**. Guests now keep their last position, and a failing effect is
  retired instead of breaking the frame.

# Dynamic labels (2026-10-03)
- **While playing:** labels are compact: the title only, a size smaller. The Story's tally stays,
  and focused labels stay full.
- **Moving objects** stay compact until they've been still for 3 s; the chart returns to full labels
  3 s after playback stops.
- **Ships:** they collapse to their **captain's picture hugging the top of the ship**.
- **Task flashes:** a Task that appears or changes band flashes its title for 3.5 s, then fades.
- **Checks:** AC-47 (compact while playing, full when settled, the Task flash). Still
  `test-results/slice3a-16-compact-labels.png`.
- **Also:** jump trails now last 15 s, so a late departure still holds at the end with the slower
  pace.

# Review scenes and a quieter formation (2026-10-03)
- **Formation:** the Author and Reviewer role chips are gone. The beams (support streams into the
  author, the author's tractor beam on the vessel) tell the story. Guest reviewers now wear only
  their captain's picture (their uploaded one, else initials), hugging the top of the ship, the
  same circle residents show while playing. 05 §5 and 06 §5 updated.
- **Ember Desk** (`fixtures/scenarios/solo-desk.ts`): the simplest whole story. Tove Brandt alone:
  Story 271 emerges, Tasks 491 and 492 one at a time, PR 9401, Task 493 joins that PR, everything
  closes, she merges alone (no formation), then the Story and Feature 131 close. One ship. About
  58 s at 1×.
- **Kestrel Team** (`fixtures/scenarios/bug-outbreak.ts`): Odile Ferrand and Bram Castellanos on
  Feature 141. Two Stories, six Tasks, four PRs reviewed by each other. Then the outbreak: Bug 331
  → PR 9505 → resolved; Bug 332 → PR 9506 → resolved; Bugs 333 and 334 together → PR 9507
  (reviewed by Bram and the guest Sana) → resolved; Story 282 lands Friday evening. Steps are an
  hour or more apart so each plays as its own beat. About 79 s at 1×: over the ~60 s budget,
  because High beats are never cut, and 12 Medium beats (mostly Task changes) play without accents.
- Both are applied inside orbit-week (new saved areas 13 and 14 in Nimbus Deck), so fixture mode
  shows them. The default scope and every golden are unchanged.
- **Fixed:** `core.test.ts` ignored an expectation's `scope`; it now builds that scope's history.
- **Checks:** 98 unit and golden tests. `tests/e2e/review-scenes.spec.ts` (one ship and no guests in
  Ember; one guest picture and no role chips in Kestrel) and `slice3a.spec.ts` pass. Typecheck and
  lint are clean. Stills: `test-results/ember-*.png`, `test-results/kestrel-*.png`.

# One-Feature sectors pass through (2026-10-03)
- **Why:** a sector with a single star gave no hint that you double-click it to see the planets,
  so it read as a dead end.
- **Rule (06 §3):** if exactly one Feature ever joined the sector in the loaded history,
  `openSector` stacks the sector (marked `passThrough`) and its Feature, and makes one transition.
  - `back()`, Esc, and wheel-out pass over it to the galaxy with the chooser open. So does
    clicking the sector's crumb; its ▾ still switches sectors.
  - The galaxy is never skipped.
  - If that Feature doesn't exist yet at the playhead, the sector opens normally.
- **Other levels were considered and kept:**
  - A Feature with one Story still adds its star, stations, the PR lane, and ships.
  - A Story or Bug with no Tasks stays enterable (your call). Its close-up still frames its own PRs,
    and a later Task appears there.
  - Entering a galaxy already skips the chooser.
- **Code:** `soleFeature` (`src/shared/scene/projectScene.ts`) shares one membership rule with the
  sector layout; `NavEntry.passThrough`; `nav.ts` `openSector` and `back`; `Breadcrumb.tsx`.
- **Applies to:** Ember Desk, Kestrel Team, and Harbor Watch's Tide Team.
- **Checks:**
  - AC-48 unit (`tests/unit/nav-rules.test.ts`) and e2e (`review-scenes.spec.ts`).
  - `slice1.spec.ts`'s Harbor Watch switch now expects Feature 601.

# Protected moments (2026-10-03)
- **Why:** in Kestrel's playback, the formation got broken by other motion: the shuttle swept
  around, the beams stretched, and the author's ship left mid-moment. The success moment must play
  uninterrupted. Unrelated changes may still play.
- **What was wrong:**
  - The formation (about 5.1 s) outlasted its 3.8 s beat, so the next beat and its lead-in landed
    while the crew was still out.
  - The ship-flight pass flew any ship that was away from home, including escorts mid-formation.
  - At 4× the formation's ships ran at 4× while its beams and steps ran at 2×.
  - Same-beat launches and flights started at once.
- **Built** (05 §5):
  - **Moments:** every merge, and every Feature, Story, or Bug closing, is a protected moment with a
    cast and a window. That's `protectedMoment` and `protectBeat` in `src/shared/playback/protect.ts`.
  - **Beats:** the schedule sizes each beat to play its moments first. Accents that would move the
    cast get `afterMs`, so they start afterwards, and the beat grows to hold them.
  - **Renderer:**
    - The director registers a `Protect` effect per moment, which freezes the cast in the glide
      layer (`GraphScene.freeze`/`thaw`).
    - `move()` defers any other mover of a cast node until the moment ends, then starts it from
      where the node is drawn.
    - The lead-in skips protected ships.
    - The formation runs on one clock.
  - **Timing:** a merge with approvers is now 5100 ms. Jump trails last 18 s (was 15), so
    orbit-week's late departure still holds at the end.
  - **What it costs:**
    - orbit-week's shared Thursday merge beat (9001 and 9003, both with Rafe) is now 10.2 s; the
      week still fits 60 s with every beat accented.
    - Feature 101's highlights run 34.8 s, over their 30 s budget, because High beats are never cut.
      The unit check now allows that, as the golden check already did.
    - busy-week cuts one more Medium beat.
- **Not done:** the closing flares still sit where the body was when they started. With the cast
  frozen, the body no longer moves under them, so I left that alone.
- **Checks:**
  - AC-49 unit (`tests/unit/protect.test.ts`).
  - AC-49 e2e (`review-scenes.spec.ts`: Kestrel's first merge played at 1× and 4×, and Ember's lone
    merge and closings played to the end).
  - Goldens regenerated: only merge durations and the times after them changed.

# Gallery layout across displays (2026-10-03)
- **What you saw:** on the laptop's Retina display, the gallery art sat off its frames, while on the
  ultrawide it was fine.
- **Why:** the one canvas spans the whole page. At 2× the page needed a 2880 × 13802 drawing buffer.
  That's more than the GPU allows, so the browser quietly shrank it to 2631 × 12609, and everything
  slid off its frames, further down the page.
- **Fixed** (`src/renderer/src/gallery/Gallery.tsx`, `styles.css`):
  - The canvas resolution is now the sharpest that fits. The code checks what the browser actually
    allocated and steps down until the two agree.
  - The art re-lays out on any reflow (a ResizeObserver) and on a move to a display with another
    pixel density.
  - Columns are fluid, at least 200 px wide.
  - The scrollbar is hidden, so the width never depends on macOS's setting.
  - The header wraps on narrow windows.
- **Screenshots** are review copies now, not pixel checks (your call). The baselines were removed.
  The new `tests/e2e/gallery-layout.spec.ts` checks alignment at 2× and at 1024, 1440, and 2400 px
  wide.
- **Also found:** a ship held by an effect lagged one frame of glide behind where the effect put it.
  `GraphScene.glide` now keeps owned nodes where their effect drew them. That steadied the
  formation at 4×.

# HG-3a: signed off (2026-10-03)
The user approved slice 3a. Next is slice 3b (perspectives).
