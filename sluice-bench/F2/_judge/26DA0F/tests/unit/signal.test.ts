// Role and signal resolution (14 §1.1, 17 W0-T2): the mapping's rungs agree with the signal ladder
// the art draws (art/progress.ts `SIGNALS`) for every SDLC state, the engine's mirror of the ladder
// agrees with it too, and a bundle from before v1 (no `role`, no `rung`) reads the same through the
// v0 fallbacks. Unknown types and states stay neutral (INV-11).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import { stateMappingSchema } from '@shared/contracts/ipc';
import {
  attachmentSignal, resolveRole, resolveSignal, RUNG_OF_STAGE, signalOfMapped, signalOfStage, UNKNOWN_SIGNAL,
} from '@shared/engine/signal';
import type { Signal } from '@shared/engine/types';

/**
 * The art's own ladder. It's renderer code, outside this project's tsconfig, so it's loaded by a
 * runtime path; it imports nothing, so it runs under Node.
 */
const PROGRESS = resolve(__dirname, '../../src/renderer/src/chart/art/progress.ts');
const { signalOf } = (await import(/* @vite-ignore */ PROGRESS)) as { signalOf(stage: string): Signal };

const mapping = stateMappingJson as StateMapping;
const PR_STATUSES = ['active', 'completed', 'abandoned'] as const;

/** Every (type, state, stage) the SDLC mapping lists. */
const pairs = Object.entries(mapping.types).flatMap(([type, t]) =>
  Object.entries(t.states).map(([state, s]) => ({ type, state, stage: s.stage })));

/** The mapping as a bundle from before v1 carried it: no role, no rung, no flags, no entities. */
function v0Mapping(): StateMapping {
  return {
    version: mapping.version, unknownStage: mapping.unknownStage,
    types: Object.fromEntries(Object.entries(mapping.types).map(([type, t]) => [type, {
      kind: t.kind,
      states: Object.fromEntries(Object.entries(t.states).map(([state, s]) => [state, { category: s.category, stage: s.stage }])),
    }])),
  };
}

describe('the mapping agrees with the signal ladder (parity with art/progress.ts)', () => {
  it('covers every SDLC state', () => {
    expect(pairs.length).toBe(31);
  });

  it.each(pairs)('$type · $state → signalOf($stage)', ({ type, state, stage }) => {
    expect(resolveSignal(mapping, type, state)).toStrictEqual(signalOf(stage));
  });

  it('every state declares its rung, so the fallbacks never run for SDLC', () => {
    for (const t of Object.values(mapping.types)) for (const s of Object.values(t.states)) expect(s.rung).toBeDefined();
  });

  it("the engine's mirror equals the ladder for every stage it lists, and lists every mapped stage", () => {
    for (const [stage, sig] of Object.entries(RUNG_OF_STAGE)) expect(sig, stage).toStrictEqual(signalOf(stage));
    for (const { stage } of pairs) expect(RUNG_OF_STAGE[stage], stage).toBeDefined();
    expect(signalOfStage('unknown')).toStrictEqual(signalOf('unknown'));
    expect(signalOfStage('no.such.stage')).toStrictEqual(signalOf('no.such.stage'));
  });

  it.each(PR_STATUSES)('attachment %s → signalOf(flight.%s)', (status) => {
    expect(attachmentSignal(mapping, status)).toStrictEqual(signalOf(`flight.${status}`));
  });

  it('the mapping crosses IPC whole: every rung and flag survives zod (a step is a fraction)', () => {
    const parsed = stateMappingSchema.parse(mapping);
    for (const { type, state } of pairs) expect(resolveSignal(parsed, type, state)).toStrictEqual(resolveSignal(mapping, type, state));
    expect(parsed.entities).toEqual(mapping.entities);
  });

  it('every SDLC type has its role', () => {
    expect(Object.fromEntries(Object.keys(mapping.types).map((type) => [type, resolveRole(mapping, type)]))).toEqual({
      Epic: 'container', Feature: 'container', 'User Story': 'objective', Bug: 'threat', Task: 'step',
    });
  });
});

describe('fallbacks for a bundle with no role or rung', () => {
  const old = v0Mapping();

  it('the role falls back to the v0 kind', () => {
    for (const type of Object.keys(mapping.types)) expect(resolveRole(old, type), type).toBe(resolveRole(mapping, type));
  });

  it('the signal falls back to the v0 stage, with the same flags', () => {
    for (const { type, state } of pairs) expect(resolveSignal(old, type, state), `${type} · ${state}`).toStrictEqual(resolveSignal(mapping, type, state));
  });

  it('an attachment with no entity mapping reads its v0 flight stage', () => {
    for (const status of PR_STATUSES) expect(attachmentSignal(old, status)).toStrictEqual(attachmentSignal(mapping, status));
  });

  it("a pack's own stage with no rung falls back to its category; an unknown category is unknown", () => {
    expect(signalOfMapped({ category: 'Proposed', stage: 'chore.waiting' })).toStrictEqual({ rung: 'ready' });
    expect(signalOfMapped({ category: 'InProgress', stage: 'chore.doing' })).toStrictEqual({ rung: 'underway' });
    expect(signalOfMapped({ category: 'Resolved', stage: 'chore.checking' })).toStrictEqual({ rung: 'nearing' });
    expect(signalOfMapped({ category: 'Completed', stage: 'chore.done' })).toStrictEqual({ rung: 'accomplished' });
    expect(signalOfMapped({ category: 'Removed', stage: 'chore.dropped' })).toStrictEqual({ rung: 'off', ghost: true });
    expect(signalOfMapped({ category: 'Sideways', stage: 'chore.odd' })).toStrictEqual(UNKNOWN_SIGNAL);
  });

  it("a mapped rung wins over the stage's, and only the flags it sets are kept", () => {
    expect(signalOfMapped({ category: 'Completed', stage: 'story.lush', rung: 'nearing', step: 0, sketch: false, ghost: true }))
      .toStrictEqual({ rung: 'nearing', step: 0, ghost: true });
  });
});

describe('unknown types and states stay neutral (INV-11)', () => {
  it('an unmapped type has no role, and its states are unknown', () => {
    expect(resolveRole(mapping, 'Issue')).toBeNull();
    expect(resolveSignal(mapping, 'Issue', 'Doing')).toStrictEqual({ rung: 'off', unknown: true });
  });

  it("a known type's unmapped state is unknown", () => {
    expect(resolveSignal(mapping, 'User Story', 'Blocked')).toStrictEqual(signalOf('unknown'));
  });

  it('signals are shared and frozen, so a caller cannot change the index', () => {
    const s = resolveSignal(mapping, 'Bug', 'Rejected');
    expect(resolveSignal(mapping, 'Bug', 'Rejected')).toBe(s);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(UNKNOWN_SIGNAL)).toBe(true);
  });

  it("attachment signals are shared too", () => {
    for (const status of PR_STATUSES) expect(attachmentSignal(mapping, status)).toBe(attachmentSignal(mapping, status));
  });

  it("a stage or category named like an Object member is unknown, not the member", () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(signalOfStage(key), key).toBe(UNKNOWN_SIGNAL);
      expect(signalOfMapped({ category: key, stage: key }), key).toBe(UNKNOWN_SIGNAL);
    }
  });
});
