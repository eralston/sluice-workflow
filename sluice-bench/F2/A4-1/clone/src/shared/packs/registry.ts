// 14 §1.2 — the domain pack registry. A bundle names the pack that reads it (`domainPack`); SDLC
// bundles omit it (AC-27), so an unnamed bundle is read by 'sdlc'. `packs/all.ts` registers every
// pack once at import. The engine never imports this file (the import fence): callers look the
// pack up here and pass it in. Pure.
import type { ScopeHistory } from '../contracts/history';
import type { DomainPack } from '../engine/types';

/** The pack that reads a bundle with no `domainPack`. */
export const DEFAULT_PACK = 'sdlc';

const packs = new Map<string, DomainPack>();

/** Registers a pack; a later pack with the same id replaces it (a hot reload). */
export function registerPack(pack: DomainPack): void {
  packs.set(pack.id, pack);
}

/** The pack by id, or undefined. */
export function packById(id: string): DomainPack | undefined {
  return packs.get(id);
}

/** The id of the pack that reads a bundle. */
export function packIdOf(h: Pick<ScopeHistory, 'domainPack'>): string {
  return h.domainPack ?? DEFAULT_PACK;
}

/**
 * The pack that reads a bundle. A bundle naming a pack this build doesn't have is refused rather
 * than read by another pack's rules, which would misplace every piece.
 */
export function packFor(h: Pick<ScopeHistory, 'domainPack'>): DomainPack {
  const id = packIdOf(h);
  const pack = packs.get(id);
  if (!pack) throw new Error(`No domain pack '${id}' is registered`);
  return pack;
}

/** Every registered pack, by id. */
export function allPacks(): DomainPack[] {
  return [...packs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Tests only: forget every pack. */
export function resetPacks(): void {
  packs.clear();
}
