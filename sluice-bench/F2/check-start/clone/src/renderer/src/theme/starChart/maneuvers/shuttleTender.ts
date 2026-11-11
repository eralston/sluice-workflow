// Shuttle tender (13 §6, rule `attachment.open`): a new attachment's shuttle launches from the
// station's bay to join its patrol round the station. Its author is named by the cast label, with no
// beam to the station (27 E1: the summons already said it). (A merged shuttle docking is Power link's.)
import { RULE } from '@shared/engine/pace';
import { PROGRESS } from '../../../chart/art/progress';
import { cmd, drawnR, one } from '../../../chart/fx/commands';
import type { ManeuverDef } from '../../../chart/fx/types';

export const shuttleTender: ManeuverDef = {
  id: RULE.attachmentOpen,
  title: 'Shuttle tender',
  phase: {
    tell: (c) => {
      const f = one(c, 'facility');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f) * 0.6, r1: drawnR(f), color: PROGRESS, durS: 0.3, alpha: 0.6 })] : [];
    },
    act: (c) => {
      const f = one(c, 'facility');
      return f ? [cmd.act(f.key, 'launch', 0, one(c, 'attachment')?.slot)] : [];
    },
    land: (c) => {
      const f = one(c, 'facility');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.35, color: PROGRESS, durS: 0.6, alpha: 0.6 })] : [];
    },
  },
};
