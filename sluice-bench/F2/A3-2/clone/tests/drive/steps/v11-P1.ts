// Stills for HG-P1 (19 P1; fixture data only, INV-18): the round's pod star previews, one small
// planet per homeworld the region opens with, an asteroid cluster by Story count and hive marks by
// Bug count. On fixtures (run with --paradigm solar): the round at rest, Harbor Pod pointed, then its
// region to compare. With --fake-ado pod-sprint --delay 400: the round at its first look (current
// assignees stand in), then after history has streamed (planets fade in as history adds people).
import type { Drive } from '../drive';

export default async function v11P1(d: Drive): Promise<void> {
  const { page } = d;
  const fake = !!process.env.DRIVE_FAKE_ADO;
  const preview = () => page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const stars = g.nodes.filter((n) => n.kind === 'star');
    return stars.map((s) => {
      const minis = g.nodes.filter((n) => n.projectionKey.startsWith(`${s.projectionKey}|`) || n.projectionKey.includes(`|preview|${s.canonicalKey}|`));
      const count = (k: string) => minis.filter((n) => n.kind === k).length;
      return `${s.label}: ${s.meta ?? ''} · seats ${count('seat')} · rocks ${count('objective')} · hives ${count('threat')}`;
    });
  });
  if (fake) {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(d.canary);
    await page.locator('.connect button[type="submit"]').click();
    await page.locator('.connect__msg--ok').waitFor();
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'galaxy'));
    await d.settle();
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
    for (const pod of ['Harbor Pod', 'Lantern Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:') === true, undefined, { timeout: 30_000 });
    await page.waitForTimeout(800);
    for (const line of await preview()) d.note(`first look: ${line}`);
    await d.shot('round-first-look');
    await d.dump('round-first-look');
    // History streams after the first look; wait for it to finish (the player's load state settles).
    await page.waitForFunction(() => window.__starChartTest!.stream() === null, undefined, { timeout: 180_000 });
    await d.settle();
    await page.waitForTimeout(1500);
    for (const line of await preview()) d.note(`after history: ${line}`);
    await d.shot('round-after-history');
    await d.dump('round-after-history');
    return;
  }
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(800);
  for (const line of await preview()) d.note(`fixtures: ${line}`);
  await d.shot('round-rest');
  await d.dump('round-rest');
  // A deeper Area Path than the plate holds: the path gives way from its start, the count stays.
  const long = await page.locator('.callout--star', { hasText: 'Harbor Pod' }).first().evaluate((el) => {
    el.querySelector('.holo__meta-head')!.textContent = 'Tidewater Array\\Harbor Team\\Harbor Night Shift\\Harbor Pod';
    const tail = el.querySelector('.holo__meta-tail')!.getBoundingClientRect();
    return `plate ${Math.round(el.getBoundingClientRect().width)} px, count's right edge ${Math.round(el.getBoundingClientRect().right - tail.right)} px inside`;
  });
  d.note(`long path: ${long}`);
  await d.shot('round-long-path');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().hover();
  await page.waitForTimeout(500);
  await d.shot('round-harbor-pointed');
  // Zoom on Harbor Pod's preview, to read the miniature itself.
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().click();
  await page.evaluate(() => {
    const star = window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'star' && n.label === 'Harbor Pod')!;
    window.__starChartTest!.setCamera({ x: star.world.x, y: star.world.y + 40, scale: 1.6 });
  });
  await page.mouse.move(5, 300);
  await page.waitForTimeout(1200);
  await d.shot('round-harbor-close');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(1200);
  await d.shot('region-harbor');
}
