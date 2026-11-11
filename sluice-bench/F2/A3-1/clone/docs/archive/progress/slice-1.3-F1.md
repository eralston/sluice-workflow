# Slice 1.3-F1: the derivation version is written and checked

**Status:** built 2026-10-27; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block F. Fixture data only (INV-18).

## 1. What was built
- **One constant to bump:** `DERIVATION_VERSION` in `src/shared/ingest/derive.ts` (still 1), now documented:
  bump it when `derive` turns the same facts into different events, observations or links, then run
  `npm run fixtures`. The fixture DSL (`fixtures/dsl.ts`) now reads the constant instead of a literal `1`,
  so a bump doesn't break AC-27's equivalence.
- **Written and checked at boot:** `Cache.open` calls `checkDerivation(DERIVATION_VERSION)` after the
  migrations. A cache that never recorded a version (every cache before F1) reads as `UNVERSIONED_IS = 1`
  (`db/cache.ts`): it was derived by version 1, so while the constant is 1 the key is just written and no
  existing user's rows are cleared (review fix). A mismatch clears `events`, `links`
  and `observations` in one transaction, lists each scope with a successful sync in `meta.derived_pending`,
  and writes `meta.derivation_version`. Dev log: `cache-derivation { from, to, scopes }`. On a fresh DB this
  writes the version and clears nothing.
- **Rebuilt from cached facts, with no network calls, when the scope next opens:** not at boot itself. A
  scope key holds only node IDs and a hash of the pod paths, so the cache can't rebuild the scope's
  `SyncScope` (sector, pod paths, sprint dates) or its range. `AdoService.load` calls
  `rebuildPendingDerived` (`src/main/sync/levels.ts`), which rebuilds the rows the way their last writer did:
  a full sync's scope over the range it opens with; a streamed sprint over the sprint so far (like
  `sprintStream`, which writes them whether it filled or finished incomplete). A sprint whose stream is
  running now (`AdoService.stream` on that scope with tasks pending) stays pending: the stream rebuilds the
  rows when it finishes. (Opening a sprint online restarts or refreshes its stream; opening it offline from
  the cache doesn't, so the open itself has to rebuild. That's why an incomplete stream is rebuilt too:
  review fix.) A level-loaded team
  or Epic never wrote derived rows, so it just leaves the list. `rebuildDerived` now takes the scope key and
  takes the scope off the list, so any sync or finished stream also clears it.
- **What it affects:** only the galaxy's activity count reads the derived tables. `history.load` already
  derives every bundle afresh from the source tables, so the charts themselves were never stale. Between a
  bump and the scope's next open, its project counts no activity in the galaxy.
- Test: `tests/unit/derivationVersion.test.ts` (7 tests). It covers a fresh cache, a matching boot (rows
  untouched), a mismatch (derived cleared, facts kept, the rebuild on open gives identical event keys and
  counts, and only once), a cache with no key (kept at version 1; cleared once the version is past 1), a sync
  clearing the pending entry, a level-loaded team leaving the list without writing rows, and a streamed
  sprint that finished incomplete (stays pending while streaming, then rebuilds to identical event keys).

## 2. Contracts changed
- **03 §9:** the *Derived tables* bullet is rewritten, with new bullets for *The derivation version* and
  *Bump `DERIVATION_VERSION`*. `derived_pending` is added to the `meta` keys comment. 03 §10 gets the
  `cache-derivation` dev-log row.
- **04 §5:** the paragraph that said "not built" now describes the behaviour (not in F1's Docs column; it
  was false otherwise).
- **Departure from 23's wording** ("at boot, a mismatch rebuilds the derived tables"): the version check and
  the clear happen at boot, but each scope's rebuild happens when it next opens or syncs. The scope's
  parameters aren't in the cache. 03 §9 says so.
- Code signature: `Cache.rebuildDerived(org, scopeKey, …)` (the scope key is new, second). Its two callers
  (`sync.ts`, `sprintStream.ts`) are updated.

## 3. Checks
- `npm run typecheck`: pass. `npm run lint`: pass.
- `npm test`: 75 files, 1092 tests pass. No goldens moved.
- First pass: `npm run e2e:spec -- slice4 offline`: 10 passed; `npm run e2e:keystone`: 39 passed.
- After the review fixes: `npm run e2e:spec -- slice4 explore activity offline`: 22 passed;
  `npm run e2e:keystone`: 39 passed.

## 4. Human gates
None.

## 5. Known limitations and open questions
- **For B4:** board columns are a *parse* change (new fields in `RevisionFact`). The cache stores facts, not
  raw ADO payloads (INV-16), so bumping `DERIVATION_VERSION` alone **will not** re-read history. B4 needs a
  migration that clears the fact tables and checkpoints, following `003_iterations.sql`, plus a bump if the
  derivation changes as well. The constant's comment and 03 §9 both say this. 23's B4 row ("rebuild cached
  history through F1's version check") should be read in that light.
- Level-loaded team and Epic scopes still write no derived rows (as before F1), so their activity isn't
  counted in the galaxy. This is unchanged and outside F1.
- A pending entry for a scope that is never opened or synced again stays in `meta.derived_pending` for
  good. It is harmless: the scope has no derived rows, and the list is only read for the scope being opened.
- Edge case: an area or Epic scope that has a full sync's derived rows *and* a level state (it was synced
  fully once, then level-loaded) leaves the list on open **without** a rebuild, because the level state
  says it has no derived writer. Its activity stays uncounted until a full sync of it runs again.
- `meta.derived_pending` is a JSON list in one meta row. It is read on each `load` (one small query), which is
  fine at the scale of a user's synced scopes.
