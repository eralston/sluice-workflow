// Domain packs (14 §1.2, §8; 17 W1-T1, W3-T2): `packs/all.ts` registers SDLC, which reads every
// unnamed bundle, and the fixture-only Todo and CRM packs. Every type has a role and every state a
// rung; a pack's words fill every role, level and rung in the source register; terminology falls
// back to the engine's words; SDLC's container links are read-only ADO pages only (INV-21). The Todo
// and CRM scenarios name their pack, reuse v0 stage keys on the ladder, list in fixture mode under
// Solar only, and project as solar systems.
import { afterAll, describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import crmQuarter from '@fixtures/scenarios/v1/crm-quarter';
import todoWeek from '@fixtures/scenarios/v1/todo-week';
import { resolveSector, scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import { scopeHistorySchema, stateMappingSchema } from '@shared/contracts/ipc';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { achievementsFor } from '@shared/engine/achievements';
import { movesOf } from '@shared/engine/moves';
import { attachmentSignal, resolveRole, resolveSignal, signalOfStage } from '@shared/engine/signal';
import { describeMoves, ENGINE_WORDS, terminology } from '@shared/engine/terminology';
import type { DomainPack, LevelWord, Role, Rung } from '@shared/engine/types';
import { SOLAR } from '@shared/hierarchy/solar';
import { solarSource } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { PACKS, registerAllPacks } from '@shared/packs/all';
import { crmPack } from '@shared/packs/crm';
import { allPacks, packById, packFor } from '@shared/packs/registry';
import { sdlcPack } from '@shared/packs/sdlc';
import { todoPack } from '@shared/packs/todo';
import { describeEvent } from '@shared/playback/describe';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { fixtureFavorites, fixtureIterations, fixtureProjects, loadFixtureHistory, setFixtureParadigm } from '../../src/main/fixtures';
import { mapping } from '../golden/helpers';

const ROLES: Role[] = ['objective', 'threat', 'step', 'container', 'facility', 'attachment', 'guard'];
const LEVELS: LevelWord[] = ['workspace', 'round', 'region', 'seat', 'frontier'];
const RUNGS: Rung[] = ['ready', 'underway', 'nearing', 'accomplished', 'off'];

const k = scenarioKeys(sprintMechanics);
const S41 = toHistory(sprintMechanics, mapping, sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!);

describe('the pack registry, filled', () => {
  it('registers SDLC on import, and reads an unnamed bundle with it', () => {
    expect(packById('sdlc')).toBe(sdlcPack);
    expect(packFor(S41)).toBe(sdlcPack);
    expect(S41.domainPack).toBeUndefined(); // AC-27: SDLC bundles never name their pack
    expect(allPacks().map((p) => p.id)).toEqual(PACKS.map((p) => p.id).sort());
    registerAllPacks(); // idempotent
    expect(allPacks()).toHaveLength(PACKS.length);
  });

  it('every pack has unique, well-formed ids and a complete shape', () => {
    const ids = PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PACKS) {
      expect(p.id).toMatch(/^[a-z][a-z0-9-]{0,39}$/);
      expect(p.adapter.id).toBe(p.id);
      expect(p.title).not.toBe('');
    }
  });
});

describe('the SDLC pack', () => {
  it('every SDLC type has a role, and every state a rung', () => {
    for (const [type, t] of Object.entries(mapping.types)) {
      expect(t.role, type).toBeDefined();
      expect(resolveRole(mapping, type)).toBe(t.role);
      for (const [state, s] of Object.entries(t.states)) expect(s.rung, `${type} ${state}`).toBeDefined();
    }
    for (const status of ['active', 'completed', 'abandoned'] as const) expect(mapping.entities?.attachment?.states[status]?.rung).toBeDefined();
    // Every role the board draws is some type's (facility and attachment come from repos and PRs).
    const roles = new Set(Object.values(mapping.types).map((t) => t.role));
    for (const r of ['objective', 'threat', 'step', 'container'] as const) expect(roles.has(r)).toBe(true);
  });

  it('has its thresholds (18 §5: 3 working days of 12 hours, K = 2)', () => {
    expect(sdlcPack.thresholds).toEqual({ swiftDays: 3, wipK: 2, dayHours: 12 });
    expect(sdlcPack.mapping).toBeUndefined(); // its bundles carry config/state-mapping.json
  });

  it('names every role, level and rung in the source register', () => {
    for (const r of ROLES) expect(sdlcPack.words.role[r]?.one, r).toBeTruthy();
    for (const l of LEVELS) expect(sdlcPack.words.level[l].one, l).toBeTruthy();
    for (const r of RUNGS) expect(sdlcPack.words.rung[r], r).toBeTruthy();
    expect(sdlcPack.words.source).toBe('Azure DevOps');
  });

  it('reads moves through its adapter', () => {
    expect(movesOf(S41, sdlcPack).size).toBe(S41.events.length);
  });
});

describe('terminology', () => {
  it('the source register speaks the pack’s words', () => {
    const t = terminology(sdlcPack, 'source');
    expect(t.register).toBe('source');
    expect(t.noun('objective')).toBe('User Story');
    expect(t.noun('objective', 2)).toBe('User Stories');
    expect(t.noun('agent')).toBe('person');
    expect(t.level('round')).toBe('Sprint');
    expect(t.rung('accomplished')).toBe('Closed');
    expect(t.typeName('Bug')).toBe('Bug');
  });

  it('the chart register speaks the theme’s words, and the engine’s where the theme is silent', () => {
    const chart = { role: { objective: { one: 'boulder', many: 'boulders' } }, agent: { one: 'pilot', many: 'pilots' }, rung: { ...ENGINE_WORDS.rung, off: 'Dark' } };
    const t = terminology(sdlcPack, 'chart', { chart, mapping });
    expect(t.noun('objective')).toBe('boulder');
    expect(t.noun('threat', 3)).toBe('threats');
    expect(t.noun('agent')).toBe('pilot');
    expect(t.level('round')).toBe('round');
    expect(t.rung('off')).toBe('Dark');
    expect(t.typeName('User Story')).toBe('boulder');
    expect(t.typeName('Task')).toBe('step');
    expect(t.typeName('Spike')).toBe('Spike'); // a type the mapping doesn't know keeps its name
    // With no theme words and no mapping, the engine's words throughout.
    const bare = terminology(sdlcPack, 'chart');
    expect(ROLES.map((r) => bare.noun(r))).toEqual(ROLES.map((r) => ENGINE_WORDS.role[r].one));
    expect(bare.typeName('Bug')).toBe('Bug');
  });

  it('the adapter writes v0’s line in the source register, and the neutral line in the chart register', () => {
    const types = new Map(S41.entities.workItems.map((w) => [w.key, w.type]));
    const src = terminology(sdlcPack, 'source');
    const chart = terminology(sdlcPack, 'chart', { mapping });
    const moves = movesOf(S41, sdlcPack);
    // Titles are the source's data and may say anything ("…a Task…"): the register's own words are checked.
    const titles = S41.events.flatMap((e) => (e.kind === 'wi_created' ? [e.payload.title] : e.kind === 'wi_title_changed' ? [e.payload.to] : e.kind === 'pr_opened' ? [e.payload.title] : []));
    const ownWords = (text: string) => titles.reduce((t, title) => t.split(title).join('…'), text);
    for (const e of S41.events) {
      expect(sdlcPack.adapter.describe(S41, e, moves.get(e.eventKey)!, src)).toEqual(describeEvent(S41, e, (key) => types.get(key) ?? 'Item'));
      const line = sdlcPack.adapter.describe(S41, e, moves.get(e.eventKey)!, chart);
      expect(ownWords(line.text)).not.toMatch(/User Story|Bug|Task|Feature|Pull Request|\bPR\b/);
      expect(line).toEqual(describeMoves(S41, e, moves.get(e.eventKey)!, chart));
    }
    const created = S41.events.find((e) => e.kind === 'wi_created' && e.entityKey === k.wi(9104))!;
    expect(sdlcPack.adapter.describe(S41, created, moves.get(created.eventKey)!, chart).text)
      .toBe('New objective #9104 for Maren Solis · Week view for the calendar');
    const merged = S41.events.find((e) => e.kind === 'pr_completed')!;
    expect(sdlcPack.adapter.describe(S41, merged, moves.get(merged.eventKey)!, chart).text).toBe('attachment #9501 Accomplished');
  });
});

describe('container links (INV-21)', () => {
  const withUrls = (project: string, item = ''): ScopeHistory => ({
    ...S41,
    entities: {
      ...S41.entities,
      projects: S41.entities.projects.map((p) => ({ ...p, adoUrl: project })),
      workItems: S41.entities.workItems.map((w) => (w.key === k.wi(9001) ? { ...w, adoUrl: item } : w)),
    },
  });

  it('is null for a fixture bundle, which has no web addresses', () => {
    expect(sdlcPack.containerUrl!(S41, k.wi(9001))).toBeNull();
  });

  it('is the item’s own ADO page, or one built from the project’s org', () => {
    expect(sdlcPack.containerUrl!(withUrls('', 'https://dev.azure.com/fixture-org/_workitems/edit/9001'), k.wi(9001)))
      .toBe('https://dev.azure.com/fixture-org/_workitems/edit/9001');
    expect(sdlcPack.containerUrl!(withUrls('https://dev.azure.com/fixture-org/halcyon'), k.wi(9001)))
      .toBe('https://dev.azure.com/fixture-org/_workitems/edit/9001');
  });

  it('is never anything but an ADO page, and only for work items', () => {
    expect(sdlcPack.containerUrl!(withUrls('https://example.test/fixture-org', 'javascript:alert(1)'), k.wi(9001))).toBeNull();
    expect(sdlcPack.containerUrl!(withUrls('http://dev.azure.com/fixture-org'), k.wi(9001))).toBeNull();
    expect(sdlcPack.containerUrl!(withUrls('https://dev.azure.com.example.test/x'), k.wi(9001))).toBeNull();
    expect(sdlcPack.containerUrl!(withUrls('https://dev.azure.com/fixture-org'), k.repo('booking-web'))).toBeNull();
  });
});

// ---- The fixture-only demo packs (17 W3-T2) ----

interface Demo {
  s: Scenario; pack: DomainPack; workspace: string; round: string;
  /** The default region and the round's other one. */
  regions: [string, string];
  /** Each role's one type (17 W3-T2 notes) and its v0 kind. */
  types: Partial<Record<Role, { type: string; kind: string }>>;
  viewer: string; seats: string[];
  /** What the viewer earns by design (the scenario's header). */
  awards: string[];
}

const DEMOS: Demo[] = [
  {
    s: todoWeek, pack: todoPack, workspace: 'Juniper Household', round: 'Week 41', regions: ['House', 'Garden'],
    types: { objective: { type: 'Todo', kind: 'story' }, threat: { type: 'Problem', kind: 'bug' }, step: { type: 'Checklist Item', kind: 'task' } },
    viewer: 'hazel', seats: ['hazel', 'bram', 'odette'],
    awards: ['clear-skies', 'hat-trick-landings', 'swift-passage', 'steady-hands', 'clean-landing', 'wingman'],
  },
  {
    s: crmQuarter, pack: crmPack, workspace: 'Larch & Pine Trading', round: 'Q3 2026', regions: ['North Territory', 'Coastal Territory'],
    types: { objective: { type: 'Deal', kind: 'story' }, threat: { type: 'Escalation', kind: 'bug' }, step: { type: 'Follow-up', kind: 'task' } },
    viewer: 'imelda', seats: ['imelda', 'caspian', 'noor'],
    awards: ['clear-skies', 'hat-trick-landings', 'steady-hands', 'clean-landing', 'wingman'],
  },
];

const CATEGORIES = new Set(['Proposed', 'InProgress', 'Resolved', 'Completed', 'Removed']);
const roundScope = (d: Demo) => sprintScopes(d.s).find((x) => x.sprint.endsWith(`\\${d.round}`))!;
const roundOf = (d: Demo): ScopeHistory => toHistory(d.s, d.s.mapping!, roundScope(d));
const podsOf = (h: ScopeHistory) => (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []);
const typesIn = (m: StateMapping) => Object.keys(m.types);

describe.each(DEMOS)('the $pack.id pack and its scenario', (d) => {
  const h = roundOf(d);
  const k = scenarioKeys(d.s);

  it('is registered, and its scenario names it and carries its mapping', () => {
    expect(packById(d.pack.id)).toBe(d.pack);
    expect(d.s.pack).toBe(d.pack.id);
    expect(d.s.mapping).toBe(d.pack.mapping);
    expect(h.domainPack).toBe(d.pack.id);
    expect(h.stateMapping).toBe(d.pack.mapping);
    expect(packFor(h)).toBe(d.pack);
    expect(stateMappingSchema.safeParse(d.pack.mapping).success).toBe(true);
    expect(scopeHistorySchema.safeParse(h).success).toBe(true);
  });

  it('every type has a role, and every state a rung that reads as its v0 stage does', () => {
    const m = d.pack.mapping!;
    expect(typesIn(m).sort()).toEqual(Object.values(d.types).map((t) => t.type).sort());
    for (const [role, { type, kind }] of Object.entries(d.types)) {
      expect(m.types[type]?.kind, type).toBe(kind);
      expect(resolveRole(m, type)).toBe(role);
    }
    for (const [type, t] of Object.entries(m.types)) {
      expect(Object.keys(t.states).length, type).toBeGreaterThan(3);
      for (const [state, s] of Object.entries(t.states)) {
        expect(s.rung, `${type} ${state}`).toBeDefined();
        expect(state.length, state).toBeLessThanOrEqual(16);
        expect(CATEGORIES.has(s.category), `${type} ${state}`).toBe(true);
        // States reuse v0 stage keys, so a v0 view and the ladder agree on every one.
        expect(resolveSignal(m, type, state), `${type} ${state}`).toEqual(signalOfStage(s.stage));
        expect(resolveSignal(m, type, state).unknown).toBeUndefined();
      }
      // Every rung is somewhere on each placed type's ladder.
      if (t.role !== 'step') expect(new Set(Object.values(t.states).map((s) => s.rung)).size, type).toBe(5);
    }
    for (const status of ['active', 'completed', 'abandoned'] as const) {
      expect(attachmentSignal(m, status)).toEqual(signalOfStage(m.entities!.attachment!.states[status]!.stage));
    }
  });

  it('names every role it uses, every level and every rung in the source register', () => {
    for (const r of ['objective', 'threat', 'step', 'facility', 'attachment', 'guard'] as const) expect(d.pack.words.role[r]?.one, r).toBeTruthy();
    for (const l of LEVELS) expect(d.pack.words.level[l].one, l).toBeTruthy();
    for (const r of RUNGS) expect(d.pack.words.rung[r], r).toBeTruthy();
    expect(d.pack.words.source).toBeTruthy();
    expect(d.pack.containerUrl).toBeUndefined(); // no containers, and no source to open
    // Its own thresholds (18 §5 A6).
    expect(d.pack.thresholds).not.toEqual(sdlcPack.thresholds);
  });

  it('serves a round with every event mapped, inside its id ranges, with invented people only', () => {
    expect(h.events.length).toBeGreaterThan(40);
    expect(movesOf(h, d.pack).size).toBe(h.events.length);
    const base = d.pack.id === 'todo' ? 30000 : 40000;
    for (const w of h.entities.workItems) {
      const id = Number(w.key.split(':').pop());
      expect(id).toBeGreaterThanOrEqual(base);
      expect(id).toBeLessThan(base + 1000);
      expect(resolveRole(h.stateMapping, w.type), w.type).not.toBeNull();
    }
    for (const p of h.entities.prs) {
      const id = Number(p.key.split(':').pop());
      expect(id).toBeGreaterThanOrEqual(base + 1000);
      expect(id).toBeLessThan(base + 2000);
    }
    for (const e of h.events) {
      if (e.kind === 'wi_state_changed') {
        const type = h.entities.workItems.find((w) => w.key === e.entityKey)!.type;
        for (const state of [e.payload.from, e.payload.to]) expect(resolveSignal(h.stateMapping, type, state).unknown, `${type} ${state}`).toBeUndefined();
      }
    }
    // Every rung and off-ladder mark the ladder has is reached by some piece.
    const signals = h.events.flatMap((e) => movesOf(h, d.pack).get(e.eventKey)!).flatMap((m) => ('to' in m && typeof m.to === 'object' && m.to ? [m.to] : []));
    for (const r of RUNGS) expect(signals.some((x) => x.rung === r), r).toBe(true);
    for (const flag of ['sketch', 'deferred', 'ghost', 'strike'] as const) expect(signals.some((x) => x[flag]), flag).toBe(true);
  });

  it('describes events in its own words in the source register, and in the chart’s words in the chart register', () => {
    const src = terminology(d.pack, 'source');
    const chart = terminology(d.pack, 'chart', { mapping: h.stateMapping });
    const moves = movesOf(h, d.pack);
    const names = typesIn(h.stateMapping);
    let raw = 0;
    for (const e of h.events) {
      const mv = moves.get(e.eventKey)!;
      const line = d.pack.adapter.describe(h, e, mv, src);
      expect(line.text).not.toMatch(/User Story|\bBug\b|\bTask\b|Pull Request|\bPR\b/);
      if (e.kind === 'wi_state_changed') {
        expect(line.text).toContain(`${e.payload.from} → ${e.payload.to}`);
        raw++;
      }
      const c = d.pack.adapter.describe(h, e, mv, chart);
      expect(c).toEqual(describeMoves(h, e, mv, chart));
      for (const n of names) expect(c.text).not.toContain(n);
    }
    expect(raw).toBeGreaterThan(10);
  });

  it('projects each region of its round as a solar system at every quarter of the round', () => {
    expect(podsOf(h).map((p) => p.label)).toEqual(d.regions);
    for (const pod of podsOf(h)) {
      const ref = { level: 'pod', key: pod.areaKey } as const;
      const f = solarSource.facts(h, ref);
      const scene = SOLAR.format(ref);
      const kinds = new Set<string>();
      for (const q of [0, 0.25, 0.5, 0.75, 1]) {
        const t = Math.min(h.range.endUtc - 1, h.range.startUtc + q * (h.range.endUtc - h.range.startUtc));
        const g = projectScene(h, snapshotAt(h, t, 'knownThen'), scene as never, LAYOUT_VERSION, SOLAR);
        expect(g.solar, pod.label).toBeDefined();
        for (const n of g.nodes) kinds.add(n.kind);
      }
      if (pod.label === d.regions[0]) {
        // The default region: its three seats (all held from the first morning, so ordered by key), and every board kind.
        expect(f.seats).toEqual(d.seats.map((p) => k.person(p)).sort());
        for (const kind of ['star', 'seat', 'objective', 'threat', 'facility', 'captain']) expect(kinds.has(kind), kind).toBe(true);
      } else {
        expect(f.seats.length).toBeGreaterThan(0);
        expect(kinds.has('seat')).toBe(true);
      }
    }
  });

  it('gives its viewer the achievements the scenario is built for, under its own thresholds', () => {
    const [home] = podsOf(h);
    const f = solarSource.facts(h, { level: 'pod', key: home!.areaKey });
    const ids = achievementsFor(f, k.person(d.viewer), d.pack, { tz: d.s.tz }).map((a) => a.id);
    expect([...ids].sort()).toEqual([...d.awards].sort());
  });
});

describe('the CRM pack names who signed a quote off, in the source register', () => {
  it('reads the discount desk (an approver seated as a person) by name, joined in order', () => {
    const d = DEMOS.find((x) => x.pack === crmPack)!;
    const h = roundOf(d);
    const k = scenarioKeys(d.s);
    const src = terminology(d.pack, 'source');
    const moves = movesOf(h, d.pack);
    const line = (n: number) => {
      const e = h.events.find((x) => x.kind === 'pr_completed' && x.entityKey === k.pr(n))!;
      return d.pack.adapter.describe(h, e, moves.get(e.eventKey)!, src).text;
    };
    expect(line(41000)).toMatch(/ #41000 accepted, approved by Discount Desk$/);
    expect(line(41003)).toMatch(/ #41003 accepted, approved by Caspian Pine and Discount Desk$/);
  });
});

describe('fixture mode: the demo packs list under Solar only (17 A3)', () => {
  afterAll(() => setFixtureParadigm('backlog'));
  const names = () => fixtureProjects().map((p) => p.name);

  it('lists both workspaces under Solar, with their rounds and regions, and serves the round with its pack', () => {
    setFixtureParadigm('solar');
    for (const d of DEMOS) {
      expect(names()).toContain(d.workspace);
      const projectKey = scenarioKeys(d.s).project() as CanonicalKey;
      expect(fixtureIterations(projectKey).map((i) => i.label)).toContain(d.round);
      expect(fixtureFavorites(projectKey).map((f) => f.label)).toEqual(d.regions);
      const h = loadFixtureHistory({ projectKey, sector: resolveSector(d.s, roundScope(d)) }, d.s.range);
      expect(h.domainPack).toBe(d.pack.id);
      expect(h.events.length).toBe(roundOf(d).events.length);
    }
  });

  it('keeps them out of the v0 chains, which can’t read a pack', () => {
    for (const p of ['sprints', 'backlog'] as const) {
      setFixtureParadigm(p);
      for (const d of DEMOS) expect(names(), p).not.toContain(d.workspace);
    }
  });
});
