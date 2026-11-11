// docs/15-reference.md §1 — the reference doc's marked tables agree with the code. Every table with a
// `<!-- table: id -->` marker is parsed here; each row's Constant must resolve to an export and carry
// the value the code evaluates to, and the tables that list a registry (maneuver rules, commands,
// kinds, roles, variants) must list exactly what the code registers. Change a constant and its row
// together. Renderer modules sit outside this project's tsconfig, so they load by a runtime path (as
// commands.test.ts does) and are read here as untyped records.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import crmJson from '@config/packs/crm.mapping.json';
import todoJson from '@config/packs/todo.mapping.json';
import sdlcJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import { PHASES, type PhaseSpan } from '@shared/contracts/maneuver';
import { PACE_RULES, shortForm, spanMs, type PaceRule } from '@shared/engine/pace';
import { resolveSignal } from '@shared/engine/signal';

const ROOT = resolve(__dirname, '../..');
const DOC = 'docs/15-reference.md';
const RENDERER = resolve(ROOT, 'src/renderer/src');
const SHARED = resolve(ROOT, 'src/shared');
const CSS_FILES = ['styles.css', 'chart/holo/holo.css'];
/** The tables in §7–§9 whose colour words must be §2's palette names. */
const NAMED_COLOUR_SECTIONS = new Set([7, 8, 9]);

type Rec = Record<string, unknown>;

// ---- Parsing the doc ----

interface Row { line: number; cells: Record<string, string> }
interface Table { id: string; section: number; header: string[]; rows: Row[]; guardLine: string }

/** A Markdown table row's cells, split on `|` outside backticks. */
function splitRow(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let cur = '';
  let tick = false;
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDoc(text: string): Table[] {
  const lines = text.split('\n');
  const tables: Table[] = [];
  let section = 0;
  for (let i = 0; i < lines.length; i++) {
    const heading = /^## (\d+)\./.exec(lines[i]!);
    if (heading) section = Number(heading[1]);
    const marker = /^<!-- table: ([\w-]+) -->$/.exec(lines[i]!.trim());
    if (!marker) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]!.trim()) j++;
    const header = splitRow(lines[j]!);
    const rows: Row[] = [];
    for (j += 2; j < lines.length && lines[j]!.trim().startsWith('|'); j++) {
      const raw = splitRow(lines[j]!);
      rows.push({ line: j + 1, cells: Object.fromEntries(header.map((h, k) => [h, raw[k] ?? ''])) });
    }
    // The table's Source/Guard paragraph: the first after it in its section (two tables may share one).
    let guardLine = '';
    for (; j < lines.length && !lines[j]!.startsWith('## '); j++) {
      if (!lines[j]!.startsWith('**Source:**')) continue;
      for (; j < lines.length && lines[j]!.trim(); j++) guardLine += ` ${lines[j]}`;
      break;
    }
    tables.push({ id: marker[1]!, section, header, rows, guardLine });
  }
  return tables;
}

const docText = readFileSync(resolve(ROOT, DOC), 'utf8');
const TABLES = parseDoc(docText);
const table = (id: string): Table => {
  const t = TABLES.find((x) => x.id === id);
  if (!t) throw new Error(`${DOC} has no <!-- table: ${id} --> marker: restore it, or drop its check in docTables.test.ts`);
  return t;
};

