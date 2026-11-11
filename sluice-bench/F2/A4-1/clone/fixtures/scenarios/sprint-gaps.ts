// Slice 7's sprint coverage cases (decided 2026-10-10), on their own so the other scenarios' goldens
// stay put. Invented names only (INV-18).
// - A child iteration: "Sprint 7\Hardening" (no dates of its own) holds a Story that belongs to Sprint 7.
// - A double leaver: a Story in Sprint 7 under Orbit Pod that later moves to another area and to the
//   next sprint, so it's no longer in the sprint or the pod: only the per-pod EVER query finds it.
// - Teams on their own cadences: Orbit Team runs Sprint 7 and 8; Relay Team runs "Relay 3", which
//   overlaps them. Each pod should see its own team's sprints.
import { scenario } from '../dsl';

const S7 = 'Lyra Station\\Sprint 7';
const HARDEN = 'Lyra Station\\Sprint 7\\Hardening';
const S8 = 'Lyra Station\\Sprint 8';
const R3 = 'Lyra Station\\Relay 3';
const ORBIT = 'Lyra Station\\Orbit Pod';
const RELAY = 'Lyra Station\\Relay Pod';
const ARCHIVE = 'Lyra Station\\Archive';

export default scenario('sprint-gaps', {
  project: 'Lyra Station',
  tz: 'UTC',
  range: ['2026-09-14T00:00:00Z', '2026-09-21T00:00:00Z'],
})
  .area('Lyra Station', 7000)
  .area(ORBIT, 7001, { favorite: true, defaultScope: true })
  .area(RELAY, 7002, { favorite: true })
  .area(ARCHIVE, 7003)
  .iteration(S7, 7101, '2026-09-14T00:00:00Z', '2026-09-28T00:00:00Z')
  .iteration(HARDEN, 7102)
  .iteration(S8, 7103, '2026-09-28T00:00:00Z', '2026-10-12T00:00:00Z')
  .iteration(R3, 7104, '2026-09-10T00:00:00Z', '2026-09-24T00:00:00Z')
  .team('Orbit Team', { areas: [ORBIT], iterations: [S7, S8] })
  .team('Relay Team', { areas: [RELAY], iterations: [R3] })
  .repo('lyra-core')
  .person('iris', 'Iris Calder')
  .person('bo', 'Bo Tanaka')
  .at('2026-09-01T10:00:00Z')
  .feature(7501, 'Signal relay', { area: 'Lyra Station', state: 'Active' })
  .at('2026-09-14T10:00:00Z')
  .story(7601, 'Beacon handshake', { parent: 7501, area: ORBIT, iteration: S7, assignee: 'iris' })
  .story(7602, 'Retry budget for flaky links', { parent: 7501, area: ORBIT, iteration: HARDEN, assignee: 'bo' })
  .story(7603, 'Telemetry export', { parent: 7501, area: ORBIT, iteration: S7, assignee: 'iris' })
  .story(7701, 'Relay queue', { parent: 7501, area: RELAY, iteration: R3, assignee: 'bo' })
  .at('2026-09-15T10:00:00Z').state(7601, 'Active').state(7602, 'Active').state(7603, 'Active').state(7701, 'Active')
  // The double leaver: out of the pod, then out of the sprint.
  .at('2026-09-17T10:00:00Z').moveArea(7603, ARCHIVE, { by: 'iris' })
  .at('2026-09-17T11:00:00Z').moveIteration(7603, S8, { by: 'iris' })
  .at('2026-09-18T10:00:00Z').state(7602, 'Resolved')
  .build();
