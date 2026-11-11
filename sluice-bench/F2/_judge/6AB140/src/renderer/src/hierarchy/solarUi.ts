// The Solar hierarchy's choices (v1, 14 §1.4): a round is a sprint and a region one of its pods, so a
// project opens, lists and rescopes exactly as Sprints does. Only the chain differs, the active
// theme names its seats (2026-10-12), and every label is a holo plate (19 R1: `SOLAR_PLATES`).
import { chromeWords } from '@shared/hierarchy/chrome';
import { solarHierarchy } from '@shared/hierarchy/solar';
import { useChart } from '../store';
import { activeTheme } from '../theme/registry';
import { SOLAR_PLATES } from './solarPlates';
import { sprintsUi } from './sprintsUi';
import type { ChooserKind, HierarchyUi } from './types';

const SOLAR_THEMED = solarHierarchy({ seatTitle: (h, person) => activeTheme()?.seatTitle?.(h, person) ?? null });

export const solarUi: HierarchyUi & { chooser: ChooserKind } = {
  ...sprintsUi, hierarchy: SOLAR_THEMED, chooser: 'sprints', plates: SOLAR_PLATES, galaxyMeta: 'counts',
  // The chrome speaks the pack's words (23 D5): Sprint is Week for Todo and Quarter for CRM. Pack-aware
  // wording lives in `@shared/hierarchy/chrome`; the sibling menu's group is the one place it is drawn here.
  async scopeSiblings(entry) {
    const items = await sprintsUi.scopeSiblings!(entry);
    const open = useChart.getState().history;
    const words = chromeWords(open && open.scope.projectKey === entry.scope.projectKey ? open : null);
    return items.map((i) => ({ ...i, group: `◷ ${words.rounds}` }));
  },
};
