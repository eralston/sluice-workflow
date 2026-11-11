# Slice 1.1-closeout: the review set's six findings

2026-10-14. The user chose to fix the six findings of [slice-1.1-review.md](slice-1.1-review.md) §5
before archiving v1.1, built inline with one fresh-context reviewer at the end (their choice, from
"decide per block").

## 1. What was built
1. **A piece's plate outlived the episode.** Not a cast window, as the review guessed: the History
   panel lights the current beat's object while playing (`hoverObject`), and nothing cleared it when
   play stopped or the panel unmounted, so the last beat's piece stayed "hovered", and hover-only
   since L7, its plate stayed up. `panels/History.tsx` now clears the light it set when play stops
   (a pause or the end) or the panel closes; a light the pointer set on a card is left alone.
2. **Captain squares under other plates.** A captain's picture is pinned to its hull and placed last,
   so plates placed before it never saw it. `chart/labels.ts` now puts every picture square in the
   obstacles first (from the last frame's tier and size), and a focused plate with no free place
   prefers a spot clear of other labels, crossing bodies if it must, before its first candidate.
3. **A CRM pod star's two counts disagreed** (plate 8 items, inspector 0). The inspector's line was
   v0's, which counts only User Stories and Bugs. `solarPodStar` now builds both lines from
   `regionCounts`, which also counts what's done (`solarSource.ts`).
4. **A galaxy's plate ran under the side panel.** A holo plate now counts as in view only left of the
   panel (`LabelMotion.rightInset`, from the camera). Holo plates only, so the v0 views are unchanged.
5. **Lantern Pod's lone rock sat between two stars.** The preview's clusters now start by their star
   (`PREVIEW.clusterX` 215 → 130) and grow outward as half a sunflower (`preview.ts`), so one rock sits
   by its own star; a rock's place still depends on its index alone (R4).
6. **Terse History lines under Solar.** `describeMoves` (the chart register) names a piece with its
   title as of the event (`asteroid #20112 · Harbor master dashboard: Ready → Underway`), names a
   bound child by its own role (it read "item #…"), and names a container by its number and title
   alone (`joined #20002 · Harbor alerts`): Solar draws no containers, and the chart register never
   names a source type (INV-11).

**The reviewer** (one fresh-context agent, criteria but not reasoning) found eight more in the first
pass, all fixed:
- the picture obstacles had leaked into v0's labels (now holo plates only);
- a CRM pod star's art was still the empty pod's sketch: its look now comes from the same counts
  (`regionStage`, v0's thresholds over the pack's rungs);
- four fixes had no guard: tests now cover the preview's placement, the galaxy plates and the panel,
  plates off the pictures in play, and no piece plate after the end;
- a ship's own stale square blocked its own plate;
- History cleared lights it didn't set: it now remembers the key it lit, and hands the light back to
  whatever the pointer rests on (the second pass found that skipping the clear left the bug in place
  when the pointer rested on an object);
- the wording fix was uneven: a container's "New" line, and parents without titles;
- per-frame work in the label fallback;
- `rightInset` didn't reach expanded plates.

Also: the L6 dreadnought test (`solar.spec.ts`) now waits for the hull to be still before pointing.
Under parallel load the hull was still gliding when the pointer arrived, and a still pointer sends no
new events, so it never read as hovered.

## 2. Contracts changed
None in 02 or 03. `LabelMotion` gains `rightInset` (renderer only); `regionCounts` returns `done`
too. 15 §5's `PREVIEW.clusterX` row is updated. 90-later's *Demo-pack chrome* entry is amended.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` | 876 pass (new: a CRM pod's plate, inspector and look agree; a bound piece and its container are named; the preview's clusters are prefix-stable, within reach, and a lone rock sits by its star) |
| Guards checked against the old code | The end-of-episode e2e fails with HEAD's `History.tsx` (one plate left); the lone-rock and CRM-stage unit checks fail on HEAD's layout and stage |
| Reviewer | Two passes: eight findings, then one more (History with the pointer resting on an object), all fixed |
| `npm run typecheck`, `npm run lint` | Clean |
| Goldens | `solar.round.json` updated on purpose (rock and hive positions only: 66 x/y lines); no other golden changed |
| `npm run e2e:spec -- solar solar-play slice3a slice3b explore slice1` | 77 pass, then the L6 test failed under load; after its fix, 60 of 60 twice under the same load |
| `npm run e2e:keystone` | 38 pass |
| Drives | `v11-tour`, `v11-S2`, and a scratch end-of-episode probe (the plate gone 1.5 s after the end; deleted) |
| Full `npm run e2e` (final tree, after the reviewer) | 145 parallel + 21 alone, all pass |
| Review stills | The gallery and all 14 `review/v1.1/` drives retaken on the final tree |

## 4. Human gates
No new gate. The fixes show in `test-results/drive/v11-tour/` (`01` the galaxy plates clear of the
panel, `04` Lantern Pod's rock by its star, the last stills: no plate after the end) and
`test-results/drive/v11-S2/04` (the star's plate clear of KM's square).

## 5. Known limitations
- An event that moves nothing still reads terse under Solar ("asteroid #20141 · wi area changed").
- A captain square's obstacle lags its tier change by one frame.
- In a crowded region a focused plate may still cross a planet's disc (labels are kept clear first).
