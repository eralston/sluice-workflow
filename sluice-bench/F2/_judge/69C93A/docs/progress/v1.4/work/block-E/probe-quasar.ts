// Block E audit probe: the ledger's Quasar schedule around 2026-09-15 19:00-20:30Z (E10-Q1).
import { resolvePods, scheduleOf } from '../../../../../scripts/pacing-ledger';
const tz = process.argv[2] ?? undefined;
for (const rp of resolvePods().filter((p) => p.label === 'Quasar Pod')) {
  const sch = scheduleOf(rp.h, rp.scene, tz ?? rp.tz, {});
  console.log('tz', tz ?? rp.tz, 'beats', sch.beats.length, 'played', sch.beats.filter((b) => b.durationMs > 0).length, 'total', sch.totalMs, 'wall', sch.wallMs);
  for (const b of sch.beats) {
    const iso = new Date(b.sourceUtc).toISOString();
    if (iso >= '2026-09-15T18:50' && iso <= '2026-09-15T20:30') console.log(iso, 'd', b.durationMs, 'start', b.presentationStartMs, 'day', b.opensDay ?? '');
  }
  console.log('range', new Date(rp.h.range.startUtc).toISOString(), new Date(rp.h.range.endUtc).toISOString(), 'events', rp.h.events.length);
}
