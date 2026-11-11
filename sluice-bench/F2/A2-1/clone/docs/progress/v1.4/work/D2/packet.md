# Packet D2: Formations form up on screen
Risk: medium (a shared choreography seam, but one rule in one function; the unit test decides most of it, the e2e is slow and sample-based) · Score: blast 1, verify 1, design 1, acceptance 1, track 1 (sum 5)
Start commit: 223356c3b71c988895d9ba616b8d783c96d8fe10

**Read first: the scope doc's "Today" and "Touches" name the wrong code (as in D1).** `placeFormation.ts` lays out a planet's
pieces; no captain is in it, and **it is left alone**. The captain formation is the **Power link crew**:
`theme/starChart/maneuvers/powerLink.ts` `formation()`, which picks the spots (author, approvers, `face`) once per maneuver at
gather (`spotsOf`, a `WeakMap`). It already *prefers* the station's line-end toward the star (the board's centre, `(0,0)`), but it
has no idea where the board ends: the line runs `out + ship*(APPROVER_OUT + i*APPROVER_STEP)` along the axis, where `ship = R*0.5`
and `R` is the station's *drawn* radius (floored: big at a far zoom), and it swaps to the far end whenever the near end's ships
would sit over the station's or the work's plate (`covers`). Neither step looks at the board, so a long crew or a swap can
leave it. `framing.ts` `boundsOf` fits stations (`stationReach`), the frontier belt and formations of *pieces*, but not this crew.
This packet adds the board to the rule.

## Acceptance
- A unit test over Pulsar's and Harbor's plans: every formation's members lie inside the fitted board's bounds.
- `solar-dense.spec.ts`: at 1440×900 and at 1024×640, every formation member is on screen during its act.

(Also the Decided line: "A formation forms on the side of its station that faces the board's centre, so it stays inside the fitted view. The rule is pure in world terms (from the plan's places, not the camera), so seek and play agree." And the scope Decision, 2026-11-01: staying inside the fitted board (D2) wins over the beam corridor (D3), and over the plates.)

## Approach
1. **The board is the plan's frontier rectangle, in world units, no camera.** `star ± (frontier.rx1, frontier.ry1)` with the star at
   `(0,0)` (`solar.star`). `boundsOf` (`framing.ts:62`) always includes exactly this (plus `24/scale` of pad and every station), so a
   spot inside it is inside the fitted bounds at any scale or viewport, and inside the camera's view whenever the camera is at its fit.
   Scale-free, so seek and play agree. (Alternative rejected: reading the camera's fitted bounds: it varies with the window and inset
   and is not pure.)
2. **A new pure module `theme/starChart/maneuvers/formationSpots.ts`** (imports only `@shared/engine/solar/version` for `SQUASH`; no
   Pixi, so a unit test can import it as `placeStations.test.ts` imports renderer modules; look at how `frontierStations.test.ts`
   does its `CHART` dynamic import). Move into it `APPROVER_STEP`, `APPROVER_OUT` (powerLink.ts re-exports both, so nothing else
   changes; doc 15 row 1124 still names powerLink.ts) and the geometry now inside `formation()`:
   `export interface Rect { minX: number; minY: number; maxX: number; maxY: number }`
   `export function formationSpots(i: { at: P; R: number; n: number; plates: Rect-like {x0,y0,x1,y1}[]; board?: Rect | null }): { author: P; approvers: P[]; face: number }`.
   `formation(c, f)` in powerLink.ts becomes a thin wrapper: `at` from `pointOf(f.at) ?? [world.x, world.y]`, `R = drawnR(f)`,
   `n` as today, `plates` as today, `board = c.board`.
