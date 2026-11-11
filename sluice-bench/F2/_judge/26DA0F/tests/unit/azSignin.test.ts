// 23 E5 (fix round): a refused PAT while the Azure CLI is signed in restores the saved PAT and the az
// sign-in, never the az token as a PAT; and a resume at launch re-reads who the token belongs to.
// Electron is mocked; canary tokens only (INV-17).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StateMapping } from '@shared/contracts/history';
import type { UtcMs } from '@shared/contracts/keys';
import stateMappingJson from '@config/state-mapping.json';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, ipcMain: { handle: () => undefined, removeHandler: () => undefined }, safeStorage: {} }));

const { AdoService } = await import('../../src/main/ado/service');
const { AzOverlayStore, MemoryStore } = await import('../../src/main/credentials/store');
const { AzSession } = await import('../../src/main/credentials/azCli');

const ORG_ID = '0b5c7d2e-1111-4a6b-9c3d-5e7f9a1b2c3d';
const AZ = 'CANARY-AZ-TOKEN-unit';
const PAT = 'CANARY-PAT-saved';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup(me: { value: string; deny?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'sc-az-unit-'));
  dirs.push(dir);
  const inner = new MemoryStore();
  const session = new AzSession(async () => ({ code: 0, stdout: JSON.stringify({ accessToken: AZ, expires_on: 4102444800 }) }), Date.now, { set: () => 0, clear: () => undefined });
  const credentials = new AzOverlayStore(inner, session);
  const service = new AdoService({
    dbDir: dir, picturesDir: join(dir, 'p'), credentials, az: { session }, mapping: stateMappingJson as StateMapping, clock: () => 0 as UtcMs,
    transportFor: (_org, pat) => ({
      send: async () => (pat() === 'BAD' || me.deny === true
        ? { status: 401, headers: {}, body: null }
        : { status: 200, headers: {}, body: { instanceId: ORG_ID, authenticatedUser: { id: me.value, providerDisplayName: 'Someone' } } }),
    }),
    send: () => undefined, openExternal: async () => undefined,
  });
  return { service, credentials, inner, session };
}
const ID_A = '4c2a9e61-3333-4f5a-b7c9-d1e3f5a7b9c1';
const ID_B = '9d8c7b6a-4444-4e3f-a2b1-c0d9e8f7a6b5';

describe('setPat while the Azure CLI is signed in', () => {
  it('a refused PAT keeps the saved PAT and the az sign-in', async () => {
    const { service, credentials, inner, session } = setup({ value: ID_A });
    await inner.set(PAT);
    expect((await service.azSignIn('https://dev.azure.com/org')).ok).toBe(true);
    expect(credentials.get()).toBe(AZ);
    const r = await service.setPat('https://dev.azure.com/org', 'BAD');
    expect(r.ok).toBe(false);
    expect(inner.get()).toBe(PAT); // not the az token, not BAD
    expect(session.token()).toBe(AZ);
    expect(credentials.get()).toBe(AZ);
    expect(service.status().method).toBe('az');
    service.cache.close();
  });
  it('with no saved PAT, a refused one leaves none', async () => {
    const { service, inner } = setup({ value: ID_A });
    await service.azSignIn('https://dev.azure.com/org');
    await service.setPat('https://dev.azure.com/org', 'BAD');
    expect(inner.get()).toBeNull();
    service.cache.close();
  });
});

describe('resuming the Azure CLI at launch', () => {
  it('re-reads who the account is, and ADO calls can wait for it', async () => {
    const me = { value: ID_A };
    const { service, session } = setup(me);
    await service.azSignIn('https://dev.azure.com/org');
    expect(service.status().me?.key).toContain(ID_A);
    session.stop();
    me.value = ID_B; // az is now another account
    service.resumeAz();
    await service.ready();
    expect(session.active).toBe(true);
    expect(service.status().me?.key).toContain(ID_B);
    service.cache.close();
  });
});

describe('resuming with an account the org refuses (audit 3)', () => {
  it('signs the Azure CLI out, so the saved PAT takes over', async () => {
    const me = { value: ID_A, deny: false };
    const { service, credentials, inner, session } = setup(me);
    await inner.set(PAT);
    await service.azSignIn('https://dev.azure.com/org');
    session.stop();
    me.deny = true;
    service.resumeAz();
    await service.ready();
    expect(session.active).toBe(false);
    expect(credentials.get()).toBe(PAT);
    expect(service.status().method).toBe('pat');
    expect(service.cache.meta('auth_az')).toBe('');
    service.resumeAz(); // nothing asks `az` again
    await service.ready();
    expect(session.active).toBe(false);
    service.cache.close();
  });
});

describe('Purge keeps how you signed in and who you are (audit 2, 04 §8)', () => {
  it('carries the az flag and "Is this you?" over, so a resume still runs', async () => {
    const me = { value: ID_A };
    const { service, session } = setup(me);
    await service.azSignIn('https://dev.azure.com/org');
    const before = service.status().me;
    expect(before).not.toBeNull();
    service.purge();
    expect(service.status().me).toEqual(before);
    expect(service.cache.meta('auth_az')).toBe('1');
    session.stop();
    service.resumeAz();
    await service.ready();
    expect(session.active).toBe(true);
    service.cache.close();
  });
});
