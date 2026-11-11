// The Star Chart stage codec (17 W2-T3, 14 §5 Assets): every neutral stage a v1 node can carry becomes
// an art stage string that the art's own parser reads back with the expected state — the asteroid's
// `asteroidStage`, the hive's `parseThreatStage`, the world's `parseWorldStage` and the station's
// `parseStationStage` (over the art's own `stationStage`). Anything that doesn't decode is unknown
// (INV-11), and steps unset or [] draw the same.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import stateMappingJson from '@config/state-mapping.json';
import type { Rung, StateMapping } from '@shared/contracts/history';
import type { PieceState } from '@shared/contracts/view';
import { resolveSignal } from '@shared/engine/signal';
import { encodePiece, MAX_STEPS } from '@shared/engine/stageCode';
import type { Signal } from '@shared/engine/types';

// Renderer code sits outside this project's tsconfig, so it's loaded by a runtime path and typed by
// hand. Loading the art modules is fine under Node; building their views isn't (no WebGL, no canvas).
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;

type Step = 'n' | 'a' | 'c';
type StationParams = { act: string; o: { i?: number; pr: number; pd: string; form?: string } };
const codec = await load<{
  pieceOf(stage: string, role: PieceState['role']): PieceState | null;
  seatLook(p: PieceState | null): string;
  asteroidState(p: PieceState | null): string;
  objectiveLook(p: PieceState | null, material?: string): string;
  threatState(p: PieceState | null): string;
  threatLook(p: PieceState | null, swarm: string, look?: string): string;
  THREAT_ACTS: Record<string, string>;
  facilityLook(p: PieceState | null, act?: string): StationParams;
  STATION_ACTS: readonly string[];
}>('theme/starChart/stageCodec.ts');
const asteroids = await load<{
  asteroidStage(stage: string): { material?: string; state: string; signal: Signal; steps?: ('new' | 'active' | 'closed')[] };
  ASTEROID_MATERIALS: string[];
}>('chart/art/asteroids.ts');
const swarm = await load<{
  parseThreatStage(stage: string): { look: string; steps: Step[] };
  THREAT_LOOKS: { key: string; rung: Rung }[];
  SWARMS: { key: string }[];
}>('chart/art/swarm.ts');
const worlds = await load<{
  parseWorldStage(stage: string): { line?: string; share: number; megastructures?: number; research?: number };
  worldRung(share: number): Rung;
}>('chart/art/worlds.ts');
const stations = await load<{
  stationStage(faction: string, act: string, o?: { i?: number; pr?: number; pd?: string; form?: string; tf?: number }): string;
  parseStationStage(stage: string): { act?: string; intensity?: number; shuttles?: number; guards?: string; form?: string; morph?: number };
  FACTIONS: string[];
}>('chart/art/dreadnoughts.ts');

const mapping = stateMappingJson as StateMapping;
const STEP_NAME = { n: 'new', a: 'active', c: 'closed' } as const;
const RUNGS: Rung[] = ['ready', 'underway', 'nearing', 'accomplished', 'off'];
const STEP_MIXES: (Step[] | undefined)[] = [undefined, [], ['n'], ['c', 'a', 'n'], ['a', 'a', 'a', 'a', 'a', 'a'], ['c', 'c', 'c', 'c', 'c', 'c', 'n', 'n']];

/** The piece a projection would give, through the neutral stage string and back. */
function through(p: PieceState): PieceState | null {
  return codec.pieceOf(encodePiece(p), p.role);
}

/** Every SDLC (type, state) of one role, as a piece. */
function sdlcPieces(role: 'objective' | 'threat'): { state: string; piece: PieceState }[] {
  return Object.entries(mapping.types).filter(([, t]) => t.role === role).flatMap(([type, t]) =>
    Object.entries(t.states).map(([state, s]) => ({ state, piece: { role, signal: resolveSignal(mapping, type, state), category: s.category } })));
}

