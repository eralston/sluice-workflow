# v0.4: scope

**Status:** opened 2026-11-02. Scoped; Block A built and accepted, Block B open. Earlier scope:
`scope-v0.3.md`. Workflow: the sluice. Work files: `docs/sluice/v0.4/`.

*(An example for a fictional app, Ledgerline, which syncs records from a remote service and plays back
their history. The items are the right size and shape; the app is invented.)*

## Goal

When a sync is only partly successful, the user can see so and retry just what failed. The docs say how
history loading works. The cache can hold board columns without wiping existing users' data.

## Rules

- R1. Counts first, detail when it's known, with no reflow.
- R2. A failure on one record never fails a whole sync.

## Order and blocks

| Block | Items | Why this order | Human gate |
|---|---|---|---|
| A | A1, A2 | Small and medium risk first: they prove the plumbing | Carried to the final check |
| B | B1 | A migration: high risk, own block, own audit | Carried to the final check |

## Items

### A1 Partial-history notice
- Asked:       "If some records fail to load history, tell me, and let me retry just those."
- Today:       per-record history failures are swallowed; the player shows Ready
               (src/history/load.ts:212).
- Decided:     the player shows `History partial · N missing · Retry`; Retry refetches only the
               missing records.
- Acceptance:
  - WHEN 3 of 40 records return 503, THE player SHALL show "History partial · 3 missing · Retry"
    (e2e: partial-history.spec, case "three fail").
  - WHEN Retry is pressed and the records now succeed, THE notice SHALL disappear and exactly 3
    requests SHALL be made (unit: retryMissing.test).
  - Records that loaded are never refetched (same unit test).
- Risk:        network failure semantics.
- Touches:     src/history/load.ts, src/panels/Player.tsx, docs/ingestion.md §6.
- Depends on:  none
- State:       accepted; work/A1/

### A2 Ingestion doc: the retry rules
- Asked:       "The ingestion doc should say what we retry and what we don't."
- Today:       docs/ingestion.md §6 lists status codes but not the retry behaviour.
- Decided:     add a table: status, retried?, shown how; and link it from the README.
- Acceptance:
  - docs/ingestion.md §6 has a table with rows for 0, 401, 403, 404, 408, 429, 5xx
    (check: `grep -c '^| ' docs/ingestion.md` rises by 8).
  - The doc-links test passes (`npm run test:docs`).
- Risk:        none (docs only).
- Touches:     docs/ingestion.md, README.md.
- Depends on:  A1
- State:       accepted; work/A2/

### B1 Board columns in the cache
- Asked:       "Use the team's real board columns."
- Today:       the board places work by state; column data isn't read or stored.
- Decided:     parse the column fields into revision facts; a migration clears only the per-record
               checkpoints, so history re-reads lazily and nothing else is lost.
- Acceptance:
  - After the migration, membership, activity and team lists are unchanged
    (unit: migration007.test, "keeps everything but checkpoints").
  - A record with no checkpoint is re-read in full on its next touch (unit: lazyReread.test).
  - The board shows the team's columns for the three fixture teams (e2e: board.spec).
- Risk:        persisted data, migration.
- Touches:     src/db/migrations/007.sql, src/sync/parse.ts, src/board/columns.ts, docs/cache.md.
- Depends on:  none
- State:       open

## Open questions

| # | Item | Question | Recommendation |
|---|---|---|---|
| Q1 | A1 | While playing, should the notice hide or dim? | Dim to 35%, so the count stays readable (R1) |

## Decisions

| Date | Decision | By |
|---|---|---|
| 2026-11-02 | A1's notice dims while playing (Q1) | human |
| 2026-11-02 | A1: a 401 on one record is a missing permission, not a dead token, so it doesn't stop the sync | orchestrator |
