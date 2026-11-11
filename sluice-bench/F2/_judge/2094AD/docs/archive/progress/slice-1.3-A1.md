# Slice 1.3-A1: Halcyon Reach as four pods (the demo project)

**Status:** built 2026-10-27; waiting on **HG-A-demo**. Plan: [23-v1.3.md](../23-v1.3.md) Block A. Walk-through:
[demo-script.md](../../demo-script.md). Fixture data only (INV-18).

## 1. What was built
Halcyon Reach (`fixtures/scenarios/sprint-pods.ts`) is now one sprint (41) with **four saved pods**, each
denser than the last, for a demo that starts at All projects and drills in:

| Pod | Captains | Repos | What it shows |
|---|---|---|---|
| Comet | 1 (+ an outside reviewer) | 1 shared | one Story and one Bug through every rung; two merges, an outside captain jumps in each time; the planet complete and the region clear |
| Nova | 3 | 1 shared | 3 Stories / 3 Bugs / 2 + 2; they review each other; all three get a spotlight; two finish, one Bug stays open with its PR |
| Quasar | 6 + a manager | 10 | 3–6 items each; Stories span 1–3 repos with 1–2 PRs each; the manager reviews every PR, takes 5–8 Tasks and has no planet; one Story and one Bug reopen |
| Pulsar | 20 | 14 | 1–4 items each, 1–5 Tasks under others' work, 1–3 reviewers (mostly 2), ~20% closed with no PR; plus one Removed Story, one Rejected Bug, one Deferred Story, one abandoned PR, one unassigned Story |

Every Story and Bug has 1–5 Tasks. How:
- **A seeded generator** (`fixtures/scenarios/halcyon/gen.ts`): a plan per item (`planItem`: pure data, so tests
  read it) replayed through the existing fixture DSL (`emitItem`, `replay`). One fixed seed per pod
  (`pods.ts`), so the data is identical every run. Comet is written out by hand.
- **Variety is chosen, not hoped for.** A look comes only from a hash (INV-12): a handle fixes a ship and a
  world, a repo name a station. `scripts/find-cast.ts` searched name pools once and wrote
  `halcyon/cast.ts` (generated, committed): 32 people covering **9 of 9 hulls, 8 of 8 colourways, 3 of 3 world
  lines** (Pulsar's twenty alone cover all hulls and colourways) and 28 repos covering **9 of 9 station designs
  and guard counts 0–3**.
- **The old Halcyon Reach is kept, unchanged, as `sprint-mechanics`** (test-only): 14 unit test files and 9
  e2e specs check a carry-over, a mid-sprint Bug and a Story planned out, which the demo has none of. It keeps
  the project name, so fixture mode serves it *in the demo's place*: when it is the active
  `STAR_CHART_FIXTURE`, or with `STAR_CHART_PODS=mechanics` (`src/main/fixtures.ts`).
- New tests: `tests/unit/halcyonCoverage.test.ts` (23 checks: each pod's rules and every visual variant) and
  `tests/e2e/demo.spec.ts` (the four pods and their seats: 1, 3, 6, 20).

## 2. Contracts changed
- **03 §8:** the `sprint-pods` row is rewritten, a `sprint-mechanics` row added, the `scenarios` list and the
  served-scenarios text updated.
- No change to 02, 05, 06, 09 or 15; no constant changed.
- `board.test.ts` now covers both sprint scenarios, and its seek test has a 60 s timeout (it projects at every
  instant of the sprint, twice, and Pulsar has hundreds).

## 3. Checks
- `npm test`: 74 files, 1085 tests, all passing. The only golden accepted on purpose is `sprint-pods.scenes.json`
  (the demo's own). `sprint-mechanics.*` are the old files, renamed.
- `npm run typecheck`, `npm run lint`: clean.
- `npm run e2e`: 172 passed, 1 failed (`slice3a` "continuity", a speed threshold on orbit-week, which this slice does not touch). It passed on its own rerun, so it was load under four parallel workers. After the last change (the demo's own sprint clock in `src/main/fixtures.ts`), `demo` and `sprints` (12 tests) were rerun and pass; the full suite was not rerun after it.
- AC-27 (ingest through the fake ADO equals `toHistory`) passes on both scenarios.

## 4. Human gates
**HG-A-demo.** Run `npm run dev` and follow [demo-script.md](../../demo-script.md): All projects → Halcyon Reach →
Sprint 41 → each pod. Watch for:
- each pod reads denser than the last (planets: 1, 3, 6, 20; stations: 1, 1, 10, 14);
- Comet's two merges with the outside captain, and the final victory;
- Nova's spotlight, one captain at a time, and the one Bug left standing;
- Quasar's manager (reviews, no planet) and the two reopens;
- Pulsar's mix of ships and stations, the no-PR closes, and the odd ones out;
- whether the lengths below are acceptable at the rate you'll use.

## 5. Known limitations and open questions
- **Playback is long in the big pods.** At 1×, measured on the schedule: Comet ~50 s, Nova ~3½ min, **Quasar
  ~17 min, Pulsar ~10 min** (the densest existing regions, Harbor and Meridian, are ~3½ min). The schedule never
  cuts merges or essential moments (05, B-7), so 6 captains × 3–6 items × 1–3 repos × 1–2 PRs plays long. At 4×
  these are ~4 and ~2½ min. If that's too long, the cheapest trims are in `pods.ts` (PRs per repo and repos per
  Story in Quasar; Pulsar's PR rate), not a change to the engine. This is the question for the gate.
- **Quasar runs longer than Pulsar** because the brief gives Quasar's Stories 1–3 repos with 1–2 PRs each and
  Pulsar's nothing; Pulsar is denser in captains, stations and kinds of object, not in minutes.
- **Spotlight rotation shows up in Nova (all three captains), less in the big pods.** The engine picks whoever
  has the fewest named turns plus spotlights; in Quasar's ~200 named turns a handful of spotlights doesn't
  move the counts, so the same captain wins most days. That is the engine's rule, not a data problem.
- Pulsar's extra items (Removed, Rejected, Deferred, abandoned PR, unassigned Story) go beyond the brief, to
  show every rung and the frontier belt. They are easy to drop (`tweak` in `pulsar()`).
- The old "unsaved Quasar Pod" (adding a pod from the breadcrumb) is now only in `sprint-mechanics`; in the demo
  all four pods are saved, as asked.
- Dates are Sprint 41 as before (14–28 Sep 2026), so "now" for the fixture is 28 Sep.
- Not yet looked at by eye: stills of each pod (the drive script) are part of the gate.
- **Fixed on the way: the demo's sprint was cut to one week.** Fixture mode asks for the active scenario's range
  (orbit-week's single week), so Sprint 41's second week never played. The demo now keeps its own sprint clock,
  as the v1 scenarios do (`ownClock` in `src/main/fixtures.ts`).
- Stills of every pod (`npm run drive -- tests/drive/steps/demo.ts --paradigm solar --name demo`) are in
  `test-results/drive/demo/` (gitignored).
