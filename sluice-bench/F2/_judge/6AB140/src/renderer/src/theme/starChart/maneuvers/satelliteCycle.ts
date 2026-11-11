// Satellite cycle (13 §6, rule `attachment.settle`, every settle but a merge): the station charges up
// (its light gathers), operates, then settles with a small flare in the attachment's new rung. The
// author works the station itself with a tractor beam, never the tender (a tender is only a count of
// open PRs, 2026-10-12); the approvers lend the author their energy, or the station when the author
// has no ship here (13 §6.1, 2026-10-13).
import { RULE } from '@shared/engine/pace';
import { RUNG_COLOR } from '../../../chart/art/progress';
import { cmd, drawnR, one, phaseMs, present } from '../../../chart/fx/commands';
import { TRACTOR } from '../../../chart/fx/timing';
import type { CommandCall, ManeuverDef } from '../../../chart/fx/types';
import { themeCmd } from '../commands';

export const satelliteCycle: ManeuverDef = {
  id: RULE.attachmentSettle,
  title: 'Satellite cycle',
  phase: {
    gather: (c, m) => {
      const f = one(c, 'facility');
      const color = RUNG_COLOR[m.to?.rung ?? 'underway'];
      return f ? [cmd.ring({ at: f.at, r: drawnR(f) * 1.8, r1: drawnR(f) * 0.9, color, durS: phaseMs(m, 'gather') / 1000, alpha: 0.6 })] : [];
    },
    act: (c, m) => {
      const f = one(c, 'facility');
      if (!f) return [];
      const act = phaseMs(m, 'act');
      const calls: CommandCall[] = [cmd.act(f.key, 'operate', 0, one(c, 'attachment')?.slot)];
      const author = present(c, 'agent')[0];
      if (author) calls.push(cmd.tractor({ from: author.at, to: f.at, toR: drawnR(f) * 0.8, color: TRACTOR, durS: act / 1000 }));
      present(c, 'support').forEach((s, i) => {
        const to = author ?? f;
        calls.push(themeCmd.energy({ from: s.at, to: to.at, toR: author ? drawnR(author) : drawnR(f) * 0.8, durS: (act - i * 90) / 1000 }, i * 90));
      });
      return calls;
    },
    land: (c, m) => {
      const f = one(c, 'facility');
      const rung = m.to?.rung ?? 'underway';
      return f ? [cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.4, color: RUNG_COLOR[rung], durS: 0.9, alpha: 0.6 })] : [];
    },
    echo: (c, m) => {
      const f = one(c, 'facility');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: RUNG_COLOR[m.to?.rung ?? 'underway'], durS: 0.4, alpha: 0.4 })] : [];
    },
  },
};
