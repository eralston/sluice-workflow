// 27 D2: the Power link crew stays on the board (the plan's frontier rectangle). Pure cases on
// `formationSpots`, then Pulsar's and Harbor's stations at the fit scales of 1440x900 and 1024x640.
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import podSprint from '../../fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '../../fixtures/dsl';
import type { ViewGraph } from '@shared/contracts/view';
import { SOLAR } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { screenRadius } from '@shared/scene/sizing';
import { SQUASH } from '@shared/engine/solar/version';
import { mapping } from '../golden/helpers';

vi.setConfig({ testTimeout: 60_000 });

const SPOTS = resolve(__dirname, '../../src/renderer/src/theme/starChart/maneuvers/formationSpots.ts');
type P = [number, number];
interface Rect { minX: number; minY: number; maxX: number; maxY: number }
interface PlateRect { x0: number; y0: number; x1: number; y1: number }
// Imported by path (as the other renderer modules are): the node tsconfig does not list the renderer's files.
const { formationSpots, APPROVER_OUT, APPROVER_STEP } = (await import(/* @vite-ignore */ SPOTS)) as {
  formationSpots(i: { at: P; R: number; n: number; plates: readonly PlateRect[]; board?: Rect | null }): { author: P; approvers: P[]; face: number };
  APPROVER_OUT: number;
  APPROVER_STEP: number;
};

