// All clear (13 §6, rule `region.clear`, a protected moment, 2026-10-13): the region's last open
// threat has fallen. It plays after that strike run: the last enemy signal dies away on the wreck, a
// calm all-clear in hero blue sweeps from the star across the system, each planet catching it in
// turn, and the star breathes. The caged wreck settles in gold. (Until 19 S2 it also lifted a red
// threat light off the frontier belt; the belt is never red now.)
import { RULE } from '@shared/engine/pace';
import { AURA } from '../../../chart/art/aura';
import { lighten } from '../../../chart/art/lit';
import { SUCCESS } from '../../../chart/art/progress';
import { cmd, drawnR, one, phaseMs } from '../../../chart/fx/commands';
import type { ManeuverDef } from '../../../chart/fx/types';
import { finaleCmd } from '../finales';

export const regionClear: ManeuverDef = {
  id: RULE.regionClear,
  title: 'All clear',
  phase: {
    tell: (c) => {
      const s = one(c, 'subject');
      // The last enemy signal dies away on the wreck.
      return s ? [cmd.ring({ at: s.at, r: drawnR(s) * 1.5, r1: drawnR(s) * 0.6, color: AURA.threat, durS: 0.4, alpha: 0.5 })] : [];
    },
    act: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      return [finaleCmd.allClear({ durS: (phaseMs(m, 'act') + phaseMs(m, 'echo')) / 1000 })];
    },
    echo: (c, m) => {
      const s = one(c, 'subject');
      if (!s) return [];
      return [cmd.ring({ at: s.at, r: drawnR(s), r1: drawnR(s) * 1.5, color: lighten(SUCCESS, 0.2), durS: phaseMs(m, 'echo') / 1000 * 0.7, alpha: 0.55 })];
    },
  },
};
