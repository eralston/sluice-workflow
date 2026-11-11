# Packet B4: Lights on at first arrival
Risk: medium (a new optional field on the shared seat piece and its stage string moves two goldens; the look itself is renderer-only and a unit test decides its timing) · Score: blast 1, verify 1, design 0, acceptance 1, track 1
Start commit: 22bde78c5aae046aef472a0bf749f78ce91428dc

## Acceptance
- `vacantWorld` unit test: the first arrival plays the sweep, a later return plays the ease, and a seek lands
  on the same final look.
- Drive `c3-vacant` on Lantern Pod shows the sweep (stills).

## Approach
1. **The projection says whether the work has come yet.** "First piece of the round" has to survive seeks and scene entry, and the view can't tell from its own history. A seat vacant before its first arrival and one emptied later have the same stage today. Add `PieceState.awaiting?: boolean`, a vacant seat with no work yet this round (`seatReason` would say `later`, not `held`), and write it only alongside `vacant`. The stage token is `aw=1`, after `vc`. A view-local "has it held before" flag was the alternative. I rejected it because a backward seek or a mid-round scene entry would play the wrong one of the two transitions.
2. **`solar.ts`:** a memoised `firstHeld(f)` (a `WeakMap<RoundFacts, Map<CanonicalKey, UtcMs>>`, built like `boardMemo`) gives each seat its earliest `heldSpans(p, f.round)` `from` over `PLACED_ROLES` pieces, using the board facts `f` already in scope. In the seat loop, a seat that's vacant becomes `awaiting` when `!(firstHeld(f).get(seat.person)! <= x)`. Vacant at `x` together with a first hold at or before `x` means that hold has already ended, so it's `held`. Don't call `seatReason` per seat, which is O(pieces) each.
3. **`stageCode.ts`:** add `'aw'` to `FIELDS` after `'vc'`. `encodePiece` writes `aw=1` only when `p.vacant && p.awaiting`, and decoding accepts only the value `1`. Because `decodePiece` re-encodes, `aw=1` without `vc=1` and `aw=0` already decode to null. Amend 03 (see Excerpts).
4. **The look: first light.** A share-0 world has no city lights: `WEATHER.lights` is 0 below ½, and the shader's `settled` mask is empty at share 0. A literal "city lights come on" would show nothing on most arrivals, so first light is a transient. Seeded pinpoints and a warm bloom come on over the night side, behind a front that runs from the terminator (n·L 0.3) past the far limb (n·L −1.15) in `FIRST_LIGHT_MS` = 800. A bright crest rides the front. Then they settle to the world's own lights (none below ½) over `FIRST_LIGHT_FADE_MS` = 600. The surface's dim lifts uniformly as today, but over `FIRST_LIGHT_MS` instead of `VACANT_WAKE_MS`. The final look is exactly today's holding look.
5. **`seat.ts`:** export `FIRST_LIGHT_MS = 800`, `FIRST_LIGHT_FADE_MS = 600`, and a pure `firstLight(ms): FirstLight | null`. Its `front` is `1 − (1 − c)²` with `c = clamp(ms / FIRST_LIGHT_MS)`, monotone 0 to 1. Its `lights` is 1 until `FIRST_LIGHT_MS`, then `1 − smoothstep` over the fade. It returns null once `ms ≥ FIRST_LIGHT_MS + FIRST_LIGHT_FADE_MS`. Import `FirstLight` as a type from `worlds.ts`.
6. **`SeatView` state:** keep the last stage's `awaiting`, and a `firstMs: number | null`.
   - `setStage`: if there was a previous target, it was 1 (vacant), the last stage was `awaiting`, the new `want` is 0, and motion isn't reduced, start the sweep (`firstMs = 0`). A `want` of 1 cancels any sweep.
   - `artTime`: while sweeping, add `dt` to `firstMs` and step the level toward 0 at `dt / FIRST_LIGHT_MS`. Reduced motion ends the sweep and snaps. When `firstLight(firstMs)` is null, stop.
   - `settle()`: land the level, drop the sweep, draw.
   - `draw()`: also calls `art.setFirstLight(firstMs === null ? null : firstLight(firstMs))`.
   - Expose a `get firstLight()` for tests, like `vacancy`.
   - A return (the last vacancy not awaiting) eases exactly as today.
