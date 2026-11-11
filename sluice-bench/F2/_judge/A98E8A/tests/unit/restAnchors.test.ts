// 22 C7, 05 §8 K-11 — where a seated captain rests in a solar region (`pieceAnchors`): beside the last
// asteroid or enemy ship they touched here, even someone else's. A Task's event counts as its parent's,
// a PR's as the work it serves; a station is never an anchor; only pieces on the board count.
import { describe, expect, it } from 'vitest';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Snapshot, ViewNode, WorkItemState } from '@shared/contracts/view';
import { pieceAnchors } from '@shared/scene/project/traffic';

const wi = (n: number) => `wi:o:${n}` as CanonicalKey;
const pr = (n: number) => `pr:o:r1:${n}` as CanonicalKey;
const ann = 'id:o:ann' as CanonicalKey;
const ben = 'id:o:ben' as CanonicalKey;
const T0 = Date.UTC(2026, 8, 14);

const item = (n: number, kind: string, parent: number | null = null) =>
  [wi(n), { key: wi(n), kind, parentKey: parent === null ? null : wi(parent), assigneeKey: null, assignedAt: null } as unknown as WorkItemState] as const;
const node = (key: CanonicalKey, kind: ViewNode['kind']) => ({ projectionKey: `n:${key}`, canonicalKey: key, kind, selectable: true }) as unknown as ViewNode;

let seq = 0;
function ev(at: number, by: CanonicalKey, kind: string, entityKey: CanonicalKey, payload: object = {}): AnyTimelineEvent {
  return { eventKey: `e${++seq}`, kind, occurredAt: T0 + at, observedAt: T0 + at, entityKey, projectKey: 'proj:o:p', priority: 'high', payload, evidence: [], changedBy: by } as unknown as AnyTimelineEvent;
}

/** A story (1) with a Task (2), a bug (3), a Feature (9) over them, and PR 7 serving the Task, at a station. */
function ctx(events: AnyTimelineEvent[], onBoard: number[] = [1, 3]) {
  const s = {
    atUtc: T0 + 100,
    workItems: new Map([item(1, 'story', 9), item(2, 'task', 1), item(3, 'bug', 9), item(9, 'feature')]),
    prs: new Map(),
    links: [{ kind: 'pr', fromKey: pr(7), toKey: wi(2), uncertain: false }],
  } as unknown as Snapshot;
  const nodes = [...onBoard.map((n) => node(wi(n), n === 3 ? 'threat' : 'objective')), node('repo:o:r1' as CanonicalKey, 'facility'), node(pr(7), 'facility')];
  return { s, h: { events } as unknown as ScopeHistory, graph: { nodes, edges: [] } as never };
}
const at = (m: ReturnType<typeof pieceAnchors>) => new Map([...m].map(([who, a]) => [who, a.node.canonicalKey]));

describe('a seated captain’s rest (pieceAnchors, 22 C7)', () => {
  it('a Task’s event counts as its parent’s, and someone else’s piece counts too', () => {
    expect(at(pieceAnchors(ctx([ev(1, ann, 'wi_state_changed', wi(2)), ev(2, ben, 'wi_state_changed', wi(1))])))).toEqual(new Map([[ann, wi(1)], [ben, wi(1)]]));
  });

  it('a PR’s work counts as the work it serves, never the station', () => {
    const events = [ev(1, ann, 'wi_state_changed', wi(3)), ev(2, ann, 'pr_opened', pr(7), { authorKey: ann }), ev(3, ben, 'link_pr_added', wi(2), { itemKey: wi(2), prKey: pr(7) })];
    expect(at(pieceAnchors(ctx(events)))).toEqual(new Map([[ann, wi(1)], [ben, wi(1)]]));
  });

  it('the latest touch wins, up to the playhead', () => {
    const later = ev(200, ann, 'wi_state_changed', wi(1));
    expect(at(pieceAnchors(ctx([ev(1, ann, 'wi_state_changed', wi(3)), later])))).toEqual(new Map([[ann, wi(3)]]));
  });

  it('a Feature’s own event, or a piece no longer on the board, leaves the last piece before it', () => {
    expect(at(pieceAnchors(ctx([ev(1, ann, 'wi_state_changed', wi(3)), ev(2, ann, 'wi_title_changed', wi(9))])))).toEqual(new Map([[ann, wi(3)]]));
    expect(at(pieceAnchors(ctx([ev(1, ann, 'wi_state_changed', wi(3)), ev(2, ann, 'wi_state_changed', wi(1))], [3])))).toEqual(new Map([[ann, wi(3)]]));
  });

  it('with no piece touched, no anchor: the ship rests by its planet’s name', () => {
    expect(pieceAnchors(ctx([ev(1, ann, 'wi_title_changed', wi(9))])).size).toBe(0);
  });
});
