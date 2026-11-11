# Slice 1.2 · Settings → Captain Avatars (2026-10-15)

Off the plan's list: the real org still won't give pictures reliably, so they are loaded by hand, in bulk
(the strategies in [slice-1.2-pictures.md](slice-1.2-pictures.md) stay as the automatic path).

1. **What was built.** A *Captain Avatars* tab in Settings: a square per captain in the open scene (the
   galaxy lists every loaded captain, a sector its contributors, a solar system only those with work in it),
   showing the picture or the initials on the colour, with the name. Click chooses a picture; a drop from
   Finder onto a square gives it in one gesture; ⌘V pastes onto a focused square; several files dropped on
   the grid (or *Add pictures…*, or a folder) are matched to captains by file name and confirmed first, and
   what fits nobody waits in a tray to be dragged onto a square (or given by a menu, for the keyboard).
   Also: Undo, remove (×), *Only captains without a picture*, an optional crop step for single pictures,
   and *Copy all to a folder* / *Read from a folder* (files named by identity ID). Offline: it works from
   the loaded bundles. New: `src/shared/captainRoster.ts`, `settings/tabs/CaptainAvatars.tsx`,
   `CropDialog.tsx`, `settings/avatarTray.ts`, `pictures.set / exportAll / importAll` over IPC.
2. **Contracts changed.** 03 §6's IPC: `pictures.set(captainKey, bytes)` (result may carry the kept 128 px
   PNG), `pictures.exportAll`, `pictures.importAll`. 13 §7 (the tab), 01, 04 §7, tests/README. The rule
   "bytes don't cross IPC" now holds for `add` and `remove` only: `set` has to carry the picture the user
   dropped, so the test IPC log records `[key, bytes]` for it, and the dev log records no arguments.
3. **Checks.** Unit: `captainRoster` (new: file-name matching, scene roster), `pictures` (export/import);
   `npm test`, typecheck, lint. E2E: `avatars` (new; click, drop, paste, name-matching with review, tray,
   undo, remove, copy out and in, crop, Esc, filter, Purge; and the read-only fixtures case), `settings`
   (the tab list), `pictures`. A test hook `openSettings(tab)` was added for specs in v0 views (no cog).
4. **Human gates.** The user's live check: open a sprint, Settings → Captain Avatars, drop a folder of
   headshots named by person, and confirm the matches. Watch the stills `test-results/avatars-*.png`.
5. **Known limitations.** Name matching is by words, so a nickname file name matches nobody (it goes to
   the tray). HEIC photos aren't decoded (the picture "couldn't be read"; export to JPEG first). The roster
   in the galaxy is the union of what has been opened this session. Removing a hand picture while another
   scope is loaded leaves that scope showing initials until it is reopened (ADO's own picture, if any,
   returns then). Batches are always centred (no crop step). The crop preference lives in the window's local storage, not in settings.json.