/** A cell without its backticks. */
const plain = (s: string) => s.replace(/`/g, '').trim();
const yesNo = (b: boolean) => (b ? 'yes' : 'no');

// ---- Problems, with actionable messages ----

class Problems {
  readonly list: string[] = [];
  constructor(private readonly t: Table) {}
  /** A row's value disagrees with the code. */
  value(row: Row, what: string, doc: unknown, code: unknown): void {
    this.list.push(`${this.where(row)} ${what}: doc ${fmt(doc)}, code ${fmt(code)}. Update ${DOC} §${this.t.section} or the constant.`);
  }
  /** Something else is wrong with a row (or the table, when row is null). */
  add(row: Row | null, msg: string): void {
    this.list.push(`${row ? this.where(row) : `[${this.t.id} §${this.t.section}]`} ${msg}`);
  }
  private where(row: Row): string {
    const first = plain(Object.values(row.cells)[0] ?? '');
    return `[${this.t.id} §${this.t.section}, line ${row.line} "${first}"]`;
  }
}
const fmt = (v: unknown) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v));

/** Runs a check over a table and fails with every problem it found. */
function check(id: string, body: (t: Table, p: Problems) => void | Promise<void>) {
  it(`${id} agrees with the code`, async () => {
    const t = table(id);
    const p = new Problems(t);
    await body(t, p);
    expect(p.list, p.list.join('\n')).toEqual([]);
  });
}

// ---- Resolving a Constant cell (§1) ----

type Ref = { css: string } | { file: string; name: string };
interface ConstCell { refs: Ref[]; unguarded: { file: string; names: string[] }[]; error?: string }

const ACCESS = /^[A-Za-z_$][\w$]*(?:\.[\w$]+|\[\d+\])*$/;
const HOW = `Write \`file.ts\` NAME (renderer paths from src/renderer/src/, shared ones from @shared/), or mark it \`unguarded: \`file.ts\` NAME\` (${DOC} §1).`;

/** Splits on `sep` outside backticks. */
function splitOutside(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let tick = false;
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (ch === sep && !tick) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseConst(cell: string): ConstCell {
  const out: ConstCell = { refs: [], unguarded: [] };
  for (const group of splitOutside(cell, ';')) {
    const css = /^`(--[\w-]+)`$/.exec(group);
    if (css) { out.refs.push({ css: css[1]! }); continue; }
    const skip = /^unguarded:\s*`([^`]+)`\s*(.*)$/.exec(group);
    if (skip) {
      const names = skip[2]!.trim() === '(inline)' ? [] : splitOutside(skip[2]!, ',').map((n) => n.replace(/\(.*\)/, '').trim()).filter(Boolean);
      out.unguarded.push({ file: skip[1]!, names });
      continue;
    }
    const code = /^`([^`]+\.ts)`\s+(.+)$/.exec(group);
    if (!code) return { ...out, error: `can't read the Constant "${group}". ${HOW}` };
    for (const name of splitOutside(code[2]!, ',')) {
      if (!ACCESS.test(name)) return { ...out, error: `can't read the constant name "${name}" in "${group}". ${HOW}` };
      out.refs.push({ file: code[1]!, name });
    }
  }
  return out;
}

const pathOf = (file: string) => (file.startsWith('@shared/') ? resolve(SHARED, file.slice('@shared/'.length)) : resolve(RENDERER, file));
const sourceOf = (file: string) => readFileSync(pathOf(file), 'utf8');

const modules = new Map<string, Promise<Rec>>();
function load(file: string): Promise<Rec> {
  let m = modules.get(file);
  if (!m) {
    m = import(/* @vite-ignore */ pathOf(file)) as Promise<Rec>;
    modules.set(file, m);
  }
  return m;
}

const cssText = CSS_FILES.map((f) => readFileSync(resolve(RENDERER, f), 'utf8')).join('\n');
function cssVar(name: string): string | undefined {
  return new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(cssText)?.[1]?.trim();
}

type Resolved = { ok: true; value: unknown } | { ok: false; why: string };

async function resolveRef(ref: Ref): Promise<Resolved> {
  if ('css' in ref) {
    const v = cssVar(ref.css);
    return v === undefined ? { ok: false, why: `${ref.css} is not declared in ${CSS_FILES.join(' or ')}. Fix the row, or declare it.` } : { ok: true, value: v };
  }
  if (!existsSync(pathOf(ref.file))) return { ok: false, why: `\`${ref.file}\` doesn't exist. ${HOW}` };
  const mod = await load(ref.file);
  const steps = ref.name.split(/\.|\[(\d+)\]/).filter((s) => s !== undefined && s !== '');
  const head = steps[0]!;
  if (!(head in mod)) {
    const there = new RegExp(`\\b${head}\\b`).test(sourceOf(ref.file));
    return { ok: false, why: there
      ? `${head} is in \`${ref.file}\` but not exported: export it, or mark the row unguarded (${DOC} §1).`
      : `${head} is not in \`${ref.file}\`: fix the cite, export it, or mark the row unguarded (${DOC} §1).` };
  }
  let v: unknown = mod[head];
  for (const s of steps.slice(1)) {
    if (v === null || (typeof v !== 'object' && typeof v !== 'function') || !(s in (v as Rec))) {
      return { ok: false, why: `${ref.name}: \`${ref.file}\` ${steps.slice(0, steps.indexOf(s)).join('.')} has no member "${s}". Fix the row or the code.` };
    }
    v = (v as Rec)[s];
  }
  return { ok: true, value: v };
}

/** The values a row's Constant cell names, or null after reporting why it can't be read. */
async function constantsOf(row: Row, p: Problems, col = 'Constant'): Promise<unknown[] | null> {
  const c = parseConst(row.cells[col] ?? '');
  if (c.error) { p.add(row, c.error); return null; }
  for (const u of c.unguarded) {
    if (!existsSync(pathOf(u.file))) { p.add(row, `unguarded: \`${u.file}\` doesn't exist: fix the cite.`); continue; }
    const src = sourceOf(u.file);
    for (const n of u.names) {
      const head = n.split(/[.[]/)[0]!;
      if (!new RegExp(`\\b${head}\\b`).test(src)) p.add(row, `unguarded: ${head} is not in \`${u.file}\`: fix the cite.`);
      else if (new RegExp(`export (?:const|let|function|class) ${head}\\b`).test(src)) {
        p.add(row, `${head} is exported from \`${u.file}\` now: drop "unguarded:" so the row is checked.`);
      }
    }
  }
  const out: unknown[] = [];
  for (const ref of c.refs) {
    const r = await resolveRef(ref);
    if (!r.ok) { p.add(row, r.why); return null; }
    out.push(r.value);
  }
  return out;
}

/** The one value a row's Constant names (null: reported, or the row is unguarded). */
async function constantOf(row: Row, p: Problems, col = 'Constant'): Promise<unknown> {
  const vs = await constantsOf(row, p, col);
  if (!vs) return null;
  if (vs.length > 1) { p.add(row, `names ${vs.length} constants where one is expected: one row per constant (${DOC} §1).`); return null; }
  return vs[0] ?? null;
}

// ---- Values ----

const hex = (n: number) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
const round4 = (n: number) => Number(n.toFixed(4));
const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
/** Every number written in a cell (¼ and ½ included). */
const numbersIn = (s: string): number[] => [
  ...[...s.replace(/(\d)_(\d)/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])),
  ...[...s].filter((ch) => ch in FRACTIONS).map((ch) => FRACTIONS[ch]!),
];

/** A CSS colour as hex and alpha. */
function cssColour(v: string): { hex: string; alpha: number } | null {
  const h = /^#([0-9a-f]{6})\b/i.exec(v);
  if (h) return { hex: `#${h[1]!.toUpperCase()}`, alpha: 1 };
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/.exec(v);
  if (!m) return null;
  return { hex: hex((Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3])), alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** A number cell against a code number. */
function numberCell(p: Problems, row: Row, col: string, code: unknown): void {
  const doc = Number(plain(row.cells[col] ?? ''));
  if (typeof code !== 'number') p.add(row, `${col}: the constant is ${typeof code}, not a number. Fix the row.`);
  else if (Number.isNaN(doc) || round4(code) !== doc) p.value(row, col, row.cells[col], round4(code));
}

/** A hex cell against a code colour. */
function hexCell(p: Problems, row: Row, col: string, code: unknown): void {
  if (typeof code !== 'number') { p.add(row, `${col}: the constant is ${typeof code}, not a colour. Fix the row.`); return; }
  if (plain(row.cells[col] ?? '') !== hex(code)) p.value(row, col, plain(row.cells[col] ?? ''), hex(code));
}

/** Every element of an array the table indexes (`NAME[i]`) has a row. */
async function coversArray(t: Table, p: Problems): Promise<void> {
  const seen = new Map<string, Set<number>>();
  for (const row of t.rows) {
    const c = parseConst(row.cells.Constant ?? '');
    for (const ref of c.refs) {
      const m = 'file' in ref ? /^(\w+)\[(\d+)\]$/.exec(ref.name) : null;
      if (!m || !('file' in ref)) continue;
      const key = `${ref.file}|${m[1]}`;
      seen.set(key, (seen.get(key) ?? new Set()).add(Number(m[2])));
    }
  }
  for (const [key, idx] of seen) {
    const [file, name] = key.split('|') as [string, string];
    const arr = (await load(file))[name];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) if (!idx.has(i)) p.add(null, `${name}[${i}] (\`${file}\`) has no row: add it to ${DOC} §${t.section}.`);
  }
}

// ---- The registries the tables list ----

const theme = (await load('theme/starChart/index.ts')) as {
  starChart: { roleAsset: Record<string, string>; assets: Rec[]; commands: Rec[]; maneuvers: { id: string; title: string }[] };
  INNER_PARTS: readonly string[];
};
const ruleById = new Map<string, PaceRule>(PACE_RULES.map((r) => [r.id, r as PaceRule]));
const titleOf = (id: string) => theme.starChart.maneuvers.find((m) => m.id === id)?.title;

// ---- The meta checks: markers, Constant cells, Guard lines ----

/** Every marked table, and what checks it. A table not checked here must not claim this test as its guard. */
const GUARDED = new Set([
  'palette-ui', 'palette-chart', 'hostile-colourways', 'fleet-colourways', 'avatar-colours', 'rungs', 'rung-motion',
  'pack-rungs', 'roles', 'kinds', 'solar-kinds', 'floors', 'hits', 'geometry', 'preview', 'formation-corridor', 'label-tiers', 'holo-tiers', 'holo-variants', 'label-values', 'type',
  'maneuvers', 'maneuver-variants', 'phases', 'commands', 'effect-audit', 'aura', 'loading-energy', 'v0-accents', 'actions-data', 'budgets', 'pr-stat', 'run-line', 'feature-row', 'profile-desktop',
]);
const UNGUARDED = new Set(['contrast', 'v0-extras', 'actions-ui', 'profile-deltas']);

describe(`${DOC}: markers and conventions (§1)`, () => {
  it('every marked table is known to this test, and only guarded tables cite it', () => {
    const problems: string[] = [];
    for (const t of TABLES) {
      const cites = t.guardLine.includes('docTables.test.ts');
      if (!GUARDED.has(t.id) && !UNGUARDED.has(t.id)) {
        problems.push(`[${t.id} §${t.section}] is a new marked table: add a check for it in tests/unit/docTables.test.ts (or list it in UNGUARDED).`);
      } else if (GUARDED.has(t.id) && !cites) {
        problems.push(`[${t.id} §${t.section}] is checked by docTables.test.ts, but its Guard line doesn't say so: add it to the line.`);
      } else if (UNGUARDED.has(t.id) && cites) {
        problems.push(`[${t.id} §${t.section}] cites docTables.test.ts as a guard, but nothing here checks it: drop the cite or add a check.`);
      }
    }
    for (const id of [...GUARDED, ...UNGUARDED]) {
      if (!TABLES.some((t) => t.id === id)) problems.push(`[${id}] has a check in docTables.test.ts but no <!-- table: ${id} --> marker in ${DOC}.`);
    }
    const ids = TABLES.map((t) => t.id);
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) problems.push(`[${id}] is marked twice in ${DOC}.`);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every Constant cell resolves, or is marked unguarded', async () => {
    const problems: string[] = [];
    for (const t of TABLES) {
      if (!t.header.includes('Constant')) continue;
      const p = new Problems(t);
      for (const row of t.rows) await constantsOf(row, p);
      problems.push(...p.list);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('§7–§9 name colours with §2’s palette names', () => {
    const names = table('palette-chart').rows.map((r) => plain(r.cells.Name ?? '')).filter(Boolean);
    const problems: string[] = [];
    for (const t of TABLES.filter((x) => NAMED_COLOUR_SECTIONS.has(x.section))) {
      for (const row of t.rows) {
        for (const [col, cell] of Object.entries(row.cells)) {
          for (const m of cell.matchAll(/\b(red|blue|gold|grey|gray|cyan|violet|green|white|amber)\b/gi)) {
            // The name as written in §2 (its first letter may be either case), standing as a word.
            const before = cell.slice(0, m.index + m[0].length);
            const is = (n: string) => {
              const at = before.slice(before.length - n.length);
              return at.slice(1) === n.slice(1) && at[0]!.toLowerCase() === n[0]!.toLowerCase() && /(^|[^\w-])$/.test(before.slice(0, before.length - n.length));
            };
            if (!names.some(is)) {
              problems.push(`[${t.id} §${t.section}, line ${row.line}] ${col}: "${m[0]}" isn't one of §2's colour names (${names.join(', ')}): use the name.`);
            }
          }
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

// ---- §2 Palette ----

describe('§2 palette', () => {
  check('palette-ui', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (typeof v !== 'string') continue;
      const c = cssColour(v);
      if (!c) { p.add(row, `${plain(row.cells.Constant!)} is "${v}", not a colour. Fix the row.`); continue; }
      if (plain(row.cells.Hex!) !== c.hex) p.value(row, 'Hex', plain(row.cells.Hex!), c.hex);
      if (Number(row.cells.Alpha) !== c.alpha) p.value(row, 'Alpha', row.cells.Alpha, c.alpha);
    }
  });

  check('palette-chart', async (t, p) => {
    for (const row of t.rows) {
      if (!plain(row.cells.Name ?? '')) p.add(row, 'has no Name: give the colour its plain name (§7–§9 use it).');
      const v = await constantOf(row, p);
      if (v !== null) hexCell(p, row, 'Hex', v);
    }
  });

  for (const id of ['hostile-colourways', 'fleet-colourways']) {
    check(id, async (t, p) => {
      for (const row of t.rows) {
        const v = (await constantOf(row, p)) as Rec | null;
        if (!v) continue;
        if (row.cells.Name !== v.name) p.value(row, 'Name', row.cells.Name, v.name);
        for (const col of ['Hull', 'Accent', 'Glow']) if (col in row.cells) hexCell(p, row, col, v[col.toLowerCase()]);
      }
      await coversArray(t, p);
    });
  }

  check('avatar-colours', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null) hexCell(p, row, 'Hex', v);
    }
    await coversArray(t, p);
  });
});

// ---- §3 Signal ladder ----

describe('§3 signal ladder', () => {
  check('rungs', async (t, p) => {
    const { RUNG_NAME, RUNG_COLOR } = (await load('chart/art/progress.ts')) as { RUNG_NAME: Record<string, string>; RUNG_COLOR: Record<string, number> };
    const { RUNG_MARK } = (await load('chart/holo/holoRows.ts')) as { RUNG_MARK: Record<string, string> };
    const seen = new Set<string>();
    for (const row of t.rows) {
      const rung = Object.keys(RUNG_NAME).find((k) => RUNG_NAME[k]!.startsWith(row.cells.Rung!));
      if (!rung) { p.add(row, `"${row.cells.Rung}" is not a rung in RUNG_NAME (chart/art/progress.ts). Fix the row.`); continue; }
      seen.add(rung);
      const v = await constantOf(row, p);
      if (v !== null) hexCell(p, row, 'Hex', v);
      hexCell(p, row, 'Hex', RUNG_COLOR[rung]);
      if (row.cells['Mega-label mark'] !== RUNG_MARK[rung]) p.value(row, 'Mega-label mark (chart/holo/holoRows.ts RUNG_MARK)', row.cells['Mega-label mark'], RUNG_MARK[rung]);
    }
    for (const r of Object.keys(RUNG_NAME)) if (!seen.has(r)) p.add(null, `rung "${r}" has no row: add it.`);
  });

  check('rung-motion', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null) numberCell(p, row, 'Value', v);
    }
  });

  check('pack-rungs', (t, p) => {
    const packs: Record<string, StateMapping> = { SDLC: sdlcJson as StateMapping, Todo: todoJson as StateMapping, CRM: crmJson as StateMapping };
    const label = (s: ReturnType<typeof resolveSignal>) => {
      const flags = [s.sketch && 'sketch', s.deferred && 'deferred', s.step !== undefined && `step ${s.step}`, s.ghost && 'ghost', s.strike && 'strike', s.unknown && 'unknown'].filter(Boolean);
      const rung = s.rung[0]!.toUpperCase() + s.rung.slice(1);
      return flags.length ? `${rung} (${flags.join(', ')})` : rung;
    };
    for (const [pack, mapping] of Object.entries(packs)) {
      const listed = new Map<string, Row>();
      for (const row of t.rows) {
        const cell = row.cells[pack];
        if (cell === undefined) { p.add(null, `has no ${pack} column.`); return; }
        if (cell === '—') continue;
        for (const part of cell.split(';').map((x) => x.trim()).filter(Boolean)) {
          const colon = part.indexOf(':');
          const type = part.slice(0, colon).trim();
          for (const state of part.slice(colon + 1).split(',').map((x) => x.trim())) {
            listed.set(`${type}: ${state}`, row);
            const want = mapping.types[type]?.states[state];
            if (!want) { p.add(row, `${pack} ${type}: ${state} is not in the ${pack} mapping (config/). Fix the row.`); continue; }
            const got = label(resolveSignal(mapping, type, state));
            if (got !== row.cells['Rung (flags)']) p.value(row, `${pack} ${type}: ${state}`, row.cells['Rung (flags)'], got);
          }
        }
      }
      for (const [type, tm] of Object.entries(mapping.types)) {
        for (const state of Object.keys(tm.states)) {
          if (!listed.has(`${type}: ${state}`)) p.add(null, `${pack} ${type}: ${state} (${label(resolveSignal(mapping, type, state))}) has no cell: add it to the row for its rung.`);
        }
      }
    }
  });
});

// ---- §4 Roles, kinds and assets ----

describe('§4 roles, kinds and assets', () => {
  check('roles', async (t, p) => {
    const seen = new Set<string>();
    const assets = new Map(theme.starChart.assets.map((a) => [a.id as string, a]));
    for (const row of t.rows) {
      const c = parseConst(row.cells.Constant!);
      const ref = c.refs[0];
      const role = ref && 'file' in ref ? ref.name.split('.').at(-1)! : '';
      seen.add(role);
      const v = await constantOf(row, p);
      const id = plain(row.cells['Asset id']!);
      if (v !== null && v !== id) p.value(row, 'Asset id (roleAsset)', id, v);
      const def = plain(row.cells['Asset def']!);
      const m = /^(\S+\.ts) (\w+)$/.exec(def);
      if (m) {
        const asset = (await load(m[1]!))[m[2]!] as Rec | undefined;
        if (!asset) { p.add(row, `Asset def: ${m[2]} is not exported from \`${m[1]}\`. Fix the row.`); continue; }
        if (asset.id !== id) p.value(row, `Asset def ${m[2]}.id`, id, asset.id);
        if (!assets.has(id)) p.add(row, `asset "${id}" is not in the theme's assets: register it, or fix the row.`);
        if (asset.layer !== row.cells.Layer) p.value(row, `Layer (${m[2]}.layer)`, row.cells.Layer, asset.layer);
        if (String(asset.rank) !== row.cells['Label rank']) p.value(row, `Label rank (${m[2]}.rank)`, row.cells['Label rank'], asset.rank);
      } else if (!theme.INNER_PARTS.includes(id)) {
        p.add(row, `Asset def is "${def}" but "${id}" is not in INNER_PARTS (theme/starChart/index.ts): name the asset def, or fix the row.`);
      }
      const art = /^`([^`]+\.ts)` · (\w+)$/.exec(row.cells['Art (file · class)']!);
      if (art && !((await load(art[1]!))[art[2]!])) p.add(row, `Art: ${art[2]} is not exported from \`${art[1]}\`. Fix the row.`);
    }
    for (const role of Object.keys(theme.starChart.roleAsset)) if (!seen.has(role)) p.add(null, `role "${role}" (roleAsset) has no row: add it.`);
  });

  check('kinds', async (t, p) => {
    const { KIND_ORDER } = (await load('vocab.ts')) as { KIND_ORDER: string[] };
    const order: string[] = [];
    for (const row of t.rows) {
      const ref = parseConst(row.cells.Constant!).refs[0];
      const kind = ref && 'file' in ref ? ref.name.replace(/^KINDS\./, '') : '';
      order.push(kind);
      const v = (await constantOf(row, p)) as Rec | null;
      if (!v) continue;
      const cols: [string, string][] = [['Glyph', 'glyph'], ['Chart word', 'chart'], ['ADO word', 'ado'], ['ADO plural', 'adoPlural']];
      for (const [col, key] of cols) if (row.cells[col] !== v[key]) p.value(row, `${col} (KINDS.${kind}.${key})`, row.cells[col], v[key]);
    }
    if (order.join(',') !== KIND_ORDER.join(',')) p.value({ line: 0, cells: { Constant: 'the rows' } }, 'kinds, in order (vocab.ts KIND_ORDER)', order, KIND_ORDER);
  });

  // Solar's key (19 P2): the kinds it lists, in order, and each one's words as Solar reads them.
  check('solar-kinds', async (t, p) => {
    const { keyKinds, kindNames } = (await load('vocab.ts')) as { keyKinds: (p: string) => string[]; kindNames: (k: string, p: string) => Rec | undefined };
    const order: string[] = [];
    for (const row of t.rows) {
      const ref = parseConst(row.cells.Constant!).refs[0];
      const kind = ref && 'file' in ref ? ref.name.replace(/^(KINDS|SOLAR_NAMES)\./, '') : '';
      order.push(kind);
      const v = (await constantOf(row, p)) as Rec | null;
      if (!v) continue;
      if (v !== kindNames(kind, 'solar')) p.add(row, `isn't the words Solar reads for ${kind} (kindNames: SOLAR_NAMES first, then KINDS): cite that one.`);
      const cols: [string, string][] = [['Glyph', 'glyph'], ['Chart word', 'chart'], ['ADO word', 'ado'], ['ADO plural', 'adoPlural']];
      for (const [col, key] of cols) if (row.cells[col] !== v[key]) p.value(row, `${col} (${ref && 'file' in ref ? ref.name : kind}.${key})`, row.cells[col], v[key]);
    }
    const want = keyKinds('solar');
    if (order.join(',') !== want.join(',')) p.value({ line: 0, cells: { Constant: 'the rows' } }, "Solar's key kinds, in order (vocab.ts keyKinds('solar'))", order, want);
  });
});

