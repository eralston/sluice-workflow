# Slice 1.1-L1: The label hierarchy, and every Solar label holo (with L3 and L4's styling)

Built 2026-10-13, following [19 §2](../19-v1.1.md#2-label-hierarchy-proposed-2026-10-13) and items L1,
L3 and the styling half of L4. First item of the v1.1 run: no earlier `slice-1.1-*` notes existed.
**Waiting on HG-L1.**

## 1. What was built
- **Tiers as tokens** (`chart/holo/holo.css`): `--holo-t1-*` (Lead), `--holo-t2-*` (Door),
  `--holo-t3-*` (Place) and `--holo-lift-*`, each with title, subtitle, frame line, rim dot, text
  glow, frame glow, weight and size; plus `--holo-play-size` (11 px). A plate and its frame carry
  `data-holo-tier`; the tier rules set working values (`--h-*`) that the plate, frame, pointer and dot
  read. Pointed (object or label), lit from a list, or selected (`is-hover`, `is-selected`) lifts any
  plate to T1's colours, weight 600 and the stronger glow, at its own size. Titles are Inter 600 (T1,
  lifted) or 400 (T2, T3): no more synthesised 500. The glass is one opacity at every tier.
- **A tier on every plate:** `HoloSpec.tier` (`'lead' | 'door' | 'place'`, `HoloTier`). Homeworlds
  `place`; dreadnoughts and captains `lead`; asteroids and hive ships now have holo plates too
  (`subtitle`, `horizontal`, `door`: the title over `{type} #{id} · {state}`, no ◆ line).
- **The seam for nodes without an asset** (19 R1, Q12): `KindPlate` / `KindPlates` in
  `holoLabel.ts`; `HierarchyUi.plates` (by level id, then kind); Solar's table is
  `hierarchy/solarPlates.ts` (galaxy at `galaxy`, pod star and Load more at `sprint`, the region's
  star at `pod`). `nav.ts` passes it with the hierarchy (`ChartApp.setHierarchy(h, plates)`); the
  label layer resolves a node's plate as its asset's, else its paradigm's for its kind at the synced
  scene's level, and rebuilds a label whose plate changed (a paradigm switch on the galaxy). The v0
  views set no plates, so their galaxy and sector stay navy.
- **L3, the galaxy plate:** `subtitle`, `horizontal`, T2, below and right of the core (`labelRim`
  0.45, `dir`). Under Solar its subtitle is `2 areas · 136 events this week` (`not charted yet`
  kept): `projectGalaxy(…, meta)` with `GalaxyMeta` `'full'` (v0, the default, unchanged) or
  `'counts'` (`HierarchyUi.galaxyMeta`, set by Solar). A quiet galaxy's title takes T3's colour.
- **L4, styling:** the round's pod stars are `subtitle`, `vertical`, T2, above the star (miniature
  below); the round's Load more is the same. The region's star is `subtitle`, `horizontal`, T3, and
  shows its name only until pointed at or selected (`star.labelCompact = true` in `solar.ts`). The
  pod star's subtitle text is unchanged (left to P1).
