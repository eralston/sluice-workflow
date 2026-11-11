// Time to first look (decided 2026-10-08): the request scheduler, and a sprint streamed through it. The
// first look is three calls; the rest streams in behind it, and once it's all in the bundle is the
// full sync's (AC-27). On sprint-mechanics, through the fake ADO (fixtures/ado.ts).
import { describe, expect, it, vi } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import { scenarios } from '@fixtures/scenarios';
import type { ScopeHistory } from '@shared/contracts/history';
import type { FakeOptions } from '@fixtures/ado';
import { FIXTURE_ORG } from '@fixtures/dsl';
import { Cache } from '../../src/main/db/cache';
import { loadLevelHistory } from '../../src/main/sync/levels';
import { scopeKeyOf, syncScope } from '../../src/main/sync/sync';
import { Scheduler } from '../../src/main/sync/scheduler';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { comparable, harness, readTeamBoards, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

/** A streamed bundle against toHistory: without what only level loading carries (current state, and what's loaded). */
const strip = (x: ScopeHistory) => {
  const c = comparable(x) as { current?: unknown; coverage: Record<string, unknown> };
  delete c.current;
  for (const f of ['history', 'explored', 'more', 'played']) delete c.coverage[f];
  return c;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the request scheduler', () => {
  const recorder = () => {
    const ran: string[] = [];
    const gates = new Map<string, () => void>();
    const task = (key: string, cls: 'look' | 'fill' | 'context' | 'idle', group = '') => ({
      key, group, cls, run: () => new Promise<void>((r) => { ran.push(key); gates.set(key, r); }),
    });
    const release = async (key: string) => { gates.get(key)?.(); await tick(); };
    return { ran, task, release };
  };

  it('runs by class, then focus, then the order asked; idle only once nothing else waits', async () => {
    const s = new Scheduler({ concurrency: 1 });
    const { ran, task, release } = recorder();
    s.add(task('first', 'fill'));
    s.add(task('idle', 'idle'));
    s.add(task('fill-a', 'fill', 'a'));
    s.add(task('fill-b', 'fill', 'b'));
    s.add(task('look', 'look'));
    s.focus((t) => (t.group === 'b' ? 0 : 1));
    for (const k of ['first', 'look', 'fill-b', 'fill-a', 'idle']) await release(k);
    expect(ran).toEqual(['first', 'look', 'fill-b', 'fill-a', 'idle']);
    await s.idle();
  });

  it('coalesces a second request for the same key, raising its class', async () => {
    const s = new Scheduler({ concurrency: 1 });
    const { ran, task, release } = recorder();
    s.add(task('busy', 'fill'));
    s.add(task('other', 'fill'));
    const a = s.add(task('x', 'idle'));
    const b = s.add(task('x', 'look'));
    expect(s.order()).toEqual(['x', 'other']);
    for (const k of ['busy', 'x', 'other']) await release(k);
    await Promise.all([a, b]);
    expect(ran.filter((k) => k === 'x')).toHaveLength(1);
  });

  it('drops work not started when asked, and never what has started', async () => {
    const s = new Scheduler({ concurrency: 1 });
    const { ran, task, release } = recorder();
    const started = s.add(task('a1', 'fill', 'a'));
    const queued = s.add(task('a2', 'fill', 'a'));
    s.add(task('b1', 'fill', 'b'));
    expect(s.cancel((t) => t.group === 'a')).toBe(1);
    await expect(queued).rejects.toThrow('Cancelled');
    await release('a1');
    await started;
    await release('b1');
    expect(ran).toEqual(['a1', 'b1']);
  });
});

