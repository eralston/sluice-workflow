// Sector sweep (13 §6, 27 E7, rule `region.sweep`): a beat with four or more creations. A Nav cyan ring
// tightens on the star, then one calm ring sweeps out across the frontier, and each new piece makes its
// quiet entrance as the ring passes it, nearest the star first. No plates and no names of its own: the star
// wears one note with the count and the sprint (the interpreter). The end is the note's read time.
import { GEOMETRY } from '@shared/engine/solar/version';
import { SWEEP_SPREAD_MAX_MS, SWEEP_STEP_MS, RULE } from '@shared/engine/pace';
import { cmd, pointOf, present } from '../../../chart/fx/commands';
import { CYAN } from '../../../chart/fx/timing';
import type { ManeuverDef } from '../../../chart/fx/types';
import { enterCmd } from '../entrance';
import { finaleCmd } from '../finales';
import { sweepOrder } from './sweepOrder';

export const sectorSweep: ManeuverDef = {
  id: RULE.regionSweep,
  title: 'Sector sweep',
  // It brings its pieces in itself, one by one: the interpreter keeps them hidden until their entrances.
  reveals: true,
  phase: {
    tell: (c) => {
      const b = c.board;
      if (!b) return [];
      return [cmd.ring({ at: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], r: GEOMETRY.starR * 2.4, r1: GEOMETRY.starR * 1.1, color: CYAN, durS: 0.3, alpha: 0.7 })];
    },
    act: (c, m) => {
      const subjects = present(c, 'subject').flatMap((v) => { const at = pointOf(v.at); return at ? [{ pk: v.node.projectionKey, at }] : []; });
      // The star's place: the board's centre; with no board (a crop without one), the plan's star at (0, 0), and
      // the ring's stops scaled to the farthest piece.
      const board = c.board ?? { minX: -1, maxX: 1, minY: -1, maxY: 1 };
      const ordered = sweepOrder(subjects, board);
      const far = c.board ? 1 : Math.max(1e-6, ...ordered.map((x) => x.d));
      const order = ordered.map((x) => ({ ...x, d: x.d / far }));
      const step = Math.min(SWEEP_STEP_MS, SWEEP_SPREAD_MAX_MS / Math.max(1, order.length));
      const act = m.phases.find((p) => p.phase === 'act')?.durMs ?? 0;
      return [
        ...order.map(({ item }, i) => enterCmd({ pk: item.pk, quiet: true }, (i + 1) * step)),
        finaleCmd.sweep({ stops: order.map((x) => x.d), stepMs: step, durS: act / 1000 }),
      ];
    },
  },
};
