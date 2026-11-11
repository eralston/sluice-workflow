// 17 W2-T4 — the command and maneuver registries (14 §2.8). Every seed command has a reduced-motion
// substitute (INV-20) and the v0 director's weights and tiers; every engine rule id in pace.ts has a
// choreography in the Star Chart theme, whose phases are ones the rule plays. The renderer modules
// sit outside this project's tsconfig, so they're loaded by a runtime path (as signal.test.ts does)
// and typed here by the slice of their shapes the checks read.
import { resolve } from 'node:path';
import { GEOMETRY } from '@shared/engine/solar/version';
import { describe, expect, it } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import { PHASES, type Phase, type PhaseSpan, type PlannedManeuver } from '@shared/contracts/maneuver';
import { PACE_RULES, RULE } from '@shared/engine/pace';

interface Def { name: string; tier: string; weight: number; cuttable: boolean; clock: string; moves?: boolean; reduced: unknown }
interface Call { cmd: string; args: unknown; delayMs?: number }
interface Maneuver { id: string; title: string; phase: Partial<Record<Phase, unknown>> }
interface CommandsModule {
  SEED_COMMANDS: readonly Def[];
  allCommands(): Def[];
  commandByName(name: string): Def | undefined;
  registerCommand(def: Def): void;
  resetCommands(): void;
  reducedCall(def: Def, c: Call, host: { px(): number; stage(): { releaseEdge(k: string): void } }): Call | null;
  phaseMs(m: Pick<PlannedManeuver, 'phases'>, p: Phase): number;
  phaseAtMs(m: Pick<PlannedManeuver, 'phases'>, p: Phase): number;
}
interface RegistryModule {
  installTheme(t: { maneuvers: Maneuver[]; commands: Def[] }): void;
  maneuverFor(id: string): Maneuver | undefined;
  allManeuvers(): Maneuver[];
}

const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
const commands = await load<CommandsModule>('chart/fx/commands.ts');
const registry = await load<RegistryModule>('chart/fx/v1/registry.ts');
const { maneuvers } = await load<{ maneuvers: Maneuver[] }>('theme/starChart/maneuvers/index.ts');

const SEEDS = ['flare', 'ring', 'ink', 'spark', 'tractor', 'support', 'pursue', 'hold', 'protect', 'insignia'];

