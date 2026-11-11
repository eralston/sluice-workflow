// Edge cases for replay (03 §8): a reparent, a reopen, an area move, a late PR link, undated links,
// an unknown state, and a rejected Bug. Invented names only.
import { scenario } from '../dsl';

export default scenario('edge-history', {
  project: 'Driftwood',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'],
})
  .area('Driftwood', 30)
  .area('Driftwood\\Kelp Team', 31, { favorite: true, defaultScope: true })
  .area('Driftwood\\Reef Team', 32, { favorite: true })
  .repo('reminder-svc')
  .repo('photo-svc')
  .person('juno', 'Juno Okafor')
  .person('kai', 'Kai Brandt')

  .at('2026-08-24T16:00:00Z')
  .feature(801, 'Policy renewal reminders', { area: 'Driftwood\\Kelp Team', state: 'Active' })
  .feature(802, 'Claims photo upload', { area: 'Driftwood\\Kelp Team', state: 'Active' })
  .feature(803, 'Broker portal sign-on', { area: 'Driftwood\\Kelp Team', state: 'Ready' })
  .at('2026-08-25T16:00:00Z')
  .story(811, 'Reminder email cadence', { parent: 801, state: 'Active', assignee: 'juno' })
  .story(812, 'Renewal preview page', { parent: 801 })
  .story(813, 'Photo compression on upload', { parent: 802, state: 'Active', assignee: 'kai' })
  .story(814, 'Sign-on landing page', { parent: 803 })
  .story(815, 'Renewal FAQ copy') // its parent link is known only from the current state
  .bug(821, 'Upload fails for HEIC photos', { parent: 802, state: 'Active' })
  .task(831, 'Cadence settings', { parent: 811 })
  .at('2026-09-08T18:00:00Z').state(812, 'Closed')

  // --- The week ----------------------------------------------------------------------------
  .at('2026-09-15T16:00:00Z').pr(9401, { repo: 'reminder-svc', author: 'juno', title: 'Cadence scheduler' }) // linked days later
  .at('2026-09-15T17:00:00Z').unlink(811, 801).link(811, 802) // reparent between Features
  .at('2026-09-16T17:00:00Z').moveArea(803, 'Driftwood\\Reef Team') // the Feature moves sectors
  .at('2026-09-16T18:00:00Z').state(812, 'Active') // reopened
  .at('2026-09-16T20:00:00Z').pr(9402, { repo: 'photo-svc', author: 'kai', title: 'Compress before upload', links: [813] })
  .at('2026-09-17T17:00:00Z').state(813, 'Blocked') // not in the state mapping
  .at('2026-09-17T20:00:00Z').state(821, 'Rejected')
  .at('2026-09-18T17:00:00Z').linkPr(9401, 811)
  // Undated facts, seen only at sync time.
  .observeParent(815, 801)
  .observePrLink(9402, 821)
  .undatedUnlink(814, 803)

  .expect('2026-09-15T16:59:00Z', (snap, k) => {
    if (snap.workItems.get(k.wi(811))?.parentKey !== k.wi(801)) throw new Error('811 should still be under 801');
  })
  .expect('2026-09-15T17:00:00Z', (snap, k) => {
    if (snap.workItems.get(k.wi(811))?.parentKey !== k.wi(802)) throw new Error('811 should be under 802');
  })
  .expect('2026-09-17T00:00:00Z', (snap, k) => {
    const s = snap.workItems.get(k.wi(812));
    if (!s?.reopened) throw new Error('812 should be reopened');
    if (snap.workItems.get(k.wi(803))?.areaPath !== 'Driftwood\\Reef Team') throw new Error('803 should be in Reef Team');
    if (snap.links.some((l) => l.kind === 'pr' && l.fromKey === k.pr(9401))) throw new Error('9401 must not be linked yet');
  })
  .expect('2026-09-18T00:00:00Z', (snap, k) => {
    const s = snap.workItems.get(k.wi(813));
    if (s?.stage !== 'unknown' || s.rawState !== 'Blocked') throw new Error(`813 should be unknown/Blocked, got ${s?.stage}`);
    if (snap.workItems.get(k.wi(821))?.stage !== 'bug.rejected') throw new Error('821 should be rejected');
  })
  .build();
