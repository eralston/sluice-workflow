// Settings → Your captain (13 §7, 18 §3): pick which captain is you, by full name, then your faction,
// hull and colourway. The style reaches only your own ship and the stations you summon first; every
// other ship keeps its seed. Below, this round's achievements, each with its one line and links to
// the pieces involved, and the switch that turns them off (18 §5 A5). The awards are a prop: the
// integration fills them (17 W3-T1). With no captain chosen there are none, and nothing is suggested
// (Q8, closed 2026-10-28: in ADO mode `SuggestViewer` asks "Is this you?"; fixtures always ask).
import { useState } from 'react';
import { checkAgainstFleet } from '@shared/captainFile';
import type { CaptainStyle } from '@shared/contracts/settings';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Award } from '@shared/engine/types';
import { COLOURWAYS, FACTIONS, FLEET_HULLS, fleetDesign, type Faction } from '../../chart/art/fleet';
import { reveal, select } from '../../nav';
import { useChart } from '../../store';
import { closeSettings, patchSettings, useSettings } from '../store';
import { CaptainPreview } from '../CaptainPreview';
import { SuggestViewer } from './SuggestViewer';
import { chooseViewer, peopleOf, styleCaptain, useCaptainStyle, useViewer } from '../viewer';

/** The v1 achievements' names (18 §2); a later rule without one shows its id. */
const AWARD_TITLES: Record<string, string> = {
  'clear-skies': 'Clear skies',
  'hat-trick-landings': 'Hat trick: landings',
  'hat-trick-defences': 'Hat trick: defences',
  'hat-trick-reviews': 'Hat trick: reviews',
  'swift-passage': 'Swift passage',
  'steady-hands': 'Steady hands',
  'clean-landing': 'Clean landing',
  wingman: 'Wingman',
};
const awardTitle = (id: string) => (Object.hasOwn(AWARD_TITLES, id) ? AWARD_TITLES[id]! : id.replace(/[-_]+/g, ' '));

/** Hulls by faction, as indices into FLEET_HULLS (a style's `hull` is a FleetDesign hull). */
const hullsOf = (f: Faction) => FLEET_HULLS.map((h, i) => ({ i, h })).filter(({ h }) => h.faction === f);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const numberOf = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);

