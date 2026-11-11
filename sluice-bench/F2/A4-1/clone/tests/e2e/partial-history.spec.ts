// 23 B6 to B9: the load count (N of ~M), partial history with Retry, Starting…, and the error banner's
// place under the player. Fake ADO; the failures come from STAR_CHART_FAKE_FAIL (tests/README.md, Taking ADO
// away), lifted from the main process for the Retry. Waits are on conditions, never on wall time.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const STILLS = 'review/v1.3/B';
mkdirSync(STILLS, { recursive: true });

async function connect(page: Page): Promise<void> {
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
}

type Box = { x: number; y: number; w: number; h: number };
const rectOf = (page: Page, sel: string) => page.evaluate((s): Box | null => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
}, sel);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// The top of the view (23 B9): every one of these that is on screen, pairwise, never overlaps. (Windows have a 1024 px minimum width.)
const TOP_OF_VIEW = ['.transport', '.transport__partial', '.transport__pop', '.error', '.sync-banner--quiet', '.follow-bar__row', '.follow-bar__note', '.map-key', '.zoom-controls'];
const SIZES = [[1280, 800], [1024, 640], [1024, 768]] as const;
async function noOverlaps(page: Page, label: string, must: string[]): Promise<void> {
  const found: [string, Box][] = [];
  for (const sel of TOP_OF_VIEW) { const r = await rectOf(page, sel); if (r && r.w > 0) found.push([sel, r]); }
  for (const m of must) expect(found.some(([s]) => s === m), `${m} is on screen at ${label}`).toBe(true);
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
    if (found[i]![0] === '.transport' && found[j]![0] === '.transport__pop') continue; // the pop is the player's own, opened from its bar
    expect(overlaps(found[i]![1], found[j]![1]), `${found[i]![0]} vs ${found[j]![0]} at ${label}`).toBe(false);
  }
}
async function resize(app: ElectronApplication, page: Page, w: number, h: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => { BrowserWindow.getAllWindows()[0]!.setContentSize(cw!, ch!); }, [w, h]);
  await page.waitForFunction(([cw, ch]) => window.innerWidth === cw && window.innerHeight === ch, [w, h], { timeout: 10_000 });
  await settle(page);
}

