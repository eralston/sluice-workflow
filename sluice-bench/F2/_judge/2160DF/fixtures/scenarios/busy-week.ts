// A busy week (03 §8): about 14 High, 12 Medium, and 10 Low events. With every accent the schedule
// runs past 30 s; with only the High beats at 250 ms gaps it fits, so the budget cut is exercised.
import { scenario } from '../dsl';

export default scenario('busy-week', {
  project: 'Larkspur',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'],
})
  .area('Larkspur', 50)
  .area('Larkspur\\Gale Team', 51, { favorite: true, defaultScope: true })
  .repo('gale-api')
  .repo('gale-web')
  .person('ivy', 'Ivy Castellan')
  .person('tom', 'Tomas Ferreira')
  .person('lu', 'Lu Brandt')
  .at('2026-08-24T16:00:00Z')
  .epic(1000, 'Severe weather readiness', { area: 'Larkspur', state: 'Active' })
  .feature(1001, 'Storm alert feed', { area: 'Larkspur\\Gale Team', state: 'Active', parent: 1000 })
  .apply((b) => {
    ['Alert subscription settings', 'Map overlay for warnings', 'Push notification copy', 'Alert history page', 'Severity filters', 'County picker']
      .forEach((title, i) => b.story(1011 + i, title, { parent: 1001 }));
    ['Duplicate push on reconnect', 'Overlay flickers on zoom', 'Wrong county for ZIP 98101', 'Times shown in UTC']
      .forEach((title, i) => b.bug(1021 + i, title, { parent: 1001 }));
  })

  // --- High: Story and Feature states, PRs, a new Story --------------------------------------
  .at('2026-09-14T16:00:00Z').state(1011, 'Active')
  .at('2026-09-14T19:00:00Z').state(1012, 'Active')
  .at('2026-09-14T22:00:00Z').pr(9501, { repo: 'gale-api', author: 'ivy', title: 'Subscription endpoints' })
  .at('2026-09-15T16:00:00Z').state(1013, 'Active')
  .at('2026-09-15T19:00:00Z').story(1017, 'Quiet hours for alerts', { parent: 1001 })
  .at('2026-09-15T22:00:00Z').state(1011, 'Resolved')
  .at('2026-09-16T16:00:00Z').pr(9502, { repo: 'gale-web', author: 'tom', title: 'Warning overlay layer' })
  .at('2026-09-16T19:00:00Z').state(1014, 'Active')
  .at('2026-09-16T22:00:00Z').completePr(9501, { approvedBy: ['tom', 'lu'] })
  .at('2026-09-17T16:00:00Z').state(1012, 'Resolved')
  .at('2026-09-17T19:00:00Z').state(1001, 'Ready to Accept')
  .at('2026-09-17T22:00:00Z').state(1013, 'Resolved')
  .at('2026-09-18T16:00:00Z').completePr(9502, { approvedBy: ['ivy', 'lu'] })
  .at('2026-09-18T19:00:00Z').state(1011, 'Closed', { by: 'ivy' }) // Ivy closes a Story she doesn't hold

  // --- Medium: Bug states, assignments, PR links ---------------------------------------------
  .at('2026-09-14T17:30:00Z').state(1021, 'Active')
  .at('2026-09-14T20:30:00Z').assign(1012, 'tom')
  .at('2026-09-15T17:30:00Z').linkPr(9501, 1011)
  .at('2026-09-15T20:30:00Z').state(1022, 'Active')
  .at('2026-09-16T17:30:00Z').assign(1013, 'ivy')
  .at('2026-09-16T20:30:00Z').linkPr(9502, 1012)
  .at('2026-09-17T17:30:00Z').state(1021, 'Resolved')
  .at('2026-09-17T20:30:00Z').state(1023, 'Active')
  .at('2026-09-18T17:30:00Z').assign(1014, 'tom')
  .at('2026-09-18T20:30:00Z').state(1022, 'Resolved')
  .at('2026-09-19T16:00:00Z').state(1024, 'Active')
  .at('2026-09-19T18:00:00Z').assign(1015, 'ivy')

  // --- Low: title edits and an Epic state ---------------------------------------------------
  .apply((b) => {
    const edits: [string, number, string][] = [
      ['2026-09-14T18:15:00Z', 1015, 'Severity filter chips'],
      ['2026-09-15T18:15:00Z', 1016, 'County and ZIP picker'],
      ['2026-09-15T21:15:00Z', 1023, 'Wrong county for some ZIP codes'],
      ['2026-09-16T18:15:00Z', 1024, 'Alert times shown in UTC'],
      ['2026-09-16T21:15:00Z', 1015, 'Severity filters'],
      ['2026-09-17T18:15:00Z', 1016, 'County picker'],
      ['2026-09-17T21:15:00Z', 1021, 'Duplicate push after reconnect'],
      ['2026-09-18T18:15:00Z', 1022, 'Overlay flickers while zooming'],
      ['2026-09-18T21:15:00Z', 1017, 'Quiet hours for storm alerts'],
    ];
    for (const [at, id, title] of edits) b.at(at).retitle(id, title);
    b.at('2026-09-19T20:00:00Z').state(1000, 'Resolved');
  })
  .expect('2026-09-19T00:00:00Z', (snap, k) => {
    if (snap.workItems.get(k.wi(1011))?.rawState !== 'Closed') throw new Error('1011 should be Closed');
    if (snap.prs.get(k.pr(9502))?.status !== 'completed') throw new Error('9502 should be completed');
  })
  .build();
