# v0.4 · Block A
Items: A1, A2 · Scope: docs/scopes/scope-v0.4.md

## Summary

```text
Block A · 2 items · 0.16 windows · 1.5 h with agents
First-pass acceptance   1/2    Fix rounds   0.5 mean, max 1    Re-plans   0
Findings               blocker 0 · major 1 · minor 1 · nit 2
Spend by role          reviewer 33% · builder 25% · planner 18% · auditor 15% · fixer 9% · clerk 0%
Spend per item         medium 0.12 win (1) · small 0.02 win (1)
Gate blocks            1
Largest item           A1: 0.12 win, 2 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at 4e1c2a9 · 142 files · 18,430 lines
Large files            2 over 800 lines · largest sync.ts 1,210, HistoryPanel.tsx 860, client.ts 640
Hotspots               sync.ts 9/50 commits (1,210 lines) · HistoryPanel.tsx 6/50 commits (860 lines) · client.ts 5/50 commits (640 lines) · median 1
Dependencies           11 + 19 dev
Complexity             41 functions over 15 · worst 38 (sync.ts reconcile) · 12 over 80 lines
```

## For the human gate
- **A1:** open the fixture `partial-503`, press Load history: the notice reads "History partial · 3 missing ·
  Retry"; press Retry: it disappears. Stills: `work/A1/notice.png`, `work/A1/after-retry.png`.
- **A2:** read docs/ingestion.md §6, the new retry table.

## Decisions made by the orchestrator
- A1: a 401 on one record is a missing permission, not a dead token, so it never stops the sync
  (recorded in the scope doc's Decisions).

## Escapes
- None found at the gate (2026-11-03).
