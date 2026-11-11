# Slice V1-W3-T4: Mega-label and settings polish

Built 2026-10-10. This is an extra W3 task, not listed in 17. Its owned files are
`chart/{labelTiers,megaLabels,overlays}.ts`, `chart/megaLabels.css`, `settings/**`,
`main/userSettings.ts`, `tests/unit/userSettings.test.ts`, and the new
`tests/unit/labelTiers.test.ts`. It polishes what W2-T5 (mega-labels) and W2-T6 (settings) built.
Nothing new is mounted: W3-T1 still wires the overlays and the modal into `ChartApp` and `App`. So v0
behaviour and every golden are unchanged.

## 1. What was built
- **Mega-labels (`chart/megaLabels.ts`)**
  - **Pointer input is delegated to the plate**, not wired to each row, so a redraw can't leave
    a stale listener or a stale lit row behind.
    - `pointermove` (mouse or pen) lights the row under the pointer, once per change.
      `pointerleave` clears it.
    - A touch held for `LONG_PRESS_MS` lights its row. Lifting the finger ends the light, and a
      long press never selects.
    - **A press selects only after a matching pointerdown.** The up must come on the same row,
      with the same `pointerId`. For touch, the row under the finger is found with
      `elementFromPoint`, because a touch's up is aimed at where it went down. An up with no down,
      or a down on one row and an up on another, does nothing. `pointercancel` drops a pending
      press.
  - **The lit row is re-derived on every redraw.** When the list changes:
    - A hover-lit row becomes whichever row is now under the mouse's last position. That can be
      another row, or none, which calls `light(null)`.
    - A long-pressed row stays lit only while it is still listed.
    - A pending press survives only if its row does.
    - The lit row carries `.is-lit`, and the rows' scroll position is kept.
  - **Placement (`placePlate`, exported, pure).** It tries the side with more room, then the other
    side, then below or above (the one with more room first). It takes the first spot that fits in
    the view and covers no open plate, otherwise the first that fits. If nothing fits whole, it
    takes the preferred side, clamped inside the view. A side plate is always clamped vertically.
    `data-side` now also takes `below` and `above`, which the shared `.callout` edge rules already
    style.
  - **Max height and scrolling rows.** The plate gets an inline `max-height` (the view's height
    less the 4 px margins) and a `max-width` of `min(320px, view width less margins)`. It is
    re-measured when the view resizes. The head and "+N more" stay fixed while the rows scroll. A
    wheel over rows that overflow scrolls them instead of zooming the chart (`stopPropagation`
    only, never `preventDefault`).
  - **Off uses the ladder's Off colour.** Each row sets `--rung` from `RUNG_COLOR` in
    `art/progress.ts`, so Off is `#6f7787`, not ivory-60. The mark reads `var(--rung)`, and the
    duplicated hex values are gone from the CSS.
  - **`ROW_BUDGET` comes from `@shared/scene/project/lists`.** The copy in `labelTiers.ts` is
    removed.
  - **Container links can be opened by key.** If a `MegaRow.subtitle` carries a `key` (see 2), it
    is passed to `open(url, key)`. That gives main's allowlisted `openInAdo(key)` what it needs.
    A subtitle is a link whenever it has a URL or a key and `open` is set.
- **`chart/overlays.ts`**
  - `resetOverlays()` keeps the built-in hover ring. It clears the registry, then registers
    `HOVER_RING` (`'hover-ring'`, now exported) again.
  - `OverlayInput.open` is now `open?(url: string | null, key?: CanonicalKey)`.
- **`chart/megaLabels.css`**
  - The plate has `overflow: hidden`. `.mega__rows` has `overflow-y: auto`, `min-height: 0`,
    `overscroll-behavior: contain` and `touch-action: pan-y`, so a touch scroll cancels a press,
    plus a thin scrollbar.
  - `.is-lit` uses the hover background. The mark colour is `var(--rung)`.
