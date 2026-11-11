import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AreaFavorite, AreaNodeView, EpicSummary, IterationSummary } from '@shared/contracts/ipc';
import type { EvidenceRef } from '@shared/contracts/events';
import { keyKind, workItemId, type CanonicalKey } from '@shared/contracts/keys';
import type { Snapshot, ViewNode } from '@shared/contracts/view';
import { addable, enter, loadChooser, openSector, removable, removeFromView, setCaptainPicture } from '../nav';
import { Busy, useBusy } from './Busy';
import { useChart } from '../store';
import { explainStage, keyKinds, kindLine, kindNames, type Named } from '../vocab';
import { roleOfKey } from '@shared/engine/moves';
import { identityLine } from '@shared/identity';
import { featureName } from '@shared/featureRow';
import { prStatLine } from '@shared/prStat';
import { runAsOf, runLine } from '@shared/runLine';
import { follow, unfollow } from '../playback';
import { activeHierarchy } from '../hierarchy';
import { uiFor } from '../hierarchy/registry';
import { isRootScene } from '@shared/hierarchy/sceneKey';
import { useCaps } from '../data/caps';
import { currentSprint, sprintDates, sprintScope } from '../hierarchy/sprintsUi';
import { resolveSignal } from '@shared/engine/signal';
import { RUNG_COLOR } from '../chart/art/progress';
import { RUNG_MARK } from '../chart/holo/holoRows';
import { AddPicker } from './AddPicker';
import { starCounts, termsFor } from '../v1/lines';
import { seatReason } from '@shared/engine/facts';
import { solarSource } from '@shared/hierarchy/solarSource';
import { chromeWords } from '@shared/hierarchy/chrome';
import { PICTURE_WHY } from './pictureWhy';

function fmt(at: number | null): string {
  if (at === null) return 'time unknown';
  return new Date(at).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

/** The selected thing's kind in both layers (22 B1), for every body's `Head`. */
const KindOf = createContext<Named>({ ado: '', metaphor: '' });

/**
 * Every body opens the same way (22 B3, R12): the title, then its identity line (`User Story · #1234 ·
 * Active`) with the chart's name for it after, quieter (`asteroid`).
 */
function Head({ title, id, status }: { title: string; id?: number | string; status?: string }) {
  const kind = useContext(KindOf);
  return (
    <>
      <h2 className="inspector__title">{title}</h2>
      <p className="inspector__kind">
        {identityLine(kind.ado, id, status)}
        {kind.metaphor && <span className="metaphor"> · {kind.metaphor.toLowerCase()}</span>}
      </p>
    </>
  );
}

export function Inspector() {
  const { graph, selectedKey, history, debug, paradigm } = useChart();
  const node = graph?.nodes.find((n) => n.canonicalKey === selectedKey && n.selectable)
    ?? graph?.nodes.find((n) => n.canonicalKey === selectedKey);
  if (!node || !selectedKey) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <p className="inspector__empty">
          {isRootScene(graph?.sceneKey)
            ? 'Select a project to choose an Area Path or Epic.'
            : `Select an object to inspect its ${chromeWords(history).record}. Press K for the map key.`}
        </p>
        <RoundAdd />
      </aside>
    );
  }
  const kind = keyKind(selectedKey);
  return (
    <aside className="inspector" aria-label="Inspector" aria-live="polite">
      <KindOf.Provider value={kindLine([node, ...(graph?.nodes ?? []).filter((n) => n !== node && n.canonicalKey === selectedKey && n.selectable)], paradigm)}>
      {kind === 'proj' && <ProjectBody node={node} />}
      {kind === 'area' && <PodBody node={node} />}
      {kind === 'wi' && <WorkItemBody node={node} />}
      {kind === 'wi' && <LooksLike stage={node.stage} mapping={history?.stateMapping ?? null} />}
      {kind === 'repo' && <RepoBody node={node} />}
      {kind === 'pr' && <PrBody node={node} />}
      {kind === 'id' && <CaptainBody node={node} />}
      </KindOf.Provider>
      {/* Keys are for diagnosing, not reading: they show only in map debug (D). */}
      {debug && (
        <dl className="facts">
          <dt>Canonical key</dt><dd className="mono wrap">{node.canonicalKey}</dd>
          <dt>Projection key</dt><dd className="mono wrap">{node.projectionKey}</dd>
        </dl>
      )}
      {node.evidence.length > 0 && <Evidence items={node.evidence} />}
      {kind !== 'proj' && kind !== 'id' && kind !== 'area' && (
        <>
          <button type="button" className="ado-link" disabled={!node.openable} onClick={() => void window.starChart.openInAdo(node.canonicalKey)}>
            Open in Azure DevOps
          </button>
          {!node.openable && <p className="muted small">Disabled in fixture mode: synthetic items have no ADO record.</p>}
        </>
      )}
    </aside>
  );
}

