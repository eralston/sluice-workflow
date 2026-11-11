# Slice V1-W5-T1: Release check and sign-off

Run 2026-10-13, following [17 W5-T1](../17-v1-phases.md#w5-t1-release-check-and-sign-off). Before
the checks, an audit compared every task in 17 W0–W4 with the code and its slice note. The checks
below ran on the tree after the audit's fixes. **Waiting on HG-V4** (and the earlier gates HG-V2,
HG-V3 and HG-V3′, none signed off yet).

## 1. What was built
- **The audit.** Every **Creates** file exists, every **Modifies** edit is present, and nothing was
  cut (D14). The drift was in the docs. The plan was written before the layout's v4–v6 changes
  (one ring of seats, no free cap, platforms, stations half a planet) and before the art sessions of
  2026-10-12/13 (station forms, `attachment.merge` and Power link, stations beaming closes, idle
  life, entrances and the opening, homeworld titles, holo labels).
- **Docs corrected to the code:**
  - 17: as-built rows per task, and the new section *As built after W4*.
  - 14: status, §1.4 modules, the §2 shapes, §8 remix table, §9 D3/D4 superseded.
  - 03 §5d:
    - the solar plan as built;
    - the missing fields `activity`, `platform`, `solar.stations`, `merged`, `firstMerge`, `merges`;
    - floors, the star's radius, the placement seams, the theme's commands, idle life, the fence's
      `projectGuests`.
  - 05 §8: the rule lengths (emerge 1550, station jump-in 3400, beamed variants, settle never
    protected), and merges running past the episode budget.
  - 08 §7: the plan's numbers (v6, facility 260, seat gap 420); the moon ring marked superseded.
  - 06: holo labels on planets, stations and ships; station size; the v1 gallery.
  - 09 §9: a station's form isn't a rung.
  - 12: ten new glossary entries.
  - 13: §4 details, three §9 rows, the latch colour (hero blue, not cyan).
  - 18 A6: the per-pack thresholds (18 is now archived; they live in 13 §8).
  - 90-later: two stale rows removed (guests and the asteroid's descent are both built); the new
    list *v1 rough edges*.
  - tests/README: the solar drive steps, with their knobs.
  - The handoff: the commit ids, and the repo path.
- **Code fixes found by the audit:**
  - The map key no longer lists the four solar kinds outside Solar (`SOLAR_KINDS` in `vocab.ts`,
    `MapKey.tsx`), so v0's key is as it was. `slice1.spec.ts` asserts it.
  - `commands.test.ts` checks the theme's own commands (`theme/starChart/commands.ts`, `entrance.ts`)
    for a resolving reduced-motion substitute (INV-20), not only the seeds.
  - `tests/e2e/zzdbg.spec.ts`, a committed debug walk with no assertions, is deleted.
  - Stale comments: `DomainPack.crowd` is marked unused since v4 (the field stays, so packs still
    type-check). The comments in `slots.ts`, `plan.ts`, `version.ts`, `view.ts` (`merged`),
    `hierarchy/types.ts`, `project/solar.ts`, `holoLabel.ts` and `placement.ts` were corrected too.

## 2. Contracts changed
None in shape. `SOLAR_KINDS` is a new renderer constant. `DomainPack.crowd` keeps its type and is
documented as unused (03 §5d, 14 §2.2).

## 3. Checks
| Check | Result |
|---|---|
| Base | Pass: typecheck and lint clean; 806 of 806 unit tests (51 files); goldens unchanged |
| `npm run fixtures` | Pass; output unchanged |
| Full | Pass: 133 `parallel` + 21 `alone`. The run before the fixes had one timeout, `activity.spec.ts`'s pictures-401 case, which passed 3 of 3 on a repeat (in 90-later's rough edges) |
| Rerun after the milestones, the finale and the doc overhaul (2026-10-13, evening) | Base pass: 838 of 838 unit tests (52 files, with `docTables.test.ts`). Full pass: 133 + 21. `gallery-v1`'s stations family had grown to about 50 s against a 60 s limit and timed out under the full run; its timeout is now 150 s |
| A fresh profile boots into Solar | Pass, in fixture mode: `solar.spec.ts` launches unpinned on a fresh `userData` and lands in Solar. In ADO mode the code takes the same path (`main/index.ts`: no valid pin, so `solar`; the stored paradigm isn't read), and a fresh ADO profile opens on the empty cosmos. No spec covers an unpinned ADO start, so it's part of your live check |
| `STAR_CHART_PARADIGM=sprints` and `=backlog` behave as v0 | Pass: the whole v0 suite runs pinned `backlog` (`launch.ts`), with its goldens and pixel baselines; `sprints.spec.ts` pins `sprints`, including "a pin wins over the stored value" |

The tree also holds another session's uncommitted art edits (the station's mining beam:
`theme/starChart/commands.ts`, `maneuvers/{landing,powerLink,stationFire}.ts`, and lines in 02, 06,
13 and the handoff). The checks above ran with them in place.

## 4. Human gates (fixture data only, INV-18)
In order (the handoff has the details):
1. **HG-V2**, the rules: 12 and 13 (with the achievements, folded from 18, in 13 §8), and their open questions.
2. **HG-V3**, the board: `npm run drive -- tests/drive/steps/solar-episode.ts --paradigm solar`.
3. **HG-V3′**, the maneuvers: `npm run gallery`, the maneuver demos. A new question for you (09 §9):
   the Wars ring's seam breath runs on a 12 s sine, the same tempo as Ready's breath.
4. **HG-V4**, v1 sign-off:
   - the episode, Settings and achievements on fixtures;
   - then the live checks in ADO mode (SDLC pack), including a fresh-profile start, reported as
     pass or fail only.

## 5. Known limitations and open questions
- The rough edges are listed in 90-later's *v1 rough edges*. None blocks sign-off.
- `gallery/v1/stations.ts`'s scale-cell note still says "3–4× a captain ship's length". That file
  belongs to the art effort (17's fence), so it's left for the art owners.
- A mistyped `STAR_CHART_PARADIGM` falls back to Solar silently.
