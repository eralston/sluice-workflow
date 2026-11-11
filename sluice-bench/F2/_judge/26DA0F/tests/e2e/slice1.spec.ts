import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, enterNodeByKey, keyOf, launchApp, openCometCrew, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  await page.evaluate(() => window.__starChartTest!.freezeAmbient(12));
});
test.afterAll(async () => {
  await app?.close();
});

const sceneKey = () => page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey);
const cam = () => page.evaluate(() => window.__starChartTest!.camera());
const counts = () => page.evaluate(() => window.__starChartTest!.counts());

async function backToGalaxy(): Promise<void> {
  while ((await sceneKey()) !== 'galaxy') {
    await page.locator('.back').click();
    await settle(page);
  }
}

test('VC-1 and HG-2: each scale renders the same at a fixed instant', async () => {
  await backToGalaxy();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/hg2-1-galaxy.png' });
  await expect(page).toHaveScreenshot('galaxy.png');

  await openCometCrew(page);
  await page.screenshot({ path: 'test-results/hg2-2-sector.png' });
  await expect(page).toHaveScreenshot('sector.png');

  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/hg2-3-feature.png' });
  await expect(page).toHaveScreenshot('feature.png');

  await enterNodeByKey(page, await keyOf(page, 'planet', 'Show quote history on the policy page'));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/hg2-4-body.png' });
  await expect(page).toHaveScreenshot('body.png');
});

/** Restored cameras match to floating-point precision. */
function expectCam(a: { x: number; y: number; scale: number }, b: { x: number; y: number; scale: number }) {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.scale).toBeCloseTo(b.scale, 9);
}

test('AC-08: star → planet → Back → Back restores camera and selection', { tag: '@keystone' }, async () => {
  await backToGalaxy();
  await openCometCrew(page);
  const sectorCam = await cam();
  const star = await keyOf(page, 'star', 'Unified quote ledger');
  await enterNodeByKey(page, star);
  const featureCam = await cam();
  const planet = await keyOf(page, 'planet', 'Export ledger entries to CSV');
  await enterNodeByKey(page, planet);
  expect(await sceneKey()).toMatch(/^body:/);

  await page.locator('.back').click();
  await settle(page);
  expect(await sceneKey()).toMatch(/^feature:/);
  expectCam(await cam(), featureCam);
  expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(planet);

  await page.locator('.back').click();
  await settle(page);
  expect(await sceneKey()).toMatch(/^sector:/);
  expectCam(await cam(), sectorCam);
  expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(star);
});

test('AC-08: five rapid clicks mid-transition never snap backward or leak', async () => {
  await backToGalaxy();
  await openCometCrew(page);
  const baseline = await counts();
  const star = await keyOf(page, 'star', 'Unified quote ledger');
  for (let i = 0; i < 5; i++) {
    const p = await page.evaluate((k) => window.__starChartTest!.screenOf(k), star);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    if (p) await page.mouse.dblclick(box.x + p.x, box.y + p.y); // the star may be gone mid-transition
    await page.waitForTimeout(80);
    if (await page.locator('.back').isVisible()) await page.locator('.back').click();
    await page.waitForTimeout(80);
  }
  await settle(page);
  // Land back on the sector and compare against the baseline.
  while (!(await sceneKey()).startsWith('sector:')) {
    if ((await sceneKey()) === 'galaxy') await openCometCrew(page);
    else { await page.locator('.back').click(); await settle(page); }
  }
  expect(await counts()).toEqual(baseline);
});

test('VC-2: every selectable node has a DOM label or list entry; label backing has 4.5:1 contrast', { tag: '@keystone' }, async () => {
  await backToGalaxy();
  // The v0 views keep their navy plates: Solar's holo plates for galaxies and stars are its own (19 R1).
  await expect(page.locator('.callout--galaxy').first()).toBeVisible();
  await expect(page.locator('.callout--holo')).toHaveCount(0);
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await expect(page.locator('.callout--holo')).toHaveCount(0);
  const missing = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const listed = new Set([...document.querySelectorAll<HTMLElement>('.object-list button')].map((b) => b.dataset.key));
    return g.nodes.filter((n) => n.selectable && !listed.has(n.canonicalKey)).map((n) => n.projectionKey);
  });
  expect(missing).toEqual([]);
  // Worst case: the label plate's ink-navy at 70% over pure white painting.
  const ratio = await page.evaluate(() => {
    const rgb = (s: string) => s.match(/\d+(\.\d+)?/g)!.map(Number);
    const lum = (c: number[]) => c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let worst = Infinity;
    for (const el of document.querySelectorAll('.callout')) {
      const bg = rgb(getComputedStyle(el).backgroundColor);
      const a = bg[3] ?? 1;
      const over = [0, 1, 2].map((i) => bg[i]! * a + 255 * (1 - a)); // over pure white painting
      for (const textEl of el.querySelectorAll('.callout__title, .callout__meta')) {
        const fg = rgb(getComputedStyle(textEl).color);
        const fa = fg[3] ?? 1;
        const text = [0, 1, 2].map((i) => fg[i]! * fa + over[i]! * (1 - fa)); // semi-transparent text over its plate
        const [l1, l2] = [lum(text), lum(over)].sort((x, y) => y - x) as [number, number];
        worst = Math.min(worst, (l1 + 0.05) / (l2 + 0.05));
      }
    }
    return worst;
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

async function hitProblems(): Promise<string[]> {
  return page.evaluate(() => {
    const t = window.__starChartTest!;
    const scene = t.viewGraph()!.sceneKey.split(':')[0];
    const hits = t.hitCircles(); // the scene's actual hit areas, in screen px
    const out: string[] = [];
    for (const h of hits) if (h.r < 11.99) out.push(`${h.kind} ${h.label} < 12px`);
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i]!;
        const b = hits[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) out.push(`${scene}: ${a.kind} "${a.label}" overlaps ${b.kind} "${b.label}"`);
      }
    }
    return out;
  });
}

