// A contractor's company in parentheses never reaches a label (captains.ts `plainName`).
import { describe, expect, it } from 'vitest';
import { plainName } from '../../src/shared/captains';

describe('plainName', () => {
  it.each([
    ['Noah Calhoun (Proliance Consulting)', 'Noah Calhoun'],
    ['Noah (Proliance) Calhoun', 'Noah Calhoun'],
    ['Noah Calhoun (Proliance (East))', 'Noah Calhoun'],
    ['Noah Calhoun (Proliance', 'Noah Calhoun'],
    ['Dave Mauldin', 'Dave Mauldin'],
    ['(Contractor)', '(Contractor)'],
  ])('%s → %s', (a, b) => expect(plainName(a)).toBe(b));
});
