# Packet E9: The camera directs
Risk: medium (a new automatic camera move in every directed Solar episode; the e2e checks decide most of it, and the feel goes to the gate) · Score: blast 1, verify 1, design 1, acceptance 0, track 1
Start commit: 88ec57e

## Acceptance
- An e2e case: during a Pulsar climax, the camera's target is within the bounds of the climax's cast; during
  montage it is the fitted board.
- A seek lands on the fitted board (no stale camera).

## Approach
1. **Who directs.** The camera directs only in a scene whose schedule has a director (`clock.schedule.limelight?.direction`). It also needs these: playing, `framing === 'on'`, no unsuspended follow (follow has priority), reduced motion off, no transition, and `!cameraHeld()`. v0 views and stepped beats (`step()` leaves the clock `paused`) never direct, so specs that step are unchanged.
2. **The climax shot.** A beat directs a climax when one of its planned maneuvers has `climax: true`. In `applyBeats`, `playback.ts` sets a **pending shot**: `atX = beat.presentationStartMs + m.afterMs + (gather phase's atMs, else 0)`, with keys = the union of every `m.cast` role. `frame()` fires it once `clock.x >= atX`: after `applyBeats`, before `leadIn()`, with the conditions re-checked. The shot calls `chart.directClimax(keys)`, which tweens to `climaxFrame(...)` over `CLIMAX_MS`. The ease begins as the gather begins, so it is "during its gather". Gathers are 300 to 900 ms, too short for a calm move, so the ease runs a fixed 900 ms.
3. **The frame (`framing.ts` `climaxFrame(camera, nodes, keys, fitScale)`, pure):**
   - Take the drawn nodes whose `canonicalKey` is in keys, from `targetNodes()`. No node gives `null`, and then no move.
   - The raw box is the bbox of their centres. The padded box adds `n.world.r * 1.3 + 70 / fitScale` around each node, as `followTarget` does.
   - Scale is `clamp(camera.fitState(padded, 60).scale, fitScale, fitScale * CLIMAX_MAX_ZOOM)`: it eases *in*, never out past the board.
   - Centre is the padded box's centre, **clamped into the raw box**, so the target always lies within the cast's bounds (the acceptance). Captains are included: unlike `actionFrame`, it does not filter by `isFramed`, because the people are the story.
4. **Back to the board.** `chart.directBoard()` tweens to `fitFor(camera, graph)` over `BOARD_MS`, unless the camera's target already equals it. It runs:
   - at a beat with a `montage` maneuver (`m.montage`: the director's P-24 form, and 22 C5's crowded montage);
   - at the first beat after a climax shot that still holds;
   - when playing reaches the end (`recap()`) while a climax shot holds.

   It runs once per beat, at the lead-in (`leadIn`) or else as the beat lands (`applyBeats`), whichever comes first (`directedIndex`, like `framedIndex`). It returns to the board after the climax, not only at montage: Pulsar has no montage beats, so otherwise the zoom would stay for the rest of the day. Other beats keep today's frame-the-action. A beat the director handles (a climax, or a pull-back) skips `frameBeat`.
5. **Whose camera it is.** In `ChartApp`, `directed: { shot: 'climax' | 'board'; to: CamState } | null` records the director's last request. It "still holds" while `camera.target` equals `to` (|dx|, |dy| < 0.5 world units, scale ratio within 1e-3). A user pan or zoom, frame-the-action, the follow camera, `reveal`, `resetView` and `setCamera` all change the target, so ownership lapses with no hooks at those sites. A new scene (`show`, not the same scene) sets `directed = null`.
6. **Seeks (INV-15, R-1).** `afterSeek()` clears the pending shot and calls `chart.directSeek()`. If the director's shot still holds (either kind, mid-tween or at rest), it calls `camera.set(fit)` at once (no tween) and records `{shot:'board'}`. A camera the user or another mode moved is left alone. This is how "a seek lands on the fitted board (no stale camera)" is read: the stale camera is the director's. `rebuild()`, `sceneChanged()` and `attachHistory()` also clear the pending shot and `directedIndex`.
7. **Reduced motion:** no climax shot and no pull-back (the conditions in 1, and `ChartApp` also returns early on `motion.reduced`). A seek's snap still applies, since it is not motion.
8. **Values (15 §10, new row):** `CLIMAX_MS` 900, `BOARD_MS` 900 and `CLIMAX_MAX_ZOOM` 1.5, exported from `framing.ts`. 900 ms matches the follow camera, and 1.5× stays inside the follow camera's 2.5× range. Glanceable, calm: the user's standing preference.
9. **`camera.ts`:** add `get target(): Readonly<CamState>` (`tween?.to ?? cur`). No other change.
10. **Test hooks (03 §10):**
    - `shots()`: for each climax (from `direction.climaxes`) and each montage (from `direction.forms`, value `'montage'`), find the beat whose `eventKeys` holds the turn key's event (`turnKey.slice(0, lastIndexOf('|'))`). Plan it with `planBeat` (as `volleysOf` does), then return `{ kind, index, startMs, endMs, gatherMs, cast: string[] }`, sorted by `startMs`.
    - `directedCamera()`: returns `{ shot: 'climax' | 'board' | null; target; fit }`, where `shot` is null unless it still holds and `fit = fitFor(...)` now.
