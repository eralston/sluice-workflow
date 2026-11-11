# Slice 5: Live hardening and incremental refresh

Started 2026-10-09, after H1–H4 closed. The slice was smaller than written: H3 and H4 had already
built cancellation, partial-coverage notes, and incremental updates to the renderer (`scope.updated`).
What was left was offline, staleness, the refresh cadence, and profiling.

## Decided with the user (2026-10-09)
- **A refresh runs on reopening a scope, and on an explicit Refresh.** Never on a timer and never on
  window focus: a scope you're looking at must not move under you.
- **It lives at the shared layer,** so both loaders use it — the sprint stream now, and `loadLevel`
  until Backlog moves onto the stream after this slice.
- **Staleness reads at both levels:** a scope-level header for "how old is all of this?", and a
  per-object mark for "which one of these is old?".

## Built
- **Offline works from cache (AC-31).** This was genuinely broken: any network failure left an error
  and no chart. `fromCacheIfOffline` now falls back to the cached bundle when ADO is *unreachable* and
  the scope was synced before. A *refused* read — a bad token, a denied scope — still errors, because
  those need an answer rather than a stale chart.
- **The coverage chip** (`panels/Coverage.tsx`) in the status bar: "Synced 4 min ago", amber and
  "partial" when something's missing, an **Offline** marker, and ↻ Refresh. Its panel lists the
  coverage notes and profiles the view. `coverage.syncedAt`, `partial` and `notes` had existed in the
  bundle since slice 4 but were surfaced nowhere.
- **Per-object staleness, end to end.** New `coverage.stale` carries the entities ADO refused (403/404
  after being seen); both the full sync and the stream record them; `makeCtx` turns them into
  `flags.stale`, which was a declared-but-unused field from 02 §3. The chart draws a small clock badge
  at the object's upper left (ivory on ink, never a hue, INV-20), and In view shows a "last known" chip.
- **The refresh cadence** (`sync/refresh.ts`, shared): `countRefresh` per scope; `prsWorthRefetching`
  (open, or closed within 7 days); `itemsToRescan` (history we hold, changed within 14 days, newest
  first); `history(..., { rescan: true })` re-reads from the start. Wired into the stream's `refresh()`
  and `loadLevel`'s catch-up.
- **A settled sprint re-reads on reopen.** Found while testing AC-31: reopening a sprint whose stream
  was still open made *no network call at all*, so "refresh on reopen" didn't refresh. `SprintStream.refresh()`
  re-runs the 3-call look and lets the checkpoints carry the rest, so an unchanged sprint costs the look.
- **The stream never refreshed PR records at all,** so an open PR that had since merged would have
  stayed open on the chart forever. `refetchPrs` re-reads the ones that could still change.
- **Profiling:** a 240-frame ring buffer in `ChartApp` gives median, 95th and worst frame times, shown
  in the coverage panel beside the cache size on disk, in the map-debug readout, and logged as
  `profile` in the dev log. Also `migration 004` indexed `events(org_key, entity_key)` in H4, which is
  what made the per-entity derived rebuild cheap.
- **The unearned sampling note is gone.** The first look used to assert "membership is sampled daily"
  before anything had sampled; it's now added only when `EVER` turns out to be unsupported.

## Test affordances added
- `STAR_CHART_FAKE_FAIL_STATUS` picks the simulated failure's status (500 by default; 403 or 404 for a
  refusal that keeps the last known facts).
- `__starChartFakeTransport` in the main process, so a spec can take ADO away mid-run with no
  production surface for it.
- `forgetScopes()` drops the renderer's in-memory bundles, so a reopen really reads the cache.

## Checks
- **AC-30:** the throttle half was already covered (`tests/unit/ado.test.ts`: Retry-After honoured,
  jitter capped, a 429 retried). The resume half is new in `tests/unit/refresh.test.ts`: a cancelled
  stream keeps its committed checkpoints, and a fresh stream on the same cache asks only for what's
  missing and still matches `toHistory`.
- **AC-31 (E):** `tests/e2e/offline.spec.ts` charts a sprint, takes ADO away, forgets the loaded
  bundles, and reopens — the same pods draw, no error, and the bar shows Offline with the age.
  Refresh while offline keeps the chart; with ADO back it clears.
