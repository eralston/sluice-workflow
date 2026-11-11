// The stations' finishing beams (art session 2026-10-12), shared by Strike run and Landing's `beamed`
// variants: every station the piece's merged work went to charges, then beams it for the rest of the
// act. At a hive ship it fires its hero-blue phaser; at an asteroid, its mining beam, with the same
// weight (13 §6.1, 2026-10-13: weapons only at enemies, and mining as dramatic as a kill).
import { cmd, drawnR, pointOf, present } from '../../../chart/fx/commands';
import type { CastView, CastViews, CommandCall } from '../../../chart/fx/types';
import { HERO } from '../../../chart/art/energy';
import { STATION_CHARGE_MS } from '../../../chart/fx/timing';
import { themeCmd } from '../commands';

export function stationFire(c: CastViews, target: CastView, actMs: number, style: 'phaser' | 'mine'): CommandCall[] {
  const calls: CommandCall[] = [];
  const fire = Math.max(400, actMs - STATION_CHARGE_MS - 150) / 1000;
  const color = HERO;
  for (const f of present(c, 'facility')) {
    const R = drawnR(f);
    calls.push(themeCmd.charge({ at: f.at, r: R * 0.9, color, durS: STATION_CHARGE_MS / 1000 }));
    // The hull charges too (a Wars ring: power climbs it to the dorsal emitter), and holds while it fires.
    calls.push(cmd.act(f.key, 'charge'));
    // From the station's emitter (the art's anchor at its form and heading), else the rim on the side facing its target.
    const from = () => {
      const e = f.anchor?.('emitter');
      if (e) return e;
      const a = pointOf(f.at);
      const b = pointOf(target.at);
      if (!a || !b) return a;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [a[0] + ((b[0] - a[0]) / l) * R * 0.45, a[1] + ((b[1] - a[1]) / l) * R * 0.45] as const;
    };
    const args = { from, to: target.at, toR: drawnR(target), durS: fire };
    calls.push(style === 'phaser' ? themeCmd.phaser(args, STATION_CHARGE_MS) : themeCmd.mine({ ...args, seed: f.node.seed }, STATION_CHARGE_MS));
  }
  if (calls.length) calls.push(cmd.ring({ at: target.at, r: drawnR(target) * 1.6, r1: drawnR(target), color, durS: STATION_CHARGE_MS / 1000, alpha: 0.6 }));
  return calls;
}
