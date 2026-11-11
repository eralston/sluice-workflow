// Captain jump (13 §6), as the light rule `agent.light`: a captain at work on a change nothing else
// plays. Their ship jumps over beside the work, holds it in the tractor beam, and flies back; at higher
// activity the other person in the change lends a beam too. A hive ship is an enemy, never held in a
// tractor: it takes a short burst of bolts instead (13 §6.1, 2026-10-13). Work on an attachment is
// aimed at its station, never at the tender (2026-10-12). Ornament: gated by the activity level and
// the load. (A captain's reassignment between regions is the scene's own departure and arrival.)
import { RULE } from '@shared/engine/pace';
import { aimOf, cmd, drawnR, one, phaseMs, present, sortie } from '../../../chart/fx/commands';
import { TRACTOR } from '../../../chart/fx/timing';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { burst } from '../commands';

export const captainJump: ManeuverDef = {
  id: RULE.agentLight,
  title: 'Captain jump',
  phase: {
    gather: (c, m) => {
      const v = one(c, 'subject');
      const s = v && aimOf(v);
      const a = one(c, 'agent');
      if (!s || s.gone || !a || a.gone) return [];
      return [sortie(a, s, phaseMs(m, 'gather'), phaseMs(m, 'act'), 600, 0, one(c, 'seat'))];
    },
    act: (c, m) => {
      const v = one(c, 'subject');
      const s = v && aimOf(v);
      if (!s || s.gone) return [];
      const durS = phaseMs(m, 'act') / 1000;
      const calls: CommandCall[] = [];
      [...present(c, 'agent'), ...present(c, 'support')].forEach((v, i) => {
        if (s.node.kind === 'threat') calls.push(...burst({ from: v.at, to: s.at, toR: drawnR(s), n: 3, gapMs: 220 }, 100 + i * 110));
        else calls.push(cmd.tractor({ from: v.at, to: s.at, toR: s.node.world.r, color: TRACTOR, durS }));
      });
      return calls;
    },
  },
};
