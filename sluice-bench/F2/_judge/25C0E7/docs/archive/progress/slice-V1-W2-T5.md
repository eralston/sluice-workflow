# Slice V1-W2-T5: Label tiers and mega-labels

Built 2026-10-10, following [17 W2-T5](../17-v1-phases.md#w2-t5-label-tiers-and-mega-labels) and
[14 §2.9](../14-architecture.md#29-labels-settings-achievements). v0 labels behave exactly as before.
Nothing creates the overlays yet: W3-T1 wires them into `ChartApp` (see 5).

## 1. What was built
- **`chart/labelTiers.ts`**
  - Exports `LabelTier` (`expanded | standard | compact | minimal`), `ROW_BUDGET = 16`,
    `TierState` and `isCompact(tier)`.
  - `tierFor(node, state)` is v0's inline rule, moved out of `labels.ts`:
    - Pointing opens a label fully, except on the followed ship.
    - `labelCompact` grids stay compact unless selected.
    - While playing, while moving, or during a flash, a label is `compact`, and a captain is
      `minimal` (the picture hug).
  - It adds one tier on top. A v1 node (one with `asset`) that is pointed at or selected, while
    otherwise full, is `expanded`. v0 nodes never reach `expanded`.
  - So a selected seat's mega-label closes while playback runs, like every other full label, and
    pointing at the seat opens it.
- **`chart/labels.ts`**
  - `position` now asks `tierFor` for each label. It writes `data-tier` on the label, and keeps
    `is-compact` for the compact and minimal tiers, so the CSS and the specs are unchanged. The hug
    is drawn when the tier is `minimal`.
  - `obstacles(rects)` stores overlay rects. On the next `position` they are placed beside the lane
    heads, so labels go around an open mega-label. The `data-why` debug calls them `overlay`.
  - `expanded()` returns the projection keys whose tier was `expanded` at the last `position`.
  - The label rank is `assetFor(n)?.rank`, falling back to the `RANK` kind table, then to 6. v0
    nodes have no `asset`, so their order is unchanged.
  - `Rect` is now exported.
- **`chart/overlays.ts`**
  - Exports the `ChartOverlay` interface, plus `OverlayFocus` and `OverlayInput`. `OverlayInput`
    holds optional `light`, `press` and `open` callbacks.
  - The registry: `registerOverlay(id, factory)`, `overlayIds()` and `resetOverlays()`.
  - `OverlayStack` / `createOverlays(host, input)` build every registered overlay, in id order,
    into one overlay. When any part calls `light`, the call reaches every part, then `input.light`.
  - The file's header comment gives the per-frame call order.
  - `HoverRing` (registered as `hover-ring`) is display only. It draws a cyan ring around the
    object a mega-label row lights.
- **`chart/megaLabels.ts`**
  - `MegaLabelLayer` (registered as `mega-labels`) draws `graph.lists[projectionKey]` as a
    `.callout.callout--mega.is-target`. The head and every row's text sit in `.callout__title` and
    `.callout__meta`, so the slice1 contrast check covers them.
  - Each row shows a rung mark (one shape and one ladder colour per rung; INV-20), its label, its
    optional meta, and its optional container subtitle.
  - At most 16 rows are shown. Anything past 16 is added to the list's own `more`, shown as
    "+N more".
  - **Showing and placing**
    - A plate shows while its node's tier is `expanded`. It stays `GRACE_MS` (450 ms) after that
      ends, and for as long as the pointer is inside it, so the pointer can move from the object
      onto the plate.
    - It sits right or left of the object, on the side with more room. It is clamped to the view
      vertically, and never covers another open plate if there is a free side.
    - It is redrawn only when its list changes.
  - **Pointer and touch**
    - Hovering a row (or a 450 ms long press on touch) calls `light(key)`. Leaving the row calls
      `light(null)`.
    - A short press calls `press(key, e)`.
    - A subtitle with a URL is a styled span, not an `<a href>`, so it can't navigate the
      renderer. Clicking it calls `open(url)`. Opening only reads (INV-21).
  - Imports `megaLabels.css`.
- **`chart/megaLabels.css`**: everything is under `[data-paradigm='solar']` (D13). It styles the
  plate, the rows, the rung marks (09 colours), Off rows struck through, the link, and the ring.
  The ring fades in, except under reduced motion.

## 2. Contracts changed
- 03 isn't edited: it isn't this task's file. **Follow-up (W4-T3, docs):** copy the as-built
  shapes below into 03 §5d.
- **Departures from 14 §2.9, as built:**
  - **`ChartOverlay` gains two optional methods.**
    - `focus?(f: OverlayFocus)` receives `labels.expanded()`, so the tier stays the one source of
      truth for when a mega-label opens.
    - `light?(key)` lets the ring show what a row lights.
    - The camera type is `CameraController`.
  - **`tierFor`'s second argument is a named type, `TierState`.** It has the same six booleans.
    `pointed` is the raw pointer state; `tierFor` itself drops the followed ship.
  - **`LabelLayer` gains `obstacles(rects)` and `expanded()`.** `Rect` is exported from
    `labels.ts`.
  - **The label rank reads the asset first (`AssetDef.rank`), then `RANK`.** 17 says "falls back
    to `AssetDef.rank`". D7 and 14 §8 make the `AssetDef` the remix point for a v1 node's label
    rank, so the asset wins whenever a node has one. For v0 nodes the two readings are the same.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 40 files and 611 tests pass.
- **Goldens unchanged**: `git status tests/golden` shows only `v1-ingest.test.ts`, which is
  W1-T2's file. Nothing under `__golden__/` changed.
- **Keystone**: 38 of 38 pass.
- **Specs `density` (v0 unchanged), `slice1` and `slice2`**: all pass, 33 tests in one run. That
  covers VC-2 contrast, VC-3, the pixel baselines and legibility.
- **Also run, because they test compact labels and the picture hug:** `slice3a` and `slice3b`
  pass.
- **`tierFor` against v0's rule**: an ad-hoc truth table in `/tmp`, not committed. It covers 4
  kinds × `labelCompact` × `asset` × the 64 state combinations, 1,024 cases. Compact and hug
  match v0 in every case, and v0 nodes never reach `expanded`.
- **Mega-label smoke test**: an ad-hoc hidden Electron window in `/tmp`, not committed. It
  bundled `styles.css` and the new modules, with synthetic data under `[data-paradigm=solar]`.
  - With nothing pointed, no plate shows and the tier is `standard`.
  - Pointing at the seat makes it `expanded`. Its plate shows on the right with 16 rows of 20, and
    "+6 more" (4 over the budget plus the list's own 2).
  - No other label overlaps the plate: the one it covers hides.
  - Hovering a row lights it and shows the ring; leaving clears it.
  - A press selects the row, and the subtitle opens its URL.
  - The plate stays during the grace time, and is gone after 520 ms.
  - Selected while playing, the seat isn't `expanded`; settled, it is.
  - `clear()` empties the host.
  - Text colours are ivory and cyan on the shared plate.
- **Spec `solar`** (not this task's check): the region test fails at "the boot fallback draws the
  pod's stories and bugs as v0 planets". W2-T1 is replacing that fallback right now (it has
  already dropped `fallback` from `solarSource.ts`), so that assertion is W2-T1's to update. This
  task touches no projection code.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **Not wired yet (W3-T1, which owns `ChartApp.ts` and `App.tsx`).**
  - Import `./megaLabels` once, so it registers.
  - Build `createOverlays(labelHost, { light, press, open })` beside the `LabelLayer`.
  - Each frame, after `labels.position`, call `overlays.focus({ expanded: labels.expanded() })`,
    then `overlays.position(...)`, then `labels.obstacles(overlays.rects())`.
  - Call `overlays.sync(graph)` and `overlays.clear()` beside the label calls.
  - Suggested callbacks:
    - `light`: a scene highlight that isn't hover, because hover would change the pointed object
      and close the plate.
    - `press`: `select`.
    - `open`: see the next point.
- **Opening a container link.** The subtitle carries a URL, but `window.starChart.openInAdo`
  takes a key, and main checks the URL against an allowlist. So W3-T1 either adds the container's
  key to `MegaRow.subtitle` (a W2-T1 field) and calls `openInAdo(key)`, or adds an allowlisted
  open-by-URL. Until then `open` is unset, and subtitles show as plain text.
- **Nothing sets `data-paradigm` yet.** `megaLabels.css` (like all v1 CSS, D13) applies only under
  `[data-paradigm="solar"]`. W3-T1 (or W2-T6) should put `data-paradigm={paradigm}` on the app
  root. Without it, a plate still gets the shared `.callout` plate, but not its row layout.
- **The obstacles lag one frame.** Labels avoid the plates from the previous frame's overlay
  rects. For one frame on opening, the plate can overlap a neighbour's label. The next frame moves
  or hides that label.
- **The ring sits under an open plate.** If a row's object is behind the plate, its ring is hidden
  too.
- **No unit test for `tierFor`.** Unit tests type-check under `tsconfig.node.json`, which doesn't
  include renderer files. A test would need the runtime-path import that `signal.test.ts` uses, or
  a tsconfig change. Both are out of scope here. The truth table above was run instead.
  **Follow-up (W4-T2):** add `.callout--mega` to the `solar.spec.ts` contrast check (14 §5).
- **Row words.** "+N more" is hard-coded English, and a rung shows as a mark only. The state name
  is expected in `row.meta` from `lists.ts`. If the remix table gains "label forms" (14 §1.4),
  this layer can read them from the theme.
