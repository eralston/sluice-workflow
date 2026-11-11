# Packet F2: Summon on the fly
Risk: medium (the planner's crew timing for every summon on every pod, and the renderer's sortie; nothing persisted) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: 61e4958

## Acceptance
- A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors.
- A unit test: the summoner's pursue has no hold between its flight and its next place, and the station's act
  starts within 50 ms of the blip.
- 15 §7's row and `docTables.test.ts`. The schedule goldens are updated, and the packet names each change.
- The ledger shows the saving per pod.

How to read it (decided here):
- **The jump-in cell** is the `facility.enter` demo that `gallery-assets.spec.ts` already runs in full and reduced motion, with a console-error check.
- **The schedule goldens:** expected to move are `tests/golden/__golden__/director.json` (`estimateMs` on every pod with a summon; `levers`, `forms` and `climaxes` only if the director decides differently) and, only if the montage picks move, `tests/e2e/montageBeats.ts`. Expected unchanged: every `*.schedule.json`, `*.seek.json`, `*.scenes.json`, `*.highlights.json`, `solar.*`, `meridian.*` and `halcyon-meteor.*` (the v0 schedule and layouts plan no maneuvers). Any other move is a finding: explain it or stop.
- **The ledger's saving per pod:** a new F2 row set in the Built table, **in story time over all seven pods** (Meteor opted in with `all: true`), and the Summary's App s column moves. The E rows stay frozen recorded-time history.

## Approach
1. **The rule** (pace.ts). Add `PaceRule.passes?: true` beside `turn`, with the doc comment "a passing turn (27 F2): its crew flies through the act's spot without stopping; its plate opens at the act and rides with the ship for `NOTE_MIN_MS`, then it is released; no hold, no fly-back". Give `facility.enter` `passes: true` and `phases(['gather', 715], ['act', 1200], ['land', 600])`, 2515 ms. The tell goes: the flight and the blip already say where the station comes in. Why on the rule: the ledger and tests can then undo F2 by a rule edit, as E1's row does.
2. **The crew timing** (maneuvers.ts). `crewTimes(phases, passes = false)`. When passing: `openMs = claimMs(phases)`, `closeMs = openMs + NOTE_MIN_MS - CREW_FOLD_MS`, `leaveMs = openMs + NOTE_MIN_MS`. Pass `!!rule.passes` (or `!!d.rule.passes`) at the draft's `durMs` (378), in `turnVolleys` (566) and in `releaseOf` (308). Export `passesPlay(m: Pick<PlannedManeuver, 'id'>)`, which looks the rule up in PACE_RULES as `flyingPlay` does. `releaseOfPlay` takes `'id'` too and passes it on. The result: a summon lasts 2515 ms (it was 4835 with the held turn). Its summoner's next turn starts no sooner than the plate's end (`crewBusy` and `nearStartMs`, unchanged). Attention is held over [715, 2515), exactly the plate's life (R14).
3. **No park.** In `nearWaits`, skip a passing play as the `m` (`if (passesPlay(m)) continue`). Its ship never parks. A next sortie takes the ship over from wherever it's drawn, as `runner.move` already does. A passing play can still be another play's "next".
4. **The interpreter.** The crew plate window uses `crewTimes(m.phases, passesPlay(m))` (interpreter.ts 618). Nothing else changes there.
5. **The pass** (fx/commands.ts and movers.ts). Add `PursueArgs.through?: boolean` and pass it to `Sortie` as a new last constructor parameter, `through = false`.
   - **In `through`:** `holdS` and `waitS` are ignored, and the sortie lives `outS + backS`.
   - **The legs**, each a cubic Hermite in time, `H(a, ta, b, tb, u) = (2u³−3u²+1)a + (u³−2u²+u)ta + (−2u³+3u²)b + (u³−u²)tb`. Leg 1, `u = t/outS`: from `start` (velocity 0) to the live `to()`, arriving with velocity V (so `tb = V·outS`). Leg 2, `u = (t−outS)/backS`: from the pass point, stored once like `parked`, with `ta = V·backS`, to the live `goalOf(pk) ?? start`, arriving at rest.
   - **V** is fixed once, at the first `update`, from P0 = start, P1 = to(), P2 = goalOf. The direction d̂ is `unit(P2−P0)` if `|P2−P0| ≥ 0.25·max(L1, L2)`, else `unit(perp(P1−P0))` with `perp(x, y) = (−y, x)`: a teardrop turn when the ship goes back where it came from. The speed is `|V| = max(1e-3, min(1.5·L1/outS, 1.5·L2/backS))`.
   - **Look:** face along the motion (the sign of dx each frame), with the streak on leg 1 as today. With `jump` (a guest new this beat), leg 1 stays the jump-in and leg 2 starts from rest (V = 0), with the flash cleared and the fade set to 1 at its start.
   - **`crewOpen(foldS)` in `through`:** with `h = t − outS`, 0 outside [0, backS], else `clamp(min(h/foldS, (backS−h)/foldS), 0, 1)`. The plate opens at the pass and rides along.