/** Every signal: each rung with every combination of the flags (and a step for nearing). */
const SIGNALS: Signal[] = RUNGS.flatMap((rung) => {
  const out: Signal[] = [];
  for (let bits = 0; bits < 32; bits++) {
    const s: Signal = { rung };
    if (bits & 1) s.sketch = true;
    if (bits & 2) s.deferred = true;
    if (bits & 4) s.ghost = true;
    if (bits & 8) s.strike = true;
    if (bits & 16) s.unknown = true;
    out.push(s, { ...s, step: 0.3 }, { ...s, step: 0.65 });
  }
  return out;
});

describe('objectives → asteroids (asteroidStage)', () => {
  const EXPECTED: Record<string, string> = {
    New: 'sketch', Ready: 'ready', Deferred: 'deferred', 'Ready for Review': 'ready', Active: 'underway',
    Resolved: 'resolved', 'Ready to Accept': 'accept', Closed: 'accomplished', Removed: 'ghost',
  };

  it('every SDLC objective state gives its look, and the art reads the same signal back', () => {
    const cases = sdlcPieces('objective');
    expect(cases.map((c) => c.state).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const { state, piece } of cases) {
      for (const material of asteroids.ASTEROID_MATERIALS) {
        const parsed = asteroids.asteroidStage(codec.objectiveLook(through(piece), material));
        expect(parsed.state, state).toBe(EXPECTED[state]);
        expect(parsed.material).toBe(material);
        // The asteroid's ladder is the SDLC ladder (both mirror art/progress.ts).
        expect(parsed.signal, state).toEqual(piece.signal);
      }
    }
  });

  it('steps become augmentations in socket order; unset and [] draw the same', () => {
    for (const steps of STEP_MIXES) {
      const piece: PieceState = { role: 'objective', signal: { rung: 'underway' }, category: 'InProgress', ...(steps ? { steps } : {}) };
      const parsed = asteroids.asteroidStage(codec.objectiveLook(through(piece)));
      expect(parsed.state).toBe('underway');
      expect(parsed.steps).toEqual((steps ?? []).slice(0, MAX_STEPS).map((s) => STEP_NAME[s]));
    }
    const bare: PieceState = { role: 'objective', signal: { rung: 'ready' }, category: 'Proposed' };
    expect(codec.objectiveLook(through(bare))).toBe(codec.objectiveLook(through({ ...bare, steps: [] })));
  });

  it('every signal parses to a known state on its own rung; only an unknown signal is unknown', () => {
    for (const signal of SIGNALS) {
      const parsed = asteroids.asteroidStage(codec.objectiveLook(through({ role: 'objective', signal, category: 'x' })));
      if (signal.unknown) expect(parsed.state).toBe('unknown');
      else {
        expect(parsed.state).not.toBe('unknown');
        expect(parsed.signal.rung).toBe(signal.rung);
      }
    }
  });
});

describe('threats → hive ships (parseThreatStage)', () => {
  const EXPECTED: Record<string, string> = {
    New: 'sketch', Ready: 'ready', 'Ready for Review': 'ready', Active: 'underway', Resolved: 'nearing',
    'Ready to Accept': 'nearing', Closed: 'platform', Removed: 'ghost', Rejected: 'rejected',
  };
  const rungOf = new Map(swarm.THREAT_LOOKS.map((l) => [l.key, l.rung]));

  it('every SDLC threat state gives its resting look, on its own rung, in every swarm', () => {
    const cases = sdlcPieces('threat');
    expect(cases.map((c) => c.state).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const { state, piece } of cases) {
      for (const { key } of swarm.SWARMS) {
        const stage = codec.threatLook(through(piece), key);
        expect(stage.startsWith(`threat.${key}.`)).toBe(true);
        const parsed = swarm.parseThreatStage(stage);
        expect(parsed.look, state).toBe(EXPECTED[state]);
        expect(rungOf.get(parsed.look)).toBe(piece.signal.rung);
      }
    }
  });

  it('steps become target locks; unset and [] mean no locks (never the art defaults)', () => {
    for (const steps of STEP_MIXES) {
      for (const signal of [{ rung: 'ready' }, { rung: 'underway' }, { rung: 'nearing', step: 0.3 }] as Signal[]) {
        const piece: PieceState = { role: 'threat', signal, category: 'x', ...(steps ? { steps } : {}) };
        expect(swarm.parseThreatStage(codec.threatLook(through(piece), 'reaver')).steps).toEqual((steps ?? []).slice(0, MAX_STEPS));
      }
    }
  });

  it('every signal parses to a look on its own rung', () => {
    for (const signal of SIGNALS) {
      const parsed = swarm.parseThreatStage(codec.threatLook(through({ role: 'threat', signal, category: 'x' }), 'brood'));
      expect(rungOf.get(parsed.look)).toBe(signal.unknown ? 'off' : signal.rung);
    }
  });

  it('acts are the art’s moments, keeping the steps', () => {
    const piece: PieceState = { role: 'threat', signal: { rung: 'accomplished' }, category: 'Completed', steps: ['c', 'c'] };
    expect(Object.keys(codec.THREAT_ACTS).sort()).toEqual(['breakup', 'emerge', 'retreat', 'warp']);
    for (const look of Object.values(codec.THREAT_ACTS)) {
      expect(rungOf.has(look)).toBe(true);
      expect(swarm.parseThreatStage(codec.threatLook(through(piece), 'stinger', look))).toEqual({ look, steps: ['c', 'c'] });
    }
  });
});

