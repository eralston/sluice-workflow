// AC-27 (G) for the v1 SDLC scenarios (17 W1-T2): ingest(toAdoPayloads(s)) ≡ toHistory(s), for every
// area and sprint scope each serves. Then `pod-sprint`'s Sprint 13 bundle is checked against the
// content 17 lists for it, so a later edit can't quietly drop a case the solar board depends on.
import { describe, expect, it } from 'vitest';
import { v1Scenarios } from '@fixtures/scenarios/v1';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { scenario, scenarioKeys, scenarioScopes, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { mapping } from './helpers';
import { comparable, harness, ingest } from './ingest';

// Fake ADO serves SDLC only (its WIQL names SDLC types): the todo and CRM packs are fixture-only (A3).
const sdlc = v1Scenarios.filter((s) => !s.pack || s.pack === 'sdlc');

describe('AC-27 (v1): ingest through the fake ADO matches toHistory', () => {
  it('serves pod-sprint as an SDLC scenario', () => {
    expect(sdlc.map((s) => s.name)).toContain('pod-sprint');
  });

  const areas = sdlc.flatMap((s) => scenarioScopes(s, mapping).map((scope) => ({ s, scope, name: `${s.name} · ${'area' in scope ? scope.area : `Epic ${scope.epic}`}` })));
  it.each(areas)('$name', async ({ s, scope }) => {
    const h = await harness(s);
    const got = await ingest(h, s, scope);
    expect(comparable(got)).toEqual(comparable(toHistory(s, mapping, scope)));
  });

  const sprints = sdlc.flatMap((s) => sprintScopes(s).map((scope) => ({ s, scope, name: `${s.name} · ${scope.sprint}` })));
  it.each(sprints)('$name', async ({ s, scope }) => {
    const want = toHistory(s, mapping, scope);
    const h = await harness(s);
    const got = await ingest(h, s, scope, want.range);
    expect(comparable(got)).toEqual(comparable(want));
    expect(got.entities.workItems.length).toBeGreaterThan(0);
    expect(got).not.toHaveProperty('domainPack');
  });
});

describe('pod-sprint: the Sprint 13 episode holds what 17 W1-T2 lists', () => {
  const k = scenarioKeys(podSprint);
  const scope = sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!;
  const h: ScopeHistory = toHistory(podSprint, mapping, scope);
  const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
  const HARBOR = 'Tidewater Array\\Harbor Pod';
  const of = <K extends AnyTimelineEvent['kind']>(kind: K) => h.events.filter((e): e is Extract<AnyTimelineEvent, { kind: K }> => e.kind === kind);
  const created = new Map(of('wi_created').map((e) => [e.entityKey, e.payload]));
  const typeOf = (key: CanonicalKey) => created.get(key)?.type;
  /** Who held each Story or Bug in Harbor Pod at any time in the round. */
  const heldBy = (person: string) => {
    const pk = k.person(person);
    const keys = new Set<CanonicalKey>();
    for (const [key, p] of created) if (p.assigneeKey === pk) keys.add(key);
    for (const e of of('wi_assignee_changed')) if (e.payload.to === pk) keys.add(e.entityKey);
    return [...keys].filter((key) => ['User Story', 'Bug'].includes(typeOf(key) ?? '') && end.workItems.get(key)?.areaPath === HARBOR);
  };

  it('is a sprint scope over two pods, with Sprint 13 as its range', () => {
    expect(scope.pods).toEqual([HARBOR, 'Tidewater Array\\Lantern Pod']);
    expect(h.range).toEqual(podSprint.range);
    expect(podSprint.defaultScope).toEqual({ project: 'Tidewater Array', area: HARBOR });
  });

  it('names the viewer first, and has 5 assignees and 2 reviewer-only guests', () => {
    expect([...podSprint.people.keys()][0]).toBe('wren');
    expect(h.entities.captains.map((c) => c.displayName).sort()).toEqual(
      ['Juno Achterberg', 'Kit Marchetti', 'Ossian Vale', 'Pell Ibarra', 'Sable Nakamura', 'Tamsin Oduya', 'Wren Calloway']);
    const assigned = new Set([...created.values()].map((p) => p.assigneeKey).concat(of('wi_assignee_changed').map((e) => e.payload.to)).filter(Boolean));
    expect(assigned.size).toBe(5);
    for (const guest of ['sable', 'tamsin']) {
      expect(assigned.has(k.person(guest))).toBe(false);
      expect(h.events.some((e) => e.changedBy === k.person(guest))).toBe(false);
      expect(of('pr_completed').some((e) => e.payload.approvedBy?.includes(k.person(guest)))).toBe(true);
    }
  });

  it('has one seat past both caps, two light seats and one person with Tasks only', () => {
    const count = (person: string, type: string) => heldBy(person).filter((key) => typeOf(key) === type).length;
    expect([count('ossian', 'User Story'), count('ossian', 'Bug')]).toEqual([5, 4]);
    expect(count('wren', 'User Story')).toBe(3);
    for (const light of ['juno', 'kit']) expect(heldBy(light).length).toBeLessThanOrEqual(3);
    const pellHolds = [...created].filter(([, p]) => p.assigneeKey === k.person('pell')).map(([key]) => typeOf(key));
    expect(pellHolds.length).toBeGreaterThan(0);
    expect(new Set(pellHolds)).toEqual(new Set(['Task']));
  });

  it('has a frontier of 2 Stories and 1 Bug, one picked up and closed', () => {
    const frontier = [...created].filter(([, p]) => p.areaPath === HARBOR && p.assigneeKey === null && ['User Story', 'Bug'].includes(p.type));
    expect(frontier.map(([, p]) => p.type).sort()).toEqual(['Bug', 'User Story', 'User Story']);
    const picked = frontier.filter(([key]) => end.workItems.get(key)?.assigneeKey);
    expect(picked).toHaveLength(1);
    expect(end.workItems.get(picked[0]![0])?.rawState).toBe('Closed');
  });

  it('reaches every rung, Deferred and Rejected, and has a reopen', () => {
    const states = new Set([...created.values()].filter((p) => ['User Story', 'Bug'].includes(p.type)).map((p) => p.state)
      .concat(of('wi_state_changed').filter((e) => ['User Story', 'Bug'].includes(typeOf(e.entityKey) ?? '')).map((e) => e.payload.to)));
    for (const s of ['New', 'Ready', 'Ready for Review', 'Active', 'Resolved', 'Ready to Accept', 'Closed', 'Removed', 'Deferred', 'Rejected']) expect(states).toContain(s);
    expect(of('wi_state_changed').some((e) => e.payload.from === 'Closed' && e.payload.to === 'Active')).toBe(true);
  });

  it('has a mid-sprint Bug, moves into and out of the sprint, a pod move and a reassignment', () => {
    const start = h.range.startUtc;
    expect(of('wi_created').some((e) => e.payload.type === 'Bug' && e.occurredAt > start + 86_400_000 && e.payload.iterationPath === scope.sprint)).toBe(true);
    expect(of('wi_iteration_changed').some((e) => e.payload.to === scope.sprint)).toBe(true);
    expect(of('wi_iteration_changed').some((e) => e.payload.from === scope.sprint)).toBe(true);
    expect(of('wi_area_changed').some((e) => e.payload.to === HARBOR && scope.pods.includes(e.payload.from))).toBe(true);
    expect(of('wi_assignee_changed').some((e) => e.payload.from !== null && e.payload.to !== null)).toBe(true);
    // Reef Pod isn't saved, so its Story stays out.
    expect(h.entities.workItems.some((w) => w.key === k.wi(20161))).toBe(false);
  });

  it('has Tasks closed by someone other than their assignee', () => {
    const closedByOther = of('wi_state_changed').filter((e) => typeOf(e.entityKey) === 'Task' && e.payload.to === 'Closed'
      && e.changedBy !== end.workItems.get(e.entityKey)?.assigneeKey);
    expect(closedByOther.length).toBeGreaterThan(0);
  });

  it('has 3 repos and about 9 PRs, with the station cases 13 §4.4 needs', () => {
    const repoName = new Map(h.entities.repos.map((r) => [r.key, r.name]));
    expect([...repoName.values()].sort()).toEqual(['harbor-console', 'ledger-sync', 'tide-gateway']);
    const opened = of('pr_opened');
    expect(opened.length).toBeGreaterThanOrEqual(8);
    expect(opened.length).toBeLessThanOrEqual(10);
    // The viewer approves 3 merges; one PR is abandoned; one is still open at the end.
    expect(of('pr_completed').filter((e) => e.payload.approvedBy?.includes(k.person('wren')))).toHaveLength(3);
    expect(of('pr_abandoned')).toHaveLength(1);
    const closed = new Set([...of('pr_completed'), ...of('pr_abandoned')].map((e) => e.entityKey));
    expect(opened.filter((e) => !closed.has(e.entityKey))).toHaveLength(1);
    // One PR is linked to 2 items.
    const links = new Map<CanonicalKey, Set<CanonicalKey>>();
    for (const e of of('link_pr_added')) links.set(e.payload.prKey, (links.get(e.payload.prKey) ?? new Set()).add(e.payload.itemKey));
    expect([...links.values()].some((items) => items.size === 2)).toBe(true);
    // One repo has 7 open at once ("+N").
    const repoOf = new Map(opened.map((e) => [e.entityKey, repoName.get(e.payload.repoKey)]));
    const peak = new Map<string, number>();
    const live = new Map<string, number>();
    for (const e of h.events) {
      const repo = repoOf.get(e.entityKey);
      if (!repo) continue;
      const delta = e.kind === 'pr_opened' ? 1 : e.kind === 'pr_completed' || e.kind === 'pr_abandoned' ? -1 : 0;
      live.set(repo, (live.get(repo) ?? 0) + delta);
      peak.set(repo, Math.max(peak.get(repo) ?? 0, live.get(repo)!));
    }
    expect(peak.get('tide-gateway')).toBe(7);
    // tide-gateway serves three seats; harbor-console serves one.
    const assigneeOf = (key: CanonicalKey) => end.workItems.get(key)?.assigneeKey;
    const seatsServed = (repo: string) => new Set([...links].filter(([pr]) => repoOf.get(pr) === repo).flatMap(([, items]) => [...items].map(assigneeOf)));
    expect(seatsServed('tide-gateway').size).toBe(3);
    expect(seatsServed('harbor-console').size).toBe(1);
  });
});

// The DSL reads kinds, not SDLC names (17 W1-T2), so a v1 pack's own types (W3-T2) follow 03 §4's rules.
describe('fixture membership by kind', () => {
  const own: StateMapping = {
    version: 1, unknownStage: 'unknown',
    types: {
      Goal: { kind: 'feature', role: 'container', states: { Open: { category: 'InProgress', stage: 'x.open' } } },
      Chore: { kind: 'story', role: 'objective', states: { Open: { category: 'Proposed', stage: 'x.open' } } },
      Snag: { kind: 'bug', role: 'threat', states: { Open: { category: 'Proposed', stage: 'x.open' } } },
      Note: { kind: 'task', role: 'step', states: { Open: { category: 'Proposed', stage: 'x.open' } } },
    },
  };
  const s = scenario('kinds', { project: 'Kestrel Yard', tz: 'UTC', range: ['2026-09-28T00:00:00Z', '2026-10-05T00:00:00Z'] })
    .area('Kestrel Yard', 1).area('Kestrel Yard\\Shed', 2, { favorite: true, defaultScope: true })
    .iteration('Kestrel Yard\\Week 1', 3, '2026-09-28T00:00:00Z', '2026-10-05T00:00:00Z')
    .person('ada', 'Ada Penhallow')
    .at('2026-09-28T09:00:00Z')
    .item('Goal', 1, 'Tidy the yard', { area: 'Kestrel Yard\\Shed', state: 'Open' })
    .item('Chore', 2, 'Sweep', { parent: 1, iteration: 'Kestrel Yard\\Week 1', assignee: 'ada', state: 'Open' })
    .item('Snag', 3, 'Broken hinge', { parent: 1, iteration: 'Kestrel Yard\\Week 1', state: 'Open' })
    .item('Note', 4, 'Buy a broom', { parent: 2, iteration: 'Kestrel Yard\\Week 1', state: 'Open' })
    .build();
  const ids = (h: ScopeHistory) => h.entities.workItems.map((w) => Number(w.key.split(':').pop())).sort();

  it('takes a sprint\'s roots by kind story or bug, then their steps and containers', () => {
    expect(ids(toHistory(s, own, sprintScopes(s)[0]!))).toEqual([1, 2, 3, 4]);
  });
  it('takes an area\'s roots by kind feature', () => {
    expect(ids(toHistory(s, own))).toEqual([1, 2, 3, 4]);
    // Under SDLC's mapping these types are unknown kinds, so nothing is a root.
    expect(ids(toHistory(s, mapping))).toEqual([]);
  });
});
