# 01 — Product brief

**Status:** current as of 2026-10-26 (through v1.2). Covers what the product is today (Solar, the default view, and
the v0 views), the question it answers, the pilot's journeys and scope, and the doc map.

**Star Chart** turns a team's Azure DevOps work into an explorable, painted space chart for
engineering teams. It is a macOS Electron app. It reads ADO without ever writing to it, keeps a
local cache, and can replay history.

## The product today (v1)

*Applies to: both views.*

- **Solar is the default view.** It goes galaxy (a project) → round (a sprint, drawn as a sector of
  its regions; no playback) → region (one pod's sprint as a solar system). **Only the region plays:**
  one short episode (its budget is in [15 §10](15-reference.md#10-timing-and-budgets)), where
  captains mine objectives, fight threats and transform their seat's planet ([13](13-game-design.md)).
  Its high points are a seat completing, the region's last threat falling (the all-clear), and, at
  the end of a finished sprint, the round's finale ([15 §9](15-reference.md#9-actions--what-you-see)).
- **The v0 views** (Sprints board and Backlog) are still in the app, reached only by the developer
  toggle in Settings → Theme, or by pinning `STAR_CHART_PARADIGM`; boot opens Solar again unless
  pinned. The pilot sections below describe them.
- **Domain packs** map data onto one game: **SDLC** reads ADO (read-only), and **Todo** and **CRM**
  are fixture-only demos ([12](12-glossary.md), [14](14-architecture.md)).
- **Settings** has five tabs: *Your captain* (who the viewer is, their ship's look, their
  achievements), *Captain Avatars* (pictures for the captains in view, loaded in bulk), *Theme* (with the developer toggle), *How to read the chart*, and *Connection*. Achievements are the viewer's own, never anyone else's ([13 §8](13-game-design.md#8-achievements-decided-2026-10-10)).

## What it answers

*Applies to: both views.*

> **What happened to this Feature, who was assigned its work, and which repositories changed as a
> result?**

A product owner starts from a Feature. An engineer follows the trail from the Feature to its Tasks,
PRs, and repos. A manager watches a whole sector light up over a week. Every visual claim can be
inspected in a side panel and opened in ADO.

In Solar the question is asked of one pod's sprint: what each person's Stories and Bugs arrived at,
and which repositories their PRs went to. Features aren't drawn or listed there (since 19 L6 a
station's rows are its PRs, each with its read-only link to ADO).

The chart is a map for understanding work. It is **not** a competition, a productivity score, or a
replacement for ADO ([INV-19](02-domain-rules.md#1-invariants)).

## Glossary (v0 views)

*Applies to: the v0 views · packs: SDLC only.*

This table is the **v0 views'** vocabulary (Sprints board and Backlog). It doesn't describe Solar:
there a Story is an asteroid, a Bug a hive ship, a repo a dreadnought, and a person both a planet
and a ship. Solar's vocabulary (engine terms, game forms, each pack's readings, and where each lives
in code) is [12-glossary.md](12-glossary.md); for Solar, 12 wins.

| ADO | Star Chart | One-line meaning |
|---|---|---|
| Organization | Observatory | The connection boundary. One per pilot |
| Project | Galaxy | A top-level destination. The user pins which discovered projects to show |
| Saved Area Path | Area sector | A local favorite. It shows Features whose *own* Area Path is at or under the saved path |
| Epic | Epic sector | Shows the Features linked beneath that Epic |
| Feature | Star | The anchor of a system. Its own state drives its core. Closed makes it a white dwarf |
| User Story | Planet | Orbits its Feature. Its own state drives the terraforming stage |
| Bug | Anomaly | For the pilot team, a direct child of a Feature |
| Task | Mission point | A tiny dot under its Story or Bug; usually what a PR links to |
| `System.AssignedTo` | Captain and ship | One stable ship per person. Means *assigned*, never "working now" |
| Git repository | Supply station | Appears in a Feature system when PRs link that Feature's work to the repo |
| Pull request | Cargo flight | The unit of code change, flying from its linked work to its repo |
| Parent/child link | Orbit | A hierarchy edge, valid from the time it was added until it was removed |
| PR ↔ work item link | Flight route | Links a PR to a Task, Story, or Bug. Task routes continue on to the Task's parent |
| Predecessor/successor | Dependency lane | Drawn only when the link is explicit |

Names like "FederationCore" (a project) and "Comet Pod" (an Area Path) are examples. Every project,
path, Epic, and person is discovered at runtime.

## Journeys (pilot)

*Applies to: the v0 views.* Solar's journey is one: pick a sprint, enter a pod's region, press Play,
and follow a captain ([13 §1](13-game-design.md#1-the-core-experience)).

1. **Monday playback.** An engineer picks a project and a saved Area Path, sets the start to last
   Monday, and presses Play. A moderate week plays in about 20–30 s. They can zoom into a Feature
   while it plays, switch to ½× or ¼×, follow a captain, inspect evidence, and open items in ADO.
2. **Product status review.** A product owner scans a sector's Feature stars, picks one, sees the
   recorded state of each Story and any open anomalies, and finds the affected repos without knowing
   their names in advance.
3. **Component impact.** A tech lead selects a station and sees the Stories, Bugs, Features, and
   flights connected to that repo.
4. **Management navigation.** A manager moves between pinned projects and their sectors and looks
   at recent events. The app doesn't compare projects by score.
5. **Offline revisit.** The user opens cached history without a connection, and the header shows
   when the last sync happened.

## Pilot scope

*Applies to: both views · packs: SDLC only (Todo and CRM are fixture-only demos).* v1's plan and
checks were [17](archive/17-v1-phases.md), v1.1's [19](archive/19-v1.1.md) (both archived); the
v1.2's [22](archive/22-v1.2.md) and v1.3's [23](archive/23-v1.3.md) (archived 2026-10-26 and 2026-10-29); the active plan is [27](27-v1.4.md), the first run under the sluice.

**In scope:**
- One org and the user's pinned projects.
- Area Path and Epic sectors.
- Scopes of up to about 15 Features, backfilled up to 4 weeks, with a default playback range of one
  week.
- Work-item state, assignment, area, and hierarchy history.
- PR open, complete, and abandon events, with the PR's author and links.
- Playback with step and seek, at the rates in [15 §10](15-reference.md#10-timing-and-budgets)
  (the pilot asked for 1×, ½× and ¼×; 2× and 4× were added later).
- Free navigation while playing, and Follow within the loaded scope.
- Offline cache, incremental refresh, and reduced motion.

**Read-only:** the app never writes to ADO, in any view or pack (INV-21).

**Out of scope:** everything in [90-later.md](90-later.md), plus deployment claims, inferring who is
"actively coding", AI-generated states, org-wide analytics, rankings, and ingesting source code.

## Doc map

*Applies to: both views.* Each live doc has an *Applies to* line under each top-level heading.

| Doc | Role |
|---|---|
| 01-product-brief.md | This page: what the product is, the pilot's scope, the doc map |
| [02-domain-rules.md](02-domain-rules.md) | **Normative** meaning: invariants (with an index), hierarchy, PR rules, events and the moves they make, replay order, lenses |
| [03-contracts.md](03-contracts.md) | **Normative** types, keys, IPC, SQL, fixtures, toolchain |
| [04-ado-ingestion.md](04-ado-ingestion.md) | How ADO is read |
| [05-playback.md](05-playback.md) | Clocks, beat schedule, animation, Follow |
| [06-visual-brief.md](06-visual-brief.md) | Look, procedural art, visual checks |
| [08-layout-solver.md](08-layout-solver.md) | Layout and sizing: what has and hasn't worked, and the solar layout |
| [09-signal-ladder.md](09-signal-ladder.md) | The one visual language for progress: a color, ornament, contrast and motion per rung |
| [12-glossary.md](12-glossary.md) | v1 vocabulary: engine term → game form → SDLC, Todo, CRM, and where each lives in code |
| [13-game-design.md](13-game-design.md) | The v1 game: pillars, board, pieces, combat safety, interactions, settings, achievements |
| [14-architecture.md](14-architecture.md) | v1 architecture: domain and theme packs, engine, maneuvers, as built |
| [15-reference.md](15-reference.md) | **Authoritative values**, one row per constant: palette, signal ladder, roles and kinds, sizes and floors, labels, maneuvers, effects, actions → what you see, timings. `docTables.test.ts` checks it against the code. Other docs link here for numbers |
| [20-agent-workflows.md](20-agent-workflows.md) | How multi-agent workflows and adversarial review are used here, with sources |
| [21-ultracode-run.md](21-ultracode-run.md) | The first Ultracode run (v1.1): a diagram of what happened, its time and cost |
| [27-v1.4.md](27-v1.4.md) | **The active plan:** v1.4's intake (carried from v1.3, and Pulsar's pacing and accents), which `/sluice scope` turns into its scope doc (v1.3's plan is [archive/23-v1.3.md](archive/23-v1.3.md)) |
| [24-session-retrospective.md](24-session-retrospective.md) | What each Claude Code session processed, cost (as shares, no currency) and produced, by technique and model, and the levers that would have made it cheaper and faster |
| [25-v1.3-retrospective.md](25-v1.3-retrospective.md) | v1.3's agent pipeline: spend and wall clock by block, role and model, measured in usage windows; whether adversarial review paid; the waste; and the next form of the workflow |
| [26-agentic-workflow.md](26-agentic-workflow.md) | A pointer: the sluice (the build workflow from v1.4 on) lives in the vendored package [sluice/](../sluice/README.md), with its design, roadmap and evidence |
| [90-later.md](90-later.md) | Deferred work (empty; v1.4's intake is 27) |
| [progress/handoff.md](progress/handoff.md) | Where the work stands, standing preferences, what's open. Read first |
| [progress/README.md](progress/README.md) | The slice-note (handoff) format |

**Source:** the `docs/` folder · **Update when:** a doc is added, archived, renamed or changes role.

[archive/](archive/) holds history, not normative: the v0 build order (07), the v1 charter (10), the
v0 inventory (11), the v1 plan (17), the v1.1 and v1.2 plans (19, 22), the achievements brainstorm (18), the UX
polish backlog (91), the v1 prompt, the original spec, and the finished slice notes
(`archive/progress/`).
