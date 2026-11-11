// AC-27 (G): for every scenario and every scope it serves, ingest(toAdoPayloads(s)) ≡ toHistory(s).
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioScopes, sprintScopes, toHistory } from '@fixtures/dsl';
import { mapping } from './helpers';
import { comparable, harness, ingest } from './ingest';

const cases = scenarios.flatMap((s) => scenarioScopes(s, mapping).map((scope) => ({ s, scope, name: `${s.name} · ${'area' in scope ? scope.area : `Epic ${scope.epic}`}` })));

describe('AC-27: ingest through the fake ADO matches toHistory', () => {
  it.each(cases)('$name', async ({ s, scope }) => {
    const h = await harness(s);
    const got = await ingest(h, s, scope);
    expect(comparable(got)).toEqual(comparable(toHistory(s, mapping, scope)));
  });

  // Sprints (decided 2026-10-07): a sprint's members, through the same pipeline, over its own dates.
  const sprints = scenarios.flatMap((s) => sprintScopes(s).map((scope) => ({ s, scope, name: `${s.name} · ${scope.sprint}` })));
  it.each(sprints)('$name', async ({ s, scope }) => {
    const want = toHistory(s, mapping, scope);
    const h = await harness(s);
    const got = await ingest(h, s, scope, want.range);
    expect(comparable(got)).toEqual(comparable(want));
    expect(got.entities.workItems.length).toBeGreaterThan(0);
  });
});
