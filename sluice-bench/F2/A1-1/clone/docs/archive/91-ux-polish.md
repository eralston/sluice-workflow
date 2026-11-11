# 91 — UX polish backlog (deferred decisions)

Started 2026-10-04, at the HG-3 review. These are open questions and refinements that need more
evidence before deciding: usually how the app feels with **real data** (real team sizes, real weeks,
real PR volume), not the synthetic fixtures. They're picked up in the UX Polish slice (07), after
slice 5. Each row says where it came from, what's built today, and what would settle it.

Don't build any of these ahead of that slice unless the user asks. Add new deferred decisions here
rather than leaving them in a slice note.

## Follow mode and the camera

| Question | Built today | What would settle it |
|---|---|---|
| ~~**The camera moves under the cursor.** While playing, framing or following can slide the view just as you go to click something~~ **Settled 2026-10-09 (slice 6)** | **Built.** A press anywhere on the chart, labels included, holds the automatic camera (frame-the-action and the follow camera) while it's down and for 1.5 s after release (`CAMERA_HOLD_AFTER_MS`). The follow camera's working set still grows meanwhile. A manual pan or zoom still suspends them outright (05 §6) | Settled |
| ~~**Following stutters at 4×.** The playhead holds about 0.6 s for each Feature change~~ **Obsolete 2026-10-09** | Following no longer leaves the scene on screen (decided 2026-10-08, 05 §6): work elsewhere gets a note and the camera stays, so there is no hold and no travel | Gone with the travel |
| ~~**The follow camera's "whole system" threshold.**~~ **Settled 2026-10-09 (slice 6): as built** | `FOLLOW_WHOLE_SHARE = 0.55`: at 55% of the scene, show the whole system | Settled. Reopen only if following a real captain shows it giving up the close view too soon |
| ~~**The ratchet never comes back in** within a scene~~ **Settled 2026-10-09 (slice 6): as built** | The frame only widens; it resets on Play, Resume, or a new scene (the old "travel" reset is gone with travel) | Settled |
| ~~**Dim the view during the hero aura's entrance?**~~ **Settled 2026-10-09 (slice 6): no** | The world is unchanged; the entrance is a soft bloom and two faint rings, and it reads | Settled |
| ~~**The aura and the tractor beam are both cyan**~~ **Settled 2026-10-09 (slice 6): keep both** | A halo and a cone; they don't blur on a real sprint | Settled |

## History and the player

| Question | Built today | What would settle it |
|---|---|---|
| ~~**Show upcoming beats faintly** in History~~ **Built 2026-10-09 (slice 6)** | The next three beats sit above the present card, dimmed, under a "Next" label (the list is newest-first, so the future is above); clicking one seeks to it | Watch whether three is the right number |
| ~~**The intro line** ("This period, ‹name› worked on …")~~ **Settled as built 2026-10-09** | Up to two titles, then "and others"; names only, never counts (INV-19) | Settled |
| ~~**History card sentences** for events with no recorded actor are passive~~ **Settled as built 2026-10-09** | Fixtures leave `changedBy` empty in places; real ADO always records `System.ChangedBy` | Slice 4 data: if actors are always present, the passive form may never show |
| ~~**The 05 §2 departure:** the first scope opens at the *end* of the range~~ **Settled 2026-10-09** | Every scene opens at its end state, matching what ADO shows for that scope, and the play button is ↻ "Play from the start" there (the user asked for this: 05 §2) | Settled |

## Pacing and budgets

| Question | Built today | What would settle it |
|---|---|---|
| ~~**Busy weeks run over the budget**~~ **Tightened 2026-10-09 (slice 6): "it dragged"** (real plays measured 60 s, 60 s and 93 s) | Budget 60 s → 45 s, minimum gap 0.7 → 0.5 s, orientation and final holds 2 s → 1.2 s. High beats are still never cut, so the densest weeks run a little over 45 s | Watch a real sprint again |
| ~~**Accents above 2×** keep their shape and outlast their beat~~ **Settled as built 2026-10-09** | Decided 2026-10-03 (05 §5) | Settled |
| **Activity's numbers** (2026-10-09: "get aggressive, we can dial it back") | Maximum by default: ship actions on every Medium+ change, subjects fly too, guests up to 6, beams 0.2 s apart, load tiers ignored for beams (05 §5, `ENGAGEMENT`). On orbit-week at 4×: 10 beams started against Calm's 6, and a beam is up 63% of the time against 46% | A real sprint at Maximum: which parts are too much. Tune the table, or move the default to Lively |

