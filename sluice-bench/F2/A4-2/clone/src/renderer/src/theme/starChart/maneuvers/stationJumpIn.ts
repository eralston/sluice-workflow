// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies ahead to where it will come in (a guest jumps in there), so the eye is on the spot
// (2026-10-12); then space folds and the station slides out, and a slow bloom spreads as it settles.
// The beacon pulses, bearing and planet rings are retired (27 E1: the flight already says it). The
// station's arrival is hero energy at rest (13 §6.1, 2026-10-13).
// On the fly (27 F2): the summoner doesn't stop at the spot. It passes it, gives one call blip (the arrival's ring
// in its hue, at the ship) and the station jumps in at that instant; then it carries on to its next place. No hold,
// no fly-back. The fold ring that repeated the flight is gone: the blip is the call.
import { RULE } from '@shared/engine/pace';
import { HERO, HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The leg on from the spot to the summoner's next place (s): the old fly-back's length. */
const PASS_ON_S = 0.8;

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
      const R = drawnR(f);
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      // The spot beside where it comes in, on the side the summoner arrives from (or toward the star).
      const a = present(c, 'agent')[0];
      const from = (a && pointOf(a.at)) ?? [0, 0];
      const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
      const spot: [number, number] = [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
      const calls: CommandCall[] = [];
      // On the fly (27 F2): the flight passes the spot as the act begins and carries on to the ship's next place
      // (no hold, no fly-back). The call is given in the act, as it passes.
      if (a) calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, backS: PASS_ON_S, to: spot, look: f.at, wake: 4, pass: true }));
      else {
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (gather + phaseMs(m, 'act') + 600) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      const calls: CommandCall[] = [];
      // The summoner's one call blip (27 F2): the arrival's ring, in its hue and shape, given where the ship is as
      // it passes the spot, at the instant the station jumps in, so the two read as one cause and effect (R8, R10).
      // Under reduced motion the ship stays at its place, and the blip plays there.
      const a = present(c, 'agent')[0];
      if (a) {
        const sr = Math.max(drawnR(a), 6);
        calls.push(cmd.ring({ at: a.at, r: sr * 1.2, r1: sr * 2.7, color: HERO_GLOW, durS: 0.6, alpha: 0.7 }));
      }
      calls.push(
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        cmd.ring({ at: f.at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 }),
      );
      return calls;
    },
    land: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      return [repeats(cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: HERO_GLOW, durS: 0.6, alpha: 0.5 }))];
    },
  },
};
