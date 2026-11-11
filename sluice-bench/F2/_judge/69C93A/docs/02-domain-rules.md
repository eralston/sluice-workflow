# 02 — Domain rules

**Normative.** This file is the single statement of what the data *means*. Other docs cite rules by
ID (`INV-07`) instead of restating them. If another doc appears to contradict this one, this one wins
and the other is a bug. Types referenced here are defined in [03-contracts.md](03-contracts.md).

**Status:** current as of 2026-10-27 (through v1.3 Block B), checked against the code in the working tree. Covers the
invariants for both views (Solar's amendments are dated sub-bullets), the three hierarchies, PR and
repository rules, the event catalog and the moves events make in Solar, replay order, and lenses.
Values (colours, lengths, sizes) live in [15-reference.md](15-reference.md); this doc holds meaning.

## 1. Invariants

*Applies to: both views.* Each invariant says where it differs in Solar or the v0 views.

| ID | Rule, in short | Applies to |
|---|---|---|
| INV-01 | Event time comes only from ADO source timestamps | both |
| INV-02 | Undated facts are Observations and never animate | both |
| INV-03 | Playback shows only links valid at the playhead | both |
| INV-04 | Backfill dates events historically; no burst of "today" | both |
| INV-05 | An item's own state drives its look; aggregates excepted | both (Solar: seat planet, station) |
| INV-06 | A merge never closes work or claims deployment | both |
| INV-07 | Ships go where people acted, not where assigned | both |
| INV-08 | Roles stay distinct; ships and stations fire only at threats | both (Solar: combat, the merge) |
| INV-09 | One entity, one history, however many projections | both |
| INV-10 | Nothing invented; unplaceable items go to a tray | both (Solar: ghosts, no containers) |
| INV-11 | Unmapped states are neutral, never guessed | both |
| INV-12 | Replay, projection and seeded looks are pure | both (Solar: viewer style at render) |
| INV-13 | Re-syncing yields no new or duplicate events | both |
| INV-14 | Slots fixed over loaded history; seeks never reflow | both (Solar: the fixed setup) |
| INV-15 | Only forward play animates; seeks snap | both |
| INV-16 | Renderer gets validated types only: no REST, PAT, SQLite | both |
| INV-17 | The PAT is never echoed, logged or stored in plain | both |
| INV-18 | No real ADO data in fixtures, git, screenshots or prompts | both |
| INV-19 | No scores or rankings; only a person's own share | both (Solar: own share, achievements) |
| INV-20 | Never hue alone; DOM text; keyboard; reduced motion | both |
| INV-21 | The app never writes to ADO | both |
| INV-22 | Keys are ADO IDs and GUIDs, never names | both |

**Source:** this section (normative); each invariant names its test · **Update when:** an invariant
is added, renamed or amended (change its row here in the same edit).

Each invariant names the kind of test that enforces it (see [archive/07-slices.md](archive/07-slices.md); v1 checks are in the archived [17](archive/17-v1-phases.md); v1.1's and v1.2's plans are archived [19](archive/19-v1.1.md) and [22](archive/22-v1.2.md); the active plan is [23](23-v1.3.md)).

### Time and evidence
- **INV-01 Source time is truth.** An event's `occurredAt` comes only from an ADO source timestamp
  (see [04 §4](04-ado-ingestion.md#4-timestamps-which-field-is-the-event-time)). Poll time, sync time,
  and row-insert time never become `occurredAt`; they are `observedAt`. *Unit test on derivation.*
- **INV-02 Undated facts never animate.** A fact with no source time becomes an `Observation`,
  never a `TimelineEvent`. Its confidence is `'unknown'` if it came from an undated update and
  `'observed_only'` if it was seen only in the current state. Observations are absent from the
  `knownThen` lens, appear in `currentObserved` marked *uncertain*, and never trigger an accent.
  *Unit test on `snapshotAt` + AnimationDirector.*
- **INV-03 Known-then is the default lens.** Playback shows what was true *at the playhead* using
  only relationships whose validity interval contains it. A link added later never appears earlier.
  The `currentObserved` lens is opt-in and visibly labeled "retrospective". Its exact semantics
  are in §6. *Unit test.*
- **INV-04 First sync reconstructs history.** Backfill derives events at their historical source
  times. A first sync never produces a burst of "today" arrivals. *Ingest test.*

### Meaning of work
- **INV-05 An item's own state drives its visual.** Stage comes from `(type, raw state)` via
  [`config/state-mapping.json`](../config/state-mapping.json). Child completion, PR merges, and Task
  counts never change a parent's stage, and no percentage-complete is invented. A Feature is a white
  dwarf only when its own state is `Closed`. *Unit test.*
  - **Pods (Sprints, decided 2026-10-07)** aren't work items, so they have no state of their own. A
    pod's star shows its share of the sprint: Accomplished when every member is done, Nearing at
    three quarters resolved or done, Underway once any is under way, and Ready otherwise. An empty
    pod is a faint sketch. This is the one place an aggregate drives a look, and it never applies to
    a work item. *Unit test (`tests/unit/sprints.test.ts`).*
  - **Seats and regions (v1, amended 2026-10-12; 13 §4.1, §9).** In the Solar view, the region's
    star keeps the pod rule above. A **seat's planet** is the second aggregate exception: its world
    transforms with the seat's **own share**, the fraction of the objectives and threats that person
    holds now which are Accomplished (Off pieces don't count), quantised to 0.05. Nothing is built
    on its surface: a finished piece leaves for a trophy slot on the ring round the planet
    (05 §8.2a S-14; the mandala, 22 Block D; superseded 2026-10-12: outcomes once built on the surface). It measures one person
    against their own commitment, never against anyone else (INV-19). A **station** (a facility)
    grows more intense with its own share of linked pieces done, and its **form** (first or second)
    follows the round's merges into it so far (`PieceState.merged`, 13 §4.4), never a rung. Since v1.1
    (19 M1, 2026-10-14) it also goes on **standby** while none of its PRs is open and none has opened
    or settled for two days of history (`PieceState.standby`, 13 §4, *Idle life*): a quieter look from
    its own PRs' history, never a rung, a place or a size (INV-14, INV-19). None of
    these rules ever applies to a work item: an objective, threat or step climbs the ladder on its
    own state alone, and a station's satellites never move its rung. *Golden (`solar.scenes.json`)
    and unit tests (`solarSeek.test.ts`, `assetStage.test.ts`).*
- **INV-06 Merged ≠ done ≠ deployed.** PR `completed` means merged into its target branch. It does
  not close a Story, resolve a Bug, or imply deployment. Nothing in the app claims deployment.
- **INV-07 Assignment ≠ activity.** `System.AssignedTo` means *assigned*. It is not evidence of
  coding, being online, sole focus, or time spent. Concurrent assignments are all shown (the name on
  each item's label); none is picked as "current" from assignment alone.
  - **Where a ship sits (slice 3a, decided 2026-10-03):** beside where its captain **last worked**
    in the scene, by recorded activity only (an event's `changedBy`, or authoring a PR), never by
    assignment as evidence of work. With no activity in the scene yet, it sits at an assignment (a
    body before a Task, then the one held longest), as before.
  - **In the Solar view (v1, as built; revised 22 A9, C7).** A ship rests off the planet of the last
    asteroid or enemy ship its captain touched in the region, even someone else's, by recorded activity
    only: a Task's event stands for its parent's, and PR work for the work the PR serves. Never by a
    station. With none yet, by the piece they've held longest; else by its own planet, so every seat
    has a clickable ship (13 Q10). By that planet it sits on its loiter ring, the first to arrive on
    the far side from the star, each keeping its slot while it stays (22 D3, the mandala). The full rule: [05 §8.6](05-playback.md#86-captains) K-11 (§8.6a). A **guest**, someone who holds nothing
    here, has no seat, but their ship rests beside the last thing they helped with once they have
    (`projectGuests`). Assignment decides the seat and activity the ship: neither stands in for the
    other.
- **INV-08 Roles stay distinct.** Assignee (`System.AssignedTo`), PR author (`createdBy`), and
  reviewer are separate roles even for the same person. A PR-author event never moves or reassigns
  anyone else's ship. The author's own ship goes to work on the PR (its activity, INV-07): it flies to
  the vessel and takes it in its tractor beam (06 §5). Reviewers who approved a merged PR fly in
  together for its completion (the review formation) and then leave: approving is shown at that
  moment only and never moves anyone's resting place.
  - **Ships help, and fight only threats (v1, amended 2026-10-12; 13 §4.3, §9;
    [13 §1, Combat safety](13-game-design.md#combat-safety)).** v0's rule was "ships help; they never
    attack". In the Solar view, ships still help people (carving, rigging, tractoring, flying the
    review formation) and **fight only threats**: hive ships, which are insects and machines, never
    people. Enemy fire never lands on a person (shields and point defense absorb it), there are no
    friendly casualties, and a defeat is debris and research, never death. A ship never fires at
    another ship, a planet, a station or an objective. The strike run's cast is the actor and the
    reviewers of the fix (INV-08 roles as above). Threats belong to the work, not to people: a
    threat is never attributed to whoever wrote the code, and nobody is blamed.
  - **Stations fire only at hive ships (v1, amended 2026-10-12, art session).** A station may fire
    its phaser, and only ever at a hive ship (the clear "bad guys"): when a PR merges into it, at the
    threats its work served, and when one of those threats closes. At an asteroid it fires its
    mining beam (2026-10-13): the phaser's weight, wrapped in a tractor sheath. Mining, not fire.
    Still a campfire: one sustained beam per moment, never a barrage. While a threat its work goes
    to is engaged (`threat.engage`), it may add slow, sparse covering bolts at that hive ship; while
    an objective nears, it hauls supplies with a tractor (Rig up), never fire. Friendly ships give friendly
    work a tractor beam, a summons or an energy transfer, and only an enemy ever takes weapons fire
    (13 §6.1).
  - **The merge (2026-10-12).** A merged PR's author flies to its station and its approvers form up
    behind them (a guest with no ship here jumps in out of hyperspace and out again); the
    approvers' beams energise the author, the author's beam energises the station, and the station
    beams the work the PR served. The beam never changes that work (INV-06): only the work's own
    close finishes it, and that close is beamed by every station a merged PR for it went to.
- **INV-09 One entity, many projections.** A Feature shown under both an Area Path sector and an
  Epic sector is one canonical entity with one history. A repo shown in three Feature systems is one
  repository. Projections never create entities or duplicate events. *Unit test on `projectScene`.*
- **INV-10 Actual links only.** Render only relationships present in source data. Never insert a
  Task between a PR and the Story it links directly; never invent a parent. Missing or unexpected
  parentage goes to the **Uncharted** tray; a PR with no readable work-item link goes to its repo's
  **unlinked** tray. Team conventions (Bugs are children of Features; PRs link work items) set
  expectations but never manufacture data.
  - **Ever in the sprint (decided 2026-10-08).** An item that was in the sprint and has since moved
    on is still a member, and still arrives and departs in its playback. It's found by one WIQL
    query (`[System.IterationPath] EVER`, 04 §5b) rather than by daily sampling; the samples remain
    a backstop for one that also left the pod's Area Path.
  - **Removed items leave (decided 2026-10-08).** An item whose category is `Removed` (Removed,
    Rejected, and the like) leaves the scene once it gets there, with its Depart motion (05 §5). It
    leaves In view and the counts too, in both hierarchies. Replay before the removal still shows it
    in its slot (INV-14). So does an item that vanished: deleted, or a 404 on the next look.
  - **In the Solar view (v1, as built 2026-10-12)** an Off piece (Removed, Rejected) stays a member
    of its region and rests as a **ghost** at its slot (13 §4.2–4.3, 14 §4), so the board still
    shows what was dropped. It counts in no share, earns nothing, and a reseat made while it's Off
    puts it in a slot at its new seat when that seat is already on the board (it holds nothing there, and
    opens no seat); to anyone else, or no one, it waits until the piece is back on the ladder
    (`boardFacts`, 03 §5d; 23 C9). A piece that is Off for the whole
    round makes no seat. An attachment is drawn only if it links a piece in the region (or one of
    its steps), so an unlinked PR, or one linked only to dropped pieces, summons no station. v0's
    views are unchanged.
  - **Containers aren't drawn in the Solar view (v1; 13 §4.4).** Since v1.1 (19 L6, 2026-10-13) a
    station's mega-label lists its PRs, each with the work it serves, and no Feature is drawn
    in the Solar view; Epics have no form and none is planned (23 §5). **Since v1.3 (B3)** the region's star
    plate names the pod's top Feature by piece count as text at rest (and the whole list when pointed at or selected by the user, 27 B2; the selection a scene entry makes keeps the star selected without opening it), and the Inspector lists them all (15 §6 `feature-row`): a
    piece whose parent is not a Feature is not counted. No parent is invented.
- **INV-11 Unknown states are neutral.** A `(type, state)` pair missing from the mapping gets stage
  `unknown`, a neutral visual, and its raw state name. At connect time, compare the runtime
  work-item-type-states API with the mapping and surface any mismatch; never guess a stage.

### Determinism
- **INV-12 Deterministic replay.** `snapshotAt(history, t, lens)` is pure. The same inputs give the
  same snapshot regardless of prior play, pause, seek, or rate. `projectScene` is pure. Procedural
  art takes its seed from `(canonicalKey, artVersion)` and never encodes state through randomness.
  *Golden tests.*
  - **Stable looks (v1; 13 §4, 06 §9).** Every seeded look comes from a stable hash of the entity's
    own ID within its tenant, never from load order, local row IDs or cache state, so it survives
    purges and reconnects. The one exception is the viewer's own style (their ship, and the
    stations they summon first), which is applied at render time from local settings. Shared
    projection and every golden are viewer-free; the viewer enters shared code only as the argument
    to `achievementsFor`. A maneuver's own art randomness comes from its event key
    (`PlannedManeuver.seed`, 14 §4), so a replay draws the same moment the same way.
- **INV-13 Idempotent ingest.** Event keys are deterministic (see [03 §3](03-contracts.md#3-events)).
  Re-running an overlapping sync yields zero new or duplicate events. A refresh that finds no new
  source facts changes nothing. *Ingest test.*
- **INV-14 Stable layout.** A slot is assigned by the order in which children *first* joined the
  parent across the whole loaded history, not by the playhead (see
  [03 §5](03-contracts.md#5-snapshot-and-view-model)). So slots never change on seek, and a newly
  linked child takes the next free slot without moving existing ones. Exception: a backfill that
  discovers an older child can shift slots, which is acceptable.
  - **Features in a sector (amended 2026-10-07):** their slots are A–Z by title, so a sector reads like
    an index. The title is each Feature's latest over the whole bundle, never the playhead's, so slots
    still never change on seek. A Feature that joins mid-range, or arrives with Load more, takes its
    alphabetical place, and the ones after it glide over (05 §5 continuity). Which Features show, when
    the cap applies, is still decided by first join. Children within a Feature keep first-join slots.
  - **Star systems as a board (amended 2026-10-09, slice 6).** A Feature system (Backlog) and a pod
    (Sprints) read like the team's kanban board. The *frame* is fixed over the whole loaded history, so
    a seek never reflows it: the lanes (everyone ever assigned, A–Z, then Unassigned), each lane's
    rings, and the column widths. A body's *place* inside the frame follows the playhead: its lane from
    its assignee at t, its column from its stage at t. As with the Task radar, position is a pure
    function of (history, t, lens), so seeks stay idempotent (INV-12) and snap (INV-15). First-join
    slots remain the last tie-break. The star itself never moves.
  - **The Task radar (amended in slice 3a, 2026-10-03):** a Task's *angle* comes from its slot and
    never changes; its *radius* comes from its displayed stage (one band per rung). Position is still
    a pure function of (history, t, lens), so seeks stay idempotent (INV-12) and snap without
    animation (INV-15). Everything else keeps a fixed position.
  - **The solar system (v1, amended 2026-10-12; 13 §3, §9).** Swimlanes give way to **orbits with
    fixed seat slots**. The *fixed setup* (`planSolar`, 14 §4) depends on the loaded history and the
    scene only, never on the playhead:
    - **Seats:** everyone who held an objective or threat on the ladder in the region during the
      round, ordered by when they first held one (ties by key). Each gets one planet on one
      regular ring: even angles (2π / n, in a stride that spreads first-join neighbours apart,
      starting at the top) and one radius, the smallest at which every seat's footprint clears the
      star and the others (`placeSeats`). Each orbit is a short arc through its planet. Planets
      don't orbit during playback. (Superseded 2026-10-12: an inner ring of 6 and a second ring,
      13 Q11.)
    - **Pieces (the mandala, 22 Block D):** per seat and role, every piece that ever stood there, in
      arrival order, takes a fixed slot on the planet's half-disc: stories on the left half, bugs on
      the right (`halfDiscSlots`, 05 §8.2a S-13). A busy planet's slots shrink, both sides one size;
      there is no free cap (superseded 2026-10-12: 3 stood free and the rest formed up, 13 Q6). A
      finished piece shows at its fixed slot on the planet's one trophy ring, in close order
      (`trophyShells`, S-14). A freed slot stays empty; nothing is promoted on a seek. Captains rest
      on the planet's loiter ring, by first arrival (S-15, INV-07).
    - **The frontier belt:** a slot per piece ever unassigned, by first-unassigned time.
    - **Stations and compounds:** a station's place comes from the seats it serves over the round
      (between them, or beside one), and its arrival from its first attachment in the round; each
      attachment takes the lowest compound slot free when it opens and keeps it (online first-fit);
      with every slot held a PR waits in "+N" and is **promoted** into the first slot that frees, and a
      drawn tender never changes slot (23 C6, which replaced interval first-fit).
    - A piece has a slot at every seat it ever visited, so a reassignment is travel between two
      fixed points. The playhead decides only visibility, which of a piece's slots it shows at
      (its cell, or its platform once Accomplished), and its look. The sizes are in
      [15 §5](15-reference.md#5-sizes-floors-and-layout); any change bumps `SOLAR_LAYOUT_VERSION`.
      *Unit tests (`solarLayout.test.ts`, `solarSeek.test.ts`) and goldens (`solar.plan.json`,
      `solar.scenes.json`).*
- **INV-15 No catch-up animation.** Accents fire only when a *playing* playhead crosses an event.
  Seeking materializes the target snapshot with no accents. When accents can't keep up, they are
  skipped or compressed, never queued. Entering a scene mid-play renders its current state without
  replaying earlier accents.
  - **Maneuvers (v1, as built 2026-10-13; 05 §8).** In the Solar view the same holds for
    maneuvers: they start only when a playing playhead crosses their beat. A seek destroys every
    live command and tell, lands every look and snaps every position, with no glide. The opening
    plays only when play starts from the beginning, and a seek ends it; Home and End are seeks, so
    they play no recap or finale. Load tiers drop work, never defer it (15 §10).

### Boundaries and safety
- **INV-16 Renderer boundary.** The renderer process never receives raw REST payloads, a stored
  PAT, or SQLite access. It receives only the validated types in [03 §6](03-contracts.md#6-ipc-api).
- **INV-17 Credential hygiene.** The PAT touches the renderer only in its entry field. That field
  sends it once via `auth.setPat` and clears itself; the PAT is never echoed back. It never appears
  in logs, SQLite, other IPC messages, fixtures, screenshots, or agent prompts. Main stores it in the
  Keychain via `safeStorage`, falling back to memory only. The dev log (03 §10) never sees it: its
  field is skipped, setPat's arguments aren't logged, and any line holding its start is dropped.
  **The Azure CLI sign-in (04 §1a) is held to the same rule:** its token lives in main's memory only (never
  the Keychain, SQLite, a file or IPC), `az` is run with `execFile` and a fixed argument list, and its
  output is parsed and dropped. Tests use a fake `az` on a test PATH and the canary token.
- **INV-18 No real ADO data outside the app.** Real work-item data (the Federation's *Internal* data) is never
  put in fixtures, source control, screenshots, or AI-tool prompts. Fixtures are synthetic with
  invented names. Coding agents work only against fixtures. The dev log (03 §10) holds only salted
  hashes of identifiers, counts, and the app's own UI and API vocabulary: never names, titles, paths,
  typed text, or ADO messages.
- **INV-19 Not a scoreboard.** No person scores, rankings, XP, or leaderboards. Ship size, star size,
  and color never encode productivity or quality. Sector color means *recent recorded activity in the
  window*, nothing more.
  - **Own share and achievements (v1, amended 2026-10-12; 13 §4.1, §8, §9).** Two things are
    allowed, because each measures a person against their own commitment and never against anyone:
    - **A seat's planet shows its own share** (INV-05, *Seats and regions*). Every planet is the
      same size, no counts are shown on it, and no planet is compared with another.
    - **The viewer may earn achievements** for their own outcomes in a region's round. They are
      awarded only to the viewer chosen in Settings, computed for nobody else, never shown for
      anyone else, and switched off by one setting (13 §8). They are outcome-based, never
      activity counts; an absence draws nothing.
    - **Milestones (2026-10-13)** celebrate work, never compare it. *Homeworld complete*
      (`seat.complete`) plays when a seat's own share reaches 1, for that seat alone; *All clear*
      (`region.clear`) plays when a region's last open threat closes, for every seat there; the
      round's finale celebrates the whole round. None shows a count or a ranking.
    - Still no counts, rankings, XP or leaderboards. Ship and station footprints never vary by
      person, every piece is drawn full size whatever the count (`formationShape`; superseded
      2026-10-12: a formation's scale came from crowding), and no colourway or faction means
      anything about a person.
- **INV-20 Accessible.** State is never conveyed by hue alone: every stage has a distinct
  shape, texture, or label. All primary information (titles, IDs, states, dates) is live DOM text.
  Every pointer action has a keyboard equivalent. Reduced-motion mode replaces motion with static
  highlights and loses no information.
  - **In the Solar view (v1, as built 2026-10-12).** Where an object's colour is fixed (a world
    line, a material, a hostile or faction colourway), its rung is carried by its light and its
    form, never hue alone (09 §9). A role aura's hue says what a piece is, never how far along. Holo
    plates and mega-labels are DOM text; mega-label rows also mark each rung with a shape
    ([15 §3](15-reference.md#3-signal-ladder)), and the object list is their accessible
    equivalent (the mega-label itself is `aria-hidden`). In reduced motion every effect takes its
    declared substitute ([15 §8](15-reference.md#8-effects)), and there is no opening, idle work
    or tell.
- **INV-21 Read-only.** The app never writes to ADO, in any view or pack. Links out ("Open in ADO", a container's subtitle link) are read-only web links.
- **INV-22 Names are not keys.** Display names, titles, Area Paths, and URLs are never keys. Keys are
  ADO IDs and GUIDs, normalized (see [03 §1](03-contracts.md#1-identity-and-keys)). Project, Area
  Path, Epic, and person names are all discovered at runtime; none is hard-coded. Names like
  "FederationCore" and "Comet Pod" in the docs are illustrative only.

## 2. Hierarchy and membership

*Applies to: both views.* Each paragraph below names its view.

| View | Chain (levels) | Members | Where it plays |
|---|---|---|---|
| **Solar** (default) | project (galaxy) → sprint (round) → pod (region) | The Sprints members, read through the pack's roles | The region only |
| Sprints (v0) | project → sprint → pod → body (a close-up) | Stories and Bugs ever in the sprint and under a pod, with their Tasks | Every level below the galaxy |
| Backlog (v0) | project → Area Path or Epic sector → Feature → body | A sector's Features and their actual descendants | Every level below the galaxy |

**Source:** `src/shared/hierarchy/` (`solar.ts`, `sprints.ts`, `backlog.ts`) · **Update when:** a
level is added or removed, or a membership rule changes.

**Two hierarchies (decided 2026-10-07; 03 §5a), and a third in v1.** The Backlog view walks the
work-item hierarchy below. The Sprints view (the default until v1; the Solar view below now opens
first) walks how a team plans:
- **A sprint** is an iteration with dates, from the project's iteration tree. Only sprints that have
  started are listed, newest first.
- **Its pods** are the project's saved Area Paths. A pod gathers its sub-paths' items too.
- **A sprint's members** are the Stories and Bugs whose `System.IterationPath` was the sprint at any
  moment between its start and finish (exclusive), and whose area was ever under one of its pods.
  Their Tasks join through parent links; their Features and Epics join as ancestors, for the label
  line.
  - An item shows in a pod while it's in the sprint and its area is under the pod at the playhead.
  - A carry-over keeps its slot and leaves; a mid-sprint addition arrives (INV-14).
  - Items in the sprint but outside every pod go to the tray (INV-10).
  - There's no unlinked-PR reconcile.
- **The sprint is the clock:** the range is its start up to its finish or now, whichever is first.
  Its whole history loads with it.
- The fixture DSL and the derivation apply the same rule (`inSprint`; AC-27).

**The Backlog view's work-item hierarchy:**
- **Actual hierarchy** (from `System.LinkTypes.Hierarchy-*` links, valid at playhead):
  Epic → Feature → (User Story | Bug) → Task. Store whatever parentage actually exists. If an item's
  parent chain doesn't reach a Feature in scope, it's shown in the Uncharted tray (INV-10).
- **Area Path sector:** the Features whose *own* `System.AreaPath` at the playhead is at or under
  the saved path (WIQL `UNDER` semantics). Descendant Stories and Tasks may have other paths; they
  still show under their actual Feature, with their own path in the inspector. A Feature can appear
  in several nested saved sectors and in an Epic sector (INV-09). When a Feature's area changes, its
  projection moves at that source time.
- **Epic sector:** the Features that are hierarchy children of that Epic at the playhead. The Epic
  chooser lists (a) Epics that are direct parents of Features in the user's saved Area Path sectors and
  (b) any Epic found by ID or title search. Epic state visuals stay neutral.
- **Saved Area Path favorite:** local UI configuration keyed by classification-node ID. It has no ADO
  event time. Saving or removing a favorite is never shown as a team event.
- **Reopened overlay:** a Story, Bug, or Feature that was once in category `Completed` and later
  isn't gets a `reopened` flag (repair marks, revived anomaly, re-ignited star). The flag clears
  when the item re-enters `Completed`, and its earlier `Closed` event stays in history. The
  category of an unknown state is `Unknown`, which never counts as `Completed`.

**The Solar view (v1, decided 2026-10-10; 13 §2, 03 §5d).** A third chain over the Sprints data:
project (the galaxy, a workspace) → sprint (the round, a sector of regions) → pod (the region, a
solar system). It is the default when the app isn't pinned. Its members are the Sprints members
above, read through the bundle's domain pack (`resolveRole`, `resolveSignal`), never by type name.
- **The solar system is the bottom level.** There is no close-up, and playback happens in the
  region only: the round and the galaxy don't play (05 §8).
- **A piece belongs to a region** while it's in the round and its area is under that pod, as above.
  A step belongs while its parent piece does.
- The v0 views stay reachable through `STAR_CHART_PARADIGM` and Settings' developer toggle (13 Q9).

## 3. PR and repository rules

*Applies to: both views · packs: SDLC (Todo and CRM fixtures follow the same attachment rules).*

- A PR links to a work item through an `ArtifactLink` relation on the work item (see
  [04 §3](04-ado-ingestion.md#3-fetch-recipes)). The link's validity interval comes from work-item
  updates, so it is usually source-dated.
- **Route shape:** PR → Task is direct evidence. Task → Story/Bug is an actual hierarchy link, drawn
  as a *continuation*. PR → Story/Bug is direct, with no Task. If a Task's parent is missing, the
  route stops at the Task, labeled uncharted.
- **Counting:** a PR is one flight, however many items it links. It counts once per ancestor
  Feature.
- **Stations:** a repo appears as a station in a Feature scene when at least one valid PR link
  connects that Feature's descendants to a PR in that repo. The station is a projection (INV-09).
  Enumerating a repo proves only that it exists, not that it relates to any work.
  - **In the Solar view (v1, as built 2026-10-13; 13 §4.4).** A repo is a facility in a region when
    a PR into it, open at some instant of the round, links a piece there or one of its steps
    (`roundFacts`). It jumps in at the round's first such PR, whose author **summons** it, and stays.
    Each PR is an attachment in a fixed compound slot while open (INV-14). The PR's **work** is the
    pieces it links, a linked step standing in for its parent.
- **Unlinked PRs:** a PR found by the secondary reconcile with no readable work-item link sits in
  its repo's unlinked tray, showing its ID and author.
- **Inaccessible:** if a previously seen item, PR, or link can't be read now, keep the last known
  fact with a stale badge. Never emit a removal event for it (INV-01).
  - **"Can't be read now" (slice 7, decided 2026-10-10)** is a 403 or 404, or a failure that may pass
    (no response, 429, 5xx) once its retries ran out. The next sync asks again.
  - **Never read** (a PR linked from a work item that has always answered 403/404) isn't drawn. It is
    listed in the coverage panel with the status ADO gave.
- **Deleted (slice 7):** a work item that answers **404 during a rescan** (04 §5 step 7) is gone from
  ADO for good. It's removed from the cache: its facts, checkpoint, derived events and links, and
  scope membership. A 403 never counts as deleted.

## 4. Event catalog (pilot)

*Applies to: both views.* The events and their priorities are shared; the accent columns are the v0
views'. Solar reads the same events as neutral moves (*Events as moves*, at the end of this
section).

Events are derived from source facts ([03 §3](03-contracts.md#3-events)). **Priority** feeds the beat
schedule ([05 §3](05-playback.md#3-beat-schedule)). **Accent** names come from the visual brief
([06 §5](06-visual-brief.md#5-accents)); their lengths are in
[15 §8](15-reference.md#8-effects). Scene-diff accents (bottom table) are computed from
before/after snapshots, not stored.

| `EventKind` | Derived from | Persistent effect at playhead | Accent on forward play | Priority | Rules |
|---|---|---|---|---|---|
| `wi_created` | revision 1 | Item exists (Uncharted until it's parented in scope) | `emerge` (type-specific) | High: Feature/Story. Med: Bug. Med-group: Task. Low: Epic and any unmapped type | INV-04 |
| `wi_state_changed` | revision diff of `System.State` | New stage per mapping; `reopened` flag per §2 | `stageShift` (type- and stage-specific) | High: Feature/Story. Med: Bug. Med-group: Task. Low: Epic and any unmapped type | INV-05, INV-11 |
| `wi_assignee_changed` | revision diff of `System.AssignedTo` | Assignment marker moves from A to B, or appears/clears | `captainJump` (out at A or berth, in at B) | Med | INV-07 |
| `wi_area_changed` | revision diff of `System.AreaPath` | Area-sector membership (Features only matter) | `sectorRekey` in sector scenes | Med | §2 |
| `wi_title_changed` | revision diff of `System.Title` | Label text | none | Low | |
| `wi_iteration_changed` | revision diff of `System.IterationPath` ('' for none; decided 2026-10-07) | Sprint membership (Sprints view) | `sectorRekey` | Medium | §2 Two hierarchies |
| `link_parent_added` / `link_parent_removed` | update `relations.added/removed`, `Hierarchy-Reverse` | Orbit valid from/to this time | `orbitDraw` / `orbitFade` | High when the child is a Story or Bug, else Med-group | INV-03 |
| `link_dependency_added` / `link_dependency_removed` | update relations, `Dependency-*` | Dependency lane (same Feature scene), or inspector note | `laneDraw` / `laneFade` | Med | INV-10 |
| `link_pr_added` / `link_pr_removed` | update relations, `ArtifactLink` with name "Pull Request" | Flight route to the item | `routeInk` / `routeRetract` | Med | INV-03, §3 |
| `pr_opened` | PR `creationDate` | Open flight at the repo station | `launch` plus `authorBeam` if the author's identity is known | High | INV-08 |
| `pr_completed` | PR `closedDate`, `status = completed` | Docked flight | `dock` | High | INV-06 |
| `pr_abandoned` | PR `closedDate`, `status = abandoned` | Withdrawn flight | `withdraw` | High | |

**Scene-diff accents** (computed in the renderer, so not events):

| Condition between previous and next snapshot | Accent |
|---|---|
| A Feature goes from 0 to 1 valid Story/Bug children | `starBloom` (corona forms) |
| A repo station newly appears in the current Feature scene | `stationPowerUp` |
| An Epic or Area sector's member count or recent-event label changes | `sectorPulse` (one per beat, max) |

**Priority order** (used by the beat budget): `high` > `medium` > `mediumGroup` > `low`.
Priorities are fixed per event and never depend on the scene.

**Not events:**
- Refreshes and sync discoveries.
- Favorite saves.
- Reviewer votes (the current votes, counted by kind, are shown on a station's PR row and in the PR's details only, as its stat line, 23 B1;
  they are never an event, never on the ladder, and no vote history is kept). The approvers standing at
  completion ride on `pr_completed` as `approvedBy` (approved, or approved with suggestions; sorted, never invented);
  approving is never an event or activity of its own (INV-07, INV-08).
- Description or comment edits.
- **Observations.** These are facts known only from the current state, with no source time: a
  link seen in the current relations with no matching update, or a PR status found changed during
  a poll without a `closedDate`. They are stored as `Observation` records
  ([03 §4](03-contracts.md#4-scopehistory--the-main--renderer-bundle)), never as events. They
  appear only in the `currentObserved` lens and in the inspector.

### Events as moves (Solar)

*Applies to: Solar · packs: all (each pack's adapter reads its own events; SDLC, Todo and CRM use
the default reading below).* Every event is read once, through the bundle's mapping, into neutral
**moves** (`Move`, 14 §2.2). Maneuver rules and achievements read moves, never raw events, so no
rule names a source type or state. Observations are undated and never move (INV-02).

| `EventKind` | Neutral move (`Move.m`) | Notes |
|---|---|---|
| `wi_created` | `appear` | With its role, its signal (`resolveSignal`) and its seat (the assignee, or none) |
| `wi_state_changed` | `climb` | From and to signals; the actor is `changedBy` |
| `wi_assignee_changed` | `reseat` | From and to seats (null is the frontier) |
| `wi_area_changed`, `wi_iteration_changed` | `enter` or `leave` | Only when the piece crosses the scope's edge; otherwise nothing |
| `wi_title_changed` | `retitle` | Plays nothing |
| `link_parent_added` / `_removed` | `bind` / `unbind` | `rel: 'step'` for a step's parent, else `'container'` |
| `link_pr_added` / `_removed` | `bind` / `unbind` | `rel: 'attachment'` |
| `link_dependency_added` / `_removed` | none | Not on the v1 board |
| `pr_opened` | `attach` | Its facility (the repo) and author |
| `pr_completed` | `settle` | To the attachment's Accomplished signal, with `approvedBy` as approvers |
| `pr_abandoned` | `settle` | To the attachment's Off signal (a ghost), with no approvers |

An item whose type has no role makes no move. Which maneuver a move plays is
[15 §9](15-reference.md#9-actions--what-you-see); the rules, their lengths and tiers are
[15 §7](15-reference.md#7-maneuvers).

**Source:** `src/shared/engine/moves.ts` (`ContractReader.read`), `Move` in
`src/shared/engine/types.ts`, `EventKind` in `src/shared/contracts/events.ts` · **Update when:** an
event kind or a move kind is added, or the default reading changes.

## 5. Replay ordering

*Applies to: both views.*

Apply events ordered by `(occurredAt, precedence, eventKey)`:

1. Precedence within the same instant: `wi_created` < `link_parent_*` < `wi_area_changed` and
   `wi_iteration_changed` (equal) < `wi_state_changed` < `wi_assignee_changed` < `wi_title_changed` < `link_dependency_*` <
   `link_pr_*` < `pr_opened` < `pr_completed` / `pr_abandoned`.
2. If one revision changes several fields, it yields several events with the same `occurredAt`,
   ordered by that precedence.
3. `eventKey` string order breaks any remaining ties.

**Time boundaries:**
- `snapshotAt(t)` includes every event with `occurredAt ≤ t`.
- The playback range is `[startUtc, endUtc)`.
- Events with `occurredAt < startUtc` make up the initial state, without accents. An event exactly
  at `startUtc` is the first beat's material, and it is not shown before that beat plays
  (05 §1).
- Events at or after `endUtc` are left out of the bundle.

**Story time (Solar playback; decided and built 2026-10-15, 22 C2).** A solar region's playback
presents events in *story time*: each event's real `occurredAt`, except where an arc or a story's day
moves it (05 §8.3a: a close, with the piece's work since the merge's day, to just after the last merge
that served it within 24 working hours, possibly a day or two back; a story's other work that day to
its culmination, earlier or later that day). It moves only a piece's work (state, assignee and
title changes), never across a day except back into an arc, never out of order within a piece, and
never across what places the piece or its item: its creation, a move into or out of the area or
sprint, a parent or PR link (22 C9 review). An arc that would cross one doesn't form, so a PR linked
after its merge makes no arc. The rules above then apply to story times, so replay stays
deterministic (INV-12) and a seek still snaps to exactly what playing draws (INV-15). The record is
unchanged: ingest, History's rows and every v0 view keep the real `occurredAt`.

## 6. Lenses

*Applies to: both views.*

- **`knownThen`** (the default): the fold of every event with `occurredAt ≤ t`. A link is present
  only when its validity interval contains `t`. Observations are ignored.
- **`currentObserved`** (retrospective):
  - *Work items:* the same items and field values as `knownThen` at `t`: existence, state, title,
    assignee, and area.
  - *Links:* the link set taken as of the **end of the range**, applied between the items that exist
    at `t`. That set includes source-dated links whose interval covers the range end, plus all
    observations.
  - Links removed before the range end are absent.
  - A link that is present in `currentObserved` but absent in `knownThen` at `t` is marked
    `uncertain: true`. This covers links added later than `t`, and every observation.
  - *PRs:* a `pr_status` observation overrides `PrState.status`, with `statusUncertain: true`.
- **An undated removal of a dated link** (an `Observation` with `op: 'removed'`): in `knownThen`, the
  link stays present from its dated start but is marked `uncertain: true`, because its end is
  unknown. In `currentObserved`, it's absent. This is the only case where `knownThen` shows an
  uncertain link.
