import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Busy, useBusy } from './Busy';
import { crumbsOf, type Crumb, type CrumbLevel } from '@shared/hierarchy/crumbs';
import { activeHierarchy } from '../hierarchy';
import { addable, backTo, backToProject } from '../nav';
import { siblingsOf, type Sibling } from '../navSiblings';
import { useChart } from '../store';
import { chromeWords } from '@shared/hierarchy/chrome';
import { useCaps } from '../data/caps';
import { AddPicker } from './AddPicker';

/**
 * Breadcrumb trail (06 §3). Each level's name goes back to it; its ▾ caret (or clicking the current
 * level) opens a menu of siblings — other projects, other Area Paths and Epics, other Features in the
 * sector, other Stories/Bugs in the Feature — for a sideways move that keeps everything above.
 */
export function Breadcrumb() {
  const { stack, projects, adding, set, history } = useChart();
  const { areaTree } = useCaps();
  const words = chromeWords(history);
  const addRef = useRef<HTMLButtonElement>(null);
  const what = addable();
  const at = addRef.current?.getBoundingClientRect();
  const top = stack.at(-1)?.sceneKey;
  useEffect(() => { set({ adding: false }); }, [top, set]); // a new scene: a new set to add to
  const [menu, setMenu] = useState<{ level: CrumbLevel; items: Sibling[]; x: number; y: number; title: string } | null>(null);
  const { busy, run } = useBusy();
  const busyId = (level: CrumbLevel) => (level.kind === 'entry' ? `entry-${level.index}` : level.kind);

  // Siblings can take a request (a project's teams and Epics): the control says so while it waits.
  const open = async (level: CrumbLevel, el: HTMLElement, title: string) => {
    const r = el.getBoundingClientRect();
    const items = await run(busyId(level), siblingsOf(level));
    setMenu({ level, items, x: r.left, y: r.bottom + 4, title });
  };

  // The trail as data (src/shared/hierarchy/crumbs.ts); here it's only drawn.
  const backOf = (c: Crumb) => {
    const b = c.back;
    if (!b) return undefined;
    return b.kind === 'project' ? () => backToProject(b.projectKey) : () => backTo(b.index);
  };
  const crumbs = crumbsOf(stack, projects, activeHierarchy(), history ?? undefined).map((c) => ({ ...c, team: !!c.pill, goBack: backOf(c) }));

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((c, i) => {
        // "All projects" has siblings only where you choose them: ADO mode's pinned projects.
        const hasSiblings = !(c.level.kind === 'entry' && c.level.index === 0) || areaTree;
        const title = c.type ? `${c.type}: ${c.label}` : c.label;
        if (c.team) {
          const back = c.goBack;
          // The team switcher (decided 2026-10-04): which team's sky you're in, distinct from where you
          // are within it. It never truncates; its ▾ switches to another Area Path or Epic.
          return (
            <span key={i} className="crumb-group crumb-group--team">
              <span className="team-pill" role="group" aria-label={`${c.type ?? 'Team'}: ${c.label}`} aria-current={c.current ? 'page' : undefined}>
                <span className="team-pill__type">{c.pill}</span>
                <button type="button" className="team-pill__name" title={back ? `${title}: go to this team's sky` : `${title} — ${words.switchTitle}`}
                  onClick={(e) => (back ? back() : void open(c.level, e.currentTarget, c.type ?? ''))}>
                  {c.glyph}{c.label}
                </button>
                <button type="button" className="team-pill__switch" aria-haspopup="menu" aria-label={words.switchLabel} aria-busy={busy === busyId(c.level)}
                  data-tip={words.switchTip} data-log="team-switch"
                  onClick={(e) => void open(c.level, e.currentTarget.parentElement!, words.menuTitle)}>{busy === busyId(c.level) ? <Busy label={words.switchLoading} /> : '▾'}</button>
              </span>
            </span>
          );
        }
        return (
          <span key={i} className="crumb-group">
            {c.current ? (
              hasSiblings ? (
                <button type="button" className="crumb crumb--current" aria-current="page" aria-haspopup="menu" title={`${title} — show siblings`}
                  onClick={(e) => void open(c.level, e.currentTarget, c.type ?? '')}>
                  {c.type && <span className="crumb__type">{c.type}</span>}{c.glyph}{c.label}
                  {busy === busyId(c.level) ? <Busy label="Loading…" /> : <span className="crumb__caret" aria-hidden="true">▾</span>}
                </button>
              ) : (
                <span aria-current="page">{c.glyph}{c.label}</span>
              )
            ) : (
              <>
                <button type="button" className="crumb" title={title} onClick={c.goBack}>{c.glyph}{c.label}</button>
                {hasSiblings && (
                  <button type="button" className="crumb__caret-btn" aria-haspopup="menu" aria-label={`Siblings of ${title}`} aria-busy={busy === busyId(c.level)}
                    onClick={(e) => void open(c.level, e.currentTarget, c.type ?? '')}>{busy === busyId(c.level) ? <Busy label="Loading…" /> : '▾'}</button>
                )}
              </>
            )}
          </span>
        );
      })}
      {what && (
        <button ref={addRef} type="button" className="crumb crumb--add" aria-haspopup="dialog" aria-expanded={adding} data-log="crumb-add"
          data-tip={what.kind === 'project' ? 'Add a project to the chart' : 'Add an Area Path'}
          data-tip-keys={what.kind === 'project' ? 'Pin it: its galaxy joins the others' : 'Saved for this project: a pod in every sprint'}
          onClick={() => { setMenu(null); set({ adding: !adding }); }}>
          + {what.kind === 'project' ? 'Project' : 'Area Path'}
        </button>
      )}
      {menu && <SiblingMenu {...menu} onClose={() => setMenu(null)} />}
      {adding && what && <AddPicker what={what} x={at?.left ?? 200} y={(at?.bottom ?? 40) + 4} />}
    </nav>
  );
}

function SiblingMenu({ items, x, y, title, onClose }: { items: Sibling[]; x: number; y: number; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus();
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [onClose]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };
  let group: string | undefined;
  return (
    <div ref={ref} className="sibling-menu" role="menu" aria-label={title ? `${title} siblings` : 'Siblings'} style={{ left: x, top: y }} onKeyDown={onKeyDown}>
      {items.length === 0 && <div className="sibling-menu__empty muted">No siblings</div>}
      {items.map((s) => {
        const head = s.group !== group ? ((group = s.group), s.group) : undefined;
        return (
          <div key={s.key}>
            {head && <div className="sibling-menu__group">{head}</div>}
            <button type="button" role={s.checked === undefined ? 'menuitemradio' : 'menuitemcheckbox'} aria-checked={s.checked ?? s.current}
              className={`sibling-menu__item${s.key === 'add' ? ' sibling-menu__item--add' : ''}`} onClick={() => { onClose(); s.go(); }}
              {...(s.checked ? { 'data-tip': `Remove ${s.label} from the chart`, 'data-tip-keys': 'Add it back with +' } : {})}>
              <span>{s.checked !== undefined && <span className="sibling-menu__check" aria-hidden="true">✓ </span>}{s.label}</span>
              {s.meta && <span className="muted mono">{s.meta}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
