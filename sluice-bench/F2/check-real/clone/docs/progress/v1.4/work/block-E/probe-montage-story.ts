// Block E audit probe (E10-Q1): the plate-lit montage beats in story time (what the app plays) against MONTAGE_BEATS
// (found on the recorded bundle). Run with vite-node -c vitest.config.ts. Fixture data only.
import { storyTime } from '../../../../../src/shared/playback/storyTime';
import { planOf, resolvePods, scheduleOf } from '../../../../../scripts/pacing-ledger';
import { MONTAGE_BEATS } from '../../../../../tests/e2e/montageBeats';
const iso = (t: number) => new Date(t).toISOString().slice(5, 19);
for (const rp of resolvePods()) {
  const h = storyTime(rp.h, rp.tz).history;
  const sch = scheduleOf(h, rp.scene, rp.tz, {});
  const lit: number[] = [];
  for (const b of sch.beats.filter((x) => x.durationMs > 0)) if (planOf(h, rp.areaKey, b, sch.limelight, {}).some((m) => m.plate)) lit.push(b.sourceUtc);
  const listed = (MONTAGE_BEATS[rp.label] ?? []).map((x) => Date.parse(x));
  const near = (a: number, xs: number[]) => xs.some((x) => Math.abs(x - a) < 1000);
  console.log(rp.label, `app lit ${lit.length}, listed ${listed.length}`,
    '| app-only:', lit.filter((t) => !near(t, listed)).map(iso).join(' ') || '-',
    '| listed, not a montage in the app:', listed.filter((t) => !near(t, lit)).map(iso).join(' ') || '-');
}
