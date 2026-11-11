# Slice 1.3-F2–F4: duplicate constants, dead code, stale comments

**Status:** built 2026-10-27; no human gate. Plan: [23-v1.3.md](../23-v1.3.md) Block F. Fixture data only (INV-18).
No value changes.

## 1. What was built
- **F2, duplicate constants.** Both charges now live in `chart/fx/timing.ts`: `STATION_CHARGE_MS` (600) and
  `LINK_CHARGE_MS` (700). `stationFire.ts` lost its exported `CHARGE_MS`, and `powerLink.ts` its private one;
  both import from `timing.ts`. Why `timing.ts`: it is already the home of the effect timings that the theme's
  maneuvers import (`powerLink`, `haul`, `landing`, `captainJump` take `TRACTOR` from it, `reassign` takes
  `CYAN`), and GraphScene imports it too, so no new import direction is added. A theme module would have
  been wrong for GraphScene's constants, and `chart/art` sits below `fx` (`timing.ts` imports
  `art/energy`). GraphScene's private `ARRIVE_S` / `DEPART_S` are gone; it imports `timing.ts`'s
  (both 0.9 s, as before).
- **F3, dead code.** Each was grepped across `src`, `tests`, `fixtures`, `scripts` and `config`:
  - `WIQL_CAP` (`sync/wiql.ts`): declaration only. Deleted.
  - `CH.notImplemented` (`contracts/ipc.ts`): declaration only; no handler, caller or `Object.values(CH)`
    walk. Deleted.
  - `captains.setCallSign`: not in code at all (doc mentions only). Doc mentions removed.
  - `DomainPack.crowd`: no app code read it. It was set by the three packs (`SDLC_CROWD` in
    `packs/sdlc/thresholds.ts`, literals in Todo and CRM) and carried by `PlanPack` and solar.ts's
    `DEFAULT_PACK`. Deleted with `SDLC_CROWD`; `PlanPack = Pick<DomainPack, 'id'>`. Tests that only
    asserted its value were trimmed (`packs.test.ts` ×3 assertions, `maneuvers.test.ts`'s and
    `solarLayout.test.ts`'s pack literals), and `solarLayout.test.ts`'s "ignores the pack's crowding" test
    was removed: there is nothing left to ignore (1092 → 1091 tests). `tests/e2e/density.spec.ts` used
    `SDLC_CROWD.free.objective` (3) as the cap for its free-pieces backstop; it now uses a local
    `OLD_FREE_CAP = 3`, so the check is unchanged.
  - **`PieceState.outcomes`: kept, because it is used.** The chart's projection doesn't write it (since
    v4, 05 §8 G-14), but the stage code encodes and decodes it (`engine/stageCode.ts` `o=m…r…`), the theme
    writes it into a seat's look (`stageCodec.ts` `seatLook`, `world.<percent>.m<m>r<r>`), the gallery's
    seat asset demo sets it (`theme/starChart/assets/seat.ts`, "outcomes accumulating"), the world art draws
    it (`worlds.ts` megastructures and research facilities), and `stageCode.test.ts` and
    `assetStage.test.ts` round-trip it. 05 G-14 already records "the field stays for the world art and its
    gallery". Removing it would remove a gallery demo and an art capability, not dead code, so it is the user's call.
- **F4, stale comments** (comments only, plus one gallery note string):
  - `chart/art/dreadnoughts.ts` header and `DreadnoughtOptions.length`, and `gallery/v1/stations.ts`'s `L`:
    no more "3–4× a ship". On the chart a hull is as long as a planet's radius (`GEOMETRY.facilityR` 260,
    so 520 long against a 112-long ship: several ship lengths) and at the screen floors twice a ship
    (`FLOOR_PX.facility` 57.6 vs `captain` 28.8; 13 §4.4, 15 §5). The gallery's 240 px is said to be a
    gallery size (about 3.4× its ~70 px ship). The gallery's *Scale* cell note, which made the same claim on
    screen, says the same now. `dreadnoughts.ts`'s `CHARGE_S` comment now names `STATION_CHARGE_MS` (F2).
  - `chart/art/worlds.ts` header: the art can still draw outcomes from the stage, but the chart writes none
    since v4 (finished pieces are platforms in orbit), so only the gallery shows them.
  - `main/credentials/store.ts` header: the Keychain store serves dev builds too; only test runs
    (`STAR_CHART_TEST`, `testMode` in `main/index.ts`) force `MemoryStore`. Matches `index.ts`'s own comment
    and 04 §1.

