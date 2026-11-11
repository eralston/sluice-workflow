// An objective as an asteroid (13 §4.2): its material from its seed, carved, wrapped in a catwalk and
// landed up the ladder, with its steps as plates strapped in fixed sockets. Painted (celestial), so it scales with the
// world; formation members keep the 12 px hit floor (D12, VC-3).
import { encodePiece } from '@shared/engine/stageCode';
import type { Signal } from '@shared/engine/types';
import { asteroidMaterial } from '../../../chart/art/asteroids';
import { makeAsteroidView } from '../../../chart/art/asteroidAtlas';
import type { AssetDef } from '../../../chart/assets/types';
import type { CycleStep } from '../../../gallery/types';
import { objectiveLook, pieceOf } from '../stageCodec';
import { carve, ghost, rig, victory } from './acts';
import { AdaptedView, NO_VIEWER, sampleKey, sampleNode, samplePiece } from './adapt';

/** The ladder an objective climbs, with the steps it typically has at each (as the art's gallery). */
const LADDER: [string, Signal, ('n' | 'a' | 'c')[]][] = [
  ['sketch', { rung: 'ready', sketch: true }, ['n', 'n', 'n']],
  ['ready', { rung: 'ready' }, ['n', 'n', 'n']],
  ['deferred', { rung: 'ready', deferred: true }, ['n', 'n']],
  ['underway', { rung: 'underway' }, ['c', 'a', 'n']],
  ['nearing', { rung: 'nearing', step: 0.3 }, ['c', 'c', 'a']],
  ['nearing, accepting', { rung: 'nearing', step: 0.65 }, ['c', 'c', 'c']],
  ['accomplished', { rung: 'accomplished' }, []],
  ['off', { rung: 'off', ghost: true }, []],
  ['unknown', { rung: 'off', unknown: true }, []],
];

export const objectiveAsset: AssetDef = {
  id: 'asteroid',
  layer: 'celestial',
  // It overlays its seat's planet, so it draws over it wherever it sits on the disc.
  over: true,
  moving: true, framed: true, flare: true, body: true,
  hitFloorPx: 12,
  rank: 3,
  // Its story or bug on a holo plate (19 L1): the title over `{type} #{id} · {state}`, beside the piece. T2.
  label: { frame: 'chamfer', variant: 'subtitle', layout: 'horizontal', tier: 'door' },
  // `contact` (2026-10-13): arriving, it shows as its radar outline, then resolves into its own look.
  // `carve`, `rig`, `ghost` (22 C3, M-25): the change shown as it happens, over its maneuver's act.
  acts: ['contact', 'carve', 'rig', 'ghost', 'victory'],
  make(node) {
    const material = asteroidMaterial(node.seed);
    const view = makeAsteroidView(node.world.r, node.seed, material);
    const r = node.world.r;
    return new AdaptedView(view, (stage) => objectiveLook(pieceOf(stage, 'objective'), material), {
      contact: (art) => art.contact(), carve: () => carve(r), rig: () => rig(r), ghost: () => ghost(r), victory: (art) => victory(art),
    });
  },
  samples() {
    const steps: CycleStep[] = LADDER.map(([label, signal, s]) => ({
      label, stage: encodePiece(samplePiece('objective', signal, { steps: s })), rung: signal.unknown ? null : signal.rung,
    }));
    // Seeds 0, 1 and 2 give the three materials (asteroidMaterial is seed mod 3).
    return [3, 1, 2].map((seed) => ({
      id: `objective-${asteroidMaterial(seed)}`,
      title: `objective · ${asteroidMaterial(seed)}`,
      note: 'Every rung, with its steps as augmentations',
      make: () => objectiveAsset.make(sampleNode({ key: sampleKey.item(100 + seed), kind: 'objective', asset: 'objective', seed, r: 36 }), NO_VIEWER),
      stage: steps[0]!.stage,
      cycle: steps,
    }));
  },
};
