// B4 (03 §3, 04 §3 boards): board columns from ADO. Parsing, the placements the derivation keeps, the team
// board read (and what a refusal or a blip does to it), the bundle through the fake ADO (AC-27 is in the ingest
// goldens), Solar's independence, and the migration that re-reads old history. Invented data only (INV-18).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sprintPods from '@fixtures/scenarios/sprint-pods';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { FIXTURE_ORG, scenario, scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AdoRequest, AdoResponse } from '@shared/contracts/transport';
import { isQuiet } from '@shared/contracts/neterror';
import { planSolar } from '@shared/engine/solar/plan';
import { SOLAR } from '@shared/hierarchy/solar';
import { solarSource } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { boardOf, placementsOf } from '@shared/ingest/board';
import { parseBoardColumns, parseRevision, parseStoriesBoard } from '@shared/ingest/parse';
import { boardColumnsOf, parseTeam, type TeamFacts } from '@shared/teams';
import { Cache, SCHEMA_VERSION } from '../../src/main/db/cache';
import { readTeams, teamsKey } from '../../src/main/sync/boards';
import { scopeKeyOf } from '../../src/main/sync/sync';
import { harness, ingest, readTeamBoards, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const projectOf = (name: string) => name;
const rev = (fields: Record<string, unknown>) => ({
  id: 7, rev: 1, fields: { 'System.ChangedDate': '2026-09-14T16:00:00Z', 'System.TeamProject': 'P', 'System.WorkItemType': 'Bug', 'System.State': 'Active', ...fields },
});
const k = (n: number) => `wi:00000000-0000-4000-8000-000000000001:${n}` as never;

describe('B4: parsing', () => {
  it('a revision keeps System.BoardColumn, and the Done half only when it is true', () => {
    const p = (f: Record<string, unknown>) => parseRevision(rev(f), () => 'p1');
    expect(p({})).not.toHaveProperty('boardColumn');
    expect(p({ 'System.BoardColumn': 'Code Review', 'System.BoardColumnDone': false })).toMatchObject({ boardColumn: 'Code Review' });
    expect(p({ 'System.BoardColumn': 'Code Review', 'System.BoardColumnDone': false })).not.toHaveProperty('boardColumnDone');
    expect(p({ 'System.BoardColumn': 'Active', 'System.BoardColumnDone': true })).toMatchObject({ boardColumn: 'Active', boardColumnDone: true });
    // Done with no column is nothing; an empty column is none.
    expect(p({ 'System.BoardColumnDone': true })).not.toHaveProperty('boardColumnDone');
    expect(p({ 'System.BoardColumn': '' })).not.toHaveProperty('boardColumn');
    expect(p({ 'System.BoardColumn': 4 })).not.toHaveProperty('boardColumn');
  });

  it('the Stories board is the requirement backlog level, by category and not by name', () => {
    const lvl = (id: string, name: string, type: string) => ({ id, name, type });
    expect(parseStoriesBoard([lvl('Microsoft.EpicCategory', 'Epics', 'portfolio'), lvl('Microsoft.RequirementCategory', 'Issues', 'requirement')])).toBe('Issues');
    expect(parseStoriesBoard([lvl('Microsoft.RequirementCategory', 'Our work', 'requirement')])).toBe('Our work');
    expect(parseStoriesBoard([lvl('Custom.Level', 'Backlog items', 'requirement'), lvl('Microsoft.TaskCategory', 'Tasks', 'task')])).toBe('Backlog items');
    expect(parseStoriesBoard([lvl('Microsoft.FeatureCategory', 'Features', 'portfolio')])).toBeUndefined();
    expect(parseStoriesBoard([{ id: 'Microsoft.RequirementCategory' }, null, 'z'])).toBeUndefined();
    expect(parseStoriesBoard(undefined)).toBeUndefined();
  });

  it('a board’s columns, in the board’s order; junk is left out', () => {
    const cols = parseBoardColumns({ value: [
      { name: 'Done', order: 3, columnType: 'outgoing', isSplit: false },
      { name: 'New', order: 1, columnType: 'incoming' },
      { name: 'Build', order: 2, columnType: 'inProgress', isSplit: true },
      { order: 9, name: '' },
    ] });
    expect(cols).toEqual([
      { name: 'New', type: 'incoming', split: false },
      { name: 'Build', type: 'inProgress', split: true },
      { name: 'Done', type: 'outgoing', split: false },
    ]);
    // Without `order` on every column, the list's own order stands; an unknown type is in progress.
    expect(parseBoardColumns({ value: [{ name: 'B', columnType: 'odd' }, { name: 'A', order: 1 }] }).map((c) => [c.name, c.type])).toEqual([['B', 'inProgress'], ['A', 'inProgress']]);
    expect(parseBoardColumns(undefined)).toEqual([]);
  });

  it('a team keeps its board columns, and only when it has some', () => {
    const t = { id: 'T', name: 'Team' };
    expect(parseTeam(t, {}, [], [{ name: 'A', type: 'incoming', split: false }])!.columns).toEqual([{ name: 'A', type: 'incoming', split: false }]);
    expect(parseTeam(t, {}, [], [])).not.toHaveProperty('columns');
    expect(parseTeam(t, {}, [])).not.toHaveProperty('columns');
  });
});

describe('B4: placements and the bundle’s board', () => {
  it('an entry whenever the column or its Done half changes; a column that goes away is an empty one', () => {
    const r = (changedAt: number, column?: string, done?: boolean) => ({ changedAt, ...(column ? { column } : {}), ...(done ? { done } : {}) });
    expect(placementsOf(k(1), [r(1), r(2)])).toEqual([]);
    expect(placementsOf(k(1), [r(1, 'New'), r(2, 'New'), r(3, 'Active'), r(4, 'Active', true), r(5, 'Active', true), r(6), r(7, 'Closed')]).map((p) => [p.at, p.column, p.done]))
      .toEqual([[1, 'New', false], [3, 'Active', false], [4, 'Active', true], [6, '', false], [7, 'Closed', false]]);
    // Done with no column is not a placement.
    expect(placementsOf(k(1), [r(1, undefined, true)])).toEqual([]);
  });

  it('a bundle has a board only when the team board has columns, with placements in time then key order', () => {
    expect(boardOf(undefined, [])).toBeUndefined();
    expect(boardOf([], [])).toBeUndefined();
    const board = boardOf([{ name: 'A', type: 'incoming', split: false }], [
      { key: k(2), at: 5, column: 'A', done: false }, { key: k(1), at: 5, column: 'A', done: false }, { key: k(9), at: 1, column: 'A', done: false },
    ])!;
    expect(board.placements.map((p) => [p.at, p.key])).toEqual([[1, k(9)], [5, k(1)], [5, k(2)]]);
  });

  it('the board for a scope is its team’s: the first Area Path with a clear team that has columns', () => {
    const cols = (n: string) => [{ name: n, type: 'incoming' as const, split: false }];
    const team = (id: string, area: string, columns?: ReturnType<typeof cols>): TeamFacts => ({ id, name: id, areas: [{ path: area, includeChildren: true }], defaultArea: area, iterations: [], ...(columns ? { columns } : {}) });
    const teams = [team('a', 'P\\A', cols('X')), team('b', 'P\\B', cols('Y')), team('c', 'P\\C')];
    expect(boardColumnsOf(teams, ['P\\A\\Pod'])).toEqual(cols('X'));
    expect(boardColumnsOf(teams, ['P\\C', 'P\\B'])).toEqual(cols('Y')); // C has a team but no board: the next pod's
    expect(boardColumnsOf(teams, ['P\\C'])).toBeUndefined();
    expect(boardColumnsOf(teams, [])).toBeUndefined(); // an Epic names no area
    expect(boardColumnsOf(null, ['P\\A'])).toBeUndefined();
    expect(boardColumnsOf([team('a', 'P\\A', cols('X')), team('b', 'P\\A', cols('Y'))], ['P\\A'])).toBeUndefined(); // two teams tie: no clear team
  });

  it('the fixtures: Halcyon and pod-sprint have boards with a custom and a split column; the others have none', () => {
    const halcyon = toHistory(sprintPods, mapping, sprintScopes(sprintPods).find((s) => s.sprint.endsWith('Sprint 41'))!);
    expect(halcyon.board!.columns.map((c) => c.name)).toEqual(['New', 'Ready', 'Active', 'Code Review', 'Resolved', 'Closed']);
    expect(halcyon.board!.columns.find((c) => c.name === 'Resolved')!.split).toBe(true);
    expect(halcyon.board!.placements.some((p) => p.column === 'Code Review')).toBe(true);
    expect(halcyon.board!.placements.some((p) => p.column === 'Resolved' && p.done)).toBe(true);
    const harbor = toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!);
    expect(harbor.board!.columns.some((c) => c.name === 'Ready to Accept')).toBe(true);
    expect(harbor.board!.columns.find((c) => c.name === 'Active')!.split).toBe(true);
    expect(harbor.board!.placements.some((p) => p.column === 'Active' && p.done)).toBe(true);
    expect(toHistory(sprintMechanics, mapping, sprintScopes(sprintMechanics)[0]!).board).toBeUndefined();
  });

  it('tasks and Features are never on the board', () => {
    const h = toHistory(sprintPods, mapping, sprintScopes(sprintPods).find((s) => s.sprint.endsWith('Sprint 41'))!);
    const onBoard = new Set(h.board!.placements.map((p) => p.key));
    for (const w of h.entities.workItems) if (w.type !== 'User Story' && w.type !== 'Bug') expect(onBoard.has(w.key), w.type).toBe(false);
  });
});

