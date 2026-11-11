// 14 §1.2 — every domain pack, registered once on import. A new pack is one line here (14 §8).
// Import this file (for its effect) wherever bundles are read: main, the renderer and tests.
import type { DomainPack } from '../engine/types';
import { registerPack } from './registry';
import { crmPack } from './crm';
import { sdlcPack } from './sdlc';
import { todoPack } from './todo';

/** Every pack this build has. */
export const PACKS: readonly DomainPack[] = [sdlcPack, todoPack, crmPack];

/** Registers every pack. Idempotent, so a caller can make sure without relying on import order. */
export function registerAllPacks(): void {
  for (const p of PACKS) registerPack(p);
}

registerAllPacks();
