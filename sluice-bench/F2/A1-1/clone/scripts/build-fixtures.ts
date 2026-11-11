// `npm run fixtures`: write each scenario's ScopeHistory bundle to fixtures/generated/ for golden tests.
// v1 scenarios (14 §1.3) also get one bundle per sprint they serve, since a round is what v1 plays.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import stateMappingJson from '../config/state-mapping.json';
import type { ScopeHistory, StateMapping } from '../src/shared/contracts/history';
import { sprintScopes, toHistory, type Scenario } from '../fixtures/dsl';
import { scenarios } from '../fixtures/scenarios';
import { v1Scenarios } from '../fixtures/scenarios/v1';

const out = resolve(__dirname, '../fixtures/generated');
mkdirSync(out, { recursive: true });
/** A scenario's own mapping (a v1 pack's), else SDLC's. */
const mappingOf = (s: Scenario) => s.mapping ?? (stateMappingJson as StateMapping);
const write = (file: string, h: ScopeHistory) => {
  writeFileSync(resolve(out, file), JSON.stringify(h, null, 2) + '\n');
  console.log(`wrote ${file} (${h.events.length} events)`);
};
for (const s of [...scenarios, ...v1Scenarios]) write(`${s.name}.history.json`, toHistory(s, mappingOf(s)));
for (const s of v1Scenarios) {
  for (const scope of sprintScopes(s)) {
    const slug = (scope.sprint.split('\\').pop() ?? scope.sprint).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    write(`${s.name}.${slug}.history.json`, toHistory(s, mappingOf(s), scope));
  }
}
