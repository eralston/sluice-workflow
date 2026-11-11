// 27 E5a: the director's forms in Quasar Pod. Run: npm run drive -- tests/drive/steps/e5-director.ts --paradigm solar
// Without --paradigm solar the app opens in Backlog or Sprints, where Quasar's schedule is not the solar one.
// Each beat is stepped into (seek to just before it, then Step: exactly that beat plays, as solar-play's stepInto).
// A first pass finds, in the app, a progress beam, the shortest Power link (the short form) and the longest close
// (a full form, the day's climax candidate); a second pass shoots each partway through. Beats are found in the app,
// never by ledger index (the ledger's scene differs). Fixture data only (INV-18).
// Stills are copied to docs/progress/v1.4/work/E5/e5a-*.png by hand.
import type { Drive } from '../drive';

export default async function e5(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  d.note(`scene ${await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)}; ${beats.length} beats`);

  const stepInto = async (startMs: number) => {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), startMs - 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
  };
  type Hit = { index: number; startMs: number; len: number; rules: string[] /* the notes showing */; utc: number };
  const hits: Hit[] = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    if (!b.accented) continue;
    const len = Math.round((beats[i + 1]?.startMs ?? b.startMs) - b.startMs);
    await stepInto(b.startMs);
    await page.waitForTimeout(450);
    const rules = await page.evaluate(() => Object.values(window.__starChartTest!.annotations().notes).map((n) => n.text));
    d.note(`#${b.index} len=${len} ${new Date(b.sourceUtc).toISOString()} notes=${JSON.stringify(rules)}`);
    hits.push({ index: b.index, startMs: b.startMs, len, rules, utc: b.sourceUtc });
  }
  // The app exposes no rule ids, so the beats are picked by what the scene shows: a progress beam is the only merge
  // note ("... — Merged") on a short beat; the short Power link is the beat at its fixture time (14 Sep 22:17, a
  // merge whose approvers form up, short); the climax candidate is the longest beat of the scene (a full form).
  const progress = hits.find((h) => h.rules.some((t) => t.endsWith('— Merged')));
  const at = (iso: string) => hits.find((h) => h.utc === Date.parse(iso));
  const shortLink = at('2026-09-14T22:17:00Z');
  const climax = [...hits].sort((a, z) => z.len - a.len)[0];
  const shoot = async (h: Hit | undefined, offsets: number[], name: string) => {
    if (!h) { d.note(`${name}: no such beat in this scene`); return; }
    d.note(`${name}: beat ${h.index} at ${Math.round(h.startMs)} ms, ${new Date(h.utc).toISOString()}, len ${h.len}, notes ${JSON.stringify(h.rules)}`);
    await stepInto(h.startMs);
    const t0 = Date.now();
    for (const off of offsets) {
      const wait = off - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      d.note(`${name}+${off}: notes ${JSON.stringify(Object.values(await page.evaluate(() => window.__starChartTest!.annotations().notes)).map((n) => n.text))}`);
      await d.shot(`${name}-${off}`);
    }
    await page.evaluate(() => window.__starChartTest!.pause());
  };
  await shoot(progress, [700], 'progress-act');            // agent.progress: act 300..1100, echo to 1500
  await shoot(shortLink, [1500], 'short-link-echo');       // attachment.merge short: echo at 1980
  // In Quasar (over the target) the 22:17 merge is a montage moment (E5b): one plate, one note, no crew named.
  // The 22:17 merge's plate sits in a crowded corner (E5c review: it was hidden); 22 Sep 20:25 is a clear case. Both draw their note now.
  await shoot(shortLink, [300, 700, 1000], 'montage-plate-crowded');
  await shoot(at('2026-09-22T20:25:00Z'), [700, 1100], 'montage-plate');
  await shoot(climax, [1500, 3500], 'climax-close');       // the longest close: a full form
}
