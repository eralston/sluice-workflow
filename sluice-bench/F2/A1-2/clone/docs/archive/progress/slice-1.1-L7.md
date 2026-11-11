# Slice 1.1-L7: Stories and bugs hover-only, both ways with the planet's list; labels around interactions in play

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) item L7 (a, b) and the user's Q3 answer
(experimental). It builds on L1, L2 and L6 ([slice-1.1-L1.md](slice-1.1-L1.md),
[slice-1.1-L2.md](slice-1.1-L2.md), [slice-1.1-L6.md](slice-1.1-L6.md)); none of their work was reverted.
No human gate of its own. The stills below are for the user's review.

## 1. What was built
- **Hover-only pieces.** Every solar objective and threat is now `labelOnHover` (`solar.ts`), so
  outside play no piece has a plate at rest. The piece's own steps list (`pieceList`) is retired.
- **Steps in the inspector (review fix).** A selected piece's Tasks are in a new **Steps** section of
  the inspector (*Tasks* in ADO wording): each by title, its raw state, and its rung's mark (the
  holo rows' shape per rung, in the ladder's colour), in slot order. The projection carries the order
  as `ViewNode.stepKeys` (the same `stepsOf` order, Off steps kept). Only solar pieces set it, so v0's
  inspector is unchanged. This is how Q3's accepted "selecting a piece expands into its Tasks" is met.
