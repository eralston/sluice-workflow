// Reviewer probe (F2 round 1): how often the summoner's next sortie takes its ship over before the pass's plate is done.
import { planOf, resolvePods, scheduleOf } from '../../../../../scripts/pacing-ledger';
import { flyingPlay, gatherAtOf, CREW_FOLD_MS, NOTE_MIN_MS } from '../../../../../src/shared/engine/maneuvers';
import { RULE } from '../../../../../src/shared/engine/pace';
const WHOLE_END = 715 + CREW_FOLD_MS + NOTE_MIN_MS;
for (const rp of resolvePods({ all: true })) {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, {});
  let enters = 0, named = 0, cut = 0; const gaps: number[] = [];
  for (const b of sch.beats.filter((x) => x.durationMs > 0)) {
    const plan = planOf(rp.h, rp.areaKey, b, sch.limelight, {});
    for (const m of plan) {
      if (m.id !== RULE.facilityEnter) continue;
      enters++;
      if (m.quiet || m.plate) continue;
      named++;
      const ag = (m.cast.agent ?? [])[0];
      if (!ag) continue;
      const next = plan.filter((n) => n !== m && n.afterMs >= m.afterMs && flyingPlay(n) && !n.quiet && !n.plate && n.phases.some((p) => p.phase === 'gather') && [...(n.cast.agent ?? []), ...(n.cast.support ?? [])].includes(ag))
        .map((n) => n.afterMs + gatherAtOf(n.phases) - m.afterMs).sort((a, b) => a - b)[0];
      if (next !== undefined) { gaps.push(next); if (next < WHOLE_END) cut++; }
    }
  }
  console.log(rp.label, { enters, named, nextFlyingWithin: gaps.length, cutBeforeWholeEnds: cut, minGap: Math.min(...gaps), gaps: gaps.slice(0, 12) });
}
