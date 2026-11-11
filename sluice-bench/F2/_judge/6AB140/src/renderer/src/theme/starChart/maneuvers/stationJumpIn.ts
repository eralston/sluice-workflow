// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. The summoner
// flies ahead to the spot beside where it will come in (a guest jumps in there), and passes through it
// without stopping (27 F2): as it passes it gives one call blip, and the station jumps in at that instant,
// in the same hue and ring shape, so the two read as one cause and effect (R8, R10). The ship carries on to
// its next place, its plate riding with it for `NOTE_MIN_MS`. The tell, the fold ring, the beacon pulses,
// bearing and planet rings are retired (27 E1, F2: the flight and the blip say it). The station's arrival is
// hero energy at rest (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { NOTE_MIN_MS } from '@shared/engine/maneuvers';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present, repeats } from '../../../chart/fx/commands';
import type { CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The call, as the blip and the arrival both draw it: one hue, one ring shape (27 F2, R10). */
const callRing = (at: Parameters<typeof cmd.ring>[0]['at'], r: number): CommandCall =>
  cmd.ring({ at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 });

/** The spot beside where the station comes in, on the side the summoner arrives from (or toward the star). */
function spotOf(c: CastViews): { spot: [number, number]; R: number; p: [number, number] } | null {
  const f = one(c, 'facility') ?? one(c, 'subject');
  if (!f) return null;
  const R = drawnR(f);
  const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
  const a = present(c, 'agent')[0];
  const from = (a && pointOf(a.at)) ?? [0, 0];
  const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
  return { spot: [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9], R, p };
}

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      const s = spotOf(c);
      if (!f || !s) return [];
      const { spot, R, p } = s;
      const gather = phaseMs(m, 'gather');
      const a = present(c, 'agent')[0];
      const calls: CommandCall[] = [];
      if (a) {
        // It flies through the spot without stopping (27 F2) and on over the length its plate rides.
        calls.push(cmd.pursue({ pk: a.node.projectionKey, durS: gather / 1000, pass: { turnR: R * 0.95 }, backS: NOTE_MIN_MS / 1000, to: spot, look: f.at, wake: 4 }));
      } else {
        // No ship on the board to carry on to a rest: the guest jumps in at the spot and out as the arrival ends.
        const away = c.away?.agent?.[0];
        if (away) calls.push(themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: (m.phases.reduce((e, x) => Math.max(e, x.atMs + x.durMs), 0)) / 1000 }));
      }
      return calls;
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      const s = spotOf(c);
      const a = present(c, 'agent')[0];
      return [
        // The call blip at the summoner's live point (the spot in full motion; its own place under reduced motion).
        callRing(a ? a.at : s ? s.spot : f.at, (s?.R ?? r) * 0.5),
        cmd.act(f.key, 'jump'),
        cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }),
        callRing(f.at, r),
      ];
    },
    land: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      return [repeats(cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: HERO_GLOW, durS: 0.6, alpha: 0.5 }))];
    },
  },
};
