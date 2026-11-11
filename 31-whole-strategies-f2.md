# 31 — Whole strategies, first run: F2 alone

**Status:** planned 2026-11-08; not yet run. This is the first stage of [30](30-whole-strategies.md): one item, F2
(*Summon on the fly*), built again from its start commit by every strategy, under the same conditions, and scored
blind. It also validates the replay bench (roadmap H26) before anything larger is spent on it. Read doc 30 for the
arms, the constants, the rubric and the decision rules; this doc holds only what's specific to F2.

## 1. Why F2 first

- **Medium risk, and typical.** F2 changes every summon's schedule (`facility.enter`), the pursue command, a 15 §7
  row and the goldens. It's one of the kinds of item a routing rule would cover.
- **Cheap and short.** The real run cost $8.15 over 66 minutes of agent time.
- **A clean outcome.** It passed its first review with two Minors and had no escapes, so nothing ambiguous sits in
  the answer. It has no seeded defects, so this stage tests cost, time and acceptance, not defect-catching. F3–F5
  test that.
- **A calibration point.** A1 (F's own sluice) replaying F2 should land near the real run. If it doesn't, the bench
  is measuring the environment.

## 2. The real run (the reference)

From `docs/progress/v1.4/ledger.jsonl` and `work/F2/`:

| Role | Model | Calls | Time | Cost | Output tokens |
|---|---|---|---|---|---|
| planner | Opus 5.5, high | 79 | 16 min | $5.27 | 78.9k |
| builder | Sonnet 5.5, medium | 70 | 35 min | $1.48 | 38.9k |
| reviewer | Opus 5.5, high | 33 | 15 min | $1.40 | 19.2k |
| **Total** | | 182 | 66 min | **$8.15** | |

- **Outcome:** accepted at review-1, with 0 Blockers, 0 Majors, 2 Minors and 1 Nit. Committed as 4f6990a (32 files,
  +987/−426).
- **Design:** `PaceRule.passes` on `facility.enter`; a summon takes 2515 ms, down from 4835.
- **Story time:** Pulsar −8.4 s, Convoy −7.0, Harbor −3.3, Comet −0.3 to 45.5 s; Quasar +3.7 and Meteor +4.1 from
  the speed lever's re-fit.
- **The orchestrator's spend** isn't in the ledger. It's estimated in A1's replay from that session's own
  transcript.

## 3. Inputs (constants for F2)

| Input | Value |
|---|---|
| Start commit | **61e4958** (`sluice(F1)`), ancestors only |
| Scope text | `### F2 Summon on the fly` in `docs/27-v1.4.md` at 61e4958 (State: open). The Decided paragraph and the four acceptance lines are the brief, unchanged |
| Its acceptance | (1) a gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors; (2) a unit test showing the summoner's pursue has no hold between its flight and its next place, and the station's act starts within 50 ms of the blip; (3) 15 §7's row and `docTables.test.ts`, with the schedule goldens updated and each change named; (4) the ledger shows the saving per pod |
| Sluice for A1 | `.claude/` at 61e4958 (planner Opus/high/80 turns, builder Sonnet/medium/200, reviewer Opus/high/120) |
| Sluice for A5 | `.claude/` and `sluice/` from 2515124 (the retro's HEAD), copied over the clone's |
| Known flakes | `demo.spec.ts:439` (expanded plate timeout, known since F2), `explore.spec.ts:123`, `perf.spec.ts`'s seek check, the galaxy double-click "not stable" under load |
| Questions an arm may ask | answered from 27's Decisions as at 61e4958 if covered; otherwise "use your judgment, and record the decision" (the real F2 raised none) |

## 4. The bench, built first

The bench is built once and committed to this repo, in `bench/`, before any run. It's the H26 instrument. Runs
live outside the repo and outside OneDrive, under `~/sluice-bench/F2/<arm>-<run>/`.

| Piece | What it does |
|---|---|
| `bench/clone.sh <item> <arm> <run>` | `git init` a new folder, then `git fetch` this repo's start commit (ancestors only) and check it out on a `bench` branch. It copies one prepared `node_modules` in (`cp -c`, an APFS clone), applies the arm's `.claude/` (A5: today's), and writes `manifest.json`: commit, arm, run, start time, model IDs, user settings' hash |
| `bench/cost.mjs <clone>` | finds the run's transcripts (`~/.claude/projects/<encoded clone path>/`, main session and subagents) and prices them with `lib.mjs`'s `sumUsage`/`priceOf`. Writes `cost.json`: $ by role and model, calls, wall clock, agent seconds, and context per call (mean, p95, peak) |
| `bench/probes/F2/` | the four acceptance probes (§5), written against behaviour, from the test hooks that exist at 61e4958 (`displayed()`, `motions()`, `fx()`, `beatTimes()`, `stepBeat()`, `setScheduleMs()`) and the gallery |
| `bench/score.mjs <clone>` | runs the hard gates, the probes and the full e2e suite (re-running new failures once alone), then F2's own tests from 4f6990a, which are informative and not scored. Writes `score.json` with every part of doc 30's rubric except the judge and the human |
| `bench/judge.md` | the judge's fixed prompt (30 §6) |
| `bench/strip.sh <clone>` | the diff from the start commit, without `docs/progress/**/work/`, packets, run records or anything that names the arm. This is what the judge sees |

**Bench check (before any arm runs):** the probes and `score.mjs` are run on the **real** accepted commit 4f6990a.
They must pass and score the real F2's acceptance and regressions in full, and they must *fail* on 61e4958 (the
start), which shows each probe measures what it says. Budget for building the bench: **up to $15**, separate from
the runs' cap.

## 5. F2's acceptance probes (scored, 40 points, 10 each)

| # | Acceptance line | Probe (implementation-agnostic) |
|---|---|---|
| P1 | The jump-in cell, full and reduced motion, no console errors | the gallery's jump-in (station arrival) cell renders in both motion modes; the console has no errors; the cell's summoner keeps moving through the arrival (positions sampled per frame) |
| P2 | No hold between flight and next place; the act within 50 ms of the blip | in the app, on a pod with summons (Harbor, Pulsar): step a summon beat at rate 1 and sample the summoner's position each frame. Its speed never drops to zero between leaving its place and reaching its next one, and the station's arrival effect starts within 50 ms of the summoner's blip. Plus: the run's own unit test for this exists and passes |
| P3 | 15 §7's row, `docTables`, goldens named | `docTables.test.ts` passes; the jump-in's 15 §7 row changed and matches the code's phases; every golden file the run moved is named in its commit message or record |
| P4 | The ledger shows the saving per pod | `npm run pacing` regenerates; the ledger has a per-pod row for the change; a summon's total duration is under 4835 ms; Comet, Pulsar, Convoy and Harbor all play shorter in story time than at 61e4958 |

**The other parts** follow doc 30 §6 unchanged:
- No regressions (20): the full suite against 61e4958's baseline.
- Defects (20): the blind judge.
- Rules and docs (10): 03, 05 and 13 amended where F2's Decided says, R8 and R10 (the blip and the arrival in the
  same hue and ring shape, read as one cause and effect).
- The human's look (10): stills of the approach, the blip with the arrival, and the glide on, shot by a fixed drive
  at 1440×900 and 1024×640 and renamed to random codes before the human sees them.

## 6. The runs

| Arm | Runs | Launch (in a fresh Claude Code session, with the clone as its working folder) | Estimate per run |
|---|---|---|---|
| A1, F's sluice | 2 | `/sluice run docs/27-v1.4.md F` with: "item F2 only; stop after it's accepted and committed; no block audit" | $8–10 |
| A2, one conversation | 2 | "Build item F2 of docs/27-v1.4.md (`### F2 Summon on the fly`) in this conversation, without subagents. Read CLAUDE.md and the docs it names. Meet every acceptance line, run typecheck, lint, the unit tests and the mapped e2e specs (tests/README.md), and commit when done." | $3–6 |
| A3, Ultracode | 2 | "ultracode: build item F2 of docs/27-v1.4.md with a workflow: build, then a fresh adversarial review against its acceptance, then fix what it finds. Run the checks above. Commit when done." | $6–9 |
| A4, tests first | 2 | an orchestrating session launches three fresh agents in turn. A test writer (Opus, high) writes F2's acceptance as failing tests, and commits them as `bench: tests`. A builder (Sonnet, medium) iterates until those tests and the gate pass; any change to the tests must be justified in its record. One reviewer (Opus, high) checks the diff against the acceptance. Fixes are made once, then it commits | $5–8 |
| A5, today's sluice | 1 | as A1, in a clone with today's `.claude/` and `sluice/` | $8–10 |

**Order:** run 1 goes A1 → A2 → A3 → A4 → A5. Run 2 goes A4 → A3 → A2 → A1. Runs go one at a time, with 10
minutes or more between two runs of one arm. **A1's run 1 goes first, as the calibration:** if its cost isn't
within 30% of $8.15, or it doesn't reach a passing review, stop, and find the environmental difference before
going on.

**The judge** runs at the end, on all nine stripped diffs, in shuffled order, in one sitting: about $1.50 each.

**The human** rates the stills once all runs are done, in one sitting, blind.

## 7. Budget and stopping

| | $ (list-price equivalent) |
|---|---|
| Bench build (§4) | up to 15, separate |
| Run 1 of every arm (5 runs) | about 30–43 |
| Run 2 of A1–A4 (4 runs) | about 22–33 |
| The judge (9 diffs) | about 14 |
| **Cap for the runs and the judge** | **80** |

- Before each run, check `node .claude/sluice/budget.mjs` and the spend so far (the sum of every run's `cost.json`).
- If the next run's estimate would pass $80, stop: skip the remaining second runs in reverse order (A1's second run
  is kept last to drop), run the judge on what exists, and report.
- A run that blows past twice its estimate is stopped and recorded as such. Its cost counts.

## 8. What gets reported

`docs/progress/bench/F2/results.md` (committed):
- **One row per run:** arm, run, $, calls, wall clock, agent time, mean and peak context, human questions, fix
  rounds, Q and each of its parts, churn, U, and A1's calibration against the real run.
- **Per arm:** both runs side by side, and their spread.
- **The Pareto chart:** Q against $, one point per run.
- **The verdict by doc 30 §8's rules:** which arms meet the quality floor on F2, and whether any saves 25% or more
  against A1. It also says what A5 shows about the retro's changes.
- **The go/no-go for the full grid.** Go if:
  - the bench is calibrated (A1 within 30% of the real run, and it passes);
  - and an arm saves 25% or more at the quality floor, or an arm falls below the floor in a way that would matter
    at F3–F5's risk.

  Otherwise, stop. Log the result in the roadmap's H27, and keep the bench for H24.

## 9. What F2 can't tell us

- **Defect-catching.** F2 has no seeded defects, so a cheap arm may look as good as the sluice here and still miss
  F3's or F4's Blockers. That's why F2 alone can rule an arm *out* but never *in* for high-risk work.
- **Small differences.** With two runs, a saving under about 25%, or one Minor finding, is noise.
- **Long runs.** F2 is an hour, so context growth and hand-offs (H25) barely show.
