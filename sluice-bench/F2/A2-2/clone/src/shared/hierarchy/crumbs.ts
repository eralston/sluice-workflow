// The breadcrumb, as data (06 §3; pure since 2026-10-07): the galaxy, then the project, then one crumb
// per scene on the stack. A level whose vocabulary has a pill word draws as the team pill, and its name
// goes to the team's home: its own sky, or (when it passes straight through) the one scene under it.
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import { chromeWords } from './chrome';
import type { Hierarchy } from './types';

export interface CrumbEntry {
  sceneKey: string;
  scope?: { projectKey: CanonicalKey };
  label: string;
  typeLabel?: string;
  passThrough?: boolean;
}

export type CrumbLevel = { kind: 'project' } | { kind: 'entry'; index: number };

export interface Crumb {
  level: CrumbLevel;
  label: string;
  type?: string;
  glyph: string;
  /** Where its name goes: a stack index, the project (the galaxy with it selected), or nowhere (current). */
  back?: { kind: 'index'; index: number } | { kind: 'project'; projectKey: CanonicalKey };
  current: boolean;
  /** Drawn as the team pill, with this word. */
  pill?: string;
}

export function crumbsOf(stack: readonly CrumbEntry[], projects: readonly { key: CanonicalKey; name: string }[], hier: Hierarchy, h?: ScopeHistory): Crumb[] {
  const crumbs: Crumb[] = [];
  stack.forEach((entry, i) => {
    const last = i === stack.length - 1;
    const at = hier.resolve(entry.sceneKey);
    if (at?.index === 0 && entry.scope) {
      const p = projects.find((x) => x.key === entry.scope!.projectKey);
      if (p) crumbs.push({ level: { kind: 'project' }, label: p.name, type: chromeWords(h).workspace, glyph: '', back: { kind: 'project', projectKey: p.key }, current: false });
    }
    const pill = at?.def.vocab.pill?.(at.ref, h);
    // The team pill's name goes to the team's home: its sky, or (a one-member team) its system.
    const home = pill && entry.passThrough ? i + 1 : i;
    crumbs.push({
      level: { kind: 'entry', index: i }, label: entry.label, type: entry.typeLabel, glyph: at ? at.def.vocab.glyph(at.ref) : '',
      ...(pill ? { pill } : {}),
      back: home < stack.length - 1 ? { kind: 'index', index: home } : undefined, current: last,
    });
  });
  return crumbs;
}
