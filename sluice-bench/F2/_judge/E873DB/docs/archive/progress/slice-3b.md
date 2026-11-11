# Slice 3b: Perspectives

Started 2026-10-03, after HG-3a was signed off. Slice 3b makes playback a way to watch the work
from different perspectives:
- playback carries on as you move between scenes;
- you can follow a captain;
- the camera keeps big moments in view;
- a sector's stars show what happens inside them;
- stage changes land with their cause.

## Decided with the user (2026-10-03)
- **Following anchors stay as written in 05 §6:** assignments to the captain and PRs they open, not
  every change they make.
- **Frame-the-action is on while playing.** A manual pan or zoom suspends it; Z or Play brings it
  back.
- **Following travels before the beat.** When the next anchor is in another scene, the playhead
  holds just before the beat, the camera travels there, and the beat lands in the new scene.
- **Reduced motion stays as built** (static outlines of about 1.5 s; 0.3 s ship fades). VC-5 was
  revised to match.
- **At high rates, the code is right:** accents keep their shape up to 2× and may outlast their
  beat. 05 §5 was revised.
- **Small drifts:**
  - The recap is 220 ms per step, and 05 now says so.
  - Stage changes wait for their flare: 05 already said a change shows after the beam, and the code
    switched at once.

## Built
- **Continuous playback across scenes (AC-20).** This mostly existed. A new check navigates galaxy →
  sector → Feature → body → back while playing. The playhead keeps advancing, each scene shows the
  playhead's state, and nothing from before the move replays.
- **Sector glyphs** (05 §5 sector scale; `Glyph` in `fx/effects.ts`):
  - A Story or Bug change glints half an orbit round its Feature's star, in the new rung's color.
  - Task events show three small specks circling close in.
  - PR events send a spoke down toward the resources: blue for a launch, gold for a merge, grey for
    an abandon.
  - A Feature's own change is the star's flare.
  - At most one of each glyph per star per beat, plus the one `sectorPulse` wash. Glyphs duck under a
    grand flare. Reduced motion keeps only the wash, as a static ring.
- **Follow mode (AC-23; 05 §6):**
  - **Shared:** `followAnchors` and `latestAnchor` in `src/shared/playback/follow.ts`. A PR goes to
    its first linked Story or Bug (a Task's link counts for its parent). An unlinked PR stays put. An
    item in no scene, such as an uncharted Task, is "outside this view".
  - **Starting it:** clicking a ship selects and follows its captain. So do **F** (the selected
    captain, or Resume), Follow on the captain's inspector card, and Go on a departure trail.
  - **While playing:** the playhead holds just before an anchor's beat, the camera travels to its
    scene, and the beat lands there. The follow bar reads "Following ‹call sign›: ‹event›".
  - **Suspending:** a manual pan or zoom, Back, a breadcrumb, entering a scene yourself, or search
    suspends following and shows **Resume Follow**. Resuming goes to the latest anchor at or before
    the playhead, with no replay. A seek while following recenters once.
  - **Outside the view:** an anchor outside the view keeps the camera where it is and shows "Next
    recorded event for ‹call sign› is outside this view". Unfollow ends it.
- **Frame-the-action camera (Z):**
  - As a High beat's lead-in begins (or when the beat lands, if there was no lead-in), the camera
    checks whether the beat's objects are in view.
  - If they aren't, it makes the smallest move that brings them in: a pan, or a zoom out if they
    don't fit. It never zooms in. The move takes 700 ms (instant in reduced motion).
  - That's `CameraController.includeState` and `ChartApp.frameAction`.
  - A manual pan or zoom suspends it, and the follow bar offers **Keep in view (Z)**.
- **Stage polish (06 §5):**
  - On a beat, a body's new look waits until its flare starts (after the actor's beam, the radar
    ping, or the merge), then swaps under a 0.5 s dip in brightness as the flare swells. That's
    `GraphScene.claimStage` and `landStage`.
  - A change with no accent shows on the next frame; a seek shows it at once.
