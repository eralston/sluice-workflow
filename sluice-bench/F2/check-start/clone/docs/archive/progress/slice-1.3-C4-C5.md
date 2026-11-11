# Slice 1.3 C4 and C5: the station's power hook and its emitter

**Status:** built 2026-10-28. Items: [23 §3 Block C](../23-v1.3.md#3-blocks), C4 and C5.

## 1. What was built
- **C4, `DreadnoughtView.setPower(0..1)`** (`chart/art/dreadnoughts.ts`). The art now owns the standby dimming:
  at power 0 the hull and its satellites (`root`, `marks`) tint to `POWER_DIM_HULL` (0.7) and every additive
  layer under `root` (drives, windows, bays, reactor, beacons, shield, seams) to `POWER_DIM_LIGHTS` (0.3), on
  the same smoothstep as before. It also keeps its own idle clock, which advances at the scene's rate times
  power, so the heave, sway, roll, drive swell and window shimmer still to a stop and resume where they
  stopped. (Review fix: this is a lag behind the scene clock, `powerLag`, not a separate clock, so at power 1 the art
  is exactly on the scene clock, including the gallery's `freeze` stepping time back; the math is in the pure
  exported `powerTints` and `powerLag`.) `assets/standby.ts` shrank to the easing (wall time, fade 2400 ms, wake 900 ms, settle, reduced
  motion) and passes `setPower(1 - level)`; it re-exports the two shares as `STANDBY_HULL`/`STANDBY_LIGHTS`.
- **C5, `anchor('emitter')`.** Each hull form and heading now bakes an emitter point (the main cannon's muzzle
  for Mecha, the Wars docking ring's dorsal emitter in its second form, else the first battery). It rides as a
  hardpoint beacon like the others (so projection is unchanged and nothing new is drawn). `DreadnoughtView.anchor`
  returns it in px with the idle drift; `AssetView.anchor?` and `AdaptedView` forward it; `GraphScene.anchorOf(pk,
  name)` turns it into world units (live position plus anchor times the view's scale); `CastView.anchor` carries
  it to the choreography (set in `interpreter.viewOf`); `stationFire.ts` fires from it, and from the old rim
  point only when a view has none.

## 2. Contracts changed
13 §4.4 (the station's hooks, new paragraph), 14 §2.8 (`anchor?`), 15 §10 (the standby *dim* row's source is now
`dreadnoughts.ts`), tests/README (the c5-emitter step, the mapped tests). 02 and 03 are unchanged.

## 3. Checks
- `npm run typecheck`, `npm run lint`: pass. `npm test`: 84 files, 1322 tests pass. No golden moved.
- Review fixes (2026-10-28): the idle clock is a lag (finding 1); `powerTints` and `powerLag` are exported and
  tested directly in `stationStandby` (power 1 tints nothing and tracks the scene clock through a step back, power 0
  gives the two shares and holds the clock; the stand-in now uses them) (2); the lights list is refreshed at the end
  of `setStage`, after a morph's layers exist (3); `anchor('emitter')` returns null while a morph or docking is in
  progress, so `stationFire` uses the rim then (4, not unit-testable: the art needs a DOM); the 15 §10 dim row names
  `dreadnoughts.ts` POWER_DIM_HULL (docTables reads one constant per cell) (6).
- Unit: `stationStandby` (adapter passes `1 - level`; easing, settle, reduced motion and the clock behaviour
  unchanged) and the new `stationFire` (emitter used, live, rim fallback). The art itself needs a DOM, so
  `setPower` is checked in the app: drive `v11-M1` reads the tint of each station before and after the change,
  identical: standby 0.702 (= 179/255 = 0.7 of full), awake 1. Crops of the standby, awake and reduced-motion
  stations are visually identical.
- E2E: `gallery`, `gallery-assets`, `gallery-v1`, `solar-play` pass; keystone 42 pass (after the review fixes too).

## 4. Human gates
HG-C (emitter beams, with the rest of Block C). Stills in `review/v1.3/C/` (gitignored): `C4-before-*` and
`C4-after-*` (a standby station, an awake one, standby under reduced motion), `C5-before-*` and
`C5-after-*` (Harbor Pod, a station's beam at 12 pm Thu 1 Oct and at 44.9 s; "before" is the rim, made by
disabling the anchor for one run). Drive step `tests/drive/steps/c5-emitter.ts` re-shoots them.

Review fix 5 (stills of a Wars second-form and a Mecha station beaming) is only partly met:
`review/v1.3/C/C5-gallery-charge-all-factions-robot-forms.png` (a temporary gallery tweak, reverted) shows the Charge
state in every faction's second form, whose glow sits at the dorsal emitter (Wars) and the cannon (Mecha), the
points `anchor('emitter')` returns. No pod fixture I tried puts a Wars or Mecha station beaming on screen (Harbor
Pod's is Trek), so there is no before/after of a moved beam for them.

## 5. Known limitations and open questions
- The emitter is a fixed point per form and heading; the beam still leaves it even if the station faces away
  from its target (as the rim point never did). The anchor ignores the idle roll (about 0.3 degrees).
- At the strike frames Harbor Pod shows, the emitter and the old rim point are close (the Trek hull's first
  battery sits near its top), so the difference is small there; Mecha's cannon muzzle and Wars' dorsal emitter
  move it more. HG-C should look at those in a Wars and a Mecha station.
- The lights list is cached at `setStage`/form build, as the adapter did, so an act's overlay layer stays
  undimmed until the next stage, as before.
