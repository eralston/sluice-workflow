# Slice V1-W4-T3: Docs amendments

Built 2026-10-12, following [17 W4-T3](../17-v1-phases.md#w4-t3-docs-amendments). This task changes
docs only. It records the rule changes of [13 §9](../13-game-design.md#9-rule-changes-from-v0) in the
normative docs, and makes 03 and 14 match the code as built after W0–W3. It also folds in every
docs follow-up from the earlier handoffs. W4-T1 and W4-T2 were still in flight while this ran, so
their outcomes (the gallery demos, the VC-3 fix) are recorded as pending.

## 1. What was built
- **`docs/02-domain-rules.md`** (rule changes, each dated 2026-10-12 and pointing at 13 §9):
  - **INV-05**, *Seats and regions*: a seat planet's own share is the second aggregate exception,
    beside the region's star (which keeps the pod rule). A station's intensity is its own share of
    linked pieces. Neither rule ever applies to a work item.
  - **INV-08**, *Ships help, and fight only threats*: this replaces v0's "ships never attack" for
    Solar. It carries over the combat-safety rules from 10.
  - **INV-10**: in Solar, Off pieces rest as ghosts instead of leaving (as built: W1-T1, W2-T1, W3-T3),
    and containers aren't drawn (a Feature appears only as a subtitle).
  - **INV-12**, *Stable looks*: seeds come from the entity's ID within its tenant. The viewer's style
    is the one exception, and it's applied at render time.
  - **INV-14**, *The solar system*: orbits with fixed seat slots, plus fixed free slots, formation
    indices, frontier slots and compound slots. The playhead decides only visibility, which slot a
    piece shows at, and its look.
  - **INV-19**, *Own share and achievements*: both are allowed, but only against a person's own
    commitment. Achievements go to the viewer only. There are still no counts, rankings or XP.
  - **§2**: a short entry for the Solar chain. Solar is the bottom level, and only the region plays.
    The Sprints line no longer calls Sprints the default.
- **`docs/05-playback.md` §8 (new)**, *v1: playback in the solar region*. It covers:
  - the play gate and its plate;
  - the three pacing hooks, and why v0 stays byte-identical;
  - `paceFacts`, shared by pacing and the planner;
  - the 13 pace rules, with their lengths and the theme's maneuver names;
  - planning and sequencing, light work, and the interpreter's order;
  - acts on `pulseTime`;
  - seeks (`clear()` plus `act('rest')`), resting looks, the recap and insignia, Solar's lines, and
    reduced motion.

  The intro points to §8.
- **`docs/06-visual-brief.md`**:
  - §2 gains a hostile-palette row (threats only). The hero colourway rule now avoids the hostile
    palette too.
  - §3 points to §9, and notes the hidden switch and the developer toggle.
  - The tractor-beam row and the captain-ships bullet carry the v1 amendment.
  - **§9 (new)**, *v1: the solar system*, covers:
    - navigation (the bottom level, no close-up);
    - the board and its asset table;
    - the hostile palette (including the `HOSTILE` maneuver colour, and coral kept for UI chrome
      only);
    - combat safety;
    - **seeds**, as a table of which look comes from which seed, with the viewer exception;
    - **containers not drawn**;
    - mega-labels, the guides and D13 scoping;
    - the solar visual checks (with VC-3 marked not met);
    - the v1 human gates HG-V3, HG-V3′ and HG-V4.
- **`docs/08-layout-solver.md` §7 (new)**, *The solar system*:
  - **The plan.** Strides, the 6 + pairs rings (Q11), band packing, free slots, hex formations and
    `memberR`, the frontier belt, the station spiral and its clearance, and compound first-fit.
  - **The renderer's screen terms.** The 25 px pitch and why, the formation shift, the formation hit
    cap, and the fit.
  - **What the density harness found.** The big-board radii; the 21 VC-3 overlaps at scale about
    0.13, with their cause; and the W3-T1 simulation table, with the fix recipe.
  - **Status and open questions.** The fix is W4-T2's.

  The intro now names §6 and §7.
- **`docs/09-signal-ladder.md` §9 (new)**, *v1: the rung carried by light*:
  - a per-object table for objects of fixed colour (seat planet, asteroid, hive ship, captain), plus
    notes on station intensity and on satellites drawn by count;
  - steps, the sketch as a sensor contact, and the rule that the hostile palette never carries a
    rung;
  - off-ladder fallbacks for the hive, pack rungs and the parity test, and the cyan guides.
- **`docs/03-contracts.md`** (the final pass):
  - **§5d rewritten as built.** It holds:
    - the corrected shape block: `step` as a 0..1 fraction, `SolarSource` without `fallback` and with
      `pack?`, `MegaRow.subtitle.key`, `PieceFacts.parentAt`, `RoundFacts.at`,
      `SourceWords.agent`, `HierarchyUi.chooser`;
    - the mapping and the **signal fallback order**, and the **stage grammar**;
    - packs (SDLC, Todo and CRM mappings and thresholds), with the **move table**;
    - round facts: membership, the one-timeline readers, the `heldSpans` seat rule, the
      **final-parent rule** for linked steps, and terminology;
    - the solar plan's departures from 14;
    - **the projection node table**, `boardFacts`, `slotAt`, `paceFacts` and the **mega-list
      rules**;
    - the schedule hooks;
    - `PaceRule`, casts, `planManeuvers` and the **sequencing rule**;
    - achievements: `AchievementOptions`, and the rule ids, shapes and readings;
    - the play gate and hooks (`playGate`, `playHooks`, `v1/{plan,awards,lines}`);
    - **renderer seams**: `setAssetCtx`, `setGuides`, `capsOf`, `actView`, `EntryCaps`, `isFramed`,
      `KindTable` and `placeFormation`;
    - assets and the theme: **asset ids, capabilities and acts**, `INNER_PARTS`, the
      **`stageCodec` art grammar**, factions;
    - commands and the interpreter: `FxHost`, `CastView.gone`, the **seed command table**, **the
      interpreter's order**, cast resolution, `SwitchingDirector`, and ChartApp and its callbacks;
    - labels and overlays (`tierFor`, `OverlayInput`, `placePlate`);
    - renderer settings (store, `views.ts`, viewer, modal);
    - the fences (the `projectCaptains` carve-out kept).
  - §4's v1 note is unchanged, and §5a's layout table gains a `solar` row.
  - **§5b**: Solar is the unpinned default, a pin wins, and the stored value is written but not read
    at boot (the W1-T5 follow-up).
  - **§6**: `settings` is no longer optional. A new paragraph, *Settings, as built*, covers the
    read/write rules, Purge, the IPC that bypasses `handle`, and hull and colourway indices.
  - **§7**: `ScheduleOptions` gains the three hooks and `BeatShape`. The stale `BUDGET_MS` comment is
    fixed (45 000; highlights 30 000).
  - **§8**: the v1 scenarios table, the DSL's `item(type, …)` and kind-based membership, what's
    served under each paradigm, and per-scenario mappings in `npm run fixtures` (the W1-T2
    follow-up).
  - **§10**: the `liveCommands`, `awards` and `fxCensus().maneuvers` hooks. The `settings-set` dev-log
    line, with `valueHash` as a whole number.
- **`docs/14-architecture.md`** (status and as-built changes):
  - The status line now says W0–W3 are built and W4 is in flight. It points to 03 §5d for the
    as-built shapes.
  - **The fence paragraph (line 25) gains the `projectCaptains` carve-out.**
  - §1 module map, as-built notes:
    - `facts.ts` readers;
    - `maneuvers.ts` extras;
    - the `achievementsFor` options;
    - the demo packs' thresholds in `index.ts`;
    - `paceFacts`, `boardFacts` and `slotAt`;
    - `ROW_BUDGET` in `lists.ts` only;
    - `v1/lines.ts`, `assets/adapt.ts` and `settings/views.ts`.
  - **§2.4's stale stage examples are replaced** with as-built strings, and `MegaRow.subtitle.key` is
    added.
  - §2.2, §2.5 (`fallback` dropped, `pack?` added), §2.6, §2.7, §2.8 and §2.9 each gain an *As built*
    note.
  - §4: the seat rule (on the ladder, band-packed radii), many seats as Q11, `memberR`, and station
    edge cases. A new paragraph, *one timeline*.
  - §5: the test files added as built, and VC-3's expected-failure mark.
  - §7: the developer toggle.
  - §9: D3 is superseded by Q11, with a status line for D1–D6.
- **`docs/17-v1-phases.md`** (not in this task's list; see 2):
  - D12 now reads 25 px, with the reason.
  - The wave summary lists the extra tasks W3-T3, W3-T4 and W3-T5.
  - W3-T1's Creates names `v1/lines.ts`.
- **`tests/README.md`**:
  - A *v1* block: the solar specs launch unpinned or pinned to `solar`. A table maps each v1 area to
    its unit, golden and e2e specs.
  - The driver section has the `solar-episode.ts --paradigm solar` command, and explains why the pin
    is needed.
- **`docs/90-later.md`**: nine v1 deferrals:
  - pipeline runs (13 Q7);
  - per-slot satellites (D2, D6);
  - guests in maneuvers;
  - the asteroid's own descent;
  - a remembered developer view;
  - suggesting the viewer (Q8);
  - a ship preview;
  - theme-owned copy;
  - the demo packs in ADO mode.
- **`docs/progress/handoff.md`**:
  - The header is dated 2026-10-12.
  - The "V1, Solar" row is replaced with the full status.
  - A new section, *v1: where it stands*, covers what's built, what's in flight and where each rule
    change landed. It holds **the user's review list**:
    1. HG-V2, the rules docs and their open questions.
    2. HG-V3, the board. It's gated on VC-3 and gives the exact drive command.
    3. HG-V3′, the maneuvers in the gallery.
    4. HG-V4, the v1 sign-off and the live checks (pass or fail only).

    Known rough edges are listed after it.
  - "Ships never attack" carries the v1 note.
  - The key code and e2e pointers gain their v1 entries.

## 2. Contracts changed
- **No code or contract changed.** These are doc edits only. Every 03 and 14 edit records code that
  W0–W3 already built and described in their handoffs. Where the text and the code disagreed, it
  was checked against the code: `ipc.ts` `settings` is now required, the exports in `playGate`,
  `playHooks`, `v1/*`, `settings/*`, `overlays`, `labelTiers`, `placeFormation`, `stageCodec` and the
  registries, `SolarSource`, `projectionKey`, the art palettes, and `BUDGET_MS`.
- **Rule changes recorded** (13 §9, row by row):

  | 13 §9 rule | Edit |
  |---|---|
  | INV-19 Not a scoreboard | 02 INV-19, *Own share and achievements* |
  | INV-05 Own state drives the look | 02 INV-05, *Seats and regions* |
  | "Ships help; they never attack" | 02 INV-08, *Ships help, and fight only threats*; 06 tractor-beam row and §9 *Combat safety*; handoff.md |
  | INV-14 Stable layout | 02 INV-14, *The solar system*; 08 §7 |
  | Navigation | 05 §8, *Playback happens at the region only*; 06 §9, *Navigation* (also 02 §2) |
  | Colour | 06 §2 (hostile row, hero colourways) and §9; 09 §9 |
  | Seeds | 06 §9, *Seeds: stable looks* (also 02 INV-12) |
  | Containers | 06 §9, *Containers aren't drawn* (also 02 INV-10) |

- **One departure, which 13 §9 doesn't list:** the Solar view keeps Off pieces as ghosts, where v0's
  INV-10 has Removed items leave. This was built in W1–W3 (14 §4: "Off pieces show as ghosts"), so
  02 INV-10 now records it.
- **Edits outside this task's Modifies list:** `docs/17-v1-phases.md` (D12, the wave summary, W3-T1's
  Creates). The computed task's follow-up list asked for the D12 change, and the W3 gate asked for
  `v1/lines.ts` in 17. All three are additive one-line edits to a doc no in-flight task edits.

## 3. Checks
- **`npm run lint`**: clean (exit 0).
- **Every rule change in 13 §9 has its doc edit**: yes, per the table in 2. A grep confirmed that each
  edit's marker text is in its target doc: "Own share and achievements", "Seats and regions",
  "fight only threats", the 02 INV-14 solar bullet, 05 §8, 06 §9, the hostile-palette row, "Seeds:
  stable looks", "Containers aren't drawn", 08 §7 and 09 §9.
- **No real ADO data in any doc (INV-18)**: yes. The diff of every changed doc has one URL, the
  template `https://dev.azure.com/{org}/…/_workitems/edit/{id}`. Every name used comes from the
  fixtures (*Tidewater Array*, Wren, Ossian, Harbor Pod, *Juniper Household*, Hazel, *Larch & Pine
  Trading*, Imelda, *Quillmoor*, the Discount Desk). There are no screenshots and no work-item data.
- typecheck, `npm test`, builds and e2e weren't run: no code changed, and 17 doesn't list them for
  this task.

## 4. Screenshots
None. This task has no human gate. The review list in `handoff.md` says which stills to take for
HG-V3, once VC-3 holds.

## 5. Known limitations and open questions
- **W4-T1's and W4-T2's results aren't recorded yet.** Both were in flight when this ran. Whoever lands
  them, or W5-T1, should:
  - Add the VC-3 fix's outcome and the density solar case's numbers to **08 §7** (*Status*), and
    remove "Not met yet" from **06 §9** and **14 §5**.
  - Update the threat and facility floors in **03 §5d**'s asset table if W4-T2 changes `FLOOR_PX`
    (today 0.55 and 0.9 labels).
  - Record the tuned maneuver lengths in **05 §8**'s rule table if W4-T1 changes `pace.ts`.
  - Update the HG list in **`handoff.md`** as each gate is passed.
- **`docs/18-achievements.md` isn't this task's file.** Two follow-ups are left for it:
  - §5 A6 should record the demo packs' thresholds: Todo 2 working days, K = 3; CRM 10 days, K = 4
    (W3-T2). These are already in 03 §5d and 14 §1.2.
  - The built readings of each rule should be copied from 03 §5d.
- **`docs/12-glossary.md` and `13` aren't this task's files.** 13 §9's "Doc to amend" column could
  now say "amended 2026-10-12". 12 could gain *board facts* and *pace facts* as terms. Neither is
  needed for correctness.
- **03 §5d is long** (about 430 lines). It holds every seam the W0–W3 handoffs asked for. If it gets in
  the way, the renderer half (play gate onwards) could move to its own §5e without any content
  change.
- **The MapKey shows the four v1 kinds in v0 too** (W0-T1's open item). That's code (`MapKey.tsx`), so
  it's not recorded in the docs. It's still open for whoever owns the panels.

## Wave gate (W4, 2026-10-12)
Run after W4-T1, W4-T2 and W4-T3 finished, with builds and e2e inside the shared build lock.
- **Base:** `npm test` 50 files, 776 tests, all pass. `npm run typecheck` and `npm run lint` were
  clean at 16:12 once another session had removed its gallery heap-probe instrumentation (`__cnt`,
  `__dbg`, `VITE_ONLY`, `zzheap`/`zzprof` specs); the gate left those edits alone. At 16:34 both fail
  only on `scripts/ship-metrics.ts`, a new untracked script from the in-flight art session (TS6307:
  it imports renderer art into the node project; one `no-explicit-any`). Not a W4 file; its owner
  should add it to a tsconfig include or move it, and type the `any`.
- **Keystone:** 38 of 38. **Full e2e (`npm run e2e`):** 134 + 21 = 155 of 155, including
  `gallery-assets`, `solar-play`, `settings`, `solar` (VC-3 with no `test.fail()`) and `density`.
- **Goldens:** `git status tests/golden` shows only the untracked v1 files from earlier waves; no v0
  golden is modified.
- **Fixes made at the gate:**
  - `placeFormation.ts` `placeStations`: a drawn station missing from `solar.stations` (an older
    graph) now settles in key order and its spot joins `placed`, so unlisted stations clear each
    other (W4-T2 review). `placeStations.test.ts`'s older-graph case now asserts that, at 0.02 and 0.05.
  - Docs (W4-T3 review): 03 §7's highlight budget comment reads 30 000; 03 §5d's threat and facility
    floors read 0.3 and 0.5 label; 03 §5d gains a gallery-seams paragraph (`extraSections`,
    `registrySections`, `maneuverSections`, `demoCases`, `DEMO_PICK`, the `ImportMeta.glob`
    declaration) and §10 the `__starChartGalleryDemos` hook; VC-3 is recorded as met in 14 §5,
    06 §9 and 08 §7 (with the density numbers), and 08's "today's floors" now say "the old floors";
    06 §2's hostile glows match `HOSTILE`; 02 §2's Solar paragraph moved after the Backlog bullets,
    which get a lead-in; handoff.md's V1 row and HG-V3 item no longer say VC-3 gates it.
- **Left open (minor, recorded in the task notes):** W4-T1's `castResolves()` matches by key, not by
  the interpreter's role-to-kind mapping; `demoCases()` throws on a missing fixture, blanking the
  gallery; `crop()` follows attach chains one level only; the bare "subject 21000" captions; the
  HG-V3′ stills aren't written by the spec; `extraSections()` sits between the v1 and v0 sections
  rather than at the end (17 W4-T1's Modifies line should say so). W4-T2's frontier push-out doesn't
  see stations, and `placeStations` re-settles on every zoom frame (memoise by scale and plan).
  The gate didn't edit the gallery files because another session was editing them during the gate.
