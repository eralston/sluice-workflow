// Block E fix-1: the plate-lit montage beats per pod in story time (what the app plays), to re-derive MONTAGE_BEATS.
// Run with vite-node -c vitest.config.ts. Fixture data only.
import { planOf, resolvePods, scheduleOf } from '../../../../../scripts/pacing-ledger';
for (const rp of resolvePods({ story: true })) {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, {});
  const lit = new Set<number>();
  for (const b of sch.beats.filter((x) => x.durationMs > 0)) if (planOf(rp.h, rp.areaKey, b, sch.limelight, {}).some((m) => m.plate)) lit.add(b.sourceUtc);
  console.log(rp.label, JSON.stringify([...lit].sort((a, b) => a - b).map((t) => new Date(t).toISOString())), 'wall', sch.wallMs, 'levers', sch.limelight?.direction?.levers.join(','));
}
