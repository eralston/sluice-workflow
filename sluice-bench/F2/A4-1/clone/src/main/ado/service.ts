// ADO mode (slice 4): connection, probe, projects and pinning, the area tree and favorites, the Epic
// chooser, sync jobs, history.load from the cache, cache stats and Purge, and openInAdo. The renderer
// only ever sees validated IPC types (INV-16); the PAT stays in the credential store (INV-17).
import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { AreaFavorite, AreaNodeView, EpicSummary, IterationSummary, ProjectSummary, Range, Scope, ScopeUpdated, SyncLevel, SyncProgressMsg } from '@shared/contracts/ipc';
import { keys, normalizeGuid, workItemId, type CanonicalKey, type Guid, type OrgKey, type UtcMs } from '@shared/contracts/keys';
import type { Transport } from '@shared/contracts/transport';
import type { NetError } from '@shared/contracts/neterror';
import type { AreaNodeFact } from '@shared/contracts/facts';
import { reconcileFavorites } from '@shared/ingest/favorites';
import { podsBySprint, type TeamFacts } from '@shared/teams';
import { DEFAULT_RANGE_DAYS } from '@shared/limits';
import type { CredentialStore } from '../credentials/store';
import { azLoggedIn, type AzExec, type AzSession } from '../credentials/azCli';
import { Cache } from '../db/cache';
import { boundedFeatures, flattenAreas, flattenIterations, loadHistory, scopeKeyOf, syncScope, type SyncProgress, type SyncScope } from '../sync/sync';
import { levelState, loadLevel, loadLevelHistory, rebuildPendingDerived } from '../sync/levels';
import { readTeams, teamsKey } from '../sync/boards';
import { SprintStream } from '../sync/sprintStream';
import { EPIC_SAMPLE, epicFeatures, epicsByTitle, LINK_QUERY_TOP, myRecentWork } from '../sync/wiql';
import { AdoClient, AdoError } from './client';
import { HandPictures } from '../avatars/pictures';
import { resetPictureMemory } from '../avatars/strategies';
import { allowlist } from './http';
import { devlog } from '../devlog';
import { runProbe, type CapabilityMatrix } from './probe';

type Json = Record<string, unknown>;
const DAY = 86_400_000;

/** Org URLs look like https://dev.azure.com/{org} (03 §6); nothing else is accepted. */
export function normalizeOrgUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const m = /^\/([A-Za-z0-9][A-Za-z0-9._-]*)\/?$/.exec(u.pathname);
    if (u.protocol !== 'https:' || u.hostname !== 'dev.azure.com' || !m || u.search || u.hash || u.username) return null;
    return `https://dev.azure.com/${m[1]}`;
  } catch {
    return null;
  }
}

export interface ServiceDeps {
  dbDir: string;
  /** Where pictures added by hand live (userData, apart from the cache so Purge leaves them: slice 6). */
  picturesDir: string;
  credentials: CredentialStore;
  /** The Azure CLI sign-in (04 §1a); `credentials` is then its `AzOverlayStore`. Absent: PAT only. */
  az?: { session: AzSession; exec?: AzExec };
  mapping: StateMapping;
  clock: () => UtcMs;
  /** Builds the transport for an org: HTTP, or the fixture fake in dev and test runs. */
  transportFor: (orgUrl: string, pat: () => string | null) => Transport;
  send: (msg: SyncProgressMsg) => void;
  /** How long one fetch of the project list serves later callers (default 30 s). 0 asks every time: a cold start (tests). */
  projectsTtlMs?: number;
  /** A background refresh changed a project's area tree or Epics (decided 2026-10-07). */
  chooserChanged?: (e: { projectKey: string; what: 'areas' | 'epics' | 'iterations' }) => void;
  /** A streaming scope's facts changed (decided 2026-10-08), batched. */
  scopeUpdated?: (e: ScopeUpdated) => void;
  openExternal: (url: string) => Promise<void>;
}

/** E2E only (B5): `STAR_CHART_FEED_THRESHOLD` lowers the revisions feed's threshold so a small fixture takes the scale-up path. */
const scaleFromEnv = (): { scale?: { threshold: number } } => {
  const n = process.env.STAR_CHART_TEST === '1' ? Number(process.env.STAR_CHART_FEED_THRESHOLD) : NaN;
  return Number.isFinite(n) && n > 0 ? { scale: { threshold: n } } : {};
};

export class AdoService {
  cache: Cache;
  private orgUrl: string | null;
  private orgKey: OrgKey | null;
  private client: AdoClient | null = null;
  private jobs = new Map<string, AbortController>();
  /** The one controller for the reads deferred past a level load (stat and run lines, 04 §6a-1): stopped by a purge, a new or forgotten token, or another scope. */
  private bg = new AbortController();
  private bgScope: string | null = null;
  private stopBackground(): void { this.bg.abort(new Error('Stopped')); this.bg = new AbortController(); this.bgScope = null; }
  private projectsAt: { at: number; raw: unknown[] } | null = null;
  private areasAt = new Map<Guid, { at: number }>();
  private jobSeq = 0;
  readonly pictures: HandPictures;
  /** The one scope streaming now (a sprint), and its batch of changes not yet sent. */
  private stream: { id: string; scope: Scope; sc: SyncScope; s: SprintStream; ac: AbortController; changed: Set<number>; timer: ReturnType<typeof setTimeout> | null } | null = null;

  constructor(private readonly deps: ServiceDeps) {
    this.cache = Cache.open(this.dbPath);
    this.pictures = new HandPictures(deps.picturesDir);
    this.orgUrl = this.cache.meta('org_url');
    this.orgKey = this.cache.meta('org_key');
    if (this.orgUrl) this.connectClient(this.orgUrl);
  }

  get dbPath(): string {
    return join(this.deps.dbDir, 'star-chart.sqlite');
  }

  private connectClient(orgUrl: string): void {
    this.client = new AdoClient(this.deps.transportFor(orgUrl, () => this.deps.credentials.get()), orgUrl);
  }