describe('seats → worlds (parseWorldStage)', () => {
  it('own share reads back exactly, on the world’s own rung', () => {
    for (let k = 0; k <= 20; k++) {
      const share = k / 20;
      const piece: PieceState = { role: 'seat', signal: { rung: worlds.worldRung(share) }, category: 'x', share };
      const parsed = worlds.parseWorldStage(codec.seatLook(through(piece)));
      expect(parsed.share).toBeCloseTo(share, 10);
      expect(parsed.line).toBeUndefined(); // the line comes from the person's seed
      expect([parsed.megastructures, parsed.research]).toEqual([0, 0]);
      expect(worlds.worldRung(parsed.share)).toBe(piece.signal.rung);
    }
  });

  it('a seat with no share is a share-0 world', () => {
    expect(worlds.parseWorldStage(codec.seatLook(through({ role: 'seat', signal: { rung: 'ready' }, category: 'x' })))).toEqual({ share: 0, megastructures: 0, research: 0 });
  });
});

describe('facilities → stations (parseStationStage over stationStage)', () => {
  it('intensity and the open count read back, in every faction, at rest and in every act', () => {
    for (const faction of stations.FACTIONS) {
      for (const [intensity, open] of [[0, 0], [0.35, 2], [0.6, 6], [1, 11], [undefined, 3]] as const) {
        const piece: PieceState = { role: 'facility', signal: { rung: 'underway' }, category: 'x', open, ...(intensity !== undefined ? { intensity } : {}) };
        for (const act of ['idle', ...codec.STATION_ACTS]) {
          const p = codec.facilityLook(through(piece), act === 'idle' ? undefined : act);
          const parsed = stations.parseStationStage(stations.stationStage(faction, p.act, p.o));
          expect(parsed.act).toBe(act);
          expect(parsed.shuttles).toBe(open);
          expect(parsed.guards).toBe('idle');
          if (intensity === undefined) expect(parsed.intensity).toBeUndefined();
          else expect(parsed.intensity).toBeCloseTo(intensity, 10);
        }
      }
    }
  });
});

describe('unknown stages (INV-11)', () => {
  const STRANGE = ['', 'story.lush', 'v1|', 'v1|objective', 'v1|objective|mystery|c=x', 'v2|objective|ready|c=x', 'toString', '__proto__'];

  it('a stage that doesn’t decode, or decodes to another role, is unknown', () => {
    for (const s of STRANGE) for (const role of ['seat', 'objective', 'threat', 'facility'] as const) expect(codec.pieceOf(s, role)).toBeNull();
    const threat = encodePiece({ role: 'threat', signal: { rung: 'underway' }, category: 'x' });
    expect(codec.pieceOf(threat, 'objective')).toBeNull();
    expect(codec.pieceOf(threat, 'threat')).not.toBeNull();
  });

  it('each art shows its neutral look for an unknown stage', () => {
    for (const s of STRANGE) {
      expect(asteroids.asteroidStage(codec.objectiveLook(codec.pieceOf(s, 'objective'))).state).toBe('unknown');
      expect(swarm.parseThreatStage(codec.threatLook(codec.pieceOf(s, 'threat'), 'reaver')).look).toBe('ghost');
      expect(worlds.parseWorldStage(codec.seatLook(codec.pieceOf(s, 'seat'))).share).toBe(0);
      const p = codec.facilityLook(codec.pieceOf(s, 'facility'));
      expect(stations.parseStationStage(stations.stationStage('trek', p.act, p.o))).toEqual({ act: 'idle', shuttles: 0, guards: 'idle' });
    }
  });
});

