// B audit: a capped plate starts below the overlay stack (the partial-history line, the banners), not just the player.
import { describe, expect, it } from 'vitest';
import { PLATE_TOP_MARGIN, plateTopInset } from '@shared/plateInset';

describe('plateTopInset', () => {
  it('the player alone leaves the inset as it was', () => {
    expect(plateTopInset(40, 46)).toBe(40);
    expect(plateTopInset(40, 0)).toBe(40);
  });
  it('a partial line or a banner pushes it down, less the plate\'s own margin', () => {
    expect(plateTopInset(40, 120)).toBe(120 - PLATE_TOP_MARGIN);
    expect(120 - PLATE_TOP_MARGIN + PLATE_TOP_MARGIN).toBe(120); // the plate's top edge clears the stack
  });
});
