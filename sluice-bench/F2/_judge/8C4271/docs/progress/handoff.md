# Handoff: where Star Chart stands (2026-11-06)

Read this first when picking up the work. The repo moved from
`…/OneDrive-…/Documents/code/star-chart` to `…/Code/star-chart` on
2026-10-03; the slice-by-slice history before then stayed in the old repo. Everything since is
committed here (slice 4 in 81c1118, H1–H4 in 0460c79, 5 and 6 in ecae946, 7 in 0eb94a9, v1 in
b37f4fc and 0c432ee). The docs are the source of truth; this note only points into them.

**Now (2026-11-06): v1.4 is mid-tranche on branch `flow/v1.4`, run under the Sluice** (the flow was renamed
Sluice in c64afe3; `/sluice run`, `/sluice summary`, `/sluice retro`). The scope doc is
[27-v1.4.md](../27-v1.4.md); its work files are in `docs/progress/v1.4/` (block notes, `work/<item>/`, the
ledger and the pacing ledger). **Every open question in 27 is answered** (2026-11-06); nothing waits on the
user until the final check.
- **Accepted:** A1–A4, B1–B4, C1–C4 (C4 as C4a–c), D1–D3, E1–E8 (E4, E5, E6 and E7 as split builds). HG-C and
  the A and B final check were signed on 2026-11-01. Blocks A–D have their notes and audits (`block-*.md`,
  `work/block-*`); doc 28 is the A–C retrospective of the Sluice itself.
- **E9, the camera directs:** built round 1 by another dev (b0260b1, "Partial E9"), not yet reviewed. Its
  needs-decision is settled: the two `solar-dense` specs that measure in screen px (22 C3 glide, 22 C8 guests)
  move to world units. Next: that fix, then review-1, then commit as `sluice(E9)`.
- **E10, late-day montage (new, 2026-11-06):** replaces E8's departure. Under the cap, routine repeats montage in
  the rising-tempo curve's tight end (the last working day, or last third), every pod, every exclusion kept.
- **Block E's audit** comes after E10. Carried to it: the ledger's Quasar schedule vs the app's; the volley e2e
  counting other crews as members; E5c's noted-plate fallback docs; the flakes `solar-dense.spec.ts:295`,
  `devlog.spec.ts:16` and `perf.spec.ts`'s seek check.
- **Block F, chains (new, 2026-11-06):** F1 a bulk-PR fixture pod (36 PRs into 36 repos, invented names);
  F2 summon on the fly (no stop, one call blip matched to the arrival); F3 summon chains; F4 charge runs (one
  author across stations: short energy beam per pass, normal charge-up and transform, held charge, all fire
  together after the last finishes). They extend E6's `volleysOf`, E7's sweep pattern and B-21's fuse;
  proximity order in one direction; gather back across one day turn under the B-15 guard; one 30 s window
  shared with E6's volleys. F4 depends on E9 (a run's climax camera holds the board, then eases in for the volley).
- **Order and run size (decided):** E9's fix and review → E10 → block E audit → F1–F4 → block F audit → one
  final check for D, E and F, all at the full Sluice; the full suite once per block; stop cleanly at a limit and
  resume from the part-built tree.
- **The final check holds:** the D, E and F stills and walks; a live walk of F1's run; Comet's feel against its
  yardstick in story time, what the app plays (block E audit): 50.3 s before E1, 45.8 s now (the ledger's
  App s column; the recorded 67.3 s and ~60.8 s are the same two moments in the recorded bundle); the 30 s window and the charge timings; Pulsar's frame budget, hard under `phone` and
  `tablet`, reported soft on `desktop` and `laptop-battery` (the goal was amended); the Azure CLI live check
  (pass or fail only, INV-18).

**v1.3 (2026-10-26 to 2026-10-29)** ([archive/23-v1.3.md](../archive/23-v1.3.md); slice notes in
[archive/progress/](../archive/progress/)) was the whole backlog: A (the Halcyon Reach demo, four pods) and Blocks
B–F. Blocks C–E (built 2026-10-28) finished the scene, playback and onboarding backlog:
- **C:** measured outline contrast with a dark keyline; Quasar's standby in play; vacated homeworlds dim; the art
  owns `setPower` and an `emitter` anchor; per-slot tenders, with promotion so "+N" never sits beside a free slot;
  a dev-flag asteroid atlas; the frontier push-out clears stations; a ghost reseated while Off takes a slot on a
  seat already on the board; softer loading energy.