describe('B4: reading the team boards', () => {
  const failing = (re: RegExp, status: number) => (req: AdoRequest): AdoResponse | undefined =>
    (re.test(req.url) ? { status, headers: {}, body: { message: 'x', typeKey: 'y' } } : undefined);
  const scope = sprintScopes(sprintPods).find((s) => s.sprint.endsWith('Sprint 41'))!;
  const project = () => { const sc = syncScopeOf(sprintPods, scope); return { sc, id: sc.project.projectId }; };

  it('reads the Stories board’s columns per team through the fake ADO, in order', async () => {
    const h = await harness(sprintPods);
    const teams = await readTeams(h.client, project().id);
    expect(teams).toHaveLength(1);
    expect(teams[0]!.columns!.map((c) => [c.name, c.type, c.split])).toEqual([
      ['New', 'incoming', false], ['Ready', 'inProgress', false], ['Active', 'inProgress', false], ['Code Review', 'inProgress', false], ['Resolved', 'inProgress', true], ['Closed', 'outgoing', false],
    ]);
    const urls = h.transport.log.map((r) => r.url);
    expect(urls.some((u) => /\/_apis\/work\/backlogs\?/.test(u))).toBe(true);
    expect(urls.some((u) => /\/_apis\/work\/boards\/Stories\/columns\?/.test(u))).toBe(true);
  });

  it('a team with no Stories board has no columns; a scenario with no board serves none', async () => {
    const h = await harness(sprintMechanics);
    const sc = syncScopeOf(sprintMechanics, sprintScopes(sprintMechanics)[0]!);
    const teams = await readTeams(h.client, sc.project.projectId);
    expect(teams.every((t) => !t.columns)).toBe(true);
  });

  it('a 401 on the boards is a missing scope: the teams are read without columns, and the status is quiet', async () => {
    const h = await harness(sprintPods);
    h.transport.intercept = failing(/\/_apis\/work\/(backlogs|boards)/, 401);
    const teams = await readTeams(h.client, project().id);
    expect(teams).toHaveLength(1);
    expect(teams[0]).not.toHaveProperty('columns');
    expect(isQuiet('teams', 401)).toBe(true);
    // 403 and 404 are refusals too.
    for (const status of [403, 404]) {
      h.transport.intercept = failing(/\/_apis\/work\/(backlogs|boards)/, status);
      expect((await readTeams(h.client, project().id))[0]).not.toHaveProperty('columns');
    }
  });

  it('a blip (no response, 429, 5xx) keeps the columns read before; a refusal drops them', async () => {
    const h = await harness(sprintPods);
    const before = await readTeams(h.client, project().id);
    for (const status of [500, 503, 429]) {
      h.transport.intercept = failing(/\/_apis\/work\/(backlogs|boards)/, status);
      expect((await readTeams(h.client, project().id, before))[0]!.columns).toEqual(before[0]!.columns);
    }
    h.transport.intercept = failing(/\/_apis\/work\/(backlogs|boards)/, 403);
    expect((await readTeams(h.client, project().id, before))[0]).not.toHaveProperty('columns');
  });

  it('the bundle through the sync carries the board; refused, it carries none and the scene falls back to the ladder', async () => {
    const h = await harness(sprintPods);
    const got = await ingest(h, sprintPods, scope, toHistory(sprintPods, mapping, scope).range);
    expect(got.board?.columns).toHaveLength(6);
    expect(got.board).toEqual(toHistory(sprintPods, mapping, scope).board);

    const refused = await harness(sprintPods);
    refused.transport.intercept = failing(/\/_apis\/work\/(backlogs|boards)/, 401);
    const plain = await ingest(refused, sprintPods, scope, toHistory(sprintPods, mapping, scope).range);
    expect(plain.board).toBeUndefined();
    expect(plain.events).toEqual(got.events); // nothing but the board differs
  });

  it('with no team list cached at all, the bundle has no board (and the sync does not need one)', async () => {
    const h = await harness(sprintPods);
    const sc = syncScopeOf(sprintPods, scope);
    const { syncScope, loadHistory } = await import('../../src/main/sync/sync');
    const range = toHistory(sprintPods, mapping, scope).range;
    await syncScope({ client: h.client, cache: h.cache, mapping, clock: h.clock }, sc, range);
    expect(h.cache.setting(teamsKey(sc.org, sc.project.projectId))).toBeNull();
    expect(loadHistory({ cache: h.cache, mapping, clock: h.clock }, sc, range).board).toBeUndefined();
  });

  it('an Epic scope names no area, so it has no board', async () => {
    const h = await harness(sprintPods);
    await readTeamBoards(h, syncScopeOf(sprintPods, scope));
    expect(h.cache.setting<{ teams: TeamFacts[] }>(teamsKey(FIXTURE_ORG, project().id))!.teams[0]!.columns).toBeDefined();
    const sc = { ...syncScopeOf(sprintPods, scope), target: { kind: 'epic' as const, id: 9001 } };
    const { loadHistory } = await import('../../src/main/sync/sync');
    expect(loadHistory({ cache: h.cache, mapping, clock: h.clock }, sc, toHistory(sprintPods, mapping, scope).range).board).toBeUndefined();
  });
});

