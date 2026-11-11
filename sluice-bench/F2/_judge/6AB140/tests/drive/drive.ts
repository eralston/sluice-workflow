// The driver (decided 2026-10-07): launch the built app, run a steps script, and keep what it saw:
// screenshots, the view graph and store at each `dump`, the console, page errors, and the redacted
// dev log. No assertions: it's for looking at a change for real, not for gating it.
// Run: npm run drive -- <steps.ts> [--fake-ado [scenario]] [--name label]. See README.md.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle, clickNode, enterNodeByKey, keyOf, openCometCrew, openFeature101 } from '../e2e/launch';

const steps = process.env.DRIVE_STEPS;
const out = resolve(__dirname, '../../test-results/drive', process.env.DRIVE_NAME ?? 'run');

test('drive', async () => {
  if (!steps) throw new Error('DRIVE_STEPS is not set: run through npm run drive -- <steps.ts>');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // The driver is for watching the app, so its window shows (pinned to the top-left); the e2e suite's
  // windows stay hidden (decided 2026-10-09).
  const env: Record<string, string> = { STAR_CHART_DEVLOG: '1', STAR_CHART_DEVLOG_DIR: join(out, 'devlog'), STAR_CHART_TEST_SHOW: '1' };
  if (process.env.DRIVE_DELAY_MS) env.STAR_CHART_FAKE_DELAY_MS = process.env.DRIVE_DELAY_MS;
  if (process.env.DRIVE_PARADIGM) env.STAR_CHART_PARADIGM = process.env.DRIVE_PARADIGM;
  if (process.env.DRIVE_FAKE_ADO) Object.assign(env, { STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: process.env.DRIVE_FAKE_ADO, STAR_CHART_START_MODE: '' });
  const { app, page } = await launchApp(env);
  const lines: string[] = [];
  page.on('console', (m) => lines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => lines.push(`[pageerror] ${e.message}`));
  let n = 0;
  const label = (name: string) => `${String(++n).padStart(2, '0')}-${name.replace(/[^\w-]+/g, '_')}`;
  const drive: Drive = {
    app, page, settle: () => settle(page), clickNode: (k: string) => clickNode(page, k), enterNodeByKey: (k: string) => enterNodeByKey(page, k),
    keyOf: (kind: string, l: string) => keyOf(page, kind, l), openCometCrew: () => openCometCrew(page), openFeature101: () => openFeature101(page),
    /** The canary token, for connecting to the fake org (INV-17: never a real PAT). */
    canary: 'CANARY-PAT-4c1e7a2b-not-a-real-token',
    note: (msg: string) => { lines.push(`[note] ${msg}`); console.log(msg); },
    /** A screenshot of the window. */
    shot: async (name: string) => { await page.screenshot({ path: join(out, `${label(name)}.png`) }); },
    /** The view graph, stack, camera, and store as JSON. */
    dump: async (name: string) => {
      const state = await page.evaluate(() => ({
        stack: window.__starChartTest!.stack(), camera: window.__starChartTest!.camera(), graph: window.__starChartTest!.viewGraph(),
        store: JSON.parse(window.__starChartTest!.storeJson()),
      }));
      writeFileSync(join(out, `${label(name)}.json`), JSON.stringify(state, null, 2));
    },
  };
  try {
    type Steps = (d: Drive) => Promise<void>;
    const mod = (await import(resolve(process.cwd(), steps))) as { default: Steps | { default: Steps } };
    const run = typeof mod.default === 'function' ? mod.default : mod.default.default; // CJS interop wraps it
    await run(drive);
  } catch (e) {
    lines.push(`[driver] the steps threw: ${(e as Error).stack ?? e}`);
    await page.screenshot({ path: join(out, 'failed.png') }).catch(() => undefined);
    throw e;
  } finally {
    writeFileSync(join(out, 'console.log'), lines.join('\n'));
    await app.close();
    console.log(`Drive output: ${out}`);
  }
});

/** What a steps script gets. */
export interface Drive {
  app: ElectronApplication;
  page: Page;
  settle(): Promise<void>;
  clickNode(key: string): Promise<void>;
  enterNodeByKey(key: string): Promise<void>;
  keyOf(kind: string, label: string): Promise<string>;
  openCometCrew(): Promise<void>;
  openFeature101(): Promise<void>;
  /** The canary token, for connecting to the fake org (INV-17: never a real PAT). */
  canary: string;
  note(msg: string): void;
  shot(name: string): Promise<void>;
  dump(name: string): Promise<void>;
}
