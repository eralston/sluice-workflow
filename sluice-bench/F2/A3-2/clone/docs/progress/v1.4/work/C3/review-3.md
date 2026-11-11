# Review C3, round 3 · Verdict: pass

Judged against the packet's acceptance, with HG-C (2026-11-01) applied: desktop and laptop-battery live, tablet and phone baked.
Review-2's Major is fixed. I saw it run: the hard cuts test ran and passed while the soft absolute test went red in the same
run. All three Nits are fixed. One new Nit, which doesn't block.

1. Nit: on a partial run, `perf-pulsar-report.json` can mix in stale numbers. Each Pulsar test merges whatever the file already
   holds: the cuts test keeps the absolute keys, and the absolute test keeps `cuts`. So running one test alone (for example
   `-g "p95 frame time"`) carries the other test's numbers over from an earlier run, unlabelled. A full run writes both fresh.
   Evidence: `tests/e2e/perf.spec.ts:163-165` (the cuts test reads `prior`, then writes `{ ...prior, cuts }`) and `:210-212`
   (the absolute test keeps `prior.cuts`).

Review-2, resolved:
- #1 (Major) fixed. The cuts test is now first in the serial describe (`perf.spec.ts:133`), and the absolute test follows
  (`:171`). I deleted the old report, then ran `with-lock npm run e2e:spec -- perf profile` under load. Result: 6 passed,
  1 failed. The failure was the absolute test, and only on its soft seek line (292.5 against 250); the docs list that line as
  known red. The cuts test ran and passed:
  - 4×: off 33.3 (33.3, 33.3, 33.3) against on 17.6 (17.6, 17.6, 17.5), a 0.471 gain against the 0.2 floor.
  - 1×: off median 17.7, inside 1.25 vsyncs, so the documented skip applied.

  The fresh report has `vsyncMs, budgetMs, rest, play 1x, play 4x, seek, cuts`, so the merge works in the new order. The cuts
  test sets `auraBake` back to false at its end, so the absolute test still measures desktop's default. `ensurePulsar()`
  returns early when the pod is already open, and still opens it when the absolute test runs alone.
- #2 (Nit) fixed. The profile note no longer says "Options 1 to 4 above", and the 1x as-is row is labelled as a separate run.
- #3 (Nit) fixed. `STAR_CHART_TEST_DPR` is in `tests/README.md` beside `STAR_CHART_TEST_SHOW`.
- #4 (Nit) fixed. `build()` now detaches the live group's `AlphaFilter` and destroys it, and leaves the group's children
  alone (`aura.ts:211`). Each build makes its own filter, so nothing shared is freed. `profile.spec`'s Pulsar flip case
  passed, including the scene drawing after the pod closes and reopens.

Not findings (checked):
- Gate re-run: typecheck and lint clean, unit tests 99 files and 1462 tests green.
- The live path is unchanged by fix-2, apart from the filter teardown on a flip. The desktop look is review-2's verdict, and
  holds.
- If the cuts test itself fails, serial mode skips the absolute test. The fixer noted this; the hard check has failed by
  then anyway, so this isn't a finding.
- Lean run as instructed: only `perf` and `profile` e2e; keystone and gallery weren't re-run this round (review-2 ran them on
  a tree that fix-2 changed only in the spec order, the docs and the filter destroy).