describe('seed commands', () => {
  it('are the ten 17 W2-T4 names, once each', () => {
    expect(commands.SEED_COMMANDS.map((d) => d.name).sort()).toEqual([...SEEDS].sort());
    expect(commands.allCommands().map((d) => d.name)).toEqual([...SEEDS].sort());
  });

  it('every command has a reduced-motion substitute that resolves (INV-20)', () => {
    for (const d of commands.allCommands()) {
      const r = d.reduced;
      if (typeof r === 'string') expect(['same', 'ring', 'snap', 'skip'], d.name).toContain(r);
      else {
        expect(r, d.name).toMatchObject({ use: expect.any(String) });
        expect(commands.commandByName((r as { use: string }).use), d.name).toBeDefined();
      }
    }
  });

  it('carry the v0 director’s tiers, weights, budget and clocks', () => {
    const by = Object.fromEntries(commands.SEED_COMMANDS.map((d) => [d.name, d]));
    for (const d of commands.SEED_COMMANDS) {
      expect(['essential', 'narrative', 'ornament'], d.name).toContain(d.tier);
      expect(['travel', 'accent'], d.name).toContain(d.clock);
      expect(d.weight, d.name).toBeGreaterThanOrEqual(0);
    }
    expect([by.flare!.weight, by.pursue!.weight, by.tractor!.weight, by.support!.weight, by.ink!.weight, by.spark!.weight, by.ring!.weight])
      .toEqual([1, 1.5, 1, 1, 0.5, 0.5, 0.25]);
    expect([by.hold!.weight, by.protect!.weight]).toEqual([0, 0]);
    // Continuity (05 §5): moves, lines, beams and protects are never cut.
    for (const n of ['pursue', 'hold', 'ink', 'tractor', 'support', 'protect']) expect(by[n]!.cuttable, n).toBe(false);
    for (const n of ['flare', 'ring', 'spark', 'insignia']) expect(by[n]!.cuttable, n).toBe(true);
    expect(SEEDS.filter((n) => by[n]!.moves)).toEqual(['pursue', 'hold']);
    expect([by.pursue!.tier, by.hold!.tier, by.protect!.tier, by.insignia!.tier]).toEqual(['essential', 'essential', 'essential', 'ornament']);
  });

  it('reduced motion: ring substitutes sit where the effect was; skip and snap play nothing', () => {
    const released: string[] = [];
    const host = { px: () => 0.5, stage: () => ({ releaseEdge: (k: string) => released.push(k) }) };
    const flare = commands.commandByName('flare')!;
    const ring = commands.reducedCall(flare, { cmd: 'flare', args: { at: [3, 4], r: 10, color: 7 }, delayMs: 200 }, host);
    expect(ring).toEqual({ cmd: 'ring', args: { at: [3, 4], r: 12, r1: 12, color: 7, durS: 0.9, alpha: 0.9 }, delayMs: 200 });
    expect(commands.reducedCall(commands.commandByName('spark')!, { cmd: 'spark', args: {} }, host)).toBeNull();
    expect(commands.reducedCall(commands.commandByName('ink')!, { cmd: 'ink', args: { edge: 'e1' } }, host)).toBeNull();
    expect(released).toEqual(['e1']); // a held edge shows at once instead of being revealed
    const hold = { cmd: 'hold', args: { pk: 'p', durS: 1 } };
    expect(commands.reducedCall(commands.commandByName('hold')!, hold, host)).toBe(hold);
  });

  it('a theme overrides a command by name, and installing another theme restores the seeds', () => {
    const quiet: Def = { ...commands.commandByName('spark')!, weight: 9 };
    registry.installTheme({ maneuvers: [], commands: [quiet] });
    expect(commands.commandByName('spark')!.weight).toBe(9);
    registry.installTheme({ maneuvers, commands: [] });
    expect(commands.commandByName('spark')!.weight).toBe(0.5);
  });

  it('the Star Chart theme’s own commands have a reduced-motion substitute that resolves too (INV-20)', async () => {
    const { commands: themed } = await load<{ commands: Def[] }>('theme/starChart/commands.ts');
    const { entranceCommands } = await load<{ entranceCommands: Def[] }>('theme/starChart/entrance.ts');
    registry.installTheme({ maneuvers, commands: [...themed, ...entranceCommands] });
    try {
      expect(themed.length + entranceCommands.length).toBeGreaterThan(0);
      for (const d of [...themed, ...entranceCommands]) {
        expect(['essential', 'narrative', 'ornament'], d.name).toContain(d.tier);
        const r = d.reduced;
        if (typeof r === 'string') expect(['same', 'ring', 'snap', 'skip'], d.name).toContain(r);
        else expect(commands.commandByName((r as { use: string }).use), d.name).toBeDefined();
      }
    } finally {
      registry.installTheme({ maneuvers, commands: [] });
    }
  });
});