test.describe('partial history (B7), Starting… (B8), the banner (B9)', () => {
  test.describe.configure({ mode: 'serial' });
  let app: ElectronApplication;
  let page: Page;
  // Ids ending in 7 fail their revisions read with a 500 (a tolerated, retryable failure).
  test.beforeAll(async () => {
    ({ app, page } = await launchApp({
      STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_FAKE_DELAY_MS: '120',
      STAR_CHART_FAKE_FAIL: 'workItems/\\d*7/revisions', STAR_CHART_FAKE_FAIL_STATUS: '500',
      STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-partial-')),
    }));
  });
  test.afterAll(async () => { await app?.close(); });

  let missing = 0;
  let failedIds: number[] = [];
  const revisionIds = () => app.evaluate(() => {
    const t = (globalThis as unknown as { __starChartFakeTransport: { log: { url: string }[] } }).__starChartFakeTransport;
    return t.log.flatMap((r) => { const m = /workItems\/(\d+)\/revisions/.exec(r.url); return m ? [Number(m[1])] : []; });
  });

  test('Load history says Starting… at the click, then loads; the player is partial with a Retry', async () => {
    await connect(page);
    await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Pine Team' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
    await settle(page);
    await expect(page.locator('.transport--request')).toBeVisible({ timeout: 20_000 });

    // Watch for the widget's words from before the click, so nothing is missed between two polls.
    await page.evaluate(() => {
      const w = window as unknown as { __starting?: { at: string; seq: string[] } };
      w.__starting = { at: '', seq: [] };
      new MutationObserver(() => {
        const t = document.querySelector('.transport--loading .transport__loading')?.textContent ?? '';
        if (t && w.__starting!.seq.at(-1) !== t) w.__starting!.seq.push(t);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.locator('.transport__load').click();
    // The click itself answered: the widget reads Starting… before any progress.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __starting: { seq: string[] } }).__starting.seq[0]), { timeout: 10_000 }).toBe('Starting…');
    await page.screenshot({ path: `${STILLS}/B6-B9-starting.png` }).catch(() => undefined);
    await expect(page.locator('.transport--loading')).toContainText('Loading 7 days of history', { timeout: 30_000 });
    // And once real progress shows, Starting… does not come back.
    const seq = await page.evaluate(() => (window as unknown as { __starting: { seq: string[] } }).__starting.seq);
    expect(seq.slice(1).every((t) => t.startsWith('Loading'))).toBe(true);

    // The load finishes with gaps: a ready player that says so.
    await expect(page.locator('.transport__play')).toBeVisible({ timeout: 60_000 });
    const line = page.locator('.transport__partial');
    await expect(line).toContainText(/History partial · \d+ missing/);
    await expect(line.locator('.transport__retry')).toHaveText('Retry');
    missing = Number(/(\d+) missing/.exec((await line.textContent()) ?? '')![1]);
    expect(missing).toBeGreaterThan(0);
    // The missing items are the ones whose reads failed (each asked for once at most, the retry adds none here).
    failedIds = [...new Set((await revisionIds()).filter((id) => id % 10 === 7))].sort((a, b) => a - b);
    expect(failedIds).toHaveLength(missing);
    await page.screenshot({ path: `${STILLS}/B6-B9-partial.png` });
  });

  test('the partial line hangs under the bar: the player does not reflow when it appears or goes (R4)', async () => {
    const bar = (await rectOf(page, '.transport'))!;
    const line = (await rectOf(page, '.transport__partial'))!;
    expect(line.y).toBeGreaterThanOrEqual(bar.y + bar.h); // below the player, not inside it
    expect(line.x).toBeGreaterThanOrEqual(bar.x - 2);
    expect(bar.h).toBeLessThanOrEqual(50);
    // The overlay stack is measured by observers (no per-frame loop), and publishes where it ends, for the map key and capped plates.
    const stage = await page.evaluate(() => { const m = document.querySelector('main')!; return { bottom: Number.parseFloat(m.style.getPropertyValue('--stack-bottom')), top: m.getBoundingClientRect().top }; });
    await expect.poll(async () => page.evaluate(() => Number.parseFloat(document.querySelector('main')!.style.getPropertyValue('--stack-bottom')))).toBeGreaterThanOrEqual(line.y + line.h - stage.top - 1);
  });

  test('the top of the view never overlaps: error, follow bar, map key, zoom, the ⋯ pop, the player and its partial line, at three sizes', async () => {
    await page.evaluate(() => { window.__starChartTest!.showError('Simulated: something went wrong (test)'); window.__starChartTest!.showFollowBar(true); });
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.follow-bar__row')).toBeVisible();
    await page.locator('body').press('k');
    await expect(page.locator('.map-key')).toBeVisible();
    await page.locator('.transport__more').click();
    await expect(page.locator('.transport__pop')).toBeVisible();
    for (const [w, h] of SIZES) {
      await resize(app, page, w, h);
      await noOverlaps(page, `${w}x${h}`, ['.transport', '.transport__partial', '.transport__pop', '.error', '.follow-bar__row', '.map-key', '.zoom-controls']);
      if (w === 1280) await page.screenshot({ path: `${STILLS}/B6-B9-banner.png` });
    }
    await page.locator('.transport__more').click();
    await page.locator('body').press('k');
    await page.evaluate(() => { window.__starChartTest!.showFollowBar(false); });
    await page.locator('.error__close').click();
    await resize(app, page, 1280, 800);
  });

  test('Retry refetches only the missing items, and the line goes', async () => {
    const before = (await rectOf(page, '.transport'))!;
    // ADO answers again, and the call log starts over.
    await app.evaluate(() => {
      const t = (globalThis as unknown as { __starChartFakeTransport: { intercept: unknown; log: unknown[] } }).__starChartFakeTransport;
      t.intercept = null;
      t.log.length = 0;
    });
    await page.locator('.transport__partial .transport__retry').click();
    await expect(page.locator('.transport__partial')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('.transport__play')).toBeVisible();
    const asked = [...new Set(await revisionIds())].sort((a, b) => a - b);
    expect(asked).toEqual(failedIds); // only those, and all of them
    const after = (await rectOf(page, '.transport'))!;
    expect(after.h).toBe(before.h);
    expect(after.y).toBe(before.y);
  });
});

// B6: the streaming sprint's banner counts its queue against an estimate: N of ~M to go, never N above M.
test('the "Filling in" banner reads N of ~M, and M is never below N (B6)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints', STAR_CHART_FAKE_DELAY_MS: '400',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-fill-count-')),
  });
  try {
    await connect(page);
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    // Sample the banner on every mutation until the stream ends.
    await page.evaluate(() => {
      const w = window as unknown as { __fill: string[] };
      w.__fill = [];
      const read = () => { const t = document.querySelector('.sync-banner--quiet')?.textContent ?? ''; if (t.startsWith('Filling in') && w.__fill.at(-1) !== t) w.__fill.push(t); };
      new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
      read();
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fill: string[] }).__fill.some((t) => / of ~\d+ reads/.test(t))), { timeout: 60_000 }).toBe(true);
    await page.screenshot({ path: `${STILLS}/B6-B9-plate-mid-load.png` });
    // Everything at the top of the view at once, while the quiet line is up: it stacks under the error, and none overlap.
    await page.evaluate(() => { window.__starChartTest!.showError('Simulated: something went wrong (test)'); window.__starChartTest!.showFollowBar(true); });
    await page.locator('body').press('k');
    await expect(page.locator('.map-key')).toBeVisible();
    for (const [w, h] of SIZES) {
      await resize(app, page, w, h);
      await expect(page.locator('.sync-banner--quiet')).toBeVisible();
      await noOverlaps(page, `${w}x${h} (sprint)`, ['.transport', '.error', '.sync-banner--quiet', '.follow-bar__row', '.map-key', '.zoom-controls']);
      const e = (await rectOf(page, '.error'))!;
      const q = (await rectOf(page, '.sync-banner--quiet'))!;
      expect(q.y).toBeGreaterThanOrEqual(e.y + e.h); // the error first, the quiet line below it
      if (w === 1280) await page.screenshot({ path: `${STILLS}/B6-B9-banner-stack.png` });
    }
    await resize(app, page, 1280, 800);
    await page.evaluate(() => { window.__starChartTest!.showFollowBar(false); });
    await page.locator('.error__close').click();
    await page.locator('body').press('k');
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.stream()), { timeout: 60_000 }).toBeNull();
    const seen = await page.evaluate(() => (window as unknown as { __fill: string[] }).__fill);
    const parsed = seen.map((t) => /Filling in · (\d+)(?: of (~?)(\d+))? reads/.exec(t)).filter((m): m is RegExpExecArray => !!m);
    expect(parsed.length).toBeGreaterThan(0);
    for (const m of parsed) if (m[3] !== undefined) expect(Number(m[1])).toBeLessThanOrEqual(Number(m[3]));
    const ms = parsed.flatMap((m) => (m[3] !== undefined ? [Number(m[3])] : []));
    for (let i = 1; i < ms.length; i++) expect(ms[i], `M sample ${i}`).toBeGreaterThanOrEqual(ms[i - 1]!); // M never decreases
    // The estimate keeps its ~ until discovery is over; an exact total, when seen, has none.
    expect(parsed.some((m) => m[2] === '~')).toBe(true);
  } finally {
    await app.close();
  }
});

// B8: Cancel pressed during Starting… is remembered and sent once the job has an id: the load stops.
test('Cancel during Starting… stops the load (B8)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_FAKE_DELAY_MS: '120',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-cancel-start-')),
  });
  try {
    await connect(page);
    await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length), { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Pine Team' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
    await settle(page);
    await expect(page.locator('.transport--request')).toBeVisible({ timeout: 20_000 });
    // Click Load history and Cancel in one task, before any IPC can return: the widget is still on Starting….
    await page.evaluate(() => {
      (document.querySelector('.transport__load') as HTMLButtonElement).click();
      return new Promise<void>((done) => { requestAnimationFrame(() => { (document.querySelector('.transport--loading .connect__link') as HTMLButtonElement).click(); done(); }); });
    });
    // The load stops: the player offers the request again (Stopped before it finished), and no history is in.
    await expect(page.locator('.transport--request')).toContainText('Stopped before it finished', { timeout: 30_000 });
    await expect(page.locator('.transport__play')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