/** Sprints mode (decided 2026-10-07): the project's sprints, newest first; each opens through its pods. */
function SprintList({ projectKey, favorites, sprints }: { projectKey: CanonicalKey; favorites: AreaFavorite[]; sprints: IterationSummary[] | null }) {
  // The galaxy has no pack of its own: the open bundle's, when it is this project's (23 D5).
  const open = useChart((s) => s.history);
  const pack = useChart((s) => s.projects.find((p) => p.key === projectKey)?.pack);
  // The open bundle's pack, else the project's own (fixture mode names it; ADO projects are SDLC).
  const history = open && open.scope.projectKey === projectKey ? open : pack ? { domainPack: pack } : null;
  const pods = favorites.filter((f) => !f.unavailable);
  const current = sprints ? currentSprint(sprints) : undefined;
  return (
    <>
      <h3 className="inspector__h3">◷ {chromeWords(history).rounds}</h3>
      {!sprints && <Busy label={`Loading ${chromeWords(history).rounds.toLowerCase()}…`} />}
      <ul className="chooser">
        {(sprints ?? []).map((s) => (
          <li key={s.key}>
            <button type="button" disabled={!pods.length} onClick={() => void openSector(sprintScope(projectKey, s, favorites), s.label)}>
              <span>{s.label}{s.key === current?.key ? <span className="muted"> · current</span> : null}</span><span className="muted mono">{sprintDates(s)}</span>
            </button>
          </li>
        ))}
        {sprints && sprints.length === 0 && <li className="muted small">No {chromeWords(history).rounds.toLowerCase()} with dates in this project’s {chromeWords(history).rounds === 'Sprints' ? 'iteration tree' : 'list'}.</li>}
        {sprints && sprints.length > 0 && !pods.length && <li className="muted small">Save {chromeWords(history).rounds === 'Sprints' ? 'an Area Path' : `a ${chromeWords(history).region.toLowerCase()}`} below to see a {chromeWords(history).round.toLowerCase()} through it.</li>}
      </ul>
    </>
  );
}

/** A pod (Sprints mode): an Area Path's share of the sprint. Not a work item, so nothing to open in ADO. */
function PodBody({ node }: { node: ViewNode }) {
  const history = useChart((s) => s.history);
  const words = node.zoomTo ? activeHierarchy().resolve(node.zoomTo)?.def.vocab.enter : undefined;
  return (
    <>
      {/* Under Solar the plate shows the pod's name and counts; the inspector adds its full path and the
          done count (19 Q11; 22 A4), the counts in ADO's words (22 B1). */}
      <Head title={node.label} status={node.roleCounts && history ? starCounts(history, node.roleCounts, true) : node.detail ?? node.meta} />
      {node.path && (
        <dl className="facts">
          <dt>{chromeWords(history).regionSentence}</dt><dd>{node.path}</dd>
        </dl>
      )}
      {node.features && node.features.length > 0 && <PodFeatures features={node.features} />}
      {node.zoomTo && words && (
        <button type="button" className="enter-link" onClick={() => enter(node.zoomTo!, node)}>{words.ado(node.typeName, history ?? undefined)}</button>
      )}
      <p className="looks-like"><span className="muted">On the chart:</span> the star shows how far this {chromeWords(history).region === 'Area Path' ? 'pod' : chromeWords(history).region.toLowerCase()}’s share of the {chromeWords(history).round.toLowerCase()} has come, on the signal ladder.</p>
      <RemoveFromView node={node} />
    </>
  );
}

