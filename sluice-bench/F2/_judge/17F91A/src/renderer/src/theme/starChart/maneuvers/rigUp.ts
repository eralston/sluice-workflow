// Rig up (13 §6, rule `objective.nearing`): the captain works the asteroid while scaffolds and rigs
// assemble round it, and the stations its work goes to haul supplies in. It flares violet with gold
// creeping in as the mining superstructure lands.
import { RULE } from '@shared/engine/pace';
import { NEARING, SUCCESS } from '../../../chart/art/progress';
import { cmd, one, phaseMs, sortie, crewHoldMs } from '../../../chart/fx/commands';
import { TRACTOR } from '../../../chart/fx/timing';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { haul } from './haul';

export const rigUp: ManeuverDef = {
  id: RULE.objectiveNearing,
  title: 'Rig up',
  phase: {
    gather: (c, m) => {
      const s = one(c, 'subject');
      const a = one(c, 'agent');
      if (!s || !a || a.gone) return [];
      return [sortie(a, s, phaseMs(m, 'gather'), crewHoldMs(m), phaseMs(m, 'echo') + 600, 0, one(c, 'seat'))];
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const a = one(c, 'agent');
      const act = phaseMs(m, 'act');
      const calls: CommandCall[] = [cmd.act(s.key, 'rig')];
      if (a && !a.gone) calls.push(cmd.tractor({ from: a.at, to: s.at, toR: s.node.world.r, color: TRACTOR, durS: act / 1000 }));
      calls.push(cmd.ring({ at: s.at, r: s.node.world.r * 1.5, r1: s.node.world.r * 1.05, color: NEARING, durS: act / 1000, alpha: 0.5 }));
      return [...calls, ...haul(c, act)];
    },
    echo: (c) => {
      const s = one(c, 'subject');
      if (!s) return [];
      return [cmd.flare({ at: s.at, r: s.node.world.r, color: NEARING, scale: 1.75, linger: 4, sparks: SUCCESS })];
    },
  },
};
