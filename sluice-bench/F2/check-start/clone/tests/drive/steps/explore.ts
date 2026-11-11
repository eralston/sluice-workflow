// Loading by level against the fake org (run with --fake-ado crowded-org): connect, open Pine Team,
// enter a Feature, load its history.
import type { Drive } from '../drive';

export default async function explore(d: Drive): Promise<void> {
  const { page } = d;
  await d.shot('empty-cosmos');
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(d.canary);
  await page.locator('.connect button[type="submit"]').click();
  await page.locator('.connect__msg--ok').waitFor();
  await page.locator('.connect__close').click();
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.length > 0);
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:'));
  await d.settle();
  await d.shot('team');
  await page.locator('.callout', { hasText: 'Trail map export' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('feature:'));
  await d.settle();
  await page.locator('.transport__load').click();
  await page.locator('.transport__play').waitFor({ timeout: 30_000 });
  await d.shot('feature-with-history');
  await d.dump('feature');
}