3. **Candidates, in this order**, each a line `(axis, sign)` whose spots are `author` and `approvers` as today (same `at(d, off)`, same
   stagger): (a) the natural axis (`horizontal = |fy/SQUASH| >= |fx|`) toward the board's centre (`-sign(fx or fy) || 1`); (b) the same
   axis, the other way; (c) the other axis toward the centre; (d) the other axis, the other way. `face` per candidate as today
   (`horizontal ? (sign>0 ? -1 : 1) : (fx>=0 ? -1 : 1)`, with that candidate's own orientation).
4. **The pick.** `inside(c)` = every spot lies in the board shrunk by `ship*1.2` on each side (`pad` as `covers` uses; if the shrunk
   rect is empty, use the board as it is). `clear(c)` = `!covers(spots)` (today's plate test, unchanged). Pick the first of
   (a),(b),(c),(d) that is `inside && clear`; else the first that is `inside` (**on board beats plates**: the Decisions entry); else
   (a) with every spot clamped into the shrunk board (author and approvers keep their order; spacing may shrink, plates then fall to
   D1's picture fallback). **No board** (`board` null: a scene with no solar plan): candidates (a),(b) only, `inside` is true,
   which is exactly today's rule (a unless it covers and (b) doesn't), so nothing moves outside a solar region.
5. **Plumbing the board.** `GraphScene` gets `solarBoard(): Rect | null` beside `solarFormations()` (`GraphScene.ts:1032`):
   `const s = this.graph?.solar; return s ? { minX: s.star.x - s.frontier.rx1, maxX: s.star.x + s.frontier.rx1, minY: s.star.y - s.frontier.ry1, maxY: s.star.y + s.frontier.ry1 } : null`.
   `CastViews` (`fx/types.ts:~101`) gains `board?: Rect`; `interpreter.ts` `views()` (line ~823) sets `out.board = scene.solarBoard() ?? undefined`
   after the loop. Before you add it, grep for code that iterates a `CastViews` by key (`Object.entries(c`, `Object.values(cast`,
   `for (const … in`) in `chart/fx/` and `theme/`: a non-role key must not be read as a role. If one does, skip `board` there.
6. **Docs.** `13 §6.2` Power link row (~line 687): after "toward the view's middle unless that would cover the station's or the
   work's plate" append "; it never leaves the board (the frontier belt's rectangle): failing that end, the other end, then the other
   axis, then the spots are held inside it (27 D2)". `08 §7` "On screen" list: one bullet "**The Power link formation stays on the
   board** (27 D2): `formationSpots` takes the frontier rectangle from the plan, so it is scale- and camera-free." No constant changes, so no
   15 row. No `SOLAR_LAYOUT_VERSION` bump (the plan does not change; the goldens must not move).

## Files
- `src/renderer/src/theme/starChart/maneuvers/powerLink.ts` 19-85 (header, `APPROVER_*`, `formation()`, `spots`/`spotsOf`); 100-128 (`gather`, the one caller).
- `src/renderer/src/theme/starChart/maneuvers/formationSpots.ts` (new).
- `src/renderer/src/chart/fx/types.ts` 85-110 (`CastView`, `CastViews`); `src/renderer/src/chart/fx/v1/interpreter.ts` 823-842 (`views`).
- `src/renderer/src/chart/scenes/GraphScene.ts` 1030-1034 (`solarFormations`; add `solarBoard` here), 1054-1057 (`drawnR`).
- `src/renderer/src/chart/framing.ts` 62-120 (`boundsOf`, read only: what the fit includes).
- `tests/unit/frontierStations.test.ts` 1-60 (a pure-ish way to project Halcyon and `pod-sprint`, `effectiveOf`, the `CHART` dynamic import, `SCALES`); new `tests/unit/formationBounds.test.ts`.
- `tests/e2e/solar-dense.spec.ts` 709-end (D1's `describe`, to copy its merge scan and launch), `tests/e2e/density.spec.ts` 351-355 (`resize`), `tests/e2e/launch.ts` 30-44.
- `docs/13-game-design.md` ~687; `docs/08-layout-solver.md` §7 "On screen" (~line 330).

## Excerpts
- `powerLink.ts` header: "The formation lies beside the station on the side toward the star (it stays in frame), across its line of fire".
- `formation()` today: `const horizontal = Math.abs(fy / SQUASH) >= Math.abs(fx);` ... `const toward = -Math.sign(horizontal ? fx : fy) || 1;` ... `const pick = covers([a.author, ...a.approvers]) && !covers([b.author, ...b.approvers]) ? b : a;` ... `const face = horizontal ? (sign > 0 ? -1 : 1) : (fx >= 0 ? -1 : 1);`
- `08 §7`: "The fit includes the whole frontier belt and every formation's spread at the fit's scale"; "A station's drawn size is capped at `RING_MAX_SCALE` (2)"; Harbor Pod (4 planets, 3 stations), Pulsar is Halcyon's busiest pod (20 captains).
- R3 (the outside matches the inside), R11 (an object arrives before its label): unchanged; ships still fly to spots at gather.
- Project note, effect where it's meant: check on Halcyon's Pulsar and Quasar pods and `pod-sprint`'s Harbor Pod, not the default scene.
- Fixtures: Pulsar = Halcyon (`fixtures/scenarios/sprint-pods.ts`), Harbor = `fixtures/scenarios/v1/pod-sprint.ts`. Fixture data only (INV-18).

## Checks
- **New unit `tests/unit/formationBounds.test.ts`.** (1) Pure cases on `formationSpots`: a station at the left edge on the axis with `n = 5` and a board that the toward-centre line fits stays toward the centre; one whose toward line leaves the board takes (b), (c) or (d) as the order says; with every candidate out, the result is clamped inside; `covers` on the toward end and room on board takes (b), and `covers` on both with only (a) on board takes (a); `board: null` equals today's output for the same input (copy 3 numeric cases from the current code before you change it). (2) The acceptance case: for Pulsar and for Harbor, project the pod (as `frontierStations.test.ts`), read `g.solar.stations` (x, y), `frontier`, and a facility node's `world.r` and `maxScale`; for each station, each scale in the fit scales of 1440×900 and 1024×640 (compute as `fitFor` does: `min(usableW/bw, usableH/bh)` over `boundsOf`; or a small fixed list `[0.02, 0.03, 0.05, 0.08, 0.12]` plus those, as `frontierStations.test.ts` does), with `R` as the renderer draws it (`min(screenRadius(n, s), n.world.r * n.maxScale * s) / s`), and each `n` in 0..6 approvers (an arc holder can join the support; say the bound in a comment), no plates: every spot of `formationSpots` lies inside the board. Count what was checked and assert it is above zero. Also assert the board is inside `boundsOf(graph, scale)` (import `boundsOf` from `chart/framing.ts`; it imports `assetFor`: if that drags Pixi into the unit test, assert against the formula instead and say so).
- **Show it bites.** Run (2) first with `board: null` (today's rule): record in the build record whether it fails and for which station and `n`. **If it does not fail anywhere, do not invent a bug**: keep the guarantee, and say in the record that the plan-level test could not reproduce the report (the e2e and a drive still, below, are then the only evidence).
- **New e2e in `solar-dense.spec.ts`**, its own `describe` ("formations stay on screen (27 D2)"), `test.setTimeout(300_000)`, Pulsar Pod only (the busiest crews), launched fresh per size as D1's describe does (`launchApp({ STAR_CHART_PARADIGM: '' })`, Halcyon Reach → Pulsar Pod), once at 1440×900 and once at 1024×640 (resize with `density.spec.ts`'s `setContentSize` helper, then wait 500 ms and `settle`; a new `launchApp` with `STAR_CHART_WINDOW_SIZE` is not needed). Reuse D1's merge scan. Take the first two merges of each orientation (four merges per size; fewer if the pod has fewer). Play each as D1 does, sample every 250 ms for 9 s (the act is gather 0.9 s through echo 3 s, plus disperse). Per sample, the members are the captains with a shown `.is-acting` plate, their centres from `t.displayed()`; assert each centre lies inside `.chart-host`'s rect (relative coordinates, 0 ≤ x ≤ width, 0 ≤ y ≤ height) and that at least one merge per size had two or more members at once. Run it against the unchanged code first and record the result (it may pass: see above).
- Mapped specs (`tests/README.md`): `npm test` (the new unit, `docTables`, `solarLayout`, goldens must not move), `npm run e2e:spec -- solar solar-dense demo gallery-v1 density` (the Power link demo is `gallery-v1`/`gallery-assets`; the chain's `slice3a` too), then `npm run e2e:keystone`. D1's "formation plates" case and the "captain's turn" case must still pass (the spot move changes where plates stand, not the plate rule).
- Look: one drive still of a Pulsar merge at 1024×640 (`npm run drive -- docs/progress/v1.4/work/D2/stills.ts --paradigm solar`, write it from D1's `stills.ts`) with the crew whole on screen; name it in the record for the human gate.

## Out of scope
- `placeFormation.ts` and the piece formations; `labels.ts`/plates (D1's, done); the beam corridor (D3: it will choose among on-board slots, so keep `formationSpots`'s candidate list easy to extend); `APPROVER_STEP`/`APPROVER_OUT`; the finale formation (`finales.ts`).
- Making `boundsOf` fit the crew (the board already contains it by construction, so the fit does not change; do not touch `framing.ts`).
- The follow camera or a zoomed-in view: a member can be off screen when the user has zoomed or the follow camera has framed something else; the acceptance is the fitted view.
- Guests (jump-in) get spots the same way: no separate rule.