describe('B4: Solar does not read the board', () => {
  // The solar goldens (tests/golden/solar.test.ts) run on pod-sprint, which now has a board, and did not move.
  // This says why: the Solar plan and its scenes are the same bundle with the board taken off.
  it('the Solar plan and scenes of a round are identical with and without the bundle’s board', () => {
    for (const s of [podSprint, sprintPods]) {
      const h = toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint.endsWith(s === podSprint ? 'Sprint 13' : 'Sprint 41'))!);
      expect(h.board).toBeDefined();
      const bare = { ...h };
      delete bare.board;
      const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
      for (const pod of pods) {
        const plan = (x: typeof h) => JSON.stringify([...planSolar(solarSource.facts(x, { level: 'pod', key: pod.areaKey }), solarSource.pack!(x)).slots.entries()]);
        expect(plan(h)).toEqual(plan(bare));
        const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
        for (const t of [h.range.startUtc + (h.range.endUtc - h.range.startUtc) / 2, h.range.endUtc - 1]) {
          const graph = (x: typeof h) => JSON.stringify(projectScene(x, snapshotAt(x, Math.round(t), 'knownThen'), scene, LAYOUT_VERSION, SOLAR));
          expect(graph(h)).toEqual(graph(bare));
        }
      }
    }
  });
});

