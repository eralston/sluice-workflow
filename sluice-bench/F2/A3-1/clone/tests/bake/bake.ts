import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchGallery } from '../e2e/launch';

// Bakes the procedural asteroids to assets/atlas/asteroids.{png,json} (23 C7, assets/LEDGER.md).
test('bake the asteroid atlas', async () => {
  const { app, page } = await launchGallery();
  const out = await page.evaluate(() => window.__starChartGallery!.bakeAsteroids());
  const dir = resolve(__dirname, '../../assets/atlas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'asteroids.png'), Buffer.from(out.png.replace(/^data:image\/png;base64,/, ''), 'base64'));
  writeFileSync(resolve(dir, 'asteroids.json'), JSON.stringify(out.json) + '\n');
  await app.close();
});
