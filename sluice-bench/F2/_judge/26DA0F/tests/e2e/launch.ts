import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** STAR_CHART_TEST_DPR=2 launches at devicePixelRatio 2 (27 C3's look gate on a retina screen). */
function dprArgs(): string[] {
  return process.env.STAR_CHART_TEST_DPR ? [`--force-device-scale-factor=${process.env.STAR_CHART_TEST_DPR}`] : [];
}

/**
 * Each launch gets its own userData (decided 2026-10-07): never the developer's real cache, and safe
 * to run specs in parallel. A spec that passes STAR_CHART_DB_DIR to relaunch on the same cache gets
 * its userData in a folder beside that DB's, so the relaunch sees the same state.
 */
function userDataFor(env: Record<string, string>): string {
  if (env.STAR_CHART_USER_DATA) return env.STAR_CHART_USER_DATA;
  if (env.STAR_CHART_DB_DIR) {
    const dir = `${env.STAR_CHART_DB_DIR.replace(/\/+$/, '')}-user-data`; // beside it: specs read the DB folder
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return mkdtempSync(join(tmpdir(), 'star-chart-e2e-'));
}

export async function launchApp(extraEnv: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  // Specs start in fixture mode unless they ask otherwise; a real first launch opens the empty cosmos
  // in ADO mode (decided 2026-10-07). Pass STAR_CHART_START_MODE: '' to get the real default.
  // Specs written for the Backlog chain pin it; Sprints specs pass STAR_CHART_PARADIGM: 'sprints'.
  const env = { ...process.env, STAR_CHART_TEST: '1', STAR_CHART_START_MODE: 'fixture', STAR_CHART_PARADIGM: 'backlog', ...extraEnv } as Record<string, string>;
  if (!env.STAR_CHART_START_MODE) delete env.STAR_CHART_START_MODE;
  delete env.ELECTRON_RUN_AS_NODE; // set by VS Code's extension host; makes Electron act as plain Node
  delete env.ELECTRON_RENDERER_URL;
  env.STAR_CHART_USER_DATA = userDataFor(env);
  const app = await electron.launch({ args: [...dprArgs(), resolve(__dirname, '../../out/main/index.js')], env });
  const page = await app.firstWindow();
  // A window the OS shrank to fit its screen lays out differently, and specs then fail far from the cause.
  const want = /^(\d+)x(\d+)$/.exec(env.STAR_CHART_WINDOW_SIZE ?? '')?.slice(1).map(Number) ?? [1440, 900];
  const got = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize());
  if (got[0] !== want[0] || got[1] !== want[1]) throw new Error(`window is ${got.join('x')}, not ${want.join('x')}: the screen clamped it`);
  await page.waitForFunction(() => Boolean(window.__starChartTest), undefined, { timeout: 30_000 });
  await settle(page);
  return { app, page };
}

/** Wait for the current scene to mount and any transition to finish. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !window.__starChartTest!.transitioning(), undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__starChartReady);
}

/**
 * Wait until the page has drawn `n` more frames (n requestAnimationFrame callbacks, one after another).
 * The one frame wait for every spec (23 F5): read what a seek or a setter drew after `frames(page)`,
 * never after a fixed timeout, which under load can pass with no frame drawn at all.
 */
export function frames(page: Page, n = 2): Promise<void> {
  return page.evaluate((k) => new Promise<void>((done) => {
    const tick = (left: number) => (left <= 0 ? done() : requestAnimationFrame(() => tick(left - 1)));
    tick(k);
  }), n);
}

/** Click a node on the canvas by canonical key. */
export async function clickNode(page: Page, key: string): Promise<void> {
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const p = await page.evaluate((k) => window.__starChartTest!.screenOf(k), key);
  if (!p) throw new Error(`node ${key} not in view`);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

/** Double-click a node on the canvas: enters its scene (06 §3). */
export async function enterNodeByKey(page: Page, key: string): Promise<void> {
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const p = await page.evaluate((k) => window.__starChartTest!.screenOf(k), key);
  if (!p) throw new Error(`node ${key} not in view`);
  await page.mouse.dblclick(box.x + p.x, box.y + p.y);
  await settle(page);
}

export async function keyOf(page: Page, kind: string, label: string): Promise<string> {
  const k = await page.evaluate(
    ([kind, label]) => window.__starChartTest!.viewGraph()?.nodes.find((n) => n.kind === kind && n.label === label)?.canonicalKey,
    [kind, label] as const,
  );
  if (!k) throw new Error(`no ${kind} labelled ${label}`);
  return k;
}

/** Galaxy → Nimbus Deck → Comet Crew sector. */
export async function openCometCrew(page: Page): Promise<void> {
  await clickNode(page, await keyOf(page, 'galaxy', 'Nimbus Deck'));
  await page.locator('.chooser button', { hasText: 'Comet Crew' }).click();
  await settle(page);
}

/** ... → Feature 101 system. */
export async function openFeature101(page: Page): Promise<void> {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
}

/** Launch the built app in art-gallery mode (npm run gallery), frozen-time ready for screenshots. */
export async function launchGallery(): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env, STAR_CHART_TEST: '1', STAR_CHART_GALLERY: '1' } as Record<string, string>;
  env.STAR_CHART_USER_DATA = userDataFor({});
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: [...dprArgs(), resolve(__dirname, '../../out/main/index.js')], env });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.__starChartGallery), undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__starChartGallery!.ready);
  return { app, page };
}
