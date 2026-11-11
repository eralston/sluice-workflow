// Tooltips (decided 2026-10-07): a short phrase after a moment's hover (or keyboard focus) on any
// element with `data-tip`, with an optional subtitle from `data-tip-keys` for its keyboard and mouse
// actions. One delegated listener for the whole app; native `title` tooltips are not used alongside.
import { useEffect, useRef, useState } from 'react';

/** How long the pointer (or focus) rests before a tooltip shows. */
export const TIP_DELAY_MS = 600;
const TIP_ID = 'app-tooltip';

interface Tip { text: string; keys: string | null; x: number; y: number; above: boolean }

export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const target = useRef<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      target.current?.removeAttribute('aria-describedby');
      target.current = null;
      setTip(null);
    };
    const arm = (el: HTMLElement) => {
      if (target.current === el) return;
      hide();
      target.current = el;
      timer.current = window.setTimeout(() => {
        if (!el.isConnected || target.current !== el) return;
        const r = el.getBoundingClientRect();
        const above = r.bottom + 64 > window.innerHeight;
        el.setAttribute('aria-describedby', TIP_ID);
        setTip({ text: el.dataset.tip ?? '', keys: el.dataset.tipKeys ?? null, x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
      }, TIP_DELAY_MS);
    };
    const tipOf = (e: Event) => (e.target instanceof Element ? (e.target.closest('[data-tip]') as HTMLElement | null) : null);
    const over = (e: PointerEvent) => { const el = tipOf(e); if (el) arm(el); else if (target.current) hide(); };
    const focus = (e: FocusEvent) => { const el = tipOf(e); if (el && (e.target as HTMLElement).matches(':focus-visible')) arm(el); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('wheel', hide, { passive: true });
    document.addEventListener('keydown', key);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('wheel', hide);
      document.removeEventListener('keydown', key);
    };
  }, []);

  // Keep it inside the window once its width is known.
  const [dx, setDx] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !tip) { setDx(0); return; }
    const r = el.getBoundingClientRect();
    setDx(r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0);
  }, [tip]);

  if (!tip || !tip.text) return null;
  return (
    <div id={TIP_ID} ref={ref} role="tooltip" className={`tooltip${tip.above ? ' tooltip--above' : ''}`}
      style={{ left: tip.x + dx, top: tip.y }}>
      <span className="tooltip__text">{tip.text}</span>
      {tip.keys && <span className="tooltip__keys">{tip.keys}</span>}
    </div>
  );
}