7. **`worlds.ts`:** add `export interface FirstLight { front: number; lights: number }` and `WorldView.setFirstLight(f: FirstLight | null)`. It sets only two new uniforms, with no `apply()`, and is a no-op when nothing changed. `uFirstFront` is `mix(0.3, -1.15, f.front)` (module-local consts `FIRST_FRONT_FROM`, `FIRST_FRONT_TO`), and `uFirstLights` is `f.lights`, 0 when null. In the shader:
   - A `firstLights(n, sp, ndl, dusk, cl)` for the marks pass returns early when `uFirstLights <= 0` or `dusk < 0.02`. It draws `cells(sp * 7.0 + 40.0)` pinpoints like `settlementLights`, kept by `step(c.z, 0.5 * town)` with no `settled` mask, times `dusk * on * uFirstLights`, where `on = smoothstep(front − 0.12, front + 0.12, ndl)`. Composite it over `settlementLights`' result.
   - In the body pass, inside `if (uFirstLights > 0.0)`, add `LIGHTS * town * dusk * (on + 0.6 * crest) * uFirstLights * 0.5 * (1 − 0.7 cl)` before `lit *= uDim`. Here `crest = exp(−((ndl − front) / 0.08)²)`.
   - No new pass and no filter.
8. **Gallery:** extend the `seat-vacant` cycle in `seat.ts`, keeping its id: `awaiting work · dim` (vacant and awaiting) → `first piece arrives · first light` → `last piece leaves · dims` → `work returns · eased`. The loop back to step 1 replays first light. Update its title and note.
9. **Docs:**
   - 15 §10: a new row, and the existing fade row's meaning gains "a first arrival plays first light instead".
   - 13 §3 bullet and 09 bullet: one sentence each. First light plays once, on a seat's first arrival in the round. It isn't a rung, and the look at rest is unchanged.
   - 03: the grammar and the `aw=1` sentence.

## Files
- `src/renderer/src/theme/starChart/assets/seat.ts` 1–107 (all of it: `SeatView`, the samples)
- `src/renderer/src/chart/art/worlds.ts` 23–34 (`vacancyShares`), 66–80 (`WEATHER`, `knot`), 99–113 (uniforms), 414–435 (`settlementLights`), 437–475 (main, the marks pass), 500–530 (lighting, the `city` bloom, `uDim`), 541–692 (`WorldView`)
- `src/shared/scene/project/solar.ts` 52–80 (`boardMemo`), 250–258 (`f`, `x`), 334–345 (the seat loop, `vacant`). Imports at 17: add `PLACED_ROLES` from `../../engine/moves`
- `src/shared/contracts/view.ts` 248–253 (`vacant`; add `awaiting` after it)
- `src/shared/engine/stageCode.ts` 68–80 (encode), 82–131 (parse), 134 (`FIELDS`)
- `tests/unit/vacantWorld.test.ts` 1–194 (all); `tests/unit/stageCode.test.ts` 37–117
- `tests/drive/steps/c3-vacant.ts` 1–70 (all)
- Read only: `src/renderer/src/chart/scenes/GraphScene.ts` 740–752, 870–881 (`settle` runs after `setStage` on a seek or scene entry); `tests/unit/docTables.test.ts` 798–818 (how §10 rows are checked); `src/shared/engine/facts.ts` 116–135 (`heldSpans`), 535–568 (`seatReason`)
- Docs: `docs/15-reference.md` 1133–1134; `docs/13-game-design.md` 280–284; `docs/09-signal-ladder.md` 287–290; `docs/03-contracts.md` 866, 878
- Goldens that move: `tests/golden/__golden__/solar.scenes.json`, `tests/golden/__golden__/meridian.scenes.json`

## Excerpts
- Scope (27 B4, Decided): "When a vacant seat receives its first piece of the round, its lights come on in a short sweep (city lights flick on from the terminator over about 0.8 s, a 15 §10 value) rather than a plain ease. Later re-lightings keep today's ease. Reduced motion snaps. The look at the playhead is unchanged, so seek and play agree."
- INV-15 (02 §1): "Only forward play animates; seeks snap." INV-14: "Slots fixed over loaded history; seeks never reflow."
- R8 (13 §1): "Every motion means something." 09 (line 287): "A vacated homeworld is not a rung … it adds no colour or ornament and marks no piece."
- 03 (line 878, today): "`vc=1` (a seat that holds nothing at the playhead, 23 C3, `PieceState.vacant`) is written only when true, last; `vc=0` does not decode. Only `solar.ts` writes it, never `seatPiece`, so the round's previews stay lit." Amend it: `vc=1` is no longer last. Add: "`aw=1` (a vacant seat none of whose work has come yet this round, v1.4 B4, `PieceState.awaiting`) follows `vc=1` and is written only with it; `aw=0`, or `aw=1` without `vc=1`, does not decode." In the grammar line (866), add `[|aw=1]` after `[|vc=1]`.
- 15 §10 today: `| Vacated homeworld: fade (new, 23 C3) | 2000 ms down, 900 ms up | \`theme/starChart/assets/seat.ts\` VACANT_FADE_MS, VACANT_WAKE_MS | … |`. New row, directly after it: `| Vacated homeworld: first light (new, v1.4 B4) | 800 ms across, 600 ms to settle | \`theme/starChart/assets/seat.ts\` FIRST_LIGHT_MS, FIRST_LIGHT_FADE_MS | A seat's first arrival in the round (\`aw=1\` before it) lights its night side: pinpoints and a warm bloom come on behind a front from the terminator to the far limb over the first, then settle to the world's own lights over the second, while the dim lifts over the first. A later return eases as above. Wall time; a seek, scene entry and reduced motion land it at once (INV-15) |`. `docTables` requires each cited number (800, 600) to appear in Value.
- Project notes, the frame-budget lens: "Any per-object filter or extra pass needs a before-and-after perf run." This adds neither, only a branch on a uniform, so there's no perf run. Say so in the build record.
- Project notes, goldens: "update only the golden your item meant to move; check its diff line by line."

