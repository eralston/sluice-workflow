# Slice 1.3-B5: scale-up ingestion

**Status:** built 2026-10-27; no human gate (no visible change). Plan: [23-v1.3.md](../23-v1.3.md) Block B. Fixture data only (INV-18).

## 1. What was built
*Superseded by section 2a (Round 3): the `feed2:` saved state (a crawl per batch, `done` sequences) and "seeds with no checkpoint" below are the round-1/2 design; today it is one crawl per scope (`feed3:`) and a seed has a checkpoint that `Cache.checkpoint` hides from per-item paths.*

- **The feed read.** `src/main/sync/feed.ts` (`feedHistory`) reads `GET {project}/_apis/wit/reporting/workitemrevisions` (`AdoClient.revisionFeed`, family `history`) with `continuationToken` / `isLastBatch`, `includeLatestOnly=false`, `includeIdentityRef=true`, filtered client-side to the batch's IDs. Full design in 04 §5c (the five design questions).
- **Where.** A batch of 300 items or more (`FEED_THRESHOLD`, 15 §10) goes through the feed in `history()` (level loader, catch-up), in `syncScope`'s `fetchItems` (each discovery wave) and, per pod, in the sprint stream (a `feed:{pod}` fill task after the look; the per-item history tasks are queued behind it and find the cache current). Below the threshold, rescans and single-item reads: per item, unchanged. The first look is untouched.
- **Updates stay per item.** The feed has no relation changes (parent, child, PR links), so updates are still read per item, but only where something is new. A refresh with nothing changed makes no per-item history call.
- **Checkpoints.** Each item's own `last_success_at` is the watermark (a project-wide one would be wrong for items another scope read), set by a finished crawl to the newest ChangedDate it saw (server time, so local clock skew cannot skip a change; the one assumption left is feed lag under the 1 h overlap). Fed rows go to `wi_revisions` with no checkpoint. Saved state: the setting `feed2:{org}:{scopeKey}` with a crawl per batch (by hash of start and IDs) and the batches `done` in a capped sequence. No migration, no `DERIVATION_VERSION` bump.
- **Window edges.** The window covers the played range (the earlier of range end minus 28 days and the range start). Born before it and changed in it: read per item, whole. Nothing in it: seeded as one `RevisionFact` (`rev: 1`, `seed: true`, at its CreatedDate, current fields), no updates, **no checkpoint**, so the next per-item read replaces it with the true history (the stream does so for a focused seeded item). Another project's items: per item.
- **Review fixes (round 1).** A capped crawl now converges when a run has several batches (state per batch plus a shared budget, and `done` batches skipped inside a capped sequence); a 400 self-heals; the production-window equivalence is tested over every scenario and sprint scope; the fake's continuation token carries the position (time, id, rev); a capped `feed:{pod}` task still reads catch-up items per item; the level loader recomputes `partial` after a cap clears; the stream's cap flag no longer sticks.

