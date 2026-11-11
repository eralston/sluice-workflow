// 27 D3: the Power link crew keeps clear of the beam. Pure cases on `formationSpots` with `beams`, then
// every merge in Pulsar's and Harbor's pods: each member is a corridor's half-width from each strand, or the
// merge is in the reported fallback list.
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import podSprint from '../../fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '../../fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph } from '@shared/contracts/view';
import { workOf } from '@shared/engine/pace';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { screenRadius } from '@shared/scene/sizing';
import { mapping } from '../golden/helpers';

vi.setConfig({ testTimeout: 120_000 });

type P = [number, number];
interface Rect { minX: number; minY: number; maxX: number; maxY: number }
interface Spots { author: P; approvers: P[]; face: number; blocked?: true }
interface In { at: P; R: number; n: number; plates: { x0: number; y0: number; x1: number; y1: number }[]; board?: Rect | null; beams?: readonly P[] }
const SPOTS = resolve(__dirname, '../../src/renderer/src/theme/starChart/maneuvers/formationSpots.ts');
const CHART = resolve(__dirname, '../../src/renderer/src/chart');
const { formationSpots, CORRIDOR_HALF, CORRIDOR_STEP } = (await import(/* @vite-ignore */ SPOTS)) as {
  formationSpots(i: In): Spots;
  CORRIDOR_HALF: number;
  CORRIDOR_STEP: number;
};
const { boundsOf } = (await import(/* @vite-ignore */ `${CHART}/framing.ts`)) as { boundsOf(g: ViewGraph, scale?: number): Rect };

const members = (s: Spots): P[] => [s.author, ...s.approvers];
const segDist = ([x, y]: P, [fx, fy]: P, [bx, by]: P) => {
  const [dx, dy] = [bx - fx, by - fy];
  const l2 = dx * dx + dy * dy;
  const u = l2 ? Math.min(1, Math.max(0, ((x - fx) * dx + (y - fy) * dy) / l2)) : 0;
  return Math.hypot(x - (fx + dx * u), y - (fy + dy * u));
};
const minDist = (s: Spots, at: P, beams: readonly P[]) => Math.min(...members(s).flatMap((m) => beams.map((b) => segDist(m, at, b))));
const on = (r: Rect, pts: P[]) => pts.every(([x, y]) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);