- **D:** an `All events` chip; insignia on the beat's start; one facts core for pacing and the scene; Todo and
  CRM regions play, count and speak their own chrome words; whole-quarter CRM ranges.
- **E:** a live ship preview; captain export and import; the remembered developer view; "Is this you?";
  Azure CLI sign-in; theme-owned reading copy; a seven-step Comet Pod tour; dropping a picture on a ship.

The close (2026-10-29): every gate signed (HG-B and HG-A-demo with tweaks, now in 27); the pins, pictures and
captain export/import live checks pass; a close-out audit of C–E found 2 majors and 11 minors, all fixed
(`archive/progress/slice-1.3-audit-C-E.md`, `-audit-fixes.md`); the tour's ring lagging a step behind was fixed.
Pulsar's soft p95 frame test stays red until v1.4's vsync budget and density-aware labels. 90-later is empty.

**Before that (2026-10-26):** **v1.2 is closed and archived** ([archive/22-v1.2.md](../archive/22-v1.2.md);
its slice notes are in [archive/progress/](../archive/progress/)). It was four blocks: A (a live customer
review), B (one vocabulary, and a playback that explains itself), C ("Win as a Team": story time, the
close in three acts, arcs, pulse and montage, limelight, rests and the hand-off, guests) and D (the
mandala: every object near a planet in a predetermined, symmetric slot), plus a refused-token notice and
Retry, and revisions to the mandala from real data (the planet's name under the planet, drawn by the scene
between the planet and the objects over it; trophies a full trophy off the rim; layout v9). The user
closed it on 2026-10-26 with their review of the open questions satisfactorily resolved; the
**unsigned human gates** (HG-A-*, HG-B-*, HG-C-*, HG-D-mandala, and v1's and v1.1's) and the open
questions were carried into v1.3's plan, [archive/23-v1.3.md](../archive/23-v1.3.md), which became Blocks B to F (see above).
The v1.1 review set is in `review/v1.1/` and v1.2's in `review/v1.2/` (both gitignored, fixture data
only). The user commits (v1.2's work was uncommitted when it closed).

## Where the work is
| Slice | State |
|---|---|
| 0, Boot · 1, Static hierarchy | Signed off (HG-1, HG-2) |
| 2, Replay | Built, then reshaped in 3a ([slice-2.md](../archive/progress/slice-2.md)) |
| 3a, Story grammar | Signed off (HG-3a, 2026-10-03). [slice-3a.md](../archive/progress/slice-3a.md) |
| 3b, Perspectives | **Signed off (HG-3, 2026-10-04).** [slice-3b.md](../archive/progress/slice-3b.md): sector glyphs, stage polish, reduced motion, frame-the-action (Z); follow mode as the captain's story (story schedule, follow camera, hero aura); the History tab and the player at the top; the team switcher |
| 4, ADO ingestion | **Built (2026-10-04).** [slice-4.md](../archive/progress/slice-4.md): the fake ADO org, the pure derivation, client, SQLite cache, sync, the Connect panel behind the mode chip, favorites, Epic search, pictures. `npm run dev:fake-ado` to try ADO mode |
| 4+, Real-org pass (2026-10-07) | **Built.** The real-org pass covered: scale to 188 projects; onboarding (the empty cosmos, recent projects); request activity; the camera revision; the 20k-cap guard; the Keychain PAT; the dev log. Then **loading by level** (04 §5a): current state first, Load more, history on request, quiet catch-up, and loading energy by kind (06 §3). Checks: `tests/unit/levels.test.ts`, `tests/e2e/explore.spec.ts`, and the gallery's Loading energy section |
| H1, Pluggable hierarchy (2026-10-07) | **Closed; signed off (HG-H1, 2026-10-09).** [slice-H1.md](../archive/progress/slice-H1.md): the scene levels are a chain of layouts fed by sources, with Backlog as one chain, and data sources sit behind `ChartSource`. No behaviour change. Next is H2, the Sprints paradigm (project → sprint → pod → story → task) as the new default |
| H2, The Sprints view (2026-10-07) | **Closed; signed off (HG-H2, 2026-10-09) on the real org.** [slice-H2.md](../archive/progress/slice-H2.md): project → sprint → pod → story → task as the default view, with Backlog a switch away. Sprints come from the iteration tree; the sprint's dates are the clock |
| H3, Time to first look (2026-10-08) | **Closed; signed off (HG-H3, 2026-10-09) on the real org.** [slice-H3.md](../archive/progress/slice-H3.md): a sprint opens on a three-call first look and streams the rest through a priority scheduler, with the focused pod first. Arrive and Depart motions, Removed items leave, and a loading plate over the galaxy |
| H4, Playback in the scene (2026-10-08) | **Closed; signed off (HG-H4, 2026-10-09): the user watched a real sprint and saw movement, departures and arrivals.** [slice-H4.md](../archive/progress/slice-H4.md): a scene plays only its own events and opens at its end state; the sprint's scope is bounded again (it had run to 8,020 items); PRs dock without waiting on history; one `EVER` query finds what was ever in the sprint |
| 5, Live hardening (2026-10-09) | **Built; waiting on the user's two live checks.** [slice-5.md](../archive/progress/slice-5.md): offline from cache (AC-31), the coverage chip (last sync, partial, Offline, Refresh), per-object stale marks, the refresh cadence (PR refetch and the periodic rescan), and frame-time profiling. Left: AC-34 and AC-35, which the user runs against the real org (pass/fail only) |
| 6, UX polish (2026-10-09) | **Built; waiting on HG-6.** [slice-6.md](../archive/progress/slice-6.md): the camera holds around a click, upcoming beats in History, a tighter pace (45 s budget, shorter gaps and holds), no true-red avatar swatches, sparse radars cluster, and **pictures you add by hand** (Inspector card; kept under userData, survives Purge). Open: area-move Go to another sector, and a settings surface. Not blocked by AC-34/35, which are slice 5's |
| 7, Logging, errors, missing data (2026-10-10) | **Built; waiting on the user's AC-34/35 re-run.** [slice-7.md](../archive/progress/slice-7.md): tiered failures with retries for 5xx and dropped connections; unreadable PRs and repos kept (stale) or listed in coverage and retried; cache repair on a rescan 404; an opt-in diagnostic log for packaged builds; child iterations, a per-pod `EVER`, and per-team sprint cadences. The gallery's Arrive/Depart row and "N of M" moved to 90 |
| V1, Solar ([17](../archive/17-v1-phases.md), archived) | **Built through W4 on fixtures (gallery, verification, docs), committed; audited against the code 2026-10-13. W5-T1's automated checks pass ([slice-V1-W5-T1.md](../archive/progress/slice-V1-W5-T1.md)); the human gates HG-V2, V3, V3′ and V4 are carried to 22 §2.** The app opens in Solar: galaxy → round (a sector, no playback) → region (a solar system, the only playback level), with the v0 views behind Settings' developer toggle or a pin. The `pod-sprint` episode plays end to end with maneuvers, the theme's art, mega-labels, Settings and the viewer's achievements. Todo and CRM demo packs are served in Solar. VC-3 in the solar region now holds (W4-T2). Since W5-T1's checks, Look & Feel added two milestones and the round's finale (*Art audit*, last row). See *v1: where it stands* below |
| Doc overhaul (2026-10-13) | **Done; docs only, committed.** Moved to `docs/archive/`: 07 (slices), 10 (v1 charter), 11 (v0 inventory), 18 (achievements; now 13 §8), 91 (UX polish; its open rows are in 90-later), the v1 prompt (`archive/v1-prompt.md`), and every closed slice note (`archive/progress/`). New: [15-reference.md](../15-reference.md), the authority for values (palette, ladder, roles, sizes, labels, maneuvers, effects, actions, timing), guarded by `docTables.test.ts` in `npm test` (change a constant and its 15 row together). Every live doc amended in place to the code, keeping section numbers; 08 and 14 carry an *Applies to* line (Solar, the v0 views, or both) under each top-level heading; 90-later is grouped by theme. The slice-note format lives in [progress/README.md](README.md) (moved from 17 on 2026-10-14) |
| v1.1 (2026-10-13 to 14) | **Closed 2026-10-14; archived.** The plan is the archived [19](../archive/19-v1.1.md): seven standing rules (now 13 §1 and 22 §1), the label hierarchy, eleven items built through a workflow (the run is explained in [20](../20-agent-workflows.md) and [21](../21-ultracode-run.md)), and every slice note in `../archive/progress/slice-1.1-*.md`. The review set's six findings were fixed in a closeout ([slice-1.1-closeout.md](../archive/progress/slice-1.1-closeout.md)): the History light left after the end, captain squares under plates, a CRM pod star's counts and look, a galaxy plate under the side panel, a lone preview rock, and terse History lines. HG-L1, HG-P1, HG-M1 and the L7 and M1 experiments are carried to 22 §2 |
| v1.4 (2026-10-29 to now) | **In progress on `flow/v1.4`.** [27](../27-v1.4.md); A–E8 accepted, E9 built, E10 and F1–F4 open (see *Now*). The first tranche under the Sluice: one commit per accepted item (`flow(…)`, then `sluice(…)`), block notes in `docs/progress/v1.4/`, a pacing ledger (`npm run pacing`), device profiles (`config/profiles/`), and doc 28 (the A–C retrospective) |
| v1.3 (2026-10-26 to 29) | **Closed and archived 2026-10-29.** [archive/23-v1.3.md](../archive/23-v1.3.md) (its notes are `archive/progress/slice-1.3-*.md`). Block A (the Halcyon Reach demo) and Blocks B–F (the whole backlog: data and plates, scene and art, playback and packs, settings and onboarding, hygiene and tests), built as a workflow; a close-out audit of C–E, fixed. Every gate signed; the tweaks and last answers went to v1.4's intake, [27](../27-v1.4.md). **Know:** Build (read) is an optional scope; threads, builds and team-board 401s are a missing scope, not a dead token; unverified against real ADO: the backlog level name as `{board}`, the feed's `$maxPageSize`, response shape and lag; the Azure CLI sign-in's live check was waived (in 27) |
| v1.2 (2026-10-14 to 26) | **Closed and archived 2026-10-26.** [archive/22-v1.2.md](../archive/22-v1.2.md) §3 (its notes are `archive/progress/slice-1.2-*.md`); the gates were carried to [23](../archive/23-v1.3.md). **Block A** (inline, one reviewer, the full suite, the stills): A1–A13 from a live customer review (literal counts, star labels, a T4 tier, role outlines, two-line titles, labels after arrival, captain motion, done silhouettes, a 12-world fixture); notes `slice-1.2-A13`, `-A3-A7`, `-A1-A2`, `-A8`, `-A9-A11`, `-A12`; four gates (HG-A-labels, -counts, -motion, -shapes) in 22 §2. **Block B built (inline), 2026-10-15:** B1–B8 (no Names toggle, ADO first with the metaphor quieter; Star / Enemy ship / Station; one identity line; one event wording in History, the ruler and the plates' notes; History's rows marked *now*; at most two labelled interactions at once); notes `slice-1.2-B1-B3`, `-B4-B8`; gates HG-B-words, HG-B-play. **Block C (2026-10-15 to 16), built:** C1, the rulebook (05 §8); the user's decisions (22 Block C); C2–C12 (notes `slice-1.2-C2`, `-C10-C12`, `-C3-C4`, `-C5-C6`, `-C7-C9`); its contract changes in one place, 03 §5e; gates HG-C-flow, HG-C-team, HG-C-ships wait in 22 §2. **Block D (2026-10-16), built:** the mandala (05 §8.2a, 08 §7), note `slice-1.2-D`, gate HG-D-mandala. Also: the intake loop (contextualize, ask, choose a build mode per block, build, review), the standing rules, the standing review list, the carried open questions |

## Art audit (2026-10-12, a separate thread of work)
The art and Look & Feel sessions' changes, in order. The detail is in the doc each row points to;
the slice-style notes they replace are in git history (this file, 2026-10-13).

| Date | Change | Doc pointer |
|---|---|---|
| 2026-10-12 | **Gallery crash fixed:** `girder()` (`asteroids.ts`) is capped at 40 segments, so the gallery's heap plateaus (about 700 MB) instead of running out | 06 §8 |
| 2026-10-12 | **Ship silhouettes:** `scripts/ship-metrics.ts` rasterises every hull at 29, 58 and 116 px (`npx vite-node -c vitest.config.ts scripts/ship-metrics.ts`); "Size ladder" gallery cells. The user's yardsticks: Light freighter and Saucer explorer for size, Transforming fighter for simplicity, Brood for the enemy | 06 §9 |
| 2026-10-12 | **Station forms:** the Mecha (ship to robot) and Trek (bare spacedock to the DS9 look) stations transform on the first merge, on the shared rig (`stationRig.ts`); `PieceState.merged`, `mg=` | [13 §4.4](../13-game-design.md), 03 §5d |
| 2026-10-12 | **Wars station overhaul:** a Mon Calamari-style cruiser that takes on a docking ring (a `Dock` rig, `warsStation.ts`); a `charge` act; new `hull3d.ts` helpers. A first merge's land is 4.4 s for every faction. Open: the 150 px pair in the sizes cell overlaps | 13 §4.4; 90-later (*Beams from a station's emitter*) |
| 2026-10-12 | **The merge as teamwork:** the protected rule `attachment.merge` (Power link); every station a merged PR went to beams the work's close; stations twice a ship and half a planet (layout v6). Watch `solar-merge.ts`. Open: timing and depth are first cuts; merges push episodes past the budget | 13 §6, 02 INV-08, 03 §5d, 08 §7, [15 §7](../15-reference.md#7-maneuvers) |
| 2026-10-12 | **Stations in the scene:** the hull drifts, tenders patrol, captains beam the station, a summoner's beacon before a jump-in; acts play from their start; a seek past a first merge cuts to the second form. Watch `solar-station.ts` | 13 §4.4 |
| 2026-10-12 | **Idle life:** `ViewNode.activity`, `ambient()` on asset views, the theme's `AmbientWork`; hive limbs flex. Watch `solar-idle.ts` | 13 §4 (*Idle life*), 13 §6 |
| 2026-10-13 | **Entrances and the opening:** `theme/starChart/entrance.ts`, `ManeuverInterpreter.opening` (3 s orientation), crowds of 4+ entering quietly, the animated rift. Watch `solar-opening.ts`. Known: a piece's label shows before it arrives | 13 §4; 90-later (*v1 rough edges*) |
| 2026-10-13 | **Transformation rules and the skipped-docking fix:** every playback starts in the first form; introductions go first; a first merge holds its station; dev-log lines `station-form` and `station-look` | 13 §4.4, 05 §8, 03 §5d, 03 §10 |
| 2026-10-13 | **The station's mining beam:** at an asteroid, a beamed close is the station's mining beam (`mine`), in hero blue | 13 §6.1, [15 §8](../15-reference.md#8-effects) |
| 2026-10-13 | **Milestones and the finale** (Look & Feel): new protected milestones `seat.complete` (Homeworld complete) and `region.clear` (All clear, 2950 ms); `theme/starChart/finales.ts` (`glint`, `allClear`, and the round's-end finale, which lights the viewer's awards on their ship at about 2.7 s); the threat light on the frontier belt; an over-budget essential beat is never cut. `pod-sprint`'s Harbor Pod now plays All clear, and the goldens were updated (Ossian gains hat-trick-defences) | 13 §6.4 *The round's end* (13 §6's audit is now §6.5), 05 step 7, 14 §2.8, 17 *As built after W4*, [15 §7–§8](../15-reference.md#7-maneuvers) |

**Source:** the art and Look & Feel sessions' reports · **Update when:** a session lands a change of
look, motion or rule.

## v1: where it stands (2026-10-13)
The plan was [17](../archive/17-v1-phases.md) (archived), the design [13](../13-game-design.md), the architecture
[14](../14-architecture.md), and the shapes as built [03 §5d](../03-contracts.md#5d-v1-additions-17-built-2026-10-10-to-2026-10-12).
Each task left a note in `docs/archive/progress/slice-V1-*.md`.
- **Built (W0–W3):** contracts and fences; the SDLC pack, moves and round facts; the `pod-sprint`
  fixture; the solar plan; maneuver rules and schedule hooks; the Solar chain and the Solar default;
  the projection and mega-lists; scene seams and the asset registry; the Star Chart theme's assets;
  commands and the maneuver interpreter; label tiers and mega-labels; Settings and the viewer;
  achievements; the integration (W3-T1); the Todo and CRM packs; and three extra W3 passes
  (consistency, polish, a flake fix). v0 is unchanged under `STAR_CHART_PARADIGM=sprints|backlog`,
  with its goldens and pixel baselines.
- **Built (W4):** W4-T1 the gallery's registry section and maneuver demos; W4-T2 the verification
  specs (`solar-play`, `settings`, the density solar case) and **the VC-3 fix** (a station pass and
  smaller threat floors; the moon ring it added was later replaced by layout v4–v6's one ring and
  platforms, and stations grew to a 1.2-label floor: [08 §7](../08-layout-solver.md#7-the-solar-system-v1-built-2026-10-10-to-2026-10-12));
  W4-T3 these docs. W5-T1, the release check: Base, Full and fixtures pass; the gates are yours.
- **Audit (2026-10-13):** every task in 17 W0–W4 checked against the code. Nothing was cut (D14).
  The art sessions' later work (station forms, Power link, idle life, entrances, holo labels, layout
  v6) is now listed in 17 *As built after W4*, and 03, 05, 08, 12, 13, 14 and 18 (since archived)
  were corrected where their numbers and shapes had drifted. Code fixes: v0's map key no longer lists the four solar
  kinds; the INV-20 check covers the theme's own commands; the debug spec `zzdbg.spec.ts` is gone;
  stale comments on the unused `DomainPack.crowd`. The small rough edges it found are in
  90-later's *v1 rough edges* (now 23 Blocks C, D and F).
- **Since W5-T1 (2026-10-13, now committed):** Look & Feel's milestones (`seat.complete`,
  `region.clear`), the round's finale and the threat light (*Art audit*, last row; 17 *As built after
  W4*); then the doc overhaul (*Where the work is*). W5-T1's Base and Full predate them: rerun both
  before HG-V4.
- **Rule changes** (13 §9) are in the docs: 02 (INV-05 seats, INV-08 ships fight only threats, INV-10
  ghosts and containers, INV-12 stable looks, INV-14 orbits and slots, INV-19 own share and
  achievements), 05 §8 (playback at the region only, maneuvers, pacing hooks), 06 §9 (hostile
  palette, seeds, containers not drawn), 08 §7 (the solar layout), 09 §9 (the rung carried by light).

**Your review list (human gates):** v1.4's final check, for D, E and F (27 *Order and blocks*), after block F's
audit. HG-C and the A and B final check were signed on 2026-11-01.

**Known rough edges, not blocking:** 90-later holds *Foreshadow lock* (not picked) and *Role glow's reach* (C3's fix round). Pulsar's p95 on `desktop` is soft (the baked aura is on for `phone` and `tablet` only).

**Gallery:** its screenshots are review copies, not pixel checks (decided 2026-10-03; 06 VC-6). The
baselines were removed. `gallery-layout.spec.ts` checks that the art sits in its frames at any
density or window size.

## How the user likes to work
- **Brainstorm, then a few focused questions, then build.** They answer questions inline in the plan
  file, or through multiple-choice prompts. Offer a recommendation, not a survey.
- **They review in `npm run dev`, the gallery, and from stills.** End each pass with stills (a drive
  run's `test-results/drive/<steps>/`, or a spec's `test-results/*.png`) and the exact scene and
  moment to watch.
- **They often send notes mid-task.** Fold them into the current work and say how you read them.
- **Build mode, per block** (2026-10-14): propose inline work (with one fresh-context reviewer) or a
  workflow, with a rough time and cost, and let them choose. A workflow runs only if they ask for one.
  Since v1.4, work runs through the Sluice; the user sets each block's run size (full or lean) in 27's Decisions.
- **Questions one at a time** (2026-11-06): when closing out open questions, ask them one by one, each with a
  recommendation, and record each answer in the scope doc's Open questions and Decisions.
- **Check the branch first** (2026-11-06): live work may be on a `flow/<tranche>` branch (or with another
  dev), not `main`. Read `git log main..HEAD` and the scope doc's States before planning.
- **They start the Sluice in a fresh chat** to save context; leave the scope doc and this note ready for it.
- They commit planning and doc changes themselves; under the Sluice, the orchestrator commits each accepted item. Never `volta install` (Node 24 is pinned per
  project).
- Toy prototype rules: public npm is fine, momentum matters, and the docs in `docs/` are the source of
  truth (update 02/03 in the same change when departing from them).

## Direction we converged on (keep it)
Checked against the code on 2026-10-13. Where v1 changed a direction, the item says so; the values
are in [15](../15-reference.md).
- **Pace: "a cozy campfire, not fireworks."** At 1× an episode fits a 45 s budget (`BUDGET_MS`; it
  was about 60 s until slice 6); 4× is the lively quick look. Every beat finishes its choreography
  before the next one starts. (In Solar, merges and essential beats may run past the budget; that row was closed on 2026-10-27,
  episode length accepted: 23 §5.)
- **Story grammar:** tell → act → land → echo, along geometry that already exists (orbits, routes,
  spokes). Solar's maneuvers add `gather` and `disperse` around it ([15 §7](../15-reference.md#7-maneuvers)).
  A finished round ends on its finale, not just the recap bloom (13 §6.4).
- **Continuity:** nothing teleports. The glide layer eases every node, pursuit chases live goals,
  lines draw on rather than popping in, and a seek snaps (INV-15).
- **Motion has to earn its place:** essential, narrative, and ornament tiers, gated by a volatility
  meter (at Maximum, the default, the load marks don't apply). A move worth "only an inch" just
  glides (v0 views).
- **Ships help; they never attack.** A broad, soft **tractor beam** replaced every thin "laser" beam;
  it was cyan, and is given blue now (`TRACTOR`, 15 §2). (v1 amends this: in the Solar view ships
  and stations also fight threats, and only threats, in hero blue; only threats fire red; 02 INV-08.)
  - A ship rests where its captain last worked (by recorded `changedBy`/authorship, not by
    assignment) and stays there. No commuting back to the parent. (Solar: a resting captain idles
    beside the work, 13 §4.)
  - Long streaks across the screen are for navigation only (jump trails).
- **The review formation:** at a PR merge, the author leads at the point with the tractor beam, and
  the approvers fly the wings and stream gold **support** into the author. No role chips: the beams
  tell who led and who supported, and guests wear their captain's picture like any ship while
  playing. It celebrates the team and never ranks anyone (INV-19). (v0 views. Solar's Power link
  keeps the idea: approvers' given-blue energy chains to the author, then the station; 13 §6.)
- **Task radar (v0 views):** Tasks sit in bands by rung (Ready on the outside, Accomplished hugging the planet),
  each on a fixed spoke. The Story's label carries a tally. Hover-only labels for Tasks that aren't
  Underway.
- **Dynamic labels:** compact (title only) while playing or moving; ships show only their captain's
  picture, hugging the top of the ship; full labels return about 3 s after things settle; a new or
  moved Task flashes its title (v0). Solar adds the expanded tier: a pointed or selected object's
  mega-label, and holo plates on planets, stations and ships ([15 §6](../15-reference.md#6-labels-and-type)).
- **Art:** mechanical objects (ships, stations, vessels) take no paint filter; celestial bodies do.
  People's names are ivory. Gold means accomplished (09 signal ladder).

## Review scenes added at HG-3a
- **Ember Desk** (Nimbus Deck): Tove alone takes "Notes on saved quotes" from start to Closed with one PR.
- **Kestrel Team** (Nimbus Deck): Odile and Bram on "Policy renewal reminders", then a bug outbreak.
- Both are in `fixtures/scenarios/` and applied inside orbit-week. `tests/e2e/review-scenes.spec.ts` writes
  `test-results/ember-*.png` and `kestrel-*.png`.

## Navigation
- A sector that only ever holds one Feature passes straight through to it, both on entry and on
  Back (06 §3, AC-48).

## Protected moments
- Merges and closings (Feature, Story, Bug) play without interruption: nothing moves their cast
  until they finish (05 §5, AC-49). In Solar, the protected rules are marked in
  [15 §7](../15-reference.md#7-maneuvers) (the closes, the merge, and the two milestones).

## Open items
Deferred UX decisions were decided in 23 §5 (2026-10-27); the rest of 91 is in [archive/91-ux-polish.md](../archive/91-ux-polish.md). The rest of this list is history from HG-3a.

## Open items for review (HG-3a)
- **Formation:** for a moment it can sit over a neighbouring PR label, and at a wide zoom the beams
  are faint.
- **Watch for busyness:** the Thursday Task wave (Lantern Squad → Billing statement redesign →
  Statement summary panel) is the densest moment.
- **The 05 §2 departure** is still standing: the first scope opens at the *end* of the range.
- **Minor:** sparse radars look thin. Area-move Go opens under the current sector's breadcrumb.

## Where to look, and how to check
- **The doc set:** [CLAUDE.md](../../CLAUDE.md) routes each slice to its docs.
  - 02 (invariants) and 03 (contracts) are normative; 15 is the authority for values.
  - 05 is playback: pace, continuity, and tiers in §5; Solar's maneuvers in §8.
  - 06 is the visual brief: accents in §5, dynamic labels in §2; Solar in §9.
  - 08 is layout's design record; 09 is the signal ladder; 13 is v1's game design; 14 its
    architecture; 27 the active plan (v1.4); 28 the Sluice's A–C retrospective; 90-later what's deferred.
- **Key code:**
  - `src/renderer/src/chart/fx/director.ts`: the choreography (a beat's accents, tiers, budget).
    Split 2026-10-10: `fx/moves.ts` (pursuit, orbit travel, radar pings, departures), `fx/ships.ts`
    (escorts, guest ships, tells), `fx/moments.ts` (protected moments, the eclipse), `fx/trails.ts`
    (jump trails), and `fx/timing.ts` (every timing and colour).
  - `fx/effects.ts`: the effect primitives.
  - `chart/framing.ts`: the fit, frame-the-action and the follow camera's targets.
    `scenes/placement.ts`: screen-space placement (the PR lane, attached and tracked ships).
    `navSiblings.ts`: the breadcrumb menus.
  - `scenes/GraphScene.ts`: the glide layer, ownership, edge holds.
  - `labels.ts`: dynamic labels.
  - `src/shared/scene/projectScene.ts`: the radar and activity anchors.
  - `src/shared/playback/`: the schedule, highlights, clock, plan.
  - **v1:** `src/shared/engine/` (signals, moves, facts, the solar plan, pace, maneuvers,
    achievements), `src/shared/scene/project/{solar,lists}.ts`, `src/shared/packs/`,
    `src/renderer/src/theme/starChart/index.ts` (**the remix table**: 14 §8; its maneuvers,
    commands, entrances and `finales.ts` beside it), `chart/fx/v1/` (the interpreter), `chart/{overlays,labelTiers}.ts`, `chart/holo/` (the one expandable plate, 19 L2), `settings/`, `v1/`, and
    `playGate.ts` / `playHooks.ts`.
- **Commands:** `npm test` · `npm run e2e` (it builds `out/` first; while iterating, run the mapped
  specs and `npm run e2e:keystone`, tests/README.md) · `npm run dev` · `npm run gallery` ·
  `npm run drive -- <steps.ts>` · `npm run typecheck` · `npm run lint`.
- **e2e suites to start with:**
  - `tests/e2e/slice3a.spec.ts`: the radar, lead-in, hotkeys, highlights, recap, continuity, tiers,
    formation, dynamic labels, stills.
  - `tests/e2e/density.spec.ts`: the sizing harness.
  - **v1:** `tests/e2e/solar.spec.ts` (the play gate, VC-2, VC-3, mega-labels, contrast); the unit
    and golden files listed in [tests/README.md](../../tests/README.md) under *v1*.
