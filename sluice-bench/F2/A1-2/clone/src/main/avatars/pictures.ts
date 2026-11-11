// Pictures you add by hand (slice 6, decided 2026-10-09). The user's PAT often can't read teammates'
// pictures (ADO answers 401), so captains show initials. Here the user supplies a picture for a
// teammate instead: it is kept as a small PNG, one file per person, keyed by org and identity ID
// (INV-22: never by name), under userData. It lives beside the cache, not in it, so Purge doesn't
// touch it, and the folder can be copied to another Mac. These are real people's photos: they stay in
// userData, never in the repo folder, the dev log, or a fixture.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The largest square a kept picture is cut to: plenty for a label avatar, small enough to ride in a bundle. */
export const PICTURE_PX = 128;
/** The most a source file may be: a phone photo is fine, a disk image is not. */
export const PICTURE_MAX_BYTES = 12_000_000;

/** The folder the app makes inside the one you choose when it copies the pictures out. */
export const EXPORT_FOLDER = 'star-chart-pictures';

/** The most an imported picture file may be: ours are about 20 KB; this leaves room, not a disk image. */
export const PICTURE_IMPORT_MAX_BYTES = 600_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A path segment from an org or identity key: letters, digits and a few separators, nothing that can climb out. */
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');

export class HandPictures {
  constructor(private readonly dir: string) {}

  private file(org: string, id: string): string {
    return join(this.dir, safe(org), `${safe(id)}.png`);
  }

  /** The person's picture as an inline PNG, or null when none was added. */
  get(org: string, id: string): string | null {
    try {
      const f = this.file(org, id);
      return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;
    } catch {
      return null;
    }
  }

  has(org: string, id: string): boolean {
    return existsSync(this.file(org, id));
  }

  set(org: string, id: string, png: Buffer): void {
    mkdirSync(join(this.dir, safe(org)), { recursive: true });
    writeFileSync(this.file(org, id), png);
  }

  /** Forget a person's picture; true if there was one. */
  remove(org: string, id: string): boolean {
    const f = this.file(org, id);
    if (!existsSync(f)) return false;
    rmSync(f);
    return true;
  }

  /** The identity IDs that have a picture in this org (file names, so the key spelling is `safe`'s). */
  ids(org: string): Set<string> {
    try {
      return new Set(readdirSync(join(this.dir, safe(org))).filter((n) => n.endsWith('.png')).map((n) => n.slice(0, -4)));
    } catch {
      return new Set();
    }
  }

  /**
   * Copy this org's pictures into `dest` (made if need be), one `<identity id>.png` each: IDs, never names.
   * Returns how many.
   */
  exportTo(org: string, dest: string): number {
    const ids = [...this.ids(org)];
    if (!ids.length) return 0;
    mkdirSync(dest, { recursive: true });
    for (const id of ids) copyFileSync(join(this.dir, safe(org), `${id}.png`), join(dest, `${id}.png`));
    return ids.length;
  }

  /**
   * Take the `<identity id>.png` files of a folder (what `exportTo` wrote) as this org's pictures. Only
   * real, small PNGs with a plain ID for a name are taken; anything else in the folder is ignored.
   * Returns the IDs kept.
   */
  importFrom(org: string, src: string): string[] {
    const inner = join(src, EXPORT_FOLDER); // the folder `exportTo` is given by the app: choosing its parent works too
    if (existsSync(inner) && statSync(inner).isDirectory()) src = inner;
    const kept: string[] = [];
    for (const name of readdirSync(src)) {
      const m = /^([A-Za-z0-9._-]{1,200})\.png$/.exec(name);
      if (!m || m[1]!.startsWith('.')) continue;
      const f = join(src, name);
      try {
        if (!statSync(f).isFile() || statSync(f).size > PICTURE_IMPORT_MAX_BYTES) continue;
        const bytes = readFileSync(f);
        if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) continue;
        this.set(org, m[1]!, bytes);
        kept.push(m[1]!);
      } catch { /* unreadable: skipped */ }
    }
    return kept;
  }

  /** Lay the pictures over the identities the cache holds: a hand-added picture wins over ADO's. */
  overlay<T extends { avatar?: string }>(org: string, identities: ReadonlyMap<string, T>): ReadonlyMap<string, T> {
    const have = this.ids(org);
    if (!have.size) return identities;
    const out = new Map(identities);
    for (const [key, who] of identities) {
      const png = have.has(safe(key)) ? this.get(org, key) : null;
      if (png) out.set(key, { ...who, avatar: png });
    }
    return out;
  }
}
