# Packet A1: Partial-history notice
Risk: medium (network failure semantics) · Score: blast 1, verify 1, design 0, acceptance 0, track 1 = 3
Start commit: 3f2a91c

## Acceptance                 (copied from the scope doc, unchanged)
- WHEN 3 of 40 records return 503, THE player SHALL show "History partial · 3 missing · Retry"
  (e2e: partial-history.spec, case "three fail").
- WHEN Retry is pressed and the records now succeed, THE notice SHALL disappear and exactly 3 requests
  SHALL be made (unit: retryMissing.test).
- Records that loaded are never refetched (same unit test).

## Approach                   (every design decision, made here)
- Collect failed record ids in `ScopeHistory.missing: Set<string>` inside `loadHistory`
  (src/history/load.ts), instead of swallowing the error.
- Transient failures (status 0, 408, 429, 5xx) go into `missing`. A 401 or 403 on one record is a
  missing permission: record it as missing too, but never stop the sync (decided, see the scope's
  Decisions).
- Add `retryMissing(scope)`: it refetches only `missing`, and removes each id that succeeds.
- The Player reads `missing.size`. It shows the notice when the size is above 0, dimmed to 35% while
  playing (Q1).
- Reserve the notice's line in the layout from the start, so nothing reflows when it appears (R1).

## Files                      (read these ranges first)
- src/history/load.ts:180-260   (where failures are swallowed)
- src/history/types.ts:12-40    (ScopeHistory)
- src/panels/Player.tsx:40-95   (the status line)

## Excerpts
- docs/ingestion.md §6: "A 5xx on one record never fails a sync."
- Rule R1: "Counts first, detail when it's known, with no reflow."

## Checks
- unit: retryMissing.test (new) · unit: load.test (existing)
- e2e: partial-history.spec (new) · e2e: player.spec (existing)

## Out of scope
- Retrying automatically; changing the sync's own error banner.