test('VC-3: hit areas are at least 12 px and adjacent targets do not overlap, at every scale', async () => {
  await backToGalaxy();
  const problems = [...(await hitProblems())];
  await openCometCrew(page);
  problems.push(...(await hitProblems()));
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  problems.push(...(await hitProblems()));
  for (const body of ['Show quote history on the policy page', 'Export ledger entries to CSV']) {
    await enterNodeByKey(page, await keyOf(page, 'planet', body));
    problems.push(...(await hitProblems()));
    await page.locator('.back').click();
    await settle(page);
  }
  await enterNodeByKey(page, await keyOf(page, 'anomaly', 'Duplicate ledger rows after retry'));
  problems.push(...(await hitProblems()));
  expect(problems).toEqual([]);
});

test('VC-4: galaxy → sector → feature → body → back ×3, ten times, leaves counts at baseline', async () => {
  test.setTimeout(120_000); // ten full round trips with real transitions
  await backToGalaxy();
  const baseline = await counts();
  for (let i = 0; i < 10; i++) {
    await openCometCrew(page);
    await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
    await enterNodeByKey(page, await keyOf(page, 'planet', 'Show quote history on the policy page'));
    await backToGalaxy();
  }
  expect(await counts()).toEqual(baseline);
});

test.describe('entering scenes (06 §3 activation)', () => {
  test('a single click selects without zooming; a double-click on a galaxy opens its default sector', { tag: '@keystone' }, async () => {
    await backToGalaxy();
    const nimbus = await keyOf(page, 'galaxy', 'Nimbus Deck');
    await clickNode(page, nimbus);
    await page.waitForTimeout(400); // longer than the double-tap window
    expect(await sceneKey()).toBe('galaxy');
    expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(nimbus);
    await enterNodeByKey(page, nimbus);
    expect(await sceneKey()).toMatch(/^sector:area:/);
    await expect(page.locator('.breadcrumb [aria-current]')).toContainText('Comet Crew');
  });

  test('Enter on a selected object zooms into it', async () => {
    const star = await keyOf(page, 'star', 'Rate card editor');
    await clickNode(page, star);
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await settle(page);
    expect(await sceneKey()).toBe(`feature:${star}`);
    await page.locator('.back').click();
    await settle(page);
  });

  test('Enter on the selected row in the object list zooms too', async () => {
    const star = await keyOf(page, 'star', 'Quote PDF export');
    const row = page.locator(`.object-list button[data-key="${star}"]`);
    await row.focus();
    await page.keyboard.press('Enter'); // selects
    expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(star);
    await page.keyboard.press('Enter'); // enters
    await settle(page);
    expect(await sceneKey()).toBe(`feature:${star}`);
    await page.locator('.back').click();
    await settle(page);
  });

  test('wheel zoom toward a star crosses into its system; zooming far out goes back', { tag: '@keystone' }, async () => {
    expect(await sceneKey()).toMatch(/^sector:/);
    const star = await keyOf(page, 'star', 'Agent dashboard refresh');
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const p = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), star))!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    // Pinch zooms (a trackpad pinch arrives as Ctrl+wheel); a plain scroll pans (decided 2026-10-07).
    await page.keyboard.down('Control');
    for (let i = 0; i < 60 && (await sceneKey()).startsWith('sector:'); i++) {
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(30);
    }
    await settle(page);
    expect(await sceneKey()).toBe(`feature:${star}`);
    // Momentum after the transition must not tunnel into a body.
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -20);
    await page.waitForTimeout(200);
    expect(await sceneKey()).toBe(`feature:${star}`);

    await page.waitForTimeout(600); // let the cooldown pass
    for (let i = 0; i < 60 && (await sceneKey()).startsWith('feature:'); i++) {
      await page.mouse.wheel(0, 20);
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('Control');
    await settle(page);
    expect(await sceneKey()).toMatch(/^sector:/);
  });

  test('a plain scroll zooms (decided 2026-10-07, revising "scroll pans"); a scene that fits has no scrollbars', async () => {
    expect(await sceneKey()).toMatch(/^sector:/);
    await page.keyboard.press('0'); // from the opening view (the last test left it zoomed in)
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => window.__starChartTest!.camera());
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__starChartTest!.camera());
    expect(after.scale).toBeGreaterThan(before.scale);
    expect(await sceneKey()).toMatch(/^sector:/);
    await expect(page.locator('.scrollbar')).toHaveCount(0);
    await page.keyboard.press('0');
    await settle(page);
  });
});

