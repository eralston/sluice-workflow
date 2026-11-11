# Slice 1.1-L2: One expandable holo plate (with L5, homeworld rows)

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) items L2 and L5, on top of L1
([slice-1.1-L1.md](slice-1.1-L1.md)), the only earlier item in this run. No human gate of its own; the
stills below are for the user's review alongside HG-L1.

## 1. What was built
- **One plate, grown in place.** The navy mega-label overlay (`chart/megaLabels.ts`,
  `megaLabels.css`, `.callout--mega`, the `mega-labels` overlay) is retired. A holo plate whose node
  has a list (`graph.lists`) grows its rows under its title, in the same frame and with the same
  pointer, while its tier is `expanded`, for `GRACE_MS` (450 ms) after, and while the pointer is on
  the plate. Expanded, the plate is lifted (19 §2) and sits over the other labels.
- **Shared input** moved into `chart/holo/holoRows.ts` (`HoloRows`): delegated row input on the plate
  that survives a redraw (the lit row is found again from the pointer), long-press on touch
  (`LONG_PRESS_MS`), press-to-select (down and up on the same row), the container link (`open`, never
  an `<a href>`), `ROW_BUDGET` then "+N more", rung marks in the ladder's colours (`RUNG_MARK`,
  `--rung`, INV-20), wheel scrolling inside the rows. A press on a row never presses the plate's own
  object (`inRows`).
- **Placement** (`holoLabel.ts`, pure): the plate is placed from its Title or Full size, then
  `growPlacement` keeps its side, its pointer and its near edge and grows away from its object (beside:
  down and outward; upright: down below the hull, up above it, centred on its connector);
  `slidePlacement` keeps it in view by sliding along the edge its pointer meets; `expandAt` re-places
  once, on expanding, if the grown plate won't fit, and the label layer pins that place until the plate
  folds. Capped at the view and `EXPANDED_MAX_W` (320 px); its rows scroll. Expanded plates place
  first; a focused (lit) plate with no free place is hidden rather than drawn under one.
- **L5, homeworlds:** T3 at rest (title only, variant `title`), expanded from the planet's disc or its
  plate. Over a piece on the disc, the piece's smaller hit area is on top, so the piece wins and the
  planet's plate folds after the grace. Facilities and pieces keep their current rows (L6, L7).
- **Names (Q5):** tiers `full`, `title`, `expanded`, `picture` (were `standard`, `compact`, `expanded`,
  `minimal`); the `minimal` variant is `title`. `data-tier` values follow; v0's `is-compact` class is
  unchanged.
- **Wiring:** `LabelLayer.sync(nodes, level, lists)`; `LabelInput` gains `light`, `pick`, `open`,
  which ChartApp sends to the hover ring (`overlays.light`), `onPick` and the container link. The ring
  stays an overlay, renamed `.hover-ring`, its CSS in the new `chart/overlays.css`.
- **Gallery:** *Label hierarchy* gains an *expanded · feature* cell: a homeworld and a dreadnought at
  rest and expanded (one row per rung, one lit), built by the chart's own `HoloRows` and `growPlacement`.
- **Drive:** `tests/drive/steps/v11-L2.ts`.

## 2. Contracts changed
- Renderer: `LabelTier` values renamed; `HoloVariant` `minimal` → `title`; `HoloFrame.light(hover,
  selected, expanded?)`; new `growPlacement`, `slidePlacement`, `expandAt`, `inHoloView`, `HOLO_EDGE`
  (`holoLabel.ts`); new `holoRows.ts` (`HoloRows`, `RowInput`, `inRows`, and `GRACE_MS`,
  `LONG_PRESS_MS`, `RUNG_MARK`, `rowsInBudget` moved from `megaLabels.ts`); `LabelLayer.sync` third
  argument; `LabelInput.light?/pick?/open?`; `EXPANDED_MAX_W` exported from `labels.ts`. `MegaLabelLayer`,
  `placePlate`, `PlateSide` removed. No shared contract changed (`MegaList` is as it was).
