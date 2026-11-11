# Slice 1.3 E1-E3: Ship preview, captain file, remembered view

## What was built
- **E1.** `settings/CaptainPreview.tsx`: one small Pixi v8 (WebGL) renderer per mounted preview, drawing the chart's own
  `CaptainView` (220x110, half-length 46). It redraws when hull or colourway change (a faction change changes the hull).
  Shown in Settings → Your captain whenever a captain is chosen (the seeded look when no faction is picked). Unmount
  stops the ticker, destroys the app and calls `WEBGL_lose_context`. In reduced motion (`motion.reduced` or the media query) it draws one still
  frame per design and runs no ticker. `settings/previewCensus.ts` + test hook `captainPreview()` count live and created renderers and draws.
- **E2.** `shared/captainFile.ts` (strict `{ v: 1, faction, hull, colourway }`, parse with messages, `checkAgainstFleet`),
  `main/captainFile.ts` (IPC `captain.export` / `captain.import`, native dialogs; tests use `STAR_CHART_CAPTAIN_FILE`),
  preload `captain`, and *Export captain…* / *Import captain…* buttons with a visible ok or error note (`role=alert`).
  Export is disabled with no style set; import needs a chosen captain. Shape is checked in main; the numbers against the fleet in the renderer
  (shared and main cannot see the art).
- **E3.** `UserSettings.devParadigm?` (optional: older files read as Solar). Main reads it at boot when `STAR_CHART_PARADIGM` is
  not a valid pin; `chooseView` saves it; `nav.boot` re-marks `devView` so the cog stays. Theme tab text updated.

## Contracts changed
03 (settings contract, IPC table, §7 paradigm note), 13 §7 and Q9, tests/README. No 15 rows.

## Checks
- `npm run typecheck`: only `asteroidAtlas.ts` `.png?url` (C7's work in progress). `npm run lint`: clean.
- `npm test`: 1382 pass; 4-5 timeouts (stream, board, boardColumns, maneuvers, stationSlotsInvariant) under parallel load, none in my files;
  `captainFile` and `userSettings` (new cases) pass alone.
- e2e: `captain-settings` (3, new), `settings` 7/8 and `avatars` pass; `e2e:keystone` 43/43.
- Stills: `review/v1.3/E/` (E1-preview, E2-export, E2-bad-file, E3-remembered).

## Human gates
Look at the preview in Settings (size, framing) and try Export/Import with the real Finder dialogs (e2e stubs them).

## Known limitations and open questions
- `settings.spec` "the viewer survives a relaunch..." fails at its second recap (`session().status` never `ended`) in this tree;
  it does not touch the preview or the toggle, and `playback.ts`/`highlights.ts` carry another batch's uncommitted edits. Not diagnosed.
- Import applies to the chosen captain's tenant only; with no captain chosen the button is disabled.
- WebGL context release is by `loseContext`; the test proves renderer count, not the browser's context count directly.

## Fix round (review)
- **Blocker:** the preview's `destroy(true)` emptied Pixi's global pools shared with the chart (every later chart frame threw). Now
  `destroy({ removeView: true }, { children: true })` at both sites, with a comment. `captain-settings` now plays a pod to its end
  after closing the preview and asserts no `pageerror`; `settings.spec` "the viewer survives a relaunch" passes again.
- Typecheck: `captainFile.test.ts` uses literal fleet limits (no renderer import). Manual `loseContext` removed.
- `testMode` (and so every STAR_CHART_* test seam: USER_DATA, PICK_FILE, PICK_DIR, CAPTAIN_FILE) is now `STAR_CHART_TEST=1 && !app.isPackaged`.
- Import reads at most `CAPTAIN_FILE_MAX_BYTES + 1` bytes. The preview follows a reduced-motion change while open.
- The "Known limitation" about the `settings.spec` failure above is resolved (it was this blocker).
