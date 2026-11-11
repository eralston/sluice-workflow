// Slice 7 (decided 2026-10-10): what a failure does, retries for failures that may pass, PRs that
// can't be read kept from their last known record and listed, and cache repair. On sprint-mechanics,
// through the fake ADO; the HTTP transport with a fake fetch and the canary token only (INV-17).
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import sprintGaps from '@fixtures/scenarios/sprint-gaps';
import { guidFromName, scenarioKeys, sprintScopes, toHistory, FIXTURE_ORG } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { parseTeam, podsBySprint, teamOfArea, type TeamFacts } from '@shared/teams';
import { podItemsEver, sprintItemsEver } from '../../src/main/sync/wiql';
import { failureTier } from '@shared/contracts/neterror';
import { AdoClient } from '../../src/main/ado/client';
import { HttpTransport, TRANSIENT_RETRIES } from '../../src/main/ado/http';
import { Cache } from '../../src/main/db/cache';
import { history, loadLevelHistory } from '../../src/main/sync/levels';
import { mergeMissing, Unreadable } from '../../src/main/sync/missing';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { isGone, scopeKeyOf } from '../../src/main/sync/sync';
import { comparable, harness, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
const range = toHistory(sprintMechanics, mapping, scope).range;
const k = scenarioKeys(sprintMechanics);
const PR = k.pr(9501);

describe('what a failure does (failureTier)', () => {
  it('401 stops; 403/404/410 are one thing gone; no response, 408, 429 and 5xx may pass; the rest is an error', () => {
    expect(failureTier(401)).toBe('stop');
    for (const s of [403, 404, 410]) expect(failureTier(s)).toBe('gone');
    for (const s of [0, 408, 429, 500, 502, 503, 504]) expect(failureTier(s)).toBe('transient');
    for (const s of [400, 409, 412]) expect(failureTier(s)).toBe('error');
  });
});

describe('retries for failures that may pass (http.ts)', () => {
  const transport = (answers: (() => Response)[]) => {
    let i = 0;
    const fetchFn = (async () => {
      const a = answers[Math.min(i++, answers.length - 1)]!;
      return a();
    }) as unknown as typeof fetch;
    const t = new HttpTransport({ orgUrl: 'https://dev.azure.com/contoso', pat: () => CANARY, fetch: fetchFn, sleep: async () => {}, random: () => 0 });
    return { client: new AdoClient(t, 'https://dev.azure.com/contoso'), calls: () => i };
  };
  const ok = () => new Response('{"value":[]}', { status: 200 });
  const bad = () => new Response('{}', { status: 502 });
  const drop = () => { throw new TypeError('fetch failed'); };

  it('a 502 then a 200 succeeds', async () => {
    const t = transport([bad, ok]);
    await t.client.call('projects', 'GET', '/_apis/projects');
    expect(t.calls()).toBe(2);
  });

  it('a dropped connection is retried too', async () => {
    const t = transport([drop, drop, ok]);
    await t.client.call('projects', 'GET', '/_apis/projects');
    expect(t.calls()).toBe(3);
  });

  it('after the retries it fails, and that failure counts as one thing that can’t be read now', async () => {
    const t = transport([bad]);
    const e = await t.client.call('projects', 'GET', '/_apis/projects').catch((x: unknown) => x);
    expect(t.calls()).toBe(TRANSIENT_RETRIES + 1);
    expect(isGone(e)).toBe(true);
  });

  it('a 400 is never retried or hidden', async () => {
    const t = transport([() => new Response('{}', { status: 400 })]);
    const e = await t.client.call('projects', 'GET', '/_apis/projects').catch((x: unknown) => x);
    expect(t.calls()).toBe(1);
    expect(isGone(e)).toBe(false);
  });
});

describe('a PR that can’t be read: last known, stale, listed, asked again (02 §3)', () => {
  async function open(cache = Cache.open(':memory:')) {
    const h = await harness(sprintMechanics, cache);
    const sync = syncScopeOf(sprintMechanics, scope);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    return { h, ctx, sync, stream: new SprintStream(ctx, sync, { changed: () => {} }), bundle: () => loadLevelHistory(ctx, sync, range), cp: () => h.cache.scopeCheckpoint(FIXTURE_ORG, scopeKeyOf(sync)) };
  }
  const deny = (url: string) => /pullRequests\/9501(\?|$)/.test(url);

  it('seen before: still drawn from its last known record, marked stale, and listed; the next refresh clears it', async () => {
    const o = await open();
    await o.stream.look();
    await o.stream.fill();
    expect(o.bundle().entities.prs.some((p) => p.key === PR)).toBe(true);
    o.h.transport.intercept = (req) => (deny(req.url) ? { status: 403, headers: {}, body: { message: 'forbidden (test)' } } : undefined);
    await o.stream.refresh();
    await o.stream.fill();
    const after = o.bundle();
    expect(after.entities.prs.some((p) => p.key === PR)).toBe(true); // last known, kept
    expect(after.coverage.stale).toContain(PR);
    expect(after.coverage.missing).toEqual([{ kind: 'pr', key: PR, status: 403, seen: true }]);
    expect(after.coverage.partial).toBe(true);
    expect(after.coverage.notes.some((n) => /1 pull request couldn’t be read/.test(n))).toBe(true);
    // ADO answers again: the list, the stale mark and the note go.
    o.h.transport.intercept = null;
    await o.stream.refresh();
    await o.stream.fill();
    const back = o.bundle();
    expect(back.coverage.missing).toBeUndefined();
    expect(back.coverage.stale ?? []).not.toContain(PR);
    expect(back.coverage.notes.some((n) => /couldn’t be read; (it is|they are) asked/.test(n))).toBe(false);
  });

  it('never seen: only listed, and not on the chart', async () => {
    const o = await open();
    o.h.transport.intercept = (req) => (deny(req.url) ? { status: 404, headers: {}, body: { message: 'gone (test)' } } : undefined);
    await o.stream.look();
    await o.stream.fill();
    const b = o.bundle();
    expect(b.entities.prs.some((p) => p.key === PR)).toBe(false);
    expect(b.coverage.missing).toEqual([{ kind: 'pr', key: PR, status: 404, seen: false }]);
    expect(b.coverage.stale ?? []).not.toContain(PR);
  });

  it('merging keeps what wasn’t asked about, and drops what was answered', () => {
    const cache = Cache.open(':memory:');
    const u = new Unreadable(cache, FIXTURE_ORG);
    const a = { kind: 'pr' as const, key: `pr:${FIXTURE_ORG}:r1:1` as never, status: 403, seen: true };
    const b = { kind: 'pr' as const, key: `pr:${FIXTURE_ORG}:r1:2` as never, status: 404, seen: false };
    u.found(a.key);
    const merged = mergeMissing({ partial: true, notes: ['2 pull requests couldn’t be read; they are asked for again on the next sync.'], stale: [a.key], missing: [a, b] }, u);
    expect(merged.missing).toEqual([b]);
    expect(merged.stale).toBeUndefined();
    expect(merged.notes).toEqual(['1 pull request couldn’t be read; it is asked for again on the next sync.']);
    expect(merged.partial).toBe(true);
  });
});

describe('cache repair (slice 7)', () => {
  it('a 404 on a rescan forgets the item; a 403 keeps its last known facts', async () => {
    const h = await harness(sprintMechanics);
    const sync = syncScopeOf(sprintMechanics, scope);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    const s = new SprintStream(ctx, sync, { changed: () => {} });
    await s.look();
    await s.fill();
    const id = Number(k.wi(9104).split(':').pop());
    const other = Number(k.wi(9103).split(':').pop());
    expect(h.cache.revisions(FIXTURE_ORG, [id, other]).size).toBe(2);
    h.transport.intercept = (req) => {
      if (new RegExp(`workItems/${id}/`).test(req.url)) return { status: 404, headers: {}, body: { message: 'deleted (test)' } };
      if (new RegExp(`workItems/${other}/`).test(req.url)) return { status: 403, headers: {}, body: { message: 'forbidden (test)' } };
      return undefined;
    };
    await history(ctx, sync, [id, other], () => {}, undefined, { rescan: true });
    expect(h.cache.revisions(FIXTURE_ORG, [id]).size).toBe(0); // gone for good
    expect(h.cache.scopeMembers(FIXTURE_ORG, scopeKeyOf(sync))).not.toContain(id);
    expect(h.cache.revisions(FIXTURE_ORG, [other]).size).toBe(1); // a 403 keeps what we knew
  });
});

describe('sprint coverage (slice 7): child iterations, the double leaver, team cadences', () => {
  const gk = scenarioKeys(sprintGaps);
  const S7 = 'Lyra Station\\Sprint 7';
  const gscope = { project: 'Lyra Station', sprint: S7, pods: ['Lyra Station\\Orbit Pod'] };
  async function streamed() {
    const h = await harness(sprintGaps);
    const sync = syncScopeOf(sprintGaps, gscope);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    const s = new SprintStream(ctx, sync, { changed: () => {} });
    await s.look();
    await s.fill();
    const grange = toHistory(sprintGaps, mapping, gscope).range;
    return { h, sync, bundle: () => loadLevelHistory(ctx, sync, grange) };
  }

  it('a Story in a child iteration ("Sprint 7\\Hardening") is in Sprint 7, and on its pod', async () => {
    const { bundle } = await streamed();
    const b = bundle();
    expect(b.entities.workItems.some((w) => w.key === gk.wi(7602))).toBe(true);
    const pod = projectScene(b, snapshotAt(b, b.range.endUtc - 1, 'knownThen'), SPRINTS.format({ level: 'pod', key: gk.area('Lyra Station\\Orbit Pod') }) as never, LAYOUT_VERSION, SPRINTS);
    expect(pod.nodes.some((n) => n.canonicalKey === gk.wi(7602) && n.selectable)).toBe(true);
  });

  it('the per-pod EVER finds a Story that has left both the sprint and the pod', async () => {
    const { h, bundle } = await streamed();
    const pid = sprintGaps.projects[0]!.name;
    const found = await h.client.wiql(pid, podItemsEver([S7, 'Lyra Station\\Sprint 7\\Hardening'], ['Lyra Station\\Orbit Pod']), 100);
    expect((found.workItems as { id: number }[]).map((w) => w.id)).toContain(Number(gk.wi(7603).split(':').pop()));
    // And the sprint-wide one alone can't (its pod clause is present-tense): that's why the second exists.
    const plain = await h.client.wiql(pid, sprintItemsEver([S7], ['Lyra Station\\Orbit Pod']), 100);
    expect((plain.workItems as { id: number }[]).map((w) => w.id)).not.toContain(Number(gk.wi(7603).split(':').pop()));
    expect(bundle().coverage.history).toContain(gk.wi(7603)); // its history is read, so it departs on playback
  });

  it('streamed, the sprint is what the scenario says it is (AC-27)', async () => {
    const { bundle } = await streamed();
    const strip = (x: ScopeHistory) => {
      const c = comparable(x) as { current?: unknown; coverage: Record<string, unknown> };
      delete c.current;
      for (const f of ['history', 'explored', 'more', 'played', 'stale']) delete c.coverage[f];
      return c;
    };
    expect(strip(bundle())).toEqual(strip(toHistory(sprintGaps, mapping, gscope)));
  });

  it('each pod gets its own team’s sprints', async () => {
    const h = await harness(sprintGaps);
    const pid = guidFromName('project', 'Lyra Station');
    const teams = [];
    for (const t of await h.client.teams(pid)) {
      const id = (t as { id: string }).id;
      teams.push(parseTeam(t, await h.client.teamFieldValues(pid, id), await h.client.teamIterations(pid, id))!);
    }
    const pods = [{ areaKey: 'orbit', path: 'Lyra Station\\Orbit Pod' }, { areaKey: 'relay', path: 'Lyra Station\\Relay Pod' }];
    const by = podsBySprint(teams, pods, [S7, 'Lyra Station\\Sprint 8', 'Lyra Station\\Relay 3']);
    expect(by.get(S7)).toEqual(['orbit']);
    expect(by.get('Lyra Station\\Relay 3')).toEqual(['relay']);
    // No team data: every pod runs every sprint, as before.
    expect(podsBySprint(null, pods, [S7]).get(S7)).toBeNull();
    // A pod no team owns runs every sprint alongside the matched ones.
    const extra = [...pods, { areaKey: 'lone', path: 'Lyra Station\\Archive' }];
    expect(podsBySprint(teams, extra, [S7]).get(S7)).toEqual(['orbit', 'lone']);
  });

  it('two teams that own the same area equally leave the pod unmatched (ambiguous)', () => {
    const t = (id: string): TeamFacts => ({ id, name: id, areas: [{ path: 'P\\A', includeChildren: true }], defaultArea: null, iterations: [] });
    expect(teamOfArea([t('x'), t('y')], 'P\\A\\B')).toBeNull();
    expect(teamOfArea([t('x')], 'P\\A\\B')?.id).toBe('x');
  });
});