- Doc edits: **15** §6 (label-tiers rows renamed, a new *Expanded plates* paragraph, holo-variants
  world row `title`, label-values rows moved to `holoRows.ts` plus `HOLO_EDGE` and `EXPANDED_MAX_W`, the
  type sizes, the contrast row), §2 (`--amber` no longer heads a list, `--cyan` names the hover ring,
  the Guard line), §3 (RUNG_MARK's source), §9 actions-ui (Hover an object). **06** §2 (tier names), §9
  (Labels intro, hierarchy, variants, planets, captains, *Mega-labels: one expandable plate*, v0 scope,
  VC-2), the VC table and the palette row. **12** *Mega-label*, *Label tier*, *Holo label*. **14** the
  file table, §2.9 (tier type, the new signatures), the test table, the vocabulary table. **03** the
  file table, `HoloSpec`, the `AssetDef.label` bullet, `onPick`, *Labels and overlays*. **19** L2 and
  L5 State lines, four §5 decisions. **tests/README** the mapping row and the `v11-L2.ts` row.
- Departures from 02/03/13: none in rule. 13 §4's mega-label contents are unchanged; only where they
  draw moved. 02 INV-20 holds (marks keep shape and ladder colour).

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (840; `labelTiers` rewritten: the tiers under their new names, grow/slide/expandAt, the budget, the registry now only the hover ring; `docTables` with the moved rows) | Pass |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- solar` (incl. `solar-play`: the new test, a homeworld T3 at rest, expanded from its disc, a row lit and ringed, contrast 4.5:1 with rows, folds after the grace, expands from its plate, a row press selects its object; no `.callout--mega`) | 12 passed |
| `npm run e2e:spec -- solar slice1 slice2 density` | 47 passed (VC-1 pixel baselines unchanged) |
| `npm run e2e:spec -- gallery-v1` and `GALLERY_FAMILY=labels` | 5 passed; 1 passed |
| `npm run e2e:keystone` | 38 passed |
| Goldens | Unchanged; no `-u` |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gates (review stills; no gate of its own)
- **Drive:** `npm run drive -- tests/drive/steps/v11-L2.ts --paradigm solar` →
  `test-results/drive/v11-L2/`: `01` Harbor Pod mid-round at rest; `02` Kit's Haven pointed at on its
  disc (the T3 plate grows its two rows in place, left of the planet); `03` a row hovered (the row lit,
  the asteroid ringed, its own plate hidden rather than under the list); `04` folded after the grace;
  `05` its plate pointed at; `07` harbor-console pointed at (the dreadnought's plate grows down, with
  its work rows and container lines); `08` Tide table widget pointed at (its steps); `09` Kit's Haven
  selected and settled (stays expanded); `10` the same while playing at 2× (back to its title).
- **Gallery:** `npm run gallery` → *Label hierarchy*, last cell *expanded · feature*
  (`test-results/gallery-v1/labels-c0.png`, bottom row).
- Watch for: whether the rows' T2 colours read calm enough under a lifted head; whether the plate
  covering pieces beside the planet (it avoids bodies only when re-placing) is acceptable.

## 5. Known limitations and open questions
- **Covering on expansion.** An expanded plate keeps its place and grows; it re-places only if it
  leaves the view, not if it covers other bodies or pieces (by the rule "never jump"). In `02` the
  Kit's Haven list is clear, but in a denser region it can cover pieces near its planet.
- **Touch long-press** is ported unchanged but has no e2e coverage (as before).
- **Grace across a re-render:** the plate's text is redrawn on every sync and the rows re-attached;
  scroll is kept. If a list's rows change under a still pointer, the lit row is re-found from the
  pointer, as the overlay did.
- **The region's star** still has no list (as planned in L4), and still lands over Kit's Haven's disc
  when selected (L1's note).
- **Pieces with steps** still expand into their steps, and pieces still have plates at rest: L7 changes
  both. Facility rows are still the linked work, not PRs: L6.
- The `LabelTier` type and the `label-tiers` table keep the word "tier", next to the plates' T1–T3
  tiers; prose now says the four *states* by their Q5 names. A rename of the type was judged not cheap.
