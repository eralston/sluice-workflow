// Block E audit probe (E10-Q1): the history the app holds for Quasar's sprint, against the ledger's.
// Run: npm run drive -- docs/progress/v1.4/work/block-E/probe-history.ts --paradigm solar. Fixture data only.
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const st = JSON.parse(window.__starChartTest!.storeJson()) as { history?: { events: { occurredAt: number; kind: string; entityKey: string }[]; entities: { workItems: unknown[]; prs: unknown[] }; scope: unknown; range: unknown } };
    const h = st.history;
    const ev = h?.events ?? [];
    const near = ev.filter((e) => e.occurredAt >= Date.parse('2026-09-15T18:50:00Z') && e.occurredAt <= Date.parse('2026-09-15T20:30:00Z'))
      .map((e) => `${new Date(e.occurredAt).toISOString()} ${e.kind} ${e.entityKey.slice(-6)}`);
    return { events: ev.length, wis: h?.entities.workItems.length, prs: h?.entities.prs.length, scope: JSON.stringify(h?.scope).slice(0, 300), near, keys: Object.keys(st).filter((k) => /hist|scope|stream|level/i.test(k)) };
  });
  d.note(JSON.stringify(r, null, 1));
}