## The board (2026-10-09)

| Question | Built today | What would settle it |
|---|---|---|
| **The `BOARD` numbers** (`src/shared/scene/board.ts`) | One ring per person, swimlane 330 thick, `sep` 620, `minPerRing` 6, `minShare` 0.14, done after 2 days at 60%, rings 950 apart, ships away from home for 6 source hours | A real sprint's pod: whether it reads like the board, and how crowded a busy person's lane gets |
| **Dense boards shrink** to fit the view (17 Stories in one Feature make bodies small) | Fit whole, like every system | Whether dense systems should scroll as a page instead (06 §3 page fit) |
| **Board columns** | From state, via the signal ladder | ADO's `System.BoardColumn`, in 90 |
| **Labels yield to ships** (2026-10-09) | Every other label goes around a captain's ship, or hides; ship labels avoid their own assignment too. In a crowded pod a planet's label can hide (it shows on hover) | Whether hidden labels on real sprints are acceptable, or labels should shorten first (title only) |

## Art and layout (carried from HG-3a)

| Question | Built today | What would settle it |
|---|---|---|
| **The review formation** can sit over a neighbouring PR label for a moment, and its beams are faint at a wide zoom | As built in slice 3a | Real PR lanes, which may be busier or sparser than the fixtures |
| **ADO's default pictures** (slice 4): for someone who never uploaded a picture, ADO serves a generated initials image, which would replace our own avatar circle | Every picture ADO serves is used. **Moot for now (2026-10-09):** the user's PAT can't read pictures at all (401), so every captain shows initials | Returns if a token that can read pictures is ever used. Folded into *Pictures you add by hand*, below |
| ~~**Red-family avatar colors** (crimson, raspberry) sit near the red that 09 keeps for real alerts~~ **Built 2026-10-09 (slice 6)** | Crimson and raspberry are replaced by indigo and bronze; no avatar swatch is a true red (06 §4) | Settled |
| ~~**Sparse radars look thin**~~ **Built 2026-10-09 (slice 6)** | Fewer than six Tasks keep six Tasks' spacing and sit centered at the front; six or more use the whole arc as before (03 §radar) | Real Stories' Task counts |
| **Area-move Go** opens the Feature under the current sector's breadcrumb, not its new sector's | As built in slice 3a. **Looked at 2026-10-09 (slice 6); asked for, not yet built:** `goTo` navigates inside the open sector only, so reaching the new sector means opening another scope, and the new Area Path may not be one you have saved | Decide whether Go may open an unsaved Area Path as a one-off sector (or offer to save it), and how Back returns |

## Performance

| Question | Built today | What would settle it |
|---|---|---|
| **The dense-scene frame time** sits near its 25 ms p95 budget, and has missed it under machine load (OneDrive syncing this folder) | Passes when the machine is quiet. **Profiling built in slice 5:** the coverage panel shows cache size and median/95th frame times (also logged as `profile`), and `perf.spec.ts` holds the budget | Reading it on a real, busy sprint, on a repo outside OneDrive |

## Scale (from the first look at a real org, 2026-10-07)

| Question | Built today | What would settle it |
|---|---|---|
| ~~**Feature systems at touch size**~~ **Settled as built 2026-10-09 (slice 6)** | Galaxy only gets the page fit; Feature systems fit whole, planets about 35 px: a pointer app, and the wheel zooms every scene | Settled (reopen if dense real Features feel cramped: 08 §4) |
| ~~**Pinned-first order** vs. a "Pinned" group with a heading~~ **Settled as built 2026-10-09** | Pinned first, then A–Z, in one grid | Settled |

**Settled 2026-10-07:** (revised the same day) the wheel zooms in every scene, with scrollbars only where a scene can't fit zoomed out; labels are their objects' buttons
(click selects, double-click enters, drag pans); the galaxy is pinned-first then A–Z; quiet projects
are the same size, dimmer; In view rows bring their object into view, and double-click enters.

**Settled 2026-10-07 (onboarding pass):** a selected galaxy keeps its full label (it shows the
events, and emphasizes the selection); first launch opens the empty cosmos; recent projects come from
your own recent work and seed the galaxy as pins you accept.

