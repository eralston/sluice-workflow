# Slice 1.3-B3: Features on the star plate

**Status:** built 2026-10-27; waiting on HG-B (this item's part). Plan: [23-v1.3.md](../23-v1.3.md) Block B. Fixture data only (INV-18).

## 1. What was built
- **The row.** The region's star plate (Solar pod level) shows, under its counts line, the pod's top three Features by piece count:
  `Feature #9009 · Dynamic pricing · 10`, then `+N more`. Pressing `+N more` opens the rest in place (the plate grows; the press does not
  select the star) and the button reads `show fewer`. Open state is per plate (`Label.featuresOpen`). Quiet: the PR stat line's look
  (`--holo-t2-sub`, 9 px; T3's colour fails 4.5:1, as B1 found). The chart's word for a container, if the theme has one, follows muted.
- **No object.** Text only; a test asserts no node stands for a Feature (INV-10).
- **Counting.** `regionFeatures` (`solarSource.ts`): pieces in the region, on the ladder, at the playhead, whose parent (`parentAtTime`) has ADO type
  `Feature`. Pieces with no parent, or an Epic parent, are not counted. Type and title come from the snapshot, else the bundle's entities and current
  state; an unknown title reads `Feature #id` (R4). Order: count descending, tie by **lower Feature id** (`rankFeatures`, `@shared/featureRow.ts`).
- **Reservation (review round; R4 against R9).** A pod that never has a Feature in the round has no row and no blank line. Otherwise the plate reserves
  `min(4, Features ever + 1 if over three)` lines from the first draw (`featureLinesEver`, `ViewNode.featureLines`), so a seek never changes its height or side.
  The round's stars carry none (`solarPodStar(..., withFeatures)`).
- **The opened list (review round).** At most eight lines (`FEATURE_OPEN_LINES`), scrolling inside its box (scroll kept across redraws; presses and wheel on it don't select
  the star or zoom). Before this, a long opened list was placed at full height, failed `inView` and vanished when the pointer left. Pulsar has ten Features (9004, 9006, 9010-9017) to test it.
- **R3/R12.** The Inspector's pod body lists the same Features, ADO name first, with the same button (`PodFeatures`).
- **Fixtures.** Halcyon gained Features 9007-9017; Quasar draws from five (9003, 9005, 9007-9009), Pulsar from ten. Only parent
  assignment moved (`pick` draws one number whatever the list). Quasar shows 10, 7, 7, 6, 2: so `+2 more`.
- **Drive steps:** `tests/drive/steps/feature-row.ts`. Stills: `review/v1.3/B/B3-quasar-star-{collapsed,expanded}.png`.

## 2. Contracts changed
03: `ViewNode.features` (view model, `FeatureTally`); 02 INV-10 note; 06 §9 (Containers); 13 §4.4, §10 (Containers row), Q5; 15 §6 (new `feature-row` table and text,
guarded by `docTables.test.ts`); `tests/README.md`. 03 §5 (`ViewNode.features`, `ViewNode.featureLines`).

## 3. Checks
`npm run typecheck`, `npm run lint`, `npm test` pass (new: `featureRow.test.ts` 12, `halcyonCoverage` +2; no golden moved). `npm run e2e:spec -- demo` (new test: three Features,
`+N more`, expands, Inspector list, no Feature object), plus the mapped specs and keystone: see the final report.

## 4. Human gates
**HG-B (Features part):** `review/v1.3/B/B3-quasar-star-collapsed.png` and `-expanded.png`. Retaken after the review round, plus `B3-pulsar-star-expanded.png` (ten Features: eight lines, scrolling). Looked at: three quiet lines and `+2 more` sit under the counts line, legible at
9 px; expanded, the plate grows upward (the star's plate is above it) and covers nothing new. Quiet but close in size to the stat lines.

**Displacement (R2), said plainly:** the four-line row on Quasar's star hides the labels of two stations near it (`payments-sync`, `search-api`), collapsed or opened (the
stations stay drawn). On Harbor (`solar.spec`) the taller plate now sits to the **side** of its star, so 22 A3's "above" loses in a moderately busy region; a new assertion checks no body's centre sits under the plate (a hit circle is a 12 px floor and the plate can graze it: on Harbor a threat's 16 px circle is 11 px from the plate's edge, so a strict circle test fails). Whether that trade is wanted is yours to judge.

## Deviations from 23
- The row uses `--holo-t2-sub` at 9 px, not 23's "T3": T3's colour fails 4.5:1 here (as B1 found).

## 5. Known limitations and open questions
- Only type `Feature` counts: another pack's container types (a CRM pod) show no row (an empty reserved line).
- The reserved line count is an upper bound (Features that ever parent a piece in the region), so a pod can hold a blank line or two at moments when fewer show.
- The Inspector and the plate keep their own open/closed state.
- A Feature appears while pieces sit under it now; a Feature whose pieces all left the pod disappears (playhead-based, like the counts).
