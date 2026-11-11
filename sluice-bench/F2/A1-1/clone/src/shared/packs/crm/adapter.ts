// The CRM pack's event adapter (14 §2.2). Its fixture events are the shared event contract itself
// (03 §3): accounts are repos and quotes are PRs, so the moves are the engine's default reading
// through the bundle's mapping, and priority and focus stay v0's (ingest bakes them). The event line
// is the engine's, in the register's words, except that the source register names stages as the
// pipeline does ("Negotiation → Verbal Commit") and says how a quote ended, and who signed it off
// (the discount desk, as its approver). Pure.
import type { CanonicalKey } from '../../contracts/keys';
import { contractMoves, typeIndex } from '../../engine/moves';
import { eventParts } from '../../engine/eventLine';
import { describeMoves } from '../../engine/terminology';
import type { EventAdapter } from '../../engine/types';

const numberOf = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);
/** "A", "A and B", "A, B and C". */
const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export const crmAdapter: EventAdapter = {
  id: 'crm',
  moves: contractMoves,
  describe(h, e, mv, t) {
    if (t.register === 'source') {
      const quote = `${t.noun('attachment')} #${numberOf(e.entityKey)}`;
      const name = (key: CanonicalKey) => h.entities.captains.find((c) => c.key === key)?.displayName ?? 'someone';
      if (e.kind === 'wi_state_changed') {
        const type = typeIndex(h).get(e.entityKey) ?? t.noun('objective');
        return { glyph: '◐', text: `${type} #${numberOf(e.entityKey)} ${e.payload.from} → ${e.payload.to}` };
      }
      if (e.kind === 'pr_completed') {
        const by = (e.payload.approvedBy ?? []).map(name).sort((a, b) => a.localeCompare(b));
        return { glyph: '✔', text: `${quote} accepted${by.length ? `, approved by ${listOf(by)}` : ''}` };
      }
      if (e.kind === 'pr_abandoned') return { glyph: '✕', text: `${quote} lost` };
    }
    return describeMoves(h, e, mv, t);
  },
  // A quote is accepted, signed off by the discount desk, or lost (22 B4).
  event: (h, e, t) => eventParts(h, e, t, { completed: 'Accepted', abandoned: 'Lost', byApprovers: true }),
};
