// Progress beam (13 §6, rule `agent.progress`, 27 E3): a captain made progress on work short of a
// close. The captain fires one simple beam from where it is, at the work: a phaser at an enemy ship,
// a mining beam at an asteroid (13 §6.1), at half the weight of a station's. No formation, no
// station. A merge's tender docks as the beam fires, so it visibly leaves its slot (R8). A small flare
// lands where the beam hits: a hit in the beam's blue, never a finish (INV-06). No move triggers it;
// the director (27 E5a) plays it for a merge that doesn't close its work.
import { RULE } from '@shared/engine/pace';
import { brighten, HERO, HERO_GLOW } from '../../../chart/art/energy';
import { aimOf, cmd, drawnR, one, phaseMs, present } from '../../../chart/fx/commands';
import type { CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

/** The beam's weight against a station's. */
const PROGRESS_BEAM_SCALE = 0.5;
/** Between one beam and the next, when the work has more than one piece (ms). */
const BEAM_GAP_MS = 150;

/** What the beam aims at: the work, else the subject. */
function aimsOf(c: CastViews) {
  const targets = present(c, 'target');
  if (targets.length) return targets;
  const s = one(c, 'subject');
  return s && !s.gone ? [aimOf(s)] : [];
}

export const progressBeam: ManeuverDef = {
  id: RULE.agentProgress,
  title: 'Progress beam',
  phase: {
    gather: (c, m) => {
      const a = one(c, 'agent');
      if (!a || a.gone) return [];
      const R = drawnR(a);
      return [cmd.ring({ at: a.at, r: R * 2.2, r1: R * 1.1, color: HERO_GLOW, durS: phaseMs(m, 'gather') / 1000, alpha: 0.7 })];
    },
    act: (c, m) => {
      const a = one(c, 'agent');
      if (!a || a.gone) return [];
      const durS = phaseMs(m, 'act') / 1000;
      const calls: CommandCall[] = [];
      aimsOf(c).forEach((t, i) => {
        const args = { from: a.at, to: t.at, toR: drawnR(t), durS: durS - (i * BEAM_GAP_MS) / 1000, scale: PROGRESS_BEAM_SCALE };
        calls.push(t.node.kind === 'threat' ? themeCmd.phaser(args, i * BEAM_GAP_MS) : themeCmd.mine({ ...args, seed: t.node.seed }, i * BEAM_GAP_MS));
      });
      // A merge: the tender leaves its slot as the beam fires.
      const att = one(c, 'attachment');
      const fac = one(c, 'facility');
      if (fac && att) calls.push(cmd.act(fac.key, 'dock', 0, att.slot));
      return calls;
    },
    echo: (c) =>
      aimsOf(c).map((t) => cmd.flare({ at: t.at, r: drawnR(t), color: brighten(HERO, t.node.kind === 'threat' ? 0.2 : 0.3), scale: 1.1, linger: 1 })),
  },
};
