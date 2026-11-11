// The Solar paradigm's plates for nodes with no asset (19 R1, L1, L3, L4): the galaxies, the round's
// pod stars (and its Load more), and the region's star are holo plates in Solar, while the v0 views,
// which share these levels' code, keep their navy plates. By level id, then kind (`KindPlates`).
// Pure data: docTables.test.ts reads it for 15 §6's holo-variants rows.
import type { KindPlates } from '../chart/holo/holoLabel';

export const SOLAR_PLATES: KindPlates = {
  // A galaxy: one plate, its name over its counts, hanging below and to the right of the bright core (T2).
  galaxy: { galaxy: { label: { frame: 'chamfer', variant: 'subtitle', layout: 'horizontal', tier: 'door' }, labelRim: 0.45, dir: { x: 0.55, y: 0.835 } } },
  // The round: a pod star's plate stands above it, its name over its counts, so its miniature system
  // stays visible below (T4 Sky, the quietest: 22 A5).
  sprint: {
    star: { label: { frame: 'chamfer', variant: 'subtitle', layout: 'vertical', tier: 'sky' }, labelRim: 1.1 },
    overflow: { label: { frame: 'chamfer', variant: 'subtitle', layout: 'vertical', tier: 'door' }, labelRim: 1 },
  },
  // The region: its star names the system you're inside, above it, over its counts, as the round's do
  // (T4 Sky; 22 A3, A5).
  pod: { star: { label: { frame: 'chamfer', variant: 'subtitle', layout: 'vertical', tier: 'sky' }, labelRim: 1.1 } },
};
