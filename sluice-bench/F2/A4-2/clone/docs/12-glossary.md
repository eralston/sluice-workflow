# 12 — Glossary

**Status:** current as of 2026-10-26 (through v1.2), checked against the code in the working tree. Covers the
Solar view's vocabulary: engine terms, their game forms, each pack's words, and where each lives in
code. (Drafted 2026-10-10 for HG-V2; the v0 views' words are [01 §Glossary](01-product-brief.md).)

This glossary is the shared vocabulary for Star Chart v1. Each concept is defined once, as an
**engine term**: a domain-neutral word the rules and code use. It is then given:
- its **game form** in the space theme;
- what it means in each **domain pack**: SDLC (Azure DevOps), Todo, and CRM (the pack's
  `words.ts`);
- where it **lives in code**: the type, constant or file that holds it today (v1 first; a v0
  name is marked "v0").

Paths are from `src/`: `shared/…` is pure engine and contract code, and `renderer/src/…` is the
renderer (written `chart/…` and `theme/…` for short, as in [15](15-reference.md)). Values (colours,
lengths, sizes, counts) are in [15-reference.md](15-reference.md), not here.

> **The rule this glossary enforces.** Code in `src/shared/` and the art speak only engine terms.
> Only a domain pack knows names like "User Story", "Resolved" or "Pull Request". Only a theme pack
> knows names like "asteroid" or "station". [archived 11 §Summary](archive/11-v0-inventory.md#summary-what-the-surveys-agree-on)
> lists every place v0 breaks this rule.

Terms in **bold** in a definition are defined elsewhere in this glossary. A † marks a term that is
new in v1 or changes meaning from v0. [13-game-design.md](13-game-design.md) holds the open
decisions.

---

## 1. Layers

*Applies to: Solar · packs: all.*

| Term | Definition | Lives in |
|---|---|---|
| **Engine** | The domain-neutral core: timeline, replay, layout, playback schedule and rules. It knows **roles**, **categories** and **rungs**, never source names or theme names. | `shared/engine/` |
| **Domain pack** † | An adapter that maps one kind of work (SDLC, Todo, CRM) onto engine terms. It provides the **state mapping**, the **terminology**, an event adapter (its **moves**), thresholds and fixtures. SDLC reads ADO; Todo and CRM are fixture-only | `DomainPack` (`shared/engine/types.ts`); `shared/packs/{sdlc,todo,crm}/`; mappings in `config/` |
| **Theme pack** † | The look for each engine role: its **assets**, **commands**, **maneuvers**, finale, palette and **factions**. v1 ships one theme, *Star Chart*. The design leaves room for others. | `theme/types.ts`; `theme/starChart/` (`roleAsset`) |
| **Terminology** † | The words a pack uses in the UI, in two registers: **chart** (the theme's words, such as "asteroid") and **source** (the domain's words, such as "User Story"). The UI shows both together, the source register first and the chart's after it, quieter (22 B1); there is no toggle. | `terminology()`, `ENGINE_WORDS` (`shared/engine/terminology.ts`); each pack's `words.ts` |

**Source:** the files in the last column · **Update when:** a layer gains or loses a part.

## 2. Structure: where things are

*Applies to: Solar · packs: all.* The pack words are each pack's `level` nouns (`SourceWords.level`).

| Engine term | Definition | Game form | SDLC (ADO) | Todo | CRM | Lives in |
|---|---|---|---|---|---|---|
| **Tenant** | The connection boundary: one account with a source | Observatory (not drawn) | Organization | Account | CRM instance | `OrgKey` (`shared/contracts/keys.ts`) |
| **Workspace** | A top-level destination the user pins | Galaxy | Project | Workspace | Pipeline | `ProjectFact` (`shared/contracts/facts.ts`); `shared/scene/project/galaxy.ts` |
| **Round** † | A timebox: the clock for one episode. Drawn as a sector of its regions, which doesn't play; each region's star carries a **preview** of what it opens with (its seats, its objectives and threats by count, 19 P1) | Sector: the map of a round's systems | Sprint (iteration) | Week | Quarter | `RoundFacts.round`; the `sprint` level, `playable: false` (`shared/hierarchy/solar.ts`); `solarRoundField`, `regionPreview` (`shared/hierarchy/solarRound.ts`); `SprintSector` |
| **Region** † | A standing group of people and work. **The bottom level of the map, and where playback happens** | Solar system (its star) | Area Path, as a pod or team | List | Territory | `RoundFacts.region`; the `pod` level, `layout: 'solar'`; `AreaNodeFact` |
| **Seat** † | One person's territory in a region during a round. A person has a seat if they held at least one **objective** or **threat**, on the ladder, in the region during the round | Planet (**homeworld**) on its own orbit arc | Assignee | Member | Sales rep | `seatsOf` (`shared/engine/facts.ts`); `SeatSlot`, `placeSeats` (`shared/engine/solar/seats.ts`) |
| **Frontier** † | Where unassigned objectives and threats wait in a region | Frontier belt: the outer drifting zone | Unassigned | Unassigned | Unowned | `frontierBelt`, `frontierSlots` (`shared/engine/solar/frontier.ts`) |
| **Tray** | A holding list for items the rules can't place, so a home is never invented. Every view has the trays panel; Solar reuses the Sprints view's Uncharted rule | A tray chip | Uncharted; Unlinked PRs | Orphaned items | Unlinked activities | `ViewGraph.trays` (`shared/contracts/view.ts`) |
| **Chain** | The ordered levels from workspace down to region. v1 has one: **workspace → round → region** | Galaxy → sector → solar system | Project → sprint → pod | Workspace → week → list | Pipeline → quarter → territory | `SOLAR`, `solarHierarchy` (`shared/hierarchy/solar.ts`); `chain`, `LevelDef` (`shared/hierarchy/chain.ts`) |

**Source:** the pack `words.ts` files and the code in the last column · **Update when:** a level is
added, a pack renames one, or the code moves.

## 3. Pieces: what is on the board

*Applies to: Solar · packs: all.* The pack words are each pack's `role` nouns; each role's asset,
layer and label rank are in [15 §4](15-reference.md#4-roles-kinds-and-assets).

Each type in a domain declares one **role** (`Role`, `shared/contracts/history.ts`: objective,
threat, step, container, facility, attachment or guard), read through `resolveRole`, never from the
type name. The role decides its game form and its rules. **Seat** and **agent** aren't roles a type
declares: they are people, and the theme's `roleAsset` binds them to assets too.

| Engine role | Definition | Game form | SDLC (ADO) | Todo | CRM | Lives in |
|---|---|---|---|---|---|---|
| **Objective** † | An opportunity to complete | Asteroid (metal, crystal or energy) that becomes a **mine platform** in low orbit | User Story | Todo | Deal | `objectiveAsset` (`theme/starChart/assets/objective.ts`); `AsteroidView` (`chart/art/asteroids.ts`); v0: `kind: 'story'` → planet |
| **Threat** † | A problem to defeat | Enemy enemy ship (insectoid) whose hulk becomes a **research platform** in low orbit | Bug | Problem | Escalation | `threatAsset`; `HiveShipView` (`chart/art/swarm.ts`); v0: `kind: 'bug'` → anomaly |
| **Step** | A unit of work under an objective or threat | An **augmentation** (a plate on its asteroid's rim), or a **weapon pod** on its enemy ship. Drawn inside its parent | Task | Checklist Item | Follow-up | `INNER_PARTS` (`theme/starChart/index.ts`); `Piece.steps`; v0: `kind: 'task'` → mission point |
| **Facility** † | A shared resource that many seats deliver into. The first **compound** | Station: a station (Trek, Wars or Mecha), in its first or second **form** | Repository, and only that | Context ("Home"), optional | Account | `facilityAsset`; `DreadnoughtView` (`chart/art/dreadnoughts.ts`); `StationSlot`; `RepoFact` |
| **Attachment** † | A change delivered from an objective or threat to a facility. It belongs to the facility | **Tender** shuttle: a satellite in a fixed slot around its station | Pull Request | Note, optional | Quote | `AttachmentFacts` (`shared/engine/types.ts`); `CompoundSlot`; `PullRequestFact` |
| **Guard** † | An automated check that protects a facility | Point defense: a satellite in a fixed slot around its station (visual only; not ingested) | Pipeline run | Reminder, optional | Approval | `CompoundSlot` with `role: 'guard'` (`shared/engine/solar/compound.ts`) |
| **Agent** | A person, as the one who acts | Captain ship | Person (assignee, changed-by, PR author, reviewer) | Member | Rep | `agentAsset`; `CaptainView` (`chart/art/fleet.ts`); `captains`; v0: `ShipView` |
| **Viewer** † | The person this copy of the app is for, chosen in Settings and stored per tenant as their person key, never a name. Their faction styles their own ship and the stations they **summon** first, and only they earn **achievements** | Your captain | The ADO user picked in Settings | The member picked in Settings | The rep picked in Settings | `UserSettings.viewer`, `.captain` (`shared/contracts/settings.ts`) |
| **Container** | A grouping above objectives that isn't drawn on the v1 board | Not shown in the Solar view since v1.1 (19 L6: a station's rows are its PRs); it was a subtitle on a station's mega-label rows | Feature (Epics are deferred) | — | — | `roleAsset.container = 'none'`; `DomainPack.containerUrl`; v0: `kind: 'feature'`, `'epic'` |

**Source:** `Role` and `roleAsset` (15 §4), the pack `words.ts` files · **Update when:** a role is
added, re-pointed to another asset, or a pack renames a type.

A person appears twice in the game: as a **seat** (their planet, where their work lands) and as an
**agent** (their ship, which goes where they work). The two are deliberately separate. INV-07 still
holds: assignment decides the seat, and recorded activity decides where the ship goes.

## 4. Progress: how state is read

*Applies to: both views (the ladder is shared; own share, outcome and platform are Solar's).* Each
rung's colour, motion and mark, and every pack's states → rungs, are in
[15 §3](15-reference.md#3-signal-ladder).

| Term | Definition | Lives in |
|---|---|---|
| **Raw state** | The source's own state name, such as "Ready to Accept" or "Closed Won". Only a domain pack sees it | `WorkItemState.rawState` |
| **Category** | A closed, neutral set: Proposed, InProgress, Resolved, Completed, Removed, Unknown. Rules read categories, never raw states | `MappedState.category` (`shared/contracts/history.ts`) |
| **Rung** † | The step on the **signal ladder**: Ready, Underway, Nearing, Accomplished, or Off. In v1 it is **stored in the mapping**; a state with none falls back to its stage, then its category | `Rung`, `MappedState.rung`; `resolveSignal`, `RUNG_OF_STAGE`, `RUNG_OF_CATEGORY` (`shared/engine/signal.ts`) |
| **Sketch** | The first form within Ready: a wireframe on sensors ("sensor contact") | `Signal.sketch` |
| **Signal** | What a look needs to know: rung, sketch, step, deferred, ghost, strike, unknown | `Signal` (`shared/engine/types.ts`) |
| **Signal ladder** | One colour, ornament, contrast and motion per rung, shared by every object with a state ([09](09-signal-ladder.md)) | `RUNG_COLOR`, `SIGNALS` (`chart/art/progress.ts`) |
| **Own share** † | The fraction of what a seat holds now in the region that is Accomplished (Off pieces don't count), in steps of 0.05. **It drives a planet's transformation.** It is never a count, and never compared across people (INV-05, INV-19) | `PieceState.share` (`shared/contracts/view.ts`), set in `shared/scene/project/solar.ts`; `QUANTUM` (`shared/engine/stageCode.ts`); v0 nearest: `podStage` |
| **Intensity** † | A station's own share of its linked pieces that are done. It drives how strongly the station glows, never a rung | `PieceState.intensity`; `compound.intensity` |
| **Outcome** † | What a finished piece leaves behind: a **trophy** (a mine, or a research platform) in its slot on the one trophy ring round its seat's planet, in close order. Nothing is built on the planet (superseded 2026-10-12: megastructures and research facilities on the surface) | `SolarPlan.platforms`, `trophyShells` (`shared/engine/solar/plan.ts`, `mandala.ts`) |
| **Platform** † | A finished piece's fixed place in low orbit on the lit, star-facing edge of its planet: objectives left of the star line, threats right. A piece shows there once Accomplished | `PieceSlot` with `mode: 'platform'`; `ViewNode.platform` |
| **Off the ladder** | Removed, Rejected, abandoned: a ghost, dashed. Deferred: Ready plus pause bars. Unknown: neutral grey with "?" | `knownOff` (`shared/engine/facts.ts`); `chart/art/marks.ts` |

**Source:** `shared/engine/signal.ts`, the mappings in `config/` · **Update when:** a rung, flag or
category is added, or the fallback changes (amend 09 and 15 §3 too).

## 5. Time: how the story is told

*Applies to: both views (moves, rules and milestones are Solar's; accents are the v0 views').*
Budgets and timings are in [15 §10](15-reference.md#10-timing-and-budgets).

| Term | Definition | Lives in |
|---|---|---|
| **Fact** | A normalized record of what the source said, stored in main | `shared/contracts/facts.ts` |
| **Event** | A dated change, ordered by `(occurredAt, precedence, key)`. Only events animate | `TimelineEvent`, `EventKind` (`shared/contracts/events.ts`) |
| **Observation** | An undated fact. It never animates (INV-02) | `Observation` |
| **Move** † | An event read once into engine terms: `appear`, `climb`, `reseat`, `enter`, `leave`, `bind`, `unbind`, `attach`, `settle` or `retitle`. Maneuver rules and achievements read moves, never raw events ([02 §4](02-domain-rules.md#4-event-catalog-pilot)) | `Move` (`shared/engine/types.ts`); `contractMoves`, `movesOf` (`shared/engine/moves.ts`) |
| **Round facts** † | A region's board over the loaded history: its pieces' membership, seats and signals over time, its attachments, and its moves. The plan, the projection and the rules all read it | `RoundFacts`, `roundFacts` (`shared/engine/facts.ts`); `boardFacts` |
| **Snapshot** | What was true at an instant, from a pure fold over events | `snapshotAt` (`shared/replay/snapshotAt.ts`) |
| **Lens** | Which truth a snapshot shows: *known then* (the default) or *current, observed* (retrospective) | `Lens` (`shared/contracts/view.ts`) |
| **Playhead** | The instant being shown | `clock.x`, `stateUtc` |
| **Episode** † | One playback of one region's round. **The core experience of v1** | the region's beat schedule (`buildBeatSchedule`, sized by `pacing`) |
| **Beat** | One step of an episode: one or more events that play together | `Beat`, `buildBeatSchedule` (`shared/playback/schedule.ts`) |
| **Accent** | The v0 views' animation for a beat, within its tier and the volatility budget | `accentFor` (`shared/playback/accents.ts`), `planAccents` |
| **Rule** † | An engine-named maneuver rule (`objective.accomplish`): which move starts it, its cast, its phases and lengths, its tier, and whether it's protected. The theme names the choreography it plays | `RULE`, `PACE_RULES` (`shared/engine/pace.ts`); `ManeuverRule` (`shared/contracts/maneuver.ts`) |
| **Cast** † | Who a maneuver moves or points at, by part: subject, agent, support, seat, facility, attachment, target and others | `Cast`, `CastRole` (`shared/contracts/maneuver.ts`) |
| **Protected moment** | A beat whose cast nobody else may move until it finishes (a landing, a defeat, a merge, a milestone) | `ManeuverRule.protect`; the `protect` command; v0: `shared/playback/protect.ts` |
| **Milestone** † | A moment the round builds to, beyond one close: **Homeworld complete** (`seat.complete`, a seat's last open piece closes) and **All clear** (`region.clear`, the region's last open threat closes). Each plays after the close that earns it. A celebration, never a ranking (INV-19) | `seatCompletedBy`, `regionClearedBy` (`shared/engine/pace.ts`); `theme/starChart/maneuvers/seatComplete.ts`, `regionClear.ts` |
| **Recap** | The end-of-episode bloom of what was accomplished, in order, in a round still open | `recap` (`chart/fx/v1/interpreter.ts`; v0: `director.recap`) |
| **Finale** † | The theme's end of a finished round, in the recap's place: the star flares, finished platforms **glint** in the order they finished, and the ships form up over the star; then the viewer's awards show | `Finale` (`chart/fx/types.ts`); `finale` (`theme/starChart/finales.ts`) |
| **Activity level** | How much light work plays: Calm, Lively or Maximum (the default, which ignores the load marks) | `ActivityLevel`, `ENGAGEMENT` (`shared/playback/engagement.ts`) |
| **Pace** | "A cozy campfire, not fireworks": everything is ponderous and has room to breathe | `PACE_RULES` lengths; `shared/playback/constants.ts` budgets |

**Source:** the code in the last column · **Update when:** a move kind, rule id or playback term is
added or renamed.

## 6. Visual system: how things look and move

*Applies to: Solar, except where a row says v0.* Colours are in
[15 §2](15-reference.md#2-palette), sizes and floors in [15 §5](15-reference.md#5-sizes-floors-and-layout),
labels in [15 §6](15-reference.md#6-labels-and-type), maneuvers in [15 §7](15-reference.md#7-maneuvers)
and commands in [15 §8](15-reference.md#8-effects).

| Term | Definition | Lives in |
|---|---|---|
| **Asset** | A drawable kind of object, with a factory, a **layer**, capabilities, floors, a label rank and gallery samples | `AssetDef` (`chart/assets/types.ts`); `theme/starChart/assets/*.ts`; v0: the view classes, `GraphScene` switch |
| **Layer** | Where an asset draws: **celestial** (painted, scales with the world, no screen floor) or hardware, which is **infrastructure** or **traffic** (crisp, with a screen floor) | `AssetDef.layer` |
| **Look** | One asset's appearance at one signal | `ViewNode.stage`, from `encodePiece` (`shared/engine/stageCode.ts`); v0: `stage` strings (`story.lush`) |
| **Transformation** | A change of look on one asset, such as terraforming or cutting. For a station it also means the one-off change from its first **form** to its second, played on its first merge of the round | `setStage` |
| **Station form** † | A station's shape: its **first form** (a bare spacedock, a cruiser, a carrier ship) until a PR merges into it in the round, its **second form** from then on. Every playback starts in the first form. It is not a rung ([13 §4.4](13-game-design.md#44-facilities-stations-with-their-satellites)) | `PieceState.merged`; `RoundFacts.firstMerge`, `.merges` (`shared/engine/types.ts`) |
| **Standby** † | A station gone quiet (19 M1): none of its PRs is open and none has opened or settled for two days of history. Its drives and lights dim, its drift stills and its plate drops to T3, until its next PR wakes it. Not a rung, a place or a size ([13 §4, Idle life](13-game-design.md#idle-life-2026-10-12-art-session)) | `PieceState.standby`, `STANDBY_BELOW` (`shared/scene/project/solar.ts`); `StationView` (`theme/starChart/assets/standby.ts`) |
| **Homeworld** † | A seat's planet, named from its person's first name in one of 16 templates ("Planet Kit"). The full name picks the template; a clash takes the next free one, then a Roman numeral ("Planet Kit II") ([13 §4.1](13-game-design.md#41-seat-planets-three-world-lines)) | `homeworldNames`, `HOMEWORLD_TEMPLATES` (`theme/starChart/homeworlds.ts`); `seatAsset`, `WorldView` (`chart/art/worlds.ts`) |
| **Tender** † | A tender shuttle: the game form of an **attachment**. It launches from its station's bay when the PR opens, patrols round it, and docks when the PR merges | `shuttle` inner part; `theme/starChart/maneuvers/shuttleTender.ts`; v0 nearest: `FlightView` |
| **Guest** † | A person with nothing of their own in the region who helped with someone else's work. Their ship rests beside where they last helped. In a maneuver, a person with no ship here jumps in out of hyperspace and out again | `projectGuests` (`shared/scene/project/traffic.ts`); the `guest` command |
| **Entrance** † | How an object arrives on the board: a tell, the act, a cooldown. In a crowd, a quiet entrance with no tell or settle ring ([13 §4, Entrances and exits](13-game-design.md#entrances-and-exits-2026-10-13-art-session)) | the `enter` command (`theme/starChart/entrance.ts`); `CROWD_MIN` (`engine/maneuvers.ts`); the rules: 05 §8 P-12, M-17 |
| **Opening** † | The start of an episode played from the beginning: the star breathes, then everything already there makes its quiet entrance, seat by seat. A seek ends it | `opening` (`chart/fx/v1/interpreter.ts`); `OPENING_ORIENT_MS` (`shared/engine/maneuvers.ts`) |
| **Idle life** † | A scene's motion at rest: ornament, never a ladder tempo, and stilled by reduced motion. It is a little busier where people worked lately ([13 §4, Idle life](13-game-design.md#idle-life-2026-10-12-art-session)) | `ViewNode.activity`; `AmbientWork`, `ambient` (`theme/starChart/ambient.ts`); v0: ambient motion (06 §7) |
| **Power link** † | The merge maneuver (`attachment.merge`): approvers energise the author, the author energises the station, and the station beams the work the PR served ([13 §6.2](13-game-design.md#62-maneuvers)) | `theme/starChart/maneuvers/powerLink.ts`; v0: the review formation, `dock` |
| **Variant** † | A second shape of one maneuver, chosen by the engine for one move: `first` (a station's first merge, which transforms it) and `beamed` (a close that the stations its merged work went to beam home) | `PaceRule.variant` (`shared/engine/pace.ts`); `PlannedManeuver.variant` |
| **Holo label** † | A holographic plate: a glass label in pale HUD cyan with two corners cut and one pointer to the object's rim. An asset opts in with `AssetDef.label` (frame, variant, layout, tier); a node with no asset gets its paradigm's plate (Solar only). Its tier, T1 Lead, T2 Door, T3 Place or T4 Sky (22 A5), is how loud it gets when raised: at rest every plate is T4 Sky, and pointed at, selected, followed, expanded, cast or acting it rises to its own tier (13 §1 R1; 15 §6). A plate with a list expands into its rows in place (Mega-label) ([06 §9](06-visual-brief.md#9-v1-the-solar-system-13-9-amended-2026-10-12)) | `HoloSpec` (`chart/holo/holoLabel.ts`); v0 used the navy plate |
| **Effect** | A short-lived visual with no lasting state of its own (flare, beam, ring). A **command** draws one | `Fx` (`chart/fx/types.ts`) |
| **Command** † | A named, weighted effect that a maneuver's phase issues. It declares its **tier**, weight, whether load may cut it, its clock (accent or travel) and its reduced-motion substitute. Seed commands come with the engine; a theme adds its own or overrides one by name | `CommandDef` (`chart/fx/types.ts`); `SEED_COMMANDS` (`chart/fx/commands.ts`); `theme/starChart/commands.ts`, `entrance.ts`, `finales.ts` |
| **Motion** | A move of one object toward a goal (glide, pursuit, orbit travel, jump) | `Pursue`, `OrbitTravel` (`chart/fx/moves.ts`); glide (`GraphScene.ts`) |
| **Maneuver** † | An engine **rule** played as the theme's choreography: its **cast** through its **phases**. One plays per matching move, on forward play only (INV-15) | `ManeuverDef` (`chart/fx/types.ts`); `theme/starChart/maneuvers/`; `PlannedManeuver` (`shared/contracts/maneuver.ts`); v0: formation, launch, ship-to-work |
| **Phase** † | One part of a maneuver, in this order: **tell → gather → act → land → echo → disperse**. A rule uses some of them; every claimed look lands at the start of `land` | `Phase`, `PHASES` (`shared/contracts/maneuver.ts`) |
| **Tier** | How much an effect or maneuver is worth: essential, narrative, or ornament. Load drops ornament first and never drops essential | `ManeuverTier`; `CommandDef.tier`; v0: 05 §5 |
| **Volatility** | How busy the scene is, which decides which tiers may play (its marks are in 15 §10) | `volatility()` (`chart/fx/v1/interpreter.ts`, `chart/fx/director.ts`); `CALM`, `BUSY`, `OVERLOAD` (`chart/fx/timing.ts`) |
| **Faction** † | One of three visual styles for hero ships and stations: **Trek** (space-opera explorers), **Wars** (planetary-romance starfighters and frigates), **Mecha** (transforming space mecha). Each is inspired by its genre and copies nothing. It comes from the **seed**, except for the viewer's own ship and the stations they summon first | `Faction`, `FACTIONS` (`theme/starChart/factions.ts`) |
| **Seed** | A stable hash of an entity's own ID within its tenant. It picks every varied look (faction, hull, colourway, world line, material, swarm), so a look survives purges and reconnects. Only an art-version bump changes it | `artSeed` (`shared/scene/project/ctx.ts`), `shipSeedFor` (`shared/captains.ts`) |
| **Summon** † | To bring a station into a round: the author of the round's first attachment into it does so. A station summoned by the viewer takes the viewer's faction | `StationSlot.summoner` (`shared/engine/types.ts`) |
| **Hull** | One ship design within a faction. v1 has 3 per faction, 9 in all | `FLEET_HULLS` (`chart/art/fleet.ts`); v0: `HULLS` (`chart/art/ships.ts`) |
| **Colourway** | A hull-and-accent colour pair, clear of hostile and ladder hues. Hulls × colourways give dozens of distinct ships | `COLOURWAYS` (`chart/art/fleet.ts`); v0: `LIVERIES` |
| **Swarm** † | One of three enemy styles: insectoid enemy ships, inspired by bug races in fiction | `SWARMS` (`chart/art/swarm.ts`) |
| **Hostile palette** † | Reds and their neighbours on the colour wheel, with black and charcoal. **Reserved for threats**; no hero colourway may use them | `HOSTILE` (`chart/art/swarm.ts`); `DANGER` (`chart/art/energy.ts`) |
| **Hero energy** † | The blue of friendly power: weapons, summons, phasers, tractors. Good guys shoot blue at every rung; only threats fire red | `HERO` and its family (`chart/art/energy.ts`) |
| **Role aura** † | A crisp outline in a piece's role colour (Opportunity Blue on an objective, Deadly Red on a threat), gold once Closed. It says what a piece is, never how far along | `AURA` (`chart/art/aura.ts`) |
| **Mega-label** † | An expanded label that lists a piece's children: a planet's objectives and threats, or a station's PRs (each with the work it serves as a subtitle; 19 L6). An objective's or threat's steps left the chart in 19 L7 (the inspector lists them). Since v1.1 (19 L2) it is the object's own holo plate in its **Expanded** state, its rows grown in place under its title, not a separate panel. Hovering a row (long-press on touch) lights its object (a PR's row, every piece it serves); a press selects it (a PR's row, the first piece it serves) | `MegaList` (`shared/contracts/view.ts`); `HoloRows` (`chart/holo/holoRows.ts`), placed by `chart/labels.ts` (`growPlacement`, `expandAt` in `holoLabel.ts`); retired: `chart/megaLabels.ts` |
| **Compound** † | A parent drawn with its children bound to it in fixed **slots**, like a molecule. Each child is a modular piece with its own look, rung and animations, so the compound tells its story in parts. Children never move the parent's rung | `ViewNode.compound`; `shared/engine/solar/compound.ts` (stations are the first) |
| **Slot** † | A fixed place: a child's on a compound (at a set angle and distance), or a piece's at a seat or in the frontier. Slots are assigned over the loaded history, so nothing wanders or swaps places (INV-14) | `CompoundSlot` (`firstFit`), `PieceSlot` (`shared/engine/types.ts`) |
| **Satellite** † | The game form of a compound's child: a small, crisp 3D piece in its slot, like a metadata tag. On each event it **charges up**, **operates**, then settles | `shuttle`, `point-defense` inner parts (`INNER_PARTS`); v0 nearest: the PR `FlightView` and its berth |
| **Formation** † | A seat's pieces of one role on its half-disc of the planet (the mandala, 22 Block D): stories left, bugs right, each at a fixed equal-area slot by arrival; a busy planet's slots shrink. Each keeps its own look, rung, hit area and mega-label (superseded 2026-10-12: smaller, touching copies past a cap of 3) | `Formation`, `halfDiscSlots` (`shared/engine/solar/mandala.ts`, `plan.ts`); `ViewNode.cluster` |
| **Label tier** † | How much a label says, picked each frame by one rule: **Title** (the title only), **Full** (title and subtitle), **Expanded** (with its rows) or **Picture** (a captain's picture alone, in play). Named once in v1.1 (19 Q5; were compact, standard, expanded, minimal). Not the holo plate's T1–T4, which set how loud it is. Rules and row budgets: [15 §6](15-reference.md#6-labels-and-type) | `LabelTier` (`title`, `full`, `expanded`, `picture`), `tierFor` (`chart/labelTiers.ts`); v0: modes in `chart/labels.ts` |
| **Glint** † | A four-point gold sparkle: a finished platform or a city light catching the light, in the finale and in Homeworld complete | the `glint` command (`theme/starChart/finales.ts`) |
| **All clear** † | The **milestone** when a region's last open threat closes: a hero-blue ring sweeps out from the star, each planet catching it (until 19 S2 it also lifted a red threat light off the belt) | `region.clear`; the `allClear` command (`theme/starChart/finales.ts`); `theme/starChart/maneuvers/regionClear.ts` |

**Source:** the code in the last column; values in 15 · **Update when:** an asset, command, layer or
visual term is added or renamed, or a piece of code moves.

## 7. Mechanics: board-game terms we use

*Applies to: Solar.*

| Mechanic | In Star Chart |
|---|---|
| **Area control** | Each seat's planet holds a region of the screen. Its stories and bugs sit on its two half-discs (stories left, bugs right), and its captain rests on its loiter ring |
| **Worker placement** | Captains go to where their person last acted (INV-07), never just where they're assigned |
| **Fog of war** | New work appears as a sensor wireframe (**sketch**) before it takes solid form |
| **Engine building** | Stations grow more capable (supply intake, covering fire, their **intensity**) as the work they support progresses, and take their second **form** on the round's first merge |
| **Co-operative play** | Everyone plays against the threats, never against each other. No scores, XP or rankings (INV-19) |
| **Achievements** † | Personal, outcome-based recognitions for the viewer only, earned from what their work arrived at in the round ([13 §8](13-game-design.md#8-achievements-decided-2026-10-10)). Code: `achievementsFor`, `AchievementRule` (`shared/engine/achievements.ts`) |
| **Event deck** | The round's timeline, replayed as beats |
| **Holding tray** | Items the rules can't place wait in a tray rather than at an invented home |

## 8. Rules, restated in engine terms

*Applies to: Solar.*

These are the v0 invariants that are really game rules, in v1 vocabulary. 02 is normative and now
carries the v1 amendments as dated sub-bullets; if this list and 02 differ, 02 wins.

- **A piece's own state drives its look** (INV-05). Children never move a parent's rung. The
  exceptions are aggregates that aren't pieces: a region's star, a seat's planet (**own share**),
  and a station's **intensity** and **form**.
- **An agent goes where its person acted, not where they're assigned** (INV-07, INV-08).
- **Nothing invented** (INV-10). With no legal place, a piece goes to a tray. A removed piece
  rests as a ghost at its slot and counts in no share (in the v0 views it leaves the scene).
- **Fixed setup** (INV-14). Orbits, seat slots, lattice cells, platforms, frontier slots and
  compound slots are fixed over the loaded history, so a seek never reflows the board.
- **Stable looks.** Every varied look comes from the entity's seed, never from the cache. The
  viewer's own style is the one exception.
- **No catch-up animation** (INV-15). Effects play only as the playhead moves forward.
- **No scoreboard** (INV-19, amended †). No counts, rankings or XP, and size never encodes output.
  A planet may show its own share, because that measures a person against their own commitment.
  Milestones and the finale celebrate work and never compare it.
- **Ships help people, and fight only threats** (INV-08, amended †). Stations fire only at hive
  ships, and mine asteroids. Enemies are never human or mammal.
  There are no friendly casualties, and a defeated threat leaves ruin and research, never death
  ([13 §1, Combat safety](13-game-design.md#combat-safety)).
