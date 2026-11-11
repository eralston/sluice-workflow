// One wording for every event (22 B4, R13): `Entity type · ID · Title — Action · by Person`, from the
// pack's `event`, the same in History, the ruler and the notes in play; and beneath it the theme's
// account of what the chart shows, in its own words, with no ID or source word.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import crmQuarter from '@fixtures/scenarios/v1/crm-quarter';
import todoWeek from '@fixtures/scenarios/v1/todo-week';
import { scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import { eventParts, formatEvent, noteOf, type EventParts } from '@shared/engine/eventLine';
import { movesOf } from '@shared/engine/moves';
import { terminology } from '@shared/engine/terminology';
import type { Move, Terminology } from '@shared/engine/types';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { sdlcPack } from '@shared/packs/sdlc';
import { mapping } from '../golden/helpers';

const SRC = resolve(__dirname, '../../src/renderer/src');
const { chartAction } = (await import(/* @vite-ignore */ resolve(SRC, 'theme/starChart/actions.ts'))) as {
  chartAction(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): string | null;
};
const { words } = (await import(/* @vite-ignore */ resolve(SRC, 'theme/starChart/words.ts'))) as { words: never };

const k = scenarioKeys(sprintMechanics);
const S41 = toHistory(sprintMechanics, mapping, sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!);
const src = terminology(sdlcPack, 'source');
const parts = (h: ScopeHistory, e: AnyTimelineEvent): EventParts => {
  const pack = packFor(h);
  return pack.adapter.event!(h, e, terminology(pack, 'source', { mapping: h.stateMapping }));
};
const firstHistory = (s: Scenario) => toHistory(s, s.mapping ?? mapping, sprintScopes(s)[0]!);

describe('the event line (22 B4)', () => {
  it('names the thing, then what happened, then who did it', () => {
    for (const e of S41.events) {
      const line = formatEvent(parts(S41, e));
      expect(line).toMatch(/^[A-Z][\w ]* · #\d+( · .+)? — \S/);
    }
    const created = S41.events.find((e) => e.kind === 'wi_created' && e.entityKey === k.wi(9104))!;
    expect(formatEvent(parts(S41, created))).toMatch(/^User Story · #9104 · Week view for the calendar — Created/);
    const state = S41.events.find((e) => e.kind === 'wi_state_changed')!;
    expect(parts(S41, state).action).toMatch(/^\S.* → \S/); // the source's own state names (INV-11)
  });

  it('an assignment names the assignee in the action and who made it after "by", never the same name twice', () => {
    for (const e of S41.events.filter((x) => x.kind === 'wi_assignee_changed')) {
      const p = parts(S41, e);
      expect(p.action).toMatch(/^(Assigned to .+|Unassigned)$/);
      if (p.person) expect(p.action).not.toContain(p.person);
      expect(formatEvent(p)).toBe(`${p.type} · ${p.id}${p.title ? ` · ${p.title}` : ''} — ${p.action}${p.person ? ` · by ${p.person}` : ''}`);
    }
  });

  it('a PR is named as one, with its title, and says it merged', () => {
    const merged = S41.events.find((e) => e.kind === 'pr_completed')!;
    const p = parts(S41, merged);
    expect([p.type, p.id, p.action]).toEqual(['PR', '#9501', 'Merged']);
    expect(p.title).toBeTruthy();
    expect(noteOf(p, true)).toBe(`PR #9501 · ${p.title} — Merged`);
    expect(noteOf(p, false)).toBe('Merged');
    const opened = S41.events.find((e) => e.kind === 'pr_opened')!;
    expect(parts(S41, opened).action).toBe('Opened');
  });

  it('other packs say it in their own words', () => {
    const crm = firstHistory(crmQuarter);
    const won = (crm.events as AnyTimelineEvent[]).find((e) => e.kind === 'pr_completed');
    if (won) expect(parts(crm, won).action).toBe('Accepted');
    const todo = firstHistory(todoWeek);
    const filed = (todo.events as AnyTimelineEvent[]).find((e) => e.kind === 'pr_completed');
    if (filed) expect(parts(todo, filed).action).toBe('Filed');
    expect(eventParts(S41, S41.events.find((e) => e.kind === 'pr_completed')!, src).action).toBe('Completed'); // the engine's own
  });
});

describe('the chart’s line beneath it (22 B4)', () => {
  it('says what the chart shows in the theme’s words: no ID, no source word', () => {
    const chart = terminology(sdlcPack, 'chart', { chart: words, mapping });
    const moves = movesOf(S41, sdlcPack);
    let said = 0;
    for (const e of S41.events) {
      const line = chartAction(S41, e, moves.get(e.eventKey)!, chart);
      if (line === null) continue;
      said++;
      expect(line).not.toMatch(/#\d|User Story|Bug|Task|Feature|Pull Request|\bPR\b|Repository/);
    }
    expect(said).toBeGreaterThan(S41.events.length / 2);
    const merged = S41.events.find((e) => e.kind === 'pr_completed')!;
    expect(chartAction(S41, merged, moves.get(merged.eventKey)!, chart)).toBe('the tender shuttle delivers');
  });
});
