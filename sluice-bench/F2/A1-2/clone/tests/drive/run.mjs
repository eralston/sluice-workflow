// npm run drive -- <steps.ts> [--fake-ado [scenario]] [--delay ms] [--paradigm sprints|backlog] [--name label]
/* global process, console */
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const steps = args.find((a) => !a.startsWith('--') && /\.ts$/.test(a));
if (!steps) {
  console.error('usage: npm run drive -- <steps.ts> [--fake-ado [scenario]] [--name label]');
  process.exit(2);
}
const env = { ...process.env, DRIVE_STEPS: steps, DRIVE_NAME: basename(steps, '.ts') };
const fake = args.indexOf('--fake-ado');
if (fake >= 0) env.DRIVE_FAKE_ADO = args[fake + 1] && !args[fake + 1].startsWith('--') && !args[fake + 1].endsWith('.ts') ? args[fake + 1] : 'orbit-week';
const delay = args.indexOf('--delay');
if (delay >= 0 && args[delay + 1]) env.DRIVE_DELAY_MS = args[delay + 1];
const paradigm = args.indexOf('--paradigm');
if (paradigm >= 0 && args[paradigm + 1]) env.DRIVE_PARADIGM = args[paradigm + 1];
const name = args.indexOf('--name');
if (name >= 0 && args[name + 1]) env.DRIVE_NAME = args[name + 1];
const r = spawnSync('npx', ['playwright', 'test', '-c', 'tests/drive/playwright.config.ts'], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
