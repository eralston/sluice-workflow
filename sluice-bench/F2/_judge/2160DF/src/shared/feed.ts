// 04 §5c — the project-wide revisions feed (v1.3 B5). Constants (15 §10 budgets). Pure.

/** A batch of history reads at or above this many items goes through the feed; below it, per item. */
export const FEED_THRESHOLD = 300;
/** `$maxPageSize` asked of the feed (ADO's own default is lower; an unverified hint, 04 §5c). */
export const FEED_PAGE = 500;
/** At most this many pages in one run, across all its batches (full sync, catch-up, a stream's fill); the continuation token is kept and the next run resumes. */
export const FEED_MAX_PAGES = 40;
/** A crawl starts this long before an item's watermark (the newest ChangedDate its last crawl saw, server time), because the feed lags the work item store. */
export const FEED_OVERLAP_MS = 3_600_000;
/** Rows a run's crawl keeps in memory for its later batches (04 §5c); past it a later batch falls back to per-item reads. */
export const FEED_BUFFER_ROWS = 100_000;
/** The fields asked of the feed: what `parseRevision` reads (System.Id, Rev and ChangedDate come regardless). */
export const FEED_FIELDS = [
  'System.Id', 'System.Rev', 'System.ChangedDate', 'System.CreatedDate', 'System.ChangedBy', 'System.WorkItemType', 'System.Title', 'System.State',
  'System.AreaPath', 'System.IterationPath', 'System.TeamProject', 'System.AssignedTo', 'System.BoardColumn', 'System.BoardColumnDone',
] as const;
