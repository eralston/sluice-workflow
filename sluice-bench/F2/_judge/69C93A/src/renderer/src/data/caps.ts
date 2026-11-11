// What the active data source can do (decided 2026-10-07): the renderer asks this, never which source
// it is. Connect, the source picker itself, is the one exception.
import { SOURCE_CAPS, type SourceCaps } from '@shared/contracts/source';
import { useChart } from '../store';

export function caps(): SourceCaps {
  return SOURCE_CAPS[useChart.getState().mode];
}

/** The same, as a hook (re-renders when the source changes). */
export function useCaps(): SourceCaps {
  return SOURCE_CAPS[useChart((s) => s.mode)];
}
