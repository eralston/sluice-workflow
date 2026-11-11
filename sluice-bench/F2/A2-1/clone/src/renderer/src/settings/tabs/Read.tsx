// Settings → How to read the chart (13 §7): one paragraph, and the guided tour's button (23 E7). The
// copy is the theme's (`ThemePack.readCopy`, 23 E6), with every noun read through terminology: what the
// chart shows comes from the chart register (the active theme's words), and what it stands for from the
// source register (the loaded bundle's pack: Sprint, User Stories, Pull Requests for SDLC). So a theme
// or pack swap rewrites the paragraph without touching this file. The bundle's own mapping names its types (W1-T1), and
// its own pack names the rest: a Todo or CRM bundle never reads in SDLC's words.
import '@shared/packs/all';
import type { ScopeHistory } from '@shared/contracts/history';
import { DEFAULT_PACK, packById, packIdOf } from '@shared/packs/registry';
import { terminology } from '@shared/engine/terminology';
import type { DomainPack, SourceWords, Terminology } from '@shared/engine/types';
import { activeTheme, themeById } from '../../theme/registry';
import { startTour } from '../../tour/tourRun';
import { useChart } from '../../store';
import { useSettings } from '../store';

/** A pack with no words of its own: terminology then answers in the engine's words. */
const NO_PACK = { id: 'none', words: { role: {}, level: {}, rung: {}, source: 'the source' } } as unknown as DomainPack;

/**
 * Both registers for a bundle and a theme's words. The source words are the bundle's own pack
 * (`packIdOf`: its `domainPack`, or the registry's default for a bundle that names none, AC-27),
 * never another pack's: a bundle naming a pack this build lacks reads in the engine's own words
 * (`packId` says which, and `known` is false). Before any bundle loads, the registry's default pack.
 */
export function readTerms(h: ScopeHistory | null, chartWords: Partial<SourceWords> | undefined): { chart: Terminology; source: Terminology; packId: string; known: boolean } {
  const packId = h ? packIdOf(h) : DEFAULT_PACK;
  const pack = packById(packId);
  const p = pack ?? NO_PACK;
  const mapping = h?.stateMapping;
  return {
    chart: terminology(p, 'chart', { chart: chartWords, mapping }),
    source: terminology(p, 'source', { mapping }),
    packId,
    known: pack !== undefined,
  };
}

export function ReadTab() {
  const history = useChart((s) => s.history);
  const paradigm = useChart((s) => s.paradigm);
  const mode = useChart((s) => s.mode);
  const theme = useSettings((s) => s.settings.theme);
  const pack = themeById(theme);
  const { chart, source, known } = readTerms(history, pack?.words);
  const sentences = (pack ?? activeTheme())?.readCopy.paragraph(chart, source) ?? [];
  const canTour = paradigm === 'solar';
  return (
    <>
      <h2 className="settings__h2">How to read the chart</h2>
      <p className="settings__read">{sentences.join(' ')}</p>
      {!known && <p className="muted small">This data names a domain this build doesn’t know, so its pieces are named in the chart’s own words.</p>}
      <h2 className="settings__h2">Guided tour</h2>
      <p className="muted small">
        A short tour plays Halcyon Reach’s Comet Pod and points at each kind of object as it appears. It uses the demo data only; nothing is read from or written to Azure DevOps.
        {mode === 'ado' && ' Your data source switches to Fixture for the tour and comes back after.'}
      </p>
      {canTour
        ? <button type="button" className="enter-link settings__tour" data-log="tour-start" onClick={() => void startTour()}>Take the tour</button>
        : <p className="muted small">The tour plays in the Solar view; this window is in a developer view. Switch back under Theme.</p>}
    </>
  );
}
