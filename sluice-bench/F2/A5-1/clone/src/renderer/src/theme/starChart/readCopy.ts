// The Star Chart theme's reading copy (23 E6, 14 §8): the "How to read the chart" prose (13 §7's
// draft), the guided tour's steps (23 E7) and the `+N more` string. Every noun is read through
// terminology: what the chart shows from the chart register `c` (this theme's words), what it stands
// for from the source register `s` (the loaded bundle's pack: Sprint, User Stories, Pull Requests for
// SDLC). So a theme or pack swap rewrites the prose without touching the settings tab or the tour.
import type { ReadCopy } from '../types';

const an = (w: string) => (/^([aeio]|u(?!s[aeiou]|ni|ti))/i.test(w) ? 'an' : 'a');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** R12: the ADO word first, the chart's beside it (dropped when they are the same word). */
const pair = (source: string, chart: string): { title: string; alias?: string } =>
  source.toLowerCase() === chart.toLowerCase() ? { title: cap(source) } : { title: cap(source), alias: chart };

export const readCopy: ReadCopy = {
  paragraph: (c, s) => [
    `Each ${c.level('region')} is one team’s ${s.level('round')}, played back as an episode.`,
    `Everyone with work in the ${s.level('round')} has a big ${c.level('seat')} ringed round the star, lit only on the side that faces it, and their ${c.noun('agent')} flies to wherever they’re working.`,
    `${cap(s.noun('objective', 2))} are ${c.noun('objective', 2)}, ${s.noun('threat', 2)} are ${c.noun('threat', 2)}: both start in the shadow on the ${c.level('seat')}’s dark side, ${c.noun('objective', 2)} to the left and ${c.noun('threat', 2)} to the right.`,
    `The ${c.noun('agent', 2)} carve the ${c.noun('objective', 2)} and rig them for harvest, and the fleet engages the ${c.noun('threat', 2)} until a strike run breaks them apart. Finished work moves to the lit edge as a small, gently lit platform in orbit, for good.`,
    `${cap(s.noun('facility', 2))} are ${c.noun('facility', 2)}, and the ${s.noun('attachment', 2)} and ${s.noun('guard', 2)} around them are ${c.noun('attachment', 2)} and ${c.noun('guard', 2)}.`,
    `New work first appears as a wireframe sensor contact; after that, colour shows how far along anything is: grey ${c.rung('ready').toLowerCase()}, blue ${c.rung('underway').toLowerCase()}, violet ${c.rung('nearing').toLowerCase()}, gold ${c.rung('accomplished').toLowerCase()}.`,
    `A ${c.level('seat')} blooms as its own person’s work is finished, and is never compared with anyone else’s.`,
    'Press Space to play, drag the ruler to move through time, and hover anything to see what it is.',
  ],
  tour: (c, s) => [
    { target: 'star', ...pair(s.level('round'), c.level('region')), body: `This is one team’s ${s.level('round')}, played back as an episode. Everything you see belongs to it. Comet Pod is the smallest: one captain, two pieces of work.` },
    { target: 'seat', ...pair(s.level('seat'), c.level('seat')), body: `Each person with work in the ${s.level('round')} gets a ${c.level('seat')}, lit only on the side that faces the star. It is only ever compared with itself, never with anyone else’s.` },
    { target: 'objective', ...pair(s.noun('objective'), c.noun('objective')), body: `${cap(an(s.noun('objective')))} ${s.noun('objective')} is drawn as ${an(c.noun('objective'))} ${c.noun('objective')}. It begins as a wireframe contact in the shadow, then takes colour as it moves along: grey, blue, violet, and finally gold when it is done.` },
    { target: 'threat', ...pair(s.noun('threat'), c.noun('threat')), body: `${cap(an(s.noun('threat')))} ${s.noun('threat')} is drawn as ${an(c.noun('threat'))} ${c.noun('threat')}. It starts in the shadow too, and the fleet engages it until a strike run breaks it apart.` },
    { target: 'facility', ...pair(s.noun('facility'), c.noun('facility')), body: `${cap(an(s.noun('facility')))} ${s.noun('facility')} is drawn as ${an(c.noun('facility'))} ${c.noun('facility')}. The ${s.noun('attachment', 2)} and ${s.noun('guard', 2)} around it are drawn as ${c.noun('attachment', 2)} and ${c.noun('guard', 2)}.` },
    { target: 'agent', ...pair(s.noun('agent'), c.noun('agent')), body: `${cap(an(c.noun('agent')))} ${c.noun('agent')} stands for a person. It flies to wherever they are working: click it to follow along.` },
    { target: 'player', title: 'The player', body: 'Press Space to play, drag the ruler to move through time, and hover anything to see what it is. That is the tour: Esc closes it, and Settings has it again.' },
  ],
  more: (n) => `+${n} more`,
  fewer: () => 'show fewer',
};