| Question | Built today | What would settle it |
|---|---|---|
| **The recent-work window** | 90 days of work you changed or are assigned | Whether the real top 10 match where you work; "viewed" items aren't available through REST |
| **The quotes** | 12, in `config/cosmos-quotes.txt` | The user's own list; check each attribution |


**Loading by level (2026-10-07; 04 §5a):** the numbers below are first guesses, to tune on the real org.

| Question | Built today | What would settle it |
|---|---|---|
| **The recent window** a team opens on (**Backlog only** since 2026-10-07: Sprints streams and the sprint's dates are its window) | Changed in 30 days, at least the 10 newest | Whether real teams open on the Features people expect |
| **Load more's page** (**Backlog only**) | 15 Features | Whether one press brings enough |
| **The default history range** (**Backlog only**: a sprint's history is its own dates and streams in by itself) | 7 days (1 · 7 · 14 · 30 offered) | How long a 7-day load takes on a real Feature (the dev log times it) |
| **Loading energy's strength** | Builds over about 5 s to a peak; the black hole's storm peaks faster | Whether a long real load feels busy or alarming; tune in the gallery |
| **Cancel by clicking elsewhere** | Esc, and since 2026-10-08 a Cancel button on the loading plate | Whether people reach for a click outside the plate to cancel |

**Removed items (2026-10-07, from the first real-data look):** items in a Removed state are a distraction on the chart.

| Question | Built today | What would settle it |
|---|---|---|
| ~~Filter out removed items, and make them transient during playback only~~ **Settled 2026-10-08 (slice H3)** | A Removed item departs (05 §5) and leaves the scene, In view and the counts; replay before the removal shows it (02 INV-10) | Settled |
| **Arrive / Depart tunables** | 40° arc, 0.9 s, 12 per second, 60 ms stagger, 0.3 s cheap fade | How a large first stream on the real org reads |

**Pictures you add by hand (2026-10-09, from the real org):** the user's PAT can't read teammates' pictures.
Every avatar call answers 401, once per person (26 in one run), so captains show their initials on a
colour. That is fine for now and stays the fallback. The idea is to let the user supply the pictures
themselves: download a teammate's photo elsewhere, load it into the app, and have it kept and reused
indefinitely, so the chart looks the way it should. **Built 2026-10-09 (slice 6), the smallest version
that does the job; the rows marked *open* wait for use.**

| Question | Decided and built | Still open |
|---|---|---|
| **Where a hand-added picture lives** | `<userData>/pictures/<org key>/<identity id>.png`, one small file per person, keyed by identity ID and org (INV-22: never by name). Beside the cache, not in it, so **Purge leaves it**; the folder can be copied to another Mac. Never the repo folder (`src/main/avatars/pictures.ts`) | A "where are my pictures" line in settings (below) |
| **Which picture wins** | A hand-added picture wins over ADO's and over initials. It is overlaid on the identities when a scope loads (`factsFor`), so every scope that shows that person gets it | Whether ADO's own should ever replace it: no, unless asked |
| **How you add one** | A captain's Inspector card: **Add picture…** (or **Use my own picture…** when ADO served one, **Change picture…** once you have added one), which opens the Mac's file chooser in the main process. The path and bytes never reach the renderer; only "it took" does. Shown in ADO mode only | *Open:* drag a file onto a captain, and a People list. Try the Inspector first on a real week |
| **Size and format** | png, jpeg, gif or webp up to 12 MB in; cut to a centered square and shrunk to 128 px, kept as PNG. The file chooser's failures are told in words (not a picture; too large; not connected) | SVG is not accepted |
| **Removing and replacing** | **Remove picture** (only for ones you added) forgets the file, and ADO's picture or initials show again. **Change picture…** replaces in place. The bundle marks these captains `handAdded` so the panel knows | What happens when ADO starts serving one after all: yours still wins |
| **A settings surface** | *Open.* None yet: the Inspector card is the only entry | This is the first feature that wants real settings; design that surface once with the user (People, Purge, where files are kept) |
| **Privacy** | Real people's photos: `userData` only, never logged (the dev log notes only that one was added, with no name or id), never committed, never crossing IPC after the choice. Tests use an invented generated image and a text file as the bad one (`tests/e2e/pictures.spec.ts`, `tests/unit/pictures.test.ts`) | Same rule (INV-18) |

A picture ADO won't give us (401, or 404) is already quiet: it is listed in the request panel but doesn't
mark the Requests button (06 §5; slice 5).
