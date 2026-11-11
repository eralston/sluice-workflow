// The pacing ledger's Built section (v1.4 E1): a built item's real saving per pod agrees with C2's estimate.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILT, buildBuilt } from '../../scripts/pacing-built';

const DIR = resolve(__dirname, '../../docs/progress/v1.4');
const rows = buildBuilt();

// E1 to E5's rows as committed before volleys (pacing-built.json at 3d4e402, E5c): id, pod, before, now, saved, estimate, diff (ms).
// Fixed values, so a change that moves them fails here rather than being regenerated into the json (27 E6, 2026-11-02).
const BEFORE_VOLLEYS: readonly (readonly [string, string, number, number, number, number, number])[] = [
    ['E1', 'Comet Pod', 62430, 61845, 585, 585, 0],
    ['E1', 'Nova Pod', 236340, 235755, 585, 585, 0],
    ['E1', 'Quasar Pod', 1054860, 1050180, 4680, 4680, 0],
    ['E1', 'Pulsar Pod', 675620, 670355, 5265, 5265, 0],
    ['E1', 'Convoy Planning Pod', 191340, 189585, 1755, 1755, 0],
    ['E1', 'Harbor Pod', 201170, 199415, 1755, 1755, 0],
    ['E4a', 'Comet Pod', 66665, 61845, 4820, 2000, 2820],
    ['E4a', 'Nova Pod', 238955, 235755, 3200, 2000, 1200],
    ['E4a', 'Quasar Pod', 1075780, 1050180, 25600, 16000, 9600],
    ['E4a', 'Pulsar Pod', 695955, 670355, 25600, 16000, 9600],
    ['E4a', 'Convoy Planning Pod', 195985, 189585, 6400, 4000, 2400],
    ['E4a', 'Harbor Pod', 210735, 199415, 11320, 6000, 5320],
    ['E4b', 'Comet Pod', 61845, 61845, 0, 0, 0],
    ['E4b', 'Nova Pod', 235755, 235755, 0, 0, 0],
    ['E4b', 'Quasar Pod', 1050180, 1050180, 0, 0, 0],
    ['E4b', 'Pulsar Pod', 670355, 670355, 0, 0, 0],
    ['E4b', 'Convoy Planning Pod', 189585, 189585, 0, 0, 0],
    ['E4b', 'Harbor Pod', 199415, 199415, 0, 300, -300],
    ['E4c', 'Comet Pod', 61845, 61845, 0, 3360, -3360],
    ['E4c', 'Nova Pod', 235755, 235755, 0, 2980, -2980],
    ['E4c', 'Quasar Pod', 1050180, 1050180, 0, 23400, -23400],
    ['E4c', 'Pulsar Pod', 670355, 670355, 0, 16080, -16080],
    ['E4c', 'Convoy Planning Pod', 189985, 189585, 400, 4400, -4000],
    ['E4c', 'Harbor Pod', 200115, 199415, 700, 6340, -5640],
    ['E4d', 'Comet Pod', 61845, 53815, 8030, 14090, -6060],
    ['E4d', 'Nova Pod', 235755, 191755, 44000, 48240, -4240],
    ['E4d', 'Quasar Pod', 1050180, 834960, 215220, 250740, -35520],
    ['E4d', 'Pulsar Pod', 670355, 562915, 107440, 144980, -37540],
    ['E4d', 'Convoy Planning Pod', 189585, 179725, 9860, 17020, -7160],
    ['E4d', 'Harbor Pod', 199415, 182805, 16610, 29930, -13320],
    ['E5a', 'Comet Pod', 61845, 61845, 0, 0, 0],
    ['E5a', 'Nova Pod', 235755, 224595, 11160, 11100, 60],
    ['E5a', 'Quasar Pod', 1050180, 301760, 748420, 308880, 439540],
    ['E5a', 'Pulsar Pod', 670355, 295714, 374641, 80220, 294421],
    ['E5a', 'Convoy Planning Pod', 189585, 188985, 600, 0, 600],
    ['E5a', 'Harbor Pod', 199415, 196515, 2900, 3980, -1080],
    ['E5b', 'Comet Pod', 61845, 61845, 0, 0, 0],
    ['E5b', 'Nova Pod', 224595, 224595, 0, 0, 0],
    ['E5b', 'Quasar Pod', 807460, 301760, 505700, 0, 505700],
    ['E5b', 'Pulsar Pod', 562395, 295714, 266681, 0, 266681],
    ['E5b', 'Convoy Planning Pod', 188985, 188985, 0, 0, 0],
    ['E5b', 'Harbor Pod', 196515, 196515, 0, 0, 0],
    ['E5c', 'Comet Pod', 61845, 61845, 0, 0, 0],
    ['E5c', 'Nova Pod', 224595, 224595, 0, 0, 0],
    ['E5c', 'Quasar Pod', 448150, 301760, 146390, 0, 146390],
    ['E5c', 'Pulsar Pod', 321638, 295714, 25924, 0, 25924],
    ['E5c', 'Convoy Planning Pod', 188985, 188985, 0, 0, 0],
    ['E5c', 'Harbor Pod', 196515, 196515, 0, 0, 0],
];

