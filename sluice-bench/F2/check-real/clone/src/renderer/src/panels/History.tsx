// The History tab (decided 2026-10-04): the playback's story as a calm vertical list, one card per
// beat so far. The newest card arrives at the top (highlighted) and older ones are pushed down, so
// the eye stays in one place while watching. Each card lists its beat's events (22 B5), one row each
// in one wording (22 B4): the thing in ADO's terms and what happened to it, then, under Solar, what
// the chart shows for it, quieter, with a small icon of the headline's object, so the words and the
// picture teach each other. The rows the chart is playing are marked *now*, the same events whose
// notes the plates wear (22 B6). Clicking a card jumps there (a seek: no accents); hovering one lights
// its object on the chart. The next few beats still to come sit above the present, dimmed (decided
// 2026-10-09); the rest show on the player's ruler. Each row comes from the bundle's domain pack
// (v1/lines.ts `eventRow`).
import { useEffect, useMemo, useRef } from 'react';
import type { Beat } from '@shared/contracts/playback';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ScopeHistory } from '@shared/contracts/history';
import { PRIORITY_RANK } from '@shared/contracts/events';
import { storyLine, type StoryObject } from '@shared/playback/describe';
import { HISTORY_ROWS } from '@shared/playback/constants';
import { realTimeOf } from '@shared/playback/storyTime';
import { storyOf } from '@shared/playback/follow';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { resolveState } from '@shared/stateMapping';
import { RUNG_COLOR, signalOf, type Rung } from '../chart/art/progress';
import { currentHistory, hoverObject } from '../nav';
import { seekToBeat } from '../playback';
import { useChart } from '../store';
import { KINDS } from '../vocab';
import type { Role } from '@shared/engine/types';
import { eventRow, solarChain, solarRung, solarSubject } from '../v1/lines';
import { moreText } from '../theme/registry';

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
/** A time as a card shows it: weekday and minute. */
const stamp = (t: number) => `${dayFmt.format(t)} ${timeFmt.format(t)}`;

/** The chart object a card's item is drawn as (its icon and tooltip). */
const OBJECT_KIND: Record<StoryObject, keyof typeof KINDS> = {
  feature: 'star', story: 'planet', bug: 'anomaly', task: 'missionPoint', pr: 'flight', item: 'star',
};

/** Under Solar, the chart object a card's piece is drawn as, by its role (v1 kinds). */
const ROLE_KIND: Record<Role, keyof typeof KINDS> = {
  objective: 'objective', threat: 'threat', step: 'objective', container: 'star', facility: 'facility', attachment: 'facility', guard: 'facility',
};

/** One event's row on a card (22 B4, B5): ADO's line, and what the chart shows (Solar only). */
interface Row { key: string; line: string; chart: string | null; real?: number }
interface Card { beat: Beat; rows: Row[]; more: number; objectKey: CanonicalKey; kind: keyof typeof KINDS; rung: Rung | null }

/** A beat's events, the most important first (High first, state changes before links): the headline leads. */
function byWeight(events: AnyTimelineEvent[]): AnyTimelineEvent[] {
  const weight = (e: AnyTimelineEvent) => (e.kind === 'wi_state_changed' || e.kind.startsWith('pr_') ? 0 : e.kind === 'wi_created' || e.kind === 'wi_assignee_changed' ? 1 : 2);
  return [...events].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || weight(a) - weight(b));
}

/** The rung an event moves its object to, for the icon's color; null for a non-state event. */
function rungOf(h: ScopeHistory, e: AnyTimelineEvent, types: Map<CanonicalKey, string>): Rung | null {
  switch (e.kind) {
    case 'wi_state_changed': return signalOf(resolveState(h.stateMapping, types.get(e.entityKey) ?? '', e.payload.to).stage).rung;
    case 'wi_created': return 'ready';
    case 'pr_opened': return 'underway';
    case 'pr_completed': return 'accomplished';
    default: return null;
  }
}