describe('maneuvers', () => {
  it('every rule id in pace.ts has a ManeuverDef in the Star Chart theme', () => {
    const ids = new Set(maneuvers.map((m) => m.id));
    for (const r of PACE_RULES) expect(ids.has(r.id), r.id).toBe(true);
    expect([...ids].sort()).toEqual(Object.values(RULE).sort());
    expect(maneuvers.length).toBe(ids.size); // one per rule
  });

  it('each choreography only fills phases its rule plays, and has a title', () => {
    for (const m of maneuvers) {
      const rule = PACE_RULES.find((r) => r.id === m.id)!;
      const plays = new Set(rule.phases.map((p) => p.phase));
      for (const p of Object.keys(m.phase) as Phase[]) {
        expect(PHASES, `${m.id} ${p}`).toContain(p);
        expect(plays.has(p), `${m.id} fills ${p}, which ${rule.id} never plays`).toBe(true);
      }
      expect(m.title.length, m.id).toBeGreaterThan(0);
    }
  });

  it('the registry fills from the theme', () => {
    registry.installTheme({ maneuvers, commands: [] });
    for (const r of PACE_RULES) expect(registry.maneuverFor(r.id)?.id).toBe(r.id);
    expect(registry.allManeuvers().length).toBe(maneuvers.length);
  });

  it('phase helpers read the planned spans', () => {
    const phases: PhaseSpan[] = [{ phase: 'tell', atMs: 0, durMs: 300 }, { phase: 'act', atMs: 300, durMs: 900 }];
    expect(commands.phaseMs({ phases }, 'act')).toBe(900);
    expect(commands.phaseMs({ phases }, 'land')).toBe(0);
    expect(commands.phaseAtMs({ phases }, 'act')).toBe(300);
    expect(commands.phaseAtMs({ phases }, 'land')).toBe(1200); // absent: where the last one ends
  });
});

// ---- The interpreter, on a stub scene with recording commands ----

interface Fx { kind: 'travel' | 'accent'; update(dt: number): boolean; destroy(): void; grand?: boolean }
interface Interpreter {
  queue(ctx: unknown): void; update(dtMs: number, s: number, frozen: boolean): void; clear(): void;
  tell(ctx: unknown, i: number, leadS: number): void; activeCount(): number; volatility(): number;
  census(): Record<string, number>; bias: number;
}
const { ManeuverInterpreter } = await load<{ ManeuverInterpreter: new (host: unknown) => Interpreter }>('chart/fx/v1/interpreter.ts');
const { motion } = await load<{ motion: { reduced: boolean; travel: number; pulse: number } }>('chart/art/motion.ts');

type N = { projectionKey: string; canonicalKey: string; kind: string; world: { x: number; y: number; r: number }; selectable: boolean; stage: string };
const node = (pk: string, key: string, kind: string, x: number): N => ({ projectionKey: pk, canonicalKey: key, kind, world: { x, y: 0, r: 20 }, selectable: true, stage: 's' });

/**
 * A scene stub: the GraphScene calls the interpreter makes, logged with the time they happened.
 * `nodes` is the scene after the beat; every one of them has a new look pending.
 */
function stubScene(nodes: N[], clock: { ms: number }) {
  const log: string[] = [];
  const at = (s: string) => log.push(`${Math.round(clock.ms)} ${s}`);
  const pending = new Set(nodes.map((n) => n.projectionKey));
  const scene = {
    log,
    targetNodes: () => nodes, effectiveNodes: () => nodes,
    solarBoard: () => null,
    hasView: (pk: string) => nodes.some((n) => n.projectionKey === pk),
    liveOf: (pk: string) => { const n = nodes.find((x) => x.projectionKey === pk); return n ? [n.world.x, n.world.y] : null; },
    goalOf: (pk: string) => scene.liveOf(pk),
    claimStage: (pk: string) => { at(`claim ${pk}`); return pending.delete(pk); },
    landStage: (pk: string) => at(`land ${pk}`),
    freeze: (pk: string) => at(`freeze ${pk}`), thaw: (pk: string) => at(`thaw ${pk}`),
    own: () => {}, release: () => {}, placeAt: () => {}, faceView: () => {}, restoreFacing: () => {}, fadeView: () => {},
    holdEdge: () => {}, releaseEdge: () => {},
    freezeGuide: (id: string, _g: unknown, pks: string[]) => at(`freezeGuide ${id} ${pks.join(',')}`),
    thawGuide: (id: string, pks: string[]) => at(`thawGuide ${id} ${pks.join(',')}`),
    releaseAllEdges: () => at('releaseAllEdges'), thawAll: () => at('thawAll'), landAllStages: () => at('landAllStages'), endJumps: () => at('endJumps'), markJump: () => {}, takeJump: () => false,
    fxLayer: () => ({ addChild: () => {} }), currentScale: () => 1, glidingCount: () => 0,
    currentGraph: () => ({ sceneKey: 'pod:x' }),
  };
  return scene;
}

