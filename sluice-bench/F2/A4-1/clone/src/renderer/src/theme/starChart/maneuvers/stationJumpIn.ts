// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies out and passes through a spot beside where it will come in without stopping (27 F2): as it passes it
// gives one call blip, and at that instant space folds and the station slides out in the same hue and ring
// shape, so the two read as one cause and effect (R8, R10). The ship carries on to its next place, its plate
// riding with it. Under reduced motion the ship doesn't fly: the blip and the arrival play at its place.
// The beacon pulses, bearing and planet rings are retired (27 E1), as are the tell, the hold and the fly-back
// (27 F2). The station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { PASS_PLATE_MS } from '@shared/engine/maneuvers';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The arrival ring's shape, as multiples of the radius it grows from: the call blip wears the same (27 F2, R8, R10). */
const ARRIVAL_RING = { from: 0.7, to: 1.6 } as const;

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const gather = phaseMs(m, 'gather');
      const ride = PASS_PLATE_MS; // the leg on from the spot: the plate rides with the moving ship
      const R = drawnR(f);
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      // The spot beside where it comes in, on the side the summoner arrives from (or toward the star).
      const a = present(c, 'agent')[0];
      const from = (a && pointOf(a.at)) ?? [0, 0];
      const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
      const spot: [number, number] = [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
      const calls: CommandCall[] = [];
      // Through the spot and on (27 F2): no hold, no fly-back; its next place is its next sortie's or its rest.
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, backS: ride / 1000, rideS: ride / 1000, to: spot, look: f.at, wake: 4 }));
      else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + ride) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      // The call blip: one ring at the passing ship, in the arrival's hue and shape, at the same instant.
      const a = present(c, 'agent')[0];
      const blip: CommandCall[] = a
        ? [cmd.ring({ at: a.at, r: drawnR(a) * 3 * ARRIVAL_RING.from, r1: drawnR(a) * 3 * ARRIVAL_RING.to, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })]
        : [];
      return [
        cmd.act(f.key, 'jump'),
        ...blip,
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * ARRIVAL_RING.from, r1: r * ARRIVAL_RING.to, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      ];
    },
    land: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      return [repeats(cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: HERO_GLOW, durS: 0.6, alpha: 0.5 }))];
    },
  },
};
