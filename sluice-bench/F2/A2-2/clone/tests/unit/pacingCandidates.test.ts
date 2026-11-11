// The pacing candidates (v1.4 C2): the engine door is unchanged, the estimates are deterministic and complete.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACE_RULES } from '@shared/engine/pace';
import { CANDIDATE_IDS, buildCandidates, renderCandidates } from '../../scripts/pacing-candidates';
import { buildLedger, resolvePods, scheduleOf } from '../../scripts/pacing-ledger';

const DIR = resolve(__dirname, '../../docs/progress/v1.4');
const full = buildCandidates();
const ledger = buildLedger();

describe('the pacing candidates', () => {
  it('schedules with PACE_RULES exactly as without rules, and the ledger totals agree', () => {
    for (const rp of resolvePods()) {
      const a = scheduleOf(rp.h, rp.scene, rp.tz, {});
      const b = scheduleOf(rp.h, rp.scene, rp.tz, { rules: PACE_RULES });
      expect(b.totalMs).toBe(a.totalMs);
      expect(Math.round(a.totalMs)).toBe(ledger.pods.find((p) => p.label === rp.label)!.totalMs);
    }
  }, 120_000);

  it('is deterministic', () => {
    const a = JSON.stringify(buildCandidates({}, ['Comet Pod']));
    expect(JSON.stringify(buildCandidates({}, ['Comet Pod']))).toBe(a);
  }, 120_000);

  it('covers six pods and every candidate, in order', () => {
    expect(full.pods).toHaveLength(6);
    for (const p of full.pods) {
      expect(p.rows.map((r) => r.id)).toEqual(CANDIDATE_IDS);
      for (const r of p.rows) expect(r.savingPct).toBe(Math.round((r.savingMs / p.baselineMs) * 1000) / 10);
      const row = (id: string) => p.rows.find((r) => r.id === id)!;
      expect(row('E3').savingMs).toBe(0);
      expect(row('E9').savingMs).toBe(0);
      expect(row('E8').savingMs).toBeLessThanOrEqual(row('E8-250').savingMs);
    }
    expect(full.pods[0]!.label).toBe('Comet Pod');
  }, 120_000);

  it('renders the section and agrees with the committed files', () => {
    const md = renderCandidates(full);
    expect(md).toContain('## Candidates');
    expect(md).toMatch(/\| Item \| Comet Pod \|/);
    for (const p of full.pods) {
      const i = md.indexOf(`### ${p.label}\n`);
      expect(i).toBeGreaterThan(-1);
      expect(md.slice(i).split('\n').filter((l) => l.startsWith('|')).length).toBeGreaterThan(CANDIDATE_IDS.length);
    }
    expect(existsSync(resolve(DIR, 'pacing-ledger.md'))).toBe(true);
    expect(readFileSync(resolve(DIR, 'pacing-ledger.md'), 'utf8')).toContain('## Candidates');
    const committed = JSON.parse(readFileSync(resolve(DIR, 'pacing-candidates.json'), 'utf8')) as { pods: { label: string; rows: { id: string }[] }[] };
    expect(committed.pods.map((p) => [p.label, p.rows.map((r) => r.id)])).toEqual(full.pods.map((p) => [p.label, p.rows.map((r) => r.id)]));
  }, 120_000);
});