- **Reduced motion:** scene changes are a 150 ms crossfade, with no zoom and no grid sweep (05 §7).
  The rest was already built.

## Contracts and docs changed
- **03:**
  - §7: `followAnchors`, `latestAnchor`.
  - §10: the `follow`, `framing`, `setCamera`, `setReduced`, and `shownStages` hooks, and
    `fxCensus` gains `glyphs` and `guests`.
- **05:**
  - §2: the follow and frame actions, plus F and Z.
  - §5: the sector glyphs as built, and accents at high rates.
  - §6: hold, then travel; anchors as written; the suspend triggers; the follow bar.
  - §7: the 0.3 s ship fade.
  - The recap at 220 ms.
- **06:**
  - §5 `stageShift`: the new look lands with its cause.
  - VC-5: revised to match the build.
- **Fixture:** orbit-week's Ava takes the uncharted Task 408 on Thursday morning. That's follow
  mode's out-of-view case. It shares an existing beat, so the week's timing barely moves; the
  goldens were regenerated.

## Checks
| Check | Result |
|---|---|
| AC-20 (E) | ✅ Galaxy → sector → Feature → body → back while playing: the playhead keeps going, each scene shows its state, and nothing replays |
| AC-23 (E, U) | ✅ One click follows Ava. She opens PR 9002, so the camera travels to Story 201 before the beat lands. A manual pan suspends following, and Resume goes back to Story 201 with no replay. Her uncharted Task 408 shows the note, and the camera stays. Unfollow ends it. Unit: anchors, PR → Story, unlinked PRs stay, out-of-view, `latestAnchor` |
| AC-24 (E) = VC-5 | ✅ In reduced motion, stepping four beats in Feature 101: no flights, pings, beams, or guests, and every accent has a static ring. A scene change is a quick crossfade |
| Frame-the-action (E) | ✅ Zoomed in away from Story 201, Rafe's resolve brings it on screen without zooming in. A manual zoom suspends framing; Z turns it back on |
| Sector glyphs (E) | ✅ Story 201 going Active glints on its Feature's star in the Comet Crew sector |
| Stage polish (E) | ✅ Story 201 keeps its Underway look until Rafe's beam lands, then becomes Nearing |
| Regression | See the hand-off message: unit and golden tests 117/117; typecheck and lint clean |

**Stills** (`test-results/slice3b-*.png`):
1. A sector glyph.
2. Following Ava into Story 201.
3. The camera after framing Rafe's resolve.

## Known limitations and open questions
- **HG-3** (a full week at 1×) is next. Sector glyphs should be noticeable without turning the view
  into a pulsing scoreboard, and a captain's jump should read as a jump.
- **The camera moves on its own while playing** (framing, following). A double-click aimed at
  something can land after the view has slid, so the e2e checks enter through the object list
  instead. Should a pointer press near the canvas pause framing for a moment?
- **Follow holds the playhead** for the transition (about 0.6 s) at each anchor in another scene.
  At 4× that's a noticeable stutter.
- **The out-of-view note stays** until the next anchor that can be followed.

