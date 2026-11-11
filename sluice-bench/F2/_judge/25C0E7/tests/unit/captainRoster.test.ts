// Settings → Captain Avatars: which captains a scene lists, and which dropped file is whose. Invented names (INV-18).
import { describe, expect, it } from 'vitest';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import { toHistory } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { captainsInScene, matchFiles, mergeRoster, nameScore, wordsOf } from '@shared/captainRoster';
import { mapping } from '../golden/helpers';

const k = (n: number) => `id:org:${n}` as CanonicalKey;
const crew = [
  { key: k(1), displayName: 'Ava Lindqvist' },
  { key: k(2), displayName: 'Rafe Okoro' },
  { key: k(3), displayName: 'Mina Sato' },
  { key: k(4), displayName: 'José Márquez' },
  { key: k(5), displayName: 'Ava Brandt' },
];

describe('file names to people', () => {
  it('reads words out of file names however they are written', () => {
    expect(wordsOf('AvaLindqvist_2.JPG')).toEqual(['ava', 'lindqvist', '2']);
    expect(wordsOf('Márquez, José (1).png')).toEqual(['marquez', 'jose', '1']);
    expect(wordsOf('ava.lindqvist@fixture.example')).toEqual(['ava', 'lindqvist', 'fixture', 'example']);
  });
  it('scores the whole name, the two names in any order, fragments, and a lone name', () => {
    expect(nameScore('Ava Lindqvist.jpg', 'Ava Lindqvist')).toBe(100);
    expect(nameScore('lindqvist-ava.png', 'Ava Lindqvist')).toBe(100);
    expect(nameScore('IMG_2231 ava lindqvist headshot copy.jpg', 'Ava Lindqvist')).toBe(100); // filler words and numbers do not count
    expect(nameScore('ava lindqvist quoting team.jpg', 'Ava Lindqvist')).toBe(90);
    expect(nameScore('ava.lindqvist@fixture.example.png', 'Ava Lindqvist')).toBe(90);
    expect(nameScore('ava lind.jpg', 'Ava Lindqvist')).toBe(70);
    expect(nameScore('rafe.png', 'Rafe Okoro')).toBe(50);
    expect(nameScore('jose marquez.png', 'José Márquez')).toBe(100); // accents do not matter
    expect(nameScore('ok.png', 'Rafe Okoro')).toBe(0); // too short to mean anything
    expect(nameScore('IMG_0042.jpg', 'Rafe Okoro')).toBe(0);
  });
  it('places a file only when it clearly belongs to one person', () => {
    const r = matchFiles(['Ava Lindqvist.jpg', 'okoro.png', 'mina sato headshot.jpeg', 'sunset.jpg', 'ava.png'], crew);
    expect(r.assigned.map((a) => [a.file, a.key]).sort()).toEqual([[0, k(1)], [1, k(2)], [2, k(3)]]);
    // 'ava.png' fits both Avas equally: left for the user. 'sunset' fits nobody.
    expect(r.unassigned).toEqual([3, 4]);
  });
  it('gives each person one file: the better fit wins, a tie places neither', () => {
    const better = matchFiles(['rafe okoro.jpg', 'okoro.jpg'], crew);
    expect(better.assigned).toEqual([{ file: 0, key: k(2), score: 100 }]);
    expect(better.unassigned).toEqual([1]);
    const tie = matchFiles(['okoro.jpg', 'okoro (1).jpg'], crew);
    expect(tie.assigned).toEqual([]);
    expect(tie.unassigned).toEqual([0, 1]);
  });
});

describe('who a scene lists', () => {
  const scenario = orbitWeek;
  const h = toHistory(scenario, mapping);
  it('is the bundle’s captains with no scene, and only those an event touches with one', () => {
    expect(captainsInScene(h, null)).toBe(h.entities.captains);
    expect(captainsInScene(h, new Set())).toEqual([]);
    const some = new Set(h.events.slice(0, 1).map((e) => e.entityKey));
    const got = captainsInScene(h, some);
    expect(got.length).toBeLessThanOrEqual(h.entities.captains.length);
    for (const c of got) expect(h.entities.captains).toContain(c);
  });
  it('merges one captain once and keeps a hand-added picture', () => {
    const a = { key: k(1), displayName: 'Ava Lindqvist', shipSeed: 1, callSign: 'Ava-1' };
    const b = { ...a, avatar: 'data:image/png;base64,AA', handAdded: true };
    const m = mergeRoster([[a, { key: k(2), displayName: 'Bo Fenwick', shipSeed: 2, callSign: 'Bo-2' }], [b]]);
    expect(m.map((c) => c.displayName)).toEqual(['Ava Lindqvist', 'Bo Fenwick']);
    expect(m[0]).toMatchObject({ avatar: 'data:image/png;base64,AA', handAdded: true });
  });
});
