// Homeworlds (2026-10-12): planet names from first names, stable per full name and never repeated in a
// roster; guests (people with no seat) still get a ship where they helped; and the holographic
// label's geometry (its pointer starts on the object's rim, its plate hangs outward). The renderer
// modules are loaded by path, as in labelTiers.test.ts; they touch no DOM at import.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { SOLAR, solarHierarchy } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const SRC = resolve(__dirname, '../../src/renderer/src');
const { homeworldNames, firstNameOf, HOMEWORLD_TEMPLATES } = (await import(/* @vite-ignore */ `${SRC}/theme/starChart/homeworlds.ts`)) as {
  homeworldNames(r: readonly { key: string; displayName: string }[]): Map<string, string>;
  firstNameOf(n: string): string;
  HOMEWORLD_TEMPLATES: readonly string[];
};
const { holoCandidates, holoVerticalCandidates, holoUnderCandidate, HOLO } = (await import(/* @vite-ignore */ `${SRC}/chart/holo/holoLabel.ts`)) as {
  holoVerticalCandidates(a: { cx: number; cy: number; r: number }, w: number, h: number, prefer?: 'above' | 'below'): {
    rect: { x0: number; y0: number; x1: number; y1: number }; side: string; leader: [number, number][];
  }[];
  holoCandidates(a: { cx: number; cy: number; r: number; dirX: number; dirY: number }, w: number, h: number): {
    rect: { x0: number; y0: number; x1: number; y1: number }; side: 'left' | 'right'; leader: [number, number][];
  }[];
  holoUnderCandidate(a: { cx: number; cy: number; r: number }, w: number, h: number): {
    rect: { x0: number; y0: number; x1: number; y1: number }; side: string; leader: [number, number][];
  };
  HOLO: { reach: number; run: number };
};

const p = (key: string, displayName: string) => ({ key, displayName });

describe('homeworld names', () => {
  it('reads the first name, including "Last, First" and email forms', () => {
    expect(firstNameOf('Wren Calloway')).toBe('Wren');
    expect(firstNameOf('Calloway, Wren')).toBe('Wren');
    expect(firstNameOf('wren.calloway@example.test')).toBe('Wren');
    expect(firstNameOf('  Kit  ')).toBe('Kit');
  });

  it('names everyone from a template with their first name in it', () => {
    const names = homeworldNames([p('a', 'Wren Calloway'), p('b', 'Kit Marchetti')]);
    for (const [key, first] of [['a', 'Wren'], ['b', 'Kit']] as const) {
      const name = names.get(key)!;
      expect(HOMEWORLD_TEMPLATES.some((t) => t.replace('{F}', first) === name)).toBe(true);
    }
  });

  it('gives the same full name the same name, whoever else is on the roster', () => {
    const alone = homeworldNames([p('a', 'Eric Haney')]).get('a');
    const crowd = homeworldNames([p('z', 'Zed Quill'), p('a', 'Eric Haney'), p('m', 'Mara Ost'), p('q', 'Ana Bell')]).get('a');
    expect(crowd).toBe(alone);
    expect(homeworldNames([p('other-key', '  eric   HANEY ')]).get('other-key')).toBe(alone);
  });

  it('never repeats a name, even for many people sharing a first name', () => {
    const roster = Array.from({ length: 40 }, (_, i) => p(`k${i}`, `Eric Surname${i}`));
    const names = [...homeworldNames(roster).values()];
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(roster.length);
  });

  it('keeps the earlier full name\'s choice when two collide; the later one moves on', () => {
    // Find two Erics whose full names hash to the same template.
    const base = homeworldNames([p('a', 'Eric A0')]).get('a');
    const twin = Array.from({ length: 200 }, (_, i) => `Eric B${i}`).find((n) => homeworldNames([p('b', n)]).get('b') === base)!;
    expect(twin).toBeDefined();
    const both = homeworldNames([p('b', twin), p('a', 'Eric A0')]);
    expect(both.get('a')).toBe(base);
    expect(both.get('b')).not.toBe(base);
  });
});

