// A quick look at the fixture chart: galaxy, a sector, a Feature system, one beat played.
import type { Drive } from '../drive';

export default async function tour(d: Drive): Promise<void> {
  await d.shot('galaxy');
  await d.openCometCrew();
  await d.shot('sector');
  await d.enterNodeByKey(await d.keyOf('star', 'Unified quote ledger'));
  await d.shot('feature');
  await d.page.evaluate(() => window.__starChartTest!.stepBeat());
  await d.page.waitForTimeout(1500);
  await d.shot('after-a-beat');
  await d.dump('feature');
}
