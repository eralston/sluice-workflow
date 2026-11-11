// 27 E9 (05 §6): the directed camera's climax shot. Its centre lies within the cast's own bounds, it
// eases in but never out past the board, and a cast with nothing drawn gives no move. Pure framing.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViewNode } from '../../src/shared/contracts/view';
import type { CanonicalKey } from '../../src/shared/contracts/keys';

// The renderer's pure framing, loaded by path as the other renderer tests do (it isn't in the node project).
type Cam = { x: number; y: number; scale: number };
interface Camera { setViewport(w: number, h: number, r: number, t?: number): void }
const CHART = resolve(__dirname, '../../src/renderer/src/chart');
const { CameraController } = (await import(/* @vite-ignore */ resolve(CHART, 'camera.ts'))) as { CameraController: new (world: unknown) => Camera };
const { CLIMAX_MAX_ZOOM, climaxFrame } = (await import(/* @vite-ignore */ resolve(CHART, 'framing.ts'))) as {
  CLIMAX_MAX_ZOOM: number;
  climaxFrame(camera: Camera, nodes: ViewNode[], keys: ReadonlySet<CanonicalKey>, fitScale: number): Cam | null;
};

const world = { scale: { set() {} }, position: { set() {} } };
const camera = () => {
  const c = new CameraController(world);
  c.setViewport(1200, 800, 0);
  return c;
};
const node = (key: string, x: number, y: number, r: number): ViewNode => ({ canonicalKey: key as CanonicalKey, kind: 'star', world: { x, y, r } }) as unknown as ViewNode;
const keys = (...k: string[]) => new Set(k as CanonicalKey[]);
const FIT = 0.5;

describe('climaxFrame', () => {
  it('centres inside the box of the cast centres, for nodes of very different radii', () => {
    const nodes = [node('a', 0, 0, 10), node('b', 300, 120, 400)];
    const f = climaxFrame(camera(), nodes, keys('a', 'b'), FIT)!;
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.x).toBeLessThanOrEqual(300);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeLessThanOrEqual(120);
  });

  it('one node gives its own centre', () => {
    const f = climaxFrame(camera(), [node('a', 40, -70, 25), node('z', 900, 900, 10)], keys('a'), FIT)!;
    expect(f.x).toBe(40);
    expect(f.y).toBe(-70);
  });

  it('keeps the scale within the fit and 1.5x the fit, for a tight cast and one wider than the view', () => {
    const tight = climaxFrame(camera(), [node('a', 0, 0, 5), node('b', 10, 10, 5)], keys('a', 'b'), FIT)!;
    expect(tight.scale).toBeGreaterThanOrEqual(FIT);
    expect(tight.scale).toBeLessThanOrEqual(FIT * CLIMAX_MAX_ZOOM);
    const wide = climaxFrame(camera(), [node('a', -5000, 0, 5), node('b', 5000, 3000, 5)], keys('a', 'b'), FIT)!;
    expect(wide.scale).toBeGreaterThanOrEqual(FIT);
    expect(wide.scale).toBeLessThanOrEqual(FIT * CLIMAX_MAX_ZOOM);
  });

  it('gives null when no key is drawn', () => {
    expect(climaxFrame(camera(), [node('a', 0, 0, 10)], keys('nope'), FIT)).toBeNull();
    expect(climaxFrame(camera(), [], keys('a'), FIT)).toBeNull();
  });
});
