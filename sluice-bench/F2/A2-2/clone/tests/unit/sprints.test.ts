// The Sprints hierarchy (decided 2026-10-07): sprint → pods (saved Area Paths) → the Stories and Bugs
// each pod took into the sprint → their Tasks. Checked on sprint-mechanics (fixtures/scenarios/sprint-mechanics.ts).
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { WorkItemState } from '@shared/contracts/view';
import { crumbsOf } from '@shared/hierarchy/crumbs';
import { podStage, SPRINTS } from '@shared/hierarchy/sprints';
import { LAYOUT_VERSION } from '@shared/limits';
import { storyAnchors } from '@shared/playback/follow';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene, soleFeature } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const k = scenarioKeys(sprintMechanics);
const scopeOf = (sprint: string) => sprintScopes(sprintMechanics).find((x) => x.sprint === sprint)!;
const S41 = toHistory(sprintMechanics, mapping, scopeOf('Halcyon Reach\\Sprint 41'));
const S40 = toHistory(sprintMechanics, mapping, scopeOf('Halcyon Reach\\Sprint 40'));
const comet = k.area('Halcyon Reach\\Comet Pod');
const nova = k.area('Halcyon Reach\\Nova Pod');
const at = (iso: string) => Date.parse(iso);
const project = (h: typeof S41, scene: string, t: number) => projectScene(h, snapshotAt(h, t, 'knownThen'), scene as never, LAYOUT_VERSION, SPRINTS);
const sprintScene = SPRINTS.format(SPRINTS.sceneForScope(S41.scope));
const podScene = (pod: CanonicalKey) => SPRINTS.format({ level: 'pod', key: pod });
const planets = (g: ReturnType<typeof project>) => g.nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable).map((n) => n.canonicalKey).sort();

