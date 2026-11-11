# Slice 1.3-B1: the PR stat line

**Status:** built 2026-10-27; waiting on HG-B (this item's part). Plan: [23-v1.3.md](../23-v1.3.md) Block B. Fixture data only (INV-18).

## 1. What was built
- **The line.** One quiet T3 line under each PR row of an expanded station plate: `✓ 2  ⧖ 1 · 4 pushes · 3 threads · M`.
  Segments show only what was read. Votes: `✓` approved (votes 10 and 5 together: approved with suggestions
  folds into the check), `⧖` waiting (-5), `✕` rejected (-10); no vote and groups are skipped. Pushes = the PR's
  iterations. Threads = threads a person started (not deleted, not typed by `CodeReviewThreadType`, not all
  `commentType: system`, at least one live comment). Size band `S`/`M`/`L` by files changed in the last iteration
  (S up to 5, M up to 20; 15 §6 `pr-stat`, guarded by `docTables.test.ts`). Collapsed plates and the title tier are unchanged.
  Pure code: `src/shared/prStat.ts`; row field `MegaRow.stat` (`lists.ts`); drawn in `holoRows.ts`, styled `.holo__stat` (T2 sub colour at 9 px, kept on lit/selected rows; T3's colour failed the 4.5:1 contrast check at 4.39:1, so the line is quiet by size, not by tier colour: a deviation from "T3" in 23's wording).
- **Data.** `src/main/sync/prStats.ts` (`readReview`, `readPrStats`) reads reviewers, threads, iterations and the last iteration's changes (paged by
  `nextSkip`, 1000 per page, at most 10 pages) for every PR, in the full sync, the level loader (`prsFor` with approvers) and the sprint stream (the
  `votes:` task per PR, which now also reads stats and calls `changed` so the plate fills in behind the scene). Parsers in `parse.ts`
  (`voteCounts`, `humanThreadCount`, `changePage`, `prStatsOf`). Any failed or refused call leaves only its fact out (no banner); a PR that gave nothing stores `{}`.
