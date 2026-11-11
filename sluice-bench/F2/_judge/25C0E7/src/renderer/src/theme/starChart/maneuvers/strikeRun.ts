// Strike run (13 §6, rule `threat.accomplish`, a protected moment): the decisive pass. The captain
// and the reviewers of the fix fly in, the reviewers stream energy into the captain, and the fire and
// the stations' covering fire converge. The hive ship breaks apart in the grand gold flare, and the
// hulk it leaves is wrapped in metal and glides to the planet's lit edge as a research platform in low
// orbit, a gently lit emblem of the win (13 §4.3, v4: debris and research, never death). In three acts
// (22 C3, M-22): the strike is the cause; the turn is the culminating explosion as the land starts,
// which hides its swap to the caged hulk; the glide carries the hulk to its platform (`slides`); the
// grand gold blossom opens with the echo, where it settles.
// Blasted (the `beamed` variant, art session 2026-10-12): when merged fixes went to stations, each of
// those stations charges and fires its red phaser through a longer act, and the hive ship blows apart
// under the beam before its wreck is caged and sent to orbit in the gold flare.
import { RULE } from '@shared/engine/pace';
import { READY, SUCCESS } from '../../../chart/art/progress';
import { cmd, repeats, one, phaseMs, present, sortie, crewHoldMs } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { HERO_SOFT } from '../../../chart/art/energy';
import { burst, themeCmd } from '../commands';
import { stationFire } from './stationFire';

/** How far apart a strike run's ships stand round the threat's side of its planet, radians (22 A10: 0.6; 22 B9). */
export const STRIKE_FAN = 0.8;
/** The culminating explosion's colour (22 C3): a white-hot orange, never the win's gold. */
export const EXPLOSION = 0xffb36b;

export const strikeRun: ManeuverDef = {
  id: RULE.threatAccomplish,
  title: 'Strike run',
  slides: 'land',
  phase: {
    gather: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const out = phaseMs(m, 'gather');
      const hold = crewHoldMs(m); // through the run, then a second with the crew named (22 B9)
      const back = phaseMs(m, 'echo') + phaseMs(m, 'disperse') + 400;
      const ships = [...present(c, 'agent'), ...present(c, 'support')];
      // Each ship a little behind the last, so they read as a pass, not a blast; fanned round the
      // threat's side of its planet so they stand apart (22 A10), with room for each one's name (22 B9).
      return ships.map((v, i) => sortie(v, s, out + i * 120, Math.max(0, hold - i * 120), back, i * 60, one(c, 'seat'), (i - (ships.length - 1) / 2) * STRIKE_FAN));
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const act = phaseMs(m, 'act');
      const calls: CommandCall[] = [];
      const a = present(c, 'agent')[0];
      if (a) {
        calls.push(...burst({ from: a.at, to: s.at, toR: s.node.world.r, n: 6, gapMs: act / 7, durS: 0.25 }, 100));
        for (const r of present(c, 'support')) calls.push(themeCmd.energy({ from: r.at, to: a.at, toR: a.node.world.r, color: HERO_SOFT, durS: act / 1000 }));
      }
      if (m.variant?.startsWith('beamed')) {
        // Every station its fixes merged into charges and fires; it blows apart under the beams.
        calls.push(...stationFire(c, s, act, 'phaser'));
        calls.push(cmd.act(s.key, 'breakup', act * 0.62));
        return calls;
      }
      for (const f of present(c, 'facility')) calls.push(...burst({ from: f.at, to: s.at, toR: s.node.world.r, n: 1, gapMs: 0, scale: 0.75, durS: 0.5 }, act * 0.3));
      calls.push(cmd.act(s.key, 'breakup'));
      return calls;
    },
    land: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      // The turn: the culminating explosion, bright at once, hides the swap; its shock ring runs out.
      // In an arc (22 C4) the station's phaser was the strike: it breaks up at the impact, here.
      const r = s.node.world.r;
      return [
        ...(m.variant === 'arc' ? [cmd.act(s.key, 'breakup')] : []),
        // The victory: its gold outline flares at the land, then settles (27 B3; none under reduced motion).
        cmd.act(s.key, 'victory'),
        cmd.flare({ at: s.at, r, color: EXPLOSION, scale: 2.4, linger: 1.1, sparks: EXPLOSION }),
        cmd.ring({ at: s.at, r: r * 0.6, r1: r * 2.4, color: EXPLOSION, durS: 0.7, alpha: 0.7 }),
      ];
    },
    echo: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      // The blossom, where the hulk settled.
      const left = (phaseMs(m, 'echo') + phaseMs(m, 'disperse')) / 1000;
      return [
        cmd.flare({ at: s.at, r: s.node.world.r, color: SUCCESS, scale: 2, linger: 6, grand: true, capS: left }),
        repeats(cmd.ring({ at: s.at, r: s.node.world.r * 0.8, r1: s.node.world.r * 1.6, color: READY, durS: 0.9, alpha: 0.4 })),
      ];
    },
  },
};
