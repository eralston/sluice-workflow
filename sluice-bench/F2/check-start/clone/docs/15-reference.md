# 15 — Reference

**Status:** built values, read from the code on 2026-10-27 (through v1.3 Block B). Normative for values: where a topical
doc (05, 06, 09, 13) quotes a number, this doc and the code win.

This is the condensed authority for Star Chart's values: colours, rungs, roles, sizes, labels,
maneuvers, effects and timings, one row per constant. Rationale stays in the linked doc sections.

---

## 1. How to use and maintain this doc

One row per named value, with the constant it comes from. Read it to find a value; change it with
the code.

- **What it is.** The values as built, in summary tables. Why a value is what it is lives in the
  doc section each table links to (06, 08, 09, 12, 13). Those docs link here for numbers.
- **The rule.** Change the constant and its row in the same change. `npm test`
  (`tests/unit/docTables.test.ts`) parses every marked table and fails until the two match. Where a
  table lists a registry (maneuver rules and variants, commands, kinds, roles, rungs, pack states),
  it must list exactly what the code registers, both ways. Colour words in §7–§9 are §2's colour
  names (the `palette-chart` Name column), and the test checks that too.
- **Markers.** A table the test checks has a `<!-- table: <id> -->` line just above it. Ids are
  stable: rename one only with the test. A checked table names `docTables.test.ts` in its Guard
  line; an unchecked one (`contrast`, `v0-extras`, `actions-ui`) doesn't, and a new marker fails
  the test until it gets a check or joins that list.
- **The Constant column** names one constant per row, as `` `file.ts` NAME ``:
  - a renderer file is written from `src/renderer/src/` (`chart/art/energy.ts`);
  - a shared file starts `@shared/`, which is `src/shared/` (`@shared/scene/sizing.ts`);
  - a member of an exported object or array is `NAME.member` or `NAME[i]`;
  - a CSS custom property is written alone (`--ink`); it lives in `styles.css` or
    `chart/holo/holo.css`;
  - a row that cites several constants separates them with commas (same file) or `;` (another
    file), and the test finds each one's value in the row's value cell.
- **Unguarded rows.** A value with no exported constant (a literal, or a constant private to its
  file) is marked so the test skips it on purpose: its Constant cell starts `unguarded:`, then names
  the file and the constant, or `(inline)` for a bare literal (`` unguarded: `chart/fx/v1/interpreter.ts` OPENING_MAX ``).
  The test still checks the file exists and holds that name, and fails once the name is exported, so
  the row gets checked. Any other Constant that doesn't resolve fails the test: export it, or mark
  the row unguarded.
- **Values.** Colours are `#RRGGBB`, upper case, with any alpha in its own column. Numbers are as
  the code evaluates them; an angle is in radians to 4 places, with its expression beside it.
