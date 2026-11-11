// C3 planner's probe 2 (fixture data only): WHO binds the ~400 small offscreen targets a frame in Pulsar.
// Samples a JS stack at every bindFramebuffer(non-null) in 60 frames of 4x play and groups by the top frames.
// Run: HIDE=1 .claude/sluice/with-lock.sh npm run drive -- docs/progress/v1.4/work/C3/probe-who.ts --paradigm solar --name c3-who
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  if (process.env.HIDE === '1') await d.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(4); t.setScheduleMs(0); });
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => new Promise<Record<string, unknown>>((resolve) => {
    const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    Error.stackTraceLimit = 40;
    const bag = new Map<string, number>();
    const vps = new Map<string, number>();
    let n = 0; let fbo = false;
    const ob = P.bindFramebuffer!;
    P.bindFramebuffer = function (this: unknown, ...a: unknown[]) {
      fbo = a[1] !== null;
      if (fbo) {
        n++;
        const lines = (new Error().stack ?? '').split('\n').slice(2).map((l) => l.trim().replace(/\(?file:\/\/.*\/(assets|out)\//, '(').replace(/:\d+:\d+\)?$/, '')).filter((l) => !/pixi|bindFramebuffer/i.test(l)).slice(0, 3);
        const raw = (new Error().stack ?? '').split('\n').slice(2, 14).map((l) => l.trim().replace(/\(?file:\/\/.*\//, '(').replace(/:\d+:\d+\)?$/, '').replace(/^at /, '')).join(' < ');
        const k = raw.slice(0, 420) + ' || ' + lines.join('|');
        bag.set(k, (bag.get(k) ?? 0) + 1);
      }
      return ob.apply(this, a);
    };
    const ov = P.viewport!;
    P.viewport = function (this: unknown, ...a: unknown[]) { if (fbo) { const k = `${a[2]}x${a[3]}`; vps.set(k, (vps.get(k) ?? 0) + 1); } return ov.apply(this, a); };
    window.__starChartTest!.play();
    let frames = 0;
    const step = () => { if (++frames < 60) requestAnimationFrame(step); else { P.bindFramebuffer = ob; P.viewport = ov;
      resolve({ binds: n, perFrame: n / 60, top: [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), vps: [...vps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) }); } };
    requestAnimationFrame(step);
  }));
  d.note(JSON.stringify(out, null, 1));
}