  private need(): { client: AdoClient; org: OrgKey } {
    if (!this.client || !this.orgKey || !this.deps.credentials.get()) throw new Error('Not connected: enter an org URL and PAT');
    return { client: this.client, org: this.orgKey };
  }

  // ---- auth ----
  status() {
    const chosen = this.orgKey ? this.cache.setting<boolean>(`chosen:${this.orgKey}`) === true : false;
    const meKey = this.cache.meta('me_key');
    const me = this.orgKey && meKey && meKey.includes(`:${this.orgKey}:`) ? { key: meKey as CanonicalKey, name: this.cache.meta('me_name') ?? '' } : null;
    return {
      hasPat: Boolean(this.deps.credentials.get()), storage: this.deps.credentials.kind, orgUrl: this.orgUrl,
      connected: Boolean(this.orgKey && this.deps.credentials.get()), chosen,
      method: this.deps.az?.session.active ? 'az' as const : 'pat' as const, me,
    };
  }

  /** Whether the Azure CLI is on the PATH and logged in (04 §1a). Quiet: nothing about `az` is logged beyond this yes or no. */
  async azAvailable(): Promise<{ available: boolean; reason?: 'missing' | 'not-logged-in' | 'error' }> {
    if (!this.deps.az) return { available: false, reason: 'missing' };
    const r = await azLoggedIn(this.deps.az.exec);
    devlog.write('main', 'auth', { outcome: 'az-check', status: r.available ? 'available' : r.reason ?? 'error' });
    return r;
  }

  /** Signs in with the Azure CLI's token (memory only), then checks it as setPat checks a PAT. */
  async azSignIn(rawOrgUrl: string): Promise<{ ok: boolean; error?: string; net?: NetError }> {
    const az = this.deps.az;
    const orgUrl = normalizeOrgUrl(rawOrgUrl);
    if (!az) return { ok: false, error: 'The Azure CLI isn’t available.' };
    if (!orgUrl) return { ok: false, error: 'Use your organization’s URL, like https://dev.azure.com/your-org' };
    const before = az.session.snapshot();
    const r = await az.session.start();
    if (!r.ok) {
      devlog.write('main', 'auth', { outcome: 'refused', status: `az-${r.reason}` });
      return { ok: false, error: r.reason === 'missing' ? 'The Azure CLI (az) wasn’t found.' : r.reason === 'not-logged-in' ? 'The Azure CLI isn’t signed in. Run “az login” in a terminal, then try again.' : 'The Azure CLI didn’t give a token. Try again, or use a personal access token.' };
    }
    const out = await this.connectWith(orgUrl, 'az', () => az.session.restore(before));
    if (out.ok) this.cache.setMeta('auth_az', '1');
    return out;
  }

  /** At launch: signs in again with the Azure CLI if it was how you connected last time (nothing secret is kept; this asks `az` anew). Quiet on failure. */
  resumeAz(): void {
    if (this.deps.az && this.cache.meta('auth_az') === '1') this.azReady = this.doResumeAz();
  }
  /** Resolves when a launch resume has finished (ADO calls wait for it; the window doesn't). */
  ready(): Promise<void> { return this.azReady; }
  private azReady: Promise<void> = Promise.resolve();
  private async doResumeAz(): Promise<void> {
    try {
      const r = await this.deps.az!.session.start();
      if (!r.ok || !this.client || !this.orgKey) return;
      // The az account may not be the one that signed in last time: read who it is now.
      try { this.rememberMe(this.orgKey, (await this.client.connectionData()).authenticatedUser); }
      catch (e) {
        if (e instanceof AdoError && e.status === 401) {
          // This account has no access to the org: sign the Azure CLI out so a saved PAT (or the prompt) takes over.
          this.rememberMe(this.orgKey, null);
          this.deps.az!.session.stop();
          this.cache.setMeta('auth_az', '');
        }
      }
    } catch { /* quiet */ }
  }

  async setPat(rawOrgUrl: string, pat: string): Promise<{ ok: boolean; error?: string; net?: NetError }> {
    const orgUrl = normalizeOrgUrl(rawOrgUrl);
    if (!orgUrl) return { ok: false, error: 'Use your organization’s URL, like https://dev.azure.com/your-org' };
    if (!pat.trim()) return { ok: false, error: 'Enter a personal access token' };
    const previous = this.deps.credentials.stored ? this.deps.credentials.stored() : this.deps.credentials.get(); // the saved PAT, never the az token
    const wasAz = this.deps.az?.session.snapshot() ?? null;
    await this.deps.credentials.set(pat.trim()); // also signs the Azure CLI out
    return this.connectWith(orgUrl, 'pat', async () => {
      // The PAT first (the Azure CLI is signed out by now), then the Azure CLI sign-in if it was in use.
      if (previous) await this.deps.credentials.set(previous);
      else await this.deps.credentials.clear();
      if (wasAz) this.deps.az?.session.restore(wasAz);
    });
  }

