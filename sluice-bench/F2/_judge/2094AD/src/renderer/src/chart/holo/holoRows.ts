// The rows of an expanded holo plate (19 L2, R5; 12 "Mega-label", 13 §4): a plate that has a list (a
// seat's objectives and threats, an objective's or threat's steps, a station's PRs with the work each
// serves as a subtitle, 19 L6) grows them in place, under its title, inside the same frame. The rows
// come from shared projection (`graph.lists`, lists.ts); this module only draws them and takes their
// input. Every row's text is in `.callout__title` and `.callout__meta` inside the plate's `.callout`,
// so the label contrast check (VC-2) covers it. Hovering a row (long-press on touch) lights its object,
// or, for a row that isn't drawn itself (a PR), the pieces it serves. Both ways (19 L7): the object
// hovered on the chart lights its own row, and the selected one's row is marked.
//
// Pointer input is delegated to the plate, not wired per row, so a redraw (the list changed under a
// still pointer, or the plate's own text redrawn) never strands a lit row: the lit row is found again
// from the pointer after every redraw. A press selects only when it went down and came up on the same
// row. One implementation for every plate (R1): labels.ts owns when a plate expands and where it goes.
import type { Role } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { MegaList, MegaRow } from '@shared/contracts/view';
import { ROW_BUDGET } from '@shared/scene/project/lists';
import { capTitle } from '@shared/scene/sizing';
import { RUNG_COLOR } from '../art/progress';
import { RUN_DOT_HEX, RUN_DOT_SHAPE } from '@shared/runLine';
import { moreText } from '../../theme/registry';

/** How long a plate stays expanded after its object stops being pointed at: time to move onto it. */
export const GRACE_MS = 450;
/** A touch held this long on a row lights its object (12: long-press on touch). */
export const LONG_PRESS_MS = 450;

/** One shape per rung, so the rung never rests on colour alone (INV-20, 09). */
export const RUNG_MARK: Record<MegaRow['rung'], string> = { ready: '○', underway: '◔', nearing: '◕', accomplished: '●', off: '⊘' };
/** The ladder's own colours (art/progress.ts), so a mark always matches the art, Off included. */
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Rows within the budget (16), and how many more there are. */
export function rowsInBudget(list: MegaList): { rows: MegaRow[]; more: number } {
  return { rows: list.rows.slice(0, ROW_BUDGET), more: list.more + Math.max(0, list.rows.length - ROW_BUDGET) };
}

/** What a plate's rows may ask of the chart. Every field is optional: unset, the rows are display only. */
export interface RowInput {
  /** A row is hovered or long-pressed: light its objects (its own, or what it serves); null when it ends. */
  light?(keys: readonly CanonicalKey[] | null): void;
  /** A row was pressed: select its object (the first it serves, for a row that isn't drawn itself). */
  press?(key: CanonicalKey, e: PointerEvent): void;
  /**
   * A read-only link at the source was pressed (INV-21: opening only reads). `key` is the linked
   * object's own key when projection carries one, so main can open it by key against its allowlist.
   */
  open?(url: string | null, key?: CanonicalKey): void;
  /** The chart's name for a row's role (22 B3), after its identity line. */
  roleWord?(role: Role): string | undefined;
}

/** The chart's name for what a plate or row is (22 B3): after its identity line, in italics. */
export function metaphorSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'holo__metaphor';
  span.textContent = text;
  return span;
}

/** Whether a pointer event's target is in a plate's rows (so the plate's own press leaves it alone). */
export const inRows = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest('.holo__list, .holo__feat-scroll');

/**
 * One plate's rows: a `.holo__list` (the rows, then "+N more") that the plate shows while expanded.
 * The plate's own text is redrawn freely (labels.ts); the list is re-attached after it, keeping its
 * scroll and its lit row.
 */
