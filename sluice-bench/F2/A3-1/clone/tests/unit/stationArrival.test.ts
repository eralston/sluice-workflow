// Stations start off the map and jump in when their region first needs them (22 C11, 05 §8 S-9, T-1,
// M-13): over each region's own schedule, a station whose first need falls in the round jumps in once,
// in the beat of that event, and is drawn from then on; one needed only by a PR opened before the round
// is there from the opening and never jumps in. Never shown, then summoned. Fixture data only.
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { sceneFacts } from '@shared/engine/facts';
import { planManeuvers } from '@shared/engine/maneuvers';
import { firstNeeds, PACE_RULES, RULE } from '@shared/engine/pace';
import { planSolar } from '@shared/engine/solar/plan';
import { SOLAR } from '@shared/hierarchy/solar';
import { facts, paceFacts } from '@shared/hierarchy/solarSource';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { packFor } from '@shared/packs/registry';
import { mapping } from '../golden/helpers';

const TZ = 'America/Los_Angeles';
const cases = [
  ['meridian', toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!)],
  ['pod-sprint', toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!)],
] as const;

describe.each(cases)('stations arrive at first need: %s', (_name, h) => {
  const pods = (h.scope.sector as { pods: { areaKey: CanonicalKey; path: string }[] }).pods;
  it.each(pods.map((p) => [p.path.split('\\').at(-1)!, p.areaKey] as const))('%s', (_pod, region) => {
    const f = facts(h, { level: 'pod', key: region });
    const plan = planSolar(f, packFor(h) as never);
    const sched = buildScene(h, h.range, TZ, `pod:${region}` as never, SOLAR);
    const pace = sceneFacts(paceFacts(h), region); // as the region's scene plans it (22 C9 review)
    // Every jump-in the region's schedule plans, by facility, with its beat.
    const jumps = new Map<CanonicalKey, number[]>();
    for (const b of sched.beats) {
      for (const m of planManeuvers(h, b, pace, PACE_RULES, ENGAGEMENT.calm)) {
        if (m.id !== RULE.facilityEnter) continue;
        for (const k of m.cast.subject ?? []) jumps.set(k, [...(jumps.get(k) ?? []), b.index]);
      }
    }
    const needs = firstNeeds(f);
    for (const st of plan.stations) {
      const need = needs.get(st.facility);
      if (!need) {
        expect(st.enterAt).toBe(f.round.startUtc); // there from the opening
        expect(jumps.get(st.facility) ?? []).toEqual([]);
        continue;
      }
      expect(st.enterAt).toBe(need.at);
      const beat = sched.beats.find((b) => b.eventKeys.includes(need.eventKey));
      expect(beat, `${st.facility}'s first need plays here`).toBeDefined();
      expect(jumps.get(st.facility)).toEqual([beat!.index]); // once, in that beat
    }
    // And no other: another region's first need never plans a jump-in here (dead air, B-16).
    expect([...jumps.keys()].filter((k) => !needs.has(k)), 'jump-ins for stations this region already shows').toEqual([]);
  });
});

describe('a scene plans only its own region’s first needs (22 C9 review)', () => {
  // Region A's station first came with PR 10; PR 12 serves work in both A and B, and is B's first need.
  const T0 = Date.UTC(2026, 8, 14);
  const H = 3_600_000;
  const k = (s: string) => s as CanonicalKey;
  const repo = k('repo:o:r1');
  const piece = (key: string) => ({ key: k(key), role: 'objective' as const, member: [{ from: T0, to: null }], seatAt: [{ from: T0, seat: k('id:o:ann') }], signalAt: [{ from: T0, signal: { rung: 'ready' as const } }], steps: [], parent: null });
  const att = (n: number, links: string[], at: number) => ({ key: k(`pr:o:r1:${n}`), facility: repo, author: k('id:o:ann'), open: { from: T0 + at, to: null }, links: links.map(k), approvers: [], signalAt: [] });
  const attach = (n: number) => [{ m: 'attach' as const, key: k(`pr:o:r1:${n}`), facility: repo, author: k('id:o:ann') }];
  const moves = new Map([['e10', attach(10)], ['e12', attach(12)]]);
  const at = new Map([['e10', T0 + H], ['e12', T0 + 2 * H]]);
  const round = { startUtc: T0, endUtc: T0 + 14 * 24 * H };
  const region = (key: string, wi: string, prs: ReturnType<typeof att>[]) => ({ round, region: key, pieces: new Map([[k(wi), piece(wi)]]), seats: [k('id:o:ann')], attachments: new Map(prs.map((p) => [p.key, p])), moves, at });
  const a = region('area:o:a', 'wi:o:1', [att(10, ['wi:o:1'], H), att(12, ['wi:o:1', 'wi:o:2'], 2 * H)]);
  const b = region('area:o:b', 'wi:o:2', [att(12, ['wi:o:1', 'wi:o:2'], 2 * H)]);
  const whole = { ...a, region: 'round', regions: new Map([[k('area:o:a'), a], [k('area:o:b'), b]]) };
  const e12 = { eventKey: 'e12', kind: 'pr_opened', occurredAt: T0 + 2 * H, observedAt: T0 + 2 * H, entityKey: k('pr:o:r1:12'), projectKey: 'proj:o:p', priority: 'high', payload: { authorKey: k('id:o:ann') }, evidence: [], changedBy: k('id:o:ann') } as never;
  const beat = { index: 0, sourceUtc: T0 + 2 * H, firstUtc: T0 + 2 * H, eventKeys: ['e12'], priority: 'high' as const, presentationStartMs: 0, durationMs: 1, accented: true };
  const enters = (f: never) => planManeuvers({ events: [e12], range: round } as never, beat, f, PACE_RULES, ENGAGEMENT.calm).filter((m) => m.id === RULE.facilityEnter).length;

  it('PR 12 summons the station in B, and not in A, which already shows it', () => {
    expect(enters(sceneFacts(whole as never, k('area:o:b')) as never)).toBe(1);
    expect(enters(sceneFacts(whole as never, k('area:o:a')) as never)).toBe(0);
    expect(enters(whole as never)).toBe(1); // the whole round's facts: any region's first need (the old answer for A)
  });
});
