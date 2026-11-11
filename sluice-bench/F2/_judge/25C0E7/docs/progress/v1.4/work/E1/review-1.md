# Review E1, round 1 · Verdict: fix needed

1. Major — In 15 §8's `commands` table the new Meaning column holds the old "Looks like" text, and the
   Looks like column holds the new meanings. The header got the new column but the cells went in the
   other order.
   Evidence: `docs/15-reference.md` header `| … | Reduced | Meaning | Looks like |`, with the flare row
   `| … | ring | A swelling glow on an object in the caller's colour; … | A moment landed here: an arrival, a reached rung, or (grand) a completion |`.
   All 22 rows are the same way round. A parser that reads by header (`row.cells.Meaning`) gets the look
   description.
   Acceptance line or rule: acceptance 1 ("15 §8 has the meaning column"). The column is there, but it
   doesn't hold the meanings. Fix: swap the two header cells (to `Looks like | Meaning`), or swap the
   cells in every row. The packet asked for Meaning right after Reduced, so swapping the cells matches it.

2. Minor — `docTables.test.ts` doesn't check that Meaning is non-empty, though packet step 6 asked for it.
   That gap is why finding 1 got through: the check only adds `['Value', …]`.
   Evidence: `grep -n Meaning tests/unit/docTables.test.ts` returns nothing. The `commands` check's `want`
   list (around `:729`) has no Meaning entry.
   Acceptance line or rule: packet Checks / step 6. Fix: in the `commands` check, flag a row whose
   `cells.Meaning` is empty. It could also flag a Meaning cell that equals the old "Looks like"
   wording, but that's optional.

3. Minor — Two non-archive docs still describe the retired author tractor on Shuttle tender.
   Evidence: `docs/05-playback.md:706` (M-14) "A ring at the station; the author tractors it; the new
   tender appears". `docs/13-game-design.md:605` "captains beam the station itself, never a tender
   (Shuttle tender, Satellite cycle, Power link, Captain jump)". Shuttle tender no longer beams. The
   builder noted `:605` under limitations but left it. The packet's step 8 listed neither line, but they
   now contradict the code (`shuttleTender.ts` act issues only the launch act).
   Acceptance line or rule: docs that no longer match the code. Fix: drop the tractor clause from M-14,
   and drop "Shuttle tender" from the `:605` list.

Not findings (checked and fine; the fixer shouldn't touch these):
- The mute rule matches P-9 exactly. For every non-essential command, value ÷ weight is 2 (ornament),
  6 (cuttable narrative) or 10 (uncuttable narrative), against floors of 0, 4, 8 and ∞. That reproduces
  the old ornament and narrative gates, with `ignoreLoad` and the ornament switch, and the new
  equivalence test covers every case. Under reduced motion, the substituted def's value is used unless
  the call carries its own, as the packet specifies.
- The cuts: `stationJumpIn.ts` gather keeps the pursue (or guest) and the fold ring, now a repeat, and
  `holdS = rest/1000`. The land keeps only the station's ring, as a repeat. `shuttleTender.ts` act issues
  only the launch. `pace.ts` `facility.enter` gather is 715, and the length is 2815 in 15 §7.
- The 7 `repeats(` sites match packet step 4. The effect-audit table covers every title, and docTables
  guards the `repeats(` ↔ `mutes first` pairing.
- The Built ledger: C2's estimates in `pacing-built.ts` match `savingMs` at 552d631 for all six pods. I
  checked them from `git show 552d631:docs/progress/v1.4/pacing-candidates.json`. Saved equals the
  estimate everywhere, with a difference of 0.0 (acceptance 3 met). The other ledger rows moving is the
  expected rebaseline.
- The 03 amendment (`CommandDef.value`, `CommandCall.value?`) is made, and the build record calls it out.
- No goldens moved, and no profile JSON changed.

Checks run by the reviewer: the mapped vitest files plus `pacingBuilt.test.ts` (7 files, 154 tests,
pass); `npm run typecheck` and `npm run lint` (clean); `npm run e2e:spec -- gallery-assets solar-play`
(gallery maneuver demos in full and reduced motion with no console errors: pass; acceptance 2 met).
