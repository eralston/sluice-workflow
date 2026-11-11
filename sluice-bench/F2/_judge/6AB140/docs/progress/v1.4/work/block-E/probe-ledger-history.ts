// Block E audit probe (E10-Q1): the ledger's Quasar history near 2026-09-15 19:25Z. Run with vite-node -c vitest.config.ts.
import { resolvePods } from '../../../../../scripts/pacing-ledger';
const rp = resolvePods().find((p) => p.label === 'Quasar Pod')!;
const h = rp.h;
console.log('scene', rp.scene, 'events', h.events.length, 'wis', h.entities.workItems.length, 'prs', h.entities.prs.length, 'sector', JSON.stringify(h.scope.sector).slice(0, 400));
for (const e of h.events) if (e.occurredAt >= Date.parse('2026-09-15T18:50:00Z') && e.occurredAt <= Date.parse('2026-09-15T20:30:00Z')) console.log(new Date(e.occurredAt).toISOString(), e.kind, e.entityKey);
