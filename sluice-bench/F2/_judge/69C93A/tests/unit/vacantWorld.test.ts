// A vacated homeworld (23 C3): a seat that holds nothing at the playhead writes `vacant`; the view eases
// into it on wall time (quicker out), lands at once on a first stage, `settle` (a seek) and reduced
// motion (INV-15), and passes only the level to the art's `setPower(1 - level)`, which dims the surface and
// puts the lights out (the pure shares are checked here; the shader is read in the drive). The planet set
// is unchanged (INV-14, R9). Renderer modules load by path, as stationStandby.test.ts does.
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { scenarios } from '../../fixtures/scenarios/index';
import { v1Scenarios } from '../../fixtures/scenarios/v1/index';
import meridian from '../../fixtures/scenarios/v1/meridian-sprint';
import { seatReason } from '@shared/engine/facts';
import { solarSource } from '@shared/hierarchy/solarSource';
import podSprint from '../../fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '../../fixtures/dsl';
import type { PieceState } from '@shared/contracts/view';
import { encodePiece, decodePiece } from '@shared/engine/stageCode';
import { SOLAR } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
interface FirstLight { front: number; lights: number }
interface View { setStage(s: string): void; tick(s: number): void; settle(): void; readonly vacancy: number; readonly firstLight: FirstLight | null }
const seat = await load<{
  SeatView: new (art: unknown, look: (s: string) => string | null, acts: Record<string, unknown>) => View;
  VACANT_FADE_MS: number; VACANT_WAKE_MS: number; FIRST_LIGHT_MS: number; FIRST_LIGHT_FADE_MS: number;
  firstLight(ms: number): FirstLight | null;
}>('theme/starChart/assets/seat.ts');
const worlds = await load<{ vacancyShares(p: number): { surface: number; lights: number }; VACANT_SURFACE: number }>('chart/art/worlds.ts');
const { motion } = await load<{ motion: { reduced: boolean } }>('chart/art/motion.ts');

const piece = (vacant: boolean, awaiting = false): PieceState => ({ role: 'seat', signal: { rung: 'ready' }, category: 'Proposed', share: 0, ...(vacant ? { vacant } : {}), ...(vacant && awaiting ? { awaiting } : {}) });
const stage = (vacant: boolean, awaiting = false) => encodePiece(piece(vacant, awaiting));

function stand() {
  const art = {
    root: new Container(), marks: new Container(), powers: [] as number[], holding: [] as boolean[], firstLights: [] as (FirstLight | null)[],
    setHolding(h: boolean) { this.holding.push(h); },
    setPower(p: number) { this.powers.push(p); },
    setFirstLight(f: FirstLight | null) { this.firstLights.push(f); },
    setStage: () => undefined, tick: () => undefined, destroy: () => undefined,
  };
  return { art, view: new seat.SeatView(art, (s) => s, {}) };
}

let now = 0;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  motion.reduced = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  motion.reduced = false;
});
function run(v: View, ms: number): void {
  for (let t = 0; t < ms; t += 50) { now += 50; v.tick(t / 1000); }
}

describe('the vacated look: pure shares', () => {
  it('holds full light at power 1, and at 0 dims the surface and puts the lights out', () => {
    expect(worlds.vacancyShares(1)).toEqual({ surface: 1, lights: 1 });
    const off = worlds.vacancyShares(0);
    expect(off.surface).toBeCloseTo(worlds.VACANT_SURFACE, 10);
    expect(off.lights).toBe(0);
  });
  it('eases monotonically between, and clamps', () => {
    let prev = worlds.vacancyShares(1);
    for (let p = 0.9; p >= 0; p -= 0.1) {
      const s = worlds.vacancyShares(p);
      expect(s.surface).toBeLessThanOrEqual(prev.surface);
      expect(s.lights).toBeLessThanOrEqual(prev.lights);
      prev = s;
    }
    expect(worlds.vacancyShares(-3)).toEqual(worlds.vacancyShares(0));
    expect(worlds.vacancyShares(9)).toEqual(worlds.vacancyShares(1));
  });
});

describe('the stage string', () => {
  it('writes vc=1 only when vacant, and round-trips', () => {
    expect(stage(false)).not.toContain('vc=');
    expect(stage(true)).toBe('v1|seat|ready|c=Proposed|sh=0.00|vc=1');
    expect(decodePiece(stage(true))?.vacant).toBe(true);
    expect(decodePiece(stage(false))?.vacant).toBeUndefined();
    expect(decodePiece('v1|seat|ready|c=Proposed|sh=0.00|vc=0')).toBeNull();
  });
});

