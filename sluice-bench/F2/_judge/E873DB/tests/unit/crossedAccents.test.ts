// 22 C9, 05 §8 B-19 (G-12) — every accent crossed in one frame plays: a solar region plans every accented
// beat a frame crossed, each at its own offset from the first, so none is dropped to light work. The v0
// views keep one per frame (AC-19, replay.test.ts). At today's rates no frame crosses two (the first
// test), so this is a safeguard for faster rates, not a fix for anything seen.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import type { Beat, Limelight } from '@shared/contracts/playback';
import type { Engagement } from '@shared/playback/engagement';
import { SOLAR } from '@shared/hierarchy/solar';
import '@shared/packs/all';
import { accentBeats, PlaybackClock } from '@shared/playback/clock';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { mapping } from '../golden/helpers';

// The renderer's planner, loaded by path as the other renderer tests do (it isn't in the node project).
interface PlanArgs { history: ScopeHistory; sceneKey: string; beat: Beat | null; others: readonly Beat[]; accents?: readonly Beat[]; eng: Engagement; limelight?: Limelight }
const { planSolarBeat } = (await import(/* @vite-ignore */ resolve(__dirname, '../../src/renderer/src/v1/plan.ts'))) as { planSolarBeat(a: PlanArgs): PlannedManeuver[] | null };

const scope = sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!;
const h: ScopeHistory = toHistory(podSprint, mapping, scope);
const pod = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods[0]! : null;
const scene = SOLAR.format({ level: 'pod', key: pod!.areaKey });
const sch = buildScene(h, h.range, podSprint.tz, scene, SOLAR);
const eng = ENGAGEMENT.calm;
const plan = (accents: typeof sch.beats, others: typeof sch.beats = []) =>
  planSolarBeat({ history: h, sceneKey: scene, beat: accents.at(-1) ?? null, others, accents, eng, ...(sch.limelight ? { limelight: sch.limelight } : {}) })!;

describe('every crossed accent plays (22 C9, B-19)', () => {
  it('today no frame can cross two: a frame is at most 100 ms of wall time at 4×, and accented beats start over 500 ms apart', () => {
    const accented = sch.beats.filter((b) => b.accented);
    const apart = Math.min(...accented.slice(1).map((b, i) => b.presentationStartMs - accented[i]!.presentationStartMs));
    expect(apart).toBeGreaterThan(100 * 4);
    const k = new PlaybackClock(sch);
    k.setRate(4);
    k.play();
    while (k.status === 'playing') expect(accentBeats(k.advance(1000)).length).toBeLessThanOrEqual(1);
  });

  it('accentBeats keeps every accented beat a frame crosses, in order; none on a seek', () => {
    const [a, b] = sch.beats.filter((x) => x.accented);
    const quiet = { ...b!, index: -1, accented: false, durationMs: 0 };
    expect(accentBeats({ crossed: [a!, quiet, b!], seeked: false })).toEqual([a, b]);
    expect(accentBeats({ crossed: [a!, b!], seeked: true })).toEqual([]);
  });

  it('each plays in full, the later ones as late as they began after the first', () => {
    const accented = sch.beats.filter((b) => b.accented);
    const [a, b] = [accented[2]!, accented[3]!];
    const alone = [plan([a]), plan([b])];
    expect(alone[0]!.length).toBeGreaterThan(0);
    expect(alone[1]!.length).toBeGreaterThan(0);
    const both = plan([a, b]);
    const lag = b.presentationStartMs - a.presentationStartMs;
    expect(both.map((m) => [m.eventKey, m.id, m.afterMs])).toEqual([
      ...alone[0]!.map((m) => [m.eventKey, m.id, m.afterMs]),
      ...alone[1]!.map((m) => [m.eventKey, m.id, m.afterMs + lag]),
    ]);
  });
});
