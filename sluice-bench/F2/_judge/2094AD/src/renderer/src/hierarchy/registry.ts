// The hierarchy UIs by paradigm (v1, 14 §1.4): a new chain registers its renderer side here instead of
// adding a branch to activeUi. Backlog, Sprints and Solar are registered at load.
import type { Paradigm } from '@shared/contracts/ipc';
import { backlogUi } from './backlogUi';
import { solarUi } from './solarUi';
import { sprintsUi } from './sprintsUi';
import type { ChooserKind, HierarchyUi } from './types';

/** A registered UI always says which lists its project plate offers. */
export type RegisteredUi = HierarchyUi & { chooser: ChooserKind };

const uis = new Map<Paradigm, RegisteredUi>();

/** A later UI for the same paradigm replaces the earlier one. */
export function registerHierarchyUi(paradigm: Paradigm, ui: RegisteredUi): void {
  uis.set(paradigm, ui);
}

/** The paradigm's UI. Throws for one never registered: a wiring bug, which should be loud. */
export function uiFor(paradigm: Paradigm): RegisteredUi {
  const ui = uis.get(paradigm);
  if (!ui) throw new Error(`No hierarchy UI registered for the ${paradigm} paradigm`);
  return ui;
}

// The v0 UIs predate `chooser`: it's set here, so their files stay as they are.
registerHierarchyUi('backlog', { ...backlogUi, chooser: 'backlog' });
registerHierarchyUi('sprints', { ...sprintsUi, chooser: 'sprints' });
registerHierarchyUi('solar', solarUi);
