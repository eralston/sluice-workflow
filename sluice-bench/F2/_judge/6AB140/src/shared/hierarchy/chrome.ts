// The chrome vocabulary a bundle's pack gives Solar's UI (23 D5): Todo and CRM reuse the Sprints UI
// (`solarUi.ts`), so the words on its breadcrumb, player and inspector come from the pack's own level
// words (Sprint -> Week or Quarter, Area Path -> List or Territory) rather than from ADO's. SDLC's
// are the words the Sprints chain always used, so ADO mode reads the same. Pure.
import type { ScopeHistory } from '../contracts/history';
import '../packs/all';
import { DEFAULT_PACK, packById, packIdOf } from '../packs/registry';

export interface ChromeWords {
  /** The round, capitalised and in the plural: `Sprint`, `Sprints`, `Week`, `Quarter`. */
  round: string; rounds: string;
  /** The region, capitalised: `Area Path`, `List`, `Territory`. */
  region: string;
  /** The region as it reads inside a sentence or after a label: `Area path`, `List`, `Territory`. */
  regionSentence: string;
  /** The workspace level's word: `Project`, or the pack's (`Workspace`, `Pipeline`). */
  workspace: string;
  /** What a work item is called in the inspector's fact list: `Work item`, or `Item` for a pack. */
  item: string;
  /** Whether the pack has Epics to show (SDLC only). */
  hasEpic: boolean;
  /** The record the inspector can show: `ADO record`, or `record`. */
  record: string;
  /** The round pill's switch control: SDLC's team wording, or the pack's round word. */
  switchTip: string; switchLabel: string; switchLoading: string; switchTitle: string; menuTitle: string;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** The chrome words for the pack that reads `h` (none: the default pack's, i.e. the Sprints words). */
export function chromeWords(h?: Pick<ScopeHistory, 'domainPack'> | null): ChromeWords {
  const pack = packById(h ? packIdOf(h) : DEFAULT_PACK) ?? packById(DEFAULT_PACK);
  const round = pack?.words.level?.round ?? { one: 'Sprint', many: 'Sprints' };
  const region = pack?.words.level?.region?.one ?? 'Area Path';
  const sdlc = !pack || pack.id === DEFAULT_PACK;
  const r = round.one.toLowerCase();
  return {
    round: round.one, rounds: round.many, region, regionSentence: sentence(region),
    workspace: pack?.words.level?.workspace?.one ?? 'Project',
    item: sdlc ? 'Work item' : 'Item', hasEpic: sdlc, record: sdlc ? 'ADO record' : 'record',
    switchTip: sdlc ? 'Switch to another Area Path or Epic' : `Switch to another ${r}`,
    switchLabel: sdlc ? 'Switch team' : `Switch ${r}`, switchLoading: sdlc ? 'Loading teams…' : `Loading ${round.many.toLowerCase()}…`,
    switchTitle: sdlc ? 'switch team' : `switch ${r}`, menuTitle: sdlc ? 'Teams' : round.many,
  };
}