/** The rule before 27 D2 (powerLink.ts `formation()`), copied verbatim as the no-board reference. */
function today(at: P, R: number, n: number, plates: { x0: number; y0: number; x1: number; y1: number }[]) {
  const [fx, fy] = at;
  const ship = R * 0.5;
  const out = R * 1.2 + ship * 1.8;
  const horizontal = Math.abs(fy / SQUASH) >= Math.abs(fx);
  const axis: P = horizontal ? [1, 0] : [0, 1];
  const across: P = horizontal ? [0, 1] : [1, 0];
  const line = (sign: number): { author: P; approvers: P[] } => {
    const a = (d: number, off: number): P => [fx + axis[0] * sign * d + across[0] * off, fy + axis[1] * sign * d + across[1] * off];
    return { author: a(out, 0), approvers: Array.from({ length: n }, (_, i) => a(out + ship * (APPROVER_OUT + i * APPROVER_STEP), (i % 2 ? 1 : -1) * ship * 0.6)) };
  };
  const toward = -Math.sign(horizontal ? fx : fy) || 1;
  const pad = ship * 1.2;
  const covers = (pts: P[]) => pts.some(([x, y]) => plates.some((r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad));
  const a = line(toward);
  const b = line(-toward);
  const pick = covers([a.author, ...a.approvers]) && !covers([b.author, ...b.approvers]) ? b : a;
  const sign = pick === a ? toward : -toward;
  const face = horizontal ? (sign > 0 ? -1 : 1) : (fx >= 0 ? -1 : 1);
  return { ...pick, face };
}

const on = (r: Rect, pts: P[]) => pts.every(([x, y]) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
const spotsOf = (s: { author: P; approvers: P[] }): P[] => [s.author, ...s.approvers];

describe('formationSpots', () => {
  // R = 100: ship 50, out = 120 + 90 = 210, pad 60. Five approvers reach 210 + 50 * (4 + 4 * 3.4) = 1110 along the line.
  const R = 100;
  const board: Rect = { minX: -4000, maxX: 4000, minY: -2000, maxY: 2000 };

  it('no board: the same spots as before for the same input', () => {
    const cases: { at: P; n: number; plates: { x0: number; y0: number; x1: number; y1: number }[] }[] = [
      { at: [1500, 200], n: 3, plates: [] },
      { at: [-300, -1800 * SQUASH], n: 5, plates: [{ x0: -500, y0: -1800 * SQUASH + 100, x1: -100, y1: -1800 * SQUASH + 300 }] },
      { at: [900, 40], n: 2, plates: [{ x0: 700, y0: -100, x1: 1100, y1: 100 }] },
      { at: [-1200, 600], n: 0, plates: [] },
    ];
    for (const c of cases) expect(formationSpots({ ...c, R, board: null })).toEqual(today(c.at, R, c.n, c.plates));
  });

  it('keeps the line toward the centre when it fits', () => {
    const s = formationSpots({ at: [-3000, 0], R, n: 5, plates: [], board }); // on a side: vertical, toward = down (fy = 0 gives +1)
    expect(s.author[1]).toBeGreaterThan(0);
    expect(on(board, spotsOf(s))).toBe(true);
  });

  it('takes the other end when the toward end leaves the board and the other fits', () => {
    // Near the middle of a short axis: toward the centre runs off the thin board; the other end is on it.
    const thin: Rect = { minX: -4000, maxX: 4000, minY: -2000, maxY: 2000 };
    // On a vertical line (|fx| big), toward = -sign(fy); put the station near the centre so toward is short, bound by board height.
    const s = formationSpots({ at: [3900, 1500], R, n: 5, plates: [], board: thin });
    expect(on(thin, spotsOf(s))).toBe(true);
  });

  it('falls to the other axis when both ends leave the board', () => {
    const narrow: Rect = { minX: -700, maxX: 700, minY: -4000, maxY: 4000 };
    // Horizontal natural axis (near the top), but the board is only 1400 wide: the line cannot fit; the vertical one can.
    const s = formationSpots({ at: [0, 3000], R, n: 5, plates: [], board: narrow });
    expect(on(narrow, spotsOf(s))).toBe(true);
    expect(s.author[0]).toBeCloseTo(0, 6); // vertical: the author is on the station's x
  });

  it('holds the spots inside the board when every candidate leaves it', () => {
    const tiny: Rect = { minX: -400, maxX: 400, minY: -300, maxY: 300 };
    const s = formationSpots({ at: [300, 200], R, n: 6, plates: [], board: tiny });
    const room: Rect = { minX: -340, maxX: 340, minY: -240, maxY: 240 };
    expect(on(room, spotsOf(s))).toBe(true);
    expect(s.approvers).toHaveLength(6);
  });

  it('covers on the toward end and room on the board: takes the other end; covers on both: takes the one on the board', () => {
    const at: P = [200, 1500]; // near the top: horizontal; toward = -x
    const toward = formationSpots({ at, R, n: 2, plates: [], board });
    const plateAtToward = { x0: toward.author[0] - 20, x1: toward.author[0] + 20, y0: toward.author[1] - 20, y1: toward.author[1] + 20 };
    const b = formationSpots({ at, R, n: 2, plates: [plateAtToward], board });
    expect(b.author[0]).toBeGreaterThan(at[0]); // the far end
    // Plates on both ends, but only the toward end on board (the far end passes the board's edge): toward wins.
    const edge: Rect = { minX: -4000, maxX: 250, minY: -2000, maxY: 2000 };
    const far = formationSpots({ at, R, n: 2, plates: [plateAtToward, { x0: 400, x1: 600, y0: 1300, y1: 1700 }], board: edge });
    expect(far.author[0]).toBeLessThan(at[0]);
  });
});

// ---- The acceptance case: the busiest pods' stations, at the fit scales of the two window sizes ----

const CHART = resolve(__dirname, '../../src/renderer/src/chart');
const { boundsOf } = (await import(/* @vite-ignore */ `${CHART}/framing.ts`)) as { boundsOf(g: ViewGraph, scale?: number): { minX: number; minY: number; maxX: number; maxY: number } };

/** The scale the camera fits at, as `fitFor` does: min(w/bw, h/bh) over `boundsOf`, iterated to a fixed point. */
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
  { sc: podSprint, pod: 'Harbor' },
];

/** Count and offenders over every station of the pod's plan. Approvers 0..6 (an arc holder can join the support). */
function sweep(sc: typeof halcyon, podName: string, withBoard: boolean) {
  let checked = 0;
  const bad: string[] = [];
  let boardInBounds = true;
  for (const scope of sprintScopes(sc)) {
    const h = toHistory(sc, mapping, scope);
    const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
    for (const pod of pods.filter((p) => p.label.includes(podName))) {
      const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
      for (const q of [0.5, 1]) {
        const t = Math.min(h.range.endUtc - 1, Math.round(h.range.startUtc + (h.range.endUtc - h.range.startUtc) * q));
        const g = projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
        const sol = g.solar;
        if (!sol) continue;
        const board: Rect = { minX: sol.star.x - sol.frontier.rx1, maxX: sol.star.x + sol.frontier.rx1, minY: sol.star.y - sol.frontier.ry1, maxY: sol.star.y + sol.frontier.ry1 };
        const scales = [0.02, 0.03, 0.05, 0.08, 0.12, fitScale(g, 1440, 900), fitScale(g, 1024, 640)];
        for (const scale of scales) {
          const b = boundsOf(g, scale);
          if (board.minX < b.minX || board.maxX > b.maxX || board.minY < b.minY || board.maxY > b.maxY) boardInBounds = false;
          for (const st of sol.stations ?? []) {
            const node = g.nodes.find((n) => n.canonicalKey === st.facility && n.kind === 'facility');
            if (!node) continue;
            const sr = node.maxScale ? Math.min(screenRadius(node, scale), node.world.r * node.maxScale * scale) : screenRadius(node, scale);
            const R = sr / scale;
            for (let n = 0; n <= 6; n++) {
              const s = formationSpots({ at: [st.x, st.y], R, n, plates: [], board: withBoard ? board : null });
              checked++;
              if (!on(board, spotsOf(s))) bad.push(`${pod.label} ${String(st.facility)} @${scale.toFixed(3)} n=${n}`);
            }
          }
        }
      }
    }
  }
  return { checked, bad, boardInBounds };
}

describe.each(PODS)('every crew is on the board: $pod', ({ sc, pod }) => {
  it('with the board rule, every spot lies inside the fitted board', () => {
    const r = sweep(sc, pod, true);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.boardInBounds, 'the board is inside boundsOf').toBe(true);
    expect(r.bad).toEqual([]);
  });

  it('shows the test bites: the rule without the board (today) is measured', () => {
    const r = sweep(sc, pod, false);
    expect(r.checked).toBeGreaterThan(0);
    // Recorded in the build record: how many leave the board under today's rule.
    console.info(`D2 bite ${pod}: ${r.bad.length}/${r.checked} leave the board without it`, r.bad.slice(0, 5));
  });
});
