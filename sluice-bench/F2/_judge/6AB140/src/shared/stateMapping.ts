import type { StateMapping } from './contracts/history';
import type { WorkItemState } from './contracts/view';

export interface ResolvedState {
  kind: WorkItemState['kind'];
  category: string;
  stage: string;
}

/** INV-05 / INV-11: stage comes only from (type, raw state); unknown pairs get the neutral stage. */
export function resolveState(mapping: StateMapping, type: string, state: string): ResolvedState {
  const t = mapping.types[type];
  const s = t?.states[state];
  return {
    kind: t?.kind ?? 'other',
    category: s?.category ?? 'Unknown',
    stage: s?.stage ?? mapping.unknownStage,
  };
}
