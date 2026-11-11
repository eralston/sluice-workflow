// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// summoned by the captain whose attachment first brings it into the round. The summoner flies through the spot
// where it will come in without stopping (a pass, 27 F2); as it passes, it gives one call blip and the station
// jumps in at that instant, with a flare and a slow bloom. The ship carries on to its rest, named. A guest
// jumps in at the spot instead. The tell, fold and land rings are cut: the flight announces the station, the
// blip is the call. The station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
import { CREW_FOLD_MS, NOTE_MIN_MS } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const gather = phaseMs(m, 'gather');
      const R = drawnR(f);
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      // The spot beside where it comes in, on the side the summoner arrives from (or toward the star).
      const a = present(c, 'agent')[0];
      const from = (a && pointOf(a.at)) ?? [0, 0];
      const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
      const spot: [number, number] = [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
      const calls: CommandCall[] = [];
      // A pass: through the spot at the act's start without stopping, on to its own place over 0.8 s (the old fly-back);
      // its plate unfurls at the blip, stays whole for `NOTE_MIN_MS`, then folds, riding the ship.
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, backS: 0.8, pass: true, nameS: (2 * CREW_FOLD_MS + NOTE_MIN_MS) / 1000, to: spot, look: f.at, wake: 4 }));
      else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + NOTE_MIN_MS) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      // The call blip (27 F2): the station ring's shape at twice the ship's radius, in the same hue, from the summoner
      // at the instant it arrives. R8: the interaction is this instant.
      const a = present(c, 'agent')[0];
      const blip = a
        ? cmd.ring({ at: a.at, r: drawnR(a) * 1.4, r1: drawnR(a) * 3.2, color: HERO_GLOW, durS: 0.6, alpha: 0.7 })
        : cmd.ring({ at: f.at, r: r * 0.35, r1: r * 0.8, color: HERO_GLOW, durS: 0.6, alpha: 0.7 });
      return [
        blip,
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      ];
    },
  },
};
