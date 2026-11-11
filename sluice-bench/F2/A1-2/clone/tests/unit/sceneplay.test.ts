// Playback belongs to the scene on screen (decided 2026-10-08): its schedule holds only the events
// that scene can show, so a pod never spends playback time on another pod's work, and a sprint never
// on the rest of the project. State is still the whole scope's at the playhead. 05 §§2–3.
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import { scenarioKeys, scenarioScopes, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import { BACKLOG } from '@shared/hierarchy/backlog';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { buildScene, sceneEntityKeys, touches } from '@shared/playback/highlights';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { mapping } from '../golden/helpers';

const k = scenarioKeys(sprintMechanics);
const S41 = toHistory(sprintMechanics, mapping, sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!);
const sprintScene = SPRINTS.format(SPRINTS.sceneForScope(S41.scope));
const podScene = (pod: string) => SPRINTS.format({ level: 'pod', key: k.area(pod) });
const pods = S41.scope.sector.kind === 'sprint' ? S41.scope.sector.pods : [];
const beats = (scene: string, h = S41, hier = SPRINTS) => buildScene(h, h.range, sprintMechanics.tz, scene as never, hier).beats;
const events = (scene: string, h = S41, hier = SPRINTS) => new Set(beats(scene, h, hier).flatMap((b) => b.eventKeys));

describe('a scene plays its own work', () => {
  it('a pod plays only its own: every beat touches it, and the other pods’ never appear', () => {
    const comet = podScene('Halcyon Reach\\Comet Pod');
    const nova = podScene('Halcyon Reach\\Nova Pod');
    const cometKeys = sceneEntityKeys(S41, comet as never, SPRINTS)!;
    const all = new Map((S41.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
    for (const b of beats(comet)) for (const ek of b.eventKeys) expect(touches(all.get(ek)!, cometKeys)).toBe(true);
    // Nova's stories are in the sprint, so the old unfiltered schedule played them here. Not any more.
    const cometEvents = events(comet);
    for (const key of [k.wi(9106), k.wi(9107), k.wi(9204)]) {
      expect([...cometEvents].some((ek) => all.get(ek)!.entityKey === key)).toBe(false);
    }
    expect(events(nova).size).toBeGreaterThan(0);
  });

  it('the sprint plays its pods’ work, and each pod’s is part of it', () => {
    const whole = events(sprintScene);
    expect(whole.size).toBeGreaterThan(0);
    expect(pods.length).toBe(2); // Quasar Pod isn't saved in this scope: it's the one the + crumb adds
    for (const pod of pods) {
      const mine = events(SPRINTS.format({ level: 'pod', key: pod.areaKey }));
      expect(mine.size).toBeGreaterThan(0);
      for (const ek of mine) expect(whole.has(ek)).toBe(true);
    }
  });

  it('the unfiltered schedule is the wider one: filtering only ever drops beats', () => {
    const full = buildBeatSchedule(S41, S41.range, sprintMechanics.tz, { hier: SPRINTS });
    const allEvents = new Set(full.beats.flatMap((b) => b.eventKeys));
    for (const ek of events(sprintScene)) expect(allEvents.has(ek)).toBe(true);
    expect(events(podScene('Halcyon Reach\\Comet Pod')).size).toBeLessThan(allEvents.size);
  });

  it('a Backlog sector plays its own Features too, and a Feature only its subtree', () => {
    const scope = scenarioScopes(orbitWeek, mapping).find((x) => 'area' in x && x.area.includes('Comet'))!;
    const h = toHistory(orbitWeek, mapping, scope);
    const ok = scenarioKeys(orbitWeek);
    const sector = BACKLOG.format(BACKLOG.sceneForScope(h.scope));
    const feature = BACKLOG.format({ level: 'feature', key: ok.wi(101) });
    const inSector = events(sector, h, BACKLOG);
    const inFeature = events(feature, h, BACKLOG);
    expect(inFeature.size).toBeGreaterThan(0);
    for (const ek of inFeature) expect(inSector.has(ek)).toBe(true);
    expect(inFeature.size).toBeLessThan(inSector.size);
  });

  it('state is still the whole scope’s: work elsewhere happens, it just gets no beat', () => {
    const comet = podScene('Halcyon Reach\\Comet Pod');
    const sch = buildScene(S41, S41.range, sprintMechanics.tz, comet as never, SPRINTS);
    const keys = sceneEntityKeys(S41, comet as never, SPRINTS)!;
    const last = sch.beats.at(-1)!;
    const elsewhere = (S41.events as AnyTimelineEvent[]).find((e) => !touches(e, keys) && e.occurredAt >= S41.range.startUtc && e.occurredAt <= last.sourceUtc);
    expect(elsewhere).toBeDefined();
    expect(sch.stateUtc(last.presentationStartMs)).toBeGreaterThanOrEqual(elsewhere!.occurredAt);
  });
});