test.describe('learnability', () => {
  test('the map key explains objects and the looks present in this view', async () => {
    await backToGalaxy();
    await openCometCrew(page);
    await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
    await page.keyboard.press('k');
    const key = page.locator('.map-key');
    await expect(key).toBeVisible();
    await expect(key).toContainText('Feature');
    await expect(key).toContainText('Nearing: a developed world in a violet halo');
    await expect(key).toContainText('User Story · Resolved (In Progress)'); // from state-mapping.json, not hand-copied
    await expect(key).toContainText('Task → its parent Story or Bug');
    await expect(key).not.toContainText('Enemy ship'); // the solar board's kinds stay out of v0's key
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'test-results/learn-1-key.png' });
    await page.keyboard.press('k');
    await expect(key).toBeHidden();
  });

  test('the object list is grouped by ADO type', async () => {
    const heads = await page.locator('.object-list__group-head').allInnerTexts();
    expect(heads.map((h) => h.split(/[·\n]/)[0]!.trim())).toEqual(
      expect.arrayContaining(['Feature', 'User Stories', 'Bug', 'Repositories', 'Pull Requests', 'People']),
    );
  });

  test('one vocabulary in two layers: no toggle; the title, then ADO type · ID · status, then the chart’s name (22 B1, B3)', async () => {
    await expect(page.locator('.toggle[aria-label="Names"]')).toHaveCount(0);
    const star = await keyOf(page, 'star', 'Unified quote ledger');
    await clickNode(page, star);
    const kind = page.locator('.inspector__kind');
    await expect(kind).toHaveText(/^Feature · #\d+ · \S.* · star$/);
    await expect(kind.locator('.metaphor')).toHaveText('· star');
    // The title comes first, the identity line under it.
    expect(await page.evaluate(() => {
      const t = document.querySelector('.inspector__title'), k = document.querySelector('.inspector__kind');
      return !!t && !!k && !!(t.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(page.locator('.enter-link')).toHaveCount(0); // already in this Feature's view
    await page.keyboard.press('k');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'test-results/learn-2-two-layers.png' });
    await page.keyboard.press('k');
  });
});

test.describe('layout legibility', () => {
  async function labelReport() {
    return page.evaluate(() => {
      // Ship labels are the lowest priority and may yield to crowding (known limit until the layout solver).
      // On a board (06 §3, 2026-10-09), work done long ago is compacted at the right end; its label may
      // yield to a ship it would cover (it shows on hover). Every open item's label must still show.
      const compact = new Set(window.__starChartTest!.viewGraph()!.nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.world.r < 100).map((n) => n.label));
      const els = [...document.querySelectorAll<HTMLElement>('.callout')]
        .filter((e) => !e.classList.contains('callout--captain'))
        .filter((e) => !(e.style.display === 'none' && compact.has(e.querySelector('.callout__title')?.textContent ?? '')));
      const shown = els.filter((e) => e.style.display !== 'none');
      const rects = shown.map((e) => ({ text: e.querySelector('.callout__title')?.textContent ?? '', r: e.getBoundingClientRect() }));
      const overlaps: string[] = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!.r; const b = rects[j]!.r;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push(`${rects[i]!.text} × ${rects[j]!.text}`);
      }
      return { hidden: els.length - shown.length, overlaps };
    });
  }

  test('sector rows are balanced and centered: six Features as 3 + 3', async () => {
    await backToGalaxy();
    await openCometCrew(page);
    const rows = await page.evaluate(() => {
      const stars = window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'star');
      const byY = new Map<number, number[]>();
      for (const s of stars) byY.set(s.world.y, [...(byY.get(s.world.y) ?? []), s.world.x]);
      return [...byY.values()].map((xs) => ({ count: xs.length, center: xs.reduce((a, b) => a + b, 0) / xs.length }));
    });
    expect(rows.map((r) => r.count)).toEqual([3, 3]);
    for (const r of rows) expect(Math.abs(r.center)).toBeLessThan(1e-6);
    expect(await labelReport()).toEqual({ hidden: 0, overlaps: [] });
  });

  test('Feature systems show every label without overlaps; stations sit below the planets', async () => {
    for (const title of ['Unified quote ledger', 'Agent dashboard refresh', 'Rate card editor']) {
      await enterNodeByKey(page, await keyOf(page, 'star', title));
      await page.mouse.move(0, 0);
      expect(await labelReport(), title).toEqual({ hidden: 0, overlaps: [] });
      const ys = await page.evaluate(() => {
        // As drawn: the lane and the stations shift together in screen terms (06 §3), so compare
        // drawn positions throughout.
        const live = window.__starChartTest!.liveNodes();
        const lowestBody = Math.max(...live.filter((n) => n.kind === 'planet' || n.kind === 'anomaly').map((n) => n.world.y));
        const stations = live.filter((n) => n.kind === 'station').map((n) => n.world.y);
        const flights = live.filter((n) => n.kind === 'flight').map((n) => n.world.y);
        return { lowestBody, stations, flights };
      });
      for (const y of ys.stations) expect(y).toBeGreaterThan(ys.lowestBody);
      // PR lane: in-flight vessels sit between the planets and the stations, never among the planets.
      for (const y of ys.flights) {
        expect(y).toBeGreaterThan(ys.lowestBody);
        expect(y).toBeLessThan(Math.min(...ys.stations));
      }
      await page.locator('.back').click();
      await settle(page);
    }
  });
});

