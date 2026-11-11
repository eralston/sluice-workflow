-- B1 (v1.3): the PR stat line. stats_json: PrStats (votes, pushes, threads, files; 03 §2), read beside
-- the PR record; NULL until read. Its own column, so re-reading the record never loses it. Additive:
-- nothing is cleared. A PR cached before this has NULL, which the next refresh counts as worth
-- re-reading (04 §5), so the line fills in on its own. Derived tables don't hold it, so no
-- DERIVATION_VERSION bump.
ALTER TABLE pull_requests ADD COLUMN stats_json TEXT;