describe('formationSpots with beams (27 D3)', () => {
  // R = 100: ship 50, corridor half-width 75; the author is 210 out.
  const R = 100;
  const half = CORRIDOR_HALF * (R / 2);
  const at: P = [0, 0];
  const board: Rect = { minX: -6000, maxX: 6000, minY: -6000, maxY: 6000 };
  const base: In = { at, R, n: 3, plates: [], board };
  const theta = (s: Spots) => Math.atan2(s.author[1] - at[1], s.author[0] - at[0]);

  it('no beams: D2’s output, bit for bit; beams off the line: D2’s pick unchanged', () => {
    const d2 = formationSpots(base);
    expect(formationSpots({ ...base, beams: [] })).toEqual(d2);
    const away: P = [Math.cos(theta(d2) + Math.PI / 2) * 900, Math.sin(theta(d2) + Math.PI / 2) * 900];
    const kept = formationSpots({ ...base, beams: [away] });
    expect(kept).toEqual(d2);
    expect(kept.blocked).toBeUndefined();
  });

  it('a strand along D2’s line gives a clear, on-board line, the nearest turn', () => {
    const d2 = formationSpots(base);
    const t0 = theta(d2);
    const beam: P = [Math.cos(t0) * 1500, Math.sin(t0) * 1500];
    const s = formationSpots({ ...base, beams: [beam] });
    expect(s.blocked).toBeUndefined();
    expect(minDist(s, at, [beam])).toBeGreaterThanOrEqual(half);
    expect(on(board, members(s))).toBe(true);
    // The nearest arc: a turn of 15 or 30 degrees, never the opposite end.
    const turn = Math.abs(Math.atan2(Math.sin(theta(s) - t0), Math.cos(theta(s) - t0)));
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThanOrEqual(2 * CORRIDOR_STEP + 1e-9);
  });

  it('takes a plate-covering clear line only when no plate-clear one exists', () => {
    const d2 = formationSpots(base);
    const t0 = theta(d2);
    const beam: P = [Math.cos(t0) * 1500, Math.sin(t0) * 1500];
    const first = formationSpots({ ...base, beams: [beam] });
    // A plate over the first answer: the next clear line is taken instead.
    const over = { x0: first.author[0] - 30, x1: first.author[0] + 30, y0: first.author[1] - 30, y1: first.author[1] + 30 };
    const second = formationSpots({ ...base, plates: [over], beams: [beam] });
    expect(second.author).not.toEqual(first.author);
    expect(second.blocked).toBeUndefined();
    // Plates everywhere: still a clear-corridor line (the corridor beats a plate), not blocked.
    const all = { x0: -6000, x1: 6000, y0: -6000, y1: 6000 };
    const covered = formationSpots({ ...base, plates: [all], beams: [beam] });
    expect(covered.blocked).toBeUndefined();
    expect(minDist(covered, at, [beam])).toBeGreaterThanOrEqual(half);
  });

  it('a strand in every one of the 24 directions: D2’s pick, blocked', () => {
    const d2 = formationSpots(base);
    const beams = Array.from({ length: 24 }, (_, k): P => [Math.cos(k * CORRIDOR_STEP) * 1500, Math.sin(k * CORRIDOR_STEP) * 1500]);
    const s = formationSpots({ ...base, beams });
    expect(s.blocked).toBe(true);
    expect({ ...s, blocked: undefined }).toEqual({ ...d2, blocked: undefined });
  });

  it('a board that forbids every clear line: D2’s pick, blocked (the board beats the corridor)', () => {
    const tiny: Rect = { minX: -400, maxX: 400, minY: -300, maxY: 300 };
    const t: In = { at: [300, 200], R, n: 3, plates: [], board: tiny };
    const d2 = formationSpots(t);
    const t0 = Math.atan2(d2.author[1] - 200, d2.author[0] - 300);
    const beam: P = [300 + Math.cos(t0) * 1500, 200 + Math.sin(t0) * 1500];
    const s = formationSpots({ ...t, beams: [beam] });
    const room: Rect = { minX: -340, maxX: 340, minY: -240, maxY: 240 };
    expect(on(room, members(s))).toBe(true);
    expect(s.blocked).toBe(true);
    expect(s.author).toEqual(d2.author);
  });

  it('off a board the search runs on the whole circle', () => {
    const d2 = formationSpots({ ...base, board: null });
    const t0 = theta(d2);
    const beam: P = [Math.cos(t0) * 1500, Math.sin(t0) * 1500];
    const s = formationSpots({ ...base, board: null, beams: [beam] });
    expect(s.blocked).toBeUndefined();
    expect(minDist(s, at, [beam])).toBeGreaterThanOrEqual(half);
  });
});

// ---- The acceptance case: every merge of the busiest pods ----

function fitScale(g: ViewGraph, w: number, h: number): number {
  let s = 0.1;
  for (let k = 0; k < 8; k++) {
    const b = boundsOf(g, s);
    s = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  }
  return s;
}

const PODS = [
  { sc: halcyon, pod: 'Pulsar' },
  { sc: halcyon, pod: 'Quasar' },
  { sc: podSprint, pod: 'Harbor' },
];