## Checks
- **Unit tests, new, in `vacantWorld.test.ts`** (`describe('first light (v1.4 B4)')`). The stub art gains `firstLights: (FirstLight|null)[]` and `setFirstLight`.
  1. Awaiting-vacant first stage, `tick(0)`, then holding. After `run(FIRST_LIGHT_MS / 2)`, recorded `front`s rise strictly within (0, 1) with `lights` 1, and `vacancy` is in (0, 1). After `run(FIRST_LIGHT_MS + FIRST_LIGHT_FADE_MS + 100)`: the last record is null, `vacancy` is 0, and power is 1.
  2. Then vacant (not awaiting), run out the fade, then holding again. No non-null `setFirstLight` call since the return, and `vacancy` is about 0.5 at `VACANT_WAKE_MS / 2`.
  3. Seek: a second view goes awaiting → holding, then `settle()` at once, and a third mid-sweep. Each ends with the same `(power, firstLight)` as the played view in test 1: `(1, null)`.
  4. Reduced motion: awaiting → holding, then `tick`. `vacancy` is 0 and there's no non-null first light.
  5. Vacant again mid-sweep cancels it: null at once, then it eases out as today.
  6. Pure `firstLight`: `front` is monotone from 0 to 1 by `FIRST_LIGHT_MS`; `lights` is 1, then falls to 0; null at the end.
- **Projection, extending existing tests:**
  - The agreement test (line 162): `!!n.piece?.awaiting` equals `!!n.piece?.vacant && seatReason(f, n.canonicalKey, t)?.kind !== 'held'`.
  - The Lantern Pod test: some seat's run reads awaiting, then holding, and `|aw=1` appears only with `|vc=1`.
  - If the agreement fails only because `boardFacts` drops a piece the raw facts keep, compare against `seatReason` on the board facts instead and record it.
- **`stageCode.test.ts`:**
  - `{vacant, awaiting}` encodes `…|vc=1|aw=1` and round-trips.
  - `awaiting` without `vacant` writes no `aw`.
  - Null cases: `…|aw=1` with no `vc`, `…|vc=1|aw=0`, `…|aw=1|vc=1`.
- **Goldens:** `npx vitest run tests/golden -u`, then `git diff --stat tests/golden`. Only `solar.scenes.json` and `meridian.scenes.json` may change, and every changed line must be a seat stage gaining `|aw=1` after `|vc=1`. Name both in the record.
- `npm test` (the gate: `docTables`, `assetStage`, `registries`, `homeworlds`, `solarSeek` among them).
- **E2E (locked):** `.claude/sluice/with-lock.sh npm run e2e:spec -- gallery-assets gallery-v1 solar`, then `.claude/sluice/with-lock.sh npm run e2e:keystone`.
- **Drive:** extend `c3-vacant.ts`.
  - `read()` also returns `awaiting`.
  - Record the first flip from awaiting to holding. Seek to the beat before it, then play at 1×. Poll every ~40 ms until Kit's seat isn't vacant, then shoot a burst of 8 stills as fast as screenshots allow. Each is clipped to about 160 px round `screenOf(<Kit's canonical key>)` with `page.screenshot({ clip, path })`, and named `first-light-<ms since the flip>`. Pause.
  - Note the tint series. Keep the existing C3 section.
  - Run it with `.claude/sluice/with-lock.sh npm run drive -- tests/drive/steps/c3-vacant.ts --paradigm solar --name b4`. Copy the stills from `test-results/drive/b4/` into `docs/progress/v1.4/work/B4/`.
  - The machine is busy, so the timing between stills will be uneven. Say which stills show the front mid-sweep.

## Out of scope
- The vacated look itself (`VACANT_SURFACE`, `VACANT_FADE_MS`, `VACANT_WAKE_MS`, `vacancyShares`) and the inspector's `seatReason` text.
- `seatPiece` and the round previews (`solarRound.ts`), which never write `vacant` or `awaiting`.
- `SOLAR_LAYOUT_VERSION`: no geometry changes, so no bump.
- A test hook for first light, 06 and `tests/README.md` (note any wish under `limitations`).
