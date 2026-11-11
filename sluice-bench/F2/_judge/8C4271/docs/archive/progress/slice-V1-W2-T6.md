# Slice V1-W2-T6: Settings modal and the viewer

Built 2026-10-10, following [17 W2-T6](../17-v1-phases.md#w2-t6-settings-modal-and-the-viewer),
[14 §1.3, §1.4, §2.9, §6](../14-architecture.md#29-labels-settings-achievements) and
[13 §7](../13-game-design.md#7-settings-and-the-viewer-decided-2026-10-10). Nothing mounts the modal
or the cog yet (W3-T1 does), so v0 behaviour is unchanged: the floating Connect panel renders exactly
as before.

## 1. What was built
- **`src/main/userSettings.ts`**
  - `readUserSettings(file)`: the saved settings, or `defaultUserSettings()` when the file is
    missing, isn't JSON, or fails `userSettingsSchema` (another version, a viewer given by name, a
    bad faction). A corrupt file is logged as `settings-corrupt` with a reason only.
  - `writeUserSettings(file, s)`: validates, then writes through `settings.json.tmp` and a rename.
  - `UserSettingsStore(file, salt)`: reads once, keeps the copy in memory. `set(patch)` validates
    the raw patch with `userSettingsPatchSchema`, merges with `mergeUserSettings` (per org), saves,
    and answers the saved whole. A disk failure keeps the change for the run and logs
    `settings-unsaved`; a refused value throws to the caller and leaves the file alone.
  - `userSettings()`: the process's store at `userData/settings.json`, beside `window-state.json`,
    never in the SQLite cache, so Purge leaves it (14 D5).
  - `registerSettingsIpc(store?)`: `CH.settingsGet` and `CH.settingsSet`, registered straight on
    `ipcMain` (not through `index.ts`'s logging `handle` wrapper), so a patch, which carries the org
    key and the viewer's key, never reaches the dev log's `ipc` line. Safe to call twice.
  - The dev log gets `{ kind: 'settings-set', field, valueHash }`, one line per changed top-level
    field, and nothing when the value didn't change. `valueHash` is an HMAC-SHA256 of the value's
    sorted-key JSON with the dev log's own salt (`userData/devlog-salt`), cut to a 48-bit whole number.
  - Also exported: `changedFields`, `valueHash`, `settingsPath`, `SETTINGS_FILE`, and
    `resetUserSettings` (for tests).
- **`src/preload/index.ts`**: `settings.get()` and `settings.set(patch)`. The patch is checked with
  `userSettingsPatchSchema` going out, and the answer with `userSettingsSchema` coming back.
- **`src/renderer/src/panels/Connect.tsx`**
  - `ConnectBody({ frame })` holds every control, hook and effect that `ConnectPanel` had.
    `frame(body)` wraps the controls. It stays mounted while closed, so what was typed and found
    survives a close, as before.
  - `ConnectPanel` is now the shell: the same `section#connect-panel.connect[role=dialog]`, header and
    `.connect__close` as before. It returns null while a mounted Settings modal hosts the Connection
    tab (`useSettings.hostsConnection`).
  - The markup and class names are unchanged.
- **`src/renderer/src/settings/store.ts`**
  - `useSettings` (zustand): `settings`, `loaded`, `persisted`, `open`, `tab` and `hostsConnection`.
  - `loadSettings()`: reads once. Without a bridge or a handler, it runs on the defaults with
    `persisted: false`.
  - `patchSettings(patch)`: applies the change at once. Main's validated answer then replaces it.
  - `onSettingsChange(fn)`: for W3-T1's re-show after a change.
  - The modal: `useSettingsView()`, `settingsOpen()` (for W3-T1's key guard), `openSettings(tab?)`,
    `chooseTab` and `closeSettings`.
  - **Connection has no open state of its own.** It shows when `hostsConnection && connectOpen`, and
    choosing it sets `connectOpen`. So the mode chip, the empty cosmos ("Add more projects", with
    `connectFocus`) and the object list open the modal's Connection tab unchanged, and the chip's
    toggle still closes it. Choosing another tab clears `connectOpen`. Closing clears both.
- **`src/renderer/src/settings/viewer.ts`**
  - `peopleOf(h)`: the history's captains by full name, A–Z, ties broken by key.
  - `orgOf(h)` is `h.scope.orgKey`. `viewerOf` and `captainStyleOf` are per org, using
    `Object.hasOwn`.
  - `assetCtxFor(settings, h)`: the `AssetCtx` that W3-T1 passes to `GraphScene`.
  - Hooks: `useViewer()` and `useCaptainStyle()`.
  - `chooseViewer(key | null)`: only one of the loaded history's people can be chosen.
  - `styleCaptain(style | null)`.
  - Nothing is suggested (Q8): fixtures have no signed-in user, so the viewer always chooses.
- **`src/renderer/src/settings/SettingsModal.tsx`** (`awards?: Award[]`)
  - Layout: a header with a 44 px close (classes `settings__close connect__close`, so `.connect__close`
    still closes the Connection tab), a vertical `role=tablist` in the left quarter, and one
    `role=tabpanel` in the other three quarters.
  - Tabs use a roving `tabindex`. ↑/↓ wrap, Home/End jump, and the selection follows the arrows.
  - Esc closes it, and a click on the backdrop closes it.
  - Tab and Shift+Tab are trapped inside. On opening, focus goes to the chosen tab; on closing, it
    returns to whatever opened the modal (or the cog).
  - Keydown inside the modal stops propagating, so Space, the arrows and Esc (= Back) never reach
    the chart's shortcuts. The dev log's capture listener still sees them.
  - Under Solar, it sets `hostsConnection` while mounted.
- **`src/renderer/src/settings/SettingsButton.tsx`**: a 44 px cog (an inline SVG), shown in Solar
  only. It has `aria-haspopup="dialog"` and `aria-expanded`, and toggles the modal.
- **Tabs** (`src/renderer/src/settings/tabs/`)
  - `Connection.tsx`: `ConnectBody` in a `section#connect-panel.connect.connect--tab`.
  - `Theme.tsx`
    - The registered themes as radios (falling back to Star Chart while none is registered), saved
      as `settings.theme`.
    - **The developer toggle (13 Q9)**: Solar, Sprints and Backlog radios. A choice closes the modal
      and calls `nav.setParadigm`.
  - `Captain.tsx`
    - *Who are you?*: a select of the people by full name, plus "Not chosen".
    - Faction: Seeded (no style), or the factions from `art/fleet.ts`'s `FACTIONS`.
    - Hull: that faction's three hulls from `FLEET_HULLS`.
    - Colourway: `COLOURWAYS`, each with a CSS swatch.
    - Picking a faction starts from `fleetDesign(shipSeed, faction)`, so it begins near the person's
      seeded look. The style controls are disabled until a viewer is chosen.
    - "Show my achievements" is the opt-out switch (18 A5).
    - The awards list shows each award's title (names from 18 §2, by rule id), its `reason`, and a
      `#n` button per piece that selects and reveals it. An empty list draws nothing (18 §1: nothing
      drawn for an absence).
  - `Read.tsx`
    - `readCopy(chart, source)` returns 13 §7's paragraph, sentence by sentence. Every noun, level and
      rung comes from `terminology`: what the chart shows from the chart register (the active
      theme's `words`), and what it stands for from the source register (the bundle's pack).
    - `readTerms(h, chartWords)` builds both registers, passing `mapping: h.stateMapping`, which
      covers the W1 follow-up. It falls back to SDLC before a bundle loads, and to the engine's words
      for an unregistered pack.
- **`src/renderer/src/settings/settings.css`**: imported by the modal and the cog. Every rule is
  scoped under `[data-paradigm='solar']` (D13). The modal and the cog carry that attribute
  themselves, so the CSS works before and after W3-T1 puts it on the root. Every target is at least
  44 px, including the embedded Connect controls. Inside the tab, `.connect` is laid flat
  (`position: static`, no frame).
- **Tests**: `tests/unit/userSettings.test.ts`, 7 tests. Electron is mocked: `app.getPath` answers a
  temporary userData, and `ipcMain` records the handlers.

## 2. Contracts changed
- **No shape changed.** `UserSettings`, the schemas, the channels and `StarChartApi.settings?` are
  W0-T1's, used as they are. No file outside this task's list was edited.
- **Refinements, recorded here for W4-T3's 03 pass** (03 §6 and §10):
  - **`valueHash` is a whole number** (48 bits of a salted HMAC), not a string. The redactor
    replaces any free string in a field it doesn't know with `<text:n>`, but keeps numbers. So an
    `'h:…'` string would never have reached the log.
  - **`CaptainStyle.hull` is a `FleetDesign` hull**, an index into `FLEET_HULLS` (0–8), not a
    position within the faction. It always belongs to `faction`, so W2-T3's agent adapter can pass
    `{ hull, colourway }` straight to `CaptainView`. `colourway` indexes `COLOURWAYS` (0–7). The
    schema's bounds (0–63 and 0–255) still hold, and could be tightened to 8 and 8.
  - **Settings IPC isn't in `__starChartIpcLog`** (the test-mode IPC log), because it doesn't go
    through `handle`. AC-25 is unaffected: the PAT never crosses these channels.
  - **03 §6 says `settings?` is optional "until the preload carries it (17, W2-T6)".** The preload
    carries it now. Removing the `?` in `ipc.ts` is W0-T1's file, so it's left for W3-T1 or W4-T3.
    The renderer store copes with either.
- 02 is unchanged: no rule changed.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean (node, web and e2e).
  - `npm run lint`: clean.
  - `npm test`: 47 files and 696 tests pass, including the 7 new ones.
- **Goldens unchanged**: `git status tests/golden` shows only other W2 tasks' new files
  (`solar.*`, `v1-awards.*`, `v1-ingest.test.ts`). None of them is this task's, and no v0 golden
  changed.
- **`userSettings.test.ts`**
  - **Round trip**: a missing file reads as the defaults. Every field saves and reads back, through
    a new store too. Tenants merge, and clearing one org's viewer keeps the other's. No `.tmp` file
    is left behind.
  - **Corrupt → defaults**: bad JSON, an empty file, version 2, a viewer by name, an unknown
    faction, and an array all read as the defaults. The next change writes a good file.
  - **IPC refusal**: a viewer by name, a negative hull, a non-boolean switch and `null` are all
    refused, and the file is byte-identical afterwards.
  - **Purge leaves it**: AdoService.purge's targets (`star-chart.sqlite` and its `-wal` and `-shm`)
    sit in the same userData folder and are deleted. After a relaunch (`resetUserSettings`), the
    viewer is still there.
  - **The dev log carries a hash only**: the lines are exactly `{ t, at, src, kind: 'settings-set',
    field, valueHash }`, for `viewer` then `captain`. The unchanged `achievements` adds no line.
    `valueHash` equals the salted HMAC and changes with the salt. The log never contains the org
    GUID, the viewer key or its GUID, the faction or the name, and has no `ipc` line. With the dev
    log off, nothing is written.
- **Spec `onboarding`, Spec `slice4`, Spec `diagnostics`** (one locked build): 11 of 11 pass, so the
  Connect selectors are unchanged with no modal mounted.
- **Keystone** (not required, run because `Connect.tsx` changed): 38 of 38 pass.
- **Throwaway render check** (not kept: a vitest file in gitignored `logs/`, then deleted)
  - Each tab was server-rendered with `react-dom/server` on `pod-sprint`'s first sprint.
  - Tablist roles, `aria-selected` and the roving `tabindex` were checked. The people list was
    A–Z (Juno Achterberg, Wren Calloway).
  - Hulls and colourways come from the art. The awards row renders.
  - With the modal hosting, the Connection tab is a `.connect.connect--tab` section and the floating
    panel renders nothing. Without it, the floating panel is unchanged.
  - The Read paragraph in the engine's words: "Each region is one team's Sprint … Objectives are
    User Stories …".
  - With probe theme words: "Each solar system is one team's Sprint … Asteroids are User Stories:
    the ships carve them …".

## 4. Screenshots
None. There's no human gate, and nothing mounts the modal until W3-T1.

## 5. Known limitations and open questions
- **W3-T1 wiring**
  - Call `registerSettingsIpc()` in `main/index.ts` after `app.whenReady`.
  - Mount `<SettingsButton />` after `<ModeChip />`, and `<SettingsModal awards={…} />` beside
    `KeyHelp`.
  - Call `loadSettings()` at boot, and pass `assetCtxFor(useSettings.getState().settings, history)`
    to the scene.
  - Re-show on `onSettingsChange`.
  - Add `if (settingsOpen()) return;` at the top of `onKey`. The modal already stops its own keys;
    the guard covers focus that's outside the modal while it's open.
- **Until `registerSettingsIpc` is called**, `settings.get` rejects ("No handler registered"). The
  store then runs on the defaults with `persisted: false`, and the Captain tab says changes last
  until the app closes.
- **The developer toggle doesn't survive a relaunch.** Boot ignores the stored paradigm (W1-T5), and
  `UserSettings` has no field for it. A v0 view chosen here lasts until the next launch, which
  matches 13 Q9 ("tests keep pinning"). Under v0 the cog is hidden (D13), so the way back to Solar is
  a relaunch.
  - To make it stick, add an optional `UserSettings.devParadigm` and read it at boot (main).
- **No ship preview.** The Captain tab names each hull and shows colour swatches, but doesn't draw
  the ship. A small `CaptainView` canvas (or a gallery link) would help when it's reviewed with the
  art.
- **The Read copy keeps some fixed theme prose** ("carve them, rig them", "the fleet", "strike run",
  "megastructures", "wireframe sensor contact", the colour names). Only nouns, levels and rungs go
  through terminology. A second theme would want its own sentences: move `readCopy` into the theme
  table (`ThemePack.readCopy?`) when one exists.
- **The Read tab ignores the app's Names toggle** (Star Chart / ADO). The paragraph's job is to pair
  the two registers ("Asteroids are User Stories"), so it always uses both.
- **Award titles are a renderer table keyed by rule id.** If W2-T7 exports titles, the Captain tab
  should read them there.
- **Q8 (suggesting the signed-in ADO user) isn't built.** The renderer has no signed-in identity in
  ADO mode yet. When `auth.status` carries one, offer it as a suggestion the viewer confirms.
- **The `.connect__close` class on the modal's close button** keeps the existing e2e selectors
  working under Solar. W4-T2's `settings.spec.ts` can use `.settings__close` instead.
