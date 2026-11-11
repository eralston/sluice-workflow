// The theme-neutral stage string (14 §2.4, 17 W0-T2): `decodePiece(encodePiece(p))` gives `p` back,
// one look has exactly one string (fixed field order, quantised numbers), and anything else, a v0
// stage key included, decodes to null so the asset shows it as unknown (INV-11).
import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import type { PieceState } from '@shared/contracts/view';
import { resolveSignal, RUNG_OF_STAGE, UNKNOWN_SIGNAL } from '@shared/engine/signal';
import {
  decodePiece, decodeSignal, encodePiece, encodeSignal, isPieceStage, MAX_STEPS,
} from '@shared/engine/stageCode';

const mapping = stateMappingJson as StateMapping;

/** One piece of every role and every optional field, with numbers already on their quantum. */
const PIECES: PieceState[] = [
  { role: 'objective', signal: { rung: 'underway' }, category: 'InProgress', steps: ['n', 'a', 'c'] },
  { role: 'objective', signal: { rung: 'ready', sketch: true }, category: 'Proposed' },
  { role: 'objective', signal: { rung: 'ready', deferred: true }, category: 'Proposed', steps: [] },
  { role: 'threat', signal: { rung: 'nearing', step: 0.65 }, category: 'Resolved', steps: ['c', 'c', 'c', 'c', 'c', 'a'] },
  { role: 'threat', signal: { rung: 'off', ghost: true, strike: true }, category: 'Removed' },
  { role: 'step', signal: { rung: 'accomplished' }, category: 'Completed' },
  { role: 'container', signal: { rung: 'nearing', step: 0 }, category: 'InProgress' },
  { role: 'attachment', signal: { rung: 'off', ghost: true }, category: 'Removed' },
  { role: 'guard', signal: { rung: 'ready' }, category: 'Proposed' },
  { role: 'seat', signal: { rung: 'underway' }, category: 'InProgress', share: 0.5 },
  { role: 'seat', signal: { rung: 'accomplished' }, category: 'Completed', share: 1 },
  { role: 'facility', signal: { rung: 'underway' }, category: 'InProgress', intensity: 0.6, open: 3 },
  { role: 'facility', signal: { rung: 'ready' }, category: 'Proposed', intensity: 0, open: 0 },
  // On standby (19 M1), after its merges.
  { role: 'facility', signal: { rung: 'accomplished' }, category: 'Completed', intensity: 1, open: 0, merged: 2, standby: true },
  { role: 'agent', signal: { rung: 'off', unknown: true }, category: 'Unknown' },
  // A pack's own category, with the separators in it.
  { role: 'objective', signal: { rung: 'ready', sketch: true, step: 1, deferred: true, ghost: true, strike: true, unknown: true }, category: 'On hold | 50% + waiting=yes' },
];

describe('encodePiece / decodePiece round trip (14 §2.4)', () => {
  it.each(PIECES.map((p) => [encodePiece(p), p] as const))('%s', (stage, p) => {
    expect(isPieceStage(stage)).toBe(true);
    expect(decodePiece(stage)).toStrictEqual(p);
    expect(encodePiece(decodePiece(stage)!)).toBe(stage);
  });

  it('writes the look of a seat, a facility and a step-built piece in the stageCode grammar', () => {
    expect(encodePiece(PIECES[0]!)).toBe('v1|objective|underway|c=InProgress|s=nac');
    expect(encodePiece(PIECES[3]!)).toBe('v1|threat|nearing+step0.65|c=Resolved|s=ccccca');
    expect(encodePiece(PIECES[9]!)).toBe('v1|seat|underway|c=InProgress|sh=0.50');
    expect(encodePiece(PIECES[11]!)).toBe('v1|facility|underway|c=InProgress|i=0.60|pr=3');
    expect(encodePiece(PIECES[2]!)).toBe('v1|objective|ready+deferred|c=Proposed|s=');
    expect(encodePiece(PIECES[13]!)).toBe('v1|facility|accomplished|c=Completed|i=1.00|pr=0|mg=2|sb=1');
  });

  it('writes aw=1 after vc=1 for a vacant seat awaiting its first work, and only then (v1.4 B4)', () => {
    const base: PieceState = { role: 'seat', signal: { rung: 'ready' }, category: 'Proposed', share: 0 };
    const stage = encodePiece({ ...base, vacant: true, awaiting: true });
    expect(stage).toBe('v1|seat|ready|c=Proposed|sh=0.00|vc=1|aw=1');
    expect(decodePiece(stage)).toStrictEqual({ ...base, vacant: true, awaiting: true });
    expect(encodePiece({ ...base, awaiting: true })).toBe('v1|seat|ready|c=Proposed|sh=0.00');
    expect(encodePiece({ ...base, vacant: true })).toBe('v1|seat|ready|c=Proposed|sh=0.00|vc=1');
  });

  it('every SDLC signal, and every ladder stage, round-trips through the signal part', () => {
    const signals = [
      ...Object.entries(mapping.types).flatMap(([type, t]) => Object.keys(t.states).map((state) => resolveSignal(mapping, type, state))),
      ...Object.values(RUNG_OF_STAGE), UNKNOWN_SIGNAL,
    ];
    for (const s of signals) expect(decodeSignal(encodeSignal(s))).toStrictEqual({ ...s });
  });

  it('quantises share and intensity to 0.05, so the string moves only when the look does', () => {
    const seat = (share: number): PieceState => ({ role: 'seat', signal: { rung: 'underway' }, category: 'InProgress', share });
    expect(encodePiece(seat(0.51))).toBe(encodePiece(seat(0.5)));
    expect(encodePiece(seat(0.524))).toBe(encodePiece(seat(0.5)));
    expect(encodePiece(seat(0.53))).not.toBe(encodePiece(seat(0.5)));
    expect(decodePiece(encodePiece(seat(1 / 3)))!.share).toBe(0.35);
    expect(decodePiece(encodePiece({ role: 'facility', signal: { rung: 'ready' }, category: 'Proposed', intensity: 0.61 }))!.intensity).toBe(0.6);
  });

  it('clamps what is out of range: numbers into 0..1, counts to whole and non-negative, steps to six', () => {
    const p = decodePiece(encodePiece({
      role: 'seat', signal: { rung: 'nearing', step: 1.4 }, category: 'InProgress',
      share: -0.2, intensity: 7, open: Number.NaN,
      steps: ['n', 'n', 'n', 'a', 'a', 'a', 'c', 'c'],
    }))!;
    expect(p).toStrictEqual({
      role: 'seat', signal: { rung: 'nearing', step: 1 }, category: 'InProgress',
      steps: ['n', 'n', 'n', 'a', 'a', 'a'], share: 0, intensity: 1, open: 0,
    });
    expect(p.steps).toHaveLength(MAX_STEPS);
  });

  it('false flags are not written: they read back as absent', () => {
    const stage = encodePiece({ role: 'threat', signal: { rung: 'ready', sketch: false, ghost: false }, category: 'Proposed' });
    expect(stage).toBe('v1|threat|ready|c=Proposed');
    expect(decodePiece(stage)).toStrictEqual({ role: 'threat', signal: { rung: 'ready' }, category: 'Proposed' });
    expect(encodePiece({ role: 'facility', signal: { rung: 'ready' }, category: 'Proposed', open: 0, standby: false })).toBe('v1|facility|ready|c=Proposed|pr=0');
  });
});

