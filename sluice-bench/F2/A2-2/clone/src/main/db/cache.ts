// 03 §9 — the SQLite cache (node:sqlite). WAL, foreign keys on, parameterized statements only. It
// lives under userData, never in the project folder; tests open ':memory:'. Facts only (INV-16):
// `fact_json` columns hold the 03 §2 shapes, never whole payloads.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { AnyTimelineEvent, Observation } from '@shared/contracts/events';
import type { AreaNodeFact, CurrentItemFact, IterationNodeFact, IdentityRefFact, PrStats, ProjectFact, PullRequestFact, RelationFact, RepoFact, RepoRun, RevisionFact, UpdateFact } from '@shared/contracts/facts';
import type { CanonicalKey, Guid, OrgKey, UtcMs } from '@shared/contracts/keys';
import type { MissingThing } from '@shared/contracts/history';
import { DERIVATION_VERSION, type DerivedLink } from '@shared/ingest/derive';
import init from './migrations/001_init.sql?raw';
import current from './migrations/002_current.sql?raw';
import iterations from './migrations/003_iterations.sql?raw';
import eventIndex from './migrations/004_event_index.sql?raw';
import prStats from './migrations/005_pr_stats.sql?raw';
import repoRuns from './migrations/006_repo_runs.sql?raw';
import boardColumns from './migrations/007_board_columns.sql?raw';
import { devlog } from '../devlog';

/** `stats_json`: the stats, and the commit they were read at (kept apart, so the bundle never sees it). */
function splitStats(json: string): { stats: PrStats; commit?: string } {
  const { commit, ...stats } = JSON.parse(json) as PrStats & { commit?: string };
  return { stats, ...(commit ? { commit } : {}) };
}

const MIGRATIONS: string[] = [init, current, iterations, eventIndex, prStats, repoRuns, boardColumns];
export const SCHEMA_VERSION = MIGRATIONS.length;
/**
 * The derivation that wrote a cache with no `meta.derivation_version` (v1.3 F1): every cache before F1
 * was derived by version 1, the only one there had been. So while `DERIVATION_VERSION` is still 1, a
 * missing key is recorded without clearing anything; after a bump, it is a mismatch like any other.
 */
export const UNVERSIONED_IS = 1;

type Row = Record<string, SQLInputValue>;

/** `stale`: entities ADO refused this time, whose last known facts we keep (02 §3, decided 2026-10-09). */
export interface ScopeCheckpoint { lastSuccessAt: UtcMs | null; lastError: string | null; coverage: { partial: boolean; notes: string[]; stale?: CanonicalKey[]; missing?: MissingThing[] } | null }
export interface AreaFavoriteRow { projectId: Guid; nodeId: number; path: string; label: string; displayOrder: number; unavailable: boolean }

/** Bound parameters per IN list: well under SQLite's limit. */
const IN_CHUNK = 500;
/** A map in the order its IDs were asked for (the per-item reads kept that order). */
function inOrder<V>(m: Map<number, V>, ids: readonly number[]): Map<number, V> {
  const out = new Map<number, V>();
  for (const id of ids) if (m.has(id) && !out.has(id)) out.set(id, m.get(id)!);
  return out;
}

export class Cache {
  private constructor(readonly db: DatabaseSync, readonly path: string) {}