  /** The check both sign-ins share: `connectionData` alone, then the org, its key and who you are. `undo` restores what was in use before. */
  private async connectWith(orgUrl: string, method: 'pat' | 'az', undo: () => void | Promise<void>): Promise<{ ok: boolean; error?: string; net?: NetError }> {
    this.connectClient(orgUrl);
    try {
      const data = await this.client!.connectionData();
      const instance = normalizeGuid(String(data.instanceId ?? ''));
      // A different org starts a fresh cache: keys are org-scoped, but favorites and pins aren't portable.
      this.stopBackground(); // a new token: reads on the old one end
      if (this.orgKey && this.orgKey !== instance) this.purge();
      this.orgUrl = orgUrl;
      this.orgKey = instance;
      this.cache.setMeta('org_url', orgUrl);
      this.cache.setMeta('org_key', instance);
      this.rememberMe(instance, data.authenticatedUser);
      if (method === 'pat') this.cache.setMeta('auth_az', '');
      resetPictureMemory(this.cache, instance); // a new token may be allowed what the last one wasn't (04 §7)
      devlog.write('main', 'auth', { outcome: 'connected', storage: this.deps.credentials.kind, method });
      return { ok: true };
    } catch (e) {
      devlog.write('main', 'auth', { outcome: 'refused', status: e instanceof AdoError ? e.status : null, method });
      await undo();
      if (this.orgUrl) this.connectClient(this.orgUrl); else this.client = null;
      if (e instanceof AdoError) {
        if (e.status === 401) return { ok: false, error: 'That token was refused: it’s expired, revoked, or not for this organization.', net: e.detail };
        if (e.status === 404) return { ok: false, error: 'No organization at that URL.', net: e.detail };
        if (e.status === 0) return { ok: false, error: 'Couldn’t reach ADO. Check the URL and your connection.', net: e.detail };
        return { ok: false, error: `ADO answered HTTP ${e.status}.`, net: e.detail };
      }
      return { ok: false, error: 'Couldn’t reach ADO. Check the URL and your connection.' };
    }
  }

  /** Who the token belongs to (13 Q8): kept as an identity key and a display name, never the token. */
  private rememberMe(org: OrgKey, user: unknown): void {
    try {
      const u = user as { id?: unknown; providerDisplayName?: unknown; customDisplayName?: unknown } | null | undefined;
      const name = String(u?.customDisplayName ?? u?.providerDisplayName ?? '');
      this.cache.setMeta('me_key', keys.identity(org, normalizeGuid(String(u?.id ?? ''))));
      this.cache.setMeta('me_name', name);
    } catch { /* no usable identity: nobody is suggested */
      this.cache.setMeta('me_key', ''); this.cache.setMeta('me_name', '');
    }
  }

  async clear(): Promise<void> {
    devlog.write('main', 'auth', { outcome: 'forgotten' });
    this.stopBackground();
    await this.deps.credentials.clear();
    if (!this.deps.az?.session.active) this.cache.setMeta('auth_az', '');
  }

  // ---- probe ----
  async probe(): Promise<CapabilityMatrix> {
    if (!this.client) throw new Error('Not connected: enter an org URL and PAT');
    return runProbe(this.client, this.deps.mapping, this.deps.clock);
  }

  // ---- range ----
  range(): Range {
    // The last DEFAULT_RANGE_DAYS whole days, ending at the next UTC midnight.
    const end = Math.ceil(this.deps.clock() / DAY) * DAY;
    return { startUtc: end - DEFAULT_RANGE_DAYS * DAY, endUtc: end };
  }

  // ---- projects ----
  private pinnedKey = () => `pinned:${this.orgKey}`;
  async projects(cacheOnly = false): Promise<ProjectSummary[]> {
    const { client, org } = this.need();
    const at = this.deps.clock();
    // An offline start (AC-31, decided 2026-10-09): the projects we already know, without asking ADO.
    // What they show — activity, whether charted — is all local, so the galaxy opens from the cache.
    if (cacheOnly) return this.summarize(org, this.cache.projects(org));
    // The project list changes rarely: one fetch serves the next 30 s of callers (decided 2026-10-07,
    // after the request panel showed it fetched five times for one action).
    const fresh = this.projectsAt && Date.now() - this.projectsAt.at < (this.deps.projectsTtlMs ?? 30_000) ? this.projectsAt.raw : null;
    const raw = fresh ?? (await client.projects());
    if (!fresh) this.projectsAt = { at: Date.now(), raw };
    const facts = raw.flatMap((p) => {
      const o = p as Json;
      try { return [{ projectId: normalizeGuid(String(o.id)), name: String(o.name ?? ''), adoUrl: '' }]; } catch { return []; }
    });
    this.cache.putProjects(org, facts, at);
    return this.summarize(org, facts);
  }

  /** Each project with what we know of it locally: pinned, recent activity, charted, favorites. */
  private summarize(org: OrgKey, facts: { projectId: Guid; name: string; adoUrl: string }[]): ProjectSummary[] {
    const pinned = new Set(this.cache.setting<string[]>(this.pinnedKey()) ?? []);
    const r = this.range();
    return facts.map((p) => {
      const key = keys.project(org, p.projectId);
      const activity = Number((this.cache.db.prepare('SELECT COUNT(*) AS n FROM events WHERE org_key = ? AND project_id = ? AND occurred_at >= ? AND occurred_at < ?')
        .get(org, p.projectId, r.startUtc, r.endUtc) as Json).n);
      const charted = !!this.cache.db.prepare("SELECT 1 FROM scope_checkpoints WHERE org_key = ? AND scope_key LIKE ? AND last_success_at IS NOT NULL LIMIT 1")
        .get(org, `${p.projectId}|%`);
      const recentAt = this.recentMap().get(p.projectId);
      return { key, name: p.name, pinned: pinned.has(key), activity, favoriteCount: this.cache.favorites(org, p.projectId).length, charted, ...(recentAt ? { recentAt } : {}) };
    }).sort((a, b) => (a.key < b.key ? -1 : 1));
  }
  /** When you last worked in each project (from the cached recent-work query), by project ID. */
  private recentMap(): Map<Guid, UtcMs> {
    const cached = this.orgKey ? this.cache.setting<{ at: UtcMs; projects: [Guid, UtcMs][] }>(`recent:${this.orgKey}`) : null;
    return new Map(cached?.projects ?? []);
  }

