// AC-09 (G): seeking to an instant gives the same Snapshot and ViewGraph whatever came before, and
// matches the checked-in golden state at a few named instants.
import { describe, expect, it } from 'vitest';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import type { SceneKey } from '@shared/contracts/view';
import { scenarios } from '@fixtures/scenarios';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { historyOf, plainGraph, plainSnapshot } from './helpers';
import { BACKLOG } from '@shared/hierarchy/backlog';

describe.each(scenarios.map((s) => [s.name, s] as const))('seek determinism: %s', (name, s) => {
  const h = historyOf(s);
  const sch = buildBeatSchedule(h, h.range, s.tz);
  const sector: SceneKey = BACKLOG.format(BACKLOG.sceneForScope(h.scope));
  const features = [...snapshotAt(h, h.range.endUtc - 1, 'knownThen').workItems.values()].filter((w) => w.kind === 'feature').map((w) => w.key).sort();
  const scenes: SceneKey[] = [sector, `feature:${features[0]!}`];
  const instants = [0.25, 0.5, 0.75].map((f) => sch.stateUtc(sch.totalMs * f));
  const view = (t: number) => ({
    snapshot: plainSnapshot(snapshotAt(h, t, 'knownThen')),
    graphs: scenes.map((sc) => plainGraph(projectScene(h, snapshotAt(h, t, 'knownThen'), sc, LAYOUT_VERSION))),
  });

  it('gives identical results from different prior states', () => {
    for (const t of instants) {
      const fresh = view(t);
      // Visit other instants (forward, back, the end, the start) and come back.
      for (const other of [h.range.endUtc - 1, h.range.startUtc, ...instants.slice().reverse()]) view(other);
      expect(view(t)).toEqual(fresh);
    }
  });

  it('matches the golden state at its quarter points', async () => {
    const golden = instants.map((t) => ({ at: new Date(t).toISOString(), ...view(t) }));
    await expect(JSON.stringify(golden, null, 1) + '\n').toMatchFileSnapshot(`./__golden__/${name}.seek.json`);
  });
});
