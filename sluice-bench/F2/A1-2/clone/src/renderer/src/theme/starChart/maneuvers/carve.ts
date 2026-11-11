// Carve (13 §6, rule `objective.underway`): the captain flies over and cuts the asteroid's facets with
// its tractor focused to a cutting beam (mining, never weapons fire: 13 §6.1), and it flares blue as
// the carved look lands.
import { RULE } from '@shared/engine/pace';
import { PROGRESS } from '../../../chart/art/progress';
import { cmd, drawnR, one, phaseMs, sortie, crewHoldMs } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

export const carve: ManeuverDef = {
  id: RULE.objectiveUnderway,
  title: 'Carve',
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
      const calls: CommandCall[] = [cmd.act(s.key, 'carve')];
      if (a && !a.gone) calls.push(themeCmd.cutter({ from: a.at, to: s.at, toR: drawnR(s), durS: act / 1000, seed: m.seed }));
      return calls;
    },
    echo: (c) => {
      const s = one(c, 'subject');
      if (!s) return [];
      return [cmd.flare({ at: s.at, r: s.node.world.r, color: PROGRESS, scale: 1.6, linger: 3 })];
    },
  },
};
