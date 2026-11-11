# Review A1, round 1 · Verdict: fix needed
1. Major — Retry refetches loaded records when the scope reloads mid-retry.
   Evidence: probe work/A1/probe-reload.test.ts fails: 40 requests, expected 3.
   Acceptance line: "Records that loaded are never refetched."
2. Minor — The notice overlaps the error banner at 900 px wide.
   Evidence: still work/A1/overlap-900.png.
3. Nit — `missing` could be a ReadonlySet in the public type.
Not findings: the 401 handling matches the scope's decision; the reserved line causes no reflow
(checked with the layout-shift probe).
