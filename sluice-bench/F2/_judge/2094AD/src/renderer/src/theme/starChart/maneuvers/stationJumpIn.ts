// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies through the spot beside where it will come in without stopping (27 F2; a guest jumps in there),
// and as it passes it gives one call blip: the station jumps in at that instant, in the same hue and
// with the same ring shape, so the two read as one cause and effect (R8, R10). The ship carries on to
// its next place, named from the blip. Space folds and the station slides out, and a slow bloom spreads
// as it settles. The beacon pulses, bearing and planet rings are retired (27 E1: the flight already
// says it). The station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { PASS_RIDE_MS } from '@shared/engine/maneuvers';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present } from '../../../chart/fx/commands';
import type { CastView, CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The flight on from the pass to the ship's next place (s): its rest beside its work (13 §4), unless a sortie takes it over first. */
const ON_S = 0.8;
/** The call blip's ring is the station's arrival ring at this scale (27 F2: the same shape and hue, beside it). */
const BLIP_SCALE = 0.5;

/** The station's arrival ring (the act's bloom), round `at` at radius scale `r`. */
const arrivalRing = (at: CastView['at'], r: number) => cmd.ring({ at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 });

/** The spot beside where the station comes in, on the side the summoner comes from (or toward the star). */
function spotOf(f: CastView, a: CastView | undefined): [number, number] {
  const R = drawnR(f);
  const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
  const from = (a && pointOf(a.at)) ?? [0, 0];
  const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
  return [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
}

const facilityOf = (c: CastViews) => one(c, 'facility') ?? one(c, 'subject');

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = facilityOf(c);
      if (!f) return [];
      const fly = phaseMs(m, 'gather'); // the flight alone (27 E1: no beacon pulses)
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      const a = present(c, 'agent')[0];
      const spot = spotOf(f, a);
      const calls: CommandCall[] = [];
      // A pass (27 F2): through the spot as the flight ends, no hold, and on; its plate rides with it from there.
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: fly / 1000, holdS: 0, backS: ON_S, passS: PASS_RIDE_MS / 1000, to: spot, look: f.at, wake: 4 }));
      else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (fly + PASS_RIDE_MS) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = facilityOf(c);
      if (!f) return [];
      const r = drawnR(f);
      // The call blip, where the summoner is as it passes (under reduced motion, its place), at the act's start.
      const a = present(c, 'agent')[0];
      const blipAt = a ? a.at : spotOf(f, undefined);
      return [
        arrivalRing(blipAt, r * BLIP_SCALE),
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        arrivalRing(f.at, r),
      ];
    },
  },
};
