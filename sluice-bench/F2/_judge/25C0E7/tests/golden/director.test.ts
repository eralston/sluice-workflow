// The director's choices per pod (27 E5a): levers, estimate, form counts and each day's climax, as a golden.
// In story time, as the app plays them (block E audit).
import { describe, expect, it, vi } from 'vitest';
import { resolvePods, scheduleOf } from '../../scripts/pacing-ledger';

vi.setConfig({ testTimeout: 180_000 });

describe('the director golden', () => {
  it('per pod: levers, estimate, form counts, climaxes', async () => {
    const out = resolvePods({ story: true }).map((rp) => {
      const d = scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction!;
      const counts: Record<string, number> = {};
      for (const f of d.forms.values()) counts[f] = (counts[f] ?? 0) + 1;
      return { pod: rp.label, levers: [...d.levers], estimateMs: Math.round(d.estimateMs), tempo: d.tempo ? Math.max(...d.tempo.values()) : null, forms: counts, climaxes: [...d.climaxes].sort() };
    });
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__golden__/director.json');
  });
});
