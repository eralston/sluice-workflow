// Halcyon Reach (rewritten 2026-10-27 for the demo): one sprint, five pods.
// Comet is one captain and two items; Nova three developers on a shared repo; Quasar six developers
// and a manager on a polyrepo; Pulsar twenty captains, every ship; Meteor (27 F1) one captain's run of 36 PRs in a minute. The generated pods come from fixed
// seeds (halcyon/pods.ts), so the data is the same on every run. Sprint 40 is a quiet one before it.
// Invented names only (INV-18).
import { scenario } from '../dsl';
import { replay, type Ev } from './halcyon/gen';
import { COMET_CAST, COMET_REPOS, METEOR_CAST, METEOR_REPOS, NOVA_CAST, NOVA_REPOS, PULSAR_CAST, PULSAR_REPOS, QUASAR_CAST, QUASAR_REPOS } from './halcyon/cast';
import { runEvents } from './halcyon/runs';
import { COMET, comet, METEOR, meteor, NOVA, nova, PULSAR, pulsar, QUASAR, quasar, S41 } from './halcyon/pods';

const S40 = 'Halcyon Reach\\Sprint 40';
const repoName = (x: string) => x.split(' ')[0]!;
const t = (iso: string) => Date.parse(iso);

// Sprint 40: three Stories finished before the demo's sprint begins, so the sprint list isn't a single entry.
const quiet: Ev[] = [
  { t: t('2026-08-28T18:00:00Z'), fn: (b) => b.story(10020, 'Quick-add a booking', { parent: 9001, area: COMET, iteration: S40, assignee: COMET_CAST[0]!.handle }) },
  { t: t('2026-08-28T18:01:00Z'), fn: (b) => b.story(10021, 'Template picker for messages', { parent: 9002, area: NOVA, iteration: S40, assignee: NOVA_CAST[0]!.handle }) },
  { t: t('2026-08-28T18:02:00Z'), fn: (b) => b.story(10022, 'Mark messages as read', { parent: 9002, area: NOVA, iteration: S40, assignee: NOVA_CAST[1]!.handle }) },
  { t: t('2026-09-01T17:00:00Z'), fn: (b) => b.state(10020, 'Active').state(10021, 'Active').state(10022, 'Active') },
  { t: t('2026-09-08T18:00:00Z'), fn: (b) => b.state(10020, 'Closed') },
  { t: t('2026-09-10T18:00:00Z'), fn: (b) => b.state(10021, 'Closed').state(10022, 'Closed') },
];

const features: Ev[] = [
  [9001, 'Booking calendar'], [9002, 'Guest messaging'], [9003, 'Rates and payments'], [9004, 'Property operations'],
  [9005, 'Channel integrations'], [9006, 'Host tools'],
  // B3: more Features for Quasar and Pulsar, so their star plates name three and say `+N more`.
  [9007, 'Owner statements'], [9008, 'Housekeeping schedules'], [9009, 'Dynamic pricing'],
  [9010, 'Guest check-in'], [9011, 'Maintenance requests'], [9012, 'Reporting and exports'],
  // Pulsar has ten, so the opened list is longer than the eight lines it shows before it scrolls.
  [9013, 'Vendor payouts'], [9014, 'Tax summaries'], [9015, 'Calendar sync'], [9016, 'Review replies'], [9017, 'Door codes'],
  // Meteor's run and its neighbours hang off one Feature.
  [9018, 'Platform upkeep'],
].map(([id, title]) => ({ t: t('2026-08-20T16:00:00Z'), fn: (b) => b.feature(id as number, title as string, { area: 'Halcyon Reach', state: 'Active' }) }));

const b = scenario('sprint-pods', {
  project: 'Halcyon Reach',
  tz: 'America/Los_Angeles',
  // The whole of Sprint 41: a sprint is its own clock, ended by the scenario's now.
  range: ['2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z'],
})
  // B4: the team's Stories board. Code Review is a custom column inside the Active state (emitItem moves an item into it when
  // its PR opens), and Resolved is split: Ready to Accept is its Done half.
  .board({
    columns: [{ name: 'New' }, { name: 'Ready' }, { name: 'Active' }, { name: 'Code Review' }, { name: 'Resolved', split: true }, { name: 'Closed' }],
    byState: {
      New: 'New', Ready: 'Ready', 'Ready for Review': 'Ready', Deferred: 'Ready', Active: 'Active', Resolved: 'Resolved',
      'Ready to Accept': { column: 'Resolved', done: true }, Closed: 'Closed', Removed: 'Closed', Rejected: 'Closed',
    },
  })
  .area('Halcyon Reach', 8000)
  .area(COMET, 8001, { favorite: true, defaultScope: true })
  .area(NOVA, 8002, { favorite: true })
  .area(QUASAR, 8003, { favorite: true })
  .area(PULSAR, 8004, { favorite: true })
  .area(METEOR, 8005, { favorite: true })
  .iteration(S40, 8100, '2026-08-31T07:00:00Z', '2026-09-14T07:00:00Z')
  .iteration(S41, 8101, '2026-09-14T07:00:00Z', '2026-09-28T07:00:00Z');

for (const r of [COMET_REPOS, NOVA_REPOS, QUASAR_REPOS, PULSAR_REPOS, METEOR_REPOS].flat()) b.repo(repoName(r));
for (const p of [COMET_CAST, NOVA_CAST, QUASAR_CAST, PULSAR_CAST, METEOR_CAST].flat()) b.person(p.handle, p.name);

export default replay(b, [...features, ...quiet, ...comet().events, ...nova().events, ...quasar().events, ...pulsar().events, ...meteor().events, ...runEvents()]).build();
