// The gallery's *Label hierarchy* cells (19 §2, L1; HG-L1; 22 A5, A6): one holo plate of each tier (T1
// Lead, T2 Door, T3 Place, T4 Sky), and a piece of each role in its colour (22 A6), at rest, lifted (pointed, selected) and in play, over the ink and over each sky the
// plates sit on. The plates are built by the chart's own `renderHoloPlate` and `HoloFrame`, in the
// same classes and tiers, so what's reviewed here is what the chart draws. The last cell is the one
// expandable plate (19 L2): a homeworld and a station, each at rest and expanded into its rows
// (one per rung, one lit), grown in place by the chart's `HoloRows` and `growPlacement`. The captains'
// cell (19 L8) shows the square picture: an ADO-shaped one, a wide hand-added one cropped to its centre,
// and initials on their swatch, each at rest, lifted and in play (the picture alone). Development only.
import type { CanonicalKey } from '@shared/contracts/keys';
import type { MegaList, ViewNode } from '@shared/contracts/view';
import { avatarColor } from '@shared/scene/avatar';
import { frameClip, growPlacement, holoCandidates, HoloFrame, holoVerticalCandidates, type HoloSpec, type HoloTier } from '../chart/holo/holoLabel';
import { HoloRows } from '../chart/holo/holoRows';
import '../chart/holo/holo.css';
import { renderHoloPlate } from '../chart/labels';
import { kindNames } from '../vocab';

/** The chart's name after a plate's identity line, as the chart gives it (22 B3). */
const metaphor = (kind: string) => kindNames(kind as ViewNode['kind'], 'solar')?.chart.toLowerCase();
import type { DomCell, Section } from './types';

/** One sample plate per tier: invented names (INV-18), each as the object it names would say it. */
const SAMPLES: { tier: HoloTier; name: string; kind: ViewNode['kind']; label: string; meta: string }[] = [
  { tier: 'lead', name: 'T1 Lead · a station', kind: 'facility', label: 'harbor-gateway', meta: 'Repository' },
  { tier: 'door', name: 'T2 Door · a galaxy', kind: 'galaxy', label: 'Tidewater Array', meta: '2 areas · 136 events this week' },
  { tier: 'door', name: 'T2 Door · an asteroid (blue)', kind: 'objective', label: 'Waypoint ETA board', meta: 'User Story · #55102 · Active' },
  { tier: 'door', name: 'T2 Door · an enemy ship (red)', kind: 'threat', label: 'ETA board freezes', meta: 'Bug · #55402 · Active' },
  { tier: 'place', name: 'T3 Place · a homeworld', kind: 'seat', label: 'Kit\'s Haven', meta: '' },
  { tier: 'sky', name: 'T4 Sky · a star', kind: 'star', label: 'Harbor Pod', meta: '12 User Stories · 4 Bugs' },
];
const STATES = [
  { id: 'rest', name: 'at rest' },
  { id: 'lifted', name: 'lifted (pointed, selected)' },
  { id: 'play', name: 'in play (title only)' },
] as const;

const node = (s: (typeof SAMPLES)[number]): ViewNode => ({
  projectionKey: `gallery|${s.kind}`, canonicalKey: `id:t:${s.kind}` as ViewNode['canonicalKey'], kind: s.kind,
  world: { x: 0, y: 0, r: 6 }, stage: '', seed: 0, label: s.label, meta: s.meta,
  openable: false, selectable: false, labelled: true, flags: {}, evidence: [],
});

const ROW_H = 56;
const COL_W = 250;
const TOP = 26;
const LEFT = 230;

