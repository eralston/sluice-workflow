// The top of the view into space, stacked (23 B9). The player's bottom edge (its bar's full height, the
// partial-history line's slot, and its ⋯ pop while open) is measured and published as `--overlay-top` on
// the stage; the banners (error, then the quiet "Filling in" line, then the follow bar) stack under it, centred on
// the view, and `--stack-bottom` is where that stack ends, for the map key to start below. Nothing at the
// top of the view overlaps another, at any window size (06 §3).
import { useEffect, useRef, type ReactNode } from 'react';

/** The player bar's full height (44 + its border), whether or not it has faded: the slot does not jump (R4). */
const BAR_FULL = 46;

export function OverlayStack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stack = ref.current;
    const stage = stack?.parentElement;
    if (!stack || !stage) return;
    let last = '';
    const set = (name: string, px: number) => stage.style.setProperty(name, `${Math.round(px)}px`);
    const measure = () => {
      const s = stage.getBoundingClientRect();
      let top = 0;
      const bar = stage.querySelector('.transport')?.getBoundingClientRect();
      if (bar) top = Math.max(top, bar.top - s.top + BAR_FULL);
      for (const sel of ['.transport__partial', '.transport__pop']) {
        const r = stage.querySelector(sel)?.getBoundingClientRect();
        if (r) top = Math.max(top, r.bottom - s.top);
      }
      if (!top) top = 12;
      const bottom = stack.childElementCount ? Math.max(top, stack.getBoundingClientRect().bottom - s.top) : top;
      const key = `${Math.round(top)}|${Math.round(bottom)}`;
      if (key !== last) { last = key; set('--overlay-top', top); set('--stack-bottom', bottom); }
    };
    // Measured when something that moves the stack changes (a size, a child added or removed, the player's own parts), not every
    // frame: the page idles when nothing does (B audit).
    const watched = new Set<Element>();
    const watch = () => {
      const now = new Set<Element>([stage, stack, ...stack.children, ...stage.querySelectorAll('.transport, .transport__partial, .transport__pop')]);
      for (const el of watched) if (!now.has(el)) { ro.unobserve(el); watched.delete(el); }
      for (const el of now) if (!watched.has(el)) { ro.observe(el); watched.add(el); }
      const bar = stage.querySelector('.transport');
      if (bar) mo.observe(bar, { childList: true, subtree: true }); // the partial line and the ⋯ pop come and go inside it
    };
    const ro = new ResizeObserver(measure);
    const mo: MutationObserver = new MutationObserver(() => { watch(); measure(); });
    mo.observe(stage, { childList: true });
    mo.observe(stack, { childList: true });
    window.addEventListener('resize', measure);
    watch();
    measure();
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <div className="overlay-stack" ref={ref}>{children}</div>;
}