- **Cache.** Migration `005_pr_stats.sql`: additive `pull_requests.stats_json`. Nothing cleared, no `DERIVATION_VERSION` bump (derived tables don't hold it).
  `putPr` now names its columns; `cache.prs()` returns `pr.stats`. A PR with no stats counts as worth re-reading (`prsWorthRefetching`), so PRs cached before B1 fill in on the next refresh; otherwise cadence is unchanged (open, or closed within 7 days).
- **Flow to the plate.** `PullRequestFact.stats` -> `derive` -> `ScopeHistory.entities.prs[].stats` (IPC schema extended) -> `ProjectCtx.prStats` -> `facilityList`.
- **Fixtures.** The DSL gained `prStats(prId, spec)`; the fake ADO serves reviewers with votes, threads (human plus system, deleted and typed noise), `/iterations` and paged `/iterations/{n}/changes`
  (a PR with no `pushes` refuses the last two with 404). Every bundle PR now carries `stats` (at least `threads: 0`), matching the fake (AC-27 holds).
  Halcyon: `prStatsFor` (hash of the PR number, no generator draws, so nothing else moved) gives every PR votes, pushes, threads, files; Comet's two PRs are hand-set.
  Demo covers votes 10, 5, -5, -10 and bands S, M, L. `npm run fixtures` re-run (generated files are gitignored).
- **Drive steps:** `tests/drive/steps/pr-stat.ts` (HG-B still). Still: `review/v1.3/B/B1-quasar-station-plate.png`.

### Review round (fixes)
- **Failures:** the stat reads never throw an `AdoError` into the PR pool. `readReview` returns what failed; `surfaceReview` rethrows only what the
  pre-B1 approvers path threw (after the stats are stored). A transient failure (0, 408, 429, 5xx) stores nothing (the PR stays unread and is retried
  once at the next refresh); a refusal (401/403/404) stores what was read (`{}` if nothing). A threads refusal sets the final-votes note only when the
  reviewers call did not 404. Tests: 429/500/503/0 on each of the four calls, approvers path unchanged, no false note.
- **Cost:** stream stat reads moved out of the scheduler into `runStats`, which runs after `done` (two at a time), so `drain`/`finish`/the rebuild never
  wait; `fill()`'s promise waits for them (tests). `readPrStats` reads only what could have changed: reviewers and threads for open/recent/unread PRs,
  iterations and changes when `lastMergeSourceCommit` moved (stored beside the stats). Cached closed PRs cost 0. The feature load now reads stats inline.
  Per-PR call counts are in 04 §6a-1.
- **R4:** every PR row has the line's height from its first draw (`holo__stat--empty`). The tall plate no longer runs under the player: a plate
  that doesn't fit is capped to the room between the player (inset + 20 px) and the view's bottom and scrolls (`labels.ts`: `room`, `natural`,
  `LabelMotion.topInset`; `camera.top`); title and subtitle lines no longer shrink in a capped plate (`holo.css`).
- **R3/R12:** the PR's Inspector body shows the same line (*Review*).
- **Glyph:** waiting is now `⧖` (`◷` read as a dot at 9 px, and is the sprints' current mark). Checked in the retaken still.

### Second review round (fixes)
- **401 (major):** on the stat path a 401 is a dead token (04 §6), not a refusal: `readReview` flags it (`unauthorized`; a threads 401 is no longer
  "needs more scope"), `quietly` rethrows it, `readPrStats` and `surfaceReview` throw it. Nothing is stored for that PR. A full sync or level load
  fails with the 401; the stream's `runStats` stops and calls `checkRefused`; a level load's deferred run ends. Only 403/404 are refusals for good.
  Tests: a 401 on each of reviewers, threads, iterations and changes, in the full sync, the level load and the stream.
- **Double read:** the stream's `approvers()` leaves its `ReviewRead` in `statsTodo`, and `runStatsJobs` hands it to `readPrStats` (a test counts one
  reviewers call per completed PR). `queueReviews` no longer overwrites a waiting entry.
- **Throttle gate:** one shared runner, `runStatsJobs` (prStats.ts), waits for `throttleGate` before each batch of two; the stream and level loads use it.
- **Feature and history loads:** their stat reads are deferred (`statsJobsFor`, `runStatsInBackground`), read after the level returns, two at a time,
  behind the gate, until aborted. They have no channel to tell the view, so the lines show on the scope's next load. 04 §3 (both rows), §5a's
  `feature` row and §6a-1 are corrected. `settleStats()` lets tests wait.
- **Capped plate:** while capped, the natural height is read live from the rows' scroll height each frame, so rows that grow or shrink are judged as
  they are; an uncapped plate re-measures when its rows change height.

### B2 review change to the 401 rule (2026-10-27)
The second round's "a 401 on any of the four calls is a dead token" is narrowed. ADO answers a token **missing a scope** with 401
(TF400813), and threads can need `vso.threads_full`, so a **threads** 401 is a missing scope: `readReview` treats it as `threadsDenied` (the
existing final-votes note), never `unauthorized`, so it never stops a run, fails a sync or refuses the token. A 401 on **reviewers,
iterations or changes** (plain Code read, the PR record's own scope) stays a dead token as before. `prStats.test.ts`: the threads case left
the dead-token loop for its own describe (full sync passes with the note and no threads fact; the stream never refuses). 04 §1, §6a-1.

## 2. Contracts changed
03 §2 (`PrVotes`, `PrStats`, `PullRequestFact.stats`), §4 (`entities.prs[].stats`), `MegaRow.stat`, §9 additions (`stats_json`); 04 §3 (two call rows), §5 step 7, new §6a-1, probe row note;
02 (Reviewer votes line, tightened); 09 (PRs skip Nearing, votes touch nothing); 15 §6 (new `pr-stat` table). `tests/README.md` mapping.

## 3. Checks
- `npm run typecheck`, `npm run lint`: pass. `npm test`: 76 files, 1113 tests pass (new: `prStats.test.ts` 13; `halcyonCoverage` +4).
- Goldens moved, intended: `solar.scenes.json` and `meridian.scenes.json` gain `stat` on every PR row (and the comma after `subtitle`); nothing else.
- `npm run e2e:spec -- demo`: 6 passed (new: Quasar's expanded station plate shows each PR's stat line, values from the fixture, T3 colour and size).
- `npm run e2e:spec -- slice4 explore activity offline solar`: see the final report. `npm run e2e:spec -- slice4 explore activity offline solar` (first run: 2 solar contrast failures, 4.39:1, fixed by the colour change above), then `demo solar`: 43 passed; `npm run e2e:keystone`: 41 passed.

## 4. Human gates
**HG-B (stat line part):** `review/v1.3/B/B1-quasar-station-plate.png` (retaken after the review round: the plate sits below the player and scrolls). Looked at: the line is a step quieter than the subtitle above it (a size down, same dim grey-cyan), readable at 9 px; the `⧖` waiting glyph is small and reads close to a circled dot at that size.

## 5. Known limitations and open questions
- The line shows the PR's **current** state, not the playhead's: votes, pushes, threads and files don't rewind (no history by decision).
- Unspecced fixture PRs show `0 threads` (the fake answers an empty thread list); real PRs with no comments do too.
- Reviewers/threads are now read for open and abandoned PRs, so the "threads unreadable" coverage note can appear from those alone.
- A station with many PRs (Quasar's best: 13 rows) now scrolls inside its plate.
- The probe still checks reviewers/threads on a completed PR only; iterations and changes aren't probed.
- `⧖` is one constant (`VOTE_GLYPH`) and its 15 row if a different glyph is wanted.
- The Inspector's PR body is reachable only for PR nodes a view draws (v0); in Solar a PR row selects the first piece it serves, so the Inspector line is not exercised by an e2e here.

## 7. Audit fixes (Block B correctness audit)
- **The level loader's double read.** `prsFor` no longer has the dead `withStats` branch; it returns the `reviews` it read for completed PRs, and the deferred stat job carries them (as the stream's approvers task does), so a completed PR's reviewers and threads are read once. 04 §6a-1 corrected (where the line is read, the cost table).
- **Stoppable, shared background reads.** Deferred stat and run reads use one queue per org (`runStatsInBackground`) on one service-level controller (`SyncContext.background`), aborted on purge, a new or forgotten token and a change of scope. Tests: `tests/unit/backgroundReads.test.ts`.
- **A builds 401 keeps the run read before** (B2's rule; the read is stored only for the back-off): `tests/unit/repoRuns.test.ts`.
