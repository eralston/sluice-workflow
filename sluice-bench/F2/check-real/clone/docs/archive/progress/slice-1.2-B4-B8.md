# Slice 1.2-B4–B8: one event wording; History's rows; labels that say why; the attention budget

**Status:** built 2026-10-15. [22 §3, Block B](../22-v1.2.md#3-blocks): B4, B5, B6, B7 and B8.

## 1. What was built
- **B4. One wording for every event** (`@shared/engine/eventLine.ts`).
  - `eventParts` gives `{ glyph, type, id, title, action, person, subject }`, and `formatEvent` writes
    `User Story · #1234 · Permit lookup — Assigned to Mara Lind · by Jo Park`.
  - **The person** is who made the change. It is left out when unknown, or when the action already
    names them.
  - **The action** is the source's change, said plainly: `Created`, `Active → Resolved`, `Assigned to
    …`, `Moved to …`, `Joined Feature #…`, `Linked PR #…`, `Opened`, and so on.
  - **A PR's events** name the PR: `PR · #9501 · Title — Merged`.
  - **Pack words.** Each pack's adapter has a new `event` with its own words for an attachment's end
    (SDLC `Merged`; CRM `Accepted`, with approvers as the person, and `Lost`; Todo `Filed`,
    `Discarded`). `@shared/packs/events.ts` `partsOf` caches them, so every surface reads one wording.
  - **The theme's line.** Beneath it, under Solar, `theme/starChart/actions.ts` `chartAction` says
    what the chart shows, in its words and with no ID: "the asteroid is being mined", "the enemy ship
    is destroyed", "Mara Lind's captain takes the asteroid", "the tender shuttle delivers". Nothing is
    said for containers.
  - **Readers:** History and the ruler's tooltip. Closes V7.
- **B5. History.**
  - A beat's card lists its events, the headline first, up to `HISTORY_ROWS` (4), then "+N more". Each
    row is the line, with the chart's line beneath it, quieter.
  - A card still to come shows its headline alone, so the Next group stays short and the present card
    stays in view. The first try, with every row, pushed the present card off the panel.
  - **Now.** While playing, the rows whose events the plates are noting carry a cyan rule
    (`.history-row.is-now`, `data-event-key`).
  - History no longer lights the current card's object in play: the notes do that.
- **B7. The attention budget** (`engine/maneuvers.ts`).
  - **`ATTENTION_MAX`** (2). A maneuver, not light work, whose subject, frontier or target is an
    objective or a threat counts. One starts only once fewer than two are playing.
  - **The hold.** Each holds its place for its length, and at least `NOTE_MIN_MS` (1.8 s). Placed ones
    never move, so the budget holds whatever order the sequencing runs in, alongside `crewBusy` and the
    protected moments.
  - **Crowds.** A crowd of arrivals (`CROWD_MIN`, now shared with the interpreter) comes in quietly
    and asks for none.
  - **Beats** lengthen as the queue does. The episode budget compresses gaps first, as ever.
- **B6. The notes** (renderer).
  - **The note.** `CastLabels` windows carry their maneuver's span, a note and its event. While its
    maneuver plays, the plate wears the note under its title (`.holo__note`): the event's action, or
    for a PR's event `PR #12 · Title… — Merged`, the title cut at `NOTE_TITLE_MAX` so the action
    always shows.
  - **The tell** lights only the maneuvers that start the beat.
  - **Two plates.** The label layer shows at most two piece plates. One lingering past its maneuver
    crossfades out for one whose maneuver starts; any other waits.
  - **Hand-off to History.** The director publishes the events whose notes show
    (`onNowPlaying` → `store.nowPlaying`), and History marks those rows.
- **B8. The guard** (`solar-dense.spec`). Convoy Planning Pod plays from the start at 2×, sampled 300
  times. It checks:
  - never more than two piece plates lit (opacity over 0.55);
  - History's *now* rows equal the scene's noted events (300 of 300);
  - every note is its History row's action.

**After the review (2026-10-15).** A fresh-context reviewer found these; all are fixed, each with a guard:
- **The crossfade gave up two places for one yield**, so three plates could show at full opacity. A
  plate cut at the instant now leaves its place.
- **It also faded a plate whose maneuver was still playing.** Only a piece whose every window is
  lingering yields now.
- **The note and the *now* event could disagree.** There is one rule now (`speaking`): of a piece's
  shown windows past their lead, the one playing, else the latest. It gives both the note and the
  event History marks. There is no note in a lead, and none while paused (History's rule went off on
  pause too).
- **A merge serving two pieces lights both plates**, so it now counts as two in the planner
  (`attends` is a count). Before, a second interaction ran alongside it with no place for its plate.
- **A beat ending on a short labelled maneuver** now stays open for `NOTE_MIN_MS`.
- **A playing event past `HISTORY_ROWS`** now takes the lightest row's place, so it always has a row.
- **15 §9** said a PR opened or abandoned gets a note. Their maneuvers cast no piece, so the doc now
  says none.
- **The theme's seat word** is *homeworld*, as the kind map's, so History's chart line says "by …'s
  homeworld".
- **`v11-P2.ts`** no longer clicks the removed toggle.
- **B8's checks** were partly circular. Each note now carries its event (`data-event-key`) and must
  match that event's own *now* row, by its action and, for a PR, its number.
- **New unit cases:**
  - `castLabels`: two lingering plates while two windows start; a piece lingering and playing while
    another starts; nothing paused or in a lead.
  - `maneuvers`: a merge serving two pieces; a beat's last note; the budget with one captain's queue.

## 2. Contracts changed
- **03 §terminology:** *The event line* is new (`eventParts`, `formatEvent`, the adapter's optional
  `event`).
- **14:** `EventAdapter.event`, `Noun.short`, `Terminology.short`.
- **05 §8:** *Attention is budgeted*.
- **13 §6:** the notes and the budget.
- **06 §2:** *History cards* (rows, *now*, no play light).
- **15:**
  - §9 *Event wording* (new);
  - §10 rows: `HISTORY_ROWS`, `ATTENTION_MAX`, `NOTE_MIN_MS`, `NOTE_TITLE_MAX`, and `CROWD_MIN` (now
    guarded);
  - the lead row (only the beat's start is told).
- **`ThemePack.action`** is new.
- **No departure from 02.**

## 3. Checks
- **Unit:** `npm test` passes.
  - `eventLine.test.ts` (new): the format, assignment's *by*, a PR's parts and note, other packs'
    words, and the chart's line carrying no ID or source word.
  - `castLabels.test.ts`: notes, playing, at most two, the crossfade.
  - `maneuvers.test.ts`: four people's work queues two at a time, the beat as long as the queue; a
    crowd of arrivals together.
- **The guard fails without the budget.** With `ATTENTION_MAX` at 99, B8 sees five plates at once.
  The first window tried (a quarter in, at 1×) never had more than one, so the guard now plays the
  whole episode.
- **e2e:**
  - `slice2`'s History card test reads the new wording.
  - The mapped `slice1`, `slice2`, `slice3b`, `solar`, `solar-play` and `solar-dense` pass. Two
    passed alone after failing once under full parallel load; the full run decides.
- **Drive:** `v12-B`. In its playing stills, the notes and History's *now* rows name the same
  events, at most two at a time.

## 4. Human gates
**HG-B-play.** Play Convoy Planning Pod at 1× and judge:
- the notes' wording;
- the pace under the budget (one or two things at a time, or too slow?);
- whether History follows.

Stills: `review/v1.2/v12-B/` (`playing-*`, each note listing the notes and the *now* rows).

## 5. Known limitations and open questions
- **A plate with no room.** A noted plate that finds no clear place stays hidden, but its event is
  still *now* in History. In the dense pod, a second *now* row sometimes has no visible plate.
- **A plate at the edge.** A plate near the left edge can be cut by the viewport. This is the
  placement's fallback, unchanged here.
- **The theme's verbs** ("mined out", "crippled") follow 15 §9's maneuvers by role and rung. A
  rung's maneuver that changes its look needs its verb changed too.
- **Station plates** (captains' and stations') carry no notes. A PR's merge note is on the work it
  serves; its opening and abandoning have none (their maneuvers cast no piece).
- **A maneuver pushed by an earlier beat's protected moment** (the interpreter's carry) can start
  later than planned, outside the planner's budget. The label layer still shows at most two plates,
  so such a maneuver can play without its plate or note. Rare; not seen in the fixtures.
