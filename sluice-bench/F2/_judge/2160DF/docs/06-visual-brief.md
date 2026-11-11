# 06 — Visual brief

**Status:** current as of 2026-10-27 (through v1.3 Block B), amended in place to match the build. Values (hex colours,
sizes, floors, tempos, timings) live in [15](15-reference.md), which wins where the two differ; this
doc keeps the direction, the reasons and the recipes.

This doc covers what the chart looks like and how to build it procedurally. The visuals express
meaning; they never define it ([02](02-domain-rules.md)).

## 1. Direction
*Applies to: both views.*

- **Mood:** an optimistic, painterly space-age expedition, lit with vivid color and showing a sense
  of scale.
- **Point of view:** the user is an **omniscient observer** looking into a living painting, with
  precise **mission-control annotations** laid over it.
- **What to avoid:** no cockpit, no windshield frame, no first-person view. Following a captain moves
  the observer's camera; it doesn't put the user in the ship.
- **Reference shelf** (descriptive only; never copy compositions or designs):
  - Robert McCall: sweeping scale, and a hopeful human future.
  - John Berkey: large, luminous ships and painterly star fields.
  - Syd Mead: forms that look engineered.
- **Layer rule:** from back to front, the stack is
  1. the painted universe (dominant),
  2. a thin chart layer of orbit lines, routes, and reticles,
  3. legible annotation (DOM text, plus plates and leader lines),
  4. selective motion (accents).

  Never flood the painting with opaque consoles.

- **Line hierarchy.** Each kind of line has one role and a fixed rank in contrast; 1 is the
  strongest. Nothing may outrank the selection reticle. "Status" records where the line stands
  after the 2026-10-01 review; "open" rows are candidates still being considered.

  | Rank | Line | Use | Current style | Status and notes |
  |---|---|---|---|---|
  | 1 | Selection reticle | The selected object | Ivory, about 1.5 px, 95% | Settled. The ceiling for line contrast; ivory, so gold means only accomplished. |
  | 2 | PR route, open PR | PR → linked Task or Story/Bug, and PR → repository station | Progress-blue soft band: about 12 px of glow with a brighter core, in screen pixels, on a gentle arc, with blue cargo motes flowing to the station | Settled (signal ladder: motion marks work underway). |
  | 2 | PR route, completed PR | PR → its station only; links to the work are dropped | A fainter gold band, still | Settled. Gold means accomplished; done work is calmer than open work, so no motes. |
  | 2 | PR route, uncertain or Task → parent continuation | Uncertain links; a Task's link up to its Story/Bug | The same blue band, dashed (12 px) and fainter | Settled. A continuation is dropped once only completed PRs run through its Task. |
  | 3 | Orbit lines | Children's rings around the parent | Cyan in screen pixels at every zoom: front halves a 1.3 px line at 45% over a soft 5 px glow at 6%; back halves 1 px at 5%. Drawn in the crisp guide layer under the bodies, never inside the paint pass (which smeared them away) | Settled: low priority, but visible in the front arc. |
  | 3 | Orbit tick marks | Scale marks on large rings | Same as orbits | Minor. Could go, if the rings read as cleaner without them. |
  | 3 | Frontier belt (Solar) | Where unassigned work drifts (§9), only while some is there (19 S2) | Cyan: a 3% fill between two ellipses, dashed 1 px edges at 22%, in the guide layer; fades in and out over 600 ms, snaps on a seek | Settled (2026-10-12; shown only when needed and never red, 19 S2). Chart furniture, never a rung colour. (The threat light, a red glow on its edge, retired in 19 S2.) |
  | 4 | Review reticles | Feature, Story, or Bug in a review state | Removed | Done (signal ladder): Ready for Review is on the Ready rung, shown by the body itself. |
  | 4 | Acceptance halo / verification ring / white dwarf rim | Feature in acceptance; Bug fix verified; Feature closed | Removed | Done (signal ladder): nearing and accomplished are carried by the body's corona, halo, and form. |
  | 4 | New Task pin outline | `task.unstarted` pins | Steel grey outline | Done. A Ready-rung sketch: quiet by design. |
  | 4 | Dashed ghost outlines | Removed or historical items | Ivory dashes, 1.5 px at 50–55% | Open, probably fine. Sits just above the routes. |
  | 4 | Drafting grid | `feature.draft` | Removed | Done (signal ladder): Draft is a muted Ready star. |
  | 4 | Closed Story ring | `story.lush` | Removed | Done. City lights and clouds alone say "done". |
  | 5 | Vessel badges | Completed check, abandoned cross, in-flight chevrons | Ivory or cyan strokes | Minor. |
  | 5 | Station docking port | Where vessels berth | Small cyan ring at 90% | Minor. Small but very bright. |
  | DOM | Label accent edge and hairline | The edge facing the object; the plate outline | Cyan 30% (ivory when selected); ivory hairline at 10% | Settled. |
  | Transient | Transition wipe | The grid sweep during a scene change | Cyan grid, brief | Fine: it's on screen for a moment only. |

  **Source:** `chart/ChartApp.ts` (`drawReticle`, the wipe), `chart/scenes/GraphScene.ts` (orbits,
  routes), `chart/scenes/solarGuides.ts` (the belt), `styles.css` (label edges) ·
  **Update when:** a line's style or rank changes, or a new kind of line is drawn.

## 2. Palette and type
*Applies to: both views.*

**Every colour value is in [15 §2, Palette](15-reference.md#2-palette)** (UI tokens, chart colours by
name, the hostile and fleet colourways, avatar colours, and the rules). This section keeps what each
family is for and why (hex table moved to 15 on 2026-10-13).

| Family | What it's for | Why |
|---|---|---|
| Ink, cobalt and violet | Space, and the depth tones of the skies | A deep ink-navy keeps the painting dark, so the few lit things read |
| Ivory | Titles, body text, people's names, the selection reticle and the selected label edge | Amber read too close to Accomplished gold; identity comes from the avatar circle, not the name's hue |
| Amber (UI chrome) | Brand, panel heads, glyphs, the picked item, v0 star titles | A different gold from the ladder's, and never a rung |
| Cyan | Routes in v0, the timeline, the followed ship's aura, guides, sensor contact, the default effect colour | Off the ladder, so it never reads as a state |
| Plate navy | The standard label plate, at every scale | One surface, so every label text colour can be checked once |
| Coral | Alerts only (sync errors, failed jobs); UI chrome, never a chart object | Red belongs to threats and alerts, never to work or people |
| Hostile palette (Solar) | Threats only: reds and their neighbours with black, charcoal and obsidian (§9) | Good guys and bad guys are told apart at a glance |
| Role outlines (Solar, 2026-10-12) | A piece's outline: Opportunity Blue (objectives), Deadly Red (threats) while open, Victory gold once done (`AURA`, `art/aura.ts`) | Says what an object is for before what state it's in |
| Hero energy (Solar, 2026-10-13) | Everything a hero craft emits, in one blue family (§9) | Good guys shoot blue; it brightens toward pale blue, never white |
| Enemy fire (Solar, 2026-10-13) | Danger Red, which only threats fire | Bad guys shoot red |
| Holo plates (Solar, 2026-10-12; every label 2026-10-13) | Every chart label in Solar, in four tiers of one cyan family (`--holo-*`, §9; 15 §6 `holo-tiers`); a piece's frame in its role's hue (22 A6) | A star-map look; louder for the actors, quieter for places, quietest for stars; a piece's label says what it names by colour too |
| Avatar colours | Initials on a captain's circle when there's no picture (below) | Twelve deep hues, none a ladder hue, no true red |

**Source:** `styles.css` and `chart/holo/holo.css` `:root`; `chart/art/{progress,energy,aura,swarm,fleet}.ts`;
`@shared/scene/avatar.ts` · **Update when:** a colour family takes a new job; change the value in 15
and the code together.

