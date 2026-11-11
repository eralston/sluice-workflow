// Engage (13 §6, rule `threat.engage`): the captain takes a standoff beside the hive ship and the
// fleet's target lock rings it in its rung's colour. The captain's phaser bolts go in, hero blue; the
// enemy's return fire, Danger Red bolts, falls short on the ship's shields (13 §4.3: it never lands on
// a person); the stations its fix goes to lay down slow, sparse covering fire, heavier hero bolts (a
// campfire, never fireworks).
import { RULE } from '@shared/engine/pace';
import { DANGER, HERO_GLOW } from '../../../chart/art/energy';
import { RUNG_COLOR } from '../../../chart/art/progress';
import { cmd, one, phaseMs, pointOf, present, sortie, crewHoldMs } from '../../../chart/fx/commands';
import type { CastView, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { burst, themeCmd } from '../commands';

/** Return fire from `s` toward `a` that stops on the shield, short of the ship, and the shield's flash. */
export function shieldedFire(s: CastView, a: CastView, delayMs: number): CommandCall[] {
  const p = pointOf(s.at);
  const q = pointOf(a.at);
  if (!p || !q) return [];
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const stop = Math.max(0, d - a.node.world.r * 1.4) / d;
  const hit: [number, number] = [p[0] + (q[0] - p[0]) * stop, p[1] + (q[1] - p[1]) * stop];
  // A Danger Red bolt, the hero phaser's mirror, stopping on the hero's shield (hero energy, art/energy.ts).
  return [
    themeCmd.bolt({ from: s.at, to: hit, toR: 0, color: DANGER, durS: 0.32 }, delayMs),
    cmd.ring({ at: hit, r: a.node.world.r * 0.5, r1: a.node.world.r * 0.9, color: HERO_GLOW, durS: 0.35, alpha: 0.7 }, delayMs + 120),
  ];
}

export const engage: ManeuverDef = {
  id: RULE.threatEngage,
  title: 'Engage',
  phase: {
    gather: (c, m) => {
      const s = one(c, 'subject');
      const a = one(c, 'agent');
      const calls: CommandCall[] = [];
      if (s) calls.push(cmd.ring({ at: s.at, r: s.node.world.r * 1.8, r1: s.node.world.r * 1.25, color: RUNG_COLOR[m.to?.rung ?? 'underway'], durS: phaseMs(m, 'gather') / 1000 + phaseMs(m, 'act') / 1000, alpha: 0.7 }));
      if (s && a && !a.gone) calls.push(sortie(a, s, phaseMs(m, 'gather'), crewHoldMs(m), phaseMs(m, 'echo') + 600, 0, one(c, 'seat')));
      return calls;
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      const act = phaseMs(m, 'act');
      const calls: CommandCall[] = [cmd.act(s.key, 'engage')];
      const a = one(c, 'agent');
      if (a && !a.gone) {
        calls.push(...burst({ from: a.at, to: s.at, toR: s.node.world.r, n: 4, gapMs: act / 5 }, 150));
        calls.push(...shieldedFire(s, a, act * 0.45));
      }
      for (const f of present(c, 'facility')) {
        calls.push(...burst({ from: f.at, to: s.at, toR: s.node.world.r, n: 2, gapMs: act / 2, scale: 0.75, durS: 0.5 }, 300));
      }
      return calls;
    },
    echo: (c, m) => {
      const s = one(c, 'subject');
      return s ? [cmd.ring({ at: s.at, r: s.node.world.r * 1.25, r1: s.node.world.r * 1.4, color: RUNG_COLOR[m.to?.rung ?? 'underway'], durS: 0.4, alpha: 0.5 })] : [];
    },
  },
};