- **Staleness:** `tests/unit/stream.test.ts` (a refused item is kept, marked, counted, and its
  neighbours aren't) and the e2e above (the badge, the "last known" chip, "partial").
- **The refresh cadence:** `tests/unit/refresh.test.ts` — the count is per scope and rescans every
  seventh; the PR set is open-or-recent; the rescan list is recent-with-history, newest first; a
  rescan re-reads from `skip=0` where a plain read resumes; and a reopened unchanged sprint re-reads
  no history but does look at its PR.
- `npm test` (248), `npm run e2e` (118), typecheck and lint clean.

## The status bar, tightened (2026-10-09, from the user watching it)
- **It was twice the height it needed.** `.app` declared four grid rows (`40px 1fr auto 28px`) but had
  three in-flow children, so the status bar auto-placed into the `auto` row and the fixed 28px row sat
  below it, empty — the black band. Three rows now, and the bar is as short as its content (25px,
  flush to the bottom).
- **The keyboard hints are the least of it:** `flex: 1 1 0`, so they take only what's left, on one
  line, truncated.
- **One request indicator, not two.** The per-family chip row on the left is gone; its abacus is folded
  into the right-hand button — a bead per call in flight across all kinds, the busiest kind named, a
  throttle wait said plainly, failures as a coral count. `Beads` now takes plain counts so the button
  can show the total. Two e2e tests were rewritten for it (they asserted the chip row).
- **Three things that shot revealed:** the coverage panel was clipped by the status bar's
  `overflow: hidden` (now `position: fixed`); a generic "could not be read" note repeated what the
  per-object list already said (dropped when the exact keys are known, and the pluralisation fixed);
  and a station kept its repo's GUID until some unrelated change came by, because `repos()` reported
  no change of its own.

- **Three pixel baselines re-accepted** (`sector`, `feature`, `body`): the chart area grew by ~22px
  when the empty row went, so the whole scene sits higher. The diff was everything doubled at a small
  vertical offset — a shift, not a rendering change.

## Pictures the token can't read (2026-10-09, from the real org)
- **The finding:** the user's PAT can't read teammates' pictures. Every avatar call answers 401, once
  per person (26 in one run). The initials-on-a-colour fallback already covers it.
- **Quiet, not hidden.** An avatar 401 is kept in the request panel as an error, with its full
  details, but marked `quiet`: it never turns the Requests button coral or counts toward it (`isQuiet`
  in `contracts/neterror.ts`; `loudErrors` in `activity.ts`). It can't mask a real expired token,
  because that fails every other family too, and those stay loud.
- **Widened to 404 the same day** (the user: either status means we can't get an image, which is a
  visual nice-to-have rather than missing data). So the rule is: a *picture* answering 401 or 404.
  A 403, a 429, a 5xx or no response on a picture is still loud, and so is 401/404 on anything else —
  a deleted work item must still shout. A 404 reads "No picture", not "Not found", and doesn't say to
  refresh the project list.
- **Its explanation was wrong for this case.** The generic 401 text says "enter a new personal access
  token", which is exactly the wrong advice when the token works. Pictures get their own wording
  ("Nothing to fix. Their initials are shown instead"), and the panel notes that they're expected and
  mutes their rows.
- **No retry loop:** a failed fetch is stored as `''` ("asked, none"), so each teammate is asked once.
- **Deferred to slice 6:** a way to add pictures by hand, kept outside the cache so Purge doesn't lose
  them, which also means designing the app's first settings surface. Recorded in 91, *Pictures you
  add by hand*, and in 07's slice 6.
- **Tests:** `tests/unit/activity.test.ts` (9) — the rule, that it stays listed but not loud, that a real
  expired token still is, and the wording; `tests/e2e/activity.spec.ts` — with every picture answering
  401, the panel lists them as expected errors and the button stays calm.

## The audit against the definition (2026-10-09)
Re-reading slice 5 and 04 §6 line by line, and testing each claim instead of assuming it, found three
real gaps and one untested claim. All fixed; one limit deliberately left.

- **A cold start with no connection failed to start.** AC-31 passed mid-session, but `boot()` awaited
  the project list with no fallback, so launching the app offline (the actual "no wifi" case) died on
  `ADO projects: no response` and never reached the galaxy. Now `projects.list({ cacheOnly })` answers
  from the cache, the renderer falls back to it when ADO is unreachable, and the galaxy says Offline
  with a ↻ to retry. Verified the new test fails without the fix. (The test also needed
  `STAR_CHART_PROJECTS_TTL_MS`: a 30-second memo of the project list was hiding the outage.)
- **"401 during sync: stop, and ask for a new PAT" was only half true.** A token dying mid-fill failed
  fast (6 calls, no hammering) but silently: the only sign was a coral count on a button. Now the
  stream stops, drops its queue, marks the scope partial, and tells the user to enter a new token.
  A picture's 401 does not trigger it.
- **A race I introduced in H3:** a stream's last word (finished, or refused) could arrive before
  `loadScope` had heard the first look's reply, which then put "Filling in" back over it. Caught by the
  new test; fixed with an `ended` marker.
- **The throttle pause had no test.** Added: a 429's `Retry-After` shuts the shared gate, a queued task
  waits for it though a slot is free, and work already running finishes.
- **AC-30's cancel-and-resume was tested for the stream only.** Added for the full sync: a cancelled
  run keeps what it committed per item, isn't called done, and the next run asks past what it holds and
  ends identical to an uninterrupted one (AC-27).
- **Frame-time profiling** was already covered: `perf.spec.ts` holds the p95 under 25 ms per scene.

**Left deliberately — Backlog's refresh cadence.** The rescan clock (`countRefresh`) only ticks when
Backlog's catch-up runs, which is once per scope per app session, not on every reopen as it is for the
sprint stream. Making it tick on reopen would cost 2 calls per item each time, because Backlog's
`history()` has no "already up to date" short-circuit (the stream's compares `changedAt`, but Backlog's
children are only refreshed when their Feature is explored). The proper fix is the planned move of
Backlog onto the streaming engine, so it stays there.

## Still to do in this slice
- **AC-34 (M):** the user runs the probe against the real org and reports the pass/fail matrix only.
- **AC-35 (M):** the user syncs a real Area Path and confirms the Feature → Story → Task → PR → repo
  trace matches ADO for two or three items they know well.
- **The last-sync header's placement** is the status bar, beside "As of". If it wants to be in the
  title bar instead, that's a small move.
