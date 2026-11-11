// A crowded org (decided 2026-10-07): 188 projects, as large real orgs have, to design the galaxy for
// scale. Invented names only (INV-18): an adjective and a place, deterministically paired. A few
// projects have saved areas and a little activity this week; the rest are quiet.
import { scenario } from '../dsl';

const FIRST = ['Amber', 'Basalt', 'Cedar', 'Dune', 'Ember', 'Fern', 'Granite', 'Harbor', 'Indigo', 'Juniper', 'Kelp', 'Linen', 'Maple', 'Nimbus'];
const SECOND = ['Bay', 'Bridge', 'Canyon', 'Delta', 'Falls', 'Grove', 'Hollow', 'Isle', 'Knoll', 'Mesa', 'Point', 'Ridge', 'Shoal', 'Vale'];
export const CROWDED_COUNT = 188;
/** The other 187 project names (Juniper Ridge is the first), in a scrambled, not alphabetical, order. */
export const crowdedNames = Array.from({ length: FIRST.length * SECOND.length }, (_, i) => `${FIRST[(i * 5) % FIRST.length]} ${SECOND[(i * 3 + Math.floor(i / FIRST.length)) % SECOND.length]}`)
  .filter((n, i, all) => all.indexOf(n) === i && n !== 'Juniper Ridge')
  .slice(0, CROWDED_COUNT - 1);

const b = scenario('crowded-org', {
  project: 'Juniper Ridge',
  tz: 'America/Los_Angeles',
  range: ['2026-09-14T07:00:00Z', '2026-09-21T07:00:00Z'],
})
  .area('Juniper Ridge', 2000)
  .area('Juniper Ridge\\Pine Team', 2001, { favorite: true, defaultScope: true })
  .person('ines', 'Ines Varga')
  .person('tomas', 'Tomas Reyes')
  .at('2026-08-31T16:00:00Z')
  .feature(5001, 'Trail map export', { area: 'Juniper Ridge\\Pine Team', state: 'Active' })
  .story(5011, 'Export as PDF', { parent: 5001, assignee: 'ines' })
  .story(5012, 'Share a trail link', { parent: 5001, assignee: 'tomas' })
  .at('2026-09-15T17:00:00Z').state(5011, 'Active')
  .at('2026-09-17T18:00:00Z').state(5012, 'Active')
  .at('2026-09-19T18:00:00Z').state(5011, 'Resolved');

// Older Features (decided 2026-10-07, loaded by level): Pine Team has 15, most untouched for months,
// so a team opens on its 10 newest with Load more for the rest.
for (let i = 0; i < 14; i++) {
  b.at(`2026-06-${String(1 + i).padStart(2, '0')}T16:00:00Z`).feature(5101 + i, `${['Ranger', 'Campsite', 'Permit', 'Weather', 'Trailhead', 'Wildlife', 'Ferry'][i % 7]} ${i < 7 ? 'booking' : 'alerts'}`, { area: 'Juniper Ridge\\Pine Team', state: 'New' });
}
b.at('2026-06-02T17:00:00Z').story(5201, 'Pick a campsite on the map', { parent: 5101 }).bug(5202, 'Booking times shift a day', { parent: 5101 });

// Every other project: an area node each, and two teams. Every 23rd also has a saved area and one
// Feature; every 13th has recent work by Ines (the fake ADO's @Me), on staggered days, so her
// recent projects are a real cut of 10 from 16.
crowdedNames.forEach((name, i) => {
  const node = 3000 + i * 3;
  b.project(name).area(name, node).area(`${name}\\Core Team`, node + 1, { favorite: i % 23 === 0 }).area(`${name}\\Field Team`, node + 2);
  if (i % 23 === 0) {
    b.at('2026-09-01T16:00:00Z').feature(6000 + i, `${name} roadmap`, { area: `${name}\\Core Team`, state: 'New' });
    b.at('2026-09-16T16:00:00Z').state(6000 + i, 'Active');
  }
  if (i % 13 === 0) {
    const day = String(1 + (i % 20)).padStart(2, '0');
    b.at(`2026-08-${day}T15:00:00Z`).story(7000 + i, `${name} field notes`, { area: `${name}\\Field Team`, by: 'ines' });
    b.at(`2026-09-${day}T15:00:00Z`).state(7000 + i, 'Active', { by: 'ines' });
  }
});

export default b.build();