11. **Docs:**
    - 05 §6 gains a bullet, **The directed camera (27 E9)**, stating 1–7.
    - 05 §2's Frame the action row gets one clause.
    - 05 §8.5c P-22's Notes: "the camera eases toward it (§6)".
    - 05 §8.10 R-1 gains: "a directed camera lands on the fitted board".
    - 15 §9's "Frame the action" row gets one sentence; 15 §10 gets the new row.
    - 03 §10 gets the two hooks, and 03's `framing.ts` seam bullet (l.1171) gets `climaxFrame`.
12. **Gate stills:** write a drive step, `tests/drive/steps/e9-camera.ts`, modelled on `e5-director.ts`. It shoots Pulsar at the board just before a climax, mid-climax shot, and Quasar mid-montage. Put the stills in `docs/progress/v1.4/work/E9/e9-*.png`.

## Files
- `src/renderer/src/chart/framing.ts` 1–30 (constants), 125–147 (`actionFrame`), 149–196 (`followTarget`, the margin and fit pattern to copy): add the constants and `climaxFrame`.
- `src/renderer/src/chart/camera.ts` 11–16, 136–139, 199–212: the tween and its target.
- `src/renderer/src/chart/ChartApp.ts`:
  - 280–327 `show` (where to reset `directed`), 354–411 (`cameraHeld`, `frameAction`, `followFrame`: the pattern for the new `directClimax`, `directBoard`, `directSeek` and `directedCamera`);
  - 621–668 (the test-camera helpers), 916–921 `resetView`.
- `src/renderer/src/playback.ts`:
  - 46–54 (per-session indices), 119–155 `sceneChanged` and `rebuild`, 173–198 `attachHistory`;
  - 244–274 `frame`, 277–338 (`applyBeats`, `keysOf`, `frameBeat`), 460–483 `leadIn`, 505–541 `recap`, 543–555 `afterSeek`.
- `src/renderer/src/testHooks.ts` 21–160 (the declarations), 162–240 (install), 243–266 `volleysOf` (the pattern for `shots()`).
- `src/shared/contracts/maneuver.ts` 50–120 (`PlannedManeuver`: `climax`, `montage`, `plate`, `cast`, `phases`, `afterMs`). Read only.
- `src/shared/contracts/playback.ts` 37–100 (`MomentForm`, `Direction`, `Limelight`). Read only.
- `tests/e2e/solar-dense.spec.ts` 895–950 (the volley case: Pulsar navigation and in-page per-frame sampling to copy), `tests/e2e/montage-names.spec.ts` (Quasar navigation and its montage beats).
- Docs: `docs/05-playback.md` 51, 433–510, 776–787 (P-22 at 780), 855–858; `docs/15-reference.md` 1154–1155, 1288–1290; `docs/03-contracts.md` 1171–1173, 1965–2060.
- New:
  - `tests/e2e/camera-directs.spec.ts`;
  - `tests/unit/climaxFrame.test.ts`;
  - `tests/drive/steps/e9-camera.ts`;
  - a `tests/README.md` row (the "Which specs cover what" v1 table, beside the director rows).

