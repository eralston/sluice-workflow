import { resolve } from 'node:path';
import { it } from 'vitest';
const SRC = resolve(__dirname, '../../../../../../src/renderer/src');
const { Sortie } = (await import(/* @vite-ignore */ resolve(SRC, 'chart/fx/movers.ts'))) as any;
function run(start: [number, number], spot: [number, number], goal: [number, number]) {
  const placed: [number, number][] = [];
  const scene = { own() {}, placeAt: (_: string, x: number, y: number) => placed.push([x, y]), faceView() {}, facingOf: () => 1, currentScale: () => 1, goalOf: () => goal, release() {}, restoreFacing() {}, fadeView() {} };
  const s = new Sortie(scene, 'ag', start, () => spot, () => spot, 0.715, 0, 1.2, 0, false, 0, { plateS: 2.32 });
  const DT = 1 / 120; let minV = Infinity, minT = 0; let backward = 0;
  for (let j = 0; j < Math.round(1.915 / DT); j++) {
    s.update(DT);
    if (placed.length > 1) {
      const a = placed[placed.length - 2]!, b = placed[placed.length - 1]!;
      const v = Math.hypot(b[0] - a[0], b[1] - a[1]) / DT; const t = (j + 1) * DT;
      if (t > 0.02 && t < 1.895 && v < minV) { minV = v; minT = t; }
      if (t < 0.715 && b[0] < a[0] - 1e-9) backward++;
    }
  }
  console.log(JSON.stringify({ start, spot, goal, minV: +minV.toFixed(3), minT: +minT.toFixed(3), backwardStepsLeg1: backward, minX: Math.min(...placed.map((p) => p[0])) }));
}
it('probe', () => {
  run([0, 0], [100, 0], [5, 3]);        // usual out and back
  run([0, 0], [100, 0], [300, 0]);      // goal beyond the spot, collinear
  run([0, 0], [20, 0], [400, 0]);       // ship near the spot, goal far beyond
  run([0, 0], [20, 0], [400, 5]);       // nearly collinear
  run([0, 0], [100, 0], [-200, 0]);     // goal far behind the start
  run([0, 0], [100, 0], [-60, 30]);
  run([0, 0], [100, 0], [-30, 60]);
  run([0, 0], [100, 0], [0, 200]);
});
