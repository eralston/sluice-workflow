// A threat as an enemy hive ship (13 §4.3): its swarm and hostile colourway from its seed, engaged up
// the ladder, its steps as its weapon pods, a deadly-red aura on every live ship, a ruin cloud at rest once defeated.
// Hardware: crisp, with a vessel's screen floor. Its moments (emerging, breakup, warp) are acts.
import { LABEL_PX } from '@shared/scene/sizing';
import { encodePiece } from '@shared/engine/stageCode';
import type { Signal } from '@shared/engine/types';
import { HiveShipView, hiveDesign, SWARMS } from '../../../chart/art/swarm';
import type { AssetDef } from '../../../chart/assets/types';
import type { CycleStep } from '../../../gallery/types';
import { pieceOf, THREAT_ACTS, threatLook } from '../stageCodec';
import { engage, victory } from './acts';
import { type Act, AdaptedView, NO_VIEWER, sampleKey, sampleNode, samplePiece } from './adapt';

const LADDER: [string, Signal, ('n' | 'a' | 'c')[]][] = [
  ['sketch', { rung: 'ready', sketch: true }, ['n', 'n', 'n']],
  ['ready', { rung: 'ready' }, ['n', 'n', 'n']],
  ['underway', { rung: 'underway' }, ['a', 'a', 'n']],
  ['nearing', { rung: 'nearing', step: 0.3 }, ['c', 'c', 'a']],
  ['accomplished (research platform)', { rung: 'accomplished' }, []],
  ['off', { rung: 'off', ghost: true }, []],
  ['off, struck', { rung: 'off', ghost: true, strike: true }, []],
];

/** The swarm key a seed picks. */
const swarmOf = (seed: number) => SWARMS[hiveDesign(seed).style]!.key;

export const threatAsset: AssetDef = {
  id: 'hive',
  layer: 'infrastructure',
  moving: true, framed: true, flare: true, body: true,
  floorPx: LABEL_PX * 0.3, hitFloorPx: 12, // sizing.ts' threat floor (W4-T2: the board fits at its fit scale)
  rank: 3,
  // Its story or bug on a holo plate (19 L1): the title over `{type} #{id} · {state}`, beside the piece. T2.
  label: { frame: 'chamfer', variant: 'subtitle', layout: 'horizontal', tier: 'door' },
  // Its moments, and `engage` (22 C3, M-25): shields flaring, guns waking, over its maneuver's act.
  acts: [...Object.keys(THREAT_ACTS), 'engage', 'victory'],
  // Leaving the region (moved out of the sprint), it backs into a closing rift, about a second.
  departAct: 'retreat', departS: 1.05,
  make(node) {
    const swarm = swarmOf(node.seed);
    const look = (stage: string) => threatLook(pieceOf(stage, 'threat'), swarm);
    const acts: Record<string, Act<HiveShipView>> = {};
    for (const [name, moment] of Object.entries(THREAT_ACTS)) acts[name] = (art, stage) => art.setStage(threatLook(pieceOf(stage, 'threat'), swarm, moment));
    acts.engage = () => engage(node.world.r);
    acts.victory = (art) => victory(art);
    // The node's r is the ship's half-length, as a captain's is (13 §4.5: about the same footprint).
    return new AdaptedView(new HiveShipView(hiveDesign(node.seed), 2 * node.world.r), look, acts);
  },
  samples() {
    const steps: CycleStep[] = LADDER.map(([label, signal, s]) => ({
      label, stage: encodePiece(samplePiece('threat', signal, { steps: s })), rung: signal.rung,
    }));
    // Seeds 0, 1 and 2 give the three swarms (hiveDesign's style is seed mod 3).
    return [0, 1, 2].map((seed) => ({
      id: `threat-${swarmOf(seed)}`,
      title: `threat · ${swarmOf(seed)}`,
      note: 'Every rung, with its steps as weapon pods',
      wide: true,
      make: () => threatAsset.make(sampleNode({ key: sampleKey.item(200 + seed), kind: 'threat', asset: 'threat', seed, r: 52 }), NO_VIEWER),
      stage: steps[0]!.stage,
      cycle: steps,
    }));
  },
};
