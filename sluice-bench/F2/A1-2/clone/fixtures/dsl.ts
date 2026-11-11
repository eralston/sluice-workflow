// 03 §8 — fixture DSL. One authored scenario (a small universe of projects); `toHistory` emits the
// bundle for one scope using the 03 §4 membership rules, and `toAdoPayloads` (fixtures/ado.ts)
// serves the same scenario as a fake ADO org.
// Invented names only (INV-18).
import type { AnyTimelineEvent, EventKind, EventPayload, EvidenceRef, Observation } from '@shared/contracts/events';
import { compareEvents } from '@shared/contracts/events';
import type { ScopeHistory, SectorRef, StateMapping } from '@shared/contracts/history';
import { keys, type CanonicalKey, type Guid, type UtcMs } from '@shared/contracts/keys';
import type { Snapshot, WorkItemState } from '@shared/contracts/view';
import type { BoardColumnFact, PrStats, PrVotes, RunState } from '@shared/contracts/facts';
import { boardOf, placementsOf } from '@shared/ingest/board';
import { boardTeamOf, type TeamFacts } from '@shared/teams';
import { fnv1a32 } from '@shared/hash';
import { BACKFILL_MAX_WEEKS } from '@shared/limits';
import { eventPriority } from '@shared/priority';
import { callSignFor, shipSeedFor } from '@shared/captains';
import { resolveState } from '@shared/stateMapping';
import { DERIVATION_VERSION, inSprint } from '@shared/ingest/derive';
import { underPath } from '@shared/paths';

export const FIXTURE_ORG: Guid = '00000000-0000-4000-8000-000000000001';

