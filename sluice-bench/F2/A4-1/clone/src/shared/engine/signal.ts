// 14 §1.1 — how the engine reads a piece's role and signal. Both come from the bundle's own mapping
// (each type declares a role, each state a rung and its flags), through a side index, so
// `WorkItemState` never changes and the seek goldens hold. Bundles from before v1 carry neither:
// the role then falls back to the v0 kind, and the signal to the v0 stage (`RUNG_OF_STAGE`) or, for
// a pack's own stage keys, to the state's category. Pure.
import type { MappedState, Role, StateMapping, WorkKind } from '../contracts/history';
import type { Signal } from './types';

/**
 * The v0 stage keys on the signal ladder: a mirror of `SIGNALS` in the renderer's
 * `art/progress.ts`, which the engine can't import. `tests/unit/signal.test.ts` keeps the two equal.
 */
export const RUNG_OF_STAGE: Readonly<Record<string, Readonly<Signal>>> = freezeAll({
  'feature.faint': { rung: 'ready', sketch: true },
  'feature.draft': { rung: 'ready' },
  'feature.review': { rung: 'ready' },
  'feature.ready': { rung: 'ready' },
  'feature.deferred': { rung: 'ready', deferred: true },
  'feature.active': { rung: 'underway' },
  'feature.accept': { rung: 'nearing', step: 0.65 },
  'feature.whiteDwarf': { rung: 'accomplished' },
  'feature.ghost': { rung: 'off', ghost: true },
  'story.uncharted': { rung: 'ready', sketch: true },
  'story.surveyed': { rung: 'ready' },
  'story.review': { rung: 'ready' },
  'story.dormant': { rung: 'ready', deferred: true },
  'story.terraforming': { rung: 'underway' },
  'story.developed': { rung: 'nearing', step: 0.3 },
  'story.developedAccept': { rung: 'nearing', step: 0.65 },
  'story.lush': { rung: 'accomplished' },
  'story.ghost': { rung: 'off', ghost: true },
  'bug.detected': { rung: 'ready', sketch: true },
  'bug.stable': { rung: 'ready' },
  'bug.review': { rung: 'ready' },
  'bug.disturbance': { rung: 'underway' },
  'bug.contracted': { rung: 'nearing', step: 0.3 },
  'bug.contractedAccept': { rung: 'nearing', step: 0.65 },
  'bug.remnant': { rung: 'accomplished' },
  'bug.ghost': { rung: 'off', ghost: true },
  'bug.rejected': { rung: 'off', ghost: true, strike: true },
  'task.unstarted': { rung: 'ready', sketch: true },
  'task.lit': { rung: 'underway' },
  'task.settled': { rung: 'accomplished' },
  'task.faint': { rung: 'off', ghost: true },
  'flight.active': { rung: 'underway' },
  'flight.completed': { rung: 'accomplished' },
  'flight.abandoned': { rung: 'off', ghost: true },
});

/** No mapping for the state (INV-11): neutral, off the ladder, shown with its raw name. */
export const UNKNOWN_SIGNAL: Readonly<Signal> = Object.freeze({ rung: 'off', unknown: true });

/**
 * The last fallback, for a pack stage with no rung: the closed category set (12 §4). These are the
 * engine's own names, written as bare keys; one of them is also an SDLC state's name.
 */
const RUNG_OF_CATEGORY: Readonly<Record<string, Readonly<Signal>>> = freezeAll({
  Proposed: { rung: 'ready' },
  InProgress: { rung: 'underway' },
  Resolved: { rung: 'nearing' },
  Completed: { rung: 'accomplished' },
  Removed: { rung: 'off', ghost: true },
});

/** A v0 kind's role, for a type that doesn't declare one. */
const ROLE_OF_KIND: Readonly<Record<WorkKind, Role>> = {
  epic: 'container', feature: 'container', story: 'objective', bug: 'threat', task: 'step',
};

/** A v0 stage's signal; a stage off the ladder (or `unknown`) is unknown. */
export function signalOfStage(stage: string): Signal {
  return RUNG_OF_STAGE[stage] ?? UNKNOWN_SIGNAL;
}

/** One mapped state's signal: its own rung and flags, else its stage's, else its category's. */
export function signalOfMapped(s: MappedState): Signal {
  if (s.rung) {
    // Only the flags that are set, so a mapped signal deep-equals the ladder's own.
    const { rung, sketch, step, deferred, ghost, strike } = s;
    return Object.freeze({
      rung, ...(sketch ? { sketch } : {}), ...(step !== undefined ? { step } : {}),
      ...(deferred ? { deferred } : {}), ...(ghost ? { ghost } : {}), ...(strike ? { strike } : {}),
    });
  }
  return RUNG_OF_STAGE[s.stage] ?? RUNG_OF_CATEGORY[s.category] ?? UNKNOWN_SIGNAL;
}

/** The side index: every type's role and every (type, state)'s signal, built once per mapping. */
interface SignalIndex {
  roles: Map<string, Role>;
  signals: Map<string, Map<string, Signal>>;
  attachments: Map<string, Signal>;
}
const indexes = new WeakMap<StateMapping, SignalIndex>();

function indexOf(mapping: StateMapping): SignalIndex {
  let ix = indexes.get(mapping);
  if (!ix) {
    ix = { roles: new Map(), signals: new Map(), attachments: new Map() };
    for (const [type, t] of Object.entries(mapping.types)) {
      const role = t.role ?? ROLE_OF_KIND[t.kind];
      if (role) ix.roles.set(type, role);
      ix.signals.set(type, new Map(Object.entries(t.states).map(([state, s]) => [state, signalOfMapped(s)])));
    }
    indexes.set(mapping, ix);
  }
  return ix;
}

/** What a type is for on the board, or null for a type the mapping doesn't know. */
export function resolveRole(mapping: StateMapping, type: string): Role | null {
  return indexOf(mapping).roles.get(type) ?? null;
}

/** A (type, raw state)'s signal; an unmapped pair is unknown (INV-11). Returned frozen. */
export function resolveSignal(mapping: StateMapping, type: string, rawState: string): Signal {
  return indexOf(mapping).signals.get(type)?.get(rawState) ?? UNKNOWN_SIGNAL;
}

/** An attachment's status → signal: the mapping's `entities.attachment`, else the v0 stage for it. */
export function attachmentSignal(mapping: StateMapping, status: 'active' | 'completed' | 'abandoned'): Signal {
  // Cached beside the type signals, so an attachment's signal is shared like theirs.
  const { attachments } = indexOf(mapping);
  let signal = attachments.get(status);
  if (!signal) {
    const s = mapping.entities?.attachment?.states[status];
    signal = s ? signalOfMapped(s) : signalOfStage(`flight.${status}`);
    attachments.set(status, signal);
  }
  return signal;
}

/** Frozen, with a null prototype, so a stage or category named `toString` or `__proto__` is unknown. */
function freezeAll(table: Record<string, Signal>): Readonly<Record<string, Readonly<Signal>>> {
  for (const s of Object.values(table)) Object.freeze(s);
  return Object.freeze(Object.assign(Object.create(null) as Record<string, Signal>, table));
}
