# 30 — Whole strategies: building the same work four ways

**Status:** planned 2026-11-08, at v1.4's retro. Nothing here has run yet. This is the design of the comparison
the roadmap calls H27 (with its instrument, H26). The first run, F2 alone, is planned in [31](31-whole-strategies-f2.md).
Background: [28](28-v1.4-sluice-retrospective.md) (the sluice's A–C retro), [29](29-block-f-spend.md) (block F
against Ultracode), [21](21-ultracode-run.md) (the first Ultracode run), and `sluice/docs/roadmap.md` (*The next
leg*, H24–H27).

## 1. The question

Star Chart has been built in four ways: the older slice process, Ultracode workflows (v1.1), the sluice (v1.4),
and one-off requests in a single conversation. Each comparison so far was loose: different items, different
months, different models (29 §*Why the comparisons are loose*).

**What we want to know:** for a given kind of item, which strategy gets work that's *as good* for the *least*
time, cost and human attention? Does the sluice's fresh planner and reviews pay for itself on every kind of item,
or only on the risky ones?

**How:** take a scope that's already been built, reviewed and signed (v1.4's block F), go back to each item's
start commit, and build it again with each strategy, under the same conditions. Then score every result the same
way, blind to which strategy made it.

## 2. Foundations

- **A finished scope is a test set.** Block F has, for every item:
  - its start commit and the scope text the builders saw;
  - its accepted commit, the tests added for it, the review findings, the human's sign-off and its escapes.

  So there are known answers: the defects real reviews caught (§9), the defects that got through (escapes), and
  the real cost and time from the ledger.
- **Replay, don't re-live.** A live comparison (one block one way, the next another) mixes the strategy with the
  items, and needs blocks we can't afford to spend twice. A replay holds the item fixed and changes only the
  strategy.
- **Matched inputs.** Every arm gets the same start tree, the same scope text, the same project rules
  (CLAUDE.md, the docs) and the same models on offer. Only the *orchestration* differs: who plans, who builds,
  who reviews, how many agents, which model at which effort.
- **Blind scoring.** One fixed judge prompt grades every result. Files that would name the strategy (packets,
  work folders, run records) are stripped from what it sees. The human rates stills without knowing the arm.
- **Small samples, stated.** Each cell runs twice at most. That can show large effects (a defect missed, a cost
  halved, a 2× time difference), not small ones. The roadmap's noise rule applies: a difference of one or two
  items, or under about 20% in cost, is noise.
- **Staged spending.** A full grid on F costs roughly 7–8 typical blocks (§9). So F2 goes first (doc 31), and
  the grid runs only if F2 shows an effect big enough to matter.

## 3. The arms

| Arm | Strategy | Plans | Builds | Reviews | How it's launched |
|---|---|---|---|---|---|
| **A1** | **F's sluice** (the control) | `planner` (Opus, high) | `builder` (Sonnet, medium; Opus at large) | fresh `reviewer` (Opus, high); fixer and re-plan loop | `/sluice run` in a clone whose `.claude/` is as it was at the item's start commit |
| **A2** | **One conversation** | the session itself | the session itself | none (self-check only) | one fresh Claude Code session (Opus, default effort) asked to build the item, run the checks and commit; no subagents |
| **A3** | **Ultracode workflow** | the workflow's script (the session writes it) | workflow agents | adversarial review agents in the script | one fresh session, with `ultracode` in the prompt, asked to build and review the item |
| **A4** | **Tests first, then hill-climb** | a test writer turns the acceptance into failing tests and probes | a builder iterates until they and the gate pass; it may not weaken them | one fresh reviewer, once | one orchestrating session that launches three fresh agents in order |
| **A5** | **Today's sluice** | as A1 | as A1 | as A1, plus H13's still at the smallest window, the `lens` field, the tree guard | as A1, with `.claude/` and `sluice/` from the retro's HEAD (2515124). F2 only unless F2 shows a difference |

A1 also checks the bench itself. If A1's replay of F2 lands far from F2's real cost or outcome, the bench is
measuring the environment, not the strategy (§10).

## 4. Constants, variables and nuisances

