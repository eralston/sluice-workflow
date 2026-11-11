// Stills for 19 M1, HG-M1 (fixture data only, INV-18): a station on standby, option A. Run with
// --paradigm solar.
// 1. pod-sprint's Harbor Pod: no station reaches standby while it plays (every quiet stretch ends past
//    the last beat), so the closest is shown: the round's last beat, harbor-console with nothing open,
//    quiet a day and a bit.
// 2. crm-quarter's North Territory: a CRM region has no beats of its own (v0's pod membership counts
//    User Stories and Bugs only), so it is drawn as its round ended, where two accounts' stations are
//    on standby beside one that's awake; then one pointed at (its plate lifts), then reduced motion.
// Each shot notes every station's open PRs, standby, activity, the view's tint (1 untinted) and its
// plate's tier, with a crop round one station. The fade itself is in the gallery (facility cells).
import { join } from 'node:path';
import type { Drive } from '../drive';

const OUT = 'test-results/drive/v11-M1';

export default async function v11M1(d: Drive): Promise<void> {
  const { page } = d;
  const seek = async (ms: number) => {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
    await page.waitForTimeout(120);
  };
  const stations = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const fs = t.viewGraph()!.nodes.filter((n) => n.kind === 'facility');
    const tints = t.viewTints(fs.map((n) => n.projectionKey));
    const shown = t.shownStages();
    const plates = [...document.querySelectorAll<HTMLElement>('.callout--facility')];
    return fs.map((n) => ({
      key: n.canonicalKey, label: n.label, open: n.piece?.open ?? 0, standby: !!n.piece?.standby, shownStandby: (shown[n.projectionKey] ?? '').endsWith('|sb=1'),
      activity: n.activity ?? 0, tint: tints[n.projectionKey] ?? -1,
      tier: plates.find((p) => p.textContent?.includes(n.label))?.dataset.holoTier ?? '-',
    }));
  });
  const describe = async () => (await stations()).map((s) => `${s.label}: ${s.open} open, ${s.standby ? 'STANDBY' : 'awake'}${s.shownStandby !== s.standby ? ' (shown: not yet)' : ''}, activity ${s.activity}, tint ${s.tint}, plate ${s.tier}`).join(' · ');
  const box = async () => (await page.locator('.chart-host canvas').boundingBox())!;
  /** A full still, a crop round `focus`'s station, and a note. */
  const shot = async (name: string, focus?: string) => {
    await d.shot(name);
    if (focus) {
      const b = await box();
      const at = await page.evaluate((k) => window.__starChartTest!.screenOf(k), focus);
      if (at) {
        const half = 170;
        const x = Math.max(0, b.x + at.x - half);
        const y = Math.max(0, b.y + at.y - half);
        await page.screenshot({ path: join(OUT, `${name}-crop.png`), clip: { x, y, width: half * 2, height: half * 2 } });
      }
    }
    d.note(`${name}: ${await describe()}`);
  };
  const open = async (galaxy: string, round: string, region: string) => {
    await page.locator('.callout--galaxy', { hasText: galaxy }).first().click();
    await page.waitForTimeout(600);
    await page.locator('.chooser button', { hasText: round }).first().click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
    await d.settle();
    await page.locator('.callout', { hasText: region }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
    await d.settle();
    const b = await box();
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
  };
  /** Every beat's stations, read by seeking just past it. */
  const survey = async () => {
    const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
    const out: { startMs: number; sourceUtc: number; st: Awaited<ReturnType<typeof stations>> }[] = [];
    for (const b of beats) {
      await seek(b.startMs + 1);
      out.push({ startMs: b.startMs, sourceUtc: b.sourceUtc, st: await stations() });
    }
    return out;
  };

  await d.settle();
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });

  // ---- 1. pod-sprint, Harbor Pod: the closest it comes ----
  await open('Tidewater Array', 'Sprint 13', 'Harbor Pod');
  const pod = await survey();
  const ever = pod.some((b) => b.st.some((s) => s.standby));
  d.note(`pod-sprint Harbor Pod: ${pod.length} beats; a station on standby at any beat: ${ever ? 'yes' : 'no'}`);
  const last = pod.at(-1)!;
  await seek(last.startMs + 1);
  await page.waitForTimeout(1500);
  const quietest = last.st.filter((s) => s.open === 0).sort((a, b) => a.activity - b.activity)[0];
  d.note(`pod-sprint last beat ${new Date(last.sourceUtc).toISOString()}: the quietest station is ${quietest?.label ?? 'none'}`);
  await shot('pod-sprint-last-beat', quietest?.key);

  // ---- 2. crm-quarter, North Territory: standby and waking ----
  // Back up the chain: region → round → galaxy.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape');
    await d.settle();
  }
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey === 'galaxy', undefined, { timeout: 20_000 });
  await open('Larch & Pine Trading', 'Q3 2026', 'North Territory');
  // Its region has no beats (see the note), so it is drawn as the round ended, 1 Oct: Birchwood Mills
  // quiet since 26 Aug and Osprey Freight since 16 Sep, both with nothing open; Quillon Dairy's quote
  // is still out, so it's awake.
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().length);
  d.note(`crm-quarter North Territory: ${beats} beats, so it shows the round's end at rest`);
  await page.waitForTimeout(1500);
  const crm = await stations();
  const pick = (label: string) => crm.find((s) => s.label === label)?.key;
  await shot('crm-region-end', pick('Birchwood Mills'));
  for (const label of ['Osprey Freight', 'Quillon Dairy']) {
    const k = pick(label);
    if (!k) continue;
    const b = await box();
    const at = await page.evaluate((x) => window.__starChartTest!.screenOf(x), k);
    if (at) await page.screenshot({ path: join(OUT, `crm-region-end-${label.split(' ')[0]!.toLowerCase()}-crop.png`), clip: { x: Math.max(0, b.x + at.x - 170), y: Math.max(0, b.y + at.y - 170), width: 340, height: 340 } });
  }
  // Pointed at on standby: its plate lifts, as any plate does, and expands into its PRs.
  const birch = pick('Birchwood Mills');
  const at = birch ? await page.evaluate((k) => window.__starChartTest!.screenOf(k), birch) : null;
  if (at) {
    const b = await box();
    await page.mouse.move(b.x + at.x, b.y + at.y);
    await page.waitForTimeout(600);
    await shot('crm-standby-pointed', birch);
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(800);
  }
  // Reduced motion: the same standby look, still.
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  await page.waitForTimeout(400);
  await shot('crm-standby-reduced', birch);
  await page.evaluate(() => window.__starChartTest!.setReduced(false));
}
