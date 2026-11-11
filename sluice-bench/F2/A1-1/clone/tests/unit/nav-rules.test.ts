// AC-48 (U): a sector that only ever holds one Feature passes straight through to it (06 §3).
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioKeys, toHistory, type ScenarioScope } from '@fixtures/dsl';
import type { SceneKey } from '@shared/contracts/view';
import { soleFeature } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const s = scenarios[0]!;
const k = scenarioKeys(s);
const sectorKey = (scope: ScenarioScope): SceneKey => ('area' in scope ? `sector:area:${k.area(scope.area)}` : `sector:epic:${k.wi(scope.epic)}`);

describe('soleFeature (AC-48)', () => {
  it.each([
    [{ project: 'Nimbus Deck', area: 'Nimbus Deck\\Ember Desk' }, 131],
    [{ project: 'Nimbus Deck', area: 'Nimbus Deck\\Kestrel Team' }, 141],
    [{ project: 'Harbor Watch', area: 'Harbor Watch\\Tide Team' }, 601],
    [{ project: 'Nimbus Deck', area: 'Nimbus Deck\\Comet Crew' }, null],
    [{ project: 'Nimbus Deck', area: 'Nimbus Deck\\Lantern Squad' }, null],
    [{ project: 'Nimbus Deck', epic: 51 }, null],
    [{ project: 'Nimbus Deck', epic: 52 }, null],
  ] as [ScenarioScope, number | null][])('%o → %s', (scope, feature) => {
    const h = toHistory(s, mapping, scope);
    expect(soleFeature(h, sectorKey(scope))).toBe(feature === null ? null : k.wi(feature));
  });

  it('never depends on the playhead: it is counted over the whole loaded history', () => {
    // Pure in the history alone; the same bundle gives the same answer whatever range is loaded.
    const scope = { project: 'Nimbus Deck', area: 'Nimbus Deck\\Ember Desk' };
    const h = toHistory(s, mapping, scope);
    const narrowed = { ...h, range: { startUtc: h.range.startUtc, endUtc: h.range.startUtc + 1 } };
    expect(soleFeature(narrowed, sectorKey(scope))).toBe(soleFeature(h, sectorKey(scope)));
  });

  it('is null for scenes that are not sectors', () => {
    const scope = { project: 'Nimbus Deck', area: 'Nimbus Deck\\Ember Desk' };
    expect(soleFeature(toHistory(s, mapping, scope), `feature:${k.wi(131)}`)).toBeNull();
  });
});
