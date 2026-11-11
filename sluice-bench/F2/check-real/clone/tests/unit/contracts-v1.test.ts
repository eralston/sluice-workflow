// v1 contracts (14 §2, 17 W0-T1): every new optional field survives zod on both sides of IPC (zod
// strips unknown keys, so an undeclared field would vanish silently), v0 bundles parse unchanged,
// the settings file round-trips, and the solar layout's stub draws through projectScene.
import { GEOMETRY } from '@shared/engine/solar/version';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import { paradigmSchema, scopeHistorySchema, stateMappingSchema } from '@shared/contracts/ipc';
import {
  defaultUserSettings, mergeUserSettings, userSettingsPatchSchema, userSettingsSchema, type UserSettings,
} from '@shared/contracts/settings';
import { emptyRoundFacts } from '@shared/engine/types';
import { chain, type HierarchyRest } from '@shared/hierarchy/chain';
import { SPRINTS } from '@shared/hierarchy/sprints';
import type { Hierarchy, LevelDef } from '@shared/hierarchy/types';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import orbitWeek from '../../fixtures/generated/orbit-week.history.json';
import { mapping } from '../golden/helpers';

/** The generated bundles copy the mapping file's `$comment` notes, which zod (rightly) drops. */
function uncommented<T>(v: T): T {
  if (Array.isArray(v)) return v.map(uncommented) as T;
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => k !== '$comment').map(([k, x]) => [k, uncommented(x)])) as T;
}
const v0 = uncommented(orbitWeek as unknown as ScopeHistory);

/** A bundle carrying every v1 field: a pack id, roles, rungs with every flag, and the entity mapping. */
function v1Bundle(): ScopeHistory {
  const types = Object.fromEntries(Object.entries(v0.stateMapping.types).map(([type, t]) => [type, {
    ...t,
    role: t.kind === 'story' ? 'objective' as const : t.kind === 'bug' ? 'threat' as const : t.kind === 'task' ? 'step' as const : 'container' as const,
    states: Object.fromEntries(Object.entries(t.states).map(([state, s], i) => [state, {
      ...s, rung: 'underway' as const, sketch: i % 2 === 0, step: (i % 5) / 4, deferred: i === 1, ghost: i === 2, strike: i === 3,
    }])),
  }]));
  return {
    ...v0,
    domainPack: 'todo',
    stateMapping: {
      ...v0.stateMapping, types,
      entities: {
        facility: { noun: 'shelf' },
        attachment: { states: {
          active: { category: 'InProgress', stage: 'flight.active', rung: 'underway' },
          completed: { category: 'Completed', stage: 'flight.completed', rung: 'accomplished' },
          abandoned: { category: 'Removed', stage: 'flight.abandoned', rung: 'off', ghost: true },
        } },
      },
    },
  };
}

describe('v1 bundle fields cross IPC (14 §2.1)', () => {
  it('a v0 bundle parses to exactly itself: no v1 key appears', () => {
    expect(scopeHistorySchema.parse(v0)).toEqual(v0);
    expect('domainPack' in scopeHistorySchema.parse(v0)).toBe(false);
  });

  it('every v1 field round-trips: domainPack, role, rung and flags, entities', () => {
    const h = v1Bundle();
    const parsed = scopeHistorySchema.parse(JSON.parse(JSON.stringify(h)));
    expect(parsed).toEqual(h);
    expect(parsed.domainPack).toBe('todo');
    const story = Object.values(parsed.stateMapping.types).find((t) => t.kind === 'story')!;
    expect(story.role).toBe('objective');
    expect(Object.values(story.states)[0]).toMatchObject({ rung: 'underway', sketch: true, step: 0 });
    expect(parsed.stateMapping.entities?.attachment?.states.abandoned).toEqual({ category: 'Removed', stage: 'flight.abandoned', rung: 'off', ghost: true });
  });

  it('a partial attachment mapping is fine; an unknown role or rung, or a bad pack id, is refused', () => {
    const h = v1Bundle();
    const partial = { ...h, stateMapping: { ...h.stateMapping, entities: { attachment: { states: { active: { category: 'InProgress', stage: 'flight.active' } } } } } };
    expect(scopeHistorySchema.parse(partial)).toEqual(partial);
    const [type, t] = Object.entries(h.stateMapping.types).find(([, x]) => Object.keys(x.states).length)!;
    expect(() => scopeHistorySchema.parse({ ...h, stateMapping: { ...h.stateMapping, types: { [type]: { ...t, role: 'boss' } } } })).toThrow();
    const [state, s] = Object.entries(t.states)[0]!;
    expect(() => scopeHistorySchema.parse({ ...h, stateMapping: { ...h.stateMapping, types: { [type]: { ...t, states: { [state]: { ...s, rung: 'done' } } } } } })).toThrow();
    for (const bad of ['', 'SDLC', '9lives', 'a'.repeat(41), 'has space']) expect(() => scopeHistorySchema.parse({ ...h, domainPack: bad }), bad).toThrow();
    for (const ok of ['sdlc', 'todo', 'crm', 'a-1', 'a'.repeat(40)]) expect(scopeHistorySchema.parse({ ...h, domainPack: ok }).domainPack).toBe(ok);
  });

  it('the schema and the TypeScript mapping agree both ways', () => {
    expectTypeOf<z.infer<typeof stateMappingSchema>>().toExtend<StateMapping>();
    expectTypeOf<StateMapping>().toExtend<z.infer<typeof stateMappingSchema>>();
  });

  it('the paradigm takes solar, and nothing else new', () => {
    expect(paradigmSchema.options).toEqual(['sprints', 'backlog', 'solar']);
    expect(() => paradigmSchema.parse('v1')).toThrow();
  });
});

