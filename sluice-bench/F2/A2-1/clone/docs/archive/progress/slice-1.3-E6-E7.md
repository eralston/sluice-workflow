# Slice 1.3 E6 + E7: theme-owned reading copy, and the guided tour

## What was built
- **E6.** `ThemePack.readCopy` (`theme/types.ts`: `ReadCopy { paragraph(c, s), tour(c, s), more(n) }`), filled by
  `theme/starChart/readCopy.ts`. The "How to read the chart" sentences moved there unchanged (frozen in
  `tests/unit/readCopy.test.ts` for SDLC). `Read.tsx` now reads the theme's copy. Every `+N more` site (holo plate rows,
  the callout Features row, the Inspector's Features row, History's card) calls `moreText(n)` in `theme/registry.ts`,
  which asks the active theme (English default if none).
- **E7.** A seven-step overlay tour (`src/renderer/src/tour/`): star, planet (seat), asteroid, hive ship, station,
  captain's ship, the player. `tourRun.startTour` reboots to the fixture galaxy, opens Halcyon Reach and Comet Pod, pauses at
  the start; each step calls `reach(target)`, which plays at 4x (a beat at a time under reduced motion) and pauses the moment
  the object is on screen. Objects come from the new `nav.liveScreen()` (live nodes with screen centre and radius), the player
  from the `.transport` element. Plate = R1 holo style with `holoCandidates` placement and a ring + pointer, re-anchored every
  frame; after 25 s without the object the plate shows with no pointer. Keys: Esc closes, ←/→ step (captured, so the chart's
  own Back and beat-stepping stay out). The ring pulse stops under reduced motion (OS setting or the store flag).
- **Offer.** `UserSettings.tourOffered?` (schema, merge, patch). A card at the bottom of the window arms once the settings load
  and `tourOffered` is not true, and marks the flag at once, so it is offered once. Settings › How to read the chart always has
  *Take the tour*.
- **ADO mode.** Halcyon exists only in the fixture. The tour switches the data source to Fixture (`mode.set`, then reboot), and
  `endTour` puts the prior mode back. Nothing is read from or written to ADO. Solar only (a developer view says so in Settings).
- Test-only plumbing: `STAR_CHART_TOUR_OFFER=1` (`--star-chart-tour-offer`, `env.tourOffer`). Without it test runs
  (`testMode`) never show the offer, so no other spec is blocked by the card.

## Fix round (review findings 1 to 8)
1. `mode.set(m, { transient: true })`: main uses the mode for the run but never writes it to the cache, so a quit or crash mid-tour boots into the saved mode (and `resumeAz` runs as normal). The tour uses it both ways. New spec: quit mid-tour from ADO, relaunch, mode is `ado`.
2. A node counts as seen only when its drawn alpha (`viewAlphas`, via `nav.liveScreen().alpha`) is at least 0.95, and the pod keeps playing 900 ms (one more beat under reduced motion) after first sight before holding. The spec's `ringKind` now counts only nodes with alpha at least 0.95, so a ring on an invisible object fails it. The chosen object is pinned per step so the ring doesn't hop to a bigger one.
3. `Transport.tsx` beat tooltip uses `moreText()`; `ReadCopy.fewer()` and `fewerText()` carry `show fewer` (labels, Inspector).
4. `an()` treats "us-", "uni-", "uti-" as a consonant sound: "a User Story".
5. The playback rate is saved at start and restored by `endTour`.
6. Placement scores every candidate by what it would cover (player bar, side panel and zoom controls 100; the ringed object and its name 50; other objects 5; labels 3) and takes the cheapest that fits. Candidates: out, back the other way, upright; the player's bar sweeps along its lower edge.
7. `tourOffered` and the transient mode are in 03's settings list.
8. `STAR_CHART_TOUR_OFFER` only counts when main is in test mode.

Stills re-shot and looked at (all seven): 1 star ringed with its plate clear; 2 homeworld ringed, plate beside it; 3 asteroid drawn and ringed; 4 enemy ship drawn and ringed, but the plate overlaps the planet's left edge a little and the shot lands mid PR flare (busy rings round the station); 5 station drawn and ringed, an expanded Kai's Reach plate (the chart's own) sits above it; 6 captain's ship ringed, plate clear of the player bar; 7 player bar outlined, plate below it at the left, clear of the ship and labels.

## Contracts changed
- `UserSettings.tourOffered?: boolean` (03 / `contracts/settings.ts`); `StarChartApi.env.tourOffer`.
- Docs: 14 (ThemePack, file table), 13 §7 (tour paragraph, tab row), 06 (new "guided tour overlay" section), `tests/README.md`.
- No change to 02, 03 prose, or 15 (no constants with doc rows).

## Checks
- `tests/unit/readCopy.test.ts` (3), `userSettings` pass; `tests/e2e/tour.spec.ts` (3) pass: first launch offers once and not
  after a relaunch on the same userData; each of the seven steps anchors to a drawn object of the right kind (ring checked
  against the scene's own screen positions); stills `review/v1.3/E/E7-step-1..7.png`; ←/→ and Esc; reduced motion; ADO mode
  switch and restore.
- lint clean; typecheck, other unit tests and keystone were failing at the last run from other batches' work in progress
  (see the handoff message).

## Human gates
- Review the seven stills in `review/v1.3/E/` for wording and plate placement (the plate can cover a neighbouring label).

## Known limitations and open questions
- The step 4 plate can still touch the planet's edge (the planet's drawn size is larger than its hit circle).
- Pod play at 4x is not a seek: a step can wait a few seconds for a late object (the station appears at the first PR).
- The tour's copy is English and one theme only; a second theme would supply its own `readCopy`.