describe('the pacing ledger\'s Built section', () => {
  it('E1 saves what C2 estimated, on all six pods', () => {
    const e1 = rows.filter((r) => r.id === 'E1');
    expect(e1).toHaveLength(6);
    expect(Object.keys(BUILT[0]!.estimateMs)).toHaveLength(6);
    for (const r of e1) {
      expect(r.savedMs, r.pod).toBe(r.estimateMs);
      expect(r.diffMs, r.pod).toBe(0);
    }
  }, 120_000);

  it('E4a saves at least what C2 estimated, on all six pods', () => {
    const e4a = rows.filter((r) => r.id === 'E4a');
    expect(e4a).toHaveLength(6);
    for (const r of e4a) expect(r.savedMs, r.pod).toBeGreaterThanOrEqual(r.estimateMs);
  }, 120_000);

  it('E4b, E4c, E4d: the rows exist on all six pods and never cost time; E4d saves some', () => {
    for (const id of ['E4b', 'E4c', 'E4d']) {
      const r = rows.filter((x) => x.id === id);
      expect(r, id).toHaveLength(6);
      for (const x of r) expect(x.savedMs, `${id} ${x.pod}`).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);

  it('E4d, the short forms ceiling, saves time on every pod', () => {
    for (const x of rows.filter((r) => r.id === 'E4d')) expect(x.savedMs, x.pod).toBeGreaterThan(0);
  }, 120_000);

  it('E5a, the director pass: rows on all six pods, never costing time; Comet moves under 5%', () => {
    const r = rows.filter((x) => x.id === 'E5a');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    const comet = r.find((x) => x.pod.includes('Comet'))!;
    expect(Math.abs(comet.savedMs) / comet.beforeMs).toBeLessThan(0.05);
  }, 120_000);

  it('E5b, montage and adaptive speed: rows on all six pods, never costing time; Comet moves under 5%', () => {
    const r = rows.filter((x) => x.id === 'E5b');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    const comet = r.find((x) => x.pod.includes('Comet'))!;
    expect(Math.abs(comet.nowMs - 61845) / 61845).toBeLessThan(0.05);
  }, 120_000);

  it('E5c, light work and fewer hero shots: rows on all six pods, never costing time; Pulsar is inside 300 s; Comet within 5% of 61 845 ms', () => {
    const r = rows.filter((x) => x.id === 'E5c');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    expect(r.find((x) => x.pod.includes('Pulsar'))!.nowMs).toBeLessThanOrEqual(300_000);
    expect(Math.abs(r.find((x) => x.pod.includes('Comet'))!.nowMs - 61845) / 61845).toBeLessThan(0.05);
  }, 120_000);

  it('E6, multi-fire volleys before adaptive speed: rows on all six pods, never costing time; Pulsar saves some', () => {
    const r = rows.filter((x) => x.id === 'E6');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    expect(r.find((x) => x.pod.includes('Pulsar'))!.savedMs).toBeGreaterThan(0);
  }, 180_000);

  it('E6+, with every lever: Pulsar stays inside 300 s; Comet has no volley, so it saves nothing', () => {
    const r = rows.filter((x) => x.id === 'E6+');
    expect(r).toHaveLength(6);
    expect(r.find((x) => x.pod.includes('Pulsar'))!.nowMs).toBeLessThanOrEqual(300_000);
    expect(r.find((x) => x.pod.includes('Comet'))!.savedMs).toBe(0);
  }, 180_000);

  it('E7a, the sector sweep: rows on all six pods, never costing time; Harbor saves; Halcyon (no burst) is untouched', () => {
    const r = rows.filter((x) => x.id === 'E7');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    expect(r.find((x) => x.pod.includes('Harbor'))!.savedMs).toBeGreaterThan(0);
    for (const n of ['Comet', 'Nova', 'Quasar', 'Pulsar']) expect(r.find((x) => x.pod.includes(n))!.savedMs, n).toBe(0);
  }, 180_000);

  it('E8, rising tempo: rows on all six pods, each saves time; Comet within 5% of 61 845 ms', () => {
    const r = rows.filter((x) => x.id === 'E8');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThan(0);
    expect(Math.abs(r.find((x) => x.pod.includes('Comet'))!.nowMs - 61845) / 61845).toBeLessThan(0.05);
  }, 180_000);

  it('E10, late-day montage: rows on all six pods, never costing time; Convoy Planning and Harbor save; Comet unchanged within 5% of 60 795 ms', () => {
    const r = rows.filter((x) => x.id === 'E10');
    expect(r).toHaveLength(6);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
    for (const n of ['Convoy Planning', 'Harbor']) expect(r.find((x) => x.pod.includes(n))!.savedMs, n).toBeGreaterThan(0);
    expect(Math.abs(r.find((x) => x.pod.includes('Comet'))!.nowMs - 60795) / 60795).toBeLessThan(0.05);
  }, 180_000);

  it('F2, summon on the fly: rows on all seven pods; undirected, each pod saves at least a summon\'s 900 ms and never costs time; directed, never costs time', () => {
    const r = rows.filter((x) => x.id === 'F2');
    expect(r).toHaveLength(7);
    for (const x of r) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(900);
    // Comet has one summon: tell 300 and land 600 go (the plate's ride then fits inside the old hold).
    expect(r.find((x) => x.pod.includes('Comet'))!.savedMs).toBe(900);
    const d = rows.filter((x) => x.id === 'F2+');
    expect(d).toHaveLength(7);
    for (const x of d) expect(x.savedMs, x.pod).toBeGreaterThanOrEqual(0);
  }, 180_000);

  it('E1 to E5 measure what they measured before volleys: their rows are the ones committed before E6 (3d4e402)', () => {
    const before = BEFORE_VOLLEYS.map(([id, pod, beforeMs, nowMs, savedMs, estimateMs, diffMs]) => ({ id, pod, beforeMs, nowMs, savedMs, estimateMs, diffMs }));
    expect(rows.filter((x) => !x.id.startsWith('E6') && !x.id.startsWith('E7') && !x.id.startsWith('E8') && !x.id.startsWith('E10') && !x.id.startsWith('F2'))).toEqual(before);
  }, 120_000);

  it('the committed ledger has the Built section and the committed pacing-built.json is current', () => {
    expect(readFileSync(resolve(DIR, 'pacing-ledger.md'), 'utf8')).toContain('## Built');
    expect(JSON.parse(readFileSync(resolve(DIR, 'pacing-built.json'), 'utf8'))).toEqual(rows);
  }, 120_000);
});
