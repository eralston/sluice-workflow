// Side-panel layout in the Feature scene (debugging a baseline difference): row heights, scroll state.
import type { Drive } from '../drive';

export default async function panelMetrics(d: Drive): Promise<void> {
  await d.openCometCrew();
  await d.enterNodeByKey(await d.keyOf('star', 'Unified quote ledger'));
  await d.page.mouse.move(0, 0);
  await d.page.waitForTimeout(800);
  const m = await d.page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const box = (el: HTMLElement | null) => el ? { h: el.getBoundingClientRect().height, sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop } : null;
    const rows = [...document.querySelectorAll('.object-list li button')].map((b) => Math.round((b as HTMLElement).getBoundingClientRect().height * 10) / 10);
    return { rows, list: box(q('.object-list')), panel: box(q('.sidepanel')), tab: box(q('[role="tabpanel"]')), inspector: box(q('.inspector')), active: document.activeElement?.className ?? null, pressed: document.querySelector('.object-list button[aria-pressed="true"]')?.textContent };
  });
  d.note(JSON.stringify(m));
  await d.shot('feature');
}