describe('unknown stages decode to null (INV-11)', () => {
  it.each([
    // v0 stage keys, and the neutral stage
    'story.lush', 'bug.rejected', 'flight.active', 'unknown', '',
    // another version, a role or rung this version doesn't know
    'v2|objective|underway|c=InProgress', 'v1|planet|underway|c=InProgress', 'v1|objective|busy|c=InProgress',
    // a missing or malformed part
    'v1', 'v1|', 'v1|objective', 'v1|objective|underway', 'v1|objective|underway|InProgress', 'v1|objective||c=InProgress',
    'v1|objective|underway|c=%E0%A4%A',
    // flags: unknown, repeated, out of order, or a step that isn't 0..1 with two decimals
    'v1|objective|underway+shiny|c=InProgress', 'v1|objective|ready+sketch+sketch|c=Proposed',
    'v1|objective|off+ghost+deferred|c=Removed', 'v1|objective|nearing+step|c=Resolved',
    'v1|objective|nearing+step0.3|c=Resolved', 'v1|objective|nearing+step1.50|c=Resolved', 'v1|objective|nearing+step-0.10|c=Resolved',
    // fields: unknown, repeated, out of order, or with a bad value
    'v1|objective|underway|c=InProgress|x=1', 'v1|objective|underway|c=InProgress|s=na|s=na',
    'v1|seat|underway|c=InProgress|o=m1r1|sh=0.50', 'v1|seat|underway|c=InProgress|sh=0.50|o=m2r1', 'v1|objective|underway|c=InProgress|s=nax',
    'v1|objective|underway|c=InProgress|s=nnnnnnn', 'v1|seat|underway|c=InProgress|sh=0.5',
    'v1|seat|underway|c=InProgress|sh=1.05', 'v1|seat|underway|c=InProgress|o=m1', 'v1|facility|underway|c=InProgress|pr=-1',
    'v1|facility|underway|c=InProgress|pr', 'v1|facility|underway|c=InProgress|i=0.60|',
    // well-formed but not canonical: off the 0.05 quantum, leading zeros, needless percent-encoding
    'v1|seat|underway|c=InProgress|sh=0.37', 'v1|facility|underway|c=InProgress|pr=03',
    'v1|seat|underway|c=InProgress|o=m01r1', 'v1|objective|underway|c=In%50rogress',
    // standby: written only as sb=1, last
    'v1|facility|ready|c=Proposed|pr=0|sb=0', 'v1|facility|ready|c=Proposed|sb=1|pr=0', 'v1|facility|ready|c=Proposed|sb',
    // awaiting (v1.4 B4): written only with vc=1, after it, and only as aw=1
    'v1|seat|ready|c=Proposed|sh=0.00|aw=1', 'v1|seat|ready|c=Proposed|sh=0.00|vc=1|aw=0', 'v1|seat|ready|c=Proposed|sh=0.00|aw=1|vc=1',
  ])('%j', (stage) => {
    expect(decodePiece(stage)).toBeNull();
  });

  it('isPieceStage tells v1 stages from v0 keys', () => {
    expect(isPieceStage('story.lush')).toBe(false);
    expect(isPieceStage('v1|seat|ready|c=Proposed')).toBe(true);
  });
});
