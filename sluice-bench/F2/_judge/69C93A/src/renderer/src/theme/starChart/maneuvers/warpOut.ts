// Warp out (13 §6, rule `piece.off`): dropped or set aside. A threat warps out and retreats (a streak
// away on a seeded heading); an objective drifts out as a ghost. Both fade in the off-ladder grey.
import { RULE } from '@shared/engine/pace';
import { RUNG_COLOR } from '../../../chart/art/progress';
import { away, cmd, one, phaseMs } from '../../../chart/fx/commands';
import type { ManeuverDef } from '../../../chart/fx/types';

export const warpOut: ManeuverDef = {
  id: RULE.pieceOff,
  title: 'Warp out',
  phase: {
    tell: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 1.4, r1: s.node.world.r, color: RUNG_COLOR.off, durS: 0.3, alpha: 0.6 })] : [];
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const r = s.node.world.r;
      if (s.node.kind === 'threat') {
        return [
          cmd.act(s.key, 'warp'),
          cmd.spark({ from: s.at, to: away(s.at, m.seed, r * 5), color: RUNG_COLOR.off, durS: phaseMs(m, 'act') / 1000, size: 16 }),
          cmd.ring({ at: s.at, r, r1: r * 0.3, color: RUNG_COLOR.off, durS: 0.9, alpha: 0.7 }),
        ];
      }
      return [cmd.act(s.key, 'ghost'), cmd.ring({ at: s.at, r, r1: r * 1.5, color: RUNG_COLOR.off, durS: phaseMs(m, 'act') / 1000, alpha: 0.5 })];
    },
    disperse: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 0.8, r1: s.node.world.r * 1.1, color: RUNG_COLOR.off, durS: 0.6, alpha: 0.3 })] : [];
    },
  },
};
