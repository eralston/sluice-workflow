# Review D2 round 1: pass

Checked against the packet's Acceptance, Out of scope and CLAUDE.md.

- Unit: `formationBounds.test.ts` covers the pure cases (no-board equals a verbatim copy of the old rule) and a sweep over Pulsar and Harbor stations at fixed and fit scales, n 0..6, asserting every spot is on the board and the board is inside `boundsOf`. Passes (95 tests across the related files).
- E2E: "formations stay on screen (27 D2)" passes at 1440x900 and 1024x640.
- Typecheck and lint are clean. No `CastViews` is iterated by key anywhere, so the extra `board` key is safe. The `commands.test.ts` stub gained `solarBoard`. `framing.ts`, `placeFormation.ts`, the plan and the goldens are untouched.
- Docs: 13 §6.2 Power link row and 08 §7 bullet match the code. No constants changed, so no doc 15 row.

Minor: the plan-level test does not bite on Pulsar (0 of 1323 leave the board under the old rule); only Harbor with n=6 does. The e2e was not run against the old code. The guarantee is kept and the build record says so. No action.