/** The pod's Features (B3, R3/R12; 27 B2): every one, ADO's name first. The Inspector shows while the star is selected, and then its plate shows the open list too. */
function PodFeatures({ features }: { features: NonNullable<ViewNode['features']> }) {
  return (
    <dl className="facts pod-features" data-testid="pod-features">
      <dt>Features</dt>
      <dd>
        <ul className="pod-features__list">
          {features.map((f) => <li key={f.key} data-key={f.key}>{featureName(f)}<span className="muted"> · {f.count}</span></li>)}
        </ul>
      </dd>
    </dl>
  );
}

/**
 * Remove from View (19 N1, R2), where the object is selected: the ▾ menus' removal. A galaxy unpins
 * its project; a pod star in the round unsaves its Area Path, so it leaves every sprint. It Departs.
 * A view change only, never written to ADO (INV-21). ADO mode only (`removable`).
 */
function RemoveFromView({ node }: { node: ViewNode }) {
  useCaps(); // re-render on a source switch
  useChart((s) => s.projects.length); // and as the last project comes and goes
  const [busy, setBusy] = useState(false);
  const what = removable(node.canonicalKey);
  if (!what) return null;
  const last = what.kind === 'project' && what.last;
  const run = () => {
    setBusy(true);
    void removeFromView(node.canonicalKey).finally(() => setBusy(false));
  };
  return (
    <div className="remove-view">
      <button type="button" className="enter-link enter-link--quiet" disabled={last || busy} onClick={run} data-log="remove-from-view"
        data-tip={what.kind === 'project' ? 'Unpin this project: its galaxy leaves the chart' : 'Unsave this Area Path: its pod leaves every sprint'}
        data-tip-keys="Nothing changes in Azure DevOps · add it back with +">
        Remove from View
      </button>
      <p className="muted small remove-view__why">
        {last
          ? 'The last project stays in view: without one, the chart is the empty cosmos.'
          : 'Changes this view only. Nothing changes in Azure DevOps.'}
      </p>
    </div>
  );
}

/**
 * The round with nothing selected (19 N1): + Add an Area Path, the + crumb's picker opened here, above
 * the button. ADO mode only (`addable`); a sprint's pods only, the set the round is drawn from.
 */
function RoundAdd() {
  useCaps();
  const sector = useChart((s) => s.stack.at(-1)?.scope?.sector.kind);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const what = addable();
  if (what?.kind !== 'area' || sector !== 'sprint') return null;
  const toggle = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAt(at ? null : { x: Math.max(8, r.right - 340), y: window.innerHeight - r.top + 4 });
  };
  return (
    <>
      <button type="button" className="enter-link enter-link--quiet" aria-haspopup="dialog" aria-expanded={Boolean(at)} data-log="inspector-add"
        data-tip="Add an Area Path" data-tip-keys="Saved for this project: a pod in every sprint"
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => toggle(e.currentTarget)}>
        + Add an Area Path
      </button>
      {/* To the body: the inspector's backdrop blur would make it the fixed picker's containing block. */}
      {at && createPortal(<AddPicker what={what} x={at.x} y={at.y} up onClose={() => setAt(null)} />, document.body)}
    </>
  );
}

/** Teaches the metaphor in context: what this look is and what it means in ADO. */
function LooksLike({ stage, mapping }: { stage: string; mapping: Parameters<typeof explainStage>[1] }) {
  const e = explainStage(stage, mapping);
  if (!e) return null;
  return <p className="looks-like"><span className="muted">On the chart:</span> {e.look}</p>;
}