describe('a sprint, streamed', () => {
  const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
  const want = toHistory(sprintMechanics, mapping, scope);
  const k = scenarioKeys(sprintMechanics);

  async function open(s = sprintMechanics, sc = scope, fakeOpts: FakeOptions = {}) {
    const h = await harness(s, Cache.open(':memory:'), fakeOpts);
    const sync = syncScopeOf(s, sc);
    await readTeamBoards(h, sync);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    const changed: number[] = [];
    const stream = new SprintStream(ctx, sync, { changed: (ids) => changed.push(...ids) });
    const bundle = (r = toHistory(s, mapping, sc).range): ScopeHistory => loadLevelHistory(ctx, sync, r);
    const members = () => h.cache.scopeMembers(FIXTURE_ORG, scopeKeyOf(sync)).length;
    return { h, stream, bundle, changed, members };
  }

  /** The same scope through the full sync, for the member-count comparison. */
  async function fullSync(s = sprintMechanics, sc = scope) {
    const h = await harness(s);
    const sync = syncScopeOf(s, sc);
    await syncScope({ client: h.client, cache: h.cache, mapping, clock: h.clock }, sync, toHistory(s, mapping, sc).range);
    return h.cache.scopeMembers(FIXTURE_ORG, scopeKeyOf(sync)).length;
  }

  it('the first look is three calls, and shows every member as it is now', async () => {
    const { h, stream, bundle } = await open();
    h.transport.log.length = 0;
    await stream.look();
    expect(h.transport.log.length).toBeLessThanOrEqual(3);
    const b = bundle();
    const items = new Map((b.current?.workItems ?? []).map((w) => [w.key, w]));
    // Every Story and Bug in the sprint at its end, with its state now.
    for (const key of [k.wi(9103), k.wi(9104), k.wi(9108), k.wi(9106), k.wi(9107)]) expect(items.has(key)).toBe(true);
    expect(items.has(k.wi(9105))).toBe(false); // moved on to Sprint 42
    expect(b.coverage.history).toEqual([]);
    stream.close();
  });

  it('streams in the rest; once it’s all in, the bundle is the full sync’s (AC-27)', async () => {
    const { stream, bundle, changed } = await open();
    await stream.look();
    await stream.fill();
    expect(changed.length).toBeGreaterThan(0);
    const got = bundle(want.range);
    expect(strip(got)).toEqual(strip(want));
  });

  it('counts its work as N of ~M: an estimate from the members until discovery is over, then exact, never N above M (B6)', async () => {
    const { stream } = await open();
    await stream.look();
    const early = stream.fillCount();
    expect(early.exact).toBe(false);
    expect(early.m).toBeGreaterThanOrEqual(early.n);
    void stream.fill();
    const seen: ReturnType<typeof stream.fillCount>[] = [];
    for (let i = 0; i < 400; i++) { seen.push(stream.fillCount()); await tick(); }
    await stream.fill();
    seen.push(stream.fillCount());
    for (const c of seen) expect(c.n).toBeLessThanOrEqual(c.m);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.m, `sample ${i}`).toBeGreaterThanOrEqual(seen[i - 1]!.m); // M never decreases
    const last = seen.at(-1)!;
    expect(last).toMatchObject({ n: 0, exact: true });
    expect(last.m).toBeGreaterThan(0); // exact: what was queued, finished
    stream.close();
  });

  it('the stream is done before the stat lines are read: drain and finish never wait on them (B1)', async () => {
    const h = await harness(sprintMechanics);
    const sync = syncScopeOf(sprintMechanics, scope);
    let atDone = -1;
    const stream = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, sync, { changed: () => {}, done: () => { if (atDone < 0) atDone = h.transport.log.filter((r) => /\/iterations/.test(r.url)).length; } });
    await stream.look();
    await stream.fill();
    expect(atDone).toBe(0); // no iterations call had been made when the stream said it was done
    expect(h.transport.log.filter((r) => /\/iterations/.test(r.url)).length).toBeGreaterThan(0); // and fill() waited for them
    stream.close();
  });

  it('a reopen fetches no history again: the cache already has each item’s latest revision', async () => {
    const { h, stream, bundle } = await open();
    await stream.look();
    await stream.fill();
    const again = new SprintStream({ client: h.client, cache: h.cache, mapping, clock: h.clock }, syncScopeOf(sprintMechanics, scope), { changed: () => {} });
    h.transport.log.length = 0;
    await again.look();
    await again.fill();
    expect(h.transport.log.filter((r) => /\/(revisions|updates)/.test(r.url))).toHaveLength(0);
    expect(bundle().coverage.history!.length).toBeGreaterThan(0);
  });

  it('history is the scene’s own: in a pod, only its items; back at the sprint, the rest (decided 2026-10-08)', async () => {
    const { h, stream, bundle } = await open();
    await stream.look();
    await stream.focus({ pod: 'Halcyon Reach\\Nova Pod' });
    await stream.fill();
    const have = new Set(bundle().coverage.history);
    for (const id of [9106, 9107]) expect(have.has(k.wi(id))).toBe(true);
    for (const id of [9103, 9104, 9108]) expect(have.has(k.wi(id))).toBe(false); // Comet's wait
    expect(stream.waiting).toBeGreaterThan(0);
    h.transport.log.length = 0;
    await stream.focus({});
    await stream.fill();
    expect(h.transport.log.some((r) => /\/revisions/.test(r.url))).toBe(true);
    expect(stream.waiting).toBe(0);
    expect(strip(bundle(want.range))).toEqual(strip(want));
  });

  it('the scope stays the sprint’s own (decided 2026-10-08): the same members as a full sync, not the project', async () => {
    const full = await fullSync();
    const { stream, members } = await open();
    await stream.look();
    await stream.fill();
    expect(members()).toBe(full);
    // And it doesn't creep when the view moves: the closure walks out from the sprint's bodies only.
    for (const pod of ['Halcyon Reach\\Comet Pod', 'Halcyon Reach\\Nova Pod', 'Halcyon Reach\\Quasar Pod']) {
      await stream.focus({ pod });
      await stream.fill();
    }
    await stream.focus({});
    await stream.fill();
    expect(members()).toBe(full);
  });

  it('one query finds what was ever in the sprint: the Story planned out to the next one', async () => {
    const { h, stream, bundle, members } = await open();
    await stream.look();
    expect(bundle().entities.workItems.some((w) => w.key === k.wi(9105))).toBe(false);
    h.transport.log.length = 0;
    await stream.fill();
    const ever = h.transport.log.filter((r) => /EVER/.test(JSON.stringify(r.body ?? '')));
    // One for the sprint, then one per pod (ever in the pod too: slice 7), never a sample per day.
    expect(ever).toHaveLength(1 + scope.pods.length);
    // 9105 is in Sprint 42 now, but it was in 41: it has its history, so it arrives and departs.
    expect(bundle().coverage.history).toContain(k.wi(9105));
    expect(members()).toBeGreaterThan(0);
  });

  it('an ADO that refuses EVER falls back to the daily samples', async () => {
    const { h, stream, bundle } = await open(sprintMechanics, scope, { noEver: true });
    await stream.look();
    await stream.fill();
    expect(h.transport.log.some((r) => /EVER/.test(JSON.stringify(r.body ?? '')))).toBe(true);
    expect(bundle().coverage.history).toContain(k.wi(9105)); // the samples found it instead
    expect(bundle().coverage.notes.some((n) => n.includes('sampled daily'))).toBe(true);
  });

  it('a leaver materialises even while a pod is focused', async () => {
    const { stream, bundle } = await open();
    await stream.look();
    await stream.focus({ pod: 'Halcyon Reach\\Comet Pod' });
    await stream.fill();
    // 9105 was Comet Pod's, and left for Sprint 42: the pod's own playback still shows it depart.
    expect(bundle().coverage.history).toContain(k.wi(9105));
  });

  it('a PR docks at its repo before any item history arrives (decided 2026-10-08)', async () => {
    const { h, stream, bundle } = await open();
    // No revisions or updates at all: everything is current-only, as it is mid-stream.
    h.transport.intercept = (req) => (/\/(revisions|updates)\b/.test(req.url) ? { status: 404, headers: {}, body: null } : undefined);
    await stream.look();
    await stream.fill();
    const b = bundle();
    expect(b.coverage.history).toEqual([]);
    expect(b.entities.prs.map((p) => p.key)).toContain(k.pr(9501));
    // Comet Pod's system still shows the station and the vessel: PR 9501 is on bug 9108.
    const snap = snapshotAt(b, b.range.endUtc - 1, 'knownThen');
    const pod = SPRINTS.format({ level: 'pod', key: k.area('Halcyon Reach\\Comet Pod') });
    const g = projectScene(b, snap, pod as never, LAYOUT_VERSION, SPRINTS);
    expect(g.nodes.filter((n) => n.kind === 'station').map((n) => n.canonicalKey)).toHaveLength(1);
    expect(g.nodes.some((n) => n.kind === 'flight' && n.canonicalKey === k.pr(9501))).toBe(true);
    expect(g.edges.some((e) => e.kind === 'route')).toBe(true);
  });

  it('an item ADO refuses is kept, marked stale, and counted (02 §3, decided 2026-10-09)', async () => {
    const { h, stream, bundle } = await open();
    await stream.look();
    // Bug 9108's history is denied from here on: its last known facts must stay, marked.
    const denied = new RegExp(`/workItems/9108/(revisions|updates)`);
    h.transport.intercept = (req) => (denied.test(req.url) ? { status: 403, headers: {}, body: { message: 'denied (test)' } } : undefined);
    await stream.fill();
    const b = bundle();
    expect(b.coverage.stale).toContain(k.wi(9108));
    expect(b.coverage.partial).toBe(true);
    expect(b.coverage.notes.some((n) => n.includes('could not be read'))).toBe(true);
    // It's still a member and still drawn — with the mark on it.
    expect(b.entities.workItems.some((w) => w.key === k.wi(9108))).toBe(true);
    const snap = snapshotAt(b, b.range.endUtc - 1, 'knownThen');
    const pod = SPRINTS.format({ level: 'pod', key: k.area('Halcyon Reach\\Comet Pod') });
    const node = projectScene(b, snap, pod as never, LAYOUT_VERSION, SPRINTS).nodes.find((n) => n.canonicalKey === k.wi(9108) && n.selectable)!;
    expect(node).toBeDefined();
    expect(node.flags.stale).toBe(true);
    // Its neighbours are not marked: staleness is per object, not per scope.
    const sibling = projectScene(b, snap, pod as never, LAYOUT_VERSION, SPRINTS).nodes.find((n) => n.canonicalKey === k.wi(9104))!;
    expect(sibling.flags.stale).toBeUndefined();
  });

  it('AC-27 holds for every sprint of every scenario, streamed', async () => {
    for (const s of scenarios) {
      for (const sc of sprintScopes(s)) {
        const w = toHistory(s, mapping, sc);
        const { stream, bundle } = await open(s, sc);
        await stream.look();
        await stream.fill();
        expect(strip(bundle(w.range)), `${s.name} · ${sc.sprint}`).toEqual(strip(w));
      }
    }
  });
});
