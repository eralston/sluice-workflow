// The v1.1 review tour (19; fixture data only, INV-18): one walk through every v1.1 item, in the order
// a user meets them. Run with --paradigm solar; with --fake-ado pod-sprint as well, it connects to the
// fake org first, and the pod star's inspector has Remove from View (N1 is ADO mode only).
// - The galaxy at rest, then Tidewater Array pointed at (L1, L3) and selected.
// - The round (Sprint 13) at rest with its previews (P1, L4), Harbor Pod pointed at, then selected
//   (the inspector: Enter pod system, and Remove from View in ADO mode, N1).
// - Harbor Pod's region at its end (the star still selected from the round), then mid-round at rest
//   (L1, L7: no piece plates), a homeworld's plate expanded (L2, L5), a seated piece pointed at (its
//   planet's row lit, L7), a dreadnought pointed at (its PRs, L6), the map key (P2).
// - Playback from the start at 2×, a still every 2.5 s: the cast pieces' titles (L7 b), the frontier
//   belt (S2), the captains' squares (L8), any station on standby (M1). Then the end.
// Each still's note says what's on screen: piece plates, the belt's presence, every station's state.
import type { Drive } from '../drive';

export default async function v11Tour(d: Drive): Promise<void> {
  const { page } = d;
  const box = async () => (await page.locator('.chart-host canvas').boundingBox())!;
  const off = async () => {
    const b = await box();
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(700);
  };
  const hover = async (text: string, kind = '') => {
    await page.locator(`.callout${kind}`, { hasText: text }).first().hover();
    await page.waitForTimeout(500);
  };
  /** Points at a drawn node by its projection key. */
  const pointAt = async (pk: string) => {
    const b = await box();
    const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk);
    if (!p) return false;
    await page.mouse.move(b.x + p.x, b.y + p.y);
    await page.waitForTimeout(600);
    return true;
  };
  const seek = async (share: number) => {
    await page.evaluate((s) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * s), share);
    await d.settle();
  };
  const scene = (prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p) === true, prefix, { timeout: 30_000 });
  /** What a still shows, beyond the picture: the shown plates by kind, the belt, the stations. */
  const describe = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null).map((e) => e.querySelector('.callout__title')?.textContent ?? '');
    const fs = g.nodes.filter((n) => n.kind === 'facility');
    const tints = t.viewTints(fs.map((n) => n.projectionKey));
    const s = t.session();
    return {
      scene: g.sceneKey.split(':')[0], status: s.status, x: Math.round(s.x * 100) / 100, beat: `${s.beatIndex}/${s.beats}`,
      pieces: shown('.callout--objective, .callout--threat'),
      expanded: shown('.callout.is-expanded'),
      belt: t.guides().solar ?? null,
      stations: fs.map((n) => `${n.label} ${n.piece?.open ?? 0} open${n.piece?.standby ? ' STANDBY' : ''} tint ${tints[n.projectionKey] ?? '-'}`),
    };
  });
  const shot = async (name: string) => {
    await d.shot(name);
    d.note(`${name}: ${JSON.stringify(await describe())}`);
  };
  const inspector = async (name: string) => {
    const text = (await page.locator('.inspector').allInnerTexts()).join(' / ').replace(/\s*\n\s*/g, ' | ');
    d.note(`${name} inspector: ${text}`);
  };

  // ---- The galaxy (L1, L3) ----
  await page.waitForTimeout(1500);
  const ado = await page.locator('.cosmos__cta').isVisible();
  if (ado) {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(d.canary);
    await page.locator('.connect button[type="submit"]').click();
    await page.locator('.connect__msg--ok').waitFor();
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'galaxy'));
  }
  d.note(`mode: ${ado ? 'fake ADO' : 'fixtures'}`);
  await d.settle();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(500);
  await shot('galaxy-rest');
  await hover('Tidewater Array', '--galaxy');
  await shot('galaxy-pointed');
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(700);
  await page.mouse.move(5, 300);
  await page.waitForTimeout(300);
  await shot('galaxy-selected');
  await inspector('galaxy-selected');

  // ---- The round (P1, L4, N1) ----
  if (ado) {
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
    for (const pod of ['Harbor Pod', 'Lantern Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
  } else {
    await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  }
  await scene('sprint:');
  await d.settle();
  await page.waitForTimeout(1500); // the round doesn't play; let its stars and previews land
  if (ado) await page.waitForFunction(() => (window.__starChartTest!.stream()?.pending ?? 0) === 0, undefined, { timeout: 60_000 }).catch(() => undefined);
  await off();
  await shot('round-rest');
  await hover('Harbor Pod');
  await shot('round-harbor-pointed');
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().click();
  await off();
  await shot('round-harbor-selected');
  await inspector('round-harbor-selected');
  d.note(`Remove from View in the inspector: ${await page.locator('.inspector .enter-link', { hasText: 'Remove from View' }).count() > 0 ? 'yes' : 'no (fixture mode: ADO only, 19 N1)'}`);

  // ---- Harbor Pod's region ----
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  if (ado) await page.waitForFunction(() => (window.__starChartTest!.stream()?.pending ?? 0) === 0, undefined, { timeout: 60_000 }).catch(() => undefined);
  await off();
  await page.waitForTimeout(500);
  // Entering keeps the pod's star selected (the round's double-click picked it), so it's lifted here.
  await shot('region-end-star-selected');
  // Mid-round, where tide-gateway holds most of its PRs open and the frontier has work in it.
  await seek(0.6);
  await off();
  await shot('region-rest');
  await d.dump('region-rest');

  // A homeworld's plate expanded (pointed at its plate).
  const seat = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'seat')
      .map((n) => ({ label: n.label, rows: g.lists?.[n.projectionKey]?.rows.length ?? 0 }))
      .sort((a, b) => b.rows - a.rows)[0]?.label ?? null;
  });
  if (seat) {
    await hover(seat, '--seat');
    await shot('homeworld-expanded');
  }
  await off();

  // A seated piece pointed at: its planet's plate expands with its row lit.
  const seated = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const w = document.querySelector('.chart-host canvas')!.getBoundingClientRect().width;
    const drawn = new Set(window.__starChartTest!.displayed().filter((x) => x.x > 40 && x.x < w - 420 && x.y > 120).map((x) => x.pk));
    const hosted = new Set<string>();
    for (const n of g.nodes) if (n.kind === 'seat') for (const r of g.lists?.[n.projectionKey]?.rows ?? []) hosted.add(r.key);
    return g.nodes.find((n) => (n.kind === 'objective' || n.kind === 'threat') && drawn.has(n.projectionKey)
      && hosted.has(n.canonicalKey) && n.piece?.signal.rung !== 'accomplished')?.projectionKey ?? null;
  });
  if (seated && await pointAt(seated)) await shot('piece-pointed-row-lit');
  await off();

  // A dreadnought pointed at on its hull: its plate expands into its PRs.
  const station = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'facility')
      .sort((a, b) => (g.lists?.[b.projectionKey]?.rows.length ?? 0) - (g.lists?.[a.projectionKey]?.rows.length ?? 0))[0]?.projectionKey ?? null;
  });
  if (station && await pointAt(station)) await shot('dreadnought-expanded');
  await off();

  // The map key (P2).
  await page.keyboard.press('k');
  await page.locator('.map-key').waitFor();
  await page.mouse.move(5, 300);
  await page.waitForTimeout(400);
  await shot('map-key');
  const rows = await page.locator('.map-key__table tr').evaluateAll((trs) => trs.map((tr) => `${tr.classList.contains('is-here') ? '*' : ' '} ${[...tr.querySelectorAll('td')].map((td) => td.textContent).join(' | ')}`));
  d.note(`map key: ${rows.join(' ; ')}`);
  await page.keyboard.press('k');
  await off();

  // ---- Playback at 2× from the start, a still every 2.5 s ----
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(2); t.setScheduleMs(0); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__starChartTest!.play());
  for (let i = 1; i <= 24; i++) {
    await page.waitForTimeout(2500);
    await shot(`playing-${String(i).padStart(2, '0')}`);
    if (await page.evaluate(() => window.__starChartTest!.session().status === 'ended')) break;
  }
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await shot('end');
  await page.waitForTimeout(3500); // the round's-end finale lights the viewer's awards at about 2.7 s
  await shot('end-settled');
  await d.dump('end');
}