/** How many beats still to come the list shows above the present (decided 2026-10-09). */
const UPCOMING = 3;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function History() {
  const pb = useChart((s) => s.playback);
  const reduced = useChart((s) => s.reducedMotion);
  const follow = useChart((s) => s.follow);
  const history = useChart((s) => s.history) ?? currentHistory();
  const ref = useRef<HTMLDivElement>(null);
  const current = pb?.beatIndex ?? -1;
  const nowPlaying = useChart((s) => s.nowPlaying);

  const { cards, upcoming } = useMemo((): { cards: Card[]; upcoming: Card[] } => {
    if (!pb || !history) return { cards: [], upcoming: [] };
    const types = new Map(history.entities.workItems.map((w) => [w.key, w.type]));
    const titles = snapshotAt(history, history.range.endUtc, 'knownThen').workItems;
    const byKey = new Map((history.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
    const out: Card[] = [];
    const next: Card[] = [];
    const solar = solarChain();
    for (const beat of pb.beats) {
      if (beat.index > current && next.length >= UPCOMING) break;
      const events = byWeight(beat.eventKeys.map((k) => byKey.get(k)).filter((e): e is AnyTimelineEvent => !!e));
      const main = events[0];
      if (!main) continue;
      // A beat still to come shows its headline alone, so the Next group stays short and the present
      // card stays in view (22 B5).
      const coming = beat.index > current;
      // The rows shown: the weightiest, but never without one the chart is noting now (review: a fifth
      // event playing had no row); it takes the place of the lightest that isn't.
      const shown = events.slice(0, coming ? 1 : HISTORY_ROWS);
      for (const e of coming ? [] : events.filter((x) => nowPlaying.includes(x.eventKey) && !shown.includes(x))) {
        const i = shown.findLastIndex((x) => !nowPlaying.includes(x.eventKey));
        if (i >= 0) shown[i] = e;
      }
      const rows = shown.map((e): Row => {
        const r = eventRow(history, e);
        // Story time moved it into this moment (05 §8.3a): its real time, unless the card's reads the same.
        const moved = realTimeOf(history, e.eventKey);
        const real = moved !== undefined && stamp(moved) !== stamp(beat.sourceUtc) ? moved : undefined;
        return { key: e.eventKey, line: r.line, chart: solar && !coming ? r.chart : null, ...(real !== undefined ? { real } : {}) };
      });
      const more = events.length - rows.length;
      let card: Card;
      if (solar) {
        const subject = solarSubject(history, main);
        card = { beat, rows, more, objectKey: subject.key, kind: subject.role ? ROLE_KIND[subject.role] : 'objective', rung: solarRung(history, main) };
      } else {
        const line = storyLine(history, main, (k) => types.get(k) ?? 'Item', (k) => titles.get(k)?.title);
        card = { beat, rows, more, objectKey: line.objectKey, kind: OBJECT_KIND[line.object], rung: rungOf(history, main, types) };
      }
      (beat.index > current ? next : out).push(card);
    }
    // Newest first, so what is still to come sits above the present, nearest beat lowest.
    return { cards: out.reverse(), upcoming: next.reverse() };
  }, [pb?.beats, history, current, nowPlaying]);

  // Following: the story's opening line (decided 2026-10-04): what they worked on this period, by
  // name, never by count (INV-19). It sits at the bottom, where the story begins.
  const intro = useMemo(() => {
    if (!follow || !history) return null;
    const name = history.entities.captains.find((c) => c.key === follow.captain)?.displayName;
    if (!name) return null;
    const inStory = storyOf(history, follow.captain);
    const titles = snapshotAt(history, history.range.endUtc, 'knownThen').workItems;
    const seen: string[] = [];
    for (const e of history.events as AnyTimelineEvent[]) {
      if (e.occurredAt < history.range.startUtc || !inStory(e)) continue;
      const key = e.kind.startsWith('link_pr') ? (e as AnyTimelineEvent & { kind: 'link_pr_added' }).payload.itemKey : e.entityKey;
      const t = titles.get(key);
      if (t && (t.kind === 'story' || t.kind === 'bug') && !seen.includes(t.title)) seen.push(t.title);
    }
    if (!seen.length) return `This period, ${name}'s story starts here.`;
    const shown = seen.slice(0, 2);
    const list = seen.length > 2 ? `${shown.join(', ')}, and others` : shown.join(' and ');
    return `This period, ${name} worked on ${list}.`;
  }, [follow?.captain, history]);

  // A new card arrives at the top: bring the top into view (unless the pointer is reading the list).
  // It lights nothing of its own in play (22 B5): the plates' notes mark what is playing, and its rows
  // mark the same events, so History adds no third object to the attention budget (22 B7).
  useEffect(() => {
    const list = ref.current;
    const reading = !!list?.matches(':hover');
    // Keep the present card at the top of the view, with the next few beats just above it.
    const scroller = list?.parentElement;
    const now = list?.querySelector<HTMLElement>('.history-card.is-current');
    if (!reading && scroller) {
      const above = list?.querySelector<HTMLElement>('.history-upcoming');
      const top = now ? scroller.scrollTop + now.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (above ? above.offsetHeight + 8 : 6) : 0;
      scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [current]);

  if (!pb || !history) return <p className="muted history__empty">Open a sector to see its history.</p>;
  const coming = upcoming.length > 0 && (
    <div className="history-upcoming" role="group" aria-label="Coming up">
      <span className="history-upcoming__label">Next</span>
      {upcoming.map((c) => card(c, true))}
    </div>
  );
  if (!cards.length) {
    return (
      <div className="history" ref={ref}>
        {coming}
        <p className="muted history__empty">Nothing has happened yet. Press play, and each change will arrive here.</p>
        {intro && <p className="history__intro">{intro}</p>}
      </div>
    );
  }
  return (
    <div className={`history${reduced ? ' is-still' : ''}`} ref={ref} role="list" aria-label="History" onMouseLeave={() => hoverObject(null)}>
      {coming}
      {cards.map((c) => card(c, false))}
      {intro && <p className="history__intro">{intro}</p>}
    </div>
  );

  /** One beat as a card; the ones still to come are dimmed and sit above the present. */
  function card(c: Card, next: boolean) {
    const kind = KINDS[c.kind]!;
    return (
      <button
        key={c.beat.index}
        type="button"
        role="listitem"
        data-beat={c.beat.index}
        className={next ? 'history-next' : `history-card${c.beat.index === current ? ' is-current' : ''}`}
        aria-current={c.beat.index === current ? 'step' : undefined}
        onClick={() => seekToBeat(c.beat)}
        onMouseEnter={() => hoverObject(c.objectKey)}
        onFocus={() => hoverObject(c.objectKey)}
      >
        <span
          className="history-card__icon"
          style={c.rung ? { color: hex(RUNG_COLOR[c.rung]) } : undefined}
          title={`${kind.ado} · ${kind.chart}`}
          aria-hidden="true"
        >
          {kind.glyph}
        </span>
        <span className="history-card__body">
          {c.rows.map((r) => (
            <span key={r.key} className={`history-row${!next && nowPlaying.includes(r.key) ? ' is-now' : ''}`} data-event-key={r.key}>
              <span className="history-card__text">{r.line}{r.real !== undefined && <span className="history-row__real muted" title="When it happened: story time plays it with its moment"> · at {stamp(r.real)}</span>}</span>
              {r.chart && <span className="history-row__chart metaphor">{r.chart}</span>}
            </span>
          ))}
          <span className="history-card__when mono">
            {stamp(c.beat.sourceUtc)}{c.more > 0 ? ` · ${moreText(c.more)}` : ''}
          </span>
        </span>
      </button>
    );
  }
}
