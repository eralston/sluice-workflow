// Hyperspace emergence (13 §6, rule `threat.emerge`): space pinches in on a point, a rift tears open,
// and the hive ship slides out of it bow first, solid and dormant, before it snaps shut: a menacing
// second (2026-10-13; the art plays the rift). The fold and its flash are in the hostile palette
// (13 §4.3: reds and their dark neighbours); the settling ring is Ready's grey.
import { RULE } from '@shared/engine/pace';
import { lighten } from '../../../chart/art/lit';
import { READY } from '../../../chart/art/progress';
import { cmd, one } from '../../../chart/fx/commands';
import type { ManeuverDef } from '../../../chart/fx/types';
import { enterCmd } from '../entrance';

/** The hostile palette's light (never a hero colourway, 13 §4.3). */
export const HOSTILE = 0xd8503f;

export const emergence: ManeuverDef = {
  id: RULE.threatEmerge,
  title: 'Hyperspace emergence',
  // The ship comes through its own rift (the art's, about a second, 2026-10-13): hidden until then.
  reveals: true,
  phase: {
    tell: (c) => {
      const s = one(c, 'subject');
      // Space pinches in on the point where it will tear.
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 2.4, r1: s.node.world.r * 0.4, color: HOSTILE, durS: 0.25, alpha: 0.6 })] : [];
    },
    act: (c) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const r = s.node.world.r;
      return [
        enterCmd({ pk: s.node.projectionKey }),
        // A red flare as it tears open, and a pulse as it snaps shut behind the ship.
        cmd.flare({ at: s.at, r, color: HOSTILE, scale: 1.3, linger: 1.2 }, 60),
        cmd.ring({ at: s.at, r: r * 0.5, r1: r * 2, color: lighten(HOSTILE, 0.25), durS: 0.5, alpha: 0.7 }, 820),
      ];
    },
    echo: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r, r1: s.node.world.r * 1.25, color: READY, durS: 0.4, alpha: 0.45 })] : [];
    },
  },
};
