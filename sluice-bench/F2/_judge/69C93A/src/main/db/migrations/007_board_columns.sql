-- B4 (v1.3): board columns. A revision fact now holds System.BoardColumn and System.BoardColumnDone, which history
-- cached before this does not have, and the cache keeps parsed facts, not ADO's payloads (INV-16). Clearing only the
-- item checkpoints is enough: an item with no checkpoint reads as having no history cached (`Cache.checkpoint`), so
-- the next time any path touches it (a sync, a stream, a refresh) its whole history is read again and upserted over the
-- old facts. Nothing else is cleared: scopes keep their last success, members, current state, level states, derived
-- tables and team lists, so the chart draws from the old facts (work placed by state) until each item is re-read.
-- The revisions feed (04 §5c) does not serve such an item (stored rows, no checkpoint): it is read whole, per item.
DELETE FROM item_checkpoints;
