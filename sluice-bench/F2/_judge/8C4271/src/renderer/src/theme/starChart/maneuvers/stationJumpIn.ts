// Station jump-in (13 §6, rule `facility.enter`): the station arrives near the planets it serves,
// ponderously, summoned by the captain whose attachment first brings it into the round. On the fly (27 F2):
// the summoner's path passes through a spot beside where it will come in without stopping; as it passes it
// gives one call blip, and at that instant space folds and the station slides out, with an arrival ring of the
// same hue and shape, so the two read as one cause and effect (R8, R10). The ship carries on to its next place.
// The beacon pulses, bearing and planet rings are retired (27 E1: the flight already says it). The station's
// arrival is hero energy at rest (13 §6.1, 2026-10-13). Under reduced motion the ship doesn't fly: the blip and
// the arrival play at its place.
import { claimMs, passNoteMs } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
import { HERO_GLOW } from '../../../chart/art/energy';
import { cmd, drawnR, one, phaseMs, pointOf, present } from '../../../chart/fx/commands';
import type { Anchor } from '../../../chart/fx/effects';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The jump's ring (27 F2): the summoner's blip and the station's arrival are this one ring, each at its own size. */
export const jumpRing = (at: Anchor, r: number): CommandCall => cmd.ring({ at, r: r * 0.7, r1: r * 1.6, color: HERO_GLOW, durS: 1.2, alpha: 0.7 });

/** The spot the summoner passes through, `R × 1.9` out from the station on the side it comes from (or toward the star). */
const spotOf = (p: [number, number], from: [number, number], R: number): [number, number] => {
  const l = Math.hypot(from[0] - p[0], from[1] - p[1]) || 1;
  return [p[0] + ((from[0] - p[0]) / l) * R * 1.9, p[1] + ((from[1] - p[1]) / l) * R * 1.9];
};

export const stationJumpIn: ManeuverDef = {
  id: RULE.facilityEnter,
  title: 'Station jump-in',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const fly = phaseMs(m, 'gather'); // the flight alone, to the spot (27 E1: no beacon pulses)
      const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
      const a = present(c, 'agent')[0];
      const spot = spotOf(p, (a && pointOf(a.at)) ?? [0, 0], drawnR(f));
      // Through the spot without stopping, on to its next place (27 F2); named from the blip until its plate has folded.
      const noteS = (passNoteMs(m.phases) - claimMs(m.phases)) / 1000;
      if (a) return [cmd.pursue({ pk: a.node.projectionKey, durS: fly / 1000, to: spot, pass: true, noteS, wake: 4 })];
      const away = c.away?.agent?.[0];
      return away ? [themeCmd.guest({ key: away.key, seed: away.seed, at: spot, face: p[0] >= spot[0] ? 1 : -1, durS: fly / 1000 + noteS })] : [];
    },
    act: (c) => {
      const f = one(c, 'facility') ?? one(c, 'subject');
      if (!f) return [];
      const r = drawnR(f);
      const calls: CommandCall[] = [];
      // The call blip, where the summoner is as it passes (its place, under reduced motion), or where its guest waits.
      const a = present(c, 'agent')[0];
      if (a) calls.push(jumpRing(a.at, drawnR(a) * 1.6));
      else if (c.away?.agent?.[0]) {
        const p = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
        calls.push(jumpRing(spotOf(p, [0, 0], r), r * 0.4));
      }
      // The arrival, at that instant: space folds and the station slides out.
      calls.push(cmd.act(f.key, 'jump'), cmd.flare({ at: f.at, r, color: HERO_GLOW, scale: 1.3, linger: 2 }), jumpRing(f.at, r));
      return calls;
    },
  },
};