describe('guests and titled seats in the solar projection (pod-sprint)', () => {
  const h: ScopeHistory = toHistory(podSprint, mapping, sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!);
  const pod = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods[0]! : null;
  const scene = SOLAR.format({ level: 'pod', key: pod!.areaKey });
  const keyOf = (name: string) => h.entities.captains.find((c) => c.displayName === name)!.key;
  const at = (hier = SOLAR) => projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), scene as never, LAYOUT_VERSION, hier);

  it('gives a planetless helper a ship, but no seat', () => {
    const g = at();
    for (const name of ['Pell Ibarra', 'Sable Nakamura', 'Tamsin Oduya']) {
      const k: CanonicalKey = keyOf(name);
      expect(g.nodes.some((n) => n.kind === 'seat' && n.canonicalKey === k), `${name} seat`).toBe(false);
      const ship = g.nodes.find((n) => n.kind === 'captain' && n.canonicalKey === k);
      expect(ship, `${name} ship`).toBeDefined();
      expect(ship!.attach && g.nodes.some((n) => n.projectionKey === ship!.attach!.to)).toBe(true);
    }
  });

  it('has no guest ship before the guest has helped', () => {
    const g = projectScene(h, snapshotAt(h, h.range.startUtc, 'knownThen'), scene as never, LAYOUT_VERSION, SOLAR);
    expect(g.nodes.some((n) => n.kind === 'captain' && n.canonicalKey === keyOf('Sable Nakamura'))).toBe(false);
  });

  it('titles a seat with the theme\'s name, keeps the person as its subtitle, and points its label outward', () => {
    const g = at(solarHierarchy({ seatTitle: (_h, person) => `World of ${person.slice(-4)}` }));
    const seat = g.nodes.find((n) => n.kind === 'seat')!;
    expect(seat.label.startsWith('World of ')).toBe(true);
    expect(seat.meta).toBe(h.entities.captains.find((c) => c.key === seat.canonicalKey)!.displayName);
    const star = g.solar!.star;
    const out = { x: seat.world.x - star.x, y: seat.world.y - star.y };
    const len = Math.hypot(out.x, out.y);
    expect(seat.labelDir!.x).toBeCloseTo(out.x / len, 6);
    expect(seat.labelDir!.y).toBeCloseTo(out.y / len, 6);
    expect(g.lists![seat.projectionKey]!.title).toBe(seat.label);
  });

  it('leaves seat titles as the person\'s name without a theme', () => {
    const seat = at().nodes.find((n) => n.kind === 'seat')!;
    expect(seat.label).toBe(h.entities.captains.find((c) => c.key === seat.canonicalKey)!.displayName);
  });
});

describe('the holographic label\'s placement', () => {
  const a = { cx: 100, cy: 100, r: 40, dirX: 0.8, dirY: -0.6 };

  it('puts a planet\'s name centred under it, half its height over the rim, with no pointer to draw', () => {
    const at = holoUnderCandidate(a, 90, 18);
    expect(at.rect.y0).toBe(a.cy + a.r - 9); // half of its 18 px over the planet
    expect((at.rect.x0 + at.rect.x1) / 2).toBe(a.cx);
    expect(at.rect.y1 - at.rect.y0).toBe(18);
    expect(at.leader[0]).toEqual(at.leader[1]); // a single point: nothing is drawn
  });

  it('starts its pointer on the rim, elbows outward, and runs level into the plate', () => {
    const [best] = holoCandidates(a, 90, 18);
    const [rim, elbow, end] = best!.leader;
    expect(Math.hypot(rim![0] - a.cx, rim![1] - a.cy)).toBeCloseTo(a.r, 6);
    expect(Math.hypot(elbow![0] - a.cx, elbow![1] - a.cy)).toBeCloseTo(a.r + HOLO.reach, 6);
    expect(end![1]).toBe(elbow![1]);
    expect(best!.side).toBe('right');
    expect(best!.rect.x0).toBeCloseTo(end![0], 6);
    expect((best!.rect.y0 + best!.rect.y1) / 2).toBeCloseTo(end![1], 6);
  });

  it('hangs a plate on the left of a planet that faces left', () => {
    const [best] = holoCandidates({ ...a, dirX: -1, dirY: 0 }, 90, 18);
    expect(best!.side).toBe('left');
    expect(best!.rect.x1).toBeLessThan(a.cx - a.r);
  });

  it('never puts a plate over its own object', () => {
    for (const c of holoCandidates(a, 90, 18)) {
      const nx = Math.max(c.rect.x0, Math.min(a.cx, c.rect.x1));
      const ny = Math.max(c.rect.y0, Math.min(a.cy, c.rect.y1));
      expect(Math.hypot(nx - a.cx, ny - a.cy)).toBeGreaterThanOrEqual(a.r - 1e-6);
    }
  });
});

describe('the upright holographic label (stations)', () => {
  const a = { cx: 200, cy: 200, r: 30 };

  it('stands below by default, on a straight connector from the bottom edge into the plate\'s top', () => {
    const [best] = holoVerticalCandidates(a, 120, 30);
    const [rim, end] = best!.leader;
    expect(best!.side).toBe('below');
    expect(rim).toEqual([a.cx, a.cy + a.r]);
    expect(end![0]).toBe(a.cx);
    expect(best!.rect.y0).toBeCloseTo(end![1], 6);
    expect((best!.rect.x0 + best!.rect.x1) / 2).toBeCloseTo(a.cx, 6);
  });

  it('stands above when asked, and tries the other side after its own', () => {
    const all = holoVerticalCandidates(a, 120, 30, 'above');
    expect(all[0]!.side).toBe('above');
    expect(all[0]!.rect.y1).toBeLessThanOrEqual(a.cy - a.r);
    expect(all.some((c) => c.side === 'below')).toBe(true);
    expect(all.findIndex((c) => c.side === 'below')).toBeGreaterThan(all.findLastIndex((c) => c.side === 'above'));
  });

  it('always meets the plate: every shift keeps the connector inside its width', () => {
    for (const c of holoVerticalCandidates(a, 120, 30)) expect(c.rect.x0 < a.cx && a.cx < c.rect.x1).toBe(true);
  });
});
