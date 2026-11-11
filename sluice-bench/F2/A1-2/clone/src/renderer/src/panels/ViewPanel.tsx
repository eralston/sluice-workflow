// The side panel's top box (decided 2026-10-04): two tabs, In view (what's on the chart, as a list)
// and History (the playback's story). Play shows History; reaching the end returns to the user's last
// pick; pausing leaves it. E switches too.
import { choosePanel } from '../playback';
import { useChart } from '../store';
import { History } from './History';
import { ObjectList } from './ObjectList';

export function ViewPanel() {
  const tab = useChart((s) => s.panelTab);
  const tabs: { id: 'inView' | 'history'; label: string }[] = [{ id: 'inView', label: 'In view' }, { id: 'history', label: 'History' }];
  return (
    <section className="view-panel">
      <div className="view-panel__tabs" role="tablist" aria-label="Side panel">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            className="view-panel__tab" onClick={() => choosePanel(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="view-panel__body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'inView' ? <ObjectList /> : <History />}
      </div>
    </section>
  );
}
