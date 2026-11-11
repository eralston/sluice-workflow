// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies ahead to where it will come in (a guest jumps in there), so the eye is waiting at the spot
// (2026-10-12); then space folds and the station slides out, and a slow bloom spreads as it settles.
// The beacon pulses, bearing and planet rings are retired (27 E1: the flight already says it). The
// station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { HERO, HERO_GLOW } from '../../../chart/art/energy';
import { cmd, crewHoldMs, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    tell: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f) * 2.4, r1: drawnR(f) * 0.6, color: HERO, durS: 0.3, alpha: 0.35 })] : [];
    },
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const gather = phaseMs(m, 'gather');
      const fly = gather; // the flight alone (27 E1: no beacon pulses)
      const rest = crewHoldMs(m); // through the arrival, then a second with the summoner named (22 B9)
      const R = drawnR(f);
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      // The spot beside where it comes in, on the side the summoner arrives from (or toward the star).
      const a = present(c, 'agent')[0];
      const from = (a && pointOf(a.at)) ?? [0, 0];
      const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
      const spot: [number, number] = [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
      const calls: CommandCall[] = [];
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: fly / 1000, holdS: rest / 1000, backS: 0.8, to: spot, look: f.at, wake: 4 }));
      else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + rest + 600) / 1000 }));
      }
      // Space folds as the flight ends (the flight is the call; this ring only repeats it).
      calls.push(repeats(cmd.ring({ at: f.at, r: R * 2.2, r1: R * 0.8, color: HERO, durS: 0.6, alpha: 0.5 }, gather - 600)));
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      return [
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      ];
    },
    land: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      return [repeats(cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: HERO_GLOW, durS: 0.6, alpha: 0.5 }))];
    },
  },
};
