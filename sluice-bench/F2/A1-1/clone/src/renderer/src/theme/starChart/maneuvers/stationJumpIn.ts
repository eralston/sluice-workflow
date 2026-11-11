// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies through the spot beside where it will come in and on to its rest, without stopping (27 F2); as it
// passes, it gives one call blip, and at that instant space folds and the station slides out, and a slow
// bloom spreads as it settles. The blip has the station ring's hue and shape, so the two read as one cause
// and effect (R8, R10). A guest jumps in at the spot. The beacon pulses, bearing and planet rings, and the
// tell and land rings, are retired (27 E1, F2). The station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, crewHoldMs, drawnR, one, phaseMs, pointOf, present } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The spot beside where the station comes in, on the side the summoner arrives from (or toward the star). */
function spotOf(c: Parameters<typeof present>[0]): [number, number] | null {
  const f = one(c, 'facility') ?? one(c, 'subject');
  if (!f) return null;
  const R = drawnR(f);
  const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
  const a = present(c, 'agent')[0];
  const from = (a && pointOf(a.at)) ?? [0, 0];
  const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
  return [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
}

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      const spot = spotOf(c);
      if (!f || !spot) return [];
      const gather = phaseMs(m, 'gather');
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      const calls: CommandCall[] = [];
      const a = present(c, 'agent')[0];
      if (a) {
        // Through the spot and on to its rest, never stopping (27 F2); its plate rides with it from the act.
        calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, through: true, plateS: crewHoldMs(m) / 1000, backS: phaseMs(m, 'act') / 1000, to: spot, look: f.at, wake: 4 }));
      } else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + crewHoldMs(m)) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      // The call blip, at the summoner as it passes (at the spot; under reduced motion, at its place), the station's ring's hue and shape.
      const a = present(c, 'agent')[0];
      const at = (a && pointOf(a.at)) ?? spotOf(c);
      const s = a ? drawnR(a) * 2.5 : r * 0.5;
      const blip: CommandCall[] = at ? [cmd.ring({ at, r: s * 0.7, r1: s * 1.6, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })] : [];
      return [
        ...blip,
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      ];
    },
  },
};
