// 23 C6 (R9, INV-14): at every playhead of every sprint fixture, a station draws min(open PRs, cap) tenders in
// distinct slots and "+N" is exactly the rest, so "+N" never shows with a free slot, even with zero tenders.
// A PR waiting past the cap is promoted into the first slot that frees; a drawn tender never changes slot
// while it stays open, across a seek and across play.
import { describe, expect, it, vi } from 'vitest';
import halcyon from '../../fixtures/scenarios/sprint-pods';
import podSprint from '../../fixtures/scenarios/v1/pod-sprint';
import meridianSprint from '../../fixtures/scenarios/v1/meridian-sprint';
import { sprintScopes, toHistory } from '../../fixtures/dsl';
import { GEOMETRY } from '@shared/engine/solar/version';
import { SOLAR } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const bits = (m: number) => { let n = 0; for (let x = m; x; x &= x - 1) n++; return n; };
const SAMPLES = 70;

describe.each([halcyon, podSprint, meridianSprint])('station slots: $name', (sc) => {
  const cap = GEOMETRY.compoundCap;
  it('draws min(open, cap) and counts the rest, at every sampled playhead, and keeps drawn tenders in their slots', () => {
    let stations = 0;
    let overflow = 0;
    for (const scope of sprintScopes(sc)) {
      const h = toHistory(sc, mapping, scope);
      const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
      for (const pod of pods) {
        const scene = SOLAR.format({ level: 'pod', key: pod.areaKey });
        // key -> slot while it is drawn, from the last playhead (play order); a PR still open and drawn keeps it.
        const was = new Map<string, number>();
        for (let i = 0; i <= SAMPLES; i++) {
          const t = Math.min(h.range.endUtc - 1, Math.round(h.range.startUtc + ((h.range.endUtc - h.range.startUtc) * i) / SAMPLES));
          const g = projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION, SOLAR);
          const now = new Map<string, number>();
          for (const n of g.nodes) {
            if (n.kind !== 'facility' || !n.piece || !n.compound) continue;
            stations++;
            const open = n.piece.open ?? 0;
            const mask = n.piece.slots ?? 0;
            const drawn = n.compound.slots.filter((c) => c.role === 'attachment');
            expect(bits(mask)).toBe(Math.min(open, cap));
            expect(drawn).toHaveLength(bits(mask));
            expect(new Set(drawn.map((c) => c.slot)).size).toBe(drawn.length);
            expect(n.compound.more).toBe(open - drawn.length);
            if (n.compound.more > 0) { overflow++; expect(drawn).toHaveLength(cap); }
            for (const c of drawn) {
              const id = `${n.projectionKey}|${c.key}`;
              now.set(id, c.slot);
              // Playing forward, a tender that stays drawn stays put.
              if (was.has(id)) expect(c.slot).toBe(was.get(id));
            }
          }
          was.clear();
          for (const [k, v] of now) was.set(k, v);
        }
      }
    }
    expect(stations).toBeGreaterThan(0);
    // pod-sprint exercises "+N" (Harbor Pod's tide-gateway), or this proves little.
    if (sc === podSprint) expect(overflow).toBeGreaterThan(0);
  });
});
