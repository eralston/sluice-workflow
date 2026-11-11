// The data source behind the chart (decided 2026-10-07): fixture or ADO. The renderer asks what the
// active source can do, never which one it is (Connect, the source picker, aside). Pure.
export type SourceMode = 'fixture' | 'ado';

export interface SourceCaps {
  /** Needs a connection (an org URL and a token) before it can list projects. */
  needsConnection: boolean;
  /** Loads by level, through a sync job (04 §5a); otherwise a bundle loads whole, at once. */
  syncsByLevel: boolean;
  /** Its objects open in ADO's web pages. */
  openInAdo: boolean;
  /** Has an area tree to pick saved Area Paths from. */
  areaTree: boolean;
  /** Projects can be "not charted yet": the galaxy offers to add more, and captions say so. */
  chartedCaption: boolean;
}

export const SOURCE_CAPS: Record<SourceMode, SourceCaps> = {
  fixture: { needsConnection: false, syncsByLevel: false, openInAdo: false, areaTree: false, chartedCaption: false },
  ado: { needsConnection: true, syncsByLevel: true, openInAdo: true, areaTree: true, chartedCaption: true },
};