export class HoloRows {
  readonly el: HTMLDivElement;
  private readonly ol: HTMLOListElement;
  private more: HTMLSpanElement | null = null;
  /** The list as last drawn, to redraw only when it changes. */
  private sig = '';
  private scrolled = 0;
  /** Shown in the plate (expanded) now. */
  private shown = false;
  /** The pointer is over the plate. */
  inside = false;
  /** The row whose object this plate lights now, and whether a touch's long press lit it. */
  private lit: CanonicalKey | null = null;
  /** What each drawn row lights and selects, by row key: the pieces it serves, else itself. */
  private targets = new Map<CanonicalKey, readonly CanonicalKey[]>();
  private litByTouch = false;
  /** What the chart has hovered or lit, and selected (19 L7): their own rows are lit and marked. */
  private outside: ReadonlySet<string> = new Set();
  private chosen: string | null = null;
  /** The row a pointer went down on, for the press on the way up. */
  private down: { key: CanonicalKey; pointerId: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The mouse or pen's last position over the plate (client px), to find the lit row after a redraw. */
  private at: { x: number; y: number } | null = null;
  private runEl: HTMLElement | null = null;

  constructor(private readonly plate: HTMLElement, private readonly input: RowInput = {}) {
    this.el = document.createElement('div');
    this.el.className = 'holo__list';
    this.ol = document.createElement('ol');
    this.ol.className = 'holo__rows';
    this.el.append(this.ol);
    this.ol.addEventListener('scroll', () => { this.scrolled = this.ol.scrollTop; }, { passive: true });
    this.wire();
  }

  /** The list to draw: redrawn only when it changed. */
  set(list: MegaList): void {
    const sig = JSON.stringify(list);
    if (sig === this.sig) return;
    this.sig = sig;
    const { rows, more } = rowsInBudget(list);
    this.runLine(list.run);
    this.targets = new Map(rows.map((row) => [row.key, row.serves?.length ? row.serves : [row.key]]));
    this.ol.replaceChildren(...rows.map((row) => this.row(row)));
    this.more?.remove();
    this.more = null;
    if (more > 0) {
      this.more = document.createElement('span');
      this.more.className = 'callout__meta holo__more';
      this.more.textContent = moreText(more);
      this.el.append(this.more);
    }
    this.ol.scrollTop = this.scrolled;
    if (this.shown) this.relight();
  }

  /** Shows the rows at the plate's end (after its title is drawn, or redrawn), keeping their scroll. */
  attach(): void {
    const first = !this.shown;
    this.shown = true;
    if (this.el.parentElement !== this.plate || this.plate.lastElementChild !== this.el) this.plate.append(this.el);
    this.ol.scrollTop = this.scrolled;
    if (first) this.relight();
  }

  /** Hides the rows (the plate is back to its title): nothing stays lit. */
  detach(): void {
    if (!this.shown) return;
    this.shown = false;
    this.endPress();
    this.setLit(null);
    this.scrolled = 0;
    this.el.remove();
  }

  get attached(): boolean {
    return this.shown;
  }

  /**
   * A station's pipeline line (B2, 15 §6 `run-line`): `Last run: passed · 2 h ago` with a neutral dot, above the rows.
   * Display only. A station without a read run keeps the line's height empty (R4), so the plate doesn't grow when it lands.
   */
  private runLine(run: MegaList['run']): void {
    if (!run) { this.runEl?.remove(); this.runEl = null; return; }
    if (!this.runEl) {
      this.runEl = document.createElement('div');
      this.runEl.className = 'callout__meta holo__run';
      this.el.insertBefore(this.runEl, this.ol);
    }
    this.runEl.classList.toggle('holo__run--empty', !run.text);
    if (!run.text || !run.state) { this.runEl.replaceChildren(document.createTextNode('\u00a0')); delete this.runEl.dataset.state; return; }
    this.runEl.dataset.state = run.state;
    const dot = document.createElement('span');
    dot.className = `holo__run-dot holo__run-dot--${RUN_DOT_SHAPE[run.state]}`;
    dot.style.setProperty('--run', RUN_DOT_HEX[run.state]);
    dot.setAttribute('aria-hidden', 'true');
    this.runEl.replaceChildren(dot, document.createTextNode(run.text));
  }

  private row(row: MegaRow): HTMLLIElement {
    const li = document.createElement('li');
    li.className = `holo__row holo__row--${row.rung}`;
    li.dataset.key = row.key;
    li.dataset.rung = row.rung;
    li.style.setProperty('--rung', hex(RUNG_COLOR[row.rung]));
    const mark = document.createElement('span');
    mark.className = 'holo__mark';
    mark.textContent = RUNG_MARK[row.rung];
    const text = document.createElement('span');
    text.className = 'holo__text';
    const title = document.createElement('span');
    title.className = 'callout__title';
    title.textContent = capTitle(row.label);
    if (title.textContent !== row.label) li.title = row.label;
    text.append(title);
    if (row.meta) {
      const meta = document.createElement('span');
      meta.className = 'callout__meta';
      meta.textContent = row.meta;
      const word = row.role ? this.input.roleWord?.(row.role) : undefined;
      if (word) meta.append(metaphorSpan(` · ${word}`));
      text.append(meta);
    }
    if (row.subtitle) text.append(this.subtitle(row.subtitle));
    if (row.stat || row.role === 'attachment') {
      // B1: a PR's stat line, one quiet line (15 §6 `pr-stat`). Display only: no link, no hover of its own. Every PR
      // row holds the line's height from its first draw (R4), so the plate doesn't grow when the facts land.
      const stat = document.createElement('span');
      stat.className = `callout__meta holo__stat${row.stat ? '' : ' holo__stat--empty'}`;
      if (row.stat) {
        // One nowrap fact per part, joined by text ` · ` so the line can wrap there and textContent is unchanged.
        const parts = row.stat.split(' · ');
        parts.forEach((part, i) => {
          if (i) stat.append(document.createTextNode(' · '));
          const fact = document.createElement('span');
          fact.className = 'holo__fact';
          fact.textContent = part;
          stat.append(fact);
        });
      } else stat.textContent = '\u00a0';
      text.append(stat);
    }
    li.append(mark, text);
    if (row.key === this.lit || this.outside.has(row.key)) li.classList.add('is-lit');
    if (row.key === this.chosen) li.classList.add('is-selected');
    return li;
  }

  /**
   * A row's subtitle line (the work a PR serves, or a container): its text, and a read-only link at
   * the source when there is one. The linked key, when projection carries one, goes with the URL, so
   * main can open it by key against its allowlist (INV-21).
   */
  private subtitle(sub: NonNullable<MegaRow['subtitle']>): HTMLElement {
    const el = document.createElement('span');
    el.className = 'callout__meta holo__sub';
    el.textContent = sub.label;
    const url = sub.url;
    const key = sub.key;
    const open = this.input.open;
    if ((url || key) && open) {
      el.classList.add('holo__link');
      if (url) el.title = url;
      // Not an <a href>: a click must never navigate the renderer. Opening only reads (INV-21).
      for (const t of ['pointerdown', 'pointerup'] as const) el.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(url, key); });
    }
    return el;
  }

  /** The row element under a point of this plate, or null (the gaps, the title, the "+N"). */
  private rowAt(target: EventTarget | Element | null): HTMLLIElement | null {
    const row = target instanceof Element ? target.closest<HTMLLIElement>('.holo__row') : null;
    return row && this.ol.contains(row) ? row : null;
  }

  private rowUnder(x: number, y: number): HTMLLIElement | null {
    return this.rowAt(document.elementFromPoint(x, y));
  }

  private has(key: CanonicalKey): boolean {
    return [...this.ol.children].some((li) => (li as HTMLElement).dataset.key === key);
  }

  /** Lights a row's object (or nothing), once per change, and marks the row. */
  private setLit(key: CanonicalKey | null, byTouch = false): void {
    if (this.lit === key) { this.litByTouch = key !== null && byTouch; return; }
    this.lit = key;
    this.litByTouch = key !== null && byTouch;
    this.mark();
    this.input.light?.(key === null ? null : (this.targets.get(key) ?? [key]));
  }

  /**
   * The chart's side of both ways (19 L7): rows whose own object is hovered or lit there are lit too,
   * and the selected object's row is marked. Never lights anything back (that's the rows' own hover).
   */
  markObjects(lit: ReadonlySet<string>, selected: string | null): void {
    this.outside = lit;
    this.chosen = selected;
    this.mark();
  }

  private mark(): void {
    for (const li of this.ol.children) {
      const key = (li as HTMLElement).dataset.key!;
      li.classList.toggle('is-lit', (this.lit !== null && key === this.lit) || this.outside.has(key));
      li.classList.toggle('is-selected', key === this.chosen);
    }
  }

  /**
   * After a redraw: a hover-lit row is the row now under the mouse (it may be another, or none); a
   * long-pressed row stays lit while it is still listed. A pending press survives only if its row does.
   */
  private relight(): void {
    if (this.down && !this.has(this.down.key)) this.endPress();
    let key: CanonicalKey | null;
    if (this.litByTouch) key = this.lit && this.has(this.lit) ? this.lit : null;
    else key = this.inside && this.at ? ((this.rowUnder(this.at.x, this.at.y)?.dataset.key as CanonicalKey | undefined) ?? null) : null;
    this.setLit(key, this.litByTouch && key !== null);
    this.mark(); // the rows are new even when the key is the same
  }

  private endPress(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.down = null;
  }

  /** Hover lights the row's object; on touch, a long press does; a press on one row selects it. */
  private wire(): void {
    const el = this.plate;
    el.addEventListener('pointerenter', () => { this.inside = true; });
    el.addEventListener('pointerleave', (e) => {
      this.inside = false;
      this.at = null;
      if (e.pointerType !== 'touch' && !this.litByTouch) this.setLit(null);
      // A mouse has no implicit capture: its up may land off the plate, so a press that leaves ends.
      if (e.pointerType !== 'touch') this.endPress();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !this.shown) return;
      this.at = { x: e.clientX, y: e.clientY };
      this.setLit((this.rowAt(e.target)?.dataset.key as CanonicalKey | undefined) ?? null);
    });
    el.addEventListener('pointerdown', (e) => {
      const row = this.shown ? this.rowAt(e.target) : null;
      this.endPress();
      if (!row) return;
      e.preventDefault();
      const key = row.dataset.key as CanonicalKey;
      this.down = { key, pointerId: e.pointerId };
      if (e.pointerType === 'touch') this.timer = setTimeout(() => { this.timer = null; this.setLit(key, true); }, LONG_PRESS_MS);
    });
    // An up on a row's link stops there (the link opens; the row isn't pressed): end the press first.
    el.addEventListener('pointerup', (e) => {
      if (e.target instanceof Element && e.target.closest('.holo__link')) this.endPress();
    }, { capture: true });
    el.addEventListener('pointerup', (e) => {
      const down = this.down;
      const long = e.pointerType === 'touch' && this.litByTouch;
      this.endPress();
      if (e.pointerType === 'touch' && this.litByTouch) this.setLit(null);
      // A touch's up is targeted at where it went down: ask what's under the finger now.
      const row = e.pointerType === 'touch' ? this.rowUnder(e.clientX, e.clientY) : this.rowAt(e.target);
      if (!down || long || !row || down.pointerId !== e.pointerId || row.dataset.key !== down.key) return;
      this.input.press?.(this.targets.get(down.key)?.[0] ?? down.key, e);
    });
    el.addEventListener('pointercancel', () => {
      this.endPress();
      if (this.litByTouch) this.setLit(null);
    });
    // Rows that overflow scroll in place; the chart's zoom (a wheel on the labels host) waits.
    el.addEventListener('wheel', (e) => {
      if (this.shown && this.ol.scrollHeight > this.ol.clientHeight) e.stopPropagation();
    }, { passive: true });
  }
}
