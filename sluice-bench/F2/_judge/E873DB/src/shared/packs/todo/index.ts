// The Todo domain pack (14 §1.2, 12): a household's todo list, read in engine terms. A Todo is an
// objective, a Problem ("fix the sink") a threat and a Checklist Item a step; a shared context
// (Home) is the facility its notes are filed against. Fixture-only (17 A3): its bundles name it
// (`domainPack: 'todo'`) and carry its own mapping, which it also ships. Pure.
import type { StateMapping } from '../../contracts/history';
import type { DomainPack, PackThresholds } from '../../engine/types';
import todoMappingJson from '../../../../config/packs/todo.mapping.json';
import { todoAdapter } from './adapter';
import { TODO_WORDS } from './words';

/** config/packs/todo.mapping.json: every type with its role, every state with its rung. */
export const TODO_MAPPING = todoMappingJson as StateMapping;

/**
 * 18 §5 A6, the Todo reading: Swift passage within 2 working days (chores wait for evenings, which
 * weigh little), and Steady hands at no more than 3 Doing at once (a household juggles).
 */
export const TODO_THRESHOLDS: PackThresholds = { swiftDays: 2, wipK: 3, dayHours: 12 };

export const todoPack: DomainPack = {
  id: 'todo',
  title: 'Household todos (fixture)',
  mapping: TODO_MAPPING,
  words: TODO_WORDS,
  adapter: todoAdapter,
  thresholds: TODO_THRESHOLDS,
};