function sweep(sc: typeof halcyon, podName: string, withBeams: boolean) {
  let checked = 0, skipped = 0, searched = 0, inCorridor = 0;
  const fallbacks: string[] = [];
  const bad: string[] = [];
  const offBoard: string[] = [];
  const bites: string[] = [];
  for (const scope of sprintScopes(sc)) {
    const h = toHistory(sc, mapping, scope);
    const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
    const f = paceFacts(h);
    const graphs = new Map<string, ViewGraph>();
    for (const pod of pods.filter((p) => p.label.includes(podName))) {
      const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
      for (const a of f.attachments.values()) {
        const entry = a.signalAt.find((x) => x.signal.rung === 'accomplished');
        if (!entry) continue;
        const t = entry.from;
        const gk = `${pod.areaKey}@${t}`;
        let g = graphs.get(gk);
        if (!g) graphs.set(gk, (g = projectScene(h, snapshotAt(h, Math.min(t, h.range.endUtc - 1), 'knownThen'), scene, LAYOUT_VERSION, SOLAR)));
        const sol = g.solar;
        const st = sol?.stations?.find((x) => x.facility === a.facility);
        const nodes = workOf(f, a.key, t).map((k: CanonicalKey) => g.nodes.find((n) => n.canonicalKey === k)).filter((n) => !!n);
        if (!sol || !st || !nodes.length) { skipped++; continue; }
        const beams = nodes.map((n): P => [n!.world.x, n!.world.y]);
        const board: Rect = { minX: sol.star.x - sol.frontier.rx1, maxX: sol.star.x + sol.frontier.rx1, minY: sol.star.y - sol.frontier.ry1, maxY: sol.star.y + sol.frontier.ry1 };
        const node = g.nodes.find((n) => n.canonicalKey === st.facility && n.kind === 'facility');
        if (!node) { skipped++; continue; }
        const n = a.approvers.filter((k) => k !== a.author).length;
        const scales = [0.02, 0.03, 0.05, 0.08, 0.12, fitScale(g, 1440, 900), fitScale(g, 1024, 640)];
        for (const scale of scales) {
          const sr = node.maxScale ? Math.min(screenRadius(node, scale), node.world.r * node.maxScale * scale) : screenRadius(node, scale);
          const R = sr / scale;
          const input: In = { at: [st.x, st.y], R, n, plates: [], board };
          const d2 = formationSpots(input);
          const s = formationSpots(withBeams ? { ...input, beams } : input);
          checked++;
          const half = CORRIDOR_HALF * (R / 2);
          const d = minDist(d2, [st.x, st.y], beams);
          const tag = `${pod.label} ${String(a.key)} @${scale.toFixed(3)} n=${n} beams=${beams.length}`;
          if (d < half) { searched++; bites.push(tag); }
          if (!on(board, members(s))) offBoard.push(tag);
          if (!withBeams) { if (minDist(s, [st.x, st.y], beams) < half) inCorridor++; continue; }
          if (s.blocked) fallbacks.push(tag);
          else if (minDist(s, [st.x, st.y], beams) < half) bad.push(tag);
        }
      }
    }
  }
  return { checked, skipped, searched, inCorridor, fallbacks, bad, offBoard, bites };
}

describe.each(PODS)('every merge keeps clear of its beam: $pod', ({ sc, pod }) => {
  it('every member is a corridor’s half-width from every strand, or the merge is a reported fallback', () => {
    const r = sweep(sc, pod, true);
    console.info(`D3 ${pod}: checked ${r.checked}, skipped ${r.skipped}, D2 pick in a corridor ${r.searched}, fallbacks ${r.fallbacks.length}`, r.fallbacks.slice(0, 12));
    expect(r.checked).toBeGreaterThan(0);
    expect(r.bad).toEqual([]);
    expect(r.offBoard).toEqual([]);
    expect(r.fallbacks.length / r.checked).toBeLessThan(0.25);
  });

  it('shows the test bites: D2’s rule alone (no beams) is measured', () => {
    const r = sweep(sc, pod, false);
    expect(r.checked).toBeGreaterThan(0);
    console.info(`D3 bite ${pod}: ${r.inCorridor}/${r.checked} have a member in a corridor under D2's rule alone`, r.bites.slice(0, 6));
  });
});

it('the search ran somewhere across the pods (some D2 pick had a beam through it)', () => {
  const total = PODS.reduce((n, p) => n + sweep(p.sc, p.pod, true).searched, 0);
  expect(total).toBeGreaterThan(0);
});