describe('the Sprints hierarchy', () => {
  it('a sprint’s range is its own dates, up to now; its stars are the pods, which open pod systems', () => {
    expect(S41.range.startUtc).toBe(at('2026-09-14T07:00:00Z'));
    expect(S41.range.endUtc).toBe(sprintMechanics.range.endUtc); // still running: up to the scenario's now
    const g = project(S41, sprintScene, S41.range.endUtc - 1);
    const stars = g.nodes.filter((n) => n.kind === 'star');
    expect(stars.map((n) => [n.label, n.zoomTo])).toEqual([['Comet Pod', podScene(comet)], ['Nova Pod', podScene(nova)]]);
    expect(soleFeature(S41, sprintScene, SPRINTS)).toBeNull(); // two pods: no pass-through
  });

  it('a pod holds the Stories and Bugs it took into the sprint: a Bug arrives mid-sprint, a Story leaves for the next', () => {
    const before = planets(project(S41, podScene(comet), at('2026-09-15T20:00:00Z')));
    const middle = planets(project(S41, podScene(comet), at('2026-09-17T00:00:00Z')));
    const end = planets(project(S41, podScene(comet), S41.range.endUtc - 1));
    expect(before).toEqual([k.wi(9103), k.wi(9104), k.wi(9105)].sort());
    expect(middle).toEqual([k.wi(9103), k.wi(9104), k.wi(9105), k.wi(9108)].sort()); // the Bug joined
    expect(end).toEqual([k.wi(9103), k.wi(9104), k.wi(9108)].sort()); // 9105 left for Sprint 42
    expect(planets(project(S41, podScene(nova), S41.range.endUtc - 1))).toEqual([k.wi(9106), k.wi(9107)].sort());
  });

  it('the pod\u2019s frame never moves on a seek (INV-14 as amended): bodies sit by who and stage, slots stay', () => {
    const g = (t: number) => project(S41, podScene(comet), t);
    const a = g(at('2026-09-17T00:00:00Z'));
    const b = g(S41.range.endUtc - 1);
    expect(a.board).toBeDefined();
    expect(a.board).toEqual(b.board);
    const slots = (x: typeof a) => new Map(x.nodes.filter((n) => n.kind === 'planet' || n.kind === 'anomaly').map((n) => [n.canonicalKey, n.slot]));
    for (const [key, slot] of slots(b)) if (slots(a).has(key)) expect(slot).toBe(slots(a).get(key));
  });

  it('the carry-over is in Sprint 40 at its end, and in Sprint 41 from its start', () => {
    expect(planets(project(S40, SPRINTS.format({ level: 'pod', key: comet }), S40.range.endUtc - 1))).toEqual([k.wi(9101), k.wi(9103)].sort());
    expect(planets(project(S41, podScene(comet), at('2026-09-14T16:00:00Z')))).toEqual([k.wi(9103)]);
  });

  it('a pod’s star climbs the ladder with its sprint: a sketch while empty, Underway once work is moving', () => {
    const star = (t: number) => project(S41, sprintScene, t).nodes.find((n) => n.canonicalKey === comet && n.kind === 'star')!;
    expect(star(at('2026-09-14T10:00:00Z')).stage).toBe('feature.faint'); // before the carry-over lands
    expect(star(at('2026-09-14T18:00:00Z')).stage).toBe('feature.active'); // the carry-over is still under way
    expect(star(at('2026-09-16T00:00:00Z')).stage).toBe('feature.active');
    expect(star(S41.range.endUtc - 1).meta).toBe('Area Path · 3 items · 1 done');
    const m = (category: string, rawState = '') => ({ category, rawState }) as WorkItemState;
    expect(podStage([])).toBe('feature.faint');
    expect(podStage([m('Completed'), m('Completed')])).toBe('feature.whiteDwarf');
    expect(podStage([m('Completed'), m('Completed'), m('Completed'), m('InProgress', 'Resolved')])).toBe('feature.accept');
    expect(podStage([m('Proposed'), m('Proposed')])).toBe('feature.ready');
    expect(podStage([m('Proposed'), m('InProgress', 'Active')])).toBe('feature.active');
  });

  it('a member’s label leads with its type and carries its Feature', () => {
    const n = project(S41, podScene(comet), S41.range.endUtc - 1).nodes.find((x) => x.canonicalKey === k.wi(9104) && x.selectable)!;
    expect(n.meta).toBe('User Story · #9104 · Active · Booking calendar');
  });

  it('walks its family: a Task leads to its pod and its Story; following travels to the pod', () => {
    const end = snapshotAt(S41, S41.range.endUtc - 1, 'knownThen');
    expect(SPRINTS.pathTo(end, k.wi(9201), S41)).toEqual([{ level: 'pod', key: comet }, { level: 'body', key: k.wi(9104) }]);
    expect(SPRINTS.pathTo(end, comet, S41)).toEqual([{ level: 'pod', key: comet }]);
    expect(SPRINTS.labelOf(end, S41, { level: 'pod', key: comet })).toEqual({ label: 'Comet Pod', typeName: 'Area Path' });
    const teo = storyAnchors(S41, k.person('teo'), 'knownThen', SPRINTS);
    expect(teo.length).toBeGreaterThan(0);
    for (const a of teo.filter((x) => x.stage)) expect(a.stage).toBe(comet);
    expect(buildBeatSchedule(S41, S41.range, sprintMechanics.tz, { hier: SPRINTS }).beats.length).toBeGreaterThan(0);
  });

  it('builds its breadcrumb: the project, the sprint as the pill, then the pod', () => {
    const scope = { projectKey: S41.scope.projectKey };
    const crumbs = crumbsOf([
      { sceneKey: 'galaxy', label: 'All projects' },
      { sceneKey: sprintScene, scope, label: 'Sprint 41', typeLabel: 'Sprint' },
      { sceneKey: podScene(comet), scope, label: 'Comet Pod', typeLabel: 'Area Path' },
    ], [{ key: S41.scope.projectKey, name: 'Halcyon Reach' }], SPRINTS);
    expect(crumbs.map((c) => [c.label, c.pill ?? null, c.glyph])).toEqual([
      ['All projects', null, ''], ['Halcyon Reach', null, ''], ['Sprint 41', 'Sprint', '◷ '], ['Comet Pod', null, '◇ '],
    ]);
  });
});