// ---- §5 Sizes, floors and layout ----

describe('§5 sizes, floors and layout', () => {
  check('floors', async (t, p) => {
    const { LABEL_PX } = (await load('@shared/scene/sizing.ts')) as { LABEL_PX: number };
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v === null) continue;
      numberCell(p, row, 'px', v);
      if (typeof v === 'number') numberCell(p, row, '× LABEL_PX', v / LABEL_PX);
    }
  });

  for (const id of ['hits', 'geometry', 'preview', 'formation-corridor']) {
    check(id, async (t, p) => {
      for (const row of t.rows) {
        const v = await constantOf(row, p);
        if (v !== null) numberCell(p, row, 'Value', v);
      }
    });
  }
});

// ---- §6 Labels and type ----

describe('§6 labels and type', () => {
  check('label-tiers', (t, p) => {
    const m = /export type LabelTier = ([^;]+);/.exec(sourceOf('chart/labelTiers.ts'));
    const code = [...(m?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]!);
    const doc = t.rows.map((r) => plain(r.cells.Tier!));
    if (doc.join(',') !== code.join(',')) p.value({ line: 0, cells: { Tier: 'the rows' } }, 'tiers (chart/labelTiers.ts LabelTier)', doc, code);
  });

  check('holo-tiers', (t, p) => {
    // Every tier token in holo.css has a row, and each row's Value is the token's, spaces aside.
    const norm = (v: string) => plain(v).replace(/\s+/g, '').toLowerCase();
    const seen = new Set<string>();
    for (const row of t.rows) {
      const name = plain(row.cells.Constant!);
      seen.add(name);
      const v = cssVar(name);
      if (v === undefined) p.add(row, `${name} is not declared in chart/holo/holo.css: fix the row, or declare it.`);
      else if (norm(row.cells.Value!) !== norm(v)) p.value(row, 'Value', plain(row.cells.Value!), v);
    }
    for (const m of cssText.matchAll(/(--holo-(?:t\d|lift|play)-[\w-]+):/g)) {
      if (!seen.has(m[1]!)) p.add(null, `${m[1]} (chart/holo/holo.css) has no row: add it.`);
    }
  });

  check('holo-variants', async (t, p) => {
    const seen = new Set<string>();
    for (const row of t.rows) {
      const v = (await constantOf(row, p)) as Rec | null;
      if (!v) continue;
      // The row names a plate's spec (`….label`): its owner is an asset (with an id), or a paradigm's
      // plate for an asset-less kind (`KindPlate`), which carries the rim the same way.
      const ref = parseConst(row.cells.Constant!).refs[0] as { file: string; name: string };
      const owner = await resolveRef({ file: ref.file, name: ref.name.replace(/\.label$/, '') });
      const o = (owner.ok ? owner.value : {}) as Rec;
      seen.add(typeof o.id === 'string' ? `asset:${o.id}` : `${ref.file} ${ref.name}`);
      const asset = typeof o.id === 'string' ? o.id : '—';
      if (asset !== plain(row.cells.Asset!)) p.value(row, 'Asset', plain(row.cells.Asset!), asset);
      for (const key of ['tier', 'frame', 'variant', 'layout']) {
        const col = key[0]!.toUpperCase() + key.slice(1);
        if (row.cells[col] !== v[key]) p.value(row, `${col} (label.${key})`, row.cells[col], v[key]);
      }
      const rim = row.cells['Label rim'] === '—' ? undefined : Number(row.cells['Label rim']);
      if (rim !== o.labelRim) p.value(row, 'Label rim (labelRim)', row.cells['Label rim'], o.labelRim ?? '—');
    }
    for (const a of theme.starChart.assets) if (a.label && !seen.has(`asset:${a.id as string}`)) p.add(null, `asset "${a.id}" has a holo plate (AssetDef.label) but no row: add it.`);
    const plates = (await load('hierarchy/solarPlates.ts')).SOLAR_PLATES as Record<string, Record<string, Rec>>;
    for (const [level, kinds] of Object.entries(plates)) {
      for (const kind of Object.keys(kinds)) {
        const name = `SOLAR_PLATES.${level}.${kind}.label`;
        if (!seen.has(`hierarchy/solarPlates.ts ${name}`)) p.add(null, `the Solar plate for ${kind} at ${level} (hierarchy/solarPlates.ts) has no row: add \`hierarchy/solarPlates.ts\` ${name}.`);
      }
    }
  });

  check('label-values', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null) numberCell(p, row, 'Value', v);
    }
  });

  check('type', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null && v !== row.cells.Value) p.value(row, 'Value', row.cells.Value, v);
    }
  });
});

