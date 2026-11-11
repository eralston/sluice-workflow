# 13 — Game design

**Status:** built; current as of 2026-10-27 (through v1.3 Block B). (Superseded 2026-10-13: "draft,
2026-10-10, P2 design workshop".)

This doc describes the v1 game: what is on the board, how each piece changes, and the rules that
govern them, in the vocabulary of [12-glossary.md](12-glossary.md). It records decisions as they're
made. It becomes normative once it's signed off; until then, 02 and 06 govern the built app. Values
(colours, sizes, lengths, tiers) live in [15](15-reference.md); this doc keeps the design and the
reasons.

## 1. The core experience
*Applies to: Solar · packs: SDLC, Todo, CRM.*

**An episode is one region's round, played back.** It is one pod's sprint in one solar system,
about 45 s at 1×. You watch your crew mine opportunities, fight off threats, and turn their worlds
from harsh rock into living places. Everything in v1 serves that episode first.

### Design pillars

From the v1 charter (archived: [archive/10-v1-charter.md](archive/10-v1-charter.md)); still binding.

| Pillar | What it means |
|---|---|
| **Progress is conquest** | Opportunities are worlds to settle, challenges are threats to drive off, and finishing work changes the map for good |
| **A fleet, not a leaderboard** | Teamwork and personal accomplishment are celebrated; nobody is ranked or scored (INV-19). Achievements recognise what someone did, never how they compare (§8) |
| **Every sprint is an episode** | Playback has a beginning, rising action and a finale, at the "cozy campfire, not fireworks" pace |
| **Readable at a glance, for anyone** | AA or AAA contrast for vital text, predictable label budgets, touch-sized targets, nothing by hue alone, reduced motion loses nothing (INV-20) |
| **One game, many domains** | Rules and art are written in engine terms (12); SDLC, Todo and CRM are domain packs |
| **Painted space age** | Painted celestial bodies, crisp machines (06) |

**v1.1 rules (2026-10-13).** The user's walkthrough notes added seven standing rules. They hold for
every later version (the R-ids are cited throughout; v1.3's plan, [archive/23 §1](archive/23-v1.3.md#1-standing-rules), listed them too); the items v1.1 built from them are in the
archived [19](archive/19-v1.1.md).

| Rule | What it means |
|---|---|
| **R1.** **Holographic labels are the one visual language** | Every chart label in Solar is a holo plate, balanced by a hierarchy of contrast and saturation (19 §2); no new legacy navy plates. Every plate rests at T4 Sky; its tier is how loud it is when raised: pointed at, selected, followed, or named by playback (P-6) (27 B1) |
| **R2.** **Visibility is separate from navigation** | Showing or hiding an object never requires entering it |
| **R3.** **The outside matches the inside** | A thing's exterior (a preview, the map key, a count) never contradicts its interior |
| **R4.** **Counts first, detail when it's known** | Aggregate counts while detail loads, then the accurate model, by a fade or an arrival, never a reflow |
| **R5.** **Progressive disclosure, in place** | A label grows (title → title and subtitle → its rows) instead of opening a separate panel |
| **R6.** **One geometric vocabulary** | Rectangles and squares with clipped corners; shared border weights; no decorative border without state |
| **R7.** **On screen means active** | What's visible in playback reflects its relevance at the playhead |

**v1.2 rules (2026-10-14).** A live customer review added four more (v1.2 Block A).

| Rule | What it means |
|---|---|
| **R8.** **Every motion means something** | A ship travels to a target, interacts, finishes, then moves on; movement and interaction never blur into one |
| **R9.** **The drawn count is the true count** | What a view draws matches what it counts, and nothing is on the chart without a reason it can state |
| **R10.** **Identity by more than one cue** | Colour, silhouette and place each say what a thing is, so it reads when one cue is lost (with INV-20: hue never alone) |
| **R11.** **An object arrives before its label** | A plate appears once its body is drawn, never floating at an arrival point first |

The user's notes on the words and on playback (2026-10-15) added three more (22 §1, Block B).

| Rule | What it means |
|---|---|
| **R12.** **One vocabulary, two layers** | The ADO identity first, the metaphor beside it in lower contrast, the same on every surface; no switch between them |
| **R13.** **Playback explains itself** | Every emphasized interaction names its ADO cause, in the same words as History |
| **R14.** **Attention is budgeted** | About two emphasized objects at a time, each held long enough to read |

**Standing decisions (2026-10-10).** Factions are inspired by Star Trek, Star Wars and Macross,
never copied: original designs and names only. The renderer stays on Pixi v8 (2D WebGL, painted
2.5D). There is no browser target: macOS desktop ships, and tablet is designed for but not shipped
(every interaction works by touch, targets at least 44 pt, a frame budget on integrated GPUs, and the
renderer and `src/shared/` stay free of Node and Electron). Todo and CRM are fixture-only demos; only
SDLC reads a real service (ADO, read-only).

### Combat safety

Combat exists, and it is safe for work (02 INV-08 is the normative rule).
- **Enemies are never human or mammal:** insect-like hives and swarms, machine legions, faceless
  droid armadas.
- **No one we care about is hurt:** no friendly casualties, no pilots in peril, no visible death.
  Enemy fire menaces but is absorbed by shields and point defense.
- **Defeat is a dissolve, not a death:** debris, nebula and research, never gore or crewed wreckage.
- **Threats belong to the work, not to people.** A bug is never attributed to whoever wrote the
  code; captains defend, and nobody is blamed.

## 2. Visual hierarchy (decided 2026-10-10)
*Applies to: Solar. The v0 views keep their own chains (Sprints, Backlog).*

| Level | Engine | Game form | SDLC | Playback |
|---|---|---|---|---|
| 1 | Workspace | Galaxy | Project | No |
| 2 | Round | Sector: a map of the round's regions, each star previewing its region (below) | Sprint | **No** (too small to read; decided 2026-10-10) |
| 3 | Region | Solar system: **the bottom level** | Pod (Area Path) in that sprint | **Yes: the only playback level** |

- **The round previews each region as it opens** (19 P1, 2026-10-14; replaces v0's planet per Story
  and anomaly per Bug, which implied a story is a planet). Below each pod star, decorative and not
  selectable: one small **planet per seat** the region opens with (the region's own rule, `seatsOf`,
  and the same world as the homeworld inside), on the front of a ring round the star; a tight
  **asteroid cluster** on its left, one rock per objective; and **enemy marks** on its right, one per
  threat, every one drawn, in groups of five (22 A1; 05 §8 S-12). No stations or ships. Counts first (R4): while history is still
  loading (ADO's first look), today's assignees stand in, and the people history adds arrive together
  in free slots once the region's history is in, so nothing reflows (INV-14); past the ring's 8 slots,
  wider rings outside it take more. The star's plate reads its name over its counts in
  ADO's words (`12 User Stories · 4 Bugs · star`, T4 Sky, no path: 22 A3–A5, B1); the star's stage
  shows progress, so there's no done count (19 Q11; the inspector keeps it). Sizes: 15 §5, *Preview*.
- **There is no level below the solar system.** Objectives, threats and their steps are all read
  from the system view. The v0 close-up (the Task radar) leaves navigation.
- **We aren't rebuilding ADO's UI.** Lists, boards and swimlanes are out. The system is a place:
  planets on orbits, with work clustered around them.
- **The Backlog view (Feature as star) is parked** (decided 2026-10-10). The app opens in Solar;
  Sprints and Backlog are the v0 views, reached only by Settings → Theme's developer toggle or a
  `STAR_CHART_PARADIGM` pin (Q9, `settings/views.ts`); the toggle's choice is remembered (23 E3). Their code stays.

## 3. The solar system as a board
*Applies to: Solar · packs: SDLC, Todo, CRM. Sizes and gaps: [15 §5](15-reference.md#5-sizes-floors-and-layout).
The board's rules as built, one table: [05 §8.2](05-playback.md#82-the-static-board-at-a-playhead) (S-1 to S-12); this section keeps the design.*

```
                 · frontier belt (unassigned work drifts here) ·
        ○ asteroid                                   ✶ threat
     ○   ( PLANET A )   ○                      ✶  ( PLANET B )  ○
        ▲ captain A      ○        ⌂ STATION         ▲ captain B
                               (midpoint of A, B, C)
                    ○  ( PLANET C )  ✶
                         ▲ captain C        ⌂ station serving only C
                          ☀  the region's star at the centre
```

- **The star** is the region. It keeps v0's aggregate look (INV-05, the pods amendment).
- **Orbits come back; swimlanes go** (decided 2026-10-10; placement revised 2026-10-12). Each **seat**
  gets one planet round the star, with its own orbit.
  - A seat exists for each person assigned at least one objective or threat during the round.
  - **Even angles, one radius** (layout v4, 2026-10-12). The seats sit 2π / n apart round the star,
    starting at the top, in a stride coprime with n (near n/φ), so seats that joined one after another
    sit far apart. They all take one radius: the smallest at which every footprint (the planet, its
    low-orbit platforms and its pieces) clears the star by `starGap` and every other footprint by
    `seatGap` (`placeSeats`, `engine/solar/seats.ts`). A planet holds its own region of the screen:
    **area control**. (Superseded 2026-10-12: staggered radii, each seat at its own nearest clear
    radius.)
  - **An orbit is a short arc** through its planet, as wide as its footprint, not a full ellipse, so a
    line never runs through another seat's pieces.
  - The angles, radii and arcs are fixed over the loaded history, so a seek never reflows the board
    (INV-14).
  - **Sizes against labels** (2026-10-12). Every space object is drawn at `OBJECT_SCALE` times its
    first v1 size, while labels keep their pixel size, so the objects are readable beside them. A
    station's hull is as long as a planet's radius (layout v6, 2026-10-12). Values: 15 §5.
- **Objectives and threats cluster around their seat's planet**, like moons or a small field.
  - When an item is reassigned, it travels to the new planet.
  - A captain mostly stays in its planet's area, and flies out only where its person acted
    (INV-07).
- **A planet is a region** (decided 2026-10-12, replacing the 3 + 3 crowding rule; revised the same day).
  The star is small and far, and each planet looms large beside it. The seats form a **perfectly regular
  ring** round the star: even angles, one radius. The planet is lit by the star on its star-facing limb
  only, a waxing crescent of about a quarter of the disc, and the rest is a low-contrast dark circle.
  - **The mandala (22 Block D, 2026-10-16).** Everything near a planet has a predetermined slot, sized
    to its kind and padded by its size, so a system reads as one rational geometry.
  - **Pieces on the planet.** Stories (asteroids) on its left half, bugs (enemy ships) on its right,
    every one standalone, in whatever number there is. Each side's slots split its half-disc into
    equal areas, mirrored across the equator, filled from the planet's centre out. A busy planet draws
    all its pieces smaller, both sides alike.
  - **Finished pieces ring the planet as trophies.** When a piece reaches Accomplished it glides off
    the planet onto **one ring round it**, in the order the work closed: the first between the planet
    and the star, the rest either side of it, clustering toward the star, so the trophies point inward.
    A full ring starts another, turned half a slot. An asteroid becomes a mine wrapped in metallic
    structure, an enemy ship's hulk a research platform, both gently lit emblems of success. Nothing is
    built on the surface.
  - **Captains loiter on the far side.** A ring past the trophies holds the ships resting by the
    planet: the first to arrive on the line from the star through the planet, the rest beside it, each
    keeping its place while it stays. The planet's name sits under the planet, touching its bottom.
  - Every piece keeps its own look, rung, steps and hit area. **Its label is hover-only** (19 L7,
    2026-10-13, experimental; this replaces "none is hover-only"): with real data there are too many
    stories and bugs for a label each. At rest a seated piece speaks through its planet's expanded
    plate, both ways: pointing at the piece opens the planet's plate with the piece's row lit, as
    pointing at the row lights the piece, and a selected piece keeps its row marked there. A frontier
    piece has no planet, so pointed at it shows its own plate (title over `{type} · #{id} · {state}` (then the chart's name, quieter, 22 B3),
    T2). In playback a piece's own plate (its title) shows from its maneuver's act, once its cast has
    arrived, to a short linger after that maneuver's land or echo, then
    fades (15 §10); a seek clears it, and reduced motion keeps it. A piece's steps are listed in the
    inspector, not on the chart. Every piece is still in the object list (VC-2).
  - Where each stands is fixed over the loaded history: the angle, the arrival order and the piece's
    rung at the playhead set it, so a seek never reshuffles anything (INV-14). INV-19 holds: size never
    encodes output.
  - The density harness ([08](08-layout-solver.md)) tests the packing at each window size. A piece
    overlaying its planet (or a ship beside one) is the one overlap it allows.
- **The frontier belt** (decided 2026-10-10) is a neutral outer zone for unassigned objectives and
  threats. An item flies from it to a planet when someone takes it.
  - **Only when needed** (19 S2, 2026-10-13). The belt is drawn only while unassigned work, a Story
    or a Bug, sits in it at the playhead. It fades in as the first piece comes to it and out as the
    last leaves (a reassigned piece's flight, an arrival's entrance, a departure), following the
    pieces as drawn, not the beat; a seek snaps it (INV-15). Its place stays reserved over the
    loaded history, shown or not, so nothing reflows (INV-14).
  - **Never red.** It is always the orbits' cyan, dashed: chart furniture, apart from both the
    threats' Deadly Red and the objectives' Opportunity Blue. Danger is the enemy ships' own outline.
    (Superseded: the threat light, a red glow on its outer edge while any threat was open.)
- **Stations** (facilities) jump in when the region first needs them, on two rings, in the open (22
  C11, 2026-10-15: "much like how putting the planets in strict orbits helped, but to a less perfectly
  symmetrical degree"). In SDLC, a planet is served by a repo when one of the seat's items is linked to
  a PR into that repo, and a region's stations come only from PRs serving its own work (22 C12).
  - Both rings are regular (settled 2026-10-16): each at one fixed radius, its slots half-way between
    the planets, so the stations interlock with them, and a station's width of padding from
    everything. The first planet stands at the top, so the whole picture is symmetric.
  - Every station prefers the **inner ring**, between the star and the planets, as close to them as
    the padding allows. A station serving one planet takes the gap beside it first; one serving
    several, the gap nearest its work. The planets move out when the ring needs more room.
  - Only a single-planet station left over once the inner ring is full stands on the **outer ring**,
    smaller (70%), in the gaps just past the planets; the frontier belt lies beyond.
  - Every station starts off the map and jumps in at its first PR event in the region (05 §8 S-9, T-1).
    A station is the one object that does not hide in a region, so it stands out and has room for its
    oversized station styling.

## 4. Pieces and their lifecycles
*Applies to: Solar · packs: SDLC, Todo, CRM (the SDLC words are shown).*

| Role | Piece (theme asset) | SDLC | The rung is carried by | Its parts | When done |
|---|---|---|---|---|---|
| Seat | Planet: one of three world lines (`world`) | Assignee | Its own share, 0 to 1 (§4.1) | Its pieces sit on its half-discs (§3) | A lush, ocean or canyon world in a gold halo |
| Objective | Asteroid: metal, crystal or energy (`asteroid`) | User Story | Cut lines, gantry work light, its outline | Steps: plates strapped on its rim | A mine platform on the planet's trophy ring |
| Threat | Enemy ship: one of three swarms (`hive`) | Bug | Its fire and damage, its outline | Steps: weapon pods | Broken up; its hulk a research platform in low orbit |
| Facility | Station: a Trek, Wars or Mecha station (`dreadnought`) | Repository | Intensity, not a rung (its share of linked work) | Tender shuttles (attachments), point defense (guards) | Its second form, from the round's first merge (§4.4) |
| Agent | Captain ship: 9 hulls, 8 colourways (`captain`) | Person | No rung | — | — |

**Source:** `theme/starChart/index.ts` (`roleAsset`), `theme/starChart/assets/*.ts`, `chart/art/*` ·
**Update when:** a role's asset, its rung carrier, its parts or its resting place changes. Every
role's asset, layer and rank: [15 §4](15-reference.md#4-roles-kinds-and-assets).

Each row below is a **look**. Rungs follow [09](09-signal-ladder.md): one colour, ornament,
contrast and motion per rung. Where an object's own colour is fixed (a hostile red ship, a planet's
world line), **the rung is carried by its light**: rim, halo, cut lines, or its fire and damage.

**Stable looks** (decided 2026-10-10). Every seeded choice (a ship's faction, hull and colourway, a
station's faction and design, a planet's world line, an asteroid's material, a threat's swarm) comes
from a **stable hash of the entity's own ID within its tenant**. The same person, work item or repo
looks the same on every run and in every cache state, through purges and disconnect-reconnect. Seeds
never come from load order, local row IDs or anything else the cache decides; only a deliberate
art-version bump changes them (v0 already hashes this way: `artSeed`, `shipSeedFor`). Looks vary
across factions and types, so a system shows a mix. The one exception is the viewer's own style
(§7).

### 4.1 Seat planets: three world lines

A person's world. Its **world line** comes from their stable seed, like their ship. It
**transforms with the seat's own share** (decided 2026-10-10): the fraction of that person's own
objectives and threats in the round that are Accomplished.
- Every planet is the same size.
- No counts are shown.
- No planet is compared with another.

INV-19 is amended to allow this, because it measures a person against their own commitment.

| Own share | **Terran** (rocky → lush) | **Glacial** (frozen → rain world) | **Volcanic** (fire → riven) |
|---|---|---|---|
| 0 | Barren grey rock | Harsh white ice, storm-scoured | Molten, cracked with fire |
| ~¼ | First green in the lowlands | Ice sheets breaking; dark seas show | Crust cooling into black plates |
| ~½ | Terraforming front; clouds form | Thaw: broad oceans, heavy rain bands | Canyons opening; steam vents |
| ~¾ | Developed; clouds; city glints | Rain world: large oceans, green coasts | Riven canyons, first cliff lights |
| 1 | Lush, in a soft gold halo, city lights glimmering | Ocean world, gold halo, coastal lights | Canyon world, gold halo, cliff-dwelling settlements lit |

- **No surface structures.** Finished objectives and defeated threats become trophies on the ring round the
  planet (§3, the mandala), not megastructures or facilities on the ground; the planet itself changes only
  with its own share.
- **Mega-label.** It lists the seat's objectives and threats, one row each with its rung (up to
  `ROW_BUDGET` rows, then "+N"; 15 §6). Hovering a row lights that object in the scene, and pointing
  at the object opens the plate with its row lit (19 L7: the pieces' own labels are hover-only, §3).
- **Homeworld names (2026-10-12).** A planet is named from its person's first name in one of 16
  templates ("Wren's Haven", "Planet Kit", `theme/starChart/homeworlds.ts`). The full name picks the
  template, so the same person always gets the same name. Two people who share a first name never
  share a name: over the loaded roster, the later by full name moves to the next free template. Past
  the last template it takes a Roman numeral, II to X ("Planet Kit II"). The
  planet's label shows only that name. The person's name is on their ship and is the planet's
  subtitle in the inspector and object list, in both wordings.
- **A holographic label (2026-10-12).** The planet's name sits on a holographic plate outside the
  planet, away from the star, with one pointer line ending in a dot on the planet's rim (06 §9, Labels).
- **Only people who hold work get a planet.** A seat is someone who held an objective or threat in the
  region during the round (14 §4). Someone who only works steps or attachments, or only reviews, has
  no planet. Their ship still comes to help (§4.5).
- **A planet says why it's there (22 A2, 2026-10-14).** Planets are fixed over the loaded history
  (INV-14), so someone whose only piece left keeps theirs, empty. Its inspector reads the same spans the
  seat came from (`seatReason`):
  - what it holds now;
  - or what it held, until when, and what became of it: moved out (and where), handed to whom, or set
    aside;
  - or when its work arrives.

  Decided 2026-10-14: the planet stays, and it explains itself.
- **A vacated homeworld dims (23 C3, 2026-10-28).** At the playhead, a planet that holds nothing dims its
  surface and turns its settlement lights off (`piece.vacant`; 15 §10, *Vacated homeworld*). It dims when
  the last piece leaves and lights again when work returns; eased in play, snapped on a seek and under
  reduced motion. The planet set is unchanged (INV-14, R9). It is not a rung: no new colour or ornament,
  only a quieter planet (09's ladder is for work state, and a seat with no work has none). First light (v1.4 B4)
  plays once, on a seat's first arrival in the round (`aw=1` before it): its night-side lights sweep on from the
  terminator instead of the plain ease. It isn't a rung, and the look at rest is unchanged.

### 4.2 Objectives: asteroids

Each objective is an asteroid of one **material**, chosen by seed: **metal**, **crystal** or
**energy**. It drifts near its seat's planet.

| Rung | SDLC (Story) | Look |
|---|---|---|
| Ready, sketch | New | A radar wireframe: a sensor contact |
| Ready | Ready, Ready for Review | A rough, worn stone, with the material barely showing (dull veins, a dim glint, a faint core) |
| Underway | Active | **Laser-cut and carved** by the ships: clean facets, with cut lines glowing progress blue |
| Nearing | Resolved, Ready to Accept | **Gantry arches** are built on it: two arches rise from A-frame gantries planted on the rock and grow toward the crown as the step advances (about a third at Resolved, two thirds at Ready to Accept). A crane jib at each growing tip hoists the next section under violet work light, with gold creeping into the foot lights. Underway, the gantries stand folded on the rim. At Closed, the arches have become the mine's two crossing bands |
| Accomplished | Closed | It glides to its slot on the planet's **trophy ring** and becomes a compact **mine platform** in low orbit: the processed core wrapped in two crossing catwalk bands, with two girders and gold rivets, gently lit gold |
| Off | Removed | It drifts out as a ghost |

- **Steps are augmentations.** Each Task is a plate strapped along the rock's rim, like decking being
  laid (simplified 2026-10-12: girders and decking that wrap the rock, never rigs, cranes or vanes).
  - The strap's outline while New.
  - A plate going on under one blue work light while Active.
  - A fixed, still plate with a gold rivet once Closed.
- **Opportunity Blue outline (2026-10-12).** Every asteroid on the ladder wears a crisp rim in its
  role colour, 2 px on screen at every zoom, under a soft glow, so its outline reads even zoomed out.
  Enemy ships wear the same in Deadly Red (§4.3).
  - The rim sits outside the silhouette (`Aura`, `outside`), so it never tints the art.
  - The New sensor contact wears it too: the wireframe says "not seen yet", the outline says "a Story".
  - Once Closed, it turns **victory gold** (the ladder's Accomplished gold, `AURA.accomplished`).
  - A ghost (Off) has none.
  - So an outline has two colours only: the role's while open, gold when done.
- **Always over its planet (2026-10-12).** A piece that overlays its seat's planet draws over it
  wherever it sits on the disc (`AssetDef.over`). Before this fix, asteroids on a planet's upper half
  were painted behind it, and only their hardware showed.
- **Label.** Hover-only (§3, 19 L7): pointed at, it lights its row in its planet's plate (title,
  type, number and state; a frontier piece shows its own plate). Selected, its steps are in the
  inspector's **Steps** list (*Tasks* in ADO wording), in slot order, each by name with its raw
  state and its rung's mark; the chart no longer lists them (until v1.1 an objective's mega-label did).

### 4.3 Threats: enemy enemy ships

Bugs become literal bugs: insectoid ships in three **swarm** styles. They're inspired by the bug
races of fiction (Starship Troopers' arachnids, StarCraft's Zerg), and copy nothing. Their colours
come from the **hostile palette**: reds and their neighbours, with black, charcoal and other dark
accents. **No hero colourway may use these hues.**

| Rung | SDLC (Bug) | Look |
|---|---|---|
| Ready, sketch | New | A radar wireframe: a sensor contact |
| Ready | Ready, Ready for Review | **Emerges from hyperspace**: solid, dormant and menacing, with running lights |
| Underway | Active | Under attack and **bristling with weapons fire**. Its fire is steady |
| Nearing | Resolved, Ready to Accept | Heavily engaged: venting sparks, its fire frantic. Stations lay down covering fire |
| Accomplished | Closed | The captain's **strike run** breaks the ship apart; the remaining hulk, wrapped in metallic structure, glides to its slot on the trophy ring as a **research platform** in low orbit, harvesting its materials and studying the aliens |
| Off | Removed, Rejected | It warps out and retreats, then fades as a ghost |

- **Steps are weapon pods.** Each Task is one of the enemy's weapon pods (the target-lock marks were removed 2026-10-12: hard to read at chart scale).
  - Marked while New.
  - Under fire while Active.
  - Dark and disabled once Closed.
- **Role auras (2026-10-12).** Every enemy wears a soft *Deadly Red* aura (ADO's Bug colour, `AURA.threat`) and every asteroid a soft *Opportunity Blue* one (ADO's User Story colour, `AURA.objective`; values in 15 §2), hugging its own silhouette (`chart/art/aura.ts`). Hue says *what it is*, never how far along (INV-20). Proposal, not built: extend to other roles with their ADO type colours.
- **Safety** ([§1, Combat safety](#combat-safety)):
  - The enemies are insects and machines, never people or mammals.
  - Enemy fire menaces but never lands on a person. Shields and point defense absorb it.
  - There are no friendly casualties.
  - Defeat is debris and research, never death.
- **Label.** As an objective's (§4.2): hover-only, through its planet's plate; selected, its steps
  are in the inspector's **Steps** list.

### 4.4 Facilities: stations, with their satellites

| Faction | First form | Second form | The change, on the round's first merge |
|---|---|---|---|
| **Trek** | A bare spacedock: the core on a long reactor spire | A Deep Space Nine-style ring station with pylons | It grows: the habitat ring, bridges, docking ring, then the pylons (about 3.6 s) |
| **Wars** | A Mon Calamari-style cruiser | The same cruiser carrying a docking ring and two fins | The ring jumps in astern, clamps on, latches and powers up (about 4.4 s) |
| **Mecha** | An SDF-1-style carrier | A standing giant robot | It transforms (about 3 s); scrubbing back cuts to the ship |

**The station's hooks (23 C4, C5).** The art exposes two things to the theme, so nothing reaches into it:
- **Power:** `DreadnoughtView.setPower(0..1)`, 1 running and 0 dark. At 0 the hull and its satellites sit at
  0.7 of their light and every additive layer under the hull (drives, windows, bays, reactor, beacons,
  shield, seams) at 0.3 of that, on a smoothstep of the level, and the art's own idle drift (heave,
  sway, roll, the drives' swell, the window shimmer) slows to a stop with it. A station on standby is
  brought down by its adapter (`assets/standby.ts`), which only eases the level and passes it (15 §10,
  the *dim* row).
- **Emitter:** `anchor('emitter')`, the point where its finishing beam leaves, per form and heading, in px
  from the view's origin with the idle drift in it: the main cannon's muzzle (Mecha, both forms), the
  docking ring's dorsal emitter (Wars, second form; the point its charge climbs to), else the first
  battery (Trek, Wars first form). A beamed close (`stationFire.ts`) fires from it, and from the rim facing
  its target only for a view with none.

**Source:** `chart/art/trekStation.ts`, `warsStation.ts`, `mechaStation.ts` (each rig's `seconds`),
`chart/art/stationRig.ts`, `chart/art/dreadnoughts.ts` (`setPower`, `anchor`); the form from
`PieceState.merged` (03 §5d) · **Update when:** a faction's forms or its change are redrawn or retimed, or
the rule for when a station changes form moves, or a hook above changes.

One parent object supports the whole system. A station is **much larger than a captain's ship**
(its hull as long as a planet's radius, several ship lengths; at the screen floors, twice a ship:
15 §5): an unbeatable station that defends the fleet. It has three faction designs. (Superseded
2026-10-12, layout v6: "about 3–4× its length".)

| Faction | Inspired by (no copying) |
|---|---|
| **Trek** | A Deep Space Nine-style station: a ring around a core, with docking pylons. It starts as a **bare spacedock** and grows into this on the first merge (below) |
| **Wars** | A Mon Calamari-style cruiser: a long, rounded hull of stacked, swelling decks. On the first merge a **docking ring** locks on round it (below) |
| **Mecha** | An SDF-1-style fortress ship: a colossal carrier whose twin booms form a cannon. It has **two forms** (below) |

**Stations upgrade on the first merge** (decided 2026-10-12, art session): a visible sign that a
repo has started to ship. Every faction does it. A station is in its **first
form** until the first PR merges into it, and in its **second form** from then on (the rules below
are the same for both; a faction's pieces are its own, `stationRig.ts`).

**Every playback shows it** (decided 2026-10-13, so playback is repeatable and less confusing):
- **Playback starts with every station in its first form.** The merge that transforms a station is
  its **first merge in the round**, even if PRs merged into it before. A station's form at any
  instant counts only the round's merges so far (`PieceState.merged`, 03 §5d).
- **A scene opens in its final form.** A station with a merged PR by the round's end is in its
  second form when the scene loads, and the round's end matches it.
- **A station none of whose PRs merge in the round** keeps its second form all round when PRs merged
  into it before (there's nothing to play, and resetting it would only pop it back at the end).
- **A station that arrives with its first merge** (its first PR of the round opened and merged in
  one beat) jumps in in its first form, its tender launches, and then the merge transforms it. The
  jump-in and the opening go ahead of the merge (05 §8), and the station arrives as it was before
  the merge.
- **Nothing else plays at a transforming station.** A first merge has its station to itself: another
  moment that casts it in the same beat (a beamed close, say) waits for it, so nothing lands the
  station's second form before the transformation starts. The waiting moment's tell and gather may
  play in the merge's echo and disperse (05 §8.5 P-3): its act starts when the merge ends.
- The dev log records what became of each change of form (`station-form`) and which moment landed a
  station's look (`station-look`), redacted (03 §10).

**The Trek station grows.** It is a bare spacedock, the core alone (a saucer-topped stack on a long
reactor spire, after the old movie-era space station). On the first merge the habitat ring opens
out from the core on its spokes, the crossover bridges and the broad docking ring (with its weapon
sponsons) follow, and last the three pylon pairs unfold up and down and curl back in: the
Deep Space Nine look. About 3.6 s. The core is the same solid in both forms; every other piece fades
in as it grows out of the core. Its tenders and guards re-seat from the core to the rings.

**The Mecha station transforms.** It arrives as the streamlined
carrier and, when **the first PR merges into it**, stands up as a giant robot: the booms become
legs, the flank flight-deck carriers become arms, the bridge tower becomes the head, and the drive
blocks stand as back-pack spires. The form is derived from history, like everything else: a
station is a robot from the round's first merge onward (`PieceState.merged > 0`, stage `form=robot`), and a
scene built after that merge shows the robot at once. The change plays **once**, about 3 s, when a
live view sees the first merge arrive (the pieces slide and turn between their two places, each
swapping from its ship look to its robot look as it passes the midpoint, with a flash at the joint);
scrubbing back before the first merge cuts back to the ship, and reduced motion cuts. The robot has
the same footprint (about as tall as the ship is long), and its tenders and guards re-seat round it.
The art is `chart/art/mechaStation.ts`: eight rigid groups, one model of each, placed twice.

**The Wars station takes on a docking ring** (decided 2026-10-12, art session; it replaced the
Nebulon-B frigate). Its first form is a cruiser in the manner of the Mon Calamari ships: a
bullet-nosed hull of stacked decks, blister pods and long ridges along its flanks, a keel, and a
cluster of drives at its stern. Its second form is the same cruiser, the same size, carrying a great
ring round its after hull on a collar and spokes, with drive nacelles and battery pods, a short
dorsal fin with an emitter at its tip, and a long ventral fin with a hangar at its foot. The cruiser
never moves; the ring comes to it. On the first merge (about 4.4 s, from the merge's gather, `chart/art/warsStation.ts`):
- **Jump in.** The ring's two halves, the dorsal and then the ventral, drop out of hyperspace astern
  on bright streaks, and hold open round the stern.
- **Align and clamp.** They glide level with their seats and clamp on, accelerating into the clamp;
  the hull heaves under it. Its windows and drives fade as power transfers.
- **Latch.** The seams and the collar flare at-rest hero blue (the colour of every transformation's joints).
- **Power-up.** A wave of light runs from the seams round the ring and up and down both fins, and as
  a band fore and aft along the hull, relighting its windows as it passes; the drives light last.

In its second form the seams keep a faint breath (about 12 s), brighter with intensity. Its covering
fire rolls along the ring's battery pods (a salvo of three, a beat apart, still sparse). Before a
beamed strike its `charge` act runs power up both sides of the ring to the dorsal emitter, which
holds lit while the station fires (the beam still leaves the hull's rim toward its target: a beam
from the emitter needs an anchor the art gives the theme, 23 C5). Tenders dock at the ventral
hangar, and Haul tractors in through it. The halves are split per heading into what lies in front of
the hull and what lies behind it, so the ring passes behind the hull while it docks.

**A station is a repo, and only a repo** (decided 2026-10-10). Its only scene objects are its
PRs and pipelines, drawn as **satellites** around it: the first **compound** (§5). Containers
(Features, Epics) never appear as banners or objects.

A station's faction and design come from its repo's stable seed, unless the viewer summoned it
(§7).

Its life in an episode:
- **Arrival.** It jumps into the system near the planets it serves (§3). The captain whose PR first
  brings it into the round **summons** it.
- **Intake.** It receives mining resources from active objectives, and tractors some supplies from
  the asteroids into itself.
- **Covering fire.** It lays down covering fire for the captains against threats. At a threat's
  defeat, it joins the strike alongside the captains who reviewed the fix.
- **Rising intensity.** It grows more intense as the work it supports nears completion: the
  station's own share of linked items.
- **Pace: ponderous, a campfire, never fireworks.** Station fire is slow, rhythmic and sparse.
- **Standby** (19 M1). Two quiet days with no PR open, it powers down until its next PR (*Idle life*,
  below).

**Satellites** (decided 2026-10-10). Small, crisp 3D pieces that hold fixed slots around the
station, like metadata tags around a molecule.
- **Attachments (PRs)** are **tender shuttles**, one per open PR, with a "+N" mark beyond a cap.
  PRs no longer get equal billing with work items.
- **Guards (pipelines)** are **point-defense** satellites: idle, tracking, firing. For now this is
  visual only, and stay so (Q7, decided 2026-10-27): they are idle art. As built, a station has 0 to 3
  guards, a fixed count from its key (`guardCount`), not from any pipeline. Pipeline runs are read (04 §3
  builds), but they make **no event and no flare**: the station's plate shows the repository's last run as a
  quiet line, `Last run: passed · 2 h ago`, with a neutral dot (15 §6 `run-line`).
- **Each change animates its satellite.** When a PR changes state, its
  satellite **charges up**, then **operates** (§6, *Satellite cycle*). A merged PR's shuttle
  docks, and a bay light glows gold briefly.

**Mega-label** (decided 2026-10-10; rows amended 2026-10-13, 19 L6 and Q6).
- Its expanded plate lists the station's **PRs** (attachments) opened in the round so far, one row
  each: the PR's title, `PR · #n · status`, and its rung. It opens when the hull or its
  plate is pointed at, like every plate.
- Each row has a **subtitle**: the work the PR serves (`→ User Story #20121`; several, comma
  separated). A PR has no object of its own on the chart, so hovering its row lights the pieces it
  serves (each ringed), and a press selects the first of them.
- Containers (Features) are not drawn here, or anywhere in the Solar view. Since v1.3 (B3) the region's
  **star plate** names them as a quiet row of text (15 §6 `feature-row`); revisit if Epics or containers get a form. Epics have no form and none is planned (23 §5). Opening at the source stays
  read-only (INV-21).

### 4.5 Agents: captain ships

- **Three hulls per faction**, nine in all:

  | Faction | Hulls |
  |---|---|
  | Trek | Saucer explorer, compact escort, science vessel |
  | Wars | Starfighter, light freighter, corvette |
  | Mecha | Transforming fighter, armoured heavy, command cruiser |

- **Colours come only from colourways.** Eight colourways (no hostile hues, no ladder hues; 15 §2,
  *Fleet colourways*) give 72 distinct ships. (Corrected 2026-10-13 against the build: the design asked for at least 6.)
- A person's faction, hull and colourway come from their stable seed (§4). **The viewer may pick
  their own faction and style** in Settings (§7); every other ship keeps its seed.
- Every hull keeps the same footprint (INV-19), and a station dwarfs any of them.
- **Guests come and go (2026-10-12; revised 22 C8).** Someone with no seat in the region has a ship
  there only while they're needed: they climbed a piece, added or moved a step, opened an
  attachment, or landed or approved one.
  - **Arriving:** they jump in out of hyperspace right where their part happens (a short stretched
    streak and a flash), finish the jump, then act. They never warp in somewhere else and fly over.
  - **Between parts:** needed again within 10 s of playback at 1×, they wait off the planet of the work
    they helped (a step's piece; an attachment's work, never its station).
  - **Leaving:** otherwise they jump out as the next beat plays, accelerating ahead and stretching into
    a streak, and can come back later.

  Their comings and goings are planned over the schedule, so a seek shows a guest exactly where
  playing would (05 §8 K-13, K-14). Several ships at one object take turns round it, so their hits
  never overlap. Captains with a planet never leave (K-12).

### Idle life (2026-10-12, art session)

A scene at rest, without playback, should feel like a living ecosystem at work: a gentle aquarium,
not a battle; a campfire still. Idle motion is fireflies and breathing glow, never flashing, and the
bigger the thing, the slower it moves. None of it is a signal-ladder motion (09 §1: not the 2.4 s or
1.6 s beat, never gold), so an idle pulse never reads as a change of state. Reduced motion stills all
of it, and it's deterministic per seed. When it plays and what gates it: [05 §8.4](05-playback.md#84-what-plays-by-priority)
M-18 to M-20 (idle work waits for calm, P-9).

| Object | At rest |
|---|---|
| **Region star** | Its corona swells a little wider and brighter, then settles, over 20 s: the slowest heartbeat in the scene |
| **Planet** | Turns once in 96 s (was 48 s) |
| **Station** | Heaves, sways and rolls on 17 s, 31 s and 23 s cycles; its drives swell and settle over 11 s; its tenders patrol round it, one turn in 150 s (§5). **On standby** (below): still, its drives and lights low |
| **Asteroid** | Its surface turns about a diagonal axis, clockwise or not by seed, once in 70 s; the outline, cuts and Task modules stay put. **Underway:** now and then a tiny white welding spark on a cut line, as if crews are at work |
| **Enemy ship** | Legs, mandibles and antennae flex a few degrees on their own slow cycles (4.6 to 7.8 s), reaching and settling; its eyes brighten and dim over 9.5 s, and about every 17 s, for a few seconds, turn toward the nearest captain. Its weapon bolts keep a minimum on-screen size |
| **Captain ship** | Engines glow low on a 7 s pulse at rest, and burn in step with how fast the ship is moving. Beside a piece that's under way (where its captain last worked, never by assignment alone: INV-07), every 9 to 22 s: a faint tractor beam that breathes over an asteroid, or a short volley of two or three small bolts at a enemy ship |

**Activity-weighted calm.** Each piece carries how lately anyone worked it (`ViewNode.activity`: 1
just now, halving every day of history since it or one of its Tasks changed). Where people worked
lately the idle life is a little busier (more welding sparks, captains' idle work more often); quiet
corners stay still. It shows where work is happening without a single number, and it never measures a
person (INV-19).

**A station on standby** (19 M1; experimental until HG-M1): with nothing open and two quiet days, its
drives and lights dim, its drift stops and its plate drops to T3; its next PR wakes it. It keeps its
place, size and lists (INV-14, INV-19). The rules and timings: [05 §8.7](05-playback.md#87-stations) T-4.

### Entrances and exits (2026-10-13, art session)

Every object has a moment of arrival and one of departure. A standalone arrival plays its full
lifecycle: a **tell** that draws the eye to where it will appear, the **act**, and a **cooldown** (a
settle ring, then stillness). When many arrive together (the episode's opening, or a crowd of
`CROWD_MIN` or more in one beat) each takes a **quiet** variant: no tell or settle ring, no flash, the
entrances started at most `OPENING_STEP_MS` apart so about six are in motion at once (values: 15 §10).

| Object | Arrives | Departs |
|---|---|---|
| **Region star** | The opening: one slow breath | Never |
| **Planet** | Simply there (the opening leaves the planets be: a fade-up was a touch too much) | Never |
| **Asteroid** | A gentle 1 s spiral into its slot round its planet. New: as its radar outline; Ready: as an outline that resolves into rock as it settles; under way or beyond: fully visible | Removed: a drifting ghost. Moved out: along its orbit and away |
| **Enemy ship** | Through a rift, about a second: it tears open, the ship slides out bow first (what's still beyond is hidden), it snaps shut (a sketch on the radar simply shows) | Removed: warps out. Closed: breaks up, then a platform. **Moved out:** backs into a closing rift, about a second |
| **Station** | Its summoner's pass and call, then the fold (Station jump-in). The opening: its tenders muster out to their patrol | Never. **Quiet two days with nothing open, it goes on standby** (19 M1, *Idle life*), and wakes on its next PR |
| **Captain ship** | Out of warp: in from behind along its heading, stretched, with a streak (0.6 s) | Never |
| **Tender** | Launches from the bay (Shuttle tender) | Docks on its merge (Power link) |

**The opening.** When an episode plays from its start the system wakes from its star outward: the star
breathes, then everything already there makes its quiet entrance, seat by seat, the frontier last. The
rules: [05 §8.4](05-playback.md#84-what-plays-by-priority) M-17.

## 5. Compounds: a parent told in modular pieces (decided 2026-10-10)
*Applies to: Solar.*

| Part | In v1 |
|---|---|
| Parent | A station (facility): the only compound in v1 |
| Children | Tender shuttles, one per open attachment (PR); point defense, the guards (pipelines; idle art only, 0 to 3 per station from its key; the plate's run line says the last result, 04 §3) |
| Slots | Fixed angle and distance, assigned over the loaded history in time order, first-fit at open (INV-14; a PR waiting past the cap is promoted into the first slot that frees): attachments on the front arc, guards on the back |
| Motion | Tenders patrol round the hull together; guards stay on their mounts; children animate only their own events |
| State | Each child its own rung (INV-05); the parent's intensity is its share of linked work |
| Cap | `compoundCap` open attachments are drawn, then a "+N" mark for the rest; "+N" never shows while a slot is free |

**Source:** `engine/solar/compound.ts` (`compoundSlots`, `guardCount`), `GEOMETRY` in
`engine/solar/version.ts` (15 §5), `chart/art/dreadnoughts.ts` (the patrol) · **Update when:** a
child kind, the slot rule, the cap or the patrol changes.

A **compound** is a general way to draw a complex object: a parent at the centre, with its children
bound to it in fixed slots, like atoms in a molecule. Each child is a modular piece with its own
look, rung and animations, so the compound tells its story in parts, and one glance reads its
whole state. The engine owns the pattern; the theme decides each child's form.

- **Bound, not free.** Each child holds a station-keeping slot at a fixed angle and distance. It may
  bob or turn in place, but it never wanders or swaps places, so each slot reads like a tag. Slots
  are assigned over the loaded history (INV-14).
  - **A station's tenders patrol (2026-10-12, art session).** They carry their slots slowly round the
    hull on the slots' own ellipse, all together (one turn in 150 s), so none ever passes another and
    each still reads as its own tag; a little smaller and dimmer on the far side. Their ponderous pace
    shows the station's size. Guards stay on their hull mounts. Tenders are a count of open PRs, not a
    place of work: **captains beam the station itself, never a tender** (Satellite
    cycle, Power link, Captain jump).
  - **The hull lives (2026-10-12).** A station heaves (about 1% of its length over 17 s), sways and
    rolls a third of a degree, each on its own slow period: a lumbering hulk, not a prop. Identity
    motion, so none in reduced motion.
- **3D look and feel.** Children are crisp, lit machines with depth and one shared light direction,
  in the painted 2.5D of D2 (celestial bodies are painted; machines are crisp).
- **Each child climbs the ladder on its own state** (INV-05). Children never move the parent's
  rung; the parent's intensity comes from its own aggregate (a station's share of linked items).
- **Children animate only their own events.** Charge up, operate, settle (§6). Only events animate
  (INV-02), and nothing plays catch-up (INV-15).
- **A cap per kind**, with a "+N" mark for the rest, so a compound keeps a fixed footprint.
- **A mega-label** lists what the compound stands for (§4.4).
- **Stations are the only compound in v1.** The pattern is written to be reused. An asteroid's
  augmentations and a threat's weapon pods are close cousins, and a later pack or theme may add
  more. (Superseded 2026-10-12: the target locks, removed from the enemy ships, §4.3.)

## 6. Interactions: who does what to whom (as built, 2026-10-13)
*What triggers each, its priority, how a beat is coordinated, and the gaps: [05 §8.4–§8.5](05-playback.md#84-what-plays-by-priority).
This section keeps the grammar and the looks.*
*Applies to: Solar.*

Each maneuver is one engine rule (`engine/pace.ts`) and its choreography (`theme/starChart/maneuvers/`).
The beams are in `theme/starChart/commands.ts` and `chart/fx/effects.ts`, and their colours in
`chart/art/energy.ts` (06 §2). Values live in 15: each rule's length, tier and protection in
[15 §7](15-reference.md#7-maneuvers), each command's tier, weight and reduced form in
[15 §8](15-reference.md#8-effects), the colours in [15 §2](15-reference.md#2-palette). Timings here
are at 1×. A **protected** moment holds its cast until it ends (12 §5). Captains aim their beams at a station's hull, never at its tenders (§5). Beams and sparks are
special effects and stay quick; idle motion is slow (§4).

### 6.1 The grammar

Ships help people and **fight only threats** (§9). A friendly ship gives friendly work (an
asteroid, a station, a teammate) a **tractor beam** (or its cutting version), a **summons** or an
**energy transfer**; only an enemy takes **weapons fire**, and the enemy's own fire never lands. All
hero energy is one blue (06 §2): weapons in hero blue, what's given in the softer given blue.

| Between | Kind | For | Look | Envelope: warm-up · hold · cooldown | Colour |
|---|---|---|---|---|---|
| Friendly → work | **Tractor beam** | Working an object: mining an asteroid, hauling from it, working a station | A soft two-layer cone from the ship (5 px) widening to wrap the object (1.05 r). Three bands drift out along it, a glow ring wraps the object, and five motes drift home to the ship | Fades in 0.35 s · holds for the act · fades out over the last 0.45 s | Given blue (`HERO_SOFT`, `TRACTOR`) |
| Friendly → asteroid | **Cutting beam** (`cutter`) | Mining: a captain cutting an asteroid's facets (Carve) | The tractor focused to a point on the rock's face toward the ship, sweeping slowly to and fro across it (±0.35 rad; ±0.55 until 22 A10). Three layers (7, 2.6, 1.1 px), a hot spot where it meets the rock, a glowing kerf cooling behind the cut point for 0.5 s, and seven sparks thrown off the surface. No muzzle flare | Fades in 0.25 s · cuts for the act · fades out over the last 0.35 s | Given blue, brightened toward pale blue; sparks in the core blue |
| Friendly → asteroid | **Mining beam** (`mine`, a station's) | A station's finishing beam at an asteroid (Landing *beamed*, Power link): the phaser's dramatic weight, as mining; at half weight from a captain with no charge, the progress beam (27 E3) | The phaser's four layers (16, 8, 3.6, 1.6 px), pulsing ±22%, out of a muzzle flare, with a head as it reaches. Where it bites: a molten bloom (2.6 rock radii), a hot spot sweeping the face toward the station, a thick kerf, fourteen sparks and six tumbling flecks of rock. Round it all, a tractor sheath wraps the rock and five chunks of ore ride it home | **Charge** first (0.6–0.7 s, hero blue). Reaches in 0.22 s · holds about 2 s · lets go in 0.35 s | Hero blue core; given-blue sheath; grey ore |
| Friendly → work, at rest | **Idle tractor** | A captain at rest by an asteroid under way, off its planet (§4, Idle life; 22 A9), only while parked and still | The tractor's ghost: a faint 5 px glow, a fine line, a soft disc on the object | 3.6 s, swelling in and out (sin²); every 9–22 s | Given blue |
| Friendly → place | **Broadcast ping** (retired, 27 E1) | Summoning: a captain calling in a station | Three beacon pulses from the summoner, each expanding from 0.8 to 5 ship radii, then a bearing spark to the spot it calls | Pulses 260 ms apart, 0.9 s each; spark at +0.3 s | Hero blue (`HERO`) |
| Friendly → friendly | **Energy transfer** | Helping a person: a reviewer powering an author | A soft ribbon and a fine bright line, eight motes weaving along it to the receiver, three shimmer rings round the receiver. No muzzle flare | Head reaches in 0.3 s · holds · tail sweeps in over 0.4 s | Given blue, brightened toward pale blue |
| Friendly → enemy | **Bolt** (a captain's phaser) | A captain's fire; sent as a **burst**: n bolts `gapMs` apart | The station phaser at 0.42 width: a glow, a body, a pale line and a core, two after-images, a muzzle flare, four sparks off the hit | Reaches in 0.07 s · holds (0.25–0.3 s) · lets go in 0.1 s. Pulses ±25% as it holds | Hero blue (`HERO`), core `HERO_CORE` |
| Friendly → enemy | **Phaser** (a station's) | A station's finishing beam at a enemy ship (and its strand of a merge's split beam); at half weight from a captain with no charge, the progress beam (27 E3) | Full width: four layers (14, 7, 3.2, 1.4 px), five after-images, a muzzle flare that halves after firing, a pulsing hit glow, seven sparks | **Charge** first (0.6–0.7 s: three rings drawn in, ten motes gathering, the core swelling, then a flash on release; the hull's own charge act). Reaches in 0.22 s · holds about 2 s · lets go in 0.3 s | Hero blue |
| Enemy → friendly | **Enemy bolt and shield** | A enemy ship's return fire | A bolt the size of a captain's that **stops 1.4 ship radii short**; a shield ring flashes where it breaks. It never lands on a ship (§4.3) | Bolt 0.32 s; shield ring 120 ms later, 0.35 s | Danger Red (`DANGER`), core `DANGER_CORE`; shield at-rest blue (`HERO_GLOW`) |

The signals around them aren't interactions between objects: rings (tells, locks and settles), flares
(payoffs), sparks (streaks, sensor pings, supply motes) and inked routes. They take the ladder's colours
(09), the nav cyan (`CYAN`), or hero blue round a summons.

**How ships move** (the rules: [05 §8.6](05-playback.md#86-captains), K-1 to K-10; their pacing: 05 §8.5
P-5 to P-7). In short: a captain does one thing at a time and every motion means something (R8):
travel to the work's side of its planet, park outside its face, work, stay named a held moment, then
fly home; facing follows the flight; at rest, off the planet by their last work, or by their planet's
name. The looks of each flight are in §6.2.

### 6.2 Maneuvers

Phases: **tell → gather → act → land → echo → disperse** (a maneuver uses some of them). *Who → whom:
what*, in order. "—" means the phase is silent.

Each rule's length at 1×, tier, whether it's protected, and its variants (`beamed`, `first`) are one
row of [15 §7](15-reference.md#7-maneuvers); the phase timings below are the telling, and the code
(`engine/pace.ts`) wins where they differ.

| Maneuver · rule | Triggered by | Sequence | Movement |
|---|---|---|---|
| **Sensor contact** · `piece.appear` | A new objective, or a threat as a sketch (a Story or Bug created) | **Tell:** a cyan contact ring tightens on the spot (1.8 → 0.6 r, 0.4 s). **Act:** the piece's entrance (an asteroid spirals 1 s round its planet as a contact; a sketched threat simply shows); two cyan sweeps (0.3 → 1.8 r, 0.9 s, the second 350 ms later and fainter); its planet → piece: a cyan sensor spark (0.7 s). **Echo:** a grey settle ring. In a crowd: the quiet entrance only | The asteroid's spiral; no ships |
| **Hyperspace emergence** · `threat.emerge` | A threat arrives solid, or its sketch firms up (a Bug made Ready) | **Tell:** space pinches in (a hostile-red ring, 2.4 → 0.4 r, 0.25 s). **Act:** the rift (the art's, about 1 s): it tears open with a red flare at 60 ms, the enemy ship slides out bow first, and the rift snaps shut with a paler red pulse at 820 ms. **Echo:** a grey settle ring. In a crowd: the rift only | The enemy ship slides out of the rift; no other ships |
| **Carve** · `objective.underway` | An objective reaches Underway (Story Active) | **Tell:** —. **Act (1.2 s):** the carved look starts; captain → asteroid: a **cutting beam** for the whole act. **Echo:** a progress-blue flare (`PROGRESS`) as the carved look lands | Captain sorties: out 0.5 s, holds 1.2 s, home 1.0 s |
| **Rig up** (with **Haul**) · `objective.nearing` | An objective reaches Nearing (Story Resolved) | **Tell:** —. **Act (1.1 s):** the gantry arches build (§4.2); captain → asteroid: a tractor beam; a violet ring closes on it (1.5 → 1.05 r) over the act. *Haul:* each station its work went to opens its bay (its own intake beam and crates, drawn by the art); station → asteroid: a tractor beam, with three supply motes riding back to the station (from 0.3 s, every 275 ms). **Echo:** a violet flare with gold sparks | Captain sorties: out 0.6 s, holds 1.1 s, home 1.0 s. Stations stay put |
| **Landing** · `objective.accomplish` | An objective reaches Accomplished (Story Closed) | **Tell:** a gold ring tightens (0.3 s). **Act (0.8 s):** captain → asteroid: a tractor beam; near its end, **stardust** swirls up round the asteroid, densest as the land starts (22 C3). *Beamed* (its merged work went to stations; act 2.6 s): each station charges (0.6 s) and fires its **mining beam** for the rest of the act; a hero-blue lock ring closes on the asteroid during the charge; four gold pulses run out from the rock as the scaffolding builds (from 35% of the act, every 15%). **Land (1.2 s, the turn and the glide):** under the stardust it swaps to its platform form, then glides to its trophy slot, a gold streak following. **Echo:** the **blossom**: the grand gold flare where it settled (one at a time) and a gold ring, the planet's new tally landing with it. *Arc* (a merge's beam is the finishing blow, 22 C4): land, echo and disperse only, from the beam's impact | Captain sorties: out 0.4 s, holds through its turn (05 §8 P-7: whole 1.5 s past the land, then the fold), home 1.1 s. In an arc, no sortie: the holder is in the merge's formation, named *Closed it* |
| **Engage** · `threat.engage` | A threat reaches Underway or Nearing (Bug Active, Resolved) | **Gather:** a lock ring in the rung's colour (blue or violet) closes on the enemy ship (1.8 → 1.25 r) through gather and act. **Act (1.3 s):** captain → enemy ship: a burst of four hero bolts (from 150 ms, 260 ms apart); enemy ship → captain: one Danger Red bolt at 585 ms that stops on the shield, which flashes; each station its fix goes to → enemy ship: two slower bolts (0.75 width, held 0.5 s, at 0.3 and 0.95 s). **Echo:** a ring in the rung's colour | Captain sorties to a standoff: out 0.5 s, holds 1.3 s, home 0.9 s. Stations stay put |
| **Strike run** · `threat.accomplish` | A threat reaches Accomplished (Bug Closed) | **Act (1.2 s):** the enemy ship starts to break up; captain → enemy ship: a burst of six hero bolts (0.25 s each, from 100 ms, 170 ms apart); each reviewer of the fix → captain: an **energy transfer** for the whole act; each station → enemy ship: one slow bolt at 0.36 s. *Beamed* (act 2.6 s): each station charges (0.6 s) and fires its **phaser** instead, with a hero-blue lock ring during the charge, and the enemy ship blows apart under the beam (at 62% of the act). **Land (1.2 s, the turn and the glide):** a culminating explosion in Explosion orange hides the swap to its caged hulk, which glides to orbit. **Echo:** the **blossom**: the grand gold flare where it settled, and a grey ring. *Arc* (22 C4): it breaks up at the merge's impact, then the explosion, the glide and the blossom | Captain and reviewers sortie as a pass, each 120 ms behind the last: out 0.7 s, hold through their turn (05 §8 P-7: whole 1.5 s past the land, then the fold), home 1.3 s |
| **Warp out** · `piece.off` | A piece goes Off (Removed, Rejected, set aside) | **Tell:** a grey ring tightens (0.3 s). **Act (0.9 s):** a threat warps out: a grey streak to a point 5 r away on a seeded heading, and a collapsing grey ring; an objective fades to a drifting ghost inside an expanding grey ring. **Disperse:** a faint grey ring | The threat's retreat; no ships |
| **Reassign** · `piece.reseat` | A piece moves between seats, or to or from the frontier (assignee changed) | **Tell and gather:** the piece holds in place while a cyan route inks from its old slot to its new one; for the frontier belt it still counts where it was (`ManeuverDef.freezes`, 19 S2). **Act (1.4 s):** it flies the arc, and the belt fades out if this was its last piece, or in if it's the first. **Land:** a cyan arrival ring. **The hand-off (22 C7):** from the gather, the new holder's captain flies to their own planet to meet it, arriving as it lands, and holds named *Takes it* | The piece flies the arc (lifted 20% of the distance) with a wake, keeping its facing. One ship, the new holder's; none when unassigned |
| **Station jump-in** · `facility.enter` | The first attachment into a facility in the round (a repo's first PR here) | **Gather (0.715 s):** the summoner flies through the spot (the **broadcast ping**, its beacon pulses and bearing, is retired, 27 E1), and a hero-blue ring closes on the arrival point at the end. **Act (1.2 s):** as the summoner passes it gives one **call blip**, an at-rest-blue ring at the ship, and at that instant space folds and the station slides out (the art's jump), with a flare and an expanding ring in the same at-rest blue (R8, R10). **Land:** an at-rest-blue ring (the planets' cyan rings are retired, 27 E1) | The summoner (the PR's author) flies 0.7 s through a spot 1.9 station radii out on its own side and, without stopping, glides on to its rest over 1.8 s (`NOTE_MIN_MS`), named from its call (27 F2). With no ship here, it jumps in there as a guest, calls, and jumps out. Under reduced motion it doesn't fly: the call and the arrival play where it is |
| **Shuttle tender** · `attachment.open` | An attachment opens (PR opened); after the station's jump-in when both play | **Tell:** a progress-blue ring spreads on the station. **Act (1.0 s):** a tender launches from the bay to join the patrol (the author → station tractor beam is retired, 27 E1). **Land:** a progress-blue ring | **None:** the author is named by the cast label |
| **Satellite cycle** · `attachment.settle` | An attachment settles any way but merged (PR abandoned) | **Gather:** a ring in the new rung's colour closes on the station. **Act (0.9 s):** the station operates; author → station: a tractor beam; each approver (and whoever else settled it) → author: an **energy transfer**, 90 ms apart, or → the station when the author has no ship here. **Land:** the station settles with a ring in that colour. **Echo:** a smaller one | **None:** each ship beams from where it is. The author is the agent, as in a merge |
| **Power link** · `attachment.merge` | An attachment merges (PR completed); it goes ahead of the close of the same work | **Tell:** a gold ring on the station. **Gather (0.9 s):** the formation forms. **Act (1.6 s; 2.3 s on a first merge):** each approver → author: an **energy transfer** (90 ms apart), held to the end of the echo; a ring of at-rest blue tightens on the author as it charges (0.8 s); then author → station: a tractor beam, also held to the end; the tender docks (the merge itself). On a *first* merge the transformation starts with the gather (4.4 s), and the station fires as it ends. **Land (0.5 s):** a gold ring as the bay takes the tender. **Echo (3.0 s):** the station charges (0.7 s), then fires one split beam at the work the attachment served: a **phaser** at a enemy ship, a **mining beam** at an asteroid (a Task stands for its parent). A hit flare in the beam's blue lands at 1.3 s (`ARC_IMPACT_MS`): a strong hit, never a finish (INV-06), except in an arc (22 C4): when the work it strikes closes in the same beat, the impact is the finishing blow and that close plays from it (its turn, glide and blossom), its holder in the formation. With no work in the scene: an at-rest-blue ring. **Disperse:** a gold ring. **A volley (27 E6, 05 M-31):** merges into one station close in time play as one Power link: the lead (the author with the most merges in it) takes the author's spot, every other member's author and approvers fly as support with the union of their energy, every member's tender docks together, and the echo lengthens so the causes are named in **turns**, one per member: its work's plates with its note, then its people not yet named, at most four labels at once | The formation is one line through the station, so it stays in view (22 C11, 2026-10-16): horizontal when the station is near the top or bottom of the circle, vertical on the sides, toward the view's middle unless that would cover the station's or the work's plate; it never leaves the board (the frontier belt's rectangle): failing that end, the other end, then the other axis, then the spots are held inside it (27 D2); and clear of the beam: if the line would put a ship within a corridor round a strand from the station to the work, the nearest on-board line (turned in 15 degree steps) that keeps clear takes its place; with none, it keeps its place and the beam fades as it passes the ships (27 D3). The author flies 0.9 s to the spot beside the station; the approvers carry on along the line beyond, a little staggered off it, 180 ms and then 140 ms apart. All face the station and hold to the end of the echo, then fly home in 0.9 s. Guests jump in and out instead. Their named plates stand beside each ship, away from the line, when it runs closer to vertical, and above or below it when closer to horizontal, never over each other or another's ship (27 D1) |
| **Homeworld complete** · `seat.complete` | The close that leaves every piece a seat holds here Accomplished (an assignee's last Story or Bug in the sprint closes, 2026-10-13). Not a ranking: it celebrates their own work (INV-19) | Plays after that close (it shares its subject). **Tell:** a gold ring tightens on the world. **Gather (0.7 s):** a gold spark runs from the new platform to its world. **Act (1.0 s):** three gold rings gather in to the world, quicker each time, and a soft gold flare. **Land (1.1 s):** the world's finished look lands (the moment owns the seat's look, `ManeuverDef.owns`), with the grand gold flare and its halo blooming out in two slow rings. **Echo (0.9 s):** five city lights glint along its lit edge, one after another; a pale gold settle ring | Its person's ship sorties to beside the world and holds through the land |
| **All clear** · `region.clear` | The close of the last open threat in a region (its last Bug, 2026-10-13) | Plays after that strike run. **Tell:** the last enemy signal dies away on the wreck (a red ring collapsing). **Act (1.6 s):** a calm all-clear ring in hero blue sweeps from the star out past the belt, and each planet catches it in a soft ring as it passes. **Echo (1.0 s):** the star breathes, warm; a pale gold ring settles on the wreck. (19 S2: the act no longer starts by lifting the red threat light off the belt; the threat light retired) | None |
| **Captain jump** · `agent.light` | Any other change a person made that nothing above plays | **Act (0.8 s):** captain → the work (its station, for work on a PR): a tractor beam; at a **enemy ship**, a burst of three bolts instead (220 ms apart). At higher activity, the other person in the change lends a beam (or a burst) too, 110 ms later | Captain sorties: out 0.4 s, holds 0.8 s, home 0.6 s |
| **Progress beam** · `agent.progress` | (27 E3, E5a) The director (05 P-20) plays it for a merge that doesn't close its work (and isn't a facility's first); a Task update does not trigger it | **Gather (0.3 s):** a ring of at-rest blue tightens on the captain. **Act (0.8 s):** the captain fires one beam from where it is at the work, 150 ms apart for each piece the work serves: a phaser at an **enemy ship**, a mining beam at an asteroid, both at half weight; on a merge, the tender docks. **Echo (0.4 s):** a small Hero blue flare where it lands (a hit, never a finish, INV-06) | None: the captain fires from where it is |
| **Sector sweep** · `region.sweep` | (27 E7a) Four or more creations in one beat (Stories or Bugs created; a sketch firming up is not one). Below four, each plays its Sensor contact or emergence | **Tell (0.3 s):** a Nav cyan ring tightens on the star (2.4 → 1.1 star radii). **Act (up to 3 s):** one calm Nav cyan ring sweeps out across the frontier, ellipse to its shape, and each new piece makes its quiet entrance as the ring passes it, nearest the star first, 110 ms apart (2 s at most across them all), each entrance 1 s. **Echo (0.4 s):** no cues: the star's note reads | The star wears one note: the count by type in ADO's words and the sprint (*5 User Stories, 2 Bugs created in Sprint 13*); no plates, no captain named |

### 6.3 Interactions the art draws itself

Not maneuvers: these run in an object's own look, on its rung or its act.

| Who → whom | When | Look |
|---|---|---|
| Enemy ship → outward | Underway: steady; Nearing: frantic | Each live pod (a Task not yet Closed) fires bolts outward on the rung's beat: three in flight at a time when Underway; five when Nearing, with the vents spitting wild fire too. Each breaks on a shield arc (at-rest blue) about ¾ of the hull's span out. Danger Red whatever the colourway (which stays on the hull lights), brightened toward pale red, and at least a few screen pixels across |
| Fleet → enemy ship's pods | Underway, Nearing: each Active Task | A short beam from off the hull onto the pod, on the progress beat, with a core-blue impact and ember sparks. Hero blue, brightened toward pale blue |
| Captain → piece beside it | At rest, when the piece is under way (`ambient.ts`) | An asteroid: the idle tractor. A enemy ship: a burst of two or three bolts at 0.7 width, 240 ms apart, in hero blue |
| Station → its bay | The `intake` act (Haul) | Its own short tractor cone from the bay, given blue brightened toward pale blue, with three supply crates riding in |
| Station's hull | The `charge` act (before a phaser or mining beam) | Power climbs the docking ring to the dorsal emitter (a Wars station in its second form), or the reactor gathers light. At-rest blue, brightened toward pale blue, with core-blue tips |
| Station → outward | The `cover` act: **gallery only**; no maneuver plays it | A battery shot every 1.5 s, in the faction's fire colour (pale cyan, pale green or near-white) with white cores |

Retired (19 S2, 2026-10-13): **the region's threat light**, a faint Deadly Red glow on the frontier
belt's outer edge while any threat in the region was open, which All clear lifted. The belt is never
red now and shows only while unassigned work is in it (§3); each enemy ship's outline already says
where the danger is.

### 6.4 The round's end (2026-10-13)

When playback reaches the end of a sprint that's over (its finish is past, and the history reaches
it), the theme's **finale** plays in place of the recap bloom (05 §5). It celebrates the round, never
scores it: no counts, no ranking (INV-19).
- **The star flares:** warm and slow, the round's last light.
- **Each finished platform glints in turn**, in the order it finished: a four-point gold sparkle,
  from 0.7 s, 240 ms apart (at most 14).
- **The ships form up once:**
  - Every ship flies in (1.5 s, each 90 ms behind the last) to a tight chevron over the star, nosed east.
  - The leader gives one salute of hero energy, and they hold 2.6 s.
  - **The roll call** (22 C6, 05 §8 M-29): as they hold, every captain in the chevron is named, their part *Crew*. It is the team's victory: never a count or a rank (INV-19).
- The finale's commands are the moment itself: no load gate drops them (05 §8 M-27, G-3).
  - Then they fly home (1.4 s).
- The viewer's awards light on their own ship once the formation has formed, and ride with it (18 §3: only ever the viewer's).

An open sprint keeps the bloom: there's no end to celebrate yet.

### 6.5 Audit against the grammar (2026-10-13)

Checked against §6.1 the same day. Fixed then:
- **Captain jump** at a enemy ship fires bolts, not a tractor.
- **Carve** cuts with the cutting beam (no bolts).
- **The station's lance is retired.** A station at an asteroid fires a mining beam with the phaser's weight.
- **Satellite cycle:** the author keeps the tractor and the approvers give energy.
- **Station jump-in:** the summons is in hero blue.
- **Colours:**
  - The idle volley and the fleet's beams on pods are hero blue.
  - All hive-ship fire is Danger Red.
  - Tractors, charges and shields brighten toward pale blue, not white.

Kept on purpose: in Power link the author holds a tractor on the station while the approvers give
the author energy.

Still open:

| # | Where | Today | Proposed |
|---|---|---|---|
| B4 | Station covering fire (`cover` act) | Pale faction colours with white cores; no maneuver plays it (gallery only) | Recolour it hero blue, or retire it from the gallery |
| B5 | Emergence's rift (`HOSTILE`, 15 §2) | A second hostile red beside Danger Red | Keep it (the rift isn't fire), or move it to Danger Red |
| C1 | Engage, the stations' covering bolts | Called "heavier", but drawn at 0.75 width (thinner than a captain's), held longer (0.5 s) | Make them heavier (scale above 1), or call them slow and light |
| C2 | Shuttle tender and Satellite cycle | The only ship interactions with **no sortie**: a seated author may beam across the system | Sortie to the station as Captain jump does, or accept it (guests already stand beside the station) |
| C3 | Strike run's echo | A **grey** ring after a victory; Landing's is pale gold | Pale gold, to match |

## 7. Settings and the viewer (decided 2026-10-10)
*Applies to: Solar (the cog shows in a v0 view only when Settings' developer toggle chose it).*

| Setting | Tab | What it changes |
|---|---|---|
| Which captain is you (the viewer) | Your captain | Your ship's faction, hull and colourway; the stations you summon first; whose achievements are computed (§8) |
| *Show my achievements* | Your captain | Whether your awards show (on by default) |
| Theme pack | Theme | The chart's art and words: *Star Chart* only in v1 |
| View (developer toggle) | Theme | Solar, Sprints (v0) or Backlog (v0); remembered across launches in `settings.json` (`devParadigm`, 23 E3, Q9) |
| Data source, PAT, pinned projects, cache | Connection | What the Connect panel held |

**Source:** `settings/store.ts` (`SETTINGS_TABS`), `settings/tabs/*.tsx`, `settings/views.ts`,
`settings/viewer.ts` · **Update when:** a tab or a setting is added, moved or removed, or a setting
reaches something new.

A **cog button** in the header opens the **Settings** modal.
- A vertical tab list of categories fills the left quarter. The selected category's controls fill
  the right three-quarters.
- The tabs are `role=tab`, with ↑/↓ between them. Esc closes the modal, and focus stays inside it
  while it's open. Touch targets are at least 44 pt.

| Tab | What it holds |
|---|---|
| **Connection** | What the Connect panel holds today: data source, org URL, PAT, Forget token, pinned projects, cache and Purge, the diagnostic log switch |
| **Theme** | The viewer's theme pack. v1 ships one, *Star Chart*, so the tab shows it and leaves room for more. Below it, the developer toggle for the views (Q9) |
| **Your captain** | Pick which captain is you, by full name, then choose your faction and style your ship: hull and colourway. A **live preview** (`settings/CaptainPreview.tsx`, 23 E1: the chart's own `CaptainView` on one small Pixi renderer, destroyed with the tab, still in reduced motion) redraws as any of them changes. *Export captain…* and *Import captain…* carry faction, hull and colourway as a small JSON file (23 E2, `{ v: 1, faction, hull, colourway }`; no emblems; a file with unknown values is refused with a message). Below, *Show my achievements* and the list of your awards (§8) |
| **Captain Avatars** (built 2026-10-15) | A grid of squares, one per captain in the open scene, each showing their picture, or their initials on their colour, and their name. See *Captain Avatars* below |
| **How to read the chart** | A one-paragraph explanation (below), and the **guided tour** button (below) |

**How to read the chart and the guided tour** (23 E6, E7; `settings/tabs/Read.tsx`, `tour/`). The prose, the tour's steps and
the `+N more` string are the theme's (`ThemePack.readCopy`, 14 §8), every noun read through terminology, so a theme or pack
swap rewrites them. The **tour** is seven steps that play Halcyon Reach's **Comet Pod** and point at each kind of object as it
appears: the star, a planet (seat), an asteroid, a hive ship, a station, a captain's ship, and the player. It is **offered once**,
on a first launch (`UserSettings.tourOffered` is set the moment the offer shows; a card at the bottom with *Take the tour* and
*Not now*), and **always** from Settings › How to read the chart. It reads the fixture only: from ADO mode it switches the data
source to Fixture for the tour and puts ADO back when it closes (it never reads or writes ADO, INV-21). It plays in Solar only
(a developer view says so in Settings). Esc closes, ←/→ step, Enter takes the focused *Next*. Under reduced motion the ring
doesn't pulse and the pod advances a beat at a time while a step waits for its object.

**Captain Avatars** (`settings/tabs/CaptainAvatars.tsx`; ADO mode, where pictures can be kept). ADO often
won't give us teammates' pictures (04 §7), so this tab loads them by hand in bulk. The list is what is
loaded, so it works offline, and follows the scene: from the galaxy, everyone in every loaded scope; in a
sector, its contributors; in a solar system, only whoever has work in it (`captainRoster` in `nav.ts`,
`captainsInScene`). A square's picture is theirs (marked with a gold outline and a × to remove it) or ADO's, or
initials. Ways in, all of which end in the same place (`pictures.set`: main cuts it to a 128 px centred
square and keeps it under userData, 04 §7):
- **Drop on a captain's ship on the chart** (23 E8, `chart/pictureDrop.ts`): the window's drop is hit-tested
  against the ships (`ChartApp.captainAt`, the ship's hit circle, at least 22 px) and the file goes through
  `pictures.set` like any other. Only an image type under 12 MB that the page can decode is sent (`shared/pictureFile.ts`);
  anything else, or a drop on empty sky, or one while not connected, says so in a notice over the chart. *Everyone loaded,
  not just this view* lists every captain in every loaded scope (the People list). The tab says where the pictures are:
  userData's `pictures` folder, never the repo, never leaving the Mac, never sent to ADO.
- **Click** a square: the file chooser. **Drop** a picture from Finder onto a square: one gesture. **Paste**
  (⌘V) onto a focused square.
- **Drop several** (or *Add pictures…*, or a folder with *Choose a folder…*) onto the grid: each file name is
  matched to a captain (`matchFiles`: the whole name in any order, first and last name anywhere in it, an
  email, fragments such as "ava lind", or a lone first or last name). Only a clear single fit is placed, and
  the matches are listed to confirm, with "replaces their picture" where one is kept. A file that fits nobody,
  or two captains equally, goes to the **tray** at the side: drag it onto the right square, or pick a name in
  its menu (the keyboard way). The tray outlives the tab.
- **Undo** puts back what the last change replaced. *Only captains without a picture* narrows the grid to the
  work list. *Adjust the crop of a single picture first* (kept in this window's local storage) puts a crop
  step before a single picture (a batch is always centred).
- **Copy all to a folder** writes `star-chart-pictures/<identity id>.png` (IDs, never names); **Read from a
  folder** takes such a folder (or its parent) back, from another Mac. Only small, real PNGs are taken.
File names are compared in memory only: never logged, stored or sent. Bytes cross IPC once, on `set`, and the
test IPC log records `[key, bytes]`, not the picture.

**The viewer** is the person this copy of the app is for, chosen under *Your captain*.
- The choices are the people in the loaded history, listed by full name. **In ADO mode, with no viewer chosen, *Your captain* first asks "Is this you?"** about the signed-in user (`auth.status().me`, from `connectionData`; 23 E4): `Yes, that's me` chooses them, `No, choose myself` leaves the picker (asked again next time). Nothing is picked silently; fixtures have no signed-in user and always ask. The choice is stored
  locally in userData settings, never in this repo, and the dev log records only a salted hash
  (03 §10).
- **The viewer's faction reaches only two things** (decided 2026-10-10):
  - **Their own ship**, in the hull and colourway they choose.
  - **What their ship summons directly.** If the viewer is the first captain to summon a station in
    the round, it arrives in the viewer's faction: one of that faction's valid station designs, in
    one of the valid hero colourways. Which design and colourway is picked by the repo's stable
    seed within that faction, so it's the same on every run.
- Everything else keeps its stable seed (§4). So the viewer's ship, and the stations they summon,
  may look different on a colleague's machine.
- The viewer's choices obey the same rules as seeded ones: every hull keeps the same footprint
  (INV-19), and no colourway uses the hostile palette or a ladder hue.
- With no captain chosen, every ship comes from its seed and no achievements are shown (§8).

**How to read the chart** (as built, `readCopy` in `settings/tabs/Read.tsx`: what the chart shows in
the theme's words, what it stands for in the loaded pack's; shown here with SDLC's):

> Each solar system is one team's Sprint, played back as an episode. Everyone with work in the
> Sprint has a big planet ringed round the star, lit only on the side that faces it, and their
> captain flies to wherever they're working. User Stories are asteroids, Bugs are enemy ships: both
> start on the planet, asteroids on its left half and enemy ships on its right.
> The captains carve the asteroids and rig them for harvest, and the fleet engages the enemy ships
> until a strike run breaks them apart. Finished work moves to the planet's trophy ring as a small, gently lit
> platform in orbit, for good. Repositories are stations, and the Pull Requests and Pipeline runs
> around them are tender shuttles and point defenses. New work first appears as a wireframe sensor
> contact; after that, colour shows how far along anything is: grey ready, blue underway, violet
> nearing, gold accomplished. A planet blooms as its own person's work is finished, and is never
> compared with anyone else's. Press Space to play, drag the ruler to move through time, and hover
> anything to see what it is.

(Superseded 2026-10-13: the draft copy, which named stories and bugs in the chart's own sentence.)

## 8. Achievements (decided 2026-10-10)
*Applies to: Solar · packs: SDLC, Todo, CRM.*

Achievements are **personal** and **outcome-based**: earned from what the viewer's own work arrived
at in the round, never from activity volume, and never compared with anyone. In v1 they're awarded
**only to the viewer** (§7). Built in `src/shared/engine/achievements.ts` (`achievementsFor`); the
pack supplies the bars (`PackThresholds`).

**Rules for every achievement.**
- **Personal.** One person earns it, for what they did. It never compares, ranks or totals people
  (INV-19).
- **Viewer only.** Only the captain chosen in Settings → *Your captain* earns any; nobody else's are
  computed or shown. With no captain chosen, there are none.
- **Outcome-based.** Earned from dated events in the round (arrivals at Accomplished, merges,
  approvals at completion), never from undated observations (INV-02) or activity volume (edits,
  comments, hours).
- **One round at a time.** Computed purely in `src/shared/` from the round's facts, so the same
  history always earns the same awards (INV-12 to INV-15). Nothing carries across rounds.
- **Earned, never lost.** No "missed" achievement, no progress bar, nothing drawn for an absence.
- **A fixed bar, not a count.** No tiers that grow with volume, no XP, no streaks.
- **Hard to game against quality.** Prefer outcomes a team wants more of (finishing, limited WIP,
  short lead times) over ones that reward splitting work.
- **Local and read-only.** Nothing is written to ADO (INV-21) or exported; the dev log has only hashes
  and counts (03 §10).

**The eight (decided A1, built).** Bars per pack (A2, A3, A6): SDLC `packs/sdlc/thresholds.ts`, Todo
and CRM in their `index.ts`. All three use a 12-hour working day. Each rule has its own insignia
shape, and a golden earn and near-miss pair (`fixtures/scenarios/v1/achievementCases.ts`).

| Achievement (shape) | Earned when (engine terms) | Bar: SDLC · Todo · CRM | Near miss tested |
|---|---|---|---|
| **Clear skies** (sun) | Every objective and threat on the viewer's seat at round end is Accomplished (Off ignored), and one landed in the round | — | One Story only Resolved at the end |
| **Hat trick: landings** (triple chevron) | Three of the viewer's objectives reach Accomplished | — | Third only Resolved |
| **Hat trick: defences** (triple shield) | Three threats on the viewer's seat are defeated | — | Third Rejected, not defeated |
| **Hat trick: reviews** (triple star) | The viewer approved three attachments (not their own) that merged | — | Third approved by someone else |
| **Swift passage** (arrow) | An objective goes from its first dated Underway to Accomplished within *N* working days | *N* = 3 · 2 · 10 | Active Monday to Closed Friday |
| **Steady hands** (level) | All round, never more than *K* objectives and threats Underway at once (steps don't count), and at least one lands | *K* = 2 · 3 · 4 | Three Stories Active at once |
| **Clean landing** (ring) | An objective lands with every step bound to it already Accomplished (Off steps aside) | — | One Task still Active |
| **Wingman** (wings) | The viewer brings a step to Accomplished, or authors or approves a merged attachment, for another seat's piece, which then lands | — | The helped Story never lands |

Todo's bars are lower because chores wait for evenings and a household juggles; CRM's are higher
because a deal takes weeks and a rep works several.

**Presentation (built).** When the earning beat plays, the insignia lights on the viewer's own ship in
Accomplished gold, an ornament that never interrupts a protected moment; the recap bloom, or the
finale when the round is over (§6.4), ends with the round's insignia (`v1/awards.ts`). Settings → *Your captain* lists them, each with its one-line reason
and links to the pieces, under the *Show my achievements* switch (A5, on by default). Never on anyone
else's ship, planet or label; the shape, not the hue, tells them apart (INV-20).

The brainstorm's other candidates (Frontier scout, Same-round defence, Delivery, First light, and
Green guard once pipeline runs are read) weren't picked: see
[archive/18-achievements.md](archive/18-achievements.md) §2.

## 9. Rule changes from v0
*Applies to: Solar. The v0 views keep v0's rules.*

| Rule | Change | Doc to amend when built |
|---|---|---|
| INV-19 Not a scoreboard | A seat's planet may show its **own share**. The viewer may earn **achievements** for their own outcomes, never shown for others. Still no counts, rankings or XP | 02 (done) |
| INV-05 Own state drives the look | Adds the seat planet as an aggregate exception, beside the region's star | 02 (done) |
| "Ships help; they never attack" | Ships help people, and **fight only threats** | 02, 06 (done) |
| INV-14 Stable layout | Swimlanes give way to orbits with fixed seat slots. Lattice cells, platforms and compound slots are fixed too | 02, 08 (done) |
| Navigation | The solar system is the bottom level. Playback happens at the region only | 05 §8, 06 (done) |
| Colour | The hostile palette is reserved for threats; hero colourways change | 06, 09 (done) |
| Seeds | Every seeded look comes from a stable hash of the entity's ID in its tenant, so it survives purges and reconnects. The viewer picks their own faction and style, which also styles the stations they summon first | 06 (done) |
| Containers | Not drawn; since v1.3 (B3) the region's star plate names the pod's top Feature at rest, and all of them when pointed at or selected (27 B2), as text (a station's rows are its PRs, 19 L6); Epics are deferred | 06 (done) |
| INV-08 Roles stay distinct (2026-10-12) | **Stations fire only at enemy ships**: at the threats a merge served, and when one of them closes. At an asteroid a station mines, never fires. One sustained beam per moment | 02 (done) |
| The merge (2026-10-12) | A merge is teamwork (`attachment.merge`, Power link, §6.2): approvers energise the author, the author energises the station, and the station beams the work. INV-06 holds: the beam never changes the work; only its own close finishes it | 02 (done) |
| Station form (2026-10-13) | A station's form follows the round's merges so far (`PieceState.merged`): every playback starts in the first form, and the round's first merge transforms it (§4.4) | 03 (done) |

## 10. Decided questions
*Applies to: Solar.*

| # | Question | Decision (2026-10-10) |
|---|---|---|
| Q1 | Pieces per planet | **Superseded 2026-10-12:** any number, as standalone objects in the planet's shadow region, objectives left and threats right (§3) |
| Q2 | Stations with one seat | **Superseded 2026-10-12:** it sits on the planet's star-facing side, in the open between the planet and the star, never in its shadow region (§3). (It had sat close beside that planet's pieces.) |
| Q3 | Choosing a faction | The viewer picks their faction in Settings. It styles their own ship and any station they summon first; everything else keeps its stable seed (§4, §7) |
| Q4 | Achievements | Personal, outcome-based, awarded only to the viewer (§8) |
| Q5 | Stations and containers | Stations are repos only, with PR and pipeline satellites. Features appeared as mega-label subtitles until v1.1 (19 L6: the rows are PRs now) and show as a plate row on the star since v1.3 (B3); Epics are deferred (§4.4) |
| Q9 | Where the app opens | In v1, the solar system. The v0 views (Sprints board, Backlog) are reachable only through the developer toggle in Settings → Theme (remembered, `UserSettings.devParadigm`, 23 E3) or a `STAR_CHART_PARADIGM` pin; tests keep pinning them as before (built) |
| Q8 | Suggesting the viewer | **Decided 2026-10-27 (23 E4), built 2026-10-28:** *Your captain* asks "Is this you?" about the signed-in ADO user (`auth.status().me`) and the viewer confirms; never a silent pick. Fixtures have no signed-in user, so they always ask (§7) |
| Q10 | Captains in the solar system | Clickable, with Follow, as in v0: the planet is the person's seat, the ship is the person in action |
| Q11 | Many seats | **Superseded 2026-10-12 (layout v4):** every seat sits at an even angle (2π / n, in a coprime stride) on one regular ring, at the smallest radius that clears every footprint, so any number of seats fit round the star; no second ring. Every person keeps a full planet, and places stay fixed over the loaded history (INV-14). (It had given each seat its own radius, found by collision.) |
| Q6 | Who stands free | **Moot since layout v4 (2026-10-12):** nobody; there is no free cap, and every piece stands in its seat's region (§3). `DomainPack.crowd`, which nothing read, was removed in v1.3 F3 |
| Q7 | A failed pipeline run | **Decided 2026-10-27 (23 B2):** no run events; the plate shows the last run's result in a neutral tone (`Last run: failed · 2 h ago`, a slate hollow diamond, never red or hostile); guards stay idle art, with no flare and no damage (§4.4, 15 §6 `run-line`) |

## 11. Open questions
*Applies to: Solar · packs: SDLC.*

- **Q6** (closed 2026-10-12; moved to §10) Who stands free: nobody; the free cap is gone (§3).
- **Q8** (closed 2026-10-28; moved to §10) Suggesting the viewer: *Your captain* asks "Is this you?" (23 E4).