function ProjectBody({ node }: { node: ViewNode }) {
  const chooser = useChart((s) => s.chooser);
  const { areaTree } = useCaps();
  const ready = chooser?.projectKey === node.canonicalKey;
  // ADO mode: favorites are the user's own (AC-32). Repairing one points it at another area.
  const [picking, setPicking] = useState<{ repair?: AreaFavorite; thenOpen?: boolean } | null>(null);
  const reload = () => loadChooser(node.canonicalKey);
  const favorites = ready ? [...chooser.favorites].sort((a, b) => a.displayOrder - b.displayOrder) : [];
  const save = async (area: AreaNodeView) => {
    const repair = picking?.repair;
    if (repair) await window.starChart.favorites.remove(repair.areaKey);
    const order = repair ? repair.displayOrder : Math.max(-1, ...favorites.map((f) => f.displayOrder)) + 1;
    await window.starChart.favorites.save({ areaKey: area.areaKey, projectKey: area.projectKey, path: area.path, label: area.label, displayOrder: order, unavailable: false });
    const thenOpen = picking?.thenOpen;
    setPicking(null);
    await reload();
    if (thenOpen) await openSector({ projectKey: area.projectKey, sector: { kind: 'area', areaKey: area.areaKey, path: area.path } }, area.label);
  };
  const sprintsMode = useChart((s) => uiFor(s.paradigm).chooser === 'sprints'); // its project plate's lists
  return (
    <>
      <Head title={node.label} />
      <p className="muted">{node.meta}</p>
      <RemoveFromView node={node} />
      {sprintsMode && <SprintList projectKey={node.canonicalKey} favorites={favorites} sprints={ready ? chooser.sprints ?? [] : null} />}
      <h3 className="inspector__h3">◇ {sprintsMode ? 'Pods · saved Area Paths' : 'Saved Area Paths'}</h3>
      {!ready && <Busy label="Loading saved Area Paths and Epics…" />}
      <ul className="chooser">
        {favorites.map((f) => (
          <li key={f.areaKey} className={f.unavailable ? 'chooser__item--unavailable' : undefined}>
            <button type="button" disabled={f.unavailable || sprintsMode} onClick={() => void openSector({ projectKey: f.projectKey, sector: { kind: 'area', areaKey: f.areaKey, path: f.path } }, f.label)}>
              <span>{f.label}</span><span className="muted mono">{f.unavailable ? 'Unavailable: this area no longer resolves' : f.path}</span>
            </button>
            {areaTree && (
              <span className="chooser__tools">
                {f.unavailable && <button type="button" className="connect__link" onClick={() => setPicking({ repair: f })}>Repair</button>}
                <button type="button" className="connect__link" aria-label={`Remove ${f.label}`} onClick={() => void window.starChart.favorites.remove(f.areaKey).then(reload)}>Remove</button>
              </span>
            )}
          </li>
        ))}
        {ready && favorites.length === 0 && <li className="muted small">No saved Area Paths yet.</li>}
      </ul>
      {areaTree && ready && (picking
        ? <AreaPicker projectKey={node.canonicalKey} repairing={picking.repair?.label} onPick={(a) => void save(a)} onCancel={() => setPicking(null)} taken={new Set(favorites.map((f) => f.areaKey))} />
        : <button type="button" className="connect__link" onClick={() => setPicking({})}>+ Save an Area Path</button>)}
      {!sprintsMode && <>
      <h3 className="inspector__h3">⬡ Epics</h3>
      <ul className="chooser">
        {ready && chooser.epics.map((e) => (
          <li key={e.key}>
            <button type="button" onClick={() => void openSector({ projectKey: node.canonicalKey, sector: { kind: 'epic', epicKey: e.key } }, e.title)}>
              <span>{e.title}</span><span className="muted mono">#{e.id} · {e.featureCount} Features</span>
            </button>
          </li>
        ))}
      </ul>
      {ready && <EpicSearch projectKey={node.canonicalKey} />}
      </>}
    </>
  );
}

