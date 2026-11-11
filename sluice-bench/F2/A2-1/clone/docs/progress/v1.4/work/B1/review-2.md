# Review B1, round 2 · Verdict: pass
Round 1's Major and Minor are fixed. The Nit is mostly fixed, and what's left of it is below.

1. Nit (carried from round 1, finding 3): the rest still `pulsar-rest.png` still shows the Pulsar Pod star selected. The In View row is outlined, and the inspector shows Pulsar Pod with the full Features list. The click on empty sky in `stills.ts` doesn't clear the selection. The still's evidence holds anyway: the star's own tier is `sky`, so the selection doesn't raise it, and every other plate is drawn at T4. `pulsar-playing.png` now shows a rise: the piece "Support pet policy notices" is drawn raised (T2, glowing) while it's cast. The fixer's record says "see limitations for the still's state", but its `limitations` list is empty.
   Acceptance line or rule: packet Checks ("one still of Pulsar at rest and one while playing"). The human final check can judge it as it is.

## Round 1 findings
- **Major 1 (the tier lagged expand/collapse): fixed.** `labels.ts` `position()` now runs a local `settle()` at the top of the loop, before any hide, and again right after `expand()`/`collapse()` (line 836). `is-expanded` and the raised tier now change in the same frame. The spec wasn't loosened. When `expand()` measures `label.base`, the plate is already raised, because pointed, selected or rows-inside are what trigger expand. So the base size is the raised plate's.
  Evidence: the round 1 probe, re-run (`test-results/drive/b1-review-lag.txt`): `Nova Vash: place|exp` goes straight to `3138 f24 Nova Vash: sky|-|-`, with no `place|-` frame in between. The attention case passed `--repeat-each=4 --workers=1` (4/4) on my run. The orchestrator's run passed 3/3 (`fix-1-checks2.log`). Before the fix it failed 2 of 3.
- **Minor 2 (docs still said "at rest" meant a plate's own tier): fixed.** `docs/05-playback.md` A-1 and `docs/12-glossary.md` *Holo label* now say every plate rests at T4 Sky and rises to its own tier when raised. That matches 13 §1 R1 and 15 §6.
- **Nit 3 (stills): partly fixed.** See finding 1.

## Not findings
- A hover shorter than one frame can still leave `is-hover` on a `sky` plate for that frame (round 1 saw this in passing). The lifted CSS applies through `is-hover` at any tier, and no acceptance line covers it.
- Typecheck is clean. `labelTiers` and `docTables` pass (46). The orchestrator's lint and full unit run (1417) passed, and so did the mapped e2e (solar 43; solar-dense and demo 28). `npm run e2e:keystone` passed (43).
