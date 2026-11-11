# Slice V1-W2-T7: Achievements

Built 2026-10-10, following [17 W2-T7](../17-v1-phases.md#w2-t7-achievements),
[14 §2.9](../14-architecture.md#29-labels-settings-achievements) and
[18 §5](../18-achievements.md#5-open-questions) (recommendations A1 to A5). It's additive only:
nothing the app builds imports the new module yet (W3-T1 wires it), so v0 behaviour and every
existing golden are unchanged.

## 1. What was built
- **`src/shared/engine/achievements.ts`**
  - `achievementsFor(f, viewer, pack, opts?)` returns the viewer's awards for one region's round,
    in the order they were earned (ties go in rule order). With no viewer it returns `[]`, and it
    never computes anyone else's.
    - `opts.tz` is the team's time zone, used for Swift passage's working hours. The default is
      UTC. The app should pass the same `TZ` that `playback.ts` gives the schedule.
    - `opts.terms` is the `Terminology` used to write each award's `reason`. The default is
      `terminology(pack, 'chart')` with no theme words, so reasons come out in engine words
      ("objectives", "Accomplished"). The renderer passes the theme's chart register.
  - `ACHIEVEMENT_RULES` (the eight rules of 18 §5 A1, in its order) and `achievementRule(id)`.
  - **The ledger** is read once per `RoundFacts` and memoised in a `WeakMap`.
    - It holds every dated arrival at Accomplished, each piece's first dated arrival at Underway,
      and every merge (an attachment settling at Accomplished).
    - `RoundFacts` has no event times, so each arrival in a piece's `signalAt` series is paired
      with the `appear` or `climb` move that caused it. Both lists are in event order, so they're
      paired from the end. A series entry with no move to pair with comes from a state seeded
      from the current data, so it's undated and earns nothing (INV-02).
    - Observations never enter the facts, so they never earn anything either.
  - **The rules**, in engine terms. "Held" means the piece is in the region and on the viewer's
    seat at that instant (`memberAt` and `seatAtTime` from `facts.ts`).

    | id | shape | Earned when |
    |---|---|---|
    | `clear-skies` | `sun` | Every objective and threat the seat holds at the round's last instant is Accomplished, with at least one dated landing in the round. It's earned at the last of those landings. Off pieces are ignored; an unknown state still counts against it |
    | `hat-trick-landings` | `triple-chevron` | Three different objectives land while held, in the round. It's earned at the third |
    | `hat-trick-defences` | `triple-shield` | The same, for threats |
    | `hat-trick-reviews` | `triple-star` | The viewer is among the approvers at completion of three merges in the round, and isn't the author of any of them |
    | `swift-passage` | `arrow` | A held objective lands within `swiftDays × dayHours` weighted hours (SDLC: 36) of its first dated Underway. Hours are weighted by `weightedHours` (05 §3) in `opts.tz` |
    | `steady-hands` | `level` | At no instant of the round does the seat hold more than `wipK` objectives and threats at Underway, and at least one lands. It's earned at the last landing. Steps aren't counted |
    | `clean-landing` | `ring` | A held objective lands while every step bound to it then (Off steps aside, at least one) is already Accomplished. The same instant counts |
    | `wingman` | `wings` | The viewer helps a piece that another seat holds at that moment, and the piece lands then or later in the round. Helping means bringing one of its steps to Accomplished as the actor, or authoring or approving a merged attachment linked to it. It's earned at the landing |
- **`fixtures/scenarios/v1/achievementCases.ts`** (test-only, so not in `v1Scenarios`)
  - Each case is a one-week sprint, *Quillmoor · Lark Pod · Sprint 7*. The people are Vesna (the
    viewer), Teodor and Ilse. Work items are 23200–23499 and PRs 23500+.
  - There's one `AchievementCase` per rule: `{ id, edge, earn, near }`. The near miss tells the
    same story with one fact changed, and `edge` says which.
- **`tests/unit/achievements.test.ts`** (36 tests)
  - For each rule: the earn case earns it, and the near miss doesn't. Each award names a dated
    event in the round (its `eventKey` and `atUtc` match a real event) and pieces from the region.
  - No viewer gives `[]`, and a person who holds nothing earns nothing.
  - Hat tricks are placed at the third arrival.
  - The pack's thresholds are the ones read, for both `swiftDays` and `wipK`.
  - The time zone matters: the same span earns Swift passage in Pacific time but not in UTC.
  - An idle round earns no Steady hands.
  - Wingman is earned through an approved merge.
  - An undated PR link and an undated parent link earn nothing, and the awards are equal with and
    without the observations.
  - It's deterministic: the same facts and a rebuilt bundle give the same awards.
  - Reasons use the terminology they're given.
  - Awards are ordered by when they were earned.
- **`tests/golden/v1-awards.test.ts`** writes `__golden__/v1-awards.json`.
  - It holds every award in `pod-sprint`'s Sprint 13, for every person as viewer. The regions are
    Harbor Pod, Lantern Pod and the whole round.
  - It also lists the ids each achievement case earns, for its earn and its near miss.
  - Wren earns 7 in Harbor Pod: every rule except Hat trick: defences, since she holds no threats.
    The pieces are pinned.

## 2. Contracts changed
- **No shared type file was edited.** `engine/types.ts` keeps 14's `AchievementRule`.
  `achievements.ts` adds three things beside it:
  - `AwardRule extends AchievementRule`, whose `earn` takes an optional fourth argument
    `ctx?: AwardContext`, which is `{ tz, t: Terminology }`.
  - `AchievementOptions`.
  - The fourth, optional argument to `achievementsFor`.
  - A rule called through 14's three-argument form uses UTC and engine words.
- **Departures from 14 §2.9, for W4-T3 to fold into 03 §5d and 14 §2.9:**
  - `achievementsFor(f, viewer, pack, { tz?, terms? })`.
  - The rule ids and shapes in the table above. Shapes are insignia ids for the theme.
  - The readings of 18's candidates as built:
    - Clear skies ignores Off pieces but not unknown ones.
    - Hat trick: reviews excludes the viewer's own attachments.
    - Steady hands counts objectives and threats only, and Underway means rung `underway` only.
    - Swift passage needs a dated first Underway.
    - Wingman helps through steps or merged attachments only, never by moving the other seat's
      piece directly, and needs the landing at or after the help.
- 02 is unchanged: no invariant moved. 18 is unchanged (not this task's file). Its A1 to A5
  recommendations are what's built, except A5's opt-out switch, which lives in Settings (W2-T6 and
  W3-T1).

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean. The new engine file passes the import fence: it imports contracts,
    `playback/schedule` (for `weightedHours`) and engine modules only.
  - `npm test`: 43 files, 652 of 654 pass. The 2 failures are in `tests/unit/solarChain.test.ts`
    ("…the v0 pod system as fallback" and "with its fallback, a region draws as the v0 pod
    system…"). They come from W2-T1 dropping `SolarSource.fallback`, which is in flight, and
    they're not this task's.
- **Goldens unchanged**: `git status tests/golden` shows only untracked files. Mine are
  `v1-awards.test.ts` and `__golden__/v1-awards.json`. Also there: W1-T2's `v1-ingest.test.ts` and
  W2-T1's `solar.test.ts`, `solar.plan.json` and `solar.scenes.json`.
- **One earn and one near miss per rule**: pass, all 8 rules.
- **No viewer gives `[]`**: pass, in the unit test and for all three `pod-sprint` regions.
- **Undated observations ignored**: pass.
- **`pod-sprint`'s viewer earns at least five**: pass. Wren earns 7 in Harbor Pod.
- **Literal fence**: passes, and covers `achievements.ts` (no SDLC type or state literal, no
  theme word).
- **Keystone and e2e**: not run. They're not among this task's checks, and nothing the app builds
  imports the module yet.

## 4. Screenshots
None. This task has no human gate. The insignia art and their review in the gallery are W3-T1 and
W4-T1.

## 5. Known limitations and open questions
- **Event times are recovered, not read.** `RoundFacts` carries no event times, so the ledger
  pairs signal-series entries with moves from the end. Two cases could mis-pair, though neither
  happens in the fixtures:
  - two climbs of one piece at the same millisecond, which the fold merges into one entry;
  - a piece with both seeded and dated history.

  **Follow-up (facts owner, W2-T1 or later):** add `RoundFacts.at: ReadonlyMap<eventKey, UtcMs>`.
  The pairing in `arrivalsAt` then becomes a lookup.
- **The order of `f.moves` is relied on.** The pairing uses the facts' documented event order
  (the Map is built from `h.events`). If facts ever builds that Map differently, the ledger needs
  the times above.
- **Step binding at an instant is read from step membership.** `PieceFacts.parent` is the final
  parent, not a series. Clean landing and Wingman treat a step as bound to its piece at *t* when
  the step is a member at *t*. Since a step is a member only while bound to a member piece, this
  holds unless a step moves between two pieces of the same region.
- **Clear skies falls at the last landing.** If the seat was cleared instead by an open piece
  leaving the region, or by a reseat away, the award still falls at the last landing, not at
  that move.
- **For W3-T1:**
  - call `achievementsFor(roundFacts(h, ref, pack), viewer, pack, { tz: TZ, terms })` only when
    Settings' achievements switch is on and a viewer is chosen;
  - pass the theme's chart terminology, so reasons use the chart register;
  - map `shape` to the insignia art.
- **Golden scope.** The golden computes every person's awards so that rule changes are easy to
  review. The app must still compute only the viewer's (18 §1).
- **Open (HG-V2):** should Wingman also count the viewer closing a step they hold on someone
  else's piece? It does today (Pell earns it on Wren's Story by closing his own Task). That
  matches "you closed a Task on someone else's Story", but it could be read more narrowly.

## Wave gate (W2)
Run on 2026-10-10, after W2-T1 through W2-T7 had all landed.
- **Base**: `npm run typecheck` (node, web and e2e) and `npm run lint` are clean. The 20 TS2322
  errors in `commands.test.ts` and the lint errors from the stray `.w2t3-cdp.mjs` were already gone
  when the gate ran. `npm test` passes 48 files and 716 tests.
- **Keystone**: inside the build lock, `electron-vite build` followed by `playwright test --grep
  @keystone` passes 38 of 38. It was run again after the gate's fixes and still passed, along with
  `solar.spec.ts` (2 of 2).
- **Full e2e**: the first `npm run e2e` failed one test, `board.spec.ts` "a state change travels
  along the ring". It passes when run alone (4 of 4). Under 8-worker load it fails about 1 run in 8,
  in three ways: a stale first sample from the probe when the seek hasn't drawn within the spec's
  fixed 200 ms; no movement sampled; or k ≈ 0.96–0.97 against the 0.97 bound. The same spec, built
  from a `git archive HEAD` copy (no W2 code), fails 6 of 32 under the same load. So the flake is
  older than this wave and isn't caused by it. On the second run, after the fixes, one test
  (`activity.spec.ts` "failures") timed out at 60 s during a slow 6.5-minute run. It then passed
  3 of 3 alone. The last runs were green: parallel 116 of 116, and alone 21 of 21.
- **Goldens**: `git status tests/golden` shows only new files (`solar.*`, `v1-awards.*`,
  `v1-ingest.test.ts`). No v0 golden is modified.
- **Fixes at the gate** (small, from the task reports; v0 paths untouched):
  - `scenes/solarGuides.ts`: the halo's crisp 1 px edge now draws the circle again before its
    stroke. In Pixi v8 a second chained stroke drew nothing.
  - `theme/starChart/assets/adapt.ts`: `act(name)` looks the act up with `Object.hasOwn`, so names
    like `toString` or `__proto__` do nothing instead of calling or throwing.
  - `scenes/GraphScene.ts`: `orientAsset` calls `setFacing` only when the heading's sign changes,
    or for a fresh entry. That stops the per-apply `face()` rebuilds in the hive and dreadnought art.
    A cluster member's hit radius is clamped at 0 or more.
- **Carried forward** (minor, none blocking):
  - **`board.spec.ts` flake (older than this wave).** Replace the fixed 200 ms wait after the seek
    with a poll until the body is back at `from`, and loosen or trim the k bound at the start of
    the path.
  - **Duplicate readers.** `slots.ts` still has its own `seatAtTime`/`memberAt`, so `planSolar`
    and `slotAt` can disagree. A member before its first `seatAtTime` entry has no slot, and a
    seat visited only while Off still opens one through `visitsOf`. Fix in `boardFacts`, or have
    `slots.ts` use `facts.ts` (W2-T1).
  - **Ghosts and unlinked facilities.** Off ghosts are fed to `projectCaptains`, and attachments
    linked only to dropped pieces still make facilities (W3-T1).
  - **Fallback ship placement.** It ignores `activityAnchors`, and its r = 56 duplicates the
    constant in `traffic.ts`.
  - **Dead `fallback` code.** Drop `SolarSource.fallback` and the fallback branch in
    `projectScene.ts` (W4-T3).
  - **Lighting of new asset entries.** They are lit before `settle()` places their root, so a body
    around a star at the origin is lit flat until the next apply (GraphScene, W3-T1).
  - **Floors.** The halos and `boundsOf` ignore `AssetDef.floorPx`, and the formation hit cap
    applies to the nearest neighbour of any kind. Both need the W4-T2 density check.
  - **Station acts.** They aren't phase-aligned to `pulseTime`. Seek paths must call `act('rest')`
    on every asset view (W2-T4/W3-T1).
  - **Seat claims.** A claimed land more than 8 s after spawn loses to GraphScene's age failsafe.
  - **Mega-labels.**
    - A pointerup over a row selects it without a matching pointerdown.
    - The lit row goes stale when the plate re-renders.
    - Placement has no fallback, and the plate has no max-height.
    - The Off mark colour doesn't match the ladder's.
    - `ROW_BUDGET` is defined twice.
    - `resetOverlays` drops the hover ring.
    - `tierFor` has no unit test.
  - **Settings.**
    - There is no way back to Solar from a v0 view (W3-T1, App.tsx).
    - The Purge copy doesn't say that settings survive.
    - The comment on hosted `ConnectBody` state is wrong.
    - `Read.tsx` falls back to the SDLC pack for an unknown pack.
    - `persisted=false` sticks after a single failed save.
    - `aria-controls` points at panels that aren't rendered.
    - The Purge test doesn't call the real purge.
  - **Achievements.**
    - Clean landing filters out unknown-state steps.
    - The holder is read at the landing instant, after a reseat in the same millisecond.
    - Clear skies' `earnedAt` comes before a later clearing move.
    - `arrivalsAt` pairs event times by counting back; it needs `RoundFacts.at`.
    - A step's final parent is used rather than its parent at the time.
    - `ENGINE_CTX`'s pack cast.
  - **Docs.** D12 says 24 px but the code uses 25 px, and 03 §5d lacks the new renderer seams
    (W4-T3).
