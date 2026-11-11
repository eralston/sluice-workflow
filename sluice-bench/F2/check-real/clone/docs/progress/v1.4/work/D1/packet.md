# Packet D1: Formation labels don't collide
Risk: medium (shared label placement, but gated on a crew of two or more; the busy-pod check is automatic, the look is a still) · Score: blast 1, verify 1, design 1, acceptance 1, track 1 (sum 5)
Start commit: 21d35592e86a115bbbb728769a22e53646764474

**Read first: the scope doc's "Today" and "Touches" name the wrong code.** `placeFormation.ts` lays out a planet's
pieces (stories left, bugs right); no captain is in it. The captain "formation" is the **Power link** crew
(`theme/starChart/maneuvers/powerLink.ts` `formation()`: one line through the station, author nearest it, approvers
beyond, staggered ±0.6 ship across the line). Their plates are placed in `chart/labels.ts` `position()`, as upright
plates above or below the ship. So this packet changes `labels.ts` and `labelTiers.ts`, not `placeFormation.ts`
(left alone), and `holoLabel.ts` only if `holoCandidates` needs a change (it shouldn't).

**The planner's baseline probe** (`probe-baseline.ts`, drive; `baseline-quasar-photos-ui.png`): in 3 Quasar merges
and 2 Pulsar merges, no two acting plates overlapped. One Quasar merge (photos-ui) had 84 samples of an acting plate over
another captain's ship (disc radius max(7 px, world r · scale)). The layer already refuses plate-on-plate; what breaks is the
fallback at `labels.ts:~918` (an acting plate with no clear place may cross *bodies*), which a vertical stack of ships
triggers because above/below is blocked by the next ship. So the test must also assert the new side rule, or it passes before
the change.

## Acceptance
- A new case in `solar-dense.spec.ts`: through Pulsar's and Quasar's merges, sampled every 100 ms, no two plates of one formation intersect and no plate covers another member's ship.
- Stills of the gallery's Power link demo.

(Also the Decided line, which the work satisfies: "When a formation runs closer to vertical than horizontal, each member's plate goes beside its ship, on the side away from the formation's axis; in a horizontal formation, above or below. Plates in one formation never overlap each other or another member's ship.")

## Approach
1. **A formation is a crew of two or more.** `motion.crew` (`labels.ts:110`) maps captain pk to `{u, text, eventKey}`; every member of one
   maneuver shares `eventKey` (the arc holder included). Group by `eventKey`; a group of one is not a formation and places as today.
   Derived from positions, so nothing is plumbed from `powerLink.ts` and no other file changes.
2. **Pure rule in `labelTiers.ts`** (the pure-label-rules module, with a unit test): 
   `export function formationSides(members: { pk: string; x: number; y: number }[], viewW: number): Map<string, { axis: 'v' | 'h'; side: 'left' | 'right' | 'above' | 'below' | null }>`.
   Screen px. Fewer than two members returns an empty map. `axis` is `'v'` when the members' y extent is greater than their x extent
   (closer to vertical), else `'h'`. The axis line passes through the members' mean. For `'v'`, `side` is `right` if x > meanX + 2, `left` if
   x < meanX - 2, else (on the axis: the author) toward the view's middle (`right` if x < viewW / 2, else `left`). For `'h'`, `below` if
   y > meanY + 2, `above` if y < meanY - 2, else `null` (the plate's usual preference). Deterministic, no state.
3. **In `position()`**, before the loop: if `motion?.crew?.size`, build the members from `nodes` for each crew pk (screen centre via
   `camera.worldToScreen(node.world)`), call `formationSides`, keep the map (`formations`). Per label, when its pk is in it and it is acting
   (`actingNow`), use the formation's candidates (4). Not acting (picture tier), or not in the map: as today.
4. **Candidates** (the `all` build at `labels.ts:~872`, the `vertical` branch). Axis `'v'`: `[...holoCandidates({cx,cy,r,dirX: s, dirY: 0}, pw, ph), ...holoCandidates({... dirX: -s ...}, pw, ph), ...holoVerticalCandidates(..., prefer)]`
   with `s` = +1 for `right`, -1 for `left`, and `prefer` the plate's usual (`node.labelSide === 'above' ? 'above' : 'below'`). The side plates
   go first (they are the decision); upright ones are only a fallback. Axis `'h'`: the existing `holoVerticalCandidates(..., side ?? usual)`,
   with `prefer` = the formation's `side` (`above` or `below`) when it has one. `holoCandidates` and `holoFrame.place` already take a
   `left` or `right` side for any plate (`framePath` and `applyUnfurl` handle it); don't change them.
5. **Reset the held place when the mode changes.** `label.k` indexes the candidate list, whose order now depends on mode. Add
   `formed?: string` to `Label` (`'v:right'`, `'h:above'`, `''`); when it changes, set `label.k = undefined` and `label.openK = undefined`.
   Ships are parked while named (the existing "parked while named" test), so the mode is stable for a whole turn.
6. **Never cover a member's ship.** The fallback `if (i < 0 && (castOnly > 0 || actingNow)) i = all.findIndex(... !collides(p.rect, near))`
   (`labels.ts:~918`) keeps its meaning for a lone sortie. For a formation member, add the other crew members' ship rects (their `bodies`
   entries) to what it must clear: `!collides(p.rect, near) && !collides(p.rect, memberBodies)`. A member with no such place falls to
   `label.blocked` (its picture), as today. This trades a rare covered ship for a rare unnamed one; say so in the record.
7. **Docs.** `docs/13-game-design.md` §6.2, the Power link row (line ~687, "The formation is one line through the station…"): append one
   sentence: "Their named plates stand beside each ship, away from the line, when it runs closer to vertical, and above or below it when
   closer to horizontal, never over each other or another's ship (27 D1)." No constants change, so no `15-reference.md` row.
8. **Stills.** (a) The gallery's Power link demo cell (`attachment.merge`, in `gallery/maneuverDemos.ts`; it is a bare `GraphScene` with
   **no label layer**, so it can't show plates: say so in the record). Take it with a throwaway spec using `launchGallery`
   (`tests/e2e/launch.ts`), screenshot to this folder, delete the spec. (b) The real app: `npm run drive -- docs/progress/v1.4/work/D1/stills.ts --paradigm solar`
   (write it from `probe-baseline.ts`) shooting one vertical and one horizontal merge in Quasar and in Pulsar at the moment the most acting
   plates show. Name them in the record for the human gate.

## Files
- `src/renderer/src/chart/labels.ts` 629-735 (the start of `position()`, the `settle` helper), 776-800 (`crew`, `acting`), 856-945 (candidates and the pick), `Label` interface 38-60.
- `src/renderer/src/chart/labelTiers.ts` 55-70 (`raisedTier`, where `formationSides` goes).
- `src/renderer/src/chart/holo/holoLabel.ts` 64-124 (`holoCandidates`, `holoVerticalCandidates`; read only).
- `src/renderer/src/theme/starChart/maneuvers/powerLink.ts` 38-80 (`formation()`; read only: who stands where).
- `tests/e2e/solar-dense.spec.ts` (whole: the file's one serial app, and `toRegion`), `tests/unit/labelTiers.test.ts` 187-end.
- `docs/13-game-design.md` ~687. `docs/progress/v1.4/work/D1/probe-baseline.ts` (the scan and sample loop to reuse).

## Excerpts
- Standing rules: R3 (the outside matches the inside), R11 (an object arrives before its label): crew plates open at the act, as the ships park (`crewTimes`: open at the act, close a second past the work, ships leave once folded).
- `labels.ts:~918`, the fallback: `// A cast piece's plate (or an acting captain's, 22 B9) is brief, as a flash: failing a clear place, it may cross bodies, never another label.` then `if (i < 0 && (castOnly > 0 || actingNow)) i = all.findIndex((p) => inView(p.rect) && !collides(p.rect, near));`
- `labels.ts:~856`: `const vertical = label.holo?.spec.layout === 'vertical';` and the vertical branch `holoVerticalCandidates({ cx: c.x, cy: c.y, r }, pw, ph, node.labelSide === 'above' ? 'above' : 'below')`. The captain asset is `layout: 'vertical'` (`assets/agent.ts:72`).
- `13 §6.2` Power link: "The formation is one line through the station, so it stays in view (22 C11, 2026-10-16): horizontal when the station is near the top or bottom of the circle, vertical on the sides … approvers carry on along the line beyond, a little staggered off it."
- Project note, effect where it's meant: check on Halcyon's Pulsar and Quasar pods, not the default scene. Frame budget: a per-frame pass must stay cheap (here O(crew), only while a crew is named); no per-object filter.
- `solar.star` (`viewGraph().solar.star`) is the star's world position; a station is on a vertical line's side when `|dy / SQUASH| < |dx|` from it (`SQUASH` 0.7, `@shared/engine/solar/version`), else horizontal (`powerLink.ts` `horizontal`).

## Checks
- **New unit** in `tests/unit/labelTiers.test.ts`: `formationSides` returns {} for 0 or 1 members; a vertical stack with x staggered ±5 gives `v` and `left`/`right` alternating; an on-axis member goes toward the view's middle (both halves of `viewW`); a horizontal line gives `h` with `above`/`below` and `null` on the axis; equal extents are `h`.
- **New e2e** in `solar-dense.spec.ts`, its own `describe` with its own `launchApp({ STAR_CHART_PARADIGM: '' })` (the default Halcyon fixture, as `demo.spec.ts:21`) and `test.setTimeout(300_000)`; enter Halcyon Reach → Pod as `demo.spec.ts:85-90`. For each of Quasar Pod and Pulsar Pod: scan the beats for merges as `probe-baseline.ts` does (a facility's `mg=` count rises), noting each station's orientation from its world position against `solar.star`. Take the first merge of each orientation that shows a formation (at least two `.callout--captain.is-acting` plates at once; try up to four per orientation, fail if none). Play each (`setScheduleMs(start - 1)`, `setRate(1)`, `stepBeat`), and sample every 100 ms for 14 s. Per sample, over the shown acting plates (display not none, rects relative to `.chart-host`): (a) no two intersect (positive area); (b) none intersects the disc of another acting member's ship (centre from `displayed()`, radius `node.world.r * camera.scale`); (c) in a sample whose acting ships' y extent exceeds their x extent, count the plates whose `data-side` is `left` or `right`; in the other case `above` or `below`. Assert (a) and (b) always, and (c) at least 90% of plates over all samples (loosen only with evidence, and say so). Write it, and **run it against the unchanged code first**: it must fail (b) or (c); record that in the build record, so the test is shown to bite.
- Mapped specs (`tests/README.md`, labels row): `npm test` (`labelTiers`), `npm run e2e:spec -- solar solar-dense demo slice1 density gallery-v1`, then `npm run e2e:keystone`. The `solar-dense` "captain's turn" case (plates hold their sides, flips under 2%) must still pass: it guards the `label.k` reset.
- Perf: Pulsar's p95 is soft and red under C3's profile (known, 27 Decisions). Don't run a perf comparison unless `position()` shows in a profile; the new work is O(crew).
- Stills as (8). Look at them yourself first: no plate over a ship, none over another plate.

## Out of scope
- `placeFormation.ts` and the piece formations; `powerLink.ts` spacing or spots (`APPROVER_STEP`, `APPROVER_OUT`); the station's and the work's plates; plate sizes.
- Guests (jump-in reviewers) have no node, so no plate; unchanged.
- Making the gallery demo show plates (no label layer there).
- Perf work on Pulsar (C3). If the renderer crashes mid-run ("Target crashed" happened once on Pulsar in the visible drive window, not in the next run), re-run once and note it.
