// 14 §2.4 — the theme-neutral stage string. A v1 node's `stage` is `encodePiece(node.piece)`, so
// GraphScene keeps diffing one string per node, as in v0, and a theme's adapter decodes it into its
// art's own grammar. The string changes exactly when the look's inputs do, so numbers are
// quantised here. Pure.
//
//   v1|<role>|<signal>|c=<category>[|s=<steps>][|sh=<share>][|i=<intensity>][|pr=<open>][|pm=<slots>][|mg=<merged>][|sb=1][|vc=1][|aw=1]
//   signal := <rung>[+sketch][+step<0.00>][+deferred][+ghost][+strike][+unknown]
//
//   'v1|objective|nearing+step0.65|c=Resolved|s=nac'
//   'v1|seat|underway|c=InProgress|sh=0.50'
//   'v1|facility|underway|c=InProgress|i=0.60|pr=3'
//
// Fields are written in that order, and only when set (an empty `steps` list is `s=`). The category
// is URI-encoded. Anything the decoder doesn't fully understand is unknown: `null` (INV-11).
import type { Rung } from '../contracts/history';
import type { PieceState } from '../contracts/view';
import type { Signal } from './types';

/** Every stage this module writes starts with this. */
export const STAGE_PREFIX = 'v1|';
/** At most this many steps are drawn on a piece (14 §2.4); more are dropped from the string. */
export const MAX_STEPS = 6;
/** Share and intensity move the look in steps of this size. */
export const QUANTUM = 0.05;

const ROLES: readonly PieceState['role'][] = ['objective', 'threat', 'step', 'container', 'facility', 'attachment', 'guard', 'seat', 'agent'];
const RUNGS: readonly Rung[] = ['ready', 'underway', 'nearing', 'accomplished', 'off'];
/** The signal's flags, in written order. `step` carries its value; the rest are marks. */
const FLAGS = ['sketch', 'step', 'deferred', 'ghost', 'strike', 'unknown'] as const;
type Mark = Exclude<(typeof FLAGS)[number], 'step'>;

/** Whether a stage string is a v1 piece stage (rather than a v0 stage key). */
export function isPieceStage(stage: string): boolean {
  return stage.startsWith(STAGE_PREFIX);
}

/** The signal part: the rung, then each set flag. */
export function encodeSignal(s: Signal): string {
  let out: string = s.rung;
  for (const f of FLAGS) {
    if (f === 'step') { if (s.step !== undefined) out += `+step${clamp01(s.step).toFixed(2)}`; }
    else if (s[f]) out += `+${f}`;
  }
  return out;
}

/** The inverse of `encodeSignal`, or null for anything else. */
export function decodeSignal(text: string): Signal | null {
  const [rung, ...flags] = text.split('+');
  if (!RUNGS.includes(rung as Rung)) return null;
  const out: Signal = { rung: rung as Rung };
  let order = -1;
  for (const token of flags) {
    const name = token.startsWith('step') ? 'step' : token;
    const at = FLAGS.indexOf(name as (typeof FLAGS)[number]);
    // Once each, in written order, so one look has one string.
    if (at <= order) return null;
    order = at;
    if (name === 'step') {
      const step = unit(token.slice(4));
      if (step === null) return null;
      out.step = step;
    } else out[name as Mark] = true;
  }
  return out;
}

/** A piece's stage string. */
export function encodePiece(p: PieceState): string {
  const parts = [`v1`, p.role, encodeSignal(p.signal), `c=${encodeURIComponent(p.category)}`];
  if (p.steps) parts.push(`s=${p.steps.slice(0, MAX_STEPS).join('')}`);
  if (p.share !== undefined) parts.push(`sh=${quantise(p.share).toFixed(2)}`);
  if (p.intensity !== undefined) parts.push(`i=${quantise(p.intensity).toFixed(2)}`);
  if (p.open !== undefined) parts.push(`pr=${count(p.open)}`);
  if (p.slots !== undefined) parts.push(`pm=${count(p.slots)}`);
  if (p.merged) parts.push(`mg=${count(p.merged)}`);
  if (p.standby) parts.push('sb=1');
  if (p.vacant) parts.push('vc=1');
  if (p.vacant && p.awaiting) parts.push('aw=1');
  return parts.join('|');
}

/**
 * The piece a stage string describes, or null if it isn't one this version wrote (INV-11). Only the
 * canonical string decodes (`sh=0.37`, `pr=03` or a needless `%50` are null), so one look has one string.
 */
export function decodePiece(stage: string): PieceState | null {
  const p = parsePiece(stage);
  return p && encodePiece(p) === stage ? p : null;
}

function parsePiece(stage: string): PieceState | null {
  if (!isPieceStage(stage)) return null;
  const [, role, signalText, cat, ...rest] = stage.split('|');
  if (!ROLES.includes(role as PieceState['role']) || !signalText || !cat?.startsWith('c=')) return null;
  const signal = decodeSignal(signalText);
  if (!signal) return null;
  let category: string;
  try { category = decodeURIComponent(cat.slice(2)); } catch { return null; }
  const out: PieceState = { role: role as PieceState['role'], signal, category };
  let order = -1;
  for (const part of rest) {
    const eq = part.indexOf('=');
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    const at = FIELDS.indexOf(key as (typeof FIELDS)[number]);
    if (eq < 0 || at <= order) return null;
    order = at;
    if (key === 's') {
      if (!/^[nac]*$/.test(value) || value.length > MAX_STEPS) return null;
      out.steps = [...value] as ('n' | 'a' | 'c')[];
    } else if (key === 'sh' || key === 'i') {
      const v = unit(value);
      if (v === null) return null;
      if (key === 'sh') out.share = v; else out.intensity = v;
    } else if (key === 'sb') {
      if (value !== '1') return null; // written only when on standby, so one look has one string
      out.standby = true;
    } else if (key === 'vc') {
      if (value !== '1') return null; // written only when vacant, so one look has one string
      out.vacant = true;
    } else if (key === 'aw') {
      if (value !== '1') return null; // written only with vc=1 (decodePiece re-encodes), so one look has one string
      out.awaiting = true;
    } else {
      if (!/^\d+$/.test(value)) return null;
      if (key === 'mg') {
        if (Number(value) === 0) return null; // written only above zero, so one look has one string
        out.merged = Number(value);
      } else if (key === 'pm') out.slots = Number(value);
      else out.open = Number(value);
    }
  }
  return out;
}

/** The optional fields, in written order. */
const FIELDS = ['s', 'sh', 'i', 'pr', 'pm', 'mg', 'sb', 'vc', 'aw'] as const;

/** A number in 0..1 written with two decimals, or null. */
function unit(text: string): number | null {
  if (!/^[01]\.\d\d$/.test(text)) return null;
  const v = Number(text);
  return v <= 1 ? v : null;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const quantise = (v: number) => Math.round(clamp01(v) / QUANTUM) * QUANTUM;
const count = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
