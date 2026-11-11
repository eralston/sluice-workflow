// The SDLC pack's event adapter (14 §2.2). Azure DevOps events are the shared event contract
// itself (03 §3), so the moves are the engine's default reading through the bundle's mapping, and
// priority and focus stay v0's (ingest bakes them). The event line is v0's in the source register,
// and the engine's neutral line, in the theme's words, in the chart register. Pure.
import type { CanonicalKey } from '../../contracts/keys';
import { contractMoves, typeIndex } from '../../engine/moves';
import { eventParts } from '../../engine/eventLine';
import { describeMoves } from '../../engine/terminology';
import type { EventAdapter } from '../../engine/types';
import { describeEvent } from '../../playback/describe';

export const sdlcAdapter: EventAdapter = {
  id: 'sdlc',
  moves: contractMoves,
  describe(h, e, mv, t) {
    if (t.register === 'chart') return describeMoves(h, e, mv, t);
    const types = typeIndex(h);
    return describeEvent(h, e, (key: CanonicalKey) => types.get(key) ?? 'Item');
  },
  // A pull request completes by merging (22 B4).
  event: (h, e, t) => eventParts(h, e, t, { completed: 'Merged' }),
};