# Refinements after review (2026-10-04)
- **History runs newest first.** New cards arrive at the top, highlighted, and older ones move
  down. The list holds only the beats so far (what's still to come is on the ruler), and it scrolls
  back to the top for each new card unless the pointer is reading it.
- **The collapsed player keeps small dots** for the in-view big moments (High beats), in their rung
  colors: upcoming ones bright, passed ones faded.
- **The hero aura** (`fx/hero.ts`, owned by `ChartApp`, drawn in screen space like the reticle): a
  halo with turning rays, a thin ring and orbiting motes, so the followed ship can't be lost. It's
  **the timeline's cyan** (ties to the ruler, and lower contrast), off the signal ladder, and **deliberately gentler than the
  reticle** (tuned down twice after review: first too shy, then too bright). When play starts, it
  makes an entrance: light gathers, blooms softly, and sends out two faint rings (2.6 s). Reduced motion keeps a steady halo
  and a ring. Stills: `test-results/hero-*.png`.
- **Abandoning the journey:** paused (or stopped) away from the followed ship's scene, following
  ends. While playing, leaving only suspends it. The pre-existing AC-23 test, which paused after
  leaving the scene, now resumes while playing instead.
- **Open:** whether the aura should dim the rest of the view slightly during its entrance (I left
  the world as it is); whether the History list should show upcoming beats faintly below.

# The team switcher (2026-10-04)
- **Why:** the one-Feature pass-through (AC-48) had hidden the only way to change Area Path. It was a
  tiny ▾ on a truncated crumb, and the crumb's name sent you up to the galaxy.
- **What changed:** the sector is now a **team pill** after the project, "TEAM ◇ Comet Crew ▾"
  (EPIC for Epic sectors). It's styled apart and never truncates. Its ▾ lists Saved Area Paths then
  Epics, and switching opens that team's sky, or its one Feature. Its name goes to the team's home.
  It's remembered per project, through `lastSector`. Area Paths are teams (pods) in practice, so the
  breadcrumb reads as project › team › place.
- **Tests:** `review-scenes.spec.ts` (switching from inside a one-Feature team, and the name going
  home) and `slice1.spec.ts` (the switcher's menu). Still: `test-results/team-switcher.png`.

# Following tells the captain's story (2026-10-04)
- **The story** (`storyOf`, `storyAnchors` in `src/shared/playback/follow.ts`) is what they did,
  plus what happened to their work, including others' changes to items assigned to them. While
  following, playback plays only that: a schedule like highlights, with the gaps compressed, so the
  ship is rarely idle. Following or unfollowing rebuilds it at the same source time.
- **The stage is the Feature system.** The camera travels between Features with the captain's work
  (hold the beat, then travel). Close-ups stay opt-in.
- **The follow camera** (`ChartApp.followFrame`) eases to the ship at Play. Each beat it frames the
  ship, what it's beside, and this beat's and the last beat's work. It may zoom in (0.8 to 2.5× the
  fit), it ignores small changes, and it keeps the framed work clear of the player and the follow
  bar. Frame-the-action steps aside while following.
- **History while following:** only their cards, plus the intro line "This period, ‹name› worked on
  …" (names, never counts). The recap at the end is theirs too.
- **AC-23 rewritten** for this. Ava travels from Unified quote ledger to Rate card editor (Story 211)
  and back (PR 9002), keeps her ship on screen, and shows the note for Task 408. Four new unit
  tests. Still: `test-results/slice3b-2-following.png`.

# The follow camera's principles (2026-10-04, after HG-3 review)
- **The finding:** following was too tight. Once a captain launched a PR, its shuttle and station
  fell out of frame, which lost the context.
- **The new rules** (05 §6; `ChartApp.followFrame`): frame the captain's working set in this
  Feature, and a PR brings its station. Context only grows; when the work spans about 55% of the
  scene, show the whole system. Zoom in only at the start, and move at the lead-in.
- **Test:** "follow camera principles" in `slice3b.spec.ts`. Through Ava's PR 9002, the shuttle and
  portal-web stay in view, and after the opening frame the camera never zooms back in. Still:
  `test-results/follow-camera-pr.png`.

# Deferred to the UX Polish slice (2026-10-04)
The open questions from the 3b reviews now live in [91-ux-polish.md](../91-ux-polish.md), picked up
in slice 6 (UX polish) once the app runs on real data. That covers camera moves under the cursor,
the 4× follow stutter, the whole-system threshold and the ratchet, dimming for the aura, upcoming
History beats, the intro line, budgets, and the HG-3a carry-overs.

# HG-3: signed off (2026-10-04)
The user signed off slice 3b. The rest of the review moved to [91-ux-polish.md](../91-ux-polish.md)
for slice 6 (UX polish), to decide on real data. Next is slice 4 (ADO ingestion).
