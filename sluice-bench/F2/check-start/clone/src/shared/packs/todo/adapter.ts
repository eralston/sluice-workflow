// The Todo pack's event adapter (14 §2.2). Its fixture events are the shared event contract itself
// (03 §3), so the moves are the engine's default reading through the bundle's mapping, and priority
// and focus stay v0's (ingest bakes them). The event line is the engine's, in the register's words,
// except that the source register names states as the list does ("Planned → Doing") and says what
// became of a note. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import { contractMoves, typeIndex } from '../../engine/moves';
import { eventParts } from '../../engine/eventLine';
import { describeMoves } from '../../engine/terminology';
import type { EventAdapter } from '../../engine/types';

const numberOf = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);

export const todoAdapter: EventAdapter = {
  id: 'todo',
  moves: contractMoves,
  describe(h, e, mv, t) {
    if (t.register === 'source') {
      const note = `${t.noun('attachment')} #${numberOf(e.entityKey)}`;
      if (e.kind === 'wi_state_changed') {
        const type = typeIndex(h).get(e.entityKey) ?? t.noun('objective');
        return { glyph: '◐', text: `${type} #${numberOf(e.entityKey)} ${e.payload.from} → ${e.payload.to}` };
      }
      if (e.kind === 'pr_completed') return { glyph: '✔', text: `${note} filed` };
      if (e.kind === 'pr_abandoned') return { glyph: '✕', text: `${note} discarded` };
    }
    return describeMoves(h, e, mv, t);
  },
  // A note is filed or discarded (22 B4).
  event: (h, e, t) => eventParts(h, e, t, { completed: 'Filed', abandoned: 'Discarded' }),
};
