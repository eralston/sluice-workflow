// The loading moment from a galaxy's double-click to its sector (run with --fake-ado crowded-org
// --delay 150): samples the energy every 50 ms, so gaps and restarts show in the notes.
import type { Drive } from '../drive';

export default async function openTiming(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(d.canary);
  await page.locator('.connect button[type="submit"]').click();
  await page.locator('.connect__msg--ok').waitFor({ timeout: 30_000 });
  await page.locator('.connect__close').click();
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.length > 0, undefined, { timeout: 30_000 });
  await d.settle();
  await page.waitForTimeout(1500);
  // Juniper Ridge: a double-click opens its saved area, or its Area Path plate when it has none.
  const samples = page.evaluate(async () => {
    const out: string[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 12_000) {
      const e = window.__starChartTest!.energy();
      const scene = window.__starChartTest!.viewGraph()?.sceneKey.split(':')[0];
      out.push(`${Math.round(performance.now() - t0)}ms ${scene} ${e.kinds.join(',') || '-'}${window.__starChartTest!.exploring() ? ' exploring' : ''}`);
      if (scene === 'sector' && !window.__starChartTest!.transitioning() && !window.__starChartTest!.exploring() && e.kinds.length === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  });
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  // No saved area yet: the Area Path plate opens; pick Pine Team and chart it.
  const plate = page.locator('.area-chooser label', { hasText: 'Pine Team' });
  if (await plate.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    d.note('plate shown');
    await plate.locator('input').check();
    await page.locator('.area-chooser .cosmos__cta').click();
    d.note('chart clicked');
  }
  const lines = await samples;
  // Collapse runs of identical states.
  let last = '';
  for (const l of lines) { const s = l.slice(l.indexOf(' ') + 1); if (s !== last) d.note(l); last = s; }
  await d.shot('sector');
}