function build(host: HTMLElement): () => void {
  host.style.position = 'relative';
  const made: (HTMLElement | HoloFrame)[] = [];
  const text = (cls: string, s: string, x: number, y: number) => {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = s;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px`;
    host.append(el);
    made.push(el);
  };
  // The cell grows to its rows (a DOM cell is 200 px; the tiers and the role samples need more, 22 A5, A6).
  host.style.height = `${TOP + SAMPLES.length * ROW_H + 8}px`;
  STATES.forEach((st, j) => text('gallery__plate-head mono', st.name, LEFT + j * COL_W, 6));
  SAMPLES.forEach((s, i) => {
    const cy = TOP + i * ROW_H + ROW_H / 2;
    text('gallery__plate-head mono', s.name, 10, cy - 7);
    STATES.forEach((st, j) => {
      const spec: HoloSpec = { frame: 'chamfer', variant: 'subtitle', layout: 'horizontal', tier: s.tier };
      const cx = LEFT + j * COL_W + 6;
      // The object it names: a small ring, as the chart's objects stand behind their pointers.
      const dot = document.createElement('span');
      dot.className = 'gallery__plate-object';
      dot.style.cssText = `position:absolute;left:${cx - 6}px;top:${cy - 6}px`;
      host.append(dot);
      made.push(dot);
      const el = document.createElement('div');
      el.className = `callout callout--${s.kind} callout--holo callout--holo-${spec.variant}`;
      el.dataset.tier = st.id === 'play' ? 'title' : 'full';
      el.classList.toggle('is-compact', st.id === 'play');
      el.classList.toggle('is-hover', st.id === 'lifted');
      renderHoloPlate(el, node(s), spec, metaphor(s.kind));
      host.append(el);
      made.push(el);
      const frame = new HoloFrame(host, spec, s.kind);
      made.push(frame);
      frame.light(st.id === 'lifted', false);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const at = holoCandidates({ cx, cy, r: 6, dirX: 0.94, dirY: -0.34 }, w, h)[0]!;
      el.dataset.side = at.side;
      el.style.clipPath = frameClip(w, h, at.side);
      el.style.transform = `translate(${Math.round(at.rect.x0)}px, ${Math.round(at.rect.y0)}px)`;
      frame.place(at, w, h);
    });
  });
  return () => { host.style.height = ''; for (const m of made) if (m instanceof HoloFrame) m.destroy(); else m.remove(); };
}

/** Invented rows (INV-18), one per rung, as a seat's and a station's lists carry them (a PR's: the work it serves, 19 L6). */
const row = (n: number, label: string, meta: string, rung: MegaList['rows'][number]['rung'], sub?: string) => ({
  key: `id:t:row${n}` as CanonicalKey, label, meta, rung,
  ...(sub ? { subtitle: { label: sub, url: null } } : {}),
});
const EXPANDED: { name: string; kind: ViewNode['kind']; label: string; meta: string; spec: HoloSpec; list: MegaList }[] = [
  {
    name: 'T3 Place · a homeworld', kind: 'seat', label: 'Kit\'s Haven', meta: '',
    spec: { frame: 'chamfer', variant: 'title', layout: 'horizontal', tier: 'place' },
    list: { title: 'Kit\'s Haven', more: 0, rows: [
      row(1, 'Lamp-room telemetry', 'User Story · #20141 · New', 'ready'),
      row(2, 'Tide table widget', 'User Story · #20101 · Active', 'underway'),
      row(3, 'Quay camera grid', 'User Story · #20115 · Resolved', 'nearing'),
      row(4, 'Berth schedule export', 'User Story · #20103 · Closed', 'accomplished'),
      row(5, 'Console freezes on export', 'Bug · #20221 · Removed', 'off'),
    ] },
  },
  {
    name: 'T1 Lead · a station', kind: 'facility', label: 'tide-gateway', meta: 'Repository',
    spec: { frame: 'chamfer', variant: 'subtitle', layout: 'vertical', tier: 'lead' },
    list: { title: 'tide-gateway', more: 0, rows: [
      row(6, 'Crane slot lookup', 'PR · #21006 · Active', 'underway', '→ User Story #20122'),
      row(7, 'Roster and export ledger rows', 'PR · #21008 · Completed', 'accomplished', '→ User Story #20112, Bug #20221'),
    ] },
  },
];

function buildExpanded(host: HTMLElement): () => void {
  host.style.position = 'relative';
  const made: (HTMLElement | HoloFrame)[] = [];
  const at = (el: HTMLElement, x: number, y: number) => { el.style.cssText += `;position:absolute;left:${x}px;top:${y}px`; host.append(el); made.push(el); };
  EXPANDED.forEach((s, i) => {
    const head = Object.assign(document.createElement('span'), { className: 'gallery__plate-head mono', textContent: s.name });
    at(head, 10 + i * 520, 182); // under the plates: the expanded ones reach the cell's top
    [false, true].forEach((open, j) => {
      const cx = 30 + i * 520 + j * (s.spec.layout === 'vertical' ? 150 : 210);
      const cy = 34;
      const dot = Object.assign(document.createElement('span'), { className: 'gallery__plate-object' });
      at(dot, cx - 6, cy - 6);
      const el = document.createElement('div');
      el.className = `callout callout--${s.kind} callout--holo callout--holo-${s.spec.variant}`;
      el.dataset.tier = open ? 'expanded' : 'full';
      renderHoloPlate(el, { ...node({ tier: s.spec.tier, name: s.name, kind: s.kind, label: s.label, meta: s.meta }), meta: s.meta || undefined } as ViewNode, s.spec, metaphor(s.kind));
      host.append(el);
      made.push(el);
      const w0 = el.offsetWidth;
      const h0 = el.offsetHeight;
      const cands = s.spec.layout === 'vertical'
        ? holoVerticalCandidates({ cx, cy, r: 6 }, w0, h0)
        : holoCandidates({ cx, cy, r: 6, dirX: 0.94, dirY: -0.34 }, w0, h0);
      let place = cands[0]!;
      if (open) {
        el.classList.add('is-expanded');
        el.style.maxWidth = '320px';
        const rows = new HoloRows(el);
        rows.set(s.list);
        rows.attach();
        el.querySelector('.holo__row:nth-child(2)')?.classList.add('is-lit'); // a lit row, as hovered
        place = growPlacement(place, el.offsetWidth, el.offsetHeight);
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const frame = new HoloFrame(host, s.spec);
      made.push(frame);
      frame.light(false, false, open);
      el.dataset.side = place.side;
      el.style.clipPath = frameClip(w, h, place.side);
      el.style.transform = `translate(${Math.round(place.rect.x0)}px, ${Math.round(place.rect.y0)}px)`;
      frame.place(place, w, h);
    });
  });
  return () => { for (const m of made) if (m instanceof HoloFrame) m.destroy(); else m.remove(); };
}

/** An invented picture (INV-18, 06 §4: illustrations, never photos) as an inline SVG data URL, `w`×`h`. */
const picture = (w: number, h: number, sky: string, coat: string, band?: string): string => {
  const cx = w / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${sky}"/>`
    + (band ? `<rect width="${(w - h) / 2}" height="${h}" fill="${band}"/><rect x="${(w + h) / 2}" width="${(w - h) / 2}" height="${h}" fill="${band}"/>` : '')
    + `<path d="M${cx - h * 0.38} ${h}c${h * 0.04}-${h * 0.22} ${h * 0.18}-${h * 0.3} ${h * 0.38}-${h * 0.3}s${h * 0.34} ${h * 0.08} ${h * 0.38} ${h * 0.3}z" fill="${coat}"/>`
    + `<circle cx="${cx}" cy="${h * 0.44}" r="${h * 0.2}" fill="#efc39b"/><path d="M${cx - h * 0.22} ${h * 0.44}c0-${h * 0.17} ${h * 0.1}-${h * 0.27} ${h * 0.23}-${h * 0.27} ${h * 0.14} 0 ${h * 0.22} ${h * 0.11} ${h * 0.2} ${h * 0.27}-${h * 0.05}-${h * 0.09}-${h * 0.14}-${h * 0.14}-${h * 0.23}-${h * 0.14}s-${h * 0.15} ${h * 0.05}-${h * 0.2} ${h * 0.14}z" fill="#2a1f24"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};
/** Three invented captains: a square picture (as ADO serves them), a wide hand-added one, and initials alone. */
const CAPTAINS: { name: string; label: string; avatar: NonNullable<ViewNode['avatar']> }[] = [
  { name: 'a picture (square)', label: 'Rowan Pike', avatar: { initials: 'RP', color: avatarColor('RP'), image: picture(64, 64, '#2f6b5c', '#c8553d') } },
  { name: 'a wide picture, cropped', label: 'Juno Avery', avatar: { initials: 'JA', color: avatarColor('JA'), image: picture(112, 64, '#3d4f8f', '#d9a441', '#8a2b2b') } },
  { name: 'initials on their swatch', label: 'Tamsin Hale', avatar: { initials: 'TH', color: avatarColor('TH') } },
];
const CAPTAIN: HoloSpec = { frame: 'chamfer', variant: 'avatar', layout: 'vertical', tier: 'lead' };
const CAPTAIN_ROW = 56;
const CAPTAIN_STATES = [
  { id: 'rest', name: 'at rest' },
  { id: 'lifted', name: 'lifted (pointed, selected)' },
  { id: 'play', name: 'in play (the picture alone)' },
] as const;

function buildCaptains(host: HTMLElement): () => void {
  host.style.position = 'relative';
  const made: (HTMLElement | HoloFrame)[] = [];
  const at = (el: HTMLElement, x: number, y: number) => { el.style.cssText += `;position:absolute;left:${x}px;top:${y}px`; host.append(el); made.push(el); };
  CAPTAIN_STATES.forEach((st, j) => at(Object.assign(document.createElement('span'), { className: 'gallery__plate-head mono', textContent: st.name }), LEFT + j * COL_W, 6));
  CAPTAINS.forEach((cap, i) => {
    const cy = TOP + i * CAPTAIN_ROW + 46;
    at(Object.assign(document.createElement('span'), { className: 'gallery__plate-head mono', textContent: cap.name }), 10, cy - 18);
    CAPTAIN_STATES.forEach((st, j) => {
      const cx = LEFT + j * COL_W + 60;
      at(Object.assign(document.createElement('span'), { className: 'gallery__plate-object' }), cx - 6, cy - 6);
      const el = document.createElement('div');
      el.className = `callout callout--captain callout--holo callout--holo-${CAPTAIN.variant}`;
      const play = st.id === 'play';
      el.dataset.tier = play ? 'picture' : 'full';
      el.classList.toggle('is-compact', play);
      el.classList.toggle('is-hover', st.id === 'lifted');
      renderHoloPlate(el, { ...node({ tier: 'lead', name: cap.name, kind: 'captain', label: cap.label, meta: '' }), avatar: cap.avatar }, CAPTAIN);
      host.append(el);
      made.push(el);
      const frame = new HoloFrame(host, CAPTAIN);
      made.push(frame);
      frame.light(st.id === 'lifted', false);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (play) {
        // As the chart's picture tier: hugging the object's top, the plate's corners, the frame alone.
        const x0 = cx - w / 2;
        const y0 = cy - 6 - h;
        el.style.clipPath = frameClip(w, h, 'above');
        el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
        frame.bare(x0, y0, w, h);
        return;
      }
      const place = holoVerticalCandidates({ cx, cy, r: 6 }, w, h, 'above')[0]!;
      el.dataset.side = place.side;
      el.style.clipPath = frameClip(w, h, place.side);
      el.style.transform = `translate(${Math.round(place.rect.x0)}px, ${Math.round(place.rect.y0)}px)`;
      frame.place(place, w, h);
    });
  });
  return () => { for (const m of made) if (m instanceof HoloFrame) m.destroy(); else m.remove(); };
}

const SKIES: DomCell['sky'][] = ['ink', 'galaxy', 'sector', 'feature'];
const WHERE: Record<DomCell['sky'], string> = {
  ink: 'over the ink (B cycles the page background)',
  galaxy: 'over the galaxy sky (the galaxies\' plates)',
  sector: 'over the round\'s sky (the pod stars\' plates)',
  feature: 'over the region\'s sky, the brightest nebula the plates sit on',
  body: '',
};

export function labelSections(): Section[] {
  return [{
    key: 'labels',
    title: 'Label hierarchy (19 §2, 22 A5): T1 Lead, T2 Door, T3 Place, T4 Sky',
    items: [],
    dom: SKIES.map((sky) => ({
      id: `tiers-${sky}`,
      title: `tiers · ${sky}`,
      note: `Each tier raised (on the chart every plate rests at T4 Sky, 27 B1), lifted and in play, ${WHERE[sky]}. Values: 15 §6 holo-tiers.`,
      sky,
      build,
    })).concat({
      id: 'expanded-feature',
      title: 'expanded · feature',
      note: 'One plate, grown in place (19 L2): a homeworld and a station at rest, then expanded into their rows (a rung mark per row, the second lit; a station\'s rows are its PRs, each with the work it serves, 19 L6). Values: 15 §6 Expanded plates.',
      sky: 'feature',
      build: buildExpanded,
    }, {
      id: 'captains-feature',
      title: 'captains · feature',
      note: 'The captain\'s plate (19 L8, T1): the picture fills the near end as a square, full height and flush with the frame, its corners cut with the plate\'s; no ring. In play the picture alone, a small square with the same corners and the T1 frame line. A wide picture fills the square from its centre; with none, the initials on their swatch. Values: 15 §6 holo-variants.',
      sky: 'feature',
      build: buildCaptains,
    }),
  }];
}