  /**
   * Your most recent projects, newest first (decided 2026-10-07): the projects of work items you
   * changed or are assigned, changed in the last 90 days. Recency by your own activity, never an
   * amount (INV-19). Recomputed on each call (connect and the empty cosmos ask), and cached for the
   * galaxy's order.
   */
  async recentProjects(limit = 10): Promise<ProjectSummary[]> {
    const { client, org } = this.need();
    const found = await client.wiqlOrg(myRecentWork(), 400);
    const ids = (Array.isArray(found.workItems) ? (found.workItems as Json[]) : []).map((w) => Number(w.id)).filter(Number.isFinite);
    const latest = new Map<string, UtcMs>(); // by project name, as work items carry it
    for (const w of await client.workItemFields(ids, ['System.TeamProject', 'System.ChangedDate'])) {
      const f = (w as Json | null)?.fields as Json | undefined;
      const name = typeof f?.['System.TeamProject'] === 'string' ? (f['System.TeamProject'] as string) : null;
      const at = typeof f?.['System.ChangedDate'] === 'string' ? Date.parse(f['System.ChangedDate'] as string) : NaN;
      if (name && Number.isFinite(at) && at > (latest.get(name) ?? -Infinity)) latest.set(name, at);
    }
    if (!this.cache.projects(org).length) await this.projects();
    const byName = new Map(this.cache.projects(org).map((p) => [p.name, p.projectId]));
    const ranked = [...latest].flatMap(([name, at]) => (byName.has(name) ? [[byName.get(name)!, at] as [Guid, UtcMs]] : [])).sort((a, b) => b[1] - a[1]);
    this.cache.setSetting(`recent:${org}`, { at: this.deps.clock(), projects: ranked });
    devlog.write('main', 'recent', { workItems: ids.length, projects: ranked.length });
    const summaries = new Map((await this.projects()).map((p) => [p.key, p]));
    return ranked.slice(0, limit).map(([id]) => summaries.get(keys.project(org, id))).filter((p): p is ProjectSummary => !!p);
  }

  setPinned(keysIn: CanonicalKey[]): void {
    this.need();
    this.cache.setSetting(this.pinnedKey(), [...new Set(keysIn)].sort());
    this.cache.setSetting(`chosen:${this.orgKey}`, true); // a choice, even "all" (decided 2026-10-07)
  }

  private projectOf(projectKey: string): { projectId: Guid; name: string } {
    const { org } = this.need();
    const projectId = projectKey.split(':')[2] ?? '';
    const p = this.cache.projects(org).find((x) => x.projectId === projectId);
    if (!p) throw new Error('Unknown project');
    return p;
  }

  // ---- areas and favorites (02 §2; AC-32) ----
  /**
   * The project's area tree, from the cache at once when it has one (decided 2026-10-07): a tree not
   * read this minute refreshes in the background, and `chooserChanged` says when it differs. The first
   * read for a project waits on ADO.
   */
  async areaTree(projectKey: string): Promise<AreaNodeView[]> {
    const { org } = this.need();
    const p = this.projectOf(projectKey);
    const cached = this.cache.areaNodes(org, p.projectId);
    const fresh = this.areasAt.get(p.projectId);
    let nodes: AreaNodeFact[];
    if (fresh && Date.now() - fresh.at < 60_000) nodes = cached;
    else if (cached.length) {
      nodes = cached;
      void this.refreshAreas(projectKey).catch(() => { /* offline: the cached tree stands */ });
    } else nodes = await this.readAreas(p.projectId);
    this.refreshFavorites(org, p.projectId);
    return nodes.map((n) => ({
      areaKey: keys.area(org, p.projectId, n.nodeId), projectKey: keys.project(org, p.projectId), path: n.path,
      label: n.path.split('\\').pop() ?? n.path, depth: n.path.split('\\').length - 1, hasChildren: n.hasChildren,
    }));
  }
  private readonly areasReading = new Map<string, Promise<AreaNodeFact[]>>();
  /** One read of a project's tree at a time; stores it and marks it fresh. */
  private readAreas(projectId: Guid): Promise<AreaNodeFact[]> {
    const { client, org } = this.need();
    let r = this.areasReading.get(projectId);
    if (!r) {
      r = client.areas(projectId, 14).then((raw) => {
        const nodes = flattenAreas(projectId, raw);
        this.cache.putAreaNodes(org, projectId, nodes, this.deps.clock());
        this.areasAt.set(projectId, { at: Date.now() });
        return nodes;
      }).finally(() => this.areasReading.delete(projectId));
      this.areasReading.set(projectId, r);
    }
    return r;
  }
  private async refreshAreas(projectKey: string): Promise<void> {
    const { org } = this.need();
    const p = this.projectOf(projectKey);
    const sig = (ns: AreaNodeFact[]) => JSON.stringify(ns.map((n) => [n.nodeId, n.path, n.hasChildren]));
    const favSig = () => JSON.stringify(this.cache.favorites(org, p.projectId));
    const before = sig(this.cache.areaNodes(org, p.projectId));
    const favBefore = favSig();
    const after = sig(await this.readAreas(p.projectId));
    this.refreshFavorites(org, p.projectId);
    if (after !== before || favSig() !== favBefore) this.deps.chooserChanged?.({ projectKey, what: 'areas' });
  }
  /**
   * The project's sprints (decided 2026-10-07): dated iterations that have started, newest first.
   * From the cache at once once read; a list not read this minute refreshes in the background.
   */
  async iterations(projectKey: string): Promise<IterationSummary[]> {
    const { client, org } = this.need();
    const p = this.projectOf(projectKey);
    const read = async () => {
      const nodes = flattenIterations(p.projectId, await client.iterations(p.projectId, 14));
      this.cache.putIterationNodes(org, p.projectId, nodes, this.deps.clock());
      this.iterationsAt.set(p.projectId, Date.now());
      return nodes;
    };
    const cached = this.cache.iterationNodes(org, p.projectId);
    const fresh = (this.iterationsAt.get(p.projectId) ?? 0) > Date.now() - 60_000;
    let nodes = cached;
    if (!cached.length) nodes = await read();
    else if (!fresh) {
      const before = JSON.stringify(cached);
      void read().then((n) => { if (JSON.stringify(n) !== before) this.deps.chooserChanged?.({ projectKey, what: 'iterations' }); }, () => undefined);
    }
    const now = this.deps.clock();
    // Each team's own sprint list (slice 7): a sprint carries the pods whose team runs it.
    const favs = this.cache.favorites(org, p.projectId).filter((f) => !f.unavailable).map((f) => ({ areaKey: keys.area(org, p.projectId, f.nodeId) as string, path: f.path }));
    const teams = await this.teams(p.projectId);
    const dated = nodes.filter((n): n is typeof n & { startUtc: number; finishUtc: number } => n.startUtc !== null && n.finishUtc !== null && n.startUtc < now);
    const byPod = podsBySprint(teams, favs, dated.map((n) => n.path));
    return dated
      .filter((n) => byPod.get(n.path) === null || (byPod.get(n.path)?.length ?? 0) > 0) // a sprint none of the pods' teams runs isn't offered
      .map((n) => {
        const pods = byPod.get(n.path);
        return { key: keys.iteration(org, p.projectId, n.nodeId), path: n.path, label: n.path.split('\\').pop() ?? n.path, startUtc: n.startUtc, finishUtc: n.finishUtc, ...(pods ? { pods: pods as CanonicalKey[] } : {}) };
      })
      .sort((a, b) => b.startUtc - a.startUtc || (a.key < b.key ? -1 : 1));
  }
  private readonly iterationsAt = new Map<string, number>();