describe('a seat view easing into vacancy (23 C3)', () => {
  it('passes the level: power is 1 - level, and tells the art whether it holds work', () => {
    const { view, art } = stand();
    view.setStage(stage(false));
    expect(art.powers.at(-1)).toBe(1);
    view.setStage(stage(true));
    view.settle();
    expect(art.powers.at(-1)).toBe(0);
    expect(art.holding.at(-1)).toBe(false);
  });
  it('starts as its first stage says, with no easing', () => {
    const { view } = stand();
    view.setStage(stage(true));
    expect(view.vacancy).toBe(1);
  });
  it('dims over VACANT_FADE_MS and lights over VACANT_WAKE_MS, on wall time', () => {
    const { view } = stand();
    view.setStage(stage(false));
    view.tick(0);
    view.setStage(stage(true));
    run(view, seat.VACANT_FADE_MS / 2);
    expect(view.vacancy).toBeGreaterThan(0.4);
    expect(view.vacancy).toBeLessThan(0.6);
    run(view, seat.VACANT_FADE_MS / 2 + 100);
    expect(view.vacancy).toBe(1);
    view.setStage(stage(false));
    run(view, seat.VACANT_WAKE_MS + 100);
    expect(view.vacancy).toBe(0);
    expect(seat.VACANT_WAKE_MS).toBeLessThan(seat.VACANT_FADE_MS);
  });
  it('lands at once on settle (a seek) and under reduced motion (INV-15)', () => {
    const { view } = stand();
    view.setStage(stage(false));
    view.tick(0);
    view.setStage(stage(true));
    view.settle();
    expect(view.vacancy).toBe(1);
    view.setStage(stage(false));
    motion.reduced = true;
    view.tick(0.05);
    expect(view.vacancy).toBe(0);
  });
});

describe('the projection (pod-sprint, Lantern Pod)', () => {
  const h = toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!);
  const pod = (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []).find((p) => p.label === 'Lantern Pod')!;
  const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
  const N = 120;
  const frames = Array.from({ length: N + 1 }, (_, i) => {
    const t = Math.round(h.range.startUtc + ((h.range.endUtc - 1 - h.range.startUtc) * i) / N);
    return projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR).nodes.filter((n) => n.kind === 'seat');
  });

  it('keeps the same planets at every playhead (INV-14, R9)', () => {
    const keys = frames[0]!.map((n) => n.projectionKey);
    for (const f of frames) expect(f.map((n) => n.projectionKey)).toEqual(keys);
  });
  it('writes vacant when a seat holds nothing, empties after holding, and lights again when work returns', () => {
    const seen = new Map<string, string>();
    for (const f of frames) for (const n of f) seen.set(n.label, (seen.get(n.label) ?? '') + (n.piece?.vacant ? 'V' : 'H'));
    const runs = [...seen.values()].map((s) => s.replace(/(.)\1+/g, '$1'));
    expect(runs).toContain('VHV'); // work arrives, then its last piece leaves
    for (const f of frames) for (const n of f) expect(n.stage.includes('|vc=1')).toBe(!!n.piece?.vacant);
  });
  it('writes awaiting for a vacant seat before its first work, then holding, and |aw=1 only with |vc=1 (v1.4 B4)', () => {
    const seen = new Map<string, string>();
    for (const f of frames) for (const n of f) seen.set(n.label, (seen.get(n.label) ?? '') + (n.piece?.awaiting ? 'A' : n.piece?.vacant ? 'V' : 'H'));
    const runs = [...seen.values()].map((s) => s.replace(/(.)\1+/g, '$1'));
    expect(runs.some((r) => r.startsWith('AH'))).toBe(true); // work arrives for the first time
    for (const f of frames) for (const n of f) {
      expect(n.stage.includes('|aw=1')).toBe(!!n.piece?.awaiting);
      if (n.stage.includes('|aw=1')) expect(n.stage.includes('|vc=1')).toBe(true);
    }
  });
});

