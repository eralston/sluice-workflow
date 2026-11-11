# v1.4 · Block D

## Summary

```text
Block D · 4 items · 0.30 windows · 1.5 h with agents
First-pass acceptance   3/3    Fix rounds   0.3 mean, max 1    Re-plans   0
Findings               blocker 0 · major 0 · minor 2 · nit 1
Spend by role          builder 27% · planner 26% · orchestrator 19% · auditor 19% · reviewer 6% · fixer 3%   (orchestrator approximate)
Spend per item         unknown 0.07 win (1) · medium 0.06 win (3)
Gate blocks            1    Recovered from transcripts: block-D auditor
Largest item           block-D: 0.07 win, 0 reviews
Escapes                record at the human gate
```

## Health

```text
Code health at 827cf92 · 341 files · 58,302 lines
Large files            10 over 800 lines · largest dreadnoughts.ts 1,888, GraphScene.ts 1,837, swarm.ts 1,470
Hotspots               labels.ts 12/49 commits (1,173 lines) · GraphScene.ts 7/49 commits (1,837 lines) · ChartApp.ts 9/49 commits (1,322 lines) · median 1
Dependencies           8 + 15 dev
Complexity             139 functions over 15 · worst 251 (labels.ts position) · 38 over 80 lines
```

## Audit and suite
- **Audit** (`work/block-D/audit-1.md`): pass, 2 Minors and 3 Nits, all fixed in one round (`fix-1.json`). `formationSides` now reads each plate's side from the crew's own line (snapped to D3's 15° steps), with unit cases at 15° and 60°. `tests/README.md` maps the new formation units and `solar-dense`.
- **Suite** at the fix: e2e parallel 220/220, alone 22/23. The one failure is Pulsar's absolute-budget test again (soft lines, as at block C): this time the seek bound, 301 ms against 250.

## Stills for the final check
- D1, labels clear: [Quasar vertical](work/D1/still-quasar-vertical.png) · [Pulsar horizontal](work/D1/still-pulsar-horizontal.png) · [Pulsar vertical](work/D1/still-pulsar-vertical.png)
- D2, on the board: [Pulsar at 1024×640](work/D2/still-pulsar-1024x640.png)
- D3, clear of the beam: [gallery merge, first](work/D3/still-gallery-merge-first.png) · [gallery merge, echo](work/D3/still-gallery-merge-echo.png) · [Pulsar vertical](work/D3/still-pulsar-vertical.png)

## Escapes
Record at the final check.
