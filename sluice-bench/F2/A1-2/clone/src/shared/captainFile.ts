// The captain file (23 E2, 13 §7): the viewer's ship style (faction, hull, colourway) as a small JSON
// file, `{ "v": 1, "faction", "hull", "colourway" }`, to carry to another Mac. Nothing else is ever
// written to it or read from it (no emblems, no names, no keys). Pure: main checks the shape, and the
// renderer checks the numbers against the fleet it actually has (`checkAgainstFleet`).
import { z } from 'zod';
import { captainStyleSchema, type CaptainStyle } from './contracts/settings';

export const CAPTAIN_FILE_VERSION = 1;
/** A captain file is a few dozen bytes; anything bigger is not one. */
export const CAPTAIN_FILE_MAX_BYTES = 4096;

export const captainFileSchema = captainStyleSchema.extend({ v: z.literal(CAPTAIN_FILE_VERSION) }).strict();
export type CaptainFile = z.infer<typeof captainFileSchema>;

/** What the file holds for a style: exactly these four fields, in this order. */
export function captainFileOf(style: CaptainStyle): CaptainFile {
  const s = captainStyleSchema.parse(style);
  return { v: CAPTAIN_FILE_VERSION, faction: s.faction, hull: s.hull, colourway: s.colourway };
}

export function serializeCaptainFile(style: CaptainStyle): string {
  return `${JSON.stringify(captainFileOf(style), null, 2)}\n`;
}

export type CaptainFileResult = { ok: true; style: CaptainStyle } | { ok: false; message: string };

/** Reads a captain file's text: the right version and shape, or a message to show. */
export function parseCaptainFile(text: string): CaptainFileResult {
  if (text.length > CAPTAIN_FILE_MAX_BYTES) return { ok: false, message: 'That file is too big to be a captain file.' };
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, message: 'That file is not a captain file (it is not JSON).' }; }
  if (json && typeof json === 'object' && !Array.isArray(json) && 'v' in json && (json as { v: unknown }).v !== CAPTAIN_FILE_VERSION) {
    return { ok: false, message: 'That captain file is from a different version of Star Chart.' };
  }
  const parsed = captainFileSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: 'That file is not a captain file, or holds a faction, hull or colourway this app does not know.' };
  const { faction, hull, colourway } = parsed.data;
  return { ok: true, style: { faction, hull, colourway } };
}

/** The fleet a style is checked against: each hull's faction by index, and how many colourways exist. */
export interface FleetLimits { hullFactions: readonly string[]; colourways: number }

/** A style the fleet can fly: the hull exists, belongs to the faction, and the colourway exists. */
export function checkAgainstFleet(style: CaptainStyle, fleet: FleetLimits): CaptainFileResult {
  if (fleet.hullFactions[style.hull] !== style.faction || style.colourway >= fleet.colourways) {
    return { ok: false, message: 'That captain file names a hull or colourway this app does not have.' };
  }
  return { ok: true, style };
}