  private refreshFavorites(org: OrgKey, projectId: Guid): void {
    const nodes = this.cache.areaNodes(org, projectId);
    if (!nodes.length) return;
    for (const f of reconcileFavorites(this.cache.favorites(org, projectId), nodes)) this.cache.saveFavorite(org, f);
  }
  /**
   * A project's teams with their Area Paths and sprint lists (slice 7): 1 call, then 2 per team. Kept
   * in settings so a start without a connection still knows them; read again at most once a minute.
   * Null when ADO won't say (an older server, or a token without the scope): every pod runs every sprint.
   */
  private teamsAt = new Map<Guid, number>();
  /** A team read in flight, per project: a second caller awaits it instead of starting its own (B audit). */
  private teamsFlight = new Map<Guid, Promise<TeamFacts[] | null>>();
  private async teams(projectId: Guid): Promise<TeamFacts[] | null> {
    const { client, org } = this.need();
    const key = teamsKey(org, projectId);
    const stored = this.cache.setting<{ teams: TeamFacts[] | null }>(key);
    const cached = stored ? stored.teams : undefined;
    if (cached !== undefined && (this.teamsAt.get(projectId) ?? 0) > Date.now() - 60_000) return cached;
    const read = async (): Promise<TeamFacts[] | null> => {
      try {
        const out = await readTeams(client, projectId, stored?.teams);
        this.cache.setSetting(key, { teams: out });
        this.teamsAt.set(projectId, Date.now());
        devlog.write('main', 'teams', { count: out.length });
        return out;
      } catch (e) {
        if (!(e instanceof AdoError)) throw e;
        devlog.write('main', 'teams-unavailable', { status: e.status });
        this.teamsAt.set(projectId, Date.now());
        if (cached === undefined) this.cache.setSetting(key, { teams: null });
        return cached ?? null;
      }
    };
    const flight = this.teamsFlight.get(projectId) ?? (() => { const f = read().finally(() => { this.teamsFlight.delete(projectId); }); this.teamsFlight.set(projectId, f); return f; })();
    if (cached === undefined) return flight;
    void flight.catch(() => undefined);
    return cached;
  }

  async favorites(projectKey: string): Promise<AreaFavorite[]> {
    const { org } = this.need();
    const p = this.projectOf(projectKey);
    // Checked against the area tree: the cached one at once, the live one in the background (areaTree).
    try { await this.areaTree(projectKey); } catch { /* keep the cached tree */ }
    return this.cache.favorites(org, p.projectId).map((f) => ({
      areaKey: keys.area(org, p.projectId, f.nodeId), projectKey: keys.project(org, p.projectId), path: f.path, label: f.label, displayOrder: f.displayOrder, unavailable: f.unavailable,
    }));
  }
  saveFavorite(f: AreaFavorite): void {
    const { org } = this.need();
    const [, , projectId, node] = f.areaKey.split(':');
    const nodeId = Number(node);
    if (!projectId || !Number.isInteger(nodeId)) throw new Error('bad area key');
    const known = this.cache.areaNodes(org, projectId).find((n) => n.nodeId === nodeId);
    this.cache.saveFavorite(org, { projectId, nodeId, path: known?.path ?? f.path, label: f.label, displayOrder: f.displayOrder, unavailable: known ? false : f.unavailable });
  }
  removeFavorite(areaKey: string): void {
    const { org } = this.need();
    const [, , projectId, node] = areaKey.split(':');
    this.cache.removeFavorite(org, projectId ?? '', Number(node));
  }
  reorderFavorites(projectKey: string, order: string[]): void {
    const { org } = this.need();
    const p = this.projectOf(projectKey);
    const favs = this.cache.favorites(org, p.projectId);
    this.cache.tx(() => {
      for (const f of favs) {
        const i = order.indexOf(keys.area(org, p.projectId, f.nodeId));
        this.cache.saveFavorite(org, { ...f, displayOrder: i < 0 ? order.length + f.displayOrder : i });
      }
    });
  }

