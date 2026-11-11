// Block E audit: runs the probe tests in this folder (not part of npm test).
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
const root = resolve(__dirname, '../../../../..');
export default defineConfig({
  root,
  resolve: { alias: { '@shared': resolve(root, 'src/shared'), '@fixtures': resolve(root, 'fixtures'), '@config': resolve(root, 'config') } },
  test: { include: ['docs/progress/v1.4/work/block-E/*.test.ts'], environment: 'node' },
});