describe('user settings (14 §2.9)', () => {
  const full: UserSettings = {
    version: 1, theme: 'star-chart', achievements: false,
    viewer: { 'org-a': 'id:org-a:0000-viewer', 'org-b': null },
    captain: { 'org-a': { faction: 'mecha', hull: 2, colourway: 7 }, 'org-b': null },
  };

  it('defaults and a full file round-trip', () => {
    expect(userSettingsSchema.parse(defaultUserSettings())).toEqual(defaultUserSettings());
    expect(userSettingsSchema.parse(JSON.parse(JSON.stringify(full)))).toEqual(full);
    expectTypeOf<z.infer<typeof userSettingsSchema>>().toEqualTypeOf<UserSettings>();
  });

  it('refuses a viewer given by name, a bad faction, or another version', () => {
    expect(() => userSettingsSchema.parse({ ...full, viewer: { 'org-a': 'Ava Lindqvist' } })).toThrow();
    expect(() => userSettingsSchema.parse({ ...full, captain: { 'org-a': { faction: 'pirate', hull: 0, colourway: 0 } } })).toThrow();
    expect(() => userSettingsSchema.parse({ ...full, version: 2 })).toThrow();
  });

  it('a patch merges per tenant and keeps the rest', () => {
    const patch = userSettingsPatchSchema.parse({ viewer: { 'org-b': 'id:org-b:0000-other' } });
    expect(mergeUserSettings(full, patch)).toEqual({ ...full, viewer: { 'org-a': 'id:org-a:0000-viewer', 'org-b': 'id:org-b:0000-other' } });
    expect(mergeUserSettings(full, { achievements: true }).achievements).toBe(true);
    expect(() => userSettingsPatchSchema.parse({ version: 1, viewer: { x: 'Nobody' } })).toThrow();
  });
});

describe('the solar layout arm (14 §2.5, stub)', () => {
  const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
  const h = toHistory(sprintMechanics, mapping, scope);
  const pod = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods[0]!.areaKey : null;
  const podDef = SPRINTS.levels[1]!;
  if (podDef.layout !== 'system' || !pod) throw new Error('sprint-mechanics: expected a pod system level and a pod');
  const rest: HierarchyRest = {
    sceneForScope: SPRINTS.sceneForScope, pathTo: SPRINTS.pathTo, labelOf: SPRINTS.labelOf, focusOf: SPRINTS.focusOf,
    closeUpOf: SPRINTS.closeUpOf, stageOf: SPRINTS.stageOf, uncharted: SPRINTS.uncharted, rankOf: SPRINTS.rankOf, vocab: SPRINTS.vocab,
  };
  /** SPRINTS with its pod level drawn by the solar layout. (Its boot fallback was removed in W3-T3.) */
  const solarChain = (): Hierarchy => {
    const solar: LevelDef = {
      ...podDef, layout: 'solar',
      source: { center: podDef.source.center, facts: () => emptyRoundFacts(h.range, pod) },
    };
    return chain('solar-test').then(SPRINTS.levels[0]!).then(solar).then(SPRINTS.levels[2]!).build(rest);
  };
  const scene = SPRINTS.format({ level: 'pod', key: pod });
  const s = snapshotAt(h, h.range.endUtc - 1, 'knownThen');

  it('with empty facts, a region draws its star alone, at the centre', () => {
    const g = projectScene(h, s, scene, LAYOUT_VERSION, solarChain());
    expect(g.nodes.map((n) => [n.canonicalKey, n.kind, n.world])).toEqual([[pod, 'star', { x: 0, y: 0, r: GEOMETRY.starR }]]);
    expect(g.edges).toEqual([]);
  });
});
