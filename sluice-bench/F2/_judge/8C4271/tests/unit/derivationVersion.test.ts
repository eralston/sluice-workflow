// v1.3 F1 (03 §9): `meta.derivation_version` is written, and checked at boot. A mismatch clears the
// derived tables and rebuilds each synced scope's rows from its cached facts when it next opens.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { FIXTURE_ORG, sprintScopes, toHistory } from '@fixtures/dsl';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { DERIVATION_VERSION } from '@shared/ingest/derive';
import { Cache, UNVERSIONED_IS } from '../../src/main/db/cache';
import { emptyLevels, levelState, rebuildPendingDerived, stateKey } from '../../src/main/sync/levels';
import { scopeKeyOf } from '../../src/main/sync/sync';
import { harness, ingest, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

const orbit = scenarios[0]!;
const comet = { project: 'Nimbus Deck', area: 'Nimbus Deck\\Comet Crew' };
const derivedCounts = (c: Cache) => [c.count('events'), c.count('links'), c.count('observations')];

let dirs: string[] = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });
const dbFile = () => { const d = mkdtempSync(join(tmpdir(), 'derivation-')); dirs.push(d); return join(d, 'star-chart.sqlite'); };

/** A synced cache on disk, reopened as the next boot would, after `tamper` ran on the closed-over one. */
async function syncedThenReopened(tamper: (c: Cache) => void) {
  const file = dbFile();
  const h = await harness(orbit, Cache.open(file));
  await ingest(h, orbit, comet);
  const before = { keys: h.cache.eventKeys(FIXTURE_ORG), derived: derivedCounts(h.cache), revisions: h.cache.count('wi_revisions'), updates: h.cache.count('wi_updates') };
  tamper(h.cache);
  h.cache.close();
  const cache = Cache.open(file);
  const sc = syncScopeOf(orbit, comet);
  const ctx = { cache, mapping, clock: h.clock };
  return { cache, sc, ctx, before, range: orbit.range };
}

describe('F1: the derivation version (03 §9)', () => {
  it('a fresh cache records the current version, and a matching boot changes nothing', async () => {
    const c = Cache.open(':memory:');
    expect(c.meta('derivation_version')).toBe(String(DERIVATION_VERSION));
    expect(c.checkDerivation(DERIVATION_VERSION)).toBe(0);
    const { cache, before, sc } = await syncedThenReopened(() => {});
    expect(derivedCounts(cache)).toEqual(before.derived);
    expect(cache.eventKeys(FIXTURE_ORG)).toEqual(before.keys);
    expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(false);
  });

  it('a mismatch at boot clears the derived tables, keeps the facts, and the next open rebuilds them identically', async () => {
    const { cache, sc, ctx, before, range } = await syncedThenReopened((c) => c.setMeta('derivation_version', String(DERIVATION_VERSION - 1)));
    expect(before.derived[0]).toBeGreaterThan(0);
    expect(cache.meta('derivation_version')).toBe(String(DERIVATION_VERSION));
    expect(derivedCounts(cache)).toEqual([0, 0, 0]);
    expect([cache.count('wi_revisions'), cache.count('wi_updates')]).toEqual([before.revisions, before.updates]);
    expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(true);

    expect(rebuildPendingDerived(ctx, sc, range)).toBe(true);
    expect(cache.eventKeys(FIXTURE_ORG)).toEqual(before.keys);
    expect(derivedCounts(cache)).toEqual(before.derived);
    expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(false);
    expect(rebuildPendingDerived(ctx, sc, range)).toBe(false); // once only
  });

  it('a cache from before F1 (no version written) was derived by version 1: kept while the version is 1', async () => {
    expect(UNVERSIONED_IS).toBe(1);
    const { cache, sc, before } = await syncedThenReopened((c) => c.db.prepare("DELETE FROM meta WHERE key = 'derivation_version'").run());
    if (DERIVATION_VERSION === UNVERSIONED_IS) {
      expect(derivedCounts(cache)).toEqual(before.derived);
      expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(false);
    } else {
      expect(derivedCounts(cache)).toEqual([0, 0, 0]);
    }
    expect(cache.meta('derivation_version')).toBe(String(DERIVATION_VERSION));
  });

  it('a cache with no version written, once the version is past 1, is cleared like any mismatch', async () => {
    const { cache, sc } = await syncedThenReopened(() => {});
    cache.db.prepare("DELETE FROM meta WHERE key = 'derivation_version'").run();
    expect(cache.checkDerivation(UNVERSIONED_IS + 1)).toBe(1);
    expect(derivedCounts(cache)).toEqual([0, 0, 0]);
    expect(cache.meta('derivation_version')).toBe(String(UNVERSIONED_IS + 1));
    expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(true);
  });

  it('a sync of a pending scope rebuilds it and takes it off the list', async () => {
    const file = dbFile();
    const h = await harness(orbit, Cache.open(file));
    await ingest(h, orbit, comet);
    const keys = h.cache.eventKeys(FIXTURE_ORG);
    h.cache.setMeta('derivation_version', '0');
    h.cache.close();
    const h2 = await harness(orbit, Cache.open(file));
    expect(h2.cache.derivedPending(FIXTURE_ORG, scopeKeyOf(syncScopeOf(orbit, comet)))).toBe(true);
    await ingest(h2, orbit, comet);
    expect(h2.cache.derivedPending(FIXTURE_ORG, scopeKeyOf(syncScopeOf(orbit, comet)))).toBe(false);
    expect(h2.cache.eventKeys(FIXTURE_ORG)).toEqual(keys);
  });

  it('a level-loaded team never wrote derived rows: it leaves the list without writing any', async () => {
    const { cache, sc, ctx, range } = await syncedThenReopened((c) => c.setMeta('derivation_version', '0'));
    cache.setSetting(stateKey(sc), emptyLevels());
    expect(rebuildPendingDerived(ctx, sc, range)).toBe(false);
    expect(derivedCounts(cache)).toEqual([0, 0, 0]);
    expect(cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(false);
  });

  it('a streamed sprint, even one that finished incomplete, rebuilds over the sprint on open, unless its stream is running', async () => {
    const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    const sc = syncScopeOf(sprintMechanics, scope);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    const stream = new SprintStream(ctx, sc, { changed: () => {} });
    await stream.look();
    await stream.fill();
    stream.close();
    const keys = h.cache.eventKeys(FIXTURE_ORG);
    expect(keys.length).toBeGreaterThan(0);
    const state = levelState(h.cache, sc)!;
    h.cache.setSetting(stateKey(sc), { ...state, sprint: { lookAt: state.sprint!.lookAt, filledAt: null } }); // finished incomplete
    expect(h.cache.checkDerivation(DERIVATION_VERSION + 1)).toBe(1);
    expect(derivedCounts(h.cache)).toEqual([0, 0, 0]);
    const range = toHistory(sprintMechanics, mapping, scope).range;
    expect(rebuildPendingDerived(ctx, sc, range, true)).toBe(false); // its running stream rebuilds them
    expect(h.cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(true);
    expect(rebuildPendingDerived(ctx, sc, range)).toBe(true);
    expect(h.cache.eventKeys(FIXTURE_ORG)).toEqual(keys);
    expect(h.cache.derivedPending(FIXTURE_ORG, scopeKeyOf(sc))).toBe(false);
  });
});