  // ---- Epics (04 §3 Epic chooser) ----
  private async epicSummaries(client: AdoClient, org: OrgKey, projectId: Guid, ids: number[]): Promise<EpicSummary[]> {
    if (!ids.length) return [];
    const items = (await client.workItems(ids)).filter((w): w is Json => !!w && (w as Json).fields !== undefined);
    const out: EpicSummary[] = [];
    for (const w of items) {
      const f = w.fields as Json;
      if (f['System.WorkItemType'] !== 'Epic') continue;
      const id = Number(w.id);
      const rels = await client.wiql(projectId, epicFeatures(id), LINK_QUERY_TOP);
      const featureCount = (Array.isArray(rels.workItemRelations) ? (rels.workItemRelations as Json[]) : []).filter((r) => r.rel).length;
      out.push({ key: keys.workItem(org, id), id, title: String(f['System.Title'] ?? ''), state: String(f['System.State'] ?? ''), featureCount });
    }
    return out.sort((a, b) => a.id - b.id);
  }
  /**
   * Epics that are direct parents of Features in the project's saved areas (02 §2). From the cache at
   * once when there's a list (decided 2026-10-07): one not read this session refreshes in the
   * background, and `chooserChanged` says when it differs. Saving or removing an area refreshes it too.
   */
  async epics(projectKey: string): Promise<EpicSummary[]> {
    const { org } = this.need();
    const p = this.projectOf(projectKey);
    const k = `epics:${org}:${p.projectId}`;
    const cached = this.cache.setting<{ favs: string; list: EpicSummary[] }>(k);
    const favs = JSON.stringify(this.cache.favorites(org, p.projectId).filter((f) => !f.unavailable).map((f) => f.nodeId).sort());
    const read = async () => {
      const list = await this.readEpics(projectKey);
      this.cache.setSetting(k, { favs, list });
      this.epicsAt.set(p.projectId, Date.now());
      return list;
    };
    if (!cached || cached.favs !== favs) return read();
    if ((this.epicsAt.get(p.projectId) ?? 0) < Date.now() - 60_000) {
      void read().then((list) => { if (JSON.stringify(list) !== JSON.stringify(cached.list)) this.deps.chooserChanged?.({ projectKey, what: 'epics' }); }, () => undefined);
    }
    return cached.list;
  }
  private readonly epicsAt = new Map<string, number>();
  private async readEpics(projectKey: string): Promise<EpicSummary[]> {
    const { client, org } = this.need();
    const p = this.projectOf(projectKey);
    const favs = this.cache.favorites(org, p.projectId).filter((f) => !f.unavailable);
    const features = new Set<number>();
    for (const f of favs) {
      // A sample of recent Features is enough to find their Epics, and never trips the 20,000 cap.
      for (const id of (await boundedFeatures(client, p.projectId, f.path, { top: EPIC_SAMPLE })).ids) features.add(id);
    }
    const parents = new Set<number>();
    for (const w of await client.workItems([...features])) {
      for (const r of (Array.isArray((w as Json | null)?.relations) ? ((w as Json).relations as Json[]) : [])) {
        const m = r.rel === 'System.LinkTypes.Hierarchy-Reverse' ? /\/workItems\/(\d+)$/i.exec(String(r.url)) : null;
        if (m) parents.add(Number(m[1]));
      }
    }
    return this.epicSummaries(client, org, p.projectId, [...parents]);
  }
  /** By ID (a direct GET) or by title (WIQL CONTAINS). */
  async searchEpics(projectKey: string, q: string): Promise<EpicSummary[]> {
    const { client, org } = this.need();
    const p = this.projectOf(projectKey);
    const text = q.trim().replace(/^#/, '');
    if (!text) return [];
    if (/^\d+$/.test(text)) return this.epicSummaries(client, org, p.projectId, [Number(text)]);
    const j = await client.wiql(p.projectId, epicsByTitle(text), 50);
    return this.epicSummaries(client, org, p.projectId, (Array.isArray(j.workItems) ? (j.workItems as Json[]) : []).map((w) => Number(w.id)).slice(0, 50));
  }

  // ---- sync and history ----
  private syncScopeOf(scope: Scope): SyncScope {
    const { org } = this.need();
    const p = this.projectOf(scope.projectKey);
    const project = { projectId: p.projectId, name: p.name, adoUrl: '' };
    if (scope.sector.kind === 'area') {
      const nodeId = Number(scope.sector.areaKey.split(':')[3]);
      const node = this.cache.areaNodes(org, p.projectId).find((n) => n.nodeId === nodeId);
      return { org, project, sector: scope.sector, target: { kind: 'area', path: node?.path ?? scope.sector.path, nodeId } };
    }
    if (scope.sector.kind === 'sprint') {
      // A sprint through its pods (decided 2026-10-07): the pods' paths as the area tree has them now.
      const areas = this.cache.areaNodes(org, p.projectId);
      const sp = scope.sector;
      const pods = sp.pods.map((pod) => areas.find((n) => n.nodeId === Number(pod.areaKey.split(':')[3]))?.path ?? pod.path);
      return { org, project, sector: sp, target: { kind: 'sprint', path: sp.path, nodeId: Number(sp.iterationKey.split(':')[3]), startUtc: sp.startUtc, finishUtc: sp.finishUtc, pods } };
    }
    return { org, project, sector: scope.sector, target: { kind: 'epic', id: workItemId(scope.sector.epicKey) } };
  }

  /** A level of current state, a scene's history, or (no level) everything (decided 2026-10-07). */
  startSync(scope: Scope, range: Range, level?: SyncLevel): { jobId: string } {
    const { client } = this.need();
    const jobId = `sync-${++this.jobSeq}`;
    const ac = new AbortController();
    this.jobs.set(jobId, ac);
    const sc = this.syncScopeOf(scope);
    const scopeNow = `${sc.org}|${scopeKeyOf(sc)}`;
    if (this.bgScope !== null && this.bgScope !== scopeNow) this.stopBackground(); // another scope: the last one's deferred reads end
    this.bgScope = scopeNow;
    const ctx = { client: client.withSignal(ac.signal), cache: this.cache, mapping: this.deps.mapping, clock: this.deps.clock, signal: ac.signal, background: { client: client.withSignal(this.bg.signal), signal: this.bg.signal }, ...scaleFromEnv(),
      progress: (p: SyncProgress) => this.deps.send({ jobId, ...p }) };
    const feature = (k: string) => workItemId(k as CanonicalKey);
    const launch = (): Promise<unknown> => {
      if (level?.kind === 'sprint') return this.openStream(scope, sc, ctx, ac);
      return !level ? syncScope(ctx, sc, range)
        : loadLevel(ctx, sc, range, level.kind === 'feature' ? { kind: 'feature', featureId: feature(level.featureKey) }
          : level.kind === 'history' ? { kind: 'history', days: level.days, ...(level.retry ? { retry: true } : {}), scene: level.scene.kind === 'team' ? { kind: 'team' } : { kind: 'feature', featureId: feature(level.scene.featureKey) } }
            : { kind: level.kind });
    };
    // The team boards (B4) ride on the team list: read (or refreshed) beside the sync, never before it. The first look
    // never waits on them; a bundle built before they arrive places work by state, and the next load has the columns.
    void this.teams(sc.project.projectId).catch(() => undefined);
    const run = launch();
    void run
      .catch(() => { /* reported through progress as 'failed' */ })
      .finally(() => this.jobs.delete(jobId));
    return { jobId };
  }
  cancelSync(jobId: string): void {
    this.jobs.get(jobId)?.abort(new Error('Cancelled'));
  }

  /**
   * A sprint, streamed (decided 2026-10-08; 04 §5b): its first look is the job (the loading plate's
   * steps), then the rest streams in behind it as `scope.updated` batches. One scope streams at a
   * time: opening another drops this one's work not yet started (what's in the cache stays).
   */
  private async openStream(scope: Scope, sc: SyncScope, ctx: { client: AdoClient; cache: Cache; mapping: StateMapping; clock: () => UtcMs; signal: AbortSignal; progress: (p: SyncProgress) => void }, ac: AbortController): Promise<void> {
    const id = scopeKeyOf(sc);
    if (this.stream && this.stream.id !== id) this.closeStream();
    const report = (p: Omit<SyncProgress, 'partial'>) => ctx.progress({ ...p, partial: false });
    try {
      let st = this.stream;
      if (!st) {
        const streamAc = new AbortController();
        const sctx = { client: this.need().client.withSignal(streamAc.signal), cache: this.cache, mapping: this.deps.mapping, clock: this.deps.clock, signal: streamAc.signal, ...scaleFromEnv() };
        const changed = new Set<number>();
        const s = new SprintStream(sctx, sc, {
          changed: (ids) => this.streamChanged(ids),
          // The scene on screen has all it needs (again, after a focus brought more).
          done: () => { if (this.stream?.id === id) this.flushStream(true); },
          // The token stopped working part-way through: say so once, and stop (04 §6).
          refused: () => { if (this.stream?.id === id) { this.flushStream(false, true); this.closeStream(); } },
        });
        st = this.stream = { id, scope, sc, s, ac: streamAc, changed, timer: null };
        const t0 = Date.now();
        const look = new SprintStream({ ...sctx, client: ctx.client, signal: ctx.signal }, sc, {
          changed: () => {}, progress: (done, total) => report({ phase: 'discover', done, total }),
        });
        await look.look();
        devlog.write('main', 'stream-look', { ms: Date.now() - t0 });
        report({ phase: 'done', done: 1, total: 1 });
        const t1 = Date.now();
        void s.fill().then(() => devlog.write('main', 'stream-fill', { ms: Date.now() - t1, waiting: s.waiting }), () => undefined);
      } else if (st.s.sched.pending) {
        report({ phase: 'done', done: 1, total: 1 }); // still streaming: it's already as live as it gets
      } else {
        // Streamed and settled, and now reopened: read it again (04 §5 step 7, decided 2026-10-09).
        // The look is 3 calls and tells us what changed; the fill picks up from the checkpoints.
        const t0 = Date.now();
        await st.s.refresh((done, total) => report({ phase: 'discover', done, total }));
        devlog.write('main', 'stream-refresh', { ms: Date.now() - t0 });
        report({ phase: 'done', done: 1, total: 1 });
      }
    } catch (e) {
      if (this.stream?.id === id) this.closeStream();
      const status = e instanceof AdoError ? `${e.family} ${e.status}` : ac.signal.aborted ? 'cancelled' : 'error';
      ctx.progress({ phase: 'failed', done: 0, total: 0, partial: false, lastError: status, ...(e instanceof AdoError ? { error: e.detail } : {}), ...(!(e instanceof AdoError) && e instanceof Error ? { errorMessage: e.message } : {}) });
      throw e;
    }
  }
  private closeStream(): void {
    const st = this.stream;
    if (!st) return;
    this.stream = null;
    if (st.timer) clearTimeout(st.timer);
    st.s.close();
    st.ac.abort(new Error('Cancelled'));
  }
  /** Batch changes: every 1.5 s, or at once on 25 (decided 2026-10-08). */
  private streamChanged(ids: number[]): void {
    const st = this.stream;
    if (!st) return;
    for (const id of ids) st.changed.add(id);
    if (st.changed.size >= 25) this.flushStream(false);
    else st.timer ??= setTimeout(() => this.flushStream(false), 1500);
  }
  private flushStream(done: boolean, refused = false): void {
    const st = this.stream;
    if (!st) return;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    const changed = [...st.changed].map((id) => keys.workItem(st.sc.org, id));
    st.changed.clear();
    devlog.write('main', 'scope-updated', { changed: changed.length, pending: st.s.sched.pending, done });
    const count = st.s.fillCount();
    this.deps.scopeUpdated?.({ scope: st.scope, changed, pending: done || refused ? 0 : count.n, done, total: done || refused ? 0 : count.m, exact: done || refused ? true : count.exact, ...(refused ? { refused: true } : {}) });
  }

  /** Look here (decided 2026-10-08). A pod's Tasks first when entering it; an item's history first in close approach. */
  async focus(scope: Scope, sceneKey: string): Promise<void> {
    const st = this.stream;
    if (!st || scope.sector.kind !== 'sprint' || st.id !== scopeKeyOf(this.syncScopeOf(scope)) || st.sc.target.kind !== 'sprint') return;
    const [level, ...rest] = sceneKey.split(':');
    const k = rest.join(':');
    const pods = st.sc.target.pods;
    const podPath = (areaKey: string) => { const i = scope.sector.kind === 'sprint' ? scope.sector.pods.findIndex((p) => p.areaKey === areaKey) : -1; return i >= 0 ? pods[i] : undefined; };
    if (level === 'pod') return st.s.focus({ pod: podPath(k) });
    if (level === 'body') {
      const id = workItemId(k as CanonicalKey);
      const area = this.cache.currentItems(st.sc.org, [id]).get(id)?.areaPath ?? '';
      return st.s.focus({ item: id, pod: pods.find((p) => area === p || area.startsWith(`${p}\\`)) });
    }
    return st.s.focus({});
  }

  load(scope: Scope, range: Range): ScopeHistory {
    const sc = this.syncScopeOf(scope);
    if (!this.cache.scopeCheckpoint(sc.org, scopeKeyOf(sc))?.lastSuccessAt) throw new Error('NotSynced: sync this scope first');
    const ctx = { cache: this.cache, mapping: this.deps.mapping, clock: this.deps.clock, pictures: this.pictures };
    // A derivation change cleared its derived rows (03 §9, F1); a sprint streaming now rebuilds its own.
    const key = scopeKeyOf(sc);
    rebuildPendingDerived(ctx, sc, range, this.stream?.id === key && this.stream.s.sched.pending > 0);
    // Loaded by level: current state plus history where loaded. Otherwise, a full sync's bundle.
    return this.withPictureMarks(this.withWebLinks(levelState(this.cache, sc) ? loadLevelHistory(ctx, sc, range) : loadHistory(ctx, sc, range)));
  }

  /** Mark the captains whose picture the user added, so the panel can offer to change or remove it. */
  private withPictureMarks(h: ScopeHistory): ScopeHistory {
    const org = this.orgKey;
    if (!org) return h;
    const have = this.pictures.ids(org);
    if (!have.size) return h;
    return { ...h, entities: { ...h.entities, captains: h.entities.captains.map((c) => (this.pictures.has(org, c.key.split(':').pop()!) ? { ...c, handAdded: true } : c)) } };
  }

  /** A picture added by hand for a captain (slice 6): the key names the person, never the file. */
  setPicture(captainKey: string, png: Buffer): void {
    this.pictures.set(this.need().org, captainKey.split(':').pop()!, png);
  }

  /** Copy the hand-added pictures into a folder; how many. */
  exportPictures(dir: string): number {
    return this.pictures.exportTo(this.need().org, dir);
  }

  /** Take a folder of exported pictures; the pictures now kept, by identity ID, as inline images. */
  importPictures(dir: string): Record<string, string> {
    const org = this.need().org;
    const out: Record<string, string> = {};
    for (const id of this.pictures.importFrom(org, dir)) out[id] = this.pictures.get(org, id)!;
    return out;
  }

  /** The inline picture kept for an identity, or null. */
  pictureOf(captainKey: string): string | null {
    return this.pictures.get(this.need().org, captainKey.split(':').pop()!);
  }

  /** Forget a captain's hand-added picture; ADO's (or initials) show again. */
  removePicture(captainKey: string): boolean {
    return this.pictures.remove(this.need().org, captainKey.split(':').pop()!);
  }

  /** The ADO web page for a key (03 §6: main resolves URLs, the renderer passes keys). */
  webUrl(key: string): string | null {
    if (!this.orgUrl) return null;
    const parts = key.split(':');
    const org = this.orgUrl;
    switch (parts[0]) {
      case 'wi': return `${org}/_workitems/edit/${Number(parts[2])}`;
      case 'proj': return `${org}/${parts[2]}`;
      case 'repo': {
        const r = this.orgKey ? this.cache.repos(this.orgKey).find((x) => x.repoId === parts[2]) : undefined;
        return r ? `${org}/${r.projectId}/_git/${r.repoId}` : null;
      }
      case 'pr': {
        const r = this.orgKey ? this.cache.repos(this.orgKey).find((x) => x.repoId === parts[2]) : undefined;
        return r ? `${org}/${r.projectId}/_git/${r.repoId}/pullrequest/${Number(parts[3])}` : null;
      }
      default: return null;
    }
  }
  private withWebLinks(h: ScopeHistory): ScopeHistory {
    const fill = <T extends { key: CanonicalKey; adoUrl: string }>(xs: T[]) => xs.map((x) => ({ ...x, adoUrl: x.adoUrl || this.webUrl(x.key) || '' }));
    return { ...h, entities: { ...h.entities, projects: fill(h.entities.projects), workItems: fill(h.entities.workItems), repos: fill(h.entities.repos), prs: fill(h.entities.prs) } };
  }
  async openInAdo(key: string): Promise<void> {
    const url = this.webUrl(key);
    if (!url || !this.orgUrl || !allowlist(this.orgUrl, false)(url)) throw new Error('No ADO page for that');
    await this.deps.openExternal(url);
  }

  // ---- cache (04 §8; AC-33) ----
  stats(): { bytes: number; path: string } {
    let bytes = 0;
    for (const f of [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`]) {
      try { bytes += statSync(f).size; } catch { /* absent */ }
    }
    return { bytes, path: this.dbPath };
  }
  /** Delete the DB and recreate it empty (04 §8). The token stays in its own store, and the connection carries over. */
  purge(): void {
    devlog.write('main', 'cache-purge', {});
    this.projectsAt = null;
    this.areasAt.clear();
    for (const ac of this.jobs.values()) ac.abort(new Error('Purged'));
    this.closeStream();
    this.stopBackground();
    const carried = { auth_az: this.cache.meta('auth_az'), me_key: this.cache.meta('me_key'), me_name: this.cache.meta('me_name') };
    this.cache.close();
    for (const f of [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`]) rmSync(f, { force: true });
    this.cache = Cache.open(this.dbPath);
    if (this.orgUrl) this.cache.setMeta('org_url', this.orgUrl);
    if (this.orgKey) this.cache.setMeta('org_key', this.orgKey);
    // Who you are and how you signed in are the connection's, not the cache's (04 §8): carried over too.
    for (const k of ['auth_az', 'me_key', 'me_name'] as const) if (carried[k]) this.cache.setMeta(k, carried[k]!);
  }
}