/** Seed commands replaced by recorders: each logs its name (and a pk or grand flag) when made. */
function recordCommands(log: string[], clock: { ms: number }) {
  for (const d of commands.SEED_COMMANDS) {
    commands.registerCommand({
      ...d,
      make: (_h: unknown, a: { pk?: string; grand?: boolean; durS?: number }) => {
        log.push(`${Math.round(clock.ms)} cmd ${d.name}${a?.pk ? ` ${a.pk}` : ''}${a?.grand ? ' grand' : ''}`);
        let t = 0;
        const fx: Fx = { kind: 'accent', update: (dt) => (t += dt) < (a?.durS ?? 0.5), destroy: () => {} };
        return fx;
      },
    } as Def);
  }
}

const rule = (id: string) => PACE_RULES.find((r) => r.id === id)!;
const planned = (id: string, eventKey: string, cast: PlannedManeuver['cast'], afterMs = 0, protect = false): PlannedManeuver => {
  const phases = rule(id).phases;
  const durationMs = phases.reduce((e, p) => Math.max(e, p.atMs + p.durMs), 0);
  const keys = [...new Set(Object.values(cast).flat())].sort();
  return {
    id, eventKey, seed: 7, cast, phases, afterMs, durationMs, keys,
    ...(protect ? { protect: { keys: [...new Set([...(cast.subject ?? []), ...(cast.agent ?? [])])].sort(), windowMs: durationMs } } : {}),
    to: { rung: 'accomplished' },
  };
};

/** `nodes` is the scene after the beat; `was` the one before it (the same unless something left). */
function rig(nodes: N[], was: N[] = nodes) {
  const clock = { ms: 0 };
  const scene = stubScene(nodes, clock);
  recordCommands(scene.log, clock);
  const host = { scene: () => scene, hierarchy: () => ({}), worldToScreen: (x: number, y: number) => ({ x, y }), labelHost: null, onGo: () => {}, flashLabel: () => {} };
  const fx = new ManeuverInterpreter(host);
  const run = (ms: number) => { for (let t = 0; t < ms; t += 20) { clock.ms += 20; fx.update(20, 20, false); } };
  const ctx = (maneuvers: PlannedManeuver[]) => ({ plan: [], history: {}, snapshot: {}, before: { graph: { nodes: was }, nodes: was }, after: { sceneKey: 'pod:x', nodes }, maneuvers });
  return { clock, scene, fx, run, ctx };
}

const A = 'id:org:a' as CanonicalKey;
const WI1 = 'wi:org:1' as CanonicalKey;
const WI2 = 'wi:org:2' as CanonicalKey;
const WI3 = 'wi:org:3' as CanonicalKey;
const BOARD = [node('seat|a', A, 'seat', 0), node('ship|a', A, 'captain', 60), node('obj|1', WI1, 'objective', 120), node('obj|2', WI2, 'objective', 200)];
/** After a landing: projectSolar draws an Accomplished objective no more (it's counted on its seat). */
const LANDED = BOARD.filter((n) => n.projectionKey !== 'obj|1');
const LAND = { subject: [WI1], agent: [A], seat: [A] };
const time = (log: string[], s: string) => Number(log.find((l) => l.endsWith(s))?.split(' ')[0] ?? NaN);

