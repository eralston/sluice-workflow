// `npm run pacing`: write the pacing ledger (docs/progress/v1.4/pacing-ledger.md and .json). Read-only
// over the engine. `--candidates` (C2) appends the Candidates section and writes pacing-candidates.json.
// `--profile <id>` (C4b) runs the engine on that device profile's pacing budget and writes
// `pacing-ledger.<id>.md/.json` beside the others; without it the output is the desktop run, unchanged.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUNDLED } from '../src/shared/profile/bundled';
import { buildBuilt, renderBuilt } from './pacing-built';
import { buildCandidates, renderCandidates } from './pacing-candidates';
import { buildLedger, renderMarkdown, type EngineInputs } from './pacing-ledger';

const dir = resolve(__dirname, '../docs/progress/v1.4');
mkdirSync(dir, { recursive: true });
const at = process.argv.indexOf('--profile');
const id = at >= 0 ? process.argv[at + 1] : undefined;
const profile = id === undefined ? undefined : (BUNDLED as Record<string, EngineInputs['profile']>)[id];
if (at >= 0 && !profile) {
  console.error(`--profile needs one of: ${Object.keys(BUNDLED).join(', ')}`);
  process.exit(1);
}
const inputs: EngineInputs = profile ? { profile } : {};
const sfx = profile ? `.${id}` : '';
const ledger = buildLedger(inputs);
let md = renderMarkdown(ledger);
if (process.argv.includes('--candidates')) {
  const cands = buildCandidates(inputs);
  md += '\n' + renderCandidates(cands);
  const built = buildBuilt(inputs);
  md += '\n' + renderBuilt(built);
  writeFileSync(resolve(dir, `pacing-built${sfx}.json`), JSON.stringify(built, null, 2) + '\n');
  writeFileSync(resolve(dir, `pacing-candidates${sfx}.json`), JSON.stringify(cands, null, 2) + '\n');
}
writeFileSync(resolve(dir, `pacing-ledger${sfx}.json`), JSON.stringify(ledger, null, 2) + '\n');
writeFileSync(resolve(dir, `pacing-ledger${sfx}.md`), md + '\n');
for (const p of ledger.pods) console.log(`${p.label}: app ${(p.story.wallMs / 1000).toFixed(1)} s (story time); recorded ${(p.wallMs / 1000).toFixed(1)} s (uncapped ${(p.uncappedMs / 1000).toFixed(1)} s)`);