- **State: the signal ladder** ([09](09-signal-ladder.md), code in `art/progress.ts`). Every
  object with a state climbs four rungs (Ready, Underway, Nearing, Accomplished), each with one
  colour, ornament level, contrast rank and kind of motion. The rung table, colours and tempos are in
  [15 §3, Signal ladder](15-reference.md#3-signal-ladder); the reasons are in 09 §1–§2.

- **Hue is never the only signal** (INV-20). Every stage in §6 also has a distinct shape, texture, or
  badge.
- **Contrast: strict for text, balanced for everything else.**
  - *Text* must meet WCAG AA (4.5:1) against whatever it sits on, without exception: label text
    against its plate, panel text, and HUD text. This is what keeps the chart readable.
  - *Visual elements* may favor aesthetic balance over a contrast ratio: object colors, planets, the
    sky, and a label plate against the sky. Judge these by eye at every scale, and use shape, edges,
    and hairlines to separate them where color is close.
- Labels sit on one backing plate colour at every scale (`--plate`, nearly opaque), with a faint
  ivory hairline and the accent edge facing the object. Every label text colour (ivory titles,
  dimmed subtitles, ivory names, cyan v0 station titles, amber v0 star titles) is 7.5:1 or more on
  it. The plate is a little lighter than the dark skies and a little darker than the brightest
  nebula, which is a balance, not a ratio target. Solar's holo plates have their own glass (§9). The
  targets and measured ratios are in [15 §6, Contrast rules](15-reference.md#6-labels-and-type).
- **Type:** Inter for names, titles, the inspector, the timeline and every holo plate; IBM Plex Mono
  for subtitles, panel heads, chips and coordinates; Caveat only for the cosmos quote (§3). All
  three are bundled through `@fontsource` (OFL). (Superseded 2026-10-13: "Inter, or IBM Plex Sans";
  Plex Sans was never used.) Families and sizes: [15 §6](15-reference.md#6-labels-and-type).
- Titles, IDs, states, and dates are always **live DOM text** and never painted into textures.

### Dynamic labels (slice 3a, decided 2026-10-03; three modes, revised 2026-10-04)
During playback the effects carry state, so labels step back. There are three modes:

| Mode | Shows | When |
|---|---|---|
| **Full** | Title, subtitle, person | Stopped, once things have settled |
| **Compact** | The title only, a size smaller | While playing, or while the object moves |
| **Minimal** | Only the captain's picture | Ships, while playing or moving |

In code the modes are tiers, named once (19 Q5, renamed 2026-10-13): `full`, `title` and `picture`,
and Solar adds a fourth, **`expanded`**: a pointed-at or selected v1 object's holo plate grows its
rows in place (§9). One rule, `tierFor` in `chart/labelTiers.ts`, picks the tier each frame; v0 nodes
never go past `full`. The tier table and its timings are in [15 §6](15-reference.md#6-labels-and-type).

- **Compact while playing** covers everything, **selected and card-lit objects included**; the
  reticle and the highlight mark them. The Story's radar tally stays, since it's the summary.
- **The one exception** is what the pointer is over on the chart: it opens fully, so it can be read.
  It never applies to the followed ship.
- **A scene change clears the pointer's hover**, because the old scene's hit areas are gone. That
  way a star you double-clicked into doesn't keep a stale full label.
- **Moving objects** stay compact until they've been still for `SETTLE_MS`; the whole chart
  returns to full labels the same time after playback stops (paused, nothing counts as moving).
- **Ships collapse to their captain's picture**, an avatar circle hugging the top of the ship, so a
  moving ship never drags a label around the screen. (In Solar the picture is a small square with the
  holo plate's cut corners and frame line, §9, 19 L8.)
- **Flashes (v0 views):** a Task that appears or changes band shows its title for `FLASH_MS`, then fades:
  you learn what it is without a permanent label. Flashes are placed first and may cross dots, never
  another label.

### History cards (decided 2026-10-04)
- **Where:** the side panel's top box has two tabs, **In view** (the object list) and **History**.
  - It opens on In view.
  - **Play** switches to History.
  - **Reaching the end** returns to the user's last manual pick; **pausing** leaves the tab as it
    is.
  - **E** and the tabs are manual picks.
- **What a card says** (revised 2026-10-15, 22 B4–B5): one card per beat, listing its events, the
  headline first, up to `HISTORY_ROWS` (4), then "+N more". Each event is one row in the one event
  wording, `Entity type · ID · Title — Action · by Person` (the parts that don't apply left out), and
  under Solar, beneath it in the quieter `.metaphor` style, what the chart shows for it in the theme's
  words. Examples: "User Story · #201 · Show quote history… — Active → Resolved · by Rafe Okoro" over
  "the asteroid is nearly mined out"; "PR · #9001 · Quote history endpoint — Merged · by Rafe Okoro"
  over "the tender shuttle delivers"; "User Story · #202 · Export ledger… — Assigned to Ava Lindqvist ·
  by Jo Marchetti" over "Ava Lindqvist's captain takes the asteroid". The action is always the source's
  change, said plainly (assigned, a state change, created, moved, a PR opened or merged); the chart's
  line supplements it.
  - With no recorded actor, the row has no "by".
  - **Now** (22 B5, B6): while playing, the rows whose events the chart is playing carry a cyan rule
    at their start; they are the events whose notes the plates wear, so either surface explains the
    same event.
- **Order (revised 2026-10-04):** newest on top. A new card slips in at the top, highlighted, and
  older ones are pushed down, so the eye stays in one place while watching. Below the "Next" label,
  above the present card, sit the **next three beats** still to come, dimmed (opacity 0.45, a dashed
  border on hover) and clickable to seek (decided 2026-10-09; the list is newest-first, so the future
  is above the present). Further ahead shows on the player's ruler. The list keeps the present card
  at the top of the view for each new card (with the Next group just above it), unless the pointer
  is reading it.
- **What a card shows:** a small icon of its object on the chart (● planet, ✶ anomaly, ✦ star,
  ▸ flight, · Task), in the rung's color, with a tooltip naming both, like "Planet · User Story".
- **What a card does:**
  - Clicking a card seeks to its beat (no accents).
  - Hovering one lights its object on the chart. The object is highlighted but keeps its compact
    label. The playing card lights nothing of its own (22 B5): the plates' notes mark what plays, and
    an extra light would be a third object asking for attention (22 B7).
- **The inspector:** below the tabs. It leaves out the canonical and projection keys, which show
  only in map debug (D).

### Label lines

Callouts have up to three lines:
1. the title, capped at the longest possible subtitle (`TITLE_MAX_CHARS`, from "Pull Request #12345678 · Ready
   for Review"; the full title is in the tooltip and the inspector);
2. `{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3);
3. the person, in ivory after a ◆: the assignee for work items, the author for PRs. It's left out when
   unassigned, and repositories have none.

**Avatar circle.** Any label can lead with a circle at its left, inside the plate and as tall as
its text lines (`ViewNode.avatar`; a circle on navy plates and in the panels; on Solar's holo plates
it is a square, §9, 19 L8). Captain labels use it for the engineer's ADO avatar:
- **Picture:** the image they uploaded, cropped to the circle (or the square) from its centre. It reaches the renderer only as an
  inline `data:image` URL, because the renderer never fetches from ADO (INV-17).
- **Initials:** with no picture, or if it fails to load, the first letters of the first and last
  names in ivory, on a color chosen by the initials alone (`src/shared/scene/avatar.ts`). The same
  initials always get the same color; different initials spread across 12 deep hues
  ([15 §2, Avatar colours](15-reference.md#2-palette); no true red: that colour is for real alerts,
  so crimson and raspberry were dropped on 2026-10-09). None is a ladder hue, and each holds ivory
  text at AA or better (`tests/unit/avatar.test.ts`).
- **Hand-added pictures (slice 6, archived 91):** when ADO won't serve someone's picture, the captain's
  Inspector card offers **Add picture…** (**Change** / **Remove** once you have). The file is cut to a
  128 px square and kept under userData; it wins over ADO's picture and over initials.
- **Drop on a ship (23 E8):** a picture file dropped on a captain's ship sets their picture (a cyan dashed ring on the chart while a file is over it); a refusal shows as a one-line notice above the bottom bar, fading after 6 s.
- **Fixtures:** pictures are invented illustrations, never real photos.

**Accent edge.** A callout's accent line sits on the edge facing its object, not always on top: a
label left of its object has the line on its right edge, a label below has it on top. It's cyan at
rest, bright cyan on hover, and ivory when selected. This makes
the label-to-object relationship readable where labels crowd. If it isn't enough, a small notch
pointing at the object is the next step.

Assignment beacons are disabled, and ship call signs aren't labelled; the name on each item's label
carries that information. PR vessels ride the lane in slots spread across the station row's width,
with labels alternating below and above. With a lane, completed vessels slot above their own
station instead of berthing.

### Relative scale: the label is the unit

Every size is judged against the callout label, which has a fixed screen size (`LABEL_PX`, the
nominal label height; superseded 2026-10-13: "about 35–40 px tall"). The floors, targets and Solar
geometry are in [15 §5, Sizes, floors and layout](15-reference.md#5-sizes-floors-and-layout).
- **Celestial bodies** (stars, planets, anomalies; in Solar, worlds and asteroids) scale with the
  world and have no screen floor. In the v0 views a Feature star is r 240, planets r about 120, and
  the close-up body r 400 (`@shared/scene/layout.ts`).
- **Mechanical objects** (captain ships, PR cargo vessels, stations, mission points; in Solar, hive
  ships and stations) have a **minimum on-screen size tied to label height**
  (`FLOOR_PX` in `src/shared/scene/sizing.ts`): a ship is at least about 1.2 labels long, a vessel
  about 1.1, a v0 station about 1.8, a station twice a ship. Like labels, they stay legible at any
  density. Radar Task dots in the close-up (§3) are about half a label across, and Accomplished ones
  about 0.4: the tally summarizes them, and only Underway ones carry a label (slice 3a).
- **Attached objects are placed in screen terms.** Ships beside their assignment and docked vessels
  at their station try a ring of directions, starting from the preferred one. In-flight vessels
  slide along, then off, their route. Each takes the first spot that collides with nothing.
- **Three-dimensional hulls.** Ships, stations, and PR vessels are modelled as real 3D solids
  (`art/hull3d.ts`: lofts, lathes, plates, tubes, rings) and painted face by face in gouache value
  planes under the key light (upper left). All share one **heroic three-quarter view**: yawed 32° so
  the bow comes toward the viewer, seen 27° from above, with a mild perspective. That's enough to
  show the full breadth of a hull, but never so much that a ship seems to fly at the viewer.
  - Anything that moves has an **east and a west render**, each lit correctly (a mirror would move
    the light), so it always points the way it travels (`face(dir)`).
  - Renders are baked once per design into a shared `GraphicsContext`; per-frame cost is static
    geometry. Lit windows shimmer out of phase; pins keep their 2D lit drawing.
- **Zoom range is relative to each scene's fit** (0.35× to 6×), so zoom-through thresholds are
  always reachable.
- **Fit:** edge labels reserve about half a plate of width; labels that don't fit fall back or
  hide.
- **Density harness** (`tests/e2e/density.spec.ts`): it screenshots the sparse system (Feature 112)
  and the dense one (Feature 111: 20 Stories/Bugs, and Story 251 with 20 Tasks and 5 PRs to 5
  repos). It writes `test-results/density-report.md` with sizes in label units, hidden and clipped
  labels, and viewport fill. Collisions, label overlaps, off-screen objects, and undersized
  mechanical objects fail the test; aesthetics are judged from the screenshots.

### Learnability (mapping the metaphor to ADO)

The metaphor has two layers, and the UI explains both:
- **What an object is** (22 B3). Every object shows one identity line, wherever it is shown: its
  ADO type, its ID and its status ("User Story · #201 · Resolved", "Pull Request · #9001 · active",
  "Repository"), then the chart's name for it, quieter ("· asteroid"). Plates, a homeworld's or a
  station's rows, the inspector's item lists and the inspector itself (under the title) all read it.
  A captain's and a homeworld's plate is a name at rest; its chart name shows when it is pointed at or
  selected. Each breadcrumb level names its type: Project, Area Path, Epic, Feature, User Story, or
  Bug. The object list is grouped by ADO type with counts, each head followed by the chart's word.
- **What its look means.** The **map key** (K, or the Key button) lists every object's Star Chart
  name next to its ADO name, then the *looks present in the current view* with their ADO meaning.
  For example, "Developed world, clouds clearing" means User Story · Resolved (In Progress). The ADO
  side comes from `config/state-mapping.json` at runtime, so the key can't drift from the real
  mapping. The key also explains the line styles. For a selected work item, the inspector adds
  "On the chart: …".
- **Under Solar** (19 P2, R3) the key names only what Solar draws, in Solar's meanings, so it reads
  the same in the round as inside a region: Project = Galaxy, Area Path = Star, Assigned person =
  Captain (and Homeworld, the planet), User Story = Asteroid, Bug = Enemy ship, Repository = Station
  (22 B2), and one sector row, Sprint = Sprint sector. No Feature, Planet or Supply station rows. A star's look
  reads its pod's work as a whole ("Area Path · three quarters of its work resolved or done"), not a
  Feature's state, and its lines are Solar's: the orbit arc, the frontier belt and a reassignment's
  route. The object list and the inspector use the same words; a person, pressed as their homeworld
  or their captain, reads `Assigned person · captain and homeworld`. Values: [15 §4](15-reference.md#4-roles-kinds-and-assets), *Solar's key*.
- **One vocabulary, two layers** (22 B1, R12; it replaces the Names toggle, removed 2026-10-15). The
  ADO name leads, in the surface's normal text; the chart's name follows it, quieter: in the panels the
  `.metaphor` style (`--cyan-70`, AA), on a plate the subtitle's own colour in italics. Every surface
  reads the same way: the inspector, the object list, History, the trays, the key (its ADO column
  first) and the plates. A star's count line leads with ADO's words (`12 User Stories · 4 Bugs`, then
  `· star`). Buttons name ADO's things ("Open Area Path ›"). There is no switch between the layers.

All vocabulary lives in `src/renderer/src/vocab.ts`.

## 3. Scales, composition, camera
*Applies to: both views.*

| Level | Backlog (v0) | Sprints (v0) | Solar | Layout | Transition in (and back) |
|---|---|---|---|---|---|
| Galaxy | A project | A project | A workspace project | `galaxy`: a grid, at most `GALAXY_MAX_COLUMNS` (8) a row | 700 ms (the default) |
| Sector | An Area Path's or an Epic's Features as stars | A sprint's pods as stars | The round: a sprint's regions, each star with a preview of its region below it (its seats' planets, an asteroid cluster and hive marks by count; 13 §2, 19 P1); it doesn't play | `field`: balanced rows of at most 4 | 600 ms |
| System | A Feature's Stories and Bugs on rings | A pod's Stories and Bugs on people's rings (the board) | The region: one solar system, the **bottom level**, and the only one that plays (§9) | `system`; Solar: `solar` | 750 ms |
| Close-up | A Story or Bug with its Task radar | The same | None | `radar` | 750 ms |

| Camera rule | Value |
|---|---|
| Zoom range | 0.35× to 6× of each scene's fit (held above the 32 px target floor) |
| Enter by zooming | past 3.5× the fit (`ZOOM_IN_THROUGH`), on the enterable node within 16% of the short side of centre |
| Back by zooming | below 0.5× the fit (`ZOOM_OUT_THROUGH`), or at the zoom floor |
| Momentum guard | 550 ms after a transition (`WHEEL_COOLDOWN_MS`) |
| Press becomes a pan | past 4 px (`DRAG_PX`) |
| Hit targets | at least 32 px across; 44 px for what leads somewhere at a page's opening scale (15 §5) |
| Reduced motion | a 150 ms crossfade, no zoom (`REDUCED_TRANSITION_MS`) |
| Camera hold after a click | 1500 ms (`CAMERA_HOLD_AFTER_MS`) |

**Source:** `@shared/hierarchy/{backlog,sprints,solar}.ts` (levels, `durationMs`),
`chart/ChartApp.ts` (zoom and drag constants), `@shared/scene/project/{galaxy,field}.ts` ·
**Update when:** a level is added or re-chained, or a camera constant changes (and its row in
[15 §9–§10](15-reference.md#10-timing-and-budgets)).

Galaxy, sector, Feature system, and body are **four separately authored scales**, each its own scene
(`SceneKey` in [03 §5](03-contracts.md#5-snapshot-and-view-model)). They are not one continuous coordinate space.
Since 2026-10-07 the three under the galaxy are **layouts** (field, system, radar) that a hierarchy
chains together, each fed by its own source ([03 §5a](03-contracts.md#5a-the-hierarchy-a-chain-of-scene-levels-decided-2026-10-07)).
The table below is the Backlog chain. v1's Solar chain (sprint → pod as a solar system, with no close-up) is in §9. The Sprints chain uses the same layouts for sprint, pod and story:
- **A sprint's field:** its pods as stars, in saved order. A one-pod sprint passes straight through to its pod.
- **A pod's star:** its share of the sprint on the ladder (02 INV-05, Pods). Its label line reads "Area Path · N items · M done".
- **A pod's system:** the Stories and Bugs it took into the sprint, in first-join order. Each label line ends with its Feature. A carry-over leaves, and a mid-sprint addition arrives.
- **The close-up** is the Backlog's.
- **The title bar's Sprints | Backlog switch** picks the chain. It's remembered, and switching returns to the galaxy. Under Solar the switch is hidden; the v0 views are reached through Settings → Theme's developer toggle, or a `STAR_CHART_PARADIGM` pin (§9).
- **The galaxy's Inspector**, in Sprints, lists the project's sprints (the current one marked) and its pods (saved Area Paths). Epics are hidden.

| Scene | Composition | Interactions |
|---|---|---|
| **Galaxy** | One procedural spiral galaxy per pinned project (all projects when none are pinned), tilted to match the oblique chart. **A grid (decided 2026-10-07):** pinned first, then A–Z, in full rows of at most 8 with the last row centred; rows grow downward without limit, so a large org (188 projects) is a tall page that **scrolls**. Every galaxy is the same size (INV-19). **Quiet** projects (nothing saved, nothing this range) are drawn dimmer, with a dimmer name. Labels are **compact** (the name only), close under the core; pointing or selecting opens the full plate ("saved areas · events this week", or "not charted yet" in ADO mode before any sync) | A click selects the project; the inspector becomes the sector chooser: **◇ Saved Area Paths** first, then **⬡ Epics**. In ADO mode, entering a project with nothing saved opens its **area picker**; picking a team saves and opens it |
| **Sector** | A field of **small orreries**, one per member Feature (≤15), each a miniature of its own Feature formation. **Balanced, centered rows** of at most 4, larger rows first (5 → 3 + 2, 6 → 3 + 3, 7 → 4 + 3, 9 → 3 + 3 + 3). Every row is centered on the same axis, so the field is symmetric. Slots follow reading order by first membership. Labels sit above each star so the miniature shows below | A click selects a star, and entering opens its Feature. Mini planets are decorative (not selectable). The same Feature can appear in the Area sector and in the Epic sector (INV-09) |
| **Feature system** | An **oblique orrery view**: the camera looks down about 30° onto the orbital plane, so orbits are ellipses half as tall as they are wide. A large radiant star sits at the back. Story planets and Bug anomalies are *cheated* onto the front arcs of their orbits, alternating sides, so all of them are visible at once and none sits behind the star. Bodies are roughly equal in size, with at most +15% for the nearest as a depth cue. Each orbit's back half draws behind the star and its front half in front of it. Bodies draw back to front by projected y and are lit from the star behind them. **One spatial grammar at every scale:** parent on top, children in the middle, resources at the bottom. The galaxy, sector, Feature system, and close-up all read top to bottom the same way, so a zoom never sends the eye looking for things.
- **Ring formation** (`featureFormation`): **two children per ring**, as a mirrored pair. Each ring is wider and further forward than the one inside it, so *ring count ≈ child count* at every zoom, including the sector's mini systems. An odd child sits at front-center of the outermost ring. Beyond 4 rings, rings take 3+ instead of adding more.
- **Labels point outward**: left bodies label left, right bodies label right, and a centered body labels below. The parent's label goes above it.
- **Tasks sit on the radar in the close-up** (below). In the system view they appear as a small cluster under each body.
- **Repo stations** form a row at the bottom of *both* the system and the close-up, ordered by the barycenter of their linked work, which minimizes crossings.
- **PR lane.** In-flight PR vessels sit in a horizontal band between the lowest child and the
  station row, at the point where their route crosses the band, and spread sideways within it when
  crowded. They never sit among the planets (or Tasks). Completed vessels berth at their station.
  The visual hierarchy, top to bottom, is: parent → children → PRs in transit → repositories.
- Captain ships sit on the inner side of their item, away from its label.
- The camera fit counts labels at their screen size (iterated to a fixed point), so outward labels never leave the view.
- All counts are of children ever linked, so nothing moves during replay. | A click on a planet or anomaly zooms in. A click on a station, flight, or captain opens the inspector |
| **Body close-up** | The planet or anomaly sits top center, lit from the upper left, inside the **Task radar** (below). Stations stand in a row at the bottom; PR flights fly between them and their Task or body. Task-to-body continuations are dashed. Assignee ships (with call signs) and beacons sit beside their items | Select a Task, PR, captain, or station. **Open in Azure DevOps** lives in the inspector |

**The empty cosmos (decided 2026-10-07).** Before any project is chosen (a first launch opens ADO
mode here; the demo fixtures are one quiet link away), the galaxy is a lonely black hole
(`art/blackhole.ts`, in the gallery): a true-black horizon, a fine photon ring, the accretion disc
crossing in front with its far side lensed over the top, swirls of light and dark woven through it.
Below it, a plate: **Building Your Cosmos**, a link **Select your Azure DevOps projects**, and the
step at hand: **Connect to Azure DevOps**; then **your most recent projects** (from your own recent
work: 04 §3) with **Add these 10**, **Choose others**, or **show all projects**. Below that, a quote
about the universe turns every 14 s (`config/cosmos-quotes.txt`, one per line, editable), in a
handwritten script (Caveat) at an opacity that stays AA (4.5:1) on the brightest nebula: mood, not
information.

**The empty project (decided 2026-10-07).** Entering a project with nothing saved opens a plate over
the veiled galaxy: **Charting ‹Project›**, its Area Paths A–Z with a filter, each a checkbox that saves
at once, and **Chart ‹team›** / **Chart these N teams**, enabled once one is saved (it opens the first).
Esc keeps the choices.

**Controls (decided 2026-10-07).** **+ / − / ↑** buttons sit at the top right of the space view
(↑ goes up a level; hidden in the galaxy).

**Request activity (decided 2026-10-07).** What's loading is always visible:
- **At the control:** an async control says what it waits on, in place ("Loading teams…" with a small
  spinner on the team switcher's ▾; the chooser, the Area Path plate, Epic search, Connect, Check
  access, the project list, Add these 10).
- **In the status bar:** an abacus of chips, one per kind of work ("Reading history ●●●○"), a
  bead per call: chips arrive as work starts, show their phrase once it's been running ~0.8 s, turn
  amber with a countdown while ADO throttles, and leave with a ✓; a failure turns coral and stays.
  Chips beyond ~40% of the bar go behind "+N".
- **The Requests panel** (the button at the bottom right, or any chip) overlays the side panel:
  calls in progress (and Cancel for a sync), errors with their Details and Response, and the last 50
  results. Quiet skips (an unreadable PR) appear as results, never as sticky errors.
Buttons show a **tooltip** after 600 ms of hover or focus: a short phrase, and its keys and mouse
actions beneath. Checkboxes take the control look (amber when checked). In the galaxy, In view
offers **Not finding a project? Add more projects**, opening the project list. A selected galaxy
shows its full label (settled 2026-10-07). Any failed network call can expand to **Details** (status,
what it means, the request, ADO's code and message, attempts, throttling) and, inside, the literal
**Response**.

**Activation: select first, then enter.**
- **Select:** a single click selects any node and fills the inspector. Selecting never changes the
  scene.
- **Enter:** any of these opens the node's scene (galaxy → sector → Feature system → close-up):
  - a double-click on it;
  - Enter while it's selected (on the canvas, or on its already-selected row in the object list);
  - its inspector button (**Enter star system ›** / **Close approach ›**);
  - pinch (or ⌘/Ctrl-scroll, or +) past about **3.5×** the fitted scale (high enough to explore a
    dense scene zoomed in first). The entered node is the enterable
    one nearest the view center (within 16% of the short side), or else the one under the cursor.
- **Galaxies** open the sector last used in that project, else the first saved Area Path, else the
  first Epic. The inspector's chooser picks any other sector.
- **One-Feature sectors pass through (decided 2026-10-03):** a sector that only ever holds one
  Feature in the loaded history opens straight into that Feature system. A lone star gives no hint
  that it can be entered. The count covers the whole history, never the playhead, so it never
  flips during playback. If that Feature doesn't exist yet at the playhead, the sector opens as
  usual. The **team switcher** (below) stays in the breadcrumb, so another team is always one click
  away. Back from the Feature goes to the galaxy with the project's chooser open. The galaxy is never
  skipped.
  No other level is skipped: a Feature with one Story still adds its star, stations, and lane, and
  a close-up adds the radar and the body's own PRs.
- **Back:** pinching out past about **0.5×** the fitted scale (or at the zoom floor) goes up one
  level, as do Esc and ‹ Back. Breadcrumbs jump to any level.
- **Momentum guard:** zoom input is ignored during a transition and for 550 ms after it, so
  trackpad momentum can't tunnel through two levels. Scrolling is never locked out.
- **The wheel zooms (decided 2026-10-07; revising "scroll pans" from earlier the same day).** A
  mouse wheel, a trackpad's two-finger scroll, a pinch, or **+ / −** zooms (and zooms through);
  **0** returns to the opening view. **Scrollbars** (10 px, draggable, a track click pages by a
  view) appear only on an axis the scene can't fit even zoomed all the way out: today, only the
  galaxy of a large org. Press-and-drag pans from anywhere, objects and labels included: a press that moves more than
  **4 px** is a pan, never a click. The user's pans and zooms keep the view's centre on the scene, so
  at most half a view of empty space shows past any edge.
- **Labels are buttons (decided 2026-10-07).** A selectable object's label acts as the object: a
  click selects, a double-click enters, and a drag pans. Hovering a label lights its object. Labels
  stay `aria-hidden` (In view is the accessible equivalent).
- **Minimum targets (decided 2026-10-07, after Apple's HIG).** Every hit target is at least **32 px**
  across (radar Tasks 24 px; they're summarized and listed). The zoom never goes out so far that what
  leads somewhere is under 32 px. **Scroll over shrink:** a scene that can't show whole at that size
  (today, only the galaxy) opens as a **page**, at its top, sized so what leads somewhere is at least
  **44 px** across (touch size), with a thin **scroll rail** at the right edge of the view.
- **In view rows (decided 2026-10-07):** a click selects and brings the object into view (centring
  it, and zooming in gently to touch size when it's smaller); arrow keys do the same as they move; a
  double-click enters. Over 20 rows, a **filter** field matches names (and work item IDs). In the
  galaxy, the title-bar search finds projects.
- **Search** by ID or title lands directly on the target's scene.
- **Breadcrumb sibling menus.** Every level's ▾ opens a menu of its siblings: other projects,
  other Features in the sector, or other Stories and Bugs in the Feature. Clicking the current level
  opens its menu, and clicking an earlier level's name goes back to it. Picking a sibling moves
  sideways and keeps the levels above. Arrow keys move through the menu, and Esc closes it without
  navigating.
- **Adding to the loaded set: the + crumb (decided 2026-10-08).** The sets you choose are the
  pinned projects and the saved Area Paths. Their scene ends the breadcrumb with a faint dashed
  "+ Project" (the galaxy) or "+ Area Path" (a scope's scene: a sprint's pods, a Backlog team).
  - **The picker** opens beneath it: search first, with the whole list or tree below, and a check on
    what's already in.
  - **Adding applies in place.** A pinned project's galaxy Arrives. A sprint gains the pod as a star,
    which Arrives and is brought into view, and its work streams in. A Backlog team opens sideways.
  - **Removing** is in the ▾ menu: "All projects ▾" lists the pinned projects, and the sprint's ▾
    lists its pods, each with a check. Choosing one removes it, and it Departs. The menu ends with
    "+ Add…".
  - **Where the object is (19 N1, R2, built 2026-10-13).** Visibility never requires entering
    anything, so the same removal and adding sit in the Inspector too:
    - A selected **galaxy** has **Remove from View**, which unpins its project. On the last project in
      view it's disabled, with its reason: the last one stays, since an empty galaxy is the onboarding
      cosmos.
    - A selected **pod star in the round** has **Remove from View**, which unsaves its Area Path, as
      the ▾ uncheck does, so it leaves every sprint. Inside a region its star has none: the round is
      where pods are chosen.
    - The **round with nothing selected** has **+ Add an Area Path**, which opens the + crumb's picker
      above the button.
    - Either removal Departs in place, and the selection clears. Each says "Changes this view only.
      Nothing changes in Azure DevOps." (INV-21).
  - **Not deeper:** a pod's stories and a Feature's children are ADO's own data, not a set you choose.
  - **ADO mode only.** The Inspector's Area Path list stays, as a third way in.
- **The team switcher (decided 2026-10-04).** Most ADO teams work as Area Paths: separate pods with
  their own standups and work, running in parallel within one project. So the sector isn't a crumb;
  it's a **pill** after the project, labeled **TEAM** (or **EPIC**): "TEAM ◇ Comet Crew ▾". It's
  styled apart from the crumbs and never truncates; the place crumbs shorten first.
  - **The name** goes to the team's home: its sky, or its one Feature (pass-through teams).
  - **The ▾** switches team. It lists Saved Area Paths, then Epics. Switching opens the new team's
    sky (or its one Feature), and doesn't try to match depth, since the Features differ.
  - The last team is remembered per project. It reopens whenever you enter that galaxy.
  - The breadcrumb then reads as a place: project › [team] › Feature › Story.

**Camera.** Use quick chart-to-chart zooms with an **instrument-grid wipe**. Each level sets its own
length (`durationMs`, in the table at the top of this section): 600 ms into a sector, 750 ms into a
system or a close-up, and Back takes the length of the level it leaves. (Superseded 2026-10-13: the
500–700 ms and 650–850 ms ranges; the build uses fixed lengths.)

- `CameraController` handles:
  - position and scale on the `worldCamera` container
  - easing
  - `screenToWorld` and `worldToScreen`
  - zoom bounds for the mouse wheel and trackpad
  - dragging
  - focusing on a point
- **Interrupting** a move starts the new tween from the camera's *current* transform, so it never
  snaps.
- **Scene changes:**
  - The outgoing and incoming scene roots crossfade under the wipe, then the outgoing scene is
    destroyed.
  - The incoming scene's textures are generated *before* the transition starts.
- **Search:** jumping to a search result lands on the target scene with the correct breadcrumb. Only
  the last step animates. Where the + crumb applies, search also lists "Not in the chart" matches
  (projects, Area Paths), each with **+ Add** (decided 2026-10-08).
- **Back** restores the previous camera and selection.

### Loading by level (decided 2026-10-07; 04 §5a)
- **Loading energy** (`chart/fx/explore.ts`): while data loads, its object gathers energy by kind.
  It builds with the wait and with progress, flares out when the load succeeds, and fades on cancel
  or failure:
  - **Galaxy** (opening a team): flaming arms emerge and expand, spinning faster and breathing. The
    camera eases about 1.15× toward it.
  - **Star** (entering a Feature, or its history): the corona licks outward in swirling tongues,
    shedding embers, with a violet flicker at the tips.
  - **Planet** (a body's history): an aurora wreathes the poles, green at the base through blue and
    pink to purple.
  - **A team's history:** its stars glow faintly together.
  - **The black hole** (the empty cosmos): a gentle pull while connecting or finding your projects,
    then a storm while the cosmos fills. Particles appear at the rim and spiral in, accelerating,
    until the photon ring cracks. A ring tears outward as the galaxies arrive.
  - It builds more slowly and peaks lower (23 C10: base 0.3, 0.09 per second, peak 1.5; it was
    0.35, 0.14 and 1.8), values in [15 §8](15-reference.md#8-effects). With no progress 1.0 now comes
    at 7.8 s (4.6 s before) and the peak at 13.3 s (10.3 s before). Side effects: the success flare's
    peak is 2.3 (was 2.6, the peak plus its 0.8); a gentle load's progress term is 0.3 (was 0.35);
    the cosmos storm caps at 1.5 and reaches it in about 3.9 s (it capped at 1.8, in about 5.2 s).
  - Esc cancels a level load. Reduced motion holds a still frame at a steady glow. All of it is
    in the gallery's Loading energy section.
- **Unexplored Features:** their miniatures are dim dashed outlines, one per child (drawn crisp,
  outside the paint pass). The label's third line reads "N items · not yet explored", and so does
  In view.
- **One loading moment** from the click to the scene: a galaxy's double-click starts its energy
  while its saved areas are looked up, and it carries on through the team's load. It releases as the
  sector arrives. If the project has no saved area, the energy ends at the Area Path plate (a choice),
  and Chart starts the next. Any effect waits 250 ms before showing, so a quick lookup never flashes.
- **The status bar is one line (decided 2026-10-09).** It's as short as its content and sits flush to
  the window's bottom; a fourth grid row used to sit below it, empty, making the ribbon twice the
  height it needed. Left to right: the coverage chip (04 §6), "As of ‹playhead›", the keyboard hints,
  and the request indicator. The hints are the least of it, so they take only the space that's left,
  on one line, truncated with an ellipsis.
- **What couldn't be read (slice 7).** The coverage chip's panel lists each PR or repo a sync couldn't
  read: "PR 9501 · ‹last known title› · not allowed (403) · last known shown" (or "not on the chart"
  when it was never read). A PR drawn from its last known record wears the clock badge on its vessel,
  like a stale work item.
- **One request indicator (decided 2026-10-09).** It was two — a row of per-family chips at the left
  and a plain button at the right. Now it's the button alone, wearing what the chips showed: a bead
  per call in flight across every kind of work, the busiest kind named, a throttle wait said plainly
  ("Waiting 2.0 s", amber), and failures as a coral count. Clicking it still opens the request list.
  **Expected failures are quiet:** a picture is a visual nice-to-have, not data, so one that answers
  401 (a PAT that can't read them) or 404 (none we can see) is listed in the panel as an error, with its
  details and a note that it's expected, but doesn't mark the button or count toward it. Only those two
  statuses on a *picture* are quiet; the same statuses on any other call, and any other failure on a
  picture, still turn it coral.
- **The player opens at the end (decided 2026-10-08; 05 §2).** Every scene holds its schedule at the
  end, so the chart shows where that scope ended up. The play button is **↻** there, labelled "Play
  from the start", because pressing it rewinds to the beginning of that scene's story.
- **The loading plate (decided 2026-10-08):** opening a scope from the galaxy shows a plate over the
  galaxy, in the Connect panel's style. It names the project, says "Opening Sprint 41", and gives
  the step in plain words (a sprint's look is three steps), with a progress line and Cancel (Esc). It
  follows the galaxy and hides during transitions. Deeper in, a small banner under the player reads
  "Filling in · N of ~M reads" while a sprint streams (23 B6): N is the reads still queued or running, M the
  reads it is out of (the queue, what has finished, and items whose history waits for their scene). The player
  counts the scene's items ("Gathering history N / M"), the banner counts reads, so the two numbers differ by
  design and the banner says "reads". M starts as an estimate from the scope's member count (main knows the members after the first look)
  and keeps its `~`; once discovery is over (the closure found no new Stories or Bugs) M is exact: what has
  been queued, finished or not, and the `~` goes. M grows when the queue outruns the estimate, so N is never
  above M, and it never steps down within a run (main keeps its high-water mark; a new fill or refresh resets it). (`src/shared/streamCount.ts`; `scope.updated` carries `total` and `exact`.) The player reads "Gathering history N / M" until
  the scene's items all have history, then it's ready. If that stops short, it reads "History stopped"
  with Retry; a refused token shows "⚠ ADO refused your token" and *Enter a new token* in the player,
  and a notice with the same button under the mode chip (05 §2, 04 §6).
- **Starting… (23 B8).** Clicking *Load history* answers at once: the Request widget gives way to the Loading
  widget, which reads "Starting…" until the first progress event arrives (Cancel works throughout: one pressed
  before the job has an id is remembered and sent the moment it has), then "Loading N days of history… done/total". It is set in the renderer before any
  IPC returns, so no wait is silent; a start that fails clears it.
- **Partial history (23 B7; 05 §2).** A ready player whose scene is short of history says so in a line
  that **hangs under the bar**, in a fixed slot 4 px below the bar's full height, so the bar never reflows
  when it appears (R4) and the line does not jump when the bar fades. While the bar is faded (playing, idle)
  the line dims to 35% and Retry can't be pressed until the bar wakes. It reads
  "⚠ History partial · N missing · **Retry**" when N items'
  reads failed (a 5xx or a timeout), or "⚠ History partial · more on the next load" (no button) when the
  revisions feed stopped at its page cap (04 §5c). Items ADO refused (403/404) are not counted: they are
  kept as last known and marked stale, and asking again cannot help.
- **The top of the view, stacked (23 B9).** The player publishes where it ends as `--overlay-top` on the
  stage, measured by `OverlayStack` (observers on the stage, the player and the stack's children, and window resize, not every frame): its bar's full height, the partial-history line's slot, and
  its ⋯ pop while open. Under that, centred on the view (not the window) and no wider than the view less the
  zoom column on each side, one stack: the **error banner first, then the sync step or quiet "Filling in" line,
  then the follow bar**, never on top of each other. The stack's bottom is `--stack-bottom`: the map key starts
  below it, and the zoom buttons below `--overlay-top`. Checked by rects at 1280x800, 1024x640 and 1024x768
  (the window's minimum width is 1024, so a narrower size can't occur). **The trade (R4):** transient chrome
  (a banner, the partial-history line, the ⋯ pop) is not reserved space. The stack moves the map key and the banners
  below it, and a capped plate's top inset (`plateTopInset`) follows `--stack-bottom`, when it appears: nothing overlaps,
  at the cost of a small layout move. Changed in passing: while the plate
  over the galaxy is hidden mid-transition, the sync step no longer shows as a banner.
- **Sector order:** stars sit A–Z by title, in rows read left to right (02 INV-14, amended), and In
  view lists them in the same order.
- **Load more:** a beacon with a bold + in the sector's next slot, and "Load more…" at the end of
  In view. More than 15 Features make the sector a page.

### Systems as a board (decided 2026-10-09, slice 6)
A star system reads like the team's kanban board, without drawing a board:
- **Rows are people (revised 2026-10-09): one ring each.** Each ring is one person's lane, A–Z from
  the inner (top) ring outward, with Unassigned outermost. A busy person's ring is longer, never a
  second ring; nobody shares. The ring is drawn as a **swimlane**: one wide transparent band, no
  edge lines and no thin orbit line, and the bodies sit inside it. **A lane appears only for someone
  whose work is on screen at some point in the range** (decided 2026-10-09: on a real sprint, people
  who touched an item but never held one in the scene had empty lanes).
- **Columns are stages, or the team's board columns (B4, v1.3).** Without a team board, along a ring Ready sits at the
  left end, Underway left of centre, Nearing right of centre, and Accomplished at the right end. With one (the scope's team
  board, read from ADO, 04 §3 boards) the columns are the board's, in its order: each work item sits in its
  `System.BoardColumn`, and a **split column is two columns, Doing then Done** (chosen over one column with a mark: a mark can't show the
  move), under **one heading** with `Doing / Done` beneath it. Each column's name is a faint heading over the **first lane only** (the
  inner ring), neighbours a line apart so a long name doesn't run into the next; it is not repeated over every lane and takes no part in
  label avoidance, so a moving ship or body can pass over it (seen in `review/v1.3/B/B4-board.png`). Done compresses in
  an outgoing column. **Fallback:** work with no column (no team board, a refused call, an item never on a board, or a column the board
  no longer has) keeps the ladder placement, mapped onto the board's columns, monotonically: Ready to the first, Underway to the first
  In Progress, Nearing to the last In Progress but never left of Underway, Accomplished to the last (a two-slot board gives
  columns 0, 1, 1, 1). Columns narrower than the room their name needs are widened
  (`BOARD.minShare`, `minTotal`). Newest into a column sits at its left edge, so work visibly advances.
- **Lane heads.** Just above each lane's left end sit the person's avatar and **full name** (a dashed
  circle and "Unassigned" for the outer lane). Above, not level with the band, so the labels of the
  lane's left-hand bodies have room; labels go around them. A short tick across the outer ring marks each column boundary. The ticks and the lane heads are not
  labelled by the chart beyond that (the map key explains them); the column names above are the one addition (B4, only with a team board).
- **Done compresses.** Work accomplished more than two days ago (at the playhead) shrinks to 60%
  and packs tighter at the right end, the way a board collapses Closed.
- **Ships live on their home track** (decided 2026-10-09). Lanes are spaced so the gap between two
  bands holds a ship; each person's ship rests in the gap just above their own lane, under their
  latest work there, and moves along that track's curve as their work moves. It flies over only to
  work something outside its lane (a shuttle, a station, someone else's planet), takes it in the
  tractor beam, stays while that work is recent (6 source hours), then drifts home. Where a dense
  board leaves no room, the ship slides along its track to the nearest spot clear of every body.
- **Motion** (05 §5): a body that moves to a later column travels along its ring. While passing
  others it bows out to the neighbouring ring's path. With no room either side, it passes in front
  and the passed body dims briefly (an eclipse). A reassignment arcs to the new lane.
- **Considered and declined:** turning the whole system counter-clockwise with time to reclaim the
  left. It would move every body and label at once, fight the camera hold, and need switching off
  under Reduce Motion. Done compressing frees the space instead.

### The Task radar (slice 3a, decided 2026-10-03)
Tasks matter less one by one than as a migration from pending to active to done, so the close-up
shows them as a radar around the planet:
- **Three bands**, front arcs of about 240° (the gap sits behind the planet, so every dot stays
  visible), read like radar rings in their rung's color: **Ready outermost**, Underway in the middle,
  **Accomplished hugging the planet**. Churn (Tasks defined, redefined, removed) happens at the
  periphery; finished work settles inward and stays.
- **Spokes:** each Task keeps one angle for the whole history (its slot, INV-14), so a state change
  moves it only along its spoke. The eye never jumps sideways and dots never trade places.
- **Accretion:** a soft gold arc under the inner band thickens and brightens with the share of
  Tasks accomplished. It describes the Tasks; the planet's look is its own stage (INV-04).
- **Labels and tally:** Underway Tasks are labelled when there's room (earliest slots first);
  Ready and Accomplished ones label on hover or selection. The body's own label gains a tally line,
  "14 accomplished · 6 underway · 1 ready", each part in its rung's color (INV-20: words, not hue).
- Removed Tasks leave the radar (they dissolve, §5). Uncertain links (the retrospective lens) dash a
  short stretch of band around the Task.

## 4. Pixi structure
*Applies to: both views.*

`app.stage` children, from back to front (`ChartApp.layers`):

| Layer | Contents |
|---|---|
| `backdrop` | the nebula sky, the twinkling stars and the dawn sweep, screen space, with a shallow parallax; the empty cosmos's black hole |
| `outgoingScene` | a snapshot of the previous scene, only during a transition |
| `worldCamera` | the one `GraphScene`'s root (below) |
| `canvas` | the canvas tooth: a baked weave tile over the whole picture (09 §7) |
| `selectionOverlay` | the selection reticle and the map-debug drawing, screen space |
| `transitionOverlay` | the instrument-grid wipe, screen space |

Inside a scene's root, back to front: `orbitalGuides` (Solar guides, the back halves of orbits, the
radar's bands, routes, cargo motes) → `geography` (painted: stars, planets, anomalies; in Solar,
worlds and asteroids) → `marks` (stale badges) → `hardware` (crisp: `infrastructure` for stations,
Task pins and enemy ships and stations, then `traffic` for flights and ships) → `hardwareMarks` (a
station's satellites) → `localEffects` (accents and maneuver commands) → arrival and departure
streaks. The front halves of orbits sit just under the bodies, outside the paint pass.

**Source:** `chart/ChartApp.ts` (`layers`), `chart/scenes/GraphScene.ts` (constructor) · **Update
when:** a layer is added, moved or renamed.

(Superseded 2026-10-13: the `worldCamera` row listed "orbital guides → geography → infrastructure →
traffic → local effects" and there was no `canvas` layer.)

React DOM sits above the canvas and holds the breadcrumb, sector chooser, inspector, event list,
timeline, controls, and **callout labels**. Callout labels are DOM elements positioned from
`worldToScreen` anchors each frame.

**Label declutter.** Labels have a fixed screen size, so collisions are resolved in screen space
every frame. Each label tries four spots touching its own body: below, above, right, left. Other
bodies count as obstacles too. **If none is free, the label hides** until hovered or selected. A
label never drifts next to a different body, because a misattributed label is worse than none.
Placement order is stable: selected and hovered first, then by kind (star, bodies, stations,
flights, ships; in Solar, by the asset's label rank: seat, facility, pieces, captain, 15 §4), then by
key. Solar's holo plates place through `holoCandidates` (§9). Ship call signs are labelled only in
close-ups. Label plates are the nearly opaque `--plate`, so text keeps 4.5:1 contrast even over the
brightest painting (VC-2; superseded 2026-10-13: "82% ink"). The right-hand column stacks the object
list above the inspector, keeping the canvas clear.

**The scene adapter** (`GraphScene`, one class for every level and both views; superseded
2026-10-13: four adapters, `GalaxyScene`, `SectorScene`, `FeatureScene`, `BodyScene`). v1 nodes that
name an asset draw through the theme's asset registry (`chart/assets/registry.ts`); v0 nodes keep
their own art switch.
- **Methods:** `mount(viewGraph)`, `apply(viewGraph, cause)`, `setSelection()`, and `dispose()`.
- **Reconciling:**
  - Keep a `Map<projectionKey, Container>`.
  - On `apply`, diff the nodes and edges: create what's new, update what changed, and destroy what's
    gone.
  - Never rebuild the whole scene on a React render.
- **Picking:**
  - Selectable objects use `eventMode = 'static'`, a circular `hitArea` (`hitRadius`, at least
    12 screen px; 32 px across for a pointer, 15 §5), and `pointertap` → `select(canonicalKey)`.
  - A DOM object list gives keyboard focus and Enter the same actions.
- **Debug:** a map-debug toggle (`D` key) shows projection keys, slot numbers, hit areas, camera
  coordinates, object count, and texture count.

## 5. Accents
*Applies to: both views.*

The accent table is the v0 views' (Sprints, Backlog). Solar plays **maneuvers** instead: their
rules, lengths and commands are in [15 §7–§8](15-reference.md#7-maneuvers) and their looks in §9. The
flares, the pace rules and the player below hold in both. Each accent's trigger, length and tier is
in [15 §8, v0 accents](15-reference.md#8-effects); this table keeps the look and the reasons.

| Accent | Look |
|---|---|
| `emerge.*` | A **seed spark** where the child will appear, then it fades up from a scan glint. Planets resolve out of a scan sweep, the Feature core ignites gently, and a Task dot pops |
| `radarPing` (a Task changing band) | The dot collapses to a point, runs as a spark along its spoke, and re-expands in its new band with its rung's flare: about 2 s in all (leisurely, decided 2026-10-03). Same-beat Tasks move as one wave. Tasks get the smaller flares; even into Accomplished it's a 1.7× gold flare with sparks, not the grand one |
| `echo` | Something reaches Accomplished: a gold spark runs along its spoke or orbit to its parent's limb or corona, which rings once (05 §5) |
| `tractorBeam` (decided 2026-10-03) | How a person's ship **works on** something: a broad, soft cone of calm given-blue light from the ship (`TRACTOR = HERO_SOFT`; superseded 2026-10-13: calm cyan, now one hero energy in both views, §9), widening to wrap the object, with gentle bands drifting out along it and a few motes drifting home, like exploring, mining, or farming for an outcome. No bright core line and nothing weapon-like: it must read as assisting or engineering, never attacking. (In the Solar view ships also fight threats, and only threats: 02 INV-08, §9.) The actor's ship (`changedBy`, never the assignee's) flies to beside the object (its new resting place) and engages on arrival; the change's flare follows |
| `reopen` | A gentle **reverse flare**: a gold ring gathers in from outside and contracts onto the object, cooling to the earlier rung's color. No red, no shake |
| `taskDissolve` | A removed Task's dot fades out of its band in a grey ring |
| `stageShift.*` | A **flare** of the object's aura in the new rung's color (stars' coronas, planets' halos and rims, anomalies' glow, pins' heads). Flares grow with the step (decided 2026-10-02, see below). **The new look lands with its cause (slice 3b, decided 2026-10-03):** the object keeps its old stage until its flare starts (after the actor's beam, the radar ping, or the merge), then swaps under a 0.5 s dip in brightness as the flare swells. A change with no accent shows on the next frame; a seek shows it at once |
| `captainJump` | A short visible flight at each end, never a crawl across the map. **Tell (while playing):** the ship turns to its heading and its engines glow, in the gap before the beat. **Departure:** it accelerates along its axis and streaks out of view. **Arrival:** it streaks in from the direction of its origin, decelerates, and settles beside its new assignment, with an arrival ring. In-scene moves bow along a gentle arc, pursuing the ship's live place; a move under 60 screen px just glides. **A ship rests where its captain last worked** and stays there (no trips back to the parent): long streaks across the screen are for navigation (jump trails) only. It leaves a **jump trail** (below) |
| `jumpTrail` | A persistent streak of hyperspace light from where the ship left, pointing toward its destination, with a small label "→ ‹destination›" and a **Go** button that opens the destination's scene (and follows the captain there). It fades after a while so trails never clutter the view (05 §5) |
| `orbitDraw` / `orbitFade`, `routeInk` / `routeRetract`, `laneDraw` / `laneFade` | Stroke-dash animation along the path |
| `launch` | An **intent chain** (05 §5): the station's bay glows (the tell); an intent line inks from the bay to the vessel's lane slot; the vessel **drifts clear of the bay, then accelerates** along it (about 1.8 s), consuming the line behind it, as the author's ship flies to meet it in the lane and takes it in its tractor beam; on arrival its route inks on to the linked Task dot or Story or Bug. Afterwards it stays parked in its lane slot |
| `dock` (merged) | The vessel eases into its berth at the station; then the grand gold flare, and the station's bay flashes gold. (The trip to the work and back was dropped, 2026-10-03) |
| `reviewFormation` (decided 2026-10-03) | When a merged PR has approvers, its **author leads and the reviewers support**: the author's ship takes the point just above the vessel and works it with the tractor beam; the reviewers take the wings of a V behind and send a warm **support stream** (gold motes flowing ship to ship, not a cone) into the author, who glows with it. Their joined effort carries the vessel home to the grand flare. The beams alone tell who led and who supported: no ship is marked out (no role chips, revised 2026-10-03). Approvers with no ship here arrive as guests wearing their captain's picture, the same circle every ship shows while playing (§2, Dynamic labels), and leave afterwards without a trail. It tells how a team works: someone is enabled by their team. It never counts or ranks anyone (INV-19). It is a **protected moment** (05 §5): its beat (`dock` with approvers, 15 §8) holds the gather, the join, the berth and flare, and the dispersal, and nothing else moves the lane or the crew meanwhile |
| `withdraw` (abandoned) | The vessel's lights go out and it settles as ash grey, with a grey ring. Quiet, not punitive (INV-19) |
| Reparent / area move | Within a scene, the body travels an arc to its new place. Out of a scene, it fades and leaves a **jump trail** with Go to its new parent (a reparent) or new sector (an area move) |
| `heroAura` (decided 2026-10-04) | The **followed ship wears an aura** you can't lose track of, even while the selection reticle wanders: a **gentle spotlight** (fainter than the selection reticle), in the **timeline's cyan** so it ties to the ruler and stays low-contrast: a soft halo, eight long and eight short rays turning slowly in opposite directions, a thin ring, and three motes orbiting. Cyan on purpose: it's the timeline's color (and off the signal ladder, 09 §1, so it never reads as a state). **The entrance, as play starts:** fourteen motes gather into the ship from afar as the halo builds (1 s), a brief soft bloom, then two faint rings and the rays unfurl, settling into the steady glow (2.6 s in all). It fades in and out with the ship's scene, and survives seeks. Reduced motion: a steady halo and a static ring, no entrance |
| `recapBloom` | When playing reaches the end: everything accomplished in the range glows once, in the order it finished (05 §5) |
| `dawnSweep` | Ambient: a faint band of morning light crosses the sky as the ruler passes 07:00 local |
| `starBloom`, `stationPowerUp`, `sectorPulse`, `sectorRekey` | A corona forms / a station beacon lights / one soft wash / the star's projection fades out of one sector and into another |

**Flares (decided 2026-10-02).** The aura flares to about **double the object's radius**, then
lingers and dies back over about **6 s** (wall time). Steps differ in size, so progress reads as an
escalation:

| Step | Flare |
|---|---|
| Within Ready (New → Ready → Ready for Review) | Small: about 1.25× radius, a soft single pulse, about 2 s, in Ready grey |
| Into Underway (Active) | Medium: about 1.6× radius, about 4 s, in progress blue |
| Into Nearing (Resolved, Ready to Accept) | Medium: about 1.75× radius, about 4 s, in violet with gold sparks |
| **Into Accomplished (Closed, PR completed)** | **The biggest, busiest, and most satisfying:** 2× radius, about 6 s, gold. A bright core flash, an expanding ring, radiating sparks, and for stars the starburst crown flaring once before it settles still |
| Off the ladder (Removed, Rejected, abandoned) | None: a quiet ghosting fade |

A Task's flare into Accomplished is smaller: 1.7× radius, 3.5 s, with gold sparks.

**Source:** `chart/fx/director.ts` (`flareFor`), `chart/fx/timing.ts` (`GRAND_BURST_S`, `DUCK`) ·
**Update when:** a step's scale, linger or colour changes. (These flare sizes aren't in 15 yet.)

**Pace and calm (05 §§3–5, decided 2026-10-03).** At 1× the chart should feel like "watching the
grand struggle of a heroic fleet with deliberation and poise": a cozy campfire, not fireworks. A busy
week runs about 45 s at 1× (`pacing.budgetMs` (DESKTOP: 45000); 05 §8.3 B-7); each beat's choreography finishes inside it.
- Accents stagger parent outward within a beat, 400 ms apart (a Task wave moves as one); decorative
  effects **duck** to 40% while a grand flare bursts, lesser flares shrink meanwhile; one grand burst
  at a time.
- **Nothing jumps:** every object glides to its new place; moving objects pursue their live goals;
  lines reach for live anchors and are revealed by their ink, never popped.
- **Motion has to earn its place:** essential, narrative, and ornament tiers, gated by how much is
  already moving (05 §5 for v0; Solar's gates: 05 §8.5 P-9). A move worth "only an inch" just glides.

**The player (slice 3a; moved to the top of the space view 2026-10-04).** A bar across the top of
the view into space, left of the side panel; scenes fit below it. Progressive disclosure:
**▶ ▶❘ · day and time (opens the picker) · ruler · 1× chip · ⋯** (⋯ holds Highlights, the lens, and
reduced motion). The event strip is gone: the history is the side panel's History tab (§2, History cards).
- **The collapsed bar keeps the big moments.** After 3 s of playing, the bar folds to a thin progress
  line, which keeps a small diamond for each in-view High beat in its rung's color: the ones
  still to come bright, the ones passed faded, so you know when to expect change.
- The **rate chip** opens a small popover with the five rates (`[` and `]` also work): rate changes
  are rare, so they're one click deeper.
- **⋯** holds the lens, **Activity** (Calm · Lively · Maximum: how much the ships do, 05 §5; decided
  2026-10-09, remembered, Maximum by default) and reduced motion. When Retrospective is on, an amber **Retrospective ✕**
  chip sits on the bar, so the non-default lens is never hidden; clicking it returns to Known then.
- **The ruler's ticks show what touches this view:** in-view beats draw in their ladder color (the
  highest rung they move something to; cyan for non-state events), and in-view High beats are small
  diamonds. Other beats are hairlines. Hovering the ruler shows the nearest beat's event lines and
  the remaining time.
- **Highlights** (in ⋯, or H) plays only the beats touching this view (05 §3). The history is the side
  panel's History tab (§2).
- **Auto-fade:** while playing, after 3 s without mouse movement, the bar folds to a thin progress
  line; any mouse move, a key, or pausing brings it back.
- **?** shows every key.

## 6. Stage → look
*Applies to: the v0 views.*

Stage strings come from [`config/state-mapping.json`](../config/state-mapping.json). The
**non-hue cue** column is required (INV-20).

Each stage sits on a rung of the signal ladder. Which ADO state lands on which rung, per pack, and
each rung's colour are in [15 §3, Signal ladder](15-reference.md#3-signal-ladder); why each object
carries its rung where it does is in [09 §4](09-signal-ladder.md). The plain-language look per stage
is `LOOKS` in `src/renderer/src/vocab.ts` (shown in the inspector and the gallery). Solar's pieces
are in [09 §9](09-signal-ladder.md#9-v1-the-rung-carried-by-light-13-4-9-amended-2026-10-12). Every
rung differs in shape as well as hue (INV-20). This is the one table of v0 looks:

| Object | Ready (New → Ready) | Underway | Nearing | Accomplished | Off the ladder |
|---|---|---|---|---|---|
| Star (Feature) | Outline sketch → muted grey core, no rays | Bright core, blue corona turning | Violet corona with a gold fringe | Still gold eight-point starburst crown | Deferred: pause bars. Removed: dashed ghost |
| Planet (Story) | Wireframe sketch → barren rocky world, grey rim | Terraforming; blue rim, halo, and pulsing front | Developed; violet halo, gold gathering at the limb | Lush in a gold halo; city lights glimmer | Deferred: dim with pause bars. Removed: ghost |
| Anomaly (Bug) | Wireframe sketch (contours and spokes, like a New world) → the same, faintly filled | Blue turbulence, ripples at full strength | Contracting violet, ripples lighter and quicker | Sealed into a still gold faceted knot | Removed: ghost. Rejected: ghost with a strike |
| Pin (Task) | Grey outline pin, barely breathing | Blue pin, pedestal radiating | — | Faded pin with a still gold check | Removed: faint outline |
| Vessel (PR) | — | Blue stripe and lights, chevrons flowing, blue cargo motes on the route | — | Gold stripe and check, still; faint still gold route | Abandoned: greyed, with an X |
| `unknown` | A neutral grey form with a "?" badge, showing the raw state name | | | | |
| Flags `reopened`, `uncertain`, `stale` | Repair marks or a revived pulse / a dotted edge / a desaturated look with a clock badge | | | | |

**Source:** `chart/art/{star,planet,anomaly,infrastructure}.ts`, `vocab.ts` `LOOKS` · **Update
when:** a stage's look changes; check the gallery cell and 09 §4 in the same change.

## 7. Procedural recipes (pilot art)
*Applies to: both views.*

| Object | View | Built as | Paint pass | File |
|---|---|---|---|---|
| Sky | both | A full-screen fBm shader, one style per scene level, baked | Baked paint and impasto | `art/nebula.ts` |
| Galaxy | both | A spiral-disc shader | Live paint | `art/galaxy.ts` |
| Black hole | both | A lensed-disc shader (the empty cosmos), in the backdrop layer | None | `art/blackhole.ts` |
| Star (Feature; Solar's region star) | both | A core and a corona shader; the starburst crown when done | Live paint | `art/star.ts` |
| Planet (Story) | v0 views | A sphere-shaded quad, terraformed by stage | Live paint | `art/planet.ts` |
| Anomaly (Bug) | v0 views | A spiked shader with wave rings | Live paint | `art/anomaly.ts` |
| Station, vessel, Task pin | v0 views | 3D hulls (stations, vessels); a 2D lit pin | Crisp | `art/infrastructure.ts` |
| Captain ship | v0 views | 13 hulls × 14 liveries, 3D hulls | Crisp | `art/ships.ts` |
| World (seat) | Solar | A sphere-shaded quad by world line, transformed by share | Live paint | `art/worlds.ts` |
| Asteroid (objective) | Solar | A ray-marched rock by material, with crisp rigging marks | Live paint (rock); crisp (marks) | `art/asteroids.ts` |
| Enemy ship (threat) | Solar | 3D hulls, three swarms, six hostile colourways | Crisp | `art/swarm.ts` |
| Station (facility) | Solar | 3D hulls, Trek, Wars or Mecha, two forms each | Crisp | `art/dreadnoughts.ts`, `art/*Station.ts`, `art/stationRig.ts` |
| Captain ship | Solar | 3D hulls, three factions × three hulls × eight colourways | Crisp | `art/fleet.ts` |
| Role outline | Solar | The silhouette, flattened to one colour: a fixed-width rim and a glow, over a thin dark keyline | Crisp | `art/aura.ts` |

**Source:** `src/renderer/src/chart/art/*` · **Update when:** an art class is added, split or moves
between painted and crisp (and add it to the gallery, §8).

### Ambient motion

Everything idles gently, so the chart feels alive. Ambient motion runs on wall time (never the
playback rate, 05 §5), and freezes with the ambient clock for screenshots. One loop takes about
4–12 s, longer for objects that read as larger; the largest (galaxies, stars, planets) take four
to eight times that, so their slowness reads as scale. The rung tempos (the 2.4 s and 1.6 s beats,
Ready's 12 s breath) are in [15 §3, rung motion](15-reference.md#3-signal-ladder):

| Object | Loop | Motion |
|---|---|---|
| Galaxy | 48 s per arm's worth of turn | The disc swirls (arms, dust, and stars turn together); light flows in along the arms |
| Star | 48 s per turn; 80 s counter-turn; 20 s breath | Surface turns while granulation boils; the corona turns, its streaks counter-turn so it shifts rather than spinning rigidly, and it twinkles |
| Planet (v0) and world (Solar) | 96 s per turn (slowed from 48 s, 2026-10-12); clouds 1.35× faster | Turning surface with crater pits and lit rims (barren worlds), cloud shadows, and sunlight glinting off oceans (developed worlds) |
| New world (wireframe sketch) | 12 s | Barely breathes (Ready rung) |
| Underway: terraforming front, rim and halo, open PR chevrons and cargo motes, corona; Solar's cut lines | The progress beat | The strongest motion on the chart |
| Nearing: halo, corona, anomaly ripples; Solar's work lights | The nearing beat | The same motions, quicker and lighter |
| Active Task pin | The progress beat | Ripples radiate from the pedestal, two per beat; the pedestal brightens with the beat |
| New Task pin | 12 s | Barely breathes |
| Ships, stations, vessels | 1–6 s | Captain ships breathe (windows and engines, 6 s) and bob; station windows shimmer; cargo strobes softly double-flash in flight (3.2 s) |
| Closed worlds | v0: about 5 s, each settlement on its own phase; Solar: 2–10 s, each light its own | City lights glimmer: the one motion kept after completion (never under reduced motion) |
| Stations (Solar) | 3 s event loop; a Wars station's second-form seams breathe on 12 s | Lit windows, bays and engines swell with the station's share (09 §9); fire is slow and sparse |
| Accomplished (stars, anomalies, checks, PRs) | — | Still (a burst on the transition is a playback accent, slice 2) |
| Active anomaly | spikes turn (scaled by rung activity); ripples on the rung's beat | Turning spikes over turbulent waves; still once sealed |
| Selection reticle | about 31 s per turn (0.2 rad/s) | Slow turn: draws the eye without pulling at it |

Review and tune the motion in the art gallery (`npm run gallery`).

The numbers below (octave counts, profile counts, layer counts, resolutions) are **starting
points to tune by eye**, not requirements. What is required: the determinism (INV-12), the stage
uniforms, and the non-hue cues from §6.

Every look is generated at runtime from `seed = fnv1a32(canonicalKey|ART_VERSION)` (INV-12;
`@shared/scene/project/ctx.ts`). Seeds add *variation only*; state comes from uniforms. What is
cached, as built:
- **Skies** bake once to a texture per (level, seed, size) and never animate.
- **Hulls** (ships, stations, vessels, enemy ships, stations) bake once per design, colourway and
  heading into a shared `GraphicsContext`.
- **Bodies** (stars, planets, anomalies, galaxies, worlds, asteroids) run their shaders live every
  frame; the perf check found that cheap (09 §7).

(Superseded 2026-10-13: "render each textured object once with `renderer.generateTexture`, cached by
`(artKind, seed, stage, sizeBucket)`". Only the skies work that way.)

- **Nebula backdrop.** A full-screen quad (`Mesh` + shader) that applies domain-warped fBm noise
  through a palette ramp of ink-navy → cobalt → violet, with occasional amber and cyan wisps, and
  bakes its stars as a separate crisp layer on top. Baked at full resolution (half resolution read as
  blur under the paint, 09 §7) and cached per (level, seed, size); it doesn't drift. Twinkling star
  sprites sit over it in the backdrop layer and thin out as you zoom in.
- **The sky changes with the scale**, so each zoom reads as travelling inward. One shader, one
  style per scene level, seeded by the scene key (the same place always has the same sky); the
  transition snapshot crossfades the old sky into the new one:
  - *All projects (galaxies):* near-black intergalactic space crossed by one broad, dim arc of gas
    and light from the left. No spiral shapes: the projects are the only galaxies on screen.
  - *Sector:* inside a galactic disc: a diagonal band of star clouds split by dust lanes, over a
    faint nebula.
  - *Feature (star system):* the full nebula above.
  - *Story/Bug close-up (planet):* a sparse, clear sky, baked at full resolution, with a few small
    asteroids lit from above near the edges and one or two pale blue comets (desaturated toward
    the sky) crossing the top or bottom.
  - Large sky features stay left of the inspector panel, and twinkling stars thin out as you zoom
    in.
  - The sky is mostly dark, with only a few contrasting elements. Nothing in it may look brighter,
    more saturated, or more object-like than the clickable elements (no false affordances).
- **Planet (`Mesh` + shader).**
  - *Geometry:* a quad; the fragment shader maps UV to a sphere normal and samples 3D fBm for the
    terrain.
  - *Lighting:* Lambert with one directional sun, a night-side falloff, and an atmospheric rim built
    from a Fresnel term.
  - *Uniforms:* `uSeed`, `uTerraform` (0–1), `uClouds`, `uLights`, `uBands`, `uGrid`, `uGhost`,
    plus the ladder's `uSignalAmt`, `uFringe`, `uSketch`, `uActivity` and `uBeat`.
  - *Stage mapping:*
    - `uncharted`: `terraform = 0`, barren palette.
    - `terraforming`: 0.4, with animated bands.
    - `developed`: 0.75, clouds cleared.
    - `lush`: 1.0, with city lights.
- **Star.**
  - *Core:* a radial gradient.
  - *Corona:* a radial noise shader: seeded rays turning and streaks counter-turning, in the rung's
    colour, breathing slowly.
  - *Accomplished:* a still gold eight-point starburst crown (`uCrown`). (Superseded 2026-10-01: the
    white dwarf; only the stage key `feature.whiteDwarf` keeps the name, 09 §8.)
  - *Ghost:* alpha plus a dashed `Graphics` ring.
- **Anomaly.**
  - *Base:* a spiked star polygon (`Graphics`), with an animated displacement or wave-ring shader.
  - *Intensity:* the field radius and intensity follow the stage.
  - *Distinct silhouette:* the spiked outline sets it clearly apart from the planet sphere.
- **Stations** (by repository seed): a ring station (domed core, habitat ring, docking pylons), a
  twin-wheel station (two wheels on an axle, a hub of tanks), and a platform station (deck, corner
  pylons with antennas, a hanging spire).
  - Warm titanium, clear of the Ready grey, with one accent color per repository.
  - Navigation-green beacons (not amber, which is too close to gold); a name plaque in the DOM.
- **Ship versus cargo rule.** The two families must never be confused.

  | | Captain ships (people) | Cargo vessels (PRs) |
  |---|---|---|
  | Form | Always **wings or nacelles**: futuristic technology as a 1950s concept artist imagined it | **A chain of separate cars** with open gaps between them: trains in space, as a 1970s retrofuturist imagined them. Never wings or nacelles |
  | Lights | Windows and engines **breathe together on one slow, deep pulse** (6 s): heroes breathing with their power | Windows steady; while in flight, **soft white strobes double-flash** (every 3.2 s) at bow and stern like a light aircraft's anti-collision lights. Docked (completed) vessels park with strobes off |

- **Captain ships (v0 views):** 13 hull classes × 14 liveries (`HULLS`, `LIVERIES` in `art/ships.ts`),
  from `captain_profiles.ship_seed`. The Solar view's ships are the v1 fleet: three factions × three
  hulls in eight colourways (`art/fleet.ts`, §9).
  - Each class nods to a family of pop-culture starships without copying one: explorer, battlestar,
    rocket, orbiter, saucer, wedge, tug, lancer, hauler, pearl, frigate, dragonfly, starliner.
  - **Liveries use every hue except the ladder's** (no steel grey, progress blue, violet, or gold):
    for example crimson and cream, teal and coral, navy and signal red, chartreuse and charcoal.
    v1 changes this for its hero colourways: they also avoid the hostile palette (§9), so no hero
    ship leads with crimson, vermilion, rust, magenta-red, black or charcoal.
  - Engine glows and plumes trail along the hull's own axis; a call-sign plate in the DOM.
  - Ships are fixed per person; only the call sign can be edited.
  - Ship size never varies (INV-19): every class is fitted to the same footprint.
- **PR vessels:** 5 trains by PR seed (container freighter, tanker, shuttle train, pod courier,
  tug and barge), in cargo colors off the ladder. Gaps between cars must be wider than a car's depth
  at the three-quarter view, or the cars merge.
  - The rung shows on a `trim` stripe (tinted at run time) and the running lights, plus chevrons
    when active and a gold check when completed (09 §4).
  - The route tracer is a `Graphics` path.
- **Performance:**
  - Profile before adding render groups or caches.
  - Use `BlurFilter` only on the backdrop layer or during transitions.
  - Target 60 fps at 1080p on an Apple-silicon laptop, as a goal rather than a gate.

**Later hand-made art (optional):** any of these families can be replaced with an authored atlas
without touching entity logic. An asset ledger (`assets/LEDGER.md`) will record file, key, size,
anchor, license, and bundle. Every authored asset keeps its procedural version as a fallback. (As of
2026-10-13 there was no authored art and no ledger file. In Solar a theme swaps art through its asset
registry, 15 §4.)

**Atlas pilot (23 C7, 2026-10-28):** the asteroids' rest looks are baked from the procedural art to
`assets/atlas/asteroids.{png,json}` (a Pixi spritesheet; `npm run bake:asteroids`), recorded in
[`assets/LEDGER.md`](../assets/LEDGER.md) with what the atlas does not cover. The atlas path is a dev flag, off
by default (procedural is the default): `localStorage['starChart.atlasAsteroids'] = '1'`, or the test hook
`setAtlasAsteroids(true)` then `remount()`. Under it an asteroid draws its rock and hardware as two sprites, with
its outline a live layer from the sheet's stored silhouette. Anything the atlas lacks (steps drawn, deferred,
unknown, a contact arrival, the glint, a missing key or sheet) falls back to the procedural view for that
asteroid, with a `[asteroid-atlas]` console line for a missing key or sheet, never a crash. The gallery shows
procedural and baked side by side (*atlas · <material>* cells).

## 8. Visual checks
*Applies to: both views.*

| Check | What it checks | Runs in | View |
|---|---|---|---|
| **VC-1** | Each scale has a golden screenshot at a fixed fixture instant, and renders the same every time (INV-12) | `slice1.spec.ts` (`galaxy`, `sector`, `feature`, `body` goldens in `slice1.spec.ts-snapshots/`) | v0 views |
| **VC-2** | Every visible node has a DOM label or list entry, and label text meets 4.5:1 on its plate | `slice1.spec.ts` (@keystone); `solar.spec.ts` "VC-2 in a solar scene" and the expanded plate's contrast test | both |
| **VC-3** | Every hit is at least 12 px, and no two selectable hits overlap | `slice1.spec.ts` (every scale); `solar.spec.ts` "VC-3 in a solar scene"; `density.spec.ts` solar case at 1440×900 and 1024×640; `registries.test.ts` (the 12 px formation floor) | both |
| **VC-4** | Galaxy → sector → Feature → body → back ×3, ten times, leaves display-object and texture counts at baseline | `slice1.spec.ts` | v0 views |
| **VC-5** | Reduced motion: nothing travels, every accent has a static outline, scenes crossfade quickly | `slice3b.spec.ts` (AC-24); Solar's equivalent is `solar-play.spec.ts` "reduced motion keeps the information" | both |
| **VC-6** | Review copies of every object in every stage (not pixel-exact); the gallery's layout holds | `gallery.spec.ts` (v0 families), `gallery-v1.spec.ts` (v1 families), `gallery-layout.spec.ts` (@keystone, alignment), `gallery-assets.spec.ts` (every theme asset, maneuver demo, the Arrive/Depart row and the finale cell runs and clears) | both |
| Density (no id) | Collisions, label overlaps, off-screen and undersized objects; sizes in label units | `density.spec.ts` → `test-results/density-report.md` | both |
| Perf (no id) | Frame times in the densest scenes, painted and plain; Pulsar Pod at rest, playing and seeking (23 F10) | `perf.spec.ts` → `test-results/perf-report.json`, `perf-pulsar-report.json` (09 §7) | both |

**Source:** `tests/e2e/*.spec.ts`, `tests/unit/registries.test.ts`, `playwright.config.ts` ·
**Update when:** a VC gains or loses a spec, a spec is renamed, or a new visual check is added (give
it the next VC id).

**Automated** (Playwright `_electron`, with fixtures loaded, the `__starChartReady` hook, and
`maxDiffPixelRatio: 0.02`):
- **VC-1:** each scene has a golden screenshot at a fixed fixture instant, and the same instant
  always renders the same (INV-12).
- **VC-2:** every node visible in the `ViewGraph` has a matching DOM label or list entry, and its
  label backing meets 4.5:1 contrast.
- **VC-3:** hit areas are at least 12 px, and no two adjacent selectable nodes have overlapping hit
  areas.
- **VC-4:** navigating galaxy → sector → Feature → body → back ×3, done 10 times, leaves the display
  object and texture counts at baseline, so nothing leaks.
- **VC-5 (revised 2026-10-03, to match the build):** in reduced-motion mode nothing travels:
  - no flight, ping, beam, or spark;
  - outlines are static (they hold about 1.5 s and never grow or move);
  - fades last at most 0.3 s;
  - every accent has a static outline.
- **VC-6 (art gallery, revised 2026-10-03):** `tests/e2e/gallery.spec.ts` writes review copies of
  every object in every stage, per family, at two frozen instants of the ambient clock, to
  `test-results/gallery/`.
  - They are **for review, not pixel-exact checks**: the gallery's columns flow with the window, so
    renders differ across displays. Art is refined step by step, by looking.
  - `tests/e2e/gallery-layout.spec.ts` checks alignment instead: at 2× density and at 1024, 1440,
    and 2400 px wide, every object sits in its frame, and the drawing buffer is what was asked for.
- **Gallery layout:**
  - The canvas resolution is the sharpest the GPU allows for the page. A long page on a Retina
    display used to exceed the buffer limit; the browser shrank it and the art slid off its frames.
  - The art re-lays out on any reflow or display change.
  - Columns are fluid, at least 200 px wide.
  - The page has no scrollbar, so its width never depends on macOS's scroll-bar setting.

**Art gallery** (`npm run gallery`): a development-only window that shows every object in every
stage on a grid, using the chart's own art classes, for reviewing visual identity side by side.
Space pauses or plays the ambient clock; ← and → step one frame while paused; B cycles the
background (ink, then each scene level's sky); P toggles the painterly pass (09 §7). It's gated by `STAR_CHART_GALLERY=1` and ignored in
packaged builds; the regular app has no route to it. When adding a stage or an art class, add it to
`src/renderer/src/gallery/Gallery.tsx`. Stage lists come from the stage descriptions in `vocab.ts`,
so a stage with a description shows up automatically.

**The v1 gallery (2026-10-12).**
- **Culling.** Only cells near the viewport draw (an `IntersectionObserver` with a 300 px margin). A
  cell off screen still ticks, so its demo keeps looping, but isn't rendered. Hundreds of cells and
  a score of whole scenes made the page crawl.
- **Size ladders.** The fleet and the swarm each have a size ladder: every hull at 29 px, then
  58 px, the smallest and the usual on-chart sizes (`sizing.ts`), with a silhouette copy.
- **Stations.** Each faction shows its transformation (playing once, then frame by frame at pinned
  progress), both forms at 48, 96 and 150 px, the second form in every state, and a **Charge** step:
  the reactor gathering light before a beamed strike.
- **Maneuver demos** (`gallery/maneuverDemos.ts`): one cell per engine rule, each a real
  `GraphScene` looping one planned maneuver from the `pod-sprint` fixture. A rule's variants (a
  station's `first` merge, a `beamed` close) each get a demo of their own. R toggles reduced motion
  (for the rows below too). A cast part is found as the interpreter finds it, by key and kind (a
  person's seat and ship share a key), so a moment whose ship is missing gets no cell. If the fixture
  did not load, the section shows a note cell saying so; nothing throws (v1.3 F6).
- **Arrive and Depart row** (`gallery/motionDemos.ts`, v1.3 F7). "Arrive/Depart" in 05 §5 is the
  scene's own motion for a body coming into a scene and leaving it (`GraphScene.arrive` / `depart`,
  `ARRIVE_S` and `DEPART_S`); the row covers that and the theme's entrances that playback uses
  (`theme/starChart/entrance.ts`), as two wide cells on the fixture's busiest region. *Planets and
  pieces* loops rest, Arrive from the stream, present, Depart on a beat, gone. *Entrances* loops the
  episode's opening (asteroids spiral in, hive ships through a rift, ships out of warp). Reduced
  motion: Arrive and Depart are a 0.3 s fade; the opening issues nothing (the board is simply there).
- **Finale cell** (`gallery/motionDemos.ts`, v1.3 F8), a section after the Arrive and Depart row:
  the round's-end finale (`finale` in `theme/starChart/finales.ts`): the star flares, the finished
  platforms glint in the order they finished, the ships form up over the star, and the viewer's
  awards (two invented ones, on the first ship's captain) light once they have formed. `glint` is
  part of it; `allClear` and the seat glints already play in the maneuver demos (`regionClear`,
  `seatComplete`). Full and reduced motion with R. It loops with `recap(…, { finale: true })`, the call
  the end of a finished round makes.
- **Checks.** `tests/e2e/gallery-v1.spec.ts` pins every step of every cycling cell, per v1 family,
  for review copies. `tests/e2e/gallery-assets.spec.ts` mounts every theme asset through its samples
  and checks that every maneuver demo, the Arrive/Depart row and the finale cell runs and clears, in
  full and reduced motion, with no console errors (and writes `arrive-depart-*`, `opening-full` and
  `finale-*` review copies to `test-results/gallery/`).

**Human review gates** (the user looks and signs off; the agent posts screenshots and waits):
- **HG-1** (slice 0, signed off): one Feature system. It reads as a painted space scene with an observer's
  annotations, not a flowchart. Labels are legible.
- **HG-2** (slice 1, signed off): all 4 scales. A Feature star is the most prominent object, and a Story reads
  as its planet.
- **HG-3** (slice 3b, signed off 2026-10-04): a full week of playback at 1×. Sector pulses are noticeable without turning
  the view into a pulsing scoreboard. The captain jump reads as a jump, not a crawl.

## 9. v1: the solar system (13 §9, amended 2026-10-12)
*Applies to: Solar.*

| Object | Role (SDLC) | Look | Fixed colour (identity) | Rung shows in | Size |
|---|---|---|---|---|---|
| Region star | The area path (pod) | The v0 star, pod stages (02 INV-05) | Warm core | Its corona, by the region's share | `GEOMETRY.starR` |
| Seat planet | An assignee | `WorldView`: a terran, glacial or volcanic world line, transformed by the seat's own share | The world line | Rim light and halo; settlement lights once done | One size for every seat (INV-19) |
| Asteroid | Objective: a User Story | `AsteroidView`: metal, crystal or energy; carved, rigged, then a mine in low orbit | The material; Opportunity Blue outline while open | Cut lines and work light | A piece (`pieceR`) |
| Enemy ship | Threat: a Bug | `HiveShipView`: Reaver, Brood or Stinger swarm | A hostile colourway; Deadly Red outline while open | Running lights, fire and damage | A piece, with a hardware floor |
| Station | Facility: a repository | `DreadnoughtView`: a Trek, Wars or Mecha station in two forms, with its satellites | A hero colourway | None: intensity by its own share (09 §9) | Half a planet's size, and at least twice a ship's on screen (2026-10-12) |
| Captain ship | Agent: a person | `CaptainView`: the v1 fleet | A hero colourway | None | One footprint for every hull (INV-19) |
| Steps, attachments, guards | Tasks, PRs, pipeline runs | Inside their parent: augmentations or weapon pods, tender shuttles, point defense | Their parent's | Their own small ladder (09 §9) | Their parent's |
| Container | A Feature | Not drawn, and since v1.1 not shown (19 L6) | — | — | — |

Asset ids, art classes, layers, label ranks and every pack's type words are in
[15 §4, Roles](15-reference.md#4-roles-kinds-and-assets); sizes and floors in
[15 §5](15-reference.md#5-sizes-floors-and-layout); maneuvers in [15 §7](15-reference.md#7-maneuvers).

**Source:** `theme/starChart/index.ts` (`roleAsset`), `theme/starChart/assets/*.ts`,
`chart/art/{worlds,asteroids,swarm,dreadnoughts,fleet}.ts`, `@shared/engine/solar/version.ts` ·
**Update when:** a role is re-pointed, an object gains a look or a size rule, or a pack renames a type.

v1's Solar view ([13](13-game-design.md), [14](14-architecture.md)) adds a game layer over the same
painted universe. Everything above still holds for the v0 views; this section records what changes in
Solar. The looks themselves are art-owned (`art/{worlds,asteroids,swarm,dreadnoughts,fleet}.ts`) and
reached only through the theme's adapters (`theme/starChart/assets/*`, 03 §5d).

**Navigation.** Galaxy (a workspace) → sector (a round's regions) → solar system (a region). **The
solar system is the bottom level**: there's no close-up, and a double-click on a planet stays put.
Playback happens in the region only (05 §8). The Backlog view (Feature as star) is parked, and the
v0 views are reached through Settings → Theme's developer toggle or a `STAR_CHART_PARADIGM` pin.

**The board** (13 §3, v4 since 2026-10-12). The region's star at the centre keeps the pod look
(02 INV-05). The seats form one regular ring around it, drawn whole as one smooth line (its near half bright, its
far half fainter, under the planets), however many planets stand on it; planets never orbit in
playback. A seat's pieces overlay its planet on two half-discs (stories on the left,
bugs on the right, 22 Block D); a finished piece leaves for a slot on the trophy ring round the planet: a finished objective a round gold orb, a finished threat a
gold asterisk of wreckage spikes, so the two read apart by shape alone (22 A12). Unassigned work drifts
in a frontier belt outside the outermost footprint. Stations jump in near the planets they serve, with
their attachment satellites in fixed slots. Captains fly to where their person acted (INV-07), rest off
the planets' faces by that work or by their own planet's name (22 A9), are clickable and can be
followed (13 Q10). (Superseded 2026-10-12: "up to 3 objectives and 3 threats free beside it and the rest in a
proximity formation"; and outcomes built on the planet's surface, which the projection no longer
sends.) The objects are in the table at the top of this section; threats draw in the hardware layer,
so ships fly over them.

**Labels: holographic plates (2026-10-12; every Solar label, 2026-10-13, 19 L1).** Every chart
label in Solar is a holo plate: planets, stations, captain ships, objectives and threats (assets),
and the galaxies, the round's pod stars and Load more, and the region's star (no asset: the paradigm
gives them a plate, below). The v0 views keep the navy plate everywhere, including their galaxy and
sector, which share code with Solar's. Since 19 L2 the expanded list is the same plate, grown in
place (*Mega-labels*, below): the navy overlay is retired.
- **The hierarchy (19 §2; 22 A5).** Each plate has a tier: **T1 Lead** (captains, stations: the
  actors), **T2 Door** (galaxies, pieces: what you can enter or act on next), **T3 Place** (homeworlds:
  where things are) and **T4 Sky** (the stars, the round's and the region's, 2026-10-14: the quietest,
  a faint cyan frame; the breadcrumb names the system too). The glass is the same at every tier; the
  quieting is mostly the frame (its alpha, a grey-cyan for T3), the glow (none below T1) and the
  saturation, with the title at Inter 600 for T1 and 400 below. Pointed at, lit from a list or
  selected, any plate is lifted to T1's colours, weight and stronger glow, at its own size. In play
  the tiers keep their colours and step down to the title alone (11 px), then the captain's picture
  alone. Expanded, a plate is lifted too. Values in 15 §6 (`holo-tiers`); every text colour is 6.7:1 or more on the glass over ink,
  4.5:1 over white. At rest every plate is T4 Sky; it rises to its tier while pointed at, selected, followed, or named by playback, and settles back (27 B1, 2026-10-31). Review: `npm run gallery` → *Label hierarchy*.
- **The plate.** Regular casing in the UI sans (2026-10-12: capitals shouted). Glass in one pale HUD cyan (`--holo-*` in `chart/holo/holo.css`) for the chart's
  chrome: people, places, infrastructure and stars. A piece's plate alone wears its role's hue on its
  frame, pointer and dot (22 A6, 2026-10-14: Opportunity blue, Deadly red, as its outline), its text the
  tier's: a plain rectangle with two corners cut, no ornaments (simplified 2026-10-12).
- **The pointer.** A single line runs from the plate to the object's rim, ending in a small dot. The
  plate hangs out along the node's `labelDir` (a planet's: away from the star), elbows once and runs
  level into the plate's near edge.
- **Reuse.** An asset opts in with `AssetDef.label = { frame, variant, layout, tier }`. A node with no
  asset gets its paradigm's `KindPlate` for its kind at its level (`HierarchyUi.plates`; Solar's are
  `hierarchy/solarPlates.ts`), with its own rim and, for a horizontal plate, a way out (`dir`) when
  the node has no `labelDir`. v1 has one frame,
  `chamfer`; three variants, `title` (the name only), `subtitle` (the name over the node's meta,
  smaller and dimmer) and `avatar` (the picture, then the name); and two layouts, `horizontal` and
  `vertical`.
- **Planets** use `title`, `horizontal`, T3: the plate sits left or right of the planet. Pointed at,
  on the planet's disc or on the plate, it expands into the seat's pieces, objectives then threats by
  slot (19 L5). Where a piece on the disc has the pointer, the piece wins (smaller hit areas sit on
  top), and the planet's plate folds back after the grace.
- **Objectives and threats (2026-10-13)** use `subtitle`, `horizontal`, T2: the story's or bug's
  title over `{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3) (no ◆ person line), beside the piece on its `labelSide`.
  **Hover-only (19 L7, 2026-10-13, experimental).** No piece is labelled at rest. A seated piece
  speaks through its planet's plate, both ways: pointing at the piece expands the planet's plate with
  the piece's row lit (the piece's own plate stays hidden), and a selected piece keeps that plate
  open while settled, its row marked (its title in ivory at weight 600 on a faint ivory wash, so it
  differs from a lit row by more than hue). Selected, its steps are listed in the inspector's
  **Steps** (*Tasks*): each by name, its raw state and its rung's mark, in slot order. A frontier piece has
  no planet: pointed at, selected or lit, it shows its own T2 plate. In playback each piece a
  maneuver casts shows its own plate, its title and the event's note; when, for how long and how many
  at once are rules: [05 §8.9](05-playback.md#89-labels-and-attention-in-play) A-3 to A-5. Placed after
  focused plates, it may cross a body but never another label, unless it names its event's cause and no
  clear place exists: then where it covers the least (05 §8.9 A-4).
- **Galaxies (2026-10-13, 19 L3)** use `subtitle`, `horizontal`, T2: the project's name below and right
  of the core (`labelRim` 0.45); pointed at or selected, its counts beneath, `2 areas · 136 events this
  week` (Solar drops v0's leading "Project"; `not charted yet` before a sync).
- **Stars (2026-10-13, 19 L4; revised 22 A3–A5, B1)** use `subtitle`, `vertical`, T4 Sky, above the
  star (the round's previews stay visible below): the pod's name over its counts in ADO's words, then
  the chart's name, quieter (`12 User Stories · 4 Bugs · star`). No path (the inspector has it), no done
  count, no expanded list. Values: 15 §6.
- **Repo stations (2026-10-12)** use `subtitle`, `vertical`, T1: the repo's name over "Repository", the
  pack's type word. The plate stands below the hull (or above, when the node's `labelSide` asks) on a
  short upright connector from the hull's edge (`AssetDef.labelRim`, a fraction of `world.r`). While
  playing, the Title tier (`title`) drops the subtitle, as on every label.
- **Captain ships (2026-10-12; square pictures 2026-10-13, 19 L8)** use `avatar`, `vertical`, T1: the
  captain's picture (or initials on their colour) as a **square** filling the plate's near end, the
  plate's full height (24 px) and flush with its frame, so the plate's cut corners clip it too, then
  their name. No ring: the frame is the only line round it (R6). A picture that isn't square fills the
  square from its centre (`object-fit: cover`; hand-added ones are already cut to a centred square in
  main). The plate stands above the ship on a short connector from the hull's top. In play, the
  picture tier is the picture alone: a 20 px square with the same cut corners (`frameClip`) and the
  tier's frame line (`HoloFrame.bare`: the outline, no pointer), tucked onto the hull's top
  (`labelRim` 0.4, which also sets where the connector starts). Squares are for chart plates only:
  the inspector, the People list and v0's labels keep their circles (19 Q7). Placement (`holoCandidates`) and drawing (`HoloFrame`)
  are shared, so later frames and variants (counts, say) need no new placement.
- **Checks.** The plate is still a `.callout` with a real background colour, so VC-2's contrast check
  covers it.

Steps, attachments and guards are drawn inside their parent (augmentations, weapon pods, tender
shuttles, point defense). Celestial bodies are painted; machines are crisp (D2, 09 §7).

**The hostile palette is reserved for threats** (13 §4.3, §9). Reds and their neighbours, hue about
320°–40°, with black, charcoal and obsidian accents (`HOSTILE` in `art/swarm.ts`, six colourways).
- Only threats wear it, and only as their own fixed colour. **No hero colourway may use it**: the
  fleet's eight colourways (`COLOURWAYS` in `art/fleet.ts`) avoid it and never lead with a ladder
  hue. Stations take a hero colourway too.
- The theme's own hostile effects use the same family: the emergence fold has its own red
  (`HOSTILE` in `theme/starChart/maneuvers/emergence.ts`), and return fire is Danger Red. Values:
  [15 §2](15-reference.md#2-palette).
- A threat's rung is never its hue: it's carried by its light, fire and damage (09 §9); its fixed Deadly Red aura only says it's an enemy.
- Coral (`--coral`, §2) stays an alert colour for the UI chrome only; it never appears on a chart
  object.

**Role outlines: one weight** (19 S1, 2026-10-14; `art/aura.ts`). An asteroid's Opportunity blue
outline and a enemy ship's Deadly red one are one weight, from one token, at every zoom.
- **The rim** is `RIM_PX`, 2 px on screen, for every role. The aura reads its own scale on screen
  each frame, so no art has to tell it the zoom, and the gallery draws it the same. Before, only the
  enemy ship passed its zoom: at the fit an asteroid's rim measured 0.3 px against the hive's 2 px, and
  1.2 px at 4×. 2 px read clearly at the fit, so 2.5 px wasn't needed (19 §4 Q8).
- **The glow** reaches a share of the silhouette's size on screen (`GLOW_SHARE`), between one
  minimum and one maximum (4 and 12 px), not each art's own spread. Before, each art's spread went to
  the blur as it was, so a enemy ship's glow was a 43 px haze at the fit (clipped to a square close up)
  and an asteroid's a fixed 17 px. It now hugs the rim.
- **The balance.** At one width and one alpha, Deadly red stood further off the sky than
  Opportunity blue by ΔE (80 against 48), so each colour weighed its outline's alpha: red 0.85,
  blue 1.1 (ΔE 69 against 53), set by eye. 23 C1 measured WCAG 2 contrast from the rendered pixels
  instead: red was 2.3:1 against the night sky, under the 3:1 floor. Red is now 1.25 (its strongest channel
  meets the cap there), blue 1.04; red and blue read within 4% of each other against the night sky
  (5.3:1 each, re-measured with gold in 27 B3). Gold rested at 1 (9.6:1) until 27 B3: it made done work shout over open
  work, so it now rests at 0.68 (4.8:1, within 10% of red and blue), and a victory flares it to full for 1.6 s, then it settles. What renders: a filtered container composites by its filter's blend mode (Pixi 8.21), so the glow and rim,
  which are filtered, lie over the scene by alpha, not added, whatever their container's `blendMode`; the weights were tuned on that. The width is never the balance.
- **The keyline** (23 C1): a dark band, `KEYLINE_PX` wide (2 px) in the night sky's own colour at `KEYLINE_ALPHA`
  (0.85), just outside the rim and over the glow, so the rim's neighbour is dark whatever lies behind a piece (a lit
  planet's face, a nebula). It is the outline's shadow edge, not a mark of its own: it carries no hue, no motion and no
  state (09's one ornament per rung is untouched). It is tinted copies of the silhouette: no filter pass and no group of
  its own (an earlier build with a filter pass and a second group per aura cost Pulsar Pod 8 ms at p50). On the night sky it is invisible; on a lit planet face
  it lifts Opportunity blue from 2.7 to 4.0:1 against its neighbour. It does not lift Deadly red (1.7:1 there, under 3:1:
  15 §8, a gate for HG-C).
- Values: [15 §8, *aura*](15-reference.md#8-effects). Measured with
  `tests/drive/steps/v11-S1.ts` (crops at the fit, 2× and 4×, each drawn with and without the
  outlines).

**Hero energy: one reactor, one blue** (2026-10-13, `art/energy.ts`). Good guys shoot blue, bad
guys shoot red.
- **The colour.** Every hero craft, stations and captains alike, runs on the same energy:
  `HERO`, a definite blue. It was first the ladder's lighter progress blue (`PROGRESS`), but drawn
  additively in layers that summed to near white, so it moved toward blue the same day. The family
  (`HERO`, `HERO_PALE`, `HERO_CORE`, `HERO_GLOW`, `HERO_SOFT`, `DANGER`) is in
  [15 §2](15-reference.md#2-palette).
  Beams brighten toward a pale blue (`brighten`, `HERO_PALE`), never toward white, so even the
  hottest core reads blue. Its weapons, tractor and cutting beams, reviewer energy, summons,
  engines, nacelle coils, reactor and shields are all that one blue. Windows keep their faction
  tints. Enemies fire Danger Red (`DANGER`), whatever their colourway.
- **Weight is form, not hue.** One beam effect has three cuts (`theme/starChart/commands.ts`):
  - `phaser`: the master. A station's hot beam with a pale-blue core, a head, an after-image
    trail, a muzzle flare and sparks where it hits.
  - `bolt`: the same beam under half the width and about a third of a second long. It is a
    captain's phaser (in bursts, `burst()`), a station's covering fire (a heavier bolt), and the
    enemy's return fire (a Danger Red bolt that stops on the hero's shield).
  - `energy`: thin and calm, desaturated (`HERO_SOFT`), with motes flowing from reviewer to author.
- **Giving, not firing.** The tractor beam is the same blue desaturated and spread out
  (`TRACTOR = HERO_SOFT`), friendly rather than fierce. Its **cutting beam** (`cutter`,
  2026-10-13) is the tractor focused to a point that sweeps across an asteroid's face, scoring a
  glowing kerf and throwing sparks: a captain's in Carve. A station's **mining beam** (`mine`) has
  the phaser's dramatic weight: a heavy full-blue beam out of a muzzle flare, a molten bloom with
  sparks and debris where it bites, inside a given-blue tractor sheath that carries ore home.
  Mining, never weapons fire (13 §6.1).

**Combat safety** ([13 §1](13-game-design.md#combat-safety), 02 INV-08). Ships help people and fight only
threats. Enemies are insects and machines; their fire menaces but is absorbed by shields and point
defense and never lands on a person; there are no friendly casualties; a defeat is debris and
research, never death. Stations' covering fire is ponderous and sparse: a campfire, never fireworks.

**Seeds: stable looks** (13 §4, 02 INV-12). Every seeded choice comes from a stable hash of the
entity's own ID within its tenant, never from load order, local row IDs or cache state, so the same
person, item or repo looks the same through purges and reconnects. Only an art-version bump changes
them.

| Look | Seeded from |
|---|---|
| A seat's world line | The person's `artSeed` |
| An asteroid's material | The objective's `artSeed` (`asteroidMaterial`) |
| A enemy ship's swarm and colourway | The threat's `artSeed` (`hiveDesign`) |
| A station's faction, design and colourway | The repo's `artSeed` (`stationLook`) |
| A ship's faction, hull and colourway | The person's `shipSeed` (`fleetDesign`) |
| A maneuver's art randomness | `fnv1a32(eventKey)` (`PlannedManeuver.seed`) |

**The one exception is the viewer** (13 §7). The viewer may pick their own faction, hull and
colourway in Settings → Your captain. That reaches only their own ship, and any station their ship
summons first in the round, which arrives in one of the viewer's faction's designs, picked within
that faction by the repo's seed. Every other look keeps its seed, so the viewer's ship may look
different on a colleague's machine. Every hull keeps the same footprint (INV-19). The viewer's style
is applied at render time (`AssetCtx`); shared projection and the goldens never see it.

**Containers aren't drawn** (13 §4.4, 02 INV-10). Features and Epics never appear as stars, banners or
objects in the Solar view. Until v1.1 a Feature appeared as the subtitle of a row in a station's
mega-label; since 19 L6 (Q6) those rows are the station's PRs. **Since v1.3 (B3) the region's star plate
names the pod's top Feature as one quiet line at rest** (`Feature #123 ·
Title · 5 +N more`), and opens the whole list in place when the star is pointed at or the user selects it (27 B2; entering a pod selects the star but doesn't open the list); the Inspector lists them all. It is text on a plate, never an object. Epics have no
form and none is planned (23 §5).

**Mega-labels: one expandable plate** (13 §4.1–4.4; 19 L2, 2026-10-13). A seat and a station each
carry a list (a piece's steps left the chart in 19 L7: the inspector's **Steps** lists them). It is shown by the object's own holo plate, which grows its rows
in place under its title, in the same frame and with the same pointer, when pointed at (the object
or its plate) or selected while settled, for a short grace after (`GRACE_MS`, time to move onto it),
and while the pointer is on it. There is no separate panel beside it: the navy `.callout--mega`
overlay retired. The plate keeps the side it was placed on and grows away from its object; it slides
along its pointer's edge to stay in view, and if its rows won't fit there it re-places once, on
expanding, never while expanded, so it never jumps under the pointer. Expanded, it is lifted and sits
over the other labels; a lit object's own plate never shows under it. Rows: one per object with its
rung mark (one shape and one ladder colour per rung, 15 §3, INV-20) in T2's text colours, at most
`ROW_BUDGET` rows plus "+N more" (15 §6). A station's rows are its PRs (19 L6): the title,
`PR · #n · status`, and the work it serves beneath (`→ User Story #20121`). Hovering a row
(a long press on touch) lights its object with a cyan ring (a PR's row rings every piece it serves);
a press selects it (a PR's row, the first piece it serves). Both ways (19 L7): pointing at a piece
lights its own row in its planet's plate, and a selected piece's row is marked. The text meets the
§2 contrast rule. The rows never scroll sideways (27 A4): a row's title, repository and container lines ellipsis inside the plate's width, and the stat line wraps at its `·` (one nowrap fact per part, so a count is never cut: R9). The stat line reserves one line before its facts land (R4); a wrap adds a line only when a stat is long, which is accepted. Review: `npm run gallery` → *Label hierarchy*, *expanded*.

**Guides.** The frontier belt (a faint cyan annulus with dashed edges) uses the orbits' cyan, never
a ladder colour, and sits in the guide layer under the bodies (§1 line hierarchy, rank 3).
(Superseded 2026-10-12: each formation's soft halo. A planet is its own region now, so no guide is
drawn for it.) **The belt shows only when needed**, and in play follows its pieces as
drawn (rules: [05 §8.2](05-playback.md#82-the-static-board-at-a-playhead) S-5); its place stays reserved either way.
It is always the orbits' cyan and dashed, apart from both role outlines. (Superseded 2026-10-13, 19
S2: **the threat light**, `threatGuide`, a faint, still Deadly Red on the belt's outer edge while any
threat was open.)

**Finales** (2026-10-13, `theme/starChart/finales.ts`). The moments a round builds to, beyond a
single close; a celebration, never a scoreboard (INV-19):
- `glint`: a four-point gold sparkle, a finished platform or a city's lights catching the light.
- **All clear** (`allClear`, the `region.clear` maneuver): when the region's last threat falls, a
  calm hero-blue ring sweeps out from the star, each planet catching it in turn. (Until 19 S2 it
  first lifted the threat light off the belt.)
- **Homeworld complete** (`seat.complete`): when a seat's last open piece closes, its ship comes
  home, gold rings gather and the world's finished look lands with the grand gold flare.
- **The round's end** (`finale`): the star flares in its own warm light, each finished platform
  glints in the order it finished, and the ships form a chevron over the star once before going
  home; then the awards show.

Timings are in [15 §10](15-reference.md#10-timing-and-budgets); the effects in
[15 §8](15-reference.md#8-effects).

**v0 stays put** (17 D13). All v1 CSS is scoped under `[data-paradigm="solar"]` (Settings, the
hover ring) or to classes only v1 assets use (`.callout--holo`, `.holo__*`), and the Settings cog
renders only in Solar (or a v0 view the developer toggle chose), so the v0 pixel baselines hold.

**Visual checks in Solar** (`tests/e2e/solar.spec.ts`; 14 §5):
- VC-2: every selectable node is listed, every hit is at least 12 px, and callout text (expanded
  plates' rows included) meets 4.5:1.
- VC-3: no two hits overlap, formations included. Met on `pod-sprint` at 1440×900 and at the
  1024×640 minimum window since the placement fix (08 §7, 17 W4-T2).
- The density harness's solar case (`density.spec.ts`, 17 W4-T2), at 1440×900 and 1024×640, at
  the round's start, middle and end, checks that every piece is in its seat's region, that groups
  and stations keep clear, and that the frontier is in view. The full list of checks is in §8.

**Human review gates for v1** (17):
- **HG-V3, the board:** the user plays the `pod-sprint` episode on fixtures and signs off the board,
  the seats, the formations, the frontier and the stations. VC-3 now holds, so it is open.
- **HG-V3′, maneuvers:** the user reviews every maneuver in `npm run gallery` (17 W4-T1).
- **HG-V4, v1 sign-off:** the episode, Settings and achievements on fixtures, then the user's live
  checks in ADO mode, reported as pass or fail only (INV-18).

### The guided tour overlay (23 E7)
A step is an R1 holo plate (the chart's dark glass, `--holo-lift-*` cyan line and glow, 300 px wide, 12.5 px text) with a pointer
from its elbow to a ring round the object, anchored to the object's live screen position every frame (`nav.liveScreen()`),
never to fixed coordinates. The plate takes the `holoCandidates` place that covers the least (a cost rule: the chrome 100, the ringed object 50, other objects 5, labels 3). The ring pulses (1.8 s, opacity 1 to 0.45) except under reduced motion (the OS setting, or the store's `reducedMotion`). It sits above the panels
(z 15) and below Settings (z 30). A step whose object is not drawn yet shows "Waiting for it to appear…" while the pod plays at 4x
(a beat at a time under reduced motion), and holds once the object's drawn alpha reaches 0.95 and the pod has played 900 ms more (`SEEN_ALPHA`, `SETTLE_MS`, 15 §10); after 25 s it shows without a pointer.
The first-launch offer is a card at the bottom centre in the same glass.
