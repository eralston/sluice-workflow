// 04 §§2–3 — the ADO REST client: read-only calls (INV-21) over a Transport. Every call names its
// endpoint family, which is all an error records (INV-17: never headers, never bodies).
// api-version: 7.1, then 7.1-preview, then none, when ADO rejects the version (04 §2).
import { classify, NET_BODY_MAX, type NetError } from '@shared/contracts/neterror';
import { devlog } from '../devlog';
import { activity } from '../activity';
import type { AdoResponse, Transport } from '@shared/contracts/transport';

export type Family = 'org' | 'projects' | 'areas' | 'iterations' | 'teams' | 'wiql' | 'recent' | 'items' | 'history' | 'states' | 'repos' | 'prs' | 'review' | 'builds' | 'avatar';

export class AdoError extends Error {
  /** Everything needed to understand the failure (decided 2026-10-07); never request headers. */
  readonly detail: NetError;
  constructor(readonly family: Family, readonly status: number, readonly code?: string, detail?: Partial<NetError>) {
    super(`ADO ${family}: ${status === 0 ? 'no response' : `HTTP ${status}`}${code ? ` ${code}` : ''}`);
    this.detail = { family, method: 'GET', endpoint: '', status, attempts: 1, waitedMs: 0, body: '', at: Date.now(), ...(code ? { code } : {}), ...detail };
  }
}

/** Which of the client's WIQL templates a query is (src/main/sync/wiql.ts), for the dev log: never its text. */
function wiqlTemplate(body: unknown): string | undefined {
  const q = (body as { query?: unknown } | undefined)?.query;
  if (typeof q !== 'string') return undefined;
  if (/@Me/.test(q)) return 'myRecentWork';
  if (/MODE \(Recursive\)/.test(q)) return 'descendants';
  if (/MODE \(MustContain\)/.test(q)) return 'epicFeatures';
  if (/CONTAINS/.test(q)) return 'epicsByTitle';
  if (/IterationPath/.test(q)) return /EVER/.test(q) ? 'sprintItems-ever' : /ASOF/.test(q) ? 'sprintItems-asOf' : 'sprintItems';
  if (/UNDER/.test(q)) return /ASOF/.test(q) ? 'featuresUnder-asOf' : 'featuresUnder';
  return 'other';
}

/** The path and query of a request URL: no host, no credentials. */
const endpointOf = (url: string) => { try { const u = new URL(url); return `${u.pathname}${u.search}`; } catch { return url; } };
/** What a failed response says about itself, for the error details. */
function describe(family: Family, method: string, url: string, res: AdoResponse): NetError {
  const h = res.headers;
  const msg = (res.body as Json | null)?.message;
  const raw = res.text ?? (res.body === null || res.body === undefined ? '' : typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2));
  const rateLimit = {
    ...(h['x-ratelimit-remaining'] ? { remaining: h['x-ratelimit-remaining'] } : {}),
    ...(h['x-ratelimit-reset'] ? { reset: h['x-ratelimit-reset'] } : {}),
    ...(h['x-ratelimit-resource'] ? { resource: h['x-ratelimit-resource'] } : {}),
    ...(h['x-ratelimit-delay'] ? { delay: h['x-ratelimit-delay'] } : {}),
  };
  const code = errorCode(res);
  return {
    family, method, endpoint: endpointOf(url), status: res.status, attempts: res.attempts ?? 1, waitedMs: Math.round(res.waitedMs ?? 0),
    body: raw.length > NET_BODY_MAX ? `${raw.slice(0, NET_BODY_MAX)}\n… (${raw.length - NET_BODY_MAX} more characters)` : raw, at: Date.now(),
    ...(code ? { code } : {}), ...(typeof msg === 'string' ? { message: msg } : {}),
    ...(h['retry-after'] ? { retryAfter: h['retry-after'] } : {}), ...(Object.keys(rateLimit).length ? { rateLimit } : {}),
  };
}

