# <Project>: notes for the sluice's agents

<!-- The sluice's planner, reviewer, auditor and fixer read this file (named by projectNotes in
.claude/sluice/config.json). It holds what a fresh agent needs to know about this project to plan and
judge well, beyond the hard rules in CLAUDE.md, which every agent already loads.
Keep it under about 800 words: it's re-read on every call. Point to docs rather than copying them.
Grow it from evidence: when a review catches a class of bug, or one escapes to the human gate, add the
lens that would have caught it, with a one-line reason. -->

## Sources of truth
<!-- Where values, contracts and rules live, and the rule that keeps code and doc in step. -->
- <e.g. "Constants with a row in docs/reference.md change with their row; test X fails until they match.">

## Review lenses
<!-- Classes of defect that tests in this project tend to miss, each with how to check for it. -->
- **<lens name>:** <what to look for> · <how to check it>

## How to verify here
<!-- The commands and methods beyond the gate: mapped tests, visual checks, fixtures, perf budgets. -->
- <e.g. "UI changes: take stills with <command>, and compare before and after.">

## Vocabulary
<!-- Optional: project terms an agent would otherwise misread, or a pointer to the glossary. -->
