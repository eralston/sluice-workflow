// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// passes through the spot beside where it comes in without stopping (a guest jumps in there), and as it
// passes it gives one call blip: the station jumps in at that instant, in the same hue and ring shape, and a slow
// bloom spreads as it settles (27 F2: no tell, no hold, no fly-back; the ship carries on to its next place, and
// its plate rides with it for `NOTE_MIN_MS`). The beacon pulses, bearing and planet rings are retired (27 E1). The
// call and the arrival are hero energy, as every summons is (13 §6, 15 §2); the form flash is at rest (13 §6.1).
import { NOTE_MIN_MS } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
import { HERO, HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { Anchor } from '../../../chart/fx/effects';
import type { CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The call blip and the station's arrival share one ring shape and hue, so the arrival answers the blip (27 F2, R10). */
const call = (at: Anchor, r: number): CommandCall => cmd.ring({ at, r: r * 0.7, r1: r * 1.6, color: HERO, durS: 1.2, alpha: 0.7 });

/** The spot beside where it comes in, on the side the summoner arrives from (or toward the star). */
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
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      const a = present(c, 'agent')[0];
      if (a) {
        // A pass (27 F2): through the spot with no hold, then on to its place; the flight is the cue.
        return [cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, rideS: NOTE_MIN_MS / 1000, backS: NOTE_MIN_MS / 1000, to: spot, look: f.at, wake: 4 })];
      }
      const away = c.away?.agent?.[0];
      return away ? [themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + NOTE_MIN_MS) / 1000 })] : [];
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      const calls: CommandCall[] = [
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        call(f.at, r),
      ];
      // The blip, on the summoner as it passes (at its place under reduced motion, where it doesn't fly); a guest's is at the spot.
      const a = present(c, 'agent')[0];
      const spot = spotOf(c);
      if (a) calls.push(call(a.at, drawnR(a) * 2));
      else if (spot && c.away?.agent?.[0]) calls.push(call(spot, 12));
      return calls;
    },
    land: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      return [repeats(cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: HERO_GLOW, durS: 0.6, alpha: 0.5 }))];
    },
  },
};