// ---- §7 Maneuvers ----

/** Facts that reach each variant a rule can have: a close its merged work beamed home, a facility's first merge. */
function variantsOf(rule: PaceRule): Map<string, readonly PhaseSpan[]> {
  const out = new Map<string, readonly PhaseSpan[]>();
  for (const key of Object.keys(rule.short ?? {})) {
    const sf = shortForm(rule, key === 'plain' ? undefined : key);
    if (sf) out.set(sf.name, sf.phases);
  }
  if (!rule.variant) return out;
  const [P, A, F] = ['id:t:piece', 'id:t:attachment', 'id:t:facility'];
  const e = { occurredAt: 10, eventKey: 'e' };
  for (const role of ['objective', 'threat'] as const) {
    const f = {
      pieces: new Map([[P, { key: P, role }]]),
      attachments: new Map([[A, { key: A, links: [P], facility: F, approvers: [], signalAt: [{ from: 0, signal: { rung: 'accomplished' } }] }]]),
      firstMerge: new Map([[F, A]]),
    };
    const moves = [
      { m: 'climb', key: P, role, from: { rung: 'nearing' }, to: { rung: 'accomplished' } },
      { m: 'settle', key: A, facility: F, approvers: [], from: { rung: 'underway' }, to: { rung: 'accomplished' } },
    ];
    for (const mv of moves) {
      try {
        const v = rule.variant(mv as never, e as never, f as never);
        if (v) out.set(v.name, v.phases);
      } catch { /* a probe that doesn't fit this rule's move */ }
    }
  }
  return out;
}

