# Slice 1.3-E8: Pictures

**Status:** built 2026-10-28; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block E. Fixture data only (INV-18).

## 1. What was built
- **Drop on a captain's ship.** `chart/pictureDrop.ts` listens for file drags on the chart host. `ChartApp.captainAt`
  hit-tests the point against the ships (hit circle, never under 22 px). The first file is checked
  (`shared/pictureFile.ts`: image type or extension, non-empty, at most `PICTURE_BYTES_MAX`), decoded in the page
  (`createImageBitmap`), then sent through the existing `setCaptainPictureBytes` → `pictures.set` (main cuts it to
  128 px and keeps it under userData; it decodes again). Refusals (not an image, unreadable, too big, no ship under the
  point, not in ADO mode) show in `DropNote` over the chart.
- **People list.** The existing Settings → Captain Avatars tab already lists, sets, replaces and removes; it gains
  an *Everyone loaded, not just this view* checkbox (`captainRoster(everyone)`), so it lists everyone in the loaded history.
  No new tab was made.
- **Where are my pictures.** A line in that tab: userData's `pictures` folder, never the project folder, never leaves
  the Mac, never sent to ADO, kept through Purge.
- Stills: `review/v1.3/E/E8-drop-on-ship.png`, `E8-people-settings.png`.

- **Fix round (review):** `pictureDrop.ts` also claims file drags at the window (`dragover`/`drop`, effect `none`) so a
  file dropped off the chart never navigates; main's `will-navigate` now allows only the app's own page (`isOwnPage`: the
  dev server's origin, or the packaged `index.html`), no longer any `file://`. Over the chart the drag effect is `copy`
  everywhere, so the "drop onto a ship" notice shows for a drop on empty sky (the ring cue stays on ships).
  `captainAt` includes `assignmentBeacon` ships. Tests: a Solar test (a drop on a ship as drawn this frame; file drops on
  the side panel, transport and header are claimed; `location.href = file:///…` leaves the URL unchanged); the
  Everyone-loaded check now asserts the tab's scope line reads "everything loaded". The 6 s notice fade has no row in 15's
  timings, so it stays in 06.

## 2. Contracts changed
None (IPC unchanged). Docs 06 and 13 §7 amended.

## 3. Checks
typecheck, lint, `npm test` (new `pictureFile.test.ts`); e2e `pictures-drop` (new), `pictures`, `avatars`, `settings`,
`captain-settings`, keystone: pass.

## Deviations from 23
The People list is the existing Captain Avatars tab plus an "Everyone loaded" checkbox, not a new tab.

## 4. Human gates
None. Try dragging a real photo onto a ship.

## 5. Known limitations and open questions
- Only the first dropped file is used; several files do not match by name on the chart (use the Settings grid).
- The Inspector card's own line was not changed.
- A real Finder drag is synthesized in tests (DragEvent with a DataTransfer); not run with a real drag.
