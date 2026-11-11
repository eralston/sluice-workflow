// What a captain at rest does with the piece beside it (2026-10-12, the theme's AmbientWork): while
// the piece is under way, now and then, a faint tractor beam that breathes in and out over an asteroid,
// or a short volley of two or three small bolts at a hive ship (hero blue, the bolt's own). Fireflies,
// not fireworks: ornament the interpreter plays only when the scene is calm, more often where people
// worked lately.
import { drawnR } from '../../chart/fx/commands';
import { TRACTOR } from '../../chart/fx/timing';
import type { AmbientWork } from '../../chart/fx/types';
import { burst, themeCmd } from './commands';

export const ambient: AmbientWork = {
  work(ship, piece, _activity, n) {
    const args = { from: ship.at, to: piece.at, toR: drawnR(piece) };
    return piece.node.kind === 'threat'
      ? burst({ from: args.from, to: args.to, toR: args.toR, n: 2 + (n % 2), gapMs: 240, scale: 0.7 })
      : [themeCmd.idleBeam({ ...args, durS: 3.6, color: TRACTOR })];
  },
};
