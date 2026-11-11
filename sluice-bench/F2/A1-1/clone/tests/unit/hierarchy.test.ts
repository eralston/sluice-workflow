// The pluggable hierarchy (decided 2026-10-07): the scene key codec, the builder's checks, the pure
// breadcrumb, and a toy chain with levels the Backlog doesn't have, to show the layouts take any
// sources in any order.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { SceneKey } from '@shared/contracts/view';
import { BACKLOG, subtreeKeys } from '@shared/hierarchy/backlog';
import { chain } from '@shared/hierarchy/chain';
import { crumbsOf } from '@shared/hierarchy/crumbs';
import { formatScene, levelIdOf, parseScene } from '@shared/hierarchy/sceneKey';
import type { FieldSource, Hierarchy, LevelDef, RadarSource } from '@shared/hierarchy/types';
import { LAYOUT_VERSION, MAX_TASKS_PER_BODY } from '@shared/limits';
import { sceneEntityKeys } from '@shared/playback/highlights';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { slotOrder } from '@shared/scene/layout';
import { workNode } from '@shared/scene/project/ctx';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

describe('scene keys', () => {
  it('round-trip every Backlog scene, byte for byte (the sky is seeded from the key)', () => {
    for (const s of scenarios) for (const scope of scenarioScopes(s, mapping)) {
      const h = toHistory(s, mapping, scope);
      const sector = BACKLOG.format(BACKLOG.sceneForScope(h.scope));
      const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
      const keys = [sector, ...projectScene(h, end, sector, LAYOUT_VERSION).nodes.flatMap((n) => (n.zoomTo ? [n.zoomTo] : []))];
      for (const k of keys) {
        const at = BACKLOG.resolve(k)!;
        expect(BACKLOG.format(at.ref)).toBe(k);
        expect(levelIdOf(k)).toBe(at.def.id);
      }
    }
  });

  it('read canonical keys that contain colons, and refuse what the table does not know', () => {
    const table = new Map([['sector', { variants: ['area', 'epic'] }], ['feature', {}]]);
    const area = 'area:org:proj:123' as CanonicalKey;
    expect(parseScene(`sector:area:${area}`, table)).toEqual({ level: 'sector', variant: 'area', key: area });
    expect(parseScene('feature:wi:o:7', table)).toEqual({ level: 'feature', key: 'wi:o:7' });
    expect(parseScene('sector:team:x', table)).toBeNull(); // not a variant
    expect(parseScene('pod:x', table)).toBeNull(); // not a level here
    expect(parseScene('galaxy', table)).toBeNull(); // the root has no ref
    expect(formatScene({ level: 'sector', variant: 'epic', key: 'wi:o:51' as CanonicalKey })).toBe('sector:epic:wi:o:51');
  });
});

describe('the builder', () => {
  const field = BACKLOG.levels[0]!;
  const radar = BACKLOG.levels[2]!;
  const rest = { sceneForScope: BACKLOG.sceneForScope, pathTo: () => [], labelOf: () => null, focusOf: () => null, closeUpOf: () => ({ body: null, inScope: false }), stageOf: () => null, uncharted: () => [], rankOf: () => 0, vocab: BACKLOG.vocab };
  it('rejects a radar that isn’t last, a repeated id, and the root as a level', () => {
    expect(() => chain('x').then(radar).then(field).build(rest)).toThrow(/radar level must be last/);
    expect(() => chain('x').then(field).then(field).build(rest)).toThrow(/repeat/);
    expect(() => chain('x').then({ ...field, id: 'galaxy' }).build(rest)).toThrow(/root/);
  });
});

