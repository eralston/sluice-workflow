// Gallery item and section shapes, shared by the v0 sections in Gallery.tsx and the v1 families in
// gallery/v1/ (13-game-design.md §4). Development only.
import type { Container } from 'pixi.js';
import type { Rung } from '../chart/art/progress';
import type { BackdropLevel } from '../chart/art/nebula';

export interface ArtView {
  readonly root: Container;
  setStage(stage: string): void;
  tick(seconds: number): void;
  destroy(): void;
  face?(dir: number): void;
  setLightFrom?(x: number, y: number): void;
  readonly marks?: Container;
  /** Celestial art takes the live paint pass; hardware stays crisp (06 §7). Defaults to hardware. */
  readonly layer?: 'celestial' | 'hardware';
}

/**
 * One step of a cell's rotation: every CYCLE_S seconds the cell moves to its next step. A step either
 * sets a stage on the cell's view, or (`make`) shows a view of its own, for variations that need a
 * new build, such as a colourway baked into a hull.
 */
export interface CycleStep {
  label: string;
  stage?: string;
  make?: () => ArtView;
  /** The rung chip to show; otherwise it comes from `stage` (09 §1). Null shows none: a look with no state. */
  rung?: Rung | null;
  note?: string;
}

export interface Item {
  id: string;
  title: string;
  note: string;
  make: () => ArtView;
  stage?: string;
  ado?: string[];
  face?: number;
  cycle?: CycleStep[];
  /** Spans two grid columns, for big hardware such as stations. */
  wide?: boolean;
}

/**
 * A cell drawn in the DOM over the gallery's canvas (the label plates, which are live DOM text on the
 * chart too): `build` fills its frame and returns its teardown. `sky` is the backdrop under it.
 */
export interface DomCell {
  id: string;
  title: string;
  note: string;
  sky: BackdropLevel | 'ink';
  build(host: HTMLElement): () => void;
}

export interface Section {
  key: string;
  title: string;
  items: Item[];
  /** DOM cells, after the art cells, each a full row. */
  dom?: DomCell[];
  sky?: BackdropLevel[];
  /** Clip each cell's art to its frame, so fire, beams and ripples never spill into a neighbour. */
  clip?: boolean;
}

/** How long each step of a cycling cell holds (decided 2026-10-10). */
export const CYCLE_S = 3;
