// Primary scenario (03 §8). Invented names only.
// Most entities are created before the range so the week itself holds ~8–10 beats.
import { scenario } from '../dsl';
import { bugOutbreak } from './bug-outbreak';
import { soloDesk } from './solo-desk';

const MINA_AVATAR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMmY2YjVjIi8+PGNpcmNsZSBjeD0iNDgiIGN5PSIxNCIgcj0iOSIgZmlsbD0iI2U5YTY2YSIgb3BhY2l0eT0iMC41NSIvPjxwYXRoIGQ9Ik04IDY0YzItMTQgMTItMjAgMjQtMjBzMjIgNiAyNCAyMHoiIGZpbGw9IiNjODU1M2QiLz48cGF0aCBkPSJNMjYgNDRoMTJ2NmE2IDYgMCAwIDEtMTIgMHoiIGZpbGw9IiNlOGI0OGMiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjMwIiByPSIxMyIgZmlsbD0iI2VmYzM5YiIvPjxwYXRoIGQ9Ik0xOCAzMGMwLTExIDctMTcgMTUtMTcgOSAwIDE0IDcgMTMgMTctMy02LTktOS0xNS05LTYgMC0xMCAzLTEzIDl6IiBmaWxsPSIjMmExZjI0Ii8+PGNpcmNsZSBjeD0iMjciIGN5PSIzMSIgcj0iMS42IiBmaWxsPSIjMmExZjI0Ii8+PGNpcmNsZSBjeD0iMzciIGN5PSIzMSIgcj0iMS42IiBmaWxsPSIjMmExZjI0Ii8+PHBhdGggZD0iTTI4IDM3cTQgMyA4IDAiIHN0cm9rZT0iI2E1NTIzZiIgc3Ryb2tlLXdpZHRoPSIxLjYiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==';