// A project with two teams, each owning a pod of one sprint, and a renamed Stories level (Basic's "Issues").
const S1 = 'P\\Sprint 1';
const twoTeams = () => scenario('two-teams', { project: 'P', tz: 'UTC', range: ['2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z'] })
  .board({ level: 'Issues', columns: [{ name: 'To Do' }, { name: 'Doing' }, { name: 'Done' }], byState: { New: 'To Do', Active: 'Doing', Closed: 'Done' } })
  .area('P', 1).area('P\\A', 2, { favorite: true, defaultScope: true }).area('P\\B', 3, { favorite: true })
  .iteration(S1, 10, '2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z')
  .team('Team A', { areas: ['P\\A'], iterations: [S1] }).team('Team B', { areas: ['P\\B'], iterations: [S1] })
  .person('ann', 'Ann Example')
  .at('2026-09-14T16:00:00Z')
  .story(1, 'In team A', { area: 'P\\A', iteration: S1, assignee: 'ann' })
  .story(2, 'In team B', { area: 'P\\B', iteration: S1, assignee: 'ann' })
  .at('2026-09-15T16:00:00Z').state(1, 'Active').state(2, 'Active')
  .build();

describe('B4: the board is found by category, and belongs to one team', () => {
  const scope = { project: 'P', sprint: S1, pods: ['P\\A', 'P\\B'] };
  const range = () => toHistory(twoTeams(), mapping, scope).range;

  it('a renamed requirement level (Issues) still gives the board', async () => {
    const s = twoTeams();
    const h = await harness(s);
    const teams = await readTeams(h.client, syncScopeOf(s, scope).project.projectId);
    expect(teams.map((t) => t.columns?.map((c) => c.name))).toEqual([['To Do', 'Doing', 'Done'], ['To Do', 'Doing', 'Done']]);
    expect(h.transport.log.some((r) => /\/_apis\/work\/boards\/Issues\/columns\?/.test(r.url))).toBe(true);
  });

  it('only items whose area belongs to the board’s team have a column; the others fall back to the ladder', async () => {
    const s = twoTeams();
    const want = toHistory(s, mapping, scope);
    const k = scenarioKeys(s);
    expect(want.board!.placements.length).toBeGreaterThan(0);
    expect(want.board!.placements.every((p) => p.key === k.wi(1))).toBe(true);
    expect(want.entities.workItems.map((w) => w.key)).toContain(k.wi(2));
    const h = await harness(s);
    await readTeamBoards(h, syncScopeOf(s, scope));
    const got = await ingest(h, s, scope, range());
    expect(got.board).toEqual(want.board);
  });

  it('a column call that no revision of the item ever carries is an error in the scenario', () => {
    const s = scenario('lonely', { project: 'P', tz: 'UTC', range: ['2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z'] })
      .board({ columns: [{ name: 'A' }, { name: 'B' }], byState: { New: 'A', Active: 'B' } })
      .area('P', 1, { favorite: true, defaultScope: true })
      .at('2026-09-14T16:00:00Z').story(1, 'One', { area: 'P' })
      .at('2026-09-15T16:00:00Z').column(1, 'B');
    expect(() => toHistory(s.build(), mapping, { project: 'P', area: 'P' })).toThrow(/never carried by a revision/);
    // A state change after it overwrites the column, so it never landed either.
    const t = scenario('overwritten', { project: 'P', tz: 'UTC', range: ['2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z'] })
      .board({ columns: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], byState: { New: 'A', Active: 'C' } })
      .area('P', 1, { favorite: true, defaultScope: true })
      .at('2026-09-14T16:00:00Z').story(1, 'One', { area: 'P' })
      .at('2026-09-15T16:00:00Z').column(1, 'B').state(1, 'Active');
    expect(() => toHistory(t.build(), mapping, { project: 'P', area: 'P' })).toThrow(/never carried by a revision/);
  });
});

