// C3 planner's probe (fixture data only, INV-18): where Pulsar Pod's frame time goes, playing at 4x.
// Counts WebGL work per frame (draw calls, offscreen passes and their sizes, uploads), times the GPU backlog
// with gl.finish(), and compares variants in the SAME run: as-is, paint off, twinkle off, canvas hidden from the
// compositor, draws skipped (the CPU floor), draws to offscreen targets skipped (filter passes), and the aura
// bake off and on. (A reload with devicePixelRatio forced to 1 hung the page at 1 fps: not worth repeating; this
// machine's window reports a devicePixelRatio of 1 already.)
// Run: HIDE=1 .claude/sluice/with-lock.sh npm run drive -- docs/progress/v1.4/work/C3/probe-gpu.ts --paradigm solar --name c3-gpu
import type { Drive } from '../../../../../tests/drive/drive';

const INSTRUMENT = () => {
  type W = Window & { __gl?: Record<string, unknown> };
  const w = window as W;
  const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const c = { draws: 0, fboDraws: 0, passes: 0, uploads: 0, uploadBytes: 0, programs: 0, clears: 0, blends: 0 };
  const sizes = new Map<string, number>();
  const state = { fbo: false, vp: [0, 0], skipAll: false, skipFbo: false, curFbo: null as unknown };
  const wrap = (name: string, fn: (self: unknown, args: unknown[], orig: (...a: unknown[]) => unknown) => unknown) => {
    const orig = P[name]!;
    P[name] = function (this: unknown, ...a: unknown[]) { return fn(this, a, (...b: unknown[]) => orig.apply(this, b)); };
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    wrap(name, (_s, a, orig) => {
      c.draws++;
      if (state.fbo) c.fboDraws++;
      if (state.skipAll || (state.skipFbo && state.fbo)) return undefined;
      return orig(...a);
    });
  }
  wrap('bindFramebuffer', (_s, a, orig) => { state.fbo = a[1] !== null; if (state.fbo) c.passes++; return orig(...a); });
  wrap('viewport', (_s, a, orig) => { state.vp = [a[2] as number, a[3] as number]; if (state.fbo) { const k = `${a[2]}x${a[3]}`; sizes.set(k, (sizes.get(k) ?? 0) + 1); } return orig(...a); });
  wrap('useProgram', (_s, a, orig) => { c.programs++; return orig(...a); });
  wrap('clear', (_s, a, orig) => { c.clears++; return orig(...a); });
  for (const name of ['texImage2D', 'texSubImage2D', 'bufferSubData', 'bufferData']) wrap(name, (_s, a, orig) => { c.uploads++; return orig(...a); });
  w.__gl = {
    c, sizes, state,
    reset: () => { for (const k of Object.keys(c)) (c as Record<string, number>)[k] = 0; sizes.clear(); },
  };
};

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  if (process.env.HIDE === '1') await d.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());

  const enterPulsar = async () => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.mouse.move(2, 2);
  };

  const run = async (name: string, rate: number, opts: { skipAll?: boolean; skipFbo?: boolean } = {}) => {
    await page.evaluate(({ r, o }) => {
      const t = window.__starChartTest!; t.pause(); t.setRate(r); t.setScheduleMs(0);
      const gl = (window as unknown as { __gl: { state: Record<string, boolean>; reset(): void } }).__gl;
      gl.state.skipAll = !!o.skipAll; gl.state.skipFbo = !!o.skipFbo;
    }, { r: rate, o: opts });
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as unknown as { __gl: { reset(): void } }).__gl.reset());
    await page.evaluate(() => window.__starChartTest!.play());
    const res = await page.evaluate(() => new Promise<Record<string, unknown>>((resolve) => {
      const canvas = document.querySelector('.chart-host canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
      const g = (window as unknown as { __gl: { c: Record<string, number>; sizes: Map<string, number> } }).__gl;
      const dts: number[] = []; const fin: number[] = []; let last = performance.now();
      const step = (t: number) => {
        dts.push(t - last); last = t;
        const f0 = performance.now(); gl.finish(); fin.push(performance.now() - f0);
        if (dts.length < 200) requestAnimationFrame(step);
        else {
          const q = (xs: number[], p: number) => { const s = xs.slice(5).sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(1); };
          const n = dts.length;
          const per = Object.fromEntries(Object.entries(g.c).map(([k, v]) => [k, +(v / n).toFixed(1)]));
          const sizes = [...g.sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${(v / n).toFixed(1)}`);
          resolve({ p50: q(dts, 0.5), p95: q(dts, 0.95), finishP50: q(fin, 0.5), finishP95: q(fin, 0.95), perFrame: per, fboSizes: sizes, canvas: `${canvas.width}x${canvas.height}`, dpr: window.devicePixelRatio });
        }
      };
      requestAnimationFrame(step);
    }));
    await page.evaluate(() => window.__starChartTest!.pause());
    d.note(`${name} @${rate}x ${JSON.stringify(res)}`);
  };

  const vsync = await page.evaluate(() => new Promise<number>((resolve) => {
    const out: number[] = []; let last = performance.now();
    const step = (t: number) => { out.push(t - last); last = t; if (out.length < 65) requestAnimationFrame(step); else { const s = out.slice(5).sort((a, b) => a - b); resolve(+s[Math.floor(s.length / 2)]!.toFixed(2)); } };
    requestAnimationFrame(step);
  }));
  d.note(`vsync ${vsync} ms, hidden ${process.env.HIDE === '1'}`);

  await page.evaluate(INSTRUMENT);
  await enterPulsar();
  const set = (partial: Record<string, unknown> | null) => page.evaluate((p) => window.__starChartTest!.setProfile(p), partial);
  const hideCanvas = (on: boolean) => page.evaluate((o) => { (document.querySelector('.chart-host canvas') as HTMLElement).style.visibility = o ? 'hidden' : ''; }, on);

  await run('as-is', 4);
  await run('as-is', 1);
  await set({ render: { switches: { paint: false } } }); await run('paint-off', 4);
  await set({ render: { switches: { paint: false, twinkle: false } } }); await run('paint+twinkle-off', 4);
  await set({ render: { switches: { twinkle: false } } }); await run('twinkle-off', 4);
  await set(null);
  await hideCanvas(true); await run('canvas-hidden', 4); await hideCanvas(false);
  await run('skip-fbo-draws', 4, { skipFbo: true });
  await run('skip-all-draws', 4, { skipAll: true });
  await run('as-is-again', 4);

  // C3's cut (the builder): the same scene with the aura bake off and on, same run. Harmless before the switch exists.
  await set({ render: { switches: { auraBake: false } } }); await run('aura-live', 4); await run('aura-live', 1);
  await set({ render: { switches: { auraBake: true } } }); await page.waitForTimeout(500); await run('aura-baked', 4); await run('aura-baked', 1);
  await set(null);
}