describe('the ManeuverInterpreter', () => {
  it('plays a protected landing against where the landed piece was: protect first, phases on time, the seat lands with the flare', () => {
    registry.installTheme({ maneuvers, commands: [] });
    const { fx, run, ctx, scene } = rig(LANDED, BOARD);
    fx.queue(ctx([planned(RULE.objectiveAccomplish, 'e1', LAND, 0, true)]));
    run(4000);
    const log = scene.log;
    // The protect freezes the person's views (the landed asteroid is drawn no more) before anything moves.
    expect(log.some((l) => l.includes('cmd protect'))).toBe(false); // made by the runner, which keeps its actors
    expect(log.filter((l) => l.startsWith('20 freeze')).map((l) => l.split(' ')[2]).sort()).toEqual(['seat|a', 'ship|a']);
    // The seat's new look (its megastructure count) is claimed at once, not left to show in 2 frames.
    expect(time(log, 'claim seat|a')).toBe(20);
    expect(log.some((l) => l.endsWith('claim obj|1'))).toBe(false);
    // landing: tell 300, gather 400, act 800, land 1200 (the slide, 22 C3), echo 400 → the gather at 300,
    // act at 700, the land (the swap, the glide) at 1500, the blossom at 2700.
    expect(time(log, 'cmd pursue ship|a')).toBeGreaterThanOrEqual(300);
    expect(time(log, 'cmd pursue ship|a')).toBeLessThan(340);
    expect(time(log, 'cmd tractor')).toBeGreaterThanOrEqual(700);
    expect(time(log, 'cmd spark')).toBeGreaterThanOrEqual(1500); // the glide's streak
    // The seat's new look comes in with the blossom, as the slide ends.
    expect(time(log, 'land seat|a')).toBeGreaterThanOrEqual(2700);
    expect(time(log, 'land seat|a')).toBeLessThan(2740);
    expect(time(log, 'cmd flare grand')).toBe(time(log, 'land seat|a'));
    // The window ends with the maneuver (3.4 s), and the cast thaws.
    expect(time(log, 'thaw ship|a')).toBeGreaterThanOrEqual(3400);
    expect(time(log, 'thaw ship|a')).toBeLessThan(3500);
  });

  it('a strike run holds the subject\'s new look for the land and the seat\'s (its research count) for the blossom (22 C3)', () => {
    registry.installTheme({ maneuvers, commands: [] });
    const board = [...BOARD, node('thr|3', WI3, 'threat', 260)];
    const { fx, run, ctx, scene } = rig(board);
    fx.queue(ctx([planned(RULE.threatAccomplish, 'e4', { subject: [WI3], agent: [A], seat: [A] }, 0, true)]));
    run(4500);
    const log = scene.log;
    const landAt = commands.phaseAtMs({ phases: rule(RULE.threatAccomplish).phases }, 'land');
    const blossomAt = commands.phaseAtMs({ phases: rule(RULE.threatAccomplish).phases }, 'echo');
    expect(time(log, 'claim thr|3')).toBe(20);
    expect(time(log, 'claim seat|a')).toBe(20);
    // The hulk swaps as the land starts, under the explosion (22 C3); the seat's look comes with the blossom.
    for (const [pk, t] of [['thr|3', landAt], ['seat|a', blossomAt]] as const) {
      expect(time(log, `land ${pk}`), pk).toBeGreaterThanOrEqual(t);
      expect(time(log, `land ${pk}`), pk).toBeLessThan(t + 40);
    }
    expect(time(log, 'cmd flare grand')).toBe(time(log, 'land seat|a'));
    // A member of the cast the beat didn't change has nothing to claim, so nothing is held back.
    expect(log.some((l) => l.endsWith('claim ship|a'))).toBe(false);
  });

  it('a seat two maneuvers share lands at the protected moment\'s land, once', () => {
    const { fx, run, ctx, scene } = rig(LANDED, BOARD);
    fx.queue(ctx([
      // Someone else's work on the same seat: its actors aren't held, so it plays at once.
      planned(RULE.objectiveUnderway, 'e0', { subject: [WI2], agent: ['id:org:b' as CanonicalKey], seat: [A] }, 0),
      planned(RULE.objectiveAccomplish, 'e1', LAND, 1000, true),
    ]));
    run(5000);
    // The underway's look lands as its act ends (2000); the landing's land is later (1000 + 1500).
    const lands = scene.log.filter((l) => l.endsWith('land seat|a')).map((l) => Number(l.split(' ')[0]));
    expect(lands.length).toBe(1);
    expect(lands[0]).toBeGreaterThanOrEqual(2500);
    expect(lands[0]).toBe(time(scene.log, 'cmd flare grand'));
    expect(time(scene.log, 'land obj|2')).toBeLessThan(2100);
  });

  it('light work waits for a protect that holds its actors; unrelated work plays alongside', () => {
    const { fx, run, ctx, scene } = rig(LANDED, BOARD);
    fx.queue(ctx([
      planned(RULE.objectiveAccomplish, 'e1', LAND, 0, true),
      planned(RULE.agentLight, 'e2', { subject: [WI2], agent: [A] }, 0),
    ]));
    run(5000);
    const pursues = scene.log.filter((l) => l.endsWith('cmd pursue ship|a')).map((l) => Number(l.split(' ')[0]));
    // The landing's sortie at 300 ms; the light sortie only once the 3.1 s window is over (+ its gather 0).
    expect(pursues[0]).toBeLessThan(340);
    expect(pursues[1]).toBeGreaterThanOrEqual(3100);
  });

  it('a reassigned piece keeps its part in the frontier belt as before the beat until it flies (19 S2)', () => {
    registry.installTheme({ maneuvers, commands: [] });
    const B = 'id:org:b' as CanonicalKey;
    const board = [...BOARD, node('seat|b', B, 'seat', 300)];
    const { fx, run, ctx, scene } = rig(board);
    // The last unassigned piece taken by b: from the frontier (null) to b's seat.
    fx.queue(ctx([planned(RULE.pieceReseat, 'e5', { subject: [WI2], agent: [B], fromSeat: [], toSeat: [B], frontier: [WI2] }, 0)]));
    run(2600);
    const actAt = commands.phaseAtMs({ phases: rule(RULE.pieceReseat).phases }, 'act');
    // Held from the beat, only for its subject; let go as its act (the flight) starts, not before.
    expect(time(scene.log, 'freezeGuide solar obj|2')).toBe(20);
    expect(time(scene.log, 'thawGuide solar obj|2')).toBeGreaterThanOrEqual(actAt);
    expect(time(scene.log, 'thawGuide solar obj|2')).toBeLessThan(actAt + 40);
    expect(time(scene.log, 'cmd pursue obj|2')).toBe(time(scene.log, 'thawGuide solar obj|2'));
  });

  it('under reduced motion, moves and beams are skipped and flares become rings; looks still land', () => {
    motion.reduced = true;
    try {
      const { fx, run, ctx, scene } = rig(LANDED, BOARD);
      fx.queue(ctx([planned(RULE.objectiveAccomplish, 'e1', LAND, 0, true)]));
      run(4000);
      const made = scene.log.filter((l) => l.includes(' cmd ')).map((l) => l.split(' ')[2]);
      expect(made).not.toContain('pursue');
      expect(made).not.toContain('tractor');
      expect(made).not.toContain('spark');
      expect(made).not.toContain('flare');
      expect(made).toContain('ring');
      expect(time(scene.log, 'land seat|a')).toBeGreaterThanOrEqual(1500);
    } finally {
      motion.reduced = false;
    }
  });

  it('clear() cancels what is pending and releases edges, thaws and lands every stage (INV-15)', () => {
    const { fx, run, ctx, scene } = rig(LANDED, BOARD);
    fx.queue(ctx([planned(RULE.objectiveAccomplish, 'e1', LAND, 0, true)]));
    run(400);
    expect(fx.activeCount()).toBeGreaterThan(0);
    fx.clear();
    expect(fx.activeCount()).toBe(0);
    expect(scene.log.slice(-4).map((l) => l.split(' ')[1])).toEqual(['releaseAllEdges', 'thawAll', 'landAllStages', 'endJumps']);
    const n = scene.log.length;
    run(3000);
    expect(scene.log.slice(n).filter((l) => l.includes(' cmd ') || l.includes(' land '))).toEqual([]);
  });

  it('volatility gates tiers: when overloaded only essential commands play (ignoring Maximum)', () => {
    const { fx, run, ctx, scene } = rig(LANDED, BOARD);
    fx.bias = 20;
    fx.queue(ctx([planned(RULE.objectiveAccomplish, 'e1', LAND, 0, true)]));
    run(4000);
    const made = scene.log.filter((l) => l.includes(' cmd ')).map((l) => l.split(' ').slice(2).join(' '));
    expect(made).toContain('pursue ship|a'); // a move is essential (continuity)
    expect(made).toContain('flare grand'); // so is the completion flare
    expect(made).not.toContain('tractor');
    expect(made).not.toContain('ring');
  });

  it('a rule without a choreography still lands its look, with a plain ring', () => {
    registry.installTheme({ maneuvers: maneuvers.filter((m) => m.id !== RULE.objectiveUnderway), commands: [] });
    try {
      const { fx, run, ctx, scene } = rig(BOARD);
      fx.queue(ctx([planned(RULE.objectiveUnderway, 'e3', { subject: [WI2], agent: [A] })]));
      run(3000);
      // objective.underway: tell 300, gather 500, act 1200 → its look lands as the act ends (2000).
      expect(time(scene.log, 'land obj|2')).toBeGreaterThanOrEqual(2000);
      expect(time(scene.log, 'cmd ring')).toBe(time(scene.log, 'land obj|2'));
    } finally {
      registry.installTheme({ maneuvers, commands: [] });
    }
  });

  it('an attachment that leaves its facility this beat (a merge, a settle) resolves from the before board\'s slot, on the facility the scene still draws (23 F-leftovers)', () => {
    const FAC = 'fac|1';
    const PR = 'pr:org:r:1' as CanonicalKey;
    const station = (compound?: unknown): N & { compound?: unknown } => ({ ...node(FAC, 'repo:org:r' as CanonicalKey, 'facility', 100), ...(compound ? { compound } : {}) });
    const withSlot = station({ slots: [{ key: PR, role: 'attachment', angle: 0, dist: 40 }] });
    const bare = station();
    const { fx, scene } = rig([bare], [withSlot]);
    const internals = fx as unknown as { viewOf(sc: unknown, now: N[], ctx: unknown, role: string, key: string): { node: N; at: () => readonly number[] | null; host?: { node: N }; gone?: boolean } | null };
    const ctx = { before: { nodes: [withSlot] } };
    const v = internals.viewOf(scene, scene.targetNodes(), ctx, 'attachment', PR);
    expect(v).not.toBeNull();
    expect(v!.gone).toBeUndefined();
    expect(v!.host?.node.projectionKey).toBe(FAC); // drawn by the facility the scene holds
    expect(v!.at()![0]).toBeCloseTo(100 + 40 * (20 / GEOMETRY.facilityR), 6); // where it sat in the station (scaled to its drawn size), from the station's place now
    expect(v!.at()![1]).toBeCloseTo(0, 6);
    // Not in any slot, here or before: still unresolved (a stray key is not invented).
    expect(internals.viewOf(scene, scene.targetNodes(), ctx, 'attachment', 'pr:org:r:9')).toBeNull();
  });
});

