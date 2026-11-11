// 19 S2 — when a guide that shows for some nodes (the frontier belt) is wanted in play: while one of
// its nodes is drawn, or one that kept it shown is still leaving. A reassigned piece counts where it
// was until it flies, so the belt fades out as the last unassigned piece lifts off and in as the first
// comes to it; a newcomer hidden for its entrance doesn't count until it shows. Renderer code sits
// outside this project's tsconfig, so it is loaded by a runtime path (as castLabels.test.ts does).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface HeldMember { was: boolean; count: number }
const { guideMembers, guideWanted, holdMembers, releaseMembers } = (await import(
  /* @vite-ignore */ resolve(__dirname, '../../src/renderer/src/chart/scenes/guidePresence.ts')
)) as {
  holdMembers(held: Map<string, HeldMember>, before: readonly string[], pks: readonly string[]): void;
  releaseMembers(held: Map<string, HeldMember>, pks: readonly string[]): void;
  guideMembers(listed: readonly string[], held?: ReadonlyMap<string, HeldMember>): Set<string>;
  guideWanted(members: ReadonlySet<string>, drawn: (pk: string) => boolean, leaving: number): boolean;
};

const all = () => true;
const wanted = (listed: string[], held: Map<string, HeldMember>, drawn: (pk: string) => boolean = all, leaving = 0) => guideWanted(guideMembers(listed, held), drawn, leaving);

describe('guide presence (19 S2)', () => {
  it('holds the belt while the last unassigned piece is reassigned, until it flies', () => {
    const held = new Map<string, HeldMember>();
    // Before the beat it was the belt's only piece; after it, the graph lists none.
    holdMembers(held, ['obj|2'], ['obj|2']);
    expect(wanted([], held)).toBe(true); // the route inks: still shown
    releaseMembers(held, ['obj|2']);
    expect(held.size).toBe(0);
    expect(wanted([], held)).toBe(false); // it flies: the belt fades out
  });

  it('keeps the belt away while a piece being reassigned to it waits for its flight', () => {
    const held = new Map<string, HeldMember>();
    holdMembers(held, [], ['obj|2']);
    expect(wanted(['obj|2'], held)).toBe(false);
    releaseMembers(held, ['obj|2']);
    expect(wanted(['obj|2'], held)).toBe(true); // it flies to the belt: it fades in
  });

  it('counts holds, so two moments on one piece let go only when both have', () => {
    const held = new Map<string, HeldMember>();
    holdMembers(held, ['obj|2'], ['obj|2']);
    holdMembers(held, [], ['obj|2']); // a second moment keeps the first one's view of it
    releaseMembers(held, ['obj|2']);
    expect(wanted([], held)).toBe(true);
    releaseMembers(held, ['obj|2']);
    expect(wanted([], held)).toBe(false);
  });

  it('holds only the moment\'s own pieces: the others follow the scene', () => {
    const held = new Map<string, HeldMember>();
    holdMembers(held, ['obj|1', 'obj|2'], ['obj|2']);
    expect([...guideMembers(['obj|3'], held)].sort()).toEqual(['obj|2', 'obj|3']); // obj|1 left; obj|3 came
  });

  it('waits for a newcomer hidden for its entrance, and for a piece still leaving the scene', () => {
    const held = new Map<string, HeldMember>();
    const hidden = (pk: string) => pk !== 'thr|3';
    expect(wanted(['thr|3'], held, hidden)).toBe(false); // the rift hasn't opened yet
    expect(wanted(['thr|3'], held, all)).toBe(true); // it comes through
    expect(wanted([], held, all, 1)).toBe(true); // the last piece retreats out of the region
    expect(wanted([], held, all, 0)).toBe(false); // gone: the belt fades out
  });
});
