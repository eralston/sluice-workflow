# Review C4c, round 1 · Verdict: pass
1. Minor — Prose in other docs still names the removed constants: docs/05-playback.md:400 (`MAX_ACTIVE_FX (15 §10)`), docs/03-contracts.md:1271 (`the MAX_ACTIVE_FX`), docs/09-signal-ladder.md:187 (`2 ms is VSYNC_TOLERANCE_MS; 15 §10`). 15 §10 now points at the profile.
   Evidence: grep -rn "MAX_ACTIVE_FX|VSYNC_TOLERANCE" docs/*.md.
   Rule: docs match code (not an acceptance line; no test guards prose).
2. Nit — ChartApp's constructor now calls setPaint(switches.paint) through applyProfile. On desktop this is a no-op (NebulaBackdrop.bake keys on level|seed|size|painted and returns at zero size), so desktop draws as before.
Not findings: grep for BUDGET_MS, HIGHLIGHT_BUDGET_MS, MAX_ACTIVE_FX, VSYNC_TOLERANCE_MS in src, scripts, tests and config finds only "was X" comments in contracts/profile.ts. The two `>= CALM && waited < 4` waits were left as decided. Pulsar perf p95 at 1x and 4x is red as known (budget printed 18.6 ms, from the profile), soft until C3. Phone e2e compares orbit-week's star, not Pulsar, as C4b's finding requires.
