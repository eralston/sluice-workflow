# Review E4d, round 1 · Verdict: pass

1. Minor: every short form is a hand-copied literal of its source form's phases, not derived from the form itself. If someone retimes the source form, its short form goes stale and nothing fails, except for the two plain closes.
   Evidence: `src/shared/engine/pace.ts:417-418, 442-443, 533, 548, 560` each call `shortOf(phases(...))` with literals copied from that rule's `phases` or its `beamed(...)` argument. The only test that compares a short form with its source is `tests/unit/maneuvers.test.ts:985`, and it covers only the plain closes. The beamed closes, the merge, the seat and the region are checked against fixed lengths (`:968-972`) and against 15 §7 rows that would be edited together with them. My probe (`shortOf(rule.phases)` against `rule.short.plain`, for all five rules) matches today.
   Acceptance line or rule: none is broken. This is fragile under the "Values" rule: the 15 §7 short rows say "at 0.6×", and that claim isn't guarded. A fix would derive each short form from a named constant shared with its rule or variant.
2. Nit: the docTables guard against unreachable variants is weaker now. `variantsOf` fills the map with short forms before it probes `rule.variant`, so `if (rule.variant && !vs.size)` (`tests/unit/docTables.test.ts:687`) can no longer fire for the merge or either close. The doc-to-code row check still catches a broken probe for any variant that already has a row.
   Evidence: `tests/unit/docTables.test.ts:633-637` and `:687`.
3. Nit, for E5 (out of scope here, since nothing plays short forms yet): the renderer branches on `m.variant === 'beamed'` (`theme/starChart/maneuvers/landing.ts:46`, `strikeRun.ts:51`), so a `beamed-short` play would draw no station beams. The beamed short act is 1560 ms, shorter than the 0.6 s charge plus 2 s fire that 15 §7 says the beamed act hosts. The names and values follow the packet.
   Evidence: grep for `variant ===` in `src/renderer/src`; pace.ts `:418` and `:443` (act 2600 × 0.6 = 1560).
4. Nit: the three single-key short maps need `as PaceRule['short']` casts (`pace.ts:533, 548, 560`). An unchecked cast is looser than an annotated literal.

Not findings, checked and found fine:
- Values: the seven lengths (2520, 3600, 3000, 3840, 4320, 2400, 1770) match the packet, 15 §7 and the tests. `SHORT_PACE` 0.6 has a 15 §10 row, and docTables passes.
- All five protected rules have a short form, and `first` gives null. In the ceiling run, arc closes keep `ARC_CLOSE_PHASES`, because `arcsOf` replaces them.
- Today's schedule is unchanged. The E4d "before" totals equal E4c's "now" on all six pods. `scheduleOf` gives the same totals by its explicit path (`rules: [...PACE_RULES]`) as by its default path, on all six pods. So the E4d row's before/now gap measures only the short forms.
- Acceptance 1 under the ceiling: I re-ran the E4 dependency sweep with the E4d `after` rules on every pod. It covered 153 dependent pairs, with 0 overlaps and variants `short` and `beamed-short` played. Under today's rules the committed sweep passes.
- Acceptance 3: the ledger's Built section has E4d rows for all six pods, every saving above 0. `pacingBuilt` checks that the committed JSON is current.
- Nothing in `src/` reads `PaceRule.short` or `shortForm` outside `pace.ts`, so the app's playback is unchanged. `ManeuverRule` is unchanged. `src/shared/` stays pure.
- Docs: 03 (the `PaceRule.short?` prose, helpers and v1.2 field list), 05 P-19, 15 §7 (seven rows and the Source line) and 15 §10 all match the code. The builder's record calls out the 03 amendment. No golden moved.
- The keystone `devlog.spec.ts:16` failure is the pre-existing flake the builder reported. It passes when run alone.