**Held constant** (recorded in each run's manifest, so a later reader can check):

| Constant | Value or rule |
|---|---|
| Start tree | the item's start commit, its ancestors only (no later refs, no reflog), with no work folder for the item |
| Scope text | the item's heading in `docs/27-v1.4.md` as at the start commit. For F5 only: its re-scoped text (2026-11-08), with State lines and later Decisions rows removed |
| Project rules | `CLAUDE.md`, `docs/`, `.claude/sluice/project.md` as at the start commit (A5 swaps in today's sluice and notes, by design) |
| Models | Claude Opus 5.5, Sonnet 5.5 and Haiku 5.5, the same IDs as F used; the model ID is recorded per call from the transcripts |
| Machine | this Mac, Node 24 (Volta), the same `node_modules` (one `npm ci`, then copied per clone), Electron 44 |
| Fixtures | `fixtures/scenarios/` at the start commit (INV-18: fixture data only) |
| Checks | the project's commands at the start commit: typecheck, lint, unit, the mapped e2e specs, keystone, the full suite |
| Judge | one fixed prompt, Opus at high effort, fresh per run (§6) |
| Scoring | the bench's scripts at one commit, the same for every arm |
| User settings | `~/.claude/` settings and the user-level CLAUDE.md, recorded at the start and unchanged during the trial |
| Time zone | `TZ=UTC` for e2e (as after block F's audit); the drive's window sizes 1440×900 and 1024×640 |

**The one variable:** the strategy, meaning the orchestration in §3 and whatever settings that arm owns (models
and effort per role, turn caps, number of agents, review rounds). An arm may not change the inputs above.

**Nuisances, and how each is handled:**

| Nuisance | Effect | Handling |
|---|---|---|
| Model nondeterminism | the same arm can differ run to run | two runs per cell; report both, never just the mean |
| Prompt cache | a warm cache makes a later run cheaper | each run in its own clone path (its own prompt prefix), with 10 min or more between runs of one arm |
| Order | later runs benefit from a quieter machine or a fixed flake | alternate the arm order: run 1 is A1→A5, run 2 is A5→A1 |
| Load flakes | e2e failing under load | runs one at a time; a run's failure is re-run once alone before it counts; known flakes listed per item |
| API or network outage | a run killed partway (doc 21 lost 6 agents) | an interrupted run is discarded and re-run, and the loss is noted |
| Contamination | an arm reads the answer | ancestors-only clone; no `review/`, `test-results/` or work folder for the item; runs outside OneDrive, under `~/sluice-bench/` |
| Memory | Claude Code's per-project memory | each clone path is a new project, so no memory loads; the user-level memory is a constant |
| Judge variance | the judge grades differently on another day | the judge runs on every diff in one sitting, at the end, in a shuffled order |

## 5. What's measured

From each run's transcripts (`~/.claude/projects/<clone path>/`, main session and subagents) and its clone:

| Measure | How |
|---|---|
| **Cost** | list-price-equivalent $ by role and model, from the transcripts' usage, priced as the ledger prices (`lib.mjs`'s `sumUsage` and `priceOf`); also in windows ($27 a window) |
| **Calls** | model calls by role |
| **Wall clock** | from the first prompt to the accepted commit |
| **Agent time** | the sum of each agent's active seconds (overlapping agents count twice) |
| **Context (memory)** | tokens held per call (input + cache read + cache write): mean, p95 and peak, by role. This is the "memory" a strategy spends; machine RAM is recorded but not scored, as e2e dominates it whatever the arm |
| **Human attention** | the questions an arm asks the human, and the minutes they take to answer (the trial answers from the item's real Decisions where one exists) |
| **Rework** | fix rounds, re-plans, and $ spent after the first build |
| **Churn** | lines changed, files outside the scope's *Touches*, golden files moved |
| **Health** | `health.mjs` on the touched files, before and after: functions over 15 complexity, files over 800 lines |

## 6. The assessment rubric

Every run's accepted commit gets a **quality score Q, out of 100**. Hard gates come first.

**Hard gates** (fail any one and Q is 0, though cost and time are still recorded):
- typecheck, lint and unit tests pass;
- no real ADO data, PAT or write to ADO; `src/shared/` stays pure (CLAUDE.md's hard rules);
- the run finished, meaning it ended with a commit it claims is done.

**Scored:**

| Part | Points | How it's scored |
|---|---|---|
| **Acceptance** | 40 | Each acceptance line of the item gets an even share, checked by the bench's own probe (objective, implementation-agnostic; doc 31 lists F2's). Met is full share; partly met is half; missing is zero |
| **No regressions** | 20 | The full e2e suite against the start commit's baseline. −5 for each new failure that persists when re-run alone; known flakes are excused |
| **Defects** | 20 | Starts at 20. A blind judge review: −20 a Blocker, −10 a Major, −3 a Minor, floored at 0. A **seeded defect** (a real defect a review once caught, §9) still present counts as a Blocker. An escape probe (§9) that fails counts as a Major |
| **Rules and docs** | 10 | The normative docs amended where the code departs (02, 03, 05, 13, 15), `docTables` green, the standing rules the item names (R1–R14) held; −2 for each lapse the judge or a probe finds |
| **The human's look** | 10 | The human rates the item's stills 0–3 without knowing the arm (does it do what the scope asked, and read well?), scaled to 10 |

**Recorded, not scored:** churn, health deltas, and auditability, rated 0–2. Auditability asks whether a
later reader can tell what was decided and why from the commit and its files. The sluice's records are its
strength here, and a trade, not a gift: they cost tokens.

**The judge:** a fresh reviewer, Opus at high effort, with one fixed prompt. It gets the item's scope text and
acceptance, the project rules, and the diff from the start commit with every packet, work folder and run record
removed. It writes findings with severity and evidence, as `formats.md` defines. Each finding is checked
against the code before it's scored. A finding without evidence isn't a finding.

## 7. What we minimize, what we maximize

| Minimize | Why it matters |
|---|---|
| **Cost** ($, windows) | the usage window is the binding limit: a block like F used 5.7 windows |
| **Wall clock** | how long the human waits for an item, including overnight runs |
| **Human attention** | questions, sign-offs, and runs that need watching; the scarcest input |
| **Context held** | long contexts cost more per call and degrade attention; F's planner reached 187k a call |
| **Rework** | fix rounds and re-plans are cost that a better first attempt avoids |
| **Churn** | changes outside the item make later items harder (and reviews longer) |

| Maximize | Why it matters |
|---|---|
| **Quality Q** | the work is the product; escapes reach the user |
| **Seeded-defect catch** | the clearest test of a review: a real defect, known to be findable |
| **First time right** | a pass at the first review is both cheaper and a sign the approach was right |
| **Repeatability** | two runs of one arm that agree make the arm predictable to plan around |
| **Auditability** | the next session (or person) picks up from the record, not from memory |

## 8. The trade-off, and how a conclusion is reached

In practice these pull against each other. Every review, plan and record that raises Q and auditability also
costs tokens and time. So the conclusion can't be one weighted number on a sample of two. It's a set of rules,
written down before the runs:

1. **Quality is a floor, not a currency.** An arm qualifies for a kind of item only if, on every run:
   - its Q is within 5 points of the control's (A1);
   - no seeded defect survives to its accepted commit;
   - no escape probe fails that A1's doesn't.

   A defect in front of the user costs trust, which no saving buys back. The roadmap prices an escape's token
   cost at $4–5 only to show how small that part is.
2. **Then cost, with a threshold.** Among qualifying arms, prefer the cheapest if it saves **25% or more** per
   item against A1 (H27's success line). Under 20% is noise and changes nothing.
3. **Then wall clock, then human attention**, as tie-breakers, each needing a 2× difference to count.
4. **Draw the Pareto front** (Q against $ per item, one point per run) for the record, so a reader sees the shape,
   not just the verdict.
5. **One scalar only for tuning.** When H24 hill-climbs settings on the bench (after this), it needs one number:
   **U = Q − 2 × $ − 0.1 × wall-clock minutes**. The weights are fixed now: one Major (10 points) is worth about
   $5, the cost of a fix and review round; an hour is worth about $3. U is never used to accept an arm that fails
   rule 1.
6. **Route by kind, not by winner.** The likely outcome isn't "one strategy wins". It's a routing rule: say, A2 or
   A3 for fixtures and docs, and the sluice where seek, play, labels or goldens are touched. That's 29's
   suggestion, now tested.

**What would change the process:**
- an arm that meets rules 1–2 on medium items over the full grid's runs becomes the default for those items;
- an arm that fails rule 1 on a kind of item is ruled out for it, and the defect it missed becomes a project lens;
- if A5 beats A1 on Q at equal cost, the retro's changes are confirmed; if it costs more for no Q, they're
  revisited.

**What the experiment itself costs, against what it can return:** the full grid is about $700–900, roughly 7–8
reference blocks of $106. A 25% saving on the half of items that are medium risk returns about $13 a block, so the
grid pays back in tokens alone only over 50 blocks or more. Its value is the decision. Should the sluice stay the
default, or route by risk? And it gives a bench H24 and H25 can then use cheaply. That's why F2 runs first, for
about $80, and the grid only if F2 shows a 25% or larger difference, or a quality gap.

## 9. The full grid on F

The items are F's scope items, not its splits, because a strategy decides its own split. Each item replays from
its real start commit, so the items are independent, and every arm gets the same predecessor code.

| Item | Start commit | Accepted (real) | Real cost · agent time | Risk | Seeded defects (a real review or audit caught them) | Escape probes |
|---|---|---|---|---|---|---|
| F1 bulk-PR fixture | 8b3cadb | 61e4958 | $7.76 · 74 min | fixture | none | — |
| F2 summon on the fly | 61e4958 | 4f6990a | $8.15 · 66 min | schedule, medium | none (passed first review; 2 Minors) | — |
| F3 summon chains | 236052b | 312a798 (F3a 4dbec55, F3b) | $28.97 · 5 h | schedule, high | Meteor's PR openings not joined to the run (F3a r1 Major); Pulsar's volley shows 5 labels (F3a r2 Blocker); the finale's roll call capped at 4 (F3a r3 Blocker); a summoner new to the region invisible (F3b r1 Major) | — |
| F4 charge runs | 312a798 | 96575ca (F4a–c) | $44.67 · 16 h | schedule and layout, high | a kept run dropped by `volleysOf` (F4a r1 Blocker); 16 of 37 strands fire (F4b r1 Blocker); the transformation on the wall clock under tempo (block F audit Major) | the held charge's legibility (flagged, carried) |
| F5 dense regions scroll | 66f5ac6 | cc67795 | $19.56 · 3 h | layout and camera, large | a stepped beat leaves crew off screen (build-1 block); the camera hold drops the run's board shot (r1 Major); the page's pan limit resets (r1 Minor) | the scrollbar against the zoom buttons (final-check escape) |

Each seeded defect becomes a **probe**, a test that fails if the defect is present, written against behaviour, not
the item's own code. Each escape becomes a probe the same way. The real reviews found them, so a strategy's own
review gets credit for finding one before its commit.

**The grid:** 5 items × 4 arms (A1–A4) × 2 runs = 40 runs, plus the judge on each. A5 joins only if F2 shows it
differs from A1.

**Estimated cost:**

| Arm | Estimate per run of F |
|---|---|
| A1 | about F's real $117 (with the audit) |
| A2 | $35–70 |
| A3 | $90–110 (29's matched figure: the sluice cost about 1.15× Ultracode, so about 0.87× the sluice) |
| A4 | $60–90 |
| Judge | $8 a run of F (5 diffs) |

That's about $700–900 for two runs, or 26–33 windows. Wall clock: F took 30.7 h of agent time for the sluice, so
the grid is several days of serial running. It runs in the background; the human answers only questions an arm
raises that the item's real Decisions don't already answer.

**Order:** F2 (doc 31) → go/no-go → F1 and F5 (cheap, and one is high-risk layout) → F3 and F4 (the dear ones).
Stop after any stage that already settles the question.

## 10. Threats to validity

- **One project, one block.** F is Star Chart's hardest block. Hold out one E item (E6a, a large engine item) as a
  check, so tuning doesn't fit F alone.
- **The models remember nothing, but the docs do.** The start tree's docs describe earlier items and decisions,
  some of which shaped F. That's the same for every arm, so it isn't a bias between arms, but it does make the
  task easier than a cold one.
- **Hidden tests can punish a different right answer.** The accepted commits' own tests are coupled to their
  design (test hooks, rule names). They're run and reported, but not scored. The scored acceptance probes test
  behaviour only.
- **The control isn't the past.** A1 replays F's sluice with today's API, cache behaviour and machine. If A1's F2
  is far from the real $8.15 or the real outcome, it's the environment that differs, and every comparison rests on
  A1's replay, not on the real F.
- **The human's look is one rater.** It's scored, but at 10 points, and blinded.
- **The judge is a model.** Its findings are verified against the code before they count, and it's held fixed.

## 11. After the comparison

- **H24 (roles):** with the bench validated, hill-climb each role's model, effort and turn cap on U, one role at a
  time, the planner first (27% of v1.4's spend; on F2 it cost $5.30 against the builder's $1.50). Score on the
  held-out item before keeping any setting.
- **H25 (sessions):** test context hand-offs and per-block orchestrator restarts on the bench once D1's `next.mjs`
  exists.
- **The routing rule** (§8, rule 6) goes into the design doc and the planner's tier rules, if the grid supports one.
