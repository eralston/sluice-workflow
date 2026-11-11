// 04 §1 — where the PAT lives. KeychainStore encrypts it with safeStorage (the macOS Keychain) and
// keeps only ciphertext under userData, dev builds included (macOS may ask once). MemoryStore holds it
// for this run only: used when safeStorage is unavailable, and forced in test runs (STAR_CHART_TEST).
// The PAT never leaves main except as the Authorization header on allowlisted calls (INV-17).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';
import type { AzSession } from './azCli';

export interface CredentialStore {
  readonly kind: 'keychain' | 'memory';
  get(): string | null;
  /** The stored PAT itself, apart from any Azure CLI token that `get()` would return in its place (04 §1a). Absent: `get()`. */
  stored?(): string | null;
  set(pat: string): Promise<void>;
  clear(): Promise<void>;
  /** Load the stored token, if any, at startup. */
  load(): Promise<void>;
}

export class MemoryStore implements CredentialStore {
  readonly kind = 'memory' as const;
  private pat: string | null = null;
  get() { return this.pat; }
  async set(pat: string) { this.pat = pat; }
  async clear() { this.pat = null; }
  async load() { /* nothing persists */ }
}

export class KeychainStore implements CredentialStore {
  readonly kind = 'keychain' as const;
  private pat: string | null = null;
  constructor(private readonly file: string) {}
  get() { return this.pat; }
  async set(pat: string) {
    writeFileSync(this.file, await safeStorage.encryptStringAsync(pat), { mode: 0o600 });
    this.pat = pat;
  }
  async clear() {
    this.pat = null;
    rmSync(this.file, { force: true });
  }
  async load() {
    if (!existsSync(this.file)) return;
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(readFileSync(this.file));
      this.pat = result;
      if (shouldReEncrypt) await this.set(result);
    } catch {
      this.pat = null; // unreadable (another machine, a reset Keychain): ask again
    }
  }
}

export async function credentialStore(file: string, forceMemory: boolean): Promise<CredentialStore> {
  if (!forceMemory && (await safeStorage.isAsyncEncryptionAvailable())) {
    const s = new KeychainStore(file);
    await s.load();
    return s;
  }
  return new MemoryStore();
}

/**
 * What the transport reads: the Azure CLI token while one is signed in (sent as Bearer, 04 §1a), else
 * the stored PAT (sent as Basic). The az token lives in the session, in memory: this store never passes
 * it to the inner store, so it never reaches the Keychain or disk (INV-17). Entering a PAT signs the
 * Azure CLI out.
 */
export class AzOverlayStore implements CredentialStore {
  constructor(private readonly inner: CredentialStore, readonly az: AzSession) {}
  get kind(): 'keychain' | 'memory' { return this.az.active ? 'memory' : this.inner.kind; }
  get method(): 'pat' | 'az' { return this.az.active ? 'az' : 'pat'; }
  get() { return this.az.token() ?? this.inner.get(); }
  stored() { return this.inner.get(); }
  scheme(): 'basic' | 'bearer' { return this.az.active ? 'bearer' : 'basic'; }
  async set(pat: string) { this.az.stop(); await this.inner.set(pat); }
  /** Signs out of whichever is in use: the Azure CLI first (a saved PAT stays), else the PAT. */
  async clear() { if (this.az.active) this.az.stop(); else await this.inner.clear(); }
  async load() { await this.inner.load(); }
}