describe('the art and the inspector agree (23 C3 review)', () => {
  it('vacant is exactly "seatReason says it holds nothing", across the sprint fixtures', () => {
    let checked = 0;
    for (const sc of [...scenarios, ...v1Scenarios]) {
      let scopes: ReturnType<typeof sprintScopes> = [];
      try { scopes = sprintScopes(sc); } catch { continue; }
      for (const scope of scopes) {
        const h = toHistory(sc, mapping, scope);
        for (const pod of h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []) {
          const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
          const f = solarSource.facts(h, { level: 'pod', key: pod.areaKey });
          for (let i = 0; i <= 24; i++) {
            const t = Math.round(h.range.startUtc + ((h.range.endUtc - 1 - h.range.startUtc) * i) / 24);
            const g = projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
            for (const n of g.nodes.filter((x) => x.kind === 'seat')) {
              checked++;
              const where = `${sc.name} ${pod.label} ${n.label} at ${new Date(t).toISOString()}`;
              const reason = seatReason(f, n.canonicalKey, t)?.kind;
              expect(!!n.piece?.vacant, where).toBe(reason !== 'holds');
              expect(!!n.piece?.awaiting, where).toBe(!!n.piece?.vacant && reason !== 'held');
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('a seat whose only piece is an Off ghost is vacant (meridian Convoy Planning Pod, Ulla)', () => {
    const h = toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!);
    const pod = (h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : []).find((p) => p.label === 'Convoy Planning Pod')!;
    const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
    const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
    const ulla = g.nodes.find((n) => n.kind === 'seat' && n.label.startsWith('Ulla'))!;
    expect(ulla.piece?.vacant).toBe(true);
  });
});

describe('first light (v1.4 B4)', () => {
  const total = () => seat.FIRST_LIGHT_MS + seat.FIRST_LIGHT_FADE_MS;
  const records = (art: { firstLights: (FirstLight | null)[] }) => art.firstLights.filter((f): f is FirstLight => f !== null);

  it('plays on a first arrival: a front rising across FIRST_LIGHT_MS, then settling to nothing', () => {
    const { view, art } = stand();
    view.setStage(stage(true, true));
    view.tick(0);
    view.setStage(stage(false));
    run(view, seat.FIRST_LIGHT_MS / 2);
    const fronts = records(art).map((f) => f.front).filter((x) => x > 0);
    expect(fronts.length).toBeGreaterThan(3);
    for (let i = 1; i < fronts.length; i++) expect(fronts[i]!).toBeGreaterThan(fronts[i - 1]!);
    expect(fronts.every((x) => x > 0 && x < 1)).toBe(true);
    expect(records(art).every((f) => f.lights === 1)).toBe(true);
    expect(view.vacancy).toBeGreaterThan(0);
    expect(view.vacancy).toBeLessThan(1);
    run(view, total() + 100);
    expect(art.firstLights.at(-1)).toBeNull();
    expect(view.vacancy).toBe(0);
    expect(art.powers.at(-1)).toBe(1);
  });

  it('a later return eases as before and plays no first light', () => {
    const { view, art } = stand();
    view.setStage(stage(false));
    view.tick(0);
    view.setStage(stage(true));
    run(view, seat.VACANT_FADE_MS + 100);
    const before = records(art).length;
    view.setStage(stage(false));
    run(view, seat.VACANT_WAKE_MS / 2);
    expect(view.vacancy).toBeGreaterThan(0.4);
    expect(view.vacancy).toBeLessThan(0.6);
    run(view, seat.VACANT_WAKE_MS + 100);
    expect(records(art).length).toBe(before);
    expect(view.firstLight).toBeNull();
    expect(view.vacancy).toBe(0);
  });

  it('a seek lands on the same final look as play: (power 1, no first light)', () => {
    const settled = { power: 1, light: null };
    const played = stand();
    played.view.setStage(stage(true, true)); played.view.tick(0); played.view.setStage(stage(false));
    run(played.view, total() + 100);
    expect({ power: played.art.powers.at(-1), light: played.view.firstLight }).toEqual(settled);
    const sought = stand();
    sought.view.setStage(stage(true, true)); sought.view.tick(0); sought.view.setStage(stage(false)); sought.view.settle();
    expect({ power: sought.art.powers.at(-1), light: sought.view.firstLight }).toEqual(settled);
    expect(sought.art.firstLights.at(-1)).toBeNull();
    const mid = stand();
    mid.view.setStage(stage(true, true)); mid.view.tick(0); mid.view.setStage(stage(false));
    run(mid.view, seat.FIRST_LIGHT_MS / 2);
    expect(mid.view.firstLight).not.toBeNull();
    mid.view.settle();
    expect({ power: mid.art.powers.at(-1), light: mid.view.firstLight }).toEqual(settled);
    expect(mid.art.firstLights.at(-1)).toBeNull();
  });

  it('reduced motion snaps: no first light', () => {
    const { view, art } = stand();
    view.setStage(stage(true, true));
    view.tick(0);
    motion.reduced = true;
    view.setStage(stage(false));
    view.tick(0.05);
    expect(view.vacancy).toBe(0);
    expect(records(art)).toHaveLength(0);
  });

  it('vacant again mid-sweep cancels it, then eases out as today', () => {
    const { view, art } = stand();
    view.setStage(stage(true, true));
    view.tick(0);
    view.setStage(stage(false));
    run(view, seat.FIRST_LIGHT_MS / 2);
    expect(view.firstLight).not.toBeNull();
    view.setStage(stage(true));
    expect(view.firstLight).toBeNull();
    expect(art.firstLights.at(-1)).toBeNull();
    const at = view.vacancy;
    run(view, seat.VACANT_FADE_MS / 2);
    expect(view.vacancy).toBeGreaterThan(at);
    run(view, seat.VACANT_FADE_MS);
    expect(view.vacancy).toBe(1);
  });

  it('firstLight(ms) is pure: front monotone 0 to 1, lights 1 then falling to 0, null at the end', () => {
    expect(seat.firstLight(0)).toEqual({ front: 0, lights: 1 });
    let prev = -1;
    for (let ms = 0; ms <= seat.FIRST_LIGHT_MS; ms += 20) {
      const f = seat.firstLight(ms)!;
      expect(f.front).toBeGreaterThanOrEqual(prev);
      expect(f.lights).toBe(1);
      prev = f.front;
    }
    expect(seat.firstLight(seat.FIRST_LIGHT_MS)!.front).toBe(1);
    const mid = seat.firstLight(seat.FIRST_LIGHT_MS + seat.FIRST_LIGHT_FADE_MS / 2)!;
    expect(mid.lights).toBeGreaterThan(0);
    expect(mid.lights).toBeLessThan(1);
    expect(seat.firstLight(total() - 1)!.lights).toBeLessThan(0.01);
    expect(seat.firstLight(total())).toBeNull();
  });
});