- **Placement:** a horizontal holo plate with no `labelDir` now leaves along its plate's `dir`, else
  its `labelSide` (it used to fall back to the navy spots with its frame hidden); every holo plate's
  rim honours `labelRim` (horizontal ones ignored it; homeworlds have none, so they're unchanged).
  `renderHoloPlate` is exported from `labels.ts` and shared with the gallery.
- **Gallery:** a *Label hierarchy* section (`gallery/labelHierarchy.ts`, appended by
  `extraSections.ts`): DOM cells (`Section.dom`, `DomCell`, rendered by `Gallery.tsx`'s `DomFigure`),
  each tier at rest, lifted and in play, over the ink and the galaxy, sector and feature skies.
- **Drive:** `tests/drive/steps/v11-L1.ts`.

## 2. Contracts changed
- `HoloSpec` gains `tier`; new `HoloTier`, `KindPlate`, `KindPlates` (renderer). `HierarchyUi` gains
  `plates?` and `galaxyMeta?`. `projectGalaxy` gains an optional `meta: GalaxyMeta` (shared, pure; the
  default keeps v0's text). `ChartApp.setHierarchy(h, plates?)`; `LabelLayer.setPlates`,
  `sync(nodes, level?)`. The region star's `labelCompact` is now set. Gallery `Section.dom?`.
- Doc edits: **15** §2 (`palette-ui`: `--holo-line-dim` and `--holo-text` retired, rows reworded),
  §6 (new `holo-tiers` table; `holo-variants` gains a Tier column and rows for asteroid, hive and the
  four Solar kind plates; the type sizes; the contrast row). **03** (`projectGalaxy`, `HierarchyUi`,
  `HoloSpec`/`KindPlate`, `labelCompact`). **06** §5 palette row and §9 *Labels* (the hierarchy, the
  new plates, the seam). **12** *Holo label*. **19** §2 (T3 subtitle), §3 State lines (L1, L3, L4),
  L7's *Today*, §5 decisions. **90-later**: the "holo title weight 500" rough edge removed (settled).
  **tests/README**: the drive steps row and the mapping row.
- Departures from 02/03/13: none in rule. 13 §3 (every piece keeps a label) still holds: pieces are
  labelled at rest until L7.
- **One value departs from 19 §2:** T3's subtitle is `#8A9EA3` (6.7:1 on ink), not `#7E979E`. The
  contrast specs measure the glass over white, where `#7E979E` is 4.1:1 and would fail 4.5:1.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (840, incl. `docTables`: new `holo-tiers` check, extended `holo-variants`; `solarChain`: the galaxy's two meta styles) | Pass |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- solar slice1` (solar: new galaxy test, holo T2, 4.5:1 at rest and pointed; round: pod star holo T2, 4.5:1; slice1 VC-2: no `.callout--holo` in the v0 galaxy or feature; VC-1 pixel baselines unchanged) | 32 passed |
| `npm run e2e:spec -- gallery-v1 gallery-layout density scale` | 16 passed |
| `GALLERY_FAMILY=labels npm run e2e:spec -- gallery-v1` (the new section renders, alignment holds) | Pass |
| `npm run e2e:keystone` | 38 passed |
| Goldens | Unchanged (none records `labelCompact`); no `-u` |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gate: HG-L1
- **Gallery:** `test-results/gallery-labels/labels-c0.png` (or `npm run gallery` → *Label
  hierarchy*, near the top). Read each row left to right: at rest, lifted, in play; then down the four
  skies. Judge whether T1 reads as the lead, T2 as calmer, T3 as context, and whether T3's grey-cyan
  frame (0.4) is too faint over the feature sky.
- **Drive:** `npm run drive -- tests/drive/steps/v11-L1.ts --paradigm solar` →
  `test-results/drive/v11-L1/`: `01`/`02` the galaxy (rest; Tidewater Array pointed, with `2 areas ·
  136 events this week`), `03`/`04` the round (Harbor Pod pointed), `05` the region with its star
  still selected, `06` at rest (the star T3, name only; homeworlds quiet; captains and dreadnoughts
  loudest), `08` the star pointed, `09` a homeworld pointed, `10` playing at 2× (every plate title
  only).

## 5. Known limitations and open questions
- **Pieces are labelled at rest** as T2 holo plates, and in play many show: the region reads busier
  than with navy plates, which were culled more. L7 (hover-only) is the fix; until then this is the
  plan's interim.
- **The region's star, pointed at or selected,** grows to show its counts and often finds no free
  spot, so it takes its first spot over Kit's Haven's disc (focused labels may overlap; this was so
  with the navy plate too). A fallback that at least avoids bodies, or an upright plate above the star,
  could be tried with L2.
- **Entering a region keeps its star selected** (the round's double-click picked it), so the first
  look shows it lifted. Unchanged behaviour; noted because it hides the T3 rest state.
- Homeworld hover lifts the captain's plate as well (same person key): existing highlight behaviour.
- The mega-label overlay is still navy (L2), and the avatar ring is unchanged (L8).
- "Brightest nebula": the gallery shows all three skies; the feature sky looked brightest in the
  stills, which is what the cell's note says. Not measured.
