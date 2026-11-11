// Slice 4 unit checks: AC-26 (the probe matrix), AC-28 (overlapping syncs), AC-29 (event times), plus
// the transport's allowlist and backoff, and the parsers.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import type { AdoRequest, AdoResponse } from '@shared/contracts/transport';
import { deriveHistory } from '@shared/ingest/derive';
import { reconcileFavorites } from '@shared/ingest/favorites';
import { approversAt, parseRelation, parseUpdate, PR_ARTIFACT_RE } from '@shared/ingest/parse';
import { AdoClient } from '../../src/main/ado/client';
import { allowlist, HttpTransport, retryDelay } from '../../src/main/ado/http';
import { runProbe } from '../../src/main/ado/probe';
import { normalizeOrgUrl } from '../../src/main/ado/service';
import { factsFor } from '../../src/main/sync/sync';
import { harness, ingest, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

const orbit = scenarios[0]!;
const comet = { project: 'Nimbus Deck', area: 'Nimbus Deck\\Comet Crew' };
const res = (status: number, body: unknown = { message: 'x' }, headers: Record<string, string> = {}): AdoResponse => ({ status, headers, body });

describe('AC-26: the probe matrix', () => {
  const probeWith = async (intercept: (r: AdoRequest) => AdoResponse | undefined) => {
    const h = await harness(orbit);
    h.transport.intercept = intercept;
    return runProbe(h.client, mapping, h.clock);
  };
  const statusOf = (m: Awaited<ReturnType<typeof runProbe>>, family: string) => m.rows.find((r) => r.family === family)?.status;

  it('reads every family as ok against a healthy org', async () => {
    const m = await probeWith(() => undefined);
    expect(m.orgKey).toBe('00000000-0000-4000-8000-000000000001');
    for (const f of ['org', 'projects', 'areas', 'wiql', 'history', 'states', 'repos', 'builds', 'prs', 'review']) expect(statusOf(m, f), f).toBe('ok');
    expect(m.rows.find((r) => r.endpoint.endsWith('/updates'))?.note).toMatch(/Timestamp rule: \d+ updates dated by their own ChangedDate, \d+ by their revision, 0 undated/);
  });
  it('403 on builds names the Build scope, and leaves the rest ok', async () => {
    const m = await probeWith((r) => (/\/build\/builds/.test(r.url) ? res(403) : undefined));
    expect(statusOf(m, 'builds')).toBe('403');
    expect(m.rows.find((r) => r.family === 'builds')!.note).toMatch(/Build \(read\)/);
    expect(statusOf(m, 'prs')).toBe('ok');
  });
  it('401 is an expired token, and stops there', async () => {
    const m = await probeWith(() => res(401));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ family: 'org', status: '401' });
    expect(m.rows[0]!.note).toMatch(/expired or invalid/);
  });
  it('403 on repos and PRs is a denial, with the Basic-license hint', async () => {
    const m = await probeWith((r) => (/\/git\//.test(r.url) ? res(403) : undefined));
    expect(statusOf(m, 'repos')).toBe('403');
    expect(statusOf(m, 'prs')).toBe('403');
    expect(m.rows.find((r) => r.family === 'repos')!.note).toMatch(/Basic access/);
    expect(statusOf(m, 'wiql')).toBe('ok');
  });
  it('404, 429, and empty results are told apart', async () => {
    const m = await probeWith((r) => {
      if (/classificationnodes/.test(r.url)) return res(404);
      if (/workitemtypes\/Bug\//.test(r.url)) return res(429, null, { 'retry-after': '0' });
      if (/\/wiql/.test(r.url)) return res(200, { workItems: [] });
      return undefined;
    });
    expect(statusOf(m, 'areas')).toBe('404');
    expect(m.rows.find((r) => r.endpoint.includes('/Bug/'))!.status).toBe('429');
    expect(statusOf(m, 'wiql')).toBe('empty');
    expect(m.rows.find((r) => r.family === 'history')).toMatchObject({ status: 'empty' });
  });
  it('a rejected api-version falls back to 7.1-preview, then none, and records which worked', async () => {
    const h = await harness(orbit);
    h.transport.intercept = (r) => (/connectionData/.test(r.url) && !/api-version=7\.1-preview/.test(r.url) && /api-version/.test(r.url) ? res(400, { message: 'The requested REST API version of 7.1 is out of range (VssVersionOutOfRangeException)' }) : undefined);
    const m = await runProbe(h.client, mapping, h.clock);
    expect(m.rows[0]).toMatchObject({ family: 'org', status: 'ok', apiVersion: '7.1-preview' });
  });
});

describe('AC-28: overlapping syncs are idempotent (INV-13)', () => {
  it('a second sync of the same scope, and an overlapping one, give identical event keys and counts', async () => {
    const h = await harness(orbit);
    await ingest(h, orbit, comet);
    const keys1 = h.cache.eventKeys('00000000-0000-4000-8000-000000000001');
    const counts1 = [h.cache.count('events'), h.cache.count('links'), h.cache.count('observations'), h.cache.count('wi_revisions'), h.cache.count('wi_updates')];
    await ingest(h, orbit, comet);
    await ingest(h, orbit, { project: 'Nimbus Deck', epic: 51 }); // shares Features with Comet Crew
    await ingest(h, orbit, comet);
    const keys2 = h.cache.eventKeys('00000000-0000-4000-8000-000000000001');
    expect(keys2.filter((k) => keys1.includes(k))).toEqual(keys1);
    const again = await ingest(h, orbit, comet);
    expect(new Set(again.events.map((e) => e.eventKey)).size).toBe(again.events.length);
    expect([h.cache.count('events') >= counts1[0]!, h.cache.count('wi_revisions'), h.cache.count('wi_updates')]).toEqual([true, counts1[3], counts1[4]]);
    // A fresh DB ingesting the same facts gives the same bundle.
    const fresh = await harness(orbit);
    expect(await ingest(fresh, orbit, comet)).toEqual(again);
  });
  it('a resync fetches only pages after the checkpoints', async () => {
    const h = await harness(orbit);
    await ingest(h, orbit, comet);
    h.transport.log.length = 0;
    await ingest(h, orbit, comet);
    const skips = h.transport.log.filter((r) => /\/(revisions|updates)\?/.test(r.url)).map((r) => Number(new URL(r.url).searchParams.get('$skip')));
    expect(skips.length).toBeGreaterThan(0);
    expect(skips.every((s) => s > 0)).toBe(true);
  });
});

describe('AC-29: event times (04 §4)', () => {
  const update = (extra: Record<string, unknown>) => ({ id: 3, rev: 3, revisedDate: '9999-01-01T00:00:00Z', ...extra });
  const parentRel = { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/o/_apis/wit/workItems/7', attributes: { name: 'Parent' } };
  it('never reads revisedDate', () => {
    expect(parseUpdate(update({ relations: { added: [parentRel] } }), 9)!.sourceAt).toBeNull();
    expect(parseUpdate(update({ fields: { 'System.ChangedDate': { newValue: '2026-09-02T10:00:00Z' } } }), 9)!.sourceAt).toBe(Date.parse('2026-09-02T10:00:00Z'));
  });
  it('a relation-only update takes its matching revision’s time; without one, it is undated', async () => {
    const h = await harness(orbit);
    await ingest(h, orbit, comet);
    const facts = factsFor({ cache: h.cache, mapping, clock: h.clock }, syncScopeOf(orbit, comet), orbit.range);
    const [id, ups] = [...facts.updates].find(([, u]) => u.some((x) => x.sourceAt === null && x.added.some((r) => r.rel === 'parent')))!;
    const relOnly = ups.find((x) => x.sourceAt === null && x.added.some((r) => r.rel === 'parent'))!;
    const rev = facts.revisions.get(id)!.find((r) => r.rev === relOnly.rev)!;
    const h1 = deriveHistory(facts);
    const ev = h1.events.find((e) => e.eventKey.startsWith(`link_parent_added:wi:00000000-0000-4000-8000-000000000001:${id}:u${relOnly.updateId}:`));
    expect(ev?.occurredAt).toBe(rev.changedAt);
    // Drop the revision: the same update is now undated, so an Observation, never an event (INV-02).
    const revisions = new Map(facts.revisions);
    revisions.set(id, facts.revisions.get(id)!.filter((r) => r.rev !== relOnly.rev));
    const h2 = deriveHistory({ ...facts, revisions });
    expect(h2.events.some((e) => e.eventKey.includes(`:u${relOnly.updateId}:`) && e.entityKey.endsWith(`:${id}`))).toBe(false);
  });
});

describe('parsers', () => {
  it('reads PR artifact links with either separator, and only with the exact name', () => {
    const url = 'vstfs:///Git/PullRequestId/AAAAAAAA-0000-4000-8000-000000000001%2Fbbbbbbbb-0000-4000-8000-000000000002%2F42';
    expect(PR_ARTIFACT_RE.test(url.replace(/%2F/g, '/'))).toBe(true);
    expect(parseRelation({ rel: 'ArtifactLink', url, attributes: { name: 'Pull Request' } })).toEqual({
      rel: 'pr', rawRel: 'ArtifactLink', target: { kind: 'pr', projectId: 'aaaaaaaa-0000-4000-8000-000000000001', repoId: 'bbbbbbbb-0000-4000-8000-000000000002', prId: 42 },
    });
    expect(parseRelation({ rel: 'ArtifactLink', url, attributes: { name: 'pull request' } })!.rel).toBe('other');
    expect(parseRelation({ rel: 'ArtifactLink', url: 'vstfs:///Git/Commit/x', attributes: { name: 'Fixed in Commit' } })!.rel).toBe('other');
  });
  it('approvers: thread votes up to completion win over final votes; no threads falls back', () => {
    const a = 'aaaaaaaa-0000-4000-8000-000000000001';
    const b = 'bbbbbbbb-0000-4000-8000-000000000002';
    const reviewers = [{ id: a, displayName: 'A', vote: 10 }, { id: b, displayName: 'B', vote: 0 }, { id: 'cccccccc-0000-4000-8000-000000000003', displayName: 'Group', vote: 10, isContainer: true }];
    const vote = (who: string, v: number, at: string) => ({ publishedDate: at, properties: { CodeReviewThreadType: { $value: 'VoteUpdate' }, CodeReviewVoteResult: { $value: String(v) }, CodeReviewVotedByTfId: { $value: who } } });
    const closed = Date.parse('2026-09-10T12:00:00Z');
    expect(approversAt(reviewers, [vote(b, 10, '2026-09-10T11:00:00Z'), vote(a, 10, '2026-09-10T10:00:00Z'), vote(a, 0, '2026-09-10T13:00:00Z')], closed)).toEqual({ approvers: [a, b], fromThreads: true });
    expect(approversAt(reviewers, null, closed)).toEqual({ approvers: [a], fromThreads: false });
  });
});

describe('HttpTransport (04 §§1, 6)', () => {
  it('only calls the org’s own origin and path', () => {
    const ok = allowlist('https://dev.azure.com/contoso');
    expect(ok('https://dev.azure.com/contoso/_apis/projects')).toBe(true);
    expect(ok('https://dev.azure.com/contoso-evil/_apis/projects')).toBe(false);
    expect(ok('https://evil.example/contoso/_apis')).toBe(false);
    expect(ok('http://dev.azure.com/contoso/_apis')).toBe(false);
  });
  it('honors Retry-After, else backs off with full jitter capped at 60 s', () => {
    expect(retryDelay(0, '7', () => 0.5)).toBe(7000);
    expect(retryDelay(3, undefined, () => 1)).toBe(8000);
    expect(retryDelay(20, undefined, () => 1)).toBe(60_000);
    expect(retryDelay(2, undefined, () => 0.25)).toBe(1000);
  });
  it('retries a 429, keeps at most 4 requests in flight, and never sends without a PAT', async () => {
    let live = 0;
    let peak = 0;
    let calls = 0;
    const waits: number[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      const n = ++calls;
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(':canary').toString('base64')}`);
      return n === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : new Response('{"value":[]}', { status: 200 });
    }) as unknown as typeof fetch;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => 'canary', fetch: fetchFn, sleep: async (ms) => { waits.push(ms); } });
    const client = new AdoClient(t, 'https://dev.azure.com/contoso');
    await Promise.all(Array.from({ length: 10 }, () => client.call('projects', 'GET', '/_apis/projects')));
    expect(waits[0]).toBe(2000);
    expect(peak).toBeLessThanOrEqual(4);
    const none = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => null, fetch: fetchFn });
    expect((await none.send({ method: 'GET', url: 'https://dev.azure.com/contoso/_apis/projects' })).status).toBe(401);
    await expect(t.send({ method: 'GET', url: 'https://elsewhere.example/x' })).rejects.toThrow(/Refused/);
  });
});

describe('AC-32 (U): favorites are keyed by node ID', () => {
  const fav = (nodeId: number, path: string, label = path.split('\\').pop()!) => ({ projectId: 'p', nodeId, path, label, displayOrder: 0, unavailable: false });
  const node = (nodeId: number, path: string) => ({ projectId: 'p', nodeId, path, hasChildren: false });
  it('a renamed area keeps its favorite; a vanished one is unavailable; a returning one recovers', () => {
    const out = reconcileFavorites([fav(1, 'P\\Old name'), fav(2, 'P\\Gone'), { ...fav(3, 'P\\Mine', 'My label') }, { ...fav(4, 'P\\Back'), unavailable: true }],
      [node(1, 'P\\New name'), node(3, 'P\\Mine renamed'), node(4, 'P\\Back')]);
    expect(out.map((f) => [f.nodeId, f.path, f.label, f.unavailable])).toEqual([
      [1, 'P\\New name', 'New name', false],
      [2, 'P\\Gone', 'Gone', true],
      [3, 'P\\Mine renamed', 'My label', false],
      [4, 'P\\Back', 'Back', false],
    ]);
  });
});

describe('org URLs (03 §6)', () => {
  it('accepts only https://dev.azure.com/{org}', () => {
    expect(normalizeOrgUrl('https://dev.azure.com/contoso/')).toBe('https://dev.azure.com/contoso');
    expect(normalizeOrgUrl(' https://dev.azure.com/contoso ')).toBe('https://dev.azure.com/contoso');
    for (const bad of ['http://dev.azure.com/contoso', 'https://evil.example/contoso', 'https://dev.azure.com/contoso/project', 'https://user@dev.azure.com/contoso', 'https://dev.azure.com/', 'not a url']) {
      expect(normalizeOrgUrl(bad), bad).toBeNull();
    }
  });
});

describe('network errors explained (decided 2026-10-07)', () => {
  it('classifies statuses in plain words', async () => {
    const { classify } = await import('@shared/contracts/neterror');
    expect(classify({ status: 429, family: 'history' }).label).toMatch(/Throttled/);
    expect(classify({ status: 200, code: 'TF400733', family: 'history' }).label).toMatch(/Throttled/);
    expect(classify({ status: 403, family: 'repos' }).meaning).toMatch(/Basic access/);
    expect(classify({ status: 0, family: 'org' }).label).toBe('Network');
    expect(classify({ status: 502, family: 'items' }).label).toMatch(/Server error/);
  });
  it('a throttled call that gives up carries its status, attempts, wait, headers, and literal body; never the PAT', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return new Response(JSON.stringify({ message: 'Request was blocked due to exceeding usage of resource', typeKey: 'ThrottlingException' }),
        { status: 429, headers: { 'Retry-After': '3', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Resource': 'ATCPU' } });
    }) as unknown as typeof fetch;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => 'canary-secret', fetch: fetchFn, sleep: async () => {}, maxRetries: 2 });
    const client = new AdoClient(t, 'https://dev.azure.com/contoso');
    const err = await client.call('history', 'GET', '/_apis/wit/workItems/7/updates').catch((e) => e);
    expect(err.detail).toMatchObject({ status: 429, family: 'history', method: 'GET', attempts: 3, waitedMs: 6000, retryAfter: '3', message: expect.stringMatching(/blocked/) });
    expect(err.detail.endpoint).toMatch(/^\/contoso\/_apis\/wit\/workItems\/7\/updates\?api-version=7\.1$/);
    expect(err.detail.rateLimit).toEqual({ remaining: '0', resource: 'ATCPU' });
    expect(err.detail.body).toContain('ThrottlingException');
    expect(JSON.stringify(err.detail)).not.toContain('canary-secret');
    expect(n).toBe(3);
  });
  it('an unreachable org is a status-0 error, and details survive the trip across IPC', async () => {
    const { decodeNetError, encodeNetError } = await import('@shared/contracts/neterror');
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => 'x', fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch, sleep: async () => {} }); // no response is retried (slice 7): don't wait for real
    const err = await new AdoClient(t, 'https://dev.azure.com/contoso').call('org', 'GET', '/_apis/connectionData').catch((e) => e);
    expect(err.detail).toMatchObject({ status: 0, message: 'fetch failed' });
    const wire = `Error invoking remote method 'x': Error: ${encodeNetError(err.message, err.detail)}`;
    expect(decodeNetError(wire)).toEqual({ message: err.message, net: err.detail });
  });
});

describe('missing PRs and repos still sync (slice 7: listed in coverage, see slice7.test.ts)', () => {
  it('a 404 on a repo’s PR list (TF401019) or on one PR still syncs; a PR never read isn’t drawn', async () => {
    const h = await harness(orbit);
    const gone = { status: 404, headers: {}, body: { message: 'TF401019: The Git repository with name or identifier X does not exist or you do not have permissions for the operation you are attempting.' } };
    h.transport.intercept = (r) => (/\/_apis\/git\/pullrequests\?/.test(r.url) || /pullRequests\/9002(\?|$)/.test(r.url) ? gone : undefined);
    const got = await ingest(h, orbit, comet);
    expect(got.events.some((e) => e.entityKey.endsWith(':9002'))).toBe(false);
    expect(got.events.some((e) => e.kind === 'pr_opened')).toBe(true); // the other PRs are still there
    expect(got.unlinkedPrs).toEqual([]);
  });
});

describe('the 20,000-result cap (decided 2026-10-07)', () => {
  it('a team whose Feature query trips the cap narrows by date and still loads', async () => {
    // Comet Crew has 6 Features; the fake answers VS402337 over 3, as ADO does over 20,000.
    const { Cache } = await import('../../src/main/db/cache');
    const h = await harness(orbit, Cache.open(':memory:'), { wiqlCap: 3 });
    const got = await ingest(h, orbit, comet);
    const narrowed = h.transport.log.filter((r) => /\/_apis\/wit\/wiql/.test(r.url) && /@Today - \d+/.test(String((r.body as { query?: string })?.query)));
    expect(narrowed.length).toBeGreaterThan(0);
    expect(got.entities.workItems.length).toBeGreaterThan(0);
    expect(got.coverage.notes.join(' ')).toMatch(/most recently changed Features|too large/);
  });
  it('every Feature query is newest first and bounded with $top', async () => {
    const h = await harness(orbit);
    await ingest(h, orbit, comet);
    const featureQueries = h.transport.log.filter((r) => /\/_apis\/wit\/wiql/.test(r.url) && /WorkItemType\] = 'Feature' AND \[System\.AreaPath\]/.test(String((r.body as { query?: string })?.query)));
    expect(featureQueries.length).toBeGreaterThan(0);
    for (const r of featureQueries) {
      expect(String((r.body as { query?: string }).query)).toMatch(/ORDER BY \[System\.ChangedDate\] DESC/);
      expect(new URL(r.url).searchParams.get('$top')).toBe('200');
    }
  });
});