- **Views.** **Solar** is the default view. **v0 views** are Sprints and Backlog (a
  `STAR_CHART_PARADIGM` pin or Settings' developer toggle). **Both** means both.
- **After each table**, one line: its **Source**, its **Guard** (the test or gallery section that
  checks it) and **Update when**.
- **What isn't here.** What things mean and the invariants: [02](02-domain-rules.md). Shapes and
  interfaces: [03](03-contracts.md). Words for things: [12](12-glossary.md).

**Sections.**
1. [How to use and maintain this doc](#1-how-to-use-and-maintain-this-doc)
2. [Palette](#2-palette)
3. [Signal ladder](#3-signal-ladder)
4. [Roles, kinds and assets](#4-roles-kinds-and-assets)
5. [Sizes, floors and layout](#5-sizes-floors-and-layout)
6. [Labels and type](#6-labels-and-type)
7. [Maneuvers](#7-maneuvers)
8. [Effects](#8-effects)
9. [Actions → what you see](#9-actions--what-you-see)
10. [Timing and budgets](#10-timing-and-budgets)
11. [Device profiles](#11-device-profiles)

---

## 2. Palette

The UI's CSS tokens, then the chart's colours. Rationale: [06 §2](06-visual-brief.md#2-palette-and-type),
[06 §9](06-visual-brief.md#9-v1-the-solar-system-13-9-amended-2026-10-12).

**UI tokens** (both views). Ratios are measured on the label plate (`--plate` over `--ink`) unless
another surface is named.

<!-- table: palette-ui -->
| Constant | Hex | Alpha | Used for | Contrast target (as built) |
|---|---|---|---|---|
| `--ink` | `#081629` | 1 | Space and the app background; text on amber buttons | Surface |
| `--ink-70` | `#081629` | 0.7 | Panels: title bar, inspector, trays, status bar | Surface |
| `--ink-55` | `#081629` | 0.55 | Text inputs | Surface |
| `--plate` | `#15263F` | 0.92 | The standard label plate, every scale | Surface: a balance against the sky, not a ratio |
| `--ivory` | `#F4F0DE` | 1 | Titles, body text, people's names, the selection edge | AAA (13.5:1) |
| `--ivory-60` | `#F4F0DE` | 0.6 | Secondary text: breadcrumbs, counts, dates, empty states | AA (5.8:1; 6.3:1 on ink) |
| `--ivory-35` | `#F4F0DE` | 0.35 | Disabled controls, dashed tray borders, struck rows | Below AA by design (disabled, 2.9:1) |
| `--amber` | `#F1B75B` | 1 | UI chrome accents: brand, panel heads, glyphs, the picked item, star titles (v0). Never people's names, never a rung; a deeper gold than Victory gold (`SUCCESS`, `#FFC76B`) | AAA (8.6:1) |
| `--cyan` | `#83DDE2` | 1 | Section heads, links, hover edges, the timeline's in-view ticks, the hover ring round what a plate's row lights | AAA (9.9:1) |
| `--cyan-30` | `#83DDE2` | 0.3 | Hairlines, panel borders, a label's resting accent edge | Non-text |
| `--cyan-70` | `#83DDE2` | 0.7 | The chart's name beside an ADO name in the panels (`.metaphor`, 22 B1): the quieter layer | AA (6.2:1 on ink) |
| `--coral` | `#E98973` | 1 | Alerts only: sync errors, failed jobs, offline. Never a work state, never on a chart object | AA (7.2:1 on ink) |
| `--cobalt` | `#355DA1` | 1 | Depth tone (declared; the art uses its own copy) | Non-text |
| `--violet` | `#79568F` | 1 | Depth tone (declared; `chart/art/lit.ts` shades with it) | Non-text |
| `--holo-line` | `#7FE3FF` | 1 | Holo plates (Solar): the hue of every frame, pointer and rim dot but T3's and a piece's (their alphas by tier: §6 `holo-tiers`; a piece's is its role's, below), and of a captain's picture's frame in play (19 L8; no ring) | Non-text |
| `--holo-glass` | `#05131F` | 0.86 | Holo plates (Solar): the glass, one opacity at every tier | Surface |
| `--holo-glow` | `#7FE3FF` | 0.5 | Holo plates (Solar): text and frame glow | Non-text |
| `--holo-objective-line` | `#12AADE` | 0.85 | A piece's plate (22 A6): an objective's frame and pointer at rest, Opportunity blue (`AURA.objective`) brightened for a 1 px line | Non-text |
| `--holo-objective-dot` | `#12AADE` | 0.95 | An objective plate's rim dot | Non-text |
| `--holo-objective-glow` | `#009CCC` | 0.55 | An objective plate's frame glow, raised only (none at T4) | Non-text |
| `--holo-objective-lift` | `#4CC6F0` | 1 | An objective plate's frame, pointer and dot, lifted | Non-text |
| `--holo-threat-line` | `#DE3A4E` | 0.85 | A threat's frame and pointer at rest, Deadly red (`AURA.threat`) brightened for a 1 px line | Non-text |
| `--holo-threat-dot` | `#DE3A4E` | 0.95 | A threat plate's rim dot | Non-text |
| `--holo-threat-glow` | `#CC293D` | 0.55 | A threat plate's frame glow, raised only (none at T4) | Non-text |
| `--holo-threat-lift` | `#FF6A7C` | 1 | A threat plate's frame, pointer and dot, lifted | Non-text |

A holo plate's text and frame colours are its tier's (§6, `holo-tiers`). One text colour is a
literal, not a token: a callout's meta line, `--ivory` at 0.72 (7.6:1).

**Source:** `src/renderer/src/styles.css` `:root`, `chart/holo/holo.css` `:root` · **Guard:**
`docTables.test.ts`; `slice1.spec.ts` VC-2 (label backing 4.5:1); `solar.spec.ts` contrast (expanded
plates' rows included) · **Update when:** a token is added, renamed or retuned, or a text use moves to a darker surface.

**Chart colours.** One row per exported colour constant.

<!-- table: palette-chart -->
| Name | Constant | Hex | View | Used for | Never used for |
|---|---|---|---|---|---|
| Ready grey | `chart/art/progress.ts` READY | `#8A93A6` | both | Ready rung; settle rings | Anything finished |
| Progress blue | `chart/art/progress.ts` PROGRESS | `#5AA9FF` | both | Underway rung, on the piece | Hero beams (those are Hero blue) |
| Nearing violet | `chart/art/progress.ts` NEARING | `#A487FF` | both | Nearing rung, Victory gold creeping in | Hero or hostile colourways |
| Victory gold | `chart/art/progress.ts` SUCCESS | `#FFC76B` | both | Accomplished rung; the outline on anything Closed; the grand flare | Anything not accomplished; UI chrome (that is `--amber`) |
| Explosion orange | `theme/starChart/maneuvers/strikeRun.ts` EXPLOSION | `#FFB36B` | Solar | An enemy ship's culminating explosion as it turns to its caged hulk (22 C3) | The win's gold; a rung |
| Off grey | `chart/art/progress.ts` RUNG_COLOR.off | `#6F7787` | both | Off the ladder: ghosts, unknown, struck mega-label rows | A live rung |
| Hero blue | `chart/art/energy.ts` HERO | `#3D84FF` | Solar | Hero energy: weapons, summons, phasers | Enemy fire; a rung |
| Hero pale blue | `chart/art/energy.ts` HERO_PALE | `#9EC8FF` | Solar | A hero beam's hot centre (`brighten`) | White: hero energy never goes white |
| Hero core blue | `chart/art/energy.ts` HERO_CORE | `#CFE3FF` | Solar | The hottest line of a hero beam | Enemy fire |
| At-rest blue | `chart/art/energy.ts` HERO_GLOW | `#69A3FF` | Solar | Hero energy at rest: reactors, engines, coils, shields, a station's form flash | A rung |
| Given blue | `chart/art/energy.ts` HERO_SOFT | `#5B8EE8` | both | Energy given, not fired: tractor and cutting beams, reviewer energy | A weapon |
| Given blue | `chart/fx/timing.ts` TRACTOR | `#5B8EE8` | both | The tractor beam (`= HERO_SOFT`) | A weapon's red or white |
| Danger red | `chart/art/energy.ts` DANGER | `#FF3B2F` | Solar | Enemy fire, threats only | A person, a hero craft, a work state |
| Danger core | `chart/art/energy.ts` DANGER_CORE | `#FFD2C6` | Solar | An enemy beam's hot core | Hero energy |
| Hostile red | `theme/starChart/maneuvers/emergence.ts` HOSTILE | `#D8503F` | Solar | Hyperspace emergence: the fold, the tear flare, its closing ring | A hero colourway |
| Deadly red | `chart/art/aura.ts` AURA.threat | `#CC293D` | Solar | The outline on every open threat (ADO's Bug colour). (The threat light on the frontier belt retired in 19 S2: the belt is never red) | A rung between Ready and Accomplished; a guide |
| Opportunity blue | `chart/art/aura.ts` AURA.objective | `#009CCC` | Solar | The outline on every open objective (ADO's User Story colour) | A rung |
| Victory gold | `chart/art/aura.ts` AURA.accomplished | `#FFC76B` | Solar | The outline on anything Closed (`= SUCCESS`). At rest it holds the same contrast as red and blue; it flares at a victory (§8, §10) | Open work |
| Nav cyan | `chart/fx/timing.ts` CYAN | `#83DDE2` | both | Routes, the followed ship's aura, guides (the frontier belt, dashed, its only colour; formation halos were removed in v4), sensor contact, the default effect colour | A rung |
| Nav green | `chart/fx/timing.ts` NAV_GREEN | `#7FE0A0` | v0 views | A station powering up (scene-diff ring) | A rung; amber |
| Trail white | `chart/fx/timing.ts` TRAIL_COLOR | `#CFE9F2` | both | Wakes and trails behind moving craft; echo sparks | A rung |
| Avatar ivory | `@shared/scene/avatar.ts` AVATAR_TEXT | `#F4F0DE` | both | Initials on an avatar circle | — |

**Rules.**
- **Gold means accomplished.** Victory gold (`SUCCESS`, `#FFC76B`) and its outline mark finished
  work only. `--amber` (`#F1B75B`) is UI chrome: a different, deeper gold, never a rung and never on
  a chart object.
- **Ivory for people's names.** Captain labels and assignee names are `--ivory`; identity comes from
  the avatar (a circle; a square on Solar's holo plates, 19 L8).
- **No true red on people.** Avatar colours, fleet and station colourways avoid reds. Reds belong to
  threats (`HOSTILE` palettes, `DANGER`, `AURA.threat`) and to alerts (`--coral`, UI only).
- **Good guys shoot blue, bad guys shoot red.** Hero energy is `HERO` and its family at every rung;
  only threats fire `DANGER`.
- **Hue is never the only signal** (INV-20). Every rung also changes form.

Not exported, so not in the table: each faction's fire colour (`STYLE` in `chart/art/dreadnoughts.ts`:
Trek `#BFF3EE`, Wars `#B4F0B8`, Mecha `#E6F4EA`), the stations' own hostile red (`#D9464F`, same file)
and `DANGER_PALE` (`#FF8F7C`, `chart/art/energy.ts`).

**Source:** `chart/art/progress.ts`, `chart/art/energy.ts`, `chart/art/aura.ts`, `chart/fx/timing.ts`,
`theme/starChart/maneuvers/emergence.ts`, `@shared/scene/avatar.ts` · **Guard:** `docTables.test.ts`;
`signal.test.ts` (ladder parity); `npm run gallery` → the v1 sections (Worlds, Threats, v1 · Facilities)
and the Registry sections · **Update when:** a colour is retuned, a new named colour is exported, or a
colour takes a new job.

**Hostile colourways** (Solar, threats only). The swarm picks one by seed.

<!-- table: hostile-colourways -->
| Constant | Name | Hull | Accent | Glow |
|---|---|---|---|---|
| `chart/art/swarm.ts` HOSTILE[0] | Crimson & obsidian | `#84182A` | `#18141C` | `#FF4438` |
| `chart/art/swarm.ts` HOSTILE[1] | Oxblood & charcoal | `#541722` | `#36333B` | `#FF5C48` |
| `chart/art/swarm.ts` HOSTILE[2] | Vermilion & black | `#A8361A` | `#121014` | `#FF5A1E` |
| `chart/art/swarm.ts` HOSTILE[3] | Rust & ash | `#7A3A20` | `#4A4140` | `#FF6E30` |
| `chart/art/swarm.ts` HOSTILE[4] | Magenta-red & void | `#80184B` | `#1C1021` | `#FF3A86` |
| `chart/art/swarm.ts` HOSTILE[5] | Obsidian & blood | `#261C22` | `#9C1C2A` | `#FF3030` |

**Source:** `chart/art/swarm.ts` · **Guard:** `docTables.test.ts`; `npm run gallery` → Threats ·
enemy enemy ships · **Update when:** a colourway is added or retuned (keep hue about 320°–40°, 06 §9).

**Fleet colourways** (Solar, captain ships). Clear of hostile and ladder hues.

<!-- table: fleet-colourways -->
| Constant | Name | Hull | Accent |
|---|---|---|---|
| `chart/art/fleet.ts` COLOURWAYS[0] | Forest & ivory | `#2E6443` | `#EBE3C8` |
| `chart/art/fleet.ts` COLOURWAYS[1] | Jade & navy | `#2A9C7C` | `#262F52` |
| `chart/art/fleet.ts` COLOURWAYS[2] | Teal & ivory | `#1E7B87` | `#EEE6CF` |
| `chart/art/fleet.ts` COLOURWAYS[3] | Navy & ivory | `#262F52` | `#ECE4CC` |
| `chart/art/fleet.ts` COLOURWAYS[4] | Olive & cream | `#6E7A34` | `#E4DCC2` |
| `chart/art/fleet.ts` COLOURWAYS[5] | Chartreuse & pine | `#A2B63A` | `#22473A` |
| `chart/art/fleet.ts` COLOURWAYS[6] | Ivory & teal | `#E0D9C4` | `#1F7F89` |
| `chart/art/fleet.ts` COLOURWAYS[7] | Seafoam & navy | `#7CC2AE` | `#262F52` |

**Source:** `chart/art/fleet.ts` · **Guard:** `docTables.test.ts`; `npm run gallery` → the fleet
lineup · **Update when:** a colourway is added or retuned (never a hostile hue, never leading with a
ladder hue).

**Avatar colours** (both views). Initials in `AVATAR_TEXT` on a colour picked by the initials alone.

<!-- table: avatar-colours -->
| Constant | Hex | Name |
|---|---|---|
| `@shared/scene/avatar.ts` AVATAR_COLORS[0] | `#3D3F8F` | indigo |
| `@shared/scene/avatar.ts` AVATAR_COLORS[1] | `#9C3D22` | brick |
| `@shared/scene/avatar.ts` AVATAR_COLORS[2] | `#8A4B1E` | rust |
| `@shared/scene/avatar.ts` AVATAR_COLORS[3] | `#5E6A1F` | olive |
| `@shared/scene/avatar.ts` AVATAR_COLORS[4] | `#3F6F2A` | moss |
| `@shared/scene/avatar.ts` AVATAR_COLORS[5] | `#23704A` | forest |
| `@shared/scene/avatar.ts` AVATAR_COLORS[6] | `#13705F` | jade |
| `@shared/scene/avatar.ts` AVATAR_COLORS[7] | `#146A72` | teal |
| `@shared/scene/avatar.ts` AVATAR_COLORS[8] | `#243F78` | navy |
| `@shared/scene/avatar.ts` AVATAR_COLORS[9] | `#8C2C66` | magenta |
| `@shared/scene/avatar.ts` AVATAR_COLORS[10] | `#7A5C14` | bronze |
| `@shared/scene/avatar.ts` AVATAR_COLORS[11] | `#6F4A32` | walnut |

**Source:** `@shared/scene/avatar.ts` · **Guard:** `docTables.test.ts`; `avatar.test.ts` (AA for
ivory initials, no ladder hues) · **Update when:** a swatch is added, dropped or retuned.

---

## 3. Signal ladder

Every object with a state climbs the same rungs: one colour, ornament, contrast and motion each.
Rationale: [09 §1](09-signal-ladder.md#1-the-idea), [09 §5](09-signal-ladder.md#5-motion-by-rung),
[09 §9](09-signal-ladder.md#9-v1-the-rung-carried-by-light-13-4-9-amended-2026-10-12) (Solar).

<!-- table: rungs -->
| Rung | Constant | Hex | Ornament | Contrast | Motion | Mega-label mark |
|---|---|---|---|---|---|---|
| Ready | `chart/art/progress.ts` READY | `#8A93A6` | Silhouette; New is a sketch (Solar: a grey radar wireframe) | Lowest: recedes | Still, or one very slow breath (about 12 s) | ○ |
| Underway | `chart/art/progress.ts` PROGRESS | `#5AA9FF` | Detail arrives: it becomes visibly its kind | Highest: the brightest thing in view | Strongest: on the 2.4 s beat | ◔ |
| Nearing | `chart/art/progress.ts` NEARING | `#A487FF` | Fuller form; gold creeps in with `step` | High | The same motion, quicker (1.6 s) and lighter | ◕ |
| Accomplished | `chart/art/progress.ts` SUCCESS | `#FFC76B` | One final ornament | Second: done, calmer than active work | A burst when it happens, then still (a closed world's city lights excepted) | ● |
| Off | `chart/art/progress.ts` RUNG_COLOR.off | `#6F7787` | Ghost, desaturated and dashed; Rejected adds a strike; unknown adds "?" | Off the ladder: no rank | Still | ⊘ |

Off-ladder flags: **Deferred** is Ready plus pause bars. In Solar, fixed-colour objects (a world
line, a material, a hostile or faction colourway) carry the rung in their **light**: rim, halo, cut
lines, work light, fire. Stations carry intensity, not a rung. Captain ships carry no rung.

**Source:** `chart/art/progress.ts` (`RUNG_COLOR`, `RUNG_NAME`; the mega-label marks are `RUNG_MARK`
in `chart/holo/holoRows.ts`) · **Guard:** `docTables.test.ts`; `signal.test.ts`;
`npm run gallery` (every state cell shows its rung) · **Update when:** a rung's colour or look
changes; amend 09 in the same change.

<!-- table: rung-motion -->
| Constant | Value | Meaning |
|---|---|---|
| `chart/art/progress.ts` PROGRESS_PERIOD | 2.4 | Seconds per beat of the progress pulse (Underway) |
| `chart/art/progress.ts` NEARING_PERIOD | 1.6 | Seconds per beat when Nearing (quicker) |
| `chart/art/progress.ts` ACTIVITY.ready | 0.12 | State motion on Ready (0 is still) |
| `chart/art/progress.ts` ACTIVITY.underway | 1 | State motion on Underway: the most |
| `chart/art/progress.ts` ACTIVITY.nearing | 0.7 | State motion on Nearing |
| `chart/art/progress.ts` ACTIVITY.accomplished | 0 | Still |
| `chart/art/progress.ts` ACTIVITY.off | 0 | Still |

Ready's 12 s breath is a literal in each place that draws it (`asteroids.ts`, `anomaly.ts`, `planet.ts`, `swarm.ts`), not a constant.
Ambient identity motion (rotation, window lights, ship bob) is not state and runs on every rung.

**Source:** `chart/art/progress.ts` · **Guard:** `docTables.test.ts`; `npm run gallery` · **Update
when:** a tempo or activity level changes.

**States → rungs, by pack.** Each cell is `Type: State, State`; types are separated by `;`. The
attachment entity (a PR, a note, a quote) is the same in every pack: active → Underway, completed →
Accomplished, abandoned → Off (ghost). A state with no rung falls back to its stage, then its
category (`RUNG_OF_CATEGORY` in `@shared/engine/signal.ts`); an unmapped state is unknown (INV-11).

<!-- table: pack-rungs -->
| Rung (flags) | SDLC | Todo | CRM |
|---|---|---|---|
| Ready (sketch) | Feature: New; User Story: New; Bug: New; Task: New | Todo: New; Problem: Spotted; Checklist Item: Open | Deal: Lead; Escalation: Reported; Follow-up: Scheduled |
| Ready | Feature: Draft, Ready for Review, Ready; User Story: Ready, Ready for Review; Bug: Ready, Ready for Review | Todo: Planned; Problem: Confirmed | Deal: Qualified, Proposal; Escalation: Triaged |
| Ready (deferred) | Feature: Deferred; User Story: Deferred | Todo: Someday | Deal: On Hold |
| Underway | Feature: Active; User Story: Active; Bug: Active; Task: Active | Todo: Doing; Problem: Fixing; Checklist Item: Started | Deal: Negotiation; Escalation: Working; Follow-up: In Progress |
| Nearing (step 0.3) | User Story: Resolved; Bug: Resolved | Todo: Almost Done; Problem: Checking | Deal: Verbal Commit; Escalation: Mitigated |
| Nearing (step 0.65) | Feature: Ready to Accept; User Story: Ready to Accept; Bug: Ready to Accept | — | Deal: Contract Out; Escalation: Customer Review |
| Accomplished | Feature: Closed; User Story: Closed; Bug: Closed; Task: Closed | Todo: Done; Problem: Fixed; Checklist Item: Checked | Deal: Closed Won; Escalation: Settled; Follow-up: Done |
| Off (ghost) | Feature: Removed; User Story: Removed; Bug: Removed; Task: Removed | Todo: Dropped; Problem: Dropped; Checklist Item: Skipped | Deal: Closed Lost; Escalation: Duplicate; Follow-up: Cancelled |
| Off (ghost, strike) | Bug: Rejected | Problem: Not a Problem | Escalation: Withdrawn |

**Source:** `config/state-mapping.json` (SDLC), `config/packs/todo.mapping.json`,
`config/packs/crm.mapping.json` · **Guard:** `docTables.test.ts`; `signal.test.ts` (SDLC equals
`SIGNALS`); `packs.test.ts` (each pack state equals its stage's rung) · **Update when:** a pack adds,
renames or remaps a state.

---

## 4. Roles, kinds and assets

What draws each engine role, and every node kind's words. Rationale: [12 §3](12-glossary.md#3-pieces-what-is-on-the-board),
[13 §4](13-game-design.md#4-pieces-and-their-lifecycles), [06 §9](06-visual-brief.md#9-v1-the-solar-system-13-9-amended-2026-10-12).

**Roles** (Solar). The theme's `roleAsset` table binds each role to an asset id; remix there.

<!-- table: roles -->
| Engine role | Constant | Asset id | Asset def | Node kind | Art (file · class) | Layer | Label rank | SDLC | Todo | CRM |
|---|---|---|---|---|---|---|---|---|---|---|
| Seat | `theme/starChart/index.ts` starChart.roleAsset.seat | `world` | `theme/starChart/assets/seat.ts` seatAsset | `seat` | `chart/art/worlds.ts` · WorldView | celestial | 1 | Assignee | Member | Sales rep |
| Objective | `theme/starChart/index.ts` starChart.roleAsset.objective | `asteroid` | `theme/starChart/assets/objective.ts` objectiveAsset | `objective` | `chart/art/asteroids.ts` · AsteroidView | celestial | 3 | User Story | Todo | Deal |
| Threat | `theme/starChart/index.ts` starChart.roleAsset.threat | `hive` | `theme/starChart/assets/threat.ts` threatAsset | `threat` | `chart/art/swarm.ts` · HiveShipView | infrastructure | 3 | Bug | Problem | Escalation |
| Facility | `theme/starChart/index.ts` starChart.roleAsset.facility | `dreadnought` | `theme/starChart/assets/facility.ts` facilityAsset | `facility` | `chart/art/dreadnoughts.ts` · DreadnoughtView | infrastructure | 2 | Repository | Shared context ("Home") | Account |
| Agent | `theme/starChart/index.ts` starChart.roleAsset.agent | `captain` | `theme/starChart/assets/agent.ts` agentAsset | `captain` | `chart/art/fleet.ts` · CaptainView | traffic | 4 | Person (assignee, changed-by, PR author, reviewer) | Member | Rep |
| Step | `theme/starChart/index.ts` starChart.roleAsset.step | `augmentation` | — (inner part) | — | Inside its parent: an asteroid's augmentation, a hive's weapon pod | parent's | — | Task | Checklist Item | Follow-up |
| Attachment | `theme/starChart/index.ts` starChart.roleAsset.attachment | `shuttle` | — (inner part) | — | Inside its station: a tender shuttle | parent's | — | Pull Request | Note or file | Quote |
| Guard | `theme/starChart/index.ts` starChart.roleAsset.guard | `point-defense` | — (inner part) | — | Inside its station: point defense | parent's | — | Pipeline run | Reminder | Approval |
| Container | `theme/starChart/index.ts` starChart.roleAsset.container | `none` | — (not drawn) | — | Not shown in Solar (since 19 L6 a station's rows are its PRs) | — | — | Feature | — | — |

Layers (`AssetDef.layer`, `chart/assets/types.ts`) are three: `celestial` is painted and scales
with the world, with no screen floor; `infrastructure` and `traffic` are crisp, with a screen floor
(§5). There is no `hardware` asset layer: that word is only the drawn view's two-way split
(`'celestial' | 'hardware'` in `theme/starChart/assets/adapt.ts` and the gallery), where both
floored layers count as hardware. Label rank: lower places first. The inner parts are
`INNER_PARTS` in `theme/starChart/index.ts`; no asset registers them.

**Source:** `theme/starChart/index.ts` (`roleAsset`, `INNER_PARTS`), `theme/starChart/assets/*.ts`
(`id`, `layer`, `rank`), the pack mappings (type names) · **Guard:** `docTables.test.ts`;
`registries.test.ts` (every drawn role names a registered asset; layers and floors);
`gallery-assets.spec.ts`; `npm run gallery` → the Registry sections · **Update when:** a role is
re-pointed, an asset is added or its layer or rank changes, or a pack renames a type.

**Kinds** (`KIND_ORDER`, the order of object-list groups and key rows).

<!-- table: kinds -->
| Constant | Glyph | Chart word | ADO word | ADO plural | View |
|---|---|---|---|---|---|
| `vocab.ts` KINDS.galaxy | ◎ | Galaxy | Project | Projects | both |
| `vocab.ts` KINDS.star | ✦ | Star | Feature | Features | both (Solar: an Area Path's, `SOLAR_NAMES.star`) |
| `vocab.ts` KINDS.planet | ● | Planet | User Story | User Stories | v0 views |
| `vocab.ts` KINDS.anomaly | ✶ | Anomaly | Bug | Bugs | v0 views |
| `vocab.ts` KINDS.missionPoint | · | Mission point | Task | Tasks | v0 views |
| `vocab.ts` KINDS.station | ⌂ | Supply station | Repository | Repositories | v0 views |
| `vocab.ts` KINDS.flight | ▸ | Cargo flight | Pull Request | Pull Requests | v0 views |
| `vocab.ts` KINDS.captain | ➤ | Captain | Person | People | v0 views (Solar: `SOLAR_NAMES.captain`) |
| `vocab.ts` KINDS.seat | ◉ | Homeworld | Assigned person | Assigned people | Solar |
| `vocab.ts` KINDS.objective | ◇ | Asteroid | User Story | User Stories | Solar |
| `vocab.ts` KINDS.threat | ✶ | Enemy ship | Bug | Bugs | Solar |
| `vocab.ts` KINDS.facility | ⌂ | Station | Repository | Repositories | Solar |

The solar board's kinds are `SOLAR_KINDS`: v0's map key never lists them. `KINDS.assignmentBeacon`
(◆, Assignment beacon, Assignment) exists but is not in `KIND_ORDER`: beacons are disabled. The ADO
words are the SDLC pack's; `kindName` prefers the node's own type name. Every surface shows both
words, the ADO word first and the chart word after it in the quieter `.metaphor` style (22 B1, R12);
there is no switch between them. Solar's chart words are the theme's own (`theme/starChart/words.ts`;
`vocab.test.ts` holds them together).

**Solar's key** (19 P2, R3). Under Solar the map key lists only the kinds Solar draws (`SOLAR_KEY`),
in `KIND_ORDER`, with Solar's words where a shared kind means something else there (`SOLAR_NAMES`:
a star is an Area Path's, never a Feature; a captain is the person work is assigned to, 22 B2). The object list and the inspector read the
same words (`kindNames`). The round's previews (19 P1) draw homeworlds, asteroids and enemy ships, so
the key marks those rows as here in the round as it does inside a region. The key's one sector row is
the sprint (`SOLAR_SECTORS`), its lines are Solar's (`SOLAR_LINES`: orbit arc, frontier belt, route),
and a star's looks read its pod's work as a whole (`POD_MEANING`), not a Feature's state. The key's
columns are the ADO word, then the chart word, quieter (22 B1).

<!-- table: solar-kinds -->
| Constant | Glyph | Chart word | ADO word | ADO plural | Where Solar draws it |
|---|---|---|---|---|---|
| `vocab.ts` KINDS.galaxy | ◎ | Galaxy | Project | Projects | All projects |
| `vocab.ts` SOLAR_NAMES.star | ✦ | Star | Area Path | Area Paths | The round, and a region's centre |
| `vocab.ts` SOLAR_NAMES.captain | ➤ | Captain | Assigned person | Assigned people | A region |
| `vocab.ts` KINDS.seat | ◉ | Homeworld | Assigned person | Assigned people | A region, and the round's previews |
| `vocab.ts` KINDS.objective | ◇ | Asteroid | User Story | User Stories | A region, and the round's previews (by count) |
| `vocab.ts` KINDS.threat | ✶ | Enemy ship | Bug | Bugs | A region, and the round's previews (by count) |
| `vocab.ts` KINDS.facility | ⌂ | Station | Repository | Repositories | A region |

A person is two forms in a region, their homeworld and their captain, and pressing either selects
the person, so the inspector names both: `Assigned person · captain and homeworld` (`kindLine`).

**Source:** `vocab.ts` (`KINDS`, `KIND_ORDER`, `SOLAR_KINDS`, `SOLAR_KEY`, `SOLAR_NAMES`) · **Guard:**
`docTables.test.ts`; `registries.test.ts`; `solar.spec.ts` (the key under Solar) · **Update when:** a
kind is added or reordered, or its words change.

---

## 5. Sizes, floors and layout

The label is the unit of size: `infrastructure` and `traffic` assets keep a screen floor, `celestial`
bodies scale with the world.
Rationale: [06 §2, Relative scale](06-visual-brief.md#relative-scale-the-label-is-the-unit),
[08 §7](08-layout-solver.md#7-the-solar-system-v1-built-2026-10-10-to-2026-10-12).

**Floors.** A floor is a minimum on-screen **radius**, in px, for a selectable object.

<!-- table: floors -->
| Constant | Applies to | View | × LABEL_PX | px |
|---|---|---|---|---|
| `@shared/scene/sizing.ts` LABEL_PX | The nominal label height: the unit | both | 1 | 48 |
| `@shared/scene/sizing.ts` FLOOR_PX.captain | A captain ship (about 1.2 labels long) | both | 0.6 | 28.8 |
| `@shared/scene/sizing.ts` FLOOR_PX.assignmentBeacon | An assignment beacon (disabled) | v0 views | 0.3 | 14.4 |
| `@shared/scene/sizing.ts` FLOOR_PX.flight | A PR cargo vessel | v0 views | 0.55 | 26.4 |
| `@shared/scene/sizing.ts` FLOOR_PX.station | A supply station | v0 views | 0.9 | 43.2 |
| `@shared/scene/sizing.ts` FLOOR_PX.missionPoint | A Task pin | v0 views | 0.5 | 24 |
| `@shared/scene/sizing.ts` FLOOR_PX.threat | A enemy ship | Solar | 0.3 | 14.4 |
| `@shared/scene/sizing.ts` FLOOR_PX.facility | A station (twice a captain ship) | Solar | 1.2 | 57.6 |
| `@shared/scene/sizing.ts` RADAR_DOT_FLOOR_PX | A radar Task dot | v0 views | 0.27 | 12.96 |
| `@shared/scene/sizing.ts` RADAR_DONE_FLOOR_PX | An Accomplished radar dot | v0 views | 0.2 | 9.6 |
| `theme/starChart/assets/agent.ts` agentAsset.floorPx | Captain ship asset (matches `FLOOR_PX.captain`) | Solar | 0.6 | 28.8 |
| `theme/starChart/assets/threat.ts` threatAsset.floorPx | Enemy ship asset (matches `FLOOR_PX.threat`) | Solar | 0.3 | 14.4 |
| `theme/starChart/assets/facility.ts` facilityAsset.floorPx | Station asset (matches `FLOOR_PX.facility`) | Solar | 1.2 | 57.6 |

Seats and objectives are celestial: no floor. An asset's floor, like a kind's, applies only to a
selectable node (`GraphScene.setCameraScale`, 19 P1): the round's decorative preview marks have none.

**Hits and targets** (VC-3: every hit is at least 12 px, and no two overlap).

<!-- table: hits -->
| Constant | Value | Unit | View | Meaning |
|---|---|---|---|---|
| `@shared/scene/sizing.ts` MIN_TARGET_PX | 32 | px across | both | Every clickable object, for a pointer: a hit radius of at least 16 px (`hitRadius`) |
| `@shared/scene/sizing.ts` TOUCH_TARGET_PX | 44 | px across | both | Objects that lead somewhere, at a scene's opening scale |
| `theme/starChart/assets/objective.ts` objectiveAsset.hitFloorPx | 12 | px radius | Solar | Formation members' hit floor (D12) |
| `theme/starChart/assets/threat.ts` threatAsset.hitFloorPx | 12 | px radius | Solar | Formation members' hit floor (D12) |
| `@shared/scene/sizing.ts` ATTACH_GAP_PX | 6 | px | both | Gap between attached objects |
| `@shared/scene/project/traffic.ts` REST_BY_NAME | 0.9 | rad | Solar | A ship at rest by its own planet (nothing worked yet) stands this far round from the planet's name, so the name and the ship read together (22 A9). A ship at rest by a piece on a planet stands off that planet, on the piece's side; placement tries sixteenths of a turn round it in Solar |
| `@shared/scene/sizing.ts` LABEL_W_PX | 270 | px | both | The widest callout plate |

Radar Task dots keep a 12 px hit radius (a literal in `hitRadius`). Formation hits stop halfway to
the nearest neighbour.

**Source:** `@shared/scene/sizing.ts`, `theme/starChart/assets/*.ts` · **Guard:** `docTables.test.ts`;
`registries.test.ts` (celestial has no floor; infrastructure and traffic have one); `solar.spec.ts` VC-2 (every hit 12 px
or more) and VC-3 (no two overlap); `density.spec.ts` · **Update when:** a floor or target changes;
change `FLOOR_PX` and the asset's `floorPx` together.

**Geometry** (Solar). World units unless marked. Bump `SOLAR_LAYOUT_VERSION` with any change here and
regenerate the solar goldens in the same change.

<!-- table: geometry -->
| Constant | Value | Meaning |
|---|---|---|
| `@shared/engine/solar/version.ts` SOLAR_LAYOUT_VERSION | 10 | The layout's version (10: compound promotion, 23 C6, and a ghost reseated while Off takes a slot, 23 C9; 9: trophy shell 0 a full trophy's width off the rim, so the planet's name has room; 8: the mandala, 22 Block D; 7: stations on two rings, 22 C11; 6: stations half a planet's size) |
| `@shared/engine/solar/version.ts` OBJECT_SCALE | 2 | Objects against their labels: v1 sizes times this |
| `@shared/engine/solar/version.ts` SQUASH | 0.7 | Orbit tilt: ry = rx · SQUASH (v0 boards use 0.5) |
| `@shared/engine/solar/version.ts` GEOMETRY.starR | 150 | The region's star, at the origin |
| `@shared/engine/solar/version.ts` GEOMETRY.planetR | 520 | A seat's planet; one size for every seat (INV-19) |
| `@shared/engine/solar/version.ts` GEOMETRY.pieceR | 104 | An objective or threat at full size (52 · OBJECT_SCALE): its on-planet slot's radius, both sides one size. A planet whose busier side won't fit at `PIECE_PAD` draws all its pieces smaller (22 D1) |
| `@shared/engine/solar/mandala.ts` PIECE_PAD | 0.5 | The least padding between two on-planet slots (and across the meridian), in slot diameters: half an asteroid (22 D1) |
| `@shared/engine/solar/version.ts` GEOMETRY.platformR | 83.2 | A finished piece, a trophy (pieceR · 0.8): a trophy slot is twice this across, the larger of a closed story and a closed bug (22 D2) |
| `@shared/engine/solar/plan.ts` TROPHY_W | 166.4 | A trophy slot's width (2 · platformR). The ring sits half of one off the planet's rim; neighbours at most one slot apart; each further shell √3 slots out, turned half a slot; the loiter ring one more slot past the last shell (22 D2, D3) |
| `@shared/engine/solar/version.ts` GEOMETRY.shipR | 56 | A captain's ship, half its length: loiter slots are a ship long, padded by another ship (a 4 · shipR pitch, at least; the drawn length at a far zoom), and the seat's footprint reaches a ship past its loiter ring (22 D3) |
| `@shared/engine/solar/version.ts` GEOMETRY.seatGap | 420 | Clear space between two seats' footprints |
| `@shared/engine/solar/version.ts` GEOMETRY.starGap | 300 | Clear space from the star to a footprint |
| `@shared/engine/solar/version.ts` GEOMETRY.radiusStep | 16 | The radius search's step along a seat's ray |
| `@shared/engine/solar/version.ts` GEOMETRY.maxRadius | 60000 | The radius search's limit |
| `@shared/engine/solar/version.ts` GEOMETRY.arcPad | 80 | An orbit arc's run past a footprint, each side |
| `@shared/engine/solar/version.ts` GEOMETRY.arcMin | 0.2 | The shortest orbit arc, radians either side of the planet |
| `@shared/engine/solar/version.ts` GEOMETRY.lane | 96 | Clear lane from the outermost footprint to the frontier belt, in ρ |
| `@shared/engine/solar/version.ts` GEOMETRY.frontierR | 88 | A piece in the frontier belt (44 · OBJECT_SCALE) |
| `@shared/engine/solar/version.ts` GEOMETRY.frontierGap | 24 | Clearance between frontier pieces |
| `@shared/engine/solar/version.ts` GEOMETRY.frontierPad | 32 | Belt padding beyond a piece's ρ-extent, each side |
| `@shared/engine/solar/version.ts` GEOMETRY.facilityR | 260 | A facility's half-length: its hull is as long as a planet's radius (130 · OBJECT_SCALE) |
| `@shared/engine/solar/version.ts` GEOMETRY.satelliteDist | 338 | A satellite's distance from its station's centre |
| `@shared/engine/solar/version.ts` GEOMETRY.satelliteR | 42 | A satellite's radius |
| `@shared/engine/solar/version.ts` GEOMETRY.guardDist | 306 | A guard's distance from its station's centre |
| `@shared/engine/solar/version.ts` GEOMETRY.facilityGap | 360 | Clearance a facility keeps from everything else |
| `@shared/engine/solar/version.ts` GEOMETRY.orbitBand | 24 | An orbit line's half-width; a facility never sits on one |
| `@shared/engine/solar/version.ts` GEOMETRY.searchStep | 40 | The step of the stations' ring searches: the inner ring's radius, the outer ring's moves out |
| `@shared/engine/solar/stations.ts` STATION_PAD | 760 | A station's padding, its own width (2 · FACILITY_REACH; 22 C11, the user's third look): from the other stations on its ring (the outer ring's at its size). Pieces, platforms, formations, the frontier belt and orbit lines keep `facilityGap` |
| `@shared/engine/solar/stations.ts` BODY_PAD | 0.5 | The share of `STATION_PAD` a ring station keeps from the star and the planets. A full width pushed small, busy systems' planets out so far (Harbor Pod 1,702 → 3,217) that at 1024×640 floored hits overlapped (VC-3); half gives 2,519 and holds |
| `@shared/engine/solar/stations.ts` OUTER_SIZE | 0.7 | An outer-ring station's size against an inner one's: hull, satellites and screen floor (`floorScale`) (new, 22 C11) |
| `@shared/engine/solar/stations.ts` RING_MAX_SCALE | 2 | How far a ring station may be drawn past its planned size at a small fit (1 + STATION_PAD / (2 · FACILITY_REACH): into half its padding), so it keeps exactly to its slot (`ViewNode.maxScale`; new, 22 C11) |
| unguarded: `@shared/engine/solar/stations.ts` AIM_MIN | 0.15 | A multi-planet station whose seats' weighted centre is this close to the star (a share of the orbit) has no aim, and takes the first free slot (new, 22 C11) |
| unguarded: `@shared/engine/solar/plan.ts` MAX_PUSHES | 40 | The most times the planets' ring moves out (at least 5% each) until the inner ring's taken slots fit, padded (new, 22 C11) |
| `@shared/engine/solar/version.ts` GEOMETRY.besideTurn | 0.2618 | Unused since the two rings (22 C11); the old beside search's rotation step (π/12, 15°) |
| `@shared/engine/solar/version.ts` GEOMETRY.compoundCap | 6 | Open attachments a compound draws before "+N" |
| `@shared/engine/solar/version.ts` GEOMETRY.attachmentSpread | 0.4488 | Angle between attachment slots on the front arc (π/7) |
| `@shared/engine/solar/version.ts` GEOMETRY.guardSpread | 0.6981 | Angle between guard slots on the back arc (2π/9, 40°) |
| `@shared/engine/solar/version.ts` FACILITY_REACH | 380 | Everything a facility draws reaches this far (satelliteDist + satelliteR) |
| `chart/scenes/placeFormation.ts` FORMATION_PITCH_PX | 25 | Unused for layout since the mandala (22 Block D: slots never spread); the density guard's floor for on-screen pitch, two 12 px hits and a little |

**Source:** `@shared/engine/solar/version.ts`, `chart/scenes/placeFormation.ts` · **Guard:**
`docTables.test.ts`; `solarLayout.test.ts`; `placeStations.test.ts`; the goldens in
`tests/golden/solar.test.ts` (`solar.plan.json`, `solar.scenes.json`); `density.spec.ts` · **Update
when:** any layout size or rule changes (bump the version), or the screen pitches change.

**Preview** (Solar's round, 19 P1). Each pod star's preview of its region, in the round's world units:
one small planet per seat on the front of a ring (and, past the ring's slots, on wider rings outside
it), one rock per objective on the star's left and one hive mark per threat on its right, every one
(22 A1, 2026-10-14: the caps of 24 and 5 are gone), in groups of five: a quincunx, a die's five, filling
two corners, the other two, then the centre, so a group of four reads as a square and five as a die.
Groups stand four high from the star's level up, then the next column starts further out. Decorative: not
selectable, not labelled, no floor. Its footprint (`reachX`, `reachY`) is fixed, so the field spaces
its stars by it and never reflows as history streams (INV-14). Not versioned by `SOLAR_LAYOUT_VERSION`
(the region's layout); the round golden (`solar.round.json`) guards it.

<!-- table: preview -->
| Constant | Value | Meaning |
|---|---|---|
| `@shared/scene/project/preview.ts` PREVIEW.ringRx | 300 | The planets' ring round the pod star: its half-width |
| `@shared/scene/project/preview.ts` PREVIEW.ringRy | 175 | The ring's half-height |
| `@shared/scene/project/preview.ts` PREVIEW.arcFromDeg | 20 | The front arc the ring's slots spread over: from (degrees from the star's right, y down) |
| `@shared/scene/project/preview.ts` PREVIEW.arcToDeg | 160 | The front arc: to |
| `@shared/scene/project/preview.ts` PREVIEW.seatSlots | 8 | Slots on the ring, filled from the front outward at one pitch (the arc ÷ this). More seats go on wider rings, of 7 and 8 slots in turn, each staggered half a pitch; a slot's place depends on its number alone |
| `@shared/scene/project/preview.ts` PREVIEW.ringStep | 0.3 | Each further ring is this much wider and deeper than the last, as a fraction of the first |
| `@shared/scene/project/preview.ts` PREVIEW.planetR | 27 | A preview planet; one size for every seat (INV-19) |
| `@shared/scene/project/preview.ts` PREVIEW.orbitArc | 0.22 | Each planet's orbit arc, radians either side of it |
| `@shared/scene/project/preview.ts` PREVIEW.clusterX | 130 | Where the rocks' groups start, left of the star, and the hive marks', right; each grows outward from there |
| `@shared/scene/project/preview.ts` PREVIEW.clusterY | -16 | Their height from the star's centre (y down) |
| `@shared/scene/project/preview.ts` PREVIEW.rockR | 11 | One rock |
| `@shared/scene/project/preview.ts` PREVIEW.rockPitch | 14 | A rock group's corners from its centre |
| `@shared/scene/project/preview.ts` PREVIEW.rockStep | 74 | From one column of rock groups to the next, outward |
| `@shared/scene/project/preview.ts` PREVIEW.rockRow | 58 | From one rock group to the one above it |
| `@shared/scene/project/preview.ts` PREVIEW.hiveR | 15 | One hive mark's half-length |
| `@shared/scene/project/preview.ts` PREVIEW.hivePitch | 18 | A hive group's corners from its centre |
| `@shared/scene/project/preview.ts` PREVIEW.hiveStep | 92 | From one column of hive groups to the next |
| `@shared/scene/project/preview.ts` PREVIEW.hiveRow | 60 | From one hive group to the one above it |
| `@shared/scene/project/preview.ts` PREVIEW.groupRows | 4 | Groups in a column, from the star's level up |
| `@shared/scene/project/preview.ts` PREVIEW.squash | 0.7 | The groups' vertical squash, into the ring's tilted plane |
| `@shared/scene/project/preview.ts` PREVIEW.reachX | 340 | The preview's reach from its star, sideways, with two rings (15 seats), 60 rocks and 40 hive marks. More groups run on outward, still clear of the next star's (its marks start 710 away) |
| `@shared/scene/project/preview.ts` PREVIEW.reachY | 255 | Its reach below the star, with two rings. A third ring (16 seats or more) reaches past it, still clear of the next star |

**Source:** `@shared/scene/project/preview.ts` (placement), `@shared/hierarchy/solarRound.ts` (what it
shows) · **Guard:** `docTables.test.ts`; `solarRound.test.ts`; the round golden in
`tests/golden/solar.test.ts` (`solar.round.json`, `meridian.round.json`) · **Update when:** a preview size or group changes.

The Power link crew keeps clear of the beam (27 D3):

<!-- table: formation-corridor -->
| Constant | Value | Meaning |
|---|---|---|
| `theme/starChart/maneuvers/formationSpots.ts` CORRIDOR_HALF | 1.5 | Half the corridor round each strand from the station to the work, in captain-ship sizes: a ship, its trail and the beam's glow each side |
| `theme/starChart/maneuvers/formationSpots.ts` CORRIDOR_STEP | 0.2618 | The nearest-clear-line search turns this far each step (π/12, 15°), up to 12 steps either way |
| `theme/starChart/commands.ts` VEIL_ALPHA | 0.3 | The share of its alpha a blocked beam keeps along the stretch that passes the crew's ships |

**Source:** `theme/starChart/maneuvers/formationSpots.ts`, `theme/starChart/commands.ts` · **Guard:** `docTables.test.ts`;
`formationCorridor.test.ts` · **Update when:** the corridor, the step or the fade changes.

---

## 6. Labels and type

How much a label says, what each holo plate shows, and the type and contrast rules. Rationale:
[06 §2, Dynamic labels](06-visual-brief.md#dynamic-labels-slice-3a-decided-2026-10-03-three-modes-revised-2026-10-04),
[06 §9](06-visual-brief.md#9-v1-the-solar-system-13-9-amended-2026-10-12), [12 §6](12-glossary.md#6-visual-system-how-things-look-and-move).

**Label tiers.** One rule (`tierFor`) picks the tier each frame, for every DOM label and its rows.
The states have one set of names (19 Q5, renamed 2026-10-13 from `standard`, `compact` and
`minimal`): **Title**, **Full**, **Expanded** and **Picture**.

<!-- table: label-tiers -->
| Tier | View | When | Shows |
|---|---|---|---|
| `expanded` | Solar | A node with an asset, pointed at (the object or its plate) or selected, and not otherwise Title | The Full label; a holo plate with a list grows its rows in place, under its title (up to `ROW_BUDGET` rows, then "+N") |
| `full` | both | Stopped and settled: the default | Title, then `{type} · #{id} · {state}` (22 B3), then the person after ◆ (holo plates: per variant, below, and the chart's name after the line) |
| `title` | both | Within `SETTLE_MS` of playing or moving, while flashed, or always in a dense grid (`labelCompact`) unless selected | The title only, a size smaller; a holo plate drops its subtitle |
| `picture` | both | A captain, wherever others show their title | The captain's picture alone, hugging the top of the ship. Solar: a 20 px square cut at the plate's corners (`HOLO.cut`), with its tier's frame line and no pointer (19 L8); v0: a ringed circle |

What the pointer is over opens fully, even while playing, but never the followed ship. v0 nodes (no
asset) never go past `full`.

**Expanded plates** (19 L2, built 2026-10-13). The holo plate is the one expanded label: there is no
separate list beside it (the navy mega-label overlay retired). While its node is `expanded`, for
`GRACE_MS` after (time to move onto it), and while the pointer is on it, a plate with a list
(`ViewGraph.lists`) shows its rows under its title in the same frame, lifted (19 §2), over the other
labels. It keeps the side it was placed on and its pointer, and grows away from its object: beside
its object it keeps its near edge and top, upright it keeps its near edge and its centre. It slides
along the edge its pointer meets to stay in the view. If its rows won't fit there, it re-places once,
on expanding, and then holds that place while expanded. It is never wider than 320 px or the view,
nor taller than the view; its rows scroll inside it. Rows use the T2 text colours (lifted when lit),
with the rung marks in the ladder's colours (§3); hovering a row (a long press on touch) lights its
object with a ring, and a press on the row selects it. A station's rows are its PRs (19 L6): each
lights every piece it serves, one ring each, and a press selects the first.

**Source:** `chart/labelTiers.ts` (`LabelTier`, `tierFor`) · **Guard:** `docTables.test.ts`;
`labelTiers.test.ts` (reproduces v0; expands only v1 nodes) · **Update when:** a tier is added or its
rule changes.

**The PR stat line** (B1, v1.3). On an expanded station plate, a PR's row carries one more line under the
work it serves: `✓ 2  ⧖ 1 · 4 pushes · 3 threads · M` (`⧖` was `◷`, which reads as a dot at 9 px and is already the sprints' current-sprint mark). It is the quietest text on the plate: the subtitle's
colour (`--holo-t2-sub`: 7.0:1 on the dark plate, 4.7:1 over white; T3's `--holo-t3-sub` measures 4.39:1 over white, under the 4.5:1 bar) at 9 px, a
size under the subtitle's, even on a lifted plate or a lit row, and display only (no link, no hover of its own). Every PR row holds the line's height from its first draw (R4), so the plate doesn't grow when the facts arrive. The same line is in a PR's Inspector body (*Review*). Collapsed plates and the title tier never show it. Segments
appear only for what was read: **votes** (a glyph and a count each, in the order approved, waiting,
rejected, and only those someone holds), **pushes** (the PR's iterations), **threads** (those a person
started: system, typed and deleted threads aren't counted) and the **size band** (letter only, by the files
changed in the last iteration). A PR with none of them has no line. Votes are the standing ones, read now:
no history, no event, and they never touch the signal ladder (INV-07; 09). *Approved with suggestions*
(vote 5) counts as approved: the line has one check for both. The band measures volume, never merit
(INV-19).

<!-- table: pr-stat -->
| Name | Value | Constant | Meaning |
|---|---|---|---|
| Small band | up to 5 files | `@shared/prStat.ts` PR_SIZE_SMALL_MAX | Files changed up to this many: `S` |
| Medium band | up to 20 files | `@shared/prStat.ts` PR_SIZE_MEDIUM_MAX | Over Small and up to this many: `M`; over it: `L` |
| Approved glyph | ✓ | `@shared/prStat.ts` VOTE_GLYPH.approved | Votes 10 and 5 together (approved, approved with suggestions) |
| Waiting glyph | ⧖ | `@shared/prStat.ts` VOTE_GLYPH.waiting | Vote -5, waiting for the author |
| Rejected glyph | ✕ | `@shared/prStat.ts` VOTE_GLYPH.rejected | Vote -10 |

**Source:** `@shared/prStat.ts` (`prStatLine`, `sizeBand`), `chart/holo/holoRows.ts` and `holo.css`
(`.holo__stat`), `@shared/scene/project/lists.ts` (`facilityList`) · **Guard:** `docTables.test.ts`;
`prStats.test.ts`; `halcyonCoverage.test.ts` (every vote kind and band appears in the demo) · **Update
when:** a threshold, a glyph, or the line's order changes.

**The run line** (Solar, B2, 2026-10-27). A station's expanded plate carries one more quiet line above its PR rows,
`Last run: passed · 2 h ago`: the repository's latest pipeline run on its default branch, with a neutral dot. It is
a state, not an event: the guards stay idle art, nothing flares, no event is made (13 §4.4, Q7). The result is
always in words, and every result has its own dot shape, so colour never carries it alone (INV-20). Two tones, chosen
to sit clear of everything else that means something: a soft green for a run that went through or is going, and a light
cool slate for one that did not. Neither is red; neither is in the signal ladder (blue, violet, gold and two greys, §3;
the slate is a grey, but lighter than the ladder's two, and it is a dot beside text, not a rung mark); neither is a hostile
colourway (saturated hues from 320° to 40°, §2). The green is checked to sit apart from the fleet's Seafoam (`#7CC2AE`),
`--cyan` (`#83DDE2`) and the ladder colours (`repoRuns.test.ts`: at least 40 apart in RGB). It is a dot, not text, so the
text contrast rule does not apply to it; the line's own text is the stat line's colour and size. Failed is a hollow
diamond in slate: never red, never warm, never an alarm. The age counts back from the later of the scope's last sync and when
the run was read, not the playhead: a run is current state, like the votes, and does not rewind. A station with no read
run keeps the line's height empty from its first draw (R4).

<!-- table: run-line -->
| Name | Value | Constant | Meaning |
|---|---|---|---|
| Passed dot | #6EDC82 | `@shared/runLine.ts` RUN_DOT_HEX.passed | Soft green; shape `full` (a filled dot): a completed build that succeeded |
| Partly passed dot | #6EDC82 | `@shared/runLine.ts` RUN_DOT_HEX.partly | Soft green; shape `half` (half filled): `partiallySucceeded` |
| Running dot | #6EDC82 | `@shared/runLine.ts` RUN_DOT_HEX.running | Soft green; shape `ring`: the build is going |
| Queued dot | #6EDC82 | `@shared/runLine.ts` RUN_DOT_HEX.queued | Soft green; shape `dotted` (a dotted ring): the build is waiting for an agent (`notStarted`, `postponed`) |
| Failed dot | #B4BCC9 | `@shared/runLine.ts` RUN_DOT_HEX.failed | Light slate; shape `diamond` (a hollow diamond): a completed build that failed. Never red |
| Canceled dot | #B4BCC9 | `@shared/runLine.ts` RUN_DOT_HEX.canceled | Light slate; shape `bar` (a short filled bar): a completed build that was canceled |
| Failed shape | diamond | `@shared/runLine.ts` RUN_DOT_SHAPE.failed | Hollow, and no other result shares it |
| Canceled shape | bar | `@shared/runLine.ts` RUN_DOT_SHAPE.canceled | No other result shares it |
| Partly passed word | partly passed | `@shared/runLine.ts` RUN_WORD.partly | The honest word for `partiallySucceeded` |
| Canceled word | canceled | `@shared/runLine.ts` RUN_WORD.canceled | The word for `canceled` |
| Re-read interval | 900000 ms | `@shared/runLine.ts` RUN_REREAD_MS | A repository's run is read again, on a refresh, once its last read is this old (15 minutes); never faster |

**Source:** `@shared/runLine.ts` (`runLine`, `runAgo`, the tones), `@shared/ingest/parse.ts` (`parseBuildRun`),
`chart/holo/holoRows.ts` and `holo.css` (`.holo__run`), `@shared/scene/project/lists.ts` (`facilityList`),
`main/sync/prStats.ts` (`readRepoRun`, `runDue`) · **Guard:** `docTables.test.ts`; `repoRuns.test.ts`;
`halcyonCoverage.test.ts` (every result and a repo with no pipeline appear in the demo) · **Update when:** a
tone, a word, the age bands (`runAgo`) or the interval changes.

**The Features row** (Solar, B3, v1.3; one line at rest since 27 B2). The region's star plate carries one more quiet block under its counts line: the
pod's **top Feature by piece count**, one line, `Feature #123 · Title · 5` (the ADO name first, then the count of
the pod's pieces under it; the chart's word for a container, when the theme has one, follows muted and italic), then `+N more` on the
same line when there are others. The row adds height, not width: the name gives way to its ellipsis. When the star is pointed at or selected
(and `GRACE_MS` after), the plate opens the whole list in place: it holds its resting place and grows away from its star, over the work
if it must, since it was opened to be read, and it takes its resting place again when it closes. The opened list shows
**at most eight lines** and scrolls inside its box (wheel- and press-safe like the holo rows). There is no button. **What moves:** the plate is a plate like any other, so it displaces the plates of its
neighbours (R2). At rest it hides no station plate on Quasar and stands above Harbor's star (27 B2); opened, it may cover them while read.
It never covers a piece or a ship at rest. The Inspector lists every Feature (*Features*, no button). The row is the stat
line's tier: the subtitle's T2 colour (`--holo-t2-sub`) at 9 px (T3's colour fails the 4.5:1 bar, as for `pr-stat`). **Counting:** a piece
(a Story or Bug in the region and on the ladder, at the playhead) counts toward its parent when that parent's type is `Feature`;
a piece with no parent, or whose parent is another type (an Epic), is **not counted** anywhere, and no parent is invented. **Order:**
most pieces first; a tie goes to the **lower Feature id** (never the title, which can change or arrive late). A Feature whose
title is not yet known reads `Feature #123` (R4: counts first, detail when known). **Reservation (R4 against R9):** a pod that never has a
Feature in the loaded round has **no row and no blank line** (nothing on the chart without a reason). A pod that has one reserves, from
the first draw, the most lines the row ever needs over the round: `min(1, Features ever)`, so
stepping or seeking never changes the plate's height or flips its side (`featureLinesEver`; the count is of Features that ever parent
one of the region's pieces, an upper bound). The round's stars carry no row. No object is drawn for a Feature (INV-10); this is text.

<!-- table: feature-row -->
| Name | Value | Constant | Meaning |
|---|---|---|---|
| Cap | 1 | `@shared/featureRow.ts` FEATURE_ROW_CAP | Features named at rest before `+N more` (on the same line) |
| Opened lines | 8 | `@shared/featureRow.ts` FEATURE_OPEN_LINES | Lines the opened list shows before it scrolls |
| Line height | 12 px | `@shared/featureRow.ts` FEATURE_LINE_PX | The row's line height, so the opened box is at most eight lines tall |
| Counted type | Feature | `@shared/featureRow.ts` FEATURE_TYPE | A piece's parent of this ADO type is its Feature; any other parent is not counted |

**Source:** `@shared/featureRow.ts` (`rankFeatures`, `featureName`, `featureRows`), `@shared/hierarchy/solarSource.ts`
(`regionFeatures`), `chart/labels.ts` (`featuresBlock`), `holo.css` (`.holo__feat`), `panels/Inspector.tsx` (`PodFeatures`) ·
**Guard:** `docTables.test.ts`; `featureRow.test.ts`; `halcyonCoverage.test.ts` (Quasar and Pulsar have more than three
Features); `demo.spec.ts` · **Update when:** the cap, the counted type, the tie-break or the row's look changes.

**Holo tiers** (Solar, 19 §2, built 2026-10-13). Every holo plate carries a tier
(`HoloSpec.tier`, the plate's and frame's `data-holo-tier`) that sets how loud it is when raised: **T1
Lead** (`lead`: captains, stations), **T2 Door** (`door`: galaxies, pieces), **T3 Place** (`place`:
homeworlds) and **T4 Sky** (`sky`: the stars, the round's and the region's; 22 A5, 2026-10-14, the
quietest: a faint cyan frame, no glow, a size down, its text still AA over white). A station on standby (19 M1, `flags.standby`;
§10) is drawn at T3 when raised, until its next PR wakes it (`ownTier`). **At rest every plate is T4 Sky** (27 B1): no glow, no filter, and a piece keeps its role colour unglowed. A plate rises to its tier while its object is pointed at (or its label), lit from a
list, selected, followed, or emphasized by playback (an interaction's attention slots, P-6: the pieces it casts and the captains it names), and settles back after. Raised, and also pointed at, lit from a list, or selected, any plate is **lifted**: drawn at T1's colours and weight, with the stronger glow,
at its own tier's size. In play every tier keeps its colours and steps down to the title alone, at
`--holo-play-size`. The glass is one opacity at every tier. Tiers are visual weight only: which label
places first is still the rank (§4). Text ratios are on the glass over `--ink`; the second figure is
the worst case the contrast specs measure, the glass over white.

<!-- table: holo-tiers -->
| Constant | Value | Tier | Used for |
|---|---|---|---|
| `--holo-t1-title` | `#d4f7ff` | T1 Lead | Title (16.5:1; 11.2:1) |
| `--holo-t1-sub` | `#8fb6c2` | T1 Lead | Subtitle (8.6:1; 5.8:1) |
| `--holo-t1-line` | `rgba(127, 227, 255, 0.85)` | T1 Lead | Frame and pointer when raised |
| `--holo-t1-dot` | `#7fe3ff` | T1 Lead | The rim dot |
| `--holo-t1-text-glow` | `0 0 6px var(--holo-glow)` | T1 Lead | The title's glow (`text-shadow`) |
| `--holo-t1-frame-glow` | `drop-shadow(0 0 2.5px var(--holo-glow))` | T1 Lead | The frame's glow (`filter`) |
| `--holo-t1-weight` | `600` | T1 Lead | Title weight |
| `--holo-t1-size` | `12px` | T1 Lead | Title size |
| `--holo-t2-title` | `#b7d3da` | T2 Door | Title (11.9:1; 8.1:1) |
| `--holo-t2-sub` | `#8aa2a9` | T2 Door | Subtitle (7.0:1; 4.7:1) |
| `--holo-t2-line` | `rgba(127, 227, 255, 0.5)` | T2 Door | Frame and pointer when raised |
| `--holo-t2-dot` | `rgba(127, 227, 255, 0.7)` | T2 Door | The rim dot |
| `--holo-t2-text-glow` | `none` | T2 Door | The title's glow |
| `--holo-t2-frame-glow` | `drop-shadow(0 0 1.5px var(--holo-glow))` | T2 Door | The frame's glow |
| `--holo-t2-weight` | `400` | T2 Door | Title weight |
| `--holo-t2-size` | `12px` | T2 Door | Title size |
| `--holo-t3-title` | `#9db4ba` | T3 Place | Title (8.6:1; 5.9:1); a quiet galaxy's title when raised |
| `--holo-t3-sub` | `#8a9ea3` | T3 Place | Subtitle (6.7:1; 4.5:1). Tuned from 19 §2's `#7E979E`, which fell to 4.1:1 over white |
| `--holo-t3-line` | `rgba(141, 179, 189, 0.4)` | T3 Place | Frame and pointer when raised, a desaturated grey-cyan |
| `--holo-t3-dot` | `rgba(141, 179, 189, 0.5)` | T3 Place | The rim dot |
| `--holo-t3-text-glow` | `none` | T3 Place | The title's glow |
| `--holo-t3-frame-glow` | `none` | T3 Place | The frame's glow |
| `--holo-t3-weight` | `400` | T3 Place | Title weight |
| `--holo-t3-size` | `11.5px` | T3 Place | Title size |
| `--holo-t4-title` | `#8ca6ad` | T4 Sky | Title (7.3:1; 4.9:1) |
| `--holo-t4-sub` | `#84a0a8` | T4 Sky | Subtitle, the star's counts (6.7:1; 4.6:1) |
| `--holo-t4-line` | `rgba(127, 227, 255, 0.36)` | T4 Sky | Frame and pointer at rest: the stars' cyan, faint |
| `--holo-t4-dot` | `rgba(127, 227, 255, 0.5)` | T4 Sky | The rim dot |
| `--holo-t4-text-glow` | `none` | T4 Sky | The title's glow |
| `--holo-t4-frame-glow` | `none` | T4 Sky | The frame's glow |
| `--holo-t4-weight` | `400` | T4 Sky | Title weight |
| `--holo-t4-size` | `11px` | T4 Sky | Title size |
| `--holo-lift-title` | `#d4f7ff` | Lifted | Title, any tier |
| `--holo-lift-sub` | `#8fb6c2` | Lifted | Subtitle, any tier |
| `--holo-lift-line` | `#7fe3ff` | Lifted | Frame and pointer, at full strength |
| `--holo-lift-dot` | `#7fe3ff` | Lifted | The rim dot |
| `--holo-lift-text-glow` | `0 0 6px var(--holo-glow)` | Lifted | The title's glow |
| `--holo-lift-frame-glow` | `drop-shadow(0 0 4px var(--holo-glow))` | Lifted | The frame's glow |
| `--holo-lift-weight` | `600` | Lifted | Title weight (the size stays the tier's) |
| `--holo-play-size` | `11px` | In play | Every tier's title while compact (playing, moving, a dense grid) |

**Source:** `chart/holo/holo.css` `:root`, `chart/holo/holoLabel.ts` (`HoloTier`) · **Guard:**
`docTables.test.ts` (every tier token has a row); `solar.spec.ts` contrast (the region, the galaxy,
the round); `slice1.spec.ts` VC-2; `npm run gallery` → *Label hierarchy* · **Update when:** a tier's
value changes, or a tier or state is added.

**Holo plates** (Solar). An asset opts in with `AssetDef.label`; a node with no asset (a galaxy, a
star, the round's Load more) gets its paradigm's plate for its kind at its level (`KindPlate`, from
`HierarchyUi.plates`): only Solar has them, so the v0 views keep the navy plate on those levels. v1
has one frame, `chamfer`. The label tier (above) still picks how much a plate says.

<!-- table: holo-variants -->
| Constant | Asset | Tier | Frame | Variant | Layout | Label rim | Shows |
|---|---|---|---|---|---|---|---|
| `theme/starChart/assets/seat.ts` seatAsset.label | `world` | place | chamfer | title | horizontal | — | The homeworld's name, beside the planet along `labelDir`; pointed at (the planet or its plate), it expands into its pieces' rows (19 L5) |
| `theme/starChart/assets/facility.ts` facilityAsset.label | `dreadnought` | lead | chamfer | subtitle | vertical | 0.5 | The repo's name over its type word, below (or above) the hull |
| `theme/starChart/assets/agent.ts` agentAsset.label | `captain` | lead | chamfer | avatar | vertical | 0.4 | The captain's picture as a square filling the plate's near end (24 px, the plate's full height, flush with the frame, cut with the plate's corners, no ring; initials on their swatch when there's none; a picture of another shape fills it from its centre), then their name, above the ship (19 L8). In play the picture alone (`picture` tier) |
| `theme/starChart/assets/objective.ts` objectiveAsset.label | `asteroid` | door | chamfer | subtitle | horizontal | — | Hover-only (19 L7): at rest a seated piece speaks through its planet's plate (its row lit when pointed at, marked when selected); a frontier piece pointed at, selected or lit shows this plate, the story's title over `{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3), beside the piece on its `labelSide`; in play, its title alone while a maneuver casts it (§10). Its frame, pointer and dot are Opportunity blue (22 A6, `--holo-objective-*`) |
| `theme/starChart/assets/threat.ts` threatAsset.label | `hive` | door | chamfer | subtitle | horizontal | — | The bug's title over `{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3), hover-only, as the asteroid's; its frame, pointer and dot Deadly red (22 A6, `--holo-threat-*`) |
| `hierarchy/solarPlates.ts` SOLAR_PLATES.galaxy.galaxy.label | — | door | chamfer | subtitle | horizontal | 0.45 | A galaxy: the project's name; pointed at or selected, its counts beneath (`2 areas · 136 events this week`, or `not charted yet`), below and right of the core |
| `hierarchy/solarPlates.ts` SOLAR_PLATES.sprint.star.label | — | sky | chamfer | subtitle | vertical | 1.1 | A star in the round: the pod's name over its counts by role in the pack's words, then the chart's name, quieter (`12 User Stories · 4 Bugs · star`; a zero part left out; 22 A3, B1), above the star (its preview stays visible below). No path: the inspector has it (22 A4) |
| `hierarchy/solarPlates.ts` SOLAR_PLATES.sprint.overflow.label | — | door | chamfer | subtitle | vertical | 1 | The round's Load more (ADO mode), over its count. Held: no round source has a Load more yet (19 §5) |
| `hierarchy/solarPlates.ts` SOLAR_PLATES.pod.star.label | — | sky | chamfer | subtitle | vertical | 1.1 | The region's star: as the round's, its name over its counts, above it, or below when above is taken (22 A3); or, in a crowded region, up and to a side before it would cover work. With no clear place it hides until pointed at or selected, as other plates do (the breadcrumb names the system); it never covers a piece or a ship |

Label rim is where the pointer meets the art, as a fraction of `world.r` (`AssetDef.labelRim`,
`KindPlate.labelRim`). A horizontal plate leaves along the node's `labelDir`, else its plate's
`dir`, else its `labelSide`.

**Source:** `theme/starChart/assets/*.ts`, `hierarchy/solarPlates.ts`, `chart/holo/holoLabel.ts`
(`HoloSpec`, `KindPlate`) · **Guard:** `docTables.test.ts` (every asset plate and Solar plate has a
row); `solar.spec.ts` contrast; `npm run gallery` → the Registry sections and *Label hierarchy* ·
**Update when:** an asset or a paradigm changes a plate, or a frame, variant or tier is added.

**Label values.**

<!-- table: label-values -->
| Constant | Value | Unit | View | Meaning |
|---|---|---|---|---|
| `chart/labels.ts` SETTLE_MS | 3000 | ms | both | How long an object, and the playback, must be still before its full label returns |
| `chart/labels.ts` FLASH_MS | 3500 | ms | v0 views | A new or changed Task shows its title this long, then fades |
| `@shared/scene/project/lists.ts` ROW_BUDGET | 16 | rows | Solar | Rows an expanded plate shows before "+N" |
| `chart/holo/holoRows.ts` GRACE_MS | 450 | ms | Solar | A plate stays expanded this long after the pointer leaves its object (or the plate) |
| `chart/holo/holoRows.ts` LONG_PRESS_MS | 450 | ms | Solar | A touch held this long on a row lights its object |
| `@shared/scene/sizing.ts` TITLE_MAX_CHARS | 41 | characters | both | Title cap: the longest subtitle ("Pull Request #12345678 · Ready for Review"); longer ends in "…". v0 plates and a list's rows |
| `@shared/scene/sizing.ts` HOLO_TITLE_MAX_CHARS | 82 | characters | Solar | A holo plate's title cap (22 A7): two lines' worth. The title wraps onto a second line and the plate ends that line in "…" (a line clamp, inside its 10 px side padding) when it still runs over |
| `chart/holo/holoLabel.ts` HOLO.reach | 16 | px | Solar | Rim to elbow |
| `chart/holo/holoLabel.ts` HOLO.run | 12 | px | Solar | Elbow to plate |
| `chart/holo/holoLabel.ts` HOLO.cut | 6 | px | Solar | The chamfer on the cut corners |
| `chart/holo/holoLabel.ts` HOLO.dot | 2 | px | Solar | The rim dot's radius |
| `chart/holo/holoLabel.ts` HOLO_EDGE | 4 | px | Solar | The margin an expanded plate keeps from the view's edges |
| `chart/labels.ts` EXPANDED_MAX_W | 320 | px | Solar | An expanded plate's widest (the view's width less the margins, if narrower) |

**Source:** `chart/labels.ts`, `chart/holo/holoRows.ts`, `@shared/scene/project/lists.ts`,
`@shared/scene/sizing.ts`, `chart/holo/holoLabel.ts` · **Guard:** `docTables.test.ts`;
`labelTiers.test.ts` (`ROW_BUDGET`) · **Update when:** a timing, budget or plate dimension changes.

**Type.** Titles, IDs, states and dates are always live DOM text, never painted into textures.

<!-- table: type -->
| Constant | Value | View | Used for |
|---|---|---|---|
| `--sans` | 'Inter', system-ui, sans-serif | both | Names, titles, the inspector, the timeline, every holo plate |
| `--mono` | 'IBM Plex Mono', ui-monospace, monospace | both | Subtitles (`{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3)), panel heads, chips, coordinates, the brand |

Sizes as built: a callout title is 12 px at weight 600, its meta 10 px mono (CSS literals); a holo
title by tier (`holo-tiers`: 12 px at 600 for T1, 12 px at 400 for T2, 11.5 px at 400 for T3, 11 px at
400 for T4, lifted at 600), on up to two lines (22 A7), its subtitle 10.5 px at 400; a Title-tier holo
title `--holo-play-size`, 11 px; an expanded
plate's row 11.5 px at 400, its subtitle 10.5 px, a PR row's served-work line 9.5 px. Only Inter 400 and 600 are
bundled, so no plate asks for another weight.

**Source:** `styles.css`, `chart/holo/holo.css` · **Guard:**
`docTables.test.ts` · **Update when:** a family changes.

**Contrast rules.**

<!-- table: contrast -->
| Applies to | Target | As built | Guard |
|---|---|---|---|
| Vital text: label titles, subtitles and names on their plate; an expanded plate's rows | AA, 4.5:1, without exception | 7.5:1 or more on `--plate`; 6.7:1 or more on `--holo-glass` over ink, 4.5:1 or more over white (`holo-tiers`) | `slice1.spec.ts` VC-2; `solar.spec.ts` contrast |
| Panel and HUD text | AA, 4.5:1 | `--ivory` 15.9:1, `--ivory-60` 6.3:1 on ink | `slice1.spec.ts` VC-2 |
| Ivory initials on an avatar colour | AA, 4.5:1 | Every `AVATAR_COLORS` swatch | `avatar.test.ts` |
| The cosmos quote over ink and the brightest nebula | AA, 4.5:1 | `QUOTE_ALPHA` 0.74 | `scale.test.ts` |
| Disabled controls (`--ivory-35`) | Below AA by design | 2.9:1 | — |
| Role outlines (Deadly red, Opportunity blue, Victory gold rims; 23 C1) | 3:1 (WCAG non-text) against the night sky and against a lit planet face | 5.3, 5.3 and 4.8:1 against the night sky (gold rests within 10% of red and blue, 27 B3); against the pixel past the rim on a lit planet face 3.2 (blue), 6.2 (gold), **red 1.7, below the floor** (§8, aura; HG-C) | `auraContrast.test.ts`; drive `c1-contrast.ts` |
| Visual elements: object colours, the sky, a plate against the sky | By eye at every scale; separate with shape, edges and hairlines | — | `npm run gallery`; `density.spec.ts` screenshots |

**Source:** [06 §2](06-visual-brief.md#2-palette-and-type), [13 §1](13-game-design.md#design-pillars) ·
**Guard:** as listed · **Update when:** a text colour, plate or surface changes, or a target is
raised.

## 7. Maneuvers

In Solar, each data change plays as a maneuver: an engine rule (`src/shared/engine/pace.ts`) and the
theme's choreography for it (`src/renderer/src/theme/starChart/maneuvers/`). Lengths are at 1×.
These tables are the authority; 05 §8 and 13 §6 keep the rationale and the beat-by-beat detail.

<!-- table: maneuvers -->
| Rule id | Choreography | Trigger | Length ms | Tier | Protected | What you see | File |
|---|---|---|---|---|---|---|---|
| `piece.appear` | Sensor contact | Story created, or Bug created as New (a sketch) · `appear` | 1600 | narrative | no | A Nav cyan contact ring tightens; the asteroid spirals in round its planet; two Nav cyan sweeps; its planet's sensor spark; a Ready grey settle ring | `theme/starChart/maneuvers/sensorContact.ts` |
| `threat.emerge` | Hyperspace emergence | Bug created past New, or a New Bug made Ready · `appear` (solid), or `climb` from sketch to Ready | 1550 | narrative | no | Space pinches in, Hostile red; a rift tears open with a Hostile red flare; the enemy ship slides out; it snaps shut; a Ready grey settle ring | `theme/starChart/maneuvers/emergence.ts` |
| `objective.underway` | Carve | Story made Active (also a reopen to Active) · `climb` → Underway | 2400 | narrative | no | The captain sorties beside the asteroid and cuts its facets with a Given blue cutting beam; a Progress blue flare as the carved look lands | `theme/starChart/maneuvers/carve.ts` |
| `objective.nearing` | Rig up | Story Resolved or Ready to Accept · `climb` → Nearing | 2400 | narrative | no | The captain's tractor; gantries build; a Nearing violet ring closes; stations the work goes to haul supplies (Haul); a Nearing violet flare with Victory gold sparks | `theme/starChart/maneuvers/rigUp.ts` |
| `objective.accomplish` | Landing | Story Closed · `climb` → Accomplished | 3400 | essential | yes | A Victory gold ring tightens; the captain's tractor; Victory gold stardust swirls round it as it turns to its platform form; it glides 1.2 s to its trophy slot (`CLOSE_SLIDE_MS`), a Victory gold streak following; the grand flare blossoms as it settles (22 C3) | `theme/starChart/maneuvers/landing.ts` |
| `threat.engage` | Engage | Bug Active or Resolved (also a reopen) · `climb` → Underway or Nearing | 2400 | narrative | no | A lock ring in the rung's colour; four Hero blue bolts; Danger red return fire breaks on the shield; stations add slow covering bolts | `theme/starChart/maneuvers/engage.ts` |
| `threat.accomplish` | Strike run | Bug Closed · `climb` → Accomplished | 4200 | essential | yes | Captain and reviewers make a pass: six Hero blue bolts, reviewers' Given blue energy; the enemy ship breaks up; a culminating explosion in Explosion orange as it turns to its caged hulk; it glides 1.2 s to orbit; the grand flare blossoms as it settles (22 C3) | `theme/starChart/maneuvers/strikeRun.ts` |
| `piece.off` | Warp out | Story or Bug Removed, Rejected or set aside · `climb` → Off | 1800 | narrative | no | Off grey rings; a enemy ship streaks away on a seeded heading; an asteroid fades to a drifting ghost | `theme/starChart/maneuvers/warpOut.ts` |
| `piece.reseat` | Reassign | Assignee changed, to or from Unassigned too · `reseat` | 2400 | narrative | no | The hand-off (22 C7): the piece holds while a Nav cyan route inks to its new slot; it flies the arc with a wake; a Nav cyan arrival ring. The new holder's captain flies to their planet to meet it, arriving as it lands, named *Takes it*; whoever made the change isn't kept busy. The frontier belt holds until it flies, then fades out as the last unassigned piece leaves it, or in as one comes to it (19 S2) | `theme/starChart/maneuvers/reassign.ts` |
| `facility.enter` | Station jump-in | A repository's first PR in the round · `attach` (the first into its facility) | 2815 | narrative | no | The author flies out to where it comes in; space folds, the station slides in; an At-rest blue flare | `theme/starChart/maneuvers/stationJumpIn.ts` |
| `attachment.open` | Shuttle tender | PR opened · `attach` (after `facility.enter` when both play) | 1700 | narrative | no | Progress blue rings on the station; a tender launches to join its patrol | `theme/starChart/maneuvers/shuttleTender.ts` |
| `attachment.settle` | Satellite cycle | PR abandoned (any settle but a merge) · `settle` | 2800 | narrative | no | A ring in the new rung's colour closes on the station; it operates under the author's tractor; approvers lend energy; settle rings. No ship flies it, so it holds no turn (`turn: false`, 22 C7) | `theme/starChart/maneuvers/satelliteCycle.ts` |
| `attachment.merge` | Power link | PR completed (merged) · `settle` → Accomplished; goes ahead of the close of the same work | 7200 | essential | yes | Author and approvers form up; energy chains approvers → author → station; the tender docks in Victory gold; it charges and fires a split beam at the work. In a volley (27 E6): the lead, every member's author and approvers form up; every member's tender docks together; the causes are named in turns, one member's plates and note, then its people, at most four labels at once | `theme/starChart/maneuvers/powerLink.ts` |
| `seat.complete` | Homeworld complete | (new, 2026-10-13) The close that leaves every piece an assignee holds here Closed · `climb` → Accomplished, plays after that close | 4000 | essential | yes | The ship comes home; Victory gold rings gather; the world's finished look lands with the grand flare; its halo blooms; Victory gold city lights glint | `theme/starChart/maneuvers/seatComplete.ts` |
| `region.clear` | All clear | (new, 2026-10-13) The close of the last open Bug in the area path · `climb` (threat) → Accomplished, plays after its strike run | 2950 | essential | yes | A Deadly red ring collapses on the wreck; a Hero blue all-clear sweeps from the star, each planet catching it; the star breathes (19 S2: the threat light on the belt retired) | `theme/starChart/maneuvers/regionClear.ts` |
| `agent.light` | Captain jump | Any other change a person made that no rule plays (Lively and Maximum only) · any move but `retitle` | 1200 | ornament | no | The captain sorties beside the work and holds it in a Given blue tractor; at a enemy ship, three Hero blue bolts instead | `theme/starChart/maneuvers/captainJump.ts` |
| `agent.progress` | Progress beam | (new, 27 E3) The director (27 E5a, 05 P-20) plays it for a merge that doesn't close its work and isn't a facility's first, in the volley's place, with its own cast; a Task update does not trigger it · none | 1500 | narrative | no | A ring of At-rest blue tightens on the captain; it fires one half-weight beam from where it is at the work, a Hero blue phaser at a enemy ship or its mining beam at an asteroid (a merge's tender docks as it fires); a small Hero blue flare lands on the work | `theme/starChart/maneuvers/progressBeam.ts` |
| `region.sweep` | Sector sweep | (new, 27 E7a) Four or more Stories or Bugs created in one beat (`CROWD_MIN`), in place of their Sensor contacts and emergences · `appear` (four or more in a beat) | 2140 | narrative | no | A Nav cyan ring tightens on the star; one Nav cyan ring sweeps out across the frontier and each new piece makes its quiet entrance as it passes, nearest the star first; the star wears one note, the count and the sprint. Length is for four; it grows 110 ms a piece to 3700 at most (`sweepPhases`) | `theme/starChart/maneuvers/sectorSweep.ts` |

**Source:** `src/shared/engine/pace.ts` `RULE`, `PACE_RULES` (length = sum of phase ms); titles from each `ManeuverDef.title`, wired in `theme/starChart/maneuvers/index.ts` (paths under `src/renderer/src/`) · **Guard:** `docTables.test.ts`, `maneuvers.test.ts`, gallery maneuver demos (`npm run gallery`), drive steps `solar-episode.ts`, `solar-merge.ts`, `solar-strike.ts` (tests/README.md) · **Update when:** a rule is added, removed, retimed or re-triggered in `pace.ts`, or a theme renames or swaps a choreography in `maneuvers/index.ts`.

Some rules have a second shape. A variant replaces the rule's phases for that move.

<!-- table: maneuver-variants -->
| Rule id | Variant | Length ms | When |
|---|---|---|---|
| `objective.accomplish` | `beamed` | 5200 | The Story's merged work went to stations: each charges (0.6 s) and fires its mining beam over a 2.6 s act |
| `threat.accomplish` | `beamed` | 5600 | The Bug's merged fixes went to stations: each charges and fires its phaser over a 2.6 s act; the enemy ship blows apart under it |
| `attachment.merge` | `first` | 7900 | The facility's first merge in the round: the station transforms from the merge's gather (tell 300, gather 900, act 2300, land 500, echo 3000, disperse 900) and fires as the longest transformation (4.4 s) ends: 300 + 900 + 2300 + 500 + the 700 ms charge = 4700; it holds the facility, so nothing else casting it starts first (nothing else casting the station acts until it ends) |
| `objective.accomplish` | `short` | 2520 | (27 E4d, P7) The plain close at 0.6× (`SHORT_PACE`), its land kept at 1.2 s (`CLOSE_SLIDE_MS`). The director plays it (05 P-21, P-23) |
| `objective.accomplish` | `beamed-short` | 3600 | The beamed close at 0.6×, land kept at 1.2 s. Director's choice (05 P-21, P-23) |
| `threat.accomplish` | `short` | 3000 | The plain strike at 0.6×, land kept at 1.2 s. Director's choice (05 P-21, P-23) |
| `threat.accomplish` | `beamed-short` | 3840 | The beamed strike at 0.6×, land kept at 1.2 s. Director's choice (05 P-21, P-23) |
| `attachment.merge` | `short` | 4320 | A later merge at 0.6×. A *first* merge has no short form: it happens once per station and the transformation floors it. Director's choice (05 P-21, P-23) |
| `seat.complete` | `short` | 2400 | The homeworld bloom at 0.6×. Director's choice (05 P-21, P-23) |
| `region.clear` | `short` | 1770 | The all-clear at 0.6×. Director's choice (05 P-21, P-23) |

**Source:** `pace.ts` `variant` on each rule (`beamed`, and the merge's inline `first`) and `short` (`shortForm`: `short`, or `<variant>-short`) · **Guard:** `docTables.test.ts`, `maneuvers.test.ts`, gallery maneuver demos (each variant has its own cell) · **Update when:** a variant is added, renamed or retimed, or its condition changes.

**A volley (27 E6a, 05 M-31, B-21)** is not a variant: it plays its carrier's own form (full, `first` or `short`) with the members' union cast, and its echo lengthens so that each member's naming turn (`VOLLEY_TURN_MS`, 2540 ms) opens before the disperse: `disperse.atMs ≥ claim + turns × 2540`. A pair under the full Power link needs no stretch (1200 + 5080 ≤ 6300); under the short form (act at 720, disperse at 3780) a pair's echo grows by 2020 ms (echo 1800 → 3820, disperse 3780 → 5800). Its other members are `joined` and play nothing of their own.

A maneuver uses some of six phases, in this order. Every claimed look lands at the start of `land`,
or at the end of `act` when a rule has no `land`.

<!-- table: phases -->
| Phase | Means |
|---|---|
| `tell` | Draws the eye to where it will happen: usually a ring tightening on the spot |
| `gather` | The cast assembles: ships sortie out, a formation forms, light gathers |
| `act` | The change itself: beams, bolts, the art's own act (a break-up, a jump, a dock) |
| `land` | The new look lands; the payoff (the grand flare) |
| `echo` | The afterglow: a settle ring, a flare, a station's split beam |
| `disperse` | The cast goes home; a last faint ring |

**Source:** `src/shared/contracts/maneuver.ts` `PHASES`; land timing in `chart/fx/v1/interpreter.ts` · **Guard:** `docTables.test.ts`, `maneuvers.test.ts` · **Update when:** a phase is added or renamed, or the interpreter changes when looks land.

## 8. Effects

A maneuver's phases issue commands: named, weighted effects. Seed commands come with the engine; a
theme adds its own (and may override a seed by name). Colours use §2's names.

A command has a cost and a value (27 E1). Its cost is its Weight (the attention the volatility meter sums) plus the beat
ms it holds open (the audit table's Beat ms). Its value is Value: what it tells, per unit of attention. Under load the
interpreter mutes the commands whose value per weight is under the floor for that load; the mute rule and its floors are
in §10. A call that repeats a meaning another cue gives is marked a repeat and plays at value 0, so it mutes first.

<!-- table: commands -->
| Command | Owner | Tier | Weight | Value | Cuttable | Clock | Reduced | Meaning | Looks like |
|---|---|---|---|---|---|---|---|---|---|
| `flare` | seed | narrative | 1 | 6 | yes | accent | ring | A moment landed here: an arrival, a reached rung, or (grand) a completion | A swelling glow on an object in the caller's colour; `grand` is the Victory gold completion burst: essential, weight ×3 |
| `ring` | seed | narrative | 0.25 | 1.5 | yes | accent | same | Where to look, or a state reached: a tell, a settle, a lock | An expanding or closing ring: tells, locks and settles, in the caller's colour (Nav cyan by default) |
| `ink` | seed | narrative | 0.5 | 5 | no | travel | snap | The route a piece takes between two places | A line drawn on along a path, revealing a held edge; Nav cyan by default (Reassign's route) |
| `spark` | seed | narrative | 0.5 | 3 | yes | accent | skip | Something passed between two places: a ping, a supply, a streak | A bright point running between two places: sensor pings, supply motes, streaks; Nav cyan by default |
| `tractor` | seed | narrative | 1 | 10 | no | accent | skip | Who is working on what: a captain holding its work | A soft cone from a ship wrapping its work, bands drifting out, motes drifting home; Given blue |
| `support` | seed | narrative | 1 | 10 | no | accent | skip | Who is backing whom (v0 only) | v0's support stream between ships; Given blue by default. No Solar choreography issues it |
| `pursue` | seed | essential | 1.5 | 15 | no | travel | snap | A node moves: a sortie to the work, or a piece to its new place | A node flies: a sortie out, a hold and home, or an arc to its new place, with a wake. A guest new to the region this beat jumps in at its first sortie's spot instead of flying out (22 C8, K-13) |
| `hold` | seed | essential | 0 | 0 | no | travel | same | Nothing yet: the piece waits for its turn to move | Keeps a node where it is drawn for a while (Reassign's pause before it flies). Nothing drawn |
| `protect` | seed | essential | 0 | 0 | no | travel | same | Nothing drawn: the cast stays put for the moment | Freezes a protected moment's cast for its window. Nothing drawn |
| `insignia` | seed | ornament | 0.25 | 0.5 | yes | accent | ring | An award earned by this ship or piece | An award's mark: a small Victory gold star in a ring over its ship or piece, turning, then fading |
| `guest` | theme: commands.ts | essential | 1.5 | 15 | no | travel | skip | A person with no place here is taking part | A ship with no place in the scene jumps in from hyperspace, holds its spot, and jumps out |
| `charge` | theme: commands.ts | narrative | 0.5 | 5 | no | accent | ring | A station is about to fire | Light gathers into a station before it fires: rings drawn in, motes, a flash; Hero blue |
| `phaser` | theme: commands.ts | narrative | 1 | 10 | no | accent | ring | A station finishes a threat, or (at half weight) a captain's progress on it (27 E3) | A station's hot finishing beam at a enemy ship, with a bright head and trail, or a captain's at half weight (`scale`); Hero blue |
| `cutter` | theme: commands.ts | narrative | 1 | 10 | no | accent | skip | A captain is carving the work | A captain's tractor focused to a cutting point sweeping an asteroid's face, a glowing kerf; Given blue |
| `mine` | theme: commands.ts | narrative | 1 | 10 | no | accent | ring | A station works an asteroid, or (at half weight) a captain's progress on it (27 E3) | A station's heavy mining beam at an asteroid, in a tractor sheath, ore riding home, or a captain's at half weight (`scale`); Hero blue |
| `idleBeam` | theme: commands.ts | ornament | 0.25 | 0.5 | yes | accent | skip | A resting captain is still on its work | A faint tractor breathing in and out over an asteroid: a resting captain's idle work (`ambient.ts`); Given blue |
| `bolt` | theme: commands.ts | narrative | 0.25 | 1.5 | yes | accent | skip | Fire exchanged with a threat | A quick small phaser, sent in bursts: a captain's in Hero blue, a enemy ship's in Danger red |
| `energy` | theme: commands.ts | narrative | 0.5 | 5 | no | accent | ring | Reviewers back the author | A reviewer's calm ribbon of energy to an author, motes weaving in; Given blue |
| `stardust` | theme: commands.ts | essential | 0.5 | 5 | no | accent | ring | The piece is turning to its done form | Glittering motes of Victory gold, bright at their cores, swirling in round an asteroid and out again, a soft glow at their densest: the cover for its turn to its done form (22 C3) |
| `enter` | theme: entrance.ts | essential | 0.5 | 5 | no | accent | same | A new piece has arrived | An entrance: an asteroid spirals in, a enemy ship comes through its rift, a captain drops out of warp |
| `glint` | theme: finales.ts | ornament | 0.25 | 0.5 | yes | accent | skip | A finished world is lit | (new, 2026-10-13) A four-point sparkle: a finished platform or a city light catching the light; Victory gold |
| `allClear` | theme: finales.ts | essential | 1 | 10 | no | accent | skip | Every threat in the area is cleared | (new, 2026-10-13) A Hero blue ring sweeps out from the star past the belt, each planet catching it in a soft ring; the star breathes (19 S2: the threat light it lifted retired) |
| `sweep` | theme: finales.ts | narrative | 0.5 | 3 | yes | accent | skip | New work has come in across the region | (new, 27 E7a) One calm Nav cyan ring sweeps out from the star across the frontier, ellipse to its shape, passing each new piece as it enters; a soft glow, fading in and out (`SweepArgs`: stops, stepMs, durS) |

**Source:** `src/renderer/src/chart/fx/commands.ts` `SEED_COMMANDS`; `theme/starChart/commands.ts` `commands`, `entrance.ts` `entranceCommands`, `finales.ts` `finaleCommands` (registered in `theme/starChart/index.ts`; `ambient.ts` issues `idleBeam` and `bolt` but defines none) · **Guard:** `docTables.test.ts`, `commands.test.ts`, gallery (`npm run gallery`, R for reduced motion) · **Update when:** a command is added, renamed or overridden, or its tier, weight, value, cuttable, clock or reduced substitute changes.

The effect audit (27 E1): what each cue in a choreography tells, and which other cue already tells it. A row is the calls in one phase of one choreography that carry one meaning. Beat ms is the schedule time that cue alone holds open. Verdict: `keep`; `cut` (retired, no longer issued); `mutes first` (a repeat, issued at value 0, so the mute rule drops it first, §10). A `candidate:` in Also carried by is a duplicate noticed and left alone, for the final check.

<!-- table: effect-audit -->
| Choreography | Phase | Effect | Meaning | Also carried by | Beat ms | Verdict |
|---|---|---|---|---|---|---|
| Sensor contact | tell | `ring` tightening on the spot | Something is about to appear here | — | 0 | keep |
| Sensor contact | act | `enter` (`act` is the asteroid's own spiral in) | A new piece has arrived | — | 0 | keep |
| Sensor contact | act | `ring` first sweep | The contact is detected | — | 0 | keep |
| Sensor contact | act | `ring` second sweep, 350 ms later | The contact is detected | `ring` first sweep | 0 | mutes first |
| Sensor contact | act | `spark` from each seat to the piece | Whose planet it belongs to | — | 0 | keep |
| Sensor contact | echo | `ring` Ready grey settle | It has settled at Ready | — | 0 | keep |
| Hyperspace emergence | tell | `ring` pinching in | A threat is about to tear through | — | 0 | keep |
| Hyperspace emergence | act | `enter` (the ship slides out of its rift) | The enemy ship has arrived | — | 0 | keep |
| Hyperspace emergence | act | `flare` Hostile red | The rift tears open | — | 0 | keep |
| Hyperspace emergence | act | `ring` snapping shut | The rift closes behind it | — | 0 | keep |
| Hyperspace emergence | echo | `ring` Ready grey settle | It has settled at Ready | — | 0 | keep |
| Carve | gather | `pursue` sortie | The captain goes to the work | The cast label | 0 | keep |
| Carve | act | `act` carve and `cutter` | The captain is carving the asteroid | — | 0 | keep |
| Carve | echo | `flare` Progress blue | Underway is reached | — | 0 | keep |
| Rig up | gather | `pursue` sortie | The captain goes to the work | The cast label | 0 | keep |
| Rig up | act | `act` rig and `tractor` from the captain | The captain is rigging the work | — | 0 | keep |
| Rig up | act | `ring` Nearing violet closing | The work is nearing completion | `flare` at the echo | 0 | keep |
| Rig up | act | `act` intake, `tractor` and `spark` from each station (Haul) | Stations the work goes to are supplying it | — | 0 | keep |
| Rig up | echo | `flare` Nearing violet | Nearing is reached | — | 0 | keep |
| Landing | tell | `ring` Victory gold tightening | The work is about to be completed | — | 0 | keep |
| Landing | gather | `pursue` sortie | The captain goes to the work | The cast label | 0 | keep |
| Landing | act | `tractor` from the captain | The captain is holding the work | candidate: `pursue` sortie (the ship is already there) | 0 | keep |
| Landing | act | `stardust` | The asteroid is turning to its done form | — | 0 | keep |
| Landing | act | `charge`, `mine` and `ring` pulses from each station (Station fire, beamed) | Stations the work went to are mining it | — | 0 | keep |
| Landing | land | `act` victory and `spark` streak | It glides to its trophy slot | — | 0 | keep |
| Landing | echo | `flare` grand | The work is completed | — | 0 | keep |
| Landing | echo | `ring` beside the grand flare | The work is completed | `flare` grand | 0 | mutes first |
| Engage | gather | `ring` lock in the rung's colour | A lock on the threat | — | 0 | keep |
| Engage | gather | `pursue` sortie | The captain goes to the threat | The cast label | 0 | keep |
| Engage | act | `act` engage and `bolt` bursts from the captain and stations | Fire at the threat | — | 0 | keep |
| Engage | act | `bolt` return fire and `ring` on the shield | The threat fires back and the shield holds | — | 0 | keep |
| Engage | echo | `ring` in the rung's colour | The engagement has settled | — | 0 | keep |
| Strike run | gather | `pursue` sorties, a pass | Captain and reviewers go to the threat | The cast label | 0 | keep |
| Strike run | act | `bolt` six from the captain | The captain strikes the threat | — | 0 | keep |
| Strike run | act | `energy` from each reviewer | Reviewers back the captain | — | 0 | keep |
| Strike run | act | `charge`, `phaser` from each station and `act` breakup (Station fire, beamed) | Stations the fixes went to finish the threat | — | 0 | keep |
| Strike run | land | `act` victory, `flare` and `ring` in Explosion orange | The threat is destroyed | — | 0 | keep |
| Strike run | echo | `flare` grand | The bug is completed | — | 0 | keep |
| Strike run | echo | `ring` beside the grand flare | The bug is completed | `flare` grand | 0 | mutes first |
| Warp out | tell | `ring` Off grey | It is about to leave | — | 0 | keep |
| Warp out | act | `act` warp, `spark` streak and `ring` (a threat), or `act` ghost and `ring` (an asteroid) | It has been set aside | — | 0 | keep |
| Warp out | disperse | `ring` Off grey | It is gone | candidate: `ring` in the act | 0 | keep |
| Reassign | tell | `hold` | The piece waits for its turn to move | — | 0 | keep |
| Reassign | gather | `ink` route | Where it is going | — | 0 | keep |
| Reassign | gather | `pursue` the new holder's captain | Who takes it | The cast label | 0 | keep |
| Reassign | act | `pursue` the piece | It moves to its new holder | `ink` route | 0 | keep |
| Reassign | land | `ring` arrival | It has arrived | — | 0 | keep |
| Station jump-in | tell | `ring` closing on the station's spot | A station is about to arrive | — | 0 | keep |
| Station jump-in | gather | `pursue` (or `guest`) the summoner flies out | Who summons it, and where it will come in | The cast label | 0 | keep |
| Station jump-in | gather | `ring` three pulses and `spark` bearing, the beacon | Where the station will come in | `pursue` the summoner's flight | 585 | cut |
| Station jump-in | gather | `ring` fold | Space folds | `pursue` the summoner's flight | 0 | mutes first |
| Station jump-in | act | `act` jump and `flare` At-rest blue | The station arrives | — | 0 | keep |
| Station jump-in | act | `ring` blooming from the station | The station arrives | candidate: `flare` in the act | 0 | keep |
| Station jump-in | land | `ring` on the station | The station has settled | `flare` in the act | 0 | mutes first |
| Station jump-in | land | `ring` on each planet it serves | The planets it serves | `ring` fold and the cast labels | 0 | cut |
| Shuttle tender | tell | `ring` Progress blue | A tender is about to launch | — | 0 | keep |
| Shuttle tender | act | `act` launch | A tender launches | — | 0 | keep |
| Shuttle tender | act | `tractor` from the author to the station | Who opened it | The cast label and the summons | 0 | cut |
| Shuttle tender | land | `ring` Progress blue | The tender has joined its round | — | 0 | keep |
| Satellite cycle | gather | `ring` closing in the new rung's colour | The pull request is changing state | — | 0 | keep |
| Satellite cycle | act | `act` operate and `tractor` from the author | The author operates the station | candidate: the cast label | 0 | keep |
| Satellite cycle | act | `energy` from each approver | Approvers back the author | — | 0 | keep |
| Satellite cycle | land | `ring` in the rung's colour | The new rung is reached | — | 0 | keep |
| Satellite cycle | echo | `ring` in the rung's colour | The new rung is reached | candidate: `ring` in the land | 0 | keep |
| Power link | tell | `ring` Victory gold | A merge is about to land | — | 0 | keep |
| Power link | gather | `pursue` (or `guest`) author and approvers form up | Who made it and who approved it | The cast labels | 0 | keep |
| Power link | act | `energy` from each approver to the author | Reviews energise the author | — | 0 | keep |
| Power link | act | `tractor` from the author to the station, `ring` and `act` dock | The author delivers the work to the station | — | 0 | keep |
| Power link | land | `ring` Victory gold as the bay takes the tender | The merge has landed | — | 0 | keep |
| Power link | echo | `charge`, `mine` or `phaser`, `flare` and `act` charge | The station fires at the work it served | — | 0 | keep |
| Power link | disperse | `ring` Victory gold | The crew goes home | — | 0 | keep |
| Homeworld complete | tell | `ring` Victory gold | A world is about to be finished | — | 0 | keep |
| Homeworld complete | gather | `pursue` the captain comes home | Whose world it is | The cast label | 0 | keep |
| Homeworld complete | gather | `spark` from the platform to the world | The platform's light reaches its world | candidate: `ring` gathering in the act | 0 | keep |
| Homeworld complete | act | `ring` three gathering, and `flare` | The light gathers | — | 0 | keep |
| Homeworld complete | land | `act` victory, `flare` grand and `ring` halo | The world is finished | — | 0 | keep |
| Homeworld complete | land | `ring` second halo, 350 ms later | The world is finished | `ring` halo | 0 | mutes first |
| Homeworld complete | echo | `glint` city lights and `ring` | The world is lit | — | 0 | keep |
| All clear | tell | `ring` Deadly red collapsing | The last threat is dying | — | 0 | keep |
| All clear | act | `allClear` | Every threat in the area is cleared | — | 0 | keep |
| All clear | echo | `ring` Victory gold | The area is clear | `allClear` | 0 | keep |
| Captain jump | gather | `pursue` sortie | The captain goes to the work | The cast label | 0 | keep |
| Captain jump | act | `bolt` bursts at a threat, or `tractor` on an asteroid | The captain acts on the work | — | 0 | keep |
| Progress beam | gather | `ring` at-rest blue on the captain | The captain is about to fire | — | 0 | keep |
| Progress beam | act | `mine` at an asteroid or `phaser` at an enemy ship, at captain weight; `act` dock on a merge | The captain made progress on the work (on a merge, the PR is in) | — | 0 | keep |
| Progress beam | echo | `flare` Hero blue, small | The progress landed | — | 0 | keep |
| Sector sweep | tell | `ring` Nav cyan tightening on the star | New work is about to come in | — | 0 | keep |
| Sector sweep | act | `enter` quiet, each piece as the ring passes it | A new piece has arrived | — | 0 | keep |
| Sector sweep | act | `sweep` from the star across the frontier | New work has come in across the region, nearest first | — | 0 | keep |

**Source:** `theme/starChart/maneuvers/*.ts` (`repeats(` marks a `mutes first` call), `chart/fx/commands.ts` `repeats` · **Guard:** `docTables.test.ts` · **Update when:** a cue is added, cut or made a repeat, or a choreography is added.

Loading energy (`chart/fx/explore.ts`, one step softer in 23 C10): the energy an object gathers while its data loads is
`min(ENERGY_PEAK, base + ENERGY_RATE × seconds waited + ENERGY_PROGRESS × progress)`. A caller sets its own `base` and `rate` for a gentle load
(0.12, 0.03/s) and for the cosmos (0.3 or 0.65, 0.015 or 0.22/s); these are the defaults for a team or Feature load. Reduced motion holds 0.6.

<!-- table: loading-energy -->
| Constant | Value | Unit | Meaning |
|---|---|---|---|
| `chart/fx/explore.ts` ENERGY_BASE | 0.3 | energy | Where a load starts |
| `chart/fx/explore.ts` ENERGY_RATE | 0.09 | energy / s | How fast it gathers per second of wait: 1.0 (the gallery's *a long wait*) at 7.8 s, the peak at 13.3 s |
| `chart/fx/explore.ts` ENERGY_PROGRESS | 0.3 | energy | What a whole load's progress adds |
| `chart/fx/explore.ts` ENERGY_PEAK | 1.5 | energy | The most it reaches; the success flare adds 0.8 on top, so it peaks at 2.3 |

**Source:** `src/renderer/src/chart/fx/explore.ts`; the gallery's Loading energy cells read the constants · **Guard:** `docTables.test.ts`, gallery, `explore.spec.ts` · **Update when:** the build, peak or progress term changes (history: [06 §3](06-visual-brief.md#loading-by-level-decided-2026-10-07-04-5a), [23 C10 note](progress/slice-1.3-C1-C10.md)).

The role outline (the aura) every asteroid and enemy ship wears, one weight for both roles (19 S1,
2026-10-14). It reads its own scale on screen each frame, so these hold at every zoom and in the
gallery; the art's own spread arguments are ignored. Why: [06 §9](06-visual-brief.md#9-v1-the-solar-system-13-9-amended-2026-10-12), *Role outlines*.

<!-- table: aura -->
| Constant | Value | Unit | View | Meaning |
|---|---|---|---|---|
| `chart/art/aura.ts` RIM_PX | 2 | screen px | Solar | The rim's width, for every role, at every zoom |
| `chart/art/aura.ts` RIM_ALPHA | 0.8 | alpha | Solar | The rim's least alpha: the caller breathes the glow, the rim stays steady. Not in effect: the live rim draws at full strength, as Pixi does not apply the rim container's alpha through its filter (27 C3, 09 §7); the constant is nominal |
| `chart/art/aura.ts` GLOW_SHARE | 0.08 | share | Solar | The glow's reach (its blur) as a share of the silhouette's size on screen (the root of its bounds' area) |
| `chart/art/aura.ts` GLOW_MIN_PX | 4 | screen px | Solar | The least the glow reaches, however far out the camera is |
| `chart/art/aura.ts` GLOW_MAX_PX | 12 | screen px | Solar | The most the glow reaches, however close the camera is |
| `chart/art/aura.ts` KEYLINE_PX | 2 | screen px | Solar | The keyline's width past the rim (23 C1): a dark band in the night sky's colour just outside the rim, over the glow, so the rim's neighbour is dark on any backdrop; copies tinted, no filter or group of their own; 0 turns it off |
| `chart/art/aura.ts` KEYLINE_ALPHA | 0.85 | alpha | Solar | The keyline's opacity; 0 turns it off. The tests hooks' `showAuras('unkeyed')` draws everything but it, to compare |
| `chart/art/aura.ts` AURA_BALANCE.threat | 1.25 | × alpha | Solar | Deadly red's weight on its outline, rim and glow (23 C1: it was 0.85, 2.3:1 against the night sky). Its strongest channel meets the cap here, so it can go no higher |
| `chart/art/aura.ts` AURA_BALANCE.objective | 1.04 | × alpha | Solar | Opportunity blue's weight on its outline (23 C1: it was 1.1, which stood about 20% further off the night sky than Deadly red; 1.04 matches them) |
| `chart/art/aura.ts` AURA_BALANCE.accomplished | 0.68 | × alpha | Solar | Victory gold's resting weight on its outline, once the work is done: it rests at Deadly red's and Opportunity blue's contrast (27 B3; it was 1, at 9.6:1, the brightest outline on the chart). A victory flares it up from here |
| `chart/art/aura.ts` AURA_FLARE_WEIGHT | 1 | × alpha | Solar | Victory gold's weight at the peak of a victory's flare (27 B3): the old weight, brighter than Deadly red and Opportunity blue. The flare eases back to the resting weight over AURA_FLARE_MS (§10); none under reduced motion |

**Contrast (23 C1, measured 2026-10-28).** WCAG 2 contrast, (L1 + 0.05) / (L2 + 0.05) on relative luminance, from the rendered pixels at device
scale (Harbor Pod, reduced motion, six pieces per role at the fit and 2×, 32 rays each, pooled, medians). The outline's brightest pixel against the bare backdrop under it and against the pixel
1 px past it (the keyline's own, as drawn). Split by backdrop: the night sky (bare luminance under 0.02) or a lit planet face / bright nebula (above). By
`tests/drive/steps/c1-contrast.ts`; `auraContrast.test.ts` pins the last numbers beside the weights. Night sky first, planet face second:

| Outline | Weight before → now | Night sky: vs backdrop | Night sky: vs pixel past rim | Lit planet face: vs pixel past rim, keyline off → on | n (night / planet) |
|---|---|---|---|---|---|
| Deadly red | 0.85 → 1.25 | 2.3 → 5.3 | 5.5 | 1.7 → 1.7 (clean rays 1.9 → 2.6) | 182 / 59 |
| Opportunity blue | 1.1 → 1.04 | 3.9 → 5.3 | 5.8 | 2.7 → 3.2 (clean rays 2.5 → 5.7) | 145 / 204 |
| Victory gold | 1 → 0.68 (27 B3) | 9.6 → 4.8 | 5.2 | 4.9 → 6.2 | 273 / 76 |

The night-sky columns are Harbor Pod; the planet-face columns are Meridian Works, Sprint 7, Convoy Planning Pod (`C1_POD="Meridian Works|Sprint 7|Convoy Planning Pod"`),
where hive ships sit on their planet's right half and some on its lit crescent. "Clean rays" keep only rays where the keyline is visible (the pixel past the rim is not the piece's own hull, legs
or weapons). The "before" night-sky values are from the first, CSS-pixel measurement (device-scale shots read about 20% brighter at equal weights), so before and now are a trend only.
Gold has no body inside its ring, only a dark gap, so its "against the body" reading is not applicable. Red and blue stand within 4% of each other against the night sky, and (27 B3, re-measured 2026-10-31, one run for all three rows, so red and blue read higher here than in 23 C1's run) gold, at its resting weight 0.68, stands 9% below red and 9% below blue (4.84 against 5.31 and 5.34). A victory's flare briefly takes gold back to weight 1 (about 9.6:1), then it settles; the drive runs in reduced motion, so it measures the resting gold.

**Deadly red does not reach 3:1 on a lit planet face** (1.7 against the pixel past its rim, 2.4 on clean rays, 1.4 against the backdrop under it). Its weight is capped, and a keyline at full opacity
barely moved it (2.0 at 1.0 against 2.0 at 0.85, in an earlier build), so a hive ship outlined in red on the lit crescent stays under the floor: a decision for HG-C. Blue passes against its neighbour (4.0) but not against the
backdrop under the rim (2.1), which the keyline cannot change. What renders: the aura is laid over the scene by alpha (a filtered container composites by its filter's blend mode, Pixi 8.21), not added.

**Source:** `src/renderer/src/chart/art/aura.ts` · **Guard:** `docTables.test.ts`, `auraContrast.test.ts`; by eye, `npm run drive -- tests/drive/steps/c1-contrast.ts --paradigm solar` (contrast),  `npm run drive -- tests/drive/steps/v11-S1.ts --paradigm solar` (crops at the fit, 2× and 4×, measured), gallery (`npm run gallery`, Worlds and Threats) · **Update when:** the rim's width or alpha, the glow's reach or a colour's balance changes.

The v0 views (Sprints, Backlog) play accents, not maneuvers. One row per accent name.

<!-- table: v0-accents -->
| Accent | Trigger | Look | Duration ms | Tier |
|---|---|---|---|---|
| `emerge.feature` | Feature created | Arrives along its orbit with a Nav cyan streak and a ring; a seed spark first when calm | 1800 | essential (seed spark: ornament) |
| `emerge.story` | Story created | As `emerge.feature` | 1600 | essential (seed spark: ornament) |
| `emerge.bug` | Bug created | As `emerge.feature` | 1600 | essential (seed spark: ornament) |
| `emerge.task` | Task created | The dot pops into its band; its title flashes | 1200 | essential |
| `stageShift.feature` | Feature state change | The actor's tractor, then a flare in the new rung's colour (the grand flare into Closed), an echo to the parent; a reopen gets a reverse flare | 2000 (2600 into Active or Ready to Accept; 2800 into Closed, Removed or a reopen) | essential (beam, echo: narrative) |
| `stageShift.story` | Story state change | As `stageShift.feature` | 2000 (2400 into Active, Resolved or Ready to Accept; 2600 into Closed, Removed or a reopen) | essential (beam, echo: narrative) |
| `stageShift.bug` | Bug state change | As `stageShift.feature` | 2300 | essential (beam, echo: narrative) |
| `stageShift.task` | Task state change | The radar ping: collapse, run along the spoke, re-expand with a smaller flare | 1800 (a wave of 2+ Tasks: 2400) | essential |
| `captainJump` | Assignee changed | The ship departs and arrives with streaks; a jump trail with Go | 2400 | essential |
| `sectorRekey` | Area path or iteration changed | The body arrives in or departs the scene; a star leaving gets a jump trail | 1600 | essential |
| `orbitDraw` | Parent link added | The orbit (or a radar spoke) inks on in Nav cyan | 1400 | narrative |
| `orbitFade` | Parent link removed | The orbit inks off; a body leaving the scene gets a jump trail | 1400 | narrative |
| `laneDraw` | Dependency link added | No director effect: beat time only | 1000 | none |
| `laneFade` | Dependency link removed | No director effect: beat time only | 1000 | none |
| `routeInk` | PR link added | The route inks on in Progress blue | 1400 | narrative |
| `routeRetract` | PR link removed | The route inks off in Progress blue | 1400 | narrative |
| `launch` | PR opened | The intent chain: bay ring, Progress blue intent line, the vessel undocks and follows, the route inks; the author's ship meets it | 2600 | essential |
| `dock` | PR completed | The vessel berths; the grand flare; the bay flashes Victory gold. With approvers, the review formation (protected) | 2200 (5100 with approvers) | essential |
| `withdraw` | PR abandoned | The vessel's lights go out; an Off grey ring | 2000 | essential |

**Source:** `src/shared/playback/accents.ts` `AccentName`, `accentFor`; looks in `chart/fx/director.ts` (`spawn`); tiers per 05 §5 · **Guard:** `docTables.test.ts`, `tests/golden/schedule.test.ts` (durations), `gallery.spec.ts` · **Update when:** an accent is added or retimed in `accents.ts`, or the director changes what one draws.

v0 extras: accents with no event name of their own.

<!-- table: v0-extras -->
| Accent | Trigger | Look | Duration ms | Tier |
|---|---|---|---|---|
| `authorBeam` | PR opened, with an author | The author's ship flies to the vessel and takes it in its tractor | 450 | narrative |
| `shipAction` | A beat the budget left unaccented (Lively, Maximum) | A ship and its tractor for each Medium-or-better change | 0 | narrative |
| `starBloom` | A star's first orbit (scene diff) | A corona forms: a flare in the star's rung colour | 3000 | essential |
| `stationPowerUp` | A station new to the scene (scene diff) | It fades up inside a Nav green ring | 900 | essential |
| `sectorPulse` | A descendant's change in a sector scene | One soft Nav cyan wash on its Feature's star per beat, plus a glyph | 1400 | essential |
| echo | Something reaches Accomplished | A Victory gold spark runs to the parent's limb, which rings once per beat | 900 (after 800) | narrative |
| recap bloom | Playing reaches the end | Everything Accomplished in range flares Victory gold, in order | 220 apart, at most 14 | ornament |

**Source:** `src/shared/playback/plan.ts`, `chart/fx/director.ts`, `chart/fx/timing.ts`; §10 for the scene-diff lengths · **Guard:** `gallery.spec.ts` · **Update when:** the director gains or drops an extra.

## 9. Actions → what you see

What each data change plays in Solar, and in the v0 views. A change no rule matches gets Captain jump
at most (Lively and Maximum only).

<!-- table: actions-data -->
| Data change | Neutral move | Rule id | Maneuver | Main effects (Solar) | v0 accent |
|---|---|---|---|---|---|
| Story created | `appear` (objective) | `piece.appear`; four or more in a beat: `region.sweep` | Sensor contact; four or more in a beat: Sector sweep | Nav cyan contact ring; the asteroid spirals in; Nav cyan sweeps; a sensor spark. Four or more Stories or Bugs created in one beat: one Nav cyan sweep from the star brings each in quietly, the star noting the count and the sprint (27 E7a) | `emerge.story` |
| Bug created as New | `appear` (threat, sketch) | `piece.appear`; four or more in a beat: `region.sweep` | Sensor contact; four or more in a beat: Sector sweep | The radar contact shows; Nav cyan sweeps. Four or more created in one beat: the Sector sweep, as for a Story | `emerge.bug` |
| Bug created past New, or a New Bug made Ready | `appear` (threat) or `climb` sketch → Ready | `threat.emerge`; four or more created in a beat: `region.sweep` | Hyperspace emergence; four or more created in a beat: Sector sweep | Hostile red rift; the enemy ship slides out. Created with three or more others in one beat: the Sector sweep (a New Bug made Ready is not a creation) | `emerge.bug`, `stageShift.bug` |
| Story or Bug assigned, reassigned or unassigned | `reseat` | `piece.reseat` | Reassign | Nav cyan route inks; the piece flies the arc to its new seat or the frontier; the new holder's captain meets it there, named *Takes it* (22 C7); the belt fades in or out with it (19 S2) | `captainJump` |
| Story started (Active) | `climb` → Underway | `objective.underway` | Carve | Captain's sortie; Given blue cutting beam; Progress blue flare | `stageShift.story` |
| Story nearing (Resolved, Ready to Accept) | `climb` → Nearing | `objective.nearing` | Rig up | Tractor; gantries; Nearing violet ring; stations haul supplies | `stageShift.story` |
| Story closed | `climb` → Accomplished | `objective.accomplish` | Landing (`beamed` when its merged work went to stations) | The grand flare over the new platform; stations' mining beams when beamed | `stageShift.story` + echo |
| Bug started or resolved | `climb` → Underway or Nearing | `threat.engage` | Engage | Lock ring; Hero blue bolts; Danger red fire on the shield | `stageShift.bug` |
| Bug closed | `climb` → Accomplished | `threat.accomplish` | Strike run (`beamed` when its merged fixes went to stations) | Bolts and reviewers' energy; break-up; grand flare | `stageShift.bug` + echo |
| An assignee's last open piece here closes (new, 2026-10-13) | `climb` → Accomplished | `seat.complete` | Homeworld complete | After the close: Victory gold rings gather on the world; grand flare; city glints | none |
| The area path's last open Bug closes (new, 2026-10-13) | `climb` (threat) → Accomplished | `region.clear` | All clear | After the strike run: a Hero blue sweep from the star, each planet catching it | none |
| Reopened to Active | `climb` Accomplished → Underway | `objective.underway` or `threat.engage` | Carve or Engage | As a start | `stageShift.*` reverse flare |
| Reopened to New, or deferred | `climb` within Ready | none | Captain jump (light) | The new look lands; nothing else | `stageShift.*` reverse flare, or a small Ready grey flare |
| Removed or Rejected | `climb` → Off | `piece.off` | Warp out | Off grey rings; a enemy ship streaks away, an asteroid ghosts | `stageShift.*` ghosting fade |
| Moved to another area path or sprint | `enter` or `leave` | none | Captain jump (light) | The scene's own arrive or depart | `sectorRekey` |
| Task created or changed | `appear` or `climb` (step) | none | none | The parent's look changes (a step is drawn inside it) | `emerge.task`, `stageShift.task` |
| Parent link added or removed | `bind` or `unbind` | none | Captain jump (light) | Nothing of its own | `orbitDraw`, `orbitFade` |
| First PR into a repository in the round | `attach` (first into its facility) | `facility.enter`, then `attachment.open` | Station jump-in, then Shuttle tender | The author flies out; the station folds in; then a tender launches | `launch`, `stationPowerUp` |
| PR opened | `attach` | `attachment.open` | Shuttle tender | Progress blue rings; a tender launches | `launch` + `authorBeam` |
| PR linked to work | `bind` (attachment) | none | Captain jump (light) | A tractor on the station | `routeInk` |
| PR merged | `settle` → Accomplished | `attachment.merge` (`first` on a facility's first merge) | Power link | Formation; energy chain; Victory gold dock; split beam at the work | `dock` (review formation) |
| Reviewer approves | no event: approvers ride on the merge (`settle`) | in `attachment.merge`, `attachment.settle`, `threat.accomplish` | Power link, Satellite cycle, Strike run | Given blue energy from each approver to the author or captain | `dock` support streams |
| PR abandoned | `settle` → Off | `attachment.settle` | Satellite cycle | Off grey ring closes; the station operates; settle rings | `withdraw` |
| Title changed | `retitle` | none | none | Nothing (Low) | none |
| Any other change by a person | any move but `retitle` | `agent.light` | Captain jump | Sortie and Given blue tractor; bolts at a enemy ship | `shipAction` |
| Play from the start | none (the opening) | none | the opening | The star breathes; what's already here makes its quiet entrance, seat by seat | none |
| Round end (playing reaches the end of a finished sprint) | none (the finale) | none | the theme's finale (new, 2026-10-13) | The star flares warm; platforms glint Victory gold in turn; ships form a chevron over the star; awards' insignia | recap bloom |

**Source:** `src/shared/engine/moves.ts` (`ContractReader.read`), `pace.ts` `PACE_RULES`, `theme/starChart/finales.ts` `finale`, `chart/fx/v1/interpreter.ts` (`opening`, `recap`), `src/shared/playback/accents.ts` · **Guard:** `docTables.test.ts`, `maneuvers.test.ts`, `moves.test.ts`, drive steps `solar-episode.ts`, `solar-opening.ts` · **Update when:** an event kind, a move, a rule's match, or the opening or finale changes.

What each UI action changes on screen.

<!-- table: actions-ui -->
| Action | Input | What responds |
|---|---|---|
| Hover an object | Pointer over it or its label | Its label opens fully at once; its holo plate lights, and expands into its rows if it has a list (19 L2). Never the followed ship's |
| Hover the ruler | Pointer over the ruler | A tip with the nearest beat's lines and the time left |
| Select | Click an object or its label | The ivory reticle (four slowly turning arcs); the Inspector shows it; the automatic camera holds 1.5 s after release |
| Select a ship | Click a captain ship | Selects it and follows its captain (below) |
| Open | Double-click, or Enter on the selection | Enters its scene: the camera transition (600–750 ms by level; 150 ms crossfade in reduced motion) |
| Back | Esc, ⌘←, ‹ Back, or pinch out | Up one level; the camera eases out |
| Play / pause | Space, or ▶ | Play from the start plays the opening; labels go compact while playing and return after 3 s still; the bar folds after 3 s idle. Pause freezes every effect in place |
| Step | → | The next beat plays its maneuvers once, then pauses; effects run on |
| Previous beat | ← | A seek to the beat's start: no maneuvers |
| Next or previous big moment | Shift → / Shift ← | Jumps to the next High beat in view and plays only it; Shift ← seeks back |
| Start / end | Home / End | A seek: no maneuvers, no recap or finale |
| Rate | [ / ], or the rate chip | ¼× to 4×; travel speeds up by the rate, accents and pulses by at most 2× |
| Seek | Drag the ruler, enter a date, or pick a History card | Every command and tell is destroyed; looks land; positions snap (no glide); nothing replays (INV-15) |
| Frame the action | Z | On: a High beat's objects off screen pull the camera (pan, or zoom out) over 700 ms as its lead-in starts. A manual pan suspends it. The beats the director's camera handles are skipped (27 E9) |
| Follow | F (selected captain, or resume), or Go on a trail | The follow camera (900 ms, 0.8–2.5× the fit); the Nav cyan hero aura on the ship; the follow bar; the recap keeps to their story |
| Pan or zoom | Drag; wheel, pinch, + / − / 0 | Suspends follow and framing; a wheel zoom through a centred object enters it |
| Map key | K | The map key panel opens or closes |
| Remove from View (19 N1) | The Inspector's button, on a selected galaxy, or a pod star in the round (ADO mode) | The galaxy unpins its project, or the pod's Area Path is unsaved (it leaves every sprint); it Departs in place and the selection clears. Local only, never written to ADO (INV-21). Disabled, with its reason, on the last project in view |
| Add an Area Path (19 N1) | The round's Inspector with nothing selected: + Add an Area Path (ADO mode) | The + crumb's picker opens above the button; a chosen Area Path's star Arrives in place and is brought into view |
| Settings | The cog in the title bar | The Settings modal (Connection, Theme, your Captain, How to read); it takes the keys while open |
| Activity | ⋯ → Calm, Lively, Maximum | From the next beat: how much light work plays and whether load tiers ration it |
| Reduced motion | ⋯ toggle, or the OS setting | Every command takes its reduced substitute: flights snap, beams skip, flares become rings; no opening, idle work, tells or jiggle |
| Highlights, lens, panel, paint, keys | H, L, E, P, ? | Only High beats in view; Known then or Retrospective; In view or History; painted or plain; the key list |

**Source:** `src/renderer/src/App.tsx` (`onKey`, ChartApp callbacks), `playback.ts`, `nav.ts` (`removable`, `removeFromView`), `panels/Inspector.tsx`, `chart/ChartApp.ts`, `chart/labelTiers.ts` `tierFor`, `chart/labels.ts`, `chart/framing.ts`, `panels/Transport.tsx` · **Guard:** `labelTiers.test.ts`, e2e `solar.spec.ts`, `solar-play.spec.ts`, `onboarding.spec.ts` and `slice4.spec.ts` (Remove from View, Add), drive steps `solar-tap.ts`, `v11-N1.ts` · **Update when:** a key, a click behaviour, an Inspector action, a label tier rule or a camera timing changes.

**Event wording** (22 B4, R13). Every event is said one way, on every surface that says it (History's
rows, the ruler's tooltip, the notes on the plates in play): `Entity type · ID · Title — Action · by
Person` (`eventParts`, `formatEvent`, `@shared/engine/eventLine.ts`; each pack's `event`). The person is
who made the change (`changedBy`; a PR's author when opened; CRM's approvers when a quote is accepted),
left out when unknown or when the action already names them. Under Solar, the theme's line follows,
quieter (`chartAction`, `theme/starChart/actions.ts`), in its own words and with no ID.

| Event | Action (SDLC) | Note in play (22 B6) | The chart's line (Star Chart) |
|---|---|---|---|
| Created | `Created` | `Created` | a new asteroid appears by Mara Lind's homeworld (or in the frontier belt) |
| State changed | `Active → Resolved` (the source's names, INV-11) | the same | by role and rung: the asteroid is being mined, nearly mined out, mined out; the enemy ship is under attack, crippled, destroyed; set aside / withdraws (Off); mining stops / the attack breaks off (back to Ready) |
| Assigned | `Assigned to Mara Lind` / `Unassigned` | the same | Mara Lind's captain takes the asteroid / the asteroid drifts to the frontier belt |
| Area or sprint changed | `Moved to Signals Pod` / `Left Sprint 7` | the same | the asteroid arrives / leaves |
| Renamed | `Renamed` | the same | none |
| Parent link | `Joined Feature #20002` / `Left …` | the same | a tender shuttle or an augmentation docks with its work / undocks (none for a container) |
| Dependency | `Now before User Story #12` / `No longer before …` | the same | none |
| PR linked | `Linked PR #9501` / `Unlinked PR #9501` | the same | a tender shuttle docks with its work |
| PR opened | `Opened` (its author as the person) | none: its maneuver casts no piece (the tender launches inside its station) | a tender shuttle launches from its station |
| PR completed | `Merged` (CRM `Accepted`, approvers as the person; Todo `Filed`) | `PR #9501 · Title — Merged`, on every piece it serves (each takes a place in the budget) | the tender shuttle delivers |
| PR abandoned | `Abandoned` (CRM `Lost`, Todo `Discarded`) | none, as when opened | the tender shuttle is recalled |

**Source:** `@shared/engine/eventLine.ts`, `packs/*/adapter.ts` (`event`), `theme/starChart/actions.ts` ·
**Guard:** `eventLine.test.ts` · **Update when:** an event kind is added, or a pack's or the theme's
wording changes.

## 10. Timing and budgets

The numbers that pace an episode and gate its effects. Change them here and in code together.

<!-- table: budgets -->
| Name | Value | Constant | Meaning |
|---|---|---|---|
| Episode budget | 45000 ms | `@shared/profile/bundled.ts` DESKTOP.pacing.budgetMs | An episode's length at 1×. Over it, gaps compress first, then the lowest-priority accents are cut; High beats and essential moments never are |
| Highlights budget | 30000 ms | `@shared/profile/bundled.ts` DESKTOP.pacing.highlightBudgetMs | The High-beats-only schedule (H) at 1× |
| Orientation | 1200 ms | `@shared/playback/constants.ts` ORIENT_MS | The hold before the first beat in the v0 views |
| Opening orientation | 3000 ms | `@shared/engine/maneuvers.ts` OPENING_ORIENT_MS | The hold before a solar region's first beat; the opening plays in it |
| Gathering: stalled (new, 2026-10-22) | 20000 ms | `gather.ts` GATHER_STALL_MS | While a streamed sprint's history gathers, no request to ADO started or finished for this long: the player reads "History stopped" and offers Retry (05 §2) |
| Gathering: stopped (new, 2026-10-22) | 3000 ms | `gather.ts` GATHER_STOP_GRACE_MS | The stream having ended with history still missing counts as stopped only after this long: a normal end leaves the player gathering for the moment its last bundle takes to load |
| Frame budget (new, 23 F-Q3) | p95 ≤ 2 vsyncs, plus 2 ms | `@shared/profile/bundled.ts` DESKTOP.render.budget.frameVsyncs, DESKTOP.render.budget.toleranceMs | The painted p95 frame time in the densest scenes (09 §7): 2 × the display's vsync, measured in the spec's window as the median rAF delta, plus 2 ms |
| Cut gain floor (new, 27 C3) | 20% | unguarded: `../../../tests/e2e/perf.spec.ts` CUT_GAIN_MIN | `CUT_GAIN_MIN` in `tests/e2e/perf.spec.ts`: each device-profile cut (§11) must lower Pulsar Pod's p95 frame time by at least this much, cuts on against off in the same run (a hard check; the absolute budget above is reported, soft) |
| Final hold | 1200 ms | `@shared/playback/constants.ts` FINAL_HOLD_MS | The hold after the last beat |
| Gaps | 500–2500 ms: 500 + 450·log2(1 + weighted hours) | `@shared/playback/constants.ts` GAP_MIN_MS, GAP_MAX_MS, GAP_BASE_MS, GAP_LOG_MS | Between timed beats, clamped to the range (the v0 views; a solar region caps them lower) |
| A steady pulse (new, 22 C5) | 1200 ms | `@shared/playback/constants.ts` PULSE_GAP_MAX_MS | A solar region's longest gap at 1× (05 §8 B-16; `ScheduleOptions.gapMaxMs` from its pacing) |
| A day turn (new, 22 C5) | 1500 ms | `@shared/playback/constants.ts` DAY_TURN_MS | Where the local working day changes between a solar region's beats, the gap is this (squeezed with the rest over budget): a chapter break, the night and weekend folded in (B-17); a dense episode's is the rising floor (B-23). Its breather plays at its dawn |
| Rising tempo (new, 27 E8) | 1.1 to 0.5, floor 300 ms | `@shared/playback/constants.ts` RISING_FIRST_DAY, RISING_LAST_DAY, RISING_FLOOR_MS | A solar region's gaps, day turns and tail gap keep this share of themselves, falling linearly by day turns from the first day (1.1) to the last (0.5), never below 300 ms nor above their caps; over the director's target every day turn is 300 ms (05 B-23; `ScheduleOptions.risingTempo` from its pacing) |
| Late-day montage (new, 27 E10) | 0.7 | `@shared/playback/constants.ts` RISING_TIGHT_SHARE | Rising tempo's tight end: where a solar episode's share (B-23) is at most this (the last third of its day turns; on a sprint of three days or fewer, its last day), a routine repeat folds to montage even under the director's target (05 P-24) |
| Stay near (new, 27 E4) | 3000 ms | `@shared/engine/maneuvers.ts` STAY_NEAR_MS | A captain whose next turn's gather sets off within this long of their ship's release waits parked near the work (plate shut) instead of flying home and out again (05 §8.5 P-7; `nearWaits`, `Sortie`'s `waitS`) |
| Short pace (new, 27 E4d) | 0.6 | `@shared/engine/pace.ts` SHORT_PACE | A protected rule's short form (`shortForm`) plays each phase at this share of its length, rounded, except a close's `land` (kept at `CLOSE_SLIDE_MS`). The director (05 P-21, P-23) chooses it (§7 variants) |
| Director target (new, 27 E5a) | 300000 ms | `@shared/engine/director.ts` DIRECTOR_TARGET_MS | The length an episode should come to at 1x (HG-C's cap, 5 min). Soft: past its estimate the director pulls its levers (05 P-23: short forms, then montage, then speed, then light work for more rules, then fewer hero shots) and the ledger reports a pod still over it |
| Tempo ceiling (new, 27 E5b) | 2 | `@shared/engine/director.ts` TEMPO_MAX | The fastest the speed lever plays a beat that holds no climax (05 P-25), as a multiple of the 1x rate. The lever picks the least k in steps of 0.05 that reaches the target |
| Volley window (new, 27 E6a) | 20000 ms | `@shared/engine/director.ts` VOLLEY_WINDOW_MS | How far apart in x (at 1x, under the director's first pass) merges into one facility may play, from the group's first, to fire as one volley (05 M-31), on one local day and under the B-15 guard (B-21). The planner's sweep: the smallest window at Pulsar's highest count (8 of 30 merges at 20 s, 30 s and 60 s) |
| Volley naming turn (new, 27 E6a) | 2540 ms | `@shared/engine/maneuvers.ts` VOLLEY_TURN_MS | One naming turn of a volley: a plate's unfurl, its least open time and its fold (2 × 520 + 1500). The carrier's echo lengthens until its disperse comes this long per turn after its claim |
| Montage (new, 22 C5) | 0.6 | `@shared/engine/maneuvers.ts` MONTAGE_PACE | In a beat whose named labels would still wait for a place, the work limelight didn't name plays alongside at this share of its phases, unlabelled, with no held turn (P-15) |
| Feed threshold (new, 23 B5) | 300 | `@shared/feed.ts` FEED_THRESHOLD | A batch of history reads (a discovery wave, a level's items, a pod's list) of this many items or more is read from the project-wide revisions feed; fewer are read per item (04 §5c, where the feed's other numbers are explained) |
| Feed page (new, 23 B5) | 500 | `@shared/feed.ts` FEED_PAGE | `$maxPageSize` asked of the revisions feed per page |
| Feed page cap (new, 23 B5) | 40 | `@shared/feed.ts` FEED_MAX_PAGES | Pages read in one run, **across all its batches** (a full sync, a level load, a stream's fill); past it the continuation token is kept and the next run resumes |
| Feed buffer (new, 23 B5) | 100000 | `@shared/feed.ts` FEED_BUFFER_ROWS | Parsed rows a run's one crawl keeps in memory for its later batches; past it a later batch (an item the crawl did not cover from its start) is read per item |
| Feed overlap (new, 23 B5) | 3600000 ms | `@shared/feed.ts` FEED_OVERLAP_MS | A crawl starts this long before the oldest watermark (the newest ChangedDate its last crawl saw, server time) among the items it serves, because the feed lags the store (re-read rows are upserts) |
| A fair share (new, 22 C6) | 8000 ms | `@shared/engine/limelight.ts` FAIR_TURN_MS | After a person's first named turn, another is named only when everyone in it has had none for this long (of estimated playback at 1×); moments and arcs always (P-17) |
| A breather's spotlight (new, 22 C6) | 3 s | `chart/fx/v1/interpreter.ts` SPOTLIGHT_S | At most this long a day turn's spotlit captain is named (*On {title}*), folded before the day's first beat and only while the budget has room (M-28) |
| A guest's stay (new, 22 C8) | 10000 ms | `@shared/engine/guests.ts` GUEST_STAY_MS | A guest (no planet here) needed again within this much playback at 1× after their part waits nearby; otherwise they jump out as the next beat plays, and can come back later (05 §8 K-14). Planned over the schedule (`BeatSchedule.guests`), so a seek agrees |
| A guest's jump in (new, 22 C8) | 0.4 s | `chart/fx/movers.ts` JUMP_IN_S | A guest new to the region drops out of hyperspace at its first sortie's spot, ending as the out leg does (at most the leg), so their part begins only once arrived; it fits every rule's gather (≥ 400 ms), so the planner needs no lead (K-13) |
| A guest's jump out (new, 22 C8) | 0.5 s | `theme/starChart/assets/agent.ts` WARP_OUT_S | A guest leaving the region warps out (the agent asset's `departAct`), accelerating ahead along its heading, stretched, with a streak, instead of vanishing (K-14) |
| A claimed look's safety (new, 22 C9) | 30 s | `chart/scenes/GraphScene.ts` CLAIM_SAFETY_S | A look its maneuver claimed but never landed (a cut effect) shows anyway after this long on the travel clock its land is timed on; it was 8 s of wall time, which a long queued beat at 1× or below could beat to its land (05 §8 P-18, G-16) |
| Lead-in | 700 ms | `@shared/playback/constants.ts` LEAD_MS | A beat's tell starts this long before it (or the whole gap if shorter) |
| History rows | 4 | `@shared/playback/constants.ts` HISTORY_ROWS | The events a History card lists, the headline first (22 B5); the rest are counted, "+N more" |
| Calm mark | 5 | `chart/fx/timing.ts` CALM | From it, the calm floor applies: a command needs value per weight of at least `MUTE_FLOOR.calm` to play, so ornament and repeats stop (idle work, lesser flares' sparks, awards) |
| Busy mark | 10 | `chart/fx/timing.ts` BUSY | From it, the busy floor applies: a command needs value per weight of at least `MUTE_FLOOR.busy`, so cuttable decoration drops, and ornament maneuvers don't start |
| Overload mark | 16 | `chart/fx/timing.ts` OVERLOAD | From it, no floor is met: every non-essential command drops, and narrative maneuvers; essential always plays |
| Calm floor (new, 27 E1) | 4 | `chart/fx/timing.ts` MUTE_FLOOR.calm | The least value per unit of weight (Value ÷ Weight, §8) a command needs to play from the calm mark (and at every load with the ornament switch off). Ornament is 2 (drops), cuttable narrative 6, uncuttable narrative 10 |
| Busy floor (new, 27 E1) | 8 | `chart/fx/timing.ts` MUTE_FLOOR.busy | The same, from the busy mark: cuttable narrative commands (6) drop; uncuttable ones (10) play. Replaces P-9's tier rule with the same outcomes |
| Repeat value (new, 27 E1) | 0 | `chart/fx/timing.ts` REPEAT_VALUE | The value a call that repeats another cue's meaning plays at (§8 effect-audit), so it mutes first, from the calm mark |
| Load per planned maneuver | 0.6 | unguarded: `chart/fx/v1/interpreter.ts` (inline) | Added to the meter for each maneuver in the beat, when it starts |
| Load per gliding node | 0.3 | unguarded: `chart/fx/v1/interpreter.ts` (inline) | Added to the meter for each node still gliding |
| Activity override | Maximum | `@shared/playback/engagement.ts` DEFAULT_ACTIVITY | At Maximum (the default) the busy and overload marks don't apply (`ENGAGEMENT.maximum.ignoreLoad`) |
| Live effects cap | 24 | `@shared/profile/bundled.ts` DESKTOP.render.limits.maxActiveFx | Past it, the oldest cuttable effect goes first |
| One grand burst | 1.6 s | `chart/fx/timing.ts` GRAND_BURST_S | One grand flare at a time: the next waits this long after the last starts, at most 4 s or its maneuver's end |
| Ducking | 0.4 | `chart/fx/timing.ts` DUCK | While a grand flare bursts, other effects dim to 40%; lesser flares start 30% smaller |
| Opening: most entrances | 28 | unguarded: `chart/fx/v1/interpreter.ts` OPENING_MAX | The rest fade up with the last |
| Opening: spacing | 450 ms lead, 110 ms apart, 3000 ms span | unguarded: `chart/fx/v1/interpreter.ts` OPENING_LEAD_MS, OPENING_STEP_MS, OPENING_SPAN_MS | When entrances start; closer than 110 ms when there are many, so the opening fits in about 3 s |
| Crowd entrance | 4 | `@shared/engine/maneuvers.ts` CROWD_MIN | This many arrivals in one beat come in quietly, as the opening does; the planner reads it too, so a crowd asks for no attention (22 B7). This many **creations** in one beat play as one Sector sweep instead (27 E7a, 05 M-32; `pace.ts` writes the rule's nominal length with the literal 4, and `sweep.test.ts` keeps the two equal); the quiet crowd remains for other arrivals |
| Sector sweep (new, 27 E7a) | 110 ms apart, 2000 ms spread at most, 1000 ms entrance | `@shared/engine/pace.ts` SWEEP_STEP_MS, SWEEP_SPREAD_MAX_MS, SWEEP_ENTER_MS | The sweep's act (`sweepPhases(n)`): each new piece enters this far after the last, nearest the star first, closer when there are many so the spread stays within 2 s, and the last one's quiet entrance runs 1 s; act = min(2000, n × 110) + 1000, after a 300 ms tell, then a 400 ms echo (2140 ms for four, 3700 at most). The opening's own rhythm plus its quiet entrance |
| Attention budget (22 B7; four from 22 C10) | 4 | `@shared/engine/maneuvers.ts` ATTENTION_MAX | At most this many labels show at once (a maneuver claims its places at its act, `claimMs`; its tell and gather, the travel, ask for none, 27 E2): the pieces' plates the interactions playing light (one per objective or threat a maneuver casts as subject, frontier or target) and the captains they name (a maneuver's flying crew, 22 B9). A merge with its author and two reviewers takes all four; a sortie takes two (its piece and its captain). A bigger crew names its pieces, the author, then reviewers in order; the rest keep their picture. The planner queues the rest, so busy beats lengthen and the episode budget compresses gaps first; the label layer holds to it, a lingering plate crossfading out for one whose maneuver starts or a captain being named, and places named captains right after focused plates. Light work and the standing plates (stars, planets, stations) don't count (2 until the user's real runs, 2026-10-15) |
| A close's glide (new, 22 C3) | 1200 ms | `@shared/engine/pace.ts` CLOSE_SLIDE_MS | A close's land: its initiating effect (stardust, or an enemy ship's culminating explosion) hides the swap to its done form, then it glides this long to its platform (the scene's glide, released from its moment's protect as the land starts: `ManeuverDef.slides`); the grand blossom opens the echo, and the planet's new tally lands with it (05 §8 M-22) |
| The arc's impact (new, 22 C4) | 1300 ms | `@shared/engine/maneuvers.ts` ARC_IMPACT_MS | How far into a merge's echo the station's split beam strikes the work (its 700 ms charge and the beam's run): the close of work the merge served, in its beat, plays from then as an `arc` close (land, echo, disperse), its holder flown into the formation, named *Closed it* (05 §8 M-23) |
| Stardust (new, 22 C3) | 900 ms | `theme/starChart/maneuvers/landing.ts` STARDUST_MS | The turn's cover round an asteroid, densest a third of the way in: it starts so that moment meets the land (in an arc, at the impact) |
| Victory flare (new, 27 B3) | 1600 ms | `chart/art/aura.ts` AURA_FLARE_MS | At the land of the three victories (`objective.accomplish`, `threat.accomplish`, `seat.complete`) the gold outline flares to `AURA_FLARE_WEIGHT` and eases back (a smoothstep) to its resting weight over this, on the scene clock (the `victory` act's overlay, `assets/acts.ts`); a seek rests it at once (INV-15); there is none under reduced motion. It is the close's land plus echo (1200 + 400), so the outline settles as the grand blossom takes over |
| An act's overlay (new, 22 C3) | 1.4 s | `theme/starChart/assets/adapt.ts` OVERLAY_S | `carve`, `rig`, `ghost`, `engage`, `launch`, `operate` draw over the piece for about its maneuver's act, then clear (`assets/acts.ts`; 05 §8 M-25) |
| Story time's arc reach (new, 22 C2) | 24 h | `@shared/playback/constants.ts` ARC_WORK_HOURS | A close joins the last merge serving it at most this many working hours before it (weekdays 07:00–19:00 in the viewer's zone, `playback/workHours.ts`: two working days), so a merge, a break and the close play as one moment (05 §8.3a B-12; it was the same calendar day until the user's real runs) |
| Note's reading time (new, 22 B7) | 1800 ms | `@shared/engine/maneuvers.ts` NOTE_MIN_MS | The least a labelled interaction holds its place in the budget (from its claim, the act's start, to this long after its start: travel is free, 27 E2), and its beat open, so its note can be read before the next competes |
| A captain's turn: held open (new, 22 B9) | 1500 ms | `@shared/engine/maneuvers.ts` CREW_HOLD_MS | A captain flying a maneuver (agent or support, a maneuver with a gather) is named from parking (the act's start) through the work and, whole (not unfurling or folding), at least this long after it, or until the disperse when the payoff runs longer (`crewTimes`; 1000 until the user's second look, when the unfurl ate into it). Their sortie holds that long, and the planner counts it (`durMs`), so their next work waits. Counted in the attention budget since 22 C10 |
| A captain's turn: whole at least (new, 22 B9) | 1500 ms | `@shared/engine/maneuvers.ts` CREW_OPEN_MIN_MS | However short the work, the plate is whole at least this long, from the unfurl's end to the fold's start: neither animation counts |
| A captain's turn: unfurl and fold (new, 22 B9) | 520 ms | `@shared/engine/maneuvers.ts` CREW_FOLD_MS | The plate opens from the picture to name and part over this once the ship is parked, and folds over it before the ship leaves. It follows the sortie as flown (`Sortie.crewOpen`): shut in flight. Paused it folds on the wall clock; reduced motion is on or off |
| Parking off the work's plate (new, 22 B9) | ±0.45, ±0.9 rad · 26 px | unguarded: `chart/fx/commands.ts` PARK_TURNS, PARK_CLEAR_PX | A sortie's other spots round the work's planet, in order, if its first would put the ship (its radius and this many screen px for its own plate) over the work's plate; chosen once as it sets off |
| Strike run fan (22 A10, B9) | 0.8 rad | `theme/starChart/maneuvers/strikeRun.ts` STRIKE_FAN | How far apart its ships stand round the threat's side of its planet (0.6 until B9) |
| Merge formation (22 B9) | 3.4, 4 ship sizes | `theme/starChart/maneuvers/formationSpots.ts` APPROVER_STEP, APPROVER_OUT | The approvers' row: the gap between neighbours, and how far beyond the author (2.6, 3.2 until B9), so each one's named plate has room |
| Note's PR title (new, 22 B6) | 24 characters | `@shared/engine/eventLine.ts` NOTE_TITLE_MAX | A PR's note (`PR #12 · Title — Merged`) cuts its title here with "…", so its action always shows |
| Label settle | 3000 ms | `chart/labels.ts` SETTLE_MS | A full label returns once its object, and the playback, have been still this long |
| Label flash | 3500 ms | `chart/labels.ts` FLASH_MS | A new or changed Task's title shows this long |
| Piece label in play: linger (new, 19 L7) | 1500 ms | `chart/fx/timing.ts` CAST_LABEL_LINGER_MS | A hover-only piece's title shows from its maneuver's act (once its cast has arrived, R11; the tell lights none, 27 E2), and wears its event's note (22 B6; none paused) while the maneuver plays; History marks that event *now*. Effect time, at the rate. It stays this long after the maneuver's land or echo ends (else its act's), then fades |
| Piece label in play: fade (new, 19 L7) | 400 ms | `chart/fx/timing.ts` CAST_LABEL_FADE_MS | Its fade out; none in reduced motion (it just goes). Paused, it fades out on the wall clock and back on resume (05 §8 A-3); a seek clears it at once (INV-15) |
| Plate unfurl (new, 22 A8) | 450 ms glance, then 520 ms | `chart/labels.ts` EMERGE_DELAY_MS, EMERGE_MS | A captain's or station's plate (its picture in play too) waits while its ship or station makes its entrance (hidden or fading up for it, sliding in, arriving: `GraphScene.entering`), then for the glance, so the object is seen first. It then unfurls from the object, with nothing moving or scaling: the pointer draws out from its rim dot over the first third, the frame traces itself round the plate, and the plate is revealed from the edge nearest the object. Wall time. A seek, a scene entry and reduced motion show it at once (INV-15) |
| Ship facing (new, 2026-10-14) | 12 px/s; 0.35 | unguarded: `chart/scenes/GraphScene.ts` TURN_PX_S, TURN_LEAD, SNAP_PX | A ship or station points the way it travels, from where it is drawn each frame, however it is moved (a glide, a sortie, an entrance): it turns to its horizontal travel once that passes this speed on screen and is at least this share of its vertical speed. Still, it holds its heading (nosed toward its work while it works). Moves made while hidden, and snaps of 240 px or more in a frame (a seek), aren't travel. While it moves, the movers' own turns and the resting rule stand aside |
| Frontier belt fade (new, 19 S2) | 600 ms | `chart/fx/timing.ts` GUIDE_FADE_MS | The belt fades in as the first unassigned piece comes into view and out once the last has left (a guide's `shownBy`, following the pieces as drawn), on wall time; a seek, a new scene and reduced motion snap it (INV-15) |
| Station standby (new, 19 M1) | under 0.25 activity (two days of history since its last PR event), with none open | `@shared/scene/project/solar.ts` STANDBY_BELOW | A station stands by when none of its PRs is open and its activity, measured as a piece's (1 at its last PR opened, merged or abandoned, halving every day of history) but unquantised, is under this. Its next PR wakes it. Calendar days, as a piece's |
| Station standby: fade (new, 19 M1) | 2400 ms down, 900 ms up | `theme/starChart/assets/standby.ts` STANDBY_FADE_MS, STANDBY_WAKE_MS | It powers down over the first, on wall time, from the beat that puts it on standby; it wakes over the second, from the land of the PR's maneuver that wakes it (after its tell). A seek, scene entry and reduced motion land it at once (INV-15) |
| Station standby: dim (new, 19 M1) | hull and satellites 0.7; drives and lights 0.3 of that | `chart/art/dreadnoughts.ts` POWER_DIM_HULL | The art's `DreadnoughtView.setPower(0)` (23 C4; standby passes 1 − level; the shares are `POWER_DIM_HULL`, `POWER_DIM_LIGHTS` in `chart/art/dreadnoughts.ts`): a grey tint: the hull and its satellites at this share of their light, every additive layer (drives, windows, bays, reactor, beacons, shield) a further share. Its idle drift slows to a stop with it, and raised, its plate is T3, not T1 (§6). No change of place or size (INV-14, INV-19) |
| Vacated homeworld: dim (new, 23 C3) | surface 0.55; lights none | `chart/art/worlds.ts` VACANT_SURFACE | (`vacancyShares` is the pure math.) A seat that holds nothing at the playhead (`piece.vacant`, `vc=1`; 13 §3) draws its surface at this share of its light and turns its settlement lights off (they fade from what the world last showed), on one smoothstep of the level. The planet keeps its place and size (INV-14, R9); only its look moves |
| Vacated homeworld: fade (new, 23 C3) | 2000 ms down, 900 ms up | `theme/starChart/assets/seat.ts` VACANT_FADE_MS, VACANT_WAKE_MS | It dims over the first, on wall time, when its last piece leaves, and lights over the second when work returns; a first arrival plays first light instead (next row). A seek, scene entry and reduced motion land it at once (INV-15) |
| Vacated homeworld: first light (new, v1.4 B4) | 800 ms across, 600 ms to settle | `theme/starChart/assets/seat.ts` FIRST_LIGHT_MS, FIRST_LIGHT_FADE_MS | A seat's first arrival in the round (`aw=1` before it) lights its night side: pinpoints and a warm bloom come on behind a front from the terminator to the far limb over the first, then settle to the world's own lights over the second, while the dim lifts over the first. A later return eases as above. Wall time; a seek, scene entry and reduced motion land it at once (INV-15) |
| Tour: wait for an object (new, 23 E7) | 25000 ms | `tour/tourRun.ts` TOUR_WAIT_MS | How long a step waits for its object to be drawn before it shows without a pointer (06) |
| Tour: drawn, and settle (new, 23 E7) | 0.95; 900 ms | `tour/tourRun.ts` SEEN_ALPHA, SETTLE_MS | A node counts as drawn once its view is this opaque; the pod then plays on for the second so its entrance finishes before the step holds (06) |
| Drop notice (new, 23 E8) | 6000 ms | `panels/dropNoteStore.ts` DROP_NOTE_MS | The notice a picture dropped on the chart leaves fades after this long |
| Captain file: size cap (new, 23 E2) | 4096 | `@shared/captainFile.ts` CAPTAIN_FILE_MAX_BYTES | The most characters a captain file may hold before import refuses it |
| Azure CLI: token refresh (new, 23 E5) | 5 min before expiry; not sooner than 60 s | unguarded: `../../main/credentials/azCli.ts` REFRESH_MARGIN_MS, MIN_REFRESH_MS | When the session asks `az` for a new token (04 §1a) |
| Azure CLI: refetch and call limits (new, 23 E5) | 20 s apart; 15 s per call | unguarded: `../../main/credentials/azCli.ts` REFETCH_GAP_MS, AZ_TIMEOUT_MS | The least gap between refetches after a 401, and how long one `az` call may run (04 §1a) |
| Glide | τ 0.3 s | unguarded: `chart/scenes/GraphScene.ts` GLIDE_W | Every node eases to its new place (`GLIDE_W` = 1 / τ), settling in about a second; seeks, scene entry and reduced motion snap |
| Arrive and depart | 0.9 s; 12 a second; else a 0.3 s fade | `chart/fx/timing.ts` ARRIVE_S, DEPART_S; unguarded: `chart/scenes/GraphScene.ts` MOTION_PER_S, CHEAP_S | A body entering or leaving a scene; past the rate, it fades instead. GraphScene imports the lengths the v0 director uses (v1.3 F2: no private copies) |
| Worth an inch | 60 px | `chart/fx/timing.ts` INCH_PX | A v0 change of place shorter than this just glides |
| Rates | ¼×, ½×, 1×, 2×, 4× | `@shared/contracts/playback.ts` RATES | Schedule speed, from ¼× to the top of the range, 4× |
| Default rate | 1× | unguarded: `@shared/playback/clock.ts` (inline) | Every session starts at 1× (`PlaybackClock`'s `rate` field) |
| Accent clock | at most 2× | unguarded: `chart/art/motion.ts` (inline) | Travel runs at the rate; accent and pulse timing at min(rate, 2), so effects keep their shape (a literal in `setMotionRate`) |
| Frame camera | 700 ms | `chart/framing.ts` FRAME_MS | Frame-the-action's pan or zoom out |
| Follow camera | 900 ms; 0.8–2.5× fit | `chart/framing.ts` FOLLOW_MS, FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM | The follow camera's move and zoom range |
| Directed camera (27 E9) | 900 ms in, 900 ms back; up to 1.5× fit | `chart/framing.ts` CLIMAX_MS, BOARD_MS, CLIMAX_MAX_ZOOM | Eases toward a climax's cast, and back to the fitted board for montage |
| Camera hold after a click | 1500 ms | unguarded: `chart/ChartApp.ts` CAMERA_HOLD_AFTER_MS | The automatic camera keeps still around a click |
| Recap bloom | 14, 0.22 s apart | `chart/fx/timing.ts` RECAP_MAX, RECAP_STEP_S | At the end of an open round: Victory gold flares in the order things finished |
| Finale (new, 2026-10-13) | glints from 700 ms, 240 ms apart, at most 14; formation from 900 ms: 1500 in, 2600 hold, 1400 back | unguarded: `theme/starChart/finales.ts` GLINT_AT_MS, GLINT_STEP_MS, GLINT_MAX, FORM_AT_MS, FORM_IN_MS, FORM_HOLD_MS, FORM_BACK_MS | A finished round's end; the viewer's awards light on their own ship once the formation has formed (2.7 s in), riding it |
| Station charge | 600 ms | `chart/fx/timing.ts` STATION_CHARGE_MS | A station's charge before its phaser or mining beam, in the beamed closes (Landing and Strike run `beamed`, via `stationFire`). The hull's own charge in the art (`chart/art/dreadnoughts.ts` CHARGE_S, 0.6 s) mirrors it |
| Power link charge | 700 ms | `chart/fx/timing.ts` LINK_CHARGE_MS | Power link's own, longer charge before the station's split beam, into the echo (v1.3 F2: named apart from the station charge, beside it) |
| Jump trails (v0) | 14000 ms, fading over the last 3000 ms; 3 a scene | `@shared/playback/constants.ts` TRAIL_MS, TRAIL_FADE_MS, MAX_TRAILS | A departure's trail lifetime |

**Source:** `src/shared/playback/constants.ts`, `src/shared/engine/maneuvers.ts`, `src/shared/playback/engagement.ts`, `src/shared/contracts/playback.ts`, `src/shared/playback/clock.ts`, `src/renderer/src/chart/fx/timing.ts`, `chart/fx/v1/interpreter.ts`, `chart/labels.ts`, `chart/scenes/GraphScene.ts`, `chart/framing.ts`, `chart/art/motion.ts`, `chart/ChartApp.ts`, `theme/starChart/finales.ts`, `theme/starChart/assets/standby.ts`, `theme/starChart/assets/seat.ts`, `chart/art/worlds.ts`, `chart/art/dreadnoughts.ts`, `src/shared/scene/project/solar.ts`; rows marked `unguarded:` are private constants or literals (§1) · **Guard:** `docTables.test.ts`, `tests/golden/schedule.test.ts`, `scheduleHooks.test.ts`, `commands.test.ts`, drive step `solar-opening.ts` · **Update when:** any constant here changes, or a value moves from inline code to a named constant.

## 11. Device profiles

A device profile (v1.4 C4, [27](27-v1.4.md)) is one JSON file per device class in `config/profiles/`, checked
by `deviceProfileSchema` (`src/shared/contracts/profile.ts`): the pacing budgets, the render budget and
limits, and the render switches. `desktop` is the default and today's numbers. The profile reaches the
renderer as `window.starChart.env.profile` (Settings › Theme shows it). Every row below is read from it:
the pacing budgets by the schedule and playback, the switches and the effects cap where they act
(`activeProfile()` at the moment of use, so a test can flip one in a run with `__starChartTest.setProfile`),
and the frame budget by `perf.spec.ts`. `switches` and `limits` are where C3 adds its cuts: one key per
cut, in the schema, in all four files and in the tables below.

An override file, `profile.json` in the app's data folder, may set `profile` (the base) and any value
under `pacing` and `render`; it takes effect at the next launch. `STAR_CHART_PROFILE` pins a base in
unpackaged runs. A broken override (not JSON, an unknown key, a value out of range) is ignored with a
notice in Settings and a dev-log line carrying a reason code only.

<!-- table: profile-desktop -->
| Name | Value | Constant | Meaning |
|---|---|---|---|
| Episode budget | 45000 | `@shared/profile/bundled.ts` DESKTOP.pacing.budgetMs | `pacing.budgetMs` (ms): an episode's length at 1×; the schedule, playback and the pacing scripts all read it from the active profile |
| Highlights budget | 30000 | `@shared/profile/bundled.ts` DESKTOP.pacing.highlightBudgetMs | `pacing.highlightBudgetMs` (ms): the High-beats-only schedule at 1×; read from the active profile too |
| Frame budget: vsyncs | 2 | `@shared/profile/bundled.ts` DESKTOP.render.budget.frameVsyncs | `render.budget.frameVsyncs`: the painted p95 in vsyncs (§10 Frame budget) |
| Frame budget: tolerance | 2 | `@shared/profile/bundled.ts` DESKTOP.render.budget.toleranceMs | `render.budget.toleranceMs` (ms) added to the vsyncs |
| Live effects cap | 24 | `@shared/profile/bundled.ts` DESKTOP.render.limits.maxActiveFx | `render.limits.maxActiveFx`: live effects at once; past it the oldest cuttable goes first (§10) |
| Paint | on | `@shared/profile/bundled.ts` DESKTOP.render.switches.paint | `render.switches.paint`: the painted look |
| Twinkle | on | `@shared/profile/bundled.ts` DESKTOP.render.switches.twinkle | `render.switches.twinkle`: the stars' idle twinkle |
| Ornament | on | `@shared/profile/bundled.ts` DESKTOP.render.switches.ornament | `render.switches.ornament`: ornament *commands* play when the scene is calm (§10 Calm mark); off applies the calm floor at every load, so ornament and repeats drop, and drops `calm()`'s users (recap, dawn sweep, idle work, seed sparks). It does not gate light work (`agentLight`, the ornament-tier maneuver): that names a real cause (R13) and follows the activity level and load (27 Decisions, 2026-11-01) |
| Aura bake | off | `@shared/profile/bundled.ts` DESKTOP.render.switches.auraBake | `render.switches.auraBake` (27 C3): an `outside` aura's glow, keyline and rim are cached layers re-baked only when colour, flare or scale change, not live filter chains every frame. Off on `desktop` and `laptop-battery`, on for `tablet` and `phone` (HG-C, 2026-11-01): it lowers Pulsar's p95 by about 47%, but its 1 to 2 px rim is not pixel-identical to the live one (`c3-aura-diff`: worst p99 91 to 97/255 on Harbor, 249 on Pulsar, against 12; `c1-contrast`: medians within about 0.7 of live on the night sky, blue and gold brighter) |

**Source:** `config/profiles/desktop.json`, `src/shared/contracts/profile.ts` · **Guard:** `docTables.test.ts`,
`profile.test.ts` · **Update when:** a key is added to the schema, or a `desktop` value changes.

The other profiles, as differences from `desktop` (starting guesses until they are tried on real devices).

<!-- table: profile-deltas -->
| Key | laptop-battery | tablet | phone |
|---|---|---|---|
| `pacing.budgetMs` | 45000 | 40000 | 30000 |
| `pacing.highlightBudgetMs` | 30000 | 27000 | 20000 |
| `render.budget.frameVsyncs` | 2 | 2 | 3 |
| `render.budget.toleranceMs` | 2 | 3 | 3 |
| `render.limits.maxActiveFx` | 24 | 16 | 12 |
| `render.switches.paint` | off | on | off |
| `render.switches.twinkle` | off | on | off |
| `render.switches.ornament` | on | off | off |
| `render.switches.auraBake` | off | on | on |

**Source:** `config/profiles/*.json` · **Guard:** `profile.test.ts` checks that each file parses; these values are
not checked against the files · **Update when:** a bundled profile's value changes.
