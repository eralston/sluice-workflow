import { it } from 'vitest';
import { planOf, resolvePods, scheduleOf } from '../../../../../../scripts/pacing-ledger';
import { nearWaits } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
it('near after summons', () => {
  for (const rp of resolvePods({ all: true })) {
    const sch = scheduleOf(rp.h, rp.scene, rp.tz, {});
    let enters = 0, near = 0; const waits: number[] = [];
    for (const b of sch.beats) {
      if (!(b.durationMs > 0)) continue;
      const plan = planOf(rp.h, rp.areaKey, b, sch.limelight, {});
      const nw = nearWaits(plan);
      for (const m of plan) {
        if (m.id !== RULE.facilityEnter) continue;
        enters++;
        const w = nw.get(m); const a = m.cast.agent?.[0];
        if (w && a && w.has(a)) { near++; const nx = plan.filter((n) => n !== m && [...(n.cast.agent ?? []), ...(n.cast.support ?? [])].includes(a) && n.afterMs >= m.afterMs).sort((x, y) => x.afterMs - y.afterMs)[0]; waits.push(nx?.id as unknown as number); }
      }
    }
    console.log(JSON.stringify({ pod: rp.label, enters, nearAfter: near, waits }));
  }
}, 300_000);
