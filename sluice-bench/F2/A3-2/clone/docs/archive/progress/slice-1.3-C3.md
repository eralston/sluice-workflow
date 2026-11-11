# Slice 1.3 C3: the vacated homeworld

**Status:** built 2026-10-28. Item: [23 §3 Block C](../23-v1.3.md#3-blocks), C3.

## 1. What was built
- **The projection** writes `PieceState.vacant` on a seat that holds no piece at the playhead (`solar.ts`, where
  the seat node is built; `seatPiece` is untouched, so the round's previews stay lit). The planet set is
  unchanged at every playhead (INV-14, R9); a unit test checks it.
- **The art** (`chart/art/worlds.ts`): `WorldView.setHolding(bool)` and `setPower(0..1)`. Power 0 draws the
  surface at `VACANT_SURFACE` (0.55) of its light (a new `uDim` uniform) and the settlement lights off. The
  lights fade from what the world last showed while it held work (its own share 0 has none), so the fade is
  visible. Pure math: `vacancyShares`. The root tint is set to the surface share only so `viewTints` can read it back.
- **The theme** (`assets/seat.ts`): `SeatView`, as `StationView` is for standby: eases on wall time (2000 ms
  down, 900 ms up), lands at once on a first stage, `settle` (seek, scene entry) and reduced motion.
- **Stage grammar**: `vc=1`, written last and only when true (03 §5, stage codec; `vc=0` does not decode).
- **Gallery**: a fourth cell in the registry's world section, *seat · vacated*: lit and finished, vacated, lit again.

## 2. Contracts changed
- 03 (stage string `vc=1`), 13 §3 (a vacated homeworld dims), 09 (not a rung), 15 §10 (two rows: dim, fade;
  Source line), `PieceState.vacant` in `contracts/view.ts`, tests/README.
- **Goldens moved (intended):** `solar.scenes.json` and `meridian.scenes.json`: only seat `stage` lines gained
  `|vc=1`, at the playheads where a seat holds nothing on the ladder. The review fix added 2 such lines to
  `meridian.scenes.json` (Convoy Planning Pod, Ulla Brennick, whose only piece is a Removed ghost).

## 3. Checks
- `npm run typecheck`, `npm run lint`, `npm test` (85 files, 1332 tests, incl. the new `vacantWorld.test.ts`).
- `npm run e2e:spec -- gallery gallery-v1 gallery-assets`, `npm run e2e:keystone` (42 passed).
- Drive `c3-vacant.ts --paradigm solar` (pod-sprint, Lantern Pod, Kit's Haven): vacant at 2026-10-02T16:02Z, tint
  1.00 to 0.55 over about 1.75 s in play at 1x; a seek under reduced motion lands 1.00 and 0.549 at once.
  Stills: `review/v1.3/C/C3-occupied.png`, `C3-vacated.png`, `C3-gallery-lit.png`, `C3-gallery-vacated.png`.

## 4. Human gates
HG-C: a vacated homeworld (the stills above, or `npm run drive` on Lantern Pod).

## 5. Known limitations and open questions
- **Review fix, the ghost decision:** vacant means nothing *on the ladder* is held, so a seat whose only piece is an
  Off ghost is vacant, as `seatReason` says ("Nothing held here now"). `solar.ts` tests `!held.some(a => !knownOff(a.signal))`.
  A unit test asserts `piece.vacant === (seatReason(...).kind !== 'holds')` for every seat of every sprint fixture at 25
  sampled playheads, so the art and the inspector can't drift; another covers Ulla's Removed piece.
- **Most seats open dim.** In pod-sprint and meridian, most seats (34 of 64 across fixtures) are vacant on the first frame
  and light within 3 to 10% of the round (Signals Pod's Rook Halvorsen about 32%). In Halcyon only Pulsar's Soren
  Ferreira, Zev Halloran and Cass Northcott do.
- `WorldView` no longer tints its root: `surfaceShare` (a getter) is read through `AdaptedView.lightShare` by `viewTints`.
  `SeatView` skips the redraw when the level hasn't moved.
- **No Halcyon seat ever empties** (every pod's seats hold work from arrival to the end; Pulsar's start vacant
  until their work arrives). The empties-in-play proof uses pod-sprint's Lantern Pod (and meridian's Convoy Planning
  Pod has two such seats). Halcyon's pods are unchanged; say if the demo should show one.
- A vacated seat also reads vacant before its work arrives (it holds nothing then, too), so Pulsar's late seats open dim.
- The seat's weather snaps to share 0 at the same moment the dimming starts; only the dimming and lights ease.
- The gallery shows the three states as stepped stills; the easing itself is seen in play (the drive).
