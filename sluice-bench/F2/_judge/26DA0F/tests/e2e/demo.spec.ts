// The demo project (decided 2026-10-27): Halcyon Reach holds five pods, so a demo can start at All projects and open them
// in turn. Checked in the default Solar chain on the default fixture: one captain, three, six (the manager holds no Story
// or Bug, so has no planet), twenty, and Meteor's three (27 F1).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import { featureName, FEATURE_OPEN_LINES, FEATURE_LINE_PX, FEATURE_ROW_CAP } from '../../src/shared/featureRow';
import { prStatLine } from '../../src/shared/prStat';
import { RUN_DOT_HEX, RUN_WORD } from '../../src/shared/runLine';
import { stationRuns } from '../../fixtures/scenarios/halcyon/runs';
import { launchApp, settle } from './launch';

const graph = (page: Page) => page.evaluate(() => window.__starChartTest!.viewGraph()!);
const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });

const PODS: [string, number][] = [['Comet Pod', 1], ['Nova Pod', 3], ['Quasar Pod', 6], ['Pulsar Pod', 20], ['Meteor Pod', 3]];

/** Bring a station's hull clear of the edges, wait for it to be still, then point at it (its plate expands). */
async function expandStation(page: Page, pk: string): Promise<void> {
  await page.mouse.move(2, 2);
  await expect(page.locator('.callout--facility.is-expanded')).toHaveCount(0); // the last plate's grace has run out
  await page.evaluate((k) => {
    const t = window.__starChartTest!;
    const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === k)!;
    const p = t.screenOf(n.canonicalKey)!;
    const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
    const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
    const dx = into(p.x, 80, r.width - 460);
    const dy = into(p.y, 160, r.height - 200);
    const cam = t.camera();
    if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
  }, pk);
  await settle(page);
  await expect.poll(async () => {
    const at = () => page.evaluate((k) => { const d = window.__starChartTest!.displayed().find((x) => x.pk === k); return d ? `${Math.round(d.x)},${Math.round(d.y)}` : ''; }, pk);
    const a = await at();
    await page.waitForTimeout(150);
    return a !== '' && a === (await at());
  }).toBe(true);
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const at = (await page.evaluate((k) => window.__starChartTest!.displayed().find((d) => d.pk === k) ?? null, pk))!;
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await expect(page.locator('.callout--facility.is-expanded')).toHaveCount(1);
}

/** A4: in the current scene, expand each station's plate (the ten with the most rows) and check its rows never run sideways. */
async function checkStationPlates(page: Page, label: string): Promise<number> {
  const stations = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'facility')
      .map((n) => ({ pk: n.projectionKey, rows: (g.lists?.[n.projectionKey]?.rows ?? []).map((r) => ({ key: r.key, stat: r.stat ?? '' })) }))
      .filter((s) => s.rows.length > 0).sort((a, b) => b.rows.length - a.rows.length).slice(0, 10);
  });
  for (const st of stations) {
    await expandStation(page, st.pk);
    const got = await page.evaluate(() => {
      const rows = document.querySelector('.callout--facility.is-expanded .holo__rows')!;
      const box = rows.getBoundingClientRect();
      const out: { key: string; stat: string; facts: { l: number; r: number }[] }[] = [];
      for (const li of rows.querySelectorAll<HTMLElement>('.holo__row')) {
        const stat = li.querySelector('.holo__stat:not(.holo__stat--empty)');
        out.push({ key: li.dataset.key!, stat: stat?.textContent ?? '', facts: [...(stat?.querySelectorAll('.holo__fact') ?? [])].map((f) => { const b = f.getBoundingClientRect(); return { l: b.left - box.left, r: box.right - b.right }; }) });
      }
      return { sw: rows.scrollWidth, cw: rows.clientWidth, rows: out };
    });
    expect(got.sw, `${label} ${st.pk}: rows box scrollWidth`).toBeLessThanOrEqual(got.cw);
    for (const r of got.rows) {
      const want = st.rows.find((x) => x.key === r.key);
      if (!want) continue;
      expect(r.stat, `${label} ${r.key}`).toBe(want.stat);
      for (const f of r.facts) { expect(f.l, `${label} ${r.key} fact left`).toBeGreaterThanOrEqual(-0.5); expect(f.r, `${label} ${r.key} fact right`).toBeGreaterThanOrEqual(-0.5); }
    }
  }
  return stations.length;
}