const VERSIONS = ['7.1', '7.1-preview', null] as const;
type Json = Record<string, unknown>;
/** An api-version a call may insist on (null: none); otherwise the family's version is probed (04 §2). */
export type Version = (typeof VERSIONS)[number] | '7.1-preview.1';

const versionRejected = (r: AdoResponse) =>
  r.status === 400 && /api-version|VssVersionOutOfRange|VssInvalidPreviewVersion/i.test(JSON.stringify(r.body ?? ''));
const errorCode = (r: AdoResponse) => {
  const m = /\b(VS\d{6}|TF\d{6})\b/.exec(JSON.stringify(r.body ?? ''));
  return m?.[1];
};

export class AdoClient {
  /** The api-version that worked, per family (probe rows record it). */
  readonly versions = new Map<Family, Version>();
  readonly org: string;

  constructor(private readonly transport: Transport, orgUrl: string, private readonly signal?: AbortSignal) {
    this.org = orgUrl.replace(/\/+$/, '');
  }

  withSignal(signal: AbortSignal): AdoClient {
    const c = new AdoClient(this.transport, this.org, signal);
    for (const [k, v] of this.versions) c.versions.set(k, v);
    return c;
  }

  private url(path: string, params: Record<string, string | number | undefined>, version: Version): string {
    const u = new URL(path.startsWith('https://') ? path : `${this.org}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
    if (version) u.searchParams.set('api-version', version);
    return u.toString();
  }

  /** The raw response (the probe reads statuses); `call` throws on anything but 2xx. */
  async raw(family: Family, method: 'GET' | 'POST', path: string, params: Record<string, string | number | undefined> = {}, body?: unknown, binary = false, pin?: Version): Promise<AdoResponse> {
    return (await this.send(family, method, path, params, body, binary, pin)).res;
  }

  private async send(family: Family, method: 'GET' | 'POST', path: string, params: Record<string, string | number | undefined>, body?: unknown, binary = false, pin?: Version): Promise<{ res: AdoResponse; url: string }> {
    const known = this.versions.get(family);
    const order: readonly Version[] = pin !== undefined ? [pin] : known !== undefined ? [known] : VERSIONS;
    let res: AdoResponse | undefined;
    let last = '';
    for (const v of order) {
      const url = this.url(path, params, v);
      const t0 = Date.now();
      const callId = activity.nextId();
      devlog.write('main', 'net-start', { family, method, endpoint: url, template: wiqlTemplate(body) ?? null });
      activity.emit({ phase: 'start', id: callId, family, at: t0 });
      try {
        res = await this.transport.send({ method, url, body, binary, callId }, this.signal);
        devlog.write('main', 'net-end', { family, method, endpoint: url, status: res.status, ms: Date.now() - t0, attempts: res.attempts ?? 1, waitedMs: Math.round(res.waitedMs ?? 0) });
        if (res.status < 400 || versionRejected(res)) activity.emit({ phase: 'end', id: callId, family, at: Date.now(), status: res.status, ms: Date.now() - t0, attempts: res.attempts ?? 1 });
        else activity.emit({ phase: 'fail', id: callId, family, at: Date.now(), status: res.status, ms: Date.now() - t0, net: describe(family, method, url, res) });
      } catch (e) {
        // A cancelled call (we moved on: decided 2026-10-08) isn't a failure: it just ends.
        if (this.signal?.aborted) activity.emit({ phase: 'end', id: callId, family, at: Date.now(), status: 0, ms: Date.now() - t0, attempts: 0 });
        else activity.emit({ phase: 'fail', id: callId, family, at: Date.now(), status: 0, ms: Date.now() - t0 });
        devlog.write('main', 'net-error', { family, method, endpoint: url, ms: Date.now() - t0, errorClass: e instanceof Error ? e.name : 'unknown', outcome: this.signal?.aborted ? 'cancelled' : 'no-response' });
        if (this.signal?.aborted || (e instanceof Error && (e.name === 'AbortError' || /Refused/.test(e.message)))) throw e;
        // No response at all: offline, DNS, TLS, a reset connection.
        throw new AdoError(family, 0, undefined, { method, endpoint: endpointOf(url), message: e instanceof Error ? e.message : String(e), body: '' });
      }
      last = url;
      if (!versionRejected(res)) {
        if (res.status < 400 && pin === undefined) this.versions.set(family, v);
        return { res, url };
      }
    }
    return { res: res!, url: last };
  }

  async call(family: Family, method: 'GET' | 'POST', path: string, params: Record<string, string | number | undefined> = {}, body?: unknown): Promise<Json> {
    const { res, url } = await this.send(family, method, path, params, body);
    if (res.status < 200 || res.status >= 300) {
      const code = errorCode(res);
      devlog.write('main', 'net-fail', { family, method, endpoint: url, status: res.status, code, classification: classify({ status: res.status, code, family }).label });
      throw new AdoError(family, res.status, code, describe(family, method, url, res));
    }
    return (res.body ?? {}) as Json;
  }

  private list(j: Json): unknown[] {
    return Array.isArray(j.value) ? j.value : [];
  }

  private async paged(family: Family, path: string, top: number, skip0 = 0, params: Record<string, string | number | undefined> = {}): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let skip = skip0; ; skip += top) {
      const page = this.list(await this.call(family, 'GET', path, { ...params, $top: top, $skip: skip }));
      out.push(...page);
      if (page.length < top) return out;
    }
  }

  connectionData() { return this.call('org', 'GET', '/_apis/connectionData'); }
  async projects() { return this.paged('projects', '/_apis/projects', 100); }
  areas(project: string, depth = 10) { return this.call('areas', 'GET', `/${encodeURIComponent(project)}/_apis/wit/classificationnodes/Areas`, { $depth: depth }); }
  /** The project's iteration tree, with each sprint's start and finish dates (decided 2026-10-07). */
  iterations(project: string, depth = 10) { return this.call('iterations', 'GET', `/${encodeURIComponent(project)}/_apis/wit/classificationnodes/Iterations`, { $depth: depth }); }
  /**
   * Teams and their cadences (slice 7, decided 2026-10-10): a project's teams, which Area Paths each
   * owns (its team field values), and which iterations it runs (its sprint list).
   */
  async teams(projectId: string) { return this.paged('teams', `/_apis/projects/${encodeURIComponent(projectId)}/teams`, 100); }
  teamFieldValues(project: string, team: string) { return this.call('teams', 'GET', `/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamfieldvalues`); }
  async teamIterations(project: string, team: string) { return this.list(await this.call('teams', 'GET', `/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations`)); }
  /**
   * A team's backlog levels (B4, 04 §3 boards): `[{ id, name, type, … }]`; the requirement level (`Microsoft.RequirementCategory`)
   * names the Stories board whatever the process calls it. And one board's columns, by its level's name. Both read under
   * the `teams` family: a 401 there is a token without the scope, quiet like the team's settings.
   */
  async teamBacklogs(project: string, team: string) { const j = await this.call('teams', 'GET', `/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/backlogs`); return Array.isArray(j) ? j as unknown[] : this.list(j); }
  teamBoardColumns(project: string, team: string, board: string) { return this.call('teams', 'GET', `/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(board)}/columns`); }
  wiql(project: string, query: string, top?: number) {
    return this.call('wiql', 'POST', `/${encodeURIComponent(project)}/_apis/wit/wiql`, { $top: top }, { query });
  }
  /** WIQL across the whole org (no project in the path). */
  wiqlOrg(query: string, top?: number) {
    return this.call('wiql', 'POST', '/_apis/wit/wiql', { $top: top }, { query });
  }
  /** Just some fields, at most 200 IDs per call (`fields` can't be combined with `$expand`). */
  async workItemFields(ids: number[], fields: string[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const j = await this.call('items', 'POST', '/_apis/wit/workitemsbatch', {}, { ids: ids.slice(i, i + 200), fields, errorPolicy: 'Omit' });
      out.push(...this.list(j));
    }
    return out;
  }
  /** At most 200 IDs per call (04 §3); a missing or forbidden ID comes back as null (errorPolicy Omit). */
  async workItems(ids: number[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const j = await this.call('items', 'POST', '/_apis/wit/workitemsbatch', {}, { ids: ids.slice(i, i + 200), $expand: 'Relations', errorPolicy: 'Omit' });
      out.push(...this.list(j));
    }
    return out;
  }
  revisions(id: number, skip = 0) { return this.paged('history', `/_apis/wit/workItems/${id}/revisions`, 200, skip); }
  updates(id: number, skip = 0) { return this.paged('history', `/_apis/wit/workItems/${id}/updates`, 200, skip); }
  /**
   * One page of the project-wide revisions feed (B5, 04 §5c): `{ values, continuationToken, isLastBatch }`. Needs only the
   * Work items (read) scope, so a 401 is a dead token like the per-item history calls.
   */
  revisionFeed(project: string, q: { fields: readonly string[]; startDateTime?: string; continuationToken?: string; pageSize?: number }) {
    return this.call('history', 'GET', `/${encodeURIComponent(project)}/_apis/wit/reporting/workitemrevisions`, {
      fields: q.fields.join(','), includeLatestOnly: 'false', includeIdentityRef: 'true', $maxPageSize: q.pageSize,
      ...(q.continuationToken ? { continuationToken: q.continuationToken } : q.startDateTime ? { startDateTime: q.startDateTime } : {}),
    });
  }
  states(project: string, type: string) { return this.call('states', 'GET', `/${encodeURIComponent(project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`); }
  async repos(project: string) { return this.list(await this.call('repos', 'GET', `/${encodeURIComponent(project)}/_apis/git/repositories`)); }
  pullRequest(repoId: string, prId: number) { return this.call('prs', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}`); }
  /** 04 §3's reconcile: every parameter carries the `searchCriteria.` prefix. */
  pullRequests(project: string, criteria: Record<string, string>, top = 100) {
    const params = Object.fromEntries(Object.entries(criteria).map(([k, v]) => [`searchCriteria.${k}`, v]));
    return this.paged('prs', `/${encodeURIComponent(project)}/_apis/git/pullrequests`, top, 0, params);
  }
  async prWorkItems(repoId: string, prId: number) { return this.list(await this.call('prs', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/workitems`)); }
  async reviewers(repoId: string, prId: number) { return this.list(await this.call('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/reviewers`)); }
  async threads(repoId: string, prId: number) { return this.list(await this.call('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads`)); }
  /** A PR's iterations (one per push), oldest first (B1, 04 §6a-1). */
  async prIterations(repoId: string, prId: number) { return this.list(await this.call('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/iterations`)); }
  /**
   * The repository's latest build on one branch (B2, 04 §3), newest queued first, one row at most. `[]`: no pipeline
   * has run there (or none builds this repository). Needs the Build (read) scope: without it ADO answers 401/403.
   */
  async latestBuild(project: string, repoId: string, branch: string) {
    return this.list(await this.call('builds', 'GET', `/${encodeURIComponent(project)}/_apis/build/builds`, {
      repositoryId: repoId, repositoryType: 'TfsGit', branchName: branch, $top: 1, queryOrder: 'queueTimeDescending',
    }));
  }
  /** One iteration's changes, one page: `changeEntries` and `nextSkip` (0 at the end). Read by `readPrStats`. */
  prChanges(repoId: string, prId: number, iteration: number, skip: number, top: number) {
    return this.call('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/iterations/${iteration}/changes`, { $top: top, $skip: skip });
  }
  /**
   * One picture request, answered raw: the strategies (src/main/avatars/strategies.ts) read the status
   * and body themselves, because what a 401 or a 404 means depends on the strategy. `pin` fixes the
   * api-version (Graph's avatar call is preview-only).
   */
  avatarRaw(url: string, opts: { binary: boolean; version?: Version }): Promise<AdoResponse> {
    return this.raw('avatar', 'GET', url, {}, undefined, opts.binary, opts.version);
  }
}