- **Settings store (`settings/store.ts`)**
  - **One persist failure no longer sticks.** Changes main hasn't saved yet are queued. Each change
    sends the queue in order, one save at a time. The first success sets `persisted: true` again,
    and the local copy becomes main's answer with any changes still unsaved laid over it.
  - **A failed `loadSettings` is retried.** It forgets its promise, so the next call asks main
    again, which covers a handler registered late. Changes made meanwhile are kept on top of
    main's copy.
  - **A patch the schema refuses** (`userSettingsPatchSchema`) changes nothing locally and is never
    queued, so a bad value can't block the queue.
  - New state `devView`, and a test hook, `resetSettingsStore()`.
- **The developer toggle (`settings/views.ts`, new; 13 Q9)**
  - `DEV_VIEWS`: Solar, Sprints (v0) and Backlog (v0).
  - `chooseView(p)` closes Settings, sets `devView = p !== 'solar'`, and calls `nav.setParadigm`.
    If the switch fails, `devView` follows the view the app is still in.
  - `backToSolar()`, and `showsSettings(paradigm, devView)`.
  - **Returning to Solar works.** The cog (`SettingsButton`) now also shows under a v0 view that the
    toggle chose, so Settings → Theme → Solar is one click back. A v0 view pinned at launch
    (`STAR_CHART_PARADIGM`) never sets `devView`, so pinned v0 runs and their baselines are
    unchanged.
  - The Theme tab's radios use `DEV_VIEWS` and `chooseView`.
- **ARIA**
  - A tab's `aria-controls` is set only on the selected tab, because only its panel is rendered.
  - The cog's `aria-controls="settings-modal"` is set only while the modal is open.
- **Purge copy (`tabs/Connection.tsx`).** Below the Connect body, a note says: "Purge deletes cached
  work data only. Your settings stay: who you are, your captain's look, and the achievements
  switch."
- **`tabs/Read.tsx`: no silent SDLC fallback.**
  - `readTerms` reads the bundle's own pack through `packIdOf(h)`: its `domainPack`, or the
    registry's `DEFAULT_PACK` for a bundle that names none (AC-27).
  - A bundle that names a pack this build lacks reads in the engine's own words, never SDLC's. The
    tab then says so in a muted line.
  - It now also returns `packId` and `known`.
  - Before any bundle loads, it uses `DEFAULT_PACK`, named through the registry rather than
    hard-coded.
- **`main/userSettings.ts`: unchanged.** Main already retries naturally: after a disk failure, the
  next `set` writes the whole file again.

## 2. Contracts changed
- No shared contract changed. No file outside this task's list was edited.
- **Renderer seams, for W4-T3's 03 §5d and §6 pass:**
  - `OverlayInput.open(url: string | null, key?)`. It's declared with method syntax, so a W3-T1
    callback typed `(url: string) => void` still type-checks.
  - `HOVER_RING`. `resetOverlays()` keeps the ring.
  - `placePlate(c, r, pw, ph, w, h, placed)` and `PlateSide`.
  - `ROW_BUDGET` lives in `lists.ts` only.
  - `settings/views.ts`: `DEV_VIEWS`, `chooseView`, `backToSolar` and `showsSettings`, plus the
    store's `devView`.
  - `readTerms` now returns `{ chart, source, packId, known }`.
- **Follow-up, not this task's file:** add an optional `key?: CanonicalKey` to `MegaRow.subtitle`
  in `contracts/view.ts`, and fill it in `lists.ts`'s `facilityList` with the container's key. The
  layer reads it already, through a structural cast, and passes it to `open`.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean (node, web and e2e).
  - `npm run lint`: clean.
  - `npm test`: 49 of 49 files and 742 of 742 tests pass (re-run 2026-10-12 on resume). The
    first run's lone failure, `tests/unit/facts.test.ts:151`, was another task's in-flight engine
    code and has since cleared.
