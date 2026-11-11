// Gallery test hooks (tests/e2e/gallery.spec.ts). Types only, shared with the e2e tsconfig.
export {};

declare global {
  interface Window {
    __starChartGallery?: { ready: Promise<void>; freeze(seconds: number): void; setBackground(level: string): void; setPaint(on: boolean): void;
      /** Bake the asteroid atlas from the procedural art (23 C7): PNG data URL and spritesheet JSON. Dev only. */
      bakeAsteroids(): { png: string; json: object };
      /** Layout check: does the drawing buffer match the canvas, and how far (CSS px) is the worst view from its frame's center? */
      alignment(): { bufferOk: boolean; resolution: number; worstPx: number; views: number };
      /** Pin every cycling cell to one step (null follows the clock again), for review copies. */
      setCycle(index: number | null): void;
      /** The longest cycle in a family: how many steps a review needs to see every variation. */
      cycleLength(family: string): number };
  }
}