/** Deterministic GUID from a namespace and name. */
export function guidFromName(ns: string, name: string): Guid {
  const hex = [0, 1, 2, 3].map((i) => fnv1a32(`${ns}|${name}|${i}`).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * A work item type, as the scenario's mapping names it. SDLC scenarios use the five ADO types below;
 * a v1 pack (14 §1.3) names its own through `item(type, …)`. Rules read the mapped kind, never the name.
 */
type WiType = string;
type WiKind = WorkItemState['kind'];
interface WiOpts { state?: string; parent?: number; assignee?: string; area?: string; by?: string; /** Its sprint (an iteration path). */ iteration?: string }
/** Who made a change (`System.ChangedBy`). Defaults to the item's assignee at that moment, as ADO usually records it. */
interface ByOpts { by?: string }
/**
 * What the fake ADO says about a PR's review beside its approvals (B1; 04 §6a-1). `votes`: handle → the
 * reviewer's current vote (10, 5, -5 or -10); an approver in `approvedBy` with no entry votes 10. `pushes`:
 * iterations; `files`: changes in the last one (only with `pushes`); `threads`: threads a person started
 * (the fake adds system and deleted threads around them). A field left out is a call the fake refuses (404).
 */
export interface PrStatsSpec { votes?: Record<string, number>; pushes?: number; threads?: number; files?: number }
/**
 * A team board (B4): its columns in order, and the column each state lands in (what ADO does when an item's
 * state changes). The first column is `incoming`, the last `outgoing`. A `column` call (below) moves an item
 * within its state, to a custom column or the Done half of a split one. Applies to `types` (default User
 * Story and Bug) in every team of the project that has no board of its own.
 */
export interface BoardDef { /** The requirement backlog level's name (default Stories; Backlog items, Requirements, Issues …). */ level?: string; columns: { name: string; split?: boolean }[]; byState: Record<string, string | { column: string; done: true }>; types?: string[] }
interface PrOpts { repo: string; author?: string; title: string; links?: number[]; target?: string }

type Op =
  | { t: UtcMs; op: 'create'; project: string; id: number; type: WiType; title: string; opts: WiOpts }
  | { t: UtcMs; op: 'state'; id: number; to: string; by?: string }
  | { t: UtcMs; op: 'column'; id: number; column: string; done: boolean; by?: string }
  | { t: UtcMs; op: 'assign'; id: number; to: string | null; by?: string }
  | { t: UtcMs; op: 'title'; id: number; to: string; by?: string }
  | { t: UtcMs; op: 'moveArea'; id: number; to: string; by?: string }
  | { t: UtcMs; op: 'moveIteration'; id: number; to: string; by?: string }
  | { t: UtcMs; op: 'link'; child: number; parent: number; by?: string }
  | { t: UtcMs; op: 'unlink'; child: number; parent: number; by?: string }
  | { t: UtcMs; op: 'pr'; project: string; prId: number; opts: PrOpts }
  | { t: UtcMs; op: 'linkPr'; prId: number; id: number; by?: string }
  | { t: UtcMs; op: 'prStats'; prId: number; spec: PrStatsSpec }
  | { t: UtcMs; op: 'run'; project: string; repo: string; state: RunState }
  | { t: UtcMs; op: 'closePr'; prId: number; status: 'completed' | 'abandoned'; by?: string; approvedBy?: string[] }
  // An undated fact (INV-02): seen only in the current state, or in an update with no date.
  | { t: UtcMs; op: 'observe'; kind: 'link_parent' | 'link_pr'; from: number; to: number; present: boolean; confidence: Observation['confidence'] };

export interface KeyHelpers {
  wi: (id: number) => CanonicalKey;
  pr: (prId: number) => CanonicalKey;
  person: (handle: string) => CanonicalKey;
  repo: (name: string, project?: string) => CanonicalKey;
  project: (name?: string) => CanonicalKey;
  area: (path: string) => CanonicalKey;
  iteration: (path: string) => CanonicalKey;
}

/** A scope named in scenario terms; resolved to keys by `resolveScope`. */
export type ScenarioScope = { project: string; area: string } | { project: string; epic: number };
/** A sprint seen through its pods (Sprints mode, decided 2026-10-07): an iteration path and saved area paths. */
export interface SprintScope { project: string; sprint: string; pods: string[] }

export interface Expectation { at: UtcMs; scope?: ScenarioScope; check: (snap: Snapshot, k: KeyHelpers) => void }

interface ProjectDef {
  name: string; areas: { path: string; nodeId: number; favorite: boolean }[]; repos: string[];
  /** Its iteration tree's sprints (decided 2026-10-07): a path like `Project\\Sprint 41`, with dates. */
  iterations?: { path: string; nodeId: number; startUtc: UtcMs | null; finishUtc: UtcMs | null }[];
  /** Its teams (slice 7): the Area Paths each owns, and the sprints it runs (its own cadence). */
  teams?: { name: string; areas: string[]; iterations: string[] }[];
  /** Its team board (B4). Absent: the fake serves no boards, and the bundles carry no `board`. */
  board?: BoardDef;
}

export interface Scenario {
  name: string;
  tz: string;
  range: { startUtc: UtcMs; endUtc: UtcMs };
  projects: ProjectDef[];
  defaultScope: ScenarioScope;
  people: Map<string, string>;
  /** Uploaded ADO pictures, as inline data:image URLs (synthetic illustrations only). */
  avatars: Map<string, string>;
  ops: Op[];
  expectations: Expectation[];
  /**
   * v1: the domain pack that reads it (14 §2.1). Absent or 'sdlc': its bundles omit `domainPack`,
   * so AC-27 (fixture ↔ fake ADO) stays equal.
   */
  pack?: string;
  /** v1: the pack's own mapping, for a pack other than SDLC (which uses config/state-mapping.json). */
  mapping?: StateMapping;
}

const BOARD_TYPES = ['User Story', 'Bug'];

/** A board's columns as ADO reports them: the first is incoming, the last outgoing, the rest in progress. */
export function boardColumnFacts(def: BoardDef): BoardColumnFact[] {
  return def.columns.map((c, i) => ({ name: c.name, type: i === 0 ? 'incoming' : i === def.columns.length - 1 ? 'outgoing' : 'inProgress', split: c.split === true }));
}

/** A project's teams as the fake ADO serves them (slice 7), with the project's board on each (B4). Without teams, ADO's default team owns the whole area tree and runs every dated sprint. */
export function teamsOfProject(p: ProjectDef): { name: string; id: Guid; areas: string[]; iterations: string[] }[] {
  const teams = p.teams?.length ? p.teams
    : [{ name: `${p.name} Team`, areas: [p.name], iterations: (p.iterations ?? []).filter((i) => i.startUtc !== null).map((i) => i.path) }];
  return teams.map((t) => ({ ...t, id: guidFromName('team', `${p.name}:${t.name}`) }));
}

class ScenarioBuilder {
  private s: Scenario;
  private now: UtcMs;
  private current: ProjectDef;

  constructor(name: string, opts: { project: string; tz: string; range: [string, string] }) {
    this.current = { name: opts.project, areas: [], repos: [] };
    this.s = {
      name, tz: opts.tz,
      range: { startUtc: Date.parse(opts.range[0]), endUtc: Date.parse(opts.range[1]) },
      projects: [this.current], defaultScope: { project: opts.project, area: '' },
      people: new Map(), avatars: new Map(), ops: [], expectations: [],
    };
    this.now = this.s.range.startUtc;
  }

  /** Switch the current project (creating it on first use). */
  project(name: string) {
    let p = this.s.projects.find((x) => x.name === name);
    if (!p) { p = { name, areas: [], repos: [] }; this.s.projects.push(p); }
    this.current = p;
    return this;
  }
  area(path: string, nodeId: number, opts: { favorite?: boolean; defaultScope?: boolean } = {}) {
    this.current.areas.push({ path, nodeId, favorite: opts.favorite ?? false });
    if (opts.defaultScope) this.s.defaultScope = { project: this.current.name, area: path };
    return this;
  }
  person(handle: string, displayName: string, opts: { avatar?: string } = {}) {
    this.s.people.set(handle, displayName);
    if (opts.avatar) this.s.avatars.set(handle, opts.avatar);
    return this;
  }
  repo(name: string) { this.current.repos.push(name); return this; }
  /** A sprint in the current project's iteration tree: start inclusive, finish exclusive (UTC). */
  iteration(path: string, nodeId: number, start?: string, finish?: string) {
    // A child iteration (slice 7) may have no dates of its own: it's then part of its sprint, not a sprint.
    (this.current.iterations ??= []).push({ path, nodeId, startUtc: start ? Date.parse(start) : null, finishUtc: finish ? Date.parse(finish) : null });
    return this;
  }
  /** A team in the current project (slice 7): the Area Paths it owns (children included) and the sprints it runs. */
  team(name: string, opts: { areas: string[]; iterations: string[] }) {
    (this.current.teams ??= []).push({ name, ...opts });
    return this;
  }
  /** The current project's team board (B4): the fake serves its columns, and revisions carry `System.BoardColumn`. */
  board(def: BoardDef) { this.current.board = def; return this; }
  /**
   * Move an item to a board column inside its state (B4): a custom column, or `done` for the Done half of a split one.
   * It rides on the item's next revision (no revision of its own, so no event's revision number moves): call it
   * just before the call that makes one at the same time (a `pr` that links the item, say).
   */
  column(id: number, column: string, done = false, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'column', id, column, done, by: o.by }); return this; }
  at(iso: string) { this.now = Date.parse(iso); return this; }

  /** A work item of any type the scenario's mapping names (v1 packs); the SDLC helpers below call it. */
  item(type: WiType, id: number, title: string, opts: WiOpts = {}) {
    this.s.ops.push({ t: this.now, op: 'create', project: this.current.name, id, type, title, opts });
    return this;
  }
  epic(id: number, title: string, opts: WiOpts = {}) { return this.item('Epic', id, title, opts); }
  feature(id: number, title: string, opts: WiOpts = {}) { return this.item('Feature', id, title, opts); }
  story(id: number, title: string, opts: WiOpts = {}) { return this.item('User Story', id, title, opts); }
  bug(id: number, title: string, opts: WiOpts = {}) { return this.item('Bug', id, title, opts); }
  task(id: number, title: string, opts: WiOpts = {}) { return this.item('Task', id, title, opts); }

  state(id: number, to: string, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'state', id, to, by: o.by }); return this; }
  assign(id: number, to: string | null, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'assign', id, to, by: o.by }); return this; }
  retitle(id: number, to: string, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'title', id, to, by: o.by }); return this; }
  moveArea(id: number, to: string, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'moveArea', id, to, by: o.by }); return this; }
  /** Into another sprint ('' for none): a carry-over, or planning it in. */
  moveIteration(id: number, to: string, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'moveIteration', id, to, by: o.by }); return this; }
  link(child: number, parent: number, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'link', child, parent, by: o.by }); return this; }
  unlink(child: number, parent: number, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'unlink', child, parent, by: o.by }); return this; }
  pr(prId: number, opts: PrOpts) { this.s.ops.push({ t: this.now, op: 'pr', project: this.current.name, prId, opts }); return this; }
  /** The PR's review facts beside its approvals (B1): served by the fake, and in the bundle's `stats`. */
  prStats(prId: number, spec: PrStatsSpec) { this.s.ops.push({ t: this.now, op: 'prStats', prId, spec }); return this; }
  /**
   * The latest pipeline run on the repo's default branch (B2): the fake serves it as a build (04 §3 builds), and the
   * bundle's repo carries it as `run`. It finished (or, `running`, started; `queued`, was queued) at the builder's time. A repo
   * with no `run` call has no pipeline: the fake answers an empty list. A later call replaces an earlier one.
   */
  run(repo: string, state: RunState) { this.s.ops.push({ t: this.now, op: 'run', project: this.current.name, repo, state }); return this; }
  linkPr(prId: number, id: number, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'linkPr', prId, id, by: o.by }); return this; }
  /** Completed by `by`, else by the PR's author. `approvedBy`: the reviewers whose approvals stood at completion. */
  completePr(prId: number, o: ByOpts & { approvedBy?: string[] } = {}) {
    this.s.ops.push({ t: this.now, op: 'closePr', prId, status: 'completed', by: o.by, approvedBy: o.approvedBy });
    return this;
  }
  abandonPr(prId: number, o: ByOpts = {}) { this.s.ops.push({ t: this.now, op: 'closePr', prId, status: 'abandoned', by: o.by }); return this; }
  /** A parent link seen only in the current relations (no source time): an Observation, never an event. */
  observeParent(child: number, parent: number, confidence: Observation['confidence'] = 'observed_only') {
    this.s.ops.push({ t: this.now, op: 'observe', kind: 'link_parent', from: child, to: parent, present: true, confidence });
    return this;
  }
  /** A PR link seen only in the current relations. */
  observePrLink(prId: number, id: number, confidence: Observation['confidence'] = 'observed_only') {
    this.s.ops.push({ t: this.now, op: 'observe', kind: 'link_pr', from: prId, to: id, present: true, confidence });
    return this;
  }
  /** A dated parent link removed by an update with no date: its end is unknown (02 §6). */
  undatedUnlink(child: number, parent: number) {
    this.s.ops.push({ t: this.now, op: 'observe', kind: 'link_parent', from: child, to: parent, present: false, confidence: 'unknown' });
    return this;
  }

  /** Run a block against the builder (for loops in a scenario). */
  apply(fn: (b: this) => void) {
    fn(this);
    return this;
  }

  expect(iso: string, check: Expectation['check'], scope?: ScenarioScope) {
    this.s.expectations.push({ at: Date.parse(iso), check, scope });
    return this;
  }

  build(): Scenario {
    if ('area' in this.s.defaultScope && !this.s.defaultScope.area) throw new Error(`${this.s.name}: no default scope area`);
    return this.s;
  }
}