- **`tests/unit/labelTiers.test.ts`** (new, 8 tests). Renderer modules are loaded by runtime path,
  as in `signal.test.ts`.
  - `tierFor` reproduces v0's inline rule, copied from HEAD's `labels.ts`. It is checked over 6
    kinds × `labelCompact` × asset × all 64 states, 1,536 cases. The compact tier and the captain
    hug match v0 in every case.
  - v0 nodes never expand. A v1 node expands exactly when it is full and is pointed at or selected.
  - The named 06 §4 cases each have an assertion: playing, followed ship, dense grid, and the
    selected seat while playing.
  - `placePlate`:
    - It picks the side with more room, then the free side.
    - It falls back below or above in a narrow view.
    - It clamps when nothing fits whole, and clamps vertically.
  - `rowsInBudget` uses the shared `ROW_BUDGET`.
  - `resetOverlays` keeps exactly `['hover-ring']`.
- **`tests/unit/userSettings.test.ts`** (10 tests, 3 of them new)
  - **The Purge test now runs the real purge path.**
    - It builds a real `AdoService` with its SQLite cache in the same userData folder, using
      invented deps and no PAT.
    - It writes a cached setting, calls `service.purge()`, and sees the cache empty.
    - `settings.json` is byte-identical afterwards. After a relaunch, the viewer, the captain style
      and `achievements: false` all read back.
  - **The renderer store:**
    - One failed save sets `persisted: false`. The next change sends both patches in order, and
      `persisted` is true again.
    - A failed read is asked again. Changes made meanwhile are kept on top of main's copy.
    - A refused patch changes nothing and never reaches main.
- **Specs `onboarding`, `slice4` and `diagnostics`** (one locked build, `--output=/tmp/star-chart-pw/W3-T4`):
  11 of 11 pass, including AC-33's Purge.
- **Goldens unchanged.** `git status tests/golden` shows only other tasks' new files (`solar.*`,
  `v1-awards.*`, `v1-ingest.test.ts`).
- **DOM smoke** (ad hoc, in a hidden Electron window under `/tmp`, deleted afterwards). It bundled
  `styles.css` and the layer, with 20 synthetic rows in a 600×300 view:
  - The plate was clamped to y 4–296 with `max-height: 292px`, and its rows scroll (265 > 238 px).
  - The Off mark is `rgb(111, 119, 135)`.
  - Hover lit `k1`.
  - Pressing down on one row and up on another selected nothing. An up with no down selected
    nothing. Down and up on the same row selected it.
  - Shifting the list under a still mouse re-lit the new row there, `k3`, and marked it `.is-lit`.
  - Shrinking the list away from the pointer called `light(null)`.
  - `createOverlays` built `['hover-ring', 'mega-labels']`.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **For W3-T1:**
  - **Mount `<SettingsModal/>` in every paradigm, not only Solar.** Otherwise the cog that shows
    under a toggle-chosen v0 view opens nothing. The modal carries `data-paradigm="solar"`
    itself, so its CSS applies under v0 too. Under v0 it doesn't host Connection: choosing that tab
    opens the floating Connect panel, as the mode chip does.
  - `chooseView` / `backToSolar` can also go on a key or a menu.
  - Wire `open(url, key)` to `window.starChart.openInAdo(key)` when a key is present.
- **The Purge note sits after the Connect body**, below Diagnostics, because the tab only frames
  `ConnectBody`.
  - Follow-up for the owner of `panels/Connect.tsx`: the confirm text could read "Purge: delete
    every cached fact? Your settings stay." That would carry the note into the floating v0 panel
    too.
- **`devView` lasts for this run only**, like the toggle itself (boot opens Solar unless pinned).
  To persist it, add `UserSettings.devParadigm` (W2-T6's open question still stands).
- **Main's disk-failure path still answers success.** It keeps the change for the run and logs
  `settings-unsaved`, so the renderer shows `persisted: true` while the file is stale. The next
  successful write fixes the file. A `saved: false` flag in the answer would need a contract
  change (`settings.ts`, not this task's).
- **Touch long-press and scroll weren't exercised on a touch device.** `touch-action: pan-y` on the
  rows should turn a vertical swipe into a `pointercancel`, which drops the press.
- **The obstacle lag is unchanged.** Labels still avoid the plates of the previous frame (W2-T5).
