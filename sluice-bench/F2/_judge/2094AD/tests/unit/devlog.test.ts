// The dev log (decided 2026-10-07): redaction, the gate, and rotation.
import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { devlog, devLogEnabled, rotate, startDevLog, stopDevLog } from '../../src/main/devlog';
import { makeRedactor } from '../../src/main/redact';

const GUID = '576692eb-b656-466d-991d-f09ba63162c1';
const r = makeRedactor('salt-a');

describe('redaction', () => {
  it('hashes canonical keys, GUIDs, and ID fields; the same input hashes the same; another salt differs', () => {
    const out = r.entry({ kind: 'select', key: `wi:${GUID}:4211`, scene: `feature:wi:${GUID}:101`, itemId: 4211, count: 3 });
    const text = JSON.stringify(out);
    expect(text).not.toContain(GUID);
    expect(text).not.toContain('4211');
    expect(out.key).toMatch(/^wi:h:[0-9a-f]{10}:h:[0-9a-f]{10}$/);
    expect(out.scene).toMatch(/^feature:wi:h:/);
    expect(out.count).toBe(3);
    expect(r.entry({ key: `wi:${GUID}:4211` }).key).toBe(out.key);
    expect(makeRedactor('salt-b').entry({ key: `wi:${GUID}:4211` }).key).not.toBe(out.key);
  });
  it('keeps no free text outside the allowlist: names, titles, paths, messages become a length', () => {
    const out = r.entry({ kind: 'ipc', title: 'Quote history panel', path: 'Nimbus Deck\\Comet Crew', label: 'Comet Crew', message: 'TF401019: The Git repository X does not exist', args: [{ name: 'Nimbus Deck', projectKey: `proj:${GUID}:${GUID}` }] });
    const text = JSON.stringify(out);
    for (const s of ['Quote', 'Nimbus', 'Comet', 'TF401019: The', GUID]) expect(text).not.toContain(s);
    expect(out.title).toBe('<text:19>');
    expect(out.kind).toBe('ipc');
  });
  it('keeps safe fields that look like tokens, and hashes GUIDs inside them', () => {
    expect(r.entry({ key: 'ArrowDown', mods: '⇧', code: 'TF401019', status: 404, setting: `pinned:${GUID}` })).toEqual({ key: 'ArrowDown', mods: '⇧', code: 'TF401019', status: 404, setting: expect.stringMatching(/^pinned:h:[0-9a-f]{10}$/) });
    expect(r.entry({ code: 'a sentence that is far too long to be a code and might well carry someone’s words in it, so it goes' }).code).toMatch(/^<text:/);
  });
  it('scrubs URLs: API words and safe query values kept, everything else hashed', () => {
    const u = r.url(`https://dev.azure.com/contoso/${GUID}/_apis/git/pullrequests?searchCriteria.repositoryId=${GUID}&searchCriteria.status=all&$top=100&api-version=7.1`);
    expect(u).not.toContain('contoso');
    expect(u).not.toContain(GUID);
    expect(u).toMatch(/^\/h:[0-9a-f]{10}\/h:[0-9a-f]{10}\/_apis\/git\/pullrequests\?searchCriteria\.repositoryId=h:[0-9a-f]{10}&searchCriteria\.status=all&\$top=100&api-version=7\.1$/);
  });
  it('drops a whole line that still carries a guarded term (whole words only)', () => {
    const g = makeRedactor('s', () => ['Juniper Ridge', 'Team']);
    expect(g.entry({ kind: 'key', key: 'Juniper Ridge' })).toEqual({ kind: 'redaction-dropped', was: 'key' });
    expect(g.entry({ kind: 'click', target: 'button.team-pill' }).kind).toBe('click'); // "team" inside a class name isn't the word Team
  });
});

describe('the gate and the files', () => {
  afterEach(() => stopDevLog());
  it('on for developer runs only; tests on request; never packaged', () => {
    expect(devLogEnabled({ packaged: false, test: false, env: {} })).toBe(true);
    expect(devLogEnabled({ packaged: true, test: false, env: {} })).toBe(false);
    expect(devLogEnabled({ packaged: true, test: false, env: { STAR_CHART_DEVLOG: '1' } })).toBe(false);
    expect(devLogEnabled({ packaged: false, test: true, env: {} })).toBe(false);
    expect(devLogEnabled({ packaged: false, test: true, env: { STAR_CHART_DEVLOG: '1' } })).toBe(true);
    expect(devLogEnabled({ packaged: false, test: false, env: { STAR_CHART_DEVLOG: '0' } })).toBe(false);
    // A packaged build logs only when the user turned the diagnostic log on (slice 7, decided 2026-10-10).
    expect(devLogEnabled({ packaged: true, test: false, env: {}, optIn: true })).toBe(true);
    expect(devLogEnabled({ packaged: true, test: false, env: {}, optIn: false })).toBe(false);
    expect(devLogEnabled({ packaged: true, test: false, env: { STAR_CHART_DEVLOG: '0' }, optIn: true })).toBe(false);
  });
  it('keeps the last 3 runs, and writes redacted JSON lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devlog-'));
    for (const [i, name] of ['run-20261001-090000.jsonl', 'run-20261002-090000.jsonl', 'run-20261003-090000.jsonl', 'run-20261004-090000.jsonl', 'notes.txt'].entries()) {
      writeFileSync(join(dir, name), '');
      utimesSync(join(dir, name), 1_000 + i, 1_000 + i);
    }
    rotate(dir);
    expect(readdirSync(dir).sort()).toEqual(['notes.txt', 'run-20261003-090000.jsonl', 'run-20261004-090000.jsonl']);
    const file = startDevLog(dir, Buffer.from('salt'), () => []);
    expect(readdirSync(dir).filter((f) => f.startsWith('run-'))).toHaveLength(2); // rotated again, and this one isn't written yet
    devlog.write('main', 'net-start', { family: 'prs', method: 'GET', endpoint: `https://dev.azure.com/contoso/${GUID}/_apis/git/repositories` });
    const line = JSON.parse(readFileSync(file, 'utf8').trim());
    expect(line).toMatchObject({ src: 'main', kind: 'net-start', family: 'prs', method: 'GET' });
    expect(JSON.stringify(line)).not.toContain('contoso');
    expect(readdirSync(dir).filter((f) => f.startsWith('run-'))).toHaveLength(3);
  });
});
