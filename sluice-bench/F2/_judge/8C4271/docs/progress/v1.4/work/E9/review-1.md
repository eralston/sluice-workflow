# Review E9, round 1 · Verdict: pass
Scope of this review: `git diff 88ec57e` for E9's files (b0260b1 plus fix-1's uncommitted `solar-dense.spec.ts`).
30aa644 ("F scoped …", `docs/27-v1.4.md` and `handoff.md`) is the human's own commit, not E9's, and isn't judged here.

1. Nit: on Pulsar the climax shot barely moves. On the first climax (beat 26) it's a pan of about 37 px at the
   fit scale, with no zoom. The casts include seats and captains (per the packet), and at the fit they span 600 to
   800 px of the 1440 px view. With the padding they fill the height, so the scale clamps at the fit. Only small
   casts zoom (beat 66: 136 × 33 px). The acceptance is met, and the builder already flagged this. It goes to the gate.
   Evidence: the drive note for `e9-camera`, mid-climax: target y 1160.2 against a fit y of −127.4 at scale 0.02896,
   and target scale equal to the fit. A reviewer probe of every Pulsar climax's cast extent at the fit gave wPx/hPx
   of 667/544, 667/455, 791/547, 136/33, 669/403, 605/306, 642/444 and 720/429. Stills: `e9-before-climax.png` and
   `e9-climax-shot.png` (the board shifted up about 40 px).
   Acceptance line or rule: none broken. This is about feel (the user's calm, glanceable preference) and is for HG.
2. Nit: `e9-montage-board.png` doesn't show the director's pull-back. The drive goes Pulsar, then Escape twice,
   then Quasar, and on that path the camera hold (`cameraHeld`) stays stuck at Infinity, so the directed camera
   never acts. The drive's own note reads `mid-montage: {"shot":null, …}`. The still looks the same as a pulled-back
   board, because the camera was already within 1.6 px of the fit.
   Evidence: reviewer probes. (a) On a fresh Quasar launch the montage gives `shot: board`, and with a `setCamera`
   offset the camera eases back to the fit. (b) On the Pulsar, galaxy, Quasar path it gives `shot: null` with
   framing on, no follow and no transition. (c) On the same path, after a synthetic `window` `pointerup` and a
   1.7 s wait, it gives `shot: board`. `cameraHeld`, `onPress` and `onRelease` (ChartApp.ts 361–368, 1344–1347) are
   unchanged by E9, so the stuck hold predates it. See Limitations.
   Acceptance line or rule: none (the e2e on fresh apps proves the pull-back). It only affects what the gate sees.
3. Nit: a comment in `tests/e2e/solar-dense.spec.ts` (around l.504, "Its fastest step, in screen px per 16.7 ms
   frame") still says screen px. The case now measures world units at the starting scale (`s0`).
4. Nit: the purpose column of the new 15 §10 row (`docs/15-reference.md`, "Directed camera (27 E9)") says "back to
   the fitted board for montage". The code also pulls back at the first beat after a climax shot that still holds,
   and at the end (05 §6 item 4 says so). The numbers match the constants, and docTables passes.

Not findings:
- **Acceptance.** `camera-directs` passes (2 cases, re-run). Every sample in the Pulsar climax window has its
  target inside the cast's centre bbox, with scale ≥ fit. The test reads `shot === 'climax'` at the window's end,
  so a board fit that happens to sit inside a wide cast can't fake a pass. A seek from inside the shot gives
  `camera()` and target equal to the fit of that moment. The Quasar montage (from a `setCamera` offset) has its
  target on the fit on every sample. Under reduced motion the camera doesn't move.
- **The fixer's `solar-dense` change** (the decision recorded in 27 E9 State, 2026-11-06). `liveNodes()` and
  `displayed()` read the same `chart.nodesNow()` world positions; `displayed()` only adds `worldToScreen`. So the
  glide and guest measures still catch a piece jumping, and the thresholds (12, 90) are unchanged. The whole file
  passes (21/21), including "at most four labels", the D2 formations and the volleys.
- **The lead-in pull-back can't cut a climax short.** A lead-in starts only inside the gap after the previous
  accented beat (`lead = min(LEAD_MS, gap)`), so the pull-back for the next beat starts after the climax beat ends.
- **Ownership.** `directedHolds` compares the camera's target with what the director last asked for, not with the
  current fit. A board that drifts later (fit x 29.2 to 0 after beat 15) still reads `board`, and a later seek
  snaps to the new fit. The builder's limitation ("then reads as not holding") is stricter than what the code does.
  Nothing in the docs depends on it.
- **Seeks.** `afterSeek` clears `pendingShot` and `directedIndex` before `directSeek`. `rebuild`, `sceneChanged`
  and `attachHistory` clear them too. `show` for a new scene sets `directed = null`.
- **Docs.** 05 §2, §6 (items 1–7), P-22 and R-1; 15 §9 and §10; 03 §10 (both hooks) and the `framing.ts` seam
  bullet. The tests/README row is added. `src/shared/` is untouched, and no new Pixi APIs are used.
- The frame budget isn't affected: the new per-beat work is a filter and one `fitFor`, and `shots()` is test-only.