export default scenario('orbit-week', {
  project: 'Nimbus Deck',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'], // Mon 00:00 PDT -> next Mon
})
  .area('Nimbus Deck', 10)
  .area('Nimbus Deck\\Comet Crew', 11, { favorite: true, defaultScope: true })
  .area('Nimbus Deck\\Lantern Squad', 12, { favorite: true })
  .repo('ledger-svc')
  .repo('portal-web')
  .repo('billing-api')
  .repo('statement-render')
  .repo('notify-svc')
  .person('ava', 'Ava Lindqvist')
  .person('rafe', 'Rafe Okoro')
  // An uploaded picture: an invented illustration (never a real photo), as ADO would serve it inline.
  .person('mina', 'Mina Sato', { avatar: MINA_AVATAR })
  // Reviewers: invented people who review but hold no work here, so they arrive as guests (06 §5 formation).
  .person('jo', 'Jo Marchetti')
  .person('sana', 'Sana Okafor')

  // --- Epics -------------------------------------------------------------------------------
  .at('2026-08-17T16:00:00Z').epic(51, 'Modern quoting platform', { area: 'Nimbus Deck', state: 'Active' })
  .epic(52, 'Self-service billing', { area: 'Nimbus Deck', state: 'Active' })

  // --- Comet Crew: six Features ------------------------------------------------------------
  .at('2026-08-24T16:00:00Z').feature(101, 'Unified quote ledger', { area: 'Nimbus Deck\\Comet Crew', state: 'New', parent: 51 })
  .at('2026-08-24T16:30:00Z').feature(102, 'Rate card editor', { area: 'Nimbus Deck\\Comet Crew', state: 'Ready', parent: 51 })
  .feature(103, 'Quote PDF export', { area: 'Nimbus Deck\\Comet Crew', state: 'Draft' })
  .feature(104, 'Agent dashboard refresh', { area: 'Nimbus Deck\\Comet Crew', state: 'Active', parent: 52 })
  .feature(105, 'Bulk policy import', { area: 'Nimbus Deck\\Comet Crew', state: 'Deferred' })
  .feature(106, 'Audit trail for quotes', { area: 'Nimbus Deck\\Comet Crew', state: 'Closed', parent: 51 })

  // Feature 101: five Stories and one Bug.
  .at('2026-08-26T17:30:00Z').story(201, 'Show quote history on the policy page', { parent: 101 })
  .at('2026-08-27T18:00:00Z').story(202, 'Export ledger entries to CSV', { parent: 101, assignee: 'mina' })
  .at('2026-08-28T16:00:00Z').story(204, 'Ledger search by policy number', { parent: 101 })
  .at('2026-08-28T17:00:00Z').story(205, 'Archive ledger entries older than 7 years', { parent: 101, state: 'Ready' })
  .at('2026-08-31T16:00:00Z').state(101, 'Active').state(202, 'Active')
  .at('2026-09-02T19:15:00Z').story(203, 'Reconcile ledger with billing nightly', { parent: 101 })
  .at('2026-09-08T21:00:00Z').state(202, 'Closed')
  .at('2026-09-09T17:20:00Z').bug(301, 'Duplicate ledger rows after retry', { parent: 101, assignee: 'rafe' })
  .at('2026-09-10T16:00:00Z')
  .task(401, 'Add history endpoint', { parent: 201, assignee: 'rafe' })
  .task(402, 'History panel UI', { parent: 201, assignee: 'ava' })
  .task(403, 'History API contract tests', { parent: 201 })
  .task(404, 'CSV column mapping', { parent: 202, state: 'Closed' })
  .task(407, 'Idempotency key on retry', { parent: 301, assignee: 'rafe' })
  .task(408, 'Spike: ledger sharding', { parent: 202 })

  // Other Comet Crew systems.
  .at('2026-08-25T16:00:00Z').story(211, 'Edit rate tables inline', { parent: 102 })
  .story(212, 'Rate card version history', { parent: 102, state: 'Ready' })
  .story(213, 'PDF layout templates', { parent: 103 })
  .story(221, 'Dashboard KPI tiles', { parent: 104, state: 'Active', assignee: 'mina' })
  .story(222, 'Saved dashboard filters', { parent: 104, state: 'Closed' })
  .story(223, 'Dashboard load under 2 seconds', { parent: 104, state: 'Resolved' })
  .bug(311, 'KPI tiles show stale totals', { parent: 104, state: 'Active' })
  .story(231, 'CSV import validation', { parent: 105, state: 'Deferred' })
  .story(241, 'Audit log viewer', { parent: 106, state: 'Closed' })
  .story(242, 'Audit export for compliance', { parent: 106, state: 'Closed' })
  .at('2026-09-03T16:00:00Z').task(405, 'Tile data service', { parent: 221 })
  .task(406, 'Tile accessibility pass', { parent: 221, assignee: 'ava' })

  // --- Lantern Squad: two Features under Epic 52 -------------------------------------------
  .at('2026-08-24T18:00:00Z').feature(111, 'Billing statement redesign', { area: 'Nimbus Deck\\Lantern Squad', state: 'Active', parent: 52 })
  .feature(112, 'Autopay enrollment', { area: 'Nimbus Deck\\Lantern Squad', state: 'Ready for Review', parent: 52 })
  .story(251, 'Statement summary panel', { parent: 111, state: 'Active', assignee: 'rafe' })
  .story(252, 'Paperless opt-in', { parent: 112 })

  // --- Density range (for the sizing harness, tests/e2e/density.spec.ts) --------------------
  // Feature 111 is the dense extreme: 20 Stories and Bugs; Story 251 carries 20 Tasks and five PRs
  // under way to five repos. Feature 112 is the sparse extreme: 1 Story, 1 Task, 1 PR, 1 repo.
  .apply((b) => {
    const titles = ['Statement header redesign', 'Itemized charges table', 'Due-date reminder banner', 'Plain-language fee notes',
      'Statement PDF archive', 'Multi-policy rollup', 'Payment history chart', 'Dispute a charge flow', 'Accessible statement view',
      'Statement email template', 'Spanish statement copy', 'Large-print statement option', 'Statement preview for agents',
      'Prior-balance carryover line', 'Autopay status badge', 'Statement delivery preferences'];
    const storyStates = ['New', 'Ready', 'Active', 'Resolved', 'Ready to Accept', 'Closed'];
    const people = ['ava', 'rafe', 'mina'];
    b.at('2026-08-26T16:00:00Z');
    titles.forEach((title, i) => b.story(253 + i, title, { parent: 111, state: storyStates[i % storyStates.length], assignee: i % 4 === 0 ? people[i % 3] : undefined }));
    ['Totals off by a cent on proration', 'Statement date shows UTC', 'Blank page in PDF export'].forEach((title, i) =>
      b.bug(321 + i, title, { parent: 111, state: ['Active', 'Resolved', 'New'][i] }));
    b.at('2026-09-01T16:00:00Z');
    const taskStates = ['New', 'Active', 'Closed'];
    for (let i = 0; i < 20; i++) b.task(451 + i, `Summary panel task ${i + 1}`, { parent: 251, state: taskStates[i % 3], assignee: i % 5 === 0 ? people[i % 3] : undefined });
    const repos = ['billing-api', 'statement-render', 'notify-svc', 'ledger-svc', 'portal-web'];
    repos.forEach((repo, i) => b.at(`2026-09-1${5 + (i % 3)}T${16 + i}:00:00Z`).pr(9201 + i, { repo, author: people[i % 3], title: `Summary panel: ${repo} changes`, links: [451 + i * 4] }));
    // Sparse extreme
    b.at('2026-08-27T16:00:00Z').task(481, 'Paperless consent checkbox', { parent: 252, state: 'Active', assignee: 'mina' });
    b.at('2026-09-16T19:00:00Z').pr(9301, { repo: 'billing-api', author: 'mina', title: 'Paperless consent flag', links: [481] });
    // The radar's week (06 §3, slice 3a): Tasks start, close in waves, one is added, one removed,
    // one reopened, while their PRs fly and one merges. Rafe owns the Story and closes most of them.
    b.at('2026-09-14T17:00:00Z').state(451, 'Active').state(454, 'Active');
    b.at('2026-09-15T16:00:00Z').state(452, 'Closed', { by: 'rafe' }).state(455, 'Closed', { by: 'rafe' }).state(458, 'Closed', { by: 'rafe' });
    b.at('2026-09-15T19:00:00Z').task(471, 'Statement totals regression test', { parent: 251, assignee: 'rafe' });
    b.at('2026-09-16T17:00:00Z').state(457, 'Active').state(460, 'Active').state(463, 'Active').state(471, 'Active');
    b.at('2026-09-17T16:30:00Z').state(454, 'Closed', { by: 'rafe' }).state(457, 'Closed', { by: 'rafe' }).state(460, 'Closed', { by: 'rafe' })
      .state(463, 'Closed', { by: 'rafe' }).state(466, 'Closed', { by: 'rafe' });
    b.at('2026-09-17T21:00:00Z').state(469, 'Removed', { by: 'rafe' });
    b.at('2026-09-18T16:00:00Z').state(451, 'Closed').state(452, 'Active', { by: 'mina' }); // a reopen
    b.at('2026-09-18T18:00:00Z').completePr(9202, { by: 'rafe', approvedBy: ['ava', 'jo', 'sana'] });
    b.at('2026-09-18T22:00:00Z').state(471, 'Closed').state(251, 'Resolved');
  })

  // --- The week ----------------------------------------------------------------------------
  .at('2026-09-14T16:10:00Z').state(201, 'Active').assign(201, 'ava')
  .at('2026-09-14T17:00:00Z').state(401, 'Active').state(402, 'Active')
  .at('2026-09-14T22:00:00Z').state(102, 'Active').state(211, 'Active').assign(211, 'ava') // concurrent: ava on 201 and 211
  .at('2026-09-15T17:30:00Z').pr(9001, { repo: 'ledger-svc', author: 'rafe', title: 'Quote history endpoint', links: [401] })
  .at('2026-09-15T18:00:00Z').state(301, 'Active')
  .at('2026-09-15T19:00:00Z').pr(9003, { repo: 'ledger-svc', author: 'mina', title: 'Make ledger writes idempotent', links: [301] })
  .at('2026-09-16T16:20:00Z').pr(9002, { repo: 'portal-web', author: 'ava', title: 'Quote history panel', links: [201] })
  .at('2026-09-16T18:00:00Z').state(403, 'Closed').unlink(408, 202) // 408 loses its parent: Uncharted
  .at('2026-09-16T21:00:00Z').pr(9004, { repo: 'portal-web', author: 'rafe', title: 'Bump UI toolkit' }) // unlinked
  .at('2026-09-17T15:00:00Z').state(204, 'Active')
  .at('2026-09-17T17:00:00Z').pr(9005, { repo: 'portal-web', author: 'mina', title: 'KPI tile data wiring', links: [405] })
  .at('2026-09-17T20:30:00Z').state(201, 'Resolved', { by: 'rafe' }) // a lead resolves Ava's Story: the beam is Rafe's
  .assign(202, 'ava') // mina leaves Feature 101 (her other assignment is 221, in Feature 104); ava already has a ship here
  .at('2026-09-18T17:45:00Z').completePr(9001, { approvedBy: ['ava', 'jo'] }).completePr(9003, { approvedBy: ['rafe', 'sana'] })
  // Follow mode's out-of-view note (05 §6, slice 3b): Ava takes the uncharted Task 408, which has no
  // parent since Wednesday, so it's in the Uncharted tray, not in any scene. It shares Thursday
  // morning's beat, so the week's timing barely moves.
  .at('2026-09-17T15:00:00Z').assign(408, 'ava')

  // --- Review scenes added at HG-3a: a lone person's whole Feature, and a bug outbreak --------
  .apply(soloDesk)
  .apply(bugOutbreak)

  // --- Second project ----------------------------------------------------------------------
  .project('Harbor Watch')
  .area('Harbor Watch', 20)
  .area('Harbor Watch\\Tide Team', 21, { favorite: true })
  .repo('intake-svc')
  .at('2026-08-20T16:00:00Z').feature(601, 'Claims intake triage', { area: 'Harbor Watch\\Tide Team', state: 'Active' })
  .story(701, 'Auto-route claims by line of business', { parent: 601, state: 'Active', assignee: 'rafe' })
  .story(702, 'Triage queue for adjusters', { parent: 601 })
  .at('2026-09-16T17:00:00Z').pr(9101, { repo: 'intake-svc', author: 'rafe', title: 'Routing rules engine', links: [701] })

  .expect('2026-09-13T00:00:00Z', (snap, k) => {
    const story = snap.workItems.get(k.wi(201));
    if (story?.stage !== 'story.uncharted') throw new Error(`201 should be uncharted, got ${story?.stage}`);
  })
  .expect('2026-09-15T00:00:00Z', (snap, k) => {
    const story = snap.workItems.get(k.wi(201));
    if (story?.stage !== 'story.terraforming') throw new Error(`201 should be terraforming, got ${story?.stage}`);
    if (story.assigneeKey !== k.person('ava')) throw new Error('201 should be assigned to ava');
  })
  .expect('2026-09-20T00:00:00Z', (snap, k) => {
    if (snap.prs.get(k.pr(9001))?.status !== 'completed') throw new Error('9001 should be completed');
    if (snap.workItems.get(k.wi(201))?.rawState !== 'Resolved') throw new Error('PR merge must not close 201 (INV-06)');
    if (snap.workItems.get(k.wi(408))?.parentKey !== null) throw new Error('408 should have no parent');
  })
  .build();