// ---- 27 E1: value per cost replaces P-9's command rule ----

const timing = await load<{
  CALM: number; BUSY: number; OVERLOAD: number;
  muteFloor(v: number, ignoreLoad: boolean, ornament?: boolean): number;
  valuePerCost(value: number, weight: number): number;
}>('chart/fx/timing.ts');
const calls = await load<{ cmd: Record<string, (args: unknown, delayMs?: number) => Call>; repeats(c: Call): Call & { value?: number } }>('chart/fx/commands.ts');
const { commands: themed } = await load<{ commands: Def[] }>('theme/starChart/commands.ts');
const { entranceCommands } = await load<{ entranceCommands: Def[] }>('theme/starChart/entrance.ts');
const { finaleCommands } = await load<{ finaleCommands: Def[] }>('theme/starChart/finales.ts');

describe('the mute rule (27 E1)', () => {
  it('value per cost against the floor is exactly P-9\'s old tier rule, for every non-essential command', () => {
    registry.installTheme({ maneuvers, commands: [...themed, ...entranceCommands, ...finaleCommands] });
    try {
      const all = commands.allCommands().filter((d) => d.tier !== 'essential');
      expect(all.length).toBeGreaterThan(8);
      for (const d of all as (Def & { value: number })[]) {
        for (const v of [0, 4.9, 5, 9.9, 10, 15.9, 16, 30]) {
          for (const ignoreLoad of [false, true]) {
            for (const sw of [true, false]) {
              const now = timing.valuePerCost(d.value, d.weight) >= timing.muteFloor(v, ignoreLoad, sw);
              const old = d.tier === 'ornament'
                ? sw && v < timing.CALM
                : ignoreLoad || (v < timing.OVERLOAD && !(v >= timing.BUSY && d.cuttable));
              expect(now, `${d.name} v=${v} ignoreLoad=${ignoreLoad} ornament=${sw}`).toBe(old);
            }
          }
        }
      }
    } finally {
      registry.installTheme({ maneuvers, commands: [] });
    }
  });

  /** One maneuver whose act issues a plain ring now and a repeat ring 200 ms later. */
  const ringPair = (): { maneuvers: Maneuver[] } => ({
    maneuvers: [{
      id: RULE.objectiveUnderway, title: 'Test',
      phase: { act: () => [calls.cmd.ring!({ at: [0, 0], r: 10 }), calls.repeats(calls.cmd.ring!({ at: [0, 0], r: 10 }, 200))] },
    }],
  });
  const ringTimes = (bias: number, motionReduced = false): number[] => {
    registry.installTheme({ ...ringPair(), commands: [] });
    motion.reduced = motionReduced;
    try {
      const { fx, run, ctx, scene } = rig(BOARD);
      fx.bias = bias;
      fx.queue(ctx([planned(RULE.objectiveUnderway, 'e3', { subject: [WI2], agent: [A] })]));
      run(3000);
      return scene.log.filter((l) => l.endsWith('cmd ring')).map((l) => Number(l.split(' ')[0]));
    } finally {
      motion.reduced = false;
      registry.installTheme({ maneuvers, commands: [] });
    }
  };

  it('a repeat is muted between the calm and busy marks, and plays when calm; the plain ring plays in both', () => {
    expect(ringTimes(0)).toHaveLength(2);
    const busyish = ringTimes(6);
    expect(busyish).toHaveLength(1);
    expect(busyish[0]!).toBeLessThan(1200); // the plain one (the repeat would be 200 ms later)
  });

  it('a repeat stays a repeat under reduced motion\'s substitute', () => {
    expect(ringTimes(0, true)).toHaveLength(2);
    expect(ringTimes(6, true)).toHaveLength(1);
  });

  it('Station jump-in issues no beacon, bearing or planet rings; Shuttle tender no tractor', () => {
    const view = (key: string, x: number) => ({ key, node: { world: { x, y: 0, r: 20 }, projectionKey: key, kind: 'x' }, at: [x, 0] });
    const cast = { facility: [view('fac', 100)], agent: [view('ag', 0)], seat: [view('s1', 200), view('s2', 300)] };
    const jump = maneuvers.find((m) => m.title === 'Station jump-in')!.phase as Record<string, (c: unknown, m: unknown) => Call[]>;
    const tender = maneuvers.find((m) => m.title === 'Shuttle tender')!.phase as Record<string, (c: unknown, m: unknown) => Call[]>;
    const m = planned(RULE.facilityEnter, 'e1', { facility: [WI1], agent: [A] });
    const gather = jump.gather!(cast, m);
    expect(gather.filter((c) => c.cmd === 'spark')).toEqual([]);
    expect(gather.filter((c) => c.cmd === 'ring')).toEqual([]); // the blip is the call (27 F2): no fold ring
    expect(gather.find((c) => c.cmd === 'pursue')).toBeDefined();
    expect(jump.land).toBeUndefined(); // the land ring is gone (27 F2)
    const act = tender.act!({ facility: [view('fac', 100)], agent: [view('ag', 0)] }, planned(RULE.attachmentOpen, 'e2', { facility: [WI1], agent: [A] }));
    expect(act.filter((c) => c.cmd === 'tractor')).toEqual([]);
  });
});
