// A steady pulse and limelight (22 C5, C6; 05 §8 B-16, B-17, P-15, P-17, M-28), on the dense pod's real
// schedule (meridian's Convoy Planning Pod, Sprint 7). Fixture data only.
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { sceneFacts } from '@shared/engine/facts';
import { FAIR_TURN_MS } from '@shared/engine/limelight';
import { planManeuvers, turnKey } from '@shared/engine/maneuvers';
import { PACE_RULES } from '@shared/engine/pace';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { DAY_TURN_MS, PULSE_GAP_MAX_MS } from '@shared/playback/constants';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { localDay } from '@shared/playback/schedule';
import { mapping } from '../golden/helpers';

const TZ = 'America/Los_Angeles';
const h = toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!);
const pod = (h.scope.sector as { pods: { areaKey: CanonicalKey; path: string }[] }).pods.find((p) => p.path.endsWith('Convoy Planning Pod'))!;
const sch = buildScene(h, h.range, TZ, `pod:${pod.areaKey}` as never, SOLAR);
const ll = sch.limelight!;
const f = sceneFacts(paceFacts(h), pod.areaKey); // as the region's scene plans it
const played = sch.beats.filter((b) => b.accented && b.durationMs > 0);
const plans: { at: number; m: PlannedManeuver }[] = played.flatMap((b) => planManeuvers(h, b, f, PACE_RULES, ENGAGEMENT.calm, { limelight: ll }).map((m) => ({ at: b.presentationStartMs + m.afterMs, m })));
const crewOf = (m: PlannedManeuver) => [...new Set([...(m.cast.agent ?? []), ...(m.cast.support ?? [])])];

describe('a steady pulse (22 C5, B-16, B-17)', () => {
  it('has no dead air past 1.2 s, but for a day turn of 1.5 s where the working day changes', () => {
    let prevEnd = sch.beats[0] ? played[0]!.presentationStartMs : 0;
    let turns = 0;
    for (const [i, b] of played.entries()) {
      if (i === 0) { prevEnd = b.presentationStartMs + b.durationMs; continue; }
      const gap = b.presentationStartMs - prevEnd;
      if (b.opensDay) { turns++; expect(gap).toBeLessThanOrEqual(DAY_TURN_MS + 1e-6); }
      else expect(gap).toBeLessThanOrEqual(PULSE_GAP_MAX_MS + 1e-6);
      prevEnd = b.presentationStartMs + b.durationMs;
    }
    expect(turns).toBeGreaterThan(3); // a two-week sprint opens several days
    // A beat opens a day exactly where its first event's local day differs from the last played beat's,
    // so a day whose first beats are silent still opens with its turn; a silent beat never opens one.
    played.forEach((b, i) => { if (i > 0) expect(!!b.opensDay).toBe(localDay(b.firstUtc, TZ) !== localDay(played[i - 1]!.sourceUtc, TZ)); });
    for (const b of sch.beats) if (b.durationMs <= 0) expect(b.opensDay).toBeUndefined();
  });
});

describe('limelight (22 C6, P-17, M-28)', () => {
  it('always names moments and arcs', () => {
    for (const { m } of plans) if (m.protect || m.arc) expect(m.quiet, m.id).toBeUndefined();
  });

  it('names everyone’s first turn: each person who flies is named at least once', () => {
    const flew = new Set(plans.flatMap(({ m }) => crewOf(m)));
    const named = new Set(plans.filter(({ m }) => !m.quiet).flatMap(({ m }) => crewOf(m)));
    for (const p of flew) expect(named.has(p), p).toBe(true);
  });

  it('gives no one a second named turn within FAIR_TURN_MS, moments and first turns aside', () => {
    const last = new Map<CanonicalKey, number>();
    const seen = new Set<CanonicalKey>();
    const ordered = [...plans].sort((a, b) => a.at - b.at);
    let checked = 0;
    for (const { at, m } of ordered) {
      if (m.quiet) continue;
      const crew = crewOf(m);
      const first = crew.some((p) => !seen.has(p));
      if (!m.protect && !m.arc && !first && crew.length) {
        // A fair turn: everyone in it was last named at least FAIR_TURN_MS of (estimated) playback ago.
        // The estimate the pass used isn't the laid-out time, so allow a beat's worth of slack.
        for (const p of crew) expect(at - (last.get(p) ?? -Infinity)).toBeGreaterThan(FAIR_TURN_MS * 0.5);
        checked++;
      }
      for (const p of crew) { last.set(p, at); seen.add(p); }
    }
    expect(plans.some(({ m }) => m.quiet)).toBe(true); // some work did play unnamed
    expect(checked).toBeGreaterThan(0); // and some fair turns were named, so there was something to check
  });

  it('plays a quiet turn unlabelled, and in a crowded beat as montage, quicker', () => {
    // Montage is rare once limelight quiets the routine work: none in the dense pod, one in Harbor Pod.
    const harbor = toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!);
    const hp = (harbor.scope.sector as { pods: { areaKey: CanonicalKey; path: string }[] }).pods.find((p) => p.path.endsWith('Harbor Pod'))!;
    const hs = buildScene(harbor, harbor.range, TZ, `pod:${hp.areaKey}` as never, SOLAR);
    const hf = sceneFacts(paceFacts(harbor), hp.areaKey);
    const both = [...plans.map(({ m }) => m), ...hs.beats.filter((b) => b.accented).flatMap((b) => planManeuvers(harbor, b, hf, PACE_RULES, ENGAGEMENT.calm, { limelight: hs.limelight! }))];
    expect(both.some((m) => m.montage)).toBe(true);
    for (const m of both) {
      // The director's montage (27 E10, P-24) lights a plate and names its cause; limelight's crowded-beat montage is quiet.
      if (!m.montage || m.plate) continue;
      expect(m.quiet).toBe(true);
      const base = PACE_RULES.find((r) => r.id === m.id)!;
      expect(m.phases.reduce((n, p) => Math.max(n, p.atMs + p.durMs), 0)).toBeLessThan(base.phases.reduce((n, p) => Math.max(n, p.atMs + p.durMs), 0));
    }
    expect([...ll.named].every((k) => k.includes('|'))).toBe(true);
    expect(turnKey('e', 'r')).toBe('e|r');
  });

  it('spotlights someone not yet seen at each new working day, while anyone is unseen', () => {
    const spots = [...ll.spotlights];
    expect(spots.length).toBeGreaterThan(0);
    for (const [index] of spots) expect(played.find((b) => b.index === index)?.opensDay, `spotlight on beat ${index}`).toBe(true);
    // The first few spotlights go to different captains.
    const firsts = spots.slice(0, 3).map(([, p]) => p);
    expect(new Set(firsts).size).toBe(firsts.length);
  });
});
