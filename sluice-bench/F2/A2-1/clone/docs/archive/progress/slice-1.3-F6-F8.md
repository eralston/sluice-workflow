# Slice 1.3 F6-F8: gallery demo harness, Arrive/Depart row, finale cell

**Status:** built 2026-10-27; HG-F reads the cells (§4). Plan: [23-v1.3.md](../23-v1.3.md) Block F. Fixture data only (INV-18).

## 1. What was built
- **F6 (`gallery/maneuverDemos.ts`, `chart/scenes/placeFormation.ts`).**
  - `castResolves` matched cast keys alone, but a person's seat and ship share a key (14 §9 D1), so a moment whose ship was missing passed because the planet was there. It now resolves each part as the interpreter's `viewOf` does, by role and kind (`PREFER`, now exported from `fx/v1/interpreter.ts`; subject falls back to any kind; attachments are also found in a facility's `attachment` slots).
  - A missing fixture no longer throws. `demoCases()` returns no cases, and each section shows a visible note cell (`missingFixtureSection`).
  - `crop` follows `attach.to` chains to a fixpoint, not one level.
  - `placeStations` is memoised by content (review fix): the key is the plan's JSON (computed once per plan object, since each projection builds a new `solar`), the scale, and the size fields of the drawn stations and formation members. The last four answers are kept, so a re-projection to the same plan and scale reuses one. Answers are stored by drawn-node position, so two nodes sharing a key outside the plan still settle apart. Placement runs only on a scale change or a new apply, so this saves a settle on a seek or re-projection, not on every frame. Unit tests (`placeStations.test.ts`): a member that resizes between calls gives the fresh answer, a repeat with a cloned plan is a hit, and twin keys stay apart.
  - `castResolves` now mirrors `viewOf` exactly: the after board for the role's kind (subject: any kind), then an `attachment` slot on the after board, then the before board only for what left (any kind for a role with none). Resolved by [slice-1.3-F-leftovers.md](slice-1.3-F-leftovers.md): `viewOf` was fixed and the mirror is now exact. (Formerly a deliberate departure and open question: an `attachment` slot on the before board also counts. With the strict mirror `attachment.merge` and `attachment.settle` lose their demos (the attachment leaves its facility this beat, so its slot is only on the before board), and the e2e's 16-rule check fails. The strict `viewOf` left those casts unresolved at the beat.)
- **F7 (`gallery/motionDemos.ts`).** 06 §8 / 05 §5 "Arrive/Depart" is GraphScene's own motion (`arrive`/`depart`, `ARRIVE_S`/`DEPART_S`); playback's arrivals are the theme's entrances (`entrance.ts`). The new *Arrive and Depart* row has two wide cells on the fixture's busiest region. *Planets and pieces* loops rest, Arrive (`apply 'data'`), present, Depart (`apply 'beat'`), gone. *Entrances* loops the episode opening (`fx.opening()`). R toggles reduced motion with the maneuver demos (Arrive/Depart become a 0.3 s fade; the opening issues nothing).
- **F8 (same file).** A *The round's end* section after the row: `fx.recap(keys, awards, { finale: true })` on the whole system, with two invented awards on the first ship's captain. Glint is part of it; `allClear` and seat glints already play in the maneuver demos (`regionClear`, `seatComplete`).
- Hook `window.__starChartGalleryMotion`; test in `gallery-assets.spec.ts` (loops, clears, review copies).

## 2. Contracts changed
06 §8 (new cells, F6 behaviour, VC-6 row), 14 §8 (finale row), 14 file table, 03 (new hook), tests/README.md. No values changed.

## 3. Checks
`npm test` (75 files), typecheck and lint pass. `npm run e2e:spec -- gallery-assets gallery gallery-layout gallery-v1 solar` and `npm run e2e:keystone`: see the final results below.
`gallery-assets` now asserts that reduced motion differs: full Arrive and Depart steps take over 0.8 s and reduced ones under 0.6 s (the 0.3 s cheap fade), and the opening issues 0 commands under reduced and some in full.

## 4. Human gates (HG-F, 23 §6)
`npm run gallery`: scroll past *Maneuvers* to **Arrive and Depart** (two cells) and **The round's end** (one cell). Press R to flip reduced motion; watch each loop. Stills: `test-results/gallery/{arrive-depart,finale}-{full,reduced}.png` and `opening-full.png` (no `opening-reduced`: it issues nothing, so it is the settled board). The cell caption sits in the bottom-left corner, shortened, and the finale and opening cells are framed to include the ships.

## 5. Known limitations and open questions
- The cells are 400x172 px, so the whole system is small.
- Departure and the allClear are not separate cells. The opening's entrances stand in for playback's arrivals.
- The finale's awards are invented, not computed from the fixture.

## Final results (after review fixes)
`npm test` 75 files, 1094 tests; typecheck and lint clean; `npm run e2e:spec -- gallery-assets gallery gallery-layout gallery-v1 solar` 49 passed; `npm run e2e:keystone` 41 passed. Still images re-read: `finale-full.png` and `arrive-depart-full.png` (caption clear of the planets; the finale's ships are mostly in frame, one ship at the far edge still clips, since ships stand off in screen terms).

## Review fix: the gallery-assets loop test (flake)
The test read `stepS` and `peak` that were last written by whatever loop ran last, and counted `reducedLoops` by the mode at a loop's end. Nothing tied a reading to a loop that ran in one motion mode from start to finish, so a loop that saw the mode change could be judged as reduced. I could not reproduce the reviewer's two failures afterwards (so I cannot name which path produced them); the loop-straddles-a-toggle race is the one this fixes. Each loop now records the mode it began in and whether it held (`pure`); `stats.full` and `stats.reduced` hold only the last loop that was one mode throughout (step times, peak commands, Arrive/Depart counted). The test waits for each demo to have such a record in each mode, then judges those only; thresholds are unchanged (reduced Arrive/Depart under 0.6 s, the opening 0 commands; full over 0.8 s, more than 0 commands). The waits' ceilings were raised (poll 240 s, test 420 s) because the page's own clock slows when the machine is loaded; they are conditions, not sleeps.
Proof: `npm run e2e:spec -- gallery-assets` 3 passed (4 runs earlier, 3 after the ceilings change); built once, then `playwright test --grep @keystone` beside `playwright test gallery-assets`: gallery-assets 3 passed and keystone 41 passed (two earlier concurrent runs had keystone failures in avatars, devlog, activity and explore: those specs also use the shared `logs/` and `out/` and the window focus, and none touch the gallery; keystone alone is 41 passed).