/** The project's area tree (ADO mode), filtered as you type. */
function AreaPicker({ projectKey, repairing, taken, onPick, onCancel }: { projectKey: CanonicalKey; repairing?: string; taken: Set<string>; onPick: (a: AreaNodeView) => void; onCancel: () => void }) {
  const [nodes, setNodes] = useState<AreaNodeView[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.starChart.areas.tree(projectKey).then((n) => { if (live) setNodes(n); }, (e) => { if (live) setError(String(e)); });
    const off = window.starChart.onChooserChanged((e) => {
      if (e.projectKey === projectKey && e.what === 'areas') window.starChart.areas.tree(projectKey).then((n) => { if (live) setNodes(n); }, () => undefined);
    });
    return () => { live = false; off(); };
  }, [projectKey]);
  const shown = (nodes ?? []).filter((n) => n.depth > 0 && n.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="area-picker">
      <div className="area-picker__head">
        <span className="small">{repairing ? `Point “${repairing}” at:` : 'Pick an Area Path (a team) to open and save:'}</span>
        <button type="button" className="connect__link" onClick={onCancel}>Cancel</button>
      </div>
      <input type="search" placeholder="Filter areas" aria-label="Filter areas" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {error && <p className="small connect__msg connect__msg--error">Couldn’t read the area tree.</p>}
      {!nodes && !error && <Busy label="Reading Area Paths…" />}
      <ul className="chooser area-picker__list" role="listbox" aria-label="Areas">
        {shown.map((n) => (
          <li key={n.areaKey}>
            <button type="button" disabled={taken.has(n.areaKey)} style={{ paddingLeft: 9 + (n.depth - 1) * 12 }} onClick={() => onPick(n)}>
              <span>{n.label}</span><span className="muted mono">{taken.has(n.areaKey) ? 'saved' : n.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Find an Epic by ID or title (04 §3), to open its sector. */
function EpicSearch({ projectKey }: { projectKey: CanonicalKey }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<EpicSummary[] | null>(null);
  const { busy, run } = useBusy();
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    void run('search', window.starChart.epics.search(projectKey, q)).then(setFound, () => setFound([]));
  };
  return (
    <form className="epic-search" onSubmit={search}>
      <input type="search" placeholder="Find an Epic by ID or title" aria-label="Find an Epic" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setFound(null); }} />
      {busy === 'search' && <Busy label="Searching Epics…" />}
      {found && busy !== 'search' && (
        <ul className="chooser">
          {found.map((e) => (
            <li key={e.key}>
              <button type="button" onClick={() => void openSector({ projectKey, sector: { kind: 'epic', epicKey: e.key } }, e.title)}>
                <span>{e.title}</span><span className="muted mono">#{e.id} · {e.featureCount} Features</span>
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="muted small">No Epic found.</li>}
        </ul>
      )}
    </form>
  );
}

function WorkItemBody({ node }: { node: ViewNode }) {
  const { snapshot, history } = useChart();
  const words = chromeWords(history);
  const wi = snapshot?.workItems.get(node.canonicalKey);
  if (!wi) return <Head title={node.label} />;
  const captain = wi.assigneeKey ? history?.entities.captains.find((c) => c.key === wi.assigneeKey) : undefined;
  const epic = snapshot ? ancestorOfKind(snapshot, wi.key, 'epic') : undefined;
  return (
    <>
      <Head title={wi.title} id={workItemId(wi.key)} status={wi.rawState} />
      <div className="state-chip" data-category={wi.category}>
        <span className="state-chip__raw">{wi.rawState}</span>
        <span className="state-chip__cat">{wi.category}</span>
        {wi.reopened && <span className="state-chip__flag">Reopened</span>}
      </div>
      {node.zoomTo && (
        <button type="button" className="enter-link" onClick={() => enter(node.zoomTo!, node)}>
          {(() => {
            // The words for entering come from the level it opens (06 §4 learnability).
            const enterWords = activeHierarchy().resolve(node.zoomTo)?.def.vocab.enter;
            if (!enterWords) return 'Open ›';
            return enterWords.ado(node.typeName, history ?? undefined);
          })()}
        </button>
      )}
      <dl className="facts">
        <dt>{words.item}</dt><dd>#{workItemId(wi.key)}</dd>
        <dt>Type</dt><dd>{wi.type}</dd>
        <dt>State</dt><dd>{wi.rawState} <span className="muted">({wi.category})</span></dd>
        <dt>Visual stage</dt><dd className="mono">{wi.stage}</dd>
        <dt>{words.regionSentence}</dt><dd>{wi.areaPath}</dd>
        {words.hasEpic && <><dt>Epic</dt><dd>{epic ? <>{epic.title} <span className="muted">#{workItemId(epic.key)}</span></> : <span className="muted">None</span>}</dd></>}
        <dt>Assigned to</dt>
        <dd>{captain ? <>{captain.displayName} <span className="muted">· {captain.callSign}</span></> : <span className="muted">Unassigned</span>}</dd>
      </dl>
      {node.stepKeys && snapshot && history && <StepList keys={node.stepKeys} snapshot={snapshot} mapping={history.stateMapping} />}
    </>
  );
}

/**
 * A solar piece's steps (19 L7: the chart's own list of them is gone), in slot order: each Task by
 * name with its raw state (INV-11) and its rung's mark, a shape per rung so it never rests on colour.
 */
function StepList({ keys, snapshot, mapping }: { keys: readonly CanonicalKey[]; snapshot: Snapshot; mapping: Parameters<typeof resolveSignal>[0] }) {
  const history = useChart((s) => s.history);
  const steps = keys.map((k) => snapshot.workItems.get(k)).filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (!steps.length) return null;
  return (
    <>
      <h3 className="inspector__h3">{steps[0]!.type}s{history && <span className="metaphor"> · {termsFor(history, 'chart').noun('step', 2)}</span>}</h3>
      <ul className="evidence steps">
        {steps.map((w) => {
          const rung = resolveSignal(mapping, w.type, w.rawState).rung;
          return (
            <li key={w.key} data-rung={rung}>
              <span className="steps__mark" style={{ color: `#${RUNG_COLOR[rung].toString(16).padStart(6, '0')}` }} aria-hidden="true">{RUNG_MARK[rung]}</span>
              {' '}{w.title} <span className="muted">{w.rawState}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Component impact (journey 3): work connected to this repo, direct vs through a Task. */
function RepoBody({ node }: { node: ViewNode }) {
  const { snapshot, history } = useChart();
  if (!snapshot || !history) return <Head title={node.label} />;
  const prs = [...snapshot.prs.values()].filter((p) => p.repoKey === node.canonicalKey);
  const direct = new Set<CanonicalKey>();
  const inherited = new Set<CanonicalKey>();
  for (const l of snapshot.links) {
    if (l.kind !== 'pr' || !prs.some((p) => p.key === l.fromKey)) continue;
    direct.add(l.toKey);
    for (let k = snapshot.workItems.get(l.toKey)?.parentKey; k; k = snapshot.workItems.get(k)?.parentKey) inherited.add(k);
  }
  // B2: the same line as the station plate's (15 §6 `run-line`): the latest run on the default branch, as of the last sync.
  const run = history.entities.repos.find((r) => r.key === node.canonicalKey)?.run;
  return (
    <>
      <Head title={node.label} status={`${prs.length} PR${prs.length === 1 ? '' : 's'} in this scope`} />
      {run && <dl className="facts"><dt>Pipeline</dt><dd className="run-line" data-state={run.state}>{runLine(run, runAsOf(run, history.coverage.syncedAt ?? history.range.endUtc))}</dd></dl>}
      <ItemList title="Linked directly" keys={[...direct]} snapshot={snapshot} />
      <ItemList title="Through hierarchy" keys={[...inherited].filter((k) => !direct.has(k))} snapshot={snapshot} />
    </>
  );
}

function PrBody({ node }: { node: ViewNode }) {
  const { snapshot, history } = useChart();
  const pr = snapshot?.prs.get(node.canonicalKey);
  if (!pr || !snapshot || !history) return <Head title={node.label} />;
  const author = pr.authorKey ? history.entities.captains.find((c) => c.key === pr.authorKey) : undefined;
  const repo = history.entities.repos.find((r) => r.key === pr.repoKey);
  const linked = snapshot.links.filter((l) => l.kind === 'pr' && l.fromKey === pr.key).map((l) => l.toKey);
  // B1: the same line as the station plate's row (15 §6 `pr-stat`), read now.
  const stat = prStatLine(history.entities.prs.find((p) => p.key === pr.key)?.stats);
  return (
    <>
      <Head title={pr.title} id={pr.key.slice(pr.key.lastIndexOf(':') + 1)} status={pr.status} />
      <dl className="facts">
        <dt>Repository</dt><dd>{repo?.name}</dd>
        <dt>Author</dt><dd>{author ? <>{author.displayName} <span className="muted">· {author.callSign}</span></> : <span className="muted">Unknown</span>}</dd>
        {stat && <><dt>Review</dt><dd className="pr-stat">{stat}</dd></>}
      </dl>
      <p className="muted small">Completed means merged into its target branch. It doesn't close work or mean deployed.</p>
      <ItemList title="Linked work items" keys={linked} snapshot={snapshot} />
    </>
  );
}

function CaptainBody({ node }: { node: ViewNode }) {
  const { snapshot, history, follow: followed, paradigm } = useChart();
  const c = history?.entities.captains.find((x) => x.key === node.canonicalKey);
  const following = followed?.captain === node.canonicalKey && !followed.suspended;
  if (!c || !snapshot) return <Head title={node.label} />;
  const assigned = [...snapshot.workItems.values()].filter((w) => w.assigneeKey === c.key).map((w) => w.key);
  const authored = [...snapshot.prs.values()].filter((p) => p.authorKey === c.key);
  const prWord = paradigm === 'solar' && history ? termsFor(history, 'chart').noun('attachment', 1) : kindNames('flight', paradigm)!.chart.toLowerCase();
  return (
    <>
      <Head title={c.displayName} />
      <p className="muted">Call sign {c.callSign}</p>
      <PictureControls captain={c} />
      {following ? (
        <button type="button" className="enter-link" onClick={unfollow}>Unfollow</button>
      ) : (
        <button type="button" className="enter-link" onClick={() => follow(c.key)}>Follow</button>
      )}
      <SeatWhy person={c.key} />
      <ItemList title="Assigned (recorded assignment, not activity)" keys={assigned} snapshot={snapshot} />
      <h3 className="inspector__h3">Authored PRs</h3>
      <ul className="evidence">
        {authored.map((p) => (
          <li key={p.key} className="item-row">
            <span className="item-row__title">{p.title}</span>
            <span className="item-row__id muted">{identityLine('PR', p.key.slice(p.key.lastIndexOf(':') + 1), p.status)}<span className="metaphor"> · {prWord}</span></span>
          </li>
        ))}
        {authored.length === 0 && <li className="muted">None in this scope</li>}
      </ul>
    </>
  );
}

/**
 * Why this person's homeworld is on the board (22 A2): a planet stands for work held in the region this
 * round (`seatReason`), so it says what that is now, or what it was and what became of it. Inside a
 * solar region only; a person with no planet there gets nothing.
 */
function SeatWhy({ person }: { person: CanonicalKey }) {
  const { graph, history, snapshot } = useChart();
  const star = graph?.solar ? graph.nodes.find((n) => n.kind === 'star') : undefined;
  if (!star || !history || !snapshot) return null;
  const r = seatReason(solarSource.facts(history, { level: 'pod', key: star.canonicalKey }), person, snapshot.atUtc);
  if (!r) return null;
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const item = (key: CanonicalKey) => {
    const wi = snapshot.workItems.get(key);
    return { name: `#${workItemId(key)}${wi ? ` · ${wi.title}` : ''}`, wi };
  };
  const here = `this ${chromeWords(history).region.toLowerCase()}`;
  let text: string;
  if (r.kind === 'holds') text = `Holds ${r.count} item${r.count === 1 ? '' : 's'} in ${here} now.`;
  else if (r.kind === 'later') text = `Holds work here from ${day(r.from)}: ${item(r.key).name}.`;
  else {
    const { name, wi } = item(r.key);
    const where = wi && star.path && wi.areaPath !== star.path ? `, now in ${wi.areaPath.slice(wi.areaPath.lastIndexOf('\\') + 1)}`
      : wi?.iterationPath && history.scope.sector.kind === 'sprint' && wi.iterationPath !== history.scope.sector.path ? `, now in ${wi.iterationPath.slice(wi.iterationPath.lastIndexOf('\\') + 1)}` : '';
    const to = r.to ? history.entities.captains.find((x) => x.key === r.to)?.displayName : undefined;
    const what = r.why === 'handed' ? `handed to ${to ?? 'someone else'}` : r.why === 'unassigned' ? 'unassigned' : r.why === 'off' ? 'set aside' : `moved out${where}`;
    text = `Held ${name} until ${day(r.until)}, then ${what}. Nothing held here now.`;
  }
  return (
    <>
      <h3 className="inspector__h3">In this {chromeWords(history).region}<span className="metaphor"> · homeworld</span></h3>
      <p className="muted seat-why">{text}</p>
    </>
  );
}

/** Add, change or remove a teammate's picture by hand (slice 6, 91): ADO often won't give ours to read. */
function PictureControls({ captain }: { captain: { key: CanonicalKey; avatar?: string; handAdded?: boolean } }) {
  const mode = useChart((s) => s.mode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (mode !== 'ado') return null; // fixtures carry their own invented pictures
  const run = async (action: 'add' | 'remove') => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setCaptainPicture(captain.key, action);
      if (!r.ok) setMsg(PICTURE_WHY[r.reason ?? 'unreadable']);
    } catch {
      setMsg(PICTURE_WHY.unreadable);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="picture-controls">
      <button type="button" className="enter-link" disabled={busy} onClick={() => void run('add')}
        data-tip="Choose a picture from your Mac" data-tip-keys="It is kept on this Mac only, and survives Purge">
        {captain.handAdded ? 'Change picture…' : captain.avatar ? 'Use my own picture…' : 'Add picture…'}
      </button>
      {captain.handAdded && <button type="button" className="enter-link" disabled={busy} onClick={() => void run('remove')}>Remove picture</button>}
      {msg && <p className="muted picture-controls__msg" role="status">{msg}</p>}
    </div>
  );
}

/**
 * A work item's chart name (22 B3): under Solar its role's word in the theme (an asteroid, an enemy
 * ship), so another process's types read too; under v0 the kind its ADO type draws as (a planet).
 */
function useMetaphorOf(): (key: CanonicalKey, type: string) => string | undefined {
  const { history, paradigm } = useChart();
  return (key, type) => {
    if (paradigm === 'solar' && history) {
      const role = roleOfKey(history, key);
      return role && role !== 'container' ? termsFor(history, 'chart').noun(role, 1) : undefined; // containers aren't drawn (12 §3)
    }
    const kind = keyKinds(paradigm).find((k) => kindNames(k, paradigm)?.ado === type);
    return kind ? kindNames(kind, paradigm)!.chart.toLowerCase() : undefined;
  };
}

/** A list of work items (22 B3): each its title, then its identity line and its chart name, quieter. */
function ItemList({ title, keys, snapshot }: { title: string; keys: CanonicalKey[]; snapshot: Snapshot }) {
  const metaphorOf = useMetaphorOf();
  const rows: ReactNode[] = keys
    .map((k) => snapshot.workItems.get(k))
    .filter((w): w is NonNullable<typeof w> => Boolean(w))
    .sort((a, b) => workItemId(a.key) - workItemId(b.key))
    .map((w) => {
      const metaphor = metaphorOf(w.key, w.type);
      return (
        <li key={w.key} className="item-row">
          <span className="item-row__title">{w.title}</span>
          <span className="item-row__id muted">{identityLine(w.type, workItemId(w.key), w.rawState)}{metaphor && <span className="metaphor"> · {metaphor}</span>}</span>
        </li>
      );
    });
  return (
    <>
      <h3 className="inspector__h3">{title}</h3>
      <ul className="evidence">{rows.length ? rows : <li className="muted">None</li>}</ul>
    </>
  );
}

function Evidence({ items }: { items: EvidenceRef[] }) {
  return (
    <>
      <h3 className="inspector__h3">Evidence</h3>
      <ul className="evidence">
        {items.map((e) => (
          <li key={e.ref}><span className="mono">{e.ref}</span> <span className="muted">{e.source} · {fmt(e.at)}</span></li>
        ))}
      </ul>
    </>
  );
}

function ancestorOfKind(s: Snapshot, key: CanonicalKey, kind: string) {
  for (let k = s.workItems.get(key)?.parentKey; k; k = s.workItems.get(k)?.parentKey) {
    const w = s.workItems.get(k);
    if (w?.kind === kind) return w;
  }
  return undefined;
}
