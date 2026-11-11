# Slice 1.1-L6: Dreadnought plates expand into their PRs

Built 2026-10-13, following [19 §3](../19-v1.1.md#3-items) item L6 and the user's Q6 answer (the
expanded plate lists the station's PRs, opened by hovering the hull or its plate). Built on L1 and L2
([slice-1.1-L1.md](slice-1.1-L1.md), [slice-1.1-L2.md](slice-1.1-L2.md)); nothing of theirs was reverted.
No human gate of its own; the stills below are for the user's review.

## 1. What was built
- **The rows are the PRs.** `facilityList` (`src/shared/scene/project/lists.ts`) now takes the
  facility's attachments opened by the playhead, in opening order (`servedBy` in `solar.ts`, which
  replaced `linkedPieces`), and gives one row per PR: its title, `Pull Request #21008 · Completed`
  (the pack's word for an attachment, `words.role.attachment.one`; the source's status with its first
  letter capitalised, as ADO's pages show it), its rung (`attachmentSignal`: Active underway,
  Completed accomplished, Abandoned off) and the work it serves as the subtitle,
  `→ User Story #20112, Bug #20221`. Features drop off the rows (Q6). The station's own signal,
  intensity and tally still come from the pieces its PRs serve (`servedPieces`), so nothing else in
  the graph changed.
- **A row stands for the pieces it serves.** `MegaRow.serves` carries them. `HoloRows` maps each
  row to its targets (`serves`, else its own key): hovering lights all of them, and a press selects
  the first. PRs have no node of their own, and the inspector shows only nodes, so "select the PR if
  selectable" falls to "else the linked piece" (recorded in 19 §5).
- **Several lit objects.** `light` now carries `readonly CanonicalKey[] | null` through `RowInput`,
  `LabelInput`, `OverlayInput`, `ChartOverlay` and `OverlayStack`; ChartApp keeps `lit` as a list;
  `LabelLayer.setHighlight` takes a key or a list (its hovered set lifts each lit piece's plate); the
  hover ring draws one `.hover-ring` per lit object (made as needed, reused).
- **Opening:** unchanged from L2. Pointing at the hull or its plate expands the T1 plate (checked
  in the new e2e test and the drive).
- **Gallery:** the *Label hierarchy* › *expanded · feature* cell's dreadnought is now tide-gateway
  with two PR rows, the lit one serving two pieces (a third row overflowed the cell, so it went).
- **Drive:** `tests/drive/steps/v11-L6.ts`.

## 2. Contracts changed
- **Shared:** `MegaRow.serves?: CanonicalKey[]` (03 §5d). `facilityList(title, map, s, attachments:
  ServedBy[], word?)` replaces `(title, map, s, pieces, linkOf)`; new `ServedBy`. `itemRow` lost its
  unused `subtitle` parameter. `solar.ts` no longer calls `pack.containerUrl`.
- **Renderer:** `light(keys: readonly CanonicalKey[] | null)` on `RowInput`, `LabelInput`,
  `OverlayInput`, `ChartOverlay`, `OverlayStack`, `HoverRing`; `LabelLayer.setHighlight(hovered:
  string | readonly string[] | null, selected)`.
- **Doc edits:** **03** (the `MegaRow` block, the *Mega-lists* `facilityList` paragraph, the
  expandable plate's `light`/press, `ChartOverlay.light`). **13 §4.4** *Mega-label* rewritten (PR
  rows, served work as the subtitle, rows light the served pieces, no Feature) and the §Q5 row.
  **02** INV-10's Solar containers note (amended: no Feature shows in Solar since L6). **06** the
  kinds table's Container row, *Containers aren't drawn*, *Mega-labels*. **12** *Container* and
  *Mega-label*. **14** the `MegaRow` block, the vocabulary row, the `RowInput` signature and a v1.1 L6
  note. **15** the Container role row, §6 *Expanded plates* paragraph, the type sizes (a PR row's
  served-work line 9.5 px). **90-later** *Epics*. **19** L6 State line and a §5 decision.
  **tests/README** the `v11-L6.ts` drive row.
- **Departures from 02/03/13:** 13 §4.4 (the mega-label listed objectives and threats with their
  Feature) and 02's containers note, both amended in this change, as Q6 decided. No constant in 15
  moved, so no table value changed.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (840; `solarSeek`: facility rows are PRs with meta, rung by status, `serves` drawn and named in the subtitle in order, no link; a new ledger-sync case, one PR serving two pieces; `literalFence`) | Pass |
| Golden `solar.scenes.json` | Changed deliberately (`npx vitest run -u tests/golden/solar.test.ts`): only the facility lists' rows (PR rows with `serves`). No v0 golden changed |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run e2e:spec -- tests/e2e/solar.spec.ts tests/e2e/solar-play.spec.ts tests/e2e/gallery-v1.spec.ts` (solar: new test, ledger-sync's plate expands from its hull, its PR row's text, two rings on hover, contrast 4.5:1, folds, expands from its plate, a press selects the first served piece) | 18 passed |
| `GALLERY_FAMILY=labels` gallery-v1 | Pass (re-run after the gallery's last edit) |
| `npm run e2e:keystone` | 38 passed |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gates (review stills)
- **Drive:** `npm run drive -- tests/drive/steps/v11-L6.ts --paradigm solar` →
  `test-results/drive/v11-L6/`: `02` tide-gateway's hull pointed at, Thu Oct 8 (seven PR rows,
  Completed ● and Active ◔, each with `→ User Story #…`); `03` its first row lit; `05` the round's
  end, ledger-sync's row lit: **two rings**, round Console freezes on export and Pilot boat roster;
  `06` its plate pointed at after the grace; `07` the row pressed: Pilot boat roster selected and
  revealed.
- **Gallery:** `npm run gallery` → *Label hierarchy*, *expanded · feature*, right-hand pair
  (`test-results/gallery-v1/labels-c0.png`, bottom row).
- Watch for: whether `Pull Request #n · Status` plus the `→` line reads well at three lines a row, and
  whether seven rows over the region's middle (`02`) is too much plate.

## 5. Known limitations and open questions
- **No Feature in Solar any more.** The station's rows were the only place Features showed, and the
  inspector shows the Epic, not the Feature. Revisit with Epics (90-later) or add a Feature line to
  the inspector if the user misses it.
- **The container link plumbing is unused now** (`subtitle.url`/`key`, `ChartApp.openRowLink`,
  `onOpenContainer`, `DomainPack.containerUrl` and its `packs` tests). It's kept for a list that names
  a container again; it could be removed if not. The PR row's subtitle is plain text: opening the PR
  or the served item at the source from the row isn't offered (the inspector's Open in ADO stays).
- **A landed objective isn't ringed:** a row whose served Story has landed (hidden, counted on its
  seat) lights nothing visible (`03`: Dashboard endpoints). Same as L2's seat rows.
- **Lit plates may overlap:** the two lit pieces' own plates both lift and can cross (`05`: Pilot boat
  roster and Console freezes on export), as focused labels may (L1, L2 notes).
- **A busy station's plate is tall:** tide-gateway's seven PRs cover the middle of the region at fit
  (`02`). The row budget (16) and the view cap still hold.
- **Status words** are the source's raw status capitalised (`Active`, `Completed`, `Abandoned`), not
  "Merged"; a pack-supplied word for each status would be a later choice.
- The fixture's comment on its Features (`pod-sprint.ts`, "station mega-label subtitles") is now
  stale; fixtures were left untouched.
