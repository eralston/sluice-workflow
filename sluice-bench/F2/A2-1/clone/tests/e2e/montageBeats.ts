// The beats that play a plate-lit montage (27 E10, 05 P-24; 27 E5c's guard), per pod label: the ISO `sourceUtc` of
// each. A montage names no crew, so its one plate is the only name it has, and every one draws a note on screen
// (`montage-names.spec.ts`). Found with scripts/pacing-ledger's `planOf` over `resolvePods({ story: true })`: the pods
// in story time, as the app plays them (block E audit; a beat story time nudged keeps its milliseconds, B-12).
// `director.test.ts` pins these lists to it, so a change to the director that moves one fails there first. Pulsar
// plays no montage (05 §6 item 4); its empty list says so. No Playwright import: the unit test reads this file too.
// Fixture data only (INV-18).
export const MONTAGE_BEATS: Record<string, string[]> = {
  'Quasar Pod': [
    '2026-09-14T22:17:00Z', '2026-09-16T17:52:00.003Z', '2026-09-16T21:01:00Z', '2026-09-16T22:27:00Z',
    '2026-09-17T18:22:00Z', '2026-09-17T18:34:00Z', '2026-09-21T18:48:00Z', '2026-09-22T20:25:00Z',
    '2026-09-22T21:52:00Z', '2026-09-23T17:32:00Z', '2026-09-24T20:19:00Z',
  ],
  'Pulsar Pod': [],
  'Convoy Planning Pod': ['2026-09-30T17:00:00Z', '2026-10-02T17:00:00Z', '2026-10-02T21:00:00Z'],
  'Harbor Pod': ['2026-10-09T21:00:00Z'],
};
