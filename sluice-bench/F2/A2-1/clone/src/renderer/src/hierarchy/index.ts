// The active hierarchy (decided 2026-10-07): which chain of scenes the chart walks, by paradigm. Solar
// is the default in v1 (14 §7); Sprints and Backlog are reached by pin. The registry holds the choices.
import type { Hierarchy } from '@shared/hierarchy/types';
import { useChart } from '../store';
import { uiFor, type RegisteredUi } from './registry';

export function activeUi(): RegisteredUi {
  return uiFor(useChart.getState().paradigm);
}

export function activeHierarchy(): Hierarchy {
  return activeUi().hierarchy;
}