test.describe('the Halcyon Reach demo', () => {
  test.describe.configure({ mode: 'serial' });
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '' })); });
  test.afterAll(async () => { await app?.close(); });

  test('All projects → Halcyon Reach → Sprint 41 lists five pods', async () => {
    expect((await graph(page)).sceneKey).toBe('galaxy');
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    const stars = (await graph(page)).nodes.filter((n) => n.kind === 'star');
    expect(stars.map((n) => n.label)).toEqual(PODS.map(([name]) => name));
  });

  for (const [pod, seats] of PODS) {
    test(`${pod} seats ${seats} captain${seats === 1 ? '' : 's'}`, async () => {
      await page.locator('.callout', { hasText: pod }).first().dblclick();
      await sceneIs(page, 'pod');
      await settle(page);
      const region = await graph(page);
      expect(region.nodes.filter((n) => n.kind === 'seat')).toHaveLength(seats);
      expect(region.nodes.some((n) => n.kind === 'objective' || n.kind === 'threat')).toBe(true);
      await page.keyboard.press('Escape');
      await settle(page);
      await sceneIs(page, 'sprint');
    });
  }
  // B1: a station's expanded plate carries a quiet stat line under each PR row. The values are the fixture's own.
  test('an expanded station plate in Quasar Pod shows each PR’s stat line', async () => {
    await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const specs = new Map(halcyon.ops.flatMap((o) => (o.op === 'prStats' ? [[o.prId, o.spec] as const] : [])));
    const expectedLine = (key: string) => {
      const sp = specs.get(Number(key.split(':').pop()))!;
      const votes = Object.values(sp.votes ?? {});
      const n = (f: (v: number) => boolean) => votes.filter(f).length;
      return prStatLine({
        votes: { approved: n((v) => v === 10), suggestions: n((v) => v === 5), waiting: n((v) => v === -5), rejected: n((v) => v === -10) },
        pushes: sp.pushes, threads: sp.threads, files: sp.files,
      });
    };
    const station = await page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const best = g.nodes.filter((n) => n.kind === 'facility').map((n) => ({ pk: n.projectionKey, rows: g.lists?.[n.projectionKey]?.rows ?? [] })).sort((a, b) => b.rows.length - a.rows.length)[0];
      return best ? { pk: best.pk, rows: best.rows.slice(0, 16).map((r) => ({ key: r.key, stat: r.stat ?? null })) } : null;
    });
    expect(station).not.toBeNull();
    expect(station!.rows.length).toBeGreaterThanOrEqual(2);
    for (const r of station!.rows) expect(r.stat, r.key).toBe(expectedLine(r.key));
    // Bring the hull clear of the edges, wait for it to be still, then point at it.
    await page.evaluate((pk) => {
      const t = window.__starChartTest!;
      const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === pk)!;
      const p = t.screenOf(n.canonicalKey)!;
      const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
      const dx = into(p.x, 80, r.width - 460);
      const dy = into(p.y, 160, r.height - 200);
      const cam = t.camera();
      if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
    }, station!.pk);
    await settle(page);
    await expect.poll(async () => {
      const at = () => page.evaluate((pk) => { const d = window.__starChartTest!.displayed().find((x) => x.pk === pk); return d ? `${Math.round(d.x)},${Math.round(d.y)}` : ''; }, station!.pk);
      const a = await at();
      await page.waitForTimeout(150);
      return a !== '' && a === (await at());
    }).toBe(true);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const at = (await page.evaluate((pk) => window.__starChartTest!.displayed().find((d) => d.pk === pk) ?? null, station!.pk))!;
    await page.mouse.move(box.x + at.x, box.y + at.y);
    const plate = page.locator('.callout--facility.is-expanded');
    await expect(plate).toHaveCount(1);
    const stats = plate.locator('.holo__row .holo__stat:not(.holo__stat--empty)');
    await expect(stats).toHaveCount(station!.rows.length);
    const shown = await stats.allTextContents();
    expect(shown).toEqual(station!.rows.map((r) => r.stat));
    // Quiet: the subtitle's colour at a size down.
    const colours = await page.evaluate(() => {
      const css = (el: Element) => getComputedStyle(el).color;
      const stat = document.querySelector('.callout--facility.is-expanded .holo__row .holo__stat:not(.holo__stat--empty)')!;
      const sub = document.querySelector('.callout--facility.is-expanded .holo__row .holo__sub')!;
      return { stat: css(stat), t3: getComputedStyle(document.documentElement).getPropertyValue('--holo-t3-sub').trim(), sub: css(sub), size: getComputedStyle(stat).fontSize };
    });
    expect(colours.stat).toBe(colours.sub);
    expect(colours.size).toBe('9px');
    // R4: every PR row holds the line's height, and the expanded plate sits inside the view (not under the bar).
    const fit = await page.evaluate(() => {
      const plate = document.querySelector('.callout--facility.is-expanded')!.getBoundingClientRect();
      const host = document.querySelector('.chart-host')!.getBoundingClientRect();
      return { top: plate.top - host.top, bottom: host.bottom - plate.bottom, rows: document.querySelectorAll('.callout--facility.is-expanded .holo__row').length, lines: document.querySelectorAll('.callout--facility.is-expanded .holo__row .holo__stat').length };
    });
    expect(fit.top).toBeGreaterThanOrEqual(-1);
    expect(fit.bottom).toBeGreaterThanOrEqual(-1);
    expect(fit.lines).toBe(fit.rows);
    await page.screenshot({ path: 'test-results/demo-pr-stat-line.png' });
  });

  // B2: a station's plate carries the repo's latest pipeline run, `Last run: passed · 2 h ago`, with a neutral dot. The
  // runs are read after the scene is drawn and arrive behind it; a station with no pipeline keeps the line's height empty.
  test('a station plate in Quasar Pod shows the repository’s last run, in a neutral tone', async () => {
    const runs = new Map(stationRuns().map((r) => [r.repo, r.state]));
    // Every station's list reserves the line from its first draw; the runs land behind the scene.
    const stations = () => page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      return g.nodes.filter((n) => n.kind === 'facility').map((n) => ({ pk: n.projectionKey, name: n.label, run: g.lists?.[n.projectionKey]?.run ?? null }));
    });
    const all = await stations();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const st of all) expect(st.run, `${st.name} reserves the run line`).not.toBeNull();
    await expect.poll(async () => (await stations()).every((st) => (st.run?.text ?? '') === (runs.get(st.name) ? st.run!.text : '') && (!runs.get(st.name) || st.run!.text !== '')), { timeout: 30_000 }).toBe(true);
    const now = await stations();
    const states = new Set<string>();
    for (const st of now) {
      const want = runs.get(st.name);
      if (!want) { expect(st.run!.text, `${st.name}: no pipeline, no line`).toBe(''); continue; }
      expect(st.run!.state).toBe(want);
      expect(st.run!.text, st.name).toMatch(new RegExp(`^Last run: ${RUN_WORD[want]} · (just now|\\d+ (min|h|d) ago)$`));
      states.add(want);
    }
    expect(states.size).toBeGreaterThanOrEqual(3);
    // Point at a station with a run; its plate shows the line with a dot in the fixture's tone.
    const target = now.find((st) => runs.get(st.name))!;
    await page.evaluate((pk) => {
      const t = window.__starChartTest!;
      const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === pk)!;
      const p = t.screenOf(n.canonicalKey)!;
      const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
      const dx = into(p.x, 80, r.width - 460);
      const dy = into(p.y, 160, r.height - 200);
      const cam = t.camera();
      if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
    }, target.pk);
    await settle(page);
    await expect.poll(async () => {
      const at = () => page.evaluate((pk) => { const d = window.__starChartTest!.displayed().find((x) => x.pk === pk); return d ? `${Math.round(d.x)},${Math.round(d.y)}` : ''; }, target.pk);
      const a = await at();
      await page.waitForTimeout(150);
      return a !== '' && a === (await at());
    }).toBe(true);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const at = (await page.evaluate((pk) => window.__starChartTest!.displayed().find((d) => d.pk === pk) ?? null, target.pk))!;
    await page.mouse.move(box.x + at.x, box.y + at.y);
    const plate = page.locator('.callout--facility.is-expanded');
    await expect(plate).toHaveCount(1);
    const line = plate.locator('.holo__run');
    await expect(line).toHaveText(target.run!.text);
    const want = runs.get(target.name)!;
    const dot = await line.locator('.holo__run-dot').evaluate((el) => getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).borderTopColor + '|' + el.style.getPropertyValue('--run'));
    expect(dot.toLowerCase()).toContain(RUN_DOT_HEX[want].toLowerCase());
    // The text is as quiet as the PR stat line: the subtitle's colour at 9 px.
    const type = await page.evaluate(() => {
      const run = document.querySelector('.callout--facility.is-expanded .holo__run')!;
      const sub = document.querySelector('.callout--facility.is-expanded .holo__row .holo__sub')!;
      return { size: getComputedStyle(run).fontSize, colour: getComputedStyle(run).color, sub: getComputedStyle(sub).color };
    });
    expect(type.size).toBe('9px');
    expect(type.colour).toBe(type.sub);
    // R4: the line sits above the rows, inside the plate.
    const order = await page.evaluate(() => {
      const r = (e: Element | null) => e?.getBoundingClientRect();
      const pl = document.querySelector('.callout--facility.is-expanded')!;
      return { run: r(pl.querySelector('.holo__run'))!.bottom, rows: r(pl.querySelector('.holo__rows'))!.top, plateBottom: r(pl)!.bottom, rowsBottom: r(pl.querySelector('.holo__rows'))!.bottom };
    });
    expect(order.run).toBeLessThanOrEqual(order.rows + 1);
    expect(order.rowsBottom).toBeLessThanOrEqual(order.plateBottom + 1);
    await page.screenshot({ path: 'test-results/demo-run-line.png' });
  });

  // B3, 27 B2: the star's plate names its top Feature by piece count and `+N more` on one line; pointing at or selecting the star opens
  // the whole list in place; the Inspector lists every Feature. No object is drawn for a Feature (INV-10): it is text.
  // 27 Decisions 2026-11-01 (audit B2): the selection made by entering a pod keeps the star selected but doesn't open its list.
  // Reached by entering, with no select(null); pointing at the star, then, opens it.
  test('entering Quasar Pod leaves the star selected with one Features line, and pointing at it opens the list (27 B2)', async () => {
    if ((await graph(page)).sceneKey.startsWith('pod:')) { await page.keyboard.press('Escape'); await sceneIs(page, 'sprint'); await settle(page); }
    await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(800); // past the grace
    const star = (await graph(page)).nodes.find((n) => n.kind === 'star')!;
    expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(star.canonicalKey);
    const plate = page.locator('.callout--star', { hasText: 'Quasar Pod' });
    await expect(plate.locator('.holo__feat-name')).toHaveCount(1);
    await plate.hover();
    await expect.poll(async () => plate.locator('.holo__feat-name').count()).toBe(star.features!.length);
    await page.mouse.move(2, 2);
    await expect.poll(async () => plate.locator('.holo__feat-name').count()).toBe(1);
  });

  test('the Quasar star plate names its top Feature and +N more on one line, and pointing at it opens the list in place (23 B3, 27 B2)', async () => {
    await page.evaluate(() => window.__starChartTest!.select(null));
    await page.mouse.move(2, 2);
    await page.waitForTimeout(700);
    await settle(page);
    const star = (await graph(page)).nodes.find((n) => n.kind === 'star')!;
    const all = star.features!;
    expect(all.length).toBeGreaterThan(FEATURE_ROW_CAP);
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.count).toBeGreaterThanOrEqual(all[i]!.count);
    const plate = page.locator('.callout--star', { hasText: 'Quasar Pod' });
    await expect(plate).toHaveCount(1);
    const feats = plate.locator('.holo__feat-name');
    await expect(feats).toHaveCount(1);
    expect(await feats.allTextContents()).toEqual([featureName(all[0]!)]);
    expect(await feats.first().textContent()).toMatch(/^Feature #\d+ · \S/);
    const more = plate.locator('.holo__feat .holo__feat-more');
    await expect(more).toHaveText(`+${all.length - 1} more`);
    expect(await plate.locator('.holo__feat-scroll').evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(FEATURE_LINE_PX + 1);
    // Quiet: the stat line's size and colour, under the counts line.
    const type = await page.evaluate(() => {
      const pl = document.querySelector('.callout--star')!;
      const f = pl.querySelector('.holo__feat')!;
      return { size: getComputedStyle(f).fontSize, featTop: f.getBoundingClientRect().top, metaBottom: pl.querySelector('.holo__meta')!.getBoundingClientRect().bottom };
    });
    expect(type.size).toBe('9px');
    expect(type.featTop).toBeGreaterThanOrEqual(type.metaBottom - 1);
    await page.screenshot({ path: 'test-results/demo-star-features-rest.png' });
    const rest = await plate.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const f = el.querySelector<HTMLElement>('.holo__features')!;
      const keep = f.style.display;
      f.style.display = 'none';
      const bare = el.getBoundingClientRect().width;
      f.style.display = keep;
      return { side: (el as HTMLElement).dataset.side, top: r.top, bottom: r.bottom, width: r.width, bare };
    });
    expect(Math.abs(rest.width - rest.bare)).toBeLessThanOrEqual(1);
    // Pointing at it opens the list in place: same side, the edge toward the star holds, nothing is selected.
    const selectedBefore = await page.evaluate(() => window.__starChartTest!.selected());
    await plate.hover({ position: { x: 4, y: 4 } });
    await expect(feats).toHaveCount(all.length);
    expect(await feats.allTextContents()).toEqual(all.map(featureName));
    await expect(plate.locator('.holo__feat-more')).toHaveCount(0);
    const open = await plate.evaluate((el) => { const r = el.getBoundingClientRect(); return { side: (el as HTMLElement).dataset.side, top: r.top, bottom: r.bottom }; });
    expect(open.side).toBe(rest.side);
    if (rest.side === 'above') expect(Math.abs(open.bottom - rest.bottom)).toBeLessThanOrEqual(1);
    if (rest.side === 'below') expect(Math.abs(open.top - rest.top)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(selectedBefore);
    await page.screenshot({ path: 'test-results/demo-star-features-pointed.png' });
    await page.mouse.move(2, 2);
    await expect.poll(async () => feats.count()).toBe(1);
    // Selected, the list is open with the mouse away, and the Inspector lists every Feature, with no button.
    await page.evaluate((k) => window.__starChartTest!.select(k), star.canonicalKey);
    await settle(page);
    await expect(feats).toHaveCount(all.length);
    const body = page.locator('[data-testid="pod-features"]');
    await expect(body.locator('li')).toHaveCount(all.length);
    expect(await body.locator('li').first().textContent()).toContain(featureName(all[0]!));
    await expect(body.locator('button')).toHaveCount(0);
    // A Feature is not an object: nothing in the scene stands for one.
    const g = await graph(page);
    expect(g.nodes.some((n) => all.some((f) => f.key === n.canonicalKey))).toBe(false);
  });

  test('at rest, Quasar’s star plate covers neither payments-sync nor search-api (27 B2)', async () => {
    await page.evaluate(() => window.__starChartTest!.select(null));
    await page.mouse.move(2, 2);
    for (const f of [1, 0.5, 0.2]) {
      await page.evaluate((x) => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * x - 1); }, f);
      await page.waitForTimeout(700);
      await settle(page);
      const r = await page.evaluate(() => {
        const box = (e: Element) => { const b = e.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
        const star = box(document.querySelector('.callout--star')!);
        return ['payments-sync', 'search-api'].map((name) => {
          const pl = [...document.querySelectorAll<HTMLElement>('.callout--facility')].find((e) => e.querySelector('.callout__title')?.textContent === name);
          const b = pl ? box(pl) : null;
          return { name, shown: !!pl && getComputedStyle(pl).display !== 'none', hit: !!b && b.x0 < star.x1 && b.x1 > star.x0 && b.y0 < star.y1 && b.y1 > star.y0 };
        });
      });
      for (const x of r) { expect(x.shown, `${x.name} shown at ${f}`).toBe(true); expect(x.hit, `${x.name} clear of the star plate at ${f}`).toBe(false); }
    }
  });

  // B3 review: a list longer than eight lines scrolls inside its box, and the plate stays on the chart when the pointer leaves.
  test('Pulsar’s ten Features open into a box of eight lines that scrolls, and the plate stays in view', async () => {
    await page.keyboard.press('Escape');
    await settle(page);
    await sceneIs(page, 'sprint');
    await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    await page.mouse.move(2, 2);
    const star = (await graph(page)).nodes.find((n) => n.kind === 'star')!;
    const all = star.features!;
    expect(all.length).toBeGreaterThan(FEATURE_OPEN_LINES);
    const plate = page.locator('.callout--star', { hasText: 'Pulsar Pod' });
    await page.evaluate((k) => window.__starChartTest!.select(k), star.canonicalKey);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(700);
    await expect(plate.locator('.holo__feat-name')).toHaveCount(all.length);
    const box = await plate.locator('.holo__feat-scroll').evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight }));
    expect(box.h).toBeLessThanOrEqual(FEATURE_OPEN_LINES * FEATURE_LINE_PX);
    expect(box.sh).toBeGreaterThan(box.h);
    const inView = async () => plate.evaluate((el) => {
      const r = el.getBoundingClientRect(), c = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      return { shown: getComputedStyle(el).opacity !== '0' && getComputedStyle(el).visibility !== 'hidden', inside: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.left >= c.left - 1 && r.right <= c.right + 1 };
    });
    expect(await inView()).toEqual({ shown: true, inside: true });
    await plate.locator('.holo__feat-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.mouse.move(400, 500);
    await page.waitForTimeout(600);
    expect(await plate.locator('.holo__feat-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await inView()).toEqual({ shown: true, inside: true });
    await page.screenshot({ path: 'test-results/demo-star-features-pulsar-open.png' });
    await page.evaluate(() => window.__starChartTest!.select(null));
  });

  // 27 B1: every plate rests at T4 Sky; it rises to its own tier while pointed at or selected, and settles back.
  test('in Pulsar Pod, paused with nothing pointed at, every plate rests at T4 Sky; pointing at or selecting an object raises its plate (27 B1)', async () => {
    const tiers = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--holo[data-holo-tier], .holo[data-holo-tier]')]
      .filter((e) => (e.style.display !== 'none' && e.getAttribute('display') !== 'none') && e.dataset.holoTier !== 'sky').map((e) => `${e.className}: ${e.dataset.holoTier}`));
    if (!(await page.evaluate(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:')))) {
      await page.keyboard.press('Escape');
      await settle(page);
      await sceneIs(page, 'sprint');
      await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
      await sceneIs(page, 'pod');
    }
    await page.evaluate(() => window.__starChartTest!.select(null));
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * 0.5); });
    await settle(page);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const away = () => page.mouse.move(box.x + 4, box.y + box.height - 4);
    await away();
    await expect.poll(tiers, { timeout: 10_000 }).toEqual([]);
    expect(await page.locator('.callout--holo[data-holo-tier]').count()).toBeGreaterThan(0);

    // Pointed at, a drawn captain's plate and its frame rise to T1 Lead; moved away, they settle.
    const ship = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const ds = t.displayed();
      const n = t.viewGraph()!.nodes.find((x) => x.kind === 'captain' && ds.some((d) => d.pk === x.projectionKey && d.x > 80 && d.y > 160));
      return n ? { pk: n.projectionKey, label: n.label } : null;
    });
    expect(ship).not.toBeNull();
    const at = (await page.evaluate((k) => window.__starChartTest!.displayed().find((d) => d.pk === k) ?? null, ship!.pk))!;
    await page.mouse.move(box.x + at.x, box.y + at.y);
    const plate = page.locator('.callout--captain', { hasText: ship!.label }).first();
    await expect(plate).toHaveAttribute('data-holo-tier', 'lead');
    expect(await page.locator('.holo[data-holo-tier="lead"].is-hover').count()).toBeGreaterThan(0);
    await away();
    await expect(plate).toHaveAttribute('data-holo-tier', 'sky');
    await expect.poll(tiers, { timeout: 10_000 }).toEqual([]);

    // Selecting a seat raises its plate to T3 Place, and clearing settles it.
    const seat = await page.evaluate(() => {
      const n = window.__starChartTest!.viewGraph()!.nodes.find((x) => x.kind === 'seat');
      return n ? { key: n.canonicalKey, label: n.label } : null;
    });
    expect(seat).not.toBeNull();
    await page.evaluate((k) => window.__starChartTest!.select(k), seat!.key);
    await expect(page.locator('.callout--seat', { hasText: seat!.label }).first()).toHaveAttribute('data-holo-tier', 'place');
    await page.evaluate(() => window.__starChartTest!.select(null));
    await away();
    await expect.poll(tiers, { timeout: 10_000 }).toEqual([]);
  });

  // A4: the plate keeps its width; the rows shrink to fit it. No station plate scrolls sideways, and every fact stays visible.
  test('no expanded station plate in Halcyon’s five pods scrolls sideways, and every fact stays inside it', async () => {
    await page.mouse.move(2, 2);
    await page.keyboard.press('Escape');
    await settle(page);
    await sceneIs(page, 'sprint');
    let checked = 0;
    for (const [pod] of PODS) {
      await page.locator('.callout', { hasText: pod }).first().dblclick();
      await sceneIs(page, 'pod');
      await settle(page);
      checked += await checkStationPlates(page, pod);
      await page.mouse.move(2, 2);
      await page.keyboard.press('Escape');
      await settle(page);
      await sceneIs(page, 'sprint');
    }
    expect(checked).toBeGreaterThan(0);
  });
});

test.describe('station plates in Meridian Works (A4)', () => {
  test.describe.configure({ mode: 'serial' });
  test('no expanded station plate scrolls sideways', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'meridian-sprint' });
    try {
      await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
      await page.locator('.chooser button', { hasText: 'Sprint 7' }).click();
      await sceneIs(page, 'sprint');
      await settle(page);
      const pods = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'star').map((n) => n.label));
      expect(pods.length).toBeGreaterThan(0);
      let checked = 0;
      for (const pod of pods) {
        await page.locator('.callout', { hasText: pod }).first().dblclick();
        await sceneIs(page, 'pod');
        await settle(page);
        checked += await checkStationPlates(page, pod);
        await page.mouse.move(2, 2);
        await page.keyboard.press('Escape');
        await settle(page);
        await sceneIs(page, 'sprint');
      }
      expect(checked).toBeGreaterThan(0);
    } finally { await app.close(); }
  });
});
