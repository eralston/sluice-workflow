// 19 N1: Remove from View, and Add, where the object is (run with --fake-ado pod-sprint --paradigm
// solar). Connect to the fake org, select the one galaxy (its Remove from View is disabled: the last
// project stays), save Harbor and Lantern Pod, open the round with nothing selected (+ Add an Area
// Path), add Reef Pod from the inspector's picker, select its star and remove it again.
import type { Drive } from '../drive';

export default async function n1(d: Drive): Promise<void> {
  const { page } = d;
  const stars = () => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'star').map((n) => n.label));
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(d.canary);
  await page.locator('.connect button[type="submit"]').click();
  await page.locator('.connect__msg--ok').waitFor();
  await page.locator('.connect__close').click();
  await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'galaxy'));
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(400);
  await d.shot('galaxy-selected-last-project');

  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
  for (const pod of ['Harbor Pod', 'Lantern Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
  await page.locator('.area-chooser .cosmos__cta').click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:') === true, undefined, { timeout: 30_000 });
  await d.settle();
  await page.waitForTimeout(1500); // the round doesn't play; let its stars land
  await d.shot('round-nothing-selected');

  await page.locator('.inspector .enter-link', { hasText: '+ Add an Area Path' }).click();
  await page.locator('.add-picker__row').first().waitFor({ timeout: 20_000 });
  await d.shot('round-add-picker');
  await page.locator('.add-picker__row', { hasText: 'Reef Pod' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'star' && n.label === 'Reef Pod'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.waitForTimeout(900);
  d.note(`stars after add: ${(await stars()).join(', ')}`);
  await d.shot('round-reef-added');

  await page.locator('.callout', { hasText: 'Reef Pod' }).first().click();
  await page.waitForTimeout(400);
  await d.shot('pod-star-selected');
  await page.locator('.inspector .enter-link', { hasText: 'Remove from View' }).click();
  await page.waitForFunction(() => !window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'star' && n.label === 'Reef Pod'), undefined, { timeout: 20_000 });
  await page.waitForTimeout(300);
  await d.shot('pod-star-departing');
  await page.waitForTimeout(1200);
  d.note(`stars after remove: ${(await stars()).join(', ')}`);
  await d.shot('round-reef-removed');
  await d.dump('round');
}
