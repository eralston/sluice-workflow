# 10 — v1 charter

v0 proved the idea: Azure DevOps work, replayed as a painted space chart, makes a sprint feel like an
episode of a fleet at work. v1 rebuilds that idea as a **game**: one rule set and one visual
language that any task-driven process can plug into, from a full software lifecycle to a todo list
or a sales pipeline.

This charter is the entry point for v1. Until the v1 docs below are signed off, 01–09 stay
normative for anything already built.

## The goal

A desktop and tablet app that makes progress fun and feels like a board game or a space 4X game
(Stellaris, Twilight Imperium). A project has **opportunities** to conquer (stories, tasks, deals)
and **challenges** to fight (bugs, blockers, at-risk accounts). The people doing the work are
captains in a fleet, calling in help as they go. Anyone from 18 to 80 should be able to pick it up,
read it, and want to watch the next episode.

## Design pillars

1. **Progress is conquest.** Opportunities are worlds to explore and settle. Challenges are threats
   to drive off. Finishing work changes the map for good.
2. **A fleet, not a leaderboard.** Teamwork, shared effort and personal accomplishment are
   celebrated. People are never ranked or scored (INV-19 carries over). Achievements recognise
   things someone did, never how they compare to anyone else.
3. **Every sprint is an episode.** Playback tells a story with a beginning, rising action and a
   finale, at the "cozy campfire, not fireworks" pace.
4. **Readable at a glance, for anyone.** Vital text meets AA or AAA contrast. Labels have
   predictable row budgets at every size. Objects are big enough to touch. Nothing relies on hue
   alone, and reduced motion loses no information (INV-20 carries over).
5. **One game, many domains.** The game's rules and art are written in domain-neutral terms
   ([12-glossary.md](12-glossary.md)). SDLC, todo and CRM are **domain packs** that map their data
   onto those terms.
6. **Painted space age.** The illustrated oil-paint look of Syd Mead, John Berkey, Ralph McQuarrie,
   Leiji Matsumoto, Shoji Kawamori and their peers. Celestial bodies are painted; machines are
   crisp.

## Decisions (2026-10-10)

| # | Decision |
|---|---|
| D1 | **Factions are inspired by, never copied from**, Star Trek (space opera explorers), Star Wars (planetary-romance starfighters) and Macross (transforming space mecha). Original designs and names only. |
| D2 | **Renderer: stay on Pixi v8 (2D WebGL, painted 2.5D)** for now. Revisit a real 3D engine after the game design (13) is settled, and only if stylised 3D assets are achievable at our quality bar. |
| D3 | **No browser target.** v1 is desktop plus tablet (see *Platforms*). |
| D4 | **Combat exists, and it is safe for work** (see *Combat safety*). A bug is a threat to defend against. When it's resolved, it's destroyed and leaves a cloud of victorious ruin. |
| D5 | **Todo and CRM are fixture-only demos** in v1. Only the SDLC pack talks to a real service (ADO, read-only). |
| D6 | **v0 docs move to `docs/archive/v0/`** once their v1 replacements are signed off, so the history stays available for reference. |

## Platforms

- **Desktop (macOS): the shipping target.** It's the current Electron app.
- **Tablet: design for it now, ship it later.** Electron doesn't run on iPad or Android, and Macs
  have no touchscreens. In v1, "tablet-ready" means:
  - Every interaction works by touch: tap, drag, pinch, and long-press in place of hover.
  - Touch targets are at least 44 pt.
  - The app meets a frame budget on integrated, tablet-class GPUs.
  - The renderer and `src/shared/` stay free of Node and Electron, so a later tablet shell (for
    example Capacitor on iPad) can reuse them. Main-process services (ADO client, SQLite, Keychain)
    would need ports in that shell; that work is listed in [90-later.md](90-later.md) when we get
    there.
  - A Windows build for touch PCs such as Surface is the cheapest real tablet. Open question Q2.

## Combat safety