describe('§7 maneuvers', () => {
  check('maneuvers', async (t, p) => {
    const seen = new Set<string>();
    for (const row of t.rows) {
      const id = plain(row.cells['Rule id']!);
      seen.add(id);
      const rule = ruleById.get(id);
      if (!rule) { p.add(row, `"${id}" is not a rule in PACE_RULES (@shared/engine/pace.ts): drop the row, or add the rule.`); continue; }
      const len = Number(row.cells['Length ms']);
      if (len !== spanMs(rule.phases)) p.value(row, 'Length ms (sum of its phase ms)', len, spanMs(rule.phases));
      if (row.cells.Tier !== rule.tier) p.value(row, 'Tier', row.cells.Tier, rule.tier);
      if (row.cells.Protected !== yesNo(!!rule.protect)) p.value(row, 'Protected', row.cells.Protected, yesNo(!!rule.protect));
      const title = titleOf(id);
      if (title === undefined) p.add(row, `no choreography is registered for "${id}" (theme/starChart/maneuvers/index.ts): register one.`);
      else if (row.cells.Choreography !== title) p.value(row, 'Choreography (its ManeuverDef.title)', row.cells.Choreography, title);
      const file = plain(row.cells.File!).replace(/^src\/renderer\/src\//, '');
      if (!existsSync(pathOf(file))) { p.add(row, `File \`${file}\` doesn't exist. Fix the row.`); continue; }
      const defs = Object.values(await load(file)).filter((x): x is { id: string } => !!x && typeof x === 'object' && 'id' in x);
      if (!defs.some((d) => d.id === id)) p.add(row, `File \`${file}\` exports no ManeuverDef for "${id}". Fix the row.`);
    }
    for (const r of PACE_RULES) if (!seen.has(r.id)) p.add(null, `rule "${r.id}" (PACE_RULES) has no row: add it.`);
  });

  check('maneuver-variants', (t, p) => {
    const code = new Map<string, number>();
    for (const rule of PACE_RULES as readonly PaceRule[]) {
      const vs = variantsOf(rule);
      if (rule.variant && !vs.size) p.add(null, `rule "${rule.id}" has a variant no probe in docTables.test.ts reaches: add a probe to variantsOf.`);
      for (const [name, phases] of vs) code.set(`${rule.id} ${name}`, spanMs(phases));
    }
    const seen = new Set<string>();
    for (const row of t.rows) {
      const key = `${plain(row.cells['Rule id']!)} ${plain(row.cells.Variant!)}`;
      seen.add(key);
      const len = code.get(key);
      if (len === undefined) p.add(row, `"${key}" is not a variant in pace.ts: drop the row, or fix its name.`);
      else if (Number(row.cells['Length ms']) !== len) p.value(row, 'Length ms (sum of its phase ms)', row.cells['Length ms'], len);
    }
    for (const key of code.keys()) if (!seen.has(key)) p.add(null, `variant "${key}" (pace.ts) has no row: add it.`);
  });

  check('phases', (t, p) => {
    const doc = t.rows.map((r) => plain(r.cells.Phase!));
    if (doc.join(',') !== PHASES.join(',')) p.value({ line: 0, cells: { Phase: 'the rows' } }, 'phases, in order (@shared/contracts/maneuver.ts PHASES)', doc, PHASES);
  });
});

// ---- §8 Effects ----

describe('§8 effects', () => {
  check('commands', async (t, p) => {
    const { SEED_COMMANDS } = (await load('chart/fx/commands.ts')) as { SEED_COMMANDS: Rec[] };
    const owners: [string, string, string][] = [
      ['theme: commands.ts', 'theme/starChart/commands.ts', 'commands'],
      ['theme: entrance.ts', 'theme/starChart/entrance.ts', 'entranceCommands'],
      ['theme: finales.ts', 'theme/starChart/finales.ts', 'finaleCommands'],
    ];
    const byName = new Map<string, { def: Rec; owner: string }>(SEED_COMMANDS.map((d) => [d.name as string, { def: d, owner: 'seed' }]));
    const themed = new Set<string>();
    for (const [owner, file, name] of owners) {
      for (const d of ((await load(file))[name] ?? []) as Rec[]) { byName.set(d.name as string, { def: d, owner }); themed.add(d.name as string); }
    }
    for (const d of theme.starChart.commands) {
      if (!themed.has(d.name as string)) p.add(null, `theme command "${d.name}" comes from a file this test doesn't know: add its file to the owners list in docTables.test.ts and a row to ${DOC} §8.`);
    }
    const seen = new Set<string>();
    for (const row of t.rows) {
      const name = plain(row.cells.Command!);
      seen.add(name);
      const c = byName.get(name);
      if (!c) { p.add(row, `"${name}" is not a seed or theme command: drop the row, or register it.`); continue; }
      const reduced = typeof c.def.reduced === 'string' ? c.def.reduced : `use ${(c.def.reduced as { use: string }).use}`;
      const want: [string, unknown][] = [
        ['Owner', c.owner], ['Tier', c.def.tier], ['Weight', String(c.def.weight)], ['Value', String(c.def.value)], ['Cuttable', yesNo(!!c.def.cuttable)], ['Clock', c.def.clock], ['Reduced', reduced],
      ];
      for (const [col, v] of want) if (row.cells[col] !== v) p.value(row, col, row.cells[col], v);
      if (!row.cells.Meaning?.trim()) p.add(row, `"${name}" has an empty Meaning cell: say what the command tells.`);
    }
    for (const name of byName.keys()) if (!seen.has(name)) p.add(null, `command "${name}" (${byName.get(name)!.owner}) has no row: add it.`);
  });

  check('effect-audit', async (t, p) => {
    const { SEED_COMMANDS } = (await load('chart/fx/commands.ts')) as { SEED_COMMANDS: Rec[] };
    const names = new Set<string>(SEED_COMMANDS.map((d) => d.name as string));
    for (const d of theme.starChart.commands) names.add(d.name as string);
    names.add('act');
    // Each choreography's file, from the maneuvers table: a `mutes first` row iff the file marks a call `repeats(`.
    const files = new Map<string, string>();
    const man = TABLES.find((x) => x.id === 'maneuvers');
    for (const r of man?.rows ?? []) files.set(plain(r.cells.Choreography!), plain(r.cells.File!).replace(/^src\/renderer\/src\//, ''));
    const titles = theme.starChart.maneuvers.map((m) => m.title);
    const seen = new Set<string>();
    const muted = new Set<string>();
    for (const row of t.rows) {
      const ch = plain(row.cells.Choreography!);
      seen.add(ch);
      if (!titles.includes(ch)) p.add(row, `"${ch}" is not a registered choreography title (theme/starChart/maneuvers/index.ts).`);
      if (!(PHASES as readonly string[]).includes(plain(row.cells.Phase!))) p.add(row, `Phase "${plain(row.cells.Phase!)}" is not one of PHASES.`);
      for (const m of row.cells.Effect!.matchAll(/`([^`]+)`/g)) {
        if (!names.has(m[1]!)) p.add(row, `Effect \`${m[1]}\` is not a registered command (or \`act\`).`);
      }
      const v = plain(row.cells.Verdict!);
      if (!['keep', 'cut', 'mutes first'].includes(v)) p.add(row, `Verdict "${v}" must be keep, cut or mutes first.`);
      if (v === 'mutes first') muted.add(ch);
      const beat = row.cells['Beat ms']!.trim();
      if (!/^\d+$/.test(beat)) p.add(row, `Beat ms "${beat}" must be an integer of 0 or more.`);
    }
    for (const title of titles) {
      if (!seen.has(title)) p.add(null, `choreography "${title}" has no row in the effect audit: add its cues.`);
      const file = files.get(title);
      if (!file || !existsSync(pathOf(file))) continue;
      const has = /\brepeats\(/.test(sourceOf(file));
      if (has !== muted.has(title)) p.add(null, `"${title}" ${has ? 'marks a call repeats( in ' + file + ' but has no mutes first row' : 'has a mutes first row but ' + file + ' marks no repeats( call'}.`);
    }
  });

  check('aura', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null) numberCell(p, row, 'Value', v);
    }
  });

  check('loading-energy', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v !== null) numberCell(p, row, 'Value', v);
    }
  });

  check('v0-accents', (t, p) => {
    const src = sourceOf('@shared/playback/accents.ts');
    const union = /export type AccentName =([^;]+);/.exec(src)?.[1] ?? '';
    const names = [...union.matchAll(/'([\w.]+)'/g)].map((m) => m[1]!);
    const doc = t.rows.map((r) => plain(r.cells.Accent!));
    for (const n of names) if (!doc.includes(n)) p.add(null, `accent "${n}" (AccentName, @shared/playback/accents.ts) has no row: add it.`);
    // Durations written as literals beside their name (`name: 'dock', durationMs: …`), and the emerge table.
    const literal = new Map<string, number[]>();
    for (const m of src.matchAll(/name: '([\w.]+)', durationMs: ([^}]+)\}/g)) literal.set(m[1]!, numbersIn(m[2]!));
    const emerge = /name: `emerge\.\$\{kind\}`, durationMs: \{([^}]+)\}/.exec(src)?.[1] ?? '';
    for (const m of emerge.matchAll(/(\w+): (\d+)/g)) literal.set(`emerge.${m[1]}`, [Number(m[2])]);
    for (const row of t.rows) {
      const n = plain(row.cells.Accent!);
      if (!names.includes(n)) { p.add(row, `"${n}" is not an AccentName (@shared/playback/accents.ts): drop the row, or fix its name.`); continue; }
      const docMs = numbersIn(row.cells['Duration ms']!);
      for (const ms of literal.get(n) ?? []) if (!docMs.includes(ms)) p.value(row, 'Duration ms (accentFor)', row.cells['Duration ms'], ms);
    }
  });
});