## Excerpts
- Scope 27 E9, Decided: "The director marks each day's climax. The camera eases toward it during its gather, and back to the fitted board for montage. Under reduced motion the camera doesn't move. Follow mode keeps priority."
- `maneuver.ts` l.89: "`climax?: true` — The director chose it as its working day's climax (27 E5, P-22): it plays its full form. The camera (E9) reads this." `montage?: boolean` is "Montage (22 C5)", and the director's form also sets `plate` (P-24).
- `playback.ts` (`Direction`): "`climaxes`: The turn keys of each working day's climax", keyed `${eventKey}|${ruleId}`; `forms`: "no entry means `full`".
- 05 §6: "**The camera holds still around a click (decided 2026-10-09).** While a pointer is pressed on the chart … and for `CAMERA_HOLD_AFTER_MS` … after it is released, frame-the-action and the follow camera make no moves." Follow camera rule 6: "It supersedes frame-the-action while following."
- 05 §2: "Frame the action (Z) | On while playing … A manual pan or zoom suspends it until Z or Play; Z also turns it off and on."
- 05 §8.10 R-1: "**Seeks (INV-15).** A seek plans nothing: `FxDirector.clear()` destroys every command and tell …". 02 §1: "INV-15 | Only forward play animates; seeks snap"; "INV-20 | Never hue alone; DOM text; keyboard; reduced motion".
- 05 §7: "Camera transitions become a 150 ms crossfade." (E9 is stricter: the directed camera doesn't move at all.)
- 15 §10 (the pattern for the new row, docTables reads the numbers in order against the constants): "| Follow camera | 900 ms; 0.8–2.5× fit | `chart/framing.ts` FOLLOW_MS, FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM | The follow camera's move and zoom range |". Suggested: "| Directed camera (new, 27 E9) | 900 ms in, 900 ms back; up to 1.5× fit | `chart/framing.ts` CLIMAX_MS, BOARD_MS, CLIMAX_MAX_ZOOM | … |".
- CLAUDE.md: "Change a constant and its row in the same change; `docTables.test.ts` fails until they match." "`02` and `03` are normative. If code needs to depart from them, update the doc in the same change and call it out in the item's build record."
- Project lens: "**The effect where it's meant:** check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)."
- Memory (user preference): calm, glanceable views. Keep the move unhurried and the zoom modest.

## Checks
**New tests:**
- `tests/unit/climaxFrame.test.ts`. Use a real `CameraController` (from `src/renderer/src/chart/camera.ts`, with a stub world `{ scale: { set() {} }, position: { set() {} } }`) and minimal nodes. Cases:
  - the centre lies inside the raw centre bbox, for two nodes of very different radii;
  - one node gives its own centre;
  - the scale is within `[fitScale, fitScale * CLIMAX_MAX_ZOOM]` for a tight cast and for a cast wider than the view;
  - keys with no drawn node give `null`.
- `tests/e2e/camera-directs.spec.ts`: a fresh app per pod, `STAR_CHART_PARADIGM: ''`, navigation as in solar-dense l.900–906, the mouse parked in a corner, `setRate(1)`, `setReduced(false)`. Record `camera()` right after entering as the board, and assert `directedCamera().fit` equals it.
  1. **Pulsar climax.**
     - Take `shots()`, kind `climax`, and use the first whose window `[gatherMs + CLIMAX_MS, endMs − LEAD_MS]` is at least 500 ms long.
     - Seek to `startMs − 1`, then `play()`. Sample in-page every frame (as in solar-dense l.913–930) while `session().x` is in the window. Each sample takes `directedCamera().target` and the raw bbox of `targetNodes()` whose `canonicalKey` is in `cast`.
     - Assert: at least 3 samples; every sample's target x and y lie within the bbox (±1 world unit); and `target.scale >= fit.scale`.
  2. **The seek, in the same app.** Still inside the climax shot (`directedCamera().shot === 'climax'`), seek to `startMs − 3000`, then `await frames(page)`. Assert `camera()` and `directedCamera().target` both equal `fit` (±0.5 world units, scale ±1e-3).
  3. **Quasar montage.**
     - Take `shots()`, kind `montage`, and use the first. Seek to `startMs − 1`.
     - `setCamera({ x: fit.x + 200 / fit.scale, y: fit.y, scale: fit.scale * 1.4 })`, so the check has something to undo. `setCamera` is a test placement and does not suspend framing.
     - `play()` and sample while x is in `[startMs, endMs)`. Assert the target equals `fit` on every sample, with at least 3 samples.
  4. **Reduced motion (Pulsar).** `setReduced(true)`, seek to the climax's `startMs − 1`, record `camera()`, then `play()` until x ≥ `gatherMs + 1500`. Assert `camera()` is unchanged, then `setReduced(false)`.
  - Use `frames(page)` from `launch.ts` after seeks, never a fixed wait (tests/README "Shared helpers"). Bound waits by the playhead.
- Add `camera-directs` to the tests/README map.

**Run (mapped):**
- `npm test`: `climaxFrame`, `docTables`, `follow`, `tempo`, `director`.
- `npm run e2e:spec -- camera-directs solar-play solar-dense montage-names slice3b slice2`, then `npm run e2e:keystone`.
- solar-dense matters: its volley case plays Pulsar with framing on, so the climax zoom now runs there. Confirm "at most four labels" and the D2 formation checks still pass. If a spec that plays a Solar pod now fails on screen positions, report it rather than loosening it.
- Drive: `npm run drive -- tests/drive/steps/e9-camera.ts --paradigm solar`.

## Out of scope
- The director's choice of climax (`engine/director.ts`) and the montage lever: read them, don't change them.
- The follow camera's and frame-the-action's rules (except that frame-the-action now skips beats the director handles), and their constants.
- Reduced motion's scene crossfade (05 §7).
- Speeding the ease with the playback rate. Camera moves are wall time, like `FRAME_MS`.
- Any new user setting or key to turn the directed camera off. Z (framing off) already does: note it in 05.
- The known flakes (`solar-dense.spec.ts:295`, `devlog.spec.ts:16`, the perf seek check): record them if seen, don't fix them.
