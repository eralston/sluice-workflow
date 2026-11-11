// D3 stills: a Pulsar merge at 1024x640 with the crew whole on screen, shot when the most acting plates show.
// Run: npm run drive -- docs/progress/v1.4/work/D3/stills.ts --paradigm solar
import type { Drive } from '../../../../../tests/drive/drive';

export default async function stills(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await d.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 640));
  await page.waitForTimeout(500);
  await d.settle();
  for (const pod of (process.env.D3_PODS ?? 'Pulsar Pod').split(',')) {
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await d.settle();
    await page.mouse.move(2, 2);
    const merges = await page.evaluate(async () => {
      const t = window.__starChartTest!;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
      let before = new Map<string, number>();
      const out: { startMs: number; horizontal: boolean }[] = [];
      for (const b of t.beatTimes()) {
        t.setScheduleMs(b.startMs + 1);
        await frame();
        const g = t.viewGraph()!;
        const fac = g.nodes.filter((n) => n.kind === 'facility');
        for (const n of fac) {
          const was = before.get(n.projectionKey);
          if (was !== undefined && mg(n.stage) > was) out.push({ startMs: b.startMs, horizontal: Math.abs((n.world.y - g.solar!.star.y) / 0.7) >= Math.abs(n.world.x - g.solar!.star.x) });
        }
        before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage)]));
      }
      return out;
    });
    for (const horizontal of [false, true]) {
      const m = merges.filter((x) => x.horizontal === horizontal)[0];
      if (!m) { d.note(`${pod}: no ${horizontal ? 'horizontal' : 'vertical'} merge`); continue; }
      await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), m.startMs);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__starChartTest!.stepBeat());
      let best = 1;
      for (let i = 0; i < 140; i++) {
        await page.waitForTimeout(100);
        const n = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null).length);
        if (n > best) { best = n; await d.shot(`${pod.split(' ')[0]}-${horizontal ? 'h' : 'v'}`); }
      }
      d.note(`${pod} ${horizontal ? 'horizontal' : 'vertical'}: most acting plates ${best}`);
    }
    await page.keyboard.press('Escape');
    await d.settle();
  }
}
