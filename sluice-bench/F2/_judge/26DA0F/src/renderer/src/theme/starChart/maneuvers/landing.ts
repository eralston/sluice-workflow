// Landing (13 §6, rule `objective.accomplish`, a protected moment): the captain sees the asteroid
// home, in three acts (22 C3, M-22). The cause: the captain's tractor (or the stations' mining beams).
// The turn: a swirl of glittering stardust round the asteroid, at its densest as the land starts, hides
// its instant swap to a compact mine platform (v4). The glide: it slides from the planet's shadow to its
// platform on the lit edge (`slides`: the moment lets it go as the land starts, and the scene's glide
// carries it), a gold streak following. The blossom: the grand gold flare opens as the echo starts,
// where it settles. In the frontier, with no planet, it blossoms where it was.
// Beamed home (the `beamed` variant, art session 2026-10-12): when merged work went to stations, each
// of those stations charges and mines it with its mining beam (the phaser's weight) over a longer
// act, its scaffolding lighting up in pulses, before the gold flare breaks over the finished
// platform.
import { RULE } from '@shared/engine/pace';
import { lighten } from '../../../chart/art/lit';
import { SUCCESS } from '../../../chart/art/progress';
import { cmd, repeats, one, phaseMs, sortie, crewHoldMs } from '../../../chart/fx/commands';
import { TRACTOR } from '../../../chart/fx/timing';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';
import { stationFire } from './stationFire';

/** The turn's stardust (22 C3), its densest at a third of the way through. */
export const STARDUST_MS = 900;

export const landing: ManeuverDef = {
  id: RULE.objectiveAccomplish,
  title: 'Landing',
  slides: 'land',
  phase: {
    tell: (c) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 1.6, r1: s.node.world.r * 1.05, color: SUCCESS, durS: 0.3, alpha: 0.6 })] : [];
    },
    gather: (c, m) => {
      const s = one(c, 'subject');
      const a = one(c, 'agent');
      if (!s || !a || a.gone) return [];
      return [sortie(a, s, phaseMs(m, 'gather'), crewHoldMs(m), phaseMs(m, 'echo') + phaseMs(m, 'disperse') + 400, 0, one(c, 'seat'))];
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const act = phaseMs(m, 'act');
      const a = one(c, 'agent');
      const calls: CommandCall[] = [];
      if (a && !a.gone) calls.push(cmd.tractor({ from: a.at, to: s.at, toR: s.node.world.r, color: TRACTOR, durS: act / 1000 }));
      if (m.variant?.startsWith('beamed')) {
        calls.push(...stationFire(c, s, act, 'mine'));
        // The scaffolding builds under the beam: pulses of gold and blue running out from the rock.
        for (let i = 0; i < 4; i++) calls.push(cmd.ring({ at: s.at, r: s.node.world.r * 0.7, r1: s.node.world.r * 1.35, color: i % 2 ? SUCCESS : lighten(SUCCESS, 0.4), durS: 0.6, alpha: 0.7 }, act * 0.35 + i * act * 0.15));
      }
      // The turn's cover: stardust, at its densest a third of the way in, as the land (the swap) starts.
      calls.push(themeCmd.stardust({ at: s.at, r: s.node.world.r, color: SUCCESS, durS: STARDUST_MS / 1000 }, Math.max(0, act - STARDUST_MS * 0.35)));
      return calls;
    },
    land: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      // The glide: a gold streak follows it to its platform.
      // The victory: its gold outline flares at the land, then settles (27 B3; none under reduced motion).
      const calls: CommandCall[] = [cmd.act(s.key, 'victory'), cmd.spark({ from: s.at, to: s.at, color: SUCCESS, durS: phaseMs(m, 'land') / 1000, size: 14 })];
      // In an arc (22 C4) the station's beam is the cause and it lands at the impact: the beam's hit
      // flare covers the swap, and the stardust swirls up from there.
      if (m.variant === 'arc') calls.push(themeCmd.stardust({ at: s.at, r: s.node.world.r, color: SUCCESS, durS: STARDUST_MS / 1000 }));
      return calls;
    },
    echo: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      // The blossom, where it settled.
      const r = s.node.world.r;
      const left = (phaseMs(m, 'echo') + phaseMs(m, 'disperse')) / 1000;
      return [
        cmd.flare({ at: s.at, r, color: SUCCESS, scale: 2, linger: 6, grand: true, capS: left }),
        repeats(cmd.ring({ at: s.at, r: r * 0.9, r1: r * 1.6, color: lighten(SUCCESS, 0.2), durS: 1.3, alpha: 0.8 })),
      ];
    },
  },
};
