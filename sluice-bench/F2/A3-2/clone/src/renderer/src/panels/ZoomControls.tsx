// Zoom buttons (decided 2026-10-07): a visible, clickable way to zoom, and (↑) to go up a level. They
// zoom like the wheel, crossing into a scene (or back out) past the usual thresholds.
import type { ChartApp } from '../chart/ChartApp';
import { back } from '../nav';
import { SOURCE_CAPS } from '@shared/contracts/source';
import { useChart } from '../store';

export function ZoomControls({ chart }: { chart: React.RefObject<ChartApp | null> }) {
  const hidden = useChart((s) => SOURCE_CAPS[s.mode].needsConnection && s.stack.length === 1 && s.projects.length === 0); // the empty cosmos
  const canGoUp = useChart((s) => s.stack.length > 1);
  if (hidden) return null;
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom in" data-tip="Zoom in" data-tip-keys="+ · scroll or pinch" data-log="zoom-in" onClick={() => chart.current?.zoomBy(1.25)}>+</button>
      <button type="button" aria-label="Zoom out" data-tip="Zoom out" data-tip-keys="− · scroll or pinch" data-log="zoom-out" onClick={() => chart.current?.zoomBy(0.8)}>−</button>
      {canGoUp && <button type="button" aria-label="Up one level" className="zoom-controls__up" data-tip="Up one level" data-tip-keys="Esc · ⌘←" data-log="up-level" onClick={back}>↑</button>}
    </div>
  );
}
