// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies through a spot beside where it will come in without stopping (a guest jumps in there), and as it
// passes it gives one call blip; the station jumps in at that instant, in the same hue and ring shape, so
// the two read as one cause and effect (27 F2, R8, R10). The summoner glides on to its rest, its plate
// riding with it (`NOTE_MIN_MS`): no tell, no hold, no fly-back. Then a slow bloom spreads as the station
// settles. The beacon pulses, bearing and planet rings are retired (27 E1). The station's arrival is hero
// energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { NOTE_MIN_MS } from '@shared/engine/maneuvers';
import { GEOMETRY } from '@shared/engine/solar/version';
import { HERO, HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The spot beside where the station comes in, on the side the summoner arrives from (or toward the star). */
function spotOf(c: CastViews): [number, number] | null {
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
      const R = drawnR(f);
      const a = present(c, 'agent')[0];
      const calls: CommandCall[] = [];
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, holdS: 0, backS: NOTE_MIN_MS / 1000, through: true, to: spot, look: f.at, wake: 4 }));
      else {
        const away = c.away?.agent?.[0];
        const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + NOTE_MIN_MS) / 1000 }));
      }
      // Space folds as the flight ends (the flight and the call say where; this ring only repeats it).
      calls.push(repeats(cmd.ring({ at: f.at, r: R * 2.2, r1: R * 0.8, color: HERO, durS: 0.6, alpha: 0.5 }, gather - 600)));
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      // The call (27 F2): one blip at the summoner as it passes, the station's own act ring (0.7 to 1.6 radii,
      // HERO_GLOW) at twice the radius, since a ship is small. The station jumps in at this instant.
      const a = present(c, 'agent')[0];
      const s = a ? drawnR(a) : GEOMETRY.shipR;
      return [
        cmd.ring({ at: a ? a.at : (spotOf(c) ?? f.at), r: 1.4 * s, r1: 3.2 * s, color: HERO_GLOW, durS: 0.6, alpha: 0.7 }),
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
