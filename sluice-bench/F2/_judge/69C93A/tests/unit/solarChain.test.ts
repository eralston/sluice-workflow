// The Solar chain (v1, 13 §2 and 14 §2.5): round → region, the region the bottom level and the only one
// that plays. It reuses the Sprints levels' data, so it's checked against them on sprint-mechanics. Since
// 17 W2-T1 the region draws through the solar projection (its boot fallback is gone).
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { SOLAR } from '@shared/hierarchy/solar';
import { roundFacts } from '@shared/engine/facts';
import { solarSource } from '@shared/hierarchy/solarSource';
import { packFor } from '@shared/packs/registry';
import { boardFacts } from '@shared/scene/project/solar';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectGalaxy, projectScene, soleFeature } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const histories = sprintScopes(sprintMechanics).map((scope) => toHistory(sprintMechanics, mapping, scope));
const S41 = histories.find((h) => h.scope.sector.kind === 'sprint' && h.scope.sector.path.endsWith('Sprint 41'))!;
const podsOf = (h: typeof S41): CanonicalKey[] => (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods.map((p) => p.areaKey) : []);
/** Seeded playheads across a bundle's range, plus its end. */
const playheads = (h: typeof S41): number[] => [...Array.from({ length: 12 }, (_, i) => h.range.startUtc + ((h.range.endUtc - h.range.startUtc) * (i * 7 % 12)) / 12), h.range.endUtc - 1];

describe('the Solar chain', () => {
  it('is round → region: the Sprints ids, the round unplayable, the region solar and last', () => {
    expect(SOLAR.id).toBe('solar');
    expect(SOLAR.levels.map((l) => [l.id, l.layout, l.playable ?? true])).toEqual([['sprint', 'field', false], ['pod', 'solar', true]]);
    expect(SOLAR.resolve('body:wi:x:1')).toBeNull(); // no close-up below the region
    expect(SOLAR.sceneForScope(S41.scope)).toEqual(SPRINTS.sceneForScope(S41.scope));
  });

  it('its region source is the pod star and the region’s board, read by the bundle’s pack, with no fallback', () => {
    const pod = podsOf(S41)[0]!;
    expect(Object.keys(solarSource).sort()).toEqual(['center', 'facts', 'pack']); // the boot fallback is gone (W3-T3)
    expect(SOLAR.levels[1]!.source).toBe(solarSource);
    expect(solarSource.pack!(S41).id).toBe('sdlc');
    const facts = solarSource.facts(S41, { level: 'pod', key: pod });
    expect(facts).toMatchObject({ round: S41.range, region: pod });
    expect(facts).toBe(boardFacts(roundFacts(S41, { level: 'pod', key: pod }, packFor(S41))));
    expect(facts.pieces.size).toBeGreaterThan(0);
    expect(facts.seats.length).toBeGreaterThan(0);
  });

  it('pathTo never returns a body ref, and is Sprints’ path cut at the region', () => {
    let paths = 0;
    for (const h of histories) {
      for (const t of playheads(h)) {
        const s = snapshotAt(h, t, 'knownThen');
        for (const key of [...s.workItems.keys(), ...podsOf(h)]) {
          const path = SOLAR.pathTo(s, key, h);
          expect(path.every((ref) => ref.level !== 'body')).toBe(true);
          expect(path).toEqual(SPRINTS.pathTo(s, key, h).filter((ref) => ref.level !== 'body'));
          // nav's goTo resolves every ref on a path: each must be a Solar scene.
          for (const ref of path) expect(SOLAR.resolve(SOLAR.format(ref))).not.toBeNull();
          if (path.length) paths++;
        }
      }
    }
    expect(paths).toBeGreaterThan(0);
  });

  it('stageOf lands on a pod ref for anything in a pod, Tasks included', () => {
    const s = snapshotAt(S41, S41.range.endUtc - 1, 'knownThen');
    const pods = new Set(podsOf(S41));
    let staged = 0;
    for (const wi of s.workItems.values()) {
      const stage = SOLAR.stageOf(s, wi.key, S41);
      if (!stage) continue;
      expect(stage.level).toBe('pod');
      expect(pods.has(stage.key)).toBe(true);
      expect(SOLAR.resolve(SOLAR.format(stage))?.def.layout).toBe('solar');
      staged++;
    }
    expect(staged).toBeGreaterThan(0);
    expect([...s.workItems.values()].some((w) => w.kind === 'task' && SOLAR.stageOf(s, w.key, S41)?.level === 'pod')).toBe(true);
  });

  it('the round is the Sprints sector: its pods open regions', () => {
    const scene = SOLAR.format(SOLAR.sceneForScope(S41.scope));
    const s = snapshotAt(S41, S41.range.endUtc - 1, 'knownThen');
    const stars = projectScene(S41, s, scene, LAYOUT_VERSION, SOLAR).nodes.filter((n) => n.kind === 'star');
    expect(stars.map((n) => n.zoomTo)).toEqual(podsOf(S41).map((key) => SOLAR.format({ level: 'pod', key })));
    expect(soleFeature(S41, scene, SOLAR)).toBe(soleFeature(S41, scene, SPRINTS));
  });

  it('draws a region with the solar layout: the star, seats on orbits, and nothing to enter below it', () => {
    for (const pod of podsOf(S41)) {
      const scene = SOLAR.format({ level: 'pod', key: pod });
      for (const t of playheads(S41)) {
        const solar = projectScene(S41, snapshotAt(S41, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
        expect(solar.nodes.every((n) => n.zoomTo === undefined)).toBe(true);
        expect(solar.nodes.filter((n) => n.kind === 'star').map((n) => n.canonicalKey)).toEqual([pod]);
        expect(solar.nodes.some((n) => n.kind === 'planet' || n.kind === 'anomaly' || n.kind === 'missionPoint')).toBe(false);
        expect(solar.solar?.seats.length).toBe(solar.nodes.filter((n) => n.kind === 'seat').length);
      }
    }
  });
});

describe('the galaxy under Solar (19 L3)', () => {
  const projects = [
    { key: 'id:p:a' as CanonicalKey, name: 'Tidewater Array', activity: 136, favoriteCount: 2 },
    { key: 'id:p:b' as CanonicalKey, name: 'Larch & Pine Trading', activity: 0, favoriteCount: 1, charted: false },
  ];
  it('says its counts without "Project"; v0 keeps its full line', () => {
    const meta = (style?: 'full' | 'counts') => projectGalaxy(projects, 0, LAYOUT_VERSION, style).nodes.map((n) => n.meta);
    expect(meta('counts')).toEqual(['1 area · not charted yet', '2 areas · 136 events this week']);
    expect(meta()).toEqual(['Project · 1 saved area · not charted yet', 'Project · 2 saved areas · 136 events this week']);
  });
});
