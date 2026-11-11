# Slice 7: Logging, errors, and missing data

Built 2026-10-10. Every choice below was made with the user on 2026-10-10, before building.

## Decided and built
- **What a failure does** (`failureTier`, `src/shared/contracts/neterror.ts`; 04 §6):
  - `stop` (401): as before.
  - `gone` (403/404/410): that one thing is stale or listed missing, and the scope is partial.
  - `transient` (no response, 408, 429, 5xx): retried first. Throttles keep their own up to 6 tries;
    500/502/504 and dropped connections now get 3 (`http.ts`, they weren't retried at all). Then it's
    treated like `gone` on one item, or fails the sync on a scope-level call.
  - `error` (anything else): thrown, never hidden.
  - `isGone` (`sync.ts`) uses the tiers, so a dropped connection part-way through a stream marks one
    item partial instead of failing everything.
- **Missing PRs and repos** (`src/main/sync/missing.ts`; 02 §3, 04 §6). These used to be dropped
  quietly.
  - A PR read before keeps its last known record (still drawn) and is marked stale; its vessel wears
    the clock badge.
  - A PR never read, or a repo whose PRs can't be listed, is only listed.
  - Coverage gains `missing`. The coverage panel says "N pull requests couldn't be read" and lists
    each with its last known title and why.
  - Every sync asks again (the stream adds them to its PR refetch), and an answer clears the entry
    (`mergeMissing`). All three loaders record them: the full sync, `prsFor`, and the stream.
- **Cache repair:** a 404 during a rescan removes the item everywhere (`Cache.forgetWorkItem`); a 403
  keeps last known.
- **An opt-in diagnostic log** for packaged builds.
  - A switch in Connect, which starts or stops logging at once.
  - The same redacted log under `userData/logs`, 3 runs.
  - "Show log file" opens Finder.
  - Developer runs keep logging as before.
- **Sprint coverage** (04 §5b), all through the shared `underPath` (`src/shared/paths.ts`, which
  replaces five local copies):
  - **Child iterations count.** "Sprint 7\Hardening" is in Sprint 7: `UNDER` in membership and
    `sprintItems`, and ORed `EVER` clauses over the iteration subtree.
  - **A second `EVER` per pod,** also requiring the item to have ever been in the pod's areas. It
    finds a body that left both the sprint and the pod at `fill`, not only from the idle samples.
  - **Per-team cadences.**
    - Teams, their area values, and their sprint lists are read when the chooser opens, kept in
      settings.
    - Each pod is matched to its team (`src/shared/teams.ts`; ties are ambiguous and left
      unmatched).
    - Each sprint carries the pods whose team runs it, and opening one includes only those.
    - With no team data, every pod runs every sprint, as before.
    - The probe has a Team settings row. The fake ADO serves teams, with a default project team when
      a scenario names none, as real ADO has.
- **A new fixture, `sprint-gaps`** (invented names), kept out of the main scenario list so other
  goldens don't move. It has a child iteration, a double leaver, and two teams on different
  cadences.

## Not built (moved to 90)
The gallery's Arrive/Depart row, and "Filling in · N of M".

## Tests changed
- `stream.test.ts`: the `EVER` count is now 1 + one per pod.
- `devlog.test.ts`: the opt-in rule.

## Checks
- `npm test`: 360 pass.
- `npm run e2e`: all pass (106 + 21).
- Typecheck and lint clean.
- New: `tests/unit/slice7.test.ts` (14 checks), `tests/e2e/slice7.spec.ts`,
  `tests/e2e/diagnostics.spec.ts`.
- **Human:** re-run AC-34 (the probe, now with Team settings) and AC-35, pass or fail only.

## Then: splitting the renderer giants (2026-10-10, no behaviour change)
Mechanical moves, so the board mechanics land in a clean structure. Every golden and pixel baseline is
unchanged, and the full suite passes.
- `fx/director.ts`, 1,689 → 1,064 lines, now holds the director alone. The rest moved to:
  - `moves.ts`: `Pursue`, `OrbitTravel`, `Hold`, `RadarMove`, `Withdraw`, `FadeIn`, `Departure`.
  - `ships.ts`: `Escort`, `GuestShip`, `ShipTell`.
  - `moments.ts`: `Protect`, `Eclipse`, `GlowTell`.
  - `trails.ts`: `JumpTrail`, `exitDir`, `destinationOf`.
  - `timing.ts`: every timing, colour and limit.
- `scenes/GraphScene.ts`: the screen-space placement (lane, attach, along, track) moved to
  `scenes/placement.ts` (`placeInScreen`).
- `ChartApp.ts`: `fitFor`, `boundsOf`, and the frame-the-action and follow-camera targets moved to
  `chart/framing.ts`. `ChartApp` keeps the gates (transitions, the hold around a click, reduced
  motion) and the tween.
- `nav.ts`: the breadcrumb menus moved to `navSiblings.ts`. **`goTo` stays in nav:** it drives nav's
  private state machine (`render`, `saveCurrent`, `userNav`), and moving it would only export those
  to import them back.
- Also from the move: one shared `underPath`, replacing five local copies.
- A timing flake fixed: an `ado.test.ts` transport now uses an instant sleep, since dropped
  connections are retried.

