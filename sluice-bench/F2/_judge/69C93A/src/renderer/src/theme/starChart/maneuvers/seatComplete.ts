// Homeworld complete (13 §6, rule `seat.complete`, a protected moment, 2026-10-13): everything a
// person held here this sprint is done, so their world finishes terraforming. It plays after the close
// that did it. Their ship comes home and holds beside it; the light gathers in from the platform on
// its lit edge; the world's finished look lands (it owns the seat's look) with the grand gold flare,
// and its halo blooms; then city lights glint along its lit edge. A milestone of their own work,
// never a ranking (INV-19).
import { RULE } from '@shared/engine/pace';
import { lighten } from '../../../chart/art/lit';
import { SUCCESS } from '../../../chart/art/progress';
import { cmd, repeats, drawnR, one, phaseMs, pointOf, sortie, crewHoldMs } from '../../../chart/fx/commands';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { finaleCmd } from '../finales';

export const seatComplete: ManeuverDef = {
  id: RULE.seatComplete,
  title: 'Homeworld complete',
  owns: ['seat'],
  phase: {
    tell: (c) => {
      const w = one(c, 'seat');
      return w && one(c, 'subject') ? [cmd.ring({ at: w.at, r: drawnR(w) * 1.7, r1: drawnR(w) * 1.04, color: SUCCESS, durS: 0.3, alpha: 0.55 })] : [];
    },
    gather: (c, m) => {
      const w = one(c, 'seat');
      const s = one(c, 'subject');
      if (!w || !s) return [];
      const calls: CommandCall[] = [];
      const a = one(c, 'agent');
      if (a && !a.gone) calls.push(sortie(a, w, phaseMs(m, 'gather'), crewHoldMs(m), phaseMs(m, 'echo') + 500));
      // The platform's light reaches its world.
      calls.push(cmd.spark({ from: s.at, to: w.at, color: SUCCESS, durS: 0.7, size: 10 }, 200));
      return calls;
    },
    act: (c, m) => {
      const w = one(c, 'seat');
      if (!w || !one(c, 'subject')) return [];
      const R = drawnR(w);
      const act = phaseMs(m, 'act');
      // The light gathers: three gold rings drawn in to the world, quicker each time.
      const calls: CommandCall[] = [0, 0.3, 0.55].map((k, i) => cmd.ring({ at: w.at, r: R * (2.1 - i * 0.25), r1: R * 1.02, color: i % 2 ? lighten(SUCCESS, 0.3) : SUCCESS, durS: act / 1000 * (0.55 - i * 0.1), alpha: 0.6 }, act * k));
      calls.push(cmd.flare({ at: w.at, r: R, color: SUCCESS, scale: 1.25, linger: 1 }, act * 0.6));
      return calls;
    },
    land: (c, m) => {
      const w = one(c, 'seat');
      if (!w || !one(c, 'subject')) return [];
      const R = drawnR(w);
      const left = (phaseMs(m, 'land') + phaseMs(m, 'echo')) / 1000;
      // Its finished look lands now, with the grand flare, and the halo blooms slowly outward. The closed piece's
      // gold outline flares with it, then settles (27 B3).
      const s = one(c, 'subject');
      return [
        ...(s && !s.gone ? [cmd.act(s.key, 'victory')] : []),
        cmd.flare({ at: w.at, r: R, color: SUCCESS, scale: 2.1, linger: 5, grand: true, capS: left }),
        cmd.ring({ at: w.at, r: R * 1.02, r1: R * 2.6, color: lighten(SUCCESS, 0.25), durS: 1.8, alpha: 0.7 }),
        repeats(cmd.ring({ at: w.at, r: R * 1.02, r1: R * 1.9, color: SUCCESS, durS: 1.4, alpha: 0.5 }, 350)),
      ];
    },
    echo: (c, m) => {
      const w = one(c, 'seat');
      const s = one(c, 'subject');
      if (!w || !s) return [];
      const R = drawnR(w);
      // City lights along the lit edge (where the platform orbits), one after another.
      const p = pointOf(w.at);
      const q = pointOf(s.at);
      const toward = p && q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : -Math.PI / 2;
      const echo = phaseMs(m, 'echo');
      const calls: CommandCall[] = [-0.9, -0.35, 0.2, 0.7, 1.15].map((off, i) => {
        const a = toward + off;
        const at: [number, number] = p ? [p[0] + Math.cos(a) * R * 0.86, p[1] + Math.sin(a) * R * 0.86] : [w.node.world.x, w.node.world.y];
        return finaleCmd.glint({ at, r: R * 0.22, color: lighten(SUCCESS, 0.2), durS: 0.8 }, i * (echo / 7));
      });
      calls.push(cmd.ring({ at: w.at, r: R, r1: R * 1.15, color: lighten(SUCCESS, 0.2), durS: 0.7, alpha: 0.5 }, echo * 0.5));
      return calls;
    },
  },
};
