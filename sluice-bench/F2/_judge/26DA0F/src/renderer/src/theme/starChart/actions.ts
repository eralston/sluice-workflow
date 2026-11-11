// What the Star Chart theme shows for an event (22 B4, R13): the chart's line beneath History's ADO
// line, in the theme's own nouns and verbs, short, with no number or title (the line above has
// them). It is read from the event's moves, as the chart plays them: work under way is mined or
// fought, done work is mined out or destroyed, a new holder's captain takes it, a PR is a tender
// shuttle that docks with the work it serves. Null when the event moves nothing the chart draws.
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Move, Rung, Terminology } from '@shared/engine/types';

/** A climb's verb, by role and the rung it reaches (09: underway is worked, accomplished is done). */
const CLIMB: Partial<Record<string, Partial<Record<Rung, string>>>> = {
  objective: { ready: 'mining stops on the {n}', underway: 'the {n} is being mined', nearing: 'the {n} is nearly mined out', accomplished: 'the {n} is mined out', off: 'the {n} is set aside' },
  threat: { ready: 'the attack on the {n} breaks off', underway: 'the {n} is under attack', nearing: 'the {n} is crippled', accomplished: 'the {n} is destroyed', off: 'the {n} withdraws' },
};

export function chartAction(h: ScopeHistory, _e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): string | null {
  const person = (key: CanonicalKey | null) => h.entities.captains.find((c) => c.key === key)?.displayName ?? 'someone';
  const m = mv[0];
  if (!m) return null;
  if ('role' in m && m.role === 'container') return null; // containers aren't drawn (12 §3)
  switch (m.m) {
    case 'appear':
      return m.seat ? `a new ${t.noun(m.role)} appears by ${person(m.seat)}’s ${t.level('seat')}` : `a new ${t.noun(m.role)} appears in the ${t.level('frontier')}`;
    case 'climb': {
      const verb = CLIMB[m.role]?.[m.to.rung];
      return (verb ?? 'the {n}: {from} → {to}').replace('{n}', t.noun(m.role)).replace('{from}', t.rung(m.from.rung)).replace('{to}', t.rung(m.to.rung));
    }
    case 'reseat':
      return m.to ? `${person(m.to)}’s ${t.noun('agent')} takes the ${t.noun(m.role)}` : `the ${t.noun(m.role)} drifts to the ${t.level('frontier')}`;
    case 'enter': return `the ${t.noun(m.role)} arrives`;
    case 'leave': return `the ${t.noun(m.role)} leaves`;
    case 'bind': case 'unbind': {
      if (m.rel === 'container') return null; // containers aren't drawn (12 §3)
      const child = m.rel === 'attachment' ? t.noun('attachment') : t.noun('step');
      return m.m === 'bind' ? `a ${child} docks with its work` : `a ${child} undocks`;
    }
    case 'attach': return `a ${t.noun('attachment')} launches from its ${t.noun('facility')}`;
    case 'settle': return m.to.rung === 'accomplished' ? `the ${t.noun('attachment')} delivers` : `the ${t.noun('attachment')} is recalled`;
    case 'retitle': return null;
  }
}
