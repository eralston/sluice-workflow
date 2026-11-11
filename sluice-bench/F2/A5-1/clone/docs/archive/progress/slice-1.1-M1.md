# Slice 1.1-M1: Station standby (lifecycle option A)

Built 2026-10-14 from [19 §3](../19-v1.1.md#3-items) item M1 and Q9: try option A, standby, first.
B (jump away) and C (shrink) are not built. It builds on the v1.1 items already in the tree (L1–L8,
N1, P1, P2, S1, S2) and reverts none of their work. **Waiting on HG-M1.**

## 1. What was built
- **The rule is the projection's** (`shared/scene/project/solar.ts`, pure, INV-12).
  - A station's *recency* is 1 at its PRs' last event here by the playhead, halving every day of
    history, the same measure as a piece's `activity` but unquantised. A PR event is any change of an
    attachment's signal: opened, merged or abandoned. An approval has no event of its own; it comes
    with the merge.
  - It stands by when none of its PRs is open and its recency is under `STANDBY_BELOW` (0.25), that
    is, after two calendar days.
  - The projection sets `piece.standby` (in the stage string as `|sb=1`) and `flags.standby`.
    `ViewNode.activity` is now set for stations too: the same value in quarters, as a piece's.
  - Its place, size, slots and compound don't change (INV-14, INV-19).
- **The look comes from the adapter** (`theme/starChart/assets/standby.ts`, `StationView`, a subclass
  of `AdaptedView`). `chart/art/dreadnoughts.ts` is untouched: the art has no power hook, so the
  adapter dims it from outside.
  - The art's `root` and `marks` take a grey tint, `STANDBY_HULL` (0.7). Every additive layer under
    the root takes a deeper one, `STANDBY_LIGHTS` (0.3 of that). Those layers are the drives,
    windows, bays, reactor, beacons, shield and seams. The art never tints them itself.
  - The art's clock (`AdaptedView.artTime`, a new protected hook) slows to a stop as the station
    dims. That stills the heave, sway and roll, the drives' swell and the window shimmer, and they
    pick up where they stopped, with no jump. Beacons blink on the pulse clock, so they keep blinking,
    dimmed.
  - It powers down over `STANDBY_FADE_MS` (2400 ms) and wakes over `STANDBY_WAKE_MS` (900 ms), both
    on wall time.
  - A new view takes its first stage's state at once.
- **When it lands.** Standby is part of the stage, so it lands like any look. On a beat that only
  finds the station quiet, it lands at once and the view eases down. On the beat of its next PR, the
  Shuttle tender claims it: it lands at that maneuver's land, after the tell, and the lights come up.
- **Seeks snap (INV-15).** `AssetView.settle?()` is a new seam. `GraphScene` calls it after a stage
  it applies on a snap (seek, scene entry, reduced motion: `stageTo`) and in `landAllStages`.
  Reduced motion also lands it in the view.
- **The plate drops to T3** (`chart/labels.ts` `restingTier`, `HoloFrame.setTier`). Lifting still
  works as before: pointed at, it lifts and expands into its PRs.
- **Tenders are already docked.** A tender is an open PR, so a station on standby has none. Nothing
  more was needed.
- **Gallery** (the registry's facility cells, `assets/facility.ts` samples):
  - each seeded cell's cycle ends with *none open*, then *standby*, so the live gallery shows the
    fade, and the wake as the cycle comes round;
  - a new cell, *facility · on standby (19 M1)*, shows the same station awake, then on standby,
    settled, for frozen review copies.
- **Test hook** `viewTints(pks)`: each view's root tint as a 0..1 grey.
- **Drive** `tests/drive/steps/v11-M1.ts`, listed in tests/README.md.

## 2. Contracts changed (with their doc edits)
- **Shared:**
  - `PieceState.standby?: boolean` (stage field `sb=1`, written only when true, last; `sb=0` and a
    bare `sb` don't decode);
  - `ViewNode.flags.standby?: boolean`;
  - `ViewNode.activity` now also on facilities;
  - `STANDBY_BELOW` exported from `scene/project/solar.ts`.
- **Renderer:**
  - `AssetView.settle?()`, and `NodeViewLike.settle?()` in `GraphScene`;
  - `AdaptedView.artTime(seconds)` (protected);
  - `StationView`;
  - `HoloFrame.setTier`, `restingTier`;
  - `GraphScene.viewTints`, `ChartApp.viewTints`, and the `viewTints` hook.
- **02 INV-05:** the station note gains standby. It is a look from the station's own PRs' history,
  never a rung, a place or a size.
- **03:**
  - §5d: the `PieceState`, `ViewNode` and stage-grammar lines, and the facility row of the projection
    table;
  - the asset-view line (`settle`);
  - the `GraphScene` seams (`landAllStages` settles, `viewTints`);
  - *Acts* (`artTime`, `StationView`);
  - §10's hooks.
- **05 §8:** *A station on standby* (how it lands in play, and that no rule or beat is added), and
  the *Seeks* paragraph (settles every eased look).
- **13 §4:** the Idle life table's Station row, a new *A station on standby* paragraph, the Entrances
  and exits table's Station row ("Never" departs, but goes on standby), and §4.4's *Its life in an
  episode*. Marked experimental until HG-M1.
- **15:** §10 has three new rows: *Station standby* (`STANDBY_BELOW`), *fade* (`STANDBY_FADE_MS`,
  `STANDBY_WAKE_MS`) and *dim* (`STANDBY_HULL`, `STANDBY_LIGHTS`), all checked by `docTables`. §6's
  *Holo tiers* paragraph gains that a station on standby is drawn at T3. The §10 Source line lists the
  new files.
- **Also amended:**
  - 12: a new *Standby* entry;
  - 14: the theme assets row in the file table, and the `AssetView` note;
  - 90-later: the art's power hook (`DreadnoughtView.setPower(0..1)`), options B and C, and the found
    Todo/CRM playback gap (§5 below);
  - 19: M1's *State* line and three §5 rows;
  - tests/README: the `v11-M1.ts` row, `stationStandby` in the theme row, crm-quarter in the solar
    row.
- **Golden:** `solar.scenes.json` changed deliberately (`npx vitest run -u tests/golden/solar.test.ts`).
  I checked it in isolation by regenerating with the rule switched off and diffing. The only change
  is two stage strings at the round's last instant (12 Oct 06:59): harbor-console and ledger-sync
  gain `|sb=1`. No v0 golden moved.

## 3. Checks
| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass (56 files, 873 tests). New: `stationStandby.test.ts` (a first stage lands at once; it fades down over `STANDBY_FADE_MS` and wakes over `STANDBY_WAKE_MS`; `settle` and reduced motion snap; only additive layers take the deeper grey; the art's clock holds on standby and never steps back). `solarSeek` gains a mini sprint: awake 3 h after a merge, still awake a minute before two days, on standby a minute after, same `world` and `compound`, woken by the next PR, kept awake by an open one. `stageCode` covers the `sb` field. `docTables` covers the three new rows |
| Golden `solar.scenes.json` | Changed deliberately (above); v0 goldens and `schedule` unchanged |
| `npm run e2e:spec -- solar solar-play gallery-v1 gallery-assets` | 27 passed, including the new `solar.spec.ts` test on crm-quarter: Birchwood Mills and Osprey Freight on standby (tint 0.7, plate `place`), Quillon Dairy awake (`lead`), the standby plate lifting when pointed at, contrast ≥ 4.5 |
| `npm run e2e:spec -- slice1 slice2 density motions` | 36 passed (`labels.ts` and `GraphScene.ts` are mapped to these) |
| `GALLERY_FAMILY=labels` gallery-v1 | Pass |
| `npm run e2e:keystone` | 38 passed |
| Full `npm run e2e` | Not run, as instructed (the final phase runs it) |

## 4. Human gates (HG-M1)
**No fixture moment shows a station going on standby, or waking, during pod-sprint's episode.**
- tide-gateway always has a PR open.
- harbor-console and ledger-sync go quiet after their last merges (8 Oct 17:00 and 9 Oct 17:00).
  The last beat is 9 Oct 21:00, so neither is two days quiet at any beat. Neither gets another PR,
  so nothing wakes.
- The closest is harbor-console at the last beat: nothing open, quiet 1.2 days, awake.
- The round's last instant (12 Oct, the golden's) has both stations on standby. But a finished
  episode shows its last beat, not the round's end.

The stills therefore show the closest moment, the look in a real chart, and the fade in the gallery.
1. **Gallery** (shoot first, since a Playwright run clears `test-results/`):
   `GALLERY_FAMILY=registry-dreadnought GALLERY_SHOTS=test-results/drive/v11-M1-gallery npm run e2e:spec -- tests/e2e/gallery-v1.spec.ts`.
   - `registry-dreadnought-c0.png`, the bottom-left cell: the trek station awake, none open.
   - `registry-dreadnought-c1.png`, the same cell: on standby, settled. Watch for the shield and
     glow gone, the windows and drive low, and the hull a little darker.
   - Live, in `npm run gallery` (Registry › facility): each seeded cell powers down on its 6th step
     and wakes on the 1st.
2. **Drive:** `npm run drive -- tests/drive/steps/v11-M1.ts --paradigm solar` writes
   `test-results/drive/v11-M1/`.
   - `01-pod-sprint-last-beat.png` and `pod-sprint-last-beat-crop.png`: Harbor Pod at its last
     beat. harbor-console, the closest, is awake.
   - `02-crm-region-end.png`: crm-quarter › Q3 2026 › North Territory, at its round's end (1 Oct).
     Birchwood Mills (quiet since 26 Aug) and Osprey Freight (since 16 Sep) are on standby, with
     dimmer hulls and T3 plates. Quillon Dairy, with a quote still out, is awake with a T1 plate.
     There are crops of each.
   - `03-crm-standby-pointed.png` and `-crop.png`: Birchwood Mills pointed at. Its plate lifts and
     expands into its two quotes.
   - `04-crm-standby-reduced.png`: the same, under reduced motion.
   - `console.log`: each still's open PRs, standby, activity, tint and plate tier per station.

**To decide at HG-M1:**
- whether standby reads as idle without reading as broken or off;
- whether 0.7 and 0.3 are the right depth;
- whether two calendar days is the right threshold (working days were considered; see §5);
- whether to try B (jump away) as well.

To see it happen in play, a fixture would need a beat two or more days after a station's last PR
settles, and then a new PR on that station. That edit was left to you (below).

## 5. Known limitations and open questions
- **Not seen in play on any fixture.** Every path that makes a station go on standby or wake in play
  is covered by unit tests: the rule (`solarSeek`) and the eased view (`stationStandby`). No e2e or
  still exercises the real beat transition.
  - **A Todo or CRM region has no beats** (found here; 90-later). Solar's region reuses v0's pod
    level, whose `podOrder` counts only User Stories and Bugs as members, so todo-week and
    crm-quarter regions can't be played or stepped. They are drawn at their round's end. That
    region has the richest standby cycles: Birchwood Mills goes quiet 9 Jul, wakes 17 Aug, and goes
    quiet again 31 Aug.
  - Fixing this, or adding a beat and a later PR to pod-sprint, would let a spec and the drive step
    through a real standby and wake. Both moves are outside M1: the first is shared playback code,
    the second moves the Solar goldens, as S2 noted.
- **Calendar days, as a piece's activity.** A Friday-evening merge with nothing open puts a station
  on standby by Sunday evening, until Monday's first PR. 19 §3's "measured in the round's own days"
  could mean working days. That's a small change in `recencyOf`'s caller if HG-M1 wants it.
- **The plate changes with the beat, the lights with the look.** On waking, the plate lifts to T1
  when the beat is applied (with the tell) and the lights come up after the Shuttle tender's land.
  Going on standby, the plate drops at once while the lights take 2.4 s. The tier change isn't
  faded; a CSS transition on the plate's colours would also slow hover lifts, so it wasn't added.
- **Dimmed from outside the art.** The adapter finds the "light" layers by their additive blend
  mode under the art's root, and finds them again after each stage (a change of form can build new
  ones). If the art ever tints those layers itself, the two will fight. The hook the art effort
  should add is `DreadnoughtView.setPower(0..1)` (90-later). Beacons and guard lamps run on the pulse
  clock, so they keep blinking, only dimmed.
- **Standby is not in the DOM text** beyond the plate's tier. The inspector doesn't say "standby".
  It is a de-emphasis, not a state, and the station's PR rows (its plate and the History) carry the
  facts. If HG-M1 keeps it, an inspector line ("No PR activity for 2 days") would make it explicit.
- **`ViewNode.activity` on stations is unused** by any ambient effect yet. It's set for consistency,
  and for any later idle life that reads it.