6. **The choreography** (stationJumpIn.ts).
   - **Tell:** delete it (commands.test checks that a choreography plays only the rule's phases).
   - **Gather:** `cmd.pursue({ pk, durS: gather/1000, holdS: 0, backS: NOTE_MIN_MS/1000, through: true, to: spot, look: f.at, wake: 4 })`. The guest's `durS` becomes `(gather + NOTE_MIN_MS)/1000`. Keep the fold ring, which is a repeat.
   - **Act:** the **call blip** comes first, `cmd.ring({ at: a ? a.at : spot, r: 1.4·s, r1: 3.2·s, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })`, with `s = drawnR(a)`, or `GEOMETRY.shipR` for a guest. That is the station's own act ring (0.7 → 1.6 radii, `HERO_GLOW`) at twice the radius ratio, since a ship is small. It is not a repeat: it is the call.
   - **The spot:** factor it into a local `spotOf(c)` and use it in both the gather and the act (for the guest). Rewrite the header comment for F2.
7. **Reduced motion** needs nothing new. `pursue` is `snap`, so the ship stays put. The blip anchors to the ship's live point, so it plays at the ship's place, and the station's act plays as today.
8. **The ledger** (scripts).
   - **`beforeF2`:** `pacing-ledger.ts` exports `beforeF2(rules)`. It returns `facility.enter` to tell 300, gather 715, act 1200, land 600, and drops `passes` by destructuring (`const { passes: _, ...r0 } = r`), not by setting it to `undefined`.
   - **`pacing-built.ts`:** `BuiltItem` gains `passes?: true` and `story?: true`. `buildBuilt` always passes explicit `rules`, `item.passes ? rules : beforeF2(rules)`; explicit PACE_RULES schedules exactly as none (pacingCandidates test 1). `story` items iterate `resolvePods({ story: true, all: true })`. Append `{ id: 'F2', name: 'Summon on the fly (story time, all seven pods)', before: beforeF2, directs, sweeps, rises, late, passes, story, estimateMs: {} }`. C2 never modelled it, so its estimate reads 0.
   - **The words:** `renderBuilt`'s intro says the E rows are recorded time and the F rows story time. `renderMarkdown`'s Summary sentence (pacing-ledger.ts 336) says "the Built section's E rows".
   - **`pacing-candidates.ts`:** `NO_SWEEP = beforeF2(PACE_RULES.filter(…))`, so C2's committed numbers don't move.
9. **The docs**, in the same change, with the text under Excerpts: 15 §7, §8, §9 and §10; 13 §6 (and line 570, "Its summoner's flight, then the fold" → "Its summoner's pass and call, then the fold"); 05 M-13, P-7 and K-4. **03 is normative:** add its four lines beside 1490 and 1498, and say so in the build record.

## Files
- `src/shared/engine/pace.ts` 44–90 (`PaceRule`), 500–515 (`facility.enter`)
- `src/shared/engine/maneuvers.ts` 42 (`NOTE_MIN_MS`), 50–92 (`crewTimes`, `flies`), 300–320 (`releaseOf`, `crewBusy`), 370–385, 560–568, 798–830 (`releaseOfPlay`, `flyingPlay`, `nearWaits`)
- `src/renderer/src/chart/fx/commands.ts` 44–60 (`PursueArgs`), 111–120, 357–370 (`pursue`)
- `src/renderer/src/chart/fx/movers.ts` 238–344 (`Sortie`)
- `src/renderer/src/chart/fx/v1/interpreter.ts` 278–285 (`crew()`), 524–528, 606–625, 690–702
- `src/renderer/src/theme/starChart/maneuvers/stationJumpIn.ts` (all)
- `scripts/pacing-ledger.ts` 100–115, 206–222, 330–340; `scripts/pacing-built.ts` (all); `scripts/pacing-candidates.ts` 295–297, 336–340
- Tests: `tests/unit/commands.test.ts` 1–40, 478–498; `tests/unit/maneuvers.test.ts` 60–70 (`board`), 595–610; `tests/unit/pacingBuilt.test.ts` 1–15, 175–185; `tests/unit/sweep.test.ts` 163–180; `tests/golden/director.test.ts`; `tests/e2e/montageBeats.ts`; `tests/e2e/gallery-assets.spec.ts` 44–75
- Docs: `docs/15-reference.md` 818, 956–963, 1123, 1256–1259; `docs/13-game-design.md` 570, 685; `docs/05-playback.md` 716, 763, 812; `docs/03-contracts.md` 1100–1105, 1488–1500

## Excerpts
- **Decided (27 F2):** "The summoner's path passes through the spot without stopping. As it passes, it gives **one call blip**, and the station jumps in at that instant, in the same hue and with the same ring shape, so the two read as one cause and effect (R8, R10). The hold and the fly-back go. The ship carries on to its next place: its next sortie if one is waiting (E4's P4), else its rest beside its work (13 §4). The summoner is named from the blip (E2: plates from the act) and its plate rides with the ship for `NOTE_MIN_MS`. The rule's phases shrink to the flight plus the arrival (a 15 §7 row). Under reduced motion the ship doesn't fly: the blip and the arrival play at its place."
- **"Its next sortie", as read here:** the ship glides toward its rest over `NOTE_MIN_MS`, plate open. A next sortie of the same captain sets off no sooner than the plate's end (P-7) and takes the ship over from where it's drawn. P4's park (`waitS`) is a stop, so it never applies. Speed through a hand-off between two maneuvers is F3's (one mover for a chain).
- **13 §6 row 685, movement column, new:** "The summoner (the PR's author) flies 0.7 s through a spot 1.9 station radii out on its own side and, without stopping, glides on to its rest over 1.8 s (`NOTE_MIN_MS`), named from its call (27 F2). With no ship here, it jumps in there as a guest, calls, and jumps out. Under reduced motion it doesn't fly: the call and the arrival play where it is." The cues column drops **Tell**, and its **Act** gains "as the summoner passes it gives one **call blip**, an at-rest-blue ring at the ship, and at that instant space folds … (R8, R10)".
- **05 M-13** (716), new: "Who made it flies through the spot without stopping and calls it in with one blip; the station jumps in at the blip, in the same hue and ring (27 F2)". Labels: "The summoner named from the blip (*Opened it*), its plate riding with the ship for `NOTE_MIN_MS`". **P-7** (763) gains: "A passing turn (`PaceRule.passes`, 27 F2) never parks: its plate opens at the act and rides with the ship for `NOTE_MIN_MS`, then it is released; the stay-near wait doesn't apply." **K-4** (812) gains: "A passing turn names its ship in flight, from its call."
- **15 §7** (818): Length 2515; What you see: "The author flies through where it comes in and, without stopping, glides on to its rest, named; as it passes it gives one call blip and the station jumps in at that instant, in the same At-rest blue ring; an At-rest blue flare (27 F2)".
- **15 §8 audit:** the tell row's verdict becomes `cut`, Beat ms 300, with "`pursue` the summoner's flight and the call blip (27 F2)" as the cue that carries it. The gather pursue row says "flies through the spot". Add before the act jump row: `| Station jump-in | act | \`ring\` call blip at the summoner, in the arrival's hue and shape | Who calls it in, at the instant it comes (27 F2) | — | 0 | keep |`. The `pursue` command's Looks like gains "or a pass through a spot and on to its rest (27 F2)". §9 1123: "The author flies past and calls it; the station folds in at the call; then a tender launches".
- **15 §10:** the `NOTE_MIN_MS` row (1256) gains "; a passing turn's plate (27 F2) rides with its ship this long from the call". The `CREW_FOLD_MS` row (1259): "shut in flight, except a passing turn's (27 F2), which opens at the pass".
- **03, new lines** (normative; beside 1490 and 1498):
  ```
  // 27 F2: a summon on the fly
  PaceRule.passes?: true                  // a passing turn: its crew flies through the act's spot; its plate from the act for NOTE_MIN_MS, released then; no stay-near (facility.enter)
  crewTimes(phases, passes = false)       // passing: open = claimMs, close = open + NOTE_MIN_MS − CREW_FOLD_MS, leave = open + NOTE_MIN_MS
  passesPlay(m): boolean                  // the planned play's rule passes (PACE_RULES)
  PursueArgs.through?: boolean            // a sortie through `to` without stopping (Hermite in time), then on to its rest over backS; holdS and waitS ignored
  ```
- **INV-15** "Only forward play animates; seeks snap". **INV-20** "Never hue alone; … reduced motion". **R14** attention is budgeted.
- **Project notes:** "Goldens: update only the golden your item meant to move; check its diff line by line." "The effect where it's meant: check the change on the busy fixtures it's for": here Meteor's opening (36 summons in one beat) and Pulsar.
- **Ledger (27 Decisions, 2026-11-06):** "keep the frozen E1–E10 Built rows as history and add a story-time column (what the app plays), which the targets and the final check read from now on". F1: "F2 to F4 opt in with `all: true`".

## Checks
New and changed tests:
- **`commands.test.ts`**, a describe beside the existing jump-in test, 'Summon on the fly (27 F2)':
  - (a) The gather's pursue has `through: true`, `holdS: 0`, no `waitS`, `backS = NOTE_MIN_MS/1000` and `durS·1000 = phaseMs(m, 'gather')`. And `|gather.atMs + durS·1000 − act.atMs| ≤ 50`.
  - (b) The act's calls hold the blip ring at the agent's `at`, in `HERO_GLOW`, with delay 0 and `r1/r` equal to the station ring's, beside `act(fac, 'jump')` at delay 0.
  - (c) There is no `tell` handler.
  - (d) `Sortie` in `through`, loaded from `chart/fx/movers.ts` with a stub scene (`own`, `placeAt` recording, `faceView`, `goalOf`, `currentScale` → 1, `release`, `restoreFacing`, `facingOf`) and wake 0, stepped at 1/60 s. It is at the spot at `t = outS` within 1e-6·L. Every step moves (no two equal successive points) until it ends at the goal. `update` returns false after `outS + backS`. `crewOpen` is 0 before the pass, 1 mid-glide and 0 at the end. Run it for a goal away from the start and for goal = start (the teardrop).
- **`maneuvers.test.ts`:**
  - A lone summon: `enter.durationMs === spanMs(enter.phases) === 2515`.
  - `crewTimes(enter.phases, true)` equals `{ openMs: 715, closeMs: 1995, leaveMs: 2515 }`.
  - With an Underway by the same author in the same instant, listed after the attach, the carve starts at or after `enter.afterMs + 2515`. Use `toBeGreaterThanOrEqual`: the tender's opening also holds the author, so the exact start is not the plate's end.
  - `nearWaits` has no entry for the enter, and `open.afterMs === enter.durationMs` still holds.
- **`pacingBuilt.test.ts`:**
  - Add `&& !x.id.startsWith('F')` to the BEFORE_VOLLEYS filter.
  - A new test: F2 has 7 rows, Meteor among them, and Comet, Nova, Convoy Planning and Harbor (no levers) each save more than 0. The speed-lever pods are reported, not asserted.
- **`sweep.test.ts`** 172: `scheduleOf(…, { risingTempo: false, rules: beforeF2([...PACE_RULES]) })`, still 61 845 "as E7 measured it".
- **If a pinned list or count moves** (`MONTAGE_BEATS`, director.test, rising, volleys, sweep): re-derive it by the method its comment names. Update it only if the cause traces to the shorter summons, and record old → new and why. The E rows of `pacing-built.json` and all of `pacing-candidates.json` must not move. If they do, stop and report.

Run:
- `npm run pacing -- --candidates`. Expect `pacing-ledger.{md,json}` to change, `pacing-built.json` to gain only the 7 F2 rows (check `git diff`: additions only), and `pacing-candidates.json` to show no diff. Record each pod's App s before and after (the Summary) in the build record, and Comet's against its 50.3 s yardstick.
- `npx vitest run tests/golden -u`, then `git diff --stat tests/golden`, and name each changed file and why (see How to read it).
- `npm test`, `npm run -s typecheck`, `npm run -s lint`.
- `npm run e2e:spec -- gallery-assets solar solar-play solar-dense montage-names demo`, then `npm run e2e:keystone`.
- Stills for the final check: `npm run drive -- tests/drive/steps/solar-station.ts --paradigm solar` (Harbor's first station). Copy three frames (approaching, the blip and arrival, the glide on with the plate) into `docs/progress/v1.4/work/F2/` **before** any e2e run, which wipes `test-results/`.

## Out of scope
- Chains (F3): `facility.run`, `chainOrder`, one mover through many stations, speed through a hand-off between two maneuvers.
- The way a new `Sortie` sets off from rest; `attachment.open`'s `waitsFor` timing; the stay-near rule for other rules.
- The gallery harness (`maneuverDemos.ts`: facility.enter has no short form, so line 338 never sees it).
- Meteor's VC-3 at 1024×640 (F5). The drive step's stale comment (solar-station.ts says "broadcasts its beacon"): note it under limitations.
