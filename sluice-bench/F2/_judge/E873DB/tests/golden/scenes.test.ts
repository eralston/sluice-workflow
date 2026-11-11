// The characterization net for the pluggable hierarchy refactor (decided 2026-10-07): every scene of
// every scope in every scenario, as it projects today, plus the hierarchy-shaped answers that
// playback leans on (pass-through, in-view keys, beat focus, follow anchors). The refactor must leave
// all of it byte-identical.
import { describe, expect, it } from 'vitest';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene, soleFeature } from '@shared/scene/projectScene';
import type { SceneKey } from '@shared/contracts/view';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { buildHighlights, sceneEntityKeys } from '@shared/playback/highlights';
import { followAnchors, storyAnchors } from '@shared/playback/follow';
import { scenarios } from '@fixtures/scenarios';
import { scenarioScopes, toHistory } from '@fixtures/dsl';
import { mapping, plainGraph } from './helpers';
import { BACKLOG } from '@shared/hierarchy/backlog';

// The bug outbreak and the solo desk are areas inside orbit-week: its scopes cover them.
const all = scenarios;

describe.each(all.map((s) => [s.name, s] as const))('every scene: %s', (name, s) => {
  it('projects, plays, and follows as it does today', async () => {
    const out: unknown[] = [];
    for (const scope of scenarioScopes(s, mapping)) {
      const h = toHistory(s, mapping, scope);
      const sch = buildBeatSchedule(h, h.range, s.tz);
      const instants = [0.5, 1].map((f) => (f === 1 ? h.range.endUtc - 1 : sch.stateUtc(sch.totalMs * f)));
      const sector: SceneKey = BACKLOG.format(BACKLOG.sceneForScope(h.scope));
      // Every scene reachable from the sector at the end, by following zoomTo two levels down.
      const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
      const scenes: SceneKey[] = [sector];
      for (const n of projectScene(h, end, sector, LAYOUT_VERSION).nodes) {
        if (!n.zoomTo) continue;
        scenes.push(n.zoomTo);
        for (const m of projectScene(h, end, n.zoomTo, LAYOUT_VERSION).nodes) if (m.zoomTo && !scenes.includes(m.zoomTo)) scenes.push(m.zoomTo);
      }
      const captains = h.entities.captains.map((c) => c.key);
      out.push({
        scope,
        sole: soleFeature(h, sector),
        beats: sch.beats.map((b) => b.eventKeys),
        scenes: scenes.map((scene) => ({
          scene,
          inView: [...(sceneEntityKeys(h, scene) ?? [])].sort(),
          highlights: buildHighlights(h, h.range, s.tz, scene).beats.map((b) => b.eventKeys),
          graphs: instants.map((t) => plainGraph(projectScene(h, snapshotAt(h, t, 'knownThen'), scene, LAYOUT_VERSION))),
        })),
        follow: captains.map((c) => ({ captain: c, anchors: followAnchors(h, c), story: storyAnchors(h, c) })),
      });
    }
    await expect(JSON.stringify(out, null, 1) + '\n').toMatchFileSnapshot(`./__golden__/${name}.scenes.json`);
  });
});
