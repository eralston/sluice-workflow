// 23 D4-D6: Todo and CRM regions play and count from their board facts (not v0's User Story / Bug
// membership), the chrome speaks each pack's own words, and a fixture sprint loads its whole dates.
import { describe, expect, it } from 'vitest';
import crmQuarter from '@fixtures/scenarios/v1/crm-quarter';
import todoWeek from '@fixtures/scenarios/v1/todo-week';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import { chromeWords } from '@shared/hierarchy/chrome';
import { SOLAR } from '@shared/hierarchy/solar';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { buildScene, sceneEntityKeys } from '@shared/playback/highlights';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { mapping } from '../golden/helpers';
import { fixtureIterations, fixtureProjects, fixtureFavorites, loadFixtureHistory, setFixtureParadigm } from '../../src/main/fixtures';
import '@shared/packs/all';

const bundle = (s: Scenario, sprintEnd: string): ScopeHistory => {
  const scope = sprintScopes(s).find((x) => x.sprint.endsWith(sprintEnd))!;
  return toHistory(s, s.mapping ?? mapping, scope);
};
const regionsOf = (h: ScopeHistory) => (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []);

describe('a fixture pack’s region plays its own items (D4)', () => {
  for (const [name, s, last, itemType] of [['CRM', crmQuarter, 'Q3 2026', 'Deal'], ['Todo', todoWeek, 'Week 41', 'Todo']] as const) {
    it(`${name}: the region’s scene keys hold its items and the round’s hold every region’s`, () => {
      const h = bundle(s, last);
      const types = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
      for (const pod of regionsOf(h)) {
        const keys = sceneEntityKeys(h, SOLAR.format({ level: 'pod', key: pod.areaKey }), SOLAR)!;
        const items = [...keys].filter((k) => types.get(k) === itemType);
        expect(keys.has(pod.areaKey)).toBe(true);
        // North/House own items; the second region may hold few, but never a key from the first.
        if (pod === regionsOf(h)[0]) expect(items.length).toBeGreaterThan(3);
      }
      const round = sceneEntityKeys(h, SOLAR.format({ level: 'sprint', key: (h.scope.sector as { iterationKey: string }).iterationKey as never }), SOLAR)!;
      expect(round.size).toBeGreaterThan(regionsOf(h).length);
    });

    it(`${name}: the first region has beats to play`, () => {
      const h = bundle(s, last);
      const pod = regionsOf(h)[0]!;
      const sched = buildScene(h, h.range, 'UTC', SOLAR.format({ level: 'pod', key: pod.areaKey }), SOLAR);
      expect(sched.beats.length).toBeGreaterThan(0);
    });
  }

  it('SDLC keeps Sprints’ own membership, byte for byte (ADO mode is untouched)', () => {
    const h = bundle(podSprint, 'Sprint 13');
    for (const pod of regionsOf(h)) {
      const ref = { level: 'pod', key: pod.areaKey };
      const solar = SOLAR.resolve(SOLAR.format(ref))!.def.sceneKeys(h, ref)!;
      const legacy = SPRINTS.resolve(SPRINTS.format(ref))!.def.sceneKeys(h, ref)!;
      expect([...solar].sort()).toEqual([...legacy].sort());
    }
  });
});

describe('the chrome speaks the pack’s words (D5)', () => {
  it('names the round and the region per pack; SDLC keeps the Sprints words', () => {
    expect(chromeWords(bundle(podSprint, 'Sprint 13'))).toMatchObject({ round: 'Sprint', rounds: 'Sprints', region: 'Area Path', regionSentence: 'Area path' });
    expect(chromeWords(bundle(crmQuarter, 'Q3 2026'))).toMatchObject({ round: 'Quarter', rounds: 'Quarters', region: 'Territory' });
    expect(chromeWords(bundle(todoWeek, 'Week 41'))).toMatchObject({ round: 'Week', rounds: 'Weeks', region: 'List' });
    expect(chromeWords(null).round).toBe('Sprint');
  });

  it('the hierarchy’s labels, breadcrumb words and enter words follow the bundle’s pack', () => {
    const h = bundle(crmQuarter, 'Q3 2026');
    const sector = h.scope.sector as unknown as { iterationKey: never };
    const snap = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
    const pod = regionsOf(h)[0]!;
    expect(SOLAR.labelOf(snap, h, { level: 'sprint', key: sector.iterationKey })?.typeName).toBe('Quarter');
    expect(SOLAR.labelOf(snap, h, { level: 'pod', key: pod.areaKey })?.typeName).toBe('Territory');
    const [round, region] = SOLAR.levels;
    expect(round!.vocab.typeLabel({ level: 'sprint', key: sector.iterationKey }, undefined, h)).toBe('Quarter');
    expect(round!.vocab.pill?.({ level: 'sprint', key: sector.iterationKey }, h)).toBe('Quarter');
    expect(round!.vocab.playNounFor?.(h)).toBe('quarter');
    expect(region!.vocab.enter.ado(undefined, h)).toBe('Open Territory ›');
    // No bundle: the Sprints words, as before.
    expect(round!.vocab.typeLabel({ level: 'sprint', key: sector.iterationKey })).toBe('Sprint');
  });
});

describe('a fixture sprint loads its whole dates (D6)', () => {
  it('the CRM quarter ends at the quarter’s end, whatever the default scenario’s week is', () => {
    setFixtureParadigm('solar');
    const project = fixtureProjects().find((p) => p.name === 'Larch & Pine Trading')!;
    const q3 = fixtureIterations(project.key).find((i) => i.label === 'Q3 2026')!;
    const sector = { kind: 'sprint' as const, iterationKey: q3.key, path: q3.path, startUtc: q3.startUtc, finishUtc: q3.finishUtc,
      pods: fixtureFavorites(project.key).map((f) => ({ areaKey: f.areaKey, path: f.path, label: f.label })) };
    // What the renderer now asks for: the sprint's whole dates.
    const h = loadFixtureHistory({ projectKey: project.key, sector } as never, { startUtc: q3.startUtc, endUtc: q3.finishUtc });
    expect(h.range).toEqual({ startUtc: q3.startUtc, endUtc: q3.finishUtc });
    expect(new Date(h.range.endUtc).toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
});
