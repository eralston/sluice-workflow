// Block E audit probe (E10-Q1, the carried ledger-vs-app mismatch): every pod's schedule from the recorded bundle
// (what scripts/pacing-ledger and the director's tests read) against the same bundle in story time (what the app
// plays under Solar: src/renderer/src/v1/story.ts `presented`). Run with vite-node -c vitest.config.ts. Fixture data only.
import { storyTime } from '../../../../../src/shared/playback/storyTime';
import { planOf, resolvePods, scheduleOf } from '../../../../../scripts/pacing-ledger';
import { MONTAGE_BEATS } from '../../../../../tests/e2e/montageBeats';
const s = (ms: number) => (ms / 1000).toFixed(1);
for (const rp of resolvePods()) {
  const rows: string[] = [];
  for (const [name, h] of [['recorded', rp.h], ['story', storyTime(rp.h, rp.tz).history]] as const) {
    const sch = scheduleOf(h, rp.scene, rp.tz, {});
    const d = sch.limelight?.direction;
    const played = sch.beats.filter((b) => b.durationMs > 0);
    const lit = new Set<number>();
    let climax = 0, volley = 0;
    for (const b of played) for (const m of planOf(h, rp.areaKey, b, sch.limelight, {})) { if (m.plate) lit.add(b.sourceUtc); if (m.climax) climax++; }
    volley = d?.volleys?.size ?? 0;
    const listed = (MONTAGE_BEATS[rp.label] ?? []).map((x) => Date.parse(x));
    const missing = listed.filter((t) => !played.some((b) => Math.abs(b.sourceUtc - t) < 1000));
    rows.push(`${name}: beats ${sch.beats.length} played ${played.length} x ${s(sch.totalMs)} s wall ${s(sch.wallMs)} s levers [${d?.levers.join(',') ?? ''}] climax plays ${climax} volleys ${volley} lit montage ${lit.size} listed-missing ${missing.map((t) => new Date(t).toISOString().slice(5, 16)).join(' ') || '-'}`);
  }
  console.log(`${rp.label}\n  ${rows.join('\n  ')}`);
}