describe('the Mecha station’s first-merge transformation (mechaStation.ts, 2026-10-12)', () => {
  const facility = (extra: Partial<PieceState> = {}): PieceState => ({ role: 'facility', signal: { rung: 'underway' } as Signal, category: 'InProgress', intensity: 0.5, open: 2, ...extra });

  it('writes a merge count only above zero, and reads it back', () => {
    expect(encodePiece(facility())).toBe('v1|facility|underway|c=InProgress|i=0.50|pr=2');
    expect(encodePiece(facility({ merged: 0 }))).toBe('v1|facility|underway|c=InProgress|i=0.50|pr=2');
    expect(encodePiece(facility({ merged: 3 }))).toBe('v1|facility|underway|c=InProgress|i=0.50|pr=2|mg=3');
    expect(through(facility({ merged: 3 }))?.merged).toBe(3);
    expect(codec.pieceOf('v1|facility|underway|c=InProgress|i=0.50|pr=2|mg=0', 'facility')).toBeNull(); // not canonical
  });

  it('asks for the robot form once a PR has merged, and not before', () => {
    expect(codec.facilityLook(facility()).o.form).toBeUndefined();
    expect(codec.facilityLook(facility({ merged: 1 })).o.form).toBe('robot');
  });

  it('carries the form and a pinned progress through the station stage', () => {
    const stage = stations.stationStage('mecha', 'idle', { i: 0.5, pr: 2, form: 'robot' });
    expect(stage).toBe('station.mecha.idle i=0.5 pr=2 form=robot');
    expect(stations.parseStationStage(stage)).toMatchObject({ form: 'robot' });
    expect(stations.parseStationStage('station.mecha.idle tf=0.4')).toMatchObject({ morph: 0.4 });
    expect(stations.parseStationStage('station.mecha.idle tf=7')).toMatchObject({ morph: 1 });
    expect(stations.parseStationStage('station.mecha.idle form=sideways').form).toBeUndefined();
  });
});

describe('the station transformation rigs (stationRig.ts)', () => {
  type RigPose = { model: { parts: unknown[] }; turrets: unknown[]; pd: unknown[]; bays: unknown[]; reactor: unknown[]; groups: { name: string; model: { beacons: unknown[] } | null }[] };
  type Rig = { names: string[]; start: Record<string, number>; span: number; seconds: number; pose(p: 'ship' | 'robot', dir: number): RigPose };
  it.each([['mecha', 'mechaStation.ts', 'MECHA_RIG'], ['trek', 'trekStation.ts', 'TREK_RIG']] as const)('%s: every piece is timed, in both forms, with its axis beacons', async (_f, file, name) => {
    const rig = (await load<Record<string, Rig>>(`chart/art/${file}`))[name]!;
    for (const n of rig.names) expect(rig.start[n], n).toBeGreaterThanOrEqual(0);
    expect(Math.max(...rig.names.map((n) => rig.start[n]!)) + rig.span).toBeLessThanOrEqual(1.0001);
    for (const form of ['ship', 'robot'] as const) {
      const p = rig.pose(form, 1);
      expect(p.groups.map((g) => g.name)).toEqual(rig.names);
      expect(p.turrets.length).toBe(3);
      expect(p.pd.length).toBe(3);
      expect(p.bays.length).toBe(4);
      for (const g of p.groups) if (g.model) expect(g.model.beacons.length, `${form} ${g.name}`).toBe(3); // origin, fore, aft
    }
    // The second form has every piece; the first may lack some, which then grow out of its origin.
    expect(rig.pose('robot', 1).groups.every((g) => g.model)).toBe(true);
    expect(rig.pose('ship', 1).groups.some((g) => g.model)).toBe(true);
  });
});
