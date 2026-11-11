// The player (05 §2; 06 §5; moved to the top of the space view 2026-10-04): play/pause and step, the
// source date and day, a draggable ruler whose ticks show what touches this view, the rate chip, and a
// ⋯ menu for Highlights, the lens, and reduced motion. The history itself is the side panel's History
// tab. While playing it fades to a thin progress line after a few idle seconds.
// v1 (13 §2): where the scene doesn't play (Solar's round, its galaxy) the player is a plate that
// says where to go; under Solar, its ticks and lines are read through the bundle's domain pack.
import { useEffect, useMemo, useState } from 'react';
import { RATES, type Beat, type Rate } from '@shared/contracts/playback';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ScopeHistory } from '@shared/contracts/history';
import { sceneEntityKeys, touches } from '@shared/playback/highlights';
import { resolveState } from '@shared/stateMapping';
import { RUNG_COLOR, signalOf, type Rung } from '../chart/art/progress';
import { activeHierarchy } from '../hierarchy';
import { cancelHistory, currentHistory, historySceneOf, playState, refreshScope, requestHistory } from '../nav';
import { partialText, scenePartial } from '@shared/historyPartial';
import { useActivity } from '../activityStore';
import { gatherStalled } from '../gather';
import { TokenFix, useTokenRefusal } from './TokenNotice';
import { pause, play, scheduleOf, seek, seekToSource, setActivity, setAllEvents, setHighlights, setLens, setRate, setReducedMotion, step } from '../playback';
import { ACTIVITY_HINT, ACTIVITY_LABEL, ACTIVITY_LEVELS } from '@shared/playback/engagement';
import { chromeWords } from '@shared/hierarchy/chrome';
import { useChart } from '../store';
import { playableAt } from '../playGate';
import { moreText } from '../theme/registry';
import { eventRow, playPlate, solarChain, solarRung } from '../v1/lines';

const RATE_LABEL: Record<Rate, string> = { 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×', 4: '4×' };
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const shortDay = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `datetime-local` value in the viewer's zone. */
function localInput(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** History on request (decided 2026-10-07): the ranges offered, and the default. */
const RANGES = [1, 7, 14, 30] as const;
const DEFAULT_DAYS = 7;
const daysLabel = (d: number) => `${d} day${d === 1 ? '' : 's'}`;

/**
 * Whether a gathering history has stopped (decided 2026-10-22; `gatherStalled`): its stream is no longer
 * running, or no request to ADO has started or finished for a while. Either way what's left won't
 * arrive by itself, so the widget offers to ask again.
 */
function useGatherStalled(on: boolean): boolean {
  const stream = useChart((s) => s.stream);
  const active = useActivity((s) => s.active);
  const recent = useActivity((s) => s.recent);
  const [now, setNow] = useState(() => Date.now());
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [on]);
  useEffect(() => { setStoppedAt(on && !stream ? (t) => t ?? Date.now() : null); }, [on, stream]);
  return on && gatherStalled({ streaming: !!stream, stoppedAt, active: active.size, lastEndedAt: recent[0]?.endedAt ?? null, now });
}

/** The player's request state: the scene shows its current state ("Now") until its history is asked for. */
function HistoryRequest({ scene }: { scene: string }) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const attempt = useChart((s) => s.historyAttempt);
  const sceneKey = useChart((s) => s.graph?.sceneKey);
  const refusal = useTokenRefusal();
  // A request made here that didn't finish: the same one again, on one button (decided 2026-10-22).
  const unfinished = attempt && attempt.sceneKey === sceneKey ? attempt : null;
  return (
    <div className="transport transport--request" role="group" aria-label="Playback">
      <div className="transport__bar">
        <span className="transport__now" data-tip="This scene as it is now" data-tip-keys="Its history isn't loaded yet">Now</span>
        {refusal ? <TokenFix refusal={refusal} /> : unfinished && (
          <>
            <span className="transport__warn" role="status" data-tip="Requests were made but didn’t all come back" data-tip-keys="The details are in Requests">⚠ {unfinished.outcome === 'cancelled' ? 'Stopped before it finished' : 'Didn’t finish'}</span>
            <button type="button" className="transport__retry" data-log="history-retry" onClick={() => void requestHistory(unfinished.days)}
              data-tip={`Ask for ${daysLabel(unfinished.days)} of history again`} data-tip-keys="What came back is kept">Retry</button>
          </>
        )}
        {/* The retry is the request again, so with one to offer it takes the load button's place; with the token refused, loading can't work. */}
        {!unfinished && !refusal && (
          <button type="button" className="transport__load" data-log="history-request" onClick={() => void requestHistory(days)}
            data-tip={`Load ${daysLabel(days)} of this ${scene}'s history`} data-tip-keys="Reads each item's revisions: it can take a while">
            ▶ Load history to play this {scene}
          </button>
        )}
        <div className="toggle transport__ranges" role="radiogroup" aria-label="History to load">
          {RANGES.map((d) => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}>{daysLabel(d)}</button>)}
        </div>
      </div>
    </div>
  );
}