- **Cost.** One page budget per run across all its batches (`FEED_MAX_PAGES` 40 x 500 rows, 15 §10; a stream's fill starts a new one), reserved before each request; throttle gate before each page, abort stops, progress through the existing `history` progress. A capped run keeps its tokens, marks the scope partial with a note, and the rest waits for the next run.
- **Failures.** 401 fails the sync; transients (0/408/429/5xx) stop the crawl quietly (partial, retried later); 403/404 fall back to per-item reads; a 400 on a saved token is a stale token (state cleared, crawl restarts once), any other 400 means no feed (per item).
- **Fixtures.** The fake serves the feed with real paging (opaque token, `isLastBatch`, `startDateTime`, `fields`), from the same simulation (`FakeOptions.feedPage`, `noFeed`). No giant fixture: tests lower the threshold (`SyncContext.scale`; `STAR_CHART_FEED_THRESHOLD` in test runs, `service.ts`).

## 2. Contracts changed
04 (endpoint row, §5 step 3, new §5c), 03 (§9 migrations-table note: no migration; `RevisionFact.seed`; the seed sentence in §4), 15 §10 budgets (5 rows: the explanation of the numbers is in 04 §5c), `tests/README.md`. `RevisionFact.seed?: true` in `facts.ts`.

## 2a. Round 3 (second review: simpler design)
- **One crawl per run, shared by every batch.** The first batch that needs the feed crawls once and keeps parsed rows in memory (bounded by `FEED_BUFFER_ROWS`, 15 §10); later batches of the run serve from them and never re-crawl. Saved state is one crawl per scope (`feed3:`: `{ day, since, token, maxChanged, covered }`); the per-batch `crawls` / `done` / `open` are gone. A resumed crawl serves only the items it covered from its start; others read per item.
- **Stable window.** `windowFrom` snaps to the start of its UTC day; a saved token resumes when `{ day, since }` match (the stream under a clock moving 10 min a run resumes: tested).
- **Seeds have a checkpoint (the crawl's mark) and are never dropped by a feed read** (`dropSeedRevisions` removed). They are replaced only by real history: `Cache.checkpoint` hides a seeded item's checkpoint from the per-item paths, so a per-item read, a stream focus, a rescan, or a feed read that sees the item changed (it goes to the per-item path, not appended) reads it whole and upserts the real rev 1. This fixes the alternating-empty bundle and the full-window re-crawl.
- **Watermark** = `max(previous, newest ChangedDate seen)`; nothing seen leaves checkpoints alone.
- **Capped stream pod:** checkpointed items read per item (as before B5); unread items per item only in the focused pod; the rest wait. `itemHistory`'s early return now ignores a tail that does not start at rev 1 (found by the production-window stream equivalence test).
- **Per-wave cost (honest):** the first run of a scope crawls the window once (not once per wave); an incremental run crawls from the checkpoints (the loop probe: 73 pages for the first run, 1 page after). A later wave needing more than the crawl covers, or items past the buffer bound or that joined a resumed crawl's scope, are read per item. Rows kept for members of a capped crawl who are never served stay without a checkpoint (they look unread).
- **Probes re-run** (`scratchpad/b5/`, adapted to the new state): `seedskip` (maxPages 1: no alternating-empty; the bundle keeps its 3 items every run); `loop` (first run 73 pages from the window, then 1 page from the checkpoint, 0 per-item history); `stream` (8 runs under a moving clock: runs 1 to 7 resume by token); `cap` (orbit-week, 3 pages a run: converged after 25 runs, 74 calls); `real` (22 of 23 equal; the one difference is Tide Team's declared one, a pre-window dated link observed instead).

## 3. Checks
- `npm run typecheck`, `npm run lint`: pass. `npm test`: 80 files, 1299 tests pass. **No golden moved.**
- `tests/unit/feed.test.ts` (74): equivalence feed vs per-item over every scenario scope and sprint scope (window from 0, small fake pages), and **at the production window** (exact when no item is seeded; with seeds, equal events from the window on); threshold switch; no per-item calls on an unchanged refresh; convergence under a 3-page and a 1-page budget with no uncapped final run and at most the budget in feed calls per run; resume by token alone with a start date after 1970; a stale token (400) self-heals; abort; throttle; 401, transients, 403/404; the checkpoint is server time under a skewed clock; a seeded item has no checkpoint and is replaced by a whole per-item read; the stream through the feed (production window) and a capped stream converging by refreshes.
- `tests/e2e/activity.spec.ts` +1 (Pine Team, threshold 1: history loads through the feed; session log has `feed-pages`, no per-item revisions call).
- e2e: `activity slice4 sprints offline explore`: 31 passed; `e2e:keystone`: 42 passed.

## 4. Human gates
None.

## 5. Deviations from 23
23 B5 asks for "a seeded `initial` snapshot in `ScopeHistory`". It is a stored `RevisionFact` flagged `seed: true` instead (no bundle contract change, derive unchanged; replaced by a whole read). Recorded in 23's State cell, 03 §4 and 04 §5c.

## 6. Known limitations and open questions
- `$maxPageSize` and the feed's `values` / `isLastBatch` shape are from the API docs, **unchecked against a real ADO**.
- **Seeded items differ from the per-item path before the window**: no earlier events, the state they were created in is their present state, and links dated before the window are observed, not dated (04 §5c). Inside the window and the played range nothing differs.
- Per-wave cost: see Round 3. A later wave that the run's crawl does not cover (or a resumed crawl's late joiners, or rows over the buffer bound) is read per item.
- Seeded items have no updates, so a Feature's former children older than the window are not found from them.
- Rescans stay per item (whole histories).
- Deleted items are not in the feed; they fall to the seed fetch, come back null and are marked gone.
- Rows of the scope's members stored by a capped crawl stay without a checkpoint until it completes, so they look unread to per-item paths.
- The local-clock assumption is gone, but the feed-lag assumption (under the 1 h overlap) is not checked against a real ADO.

## 7. Audit fixes (Block B correctness audit)
- **Old history with no checkpoint** (migration 007) is never fed: `pre` (found when a crawl begins, saved with the crawl; rows a capped earlier crawl stored, its `covered`, are fed rows and do not count) is read whole per item. Fed rows are not stored for them.
- **Failures beside the crawl.** The seed fetch: a blip counts the crawl as capped (the items wait), 403/404 send them per item. A blip on an update read goes to a new `failed` callback (B7 `missing`), not `onGone`; the level loader, full sync and stream pass it.
- **One crawl in flight** per session: a later batch awaits the crawl's promise, so two pods' `feed:` tasks spend the page budget once. One existing test (`a capped feed task still reads catch-up items...`) leaned on the old double spend; its budget is now 2 pages (the crawl needs 4).
- **The cap note** is derived from the scenes' `capped` flags in the level loader (coverage and the player agree).
- Tests: `tests/unit/feed.test.ts` "B audit" (4 tests, mutation-checked).
