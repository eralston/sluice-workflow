// 04 §7, 03 §9 — a captain's ship and call sign, shared by the fixture DSL and ingest so both make
// the same ones: the seed is fixed per person (an art update never changes anyone's ship).
import { fnv1a32 } from './hash';
import { SHIP_DESIGN_VERSION } from './limits';

/** `fnv1a32(orgKey + identityId + SHIP_DESIGN_VERSION)`: written the first time a person is seen. */
export function shipSeedFor(orgKey: string, identityId: string): number {
  return fnv1a32(`${orgKey}${identityId}${SHIP_DESIGN_VERSION}`);
}

/** The first name plus a 2-character suffix from the seed (editable later). */
export function callSignFor(displayName: string, seed: number): string {
  const first = displayName.split(/\s+/)[0] ?? displayName;
  const suffix = (seed % 1296).toString(36).toUpperCase().padStart(2, '0');
  return `${first}-${suffix}`;
}

/**
 * A person's name as the chart shows it: any parenthetical is dropped ("Noah Calhoun (Proliance
 * Consulting)" → "Noah Calhoun"). ADO appends a contractor's company that way. The data keeps it; only
 * what is drawn and spoken ignores it. A name that is nothing but a parenthetical is left as it is.
 */
export function plainName(name: string): string {
  let plain = name;
  for (let prev = ''; prev !== plain;) { prev = plain; plain = plain.replace(/\([^()]*\)/g, ''); } // innermost first
  plain = plain.replace(/\(.*$/s, '').replace(/\s+/g, ' ').trim(); // an unclosed one runs to the end
  return plain || name.trim();
}