describe('the breadcrumb', () => {
  const projects = [{ key: 'proj:o:p' as CanonicalKey, name: 'Nimbus Deck' }];
  const scope = { projectKey: 'proj:o:p' as CanonicalKey };
  it('puts the project before the scope level and draws that level as the team pill', () => {
    const crumbs = crumbsOf([
      { sceneKey: 'galaxy', label: 'All projects' },
      { sceneKey: 'sector:area:area:o:p:1', scope, label: 'Comet Crew', typeLabel: 'Area Path' },
      { sceneKey: 'feature:wi:o:101', scope, label: 'Unified quote ledger', typeLabel: 'Feature' },
    ], projects, BACKLOG);
    expect(crumbs.map((c) => [c.label, c.type, c.glyph, c.pill ?? null, c.current])).toEqual([
      ['All projects', undefined, '', null, false],
      ['Nimbus Deck', 'Project', '', null, false],
      ['Comet Crew', 'Area Path', '◇ ', 'Team', false],
      ['Unified quote ledger', 'Feature', '', null, true],
    ]);
    expect(crumbs[0]!.back).toEqual({ kind: 'index', index: 0 });
    expect(crumbs[1]!.back).toEqual({ kind: 'project', projectKey: 'proj:o:p' });
    expect(crumbs[3]!.back).toBeUndefined();
  });
  it('sends a pass-through team’s name to its one system, and an Epic’s pill says Epic', () => {
    const crumbs = crumbsOf([
      { sceneKey: 'galaxy', label: 'All projects' },
      { sceneKey: 'sector:epic:wi:o:51', scope, label: 'Platform', typeLabel: 'Epic', passThrough: true },
      { sceneKey: 'feature:wi:o:101', scope, label: 'Ledger', typeLabel: 'Feature' },
      { sceneKey: 'body:wi:o:201', scope, label: 'Story', typeLabel: 'User Story' },
    ], projects, BACKLOG);
    const team = crumbs.find((c) => c.pill)!;
    expect(team.pill).toBe('Epic');
    expect(team.glyph).toBe('⬡ ');
    expect(team.back).toEqual({ kind: 'index', index: 2 });
  });
});

describe('a toy hierarchy', () => {
  // galaxy → shelf:<epic> (a field of the Epic's Stories, Tasks as their minis) → story:<key> (a radar of Tasks).
  const h = toHistory(scenarios.find((s) => s.name === 'orbit-week')!, mapping);
  const storiesUnder = (epic: CanonicalKey) => {
    const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
    return [...end.workItems.values()].filter((w) => {
      if (w.kind !== 'story') return false;
      const f = w.parentKey ? end.workItems.get(w.parentKey) : undefined;
      return f?.parentKey === epic;
    }).map((w) => w.key).sort();
  };
  const tasksOf = (key: CanonicalKey) => slotOrder(h, key).filter((k) => h.entities.workItems.find((w) => w.key === k)?.type === 'Task').slice(0, MAX_TASKS_PER_BODY);
  const shelf: FieldSource = {
    order: (_h, ref) => storiesUnder(ref.key),
    member: (ctx, _ref, key, pk) => { const wi = ctx.s.workItems.get(key); return wi ? workNode(ctx, pk, wi, 'star', { x: 0, y: 0, r: 0 }) : null; },
    miniOrder: (_h, key) => tasksOf(key),
    mini: (ctx, _key, child, pk) => { const wi = ctx.s.workItems.get(child); return wi ? workNode(ctx, pk, wi, 'planet', { x: 0, y: 0, r: 0 }) : null; },
  };
  const story: RadarSource = {
    center: (ctx, ref, pk) => { const wi = ctx.s.workItems.get(ref.key); return wi ? workNode(ctx, pk, wi, 'planet', { x: 0, y: 0, r: 0 }) : null; },
    spokes: (_h, ref) => tasksOf(ref.key),
    current: (ctx, ref) => tasksOf(ref.key).filter((k) => ctx.s.workItems.get(k)?.parentKey === ref.key),
    point: (ctx, key, pk) => workNode(ctx, pk, ctx.s.workItems.get(key)!, 'missionPoint', { x: 0, y: 0, r: 0 }),
    uncertain: () => false,
  };
  const vocab = { typeLabel: () => 'Shelf', glyph: () => '', playNoun: 'shelf', enter: { chart: 'Open ›', ado: () => 'Open ›' } };
  const SHELF: LevelDef = { id: 'shelf', layout: 'field', source: shelf, backdrop: 'sector', durationMs: 500, historyScene: 'scope', sceneKeys: () => null, vocab };
  const STORY: LevelDef = { id: 'story', layout: 'radar', source: story, backdrop: 'body', durationMs: 500, historyScene: 'scope', sceneKeys: (hh, ref) => subtreeKeys(hh, ref.key), vocab };
  const TOY: Hierarchy = chain('toy').then(SHELF).then(STORY).build({
    sceneForScope: () => ({ level: 'shelf', key: epicKey }),
    pathTo: (s, key) => { const wi = s.workItems.get(key); const st = wi?.kind === 'story' ? key : wi?.parentKey; return st ? [{ level: 'story', key: st }] : []; },
    focusOf: (s, key) => (s.workItems.get(key)?.kind === 'task' ? s.workItems.get(key)!.parentKey : key),
    closeUpOf: () => ({ body: null, inScope: true }),
    labelOf: (s, _h, ref) => { const wi = s.workItems.get(ref.key); return wi ? { label: wi.title } : null; },
    stageOf: () => null,
    uncharted: () => [],
    rankOf: () => 0,
    vocab: { uncharted: { chart: 'Loose', ado: 'Loose', reason: 'loose' } },
  });
  const epicKey = h.entities.workItems.find((w) => w.type === 'Epic')!.key;
  const scene = formatScene({ level: 'shelf', key: epicKey });

  it('projects its own levels: stars that open story scenes, in slots that never move on a seek (INV-14)', () => {
    const at = (t: number) => projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, TOY);
    const end = at(h.range.endUtc - 1);
    const stars = end.nodes.filter((n) => n.kind === 'star');
    expect(stars.length).toBeGreaterThan(0);
    for (const n of stars) expect(n.zoomTo?.startsWith('story:')).toBe(true);
    const mid = at((h.range.startUtc + h.range.endUtc) / 2);
    for (const n of mid.nodes.filter((x) => x.kind === 'star')) {
      const same = stars.find((x) => x.canonicalKey === n.canonicalKey)!;
      expect([n.world.x, n.world.y, n.slot]).toEqual([same.world.x, same.world.y, same.slot]);
    }
    const close = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), stars[0]!.zoomTo!, LAYOUT_VERSION, TOY);
    expect(close.radar).toBeDefined();
    expect(close.nodes.every((n) => n.kind !== 'star')).toBe(true);
  });

  it('walks its own family: a Task’s path and focus are its Story; in-view keys stay inside the bundle', () => {
    const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
    const task = [...end.workItems.values()].find((w) => w.kind === 'task' && w.parentKey && end.workItems.get(w.parentKey)?.kind === 'story')!;
    expect(TOY.pathTo(end, task.key, h)).toEqual([{ level: 'story', key: task.parentKey }]);
    expect(TOY.focusOf(end, task.key, h)).toBe(task.parentKey);
    const keys = sceneEntityKeys(h, formatScene({ level: 'story', key: task.parentKey! }) as SceneKey, TOY)!;
    // Work, their PRs, and the captains whose ships the scene draws (decided 2026-10-08).
    const known = new Set([...h.entities.workItems, ...h.entities.prs, ...h.entities.captains].map((e) => e.key));
    for (const k of keys) expect(known.has(k)).toBe(true);
  });

  it('builds its breadcrumb from its own vocabulary', () => {
    const crumbs = crumbsOf([{ sceneKey: 'galaxy', label: 'All projects' }, { sceneKey: scene, scope: { projectKey: h.scope.projectKey }, label: 'Shelf', typeLabel: 'Shelf' }], [{ key: h.scope.projectKey, name: 'Project' }], TOY);
    expect(crumbs.map((c) => c.label)).toEqual(['All projects', 'Project', 'Shelf']);
    expect(crumbs.some((c) => c.pill)).toBe(false); // no pill word: a plain crumb
  });
});

