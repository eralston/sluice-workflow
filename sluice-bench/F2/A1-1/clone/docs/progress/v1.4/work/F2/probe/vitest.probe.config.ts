import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
const ROOT = resolve(__dirname, '../../../../../..');
export default defineConfig({
  root: ROOT,
  resolve: { alias: { '@shared': resolve(ROOT, 'src/shared'), '@fixtures': resolve(ROOT, 'fixtures'), '@config': resolve(ROOT, 'config') } },
  test: { include: ['docs/progress/v1.4/work/F2/probe/*.probe.test.ts'], environment: 'node' },
});