// ---- §9 Actions ----

describe('§9 actions', () => {
  check('actions-data', (t, p) => {
    const { rows: extras } = table('v0-extras');
    const v0 = new Set([...table('v0-accents').rows, ...extras].map((r) => plain(r.cells.Accent!)));
    for (const row of t.rows) {
      const ids = [...row.cells['Rule id']!.matchAll(/`([\w.]+)`/g)].map((m) => m[1]!);
      for (const id of ids) {
        if (!id.includes('.')) {
          // A bare word beside a rule id is one of its variants (`first`).
          const known = ids.some((r) => ruleById.has(r) && variantsOf(ruleById.get(r)!).has(id));
          if (!known) p.add(row, `"${id}" is not a variant of the rules in this row (pace.ts). Fix the row.`);
          continue;
        }
        if (!ruleById.has(id)) { p.add(row, `Rule id "${id}" is not in PACE_RULES (@shared/engine/pace.ts). Fix the row.`); continue; }
        const title = titleOf(id);
        if (title && !row.cells.Maneuver!.includes(title)) p.value(row, `Maneuver (the title for ${id})`, row.cells.Maneuver, title);
      }
      for (const m of row.cells['v0 accent']!.matchAll(/`([\w.*]+)`/g)) {
        const name = m[1]!;
        const ok = name.endsWith('.*') ? [...v0].some((a) => a.startsWith(name.slice(0, -1))) : v0.has(name);
        if (!ok) p.add(row, `v0 accent "${name}" is not in §8's v0-accents or v0-extras tables. Fix the row.`);
      }
    }
  });
});