/** The player's loading state: progress, and Cancel. The scene stays explorable. */
function HistoryLoading({ load }: { load: { jobId: string; days: number; done: number; total: number } }) {
  const frac = load.total > 0 ? load.done / load.total : 0;
  const refusal = useTokenRefusal();
  return (
    <div className="transport transport--loading" role="group" aria-label="Playback">
      <div className="transport__bar" role="status" aria-live="polite">
        <span className="transport__loading">{load.jobId ? `Loading ${daysLabel(load.days)} of history…${load.total > 0 ? ` ${load.done}/${load.total}` : ''}` : 'Starting…'}</span>
        {refusal ? <TokenFix refusal={refusal} /> : <span className="transport__progress" aria-hidden="true"><span style={{ width: `${Math.round(frac * 100)}%` }} /></span>}
        <button type="button" className="connect__link" onClick={cancelHistory} data-tip="Stop loading history" data-tip-keys="What's loaded so far is kept">Cancel</button>
      </div>
    </div>
  );
}

/**
 * A streamed sprint's player while its history comes in by itself (decided 2026-10-08): the scene's
 * items first. No button: it becomes playable when they're all in.
 */
function HistoryGathering({ done, total }: { done: number; total: number }) {
  const frac = total > 0 ? done / total : 0;
  const refusal = useTokenRefusal();
  const stalled = useGatherStalled(true);
  const refreshing = useChart((s) => s.refreshing);
  return (
    <div className="transport transport--loading transport--gathering" role="group" aria-label="Playback">
      <div className="transport__bar" role="status" aria-live="polite">
        <span className="transport__now" data-tip="This scene as it is now" data-tip-keys="Its history is on its way">Now</span>
        <span className="transport__loading">{stalled && !refreshing ? 'History stopped' : 'Gathering history'} {done} / {total}</span>
        {!refusal && <span className="transport__progress" aria-hidden="true"><span style={{ width: `${Math.round(frac * 100)}%` }} /></span>}
        {refusal ? <TokenFix refusal={refusal} /> : stalled && (
          <button type="button" className="transport__retry" data-log="history-retry" disabled={refreshing} onClick={() => void refreshScope()}
            data-tip="Ask ADO for the rest again" data-tip-keys="Requests were made but didn’t all come back">{refreshing ? 'Retrying…' : 'Retry'}</button>
        )}
      </div>
    </div>
  );
}

/** Where the episode can't play (v1: the round, a gated galaxy): the plate names where it can. */
function PlayGate() {
  const history = useChart((s) => s.history) ?? currentHistory();
  const plate = playPlate(history);
  return (
    <div className="transport transport--gate" role="group" aria-label="Playback">
      <div className="transport__bar">
        <span className="transport__now" role="status" data-tip={history && chromeWords(history).hasEpic === false ? `Each ${chromeWords(history).region.toLowerCase()} plays in its own system` : "Each team's sprint plays in its own system"} data-tip-keys="Double-click one to open it">{plate.ado} <span className="metaphor">· {plate.metaphor}</span></span>
      </div>
    </div>
  );
}

/** Idle time before the bar fades while playing (video-player style). */
const FADE_AFTER_MS = 3000;

/** The ruler mark for a beat: in-view or not, its rung color, and whether it's a big moment. */
interface TickLook { inView: boolean; rung: Rung | null }

