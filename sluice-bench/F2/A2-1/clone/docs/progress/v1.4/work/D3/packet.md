# Packet D3: Formations clear of the beam
Risk: medium (one pure function grows a search; the beam's drawing gets an optional fade; the unit test decides the geometry, the fade is by eye) · Score: blast 1, verify 1, design 1, acceptance 1, track 1 (sum 5)
Start commit: 3da57a769273342083513e6154d6588d4d272b4a

**Read first: as in D1 and D2, the scope's "Today" and "Touches" name the wrong code.** The captain formation is the Power link crew:
`theme/starChart/maneuvers/powerLink.ts` `formation()`, a thin wrapper over the pure `formationSpots.ts` (D2). **`placeFormation.ts` (a
planet's pieces) and `stationFire.ts` (Strike run's and Landing's beams, whose captains are sorties, not a formation) are left alone.**
The beam in question is Power link's echo: `powerLink.ts` `echo` fires `themeCmd.phaser` or `themeCmd.mine` from the station's rim to
each `target`, a strand per piece the merged work served. Today the crew's line (author, then approvers) is chosen without looking at
them, so a strand can run through the ships. The decisions below also follow the scope Decision of 2026-11-01: **on the board (D2) wins
over the beam corridor, and over the plates; if no on-board place is clear, the formation keeps its D2 place and the beam fades as it
passes the ships.**

## Acceptance
  - A unit test: for every merge in the goldens, each member's distance from each beam segment is at least the
    corridor's half-width, or the merge is in a reported list of fallbacks.
  - Stills of the gallery's Power link demo.

(Also the Decided line: "Formation slots are chosen outside a corridor round each ray from the emitter to a target (its width is a 15 §5 value), falling back to the nearest clear arc. When there is no clear place, the formation keeps its place and the beam fades as it passes the ships.")

## Approach
1. **D2's pick stays the default.** In `formationSpots`, compute D2's pick exactly as now (`pick`, else the clamped fallback). New optional
   input `beams?: readonly P[]`: the far ends of the strands (the targets' centres, world units); every strand starts at `at` (the station's
   centre; conservative against the real start, the rim). **No `beams`, none, or D2's pick already clear of every corridor: return D2's
   pick unchanged** (so every D2 test, and every merge with no beam through the crew, is bit-identical).
2. **Corridor.** Exported `CORRIDOR_HALF = 1.5` (captain-ship sizes, `ship = R*0.5`: a ship, its trail and the beam's glow each side).
   `blocked(c)` = any member (author and approvers) lies less than `CORRIDOR_HALF * ship` from any segment `at -> beam` (point-to-segment
   distance, so a member past a short strand's end is measured to the end). Reason for the value: the author, 2.1 R out, then clears a
   strand at about 21 degrees off the line; approvers further out clear it at less.
3. **Nearest clear arc.** Only when D2's pick is blocked: candidates are lines through the station at `theta0 +/- k * CORRIDOR_STEP`,
   `k = 1..12` (`CORRIDOR_STEP = Math.PI / 12`, 15 degrees; `theta0` = the direction of D2's pick, `atan2` of its author from `at`; for D2's
   clamped fallback use the first candidate's), visited in order of `k`; at equal `k` the one whose author is nearer the board's middle
   (no board: `[0, 0]`, the star) goes first; `k = 12` is the opposite end, once. A general line has axis `[cos, sin]`, across `[-sin, cos]`,
   the same `author = out`, same approver stagger (`(k % 2 ? 1 : -1) * ship * 0.6`) and spacing as D2's `line`; `face` = `cos > 0.05 ? -1 : cos < -0.05 ? 1 : (fx >= 0 ? -1 : 1)`
   (ships face the station; the vertical case is D2's). Build D2's four axis candidates through the generic form when the angle is a
   multiple of 90 degrees only if the float noise is harmless; D2's own `line()` stays for D2's pick.
4. **The pick, in tiers.** Among the arc candidates: first that is `inside` (D2's shrunk-board test, unchanged) **and** not `blocked` **and**
   `clear` of the plates (D2's `covers`); else the first `inside` and not `blocked` (a corridor beats a plate: D1 gives a member with no
   free place its picture); else **D2's pick, with `blocked: true`** (the fallback). The result type gains `blocked?: true` (set only when
   `beams` is non-empty and the result still has a member inside a corridor). `inside` is always true with no board, so off a solar
   region the search runs on the whole circle.
5. **`powerLink.ts` `formation()`** passes `beams`: the points of `present(c, 'target')` (`pointOf(v.at) ?? [v.node.world.x, v.node.world.y]`,
   the way the facility's own `at` is read; targets that give none are skipped). The spots are still fixed once at gather (`spotsOf`), so seek and
   play agree for planned places. The returned object carries `blocked` through the `spots` WeakMap type.
6. **The fade (only when `s.blocked`).** `FireArgs` and `MineArgs` (`theme/starChart/commands.ts`) gain an optional
   `veil?: { at: readonly [number, number][]; r: number }` (world units: the crew's spots, `r = drawnR(f) * 0.5 * CORRIDOR_HALF`). In the `echo`
   of `powerLink.ts`, pass `veil` to each `phaser` / `mine` call **only when `s.blocked`** (all spots). In `Beam.update` and
   `MiningBeam.update` the four hot-beam strokes (`g.moveTo(sx,sy).lineTo(ex,ey).stroke(...)`) go through one new helper
   `strokeVeiled(g, [sx,sy], [ex,ey], veil, stroke)`: for each veil point within `r` of the drawn segment (perpendicular distance), the line is
   split at its projection `+/- r` and the piece inside is drawn at `VEIL_ALPHA = 0.3` of its alpha (joints with `cap: 'butt'`, since the beam is additive and
   round caps double at a join; outer ends keep the original cap). With no veil, or no point near the segment, it draws the single stroke exactly as today (byte-identical
   for every other beam). Do not touch the sheath, trail, bloom, sparks or muzzle. Export `VEIL_ALPHA`. Reduced motion draws a ring, so
   it is unchanged. Alternative rejected: dimming the whole beam (it would hide the payoff when only one ship is in the way).
7. **Docs.** `docs/13-game-design.md` §6.2 Power link row (the formation sentence, ~line 687): after "(27 D2)" add "; and clear of the beam: if
   the line would put a ship within a corridor round a strand from the station to the work, the nearest on-board line (turned in 15 degree steps) that
   keeps clear takes its place; with none, it keeps its place and the beam fades as it passes the ships (27 D3)". `docs/08-layout-solver.md` §7
   "On screen": one bullet after the D2 one (line ~366): "**The Power link formation keeps clear of the beam** (27 D3): ...the same rule,
   the corridor, the tiers (board, then corridor, then plates), the fallback and its fade". `docs/15-reference.md` §5: after the Geometry/preview
   material, a new marked table `<!-- table: formation-corridor -->` (columns `Constant | Value | Meaning`) with three rows, then a
   Source/Guard/Update-when line citing `docTables.test.ts`:
   `theme/starChart/maneuvers/formationSpots.ts` CORRIDOR_HALF | 1.5 | ...; `theme/starChart/maneuvers/formationSpots.ts` CORRIDOR_STEP | 0.2618 | (15 degrees, as the `besideTurn` row writes it); `theme/starChart/commands.ts` VEIL_ALPHA | 0.3 | ....
   Register the id in `tests/unit/docTables.test.ts`: add `'formation-corridor'` to `GUARDED` (line ~303) and to the `['hits', 'geometry', 'preview']`
   loop (line ~547), which checks each row's `Value` against the constant. No `SOLAR_LAYOUT_VERSION` bump (the plan does not change; goldens must not move).

## Files
- `src/renderer/src/theme/starChart/maneuvers/formationSpots.ts` (all, 83 lines: `formationSpots`, `FormationInput`, `FormationSpots`).
- `src/renderer/src/theme/starChart/maneuvers/powerLink.ts` 14-60 (header, `formation()`, `spots`/`spotsOf`), 100-125 (`gather`), 143-165 (`echo`, where the strands are fired).
- `src/renderer/src/theme/starChart/commands.ts` 161-300 (`FireArgs`, `CUTS`, `Beam.update`: the four-stroke block at ~234), 402-500 (`MineArgs`, `MiningBeam.update`: ~480), 655-680 (the `phaser` / `mine` defs).
- `src/shared/engine/pace.ts` 231-241 (`workOf`: a merge's targets), 478-496 (the merge rule's cast).
- `tests/unit/formationBounds.test.ts` (D2's: copy its `PODS`, projection loop, `fitScale`, dynamic import of the renderer module; do not import the file itself).
- `tests/unit/maneuvers.test.ts` 700-760 (`paceFacts`, `buildScene` over Halcyon's scopes: how a test reads merges), `docs/15-reference.md` 1124 area (the Merge formation row, for style), 421-480 (Geometry and Preview tables).
- `tests/unit/docTables.test.ts` 300-310, 547-553.
- `docs/13-game-design.md` ~687; `docs/08-layout-solver.md` ~366.

## Excerpts
- D2's `formationSpots.ts` rule: candidates in order (natural axis toward the board's middle, same axis the other way, other axis toward the middle, other axis the other way); pick the first `inside && clear`, else the first `inside`, else clamp. `inside` = every spot inside the board shrunk by `pad = ship * 1.2`. `ship = R * 0.5`, `out = R*1.2 + ship*1.8`; approvers at `out + ship*(APPROVER_OUT + k*APPROVER_STEP)` (4, 3.4), staggered `+/- ship*0.6` across.
- Scope Decision 2026-11-01: "D2 and D3 priority: staying inside the fitted board (D2) wins over the beam corridor (D3). D3 picks among the on-board slots the nearest one clear of every corridor; if none is clear, the formation keeps its D2 place and the beam fades as it passes the ships."
- `powerLink.ts` echo: the strand starts at `f.anchor`-less rim point `R*0.45` toward the target, ends at `t.at` (`toR: drawnR(t)`); `themeCmd.phaser` at a threat, `themeCmd.mine` at an asteroid (a Task stands for its parent: `workOf`).
- 15 §1: "A value with no exported constant is marked `unguarded:`"; a marked table must be listed in `docTables.test.ts` `GUARDED` and its Guard line must cite `docTables.test.ts`.
- Project notes: the effect where it's meant is Halcyon's Pulsar and Quasar pods and pod-sprint's Harbor Pod, not the default scene; shared Pixi resources (the veil adds no textures or sprites, only strokes on the beam's own `Graphics`); frame budget (a few more strokes per beam only while blocked and only for the ships on the line).
- Fixtures: Pulsar and Quasar = Halcyon (`fixtures/scenarios/sprint-pods.ts`), Harbor = `fixtures/scenarios/v1/pod-sprint.ts`. Fixture data only (INV-18).

## Checks
- **New `tests/unit/formationCorridor.test.ts`.**
  (1) Pure cases on `formationSpots` (import by path as D2's test does): no `beams` equals D2's output for the same input; beams not near the line give D2's pick unchanged; a strand along D2's line gives a different line whose every member is at least `CORRIDOR_HALF * ship` from the segment and which is `inside`; the nearest-arc order (a strand blocking the pick at 0 degrees is answered by a line 15 or 30 degrees round, not the opposite end, when those clear); a plate-covering clear-corridor candidate is taken only when no plate-clear one exists (the tiers); a strand blocked in every direction (e.g. strands to the 24 grid directions) gives D2's pick with `blocked: true`; a board that forbids every clear line gives D2's pick with `blocked: true` (on board beats the corridor).
  (2) **The acceptance case.** For Pulsar (all Halcyon pods may be added if time allows; Quasar is the other busy one) and Harbor, per scope (as `formationBounds.test.ts` loops): `paceFacts(h)` gives `attachments`; a merge is an attachment whose `signalAt` has an `accomplished` entry, at that entry's `from`; its targets are `workOf(f, key, from)`; its approvers are `approvers` minus `author`. Project the pod scene at that time (cache by time), find the station in `g.solar.stations` by `facility`, and the targets' nodes by `canonicalKey` (`world.x`, `world.y`); skip a merge missing its station or all targets (count the skips). For each merge, each scale in the D2 list (fixed scales and the two fit scales), with `R` as the renderer draws it, `n` = its real approver count, no plates: call `formationSpots({ ..., beams })`; assert every member is at least `CORRIDOR_HALF * (R/2)` from every segment **or** the result has `blocked: true`. Assert `checked > 0`, and that at least one merge had a beam through D2's pick (so the search ran: count it), and every spot `inside` the board. **Report the fallback list**: `console.info` the merges (pod, attachment key, scale, n, target count) that were `blocked`, and assert the blocked share is below 25 % of the checks (if it is above, the search is not working: stop and say so in the record; do not raise the bound).
  **Show it bites:** run (2) with D2's rule alone (no `beams`) and record in the build record how many checks have a member inside a corridor, and where. If none do, say so and keep the guarantee (as D2's record did for Pulsar).
- Mapped specs (`tests/README.md`): `npm test` (`formationBounds`, `docTables`, `commands`, `maneuvers`, the goldens must not move), `npm run e2e:spec -- solar-dense gallery-assets gallery-v1 solar demo` (D1's "formation plates", D2's "formations stay on screen" must still pass: the spot move can only make a crew leave a strand, never the board), then `npm run e2e:keystone`.
- **Stills of the gallery's Power link demo** (acceptance line 2). The demo is the `attachment.merge` cell (and `attachment.merge:first`) of the gallery's maneuver family (`gallery/maneuverDemos.ts`; `gallery-assets.spec.ts` shows how a cell is addressed: `[data-art="maneuvers:attachment.merge"]` and `__starChartGalleryDemos`). Write a throwaway spec (name it `tests/e2e/d3-stills.spec.ts`, delete it afterwards; copy the launch of `gallery-assets.spec.ts`) that screenshots that cell at the echo (the strand out, the crew in place), and copy the PNGs into `docs/progress/v1.4/work/D3/`. If the demo's crew and strand do not cross (it may not), also take a still of a Pulsar merge from `npm run drive -- docs/progress/v1.4/work/D3/stills.ts --paradigm solar` (adapt D2's `stills.ts`) where the unit test says D2's pick was blocked, and one with the fade if the unit sweep found a `blocked` merge. Name the stills in the build record for the human gate. Run gallery and drive one at a time (shared `out/`).
- Perf: the search runs once per merge at gather; the fade adds strokes only while blocked. No perf run needed unless the builder finds the veil in a hot path.

## Out of scope
- `placeFormation.ts`, `stationFire.ts`, the finale formation (`finales.ts`), Strike run / Landing beams, labels and plates (D1), the board rule (D2: unchanged, still wins).
- Making the corridor start at the exact emitter (`f.anchor('emitter')`) or follow a moving target after gather: spots are fixed at gather, strands from the station's centre.
- Energy chains (approvers to author to station): they run inside the crew by design.
- Any change to the plan, `SOLAR_LAYOUT_VERSION`, or the goldens.