test.describe('breadcrumb sibling menus', () => {
  const menuItems = () => page.locator('.sibling-menu .sibling-menu__item');

  test('the team switcher lists Area Paths and Epics, and switches sideways (revised 2026-10-04)', async () => {
    await backToGalaxy();
    await openCometCrew(page);
    await page.locator('.team-pill__switch').click();
    await expect(page.locator('.sibling-menu')).toContainText('◇ Saved Area Paths');
    await expect(page.locator('.sibling-menu')).toContainText('⬡ Epics');
    await expect(menuItems().filter({ hasText: 'Comet Crew' })).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: 'test-results/breadcrumb-siblings.png' });
    await menuItems().filter({ hasText: 'Lantern Squad' }).click();
    await settle(page);
    expect(await sceneKey()).toMatch(/^sector:area:/);
    await expect(page.locator('.breadcrumb [aria-current]')).toContainText('Lantern Squad');
    expect((await page.evaluate(() => window.__starChartTest!.stack())).map((e) => e.sceneKey.split(':')[0])).toEqual(['galaxy', 'sector']);
  });

  test('a Feature crumb lists the sector’s other Features; Esc closes without going back', async () => {
    await enterNodeByKey(page, await keyOf(page, 'star', 'Autopay enrollment'));
    await page.locator('.breadcrumb .crumb--current').click();
    await expect(menuItems()).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sibling-menu')).toHaveCount(0);
    expect(await sceneKey()).toMatch(/^feature:/); // Esc closed the menu, it didn't navigate back
    await page.locator('.breadcrumb .crumb--current').click();
    await menuItems().filter({ hasText: 'Billing statement redesign' }).click();
    await settle(page);
    await expect(page.locator('.breadcrumb [aria-current]')).toContainText('Billing statement redesign');
    expect((await page.evaluate(() => window.__starChartTest!.stack())).length).toBe(3);
  });

  test('an earlier crumb’s caret opens its siblings: the project menu switches galaxies', async () => {
    await page.locator('.crumb__caret-btn').first().click(); // the project crumb
    await expect(menuItems()).toHaveCount(2);
    await menuItems().filter({ hasText: 'Harbor Watch' }).click();
    await settle(page);
    // Tide Team holds one Feature, so the sector passes through to it (AC-48).
    await expect(page.locator('.breadcrumb [aria-current]')).toContainText('Claims intake triage');
    await expect(page.locator('.breadcrumb')).toContainText('Tide Team');
    expect((await page.evaluate(() => window.__starChartTest!.stack())).length).toBe(3);
  });
});

test('captain labels lead with an avatar circle: initials on a color when no picture was uploaded', async () => {
  await backToGalaxy();
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await enterNodeByKey(page, await keyOf(page, 'planet', 'Show quote history on the policy page'));
  const label = page.locator('.callout--captain', { hasText: 'Ava Lindqvist' });
  const avatar = label.locator('.callout__avatar');
  await expect(avatar).toHaveText('AL');
  await expect(avatar.locator('img')).toHaveCount(0);
  const box = (await avatar.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(0.5); // always a circle
  const plate = (await label.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(plate.x);
  expect(box.y).toBeGreaterThanOrEqual(plate.y);
  expect(box.y + box.height).toBeLessThanOrEqual(plate.y + plate.height); // inside its plate
});
