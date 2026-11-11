# Review E3, round 1 · Verdict: pass

1. Minor — The new 15 §7 row says the gather ring is "Hero blue", but the code draws it in At-rest blue (`HERO_GLOW`, `#69A3FF`, a separate palette row in 15 §1). The new 15 §8 effect-audit row and 13 §6.2 both say at-rest blue, so 15 contradicts itself.
   Evidence: `docs/15-reference.md:825` ("A ring of Hero blue tightens on the captain") against `progressBeam.ts` gather (`color: HERO_GLOW`), `docs/15-reference.md:982` ("`ring` at-rest blue on the captain") and `docs/15-reference.md:123` (At-rest blue = `HERO_GLOW`). docTables doesn't check the What-you-see column, so it passes anyway.
   Acceptance line or rule: Acceptance 2 (a 15 §7 row): the row exists and passes, but it misstates a colour. Project notes: "Values … changes with its row." One word to fix ("At-rest blue").

2. Nit — The gallery cell replays PR 21001, the same merge as the *Power link (first)* cell: a facility's first merge. The packet allowed "any variant" here, but Out of scope leaves "a facility's first merge as a progress beam" to E5. Someone watching the gallery could read this cell as that decision. A non-`first` merge would avoid that reading.
   Evidence: the gallery captions read "Progress beam · agent.progress … subject 21001 · agent Juno Achterberg" and "Power link (first) · attachment.merge:first … subject 21001 · agent Juno Achterberg" (probe below).

## Look (the packet's Look check; the builder had no display)
I watched the cell with a throwaway Playwright probe (scratchpad, not in the repo) that ran on the built gallery, and kept two stills here:
- `review-1-still-gather.png`: the at-rest blue ring tightens on Juno Achterberg's captain (top).
- `review-1-still-act.png`: one half-weight **mining beam** runs from the captain, where it sits, to the Story's **asteroid** on the planet below. No formation, no station fire, no travel.
- Fixture merge: PR 21001 in Harbor Pod (pod-sprint). The phaser branch (an enemy ship as the aim) isn't exercised by this cell. Code reading shows it's symmetrical to Power link's.
- The probe saw the demo loop with peak 4 commands and active back to 0, and logged no console errors.

## Checks run
- `npx vitest run` on maneuvers, commands, docTables, pacingCandidates, pacingBuilt, solarSeek and rulebook: 173 passed.
- `npm run -s typecheck`, `npm run -s lint`: clean. `npm test`: 102 files, 1503 passed.
- `npm run e2e:spec -- gallery-assets`: 4 passed. These include the maneuver-demo spec with 17 rules and `agent.progress` present, full and reduced motion, and no console errors (acceptance 1).
- `npm run e2e:keystone`: 43 passed.

Not findings (checked and fine; the fixer shouldn't touch them):
- `match: () => false` keeps the rule out of every plan. The only things that iterate `PACE_RULES` are the planner, the gallery, and the pacing scripts and tests, which all pass. The builder reports no golden or ledger moved.
- `MineArgs.scale` defaults to 1. The two existing `mine` callers (`stationFire.ts:31`, `powerLink.ts:155`) don't pass it, so they're unchanged. The scale adds no new Pixi resources, so there's no shared-resource or teardown risk.
- With several aims, `durS - i*0.15` can go small or negative. Both `Beam` and `MiningBeam` clamp to their minimum reach + release, so it's safe.
- With no captain present, there's no beam and no dock, but the echo still lands, as the packet says.
- The 05 §8.4 "Not yet scheduled" sentence was needed for `rulebook.test.ts`. It's in a non-normative doc and the build record names it as a deviation. Fine.
- The 13 §6.1, 13 §6.2, 15 §8 commands and 15 §8 effect-audit rows match the code.
