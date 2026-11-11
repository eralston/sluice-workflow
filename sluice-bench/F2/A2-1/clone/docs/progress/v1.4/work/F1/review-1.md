# Review F1, round 1 · Verdict: pass
1. Nit: tests/README.md still says "four pods" for the demo drive step, at lines 144 and 197.
   Evidence: `grep -n "four pods" tests/README.md` gives 144 ("Halcyon Reach's four pods (HG-A-demo)") and 197 ("`demo.ts`, the four pods of the current Halcyon Reach").
   Acceptance line or rule: none. The drive step is out of scope by the packet, and the builder listed it under limitations. This can be fixed whenever `tests/drive/steps/demo.ts` gains Meteor.
2. Nit: the "more than a working day apart" test checks only that the merges are more than 24 wall-clock hours apart (`t2 - t1 > 24 h`, halcyonCoverage.test.ts, the 21043/21044 case). It doesn't name the working-day rule F3/F4 use ("the same or the next working day").
   Evidence: Wed 23 18:00Z to Fri 25 18:00Z is 48 h of wall clock and exactly 24 working hours (07:00–19:00 PDT). The fixture follows the packet, and moving the second merge to Thu would still fail the test (24 h is not > 24 h), so the guard works. Only its wording is loose.
   Acceptance line or rule: none.

Not findings (checked, and fine as they are):
- Fixture timeline against Approach 3, line by line: the opens at 17:00 + 1.5 s·i; merge j completes PR index 7j mod 36, at 18:00 + 17 min·j and then Thu 16:30 + 17 min·(j−18); the approver sets by j, with the reviewers at open time set by j = 31i mod 36 (7·31 ≡ 1 mod 36); B's 12040 Active at 17:00:26, between opens 17 (17:00:25.5) and 18 (17:00:27); 12041 Resolved 18:40, between j=25 (18:29) and j=26 (18:46); 21040 lands in repo[35] at j=5's instant, 19:25, emitted after A's merge (replay keeps emission order on ties, gen.ts:327); the B-15 pair, the far-apart pair and the lone open summon all match.
- `prStats` gets the approvers as `reviewers` (a deviation the builder recorded). This is the same convention `emitItem` uses for every generated pod (gen.ts, `prStatsFor(pr, roster)` with `pr.reviewers` = approvers), so it isn't a departure.
- cast.ts: 51 insertions, 0 deletions. No other pod's line moved.
- Generated fixtures: I rebuilt the start commit (`git archive 8b3cadb` into /tmp) and ran build-fixtures.ts there. All 18 files in `fixtures/generated/` are byte-identical to the working tree's, including `sprint-pods.history.json`.
- Goldens: `npm test` passes without `-u`. Under `tests/golden`, git diff shows only the 40 lines appended to the end of `sprint-pods.scenes.json` (the Meteor scope entry) and the two new `halcyon-meteor.*` files. Meteor's goldens have 37 stations and 3 seats in the plan, and the scenes show 0, 21, 36, 36 and 37 facilities at the five playheads (21 at mid-opening, as expected).
- Pacing ledger: a throwaway probe (now deleted) rebuilt the ledger, the candidates and the built rows in memory. `pacing-ledger.{md,json}`, `pacing-built.json` and `pacing-candidates.json` all match the committed files byte for byte. Meteor is the 7th row. `resolvePods()` still gives six pods by default.
- 03-contracts.md:1813 is amended in the same change (normative), and the build record says so.
- INV-18: every name comes from find-cast's pools or is an invented title. No real data.
- VC-3: judged at 1440×900, per the orchestrator's decision (the 1024×640 case is carried to F5 as `test.fail`). The 1440×900 case passes: 37 facility nodes, all 36 run repos drawn, `hitProblems` empty.