Enemies must be safe targets in a professional setting.
- **Enemies are never human or mammal.** Allowed archetypes: insect-like hives and swarms
  (Starship Troopers), machine legions (86's Legion), and faceless droid or robot armadas (the
  Empire's machines).
- **No one we care about is ever hurt.** There are no friendly casualties, no visible pilots in
  peril, and no visible death. A threat menaces a world or station vaguely; it never harms a
  person.
- **Defeat is a dissolve, not a death.** A resolved threat breaks apart into drifting debris or
  nebula: the *cloud of victorious ruin*. There's no gore and no wreckage with people in it.
- **Threats belong to the work, not to people.** A bug is never attributed to whoever wrote the
  code. Captains defend; nobody is blamed.
- **Departure from v0:** "Ships help; they never attack" ([handoff](progress/handoff.md)) becomes
  "ships help people, and fight only threats." [13-game-design.md](13-game-design.md) defines the
  rule, and 02 is amended in the same change.

## What stays the same

The code may change a lot. How we design, build and harden it does not.
- **Process.** One slice at a time, each with a handoff note and human gates, and one commit per
  slice after its checks pass.
- **Testing.** Unit, golden, e2e, keystone and drive tests. While iterating, run the specs for what
  changed plus the keystone; run the full suite once before handing back.
- **The gallery** is the sketchbook for assets, motion and effects. Every new visual appears there
  first.
- **Observability.** A redacted dev log (salted hashes and counts only) and the opt-in diagnostic
  log.
- **Security and data.**
  - No real data anywhere outside the app (INV-18), and no real PATs (INV-17).
  - ADO stays read-only (INV-21) behind the renderer boundary (INV-16), with the DB in userData.
- **Determinism.** The same replay inputs always produce the same picture, with no catch-up
  animation (INV-12 to INV-15).
- **Accessibility.** INV-20, plus the contrast tiers and label row budgets in
  [16-type-and-labels.md](16-type-and-labels.md).
- **Purity.** `src/shared/` stays pure, and the app uses Pixi v8 idioms only.

[11-v0-inventory.md](11-v0-inventory.md) §*UI, accessibility and engineering standards* lists each
standard with its source.

## v1 doc set

| Doc | Role | Status |
|---|---|---|
| 10-v1-charter.md | This page: goal, pillars, decisions, what stays | Draft |
| [11-v0-inventory.md](11-v0-inventory.md) | What v0 contains: assets, motion, mechanics, data, UI | In progress (P1) |
| [12-glossary.md](12-glossary.md) | Shared vocabulary: abstract term → game form → SDLC, todo, CRM | P2 |
| [13-game-design.md](13-game-design.md) | Mechanics, rules (keep, add, replace, remove), combat, achievements, episodes | P2 |
| [14-architecture.md](14-architecture.md) | Domain packs, theme packs, asset factory, motion and effect commands, maneuvers | P3 |
| [15-art-direction.md](15-art-direction.md) | Factions (3 × 3 hulls + colourways), painter references; extends 06 and 09 | P2′ |
| [16-type-and-labels.md](16-type-and-labels.md) | Label sizes × row budgets, contrast tiers, touch sizes | P2′ |
| [17-v1-phases.md](17-v1-phases.md) | Phases and slices for v1, with gates and checks (replaces 07 for v1) | After P2 |
| [18-achievements.md](18-achievements.md) | Achievements brainstorm: rules, candidates, presentation | P2 (brainstorm) |

## Phases (outline; 17 will detail them)

| Phase | Output | Gate |
|---|---|---|
| P0 Freeze v0 | Slice 7 closed and committed; tag `v0` | The user commits |
| P1 Inventory | 11 | HG-V1: "is this what we have?" |
| P2 Design workshop | 12 and 13, with options and a recommendation for each open choice | HG-V2: rules and glossary |
| P2′ Gallery sketches (alongside P2) | Gallery rows for new assets and beats: asteroid, threat, moon, tender shuttle, faction hulls, combat and ruin | HG-V2′: visual direction |
| P3 Architecture and refactor | 14; code moves behind the new interfaces while every existing check stays green | Full e2e suite on fixtures |
| P4 Domain packs | SDLC at full ADO parity, then todo, then CRM, each with its own synthetic fixtures | HG for each pack |
| P5 Build back the scene | New mechanics, combat and achievements in the app, slice by slice | HG for each slice |
| P6 Polish and accessibility | 15 and 16 applied everywhere | HG |
| P7 Hardening | Performance on tablet-class hardware; the user's live checks | AC-34/35 style, run by the user |

## Open questions

- **Q1.** Slice 7 is built but uncommitted, and waits on the AC-34/35 re-run. Close it before P2?
- **Q2.** Is a Windows touch build (Surface-class) in v1's scope, or is tablet "design-for" only?
- **Q3.** Naming: is this "v1 of the product" throughout? (The notes also say "v2 of the game.")
  This doc set uses **v1**.
