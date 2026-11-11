// The solar board for review (HG-V3, run with --paradigm solar): Harbor Pod on pod-sprint at the
// test window and at the smallest one (1024×640), at the round's end, middle and start, then a close
// look at Ossian Vale's formations. What the density spec's solar case measures, to see by eye: the
// moon rings, formations past them, stations clear of the star, and the frontier. Fixture data only
// (INV-18).
import type { Drive } from '../drive';

export default async function solarBoard(d: Drive): Promise<void> {
  const { page, app } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.freezeAmbient(4));
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6); // off every object: no mega-label

  for (const [w, h] of [[1440, 900], [1024, 640]] as const) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, h), [w, h] as const);
    await page.waitForTimeout(600);
    await d.settle();
    for (const at of [1, 0.5, 0.05]) {
      await page.evaluate((f) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * f), at);
      await page.waitForTimeout(300);
      await d.settle();
      const tag = `${w}x${h}-${Math.round(at * 100)}`;
      await d.shot(`board-${tag}`);
      const hits = await page.evaluate(() => {
        const hs = window.__starChartTest!.hitCircles();
        let overlaps = 0;
        for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) if (Math.hypot(hs[i]!.x - hs[j]!.x, hs[i]!.y - hs[j]!.y) < hs[i]!.r + hs[j]!.r) overlaps++;
        return { count: hs.length, overlaps, scale: window.__starChartTest!.camera().scale };
      });
      d.note(`${tag}: ${JSON.stringify(hits)}`);
    }
  }
  await d.dump('board-small');

  // Close in on Ossian Vale, whose Stories and Bugs are past both caps: his two formations.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.5));
  await d.settle();
  const ossian = await page.evaluate(() => window.__starChartTest!.liveNodes().find((n) => n.kind === 'seat' && n.label === 'Ossian Vale')?.world ?? null);
  if (ossian) {
    const cam = await page.evaluate(() => window.__starChartTest!.camera());
    await page.evaluate(([o, s]) => window.__starChartTest!.setCamera({ x: o.x, y: o.y, scale: s * 2.5 }), [ossian, cam.scale] as const);
    await page.waitForTimeout(600);
    await d.shot('ossian-formations');
  }
}
