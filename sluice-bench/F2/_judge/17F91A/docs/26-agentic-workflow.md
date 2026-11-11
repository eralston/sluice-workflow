# 26 — The agentic workflow (moved)

**Status:** since 2026-10-29 this doc is a pointer. The sluice's design has one canonical copy, in the
vendored package at [sluice/](../sluice/README.md):

| For | Read |
|---|---|
| What the sluice is, and how to use it | [sluice/README.md](../sluice/README.md) |
| The design: roles, formats, model and budget rules, metrics, experiments | [sluice/docs/design.md](../sluice/docs/design.md) |
| What to try next, and why | [sluice/docs/roadmap.md](../sluice/docs/roadmap.md) |
| How it came to be (this project's six ways of working) | [sluice/docs/evolution.md](../sluice/docs/evolution.md), [sluice/docs/case-study.md](../sluice/docs/case-study.md) |

**Why it moved:** this doc and the package's design doc drifted 64 lines apart within a day. A process
that evolves by measured, one-at-a-time changes needs a single copy of each part. Star Chart's own
settings for the sluice live in `.claude/sluice/config.json` and `.claude/sluice/project.md`. Change the
process itself in `sluice/` (and upstream), never only here.

The section numbers other docs cite (§12 implementation, §14 the current moment, §15 experiments) are
the same in `sluice/docs/design.md`.