## 2. Contracts changed
- **15 §10 (timing):** *Station charge* and *Power link charge* now cite `chart/fx/timing.ts`
  `STATION_CHARGE_MS` / `LINK_CHARGE_MS`, both guarded (the power link row was `unguarded:`). *Arrive and
  depart* cites `timing.ts` `ARRIVE_S, DEPART_S` (guarded now) and keeps GraphScene's `MOTION_PER_S`,
  `CHEAP_S` unguarded. The table's **Source** line drops `stationFire.ts` and `powerLink.ts`.
- **03:** `SolarSource.pack` comment, the SDLC pack line, `PlanPack`, the *No free cap* bullet (now says
  `crowd` was removed in v1.3 F3), the IPC table's `notImplemented` row, and the two superseded notes
  about `captains.setCallSign` and `CH.notImplemented`.
- **13 §10 Q6:** "`DomainPack.crowd`, which nothing read, was removed in v1.3 F3".
- **14:** the `DomainPack` sketch (§2), the `PlanPack` paragraph, `SolarSource.pack`'s comment, the solar
  plan test row, and the pack-thresholds row.
- **04** (not in F3's Docs column, but it named the deleted symbols): the `WIQL_CAP` mentions in §3 and
  §6, and the `captains.setCallSign` note in the captains section ("Editing it isn't offered").
- Code: `PlanPack` and `DomainPack` lose `crowd`; `CH` loses `notImplemented`. No behaviour change.

## 3. Checks
- `npm run typecheck`: pass. `npm run lint`: pass.
- `npm test`: 75 files, 1091 tests pass (one test removed, above). `docTables` green. No goldens moved.
- `npm run e2e:spec -- gallery-v1 solar solar-play slice3a density motions` (the name `solar` also picks
  up `solar-dense`): 55 passed, 1 failed, 10 did not run (the rest of `solar-dense`, serial after the
  failure). The failure was `solar-dense` "ships and stations point the way they travel": `moving` was 14
  where it expects more than 20, a count of travel seen within its window under a parallel run. Re-run
  alone: `npm run e2e:spec -- solar-dense`, 16 passed. Nothing in this batch changes motion values.
- `npm run e2e:keystone`: 39 passed.

## 4. Human gates
None. (The gallery's *Scale* cell note in the stations family reads differently; nothing is drawn differently.)

## 5. Known limitations and open questions
- **`PieceState.outcomes` stays** (above). If the user wants it gone, it is a feature removal: the stage
  code's `o=` part, `seatLook`'s `.m<m>r<r>`, the world art's outcome pass, the gallery's *outcomes
  accumulate* cells and the seat asset's demo, and their tests.
- **The art's hull charge** (`chart/art/dreadnoughts.ts` `CHARGE_S`, 0.6 s) still mirrors
  `STATION_CHARGE_MS` by hand: `chart/art` doesn't import `chart/fx` (and `timing.ts` imports `art/energy`),
  so it stays a mirror, named in both comments and in 15's *Station charge* row. It isn't guarded by a test.
- `solar-dense`'s facing test is load-sensitive (its travel count) under the parallel run; it passed alone.
  Unrelated to this batch; a candidate for F5's de-flaking.
- Out of scope, found in review: `gallery/v1/stations.ts`' `FormSizes` comment and its cell note say a station's floor is about 48 px long. The floor is `FLOOR_PX.facility` 57.6 as a half-length, so about 115 px long. Left for the user to judge with the gallery cell's sizes.
- `PieceState.outcomes` was kept (the world art and the gallery seat demo use it). Removing that feature is the user's call, asked at the end of Block F.
