// The v1 episode on fixtures (run with --paradigm solar): galaxy → Tidewater Array's Sprint 13 (the
// round: it doesn't play) → Harbor Pod (the region), then choose Wren as the viewer, play the
// episode at 2×, look at a few beats, seek back, and let it end on the recap. For HG-V3: the board,
// the seats, the formations, the frontier and the stations. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function solarEpisode(d: Drive): Promise<void> {
  const { page } = d;
  await d.shot('galaxy');
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  const sprint13 = page.locator('.chooser button', { hasText: 'Sprint 13' });
  if (await sprint13.count()) await sprint13.first().click();
  else await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await d.shot('round');
  // The round doesn't play: Space does nothing, and the player says where to go.
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  d.note(`round: ${JSON.stringify(await page.evaluate(() => window.__starChartTest!.session()))}`);
  d.note(`round plate: ${await page.locator('.transport--gate').textContent().catch(() => 'none')}`);
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.waitForTimeout(800);
  await d.shot('region-end');
  await d.dump('region-end');

  // Who are you? Wren (the fixture's intended viewer), from Settings → Your captain.
  await page.locator('.settings-button').click();
  await page.locator('[role="tab"]', { hasText: 'Your captain' }).click();
  const who = page.locator('select[data-log="viewer-choose"]');
  const wren = await who.locator('option', { hasText: 'Wren' }).getAttribute('value');
  if (wren) await who.selectOption(wren);
  await page.waitForTimeout(400);
  await d.shot('settings-captain');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  d.note(`awards: ${JSON.stringify(await page.evaluate(() => window.__starChartTest!.awards().map((a) => a.id)))}`);

  // Point at a seat: its plate expands into its rows, in place (19 L2).
  const seat = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'seat')?.canonicalKey ?? null);
  if (seat) {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const p = await page.evaluate((k) => window.__starChartTest!.screenOf(k), seat);
    if (p) await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(500);
    await d.shot('seat-mega-label');
    await page.mouse.move(box.x + 10, box.y + box.height - 10);
  }

  // Play from the start at 2×, and look in on the way.
  await page.evaluate(() => { window.__starChartTest!.setActivity('lively'); window.__starChartTest!.setRate(2); });
  await page.keyboard.press('Home');
  await page.evaluate(() => window.__starChartTest!.play());
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(2500);
    await d.shot(`playing-${i}`);
    d.note(`playing ${i}: ${JSON.stringify(await page.evaluate(() => ({ s: window.__starChartTest!.session(), fx: window.__starChartTest!.fxCensus(), live: window.__starChartTest!.liveCommands() })))}`);
  }
  // A seek leaves no live commands (INV-15).
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.3));
  await page.waitForTimeout(300);
  d.note(`after seek: live ${await page.evaluate(() => window.__starChartTest!.liveCommands())}`);
  await d.shot('after-seek');
  // Let it play to the end: the recap, with the viewer's insignia on their ship.
  await page.evaluate(() => window.__starChartTest!.setRate(4));
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await d.shot('recap');
  d.note(`end: ${JSON.stringify(await page.evaluate(() => ({ s: window.__starChartTest!.session(), fx: window.__starChartTest!.fxCensus() })))}`);
}
