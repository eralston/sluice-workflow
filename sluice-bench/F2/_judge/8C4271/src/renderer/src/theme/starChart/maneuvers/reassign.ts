// Reassign, the hand-off (13 §6, rule `piece.reseat`; 22 C7, M-24): a piece travels between two fixed slots, seat to seat or to
// and from the frontier. It's held where it is while a route inks from where it was to where it goes,
// then it flies the arc with a wake, and a ring marks its arrival. For the frontier belt it counts
// where it was until the flight (19 S2), so the belt fades out as the last unassigned piece leaves
// it, and in as one comes to it, not while the route inks.
import { RULE } from '@shared/engine/pace';
import { cmd, crewHoldMs, one, phaseMs, pointOf, present, sortie } from '../../../chart/fx/commands';
import { CYAN } from '../../../chart/fx/timing';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';

export const reassign: ManeuverDef = {
  id: RULE.pieceReseat,
  title: 'Reassign',
  freezes: { guide: 'solar', until: 'act' },
  phase: {
    tell: (c, m) => {
      const s = one(c, 'subject');
      if (!s || s.gone) return [];
      return [cmd.hold({ pk: s.node.projectionKey, durS: (phaseMs(m, 'tell') + phaseMs(m, 'gather')) / 1000 + 0.05 })];
    },
    gather: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const from = present(c, 'fromSeat')[0]?.at ?? s.at;
      const to = present(c, 'toSeat')[0]?.at;
      const calls: CommandCall[] = to ? [cmd.ink({ from, to, color: CYAN, durS: (phaseMs(m, 'gather') + phaseMs(m, 'act')) / 1000 })] : [];
      // The hand-off (22 C7, M-24): the new holder's captain flies to meet it, arriving as it lands at
      // its new place, and holds there named (*Takes it*). Unassigned, no ship.
      // It aims at the new seat, since the piece's own place is still its old slot as the sortie leaves.
      const a = present(c, 'agent')[0];
      const meet = present(c, 'toSeat')[0];
      if (a && !a.gone && meet && a.node.projectionKey !== meet.node.projectionKey) {
        const out = phaseMs(m, 'gather') + phaseMs(m, 'act');
        calls.push(sortie(a, meet, out, Math.max(0, crewHoldMs(m) - phaseMs(m, 'act')), 900));
      }
      return calls;
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s || s.gone) return [];
      const p = pointOf(s.at);
      const q = present(c, 'toSeat')[0];
      const t = q ? pointOf(q.at) : null;
      const lift = p && t ? Math.hypot(t[0] - p[0], t[1] - p[1]) * 0.2 : 0;
      const calls: CommandCall[] = [cmd.pursue({ pk: s.node.projectionKey, durS: phaseMs(m, 'act') / 1000, lift, wake: 4, face: false })];
      return calls;
    },
    land: (c) => {
      const s = one(c, 'subject');
      return s && !s.gone ? [cmd.ring({ at: s.at, r: s.node.world.r, r1: s.node.world.r * 1.5, color: CYAN, durS: 0.5, alpha: 0.7 })] : [];
    },
  },
};
