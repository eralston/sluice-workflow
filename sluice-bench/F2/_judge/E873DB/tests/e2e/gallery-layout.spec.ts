// The gallery's layout holds at any display density and window size: every object sits in its frame.
// A dense (Retina) display doubles the drawing buffer a long page needs; past the GPU's limit the
// browser used to shrink it silently and the art slid off its frames. Run at 2× to cover that case.
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('at 2× density and at laptop, narrow, and wide window sizes, every object stays in its frame', { tag: '@keystone' }, async () => {
  const env = { ...process.env, STAR_CHART_TEST: '1', STAR_CHART_GALLERY: '1', STAR_CHART_USER_DATA: mkdtempSync(join(tmpdir(), 'star-chart-e2e-')) } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const app = await electron.launch({ args: ['--force-device-scale-factor=2', resolve(__dirname, '../../out/main/index.js')], env });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.__starChartGallery));
    await page.evaluate(() => window.__starChartGallery!.ready);
    for (const [w, h] of [[1440, 900], [1024, 800], [2400, 1000]] as const) {
      await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, h), [w, h] as const);
      await page.waitForTimeout(500); // the reflow, then the next frame's layout
      const a = await page.evaluate(() => window.__starChartGallery!.alignment());
      expect(a.views).toBeGreaterThan(50);
      expect(a.bufferOk).toBe(true);
      expect(a.worstPx).toBeLessThan(1);
    }
  } finally {
    await app.close();
  }
});
