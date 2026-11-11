// Settings → Captain Avatars: choose which part of a picture a captain wears. A square window over the
// picture: drag to move it, the slider (or + and −) to zoom, arrow keys to nudge. "Use this crop" hands
// back a square PNG; main still cuts it to the kept size. Shown in place of the grid (not over it), so
// the Settings modal's focus trap and Esc keep working: Esc here cancels the crop, not Settings.
import { useEffect, useRef, useState } from 'react';

const VIEW = 260;
const OUT = 256;

export function CropDialog({ blob, name, onDone }: { blob: Blob; name: string; onDone: (png: Blob | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: 0, y: 0 }); // the picture point under the window's middle, in picture pixels
  const drag = useRef<{ x: number; y: number } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => { canvas.current?.focus(); }, []); // keys (arrows, +/−, Esc) work at once

  useEffect(() => {
    let live = true;
    createImageBitmap(blob).then((b) => { if (live) { setBmp(b); setCentre({ x: b.width / 2, y: b.height / 2 }); } }, () => { if (live) done.current(null); });
    return () => { live = false; };
  }, [blob]);

  const scale = bmp ? (VIEW / Math.min(bmp.width, bmp.height)) * zoom : 1;
  const clamp = (c: { x: number; y: number }) => bmp ? {
    x: Math.min(Math.max(c.x, VIEW / 2 / scale), bmp.width - VIEW / 2 / scale),
    y: Math.min(Math.max(c.y, VIEW / 2 / scale), bmp.height - VIEW / 2 / scale),
  } : c;
  const at = clamp(centre);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !bmp) return;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(bmp, at.x - VIEW / 2 / scale, at.y - VIEW / 2 / scale, VIEW / scale, VIEW / scale, 0, 0, VIEW, VIEW);
  });

  const confirm = () => {
    if (!bmp) return;
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    out.getContext('2d')!.drawImage(bmp, at.x - VIEW / 2 / scale, at.y - VIEW / 2 / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    out.toBlob((b) => onDone(b), 'image/png');
  };
  const nudge = (dx: number, dy: number) => setCentre({ x: at.x + dx / scale, y: at.y + dy / scale });

  return (
    <section className="crop" aria-label={`Crop the picture for ${name}`}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 20 : 6;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(null); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
        else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.1));
        else if (e.key === '-') setZoom((z) => Math.max(1, z - 0.1));
      }}>
      <h2 className="settings__h2">Crop the picture for {name}</h2>
      <canvas ref={canvas} width={VIEW} height={VIEW} className="crop__view" tabIndex={0} aria-label="Picture window: drag to move, arrow keys to nudge"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) { nudge(drag.current.x - e.clientX, drag.current.y - e.clientY); drag.current = { x: e.clientX, y: e.clientY }; } }}
        onPointerUp={() => { drag.current = null; }} />
      <label className="settings__field crop__zoom"><span>Zoom</span>
        <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
      </label>
      <div className="crop__actions">
        <button type="button" className="enter-link" disabled={!bmp} onClick={confirm} data-log="avatars-crop-use">Use this crop</button>
        <button type="button" className="enter-link" onClick={() => onDone(null)} data-log="avatars-crop-cancel">Cancel</button>
      </div>
    </section>
  );
}
