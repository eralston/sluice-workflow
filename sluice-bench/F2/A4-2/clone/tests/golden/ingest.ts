// Slice 4 test harness: a scenario's fake ADO org (fixtures/ado.ts), ingested through the real client,
// cache, and sync pipeline into an in-memory SQLite DB.
import { FAKE_ORG_URL, fakeProjectId, toAdoPayloads, type FakeAdo, type FakeOptions } from '@fixtures/ado';
import { FIXTURE_ORG, resolveSector, type Scenario, type ScenarioScope, type SprintScope } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { UtcMs } from '@shared/contracts/keys';
import { AdoClient } from '../../src/main/ado/client';
import { FakeAdoTransport } from '../../src/main/ado/fake';
import { Cache } from '../../src/main/db/cache';
import { readTeams, teamsKey } from '../../src/main/sync/boards';
import { loadHistory, syncScope, type SyncScope } from '../../src/main/sync/sync';
import { mapping } from './helpers';

export interface Harness { fake: FakeAdo; transport: FakeAdoTransport; client: AdoClient; cache: Cache; clock: () => UtcMs }

export async function harness(s: Scenario, cache = Cache.open(':memory:'), fakeOpts: FakeOptions = {}): Promise<Harness> {
  const fake = toAdoPayloads(s, mapping, fakeOpts);
  const transport = new FakeAdoTransport(fake);
  const client = new AdoClient(transport, FAKE_ORG_URL);
  const projects = (await client.projects()).map((p) => ({ projectId: String((p as { id: string }).id), name: String((p as { name: string }).name), adoUrl: '' }));
  cache.putProjects(FIXTURE_ORG, projects, fake.now);
  return { fake, transport, client, cache, clock: () => fake.now };
}

export function syncScopeOf(s: Scenario, scope: ScenarioScope | SprintScope): SyncScope {
  const project = { projectId: fakeProjectId(scope.project), name: scope.project, adoUrl: '' };
  const sector = resolveSector(s, scope);
  if (sector.kind === 'sprint') {
    const nodeId = Number(sector.iterationKey.split(':').pop());
    return { org: FIXTURE_ORG, project, sector, target: { kind: 'sprint', path: sector.path, nodeId, startUtc: sector.startUtc, finishUtc: sector.finishUtc, pods: sector.pods.map((p) => p.path) } };
  }
  if ('area' in scope) {
    const nodeId = s.projects.find((p) => p.name === scope.project)!.areas.find((a) => a.path === scope.area)!.nodeId;
    return { org: FIXTURE_ORG, project, sector, target: { kind: 'area', path: scope.area, nodeId } };
  }
  return { org: FIXTURE_ORG, project, sector, target: { kind: 'epic', id: (scope as { epic: number }).epic } };
}

/** What the service does before a scope's first sync (B4): read the project's teams and their boards into the cache. */
export async function readTeamBoards(h: Harness, sc: SyncScope): Promise<void> {
  h.cache.setSetting(teamsKey(sc.org, sc.project.projectId), { teams: await readTeams(h.client, sc.project.projectId) });
}

export async function ingest(h: Harness, s: Scenario, scope: ScenarioScope | SprintScope, range = s.range): Promise<ScopeHistory> {
  const sc = syncScopeOf(s, scope);
  await readTeamBoards(h, sc);
  await syncScope({ client: h.client, cache: h.cache, mapping, clock: h.clock }, sc, range);
  return loadHistory({ cache: h.cache, mapping, clock: h.clock }, sc, range);
}

/** 03 §4 equivalence: deep-equal after removing observedAt everywhere, coverage.syncedAt, and coverage.notes. */
export function comparable(h: ScopeHistory): unknown {
  return JSON.parse(JSON.stringify({ ...h, coverage: { ...h.coverage, syncedAt: null, notes: [] } }, (k, v) => (k === 'observedAt' ? undefined : v)));
}