export function scenario(name: string, opts: { project: string; tz: string; range: [string, string] }) {
  return new ScenarioBuilder(name, opts);
}

// ---------------------------------------------------------------------------------------------
// Keys

export function scenarioKeys(s: Scenario): KeyHelpers {
  const org = FIXTURE_ORG;
  const projectId = (name: string) => guidFromName('project', name);
  const repoId = (project: string, name: string) => guidFromName(`repo:${project}`, name);
  const prRepo = new Map<number, { project: string; repo: string }>();
  for (const op of s.ops) if (op.op === 'pr') prRepo.set(op.prId, { project: op.project, repo: op.opts.repo });
  const areaOwner = (path: string) => s.projects.find((p) => p.areas.some((a) => a.path === path));
  return {
    project: (name = s.defaultScope.project) => keys.project(org, projectId(name)),
    wi: (id) => keys.workItem(org, id),
    repo: (name, project = s.defaultScope.project) => keys.repo(org, repoId(project, name)),
    person: (handle) => keys.identity(org, guidFromName('person', handle)),
    pr: (prId) => {
      const r = prRepo.get(prId);
      if (!r) throw new Error(`Unknown PR ${prId} in scenario ${s.name}`);
      return keys.pr(org, repoId(r.project, r.repo), prId);
    },
    area: (path) => {
      const p = areaOwner(path);
      const node = p?.areas.find((a) => a.path === path);
      if (!p || !node) throw new Error(`Unknown area ${path}`);
      return keys.area(org, projectId(p.name), node.nodeId);
    },
    iteration: (path) => {
      const p = s.projects.find((x) => x.iterations?.some((i) => i.path === path));
      const node = p?.iterations?.find((i) => i.path === path);
      if (!p || !node) throw new Error(`Unknown iteration ${path}`);
      return keys.iteration(org, projectId(p.name), node.nodeId);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Simulation: run every op once, producing the universe of events and some indexes.

/**
 * The universe as ADO would hold it (slice 4): per-item revisions and updates, and PR records. The
 * fake ADO server (fixtures/ado.ts) answers requests from this, so ingest can be proven against the
 * same scenario that `toHistory` reads (AC-27). Numbering matches ADO: every update is one revision.
 */
export interface AdoRevision {
  rev: number; t: UtcMs; by: string | null;
  fields: { type: string; title: string; state: string; area: string; assignee: string | null; project: string; iteration?: string; /** B4 */ column?: string; columnDone?: true };
}
export type AdoRelation =
  | { rel: 'System.LinkTypes.Hierarchy-Reverse' | 'System.LinkTypes.Hierarchy-Forward'; wi: number }
  | { rel: 'ArtifactLink'; pr: number };
export interface AdoUpdate { id: number; rev: number | null; t: UtcMs | null; added: AdoRelation[]; removed: AdoRelation[] }
export interface AdoPr {
  prId: number; project: string; repo: string; title: string; target: string; author: string | null; created: UtcMs;
  status: 'active' | 'completed' | 'abandoned'; closed: UtcMs | null; closedBy: string | null; approvedBy: string[];
  stats?: PrStatsSpec;
}
/** A PR's reviewers' final votes as the fake serves them: the spec's, then each approver not in it at 10. */
export function reviewVotes(p: AdoPr): Map<string, number> {
  const out = new Map(Object.entries(p.stats?.votes ?? {}));
  for (const h of p.approvedBy) if (!out.has(h)) out.set(h, 10);
  return out;
}

/** The `stats` the bundle holds for a PR: what ingesting the fake's answers gives (04 §6a-1). */
function statsOfPr(p: AdoPr): PrStats {
  const votes: PrVotes = {};
  for (const v of reviewVotes(p).values()) {
    const kind = v === 10 ? 'approved' : v === 5 ? 'suggestions' : v === -5 ? 'waiting' : v === -10 ? 'rejected' : null;
    if (kind) votes[kind] = (votes[kind] ?? 0) + 1;
  }
  const spec = p.stats;
  return {
    ...(Object.keys(votes).length ? { votes } : {}),
    ...(spec?.pushes !== undefined ? { pushes: spec.pushes } : {}),
    threads: spec?.threads ?? 0,
    ...(spec?.pushes && spec.files !== undefined ? { files: spec.files } : {}),
  };
}

export interface AdoLog {
  revisions: Map<number, AdoRevision[]>;
  updates: Map<number, AdoUpdate[]>;
  prs: Map<number, AdoPr>;
  /** Parent links removed by an undated update: absent from the current relations. */
  undatedRemoved: Set<string>;
  /** The latest run per repo (`project|repo`), from the `run` ops (B2). */
  runs: Map<string, { state: RunState; t: UtcMs }>;
}

export interface Universe {
  events: AnyTimelineEvent[];
  ado: AdoLog;
  itemProject: Map<number, string>;
  itemType: Map<number, WiType>;
  /** Each item's kind under the mapping `simulate` was given: membership rules read this, not the type name. */
  itemKind: Map<number, WiKind>;
  areasEver: Map<number, Set<string>>;
  parentLinks: { child: number; parent: number; t: UtcMs }[];
  prLinks: { prId: number; id: number }[];
  prInfo: Map<number, { project: string; repo: string; author?: string }>;
  final: Map<number, { state: string; title: string; area: string; parent: number | null; iteration?: string; column?: string; done?: boolean }>;
  /** Each item's sprint over time: (time, path), '' for none (decided 2026-10-07). */
  iterationTimeline: Map<number, { t: UtcMs; path: string }[]>;
  peopleSeen: Set<string>;
  observations: { kind: 'link_parent' | 'link_pr'; from: number; to: number; present: boolean; confidence: Observation['confidence'] }[];
}

export function simulate(s: Scenario, mapping: StateMapping): Universe {
  const k = scenarioKeys(s);
  const u: Universe = {
    events: [], ado: { revisions: new Map(), updates: new Map(), prs: new Map(), undatedRemoved: new Set(), runs: new Map() },
    itemProject: new Map(), itemType: new Map(), itemKind: new Map(), areasEver: new Map(), parentLinks: [],
    prLinks: [], prInfo: new Map(), final: new Map(), peopleSeen: new Set(), observations: [], iterationTimeline: new Map(),
  };
  // Revisions touched by the current op: their field snapshots are taken once the op has applied.
  let pending: { id: number; r: number; n: number; t: UtcMs; by: string | null; added: AdoRelation[]; removed: AdoRelation[] }[] = [];
  const bumped = (id: number, r: number, n: number, t: UtcMs, by: string | null | undefined, added: AdoRelation[] = [], removed: AdoRelation[] = []) =>
    pending.push({ id, r, n, t, by: by ?? null, added, removed });
  const flush = () => {
    for (const p of pending) {
      const f = u.final.get(p.id)!;
      if (columnPending.has(p.id) && columnPending.get(p.id) === `${f.column}|${f.done ? 1 : 0}`) columnPending.delete(p.id);
      const fields = { type: u.itemType.get(p.id)!, title: f.title, state: f.state, area: f.area, assignee: assignee.get(p.id) ?? null, project: u.itemProject.get(p.id)!, ...(f.iteration ? { iteration: f.iteration } : {}), ...(f.column ? { column: f.column, ...(f.done ? { columnDone: true as const } : {}) } : {}) };
      u.ado.revisions.set(p.id, [...(u.ado.revisions.get(p.id) ?? []), { rev: p.r, t: p.t, by: p.by, fields }]);
      u.ado.updates.set(p.id, [...(u.ado.updates.get(p.id) ?? []), { id: p.n, rev: p.r, t: p.t, added: p.added, removed: p.removed }]);
    }
    pending = [];
  };
  // B4: an item on the project's board sits in the column its state maps to, until a `column` op moves it.
  const defaultColumn = (id: number, state: string): string | undefined => {
    const def = s.projects.find((p) => p.name === u.itemProject.get(id))?.board;
    const to = def && (def.types ?? BOARD_TYPES).includes(u.itemType.get(id)!) ? def.byState[state] : undefined;
    return typeof to === 'string' ? to : to?.column;
  };
  const defaultDone = (id: number, state: string): boolean => {
    const def = s.projects.find((p) => p.name === u.itemProject.get(id))?.board;
    return typeof def?.byState[state] === 'object';
  };
  // B4: `column` calls not yet carried by a revision (id → the column). One that never lands is a mistake in the scenario.
  const columnPending = new Map<number, string>();
  let undatedSeq = 0;
  const rev = new Map<number, number>();
  const upd = new Map<number, number>();
  const assignee = new Map<number, string | null>();
  const nextRev = (id: number) => { const r = (rev.get(id) ?? 0) + 1; rev.set(id, r); return r; };
  const nextUpd = (id: number) => { const n = (upd.get(id) ?? 0) + 1; upd.set(id, n); return n; };
  const kindOf = (id: number): WiKind => u.itemKind.get(id) ?? 'other';
  const person = (h: string | null | undefined) => {
    if (!h) return null;
    if (!s.people.has(h)) throw new Error(`${s.name}: unknown person ${h}`);
    u.peopleSeen.add(h);
    return k.person(h);
  };
  const projectOf = (id: number) => k.project(u.itemProject.get(id));

  function push<K extends EventKind>(
    kind: K, entityKey: CanonicalKey, projectKey: CanonicalKey, sourceRef: string, t: UtcMs,
    payload: EventPayload[K], evidence: EvidenceRef[], workKind: ReturnType<typeof kindOf> | 'pr', by: string | null | undefined,
  ) {
    u.events.push({
      eventKey: `${kind}:${entityKey}:${sourceRef}`, kind, occurredAt: t, observedAt: t, entityKey, projectKey,
      priority: eventPriority(kind, workKind), payload, evidence, changedBy: person(by),
    } as AnyTimelineEvent);
  }
  /** The actor: `by` when given, else the item's assignee at that moment. */
  const actor = (id: number, by: string | undefined) => by ?? assignee.get(id) ?? null;
  const revEv = (id: number, r: number, t: UtcMs): EvidenceRef[] => [{ source: 'revision', ref: `wi:${id}:r${r}`, at: t }];
  const updEv = (id: number, n: number, t: UtcMs): EvidenceRef[] => [{ source: 'update', ref: `wi:${id}:u${n}`, at: t }];
  const prEv = (prKey: CanonicalKey, prId: number, t: UtcMs): EvidenceRef[] =>
    [{ source: 'pullRequest', ref: `pr:${prKey.split(':')[2]}:${prId}`, at: t }];

  const linkParent = (child: number, parent: number, t: UtcMs, removed: boolean, by?: string) => {
    if (!u.itemType.has(child) || !u.itemType.has(parent)) throw new Error(`${s.name}: link ${child}->${parent} before create`);
    const n = nextUpd(child);
    const r = nextRev(child);
    const kind = removed ? 'link_parent_removed' : 'link_parent_added';
    const who = actor(child, by);
    push(kind, k.wi(child), projectOf(child), `u${n}:${k.wi(parent)}`, t, { childKey: k.wi(child), parentKey: k.wi(parent) }, updEv(child, n, t), kindOf(child), who);
    // ADO records the link on both ends, each as a revision: the child's (canonical) and the parent's.
    const up: AdoRelation = { rel: 'System.LinkTypes.Hierarchy-Reverse', wi: parent };
    const down: AdoRelation = { rel: 'System.LinkTypes.Hierarchy-Forward', wi: child };
    bumped(child, r, n, t, who, removed ? [] : [up], removed ? [up] : []);
    const pn = nextUpd(parent);
    const prv = nextRev(parent);
    bumped(parent, prv, pn, t, who, removed ? [] : [down], removed ? [down] : []);
    if (!removed) u.parentLinks.push({ child, parent, t });
    const f = u.final.get(child)!;
    f.parent = removed ? (f.parent === parent ? null : f.parent) : parent;
  };
  const linkPr = (prId: number, id: number, t: UtcMs, by?: string) => {
    const n = nextUpd(id);
    const r = nextRev(id);
    const who = actor(id, by);
    push('link_pr_added', k.wi(id), projectOf(id), `u${n}:${k.pr(prId)}`, t, { prKey: k.pr(prId), itemKey: k.wi(id) }, updEv(id, n, t), kindOf(id), who);
    bumped(id, r, n, t, who, [{ rel: 'ArtifactLink', pr: prId }]);
    u.prLinks.push({ prId, id });
  };

  const ops = [...s.ops].sort((a, b) => a.t - b.t); // stable: same-time ops keep authoring order
  for (const op of ops) {
    switch (op.op) {
      case 'create': {
        if (u.itemType.has(op.id)) throw new Error(`${s.name}: duplicate item ${op.id}`);
        u.itemType.set(op.id, op.type);
        u.itemKind.set(op.id, resolveState(mapping, op.type, '').kind);
        u.itemProject.set(op.id, op.project);
        const state = op.opts.state ?? 'New';
        const parentArea = op.opts.parent !== undefined ? u.final.get(op.opts.parent)?.area : undefined;
        const area = op.opts.area ?? parentArea ?? s.projects.find((p) => p.name === op.project)?.areas[0]?.path ?? op.project;
        u.final.set(op.id, { state, title: op.title, area, parent: null, ...(op.opts.iteration ? { iteration: op.opts.iteration } : {}) });
        const col = defaultColumn(op.id, state);
        if (col) { u.final.get(op.id)!.column = col; if (defaultDone(op.id, state)) u.final.get(op.id)!.done = true; }
        u.areasEver.set(op.id, new Set([area]));
        u.iterationTimeline.set(op.id, [{ t: op.t, path: op.opts.iteration ?? '' }]);
        assignee.set(op.id, op.opts.assignee ?? null);
        const r = nextRev(op.id);
        const n0 = nextUpd(op.id);
        push('wi_created', k.wi(op.id), projectOf(op.id), `r${r}`, op.t,
          { type: op.type, title: op.title, state, areaPath: area, assigneeKey: person(op.opts.assignee), ...(op.opts.iteration ? { iterationPath: op.opts.iteration } : {}) },
          revEv(op.id, r, op.t), kindOf(op.id), op.opts.by ?? op.opts.assignee);
        bumped(op.id, r, n0, op.t, op.opts.by ?? op.opts.assignee);
        if (op.opts.parent !== undefined) linkParent(op.id, op.opts.parent, op.t, false, op.opts.by);
        break;
      }
      case 'column': {
        // B4: no revision of its own. The item's next revision (a PR link, a state change) carries the column, as an
        // edit saved with it would; so no later event's revision number moves.
        if (!u.final.has(op.id)) throw new Error(`${s.name}: op on unknown item ${op.id}`);
        const f = u.final.get(op.id)!;
        if (!defaultColumn(op.id, f.state)) throw new Error(`${s.name}: column op on ${op.id}, which is not on the board`);
        f.column = op.column;
        if (op.done) f.done = true; else delete f.done;
        columnPending.set(op.id, `${op.column}|${op.done ? 1 : 0}`);
        break;
      }
      case 'state':
      case 'assign':
      case 'title':
      case 'moveArea':
      case 'moveIteration': {
        const f = u.final.get(op.id);
        if (!f) throw new Error(`${s.name}: op on unknown item ${op.id}`);
        const r = nextRev(op.id);
        const n0 = nextUpd(op.id);
        const ev = revEv(op.id, r, op.t);
        bumped(op.id, r, n0, op.t, op.op === 'assign' ? op.by ?? op.to ?? assignee.get(op.id) : actor(op.id, op.by));
        const ek = k.wi(op.id);
        const pk = projectOf(op.id);
        const by = actor(op.id, op.by);
        if (op.op === 'state') {
          push('wi_state_changed', ek, pk, `r${r}`, op.t, { from: f.state, to: op.to }, ev, kindOf(op.id), by);
          f.state = op.to;
          const col = defaultColumn(op.id, op.to);
          delete f.done;
          if (col) { f.column = col; if (defaultDone(op.id, op.to)) f.done = true; } else delete f.column;
        }
        if (op.op === 'assign') {
          // Taking work is usually self-assignment: by default the new assignee made the change.
          push('wi_assignee_changed', ek, pk, `r${r}`, op.t, { from: person(assignee.get(op.id)), to: person(op.to) }, ev, kindOf(op.id), op.by ?? op.to ?? assignee.get(op.id));
          assignee.set(op.id, op.to);
        }
        if (op.op === 'title') { push('wi_title_changed', ek, pk, `r${r}`, op.t, { from: f.title, to: op.to }, ev, kindOf(op.id), by); f.title = op.to; }
        if (op.op === 'moveArea') {
          push('wi_area_changed', ek, pk, `r${r}`, op.t, { from: f.area, to: op.to }, ev, kindOf(op.id), by);
          f.area = op.to;
          u.areasEver.get(op.id)!.add(op.to);
        }
        if (op.op === 'moveIteration') {
          push('wi_iteration_changed', ek, pk, `r${r}`, op.t, { from: f.iteration ?? '', to: op.to }, ev, kindOf(op.id), by);
          if (op.to) f.iteration = op.to;
          else delete f.iteration;
          u.iterationTimeline.get(op.id)!.push({ t: op.t, path: op.to });
        }
        break;
      }
      case 'link': linkParent(op.child, op.parent, op.t, false, op.by); break;
      case 'unlink': linkParent(op.child, op.parent, op.t, true, op.by); break;
      case 'pr': {
        u.prInfo.set(op.prId, { project: op.project, repo: op.opts.repo, author: op.opts.author });
        u.ado.prs.set(op.prId, {
          prId: op.prId, project: op.project, repo: op.opts.repo, title: op.opts.title, target: op.opts.target ?? 'refs/heads/main',
          author: op.opts.author ?? null, created: op.t, status: 'active', closed: null, closedBy: null, approvedBy: [],
        });
        const prKey = k.pr(op.prId);
        push('pr_opened', prKey, k.project(op.project), 'pr', op.t,
          { repoKey: k.repo(op.opts.repo, op.project), title: op.opts.title, authorKey: person(op.opts.author), targetRef: op.opts.target ?? 'refs/heads/main' },
          prEv(prKey, op.prId, op.t), 'pr', op.opts.author);
        for (const id of op.opts.links ?? []) linkPr(op.prId, id, op.t, op.opts.author);
        break;
      }
      case 'linkPr': linkPr(op.prId, op.id, op.t, op.by); break;
      case 'run': {
        const was = u.ado.runs.get(`${op.project}|${op.repo}`);
        if (!was || was.t <= op.t) u.ado.runs.set(`${op.project}|${op.repo}`, { state: op.state, t: op.t });
        break;
      }
      case 'prStats': {
        const rec = u.ado.prs.get(op.prId);
        if (!rec) throw new Error(`${s.name}: stats for unknown PR ${op.prId}`);
        rec.stats = op.spec;
        break;
      }
      case 'observe':
        u.observations.push({ kind: op.kind, from: op.from, to: op.to, present: op.present, confidence: op.confidence });
        if (op.kind === 'link_parent' && !op.present) {
          // An undated removal: an update with no date and no matching revision (04 §4), on the child.
          u.ado.updates.set(op.from, [...(u.ado.updates.get(op.from) ?? []), {
            id: 10_000 + ++undatedSeq, rev: null, t: null, added: [], removed: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', wi: op.to }],
          }]);
          u.ado.undatedRemoved.add(`${op.from}>${op.to}`);
        }
        break;
      case 'closePr': {
        const info = u.prInfo.get(op.prId);
        if (!info) throw new Error(`${s.name}: close of unknown PR ${op.prId}`);
        const prKey = k.pr(op.prId);
        push(op.status === 'completed' ? 'pr_completed' : 'pr_abandoned', prKey, k.project(info.project), 'pr', op.t,
          { repoKey: k.repo(info.repo, info.project), ...(op.status === 'completed' && op.approvedBy?.length ? { approvedBy: op.approvedBy.map((h) => person(h)!).sort() } : {}) },
          prEv(prKey, op.prId, op.t), 'pr', op.by ?? info.author);
        const rec = u.ado.prs.get(op.prId)!;
        rec.status = op.status;
        rec.closed = op.t;
        rec.closedBy = op.by ?? info.author ?? null;
        rec.approvedBy = op.status === 'completed' ? [...(op.approvedBy ?? [])] : [];
        break;
      }
    }
    flush();
  }
  for (const id of columnPending.keys()) throw new Error(`${s.name}: the column call on item ${id} was never carried by a revision of it (call it just before the call that makes one at the same time)`);
  return u;
}

// ---------------------------------------------------------------------------------------------
// Scope membership (03 §4) and bundle output

const under = underPath;

function scopeItems(s: Scenario, u: Universe, scope: ScenarioScope | SprintScope): { items: Set<number>; prs: Set<number>; unlinked: number[] } {
  const features = new Set<number>();
  // A sprint (decided 2026-10-07): its roots are the Stories and Bugs in it at any moment of its
  // window, in one of its pods (ever). The same rule as derive's (src/shared/ingest/derive.ts, inSprint),
  // read by kind as derive reads it, so a v1 pack's own types (14 §1.3) follow the same rule.
  const sprint = 'sprint' in scope ? sprintOf(s, scope) : null;
  const kindOf = (id: number): WiKind => u.itemKind.get(id) ?? 'other';
  for (const id of u.itemType.keys()) {
    if (u.itemProject.get(id) !== scope.project) continue;
    const kind = kindOf(id);
    if (sprint && 'sprint' in scope) {
      if (kind !== 'story' && kind !== 'bug') continue;
      const inPod = [...(u.areasEver.get(id) ?? [])].some((a) => scope.pods.some((p) => under(a, p)));
      if (inPod && inSprint(u.iterationTimeline.get(id) ?? [], sprint)) features.add(id);
      continue;
    }
    if (kind !== 'feature') continue;
    if ('area' in scope) {
      if ([...(u.areasEver.get(id) ?? [])].some((a) => under(a, scope.area))) features.add(id);
    } else if ('epic' in scope && u.parentLinks.some((l) => l.child === id && l.parent === scope.epic)) {
      features.add(id);
    }
  }
  // Descendants ever linked beneath those Features (transitively).
  const items = new Set(features);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of u.parentLinks) if (items.has(l.parent) && !items.has(l.child) && kindOf(l.child) !== 'feature') { items.add(l.child); grew = true; }
    // Children known only from an observation are in scope too, for the retrospective lens.
    for (const o of u.observations) if (o.kind === 'link_parent' && o.present && items.has(o.to) && !items.has(o.from)) { items.add(o.from); grew = true; }
  }
  // Parent chains up to and including Epics.
  const ancestors = (id: number, seen: Set<number>) => {
    for (const l of u.parentLinks) if (l.child === id && !seen.has(l.parent)) { seen.add(l.parent); ancestors(l.parent, seen); }
  };
  const anc = new Set<number>();
  for (const id of items) ancestors(id, anc);
  if ('epic' in scope) anc.add(scope.epic);
  for (const id of anc) items.add(id);

  const prs = new Set(u.prLinks.filter((l) => items.has(l.id)).map((l) => l.prId));
  for (const o of u.observations) if (o.kind === 'link_pr' && o.present && items.has(o.to)) prs.add(o.from);
  const scopeRepos = new Set([...prs].map((p) => u.prInfo.get(p)!.repo));
  const linkedEver = new Set([...u.prLinks.map((l) => l.prId), ...u.observations.filter((o) => o.kind === 'link_pr').map((o) => o.from)]);
  const unlinked = [...u.prInfo.entries()]
    .filter(([id, p]) => !linkedEver.has(id) && p.project === scope.project && scopeRepos.has(p.repo))
    .map(([id]) => id);
  if (sprint) return { items, prs, unlinked: [] }; // a sprint has no unlinked reconcile
  for (const id of unlinked) prs.add(id);
  return { items, prs, unlinked };
}

/** A sprint scope's iteration, with its dates. */
function sprintOf(s: Scenario, scope: SprintScope): { path: string; startUtc: UtcMs; finishUtc: UtcMs; nodeId: number } {
  const it = s.projects.find((p) => p.name === scope.project)?.iterations?.find((i) => i.path === scope.sprint);
  if (!it || it.startUtc === null || it.finishUtc === null) throw new Error(`${s.name}: unknown sprint ${scope.sprint}`);
  return { path: it.path, nodeId: it.nodeId, startUtc: it.startUtc, finishUtc: it.finishUtc };
}

export function resolveSector(s: Scenario, scope: ScenarioScope | SprintScope): SectorRef {
  const k = scenarioKeys(s);
  if ('sprint' in scope) {
    const it = sprintOf(s, scope);
    return {
      kind: 'sprint', iterationKey: k.iteration(scope.sprint), path: scope.sprint, startUtc: it.startUtc, finishUtc: it.finishUtc,
      pods: scope.pods.map((p) => ({ areaKey: k.area(p), path: p, label: p.split('\\').pop() ?? p })),
    };
  }
  return 'area' in scope ? { kind: 'area', areaKey: k.area(scope.area), path: scope.area } : { kind: 'epic', epicKey: k.wi(scope.epic) };
}

/** Produce the ScopeHistory bundle for one scope directly from the scenario (03 §8). */
export function toHistory(s: Scenario, mapping: StateMapping, scope: ScenarioScope | SprintScope = s.defaultScope): ScopeHistory {
  const u = simulate(s, mapping);
  const k = scenarioKeys(s);
  const { items, prs, unlinked } = scopeItems(s, u, scope);
  // A sprint's range is its own dates (decided 2026-10-07: the sprint is the clock).
  // Up to the scenario's now: a sprint still running ends where the week does.
  const range = 'sprint' in scope ? (({ startUtc, finishUtc }) => ({ startUtc, endUtc: Math.min(finishUtc, s.range.endUtc) }))(sprintOf(s, scope)) : { ...s.range };
  const itemKeys = new Set([...items].map((id) => k.wi(id)));
  const prKeys = new Set([...prs].map((id) => k.pr(id)));
  const events = u.events
    .filter((e) => e.occurredAt < range.endUtc && (itemKeys.has(e.entityKey) || prKeys.has(e.entityKey)))
    .sort(compareEvents);
  const people = new Set<string>();
  for (const e of events) {
    for (const h of u.peopleSeen) {
      const pk = k.person(h);
      const p = e.payload as Record<string, unknown>;
      if (p.assigneeKey === pk || p.from === pk || p.to === pk || p.authorKey === pk || e.changedBy === pk || (Array.isArray(p.approvedBy) && p.approvedBy.includes(pk))) people.add(h);
    }
  }
  const repos = new Set([...prs].map((id) => u.prInfo.get(id)!.repo));
  const org = FIXTURE_ORG;
  // B4: the scope's team board and each item's column over time, as the derivation builds them from the fake's revisions.
  const project = s.projects.find((p) => p.name === scope.project);
  const teamFacts: TeamFacts[] = !project?.board ? [] : teamsOfProject(project).map((t) => ({
    id: t.id, name: t.name, areas: t.areas.map((path) => ({ path, includeChildren: true })), defaultArea: t.areas[0] ?? null, iterations: t.iterations, columns: boardColumnFacts(project.board!),
  }));
  const team = boardTeamOf(teamFacts, 'sprint' in scope ? scope.pods : 'area' in scope ? [scope.area] : []);
  const board = boardOf(team?.columns,
    [...items].flatMap((id) => placementsOf(k.wi(id), (u.ado.revisions.get(id) ?? []).map((r) => { const own = r.fields.column && (team?.owns(r.fields.area) ?? true); return { changedAt: r.t, ...(own ? { column: r.fields.column } : {}), ...(own && r.fields.columnDone ? { done: true } : {}) }; })))
      .filter((p) => p.at < range.endUtc));
  return {
    schemaVersion: 1,
    derivationVersion: DERIVATION_VERSION,
    scope: { orgKey: org, projectKey: k.project(scope.project), sector: resolveSector(s, scope) },
    range,
    coverage: { syncedAt: null, historyFrom: range.endUtc - BACKFILL_MAX_WEEKS * 7 * 86_400_000, partial: false, notes: [] },
    entities: {
      projects: [{ key: k.project(scope.project), name: scope.project, adoUrl: '' }],
      workItems: [...items].map((id) => ({ key: k.wi(id), type: u.itemType.get(id)!, adoUrl: '' })).sort(byKey),
      repos: [...repos].map((name) => { const run = u.ado.runs.get(`${scope.project}|${name}`); return { key: k.repo(name, scope.project), name, adoUrl: '', ...(run ? { run: { state: run.state, at: run.t, readAt: Math.max(s.range.endUtc, ...s.ops.map((o) => o.t)) } } : {}) }; }).sort(byKey),
      prs: [...prs].map((id) => ({ key: k.pr(id), repoKey: k.repo(u.prInfo.get(id)!.repo, u.prInfo.get(id)!.project), adoUrl: '', stats: statsOfPr(u.ado.prs.get(id)!) })).sort(byKey),
      captains: [...people].map((handle) => {
        const displayName = s.people.get(handle)!;
        const id = guidFromName('person', handle);
        const shipSeed = shipSeedFor(org, id);
        const avatar = s.avatars.get(handle);
        return { key: k.person(handle), displayName, shipSeed, callSign: callSignFor(displayName, shipSeed), ...(avatar ? { avatar } : {}) };
      }).sort(byKey),
    },
    events,
    observations: u.observations
      .map((o): Observation => {
        const fromKey = o.kind === 'link_pr' ? k.pr(o.from) : k.wi(o.from);
        const toKey = k.wi(o.to);
        const op = o.present ? 'present' : 'removed';
        return {
          obsKey: `obs:${o.kind}:${op}:${fromKey}:${toKey}`, kind: o.kind, op, fromKey, toKey,
          confidence: o.confidence, observedAt: range.endUtc,
          evidence: [{ source: 'update', ref: `wi:${o.kind === 'link_pr' ? o.to : o.from}:u0`, at: null }],
        };
      })
      .filter((o) => (o.kind === 'link_pr' ? prKeys.has(o.fromKey) : itemKeys.has(o.fromKey)) && itemKeys.has(o.toKey!))
      .sort((a, b) => (a.obsKey < b.obsKey ? -1 : a.obsKey > b.obsKey ? 1 : 0)),
    unlinkedPrs: unlinked.map((id) => k.pr(id)).sort(),
    stateMapping: mapping,
    ...(board ? { board } : {}),
    // Only a pack other than SDLC is named (14 §2.1).
    ...(s.pack && s.pack !== 'sdlc' ? { domainPack: s.pack } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Listings for fixture mode (galaxy, sector chooser)

export interface FixtureProject { key: CanonicalKey; name: string; activity: number; favoriteCount: number }
export interface FixtureFavorite { areaKey: CanonicalKey; projectKey: CanonicalKey; path: string; label: string; displayOrder: number }
export interface FixtureEpic { key: CanonicalKey; id: number; title: string; state: string; featureCount: number }

export function listProjects(s: Scenario, mapping: StateMapping): FixtureProject[] {
  const u = simulate(s, mapping);
  const k = scenarioKeys(s);
  return s.projects.map((p) => ({
    key: k.project(p.name),
    name: p.name,
    favoriteCount: p.areas.filter((a) => a.favorite).length,
    activity: u.events.filter((e) => e.projectKey === k.project(p.name) && e.occurredAt >= s.range.startUtc && e.occurredAt < s.range.endUtc).length,
  })).sort(byKey);
}

export function listFavorites(s: Scenario, projectKey: CanonicalKey): FixtureFavorite[] {
  const k = scenarioKeys(s);
  const p = s.projects.find((x) => k.project(x.name) === projectKey);
  if (!p) return [];
  return p.areas.filter((a) => a.favorite).map((a, i) => ({
    areaKey: k.area(a.path), projectKey, path: a.path, label: a.path.split('\\').pop() ?? a.path, displayOrder: i,
  }));
}

/** 02 §2: Epics that are direct parents of Features in the project's saved areas (as of range end). */
export function listEpics(s: Scenario, mapping: StateMapping, projectKey: CanonicalKey): FixtureEpic[] {
  const u = simulate(s, mapping);
  const k = scenarioKeys(s);
  const p = s.projects.find((x) => k.project(x.name) === projectKey);
  if (!p) return [];
  const favs = p.areas.filter((a) => a.favorite).map((a) => a.path);
  const counts = new Map<number, number>();
  for (const [id, f] of u.final) {
    if (u.itemKind.get(id) !== 'feature' || u.itemProject.get(id) !== p.name) continue;
    if (!favs.some((path) => under(f.area, path)) || f.parent === null) continue;
    if (u.itemKind.get(f.parent) !== 'epic') continue;
    counts.set(f.parent, (counts.get(f.parent) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id]) => {
    const f = u.final.get(id)!;
    const featureCount = [...u.final.entries()].filter(([fid, x]) => u.itemKind.get(fid) === 'feature' && x.parent === id).length;
    return { key: k.wi(id), id, title: f.title, state: f.state, featureCount };
  }).sort((a, b) => a.id - b.id);
}

/** Every scope a scenario can serve (favorite areas plus listed Epics), in scenario terms. */
export function scenarioScopes(s: Scenario, mapping: StateMapping): ScenarioScope[] {
  const k = scenarioKeys(s);
  const out: ScenarioScope[] = [];
  for (const p of s.projects) {
    for (const a of p.areas) if (a.favorite) out.push({ project: p.name, area: a.path });
    for (const e of listEpics(s, mapping, k.project(p.name))) out.push({ project: p.name, epic: e.id });
  }
  return out;
}

export interface FixtureIteration { key: CanonicalKey; path: string; label: string; startUtc: UtcMs; finishUtc: UtcMs }

/** A project's sprints that have started by `now` (current and past, decided 2026-10-07), newest first. */
export function listIterations(s: Scenario, projectKey: CanonicalKey, now: UtcMs = s.range.endUtc): FixtureIteration[] {
  const k = scenarioKeys(s);
  const p = s.projects.find((x) => k.project(x.name) === projectKey);
  return (p?.iterations ?? []).filter((i): i is typeof i & { startUtc: UtcMs; finishUtc: UtcMs } => i.startUtc !== null && i.finishUtc !== null && i.startUtc < now).map((i) => ({ key: k.iteration(i.path), path: i.path, label: i.path.split('\\').pop() ?? i.path, startUtc: i.startUtc, finishUtc: i.finishUtc }))
    .sort((a, b) => b.startUtc - a.startUtc || (a.key < b.key ? -1 : 1));
}

/** Every sprint scope a scenario can serve: each sprint begun by its now, seen through the project's saved areas as pods. */
export function sprintScopes(s: Scenario): SprintScope[] {
  return s.projects.flatMap((p) => {
    const pods = p.areas.filter((a) => a.favorite).map((a) => a.path);
    return pods.length ? (p.iterations ?? []).filter((i) => i.startUtc !== null && i.startUtc < s.range.endUtc).map((i) => ({ project: p.name, sprint: i.path, pods })) : [];
  });
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