- **(a) Both ways with the planet's plate.** The label layer gives each object a *host*: the holo
  plate that lists it as a row of its own (a seated piece's planet). A PR row's `serves` doesn't
  count. Pointing at a seated piece expands its planet's plate (L5) as if the planet itself were
  pointed at, and lights that piece's row there. Selecting the piece keeps the planet's plate
  expanded while settled, with its row marked. The piece's own plate stays hidden while its host is
  open or the pointer is on the piece. Rows learn about the chart through
  `HoloRows.markObjects(lit, selected)`, called from `setHighlight` and on expanding. It sets
  `is-lit` (the same look as row hover) and `is-selected` (the title in `--ivory` at weight 600 on a
  faint ivory wash; the weight is the non-hue cue that tells it from a lit row, INV-20). A frontier piece has no host, so pointed at, selected or lit it shows its own T2 plate: the
  title over `{type} #{id} · {state}`. The ◆ person line was already gone (L1).
- **(b) Labels around interactions in play.** A new pure `CastLabels`
  (`chart/fx/v1/castLabels.ts`) holds a window per piece. The `ManeuverInterpreter` opens the
  windows:
  - In `tell`, before its motion and load checks, it opens a window from now to the planned start of
    each non-ornament maneuver, tagged with the maneuver (`{eventKey}|{id}`).
  - In `spawn`, it retires the tagged windows of every maneuver the load tiers drop, so a dropped
    maneuver's labels fade instead of showing for nothing (review fix).
  - In `play`, it opens a window from `start − CAST_LABEL_LEAD_MS` (500 ms; for a newcomer, from its
    reveal; for a told maneuver whose window is still open, from now, so an earlier beat's protect
    pushing it later never makes the label blink out and back) to the end of the maneuver's land or
    echo `+ CAST_LABEL_LINGER_MS` (1500 ms).
  - The windows cover the cast's `subject`, `frontier` and `target` pieces.
  - The windows step at the travel rate and hold while paused, but **paused, the labels fade out**
    over `CAST_LABEL_FADE_MS` of wall time and fade back on resume (review fix: outside play, pieces
    are hover-only). In reduced motion they go off and come back without the fade. `clear()` drops
    them, so a seek clears them (INV-15).
  - `labelled()` fades each one out over `CAST_LABEL_FADE_MS` (400 ms). In reduced motion there is
    no fade, but the label still shows.

  `FxDirector.labelled?()` is forwarded by the `SwitchingDirector` in solar scenes (empty in v0).
  ChartApp passes it as `LabelMotion.cast`, and the label layer shows each cast piece's plate, title
  only, at that opacity. These plates are placed with the flashes, after the focused
  plates. With no clear place, a cast plate may cross a body but never another label.
- **Drive:** `tests/drive/steps/v11-L7.ts`. L2's drive (`v11-L2.ts`) had a dead "objective-pointed"
  step for a piece's own list; it now points at a seated piece instead (its still `08-piece-pointed`).

## 2. Contracts changed
- **Shared:** solar pieces set `labelOnHover` and, with steps, `stepKeys` (new optional
  `ViewNode.stepKeys`, not in the golden's serialisation, so no golden changed for it); `pieceList`
  was removed from `lists.ts`, and pieces have no `graph.lists` entry.
- **Renderer:** `LabelMotion.cast?`; `HoloRows.markObjects`; `FxDirector.labelled?()`;
  `SwitchingDirector.labelled()`; `ManeuverInterpreter.labelled()`; new `CastLabels` (`show(…, tag?)`,
  `showing`, `retire`, `step(dtS, paused?, wallS?)`); the inspector's `StepList` (`.steps`, `.steps__mark`); new
  `CAST_LABEL_LEAD_MS`, `CAST_LABEL_LINGER_MS` and `CAST_LABEL_FADE_MS` in `chart/fx/timing.ts`; new CSS
  `.holo__row.is-selected`.
- **Doc edits:**
  - **13 §3:** "none is hover-only" replaced, as the departure L7 records. §4.1's mega-label (both
    ways), and §4.2 and §4.3 (the steps are now in the inspector's Steps list).
  - **06 §9:** the objectives and threats bullet (the hover-only rule, the selected row at weight
    600, the inspector's Steps, the play windows, retired windows, the pause fade), and
    *Mega-labels* (no piece list; both ways).
  - **03:** `labelOnHover`, `ViewNode.stepKeys`, the piece node row, *Mega-lists* (`pieceList` retired), the
    `FxDirector`/`CastLabels` signatures, the interpreter paragraph, and a new *Hover-only pieces,
    both ways* bullet under *Labels and overlays*.
  - **14:** the §2.9 note.
  - **12:** *Mega-label*.
  - **15:** §10, three new rows (lead, linger, fade); §6, the holo-variants asteroid and hive *Shows*
    cells.
  - **19:** L7's *Today* and **State**, and three §5 decisions (the third, and the pause and retire
    wording of the second, from the review fixes).
  - **tests/README:** the drive row and the `castLabels` unit test in the fx mapping row.
- **Departures from 02/03/13:** 13 §3 (the departure L7 names), amended in this change. 02 is unchanged:
  VC-2 still holds through the object list.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (847; `castLabels.test.ts`: windows open, hold, fade, no fade, overlap, clear, and since the review a retired tell window (an open one fades, a later one never opens) and the pause fade (out on the wall clock, back on resume, off/on in reduced motion); `solarSeek`: every piece hover-only with no list of its own, a seated one its seat's row, a frontier one no one's) | Pass |
| Golden `solar.scenes.json` | Changed deliberately (`npx vitest run -u tests/golden/solar.test.ts`): only the pieces' step lists went. No v0 golden changed |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- solar solar-play slice1 review-scenes` (solar: new review-fix test, a piece with Tasks selected from the object list lists each in the inspector's Steps, with its rung and mark and raw state; the L7 test (frontier plate T2 with its meta; selected, still shown, no planet plate; seated piece pointed at, planet plate expanded with its row `is-lit`, no own plate; selected, row `is-selected` after the grace; contrast 4.5:1). solar-play: the struck hive ship hidden at rest, shown title-only while the strike run casts it, gone after; cleared at once by a seek; shown in reduced motion and gone after) | 41 passed (after the review fixes) |
| `npm run e2e:spec -- density gallery-v1 slice2`; `GALLERY_FAMILY=labels` gallery-v1 | 20 passed; 1 passed (before the review fixes; not re-run) |
| `npm run e2e:keystone` | 38 passed (after the review fixes) |
| `npm run drive -- tests/drive/steps/v11-L7.ts` and `v11-L2.ts` (`--paradigm solar`) | Passed (after the review fixes); stills reviewed |
| Full `npm run e2e` | Not run (the final phase does) |

## 4. Human gates (review stills)
- **Drive:** `npm run drive -- tests/drive/steps/v11-L7.ts --paradigm solar` →
  `test-results/drive/v11-L7/`:
  - `01`: Harbor Pod on Tue Oct 6, at rest. No piece plates; only homeworlds, captains, the star and
    the station are labelled.
  - `02`: Berth schedule export (on Planet Wren) pointed at. Planet Wren's plate is expanded with
    that row lit.
  - `03`: the same piece selected, pointer gone. The plate stays open with the row marked (ivory
    title at weight 600, faint wash).
  - `05`: Seasonal berth pricing, in the frontier, pointed at. Its own T2 plate shows.
  - `06`: Tide table widget selected from the object list. The inspector's **Steps** lists *Chart
    the high tides* and *Moon phase overlay*, each Closed with the Accomplished mark; Planet Wren's
    plate is open with its row marked.
  - `07`: the strike run stepped into (Mon Oct 5). *Alert sound loops* and *Wrong time zone on
    receipts* show their titles while cast.
  - `08`: five seconds later.
  - `09`–`12`: plain play at 1× from Thu Oct 1. Labels come and go with the beats (`10`: Tide table
    widget, Low-water warnings, Quay camera grid).
  - `13`: paused 0.8 s after `12`. The cast labels have faded; only the selected Tide table widget
    keeps its plate.
- **L2's drive:** `test-results/drive/v11-L2/08-piece-pointed.png` (a seated piece pointed at, its
  planet's plate expanded).
- **e2e still:** `test-results/solar-4-piece-hover.png` (a frontier piece selected, and Planet Wren
  expanded from its piece).
- **Watch for:**
  - Whether the selected-row mark (ivory title at weight 600, faint wash) reads strongly enough
    next to a lit row.
  - Whether the inspector's Steps list is enough for "selecting a piece expands into its Tasks"
    (19 §4 Q3), or the user wants the Tasks on the chart too.
  - Whether paused should count as not playing (the labels fade out), as built.
  - Whether a selected piece holding its planet's plate open is welcome, or should mark the row only
    when the plate is open for another reason.
  - Whether 1.5 s of linger reads well at 1× and at 4×. The windows are in effect time, so at 4× they
    are a quarter as long on the wall clock.
  - How many cast labels a busy beat shows.

## 5. Known limitations and open questions
- **The lead only works on beats that have a tell.** Playback tells only accented beats
  (`leadIn`). An untold beat's first maneuver gets no lead: its window can't open before the beat
  is spawned. Later maneuvers in the beat get the 500 ms lead.
- **Paused mid-maneuver,** the windows hold (as the effects do), but the labels fade out and come
  back on resume. This reads "hover-only when not in playback" as covering pause; it is a choice the
  user should confirm. No e2e covers the pause fade (there is no way to resume a stepped beat
  without playing on); the unit test does.
- **Lit from a PR row:** a seated piece whose planet's plate is closed shows its own plate, lifted
  (as in L6's stills), since its host isn't open. This was judged useful (the PR row only names the
  number), but it is a choice.
- **A seat with more than `ROW_BUDGET` (16) pieces:** a piece past the budget isn't a row, so it has
  no host and falls back to its own plate when pointed at.
- **Ornament maneuvers (light work) and quiet crowd arrivals don't label** (and neither does the
  opening), to keep a busy beat calm. If the user wants every interaction labelled, it is a one-line
  change in `play`/`tell`.
- **The selected-row mark** is a wash and an ivory title at weight 600, not an ivory edge. An edge
  is clipped, because the rows scroll and a row runs 4 px past them on each side.
- **Q3's "selecting a piece expands into its Tasks"** is met by the inspector's Steps list, not on
  the chart. Recorded in 19 §5.
- **The ADO-wording Steps heading** is the first step's type with an "s" (*Tasks*); a pack whose
  step type pluralises differently would read oddly.
- **An expanded planet plate still covers neighbours** (L2's note). In `02`/`03`, Planet Wren's
  plate sits over tide-gateway's hull.
- **No test for touch:** a long press on a piece behaves like hover (pointer events), but it isn't
  covered.