  static open(path: string): Cache {
    const db = new DatabaseSync(path);
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    const c = new Cache(db, path);
    c.migrate();
    c.checkDerivation(DERIVATION_VERSION);
    return c;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const has = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
    const current = has ? Number((this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as Row | undefined)?.value ?? 0) : 0;
    for (let v = current; v < MIGRATIONS.length; v++) {
      this.tx(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.setMeta('schema_version', String(v + 1));
      });
      devlog.write('main', 'cache-migrate', { version: String(v + 1) });
    }
  }

  /**
   * 03 §9 (v1.3 F1): the derived tables follow `DERIVATION_VERSION`. When `meta.derivation_version`
   * differs (a missing key reads as `UNVERSIONED_IS`), one transaction clears `events`, `links` and `observations`,
   * lists every synced scope in `meta.derived_pending`, and writes the version. A pending scope's rows
   * are rebuilt from its cached facts when it next opens (`rebuildPendingDerived` in `sync/levels.ts`)
   * or syncs: only then are its sector, pods and range known, which the scope key alone doesn't hold.
   * Returns how many scopes wait for a rebuild (0 when the version matched).
   */
  checkDerivation(version: number): number {
    const recorded = this.meta('derivation_version');
    const was = recorded ?? String(UNVERSIONED_IS);
    if (was === String(version)) {
      if (recorded === null) this.setMeta('derivation_version', String(version));
      return 0;
    }
    const pending = this.all('SELECT org_key, scope_key FROM scope_checkpoints WHERE last_success_at IS NOT NULL ORDER BY org_key, scope_key')
      .map((r) => [r.org_key as string, r.scope_key as string]);
    this.tx(() => {
      for (const t of ['events', 'links', 'observations']) this.run(`DELETE FROM ${t}`);
      this.setMeta('derived_pending', JSON.stringify(pending));
      this.setMeta('derivation_version', String(version));
    });
    devlog.write('main', 'cache-derivation', { from: recorded === null ? null : Number(recorded), to: version, scopes: pending.length });
    return pending.length;
  }
  private pendingScopes(): [string, string][] {
    return JSON.parse(this.meta('derived_pending') ?? '[]') as [string, string][];
  }
  /** This scope's derived rows were cleared by a derivation change and not yet rebuilt. */
  derivedPending(org: OrgKey, scopeKey: string): boolean {
    return this.pendingScopes().some(([o, k]) => o === org && k === scopeKey);
  }
  /** The scope's derived rows are current again (rebuilt, or it has no derived rows to rebuild). */
  derivedRebuilt(org: OrgKey, scopeKey: string): void {
    const all = this.pendingScopes();
    const left = all.filter(([o, k]) => !(o === org && k === scopeKey));
    if (left.length !== all.length) this.setMeta('derived_pending', JSON.stringify(left));
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  private run(sql: string, ...params: SQLInputValue[]): void {
    this.db.prepare(sql).run(...params);
  }

  // ---- meta and settings ----
  meta(key: string): string | null {
    return ((this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined)?.value as string | undefined) ?? null;
  }
  setMeta(key: string, value: string): void {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
  }
  setting<T>(key: string): T | null {
    const r = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as Row | undefined;
    return r ? (JSON.parse(r.value_json as string) as T) : null;
  }
  setSetting(key: string, value: unknown): void {
    devlog.write('main', 'cache-write', { table: 'settings', setting: key });
    this.run('INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json', key, JSON.stringify(value));
  }

  // ---- reference data ----
  putProjects(org: OrgKey, projects: ProjectFact[], at: UtcMs): void {
    this.tx(() => {
      for (const p of projects) {
        this.run(`INSERT INTO projects VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET name = excluded.name, ado_url = excluded.ado_url, observed_at = excluded.observed_at`,
          org, p.projectId, p.name, p.adoUrl, at);
      }
    });
  }
  projects(org: OrgKey): ProjectFact[] {
    return this.all('SELECT project_id, name, ado_url FROM projects WHERE org_key = ? ORDER BY name', org)
      .map((r) => ({ projectId: r.project_id as string, name: r.name as string, adoUrl: r.ado_url as string }));
  }
  /** Replaces a project's area tree: nodes that vanished are gone (favorites keep their own copy). */
  putAreaNodes(org: OrgKey, projectId: Guid, nodes: AreaNodeFact[], at: UtcMs): void {
    this.tx(() => {
      this.run('DELETE FROM area_nodes WHERE org_key = ? AND project_id = ?', org, projectId);
      for (const n of nodes) this.run('INSERT INTO area_nodes VALUES (?, ?, ?, ?, ?, ?)', org, projectId, n.nodeId, n.path, n.hasChildren ? 1 : 0, at);
    });
  }
  areaNodes(org: OrgKey, projectId: Guid): AreaNodeFact[] {
    return this.all('SELECT node_id, path, has_children FROM area_nodes WHERE org_key = ? AND project_id = ? ORDER BY path', org, projectId)
      .map((r) => ({ projectId, nodeId: Number(r.node_id), path: r.path as string, hasChildren: r.has_children === 1 }));
  }
  /** Replaces a project's iteration tree (decided 2026-10-07: sprints). */
  putIterationNodes(org: OrgKey, projectId: Guid, nodes: IterationNodeFact[], at: UtcMs): void {
    this.tx(() => {
      this.run('DELETE FROM iteration_nodes WHERE org_key = ? AND project_id = ?', org, projectId);
      for (const n of nodes) this.run('INSERT INTO iteration_nodes VALUES (?, ?, ?, ?, ?, ?, ?)', org, projectId, n.nodeId, n.path, n.startUtc, n.finishUtc, at);
    });
  }
  iterationNodes(org: OrgKey, projectId: Guid): IterationNodeFact[] {
    return this.all('SELECT node_id, path, start_utc, finish_utc FROM iteration_nodes WHERE org_key = ? AND project_id = ? ORDER BY path', org, projectId)
      .map((r) => ({ projectId, nodeId: Number(r.node_id), path: r.path as string, startUtc: r.start_utc === null ? null : Number(r.start_utc), finishUtc: r.finish_utc === null ? null : Number(r.finish_utc) }));
  }
  putRepos(org: OrgKey, repos: RepoFact[], at: UtcMs): void {
    this.tx(() => {
      for (const r of repos) {
        // The run (B2) is its own column: re-listing the repository never touches it.
        this.run(`INSERT INTO repositories (org_key, repo_id, project_id, name, ado_url, observed_at, default_branch) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO UPDATE SET name = excluded.name, ado_url = excluded.ado_url, observed_at = excluded.observed_at, default_branch = excluded.default_branch`,
        org, r.repoId, r.projectId, r.name, r.adoUrl, at, r.defaultBranch ?? null);
      }
    });
  }
  /** Every repository, with its default branch and, when read, its latest run (`run`, and when it was read: `runReadAt`). */
  repos(org: OrgKey): RepoFact[] {
    return this.all('SELECT repo_id, project_id, name, ado_url, default_branch, run_json FROM repositories WHERE org_key = ?', org)
      .map((r) => {
        const read = r.run_json ? (JSON.parse(r.run_json as string) as { readAt: UtcMs; run?: RepoRun }) : undefined;
        return {
          repoId: r.repo_id as string, projectId: r.project_id as string, name: r.name as string, adoUrl: r.ado_url as string,
          ...(r.default_branch ? { defaultBranch: r.default_branch as string } : {}),
          ...(read?.run ? { run: read.run } : {}), ...(read ? { runReadAt: read.readAt } : {}),
        };
      });
  }
  /** B2: stores what the builds call said (no `run`: the repository has no pipeline run) and when it was read. Not called when the read failed. */
  setRepoRun(org: OrgKey, repoId: Guid, run: RepoRun | undefined, readAt: UtcMs): void {
    this.run('UPDATE repositories SET run_json = ? WHERE org_key = ? AND repo_id = ?', JSON.stringify({ readAt, ...(run ? { run } : {}) }), org, repoId);
  }

  // ---- identities and captains ----
  putIdentity(org: OrgKey, id: IdentityRefFact, at: UtcMs): void {
    // A new picture link means the picture is fetched again; otherwise keep the one we have.
    this.run(`INSERT INTO identities VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT DO UPDATE SET display_name = excluded.display_name,
      unique_name = excluded.unique_name, observed_at = excluded.observed_at,
      avatar = CASE WHEN identities.image_url IS excluded.image_url THEN identities.avatar ELSE NULL END, image_url = excluded.image_url`,
      org, id.id, id.displayName, id.uniqueName ?? null, id.imageUrl ?? null, at);
  }
  identitiesNeedingAvatar(org: OrgKey): { id: Guid; imageUrl: string }[] {
    return this.all('SELECT identity_id, image_url FROM identities WHERE org_key = ? AND avatar IS NULL AND image_url IS NOT NULL', org)
      .map((r) => ({ id: r.identity_id as string, imageUrl: r.image_url as string }));
  }
  setAvatar(org: OrgKey, id: Guid, dataUrl: string | null): void {
    this.run('UPDATE identities SET avatar = ? WHERE org_key = ? AND identity_id = ?', dataUrl ?? '', org, id);
  }
  /** Ask again for the pictures that came back "none" (`''`): a new token or a new way in may find them. */
  clearMissedAvatars(org: OrgKey): void {
    this.run("UPDATE identities SET avatar = NULL WHERE org_key = ? AND avatar = ''", org);
  }
  identities(org: OrgKey): Map<Guid, IdentityRefFact & { avatar?: string }> {
    return new Map(this.all('SELECT identity_id, display_name, unique_name, avatar FROM identities WHERE org_key = ?', org).map((r) => [
      r.identity_id as string,
      { id: r.identity_id as string, displayName: r.display_name as string, ...(r.unique_name ? { uniqueName: r.unique_name as string } : {}), ...(r.avatar ? { avatar: r.avatar as string } : {}) },
    ]));
  }
  /** 03 §9: written the first time a captain is seen, never recomputed. */
  ensureProfile(org: OrgKey, id: Guid, make: () => { shipSeed: number; designVersion: number; callSign: string }): void {
    if (this.db.prepare('SELECT 1 FROM captain_profiles WHERE org_key = ? AND identity_id = ?').get(org, id)) return;
    const p = make();
    this.run('INSERT INTO captain_profiles VALUES (?, ?, ?, ?, ?)', org, id, p.shipSeed, p.designVersion, p.callSign);
  }
  profiles(org: OrgKey): Map<Guid, { shipSeed: number; callSign: string }> {
    return new Map(this.all('SELECT identity_id, ship_seed, call_sign FROM captain_profiles WHERE org_key = ?', org)
      .map((r) => [r.identity_id as string, { shipSeed: Number(r.ship_seed), callSign: r.call_sign as string }]));
  }

  // ---- work items ----
  /** How much history is stored: the next page starts after these (04 §5 checkpoints). */
  checkpoint(org: OrgKey, itemId: number): { revisions: number; updates: number } {
    const r = this.db.prepare('SELECT last_rev, last_update_id FROM item_checkpoints WHERE org_key = ? AND item_id = ?').get(org, itemId) as Row | undefined;
    // A seeded item (B5, 04 §5c) holds one lossy revision: to the per-item paths it has no history yet, so they read it whole.
    if (r && this.db.prepare(`SELECT 1 FROM wi_revisions WHERE org_key = ? AND item_id = ? AND rev = 1 AND fact_json LIKE '%"seed":true%'`).get(org, itemId)) return { revisions: 0, updates: 0 };
    const counts = this.db.prepare('SELECT (SELECT COUNT(*) FROM wi_revisions WHERE org_key = ? AND item_id = ?) AS r, (SELECT COUNT(*) FROM wi_updates WHERE org_key = ? AND item_id = ?) AS u')
      .get(org, itemId, org, itemId) as Row;
    return r ? { revisions: Number(counts.r), updates: Number(counts.u) } : { revisions: 0, updates: 0 };
  }
  /** One transaction per item: its new facts and its checkpoint together (04 §5). */
  putHistory(org: OrgKey, itemId: number, revs: RevisionFact[], ups: UpdateFact[], at: UtcMs, checkpointAt: UtcMs = at): void {
    devlog.write('main', 'cache-write', { table: 'history', itemId, revisions: revs.length, updates: ups.length });
    this.tx(() => {
      for (const r of revs) {
        this.run('INSERT INTO wi_revisions VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET fact_json = excluded.fact_json, observed_at = excluded.observed_at',
          org, itemId, r.rev, r.changedAt, r.projectId, JSON.stringify(r), at);
      }
      for (const u of ups) {
        this.run('INSERT INTO wi_updates VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET fact_json = excluded.fact_json, observed_at = excluded.observed_at',
          org, itemId, u.updateId, u.rev, u.sourceAt, JSON.stringify(u), at);
      }
      const maxRev = Math.max(0, ...revs.map((r) => r.rev));
      const maxUpd = Math.max(0, ...ups.map((u) => u.updateId));
      this.run(`INSERT INTO item_checkpoints VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET last_rev = MAX(last_rev, excluded.last_rev),
        last_update_id = MAX(last_update_id, excluded.last_update_id), last_success_at = excluded.last_success_at`, org, itemId, maxRev, maxUpd, checkpointAt);
    });
  }
  /**
   * Revisions read from the project feed (B5, 04 §5c): stored without touching any checkpoint, so a crawl
   * cut off part-way leaves the items it half-read looking unread to the per-item paths.
   */
  putFeedRevisions(org: OrgKey, revs: RevisionFact[], at: UtcMs): void {
    if (!revs.length) return;
    devlog.write('main', 'cache-write', { table: 'feed-revisions', revisions: revs.length });
    this.tx(() => {
      for (const r of revs) {
        this.run('INSERT INTO wi_revisions VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET fact_json = excluded.fact_json, observed_at = excluded.observed_at',
          org, r.itemId, r.rev, r.changedAt, r.projectId, JSON.stringify(r), at);
      }
    });
  }
  /** The checkpoint rows for items: the newest revision and update read, and when (B5 reads only what is newer). */
  checkpointRows(org: OrgKey, ids: number[]): Map<number, { lastRev: number; lastUpdateId: number; at: UtcMs }> {
    const out = new Map<number, { lastRev: number; lastUpdateId: number; at: UtcMs }>();
    for (const r of this.inList(ids, (m) => `SELECT item_id, last_rev, last_update_id, last_success_at FROM item_checkpoints WHERE org_key = ? AND item_id IN (${m})`, org)) {
      out.set(Number(r.item_id), { lastRev: Number(r.last_rev), lastUpdateId: Number(r.last_update_id), at: Number(r.last_success_at) });
    }
    return out;
  }
  putCurrent(org: OrgKey, itemId: number, rels: RelationFact[], adoUrl: string, at: UtcMs): void {
    this.run('INSERT INTO wi_current_relations VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET relations_json = excluded.relations_json, ado_url = excluded.ado_url, observed_at = excluded.observed_at',
      org, itemId, JSON.stringify(rels), adoUrl, at);
  }
  private byItem<T>(table: string, column: string, org: OrgKey, ids: number[] | null, order: string): Map<number, T[]> {
    const out = new Map<number, T[]>();
    const rows = ids === null
      ? this.all(`SELECT item_id, ${column} AS j FROM ${table} WHERE org_key = ? ORDER BY item_id, ${order}`, org)
      : this.inList(ids, (marks) => `SELECT item_id, ${column} AS j FROM ${table} WHERE org_key = ? AND item_id IN (${marks}) ORDER BY item_id, ${order}`, org);
    for (const r of rows) {
      const id = Number(r.item_id);
      const list = out.get(id) ?? [];
      list.push(JSON.parse(r.j as string) as T);
      out.set(id, list);
    }
    return ids === null ? out : inOrder(out, ids);
  }
  /** One query per chunk of IDs, not one per item (decided 2026-10-08: reloads while streaming). */
  private inList(ids: readonly number[], sql: (marks: string) => string, org: OrgKey): Row[] {
    const out: Row[] = [];
    const uniq = [...new Set(ids)];
    for (let i = 0; i < uniq.length; i += IN_CHUNK) {
      const chunk = uniq.slice(i, i + IN_CHUNK);
      out.push(...this.all(sql(chunk.map(() => '?').join(', ')), org, ...chunk));
    }
    return out;
  }
  revisions(org: OrgKey, ids: number[] | null = null): Map<number, RevisionFact[]> {
    return this.byItem('wi_revisions', 'fact_json', org, ids, 'rev');
  }
  updates(org: OrgKey, ids: number[] | null = null): Map<number, UpdateFact[]> {
    return this.byItem('wi_updates', 'fact_json', org, ids, 'update_id');
  }
  current(org: OrgKey, ids: number[] | null = null): Map<number, RelationFact[]> {
    const m = this.byItem<RelationFact[]>('wi_current_relations', 'relations_json', org, ids, 'item_id');
    return new Map([...m].map(([k, v]) => [k, v[0] ?? []]));
  }
  /** Items as they are now (hydrate's fields), for current state without history. */
  putCurrentItems(org: OrgKey, items: CurrentItemFact[], at: UtcMs): void {
    if (!items.length) return;
    devlog.write('main', 'cache-write', { table: 'current', count: items.length });
    this.tx(() => {
      for (const it of items) this.run('INSERT INTO wi_current VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET fact_json = excluded.fact_json, observed_at = excluded.observed_at', org, it.itemId, JSON.stringify(it), at);
    });
  }
  currentItems(org: OrgKey, ids: number[]): Map<number, CurrentItemFact> {
    const out = new Map<number, CurrentItemFact>();
    for (const r of this.inList(ids, (m) => `SELECT item_id, fact_json FROM wi_current WHERE org_key = ? AND item_id IN (${m})`, org)) out.set(Number(r.item_id), JSON.parse(r.fact_json as string) as CurrentItemFact);
    return inOrder(out, ids);
  }
  /** Items whose history is stored (they have revisions). */
  itemsWithHistory(org: OrgKey, ids: number[]): Set<number> {
    const has = new Set(this.inList(ids, (m) => `SELECT DISTINCT item_id FROM wi_revisions WHERE org_key = ? AND item_id IN (${m})`, org).map((r) => Number(r.item_id)));
    return new Set(ids.filter((id) => has.has(id)));
  }
  /** Add to a scope's members without dropping others (level loads add as they go). */
  addScopeMembers(org: OrgKey, scopeKey: string, ids: number[]): void {
    this.tx(() => { for (const id of ids) this.run('INSERT OR IGNORE INTO scope_members VALUES (?, ?, ?)', org, scopeKey, id); });
  }

  workItemUrls(org: OrgKey): Map<number, string> {
    return new Map(this.all('SELECT item_id, ado_url FROM wi_current_relations WHERE org_key = ?', org).map((r) => [Number(r.item_id), r.ado_url as string]));
  }

  // ---- PRs ----
  putPr(org: OrgKey, pr: PullRequestFact, at: UtcMs): void {
    devlog.write('main', 'cache-write', { table: 'pr', prId: pr.prId, status: pr.status });
    this.run('INSERT INTO pull_requests (org_key, repo_id, pr_id, fact_json, approvers_json, observed_at) VALUES (?, ?, ?, ?, NULL, ?) ON CONFLICT DO UPDATE SET fact_json = excluded.fact_json, observed_at = excluded.observed_at',
      org, pr.repoId, pr.prId, JSON.stringify({ ...pr, stats: undefined }), at);
    this.run('INSERT OR IGNORE INTO pr_observations VALUES (?, ?, ?, ?, ?)', org, pr.repoId, pr.prId, at, pr.status);
  }
  setApprovers(org: OrgKey, repoId: Guid, prId: number, approvers: Guid[]): void {
    this.run('UPDATE pull_requests SET approvers_json = ? WHERE org_key = ? AND repo_id = ? AND pr_id = ?', JSON.stringify(approvers), org, repoId, prId);
  }
  /**
   * The stat line's facts (B1), with the source commit they were read at. `{}` when nothing could be
   * read for good (a refusal); a transient failure stores nothing, so the PR is tried again.
   */
  setPrStats(org: OrgKey, repoId: Guid, prId: number, stats: PrStats, commit?: string): void {
    this.run('UPDATE pull_requests SET stats_json = ? WHERE org_key = ? AND repo_id = ? AND pr_id = ?', JSON.stringify({ ...stats, ...(commit ? { commit } : {}) }), org, repoId, prId);
  }
  /** What the stat line has for a PR, and the commit it was read at; undefined: never read. */
  prStatsOf(org: OrgKey, repoId: Guid, prId: number): { stats: PrStats; commit?: string } | undefined {
    const r = this.all('SELECT stats_json FROM pull_requests WHERE org_key = ? AND repo_id = ? AND pr_id = ?', org, repoId, prId)[0];
    return r?.stats_json ? splitStats(r.stats_json as string) : undefined;
  }
  /** Each PR with its approvers and, when read, its stats (on `pr.stats`; absent: never read) and the commit they were read at. */
  prs(org: OrgKey): { pr: PullRequestFact; approvers: Guid[] | null; statsCommit?: string }[] {
    return this.all('SELECT fact_json, approvers_json, stats_json FROM pull_requests WHERE org_key = ? ORDER BY repo_id, pr_id', org).map((r) => {
      const st = r.stats_json ? splitStats(r.stats_json as string) : undefined;
      return {
        pr: { ...(JSON.parse(r.fact_json as string) as PullRequestFact), ...(st ? { stats: st.stats } : {}) },
        approvers: r.approvers_json ? (JSON.parse(r.approvers_json as string) as Guid[]) : null,
        ...(st?.commit ? { statsCommit: st.commit } : {}),
      };
    });
  }

  // ---- scopes ----
  putScopeMembers(org: OrgKey, scopeKey: string, ids: number[]): void {
    this.tx(() => {
      this.run('DELETE FROM scope_members WHERE org_key = ? AND scope_key = ?', org, scopeKey);
      for (const id of ids) this.run('INSERT OR IGNORE INTO scope_members VALUES (?, ?, ?)', org, scopeKey, id);
    });
  }
  scopeMembers(org: OrgKey, scopeKey: string): number[] {
    return this.all('SELECT item_id FROM scope_members WHERE org_key = ? AND scope_key = ? ORDER BY item_id', org, scopeKey).map((r) => Number(r.item_id));
  }
  putScopePrs(org: OrgKey, scopeKey: string, rows: { repoId: Guid; prId: number; hasWorkItems: boolean }[]): void {
    this.tx(() => {
      this.run('DELETE FROM scope_prs WHERE org_key = ? AND scope_key = ?', org, scopeKey);
      for (const r of rows) this.run('INSERT OR REPLACE INTO scope_prs VALUES (?, ?, ?, ?, ?)', org, scopeKey, r.repoId, r.prId, r.hasWorkItems ? 1 : 0);
    });
  }
  /** Merge reconcile finds into a scope's (level loads add per Feature). */
  addScopePrs(org: OrgKey, scopeKey: string, rows: { repoId: Guid; prId: number; hasWorkItems: boolean }[]): void {
    this.tx(() => { for (const r of rows) this.run('INSERT OR REPLACE INTO scope_prs VALUES (?, ?, ?, ?, ?)', org, scopeKey, r.repoId, r.prId, r.hasWorkItems ? 1 : 0); });
  }
  scopePrs(org: OrgKey, scopeKey: string): { repoId: Guid; prId: number; hasWorkItems: boolean }[] {
    return this.all('SELECT repo_id, pr_id, has_work_items FROM scope_prs WHERE org_key = ? AND scope_key = ? ORDER BY repo_id, pr_id', org, scopeKey)
      .map((r) => ({ repoId: r.repo_id as string, prId: Number(r.pr_id), hasWorkItems: r.has_work_items === 1 }));
  }
  setScopeCheckpoint(org: OrgKey, scopeKey: string, cp: ScopeCheckpoint): void {
    this.run(`INSERT INTO scope_checkpoints VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET last_success_at = COALESCE(excluded.last_success_at, last_success_at),
      last_error = excluded.last_error, coverage_json = COALESCE(excluded.coverage_json, coverage_json)`,
      org, scopeKey, cp.lastSuccessAt, cp.lastError, cp.coverage ? JSON.stringify(cp.coverage) : null);
  }
  scopeCheckpoint(org: OrgKey, scopeKey: string): ScopeCheckpoint | null {
    const r = this.db.prepare('SELECT last_success_at, last_error, coverage_json FROM scope_checkpoints WHERE org_key = ? AND scope_key = ?').get(org, scopeKey) as Row | undefined;
    if (!r) return null;
    return {
      lastSuccessAt: r.last_success_at === null ? null : Number(r.last_success_at),
      lastError: (r.last_error as string | null) ?? null,
      coverage: r.coverage_json ? JSON.parse(r.coverage_json as string) : null,
    };
  }

  // ---- derived: rebuilt wholesale for a scope (04 §5 step 5) ----
  /**
   * Cache repair (slice 7, decided 2026-10-10): a work item ADO says no longer exists (a 404 on a
   * rescan) is forgotten everywhere: its facts, its checkpoint, its derived events and links, and every
   * scope's membership. A 403 never comes here; it keeps its last known facts (02 §3).
   */
  forgetWorkItem(org: OrgKey, itemId: number): void {
    const key = `wi:${org}:${itemId}`;
    this.tx(() => {
      for (const t of ['wi_revisions', 'wi_updates', 'wi_current_relations', 'wi_current', 'item_checkpoints', 'scope_members']) {
        this.run(`DELETE FROM ${t} WHERE org_key = ? AND item_id = ?`, org, itemId);
      }
      this.run('DELETE FROM events WHERE org_key = ? AND entity_key = ?', org, key);
      this.run('DELETE FROM links WHERE org_key = ? AND (from_key = ? OR to_key = ?)', org, key, key);
    });
    devlog.write('main', 'cache-repair', { removed: 1 });
  }

  /** A scope's derived tables, wholesale; it is no longer pending a derivation rebuild (F1). */
  rebuildDerived(org: OrgKey, scopeKey: string, scopeEntities: string[], events: AnyTimelineEvent[], observations: Observation[], links: DerivedLink[], projectIdOf: (projectKey: string) => string): void {
    devlog.write('main', 'cache-write', { table: 'derived', entities: scopeEntities.length, events: events.length, observations: observations.length, links: links.length });
    this.tx(() => {
      this.derivedRebuilt(org, scopeKey);
      for (const k of scopeEntities) {
        this.run('DELETE FROM events WHERE org_key = ? AND entity_key = ?', org, k);
        this.run('DELETE FROM links WHERE org_key = ? AND (from_key = ? OR to_key = ?)', org, k, k);
      }
      this.run("DELETE FROM observations WHERE org_key = ? AND obs_key IN (SELECT value FROM json_each(?))", org, JSON.stringify(observations.map((o) => o.obsKey)));
      for (const e of events) {
        this.run('INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?)', e.eventKey, org, projectIdOf(e.projectKey), e.kind, e.entityKey, e.occurredAt, e.observedAt, JSON.stringify(e));
      }
      for (const o of observations) this.run('INSERT OR REPLACE INTO observations VALUES (?, ?, ?)', o.obsKey, org, JSON.stringify(o));
      for (const l of links) {
        this.run('INSERT INTO links (org_key, kind, from_key, to_key, valid_from, valid_to, end_unknown) VALUES (?, ?, ?, ?, ?, ?, ?)',
          org, l.kind, l.fromKey, l.toKey, l.validFrom, l.validTo, l.endUnknown ? 1 : 0);
      }
    });
  }
  eventKeys(org: OrgKey): string[] {
    return this.all('SELECT event_key FROM events WHERE org_key = ? ORDER BY event_key', org).map((r) => r.event_key as string);
  }
  count(table: 'events' | 'links' | 'observations' | 'wi_revisions' | 'wi_updates' | 'pull_requests'): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Row).n);
  }

  // ---- favorites (local config, keyed by classification-node ID: 02 §2) ----
  favorites(org: OrgKey, projectId: Guid): AreaFavoriteRow[] {
    return this.all('SELECT node_id, path, label, display_order, unavailable FROM area_favorites WHERE org_key = ? AND project_id = ? ORDER BY display_order, node_id', org, projectId)
      .map((r) => ({ projectId, nodeId: Number(r.node_id), path: r.path as string, label: r.label as string, displayOrder: Number(r.display_order), unavailable: r.unavailable === 1 }));
  }
  saveFavorite(org: OrgKey, f: AreaFavoriteRow): void {
    devlog.write('main', 'cache-write', { table: 'favorites', nodeId: f.nodeId, outcome: 'saved' });
    this.run(`INSERT INTO area_favorites VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET path = excluded.path, label = excluded.label,
      display_order = excluded.display_order, unavailable = excluded.unavailable`,
      org, f.projectId, f.nodeId, f.path, f.label, f.displayOrder, f.unavailable ? 1 : 0);
  }
  removeFavorite(org: OrgKey, projectId: Guid, nodeId: number): void {
    devlog.write('main', 'cache-write', { table: 'favorites', nodeId, outcome: 'removed' });
    this.run('DELETE FROM area_favorites WHERE org_key = ? AND project_id = ? AND node_id = ?', org, projectId, nodeId);
  }
}