describe('real-data shapes (2026-10-07)', () => {
  it('an unexplored Feature with some children loaded already still draws: its rings cover every shown child', () => {
    const s = scenarios[0]!;
    const base = toHistory(s, mapping);
    const sector = BACKLOG.format(BACKLOG.sceneForScope(base.scope));
    const end = snapshotAt(base, base.range.endUtc - 1, 'knownThen');
    const feature = projectScene(base, end, sector, LAYOUT_VERSION).nodes.find((n) => n.kind === 'star' && n.label === 'Unified quote ledger')!;
    // Its links say one child; several are in the bundle (the case that threw on a real org).
    const h = { ...base, entities: { ...base.entities, childCounts: [{ key: feature.canonicalKey, stories: 1, bugs: 0 }] } };
    const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), sector, LAYOUT_VERSION);
    const star = g.nodes.find((n) => n.canonicalKey === feature.canonicalKey && n.kind === 'star')!;
    expect(star.flags.unexplored).toBe(true);
    const minis = g.nodes.filter((n) => !n.selectable && n.role !== 'unexplored' && g.edges.some((e) => e.kind === 'orbit' && e.from === star.projectionKey && e.to === n.projectionKey));
    expect(minis.length).toBeGreaterThan(1);
    for (const n of minis) expect(Number.isFinite(n.world.x) && Number.isFinite(n.world.y)).toBe(true);
  });
});
