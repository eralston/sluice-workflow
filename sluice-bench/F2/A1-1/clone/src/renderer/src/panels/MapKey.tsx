import { BOARD } from '@shared/scene/board';
import { useChart } from '../store';
import { explainStage, keyKinds, kindNames, LINES, SECTORS, SOLAR_LINES, SOLAR_SECTORS } from '../vocab';

/**
 * The map key: what each object is in ADO, what the looks in this scene mean, and the line styles.
 * Under Solar it names only what Solar draws, in Solar's meanings (19 P2, R3: a star is a pod).
 */
export function MapKey() {
  const { graph, history, keyOpen, paradigm, set } = useChart();
  if (!keyOpen) return null;
  const nodes = graph?.nodes ?? [];
  const kindsHere = new Set(nodes.map((n) => n.kind));
  const stages = [...new Set(nodes.map((n) => n.stage))]
    .map((s) => explainStage(s, history?.stateMapping ?? null, paradigm))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.stage.localeCompare(b.stage));
  const solar = paradigm === 'solar';

  return (
    <section className="map-key" aria-label="Map key">
      <header className="map-key__head">
        <span>Map key</span>
        <button type="button" className="map-key__close" onClick={() => set({ keyOpen: false })} aria-label="Close map key">×</button>
      </header>
      <h3 className="map-key__h">Objects</h3>
      <table className="map-key__table">
        <tbody>
          {(solar ? SOLAR_SECTORS : SECTORS).map((s) => (
            <tr key={s.ado}><td className="map-key__glyph">{s.glyph}</td><td>{s.ado}</td><td className="metaphor">{s.chart}</td></tr>
          ))}
          {keyKinds(paradigm).map((k) => {
            const n = kindNames(k, paradigm)!;
            return (
              <tr key={k} className={kindsHere.has(k) ? 'is-here' : ''}>
                <td className="map-key__glyph">{n.glyph}</td><td>{n.ado}</td><td className="metaphor">{n.chart}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {stages.length > 0 && (
        <>
          <h3 className="map-key__h">Looks in this view</h3>
          <ul className="map-key__stages">
            {stages.map((s) => (
              <li key={s.stage}><span>{s.look}</span><span className="muted">{s.means}</span></li>
            ))}
          </ul>
        </>
      )}
      <h3 className="map-key__h">Lines</h3>
      <ul className="map-key__lines">
        {(solar ? SOLAR_LINES : LINES).map((l) => (
          <li key={l.sample}>
            <svg width="34" height="10" aria-hidden="true">
              {l.sample === 'orbit' && <ellipse cx="17" cy="9" rx="16" ry="7" fill="none" stroke="#83dde2" strokeOpacity="0.5" />}
              {l.sample === 'solid' && <line x1="1" y1="5" x2="33" y2="5" stroke="#83dde2" strokeOpacity="0.8" strokeWidth="1.6" />}
              {l.sample === 'dashed' && <line x1="1" y1="5" x2="33" y2="5" stroke="#83dde2" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="4 4" />}
            </svg>
            <span>{l.ado} <span className="metaphor">· {l.chart}</span></span>
          </li>
        ))}
      </ul>
      {graph?.board && (
        <>
          <h3 className="map-key__h">The board</h3>
          <ul className="map-key__stages map-key__board">
            <li><span>Each ring is a person</span><span className="muted">A–Z from the top; their avatar sits at the ring’s left end. Unassigned is outermost</span></li>
            <li><span>Left to right is the board</span><span className="muted">{graph.board.columns ? `${graph.board.columns.map((c) => c.name).join(' · ')}; the team’s own board columns, with ticks on the outer ring between them` : 'Ready · Underway · Nearing · Accomplished; ticks on the outer ring mark the columns'}</span></li>
            <li><span>Small, at the right</span><span className="muted">Done more than {BOARD.doneAfterDays} days ago</span></li>
          </ul>
        </>
      )}
      <p className="muted small">Color is never the only cue: every state also changes shape, texture, or badge.</p>
    </section>
  );
}
