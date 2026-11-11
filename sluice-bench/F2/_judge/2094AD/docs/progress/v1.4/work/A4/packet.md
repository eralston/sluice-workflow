# Packet A4: Station plate, no horizontal scroll
Risk: small-ish, medium tier (CSS plus one DOM tweak, the e2e is the real work) · Score: blast 0, verify 1, design 0, acceptance 0, track 1
Start commit: d39649b

## Acceptance
- WHEN any station plate in Halcyon's four pods or in Meridian is expanded, THE rows box's `scrollWidth` SHALL
  NOT exceed its `clientWidth` (a new e2e case in `demo.spec.ts`).
- In the same test, every fact on the stat line stays visible (wrapped, not cut).

## Approach
Decided in the scope doc: the plate's width is unchanged (the expanded plate's cap is 220 px via `.callout--holo`, and
`labels.ts:475` sets an inline max-width of `min(EXPANDED_MAX_W, view)`); the rows shrink to fit it.
1. `holo.css` `.holo__rows`: add `overflow-x: hidden` beside `overflow-y: auto`.
2. `holo.css` `.holo__row .callout__title` (line ~206): `max-width: 280px` exceeds the 220 px plate, so change it to
   `max-width: 100%` (the row's `.holo__text` already has `min-width: 0`; the ellipsis already there then works).
3. The long repository name / container line: give the row's `.callout__meta` and `.holo__sub` (not `.holo__stat`)
   `max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The row's hover `title` already
   carries the full title (`holoRows.ts:184`); do not add more.
4. Stat line wraps at its `·`: in `holoRows.ts` (row(), ~line 195) build `.holo__stat` from one `<span class="holo__fact">`
   per part (split `row.stat` on ` · `), joined by text nodes ` · `, so `textContent` is byte-identical to `row.stat`
   (the existing B1 test compares `allTextContents()` to it). CSS: `.holo__stat { white-space: normal; }`,
   `.holo__fact { white-space: nowrap; }`. Empty stat keeps ` `. A facts group like `✓ 2  ⧖ 1` stays one nowrap
   fact. A wrapped line may end in `·`; accepted.
5. R4 note: the stat line reserves one line before facts land; a wrap adds a line only when a stat is long. Accept; say so
   in the 06 §9 line.
6. Docs: one sentence in 06 §9 (the Holo-plate rows paragraph, near `holo__rows` / the expanded plate; find it with grep
   `expanded plate` in `docs/06-*.md`): rows never scroll sideways, titles ellipsis, the stat line wraps at its `·`.
   15 §6 changes only if a constant changes; none does (do not touch `docTables`).
7. Test (`tests/e2e/demo.spec.ts`, new `test`, serial after the B1 case): for each pod in `PODS`, enter it, and for every
   facility node expand its plate the way the B1 test does (clear the edges, wait still, `mouse.move` onto the hull;
   factor that block into a local helper `expandStation(pk)` and reuse it in the B1 test only if the diff is small; else
   copy). Assert `.holo__rows` `scrollWidth <= clientWidth` (a +1 tolerance is NOT allowed) and that every row's stat
   `textContent` equals the fixture value and that each fact's `getBoundingClientRect()` lies inside the rows box
   horizontally. Then a second `describe` or launch with `STAR_CHART_FIXTURE: 'meridian-sprint'` (see
   `solar-dense.spec.ts:18-19` for the launch and the `Meridian Works` click) and the same check for its pods' stations.
   Keep per-station cost low: skip stations whose plate has no rows. If expanding all is too slow (>60 s), cap at the
   10 stations with the most rows per scene; say so in the record.

## Files
- `src/renderer/src/chart/holo/holo.css` 186-210 (rows box, row, title), 213-217 (stat), 218-224 (run line)
- `src/renderer/src/chart/holo/holoRows.ts` 160-215 (`row()`), 150 (`runLine`)
- `src/renderer/src/chart/labels.ts` 470-486 (expanded max-width, read only)
- `tests/e2e/demo.spec.ts` 46-117 (B1 and B2 cases to mirror), `tests/e2e/solar-dense.spec.ts` 10-25 (Meridian launch)
- `docs/06-*.md` §9 (line ~1053 on)

## Excerpts
- holo.css:197: `flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;`
- holo.css:206: `max-width: 280px; overflow: hidden; text-overflow: ellipsis;` (on `.holo__row .callout__title`)
- `.holo__row { ... padding: 1px 4px; margin: 0 -4px; }` runs 4 px past the box each side; with `overflow-x: hidden` that
  edge is clipped (the CSS comment at ~line 214 already accepts this for `overflow-y`); keep rows' text inside.
- Rule R4 (counts first, no reflow); R9 (nothing cut that is a count: the stat's facts must all stay visible).
- Stat text: `prStatLine` in `src/shared/prStat.ts` joins parts with ` · `; votes join with two spaces.

## Checks
- `npm run e2e:spec -- demo solar` plus `npm run e2e:keystone` (one at a time, `with-lock.sh` if parallel).
- Unit: `npm test` (docTables must stay green; `prStats` unchanged).
- Look once with `npm run drive` on Quasar and Pulsar station plates if cheap; stills optional.

## Out of scope
- Widening the plate; the run line and star-plate Features (already ellipsis or short); `src/shared/prStat.ts` text;
  vertical scrolling behaviour; other plates (star, planet) beyond the CSS they share.
