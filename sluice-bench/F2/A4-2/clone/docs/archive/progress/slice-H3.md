# Slice H3: Time to first look

Started 2026-10-08, after opening SwiftTerm's current sprint on the real org took about 140 s. The
dev log for that open counted 2,887 history calls, 392 review calls, 244 PR calls, 44 WIQL calls and 18
item-batch calls. Only the item batches were needed to draw the scene.

## Decided with the user (2026-10-08)
- **The first look** is the sprint's list of items plus their current state: three calls. The pods'
  progress is right, and planets appear at once. Tasks, history, PRs, reviews, pictures and the
  sprint's leavers stream in after it.
- **The player** reads "Gathering history N / M" for the scene on screen, whose items come first.
  It's playable once that set is in.
- **Removed, vanished, or 404 items depart and leave:** the scene, In view and the counts. Replay
  before the removal still shows them. This settles the slice-6 Removed TODO.
- **Sprints moves onto the streaming loader now.** Backlog's level loading moves onto the same engine
  in a follow-up.
- **The loading moment over the galaxy** is a plate in the Connect panel's style.

## Built
- **Main:**
  - `sync/scheduler.ts`: priority classes, focus, coalescing, cancel, and a global throttle pause.
  - `sync/sprintStream.ts`: the look, fill and idle stages. History is skipped when the cache is
    current.
  - `AdoService.openStream`, `focus`, and `scope.updated` batching.
  - The transport: aborted waiters leave the line, and a throttle sets `throttleGate`.
  - `cache`: `IN`-list reads.
  - `people()`: pictures only for the given identities.
  - `loadLevelHistory`: a sprint variant.
- **Shared:**
  - `applyCurrent` has a sprint target, keeps `iterationPath`, and takes only the work beneath bodies.
  - The pod order is seeded from current items.
  - Removed items leave the Backlog and Sprints sources.
  - `enterLoad` may return `{ kind: 'focus' }`.
- **Renderer:**
  - `LoadingPlate.tsx` replaces `SyncBanner`.
  - `scopeData` gains the stream watcher, coalesced reloads, and a quiet revalidate.
  - `nav`: focus on render, waiting for a pod's Tasks on entry, and "gathering" in `playState`.
  - Playback keeps its schedule while the scene's history gathers.
  - Transport has "Gathering history".
  - `GraphScene` has the enter / update / exit join, with Arrive and Depart. The director's emerge
    and rekey use Arrive.
  - New test hooks: `motions()` and `stream()`.

## Contracts and docs changed
- **02 INV-10:** Removed items leave.
- **03 §5c (new):** the scheduler, the stream, the IPC, and the hooks.
- **04 §5b:** a sprint streams; the full sync stays for the AC-27 golden.
- **05 §5:** Arrive and Depart.
- **06 §3:** the loading plate, "Filling in", and "Gathering history".
- **91:** Removed settled; Arrive/Depart tunables added.
- **07:** this slice, and the Removed TODO moved out of slice 6.

**Departures from the plan:**
- **One scheduler per streaming scope**, not per org. One scope streams at a time, and the
  transport's 4 in flight is the org budget.
- **"Filling in" shows the queue left**, not N / M, because main doesn't know M up front.
- **No load worker yet.** The `IN`-list reads came first; measure with the dev log before moving
  `load()` off the main thread.
- **The gallery has no Arrive/Depart demo row yet.**

## Second pass (2026-10-08): playback per scene, and the + crumb
**Decided with the user:**
- **Playback belongs to the scene on screen.** Leaving it pauses, keeping the time. Following a
  captain out of the scene is off for now: their work elsewhere gets the "outside this view" note.
  So a history load serves only the current view and what's under it.
- **Adding lives in the breadcrumb:** a trailing + crumb, and ▾ checklists for removing.
- **A pod added in a sprint saves the project's Area Path,** the one set shared with Backlog.
- **Search can add** what isn't in the chart.

**Built:**
- **`SprintStream`:**
  - History waits for its scene: `wantHistory`, `inScene`, and `deferred`.
  - A focus change defers history not yet started for items out of view, and queues what's now in it.
  - The `drain` loop re-runs the closure only when new history has landed, and calls `done` again
    after a focus brings more.
- **`playback.ts`:** a scene change while playing pauses, and `travel` never leaves the scene.
- **nav:** `addable`, `addProject`, `unpinProject`, `addArea`, `removeArea`, and `rescope`. Rescope
  swaps the open scope in place, cuts scenes the new scope can't draw, and reveals what joined. It also
  fixes the remembered sector keeping old pods.
- **The hierarchy UI** gains `rescope` (Sprints).
- **The breadcrumb:** the + crumb and `AddPicker.tsx`; checkbox items in the sibling menu ("All
  projects ▾" in ADO mode, and the sprint's pods); search "Not in the chart" rows.
- **Galaxies** arrive and depart too.
- **An aborted call** ends quietly rather than as a failure chip.
- **Fixture:** sprint-pods gains an unsaved Area Path, Quasar Pod, with one Sprint 41 story (9109).
  The goldens are unchanged: they cover its Backlog scopes, which don't include it.

**Tests revised:** AC-20 (a move pauses), AC-23 (following stays in its system; Story 211 shows the
note), and abandoning the journey (leaving while playing pauses, which ends following).

**Docs:** 05 §2 (Navigate) and §6 (following stays in the scene); 06 §3 (the + crumb, search); 07.

## Golden changes (deliberate)
- edge-history: Bug 821 (Rejected) left the Feature 802 system and the sector's miniature at the end,
  and its close-up scene is gone. The diff against the pre-change baseline only removes things.
- AC-11's route check now looks at a moment before the rejection.

## Checks
- **H3-1:** `tests/unit/stream.test.ts` (8 tests).
- **H3-2:** `tests/e2e/sprints.spec.ts` (the new streaming walk, with every fake call slowed to
  150 ms: the first look about 0.1–0.3 s after the plate) and `tests/e2e/motions.spec.ts`.
- `npm test` (230), `npm run e2e` (111), typecheck and lint are clean.

## Known limitations and open questions
- **Arrivals at sector scale:** the first look already holds every planet, so arrivals there are rare.
  The "glitter" is mostly stage changes as history lands.
- **Slot order can still shift** when leavers arrive from the idle samples. Existing planets glide.
- **Leaving a sprint for another** drops the old stream's unstarted work. Reopening it revalidates
  quietly, and history already cached costs nothing.
- **HG-H3:** the user opens SwiftTerm's sprint on the real org and reports pass or fail. The dev log's
  `stream-look`, `stream-fill` and `scope-updated` rows give the timings.
