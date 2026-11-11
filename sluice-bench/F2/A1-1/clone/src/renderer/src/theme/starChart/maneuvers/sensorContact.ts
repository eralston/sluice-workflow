// Sensor contact (13 §6, rule `piece.appear`): a new piece pings onto the radar, by its planet or in
// the frontier. A contact ring tightens on it, it curves in round its planet (an asteroid, 2026-10-13),
// two sweeps go out, and its seat's sensors reach it.
import { RULE } from '@shared/engine/pace';
import { READY } from '../../../chart/art/progress';
import { cmd, repeats, one, present } from '../../../chart/fx/commands';
import { CYAN } from '../../../chart/fx/timing';
import type { ManeuverDef } from '../../../chart/fx/types';
import { enterCmd } from '../entrance';

export const sensorContact: ManeuverDef = {
  id: RULE.pieceAppear,
  title: 'Sensor contact',
  // It brings its new piece in itself (2026-10-13): an asteroid curves in round its planet as a contact.
  reveals: true,
  phase: {
    tell: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 1.8, r1: s.node.world.r * 0.6, color: CYAN, durS: 0.4, alpha: 0.7 })] : [];
    },
    act: (c) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const r = s.node.world.r;
      const calls = [
        enterCmd({ pk: s.node.projectionKey }),
        cmd.ring({ at: s.at, r: r * 0.3, r1: r * 1.8, color: CYAN, durS: 0.9, alpha: 0.9 }),
        repeats(cmd.ring({ at: s.at, r: r * 0.3, r1: r * 1.5, color: CYAN, durS: 0.9, alpha: 0.55 }, 350)),
      ];
      for (const seat of present(c, 'seat')) calls.push(cmd.spark({ from: seat.at, to: s.at, color: CYAN, durS: 0.7, size: 8 }));
      return calls;
    },
    echo: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r, r1: s.node.world.r * 1.2, color: READY, durS: 0.5, alpha: 0.6 })] : [];
    },
  },
};
