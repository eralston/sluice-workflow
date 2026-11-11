# 20 — Agent workflows: how this project uses them

**Status:** written 2026-10-13, while the v1.1 build workflow was running. Every link in §9 was fetched
and checked against what this doc cites it for on that date. The pages show few dates, so re-check
version-specific details (limits, flags) before you rely on them.

This doc explains the technique used to build v1.1 ([19](archive/19-v1.1.md)): a scripted **workflow** that
runs many Claude subagents, with an **adversarial review** after each piece of work. It covers the
pieces Claude Code provides, the worked example from this repo, why adversarial review works, when
not to use any of it, and a checklist to reuse. It's a learning reference, not a product doc: nothing
here changes how the app behaves.

---

## 1. The short version

A **subagent** is a separate Claude with its own fresh context window. It gets a task, does the work,
and returns only a summary. A **workflow** is a small JavaScript program that decides which subagents
run, in what order, and what happens to their results. The program holds the plan, the loops and the
intermediate results, so the main conversation holds only the final answer ([Claude Code:
workflows](https://code.claude.com/docs/en/workflows)).

The pattern used for v1.1, per item:

```
 plan (19) ──▶ implement ──▶ adversarial review ──▶ fix (only if confirmed findings) ──▶ next item
                 │                 │                     │
              one agent        a fresh agent:          one agent, given the
              with tools       sees the result and     findings; re-runs the
              and tests        the criteria, not the   checks it touches
                               author's reasoning
 after all items: full test suite ──▶ three-lens audit (parallel) ──▶ fixes ──▶ review set for the human
```

Two ideas carry most of the value:
1. **The one doing the work isn't the one grading it.** A model reviewing its own output, in the same
   context, is a weak check. A separate reviewer with a fresh context, clear criteria and real tools
   (tests, builds, screenshots) is a strong one. §4 covers the evidence.
2. **The plan lives in code and in a doc.** The script makes the process repeatable (the same steps,
   the same checks, every item). The doc ([19](archive/19-v1.1.md)) is the contract each reviewer checks against.

---

## 2. The building blocks in Claude Code

| Piece | What it is | Use it when | Docs |
|---|---|---|---|
| **Subagent** | A Claude with its own context, system prompt, tools and permissions. Defined in `.claude/agents/*.md` (Markdown with YAML frontmatter) or built in (Explore, Plan, general-purpose) | A side task would flood the main conversation with searches, logs or file contents you won't need again. Only the summary comes back | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| **Dynamic workflow** | A JavaScript script that runs subagents: `agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`, with JSON-schema results. Runs in the background; resumable in the same session | The job outgrows a handful of subagents, or you want findings verified against each other: audits, migrations, cross-checked research, a plan drafted from several angles | [Dynamic workflows](https://code.claude.com/docs/en/workflows) |
| **Agent teams** (experimental) | A lead plus peer sessions that message each other and share a task list | Peers need to talk, e.g. competing hypotheses that try to disprove each other | [Agent teams](https://code.claude.com/docs/en/agent-teams) |
| **Worktrees** | A separate git checkout per session or subagent (`isolation: worktree`) | Parallel agents edit the same repo. Note `worktree.baseRef`: the default `fresh` branches from the remote's default branch; `head` brings your local, unpushed commits along | [Worktrees](https://code.claude.com/docs/en/worktrees) |
| **Headless mode** | `claude -p`, with `--output-format json --json-schema` for structured results | Scripts and CI, outside an interactive session | [Run programmatically](https://code.claude.com/docs/en/headless) |
| **Structured output** | Results validated against a JSON schema, re-prompted on a mismatch | Every orchestration step that a program reads back | [Structured outputs (Agent SDK)](https://code.claude.com/docs/en/agent-sdk/structured-outputs) |
| **Hooks** | Deterministic scripts on events (PreToolUse, Stop, SubagentStop…); exit 2 blocks | A rule must always hold, whatever the model decides (e.g. "tests pass before stopping") | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) |
| **CLAUDE.md, memory** | Standing instructions every agent inherits; advisory, not enforced | Project rules (here: no real ADO data, Pixi v8, values in 15) | [Memory](https://code.claude.com/docs/en/memory) |
| **Permissions** | deny → ask → allow rules; subagents use yours | Pre-approve what a long background run needs, so it doesn't stall on prompts | [Permissions](https://code.claude.com/docs/en/permissions) |

The decision guide [Run agents in parallel](https://code.claude.com/docs/en/agents) frames the choice
as three questions: who coordinates the work (you, Claude, a lead agent or a script), whether the
workers need to talk to each other, and whether they edit the same files.

**Opting in.** A workflow runs only when you ask: the keyword **ultracode** in a prompt you type, a
direct request ("use a workflow"), or `/effort ultracode` for every substantive task in a session. It
does not start from scheduled tasks, `-p` prompts or relayed comments ([workflows](https://code.claude.com/docs/en/workflows)).

**Limits worth knowing** (from the same page, as fetched): there's no user input mid-run (for
sign-off between stages, run each stage as its own workflow); 16 agents at once by default; 1,000
agents per run; `Date.now()` and `Math.random()` throw inside scripts so a resumed run repeats the
same calls. A *Large workflow* warning appears above 25 agents or 1.5M projected tokens. The docs
advise running a small slice first.

**Monitoring.** In the terminal, `/workflows` shows live progress. **In the VS Code extension it isn't
available** (found 2026-10-13). There, each run's `journal.jsonl` in its transcript folder gets one
line per agent start and result, and the session is notified when the run ends. You can also watch
the repo itself: here, each item writes `docs/progress/slice-1.1-<item>.md` and updates its State line
in 19.

---

## 3. The worked example: the v1.1 build

### Before any workflow: scout, plan, decide

The workflow ran only after three conversational turns of groundwork:
- **Scout inline.** Drive the app and take stills of each level, read the docs, read the code each
  note touches, measure contrast. That turned "the previews look wrong" into "the round reuses v0's
  `sprintField`; Harbor Pod shows 12 planets but has 4 homeworlds".
- **Write the plan as a contract.** [19](archive/19-v1.1.md) has the rules, the label hierarchy, each item
  (asked, today, proposed, departs from, docs to change) and the open questions with a recommendation
  each. The user answered the questions before anything was built.
- **Decide what the human must gate.** Look and feel (the tier colours, the station standby) ends in
  stills for the user (HG-L1, HG-P1, HG-M1), not in an agent's opinion.

This follows Anthropic's own order: explore, then plan, then implement, then commit; and "if you could
describe the diff in one sentence, skip the plan" ([best practices](https://code.claude.com/docs/en/best-practices)).

### Serial, not parallel, and why

The 11 items run **one at a time**. Every e2e run, keystone run and drive rebuilds the same `out/`
folder, so two agents testing at once would overwrite each other's builds and chase each other's
failures. The alternatives, and why they didn't fit:
- **Worktrees per agent.** The default base is the remote's default branch, so they'd miss the
  uncommitted plan (`baseRef: head` fixes that only for *committed* local work). Each would also need
  its own `node_modules`, in a OneDrive folder.
- **Parallel implementation with no builds, verified at the end.** Agents would be blind to their own
  regressions until the end.

The research workflow behind this doc, by contrast, **was** parallel: four read-only researchers and a
checker per source share no files. The rule of thumb: parallelise reads freely; parallelise writes
only with isolation, or by giving each agent its own files ([agents](https://code.claude.com/docs/en/agents);
Cognition's "writes stay single-threaded", §9).

### The shared brief

Every agent got the same preamble (`COMMON` in the script). It said:
- where the plan is, and to read all of it;
- to read the earlier items' notes and `git diff --stat` first, so it builds on the earlier items;
- which checks to run, and which *not* to run (the full suite is the final phase's job);
- the project's hard rules (values and their 15 rows together; v0 unchanged; art files off limits;
  fixtures only; never commit);
- to end with a handoff note in 17's format and a State line in 19;
- to report honestly.

This is the delegation brief Anthropic's research system found essential: "an objective, an output
format, guidance on the tools and sources to use, and clear task boundaries". Without one, agents
"duplicate work, leave gaps, or fail to find necessary information" ([multi-agent research
system](https://www.anthropic.com/engineering/multi-agent-research-system)). A subagent sees none of
the conversation, so anything it needs (paths, decisions, constraints) has to be in its prompt or in
a file it's told to read ([SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)).

### Structured results

Each stage returns JSON against a schema:

| Stage | Returns |
|---|---|
| Implementer | `state` (built, partial, blocked), `summary`, `filesChanged`, `checks` with results, `stills`, `openIssues` |
| Reviewer | `verdict` and findings: `severity`, `file`, `line`, `issue`, `evidence`, `fix` |
| Fixer | `fixed`, `skipped` with reasons, and `checks` |

The script branches on those fields: it runs a fix only when the review returns a medium or high
finding. A schema turns "the agent said it was fine" into data the program can act on, and it makes
agents state their check results explicitly ([structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs)).

### The reviewer's brief

The reviewer is told to be **adversarial**: "try to find what is wrong, missing or regressed", with
evidence (file:line, command output), across five checks:
1. **Spec:** against 19's item.
2. **Invariants:** against 02 (INV-14, INV-15, INV-19, INV-20, INV-21) and the contrast rules.
3. **Regressions:** the v0 views; existing interactions.
4. **Docs:** 15 rows, departures recorded.
5. **Reruns:** it reruns the tests itself and looks at the stills.

It is told: "report only real problems you can show", which guards against reviewers inventing gaps
(§4). It gets the implementer's report, but it reads the code and runs the tests itself rather than
trusting the report.

What it caught on L1 (all low severity, all real): the central star's label disappears in play;
the gallery cell doesn't sample what the chart draws for T1 and T3; compact plates draw 11 px, not
their tier's size; the handoff note's still paths were off; a 15 row still said `--mono`.

### The end of the run: three lenses, then the human

After the last item:
- **One verifier** runs the full suite once and fixes what v1.1 broke.
- **Three read-only auditors** look at the whole change in parallel, each through a different lens:
  completeness against 19, invariants and regressions, and docs and values.
- **A fixer** takes their findings.
- **A last agent** assembles the review set for the user: a guided drive through every item, with
  stills and the exact moments to watch.

Diverse lenses beat N copies of the same reviewer when work can fail in different ways (§4).
Multi-level verification (unit, spec, full suite, audit, human) answers a measured weakness of
multi-agent systems: verifiers that only do superficial checks (MAST, §9).

---

## 4. Adversarial review: why it works, and how to do it well

### The evidence

- **Self-correction alone is weak.** Without external feedback, models asked to check and revise
  their own reasoning got *worse* on every benchmark tested. The earlier reported gains depended on
  oracle labels telling the model when to stop. What does work is external feedback: code execution,
  tools, search ([Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798); survey: [Kamoi et al.,
  TACL 2024](https://arxiv.org/abs/2406.01297)).
- **Give the critic tools.** Critics that verify claims with tools (a code interpreter, search) improve
  output consistently ([CRITIC, ICLR 2024](https://arxiv.org/abs/2305.11738)). Agents that reflect on
  real test results reached 91% pass@1 on HumanEval ([Reflexion, NeurIPS 2023](https://arxiv.org/abs/2303.11366)).
  That's why the reviewers here rerun `npm test` and the specs, and look at the stills, instead of
  reading the code and guessing.
- **Separate the author from the judge.** Models recognise their own outputs and rate them higher
  than humans do ([Panickssery et al., NeurIPS 2024](https://arxiv.org/abs/2404.13076)). Anthropic
  found agents grading their own work "confidently prais[e] the work—even when … the quality is
  obviously mediocre", and that splitting generator from evaluator is "a strong lever"
  ([harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)).
- **Dedicated critics find real bugs.** OpenAI's trained critics caught more bugs than paid human
  reviewers and were preferred in 63% of cases. Human plus critic hallucinated less than the critic
  alone ([LLM Critics Help Catch LLM Bugs](https://arxiv.org/abs/2407.00215)).
- **Independence is an old principle.** Code review is "a process where someone other than the
  author(s) … examines that code" ([Google](https://google.github.io/eng-practices/review/)).
  Separation of duty and the two-person rule are formal security controls ([NIST](https://csrc.nist.gov/glossary/term/separation_of_duty)).
  Red teams work best when they are "not invested in the plan" ([UK MOD Red Teaming
  Handbook](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1027158/20210625-Red_Teaming_Handbook.pdf), 7.1).
- **Claude Code's own guidance** says to add an adversarial review step, because "a reviewer running
  in a fresh subagent context sees only the diff and the criteria you give it, not the reasoning that
  produced the change" ([best practices](https://code.claude.com/docs/en/best-practices)).

### How to prompt a reviewer

1. **Give the criteria, not the reasoning.** The spec, the rules, what counts as a finding. Keep the
   author's chain of thought out, to avoid anchoring. One practitioner design calls this *context
   asymmetry* ([Refute-or-Promote](https://arxiv.org/abs/2604.19049), a single-author preprint).
2. **Ask for evidence.** A file and line, command output, a screenshot. A finding without evidence
   isn't a finding. Anthropic's guidance says the same for the author: show the test output, don't
   assert success.
3. **Set the bar, or it invents one.** "A reviewer prompted to find gaps will usually report some,
   even when the work is sound … Chasing every finding leads to over-engineering"
   ([best practices](https://code.claude.com/docs/en/best-practices)). Ask for gaps that affect
   correctness or the stated requirements; grade by severity; treat lows as optional. Google's
   standard is similar: approve once a change "definitely improves the overall code health … even if
   [it] isn't perfect", and label polish "Nit:" ([Google: the standard of code
   review](https://google.github.io/eng-practices/review/reviewer/standard.html)).
4. **Ground it in tools.** Let it run the tests and look at the output (CRITIC, Reflexion above).
5. **Use different lenses, not just more votes.** Several identical reviewers share blind spots.
   Agents in identical conditions make identical decisions: in one study, 18 of 30 agents named a git
   branch the same thing ([Anthropic: multiagent systems](https://www.anthropic.com/research/multiagent-systems)).
   Voting does help when the task is to agree on one answer: self-consistency beat chain-of-thought by up to 17.9 points
   ([Wang et al.](https://arxiv.org/abs/2203.11171)), and beat debate at equal cost (Huang et al.).
6. **Keep a real-world gate.** Unanimous reviewers can still be wrong. In one case 10 reviewers endorsed
   a security bug that didn't exist, and only an empirical test refuted it (Refute-or-Promote). Here
   the real-world gates are the test suite and the human stills.
7. **Know the judge's biases.** LLM judges favour the first answer shown, longer answers and their own
   outputs. They also grade maths and reasoning poorly. Mitigations: swap the order and require both
   runs to agree; give few-shot examples; have the judge solve the problem first, then grade
   ([MT-Bench, NeurIPS 2023](https://arxiv.org/abs/2306.05685); [Wang et al., ACL 2024](https://arxiv.org/abs/2305.17926)).
8. **Calibrate by reading its transcripts.** Anthropic's evaluator "would identify legitimate issues,
   then talk itself into deciding they weren't a big deal". The fix was to read its logs, find where
   it went soft, and tighten the prompt with examples (harness design, above).

### What the field data says about precision

Review agents in the wild are noisy. In one study, developers rejected 56% of an agentic reviewer's
comments, mostly as false positives or out of scope ([CodeRabbit study](https://arxiv.org/abs/2607.03316)).
In an industrial study, PR closure time rose from 5h52m to 8h20m ([Automated Code Review in
Practice](https://arxiv.org/abs/2412.18531)). Two consequences:
- The script fixes only medium and high findings.
- For audits that report findings to people, add a second stage that tries to **refute each finding**
  before anyone sees it. That's the pattern Claude Code's `/deep-research` uses (it votes on each
  claim), and the one this doc's research run used: a checker fetched every source and dropped two.

---

## 5. Pattern catalogue

From [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents)
(the vocabulary) and the [workflows](https://code.claude.com/docs/en/workflows) page (the shapes):

| Pattern | Shape | Use it when | Here |
|---|---|---|---|
| **Prompt chaining** | Fixed steps, each consuming the last | The task splits cleanly into fixed subtasks | implement → review → fix |
| **Routing** | Classify, then send to a specialist | Distinct kinds of input are better handled separately | — |
| **Parallelisation: sectioning** | Independent subtasks at once | The subtasks don't depend on each other | The four researchers |
| **Parallelisation: voting** | The same task, several times | Diverse outputs or more confidence are worth the cost | — |
| **Orchestrator-workers** | A lead splits the work as it goes | You can't predict the subtasks | — (the items were known) |
| **Evaluator-optimizer** | Generate, evaluate, revise in a loop | Clear criteria, and refinement measurably helps | Review → fix |
| **Adversarial verify** | N skeptics try to refute each finding | Findings will be acted on or reported | The source checkers |
| **Perspective-diverse verify** | Each verifier gets a different lens | Work can fail in more than one way | The three-lens audit |
| **Loop until dry** | Search in rounds until K rounds find nothing new | Unknown-size discovery (bugs, edge cases) | — |
| **Judge panel** | N independent attempts, scored, best one grafted | A wide solution space (designs, plans) | — |
| **Completeness critic** | "What's missing?" at the end | Coverage matters | The completeness auditor |

Anthropic's caution on all of them: "find the simplest solution possible, and only increase
complexity when needed".

---

## 6. When not to, and what it costs

- **Tokens.** Agents use about 4× the tokens of chat, and multi-agent systems about 15×
  ([multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
  This doc's research run used 61 agents and about 1.5M subagent tokens in 6.5 minutes. Anthropic's
  long-running app harness cost $200 over 6 hours, against $9 and 20 minutes for a solo run
  (harness design).
- **Coding parallelises less than research.** "Most coding tasks involve fewer truly parallelizable
  tasks than research", and agents that need shared context, or depend on each other, are a poor fit
  (same source).
- **Parallel writers make conflicting decisions.** Cognition's counterpoint: "actions carry implicit
  decisions, and conflicting decisions carry bad results". The default should be one writer
  ([Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)). Their follow-up
  says the pattern that works is "writes stay single-threaded and the additional agents contribute
  intelligence", such as a reviewer with no shared context, which catches about 2 bugs per PR
  ([Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working)).
  This build follows that: one writer at a time, reviewers that don't edit.
- **How multi-agent systems fail.** A study of 200+ traces found 14 failure modes: specification
  problems 42%, misalignment between agents 37%, verification 21% ("no or incomplete" and
  "incorrect" verification among them) ([Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/html/2503.13657v2)).
  The remedies are this doc's themes: a written spec, clear roles, and verification at more than one
  level.
- **Start with one agent.** OpenAI: "maximize a single agent's capabilities first"
  ([A Practical Guide to Building Agents](https://gist.github.com/testy-cool/86cafd426ba22e3e8c1d6d2c853506c4),
  a mirror; the original returned 403).
- **Sizing** (Anthropic's research system): 1 agent and 3–10 tool calls for a fact; 2–4 agents for a
  comparison; 10+ only for complex research. Run a small slice first.

**Rule of thumb for this repo.** Use a workflow for:
- multi-item builds where each item needs its own review;
- audits whose findings need verifying;
- research that needs cross-checked sources.

Don't use one for:
- a one-file fix;
- anything whose next step needs the user's answer, since a workflow can't ask mid-run;
- parallel writes in this single working tree.

---

## 7. Lessons from this run (2026-10-13)

- **Stills get wiped.** Playwright clears `test-results/` at the start of each e2e run, so an item's
  stills disappear when the next item tests. Keep the drive steps file (`tests/drive/steps/v11-*.ts`)
  so stills can be regenerated, and take the final review set after the last test run.
- **Reviewers find real but small things.** L1's review found five low-severity gaps, all real, and
  none needed a fix pass. The severity gate kept the run moving without over-engineering.
- **Agents correct the plan from measurement.** L1's implementer found that 19 §2's proposed T3
  subtitle colour measured 4.1:1 in the worst case (below AA). It used a lighter one, and recorded
  the change in 19 §5. A plan's numbers are proposals until something measures them.
- **Long runs meet outages.** Overnight, three API gateway 502s and then a network drop (`ENOTFOUND`)
  killed six agents. The script carried on past each `null`, so items were skipped silently, and the
  final auditors started on an incomplete tree. Fixes:
  - **Retry a `null` result** a few times, telling the new attempt the tree may hold its
    predecessor's partial edits.
  - **Stop and look before resuming.** Read the journal, `git status` and the notes.
  - **Prefer a continuation script to a resume** when finished work sits after the first failure.
    A resume reruns every agent from the first failure on.
  - **Keep the machine awake** for long runs (e.g. `caffeinate -i`).
- **The "look at it" stage caught what every test missed.** The last agent assembled the review set
  and actually looked at the stills. It found holo labels in their title-only state still drawing
  their subtitle: a CSS ordering bug from P1. 873 unit tests and 165 e2e tests had passed, because they
  checked the state attribute (`data-tier`), not what was drawn. The lesson: verify the rendered
  outcome (computed style, a screenshot), not just the state that's meant to produce it, and keep a
  stage whose job is to look.
- **One reviewer is worth it inline too.** The v1.1 closeout was built in the conversation, with a
  single fresh-context reviewer at the end. Its first pass found eight problems, including a fix
  that had quietly changed the v0 views and a root cause only half fixed. Sent back to check the
  fixes, its second pass found one more. Two short rounds cost far less than a workflow and caught
  what the author had missed.
- **Time.** A large item took about 45 minutes with its review. Budget hours for a dozen items run
  serially.
- **The harness scans subagent output.** Claude Code checks each subagent's report and flags text
  that looks like instructions. Here it flagged the research agents' quotes of permission-settings
  docs. The flags were harmless, and they're the reason to treat fetched web content as data, never
  as commands ([sub-agents](https://code.claude.com/docs/en/sub-agents)).
- **Plan approvals are part of the design.** A workflow can't ask questions, so every question was
  settled in 19 §4 before the run. Where an agent still had to choose, it took 19's recommendation and
  recorded it.

---

## 8. A checklist to reuse

1. **Scout inline first.** Look at the real thing, read the code, and find the work list. Don't
   orchestrate what you haven't seen.
2. **Write the contract.** A doc with the rules, each item (asked, today, proposed, departs from),
   decisions and open questions. Settle the questions with the human before the run.
3. **Choose serial or parallel by what's shared.** Shared build outputs, files or state mean serial,
   or worktrees. Read-only work can run in parallel.
4. **Write one shared brief.** Objective, output format, tools and checks, boundaries, the rules, where
   prior work is, and "report honestly".
5. **Give every stage a schema** the script can branch on.
6. **Pair every writer with a fresh reviewer.** Criteria, not reasoning. Evidence required. Severity
   graded. Tools in hand. Fix only what's confirmed and matters.
7. **End with multi-level verification.** The full suite; diverse lenses over the whole change; then
   a human gate with stills and exact moments.
8. **Leave a trail.** A note per item, State lines in the plan, and a review set the human can follow.
9. **Read the transcripts** of a reviewer that seems soft or noisy, and tighten its prompt.
10. **Size it honestly.** Small slice first; watch tokens and time; prefer one agent when one will do.

---

## 9. Sources

All fetched and checked on 2026-10-13 (each URL opened, its claims confirmed against the page).

**Claude Code and the Agent SDK (official)**
- [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows): the workflow feature, its API, limits, resume and cost
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices): verification, explore-plan-implement, the adversarial review step and its over-engineering warning, writer/reviewer
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents): context isolation, frontmatter, limits, the output scan
- [Run agents in parallel](https://code.claude.com/docs/en/agents): choosing between subagents, teams, workflows and worktrees
- [Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees) · [Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams) · [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Get structured output from agents](https://code.claude.com/docs/en/agent-sdk/structured-outputs) · [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents)
- [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide) · [How Claude remembers your project](https://code.claude.com/docs/en/memory) · [Configure permissions](https://code.claude.com/docs/en/permissions)

**Anthropic engineering and research**
- [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12-19): workflows vs agents and the five patterns
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06-13): orchestrator-workers, delegation briefs, sizing, cost
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09-29): context rot, and why subagents return condensed summaries
- [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) (2025-09-11) · [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) (2025-09-29): the agent loop, and ways to verify
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (2025-11-26): one feature at a time, progress files, end-to-end tests
- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (2026-03-24): the generator/evaluator split; calibrating a skeptical evaluator
- [Patterns and problems in emerging multiagent systems](https://www.anthropic.com/research/multiagent-systems) (2026-08-13): coordination, conformity, complementary coverage

**Research on verification and critique**
- Huang et al., [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) (ICLR 2024) · Kamoi et al., [When Can LLMs Actually Correct Their Own Mistakes?](https://arxiv.org/abs/2406.01297) (TACL 2024)
- Gou et al., [CRITIC: tool-interactive critiquing](https://arxiv.org/abs/2305.11738) (ICLR 2024) · Shinn et al., [Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023)
- McAleese et al. (OpenAI), [LLM Critics Help Catch LLM Bugs](https://arxiv.org/abs/2407.00215) (2024)
- Zheng et al., [Judging LLM-as-a-Judge with MT-Bench](https://arxiv.org/abs/2306.05685) (NeurIPS 2023) · Wang et al., [Large Language Models are not Fair Evaluators](https://arxiv.org/abs/2305.17926) (ACL 2024) · Panickssery et al., [LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2404.13076) (NeurIPS 2024)
- Wang et al., [Self-Consistency](https://arxiv.org/abs/2203.11171) (ICLR 2023) · Du et al., [Multiagent Debate](https://arxiv.org/abs/2305.14325) (ICML 2024) · Irving et al., [AI safety via debate](https://arxiv.org/abs/1805.00899) (2018) · Khan et al., [Debating with More Persuasive LLMs](https://arxiv.org/abs/2402.06782) (ICML 2024)
- Cemri et al., [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/html/2503.13657v2) (2025)
- Field studies of review agents: [Automated Code Review in Practice](https://arxiv.org/abs/2412.18531) (ICSE SEIP 2025) · [Is Agentic Code Review Helpful? (CodeRabbit)](https://arxiv.org/abs/2607.03316) (2026)
- A practitioner design close to this one: [Refute-or-Promote](https://arxiv.org/abs/2604.19049) (2026; single-author preprint, not peer reviewed)

**Industry practice and counterpoints**
- Google Engineering Practices: [Code review](https://google.github.io/eng-practices/review/) · [The standard of code review](https://google.github.io/eng-practices/review/reviewer/standard.html)
- SmartBear, [Best practices for code review](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/) (vendor; the Cisco study's 200–400 lines and 60-minute limits)
- Bacchelli and Bird, [Expectations, Outcomes, and Challenges of Modern Code Review](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/) (ICSE 2013): review finds fewer defects than expected; understanding the change is the bottleneck
- NIST CSRC: [Separation of duty](https://csrc.nist.gov/glossary/term/separation_of_duty) · [Red team](https://csrc.nist.gov/glossary/term/red_team)
- UK MOD, [Red Teaming Handbook, 3rd ed.](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1027158/20210625-Red_Teaming_Handbook.pdf) (2021): independence, devil's advocacy, the pre-mortem, how red teams fail
- Cognition: [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents) (2025-06-12) · [Multi-Agents: What's Actually Working](https://cognition.com/blog/multi-agents-working) (2026-04-22)
- OpenAI, A Practical Guide to Building Agents ([mirror](https://gist.github.com/testy-cool/86cafd426ba22e3e8c1d6d2c853506c4); [original](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents))
- Microsoft AutoGen, [Reflection design pattern](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/reflection.html): a coder/reviewer pair with an approval loop
