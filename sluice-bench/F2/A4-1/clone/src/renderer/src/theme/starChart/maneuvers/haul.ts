// Haul (13 §6): the station tractors supplies in from an asteroid at work. Not a rule of its own
// (pace.ts has none): it plays inside Rig up, whose cast carries the facilities the objective's work
// goes to. A beam from each station to the asteroid, motes riding it home, and the station's intake.
import { brighten } from '../../../chart/art/energy';
import { cmd, one, present } from '../../../chart/fx/commands';
import { TRACTOR } from '../../../chart/fx/timing';
import type { CastViews, CommandCall } from '../../../chart/fx/types';

/** The haul's calls over `durMs`: one beam per facility in the cast, and three supply motes each. */
export function haul(c: CastViews, durMs: number, delayMs = 0): CommandCall[] {
  const s = one(c, 'subject');
  if (!s || s.gone) return [];
  const calls: CommandCall[] = [];
  for (const f of present(c, 'facility')) {
    calls.push(cmd.act(f.key, 'intake'));
    calls.push(cmd.tractor({ from: f.at, to: s.at, toR: s.node.world.r, color: TRACTOR, durS: durMs / 1000 }, delayMs));
    for (let i = 0; i < 3; i++) {
      calls.push(cmd.spark({ from: s.at, to: f.at, color: brighten(TRACTOR, 0.4), durS: 0.9, size: 6 }, delayMs + 300 + i * (durMs / 4)));
    }
  }
  return calls;
}
