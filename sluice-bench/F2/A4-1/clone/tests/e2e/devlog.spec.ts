// The dev log (decided 2026-10-07): a session's inputs, background activity, and errors, redacted.
// Turned on here with STAR_CHART_DEVLOG=1 (test runs don't log by default), against the fake ADO org
// with 188 synthetic projects. The log must hold the session's shape, and none of its data.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { crowdedNames } from '../../fixtures/scenarios/crowded-org';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const logDir = mkdtempSync(join(tmpdir(), 'star-chart-devlog-'));
const env = { STAR_CHART_DEVLOG: '1', STAR_CHART_DEVLOG_DIR: logDir, STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'star-chart-devlog-db-')) };
const runs = () => readdirSync(logDir).filter((f) => /^run-.*\.jsonl$/.test(f)).sort();

test('the dev log (E): a session is recorded, input to network to cache, with no tenant data in it', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp(env);
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected');
  await page.locator('.connect__close').click();
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length))).toBeGreaterThan(0);
  await settle(page);
  const name = (await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'galaxy').map((n) => n.label)))[0]!;
  await page.locator('.zoom-controls button[aria-label="Zoom in"]').click();
  await page.keyboard.press('0');
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400); // the wheel gesture's entry is written once it pauses
  await page.keyboard.press('0');
  await settle(page);
  await page.locator('.callout--galaxy', { hasText: name }).first().dblclick();
  await page.locator('.area-chooser input[type="search"]').pressSequentially('Field'); // real keystrokes: counted, never recorded
  await page.locator('.area-chooser label', { hasText: 'Field Team' }).locator('input').check();
  await page.locator('.area-chooser .cosmos__cta').click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
  await settle(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await app.close();

  expect(runs()).toHaveLength(1);
  const text = readFileSync(join(logDir, runs()[0]!), 'utf8');
  const lines = text.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  const kinds = new Set(lines.map((l) => l.kind));
  for (const k of ['start', 'renderer-start', 'key', 'click', 'typing', 'label-press', 'wheel-zoom', 'zoom', 'scene', 'select', 'ipc', 'net-start', 'net-end', 'sync', 'cache-write', 'auth', 'area-chooser', 'quit']) {
    expect(kinds.has(k), k).toBe(true);
  }
  expect(lines.every((l) => typeof l.t === 'number' && (l.src === 'main' || l.src === 'renderer'))).toBe(true);
  // None of the session's data: the token, the org, project and people names, team names, raw GUIDs.
  expect(text).not.toContain(CANARY);
  expect(text).not.toContain(CANARY.slice(0, 8));
  expect(text).not.toContain('fixture-org');
  for (const n of [...crowdedNames, 'Juniper Ridge', 'Ines Varga', 'Tomas Reyes', 'Field Team', 'Core Team', 'Pine Team']) expect(text, n).not.toContain(n);
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(lines.filter((l) => l.kind === 'redaction-dropped')).toEqual([]);
});

test('the dev log (E): only the last three runs are kept', async () => {
  for (let i = 0; i < 3; i++) {
    const { app } = await launchApp(env);
    await new Promise((r) => setTimeout(r, 1100)); // distinct timestamps
    await app.close();
  }
  expect(runs()).toHaveLength(3);
});
