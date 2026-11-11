# 03 — Contracts

**Status:** current as of 2026-10-27 (through v1.3 Block B). Covers the shapes both views share (keys, facts, events, the
bundle, IPC, SQLite, fixtures, test hooks and the dev log), the v0 views' scene model (§5–§5c) and
Solar's v1 seams (§5d), read against the working tree on 2026-10-13.

**Normative.** This doc defines the types, keys, storage schema, fixture format, and toolchain. Code
in `src/shared/contracts/` should mirror it closely. If code and doc diverge, fix one of them in the
same change. Meaning comes from [02-domain-rules.md](02-domain-rules.md). Presentation values
(lengths, colours, floors, timings, command lists) live in [15-reference.md](15-reference.md); this
doc keeps the shapes and links there for the numbers.

**Contract index.**

| § | Defines | Code | Applies to |
|---|---|---|---|
| [0](#0-toolchain-and-layout) | Toolchain, source layout, pilot limits | `package.json`, `src/shared/limits.ts` | both views |
| [1](#1-identity-and-keys) | `UtcMs`, `Guid`, `CanonicalKey`, `normalizeGuid` | `src/shared/contracts/keys.ts` | both views |
| [2](#2-source-facts-main-process-only) | Source facts (what is cached) | `src/shared/contracts/facts.ts`, `src/shared/ingest/parse.ts` | both views |
| [3](#3-events) | Events, payloads, event keys, observations | `src/shared/contracts/events.ts`, `src/shared/ingest/derive.ts` | both views |
| [4](#4-scopehistory--the-main--renderer-bundle) | `ScopeHistory`, coverage, `StateMapping`, loaded-by-level fields | `src/shared/contracts/history.ts`, `ipc.ts` (`scopeHistorySchema`) | both views |
| [5](#5-snapshot-and-view-model) | Snapshot, `ViewNode`, `ViewGraph`, v0 layout slots | `src/shared/contracts/view.ts`, `src/shared/replay/snapshotAt.ts`, `src/shared/scene/` | v0 views (snapshot: both) |
| [5a](#5a-the-hierarchy-a-chain-of-scene-levels-decided-2026-10-07) | Hierarchies, `LevelDef`, scene keys, `SourceCaps` | `src/shared/hierarchy/`, `src/shared/contracts/source.ts`, `src/main/source/` | both views |
| [5b](#5b-sprints-decided-2026-10-07) | Sprint sectors, pods, the paradigm | `src/shared/hierarchy/sprints.ts`, `contracts/history.ts`, `contracts/ipc.ts` | both views (Solar's round is a sprint) |
| [5c](#5c-streaming-a-sprint-decided-2026-10-08) | The sprint stream and its scheduler | `src/main/sync/sprintStream.ts`, `scheduler.ts` | both views · ADO mode |
| [5d](#5d-v1-additions-17-built-2026-10-10-to-2026-10-12) | v1: roles, signals, stage code, packs, moves, round facts, solar plan, maneuvers, achievements, assets, themes, commands, labels, settings | `src/shared/engine/`, `src/shared/packs/`, `src/shared/contracts/{maneuver,settings,view}.ts`, `src/renderer/src/{chart,theme,v1,settings}/` | Solar |
| [6](#6-ipc-api) | `window.starChart`, IPC channels, user settings | `src/shared/contracts/ipc.ts` (`CH`, `StarChartApi`), `src/preload/index.ts`, `src/main/index.ts`, `src/main/userSettings.ts` | both views |
| [7](#7-playback-types) | Playback session, beats, schedule options | `src/shared/contracts/playback.ts`, `src/shared/playback/` | both views |
| [8](#8-fixtures) | Fixture DSL and scenarios | `fixtures/dsl.ts`, `fixtures/scenarios/`, `fixtures/ado.ts`, `src/main/fixtures.ts` | both views |
| [9](#9-sqlite-schema-v1-main-process) | SQLite schema and migrations | `src/main/db/migrations/*.sql`, `src/main/db/cache.ts` | both views · ADO mode |
| [10](#10-test-hooks) | Test hooks, the dev log and its events | `src/renderer/src/testHooks.ts`, `src/main/devlog.ts`, `src/main/redact.ts`, `src/renderer/src/devlog.ts` | both views |

**Source:** the files in the Code column · **Update when:** a contract file gains, renames or drops
an exported type, field, channel or table; add or fix its row here in the same change.

## 0. Toolchain and layout

*Applies to: both views.*

| Concern | Choice (pinned at scaffold time) | Notes |
|---|---|---|
| Runtime | Electron **44.x** (Node 24), macOS arm64 | The `electron` package downloads its binary on first run, not at install |
| Scaffold | **electron-vite 5**, React + TS template | Bump the template's Electron version to 44 after scaffolding |
| UI | React 19, CSS modules. Zustand for renderer UI state | No UI kit is required |
| Canvas | **PixiJS 8.21.0**, `preference: 'webgl'` | GLSL shaders need WebGL. Use imperative scene adapters, not `@pixi/react` |
| SQLite | **`node:sqlite`** (`DatabaseSync`) behind the `Cache` class (`src/main/db/cache.ts`) | Mark it external in the Vite main-process build. Fallback: better-sqlite3 v13 |
| Validation | zod, for every IPC request and response | |
| Tests | Vitest (unit, golden) and Playwright `_electron` (e2e, screenshots) | For stable screenshots, use the `window.__starChartReady` hook and `maxDiffPixelRatio: 0.02` |
| Packages | Public npm (prototype) | Switch to the Federation's Artifactory before sharing builds |

```
src/
  main/        index.ts (IPC handlers)  ado/ (client, http transport, probe, service)  db/ (cache, migrations)
               sync/ (sync, levels, sprintStream, scheduler, refresh, missing, wiql)  source/  credentials/
               avatars/  devlog.ts  redact.ts  userSettings.ts  fixtures.ts
  preload/     index.ts, which exposes window.starChart (see §6)
  renderer/src/ App.tsx, panels/ (React)  chart/ (ChartApp, scenes/, art/, assets/, fx/, holo/)
               hierarchy/  theme/ (starChart/)  settings/  v1/  gallery/ (development only)  data/
  shared/      contracts/ (types and zod)  replay/ (snapshotAt)  scene/ (projectScene, project/, layout)
               playback/ (beat schedule)  hierarchy/  ingest/  engine/ (v1)  packs/ (v1)  limits.ts
fixtures/      dsl.ts  ado.ts (fake ADO)  scenarios/ (DSL, see §8; v1/)  generated/ (build output, gitignored)
tests/         unit/  golden/  e2e/  drive/
```

`src/shared` is pure TypeScript with no Electron, DOM, or Pixi imports, so all of it can be tested in
Node.

**Limits (`src/shared/limits.ts`, tunable):** `MAX_FEATURES_PER_SECTOR = 15`,
`MAX_CHILDREN_PER_FEATURE = 24`, `MAX_TASKS_PER_BODY = 24`, `MAX_TASK_DOTS_IN_SYSTEM = 8`,
`MAX_STATIONS_PER_FEATURE = 6`, `BACKFILL_MAX_WEEKS = 4`, `DEFAULT_RANGE_DAYS = 7`,
`MAX_SCOPE_MEMBERS = 3000` (§5c). When a limit is exceeded, the extra items move into an overflow
token with a count. The app never drops data silently. (superseded 2026-10-13: 8 children, 6 Tasks
and 4 stations were the slice-0 values.) The same file holds the version stamps `LAYOUT_VERSION = 2`
(v0 boards), `SYSTEM_LAYOUT = 'board'`, `ART_VERSION = 1` and `SHIP_DESIGN_VERSION = 1`; Solar's
layout version is `SOLAR_LAYOUT_VERSION` ([15 §5](15-reference.md#5-sizes-floors-and-layout)).

## 1. Identity and keys

*Applies to: both views.*

```ts
type UtcMs = number;                      // UTC epoch milliseconds, everywhere: TS, SQLite, IPC
type Guid = string;                       // always normalizeGuid()'d

// Lowercase, hyphenated 8-4-4-4-12 form. Accepts braces, uppercase, or no hyphens.
// Throws on anything else.
declare function normalizeGuid(raw: string): Guid;

type OrgKey = Guid;                       // from GET {org}/_apis/connectionData -> instanceId
type CanonicalKey =
  | `proj:${OrgKey}:${Guid}`                     // project
  | `wi:${OrgKey}:${number}`                     // work item (any type)
  | `repo:${OrgKey}:${Guid}`                     // repository
  | `pr:${OrgKey}:${Guid}:${number}`             // pull request (repoId, prId)
  | `id:${OrgKey}:${Guid}`                       // identity (captain)
  | `area:${OrgKey}:${Guid}:${number}`           // area node (projectId, nodeId)
  | `iter:${OrgKey}:${Guid}:${number}`;          // iteration node (projectId, nodeId): a sprint (§5b)
// keys.project / workItem / repo / pr / identity / area / iteration build them; keyKind(k) and
// workItemId(k) read them back.
```

- Identities are keyed by the identity-ref `id`. `uniqueName` is kept as a secondary match. If two
  IDs share a `uniqueName`, keep both and flag it in debug; never merge them silently.
- Group reviewers and assignees (`isContainer: true`) are not captains.

## 2. Source facts (main process only)

*Applies to: both views · ADO mode.*

These are normalized projections of ADO responses. They are what gets persisted, never whole payloads
(INV-16, INV-18). Each carries `observedAt: UtcMs`.

```ts
interface IdentityRefFact { id: Guid; displayName: string; uniqueName?: string; imageUrl?: string }  // imageUrl: the picture link (04 §7)

interface RevisionFact {                   // one per work-item revision
  itemId: number; rev: number; changedAt: UtcMs;   // System.ChangedDate
  type: string; title: string; state: string; areaPath: string;
  iterationPath?: string;                  // System.IterationPath; absent in revisions cached before 2026-10-07
  boardColumn?: string;                    // System.BoardColumn (v1.3 B4): its column on the team board; absent when not on one, and before 007
  boardColumnDone?: true;                  // System.BoardColumnDone: the Done half of a split column (only when true)
  seed?: true;                             // B5 (04 §5c): a seeded item's one revision (rev 1 at its creation, current fields); has a checkpoint but per-item paths read the item whole
  assignedTo: IdentityRefFact | null; projectId: Guid;
  changedBy: IdentityRefFact | null;       // System.ChangedBy: the actor (04 §4)
}

type RelationTarget =
  | { kind: 'wi'; id: number }
  | { kind: 'pr'; projectId: Guid; repoId: Guid; prId: number }
  | { kind: 'other'; url: string };                // commits, branches, hyperlinks: kept but ignored

interface RelationFact {
  rel: 'parent' | 'child' | 'predecessor' | 'successor' | 'pr' | 'other';
  rawRel: string; target: RelationTarget;
}

interface UpdateFact {                     // one per work-item update
  itemId: number; updateId: number; rev: number | null;
  sourceAt: UtcMs | null;                  // see 04 §4. null => undated
  added: RelationFact[]; removed: RelationFact[];
}

interface PullRequestFact {
  projectId: Guid; repoId: Guid; prId: number; title: string;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: UtcMs; closedAt: UtcMs | null; author: IdentityRefFact | null;
  closedBy: IdentityRefFact | null;        // who completed or abandoned it
  targetRef: string; adoUrl: string;
  lastCommit?: string;                     // B1: lastMergeSourceCommit.commitId; a push moves it (skips re-reading iterations/changes)
  stats?: PrStats;                         // B1: read beside the record (pull_requests.stats_json); absent = never read
}

// The PR stat line's facts (B1; 04 §6a-1). Each is optional: a call that failed leaves its fact out.
interface PrVotes { approved?: number; suggestions?: number; waiting?: number; rejected?: number }  // current votes 10, 5, -5, -10; nonzero only
interface PrStats {
  votes?: PrVotes;                         // absent when nobody has voted
  pushes?: number;                         // the PR's iterations
  threads?: number;                        // threads a person started (no system, typed or deleted ones)
  files?: number;                          // files changed in the last iteration
}

type RunState = 'passed' | 'partly' | 'failed' | 'canceled' | 'running' | 'queued';   // B2: partly = partiallySucceeded
// Latest build on the default branch: `at` is its finish time (start if running, queue time if queued). In the bundle
// (entities.repos[].run) it also carries `readAt` (the clock when it was read); its age counts to max(syncedAt, readAt).
interface RepoRun { state: RunState; at: UtcMs }
interface RepoFact {
  projectId: Guid; repoId: Guid; name: string; adoUrl: string;
  defaultBranch?: string;   // B2: full ref; the run is read on it (repositories.default_branch)
  run?: RepoRun;            // B2: read beside the record (repositories.run_json); absent = no pipeline run, or not read
  runReadAt?: UtcMs;        // B2: when it was last read; cache only, never in the bundle
}
interface ProjectFact { projectId: Guid; name: string; adoUrl: string }
interface AreaNodeFact { projectId: Guid; nodeId: number; path: string; hasChildren: boolean }
interface IterationNodeFact { projectId: Guid; nodeId: number; path: string; startUtc: UtcMs | null; finishUtc: UtcMs | null }
interface CurrentItemFact {                // an item as ADO says it is now (hydrate's fields; 04 §5a)
  itemId: number; projectId: Guid; type: string; title: string; state: string; areaPath: string;
  iterationPath?: string; assignedTo: IdentityRefFact | null; createdAt: UtcMs; changedAt: UtcMs;
}
```

## 3. Events

*Applies to: both views.* In Solar, each event is read once as a neutral move (§5d, Moves).

```ts
type EventKind =
  | 'wi_created' | 'wi_state_changed' | 'wi_assignee_changed' | 'wi_area_changed' | 'wi_title_changed'
  | 'wi_iteration_changed'                     // §5b
  | 'link_parent_added' | 'link_parent_removed'
  | 'link_dependency_added' | 'link_dependency_removed'
  | 'link_pr_added' | 'link_pr_removed'
  | 'pr_opened' | 'pr_completed' | 'pr_abandoned';

type Priority = 'high' | 'medium' | 'mediumGroup' | 'low';   // assigned per 02 §4; ranked high > medium > mediumGroup > low

interface EvidenceRef {                        // shown in the inspector as "from revision 14, 2026-09-22 14:03Z"
  source: 'revision' | 'update' | 'pullRequest';
  ref: string;                                 // exact formats: `wi:{id}:r{rev}` | `wi:{id}:u{updateId}` | `pr:{repoId}:{prId}`
  at: UtcMs | null;
}

interface TimelineEvent<K extends EventKind = EventKind> {
  eventKey: string;                            // deterministic, see below
  kind: K;
  occurredAt: UtcMs;                           // always a source timestamp (INV-01); undated facts are Observations
  observedAt: UtcMs;
  entityKey: CanonicalKey;                     // the work item or PR the event is about
  projectKey: CanonicalKey;
  priority: Priority;
  payload: EventPayload[K];
  evidence: EvidenceRef[];
  changedBy?: CanonicalKey | null;             // who made the change (System.ChangedBy; a PR's author when opened,
                                               // its closer when completed or abandoned). The actor, never the
                                               // assignee (INV-07): the source of the cause → effect beam (05 §5)
}

interface EventPayload {
  wi_created:           { type: string; title: string; state: string; areaPath: string; assigneeKey: CanonicalKey | null;
                          iterationPath?: string };   // its sprint at creation, only when it has one
  wi_iteration_changed: { from: string; to: string }; // System.IterationPath; '' for none
  wi_state_changed:     { from: string; to: string };
  wi_assignee_changed:  { from: CanonicalKey | null; to: CanonicalKey | null };
  wi_area_changed:      { from: string; to: string };
  wi_title_changed:     { from: string; to: string };
  link_parent_added:    { childKey: CanonicalKey; parentKey: CanonicalKey };
  link_parent_removed:  { childKey: CanonicalKey; parentKey: CanonicalKey };
  link_dependency_added:   { predecessorKey: CanonicalKey; successorKey: CanonicalKey };
  link_dependency_removed: { predecessorKey: CanonicalKey; successorKey: CanonicalKey };
  link_pr_added:        { prKey: CanonicalKey; itemKey: CanonicalKey };
  link_pr_removed:      { prKey: CanonicalKey; itemKey: CanonicalKey };
  pr_opened:            { repoKey: CanonicalKey; title: string; authorKey: CanonicalKey | null; targetRef: string };
  pr_completed:         { repoKey: CanonicalKey; approvedBy?: CanonicalKey[] };   // approvedBy: reviewers whose standing vote
                                               // at completion approved (10, or 5 with suggestions), sorted; empty when
                                               // unknown, never invented. Drives the review formation (06 §5). Not
                                               // activity: approving never moves a ship's resting place (INV-07)
  pr_abandoned:         { repoKey: CanonicalKey };
}
```

**Event keys.** Keys are built as `kind:entityKey:sourceRef`:

| Event kinds | `sourceRef` |
|---|---|
| `wi_*` | `r{rev}` |
| `link_*` | `u{updateId}:{targetKey}` |
| `pr_*` | `pr` |

If an update touches the same link twice, keep the last touch. The same source facts always yield the
same keys (INV-13).

**Links are stored once, from a canonical side.** Updates on both ends report a link, so exactly
one side counts:

| `rawRel` | `RelationFact.rel` | Canonical? | Stored as |
|---|---|---|---|
| `System.LinkTypes.Hierarchy-Reverse` | `parent` | **yes** (child side) | child → parent |
| `System.LinkTypes.Hierarchy-Forward` | `child` | no | used only to fill in a missing `sourceAt` |
| `System.LinkTypes.Dependency-Reverse` | `predecessor` | **yes** (successor side) | predecessor → successor |
| `System.LinkTypes.Dependency-Forward` | `successor` | no | fallback for `sourceAt` only |
| `ArtifactLink` with name `Pull Request` | `pr` | yes (the work-item side is the only side) | pr → item |
| anything else | `other` | ignored | not stored |

**Observations** are facts with no source time (INV-02). They are never events.

```ts
interface Observation {
  obsKey: string;                              // `obs:{kind}:{op}:{fromKey}:{toKey}`, or `obs:pr_status:{prKey}:{status}`
  kind: 'link_parent' | 'link_dependency' | 'link_pr' | 'pr_status';
  op: 'present' | 'removed';                   // 'removed' only comes from an undated update
  fromKey: CanonicalKey; toKey?: CanonicalKey; status?: 'active'|'completed'|'abandoned';
  confidence: 'unknown' | 'observed_only';     // an undated update vs. seen only in the current state
  observedAt: UtcMs; evidence: EvidenceRef[];
}
```

If the same `obsKey` comes from both an undated update and the current relations, keep a single
observation with confidence `'unknown'` and merge the evidence.

**`entityKey` for `link_*` events** is the canonical side's work item: the child for parent links,
the successor for dependency links, and the item for PR links. When the canonical item isn't in the
bundle, for example a successor that's out of scope, take the fact from the other side's update
instead. `entityKey` stays the canonical side's key either way.

## 4. `ScopeHistory` — the main → renderer bundle

*Applies to: both views.*

The renderer loads one bundle per scope and range, then replays it in memory. It never queries during
playback.

```ts
type SectorRef =
  | { kind: 'area'; areaKey: CanonicalKey; path: string }
  | { kind: 'epic'; epicKey: CanonicalKey }
  | SprintSector;                          // §5b; Solar's round and the Sprints view

interface ScopeHistory {
  schemaVersion: 1;
  derivationVersion: number;
  scope: { orgKey: OrgKey; projectKey: CanonicalKey; sector: SectorRef };
  range: { startUtc: UtcMs; endUtc: UtcMs };
  coverage: { syncedAt: UtcMs | null; historyFrom: UtcMs; partial: boolean; notes: string[] };
  entities: {
    projects: { key: CanonicalKey; name: string; adoUrl: string }[];
    workItems: { key: CanonicalKey; type: string; adoUrl: string }[];   // mutable attributes come from events
    repos: { key: CanonicalKey; name: string; adoUrl: string; run?: RepoRun & { readAt?: UtcMs } }[];   // run: the station plate's last-run line (B2); omitted when none
    prs: { key: CanonicalKey; repoKey: CanonicalKey; adoUrl: string; stats?: PrStats }[];   // stats: the plate's PR stat line (B1); omitted when empty
    captains: { key: CanonicalKey; displayName: string; shipSeed: number; callSign: string;
                avatar?: string;       // a picture as an inline data:image URL (validated): ADO's, or one added by hand
                handAdded?: boolean }[];  // set by main when the picture is the user's own (slice 6)
  };
  events: TimelineEvent[];               // sorted per 02 §5; every event with occurredAt < range.endUtc
  observations: Observation[];           // for the currentObserved lens and the inspector
  unlinkedPrs: CanonicalKey[];           // PRs in scope repos that have no readable work-item link
  stateMapping: StateMapping;            // contents of config/state-mapping.json
  // v1.3 B4: the scope's team board (04 §3 boards): its columns in order, and where each item sat in them over time
  // (`placements`: an entry whenever an item's column or Done half changes, `column: ''` when it left the board).
  // Absent when no board was read. Only the v0 board reads it (06 §3); Solar never does, and no event carries a column.
  board?: { columns: { name: string; type: 'incoming' | 'inProgress' | 'outgoing'; split: boolean }[];
            placements: { key: CanonicalKey; at: UtcMs; column: string; done: boolean }[] };
}
```

**Pilot:** each work item's history is loaded from its creation, so replay starts from an empty
state. For scale-up (v1.3 B5, 04 §5c) an item the revisions feed's window shows nothing of is seeded: its current fields as one `RevisionFact` (`rev: 1`, `seed: true`, at its creation time; a stored fact, not an `initial` in `ScopeHistory`: **a departure from this paragraph's earlier plan**). It replays from its present state; its earlier changes and the dating of links made before the window are absent (04 §5c lists exactly what differs). A batch of 300 or more is read from the feed.

**What a bundle contains.** Both `toHistory` and ingest must follow these rules:
- **Work items:**
  - Every Feature that was a scope member at any time from `coverage.historyFrom` onward.
  - Every item linked beneath those Features at any time (transitively).
  - Each such item's parent chain up to its Epic, and the Epic itself. Epics and parents that are
    out of scope are included as entities with their events, for the breadcrumb and inspector, but
    are rendered only in their own sector.
- **PRs:** every PR ever linked to an included item, plus `unlinkedPrs`.
- **Events:** every event for those entities with `occurredAt < range.endUtc`, from creation
  onward.
- **Ordering:** arrays are sorted by key, or by 02 §5 order for `events`, so bundles can be
  compared byte for byte.

**Coverage.** `historyFrom = range.endUtc − BACKFILL_MAX_WEEKS × 7 days`. That's the window used
for scope membership; item histories still go back to creation. `partial` is true when any sync step
recorded a gap: a truncated query, 403s on items seen before, an unnarrowable WIQL result, a PR or
repo that couldn't be read (`missing`), the member cap (`SCOPE_CAPPED_NOTE`), or a token refused
part-way through a stream. `notes` lists each reason, plus a fixed note on area sampling (04 §3), or
on sprint sampling when ADO refuses `EVER` (04 §5b). Fixtures set `partial: false` and `notes: []`.

**Bundle equivalence (AC-27).** Ingest takes an injected `Clock`. Two bundles are equivalent when
they're deep-equal after removing `observedAt` everywhere, `coverage.syncedAt`, and
`coverage.notes` (ingest adds the fixed area-sampling note; fixtures carry none; slice 4).

**Observation evidence** cites the item's current state, not one update: `wi:{id}:u0` with
`at: null` (for a PR link, the work item's ID).

**Loaded by level (decided 2026-10-07; 04 §5a).** A bundle loaded level by level carries the
scope's current state alongside whatever history is loaded:

```ts
interface ScopeHistory {                 // additions, all optional (absent in fixtures and full syncs)
  current?: { at: UtcMs; workItems: CurrentWorkItem[]; prs: CurrentPr[]; links: { kind; fromKey; toKey }[] };
  coverage: {
    history?: CanonicalKey[];            // entities whose history is loaded; absent = all of them
    explored?: CanonicalKey[];           // Features whose subtrees are loaded
    more?: { team: boolean; features: CanonicalKey[] };   // where Load more applies
    played?: { scene: 'team' | CanonicalKey; days: number; at: UtcMs;   // history requested, per scene
      missing?: CanonicalKey[];   // B7: items whose reads failed (5xx, timeout): Retry asks for these only
      capped?: true }[];          // B7: the revisions feed stopped at its page cap (04 §5c)
    stale?: CanonicalKey[];              // read before, unreadable now: last known facts, clock badge (vessels too)
    missing?: { kind: 'pr' | 'repo'; key: CanonicalKey; status: number; seen: boolean }[];   // couldn't be read (slice 7)
  };
  entities: { childCounts?: { key; stories: number; bugs: number }[] };   // unexplored Features' miniatures
}
type SyncLevel = { kind: 'team' } | { kind: 'feature'; featureKey } | { kind: 'more' }
  | { kind: 'history'; scene: { kind: 'team' } | { kind: 'feature'; featureKey }; days: number; retry?: true } | { kind: 'catchUp' }   // retry (B7): only the scene's missing items
  | { kind: 'sprint' };                  // §5c: a sprint's first look, then the stream (Solar and Sprints)
// history.days is 1..90 in syncLevelSchema; the Backlog offers HISTORY_RANGES (1, 7, 14, 30)
```

`snapshotAt` replays an entity from events when it's in `coverage.history`, and otherwise takes it
from `current` at every instant; a link comes from events when its canonical side has history. A
scene with no history has no beats. With everything loaded, the bundle's events equal `toHistory`'s
(AC-27). The current state matches the fixture's state at the range end under the Retrospective lens
(today's links), for every item that hangs under a Feature now (`tests/unit/levels.test.ts`).

**Web links.** The derivation keeps `adoUrl` as ADO sent it (often empty). Main fills empty links
from canonical keys before a bundle crosses IPC, and `openInAdo` resolves from keys (slice 4).

```ts
// The shape of config/state-mapping.json
interface StateMapping {
  version: number; unknownStage: string;
  types: Record<string, {                 // key = ADO work item type name
    kind: 'epic'|'feature'|'story'|'bug'|'task';
    states: Record<string, { category: string; stage: string }>;   // key = raw state name
  }>;
}
// Any type not listed has kind 'other'. Lookup: types[type]?.states[state] ?? { category: 'Unknown', stage: unknownStage }
```

**v1 (14 §2.1, 17 W0-T1).** The mapping and the bundle gain optional fields, all declared in
`scopeHistorySchema` so zod keeps them across IPC (it strips unknown keys). v0 code reads the same
mapping unchanged; the v1 fields are in §5d.

## 5. Snapshot and view model

*Applies to: both views* (the snapshot, `ViewNode` and `ViewGraph`); *the v0 views* (the layout
slots below). Solar's projection is in §5d.

```ts
type Lens = 'knownThen' | 'currentObserved';

interface WorkItemState {
  key: CanonicalKey; type: string; kind: 'epic'|'feature'|'story'|'bug'|'task'|'other';
  title: string; rawState: string; category: string; stage: string; reopened: boolean;
  areaPath: string; iterationPath?: string;   // iterationPath only when set (§5b)
  assigneeKey: CanonicalKey | null;
  assignedAt: UtcMs | null;              // when the current assignee took it; a ship anchors to the assignment held longest
  parentKey: CanonicalKey | null;        // convenience copy of this item's parent link in `links`
  lastEventAt: UtcMs | null;
}
interface PrState { key: CanonicalKey; repoKey: CanonicalKey; title: string;
  status: 'active'|'completed'|'abandoned'; statusUncertain: boolean; authorKey: CanonicalKey | null }

interface SnapshotLink {
  kind: 'parent' | 'dependency' | 'pr';
  fromKey: CanonicalKey; toKey: CanonicalKey;   // child->parent, pred->succ, pr->item
  uncertain: boolean;                           // see 02 §6; in knownThen, true only for an undated removal
}

interface Snapshot {
  atUtc: UtcMs; lens: Lens;
  workItems: ReadonlyMap<CanonicalKey, WorkItemState>;
  prs: ReadonlyMap<CanonicalKey, PrState>;
  links: SnapshotLink[];                 // sorted by (kind, fromKey, toKey)
}

// Pure. Must return the same result regardless of call history (INV-12).
// Implementation: sorted events, a reducer, and checkpoints every 256 events for fast seek.
// Lens semantics are in 02 §6.
declare function snapshotAt(h: ScopeHistory, atUtc: UtcMs, lens: Lens): Snapshot;
```

**Scenes.**

```ts
type SceneKey = 'galaxy' | `${string}:${string}`;   // `level[:variant]:key`, built only by sceneKey.ts (§5a)
type BacklogSceneKey =                   // the Backlog chain's keys, for tests that build them by hand
  | `galaxy`
  | `sector:${'area'|'epic'}:${CanonicalKey}`
  | `feature:${CanonicalKey}`
  | `body:${CanonicalKey}`;              // a Story or Bug close-up

type NodeKind = 'galaxy'|'sector'|'star'|'planet'|'anomaly'|'missionPoint'|'station'|'flight'
              |'captain'|'assignmentBeacon'|'trayItem'|'overflow'
              |'seat'|'objective'|'threat'|'facility';   // v1 (§5d); the v1 ship stays 'captain'
type EdgeKind = 'orbit'|'route'|'routeContinuation'|'dependency';

interface ViewNode {
  projectionKey: string;                 // `${sceneKey}|${canonicalKey}|${role}`
  canonicalKey: CanonicalKey; kind: NodeKind; role?: string;
  world: { x: number; y: number; r: number };   // r = visual radius; hit radius >= max(r, 12px on screen)
  stage: string;                         // from the state mapping, or a kind-specific value like 'station.active'
  seed: number;                          // art seed from canonicalKey (INV-12)
  label: string; typeName?: string; rawState?: string;   // typeName = ADO work item type, e.g. "User Story"
  meta?: string;                         // secondary label line, e.g. "#201 · Resolved", "PR 9001 · active"
  detail?: string;                       // the inspector's line where it says more than meta (a Solar pod star's done count, 19 P1); unset: meta
  avatar?: { initials: string; color: number; image?: string };   // label avatar (06 §4): a circle; a square on Solar's holo plates (19 L8)
  openable: boolean;                     // true when openInAdo(canonicalKey) would succeed (false in fixture mode)
  selectable: boolean;                   // false for tiny decorative projections (mini planets, Task dots in a system view)
  labelled: boolean;                     // draw a DOM callout (06 §4 label policy)
  zoomTo?: SceneKey;                     // scene opened when activated (click, or the inspector's Enter button)
  labelSide?: 'above' | 'below' | 'left' | 'right';   // the layout's preferred label side (06 §4)
  labelLayout?: 'horizontal' | 'vertical';            // which sides the label layer tries first
  labelCompact?: boolean;                // always the compact label unless pointed at or selected (dense galaxies; the region's star, v1.1)
  attach?: { to: string; dirX: number; dirY: number };   // placed beside another node in screen terms (06 §2)
  track?: { rx: number; ry: number; span: number };      // a ship at home on its board lane's track (below)
  along?: { from: string; to: string; t: number; normal: number;
            lane?: { y: number; halfHeight: number; x?: number } };   // an in-flight PR on its route (06 §3)
  slot?: number;                         // layout slot, for map debug
  radar?: { angle: number; band: 'ready' | 'underway' | 'accomplished' };   // a Task in a close-up's radar (below)
  labelOnHover?: boolean;                // label only on hover or selection (Ready and Accomplished radar Tasks; every solar piece, 19 L7)
  tally?: { band: 'ready' | 'underway' | 'accomplished'; count: number }[];  // a body's radar counts, a label line
  flags: { reopened?: boolean; uncertain?: boolean; stale?: boolean; selected?: boolean;
           quiet?: boolean; unexplored?: boolean };
  evidence: EvidenceRef[];
  // v1 fields (asset, piece, cluster, compound, activity, platform, labelDir): §5d
}
interface ViewEdge {
  key: string; kind: EdgeKind; from: string; to: string;   // projectionKeys
  uncertain: boolean; evidence: EvidenceRef[];
  geometry?: { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; band?: boolean;
               arc?: { from: number; to: number } };   // orbit edges; band: a radar Task's band (the guides
                                         // come from ViewGraph.radar); arc: a partial orbit (a solar seat's)
}
interface ViewGraph {
  sceneKey: SceneKey; atUtc: UtcMs; layoutVersion: number;
  nodes: ViewNode[]; edges: ViewEdge[];
  trays: { uncharted: CanonicalKey[]; unlinked: CanonicalKey[] };
  coverage: ScopeHistory['coverage'];
  lane?: LaneSpec;                       // the PR lane (06 §3)
  radar?: RadarSpec;                     // body close-ups with Tasks
  board?: BoardSpec;                     // a system drawn as a board (below)
  // v1: solar?, lists? (§5d)
}
interface LaneSpec { childrenBottom: number; laneOffset: number; stationOffset: number; childLabelRow?: boolean }
interface BoardSpec {
  rings: { index; lane; rx; ry; span; depth; track: { span; depth; rx; ry } }[];
  ticks: { x; y; nx; ny }[];                           // column ticks on the outer ring
  heads: { x; y; people: (CanonicalKey | null)[]; name: string; avatars: ViewNode['avatar'][] }[];
}
interface RadarSpec {
  center: string; cx: number; cy: number;              // the planet's projection key and center
  arc: readonly [number, number];                      // front arc, radians (y down): left end → front → right end
  bands: { band: 'ready' | 'underway' | 'accomplished'; rx: number; ry: number; count: number }[];   // inner to outer
  spokes: number;                                      // every Task ever linked
}

// Pure. The layout needs the whole history (slot order), the snapshot (what's visible now),
// and the scene key. Sector, feature, and body scenes.
declare function projectScene(h: ScopeHistory, s: Snapshot, scene: SceneKey, layoutVersion: number): ViewGraph;
// The galaxy scene is built from project summaries, not a scope bundle. `meta` (v1.1, 19 L3): 'full'
// (v0's "Project · 2 saved areas · …", the default) or 'counts' (Solar's "2 areas · …").
declare function projectGalaxy(projects: ProjectSummary[], atUtc: UtcMs, layoutVersion: number, meta?: GalaxyMeta): ViewGraph;
```

**Layout slots (INV-14).**
- For each parent, sort every child that was *ever* validly linked in `h`, by first `link_*_added`
  time and then canonical key.
- A child's slot index is its rank in that order.
- **Feature scenes:** `featureFormation(n)` places slot `i` in a balanced, centered one- or two-row
  formation (06 §3), where `n` is the number of children *ever* linked. The body gets the orbit
  ellipse through that point (`orbitThrough`). `ViewNode.labelSide` tells the label layer which band
  to use.
- **Systems as a board (decided 2026-10-09, `src/shared/scene/board.ts`; `SYSTEM_LAYOUT` in
  `limits.ts` switches back to the formation above).**
  - `boardFrame(h, children, lens, names)`, memoized per bundle: each child's (assignee, column)
    timeline from the range-start snapshot plus `wi_created`, `wi_state_changed` and
    `wi_assignee_changed`. Lanes are everyone ever assigned, A–Z by display name (keyed by ID), then
    Unassigned. One ring per person (`maxLanes` and `maxPerRing` are Infinity; revised 2026-10-09), so
    nobody shares a ring and nobody gets a second one.
  - A sweep gives each lane's and each column's peak simultaneous count. A lane gets
    ceil(peak / `maxPerRing`) rings. Each ring is sized so its front arc holds
    max(`minPerRing`, its share) bodies at `sep` apart, depth `depth0 + i·depthStep`, ends at least
    `spanStep` outside the ring inside it. Column shares follow column peaks, at least `minShare`.
  - `boardPlace(frame, snapshot, bodies, t)`: a body's lane is its assignee at t; its column is
    `columnOf(stage)` (Ready, Underway, Nearing, Accomplished, from 09). Within a lane, order is by
    column, then newest into the column first (the left, entry, edge), then slot, dealt across the
    lane's rings.
  - Each ring is packed by isotonic regression (pool-adjacent-violators) toward its columns' centres
    with at least `sep` (× `doneScale` for compacted done) between centres, so bodies never overlap.
  - Accomplished more than `doneAfterDays` before t: radius × `doneScale`.
  - `ViewGraph.board` carries the rings, the column ticks on the outer ring, and each lane's head
    (its people, name and avatars), and each ring's `track` (the orbit midway between it and the band
    inside it). Lanes come from the sweep over instants where the source's own `child` rule shows the
    child (`shownAt`), so nobody without on-screen work gets one.
  - A captain's ship at home sits on its lane's track (`ViewNode.track`) under its latest work in the
    lane, or under the item it holds longest. It has no `attach`; the renderer slides it along the
    track to a clear spot. It is attached to work outside its lane (above it, `attach.dirY = -1`) only
    while that work is within `BOARD.awayHours`.
- **Body close-ups: the Task radar (slice 3a, INV-14 as amended).** Every Task ever linked gets a
  spoke: `radarAngles(n)` spreads `n` angles evenly by arc length along a ~240° front arc (with fewer than
  six Tasks they keep six Tasks' spacing and sit centered at the front, so a few don't stretch to the
  ends: slice 6, 2026-10-09)
  (`RADAR_ARC`, 210° → −30°), in slot order, left to right through the front. A Task sits where its
  spoke crosses its band, `radarPoint(angle, radarBand(stage))`: Accomplished (inner, rx 1120),
  Underway (rx 1540), Ready and unknown (outer, rx 1960), with ry = rx · `ORBIT_SQUASH`, around a
  planet of r 400. `task.faint` (Removed) has no band and isn't projected. The angle never changes;
  only the radius follows the displayed stage, so a state change moves a Task along its spoke. The
  PR lane and station row are sized by the outer band, so they never move as Tasks change band.
  Ready and Accomplished Tasks are `labelOnHover`; the body's label carries the `tally`.
- **Sectors:** `balancedRows(n, 4)` with `centeredRow`.
- **Stations:** a centered row ordered by the barycenter of their linked work.
- Stations use a reserved outer belt, and captains use lanes beside their targets.
- **Captains (slice 3a):** one ship per captain per scene, attached beside the scene's node for
  **where the captain last worked** up to the playhead (`activityAnchors`): the latest event with
  `changedBy` (or `pr_opened` by them) whose subject is shown here. The subject is the item itself,
  else its nearest shown ancestor; a PR link's subject is the PR (its vessel). Without activity here,
  the ship sits at a body before a Task, then at the assignment held longest. Pure: seeks are
  idempotent.
- Labels must fit a safe margin; beyond `MAX_*`, extra items become an `overflow` node.

### 5a. The hierarchy: a chain of scene levels (decided 2026-10-07)

*Applies to: both views.*

The scenes under the galaxy are a **chain of levels** (`src/shared/hierarchy/`). Each level pairs a
**layout** with a **data source** for it. The Backlog (the general-purpose view) and the Sprints
paradigm are two chains over the same layouts and art. Solar (`solar.ts`, the default view) is a
third: `sprint:<iterKey>` (the round, `playable: false`) → `pod:<areaKey>` (the region, layout
`solar`).

| Layout | Draws | Its source answers |
|---|---|---|
| `field` | A field of small orreries (the sector) | `order` (slots, INV-14), `member`, `miniOrder`, `mini`, and optionally `unexplored`, `loadMore`, `passThrough` and `preview` (Solar's round, 19 P1: a `FieldPreview` drawn in place of the miniature, below) |
| `system` | An orrery (the star system) | `center`, `order`, `child`, `uncertain`, `points` and `point` |
| `radar` | A close-up | `center`, `spokes`, `current`, `point` and `uncertain`; it's always the last level |
| `solar` (v1, §5d) | A solar system: seats on orbits, pieces, formations, the frontier, stations | `center`, `facts` and optionally `pack`; it's always the last level of the Solar chain |

```ts
interface LevelDef {           // layout + source (discriminated), plus:
  id: string; variants?: string[];          // e.g. 'sector' with variants 'area' | 'epic'
  backdrop: BackdropLevel; durationMs: number;
  vocab: LevelVocab;                        // type labels, glyphs, the player's noun, enter words, the team pill
  historyScene: 'scope' | 'self' | 'parent';  // what the player loads for a scene here
  sceneKeys(h, ref): Set<CanonicalKey> | null; // highlights and in-view ticks
  enterLoad?(h, ref): SyncLevel | null;     // a load to run before entering (an unexplored Feature)
}
interface Hierarchy {          // built by chain(id).then(level)…build(rest)
  levels: LevelDef[];                       // levels[0] is the scope level: where a bundle loads
  resolve(scene): { def; index; ref } | null; format(ref): SceneKey; sceneForScope(scope): SceneRef;
  pathTo(s, key): SceneRef[];               // goTo: the scenes that lead to an item
  focusOf(s, key); closeUpOf(s, key); stageOf(s, key);   // beat focus; following (05 §6)
  uncharted(s): CanonicalKey[]; rankOf(s, key): number;  // the Uncharted tray (INV-10); stagger (05 §5)
}
interface FieldPreview {       // FieldSource.preview(ctx, key): Solar's round (19 P1), drawn by scene/project/preview.ts
  seats: { person; slot: number; stage: string }[];  // the region's seats (seatsOf), each in a slot placed by its number alone (previewSlot), its seat look
  objectives: number; threats: number;      // in the region at the playhead, on the ladder
}
```

- **Solar's round (19 P1, `hierarchy/solarRound.ts`).** The Sprints sector's pods, with each pod star's
  miniature replaced by a preview: nodes `${star}|preview|seat|<person>` (kind `seat`), `|preview|rock<i>`
  (`objective`) and `|preview|hive<i>` (`threat`), each with its asset, keyed to the pod, not selectable
  or labelled. Slots (INV-14 while history streams, in any order): first the people holding a piece in
  the region now (today's assignees, which the first look has), by key, from the round's own facts;
  then, once every piece in the region now has its history, the other seats in the region's order,
  those tied to its current pieces before those who held only pieces that have since left. A slot's
  place is its number's alone: 8 on the first ring, then wider rings of 7 and 8. The pod star's `meta` is `<path> · <n> items` (also the region's star,
  `solarSource.center`), and `detail` keeps v0's line for the inspector. A holo plate's subtitle shows its
  last ` · ` part whole and lets what's before it give way from its start (a long path keeps its leaf). The v0 Sprints sector is
  unchanged.

- **Scene keys.** The codec (`sceneKey.ts`) is the only place keys are built and read:
  `level[:variant]:key`. Canonical keys contain colons, so parsing uses the level table.
  - Backlog keys are unchanged, byte for byte (`sector:area:<k>`, `sector:epic:<k>`, `feature:<k>`, `body:<k>`). The sky seeds from the whole key.
  - The galaxy is the root, shared by every hierarchy. It has no ref.
- **`projectScene(h, s, scene, layoutVersion, hier = BACKLOG)`.** It resolves the scene, then draws it with the level's layout and source. Each `zoomTo` is the next level's scene, from `hier.format`.
- **Playback takes the hierarchy too**, with the Backlog as the default: `buildBeatSchedule`'s `hier` option (beat focus), `sceneEntityKeys`, `buildHighlights`, `followAnchors` and `storyAnchors`. A story anchor's `stage` is the system the camera travels to; it was called `feature`.
- **The breadcrumb is pure:** `crumbsOf(stack, projects, hier)`. The renderer only draws it.
- **What stays keyed on work-item kind:** accents, protected moments, descriptions and priority. They say what a work item is, not where it sits in the chain.
- **The data source** (`src/shared/contracts/source.ts`) is described by `SourceCaps`:
  - `needsConnection`, `syncsByLevel`, `openInAdo`, `areaTree` and `chartedCaption`.
  - The renderer asks these, never the mode. Connect, the source picker itself, is the exception.
  - Main's IPC handlers ask the active `ChartSource` (`src/main/source/`: `fixtureSource`, `adoSource`).

### 5b. Sprints (decided 2026-10-07)

*Applies to: both views* (Solar's round is a sprint and its region a pod, `hierarchy/solarUi.ts`).

```ts
type SectorRef = … | SprintSector;
interface SprintSector { kind: 'sprint'; iterationKey: CanonicalKey; path: string; startUtc: UtcMs; finishUtc: UtcMs; pods: SprintPod[] }
interface SprintPod { areaKey: CanonicalKey; path: string; label: string }   // a saved Area Path
// keys: `iter:{org}:{projectId}:{nodeId}`   facts: RevisionFact.iterationPath?, IterationNodeFact
// events: wi_iteration_changed { from, to }; wi_created.iterationPath? (only when it has one)
// snapshot: WorkItemState.iterationPath? (only when set)   IPC: iterations.list(projectKey), paradigm.get/set
```

- **The chain:** `SPRINTS` (`src/shared/hierarchy/sprints.ts`) is `sprint:<iterKey>` (a field of pods)
  → `pod:<areaKey>` (a system of the pod's Stories and Bugs) → `body:<wiKey>` (the same radar as
  the Backlog's).
- **The family walks take the bundle:** `pathTo`, `focusOf`, `closeUpOf`, `stageOf` and `uncharted`
  receive `h`, because a pod is an area path and which pod holds an item depends on the sprint's
  pods. A new `labelOf(s, h, ref)` names any scene's ref.
- **The paradigm** (`'sprints' | 'backlog'`, and v1's `'solar'`, §5d). **Solar is the unpinned
  default** (17 W1-T5). A valid `STAR_CHART_PARADIGM` pin (`paradigmSchema`) wins. The old
  main-process cache setting is **neither written nor read** any more (23 E3), because a
  developer's cache likely holds `sprints`, which would hide v1. Under Solar the title-bar switch is
  hidden; Settings → Theme's developer toggle (`settings/views.ts`, §5d) switches, and **remembers the
  choice** (23 E3): `UserSettings.devParadigm` (saved by `nav.setParadigm`, so the title-bar switch and the toggle agree), which main reads at boot when nothing is pinned (missing
  reads as Solar). The e2e
  suite pins Backlog (`launch.ts`); `sprints.spec.ts` pins Sprints.
- **Fixture mode** in Sprints also serves `sprint-pods`, the demo project that plans by sprint, and the
  SDLC v1 scenarios (`pod-sprint`). Solar serves those plus the Todo and CRM scenarios (§8).

### 5c. Streaming a sprint (decided 2026-10-08)

*Applies to: both views · ADO mode* (Solar opens every round through it).

```ts
type SyncLevel = … | { kind: 'sprint' };          // the first look: three calls, then the job is done
// IPC
sync.focus(scope, sceneKey): Promise<void>         // look here; entering a pod waits for its Tasks
sync.onScopeUpdated(cb: (e: { scope; changed: CanonicalKey[]; pending: number; done: boolean; total?: number; exact?: boolean; refused?: boolean }) => void)   // total/exact (B6): pending is out of ~total, exact once discovery is over
// Hierarchy: LevelDef.enterLoad may return { kind: 'focus' } (the Sprints pod level)
// Renderer: ChartApp.show cause 'data'; GraphScene.arrive(pk, delay?)
// Test hooks: motions() → { arrive, depart, active }; stream() → { pending } | null
```

- **The scheduler** (`src/main/sync/scheduler.ts`) ranks tasks by class (`look`, `fill`, `context`,
  `idle`), then by focus, then by the order they were added. Idle work runs only when nothing else
  waits. A second request for a key joins the first, raising its class. Tasks not yet started are
  dropped on cancel; started ones finish. A throttle (429, 503) pauses the whole queue
  (`throttleGate`). There's one scheduler per streaming scope, and one scope streams at a time; the
  transport's 4 requests in flight are the org-wide budget. A waiter on a cancelled request leaves
  the transport's line.
- **`SprintStream`** (`src/main/sync/sprintStream.ts`) has three stages:
  - **The look:** `sprintItems` now, a hydrate of those items plus bodies known before (so leavers
    and vanished items are seen), and a hydrate of their Features. It saves `LevelState.sprint` and
    the checkpoint, which unlocks `load`.
  - **Fill:** the repos; the sprint-wide and per-pod `EVER` queries (04 §5b); per pod, its Tasks (a
    tree query plus a hydrate; the focused pod's rise to `look`), its PR records, the review votes of
    its completed PRs, the people's pictures (`faces`), and history newest-changed first. The pod's
    Features' history is `context`. History is skipped for an item whose cached latest revision is as
    new as its `ChangedDate`.
  - **Idle:** leavers by daily `ASOF` samples; the closure (descendants of non-Feature members,
    former children, then every parent ever as `context`, as the full sync); the closure's PRs' votes.
    When the queue runs dry, `finish` reads the people met, writes coverage and `filledAt`, then
    `rebuildDerived`. (superseded 2026-10-13: votes and pictures were idle work.)
  - **On a reopen** (`refresh`, 04 §5 step 7): the look again, then a `prs:refresh` task (`fill`) and,
    every `RESCAN_EVERY`th refresh, a `rescan` (`idle`).
- **The bundle** is `loadLevelHistory`'s sprint variant: derived history where it's in, plus
  `applyCurrent` with the sprint target. Once the stream is done, it equals `toHistory` (AC-27 for
  every sprint, `tests/unit/stream.test.ts`).
- **`scope.updated`** carries `refused: true` once if the token dies part-way through (04 §6); the stream
  has stopped. It is batched every 1.5 s, or at once on 25 items. The renderer reloads only when
  the batch brings something new or touches the scene's keys, one reload at a time.
- **The scope is the sprint's own (decided 2026-10-08).** The closure walks out from the sprint's
  **roots** — its Stories and Bugs, from the look, the `EVER` query and the samples — and from
  nowhere else, in the full sync's order: descendants and former children down, then every parent
  those have ever had, with the ancestors never feeding the downward walk. It runs once per set of
  roots, not once per history fetch. (Both departures caused a runaway: one sprint of 575 items
  reached 8,020 and spent 11,691 calls.) `MAX_SCOPE_MEMBERS` (3,000) is the backstop: past it the
  stream stops widening, coverage goes partial with `SCOPE_CAPPED_NOTE`, and the dev log says
  `stream-capped`. A closure that fails leaves `filledAt` null, so the next open streams it again.
- **History waits for its scene.** `wantHistory` queues an item's history only while it belongs to
  the scene on screen or to what that scene draws below it; the rest sit in `deferred` until a focus
  brings them in. A body counts as a pod's if it was **ever** under it, and a Feature or Epic counts
  through the group it was queued for.

### 5d. v1 additions (17, built 2026-10-10 to 2026-10-12)

[14 §2](14-architecture.md#2-interfaces) is the design; these are the shapes **as built**, after the
W0–W3 tasks (their handoffs are `docs/archive/progress/slice-V1-*.md`). Every field is optional, and v0
builders never set one, so every v0 golden stays byte-identical. Where the build departs from 14, the
departure is written here and 14 points at it.

*Applies to: Solar · packs: SDLC, Todo, CRM* (the asset, theme and command parts: the Star Chart theme).

| Part | Shapes | Code |
|---|---|---|
| Mapping, signals, stage code | `Role`, `Rung`, `MappedState`, `PieceState`, `encodePiece` | `contracts/history.ts`, `engine/signal.ts`, `engine/stageCode.ts` |
| Packs | `DomainPack`, `registerPack`, `packFor` | `src/shared/packs/` |
| Moves and round facts | `Move`, `movesOf`, `RoundFacts`, `roundFacts`, `boardFacts` | `engine/moves.ts`, `engine/facts.ts` |
| The solar plan and projection | `SolarPlan`, `planSolar`, `projectSolar`, `MegaList` | `engine/solar/`, `scene/project/solar.ts`, `lists.ts` |
| Maneuvers | `ManeuverRule`, `PaceRule`, `RULE`, `PlannedManeuver`, `planManeuvers`, `pacing` | `contracts/maneuver.ts`, `engine/pace.ts`, `engine/maneuvers.ts` |
| Achievements | `Award`, `AwardRule`, `achievementsFor` | `engine/achievements.ts` |
| Play gate and hooks | `gatesPlay`, `BeatPlanner`, `RecapHook` | renderer `playGate.ts`, `playHooks.ts`, `v1/` |
| Scenes, assets, theme | `AssetDef`, `ThemePack`, `EntryCaps` | renderer `chart/scenes/`, `chart/assets/`, `theme/` |
| Commands and the interpreter | `CommandDef`, `ManeuverDef`, `FxDirector`, `ManeuverInterpreter`, `Finale` | renderer `chart/fx/`, `chart/fx/v1/`, `theme/starChart/` |
| Labels, overlays, settings, gallery | `tierFor`, `ChartOverlay`, `useSettings` | renderer `chart/labels.ts`, `overlays.ts`, `holo/holoRows.ts`, `settings/`, `gallery/` |

**Source:** the files above · **Update when:** a v1 type gains or drops a field, or a seam moves.
Values (rule lengths, floors, pitches, command tiers) are in [15](15-reference.md), not here.

```ts
// contracts/history.ts — the mapping and the bundle
type Role = 'objective' | 'threat' | 'step' | 'container' | 'facility' | 'attachment' | 'guard';
type Rung = 'ready' | 'underway' | 'nearing' | 'accomplished' | 'off';
interface MappedState { category: string; stage: string;          // v0's, still required
  rung?: Rung; sketch?: boolean; step?: number /* a fraction, 0..1 */; deferred?: boolean; ghost?: boolean; strike?: boolean }
StateMapping.types[type].role?: Role;  StateMapping.types[type].states: Record<string, MappedState>
StateMapping.entities?: { facility?: { noun?: string };
  attachment?: { states: Partial<Record<'active' | 'completed' | 'abandoned', MappedState>> } }
ScopeHistory.domainPack?: string       // /^[a-z][a-z0-9-]{0,39}$/; omitted means 'sdlc' (SDLC bundles always omit it, AC-27)

// contracts/view.ts — nodes and graphs
NodeKind += 'seat' | 'objective' | 'threat' | 'facility'   // the v1 ship stays 'captain', with asset 'agent'
ViewNode.asset?: string                // a neutral role id ('objective', 'agent'); the theme binds it to an asset
ViewNode.piece?: PieceState            // stage = encodePiece(piece)
ViewNode.stepKeys?: CanonicalKey[]     // a solar piece's steps (Off included), slot order; the inspector's Steps list (19 L7)
ViewNode.cluster?: { id; index; size } // a formation member
ViewNode.compound?: { slots: (CompoundSlot & { signal: Signal })[]; more; intensity; summoner; guards }
ViewNode.activity?: number            // how lately the piece was worked, 0..1 in quarters (2026-10-12); a facility's from its PRs (19 M1)
ViewNode.flags.standby?: boolean      // a facility on standby (19 M1): its plate drops to T3
ViewNode.platform?: { seat; role; index } // a finished piece on its platform (v4)
ViewNode.features?: FeatureTally[]    // B3, a region's star only (never the round's): { key, id, title|null, count }, every Feature holding at least one of the pod's pieces now, count desc then lower id (15 §6 feature-row). Text on the plate and in the Inspector; no object. Absent when the pod never has a Feature in the loaded round
ViewNode.featureLines?: number        // B3: the lines the plate reserves for the row, min(1, Features ever) (`FEATURE_ROW_CAP`; `+N more` shares the line, 27 B2) over the round, so a seek never changes its height
ViewGraph.solar?: { star; seats: SeatSlot[]; frontier; formations: Formation[];
  unassigned: projectionKey[];         // the pieces in the frontier belt at the playhead, in key order; the belt shows only while one is drawn (19 S2)
  stations?: { facility; x; y }[] }    // every planned station, drawn yet or not, in the plan's order
ViewGraph.lists?: Record<projectionKey, MegaList>
interface PieceState { role: Role | 'seat' | 'agent'; signal: Signal; category: string;
  steps?: ('n' | 'a' | 'c')[]; share?: number; intensity?: number; open?: number; slots?: number;
  merged?: number; standby?: boolean; // standby: a facility with none open and its PRs quiet two days (19 M1); written only when true
  vacant?: boolean; awaiting?: boolean } // vacant: a seat none of whose work has come yet this round (23 C3; `vc=1`); awaiting: only with vacant, first light when its first piece arrives (v1.4 B4; `aw=1`)
interface MegaList { title: string; rows: MegaRow[]; more: number;
  run?: { text: string; state?: RunState } }   // a station's pipeline line (B2): `Last run: passed · 2 h ago`, empty text when no run was read; on every station's list so the plate reserves the line (R4)
interface MegaRow { key; label: string; meta?: string; rung: Rung;
  serves?: CanonicalKey[]              // a row that isn't drawn itself (a facility's PR, 19 L6): the pieces it lights; a press selects the first
  subtitle?: { label: string; url: string | null; key?: CanonicalKey /* a linked container, for openInAdo */ };
  stat?: string }                      // a facility's PR (B1): its stat line, `✓ 2  ⧖ 1 · 4 pushes · 3 threads · M` (15 §6 pr-stat); absent when no fact was read

// hierarchy/types.ts
LevelBase.playable?: boolean           // default true; Solar's round level sets false (13 §2)
LevelDef |= { layout: 'solar'; source: SolarSource }
interface SolarSource { center(ctx, ref, pk): ViewNode | null; facts(h, ref): RoundFacts;
  pack?(h): DomainPack                 // words and read-only links; unset: no links
  seatTitle?(h, person): string | null } // a theme's name for a seat (2026-10-12); unset/null: the person's name
solarHierarchy(extra?: Partial<SolarSource>): Hierarchy   // SOLAR = solarHierarchy(); the renderer adds the theme's seatTitle
ViewNode.labelDir?: { x; y }           // unit, world axes: the way a pointing label hangs out (a seat's: away from the star)
Hierarchy.pacing?: (h) => Partial<ScheduleOptions>   // unset for v0 chains
HierarchyUi.chooser?: 'sprints' | 'backlog'           // renderer; uiFor always answers it set
HierarchyUi.plates?: KindPlates                        // v1.1 (19 R1): holo plates for asset-less nodes, by level id then kind; Solar only
HierarchyUi.galaxyMeta?: GalaxyMeta                    // v1.1 (19 L3): 'counts' under Solar

// contracts/maneuver.ts: Phase, PHASES, CastRole, Cast, PhaseSpan, ManeuverRule, PlannedManeuver (14 §2.7)
// contracts/settings.ts: CaptainStyle, UserSettings, userSettingsSchema, userSettingsPatchSchema,
//   defaultUserSettings, mergeUserSettings (viewer and captain merge per org), DEFAULT_THEME = 'star-chart'
//   (UserSettings.devParadigm?: 'solar' | 'sprints' | 'backlog', 23 E3: the developer toggle's view, read at boot)
//   (UserSettings.tourOffered?: boolean, 23 E7: the guided tour was offered on a first launch; it is offered once)
//   (mode.set(m, { transient: true }): main uses m for this run but never saves it, so a quit boots into the saved mode; the tour's Fixture)
// shared/captainFile.ts (23 E2): captainFileSchema `{ v: 1, faction, hull, colourway }` (strict), captainFileOf,
//   serializeCaptainFile, parseCaptainFile(text) → { ok, style } | { ok: false, message }, checkAgainstFleet(style, limits)
// engine/types.ts: Signal, Piece, Move, EventAdapter, Noun, SourceWords (+ agent?: Noun), Terminology,
//   PackThresholds, DomainPack, RoundFacts (+ at?: ReadonlyMap<eventKey, UtcMs>, firstMerge?, merges?,
//   regions?: ReadonlyMap<regionKey, RoundFacts> (2026-10-13: each pod's own facts, on a whole round's)), PieceFacts
//   (+ parentAt?: { from; parent }[]), AttachmentFacts, Interval, the solar layout outputs (SeatSlot,
//   PieceSlot, Formation, CompoundSlot, StationSlot, SolarPlan), Award, AchievementRule, emptyRoundFacts()
// playback/schedule.ts: BeatShape { afterMs; durationMs; essential?: boolean }   // essential: never cut over budget (2026-10-13)

// renderer chart/fx/types.ts
FxDirector.recap(keys, awards?, opts?: { finale?: boolean })   // finale: the round has ended here (2026-10-13)
FxDirector.opening?()                  // the episode begins: entrances (2026-10-13)
FxDirector.labelled?(): ReadonlyMap<projectionKey, number>   // pieces labelled in play now, with their opacity (19 L7)
CastLabels { show(pk, fromS, toS, tag?); showing(tag); retire(tag); step(dtS, paused?, wallS?); clear(); now(fade?): Map<pk, number> }   // chart/fx/v1/castLabels.ts, pure
CommandDef { name; tier; weight; value; cuttable; clock: 'travel' | 'accent'; moves?; reduced: 'same' | 'ring' | 'snap' | 'skip' | { use } ; make }
CastView { key; node; at; gone?; drawnR?(): number; host?: CastView }   // host: the compound a part is drawn in
CastViews = Partial<Record<CastRole, CastView[]>> & { away?: { agent?, support?: AwayView[] } }   // AwayView { key; seed }
CommandCall = { cmd; args; delayMs?; value? } | { act: { key; act }; delayMs? }
ManeuverDef { id; title; reveals?; owns?: CastRole[]; freezes?: { guide: string; until: Phase }; phase }
AmbientWork { work(ship, piece, activity, n): CommandCall[] }
Entrance = (node, quiet) => CommandCall[] | null
FinaleCast { star: CastView | null; finished: CastView[]; ships: CastView[]; seats: CastView[] }
Finale = (c: FinaleCast) => { calls: CommandCall[]; awardsAtMs: number }   // when the viewer's awards light
// renderer chart/assets/types.ts
AssetCtx { theme; viewer; captain }   Ambient { activity?; toward? }   AssetView extends ArtView { act?; ambient?; settle? }
                                      // settle (19 M1): a look the view eases into itself lands now (a seek, scene entry, reduced motion)
AssetDef { id; layer: 'celestial' | 'infrastructure' | 'traffic'; moving; framed; flare; body; floorPx?; hitFloorPx?;
  rank; label?: HoloSpec; over?; labelRim?; acts?; departAct?; departS?; make(node, ctx); rebuildOn?; samples? }
// renderer chart/holo/holoLabel.ts (v1.1, 19 §2)
HoloSpec { frame: 'chamfer'; variant: 'title' | 'subtitle' | 'avatar'; layout: 'horizontal' | 'vertical'; tier: HoloTier }
HoloTier = 'lead' | 'door' | 'place'   KindPlate { label: HoloSpec; labelRim?; dir? }   KindPlates = Record<levelId, Partial<Record<NodeKind, KindPlate>>>
// renderer theme/types.ts
ThemeGuide { id; draw(g, graph, px); shownBy?(graph): readonly projectionKey[] }   // shownBy: absent, always; in play it shows while one of them is drawn or still leaving, fading over GUIDE_FADE_MS; a seek snaps it (19 S2)
ThemePack { id; title; roleAsset; assets; commands; maneuvers; guides; words; entrance?; ambient?; finale?; seatTitle? }
```

**Mapping and signals** (`engine/signal.ts`, `config/state-mapping.json`).
- Each SDLC type has a `role` (Epic and Feature `container`, User Story `objective`, Bug `threat`,
  Task `step`), and each state its `rung` and flags, copied from `SIGNALS` in `art/progress.ts`.
  `tests/unit/signal.test.ts` keeps the two equal. PR statuses map through `entities.attachment`
  (active underway, completed accomplished, abandoned off + ghost).
- `resolveRole(mapping, type)`, `resolveSignal(mapping, type, rawState)` and
  `attachmentSignal(mapping, status)` read a side index per mapping object (a `WeakMap`), so
  `WorkItemState` doesn't change. The signals they return are frozen and shared; the lookup tables
  have a null prototype (INV-11: a state named `toString` is unknown).
- **Fallback order.** The role falls back to the v0 kind. The signal comes from the mapped `rung` and
  its flags; without one, from the v0 stage (`RUNG_OF_STAGE`); then from the category (Proposed,
  InProgress, Resolved, Completed, Removed); else `UNKNOWN_SIGNAL` (`{ rung: 'off', unknown: true }`).
  An attachment with no entity mapping reads `flight.<status>`.

**The stage code** (`engine/stageCode.ts`: `encodePiece`, `decodePiece`, `encodeSignal`,
`decodeSignal`, `isPieceStage`, `MAX_STEPS` 6, `QUANTUM` 0.05). 14 §2.4's example strings are the
design; the grammar as built is:

```
v1|<role>|<signal>|c=<category>[|s=<steps>][|sh=<share>][|i=<intensity>][|pr=<open>][|pm=<slots>][|mg=<merged>][|sb=1][|vc=1][|aw=1]
signal := <rung>[+sketch][+step<0.00>][+deferred][+ghost][+strike][+unknown]
e.g. v1|objective|nearing+step0.65|c=Resolved|s=nac   v1|seat|underway|c=InProgress|sh=0.50
     v1|facility|underway|c=InProgress|i=0.60|pr=3|pm=13
```
Fields and flags come in this fixed order, written only when set; the category is URI-encoded;
share and intensity are clamped and quantised to 0.05, `step` to two decimals; steps are cut to 6.
`decodePiece` is strict and accepts only canonical strings: anything that doesn't re-encode to
itself, a v0 key, or an unknown version, role, rung, flag or field decodes to `null` (INV-11).
Builders leave `steps` unset when a piece has none (so one look has one string); the art draws unset
and `[]` alike. `mg` (a facility's count of the merges that make its form, 2026-10-12, amended
2026-10-13: §5d) is written only above zero, and `mg=0` does not decode. `sb=1` (a facility on standby, 19 M1)
`pm` (a facility's filled tender slots as a bit mask, 23 C6, `PieceState.slots`: bit n is slot n below the compound cap, in decimal, so `pm=13` is slots 0, 2 and 3) follows `pr`, which still counts every open PR, the "+N" past the cap among them; `engine/solar/compound.ts` `slotMask` builds it from the attachments live at the playhead, so a PR that closes clears its own bit and no other moves (a drawn PR keeps its slot for life, INV-14; one waiting in "+N" takes the first slot that frees, so "+N" is exactly the open PRs beyond the cap). A dock with `pm` and no `ds` (a PR with no drawn slot merged) docks no tender. The art takes it as `pm=` in its stage (`stationStage`), and a per-PR `dock` adds `ds=<slot>`, or a list `ds=1,3` when a volley docks several tenders together (27 E6: `StationState.dockMask`; a slot at or past the cap is dropped, a malformed list does not decode); without `pm` the art fills by count (the gallery's). **Per-slot acts:** a `CommandCall` act carries an optional `slot` (`cmd.act(key, act, delayMs, slot)`), the attachment's compound slot (`CastView.slot`), or a list of them (27 E6: a volley's `dock` names every member's slot; `launch` and `operate` take the first); `AssetView.act(name, slot?)` takes it. `dock` (the merge), `launch` (a PR opens) and `operate` (a settle) play on that PR's tender; an act with no slot is whole-station as before. `sb=0` or a bare `sb` does not decode. `vc=1` (a seat that holds nothing at the playhead, 23 C3, `PieceState.vacant`) is written only when true; `vc=0` does not decode. `aw=1` (a vacant seat none of whose work has come yet this round, v1.4 B4, `PieceState.awaiting`) follows `vc=1` and is written only with it; `aw=0`, or `aw=1` without `vc=1`, does not decode. Only `solar.ts` writes them, never `seatPiece`, so the round's previews stay lit.

**Packs** (`packs/registry.ts`: `registerPack`, `packById`, `packIdOf(h)` = `h.domainPack ?? DEFAULT_PACK`,
`packFor(h)`, which throws for an unregistered pack, `allPacks`, `resetPacks`; `packs/all.ts` registers
`PACKS` on import).
- **SDLC** (`packs/sdlc/`): no `mapping` of its own (its bundles carry `config/state-mapping.json`);
  thresholds 3 working days, K = 2, a 12-hour day; `containerUrl` builds a work item's
  `https://dev.azure.com/{org}/…/_workitems/edit/{id}` address, or `null` (every fixture bundle).
- **Todo and CRM** (`packs/{todo,crm}/`, `config/packs/{todo,crm}.mapping.json`): fixture-only, served
  under Solar only, never through fake ADO. Each mapping has one type per role; every state reuses a
  v0 stage key with that stage's rung, its raw name is at most 16 characters, and nearing states use
  category `Resolved` (so the pod-star aggregate counts them). Thresholds live in each pack's
  `index.ts` (13 §8): Todo 2 working days, K = 3; CRM 10 working days, K = 4. Neither has
  containers or `containerUrl`.

**Moves** (`engine/moves.ts`). `movesOf(h, pack)` normalises every event once (memoised per bundle and
pack; frozen; keyed by exactly `h.events`, so an observation never moves, INV-02).
`contractMoves(h, e)` is the default reading of 03 §3 through the bundle's mapping:

| Event | Move |
|---|---|
| `wi_created` | `appear` (role, signal, seat). Created inside the scope: no `enter` |
| `wi_state_changed` | `climb` (from, to; actor `changedBy`) |
| `wi_assignee_changed` | `reseat` |
| `wi_area_changed`, `wi_iteration_changed` | `enter` or `leave` when an objective or threat crosses the bundle's scope edge (in the round and one of its regions); a move between two regions of the round gives neither |
| `wi_title_changed` | `retitle` |
| `link_parent_*` | `bind` / `unbind`, rel `step` when the child is a step, else `container` |
| `link_pr_*` | `bind` / `unbind`, rel `attachment` (child the PR, parent the piece) |
| `pr_opened` | `attach` |
| `pr_completed`, `pr_abandoned` | `settle`, with the attachment signal and the sorted approvers (none when abandoned) |
| `link_dependency_*`, an unknown kind | nothing |

Helpers: `scopeTest(h, region?)`, `PLACED_ROLES`, `typeIndex`, `roleOfKey`, `movedKeys`.

**Round facts** (`engine/facts.ts`). `roundFacts(h, ref, pack)` gives one region's round over the whole
loaded history, memoised per bundle, pack and ref (`ref.key` a pod's area key, or the sprint's key for
every pod). `round` is `h.range`. It folds the dated events only; items and PRs known only from
`h.current` seed the fold from the start.
- **Membership:** objectives and threats while their placement is in scope (`scopeTest`); a step while
  its parent is a member piece. Intervals are `[from, to)`; a zero-length interval is dropped and an
  out-and-back at one instant is merged. A piece is kept only if it's a member some time in the round.
- **One timeline.** This file is the only home of the readers: `memberAt`, `seatAtTime`,
  `signalAtTime`, `parentAtTime`, `onSpans` (stretches not known to be Off; an unknown state counts as
  on), `heldSpans(p, round)` (member, on the ladder and at one seat, clipped to the round), `eventsAt`,
  `seatAtEvent(f, p, eventKey)` (the seat as it stood at that event; a reseat to the frontier counts),
  `knownOff`, `coversAt`, `entryAt`, `meet`. Before its first `seatAt` entry a piece is unassigned.
- **Seats** (`seatsOf`) are everyone who held a member objective or threat on the ladder during the
  round (`heldSpans`; Off excluded, unknown kept), ordered by when they first held one, clipped to the
  round start, ties by key.
- `PieceFacts.steps` lists every step ever, in first-bind order (INV-14); `parentAt` is the parent
  series (a second change in one millisecond replaces the first); `parent` is the final parent.
  **Linked steps are read by their final parent** wherever a step stands in for its piece
  (`linkedPieces`, `placeFacilities`, `boardFacts`).
- `attachments`: PRs linked by a dated link to a piece here and open some time in the round, with
  facility, author, open interval, links, approvers at completion and `signalAt`.
- `moves` holds every event touching a piece or attachment here, in event order, including events
  before the round (consumers filter by time); `at` maps each of those event keys to its time.
- **Terminology** (`engine/terminology.ts`): `terminology(pack, register, { chart?, mapping? })`, with
  `pack` narrowed to `WordsPack` (`words`, optional `mapping`). The source register uses the pack's
  words, the chart register the theme's `words` (passed in by the renderer), both falling back to
  `ENGINE_WORDS`. In the chart register `typeName` names a type by its role's noun through the
  mapping. `describeMoves(h, e, mv, t)` writes the neutral line; a climb into or out of an unknown
  state reads the raw state name (INV-11). `t.short(role)` is a role's word as an identity line gives
  it: the pack's `Noun.short` where it has one (SDLC's attachment: `PR`), else its `one` (22 B3).
- **The event line** (`engine/eventLine.ts`, 22 B4, amended 2026-10-15): `eventParts(h, e, t, words?)`
  gives an event's `{ glyph, type, id, title?, action, person?, subject }` in the source register;
  `formatEvent` joins them as `Entity type · ID · Title — Action · by Person`. A pack's adapter may
  supply `event(h, e, t)` with its own words for an attachment's end (`ActionWords`); unset, the
  engine's. Every surface that names an event reads it (History, the ruler, the notes in play).

**The solar plan** (`engine/solar/`; geometry and its numbers in [08 §7](08-layout-solver.md#7-the-solar-system-v1-built-2026-10-10-to-2026-10-12)).
`planSolar(facts, pack: PlanPack)` (`PlanPack = Pick<DomainPack, 'id'>`), memoised per
facts object on (pack id, `SOLAR_LAYOUT_VERSION`). Helpers 14 doesn't name: `pieceAt(plan, f,
piece, t)` (always one of `plan.slots`, or null), `slotKey`, `formationId`, `compoundAt(slots, t)`
(`{ live, more }`) and `GEOMETRY`. `plan.slots` and `plan.platforms` are inserted in sorted key order.
As built, against 14 §4 (layout v9; the geometry is in 08 §7):
- **One regular ring.** Every seat sits at one radius, 2π / n apart in a stride coprime with n,
  starting at the top: the smallest radius at which every footprint clears the star and every other
  (not 14's `MAX_ORBITS = 8` or `R0 + i·ΔR`, and not 13 Q11's two rings). `SeatSlot.arc` is the half-span
  of the short orbit arc drawn through each planet.
- **No free cap** (`NO_FREE_CAP`): every piece stands in its seat's region, a formation member. (The
  pack's old crowding cap, `DomainPack.crowd`, was removed in v1.3 F3.)
- **The mandala (22 Block D, layout v8).** A formation's `cx, cy` is its planet's centre and its
  `offsets` its half-disc slots (`halfDiscSlots`); `memberR` is the seat's `SeatMandala.pieceR`, one
  size per planet, smaller on a busy one (a piece's size reads crowding, never output: INV-19).
  `SolarPlan.platforms` (by `slotKey`) holds a trophy slot for every piece that closes at the seat in
  the round, `index` its close order, `mode: 'platform'` (`trophyOffset`). `SeatSlot.mandala`
  (`SeatMandala`) carries the rest; see §5e.
- A facility's `mode` is its ring (22 C11, 05 §8 S-8): `inner` (every station's first choice), or `outer` (a one-seat station left over once the inner ring is full), with `size` 1 or `OUTER_SIZE` (0.7). Its node is drawn at `facilityR · size`, with `ViewNode.floorScale` = `size`, so its screen floor scales too; `ViewGraph.solar.stations` carries each one's `mode` and `size` for the renderer's station pass, which slides it along its ring. A theme's `CastView.plate()` gives a cast member's plate rect in world units (a formation keeps off it). `enterAt` is when the region first needs it (`firstNeeds`: its first PR event there in the round, while that PR serves the region), else the round's start; `summoner` made that event.
- A guard's `CompoundSlot.key` is its facility's key (`role` and `slot` tell guards apart).
- `visitsOf` is `heldSpans` grouped by seat, so a member gets a frontier slot before its first seat,
  and a visit made only while Off opens no seat and no slot, **except** a reseat made while Off to a seat
  already on the board, where the ghost takes a slot (23 C9, below).

**The projection** (`scene/project/solar.ts`). `projectScene`'s solar arm always calls
`projectSolar(ctx, ref, src)`; the boot `fallback` and its `projectSystem` branch are gone. The branch
lives in `projectScene` because the import fence keeps engine files away from the v0 layouts.

| Node | Projection key | Kind, asset | Look |
|---|---|---|---|
| The region's star | `scene\|region` | `star` (v0) | The pod aggregate (02 INV-05), at the plan's centre, r 150 (`GEOMETRY.starR`) |
| A seat | `scene\|person\|seat` | `seat`, `seat` | Every seat at every playhead, with an orbit edge from the star. `share` = Accomplished ÷ what the seat holds now (Off excluded); nothing is counted on the seat (finished pieces are platforms in orbit; the `outcomes` field left the contract in v1.4 A2). Rung as a pod's: all done, ≥ ¾ nearing or done, anything moving, else ready; category the rung's closed one |
| An objective or threat | `scene\|key` | `objective` / `threat`, same asset | At the slot of its seat at the playhead, or its frontier slot; once Accomplished at a seat, at its platform (`plan.platforms`, with `platform` set and no `cluster`). `activity` = `activityOf(t, [item, ...steps])`: 1 just now, halving every day since it or a step last changed, in quarters, unset at 0. Signal, category and `steps` (n/a/c in first-bind order, Off steps dropped, unset when none) from the snapshot; `stepKeys`, the same steps' keys with Off ones kept (unset when none), for the inspector. Resting: a landed objective or defeated threat rests on its platform (v4); Off is a ghost. Formation members get `cluster`. Every piece is `labelOnHover` (19 L7: hover-only; it speaks through its seat's list, and in play while a maneuver casts it). Built with `workNode`, so `meta`, `openable`, flags and evidence match v0 |
| A facility | `scene\|repo` | `facility`, `facility` | From its `enterAt` on. `compound.slots`: the slots live now (first-fit; a PR waiting past the cap is promoted into the first slot that frees, 23 C6, so a key can have two segments over its life but one at a time) (an attachment is live while its snapshot status is `active`, with that status's signal) plus the guards; `more` past the cap; `intensity` = share of linked pieces done; `piece.open` = every open attachment, "+N" included. Noun from the pack's words. **Standby (19 M1):** its recency is 1 at its PRs' last event here by the playhead (any change of an attachment's signal: opened, merged, abandoned; approvals come with the merge), halving every day of history; `activity` is that in quarters, unset at 0. With `piece.open` 0 and the recency under `STANDBY_BELOW` (0.25, two days), `piece.standby` and `flags.standby` are set (15 §10); place, size and slots are unchanged |
| An agent | `scene\|person\|ship` | `captain`, `agent` | From `projectCaptains(ctx, assignable, homes)` over the piece nodes (INV-07), `meta` = call sign, stage `captain` (no piece: a captain carries no rung). Seats go in as `homes`, so a seat holder with no assignable piece shown still gets one ship, beside where they last worked, else beside their planet, at `SHIP_R` (56). An Off ghost reassigned while Off is no anchor for its new assignee, wherever it now stands (23 C9). Then `projectGuests(ctx, anchors)` (2026-10-12): someone with no seat here gets a ship beside the last piece or facility they helped in the round up to the playhead (attached, settled or approved a PR, climbed a piece or one of its steps), once they have |

- **`boardFacts(f)`** (memoised; board facts map to themselves) is what the board, the planner and
  pacing read: it drops objectives and threats never on the ladder while members in the round, holds
  a reseat made while Off until the piece is back on the ladder (unless the new seat is already a board
  seat: then the ghost goes there at once and takes a slot there, after the pieces that were on the ladder,
  23 C9; `ghostSpans`, `offSpans` in `engine/facts.ts`, `rosters` in `engine/solar/slots.ts`; the
  ghost holds nothing, so `heldSpans`, `seatsOf` and `seatReason` don't see it), re-orders seats by the first instant
  each was held on the ladder, and keeps attachments only where they link to board pieces (or a step
  whose final parent is one).
- **`slotAt(plan, f, key, t)`** is `pieceAt`. `solarSource = { center, facts, pack }` with
  `facts = boardFacts(roundFacts(h, ref, packFor(h)))`. **`paceFacts(h)`** is the whole round's board
  facts (the sprint's ref) plus `regions` (each pod's own `facts(h, pod)`, 2026-10-13), or
  `boardFacts(scheduleFacts)` for a bundle that isn't a round; memoised per bundle (`paceMemo`), because
  `SOLAR.pacing` and the planner must read the same object.
- **Mega-lists** (`scene/project/lists.ts`; `ROW_BUDGET` lives here only, value in
  [15 §6](15-reference.md#6-labels-and-type)). `megaList(title, rows)` keeps `ROW_BUDGET` rows and
  counts the rest in `more`. `itemRow`: the title, `Type #id · raw state` (INV-11's
  raw name survives) and the rung. `seatList`: objectives then threats, free before formation, by slot
  index, landed pieces included. A piece has no list (19 L7, 2026-10-13: `pieceList` retired; the
  inspector's Steps list shows its steps, from `ViewNode.stepKeys`). `facilityList` (19 L6, 2026-10-13): every attachment of the facility opened by the playhead,
  in opening order, one row each: its title, `{word} #<id> · <Status>` (the pack's word for an
  attachment, `words.role.attachment.one`; the source's status, its first letter capitalised), the
  rung `attachmentSignal` gives its status, `serves` (the objectives and threats it links to, a step
  standing in for its parent, in link order) and the `subtitle` `{ label: '→ <type> #<id>, …', url:
  null }`. An attachment the snapshot doesn't hold, or that serves nothing it holds, has no row. No
  row names a container any more (Q6); `subtitle.url` and `key` stay in the contract for one that
  does.

**Schedule hooks** (`playback/schedule.ts`; 03 §7, 05 §8). `ScheduleOptions` gains `priorityOf`,
`focusOf` and `beatShape` (returning `BeatShape { afterMs: Map<string, number>; durationMs;
essential? }`). Unset, each line runs the v0 expression. `shapeOf` sets `essential` when any rule it
drafts for the beat is tier essential (a close, a merge, a milestone); over budget, such a beat is
never cut, as a High beat isn't (2026-10-13: a Bug's close is Medium, but its strike run is the
moment the chart exists to show). New exports: `BeatShape`, `v0BeatShape` (`protectBeat` plus the
group burst, moved verbatim), `prLinkTimesOf` and `focusOf` (v0's, now exported). `buildScene` and
`buildHighlights` spread `hier.pacing?.(h)` first, so their own `include`, `hier` and highlights'
budget win; `buildScene` takes a chain's `budgetMs`. `buildHighlights` still filters on
`e.priority === 'high'`, not on `priorityOf`.

**Maneuver rules and planning** (`engine/pace.ts`, `engine/maneuvers.ts`; every rule's trigger,
length and tier is in [15 §7](15-reference.md#7-maneuvers); the behavior, as rules with ids, is
[05 §8.4–§8.5](05-playback.md#84-what-plays-by-priority). This keeps the shapes.)
- `RULE` (the 17 rule ids: `attachment.merge` since 2026-10-12, `seat.complete` and `region.clear`
  since 2026-10-13, `region.sweep` since 27 E7a, last in `PACE_RULES`) and `RuleId`. `PaceRule extends ManeuverRule` adds `when?(mv, e, f)` (a further
  test with the event, for a milestone that needs the instant, 2026-10-13), `protectWhen?(mv, f)`,
  `waitsFor?` (rule ids of the same event this one starts after), `introduces?` (below), `light?`
  (`agent.light`: plays only where nothing else does, costs no time), `variant?(mv, e, f)` (a second
  shape: its name, the plan's `variant`, phases that replace the rule's, and optional `holds`,
  2026-10-12), `leads?` (in a beat, this moment goes ahead of any other it shares a cast member
  with) and `short?` (27 E4d: the phases of a shorter play, keyed by the form it shortens, `plain` or a
  variant's name; the planner never picks one, the director (27 E5) will) and `pass?` (27 F2: its captain flies
  through without stopping, `facility.enter`; amended 2026-11-09). Helpers: `phases`, `spanMs`,
  `shortOf(ps, keep)` (each phase × `SHORT_PACE`, rounded, but the `keep` phases), `shortForm(rule, variant?)`
  (`{ name: 'short' | '<variant>-short', phases }`, or null: a first merge has none), `castOf` (sorted, de-duplicated, empty parts dropped),
  `attachmentsOf`, `firstAttachment`, `seatAt`, `subjectOf`, `ruleById`, `workOf(f, attachment, at)`
  (the pieces an attachment's work is, a linked step standing in for its parent then),
  `mergedBacking(f, piece, at)` (the attachments merged by then whose work is the piece: their
  approvers and facilities), `seatCompletedBy(mv, e, f)` and `regionClearedBy(mv, e, f)` (below).
- **Entrances (2026-10-13).** `ScheduleOptions.orientMs?` (the orientation before the first beat;
  `pacing()` sets `OPENING_ORIENT_MS` 3000 for a solar region, so the opening plays in it).
  `FxDirector.opening?()` (the ManeuverInterpreter's; ChartApp calls it when Play starts from the
  start). `ThemePack.entrance?: Entrance` (`(node, quiet) => CommandCall[] | null`),
  `ManeuverDef.reveals?` (the choreography brings its new subject in itself: the interpreter keeps it
  hidden until then), `AssetDef.departAct?` / `departS?` (an asset's own departure, played in place
  by GraphScene.depart), `GraphScene.arrive(pk, delay, { center, spiral, dur, quiet })`.
  `threat.emerge`'s length is in [15 §7](15-reference.md#7-maneuvers).
- **The merge (2026-10-12).** `attachment.settle` plays every settle but a merge. `attachment.merge`
  (essential, protected, leads) plays a merge: `subject`/`attachment` the PR, `facility`, `agent` its
  author (else the move's actor), `support` its approvers, and `target` (a new `CastRole`, an actor:
  the pieces `workOf` gives). Variant `first` when the move is its facility's `RoundFacts.firstMerge`
  (the facility's first merged attachment **in the round**, `facts.firstMerges(events, movesOf, round)`;
  it was the first over the whole history until 2026-10-13); `RoundFacts.merges` lists each facility's
  attachments merged in the round, in merge order (`roundMerges`). The `first` variant's `act` covers the longest transformation (the Wars ring docking, 2026-10-12), which
  starts at the merge's gather (v1.4 E4a: the station fires as it ends); lengths are in
  [15 §7](15-reference.md#7-maneuvers). `objective.accomplish` and `threat.accomplish` cast
  `mergedBacking`'s facilities, with variant `beamed` when there are any. `PlannedManeuver.variant?`
  carries the variant.
  A facility's `PieceState.merged` counts the merges that make its form (2026-10-13): for a facility
  with merges in the round, those merged by the snapshot in the round (so it starts every playback
  in its first form); for one with none in the round, its PRs merged before it.
- **Holding and introducing (2026-10-13).** A rule's variant may name cast roles it `holds`: while it
  plays, nothing else in its beat that casts them starts (the `first` merge holds its `facility`).
  `PlannedManeuver.holds?` carries the keys; a held facility new to the scene this beat comes in with
  its look before the merge (no merges counted, `GraphScene.holdStage`), and its own lands with the
  merge. A rule that `introduces` its subject (`facility.enter`, `attachment.open`) goes ahead of any
  protected moment in its beat that casts that subject. At run time a maneuver waits only for
  protected moments of **earlier** beats that hold its actors; its own beat's order is the planner's.
- **Milestones (2026-10-13).** Two essential, protected rules match a close (`climb` to
  Accomplished) and then test it with `when`, against the region the piece is in at that instant
  (`RoundFacts.regions`, else the facts themselves):
  - `seat.complete`: `seatCompletedBy` answers the seat whose every counted piece (a member, on the
    ladder, not Off) is Accomplished once the close lands. Cast: `subject`, `seat` and `agent` (the
    seat).
  - `region.clear`: `regionClearedBy` answers the region whose last open threat this close is. Cast:
    `subject` and every seat holding a piece there then.
  - Several closes in one instant make one milestone, on the last event by key (`lastCloseAt`).
  - Theme seams: `ManeuverDef.owns` (cast roles whose new look this maneuver lands, over any other
    moment in the beat: the seat's world blooms at its own land) and `ManeuverDef.freezes` (`{ guide,
    until }`: its subjects' part in a guide held as it was before the beat until a phase starts,
    through `GraphScene.freezeGuide(id, before, pks)` / `thawGuide(id, pks)`, counted per node; the
    guide's other nodes follow the scene meanwhile. Reassign holds its piece's part in the Star
    Chart's `solarGuide`, the frontier belt, until it flies, so the belt fades with the flight, 19 S2).
    A guide with `shownBy` shows in play while one of its nodes is drawn (a newcomer hidden for its
    entrance isn't, until it shows) or one that kept it shown is still departing; the opening hides it
    with the cast (`GraphScene.hideGuides`).
- **Casts.** A piece's cast is `subject`, `agent` (the move's actor, else `changedBy`) and its `seat`
  (or `frontier` when unassigned). A defeat adds the reviewers of the attachments linked to the threat
  as `support` and their facilities as `facility`; engage and nearing add those facilities; a reseat
  casts `fromSeat` and `toSeat`; a settle casts its author and approvers as `support`; a merge as above.
- `planManeuvers(h, beat, f, rules = PACE_RULES, eng = ENGAGEMENT.calm, opts: PlanOptions = {})`,
  where `PlanOptions = { priorityOf?, limelight?, sequence? }` must match the schedule's. The limelight carries the director's `direction` (27 E5a, 05 §8.5c): a merge may draft as a progress beam, a short form or the day's climax. **Sequencing:** a protected moment
  starts once every earlier moment it shares an actor with has finished; any other maneuver once every
  moment whose actors it shares has finished, and after its `waitsFor` rules (a leading moment counts
  as earlier than the rest of its beat). The actors are the cast's `subject`, `agent`, `support`,
  `attachment` and `target`. Since 27 E4 (P3) a maneuver that waits for a moment only through a hold
  (it shares no actor with it: a first merge's station) starts `seamStartMs` before the moment's end,
  so its tell and gather play in the moment's echo and disperse and its act starts at the end; and
  (P4) a maneuver that flies a person an earlier one flies starts `nearStartMs`: as that ship leaves,
  not at the maneuver's end. `SequenceOptions = { seams, near }` (default `SEQUENCE_ON`, both true) undoes
  each part; the app never sets it, the pacing ledger does. Since 22 A11, B7 and B9 the sequencing also queues one person's work
  (`crewBusy`), budgets attention (`attentionFrom`, `ATTENTION_MAX`) and counts a flying crew's turn
  (`crewTimes`): 05 §8.5 P-5 to P-7. Each maneuver has `seed = fnv1a32(eventKey)`,
  `protect = { keys: sorted actors, windowMs: durationMs }`, `from` / `to`, and `keys` (every cast key,
  sorted). Unaccented beats plan `agent.light` only, gated by `Engagement`.
- `shapeOf(h, events, f, rules, prio, ll?, seq?)` is the `BeatShape` the same sequencing gives, so a beat is as
  long as its non-light maneuvers. `pacing(pack, { rules?, facts?, region?, sequence? })` returns the hooks object
  directly (not a function of `h`): `beatShape` always, `priorityOf` / `focusOf` only when the pack's
  adapter has them. `scheduleFacts(h, pack)`: the default facts for a bundle that isn't a round, now
  `roundFacts` over the bundle's whole scope (one fold, so pacing and the scene can't drift; 23 D3). `priorityFor(pack,
  facts)`: the pack's priority hook, or undefined.

**Achievements** (`engine/achievements.ts`). `achievementsFor(f, viewer, pack, opts: AchievementOptions = {})`
returns the viewer's awards for one region's round in the order earned (ties in rule order); no
viewer gives `[]`, and nobody else's are computed. `AchievementOptions = { tz?, terms? }`: the team's
time zone for working hours (default UTC; the app passes `playback.ts`'s `TZ`) and the terminology for
each award's `reason` (default: engine words; the app passes the chart register).
`AwardRule extends AchievementRule` takes an optional `ctx?: AwardContext` (`{ tz, t }`); a rule called
with 14's three arguments uses UTC and engine words. `Award` and `AchievementRule` live in
`engine/types.ts`. The ledger is read once per facts: dated arrivals come from `RoundFacts.at`, the
holder from `seatAtEvent`, and only the last climb onto a rung in one millisecond counts.

| id | Insignia shape | Earned when (held = a member, at the viewer's seat, at that instant) |
|---|---|---|
| `clear-skies` | `sun` | Everything the seat holds at the round's end is Accomplished (Off ignored, unknown counts against), with at least one dated landing; earned at the start of the seat's last clear stretch |
| `hat-trick-landings` | `triple-chevron` | Three different held objectives land in the round; at the third |
| `hat-trick-defences` | `triple-shield` | The same, for threats |
| `hat-trick-reviews` | `triple-star` | The viewer approves three merges in the round, authoring none of them |
| `swift-passage` | `arrow` | A held objective lands within `swiftDays × dayHours` weighted hours of its first dated Underway |
| `steady-hands` | `level` | The seat never holds more than `wipK` objectives and threats at Underway, and at least one lands; at the last landing |
| `clean-landing` | `ring` | A held objective lands with every step bound to it then (by `parentAtTime`; Off aside, unknown counts, at least one) already Accomplished |
| `wingman` | `wings` | The viewer helps a piece another seat holds (closes one of its steps, or authors or approves a merged attachment linked to it), and the piece lands then or later |

**The play gate and hooks** (renderer).
- `hierarchy/registry.ts`: `registerHierarchyUi(paradigm, ui)`, `uiFor(paradigm)` (throws for an
  unregistered paradigm), `RegisteredUi = HierarchyUi & { chooser }`. `hierarchy/solarUi.ts` is
  `{ ...sprintsUi, hierarchy: SOLAR, chooser: 'sprints' }`. `SOLAR.pathTo` drops `body` refs, and
  `nav.ts` passes a one-member level through by `hier.labelOf` only when the member level is solar.
- `playGate.ts`: `gatesPlay(hier)` (any level `playable: false`), `playableAt(sceneKey, hier?)`,
  `playableHere()`. `playback.ts` guards play, toggle, step and the in-view jumps with it; where it's
  false, the Transport shows the `.transport--gate` plate.
- `playHooks.ts`: `BeatPlanArgs`, `BeatPlanner` (answers `null` for a scene it doesn't own, and v0's
  accents play), `RecapHook`, `ShownAward = Award & { holder }`, `registerBeatPlanner`,
  `registerRecapHook`, `planBeat`, `recapAwards`, `beatAwards` (the awards a beat's own events earned).
- `v1/plan.ts` (`isSolarScene`, `planSolarBeat`: `planManeuvers(h, beat, paceFacts(h), PACE_RULES,
  eng, { priorityOf })`), `v1/awards.ts` (`awardsIn`, `currentAwards`, `useAwards`: only in a solar
  region, with the switch on and a viewer chosen; cached per bundle, scene and viewer; every award's
  `holder` is the viewer), `v1/lines.ts` (`solarChain`, `termsFor`, `movesOfEvent`, `solarLine`,
  `solarRung`, `solarSubject`, `playPlate`: the Transport's and History's lines through the pack).
  `App.tsx` imports `v1/plan` and `v1/awards` once, which registers both hooks.

**Scene seams** (`chart/scenes/GraphScene.ts`, `framing.ts`, `fx/timing.ts`, `scenes/placeFormation.ts`).
- `createEntry` asks `assetFor(node)` before the v0 switch. The def's `layer` picks the sublayer
  (`celestial` into the painted geography; `infrastructure` and `traffic` into the hardware); a
  hardware asset's `marks` go into `hardwareMarks`, above the hardware and outside the paint pass. If
  `make` throws, the node falls back to the v0 switch with a warning.
- **`EntryCaps`** (`celestial`, `moving`, `flare`, `body`, `framed`) per entry, from the asset's
  capabilities or the v0 kind tables. Asset entries are oriented by shape (`setLightFrom?`, `face?`):
  light from the orbit's star, else `graph.solar.star`; a node with `attach` faces its work, others
  the star. A new asset entry is lit after `settle()` places its root.
- **Floors:** `AssetDef.floorPx` raises the effective radius and `hitFloorPx` the hit floor. A
  formation member's hit stops halfway to its nearest neighbour (`cluster` nodes only).
- `tick` copies the root's scale to `marks`, and for asset entries its alpha.
- **Seams:** `setAssetCtx(ctx)` (a change rebuilds asset views; an entry is also rebuilt when `asset`
  changes or `def.rebuildOn` says so), `setGuides(list | null)` (the default is
  `activeTheme()?.guides`, read only when the graph has `solar`), `capsOf(pk)`, and `actView(pk, act)`
  (plays `AssetView.act` when `AssetDef.acts` lists it; returns whether it did). `landAllStages` also
  rests every asset act, and calls every view's `settle?()` (19 M1); so does a stage applied on a snap
  (a seek or scene entry, `stageTo`). `viewTints(pks)` reads each view's root tint (a test hook).
- `framing.ts`: `climaxFrame` (27 E9: the directed camera's pure climax shot); `isFramed(n)` (the asset's `framed`, else `FRAMED_KINDS`); `boundsOf` includes a solar
  region's whole frontier belt and every formation's spread at the fit's scale. `fx/timing.ts`:
  `FLARE_KINDS` and `BODY_KINDS` are `KindTable`s (`has(node)` reads the asset; `has(kind)` keeps v0's
  answer and counts a v1 kind whose bound asset has the capability).
- `placeFormation.ts` (since 22 Block D: slots stay exact, `drawnMandalas`, `placeLoiterRings`): `FORMATION_PITCH_PX` (the density guard's, values in
  [15 §5](15-reference.md#5-sizes-floors-and-layout)), `formationLayout`,
  `formationLayouts`, `groupReach` (how far a group's hits reach from its centre), `placeFormations`,
  `memberRadius`, `FormationLayout`, `platformSpots` (every platform a region could hold, at the scale,
  keyed `${seat}|${role}|${index}`), `placePlatforms` and `placeStations` (each planned station from
  `graph.solar.stations`, in order, on the first clear spot of a spiral round it; the answer is memoised
  by content, v1.3 F6: the plan's JSON, the scale and the drawn stations' and formation members' size
  fields, the last four kept, so a re-projection to the same plan and scale reuses one; `clearStationMemo`
  and `stationMemoStats` are test hooks). Under solar,
  `placeInScreen(effective, scale, lane, solar?)` places formations, then platforms, then stations, then
  the attached and travelling objects. Details in 08 §7. `solarGuides.ts`: `solarGuide` (id `solar`), the frontier belt, `shown` while
  one of `graph.solar.unassigned` is drawn (19 S2). The Star Chart's `guides` are `[solarGuide]`. (`threatGuide` and
  `drawThreatLight`, the threat light, retired in 19 S2.)

**Assets and the theme** (`chart/assets/`, `theme/`).
- `registerAsset`, `bindAsset(role, id)`, `assetById`, `assetFor(n)` (the binding first, then the raw
  id; undefined for a node without `asset`, so every v0 node keeps the v0 switch), `allAssets`,
  `resetAssets`. `registerTheme`, `themeById`, `allThemes`, `onThemeInstall`, `useTheme(id)` (runs
  every install hook: the bindings, then the command and maneuver registries) and `activeTheme()`.
  `theme/starChart/index.ts` registers itself on import; `INNER_PARTS` (`augmentation`, `shuttle`,
  `point-defense`, `none`) are role ids drawn inside a parent or not at all, so no asset registers them.

  | Role | Asset id | Art | Layer | moving / framed / flare / body | Acts |
  |---|---|---|---|---|---|
  | seat | `world` | `WorldView(r, seed)` | celestial | ✓ ✓ ✓ · | — |
  | objective | `asteroid` | `AsteroidView(r, seed, asteroidMaterial(seed))` | celestial | ✓ ✓ ✓ ✓ | `contact` |
  | threat | `hive` | `HiveShipView(hiveDesign(seed), 2r)` | infrastructure | ✓ ✓ ✓ ✓ | `emerge`, `breakup`, `warp`, `retreat` (its `departAct`) |
  | facility | `dreadnought` | `DreadnoughtView({ faction, colourway, length: 2r, seed, guardCount })` | infrastructure | · ✓ · · | `jump`, `intake`, `cover`, `dock`, `charge`, `transform`, `muster` |
  | agent | `captain` | `CaptainView(design, r)` | traffic | · · · · | `transform` |

  Each asset's floor, hit floor and label rank are in [15 §4](15-reference.md#4-roles-kinds-and-assets)
  and [15 §5](15-reference.md#5-sizes-floors-and-layout). The floors equal `FLOOR_PX` for the
  matching kinds (`sizing.ts`, exported since 2026-10-13), which `boundsOf` still reads.
  Three more `AssetDef` fields (2026-10-12): `label?: HoloSpec` (`chart/holo/holoLabel.ts`: `frame`
  `chamfer`, `variant` `title` · `subtitle` · `avatar` (`title` was `minimal` until 19 Q5), `layout`
  `horizontal` · `vertical`) draws a holographic plate in place of the standard one (world: title, horizontal; dreadnought: subtitle,
  vertical; captain: avatar, vertical); `over` draws the art over every painted body that isn't `over`,
  whatever their depth (the asteroid, which overlays its planet); `labelRim` is where an upright label's
  connector meets the art, as a fraction of `world.r` (dreadnought 0.5, captain 0.4).
- **Acts** (`assets/adapt.ts`, `AdaptedView`): `setStage` hands the art its own grammar; `act(name)`
  plays a transient look that ends by itself after one `EVENT_LOOP_S` loop (3 s) of
  `motion.pulseTime`, so at 2× a station shows one loop, not two. `act('rest')` or the next stage ends
  it sooner; an optional `restore(art)` undoes what an act changed outside the look (a transformed
  hull's pose). Unknown names (looked up with `Object.hasOwn`) do nothing. `artTime(seconds)` (protected,
  identity) is the clock the art is ticked with. The station's view (`assets/standby.ts`, `StationView`,
  19 M1) eases a stage's `standby` in over `STANDBY_FADE_MS` and out over `STANDBY_WAKE_MS` (wall
  time), tinting the art's root and marks grey and every additive layer under the root a deeper grey,
  and slows `artTime` to a stop with it; its first stage, `settle` and reduced motion land it at once.
- **The art grammar** (`theme/starChart/stageCodec.ts`, pure): `pieceOf(stage, role)` (null for
  another role or a bad stage, INV-11); `seatLook` → `world.<percent>.m0r0` (no outcomes: the world art
  takes `megastructures`/`research` as options and the `.m<n>r<n>` suffix, set only by the gallery; the line comes from the seed); `objectiveLook` → `asteroid[.<material>].<state>:<steps>`
  (`asteroidState`: Ready is sketch, deferred or ready by its flags; Nearing is `resolved` below
  `ACCEPT_STEP` 0.5, `accept` from it; Off `ghost`; unknown `unknown`); `threatLook` →
  `threat.<swarm>.<look>|<steps>` (`threatState`: Accomplished rests as `ruin`; Off is `rejected` when
  struck, else `ghost`; unknown `ghost`; deferred `ready`; no steps `-`; `THREAT_ACTS` maps `emerge`,
  `breakup`, `warp` to the art's moments); `facilityLook` → the parameters for the art's own
  `stationStage` (intensity, `pr` = the open count, `pd: 'idle'`; `STATION_ACTS`). Each string is
  checked against the art's own parser (`assetStage.test.ts`).
- **Factions** (`theme/starChart/factions.ts`): one `Faction` type checked equal to the art's;
  `hullsOf`, `designOfStyle(style)` (a `CaptainStyle` as a `FleetDesign`, wrapping out-of-range
  values), `agentDesign(seed, style | null)`, `stationLook(seed, faction?)` (faction `seed mod 3` or
  the given one; colourway `floor(seed / 3) mod` that faction's count). The viewer's style reaches only
  the viewer's ship, and a station whose `compound.summoner` is the viewer once they've chosen a style.
- `ThemePack` fills `roleAsset`, `assets`, `commands` (overrides), `maneuvers`, `guides` and `words`
  (the chart register: asteroid, hive ship, augmentation, station, tender shuttle, point defense; a
  captain; galaxy, sector, solar system, planet, frontier belt), and optionally `entrance` (§5d,
  Entrances), `ambient` (below), `finale` (below) and `seatTitle(h, person)` (a seat's own title,
  stable over a loaded history; the Star Chart's is `homeworldOf`, a named homeworld; null keeps the
  person's name).
- **The finale (2026-10-13).** `ThemePack.finale?: Finale` plays once in place of the recap bloom when
  playback reaches the end of a round that is over (`playback.ts`: a sprint sector whose `finishUtc`
  has passed and that the range covers; it calls `recap(keys, awards, { finale: true })`). The
  interpreter builds a `FinaleCast` from the drawn scene (the star, the pieces finished in order, every
  ship and seat), issues its `calls`, and lights the viewer's awards at `awardsAtMs`, on their own
  ship wherever it is then (in the formation, say). `installTheme`
  keeps it; `finaleOf()` reads it. The Star Chart's is `theme/starChart/finales.ts` `finale`: never
  a scoreboard (no counts, no ranking, INV-19). Its timings are in
  [15 §10](15-reference.md#10-timing-and-budgets).
- **Idle life (2026-10-12).** `ViewNode.activity` is how lately a piece was worked (the projection's
  `activityOf`: 1 just now, halving every day since it or a step last changed, quantised to quarters,
  unset at 0); it is never a measure of a person. `GraphScene` tells each view that has
  `AssetView.ambient?(a: Ambient)` about four times a second: `{ activity, toward? }`, `toward` a
  threat's way to the nearest captain. `AmbientWork` (`fx/types.ts`, `work(ship, piece, activity, n)
  → CommandCall[]`) is a theme's idle work: the interpreter has a captain at rest beside an Underway or
  Nearing piece work it every 9 to 22 s (quicker with `activity`), on its own runner (not a live
  command, INV-15), only when calm, and never in reduced motion, over a protected moment or with a moving ship.
  `ThemePack.ambient` supplies it (`installTheme`, `ambientWork()`); the Star Chart's is an `idleBeam`
  over an asteroid, or a `burst` of two or three bolts at a hive ship.
- **The theme's own commands** (`theme/starChart/commands.ts` `commands`, `entrance.ts`
  `entranceCommands`, `finales.ts` `finaleCommands`; typed builders `themeCmd`, `enterCmd`,
  `finaleCmd` and `burst`): `guest`, `charge`, `phaser`, `cutter`, `mine`, `idleBeam`, `bolt`,
  `energy`, `enter`, and since 2026-10-13 `glint` and `allClear`. Each one's tier, weight, cuttable,
  clock and reduced substitute are in [15 §8](15-reference.md#8-effects).

**Commands and the interpreter** (`chart/fx/`).
- `FxDirector` as 14 §2.8, except **`bias` is a field** (as on `AnimationDirector`). `FxBeat` is the
  beat context plus `maneuvers?`. `FxHost` (`fx/host.ts`, `makeHost`) is the director's host plus
  `stage()`, `layer()`, `px()`, `reduced()`, `calm()`, `at(delayS, fn, clock?)`, `add(fx, meta?)`,
  `grandSlot(wantS, capS)`, `bursting()` and `act(pk, act)` (the art-act seam, over
  `GraphScene.actView`). `CastView = { key, node, at, gone?, drawnR?, host? }`: `gone` means it left
  the scene this beat, so `node` and `at` are where it was; `drawnR` is its drawn radius now (a
  hardware floor can make it bigger than `world.r`); `host` is the compound a part is drawn in, which
  captains aim at instead of the part (2026-10-12). `CastViews.away` lists cast people with no ship
  here, who can jump in as guests.
- `FxRunner` (`fx/movers.ts`) copies the v0 director's bookkeeping (the v0 copy stays): live effects
  and tells, one mover per node, protects with their actor keys (`protectedFor`), the profile's `render.limits.maxActiveFx`
  budget, ducking and one grand burst at a time; each effect carries `RunMeta` (name, weight,
  cuttable, clock). Movers `HoldFor` and `Sortie` (`besideOf`).
- **The seed commands** (`fx/commands.ts`; `registerCommand` for a theme's override by name,
  `commandByName`, `allCommands`, `resetCommands`, `reducedCall` for INV-20, typed `cmd.*` builders,
  and the kit `one`, `present`, `sortie`, `away`, `pointOf`, `phaseMs`, `phaseAtMs`): `flare` (with
  `grand`), `ring`, `ink` (its `snap` releases its held edge), `spark`, `tractor`, `support`,
  `pursue` (a mover; with `to`, a sortie), `hold` (a mover), `protect` and `insignia`. Each one's
  tier, weight, cuttable, clock and reduced substitute are in [15 §8](15-reference.md#8-effects).

- `fx/v1/registry.ts`: `registerManeuver`, `maneuverFor`, `allManeuvers`, `resetManeuvers`,
  `installTheme` (subscribed to `onThemeInstall`: each active theme replaces the maneuvers, and resets
  the commands to the seeds before applying its overrides, and keeps its `ambient`, `entrance` and
  `finale`: `ambientWork()`, `entranceOf()`, `finaleOf()`). ChartApp imports it before
  `theme/starChart`.
- **`ManeuverInterpreter`** (`fx/v1/interpreter.ts`; its rules with ids: 05 §8.5 P-9 to P-14), per beat: (1) **gate** by tier, with
  `v = volatility() + 0.6 × count` (essential always; narrative unless `v ≥ OVERLOAD`; ornament unless
  `v ≥ BUSY`; `Engagement.ignoreLoad` lifts both); (2) **protect** each protected maneuver's actors
  from now to `start + windowMs`, where the moment is on screen; (3) **wait**: start at `afterMs`, or
  later while another event's protect holds an actor; (4) **claim** the pending look of the subject
  and of the cast already on the board (`seat`, `fromSeat`, `toSeat`, `facility`, `attachment`), new
  subjects fading up from `act`; (5) run each **phase** on the beat's travel clock through the
  registry (delay, reduced substitute, tier at issue time; movers owned by the maneuver's event); (6)
  **land** each claimed look once per beat (a protected moment's land wins, then the earliest), at the
  `land` phase or when `act` ends; a maneuver that `owns` a cast role lands that look over the others
  (2026-10-13), and one that `freezes` a guide holds its subjects' part in it until its phase starts. A rule with no choreography lands with a ring; a thrown phase is
  logged and skipped. **Cast resolution:** `subject` prefers objective, threat, facility; `agent` and
  `support` the captain; seat parts the seat (14 §9 D1); an attachment resolves to its slot on its
  facility; a key the board doesn't draw in the preferred kind (a ghost's `toSeat` that isn't a seat,
  a reviewer with no ship) is skipped. `tell` glows each coming non-ornament subject; `recap(keys,
  awards, opts?)` blooms the Accomplished pieces, then each award's insignia (`showAwards`, waiting
  up to 4 s for calm), or with `opts.finale` in a solar scene plays the theme's finale instead (above);
  `clear()` follows 14 §4 (INV-15); `census()` adds `maneuvers`; `trailCount()` is 0. **Pieces'
  labels in play** (19 L7, 2026-10-13): `tell` opens no windows (27 E2, R11: an object arrives before its
  label; this amends the earlier tell-opened, tagged windows and the lead); `play` opens one, for each hover-only piece a
  non-ornament maneuver casts as `subject`, `frontier` or `target` (not gone, not a compound's part),
  from the maneuver's act (`claimMs`, once its cast has arrived; the same instant its crew's names
  open) to the end of its `land` or `echo` (else its act,
  else its duration) `+ CAST_LABEL_LINGER_MS`. The windows are a `CastLabels`
  (`fx/v1/castLabels.ts`) stepped at the travel rate, held while frozen (the labels fading out over
  `CAST_LABEL_FADE_MS` of wall time meanwhile, and back on resume), cleared by `clear()`;
  `labelled()` reads them, fading over `CAST_LABEL_FADE_MS` (none in reduced motion: paused, off). The
  `SwitchingDirector` forwards it in a solar scene (none in v0's).
- **`SwitchingDirector`** (`fx/v1/switching.ts`, 17 D10): scenes whose level layout is `solar` go to the
  interpreter, the rest to `AnimationDirector`, chosen per beat and per frame and memoised by scene
  key; the side left behind is cleared; `bias` sets both. `SwitchingCensus` = v0's census plus
  `maneuvers`.
- **ChartApp**: `new SwitchingDirector(host)`; `playBeat` / `tellBeat` take an `FxBeat` with
  `maneuvers` (the lead-in plans the next beat too); `recap(keys, awards, opts?)`; `insignia(awards)`;
  `fxCensus(): SwitchingCensus`; `liveCommands()` (`activeCount()`); `setAssetCtx(ctx)` (switches the
  theme if `ctx.theme` differs, and keeps the context for scenes mounted later). `ChartCallbacks` gains
  `onPick(key)` (an expanded plate's row's press) and `onOpenContainer({ container } | { piece })`, which
  `App.tsx` sends to `openInAdo(key)` only when `caps().openInAdo` (read-only, INV-21).

**Labels and overlays** (`chart/labelTiers.ts`, `labels.ts`, `overlays.ts`, `overlays.css`,
`holo/holoLabel.ts`, `holo/holoRows.ts`, `holo/holo.css`).
- `tierFor(node, s: TierState)` → `LabelTier` (`expanded | full | title | picture`; named once in
  v1.1, 19 Q5, from `expanded | standard | compact | minimal`) is v0's inline rule moved out of
  `labels.ts`, plus `expanded` for a v1 node (one with `asset`) that is pointed at or selected while
  otherwise full; v0 nodes never reach it. `isCompact(tier)` (Title or Picture).
  `labels.ts` writes `data-tier` (keeping `is-compact`), ranks a label by `assetFor(n)?.rank`, then
  `RANK`, then 6, and gains `obstacles(rects)` (overlay rects labels go around, from the previous
  frame) and `expanded()` (the plates showing their rows). `Rect` is exported.
- **The expandable plate** (19 L2, 2026-10-13; it replaced the `MegaLabelLayer` overlay and
  `.callout--mega`). `LabelLayer.sync(nodes, level?, lists?)` takes `graph.lists`; `LabelInput` gains
  optional `light?(keys | null)` (19 L6: a row's `serves`, else its own key), `pick?(key, e)` and
  `open?(url | null, key?)`, which ChartApp wires to
  the hover ring (`overlays.light`), `onPick` and the container link. A holo plate with a list shows
  its rows (`HoloRows`, appended in the plate, `.holo__list` › `.holo__rows` › `.holo__row`) while its
  tier is `expanded`, `GRACE_MS` after, and while the pointer is on the plate; the plate gets
  `is-expanded` (lifted, `z-index` 3, capped at the view and `EXPANDED_MAX_W`). It is placed from its
  Title or Full size: the place it had (or, on expanding, `expandAt(cands, k, w, h, viewW, viewH,
  clear?)` re-places once), grown by `growPlacement(at, w, h)` (keeps the side, the pointer and the
  near edge) and kept in view by `slidePlacement` (along the pointer's edge); the place is pinned
  while expanded. Expanded plates place first; a focused plate with no free place never shows under
  one. Rows carry a rung mark (`RUNG_MARK`; `--rung` from `RUNG_COLOR`), label, meta and optional
  subtitle; at most `ROW_BUDGET`, then "+N more" (`rowsInBudget`; values in
  [15 §6](15-reference.md#6-labels-and-type)). Input is delegated to the plate and survives a redraw
  (the lit row is found again from the pointer): hover (or a touch hold, `LONG_PRESS_MS`) lights a row
  (its `serves`, else its own key; a press picks the first of them); a press selects only after a matching pointerdown on the same row, and never presses the plate's
  own object (`inRows`); a subtitle with a URL or key is a span that calls `open(url, key)`, never an
  `<a href>`.
- **Hover-only pieces, both ways** (19 L7, 2026-10-13). A `labelOnHover` node whose key is a row of
  its own in another holo plate's list (not a row's `serves`) speaks through that plate, its *host* (a
  seated piece's planet): pointed at or selected, the host opens as if its own object were (pointed:
  expanded; selected: expanded while settled), and the piece's own plate stays hidden while the host
  is open or the pointer is on the piece. `HoloRows.markObjects(lit, selected)` (called from
  `setHighlight` and on expanding) lights the rows whose own key is hovered or lit on the chart
  (`is-lit`) and marks the selected one's (`is-selected`); it never calls `light` back. A piece with
  no host (the frontier's) shows its own plate when pointed at, selected or lit. In play,
  `LabelMotion.cast` (ChartApp passes `director.labelled()`) shows each cast piece's plate, title
  only, at the given opacity (paused, the interpreter fades it out), placed after focused plates and, failing a clear place,
  over bodies but never over another label.
- `ChartOverlay` as 14 §2.9, plus optional `focus?(f: OverlayFocus)` (`{ expanded }`, from
  `labels.expanded()`) and `light?(keys | null)` (one ring per lit object, 19 L6); the camera is
  `CameraController`. `OverlayInput = { light?,
  press?, open?(url: string | null, key?) }`. `registerOverlay(id, factory)`, `overlayIds`,
  `resetOverlays` (keeps `HOVER_RING`), `createOverlays(host, input)` → `OverlayStack` (every
  registered overlay, in id order; only the built-in hover ring, `.hover-ring`, since v1.1). Per
  frame, after `labels.position`: `overlays.focus`, then `overlays.position`, then
  `labels.obstacles(overlays.rects())`; `sync` and `clear` beside the labels'.
- All v1 CSS is under `[data-paradigm='solar']` (17 D13); `App.tsx` sets `data-paradigm` on `.app`.

**Settings** (renderer; storage and IPC in §6).
- `settings/store.ts`: `useSettings` (`settings`, `loaded`, `persisted`, `open`, `tab`,
  `hostsConnection`, `devView`), `loadSettings()` (retried after a failure), `patchSettings(patch)`
  (applied at once; changes main hasn't saved are queued and sent in order; a patch the schema refuses
  changes nothing), `onSettingsChange`, `useSettingsView`, `settingsOpen` (the `onKey` guard),
  `openSettings(tab?)`, `chooseTab`, `closeSettings`, `SETTINGS_TABS`, `resetSettingsStore`. The
  Connection tab has no open state of its own: it shows when `hostsConnection && connectOpen`.
- `settings/views.ts` (13 Q9): `DEV_VIEWS` (Solar, Sprints, Backlog), `chooseView(p)` (closes Settings,
  sets `devView`, calls `nav.setParadigm`, then saves `devParadigm`; `nav.boot` sets `devView` again when the
  view it opened in is the remembered one), `backToSolar()`, `showsSettings(paradigm, devView)`: the cog
  shows under Solar or a toggle-chosen v0 view, never under a pinned v0 launch.
- `settings/viewer.ts`: `peopleOf(h)` (captains by full name, A–Z), `orgOf`, `viewerOf`,
  `captainStyleOf`, `assetCtxFor(settings, h)` (the `AssetCtx` for the scene), `useViewer`,
  `useCaptainStyle`, `chooseViewer(key | null)` (only a loaded person), `styleCaptain(style | null)`.
  Nothing is suggested (13 Q8).
- `SettingsModal` (`awards?`) and `SettingsButton`: a `role=tablist` with a roving `tabindex` (↑/↓
  wrap, Home/End), Esc and a backdrop click close it, focus is trapped, keys stop at the modal, every
  target is at least 44 px. The close button carries `settings__close connect__close`; the Connection
  tab is `section#connect-panel.connect.connect--tab`. `tabs/Read.tsx` `readTerms(h, chartWords)` →
  `{ chart, source, packId, known }` (a pack this build lacks reads in engine words, never SDLC's).

**Gallery seams (17 W4-T1; development only, `src/renderer/src/gallery/`).** `extraSections()` is the
one entry point `Gallery.tsx` appends after the v1 families: `registrySections()` (each registered
`AssetDef.samples()`, drawn through the theme's factories) and `maneuverSections()` (one looping demo
per pace rule). `demoCases()` schedules and plans `pod-sprint` as the chart does and picks each rule's
moment; `DEMO_PICK[rule]` (a remix knob) chooses a later occurrence. The file declares a global
`ImportMeta.glob` to load the fixture DSL; drop that declaration if `vite/client` types are adopted,
since they declare `glob` too.

**The fences.** `eslint.config.mjs`: `src/shared/**` may not import the renderer;
`src/shared/engine/**` and `scene/project/{solar,lists}.ts` may not import `packs/**`,
`hierarchy/{backlog,sprints}` or `project/{field,system,radar,traffic}`, with one carve-out: they may
import `projectCaptains` and `projectGuests` (and nothing else) from `project/traffic.ts`, because
solar draws its ships with the shared captain projection. A namespace import of `traffic` or any other name from it still
fails. `tests/unit/literalFence.test.ts` fails on any SDLC name as a string literal (`'User Story'`,
`'Closed'`, …) or any theme word as a whole word (asteroid, hive, dreadnought, station, shuttle) in
those files; it globs them, so new engine files are covered. `stations` and `StationSlot` are engine
names and pass. A bare object key such as `Resolved` (a neutral category name) passes too.

### 5e. Block C additions (22 C2–C12, built 2026-10-15 to 2026-10-16)
"Win as a Team": the contract changes behind 05 §8.3a to §8.6a, in one place. The rules themselves
are in 05 §8; the values in 15.

```ts
// Story time (22 C2, 05 §8.3a; 02 §5): Solar plays a retimed copy of the bundle; the record keeps real time.
// playback/storyTime.ts
storyTime(h, tz): StoryTime            // a copy of the bundle retimed: arcs pulled to their merge, a story's day gathered; memoised
realTimeOf(h, eventKey): UtcMs | undefined   // the real time History's rows show, where story time moved it
storyFocus(h): ReadonlyMap<eventKey, CanonicalKey> | undefined   // an arc shares its merge's focus, so they group into one beat
// renderer v1/story.ts presented(h): the history the chart plays (story time under Solar, else h)
// playback/workHours.ts: isWorkingQuarter, workingHours(fromUtc, toUtc, tz), QUARTER_MS   (ARC_WORK_HOURS, 15 §10)

// A region's own PRs (22 C12): only a PR serving the region's work while open plays or counts there.
// engine/facts.ts
servesAt(f, prKey, atUtc): boolean      // the PR served the region's work at that instant
roundMerges(events, movesOf, round?, keep?: (attachment, at) => boolean)   // keep: servesAt
LevelDef.sceneEvents?(h, ref): (e) => boolean    // a level's own filter over its scene's events (Solar: regionEvents)
Hierarchy.pacing?(h, ref?: SceneRef)    // the region's ref, so its pacing reads its own seats and facts

// Beats (22 C5, C6; 05 §8.3b, §8.5a, §8.5b)
Beat.opensDay?: boolean                 // the gap before it is a day turn (DAY_TURN_MS)
interface Limelight { named: ReadonlySet<`${eventKey}|${ruleId}`>; spotlights: ReadonlyMap<beatIndex, CanonicalKey> }
// 27 E5a: the director (engine/director.ts directorOf), carried on the limelight so seek and play share one pass (INV-12)
type MomentForm = 'full' | 'short' | 'progress' | 'montage' | 'light' | 'joined'   // light (27 E5c): draftsOf drops the draft; its event falls to light work; joined (27 E6a): a merge drafted into its volley's carrier
interface Direction { forms: ReadonlyMap<turnKey, MomentForm>; climaxes: ReadonlySet<turnKey>; levers: readonly string[]; estimateMs: number; tempo?: ReadonlyMap<number, number> }   // tempo: beat index -> k >= 1 (27 E5b); estimateMs is wall ms   // turnKey = `${eventKey}|${ruleId}`; no entry = full
Limelight.direction?: Direction
PlannedManeuver.climax?: true           // the day's climax, kept in its full form
// 27 E6a: multi-fire volleys (05 M-31, B-21), grouped over the raw beats (the schedule's groups before fusion)
interface Volley { members: readonly turnKey[]; lead: CanonicalKey; atMs: readonly number[] }   // members in episode order, the carrier first; atMs: each member's x at 1x under the first pass
Direction += { volleys?: ReadonlyMap<carrierTurnKey, Volley>; fuse?: readonly (readonly [first, last])[] }   // fuse: inclusive raw-beat ranges, sorted, disjoint, last > first; every other beat index is the fused one. A volley's ranges, and from 27 E7b the opening sweep's (B-22)
interface VolleyTurn { eventKey; plates: readonly CanonicalKey[]; names: readonly { key; eventKey; part: 'agent' | 'support' | 'holder' }[] }   // at most ATTENTION_MAX labels a turn
PlannedManeuver.volley?: { lead: CanonicalKey; members: readonly eventKey[]; turns: readonly VolleyTurn[] }
volleysOf(h, beats, f, rules, prio, tz, seq?, targetMs?, levers?, opts?: { windowMs?; guard?: false; late?: false }) -> { fuse; volleys }   // director.ts; opts are the sweep's and the guard test's, never the app's
fuseRanges<T>(groups: T[][], ranges) -> T[][]   // schedule.ts; buildBeatSchedule fuses limelight.direction.fuse right after the limelight call
volleyTurns(members, lit) -> VolleyTurn[] / volleyPhases(phases, turns) -> PhaseSpan[]   // maneuvers.ts, pure
// 27 E7a: the sector sweep (05 M-32, P-12): a beat's CROWD_MIN+ creations as one play from the star
RULE.regionSweep = 'region.sweep'       // narrative, turn: false, match: () => false (the planner drafts it); phases sweepPhases(4) = 2140 ms
sweepPhases(n) -> PhaseSpan[]           // pace.ts: tell 300, act min(SWEEP_SPREAD_MAX_MS, n x SWEEP_STEP_MS) + SWEEP_ENTER_MS, echo 400
PlannedManeuver.sweep?: { members: readonly eventKey[]; counts: { objective: number; threat: number } }   // the carrier (the first creation): its cast.subject every created piece, cast.seat their seats; no crew
BaseMoment.swept?: CanonicalKey[]       // a sweep's pieces, which volleysOf's B-15 guard counts as touched
sweepNote(h, counts) -> string          // packs/events.ts: `${countsLine(source terms, counts)} created in ${sprint leaf}` (no sprint: no ` in ...`)
// 27 E7b: the round's opening creations fuse (05 B-22)
openingSweep(h, beats, f, rules, prio, tz) -> [lo, hi] | null   // maneuvers.ts, pure: over the raw beats, from the first that drafts anything, the consecutive beats whose every draft is a creation (or a sweep), each on lo's local day, none drafting nothing; [lo, hi] when hi > lo and they hold CROWD_MIN+ creations; null without the sweep rule
// pacing().limelight (directing only): Direction.fuse = sort([openingSweep, ...volleysOf.fuse]); directorOf carries fuse (and drafts with it) when it is non-empty even with no volley
momentsOf(h, events, f, rules, prio, seq, dir?) -> BaseMoment[]   // maneuvers.ts: a beat's base drafts, for the director; BaseMoment.ahead (27 E5c): placed ahead of a moment, so light work leaves it; dir (27 E6a): only the volleys, so a carrier reads with the union; BaseMoment += { facility?; volley?: { authors } }
directorOf(h, beats, f, rules, prio, tz, seq?, targetMs?, levers?, volleys?: { fuse; volleys }, late?: boolean)   // beats are then the fused ones; every Direction it builds carries volleys, fuse and the joined forms (fuse alone, with no volley, from 27 E7b); late = false: no late-day montage (27 E10), the ledger's before
Direction.levers: 'short' | 'montage' | 'speed' | 'light' | 'fewer-heroes'   // in that order, each only while over the target (05 P-23, P-26, P-27)
turnsOf(..., seq?, dir?) / limelightOf(..., seq?, dir?)     // the director's forms drafted in; a directed draft (progress beam) is always named
PacingOptions += { direct?: false; targetMs?: number; levers?: readonly string[]; volleys?: false }       // direct:false = no director (the ledger's "before"); targetMs default DIRECTOR_TARGET_MS; volleys:false = no volleys (27 E6a, the ledger's "before"; the app never sets it)
PacingOptions += { risingTempo?: false }  // the ledger's "before"; the app never sets it (27 E8: pacing() sets ScheduleOptions.risingTempo otherwise)
risingShare(p) -> number; risingMs(ms, p, capMs) -> number   // schedule.ts, pure: RISING_FIRST_DAY..RISING_LAST_DAY by p, clamped to [RISING_FLOOR_MS, capMs]
PacingOptions += { lateMontage?: false }  // the ledger's "before"; the app never sets it (27 E10)
chapterPs(spans, tz) -> number[]; inTightEnd(p) -> boolean   // schedule.ts, pure (27 E10, B-23's p)
BeatSchedule.limelight?: Limelight      // who is named, decided once over the episode (engine/limelight.ts limelightOf)
BeatSchedule.guests?: GuestPresence     // 22 C8, below
ScheduleOptions += {
  limelight?(h, beats: AnyTimelineEvent[][], tz): Limelight;   // before any beat is shaped
  guests?(h, beats: readonly Beat[]): GuestPresence;          // after layout
  dayTurns?: boolean; gapMaxMs?: number;                      // Solar: true, PULSE_GAP_MAX_MS
  risingTempo?: boolean;                                      // Solar: true (27 E8, 05 B-23)
  beatShape?(h, events, limelight?): BeatShape;
}
PlanOptions.limelight?: Limelight       // planManeuvers plans a beat as the schedule shaped it
// 27 E4 (P3, P4): the sequencer's overlaps
PlanOptions.sequence?: SequenceOptions  // { seams, near }, default SEQUENCE_ON; PacingOptions.sequence? is the same, and the planner must be given the same
STAY_NEAR_MS = 3000                     // maneuvers.ts: a captain whose next gather is within this of their release waits near the work
nearWaits(plays, startOf?): Map<PlannedManeuver, Map<CanonicalKey, number>>   // pure: the ms each such captain's ship waits parked
PursueArgs.waitS?: number               // a sortie stays parked this long after its hold (plate shut) before flying back; Sortie's trailing waitS

// Maneuvers (22 C3, C4, C6, C7)
PlannedManeuver.arc?: { holders?: CanonicalKey[]; merge?: eventKey }   // a close at a merge's impact (ARC_IMPACT_MS), its holders in the formation
PlannedManeuver.quiet?: boolean         // limelight didn't name it: no labels, no held turn
PlannedManeuver.plate?: CanonicalKey   // 27 E5b: the director's montage lights this one plate; also sets montage
BeatSchedule += { wallMs: number; tempoAt(x): number; wallAt(x): number }   // totalMs stays the x-length; wallMs is what plays (27 E5b)
PlannedManeuver.montage?: boolean       // quiet work in a crowded beat, its phases × MONTAGE_PACE
PaceRule.turn?: false                   // no ship flies it, so it holds no turn and keeps no one busy (attachment.settle)
PaceRule.pass?: true                    // 27 F2: its captain flies through without stopping (facility.enter): released at the claim, never parked (P4), its plate NOTE_MIN_MS from the claim
crewTimes(phases, pass = false)         // a pass: { openMs: claim, closeMs: claim + NOTE_MIN_MS − CREW_FOLD_MS, leaveMs: claim }; passPlay(m) reads the rule by id
PursueArgs.pass?: boolean; noteS?: number   // 27 F2: a `Pass` mover through `to`, on to the ship's place (or a sortie taking it over at its speed), its plate open noteS from `to`
PaceRule.short?: Record<string, PhaseSpan[]>   // 27 E4d: short forms by the form they shorten ('plain' or a variant); shortForm(rule, variant?) names and reads them
SHORT_PACE = 0.6                        // pace.ts: a short form's share of each phase (a close's land is kept)
// piece.reseat's agent is the new holder (the hand-off, M-24); unassigned, none
partOf(e, parts, role, closedIt = false): string   // 'Closed it' for an arc's holder; 'Takes it' on a reassign

// Guests come and go (22 C8, 05 §8.6a K-13, K-14)
// engine/guests.ts (pure)
GUEST_STAY_MS = 10_000
interface Help { who: CanonicalKey; at: CanonicalKey[] }   // the pieces it served, best first; a facility only last
helpOf(f, e): Help[]                    // who helped in an event, and with what (the projection's guest anchors read it too)
interface GuestWindow { fromUtc: UtcMs; untilUtc: UtcMs | null }   // state time: from the beat they arrive in, until the one they leave with
type GuestPresence = ReadonlyMap<CanonicalKey, readonly GuestWindow[]>   // contracts/playback.ts
guestPresence(h, beats, f, seated): GuestPresence
presentAt(windows, t): boolean
// scene/projectScene.ts
projectScene(h, s, scene, layoutVersion, hier = BACKLOG, opts: ProjectOptions = {}): ViewGraph
interface ProjectOptions { guests?: GuestPresence }   // from the scene's schedule; unset, a guest stays once they've helped (tests, the gallery)
// renderer: playback.ts projectOptions(scene) gives the clock's presence to every projection of the scene it plays

// Rests (22 C7, 05 §8.6a K-11): scene/project/traffic.ts
pieceAnchors(ctx): Map<person, { node; at }>   // a solar region's: the last story or bug touched (a Task as its parent, a PR as its work); never a station

// Station rings (22 C11, 05 §8 S-8): StationSlot.mode 'inner' | 'outer', size; ViewNode.floorScale?, maxScale?

// Scene facts (22 C9 review): engine/facts.ts
RoundFacts.scene?: CanonicalKey        // the region whose scene the facts are planned for (a facility's first need is that region's)
sceneFacts(f, region?): RoundFacts     // memoised; the schedule's pacing and the renderer's planner both use it
// storyTime: no work moves across its item's or piece's creation, area or sprint moves, or parent or PR links

// The mandala (22 Block D, layout v8): engine/solar/mandala.ts (pure)
slotOrder(j): number                    // 0, +1, −1, +2, −2…: a ring's fill order
PIECE_PAD = 0.5                         // the least padding between on-planet slots, in slot diameters
halfDiscSlots(n, R, side: -1 | 1): { offsets; room; pitch }   // equal-area, equator-mirrored, centre out
trophyShells(R, wt, count): Shell[]     // Shell { r; n; turn }; trophyOffset(shells, index, toStar)
loiterRadius(shells, wt); loiterOffset(r, pitch, index, away); loiterRingAt(r, within, withinHit, shipHit, gap)
SeatSlot.mandala?: SeatMandala          // { pieceR; room; trophies; shells; loiterR }
TROPHY_W = 2 · platformR (plan.ts); GEOMETRY.shipR = 56
// scene/project/loiter.ts
loiterSlots(events, f, seats, atUtc, guests?): Map<person, { seat; index }>   // first to arrive, kept while they stay
ViewNode.attach.loiter?: number         // a resting ship's loiter slot by its planet
ViewNode.loiterR?: number; loiterWithin?: { r; trophies }   // a planet's ring (the renderer writes the drawn one on its effective node)
ViewNode.labelFixed?: boolean           // a plate on its own ray (a piece's, outward from its planet)
// renderer: placeFormation.ts drawnMandalas(solar, scale), placeLoiterRings; fx/approach.ts ringApproachOf (sortie parking)
// holoCandidates(anchor, w, h, turns?, reaches?)

// The renderer (22 C3, C6, C8)
ManeuverDef.slides?: Phase              // the subject is released from the moment's protect as this phase starts, so the scene's glide carries it
Overlay = ((g: Graphics, u: number) => void) & { durS?: number }   // an act's drawing over the art (assets/adapt.ts; default OVERLAY_S)
Act<V> = (art: V, stage: string) => void | Overlay
Finale returns { calls; awardsAtMs; rollCall?: { fromMs; toMs } }   // the chevron's captains are named *Crew* in it
CastView.plate?(): rect | null          // a cast member's plate in world units
GraphScene.markJump(pk) / takeJump(pk)  // a guest new this beat: its first sortie (`pursue`) jumps in at its spot (JUMP_IN_S)
// A removed node whose asset has a departAct departs with it even when not `moving` (the agent's warpOut, WARP_OUT_S)
```

## 6. IPC API

*Applies to: both views.*

Preload exposes `window.starChart`. Every call is zod-validated on both sides. The renderer passes
**canonical keys, never URLs**. Main resolves and allowlists URLs (`https://dev.azure.com/{org}/…`)
before calling `shell.openExternal`. The interface below is `StarChartApi` in
`src/shared/contracts/ipc.ts`, as built on 2026-10-13.

```ts
interface StarChartApi {
  env: { testMode: boolean; gallery: boolean; devlog: boolean; tourOffer: boolean;
         profile: ProfileState };   // from main's launch flags (§10) and the production `--star-chart-profile=<encodeURIComponent(JSON ProfileState)>` argument (§10); profile: the resolved device profile, fixed for the launch (15 §11)
  onActivity(cb: (e: ActivityEvent) => void): () => void;          // every network call's start, end, fail, throttle
  devlog(kind: string, fields?: Record<string, unknown>): void;    // developer runs only; redacted in main (§10)
  mode: { get(): Promise<'fixture'|'ado'>; set(m: 'fixture'|'ado'): Promise<void> };
  paradigm: { get(): Promise<Paradigm>; set(p: Paradigm): Promise<void> };   // 'sprints' | 'backlog' | 'solar' (§5b)
  fixtures: { list(): Promise<{ name: string; scope: { projectKey: CanonicalKey; sector: SectorRef };
                                range: { startUtc: UtcMs; endUtc: UtcMs } }[]> };   // fixture mode only
  auth: {
    status(): Promise<{ hasPat: boolean; storage: 'keychain'|'memory'; orgUrl: string | null;
                        connected: boolean; chosen: boolean;      // chosen: projects picked for this org yet
                        method: 'pat'|'az';                       // how the token was given (04 §1a)
                        me: { key: CanonicalKey; name: string } | null }>;   // the token's owner, from connectionData (13 Q8); never in fixture mode
    setPat(orgUrl: string, pat: string): Promise<{ ok: boolean; error?: string; net?: NetError }>;  // PAT never returned
    azAvailable(): Promise<{ available: boolean; reason?: 'missing'|'not-logged-in'|'error' }>;     // `az` on PATH and logged in
    azSignIn(orgUrl: string): Promise<{ ok: boolean; error?: string; net?: NetError }>;           // the token stays in main (04 §1a)
    clear(): Promise<void>;                                  // signs out of the Azure CLI first (a saved PAT stays), else forgets the PAT
  };
  probe: { run(): Promise<CapabilityMatrix> };           // see 04 §2
  projects: {
    list(opts?: { cacheOnly?: boolean }): Promise<ProjectSummary[]>;   // cacheOnly: an offline start (AC-31)
    setPinned(keys: CanonicalKey[]): Promise<void>;
    recent(): Promise<ProjectSummary[]>;                 // up to 10, from your own recent work (04 §3)
  };
  iterations: { list(projectKey: CanonicalKey): Promise<IterationSummary[]> };   // a project's started, dated sprints
  areas: { tree(projectKey: CanonicalKey): Promise<AreaNodeView[]> };
  favorites: {
    list(projectKey: CanonicalKey): Promise<AreaFavorite[]>;
    save(f: AreaFavorite): Promise<void>; remove(areaKey: CanonicalKey): Promise<void>;
    reorder(projectKey: CanonicalKey, areaKeys: CanonicalKey[]): Promise<void>;
  };
  epics: { list(projectKey: CanonicalKey): Promise<EpicSummary[]>; search(projectKey: CanonicalKey, q: string): Promise<EpicSummary[]> };
  sync: {
    // level (decided 2026-10-07, 04 §5a): one level of current state, or a scene's history. Absent: everything.
    start(scope: { projectKey: CanonicalKey; sector: SectorRef }, range: { startUtc: UtcMs; endUtc: UtcMs }, level?: SyncLevel): Promise<{ jobId: string }>;
    cancel(jobId: string): Promise<void>;
    onProgress(cb: (p: SyncProgress) => void): () => void;
    focus(scope: Scope, sceneKey: string): Promise<void>;          // §5c
    onScopeUpdated(cb: (e: ScopeUpdated) => void): () => void;     // §5c
  };
  // A background refresh changed a project's area tree, Epics or sprints: read them again (decided 2026-10-07; 04 §8).
  onChooserChanged(cb: (e: { projectKey: CanonicalKey; what: 'areas' | 'epics' | 'iterations' }) => void): () => void;
  history: { load(scope: { projectKey: CanonicalKey; sector: SectorRef }, range: { startUtc: UtcMs; endUtc: UtcMs }): Promise<ScopeHistory>;
             range(): Promise<Range> };                  // the default range
  cache: { stats(): Promise<{ bytes: number; path: string }>; purge(): Promise<void> };
  // Pictures added by hand (slice 6, archived 91): main opens the file chooser and keeps a 128 px square PNG under
  // userData/pictures/<org>/<identity id>.png (outside the cache: Purge leaves it). Neither the path nor
  // the bytes reach the renderer; the next history.load carries the picture.
  pictures: { add(captainKey: string): Promise<{ ok: boolean; reason?: 'cancelled' | 'unreadable' | 'tooBig' | 'notConnected' }>;
              remove(captainKey: string): Promise<boolean> };
  // The diagnostic log (slice 7): opt-in in a packaged build; only on/off crosses, never the file.
  diagnostics: { get(): Promise<{ on: boolean; packaged: boolean }>; set(on: boolean): Promise<{ on: boolean; packaged: boolean }>; show(): Promise<boolean> };
  // IterationSummary { key; path; label; startUtc; finishUtc; pods?: CanonicalKey[] }: pods, the ones whose team runs it (04 §5b).
  openInAdo(key: CanonicalKey): Promise<void>;
  // v1 (14 §2.9): userData/settings.json, which survives Purge. Channels CH.settingsGet / CH.settingsSet.
  // `set` merges a patch (viewer and captain per org key) and answers the saved whole.
  settings: { get(): Promise<UserSettings>; set(patch: Partial<UserSettings>): Promise<UserSettings> };
}
// UserSettings { version: 1; theme: string; achievements: boolean;
//   viewer: Record<orgKey, CanonicalKey | null>;              // an 'id:' key, never a name
//   captain: Record<orgKey, { faction: 'trek' | 'wars' | 'mecha'; hull: number; colourway: number } | null> }
```

**Channels** (`CH` in `ipc.ts`; every name is `starChart:<name>`). Requests are `ipcRenderer.invoke`
to a main handler; the events are main → renderer sends.

| Channel | Method | Kind |
|---|---|---|
| `mode.get`, `mode.set` | `mode` | request |
| `paradigm.get`, `paradigm.set` | `paradigm` | request |
| `fixtures.list` | `fixtures.list` | request |
| `projects.list`, `projects.setPinned`, `projects.recent` | `projects` | request |
| `favorites.list`, `favorites.save`, `favorites.remove`, `favorites.reorder` | `favorites` | request |
| `epics.list`, `epics.search` | `epics` | request |
| `iterations.list` | `iterations.list` | request |
| `areas.tree` | `areas.tree` | request |
| `history.load`, `history.range` | `history` | request |
| `auth.status`, `auth.setPat`, `auth.clear`, `auth.azAvailable`, `auth.azSignIn` | `auth` | request (`setPat`'s arguments are never logged; `azSignIn`'s is the org URL) |
| `probe.run` | `probe.run` | request |
| `sync.start`, `sync.cancel`, `sync.focus` | `sync` | request |
| `sync.progress` | `sync.onProgress` | event |
| `scope.updated` | `sync.onScopeUpdated` | event |
| `chooserChanged` | `onChooserChanged` | event |
| `activity` | `onActivity` | event |
| `devlog` | `devlog` | renderer → main send |
| `diagnostics.get`, `diagnostics.set`, `diagnostics.show` | `diagnostics` | request |
| `pictures.add`, `pictures.remove` | `pictures` | request |
| `cache.stats`, `cache.purge` | `cache` | request |
| `openInAdo` | `openInAdo` | request |
| `settings.get`, `settings.set` | `settings` | request, registered by `registerSettingsIpc` (below) |
| `captain.export`, `captain.import` | `captain` | request (23 E2), `main/captainFile.ts`: a native save or open dialog in main (tests name the file in `STAR_CHART_CAPTAIN_FILE`); export takes a validated `{ v: 1, faction, hull, colourway }` and writes only those fields; import answers the style the file held, or `reason: 'cancelled' \| 'unreadable' \| 'invalid'` with a message. The renderer then checks the hull and colourway against the fleet (`checkAgainstFleet`) and shows a message on refusal |

**Source:** `src/shared/contracts/ipc.ts` (`CH`, `StarChartApi`, the schemas), `src/preload/index.ts`,
`src/main/index.ts` (`handle`) · **Update when:** a channel or method is added, renamed or removed.

**Settings, as built (v1, `src/main/userSettings.ts`).**
- `readUserSettings(file)` answers the saved settings, or `defaultUserSettings()` when the file is
  missing, isn't JSON, or fails `userSettingsSchema` (another version, a viewer given by name, a bad
  faction); a corrupt file is logged as `settings-corrupt` with a reason only.
  `writeUserSettings(file, s)` validates, then writes through `settings.json.tmp` and a rename.
- `UserSettingsStore(file, salt)` reads once and keeps the copy in memory. `set(patch)` validates the
  raw patch with `userSettingsPatchSchema` (a refused value throws and leaves the file alone), merges
  with `mergeUserSettings`, saves, and answers the saved whole. A disk failure keeps the change for
  the run and logs `settings-unsaved` (the answer still reads as saved).
- The file sits at `userData/settings.json`, beside `window-state.json` and outside the SQLite cache,
  so Purge leaves it (14 §9 D5). The Connection tab says so.
- `registerSettingsIpc(store?)` registers both channels straight on `ipcMain`, not through
  `index.ts`'s logging `handle`, so a patch (which carries the org key and the viewer's key) never
  reaches the dev log's `ipc` line or the test-mode IPC log. `main/index.ts` calls it at startup.
  The preload checks the patch going out and the answer coming back.
- `CaptainStyle.hull` is a `FleetDesign` hull, an index into `FLEET_HULLS` (0–8) that always belongs to
  `faction`; `colourway` indexes `COLOURWAYS` (0–7). The schema bounds (0–63, 0–255) are looser.
- The renderer side (store, viewer, the developer toggle, the modal) is in §5d.

**As built (slice 4):** `history.range()` returns the default range (the fixture's, or in ADO mode
the last `DEFAULT_RANGE_DAYS` whole UTC days). `auth`, `probe`, and `cache` work in either mode, so
ADO can be set up before switching; `sync` and `areas` are ADO-mode only.

Small supporting types (`ProjectSummary`, `AreaNodeView`, `AreaFavorite`, `EpicSummary`,
`IterationSummary`, `SyncProgress`, `CapabilityMatrix`, `ActivityEvent`, `ScopeUpdated`,
`PictureResult`, `Diagnostics`, `CacheStats`) are defined in code with zod. Their fields come from
the facts in §2 plus status.
- `ProjectSummary { key; name; pinned; activity; favoriteCount; charted?; recentAt? }` (`charted` and
  `recentAt`: ADO mode only).
- `SyncProgress { jobId; phase: 'discover'|'history'|'prs'|'derive'|'done'|'failed'; done; total;
  partial; lastError?; error?: NetError; errorMessage? }`.
- `ProbeRow { family; endpoint; status: 'ok'|'empty'|'401'|'403'|'404'|'429'|'error'; checkedAt; note;
  apiVersion? }`.
- `ActivityEvent`: `{ phase: 'start', id, family, at }`, `'end'` (+ `status, ms, attempts`), `'fail'`
  (+ `status, ms, net?`) or `'throttle'` (+ `waitMs`).
- `NetError` (`contracts/neterror.ts`): `{ family, method, endpoint, status, code?, message?,
  retryAfter?, rateLimit?, attempts, waitedMs, body, at }`, the body cut to `NET_BODY_MAX`
  characters; `classify`, `failureTier` and `isQuiet` read it (04 §6).

**Fixture mode:**
- A scenario is a small universe: several projects, their areas (some marked favorite), repos, and
  people. `toHistory(scenario, mapping, scope)` emits the bundle for one scope using the §4
  membership rules. `listProjects`, `listFavorites`, and `listEpics` back `projects.list`,
  `favorites.list`, and `epics.list`.
- Main imports `fixtures/scenarios/*` and builds `ScopeHistory` bundles in memory with `toHistory`,
  served through the same `history.load`. There's no SQLite in fixture mode.
- `npm run fixtures` writes the same bundles to `fixtures/generated/` so golden tests can use them.
- Fixtures use the constant org key `00000000-0000-4000-8000-000000000001`. The DSL derives project,
  repo, and person GUIDs deterministically from their names.
- `auth`, `probe`, and `sync` return canned responses.

## 7. Playback types

*Applies to: both views* (the v1 hooks: Solar). Budgets, gaps and rates are in
[15 §10](15-reference.md#10-timing-and-budgets).

```ts
type Rate = 0.25 | 0.5 | 1 | 2 | 4;     // above 1×, motion speeds up by kind (05 §5)
interface PlaybackSession {
  rangeStartUtc: UtcMs; rangeEndUtc: UtcMs; playheadUtc: UtcMs;
  status: 'paused' | 'playing' | 'ended'; rate: Rate;
  perspective: { kind: 'free' } | { kind: 'follow'; captainKey: CanonicalKey; suspended: boolean };
  sceneKey: SceneKey;                    // camera focus; navigation never resets the session
}
interface Beat {
  index: number; sourceUtc: UtcMs;       // playhead source time when the beat fires
  firstUtc: UtcMs;                       // the beat's first event time (the gap before it ends here)
  eventKeys: string[]; priority: Priority;
  presentationStartMs: number; durationMs: number;   // at 1x
  accented: boolean;                     // false => state applies silently (budget cut or Low priority)
}
interface BeatSchedule {
  beats: Beat[]; totalMs: number;        // at 1x
  // Monotonic piecewise-linear map between presentation time and source time
  toSource(presentationMs: number): UtcMs;
  toPresentation(sourceUtc: UtcMs): number;
  stateUtc(presentationMs: number): UtcMs;   // the displayed state's source time (05 §1)
}
interface ScheduleOptions {
  include?: (e: AnyTimelineEvent) => boolean;   // highlights: beats from only these events (state stays the full snapshot)
  budgetMs?: number;                            // default DESKTOP.pacing.budgetMs; playback passes the active profile's (15 §11)
  hier?: Hierarchy;                             // beat focus (§5a)
  // v1 hooks (§5d, 05 §8); each unset runs the v0 expression, so v0 schedules are byte-identical
  priorityOf?(h: ScopeHistory, e: AnyTimelineEvent): Priority;              // default e.priority
  focusOf?(h: ScopeHistory, e: AnyTimelineEvent, s: Snapshot): CanonicalKey; // default the v0 focus
  beatShape?(h: ScopeHistory, events: AnyTimelineEvent[]): BeatShape;        // default v0BeatShape
  orientMs?: number;                            // the hold before the first beat (§5d, Entrances); default ORIENT_MS
}
interface BeatShape { afterMs: Map<string, number>; durationMs: number; essential?: boolean }   // essential: never cut (§5d)
// Hierarchy.pacing?(h) supplies the hooks; buildScene and buildHighlights spread it under their own options.
declare function buildBeatSchedule(h: ScopeHistory, range: { startUtc: UtcMs; endUtc: UtcMs }, tz: string, opts?: ScheduleOptions): BeatSchedule;
// Highlights (05 §3): the events touching a scene, in the profile's pacing.highlightBudgetMs (a trailing `budgetMs` argument).
declare function sceneEntityKeys(h: ScopeHistory, scene: SceneKey): Set<CanonicalKey> | null;   // null: no filter (sectors)
declare function touches(e: AnyTimelineEvent, keys: Set<CanonicalKey> | null): boolean;
declare function buildHighlights(h: ScopeHistory, range: { startUtc: UtcMs; endUtc: UtcMs }, tz: string, scene: SceneKey, hier?: Hierarchy, budgetMs?: number): BeatSchedule;   // hier defaults to BACKLOG, budgetMs to DESKTOP's highlightBudgetMs
// PlaybackClock.stepTo(beat): jump to a later beat; beats on the way apply, only the target plays (Shift →).
// PlaybackClock.pace(): rate × schedule.tempoAt(x), what advance multiplies wall time by (27 E5b, 05 P-25); remainingMs(): wall time left at the rate, tempo counted.
// Protected moments (05 §5): a merge, or a Feature/Story/Bug closing, protects its cast for its window.
declare function protectedMoment(h: ScopeHistory, e: AnyTimelineEvent): ProtectedMoment | null;   // { windowMs, lane, people, entities, whole }
// Following a captain (05 §6): their anchors, and the body whose close-up shows each (null: stay put).
declare function followAnchors(h: ScopeHistory, captain: CanonicalKey, lens?: Lens): FollowAnchor[];   // { eventKey, atUtc, kind, body, outside, text }
// The captain's story (revised 2026-10-04): the events following plays, and the Feature system each one happens in.
declare function storyOf(h: ScopeHistory, captain: CanonicalKey): (e: AnyTimelineEvent) => boolean;
declare function storyAnchors(h: ScopeHistory, captain: CanonicalKey, lens?: Lens): StoryAnchor[];   // { eventKey, atUtc, feature, item, outside, text }
// History cards (06 §4): one plain sentence per event, in ADO terms.
declare function storyLine(h: ScopeHistory, e: AnyTimelineEvent, typeOf: (k: CanonicalKey) => string, titleOf: (k: CanonicalKey) => string | undefined): { text: string; objectKey: CanonicalKey; object: StoryObject };
declare function latestAnchor(anchors: FollowAnchor[], at: UtcMs): FollowAnchor | undefined;
declare function protectBeat(h: ScopeHistory, events: AnyTimelineEvent[]): { afterMs: Map<string, number>; durationMs: number };
// PlannedAccent gains afterMs (start this far into the beat: it would move a moment's cast) and protect (the moment's cast).
```

## 8. Fixtures

**23 D4-D6 (v1.3).** `LevelVocab` words may take the open bundle (`typeLabel(ref, typeName?, h?)`, `pill?(ref, h?)`,
`enter.ado(typeName?, h?)`, `playNounFor?(h)`), and `crumbsOf` takes it, so Solar's chrome reads the pack's round and
region words (`hierarchy/chrome.ts`): SDLC's are Sprint and Area Path as before; Todo says Week and List, CRM Quarter
and Territory. In fixture mode the renderer asks a sprint for its whole dates (`rangeFor`); the source applies the
scenario's own clock (`ownClock` in `main/fixtures.ts`), so a CRM quarter's default range covers the whole quarter, not
the default scenario's week.

*Applies to: both views · packs: SDLC (v0 scenarios); SDLC, Todo, CRM (v1 scenarios, Solar).*

**One authored source, two outputs.** Scenarios are written once in a small TypeScript DSL in
`fixtures/scenarios/*.ts`, with invented names only (INV-18).

- `toHistory(scenario)` produces a `ScopeHistory` bundle. It drives slices 0–3 with no ADO code.
- `toAdoPayloads(scenario)` produces ADO-shaped JSON responses for each endpoint. These feed a
  `FakeAdoTransport` in slice 4+. The golden test `ingest(toAdoPayloads(s)) ≡ toHistory(s)` then
  proves the real ingest path.

```ts
// Illustrative DSL shape. The implementer may refine it, as long as both outputs stay derivable.
export default scenario('orbit-week', { project: 'Nimbus Deck', tz: 'America/Los_Angeles' })
  .area('Nimbus Deck\\Comet Crew')
  .person('ava', 'Ava Lindqvist').person('rafe', 'Rafe Okoro').person('mina', 'Mina Sato')
  .repo('ledger-svc').repo('portal-web')
  .at('2026-09-01T16:00Z').feature(101, 'Unified quote ledger', { area: 'Nimbus Deck\\Comet Crew', state: 'New' })
  .at('2026-09-03T17:00Z').story(201, 'Show quote history', { parent: 101 })
  .at('2026-09-14T15:10Z').state(201, 'Active').assign(201, 'ava')
  .at('2026-09-15T18:00Z').pr(9001, { repo: 'ledger-svc', author: 'rafe', links: [301] })
  // ...
  .expect('2026-09-15T18:01Z', snap => { /* e.g. story 201 stage 'story.terraforming' */ });
```

**Required scenarios** (each one has `expect` checkpoints). Most entities are created *before* the playback range, so the range itself holds only about 8–10 beats of activity and hits the ~22 s target:

| Scenario | Must include |
|---|---|
| `orbit-week` (primary) | Two projects. Two saved areas and two Epics. Six Features in one area, with one also under an Epic. One Feature with 5 Stories and 1 Bug. Tasks. Three people. Two repos shared across Stories. Four PRs covering PR → Task → Story, PR → Story direct, PR → Bug direct, and one unlinked PR. In the week: one Feature state change, two Story transitions, grouped Task changes, a PR by the assignee, a PR by a different person, one PR completion, and one concurrent assignment across two Features |
| `orbit-week` review squads (added at HG-3a) | Inside orbit-week's Nimbus Deck, so fixture mode can show them. **Ember Desk** (`solo-desk.ts`): one person's whole Feature: one Story, three Tasks created one at a time, one PR they merge alone, then the Story and Feature close. **Kestrel Team** (`bug-outbreak.ts`): two people, two Stories with six Tasks and two PRs each, reviewing each other; then Bugs one after another (Bug → PR → resolved, twice), then two at once with one PR, reviewed with a guest. Their checkpoints use `expect(…, scope)` |
| `edge-history` | Reparent a Story between Features. Reopen a Closed Story. A Feature moves areas mid-week. A PR link added days after the PR opened. An undated link (observed only). An unknown state name. A Bug in `Rejected` |
| `quiet-week` | Two events in five days, to test compression and early end |
| `busy-week` | About 14 High, 12 Medium, and 10 Low events. With every accent, the total exceeds 30 s. With only the High beats at 250 ms gaps, it fits under 30 s. This tests the budget cut |
| `sprint-pods` (*Halcyon Reach*, the demo; in `scenarios`; rewritten 2026-10-27; board added in B4: New, Ready, Active, Code Review, Resolved (split; Ready to Accept is its Done half), Closed; an item moves into Code Review when its PR opens while it is Active) | One sprint (41), five saved pods, so a demo goes All projects → Halcyon Reach → each pod. **Comet**: one captain, one Story and one Bug through every rung, one shared repo, two merges approved by an outside reviewer. **Nova**: three developers (3 Stories, 3 Bugs, 2 + 2) on one shared repo, reviewing each other; two finish, one Bug stays open with its PR. **Quasar**: six developers (3–6 items each) and a manager who reviews every PR and holds 5–8 Tasks but no Story or Bug; a polyrepo of ten (Stories span 1–3 repos, 1–2 PRs each); one Story and one Bug reopen. **Pulsar**: twenty captains (1–4 items each, 1–5 Tasks under others' work), a polyrepo of fourteen, 1–3 reviewers (mostly 2), about a fifth of items closed with no PR; also one Removed Story, one Rejected Bug, one Deferred Story, one abandoned PR and one unassigned Story. **Meteor** (27 F1, `Halcyon Reach\Meteor Pod`, area 8005, last in every list so nothing existing moves): a bulk-PR run, hand-written. Captain A opens 36 PRs into 36 repos in 52.5 s on Wed 16 Sep (items 12001+, PRs 21001+) and merges them over Wed and Thu, in a fixed non-ring order, approved by sets of 3, 4 then 5 of five approvers who hold no items; beside the run are a second and a third captain's work inside it, a same-instant merge by the third (PR 21040), a pair of merges the B-15 guard refuses (21041, 21042), a pair more than a working day apart (21043, 21044) and a lone summon into a 37th repo left open (21045). It plans 37 stations on 3 seats. Every Story and Bug in the other pods has 1–5 Tasks. Generated from fixed seeds (`fixtures/scenarios/halcyon/`), so identical on every run; Comet and Meteor are hand-written. Ships, worlds and stations come only from hashes (INV-12), so `scripts/find-cast.ts` searched the handles and repo names (`halcyon/cast.ts`, generated) to cover all 9 hulls, 8 colourways, 3 world lines and 9 station designs; `halcyonCoverage.test.ts` fails if a change loses one. **Standby in play (23 C2):** Quasar's `search-api` has its last PR merge on Wed 16 Sep and nothing after, so its station goes on standby (15 §10) on Fri 18 Sep about 2 PM Pacific, while other stations are still at work; the weekend then quiets most stations, and `search-api`, `inbox-mobile` and `checkin-worker` stay on standby for the rest of the sprint. `halcyonCoverage` checks that a Quasar repo stands by on a weekday with others still moving. Items 10000+ (Features 9001–9018), PRs 20000+ |
| `sprint-mechanics` (test-only; in `scenarios`) | The previous Halcyon Reach, kept unchanged because many tests check what it holds and the demo doesn't: a carry-over, a Bug added mid-sprint, a Story planned out to the next sprint, two saved pods and an unsaved third (Quasar Pod). Same project name; fixture mode serves it in the demo's place (`STAR_CHART_PODS=mechanics`, or as the active `STAR_CHART_FIXTURE`), never beside it |
| `sprint-gaps` (slice 7; served by fake ADO only) | A child iteration (`Sprint 7\Hardening`) holding a Story of Sprint 7, and a double leaver only the per-pod `EVER` query finds (04 §5b) |
| `crowded-org` (`STAR_CHART_FIXTURE`) | 188 projects, to design the galaxy for scale; a few with saved areas and a little activity |

`scenarios` (`fixtures/scenarios/index.ts`) is `orbit-week`, `edge-history`, `quiet-week`,
`busy-week`, `sprint-mechanics` and `sprint-pods`: AC-27's set.

**v1 scenarios (17 W1-T2, W3-T2; built 2026-10-10).** They live in `fixtures/scenarios/v1/` and are
listed in `v1Scenarios`, kept out of `scenarios`, so AC-27's set and the v0 goldens stay put. Invented
names only (INV-18).

| Scenario | Pack | Must include |
|---|---|---|
| `pod-sprint` (*Tidewater Array*; items 20000+, PRs 21000+) | SDLC | Sprints 12–14 with Sprint 13 the round; Harbor Pod (default) and Lantern Pod saved, Reef Pod unsaved; 3 Features, no Epic. Five assignees (Wren first, the intended viewer and fake ADO's `@Me`) and two reviewer-only guests. In Harbor: Ossian past both 3 + 3 caps (one Bug mid-sprint); light seats; a Tasks-only person; a frontier of 2 Stories and 1 Bug (one picked up and closed, one Removed). Every Story and Bug state, a reopen, a carry-over, a Deferred move-out, a pod move, a reassignment. Three repos, 9 PRs: one repo with 7 open at once ("+N"), one abandoned, one still open; one serving a single seat; one PR linked to 2 items. Wren earns 7 of the 8 achievements in Harbor. B4: Harbor's Stories board has Active split (Doing, Done), a custom Code Review inside the Active state and Ready to Accept as a column of its own; a `column` call rides on the revision that links a PR, so no revision number moves |
| `todo-week` (*Juniper Household*; 30000+, notes 31000+) | Todo | Week 41 with House (default) and Garden; three seats (Hazel the viewer); a frontier Todo and Problem; a carry-over, a planned Todo, a reassignment, Someday and Not a Problem; one discarded note, one open |
| `crm-quarter` (*Larch & Pine Trading*; 40000+, quotes 41000+) | CRM | Q3 2026 with North (default) and Coastal Territory; accounts as repos; the Discount Desk as `approvedBy`; a lost quote as `abandonPr` beside a Closed Lost deal; frontier leads, a carry-over, a reassignment, On Hold, Withdrawn, Duplicate |
| `achievementCases.ts` (test-only; *Quillmoor*, 23200+) | SDLC | One earn and one near miss per achievement (`{ id, edge, earn, near }`) |

- **The DSL** (`fixtures/dsl.ts`): `Scenario` gains `pack?` and `mapping?`. `item(type, id, title,
  opts)` creates any type the scenario's mapping names (`epic`, `feature`, `story`, `bug` and `task`
  call it). Membership reads the mapped kind, as `derive.ts` does: a sprint's roots are kind `story`
  or `bug`, an area's are kind `feature`. `toHistory` adds `domainPack` only for a pack other than
  SDLC.
- **Served** (`src/main/fixtures.ts`): `mappingFor(s) = s.mapping ?? config/state-mapping.json`.
  Under Backlog, only the active scenario. Otherwise the active scenario, `sprint-pods` (the demo) and the SDLC
  v1 scenarios; under Solar, also the other packs. `sprint-mechanics` takes the demo's place when it is
  the active scenario or `STAR_CHART_PODS=mechanics` is set (the two share a project name). Fake ADO serves only SDLC v1 scenarios (its WIQL
  names SDLC types). `STAR_CHART_FIXTURE` can name a v1 scenario.
- **`npm run fixtures`** uses each scenario's own mapping and writes each v1 scenario's default-scope
  bundle (an area scope: empty) plus one bundle per sprint it serves (`pod-sprint.sprint-13…`).
  Open the round from its sprint scope, not the default scope.

## 9. SQLite schema v1 (main process)

*Applies to: both views · ADO mode* (fixture mode has no SQLite).

The database lives at `app.getPath('userData')/star-chart.sqlite`, never in the project folder
(`userData` is `~/Library/Application Support/star-chart`). The fake org (`STAR_CHART_FAKE_ADO=1`)
keeps its own under `userData/fake-ado/`; test runs use `STAR_CHART_DB_DIR` or a fresh temp folder.
Settings: WAL mode, `foreign_keys=ON`, and parameterized statements only. Migrations are numbered SQL
files in `src/main/db/migrations/`, run in order inside one transaction each; `meta.schema_version`
counts those applied (`cache-migrate` in the dev log).

| Migration | Adds |
|---|---|
| `001_init.sql` | Every table below, with slice 4's columns |
| `002_current.sql` | `wi_current (org_key, item_id, fact_json, observed_at)`: `CurrentItemFact` per item (04 §5a) |
| `003_iterations.sql` | `iteration_nodes (org_key, project_id, node_id, path, start_utc, finish_utc, observed_at)`; clears cached history, checkpoints, members, derived tables and `levels:*` settings, so the next sync reads `System.IterationPath` (04 §5b) |
| `004_event_index.sql` | `events_entity` index on `events (org_key, entity_key)`, for `rebuildDerived` |
| `005_pr_stats.sql` | `pull_requests.stats_json` (B1) |
| `006_repo_runs.sql` | `repositories.default_branch`, `repositories.run_json` (B2) |
| `007_board_columns.sql` | (B4) no new table. `DELETE FROM item_checkpoints` only. Revision facts now hold `System.BoardColumn` / `BoardColumnDone`, and the cache keeps parsed facts, not payloads (INV-16); an item with no checkpoint reads as having no history cached (`Cache.checkpoint`) and `putHistory` upserts, so each item's whole history is read again, lazily, the next time any path touches it, replacing the old facts. Scopes keep their last success, members, current state, `levels:*`, derived tables and `teams:*`; until an item is re-read it draws from its old facts (placed by state). **The revisions feed (04 §5c) never serves such an item** (stored revisions, no checkpoint, no seed: the feed's window rows would leave a gap after the old ones); it is read whole, per item, and the stream's early return needs a checkpoint. No `DERIVATION_VERSION` bump: `derive`'s events, links and observations are unchanged; only the bundle gains `board` |
| (B5, no migration) | The revisions feed (04 §5c) adds no table: its one saved crawl per scope is the setting `feed3:{org}:{scopeKey}` (`{ day, since, token, maxChanged, covered }`), fed revisions go to `wi_revisions` without a checkpoint until the crawl completes, then `putHistory` moves each served item's checkpoint to `max(previous, newest ChangedDate the crawl saw)` (server time). `RevisionFact.seed?: true` marks a seeded item's one revision (rev 1 at its creation time, current fields) which has a checkpoint but which `Cache.checkpoint` hides from per-item paths, so they read the item whole and replace it. No `DERIVATION_VERSION` bump |

**Source:** `src/main/db/migrations/`, `src/main/db/cache.ts` · **Update when:** a migration is added.

- **Source tables** hold immutable facts.
- **Derived tables** (`events`, `links`, `observations`) are rebuilt wholesale for a scope after each
  sync and each finished sprint stream. Only the galaxy's activity count reads them: `history.load`
  always derives its bundle afresh from the source tables.
- **The derivation version** (v1.3 F1): `DERIVATION_VERSION` in `src/shared/ingest/derive.ts` (also
  each bundle's `derivationVersion`). `Cache.open` compares it with `meta.derivation_version`. A cache
  that never recorded one (every cache before F1) reads as `UNVERSIONED_IS = 1` (`db/cache.ts`), the
  only derivation there was: while `DERIVATION_VERSION` is 1 the key is just written and nothing is
  cleared. On a mismatch, a single transaction clears the three derived tables,
  lists every scope with a successful sync in `meta.derived_pending` (JSON `[orgKey, scopeKey][]`),
  and writes the new version (`cache-derivation` in the dev log). The rows aren't rebuilt at boot
  itself: a scope key doesn't hold the scope's sector, pods or range, so a pending scope is rebuilt
  from its cached facts, with no network calls, when it next opens (`rebuildPendingDerived`,
  `sync/levels.ts`): a fully synced scope over the range it opens with; a streamed sprint over the
  sprint so far, whether its last stream filled or finished incomplete. A sprint whose stream is
  running at that moment stays pending: the stream rebuilds its rows when it finishes. A level-loaded
  team or Epic never wrote derived rows, so it just leaves the list. Any sync's rebuild also takes its
  scope off the list. Until then, that scope's projects count no activity in the galaxy.
- **Bump `DERIVATION_VERSION`** whenever `derive` turns the same facts into different events,
  observations or links, then run `npm run fixtures`. A change to what is *parsed* into facts (a new
  revision field, say) is not a derivation change: the cached facts lack it, so it needs a migration
  that clears the fact tables and checkpoints so the next sync reads them again (`003_iterations.sql`). A lighter
  alternative, when only the cached history is stale and the rest is still true: clear the checkpoints alone, so
  each item is read whole again, lazily, and its facts replaced (`007_board_columns.sql`; with the feed's old-history
  rule, 04 §5c, that no checkpoint means "read it whole").

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- schema_version, derivation_version, derived_pending, org_key, org_url, auth_az ('1' when the Azure CLI was the last sign-in, 04 §1a), me_key, me_name ('Is this you?', 23 E4); Purge carries org_url, org_key, auth_az, me_key and me_name over (04 §8)
-- source
CREATE TABLE projects (org_key TEXT, project_id TEXT, name TEXT NOT NULL, ado_url TEXT NOT NULL,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, project_id));
CREATE TABLE area_nodes (org_key TEXT, project_id TEXT, node_id INTEGER, path TEXT NOT NULL,
  has_children INTEGER NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, project_id, node_id));
CREATE TABLE identities (org_key TEXT, identity_id TEXT, display_name TEXT NOT NULL, unique_name TEXT,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, identity_id));
CREATE TABLE wi_revisions (org_key TEXT, item_id INTEGER, rev INTEGER, changed_at INTEGER NOT NULL,
  project_id TEXT NOT NULL, fact_json TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (org_key, item_id, rev));
CREATE TABLE wi_updates (org_key TEXT, item_id INTEGER, update_id INTEGER, rev INTEGER,
  source_at INTEGER, fact_json TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (org_key, item_id, update_id));
CREATE TABLE wi_current_relations (org_key TEXT, item_id INTEGER, relations_json TEXT NOT NULL,  -- RelationFact[] from hydrate
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, item_id));
CREATE TABLE repositories (org_key TEXT, repo_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
  ado_url TEXT NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, repo_id));
CREATE TABLE pull_requests (org_key TEXT, repo_id TEXT, pr_id INTEGER, fact_json TEXT NOT NULL,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, repo_id, pr_id));
CREATE TABLE pr_observations (org_key TEXT, repo_id TEXT, pr_id INTEGER, observed_at INTEGER,
  status TEXT NOT NULL, PRIMARY KEY (org_key, repo_id, pr_id, observed_at));
-- sync state
CREATE TABLE item_checkpoints (org_key TEXT, item_id INTEGER, last_rev INTEGER NOT NULL DEFAULT 0,
  last_update_id INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER, PRIMARY KEY (org_key, item_id));
CREATE TABLE scope_checkpoints (org_key TEXT, scope_key TEXT, last_success_at INTEGER, last_error TEXT,
  PRIMARY KEY (org_key, scope_key));
CREATE TABLE scope_members (org_key TEXT, scope_key TEXT, item_id INTEGER, PRIMARY KEY (org_key, scope_key, item_id));
-- derived: rebuilt wholesale for a scope after each sync; cleared on a derivation_version change and rebuilt per scope when it next opens or syncs (§9).
-- They are never upserted row by row.
CREATE TABLE links (link_id INTEGER PRIMARY KEY,           -- surrogate key; avoids NULLs in a composite PK
  org_key TEXT NOT NULL, kind TEXT NOT NULL,             -- 'parent' | 'dependency' | 'pr'
  from_key TEXT NOT NULL, to_key TEXT NOT NULL,          -- canonical keys (child->parent, pred->succ, pr->item)
  valid_from INTEGER NOT NULL, valid_to INTEGER,         -- only dated links; NULL valid_to = still valid
  end_unknown INTEGER NOT NULL DEFAULT 0);               -- 1 = an undated removal was observed (02 §6)
-- undated or observed-only links live in `observations`, never in `links`
CREATE INDEX links_to ON links (org_key, to_key, valid_from);
CREATE INDEX links_from ON links (org_key, from_key, valid_from);
CREATE TABLE observations (obs_key TEXT PRIMARY KEY, org_key TEXT NOT NULL, obs_json TEXT NOT NULL);
CREATE TABLE events (event_key TEXT PRIMARY KEY, org_key TEXT NOT NULL, project_id TEXT NOT NULL,
  kind TEXT NOT NULL, entity_key TEXT NOT NULL, occurred_at INTEGER NOT NULL, observed_at INTEGER NOT NULL,
  event_json TEXT NOT NULL);
CREATE INDEX events_time ON events (org_key, project_id, occurred_at);
-- local config
CREATE TABLE area_favorites (org_key TEXT, project_id TEXT, node_id INTEGER, path TEXT NOT NULL,
  label TEXT NOT NULL, display_order INTEGER NOT NULL, unavailable INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_key, project_id, node_id));
CREATE TABLE captain_profiles (org_key TEXT, identity_id TEXT, ship_seed INTEGER NOT NULL,
  ship_design_version INTEGER NOT NULL, call_sign TEXT NOT NULL, PRIMARY KEY (org_key, identity_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);  -- pinned projects, mode, last scope
```

**Additions (slice 4, `001_init.sql`):** `identities.image_url` and `.avatar` (an inline data URL,
`''` for none, NULL until fetched); `pull_requests.approvers_json` (04 §6a); `pull_requests.stats_json` (v1.3 B1, `005_pr_stats.sql`: `PrStats` JSON plus the `commit` it was read at (never in the bundle), NULL until read, `{}` when refused for good; a transient failure stores nothing; additive, so nothing is cleared and no `DERIVATION_VERSION` bump: the derived tables don't hold it, and a PR with NULL counts as worth re-reading, 04 §5); `repositories.default_branch`, `repositories.run_json` (v1.3 B2, `006_repo_runs.sql`: the default ref, and `{ readAt, run? }`, NULL until read, no `run` when the repo has none or the builds were refused for good; a transient failure stores nothing; additive, no `DERIVATION_VERSION` bump: derived tables don't hold it, and `putRepos` never touches `run_json`, 04 §6a-2);
`wi_current_relations.ado_url`; `scope_checkpoints.coverage_json` (`{ partial, notes, stale?,
missing? }`, the last two since 2026-10-09 and slice 7); and `scope_prs (org_key, scope_key, repo_id,
pr_id, has_work_items)` for the unlinked reconcile's finds. Migrations are `.sql` files imported with
Vite's `?raw`.

**`settings` keys** (JSON values; all kept by migration 003 except `levels:*`): `mode`, `paradigm`
(written, not read at boot, §5b), `diagnostics.log`, `pinned:{org}`, `chosen:{org}`, `recent:{org}`,
`epics:{org}:{projectId}`, `teams:{org}:{projectId}` (04 §5b), `levels:{org}:{scopeKey}` (04 §5a) and
`refresh:{org}:{scopeKey}` (04 §5 step 7).

`fact_json` holds only the §2 fact shapes. Descriptions, comments, and full payloads are never
stored. A captain's `ship_seed` is `fnv1a32(orgKey + identityId + SHIP_DESIGN_VERSION)`, where
`SHIP_DESIGN_VERSION = 1`. It's written the first time the identity is seen and never recomputed.
`src/shared` provides `fnv1a32`, and both the fixture DSL and ingest use it.
That way, an art update doesn't change anyone's ship.

## 10. Test hooks

*Applies to: both views* (`awards`, `liveCommands` and `fxCensus().maneuvers`: Solar).

These hooks exist only when the app is launched with `STAR_CHART_TEST=1`, which Playwright sets.
Main forwards the flag as `--star-chart-test` (and `--star-chart-gallery`, `--star-chart-devlog` for
the gallery and the dev log), and preload exposes them as `window.starChart.env`. Production builds
leave the hooks out.

One launch argument is not test-only: main always passes `--star-chart-profile=<encodeURIComponent(JSON of ProfileState)>`
(packaged builds too, 15 §11); preload parses it into `env.profile`, falling back to desktop with a notice.

**Launching from VS Code:** the extension host sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron
run as plain Node. Test launchers must delete it from the child environment.

```ts
interface Window {
  __starChartReady: Promise<void>;       // resolves once the current scene has mounted and rendered one frame;
                                         // it's replaced by a new promise on each scene change
  __starChartTest: {
    counts(): { displayObjects: number; textures: number; activeFx: number; tickerCallbacks: number };   // ChartCounts
    viewGraph(): ViewGraph | null;       // the current scene's projection, for VC-2 and VC-3
    session(): { status: string; rate: number; x: number; totalMs: number; playheadUtc: UtcMs | null;
                 stateUtc: UtcMs | null; beats: number; beatIndex: number; lens: string };   // the playback session (05 §2)
    setScheduleMs(ms: number): void;     // deterministic time control for e2e tests: a seek (no accents)
    stepBeat(): void;                    // as the Step button: the next beat, with its accents
    fx(): { active: number; trails: number };   // live accent effects (including tells) and jump trails
    insignias(): { id: string; lagMs: number | null }[];   // award insignia lit this session; lagMs = asked for → lit (23 D2)
    radar(): { key: string; angle: number; band: string; x: number; y: number }[];   // radar Tasks as drawn
    beatTimes(): { index: number; sourceUtc: UtcMs; startMs: number; accented: boolean }[];
    volleys(): { startMs: number; endMs: number; members: string[]; people: number }[];   // 27 E6: each volley's fused beat, its member event keys, and how many of its turn names are captains drawn now
    shots(): { kind: 'climax' | 'montage'; index: number; startMs: number; endMs: number; gatherMs: number; cast: string[] }[];   // 27 E9: each climax and montage the director marked, at its beat (gatherMs: the x its gather begins; cast: the climax's keys)
    directedCamera(): { shot: 'climax' | 'board' | null; target: { x: number; y: number; scale: number }; fit: { x: number; y: number; scale: number } };   // 27 E9: the director's shot if it still holds, where the camera is headed, and the fitted board now
    play(): void; pause(): void; setRate(rate: Rate): void;
    displayed(): { pk: string; x: number; y: number }[];   // selectable nodes where drawn this frame (canvas px)
    volatility(): number;                // the director's volatility meter (05 §5 tiers)
    biasVolatility(v: number): void;     // add to the meter, to exercise the tiers; 0 restores
    fxCensus(): { flares: number; grand: number; sparks: number; beams: number; inks: number; rings: number; moves: number;
                  guests: number; glyphs: number; started: number; maneuvers: number; idle?: number };
                                         // started, maneuvers: v1 maneuvers started in solar scenes (0 elsewhere)
    heldEdges(): string[];               // edges hidden until their ink reveals them
    glidingCount(): number;              // nodes still easing to their layout targets
    targetNodes(): ViewGraph['nodes'];   // nodes at their layout targets (resting places), world units
    liveNodes(): ViewGraph['nodes'];     // nodes as drawn: floored radii and attached positions, world units
    hitCircles(): { projectionKey: string; kind: string; label: string; x: number; y: number; r: number }[];   // canvas px (VC-3)
    screenOf(canonicalKey: string): { x: number; y: number } | null;   // a node's first selectable projection, canvas px
    remount(): Promise<void>;            // dispose and remount the current scene (AC-03)
    camera(): { x: number; y: number; scale: number };   // for converting world to screen coordinates in tests
    stack(): { sceneKey: string; label: string; selectedKey?: string }[];   // the navigation stack
    selected(): string | null;
    transitioning(): boolean;            // a camera transition is running
    freezeAmbient(seconds: number | null): void;   // hold the ambient motion at a time (screenshots)
    setPaint(on: boolean): void;         // the painterly pass on or off
    // Slice 3b:
    follow(): { captain: CanonicalKey; callSign: string; suspended: boolean; text: string | null; note: string | null } | null;
    framing(): string;                   // the frame-the-action camera: 'on' | 'suspended' | 'off'
    setCamera(state: { x: number; y: number; scale: number }): void;   // place the camera (not a user pan)
    setReduced(on: boolean): void;       // reduced motion (05 §7)
    setActivity(level: 'calm' | 'lively' | 'maximum'): void;   // Activity (05 §5); test runs start at 'calm'
    shownStages(): Record<string, string>;   // the stage each view shows (lags a beat's change until it lands)
    hero(): { key: string | null; visible: number; warming: boolean };   // the followed ship's halo
    cameraHeld(): boolean;               // the automatic camera holds still around a press
    // Loading and streaming (slices 4–7):
    exploring(): boolean;                // loaded by level: an object is swirling
    energy(): { kinds: string[]; cosmos: string; cosmosPeak: string };   // loading energy drawn now
    motions(): { arrive: number; depart: number; active: number };       // §5c
    stream(): { pending: number } | null;                               // §5c
    forgetScopes(): void;                // drop loaded bundles, so the next open reads the cache (AC-31)
    reboot(): Promise<void>;             // start the app's data over, as a launch does (AC-31 cold start)
    historyRange(): { startUtc: UtcMs; endUtc: UtcMs } | null;
    frames(): { samples: number; p50: number; p95: number; worst: number };   // frame times (slice 5)
    storeJson(): string;                 // the UI store as JSON, Maps as entries (AC-25's canary search)
    // v1 (17 W3-T1):
    liveCommands(): number;              // live commands and tells in the scene's director (0 after any seek, INV-15)
    awards(): Award[];                   // the viewer's awards for the solar region on screen ([] when off, unchosen or not solar)
    // v1.1 (19 S1):
    auras(): { x: number; y: number; color: number; rimPx: number; blurPx: number; rimAlpha: number; glowAlpha: number }[];
                                         // every role outline on screen: centre (canvas px), colour, rim and blur in screen px
    showAuras(parts: 'all' | 'none' | 'rim' | 'glow' | 'unkeyed'): void;   // draw the outlines' parts, or none, to measure them alone; 'all' includes the keyline (23 C1), 'unkeyed' is all but it
    // v1.1 (19 M1):
    viewTints(pks: string[]): Record<projectionKey, number>;   // each view's tint as a 0..1 grey (1 untinted): a station on standby dims; a seat reports through AssetView.lightShare (23 C3)
    // v1.3 (23 C7): the dev-flag asteroid atlas
    setAtlasAsteroids(on: boolean): Promise<void>;   // turn the atlas on (loads its sheet) or off
    atlasStats(): { hits: number; uncovered: number; missing: number };   // atlas draws, kinds it doesn't cover, and sheet frames it lacks
    // v1.3 (23 E1): Settings' ship preview
    captainPreview(): { live: number; created: number; draws: number; hull: number; colourway: number };   // renderers now, created over the run, frames drawn, and the design shown
    // v1.3 (23 C6):
    tenders(pk: string): { tenders: { slot; x; y; docking }[]; bay: { x; y } } | null;   // a station's drawn tenders by slot, and its dock bay, in px from its view's origin
  };
}
```

**Source:** `src/renderer/src/testHooks.ts` · **Update when:** a hook is added, renamed or reshaped.

**Leak baseline:** take `counts()` after the first mount of a scene. After any sequence of
navigation that returns to that scene, the counts must match the baseline exactly.

**v1 gallery (17 W4-T1):** `window.__starChartGalleryDemos` (`list()` each live maneuver demo's stats,
`setReduced(on)`, `reduced()`), read by `tests/e2e/gallery-assets.spec.ts`. v1.3 F7, F8 add
`window.__starChartGalleryMotion` (`list()` the Arrive/Depart, opening and finale demos' stats: `id`,
`step`, `loops`, `reducedLoops`, `stuck`, `arrived`, `departed`, `active`, and `full` and `reduced`, each a `LoopRecord | null`: the last loop that ran in one motion mode throughout, with `stepS`, `peak`, `arrived`, `departed`); `setReduced` is the maneuver demos'.

**Slice 4:** `__starChartTest.storeJson()` returns the UI store as JSON (for AC-25). In test runs, main
also keeps every IPC request, response, and message as JSON in `globalThis.__starChartIpcLog`, read
with Playwright's `app.evaluate`. `STAR_CHART_FAKE_ADO=1` (dev and test only) serves the fixture
scenario as a fake ADO org at `https://dev.azure.com/fixture-org`; `STAR_CHART_DB_DIR` puts a test
run's DB in a given folder (otherwise a fresh temp folder).

**Launch variables** (`src/main/index.ts`, `fixtures.ts`, `devlog.ts`; dev and test only unless noted):

| Variable | Does |
|---|---|
| `STAR_CHART_TEST=1` | Test mode: the hooks above, a hidden window, the memory credential store, a temp DB |
| `STAR_CHART_TEST_SHOW=1` | Shows the test window, pinned to the top-left |
| `STAR_CHART_USER_DATA` | A test run's own `userData` folder (set per launch by `tests/e2e/launch.ts`) |
| `STAR_CHART_DB_DIR` | A test run's DB folder |
| `STAR_CHART_PARADIGM` | Pins `solar`, `sprints` or `backlog` (§5b) |
| `STAR_CHART_PROFILE` | Pins a device profile (`desktop`, `laptop-battery`, `tablet`, `phone`; 15 §11) in an unpackaged run; the user's own override is `userData/profile.json` |
| `STAR_CHART_START_MODE` | `fixture` or `ado` at a test's first launch |
| `STAR_CHART_FIXTURE` | The scenario to serve, in fixture mode and as the fake org (§8) |
| `STAR_CHART_FAKE_ADO=1` | The fake ADO org; `STAR_CHART_FAKE_DELAY_MS`, `STAR_CHART_FAKE_FAIL` (a URL regex) and `STAR_CHART_FAKE_FAIL_STATUS` (default 500) shape its answers |
| `STAR_CHART_PROJECTS_TTL_MS` | The project list's reuse window in tests (04 §8) |
| `STAR_CHART_PICK_FILE` | The file a test's "add picture" chooses |
| `STAR_CHART_PICK_DIR` | The folder a test's picture export or import uses instead of the native dialog (test-only) |
| `STAR_CHART_PODS` | `mechanics` serves the sprint-mechanics fixture's pods in place of the default (fixture mode) |
| `STAR_CHART_FEED_THRESHOLD` | Lowers the revisions feed's threshold so a small fixture takes the scale-up path (e2e only, 04 §5c) |
| `STAR_CHART_WINDOW_SIZE` | `WxH` forces the window size (tests set it by default) |
| `STAR_CHART_CAPTAIN_FILE` | The file a test's captain export or import uses (23 E2; test-only, unpackaged only) |
| `STAR_CHART_FAKE_ME` | A scenario handle the fake org answers `connectionData` with, for "Is this you?" (23 E4; test-only, unpackaged only) |
| `STAR_CHART_TEST_AZ_DIR` | A folder holding a fake `az` the Azure CLI sign-in runs instead of the real one (23 E5, INV-17; test-only, unpackaged only) |
| `STAR_CHART_TOUR_OFFER=1` | Lets a test run be offered the guided tour (23 E7; test-only, unpackaged only) |
| `STAR_CHART_GALLERY=1` | The art gallery (unpackaged only) |
| `STAR_CHART_AS_PACKAGED=1` | A test run stands in for a packaged build |
| `STAR_CHART_DEVLOG` (`0` / `1`), `STAR_CHART_DEVLOG_DIR` | The dev log off or on, and its folder (below) |

**Source:** `grep -o 'STAR_CHART_[A-Z_]*' src/main` · **Update when:** a launch variable is added or removed.

**The diagnostic log in a packaged build (slice 7, decided 2026-10-10).** Off by default. Connect's
"Keep a diagnostic log" switch (`diagnostics.set`) turns it on or off at once, and is remembered in
settings (`diagnostics.log`). It's the same redacted log as below, with the same rotation (3 runs),
written under `userData/logs` since the app's own folder is read-only.
- "Show log file" (`diagnostics.show`) opens Finder on it. Only on/off crosses IPC, never the path or
  its contents.
- Test runs stand in for a packaged build with `STAR_CHART_AS_PACKAGED=1`.

**The dev log (decided 2026-10-07).** Developer runs (`!app.isPackaged`, not tests unless
`STAR_CHART_DEVLOG=1`; `STAR_CHART_DEVLOG=0` turns it off) write one JSON line per significant event
to `logs/run-YYYYMMDD-HHMMSS.jsonl` under the app path (`STAR_CHART_DEVLOG_DIR` overrides); the last
3 runs are kept, and the path is printed at launch. Entries are
`{ t, at, src: 'main'|'renderer', kind, … }`.
- **Inputs:** keys (names; typing counted, never recorded), clicks (tag, role, class, `data-log`),
  canvas taps, label presses, pans, wheel gestures, zooms.
- **State:** scene, selection, playback, follow, lens, panels, mode, and errors shown.
- **Background:** IPC calls, network start, end, fail and throttle (with WIQL template names),
  sync phases and skips, cache writes, auth.
- **Errors:** main and renderer, including render errors (a top-level error boundary).
- **Warnings:** enters with nowhere to go, clicks on gone nodes, failed loads, partial syncs.

**Station form lines (2026-10-13).** Why a station transformed or didn't, for diagnosing real
playback without real data. `station-form` (the art, through the facility asset): `key` (the repo,
hashed), `outcome` (`armed` · `played` · `finished` · `interrupted` · `cut` · `built-second`), `reason`
(`already-second-form` · `never-armed` · `armed-window-passed` · `reduced-motion` · `not-started` ·
`back-to-first` · `scrubbed-back` · `destroyed` · `other`), `type` (`dock` or `slide`, the kind of
transformation, never the faction), and `armedAgoMs` / `changedAgoMs`. `station-look` (the
interpreter): the maneuver that landed a station's look, `type` its rule id, `via` its variant,
`outcome` `protected` or `open`, `atMs` its land in the beat. A first merge that cuts reads as
`armed` with `already-second-form`; the line before it says what landed the form first. A first merge's
`transform` act begins it at the gather (v1.4 E4a, `beginTransform`): `played` then, `finished` when it ends;
a seek or scene entry mid-merge reads `interrupted` (`scrubbed-back`) and snaps the form to the stage.

**v1 settings lines.** A settings change logs `{ kind: 'settings-set', field, valueHash }`, one line per
changed top-level field and nothing for an unchanged one. `valueHash` is a **whole number**: an
HMAC-SHA256 of the value's sorted-key JSON with the dev log's salt, cut to 48 bits (the redactor keeps
numbers, but would replace an unknown string field with `<text:n>`). The org key, the viewer's key,
the faction and any name never appear. `settings-corrupt` and `settings-unsaved` carry a reason only.

Everything passes `src/main/redact.ts`: identifiers become `h:` plus a salted HMAC (the salt is in
`userData/devlog-salt`), URLs keep only API words and safe query values, strings survive only in
allowlisted fields, and a line holding a known name, the org URL, or the PAT's start is dropped.
At most 200 entries a second are written; a `devlog-throttled { dropped }` line counts the rest.

**Every dev-log event** (as of 2026-10-13). Main writes with `devlog.write('main', kind, fields)`;
the renderer with `rlog(kind, fields)` (`src/renderer/src/devlog.ts`, sent on `CH.devlog`), which
main writes as `src: 'renderer'`. Paths are under `src/main/` or `src/renderer/src/`.

| Event | Written in | Fields |
|---|---|---|
| `start` | main `index.ts` | `version`, `platform`, `fixture` (`fake-ado` or null), `test` |
| `quit` | main `index.ts` | — |
| `mode` | main `index.ts`; renderer `devlog.ts` | `mode`, and at startup `storage`, `outcome` (`connected` · `not-connected`) |
| `paradigm` | main `index.ts` | `paradigm` |
| `ipc` | main `index.ts` (`handle`) | `channel`, `ms`, `outcome` (`ok` · `error`), `args` (null for `auth.setPat`), or `status`, `code`, `errorClass` |
| `error` | main `index.ts`; renderer `devlog.ts`, `panels/ErrorBoundary.tsx` | `level` (`fatal` · `unhandled` · `window` · `render`), `errorClass`, `stack` (file:line only) |
| `picture-added` | main `index.ts` | — |
| `auth` | main `ado/service.ts` | `outcome` (`connected` · `refused` · `forgotten` · `az-check`), `storage` or `status`, `method` (`pat` · `az`); never a token or `az`'s output |
| `recent` | main `ado/service.ts` | `workItems`, `projects` (counts) |
| `teams`, `teams-unavailable` | main `ado/service.ts` | `count`; `status` |
| `stream-look`, `stream-fill`, `stream-refresh` | main `ado/service.ts` | `ms`; `stream-fill` also `waiting` |
| `scope-updated` | main `ado/service.ts` | `changed`, `pending`, `done` |
| `cache-purge` | main `ado/service.ts` | — |
| `net-start` | main `ado/client.ts` | `family`, `method`, `endpoint` (redacted), `template` (the WIQL template's name, never its text) |
| `net-end` | main `ado/client.ts` | `family`, `method`, `endpoint`, `status`, `ms`, `attempts`, `waitedMs` |
| `net-fail` | main `ado/client.ts` | `family`, `method`, `endpoint`, `status`, `code`, `classification` |
| `net-error` | main `ado/client.ts` | `family`, `method`, `endpoint`, `ms`, `errorClass`, `outcome` (`cancelled` · `no-response`) |
| `net-retry` | main `ado/http.ts` | `status` (0: no response), `attempt`, `waitMs` |
| `net-throttle` | main `ado/http.ts` | `status`, `attempt`, `waitMs`, `retryAfter` |
| `cache-migrate` | main `db/cache.ts` | `version` |
| `cache-write` | main `db/cache.ts` | `table` (`current` · `history` · `pr` · `derived` · `favorites` · `settings`) and its counts or ids: `count`; `itemId`, `revisions`, `updates`; `prId`, `status`; `entities`, `events`, `observations`, `links`; `nodeId`, `outcome`; `setting` |
| `cache-repair` | main `db/cache.ts` | `removed` |
| `cache-derivation` | main `db/cache.ts` | `from` (the recorded version, or null), `to`, `scopes` (how many wait for a rebuild) |
| `sync` | main `sync/sync.ts` | `phase`, `done`, `total`, `partial`, `status` |
| `sync-skip` | main `sync/sync.ts`, `sync/levels.ts` | `family`, `status`, `code`; or `reason: 'threads-denied'` |
| `wiql-narrow` | main `sync/sync.ts` | `status`, `code` (`VS402337`), `days` |
| `level`, `level-rescan` | main `sync/levels.ts` | `phase`, `kind`, `done`, `total`; `items`, `refresh` |
| `stream-capped` | main `sync/sprintStream.ts` | `cap` |
| `stream-vanished` | main `sync/sprintStream.ts` | `count` |
| `stream-reread` | main `sync/sprintStream.ts` | `members`, `joined`, `refresh`, `rescan` |
| `stream-prs-refetched`, `stream-rescanned` | main `sync/sprintStream.ts` | `count`; `items` |
| `stream-error` | main `sync/sprintStream.ts` | `task` (the task key's first part, or `closure`), `status` |
| `stream-refused` | main `sync/sprintStream.ts` | `family` |
| `stream-done` | main `sync/sprintStream.ts` | `members`, `roots`, `partial` |
| `wiql-ever-unsupported` | main `sync/sprintStream.ts` | `status`, `code`, and `query: 'pod'` for the per-pod query |
| `settings-set`, `settings-corrupt`, `settings-unsaved` | main `userSettings.ts` | `field`, `valueHash`; `reason` (`parse` · `schema`); `errorClass` (above) |
| `devlog-throttled` | main `devlog.ts` | `dropped` |
| `renderer-start` | renderer `devlog.ts` | `width`, `height`, `reducedMotion` |
| `key`, `typing`, `click` | renderer `devlog.ts` | `key`, `mods`, `field`; `field`, `chars`; `target`, `logName`, `button`, `detail` |
| `scene`, `select`, `playback`, `lens`, `highlights`, `follow`, `panel`, `connect-panel`, `area-chooser`, `sync`, `error-shown`, `projects` | renderer `devlog.ts` (store changes) | `scene`, `depth`; `key`; `status`, `rate`; `lens`; `outcome`; `key`, `outcome`; `tab`; `outcome`; `key`, `outcome`; `phase`, `done`, `total`, `partial`; `status`, `code`, `family`; `count` |
| `warn` | renderer `devlog.ts` (`warn`) | `reason`, `key`, `nodeKind`, … |
| `tap` | renderer `App.tsx` | `key`, `nodeKind`, `outcome` (`select` · `enter`), `via` |
| `label-press`, `pan`, `zoom`, `wheel-pan`, `wheel-zoom` | renderer `chart/ChartApp.ts` | `key`, `nodeKind`, `outcome`; `via`, `dx`, `dy`; `factor`, `via`; `dx`, `dy`, `events`; `factor`, `events`, `scale` |
| `explore`, `explore-end`, `cosmos-energy` | renderer `chart/ChartApp.ts` | `kind`, `count`; `outcome`; `level` |
| `station-look` | renderer `chart/fx/v1/interpreter.ts` | `key`, `type`, `via`, `outcome`, `atMs` (above) |
| `station-form` | renderer `theme/starChart/assets/facility.ts` | `key`, `outcome`, `reason`, `type`, `armedAgoMs`, `changedAgoMs` (above) |
| `profile` | renderer `panels/Coverage.tsx` | `bytes`, and the frame stats (`samples`, `p50`, `p95`, `worst`) |

**Source:** `grep -rn "devlog.write(" src/main`, `grep -rn "rlog(" src/renderer/src` · **Update when:**
an event is added, renamed, or gains or loses a field (the redactor's allowlist in `redact.ts` may
need the field too).