// ---- §10 Timing and budgets ----

// ---- §11 Device profiles ----

describe('§11 device profiles', () => {
  check('profile-desktop', async (t, p) => {
    for (const row of t.rows) {
      const v = await constantOf(row, p);
      if (v === null) continue;
      if (typeof v === 'boolean') { if (row.cells.Value!.trim().toLowerCase() !== (v ? 'on' : 'off')) p.value(row, 'Value', row.cells.Value, v ? 'on' : 'off'); }
      else if (typeof v === 'number') { if (!numbersIn(row.cells.Value!).some((n) => n === round4(v))) p.value(row, 'Value', row.cells.Value, round4(v)); }
      else if (typeof v === 'string') { if (!row.cells.Value!.includes(v)) p.value(row, 'Value', row.cells.Value, v); }
      else p.add(row, 'is not a number, boolean or word.');
    }
  });
});

describe('§10 timing and budgets', () => {
  for (const id of ['budgets', 'pr-stat', 'run-line', 'feature-row']) check(id, async (t, p) => {
    for (const row of t.rows) {
      const vs = await constantsOf(row, p);
      if (!vs) continue;
      const nums = numbersIn(row.cells.Value!);
      const c = parseConst(row.cells.Constant!);
      vs.forEach((v, i) => {
        const ref = c.refs[i]!;
        const name = 'file' in ref ? ref.name : ref.css;
        const values = Array.isArray(v) ? v : [v];
        for (const x of values) {
          if (typeof x === 'number') { if (!nums.some((n) => n === round4(x))) p.value(row, `Value (${name})`, row.cells.Value, round4(x)); }
          else if (typeof x === 'string') { if (!row.cells.Value!.toLowerCase().includes(x.toLowerCase())) p.value(row, `Value (${name})`, row.cells.Value, x); }
          else p.add(row, `${name} is ${typeof x}, not a number or a word: cite the member that holds the value.`);
        }
      });
    }
  });
});