export function CaptainTab({ awards }: { awards: Award[] }) {
  const history = useChart((s) => s.history);
  const viewer = useViewer();
  const style = useCaptainStyle();
  const achievementsOn = useSettings((s) => s.settings.achievements);
  const persisted = useSettings((s) => s.persisted);
  const people = peopleOf(history);
  const me = history?.entities.captains.find((c) => c.key === viewer) ?? null;
  // The seeded look, as the starting point when a faction is first picked.
  const seeded = me ? fleetDesign(me.shipSeed) : null;

  const pickFaction = (f: Faction | null) => {
    if (!f) { void styleCaptain(null); return; }
    const base = me ? fleetDesign(me.shipSeed, f) : { hull: hullsOf(f)[0]!.i, colourway: 0 };
    void styleCaptain({ faction: f, hull: base.hull, colourway: style?.colourway ?? base.colourway });
  };
  const [fileNote, setFileNote] = useState<{ text: string; bad: boolean } | null>(null);
  const fleet = { hullFactions: FLEET_HULLS.map((h) => h.faction), colourways: COLOURWAYS.length };
  const exportCaptain = async () => {
    if (!style) return;
    try {
      const r = await window.starChart.captain.export(style);
      setFileNote(r.ok ? { text: 'Captain saved to the file.', bad: false } : r.reason === 'cancelled' ? null : { text: 'The captain could not be saved there.', bad: true });
    } catch { setFileNote({ text: 'The captain could not be saved there.', bad: true }); }
  };
  const importCaptain = async () => {
    try {
      const r = await window.starChart.captain.import();
      if (!r.ok) {
        setFileNote(r.reason === 'cancelled' ? null : { text: r.message ?? 'That file could not be read.', bad: true });
        return;
      }
      const checked = checkAgainstFleet(r.style, fleet);
      if (!checked.ok) { setFileNote({ text: checked.message, bad: true }); return; }
      await styleCaptain(checked.style);
      setFileNote({ text: 'Captain loaded from the file.', bad: false });
    } catch { setFileNote({ text: 'That file could not be read.', bad: true }); }
  };
  const restyle = (patch: Partial<CaptainStyle>) => { if (style) void styleCaptain({ ...style, ...patch }); };

  return (
    <>
      <h2 className="settings__h2">Your captain</h2>
      {!persisted && <p className="muted small settings__note">Settings can’t be saved right now: changes last until the app closes.</p>}
      <SuggestViewer />
      <div className="settings__group">
        <label className="settings__field">
          <span>Who are you?</span>
          {people.length ? (
            <select value={viewer ?? ''} onChange={(e) => void chooseViewer((e.target.value || null) as CanonicalKey | null)} data-log="viewer-choose">
              <option value="">Not chosen</option>
              {people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          ) : <span className="muted small">Open a sprint to choose from its people.</span>}
        </label>
        <p className="muted small">Kept on this Mac only. With no captain chosen, every ship flies its own seeded look and no achievements are shown.</p>
      </div>

      {me && (seeded || style) && <CaptainPreview design={style ?? seeded!} />}

      <fieldset className="settings__group" disabled={!me}>
        <legend>Faction</legend>
        <div className="settings__options">
          <label className="settings__choice">
            <input type="radio" name="faction" checked={!style} onChange={() => pickFaction(null)} />
            <span>Seeded{seeded ? <span className="muted small"> · {FLEET_HULLS[seeded.hull]!.name}, {COLOURWAYS[seeded.colourway]!.name}</span> : null}</span>
          </label>
          {FACTIONS.map((f) => (
            <label key={f.key} className="settings__choice">
              <input type="radio" name="faction" value={f.key} checked={style?.faction === f.key} onChange={() => pickFaction(f.key)} />
              <span>{f.title} <span className="muted small">· {f.genre}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {style && me && (
        <>
          <fieldset className="settings__group">
            <legend>Hull</legend>
            <div className="settings__options">
              {hullsOf(style.faction).map(({ i, h }) => (
                <label key={i} className="settings__choice">
                  <input type="radio" name="hull" value={i} checked={style.hull === i} onChange={() => restyle({ hull: i })} />
                  <span>{h.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="settings__group">
            <legend>Colourway</legend>
            <div className="settings__options settings__options--grid">
              {COLOURWAYS.map((c, i) => (
                <label key={c.name} className="settings__choice">
                  <input type="radio" name="colourway" value={i} checked={style.colourway === i} onChange={() => restyle({ colourway: i })} />
                  <span className="settings__swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${hex(c.hull)} 55%, ${hex(c.accent)} 55%)` }} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <div className="settings__group">
        <div className="settings__options">
          <span className="muted small">Take your captain to another Mac as a small file: faction, hull and colourway, nothing else.</span>
          <div className="settings__row">
            <button type="button" className="enter-link" disabled={!style} onClick={() => void exportCaptain()} data-log="captain-export">Export captain…</button>
            <button type="button" className="enter-link" disabled={!me} onClick={() => void importCaptain()} data-log="captain-import">Import captain…</button>
          </div>
          {fileNote && <p className={`small settings__file-note${fileNote.bad ? ' settings__file-note--bad' : ''}`} role={fileNote.bad ? 'alert' : 'status'} data-captain-file={fileNote.bad ? 'error' : 'ok'}>{fileNote.text}</p>}
        </div>
      </div>

      <div className="settings__group">
        <label className="settings__choice">
          <input type="checkbox" checked={achievementsOn} onChange={(e) => void patchSettings({ achievements: e.target.checked })} />
          <span>Show my achievements</span>
        </label>
        {/* Earned, never lost: an empty round shows nothing at all (18 §1). */}
        {achievementsOn && me && awards.length > 0 && (
            <ul className="settings__awards" aria-label="This round’s achievements">
              {awards.map((a) => (
                <li key={`${a.id}:${a.earnedAt.eventKey}`} className="settings__award" data-award={a.id}>
                  <span className="settings__award-title">{awardTitle(a.id)}</span>
                  <span className="settings__award-reason">{a.reason}</span>
                  <span className="settings__award-pieces">
                    {a.pieces.map((k) => (
                      <button key={k} type="button" className="connect__link" data-log="award-piece"
                        onClick={() => { closeSettings(); select(k); reveal(k); }}>#{numberOf(k)}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
        )}
      </div>
    </>
  );
}