export function Transport() {
  const pb = useChart((s) => s.playback);
  const lens = useChart((s) => s.lens);
  const activity = useChart((s) => s.activity);
  const reduced = useChart((s) => s.reducedMotion);
  const highlights = useChart((s) => s.highlights);
  const allEvents = useChart((s) => s.allEvents);
  const sceneKey = useChart((s) => s.graph?.sceneKey);
  const history = useChart((s) => s.history) ?? currentHistory();
  const [menu, setMenu] = useState<'rate' | 'more' | null>(null);
  const [hover, setHover] = useState<{ x: number; beat: Beat | null } | null>(null);
  const [faded, setFaded] = useState(false);
  const playing = pb?.status === 'playing';
  const historyLoad = useChart((s) => s.historyLoad);
  const catchingUp = useChart((s) => s.catchingUp);
  const ps = playState();
  const stack = useChart((s) => s.stack);
  // Partial history (23 B7): the played scene is short of some items, or the feed stopped at its cap.
  const played = historySceneOf(stack, stack.length - 1);
  const partial = scenePartial(history, played?.kind === 'feature' ? played.featureKey : 'team');
  const playedDays = history?.coverage.played?.find((p) => p.scene === (played?.kind === 'feature' ? played.featureKey : 'team'))?.days ?? DEFAULT_DAYS;
  const further = RANGES.find((d) => d > ps.days);
  // Moving into a scene without history while playing pauses: its player offers the request.
  useEffect(() => { if (ps.state !== 'ready' && playing) pause(); }, [ps.state, playing]);

  // Auto-fade: while playing, the bar thins to a progress line after a few idle seconds.
  useEffect(() => {
    if (!playing) { setFaded(false); return; }
    let timer = setTimeout(() => setFaded(true), FADE_AFTER_MS);
    const wake = () => {
      setFaded(false);
      clearTimeout(timer);
      timer = setTimeout(() => setFaded(true), FADE_AFTER_MS);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [playing]);

  // Day marks on the ruler: presentation time isn't linear in source time (nights compress).
  const days = useMemo(() => {
    const sch = scheduleOf()?.schedule;
    if (!pb || !sch || !history) return [];
    const out: { x: number; label: string }[] = [];
    const d = new Date(history.range.startUtc);
    d.setHours(0, 0, 0, 0);
    for (let t = d.getTime(); t < history.range.endUtc; t += 86_400_000) {
      const day = new Date(t);
      day.setHours(0, 0, 0, 0);
      if (day.getTime() < history.range.startUtc) continue;
      out.push({ x: sch.toPresentation(day.getTime()), label: shortDay.format(day) });
    }
    // Compressed nights and weekends bunch days together: label only those with room.
    return out.filter((d, i) => i === 0 || d.x - out[i - 1]!.x > sch.totalMs * 0.05);
  }, [pb?.beats, history]);

  // In-view ticks: beats touching this scene draw in their ladder color; the rest are hairlines.
  const looks = useMemo(() => {
    const out = new Map<number, TickLook>();
    if (!pb || !history) return out;
    const keys = sceneKey && sceneKey !== 'galaxy' ? sceneEntityKeys(history, sceneKey, activeHierarchy()) : null;
    const byKey = new Map((history.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
    const types = new Map(history.entities.workItems.map((w) => [w.key, w.type]));
    const order: Rung[] = ['ready', 'underway', 'nearing', 'accomplished'];
    const solar = solarChain();
    for (const b of pb.beats) {
      let inView = false;
      let rung: Rung | null = null;
      for (const k of b.eventKeys) {
        const e = byKey.get(k);
        if (!e || !touches(e, keys)) continue;
        inView = true;
        const r = solar ? solarRung(history, e) : rungOfEvent(history, e, types);
        if (r && (!rung || order.indexOf(r) > order.indexOf(rung))) rung = r;
      }
      out.set(b.index, { inView, rung });
    }
    return out;
  }, [pb?.beats, history, sceneKey]);

  if (history && !playableAt(sceneKey)) return <PlayGate />;
  if (historyLoad) return <HistoryLoading load={historyLoad} />;
  if (history && ps.state === 'gathering') return <HistoryGathering done={ps.done ?? 0} total={ps.total ?? 0} />;
  if (history && ps.state === 'request') return <HistoryRequest scene={(() => { const v = sceneKey ? activeHierarchy().resolve(sceneKey)?.def.vocab : undefined; return v ? v.playNounFor?.(history) ?? v.playNoun : 'team'; })()} />;
  if (!pb || !history) return null;
  const pct = (x: number) => `${(100 * x) / Math.max(1, pb.totalMs)}%`;
  const at = new Date(pb.rulerUtc);
  const remaining = pb.status === 'ended' ? 'at the end' : `${clock(pb.remainingMs)} left`;
  const atEnd = !playing && (pb.status === 'ended' || pb.x >= pb.totalMs);

  return (
    <div className={`transport${faded ? ' is-faded' : ''}`} role="group" aria-label="Playback">
      {partial && (
        // Hangs below the bar (06 §5): the player's own height never changes when it appears (R4).
        <div className="transport__partial" role="status">
          <span className="transport__warn" data-tip={partial.missing ? 'Some items’ history couldn’t be read' : 'ADO’s revision feed was read up to its limit'} data-tip-keys={partial.missing ? 'Retry asks for those items only' : 'The rest is read the next time this scene loads'}>⚠ {partialText(partial)}</span>
          {partial.missing > 0 && <span className="transport__sep" aria-hidden="true">·</span>}
          {partial.missing > 0 && (
            <button type="button" className="transport__retry" data-log="history-retry" onClick={() => void requestHistory(playedDays, true)}
              data-tip="Ask ADO for the missing items again" data-tip-keys="Only those are asked for">Retry</button>
          )}
        </div>
      )}
      <div className="transport__bar">
        {/* Every scene opens at its end (05 §2), so Play there means from the start: the glyph says so. */}
        <button type="button" className="transport__play" onClick={() => (playing ? pause() : play())}
          aria-label={playing ? 'Pause' : atEnd ? 'Play from the start' : 'Play'}
          title={playing ? 'Pause (Space)' : atEnd ? 'Play from the start (Space)' : 'Play / pause (Space)'}
          {...(atEnd ? { 'data-tip': 'Play this view from the start', 'data-tip-keys': 'Space · the scene shows where it ended up' } : {})}>
          {playing ? '❚❚' : atEnd ? '↻' : '▶'}
        </button>
        <button type="button" className="transport__step" onClick={step} aria-label="Step to the next beat" title="Step (→)">▶❘</button>
        <label className="transport__when" title="Jump to a date and time">
          <span className="transport__day">{dayFmt.format(at)}</span>
          <span className="transport__time mono">{timeFmt.format(at)}</span>
          <input
            type="datetime-local"
            aria-label="Playhead date and time"
            value={localInput(pb.rulerUtc)}
            min={localInput(history.range.startUtc)}
            max={localInput(history.range.endUtc - 60_000)}
            onChange={(e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) seekToSource(t); }}
          />
        </label>
        <div
          className="transport__ruler"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * pb.totalMs;
            // The nearest tick within a few pixels, for its tooltip.
            const near = pb.beats.reduce<Beat | null>((best, b) => {
              const d = Math.abs(b.presentationStartMs - x);
              return d < (pb.totalMs * 6) / r.width && (!best || d < Math.abs(best.presentationStartMs - x)) ? b : best;
            }, null);
            setHover({ x: e.clientX - r.left, beat: near });
          }}
          onMouseLeave={() => setHover(null)}
        >
          <div className="transport__ticks" aria-hidden="true">
            {days.map((d) => <span key={d.x} className="transport__daymark" style={{ left: pct(d.x) }}>{d.label}</span>)}
            {pb.beats.map((b) => {
              const look = looks.get(b.index);
              return (
                <span
                  key={b.index}
                  className={`transport__tick${b.accented ? ' is-accented' : ''}${b.priority === 'high' ? ' is-high' : ''}${look?.inView ? ' is-inview' : ''}${b.index === pb.beatIndex ? ' is-current' : ''}`}
                  style={{ left: pct(b.presentationStartMs), ...(look?.inView && look.rung ? { ['--tick' as string]: hex(RUNG_COLOR[look.rung]) } : {}) }}
                />
              );
            })}
            <span className="transport__fill" style={{ width: pct(pb.x) }} />
          </div>
          <input
            type="range"
            className="transport__scrub"
            aria-label="Playhead"
            min={0}
            max={Math.round(pb.totalMs)}
            step={1}
            value={Math.round(pb.x)}
            onChange={(e) => seek(Number(e.target.value))}
          />
          {hover && (
            <div className="transport__tip" style={{ left: hover.x }}>
              {hover.beat ? <BeatLines beat={hover.beat} /> : null}
              <span className="transport__left mono">{remaining}</span>
            </div>
          )}
        </div>
        <div className="transport__menu">
          <button type="button" className="transport__rate mono" aria-haspopup="true" aria-expanded={menu === 'rate'} onClick={() => setMenu(menu === 'rate' ? null : 'rate')} title="Rate ([ / ])">
            {RATE_LABEL[pb.rate]}
          </button>
          {menu === 'rate' && (
            <div className="transport__pop transport__rates" role="radiogroup" aria-label="Rate">
              {RATES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={pb.rate === r} onClick={() => { setRate(r); setMenu(null); }}>{RATE_LABEL[r]}</button>
              ))}
            </div>
          )}
        </div>
        {catchingUp && <span className="transport__note muted" role="status">Catching up…</span>}
        {lens === 'currentObserved' && (
          <button type="button" className="transport__chip" onClick={() => setLens('knownThen')} title="Today's links applied to the past, marked uncertain. Click for Known then (L)">Retrospective ✕</button>
        )}
        <button type="button" className="transport__allevents" aria-pressed={allEvents && !highlights} disabled={highlights} onClick={() => setAllEvents(!allEvents)} title={highlights ? "Highlights is on: it plays only the big moments. Turn it off to use All events" : "Accent every beat: nothing cut for length, so a longer episode. This session only"}>All events</button>
        <div className="transport__menu">
          <button type="button" className="transport__more" aria-haspopup="true" aria-expanded={menu === 'more'} aria-label="More playback options" onClick={() => setMenu(menu === 'more' ? null : 'more')}>⋯</button>
          {menu === 'more' && (
            <div className="transport__pop transport__options">
              {history.current && further && (
                <button type="button" className="transport__further" data-log="history-further" onClick={() => { setMenu(null); void requestHistory(further); }}
                  title={`Load ${daysLabel(further)} of history and re-time the player`}>Go further back: {daysLabel(further)}</button>
              )}
              <button type="button" className="transport__highlights" aria-pressed={highlights} onClick={() => setHighlights(!highlights)} title="Play only this view's big moments (H)">Highlights: only the big moments</button>
              <div className="toggle transport__lens" role="group" aria-label="Lens">
                <button type="button" aria-pressed={lens === 'knownThen'} onClick={() => setLens('knownThen')} title="Only what was known at the playhead">Known then</button>
                <button type="button" aria-pressed={lens === 'currentObserved'} onClick={() => setLens('currentObserved')} title="Today's links applied to the past, marked uncertain">Retrospective</button>
              </div>
              <div className="toggle transport__activity" role="radiogroup" aria-label="Activity">
                {ACTIVITY_LEVELS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={activity === l} aria-pressed={activity === l} onClick={() => setActivity(l)} title={`Activity: ${ACTIVITY_HINT[l]}`}>{ACTIVITY_LABEL[l]}</button>
                ))}
              </div>
              <label className="transport__motion">
                <input type="checkbox" checked={reduced} onChange={(e) => setReducedMotion(e.target.checked)} /> Reduce motion
              </label>
            </div>
          )}
        </div>
      </div>
      <div className="transport__line" aria-hidden="true">
        <span className="transport__line-bar" />
        <span className="transport__line-fill" style={{ width: pct(pb.x) }} />
        {/* The big moments in view stay on the collapsed bar, so you can see when to expect change. */}
        {pb.beats.filter((b) => b.priority === 'high' && b.accented && looks.get(b.index)?.inView).map((b) => {
          const look = looks.get(b.index);
          return (
            <span
              key={b.index}
              className={`transport__dot${b.presentationStartMs <= pb.x ? ' is-past' : ''}`}
              style={{ left: pct(b.presentationStartMs), ...(look?.rung ? { ['--tick' as string]: hex(RUNG_COLOR[look.rung]) } : {}) }}
            />
          );
        })}
      </div>
    </div>
  );
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The ladder rung an event moves its object to (in-view tick color), or null for a non-state event. */
function rungOfEvent(h: ScopeHistory, e: AnyTimelineEvent, types: Map<CanonicalKey, string>): Rung | null {
  switch (e.kind) {
    case 'wi_state_changed': return signalOf(resolveState(h.stateMapping, types.get(e.entityKey) ?? '', e.payload.to).stage).rung;
    case 'wi_created': return 'ready';
    case 'pr_opened': return 'underway';
    case 'pr_completed': return 'accomplished';
    default: return null;
  }
}

/** A beat's event lines, as the event strip writes them (the ruler tooltip). */
function BeatLines({ beat }: { beat: Beat }) {
  const history = useChart((s) => s.history) ?? currentHistory();
  if (!history) return null;
  const byKey = new Map((history.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
  return (
    <span className="transport__tiplines">
      <span className="event-beat__when mono">{dayFmt.format(beat.sourceUtc)} · {timeFmt.format(beat.sourceUtc)}</span>
      {beat.eventKeys.slice(0, 4).map((k) => {
        const e = byKey.get(k);
        if (!e) return null;
        // One wording for every event (22 B4): History's.
        const r = eventRow(history, e);
        return <span key={k} className="event-beat__line"><span className="event-beat__glyph" aria-hidden="true">{r.parts.glyph}</span>{r.line}</span>;
      })}
      {beat.eventKeys.length > 4 && <span className="muted">{moreText(beat.eventKeys.length - 4)}</span>}
    </span>
  );
}
