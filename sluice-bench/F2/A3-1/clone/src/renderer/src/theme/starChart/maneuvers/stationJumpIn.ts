// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies through a spot beside where it will come in and does not stop (27 F2): as it passes, it gives one
// call blip, and at that instant space folds and the station slides out, in the same hue and ring shape, so
// the two read as one cause and effect (R8, R10). The ship carries on to its rest with its plate riding
// (`NOTE_MIN_MS`). Under reduced motion it doesn't fly: the blip and the arrival play at its place.
// The beacon pulses, bearing and planet rings are retired (27 E1). The station's arrival is hero energy at
// rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { releaseOfPlay } from '@shared/engine/maneuvers';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseAtMs, phaseMs, pointOf, present } from '../../../chart/fx/commands';
import type { CastView, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The spot beside the station on the side the summoner comes from (or toward the star), 1.9 station radii out. */
function spotOf(f: CastView, from: [number, number]): [number, number] {
  const R = drawnR(f);
  const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
  const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
  return [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
}

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const gather = phaseMs(m, 'gather'); // the flight to the spot, where the call is given
      const a = present(c, 'agent')[0];
      const spot = spotOf(f, (a && pointOf(a.at)) ?? [0, 0]);
      if (a) {
        // Through the spot with no hold, then on to its rest over as long as its plate rides.
        const ride = Math.max(0, releaseOfPlay(m) - phaseAtMs(m, 'act'));
        return [cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, holdS: 0, backS: ride / 1000, pass: true, to: spot, look: f.at, wake: 4 })];
      }
      const away = c.away?.agent?.[0];
      return away ? [themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: pointOf(f.at)![0] >= spot[0] ? 1 : -1, durS: (gather + 600) / 1000 })] : [];
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      const a = present(c, 'agent')[0];
      return [
        // The call blip, where the summoner is as it passes (under reduced motion, at its place), in the arrival's hue and ring shape.
        cmd.ring({ at: a ? a.at : spotOf(f, [0, 0]), r: r * 0.3, r1: r * 0.8, color: HERO_GLOW, durS: 0.6, alpha: 0.7 }),
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      ];
    },
  },
};
