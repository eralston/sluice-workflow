// Slice 6: pictures added by hand. One small PNG per person under userData, keyed by org and identity
// ID (INV-22), overlaid on the identities the cache holds so it wins over ADO's, and never in the cache
// itself (Purge leaves it). Synthetic people only: the pictures are a few invented bytes.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import { isAvatarImage } from '@shared/scene/avatar';
import { HandPictures } from '../../src/main/avatars/pictures';
import { loadLevelHistory } from '../../src/main/sync/levels';
import { SprintStream } from '../../src/main/sync/sprintStream';
import { harness, syncScopeOf } from '../golden/ingest';
import { mapping } from '../golden/helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const fresh = () => new HandPictures(mkdtempSync(join(tmpdir(), 'sc-pictures-')));

describe('hand-added pictures (91, slice 6)', () => {
  it('keeps a picture per person and org, and forgets it on request', () => {
    const p = fresh();
    expect(p.get('org-a', 'person-1')).toBeNull();
    p.set('org-a', 'person-1', PNG);
    const url = p.get('org-a', 'person-1')!;
    expect(isAvatarImage(url)).toBe(true); // the renderer only ever takes inline images
    expect(p.get('org-b', 'person-1')).toBeNull(); // another org's person with the same ID is someone else
    expect(p.has('org-a', 'person-1')).toBe(true);
    expect([...p.ids('org-a')]).toEqual(['person-1']);
    expect(p.remove('org-a', 'person-1')).toBe(true);
    expect(p.remove('org-a', 'person-1')).toBe(false);
    expect(p.get('org-a', 'person-1')).toBeNull();
  });

  it('names files by identity ID and cannot be walked out of its folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-pictures-'));
    const p = new HandPictures(dir);
    p.set('org-a', '../../escape', PNG);
    p.set('../org', 'x/y', PNG);
    const all = readdirSync(dir, { recursive: true }).map(String);
    expect(all.some((f) => f.split('/').includes('..'))).toBe(false); // every file is inside the folder
    expect(all.filter((f) => f.endsWith('.png'))).toHaveLength(2);
    expect(readdirSync(join(dir, '..')).includes('escape.png')).toBe(false);
  });

  it('wins over the picture ADO served, and leaves everyone else alone', () => {
    const p = fresh();
    p.set('org', 'a', PNG);
    const adoPic = 'data:image/png;base64,AAAA';
    const out = p.overlay('org', new Map([['a', { displayName: 'A', avatar: adoPic }], ['b', { displayName: 'B', avatar: adoPic }], ['c', { displayName: 'C' }]]));
    expect(out.get('a')!.avatar).toBe(p.get('org', 'a'));
    expect(out.get('b')!.avatar).toBe(adoPic);
    expect(out.get('c')!.avatar).toBeUndefined();
  });

  it('reaches the bundle: a captain with a hand-added picture carries it', async () => {
    const scope = sprintScopes(sprintMechanics).find((x) => x.sprint === 'Halcyon Reach\\Sprint 41')!;
    const h = await harness(sprintMechanics);
    const sync = syncScopeOf(sprintMechanics, scope);
    const ctx = { client: h.client, cache: h.cache, mapping, clock: h.clock };
    const stream = new SprintStream(ctx, sync, { changed: () => {} });
    await stream.look();
    await stream.fill();
    const range = toHistory(sprintMechanics, mapping, scope).range;
    const before = loadLevelHistory(ctx, sync, range).entities.captains;
    const who = before.find((c) => !c.avatar) ?? before[0]!;
    const pictures = fresh();
    pictures.set(sync.org, who.key.split(':').pop()!, PNG);
    const after = loadLevelHistory({ ...ctx, pictures }, sync, range).entities.captains;
    expect(after.find((c) => c.key === who.key)!.avatar).toBe(pictures.get(sync.org, who.key.split(':').pop()!));
    // Nobody else changed.
    expect(after.filter((c) => c.key !== who.key)).toEqual(before.filter((c) => c.key !== who.key));
  });

  it('copies the pictures out by ID and reads them back, taking only real small PNGs', () => {
    const a = fresh();
    a.set('org-a', 'person-1', PNG);
    a.set('org-a', 'person-2', PNG);
    const out = mkdtempSync(join(tmpdir(), 'sc-export-'));
    expect(a.exportTo('org-a', join(out, 'star-chart-pictures'))).toBe(2);
    expect(readdirSync(join(out, 'star-chart-pictures')).sort()).toEqual(['person-1.png', 'person-2.png']);
    expect(a.exportTo('org-empty', join(out, 'none'))).toBe(0);

    // Another Mac: the parent folder will do; junk in the folder is skipped.
    mkdirSync(join(out, 'star-chart-pictures', 'sub'));
    writeFileSync(join(out, 'star-chart-pictures', 'notes.txt'), 'hello');
    writeFileSync(join(out, 'star-chart-pictures', 'fake.png'), 'not a png at all');
    writeFileSync(join(out, 'star-chart-pictures', '.hidden.png'), PNG);
    const b = fresh();
    expect(b.importFrom('org-b', out).sort()).toEqual(['person-1', 'person-2']);
    expect(isAvatarImage(b.get('org-b', 'person-1')!)).toBe(true);
    expect(b.get('org-b', 'fake')).toBeNull();
  });
});