describe('B4: migration 007 re-reads old history lazily', () => {
  let dirs: string[] = [];
  afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

  it('only the item checkpoints go: scopes keep their last success, events and teams, and an old revision is re-read and replaced on the next sync', async () => {
    const d = mkdtempSync(join(tmpdir(), 'board-migrate-')); dirs.push(d);
    const file = join(d, 'star-chart.sqlite');
    const scope = sprintScopes(sprintPods).find((s) => s.sprint.endsWith('Sprint 41'))!;
    const range = toHistory(sprintPods, mapping, scope).range;
    const sc = syncScopeOf(sprintPods, scope);
    const h = await harness(sprintPods, Cache.open(file));
    await ingest(h, sprintPods, scope, range);
    h.cache.setSetting('theme', { name: 'kept' });
    const kept = { events: h.cache.count('events'), revisions: h.cache.count('wi_revisions'), members: h.cache.scopeMembers(FIXTURE_ORG, scopeKeyOf(sc)).length, teams: h.cache.setting(teamsKey(sc.org, sc.project.projectId)) };
    expect(kept.teams).not.toBeNull();
    // The cache as v1.2 left it: facts without board columns, and schema 6.
    (h.cache as unknown as { db: { exec(s: string): void } }).db.exec("UPDATE wi_revisions SET fact_json = json_remove(fact_json, '$.boardColumn', '$.boardColumnDone')");
    h.cache.setMeta('schema_version', String(SCHEMA_VERSION - 1));
    h.cache.close();

    const reopened = Cache.open(file);
    expect(reopened.meta('schema_version')).toBe(String(SCHEMA_VERSION));
    expect(reopened.checkpoint(FIXTURE_ORG, 10001)).toEqual({ revisions: 0, updates: 0 }); // reads as no history cached
    expect(reopened.count('wi_revisions')).toBe(kept.revisions);
    expect(reopened.count('events')).toBe(kept.events);
    expect(reopened.scopeCheckpoint(FIXTURE_ORG, scopeKeyOf(sc))?.lastSuccessAt).toBeTruthy();
    expect(reopened.scopeMembers(FIXTURE_ORG, scopeKeyOf(sc))).toHaveLength(kept.members);
    expect(reopened.setting(teamsKey(sc.org, sc.project.projectId))).toEqual(kept.teams);
    expect(reopened.setting('theme')).toEqual({ name: 'kept' });
    // Until it is re-read the chart draws from the old facts: the board's columns, no placements, work placed by state.
    const ctx = { cache: reopened, mapping, clock: () => 0 as never };
    const { loadHistory, syncScope } = await import('../../src/main/sync/sync');
    const before = loadHistory({ cache: reopened, mapping, clock: h.clock }, sc, range);
    void ctx;
    expect(before.board?.columns).toHaveLength(6);
    expect(before.board?.placements).toEqual([]);

    // The next sync reads each item's history again and replaces the old facts.
    const again = await harness(sprintPods, reopened);
    await syncScope({ client: again.client, cache: reopened, mapping, clock: again.clock }, sc, range);
    const after = loadHistory({ cache: reopened, mapping, clock: again.clock }, sc, range);
    expect(after.board?.placements.length).toBeGreaterThan(0);
    expect(after.board).toEqual(toHistory(sprintPods, mapping, scope).board);
    expect(after.events).toEqual(before.events);
    reopened.close();
  });
});
void projectOf; void scenarioKeys;
