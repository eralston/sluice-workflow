-- Rebuilding a scope's derived tables deletes per entity key (cache.ts rebuildDerived), which was a
-- table scan: with a few thousand entities that is a few thousand scans per reload (decided
-- 2026-10-08). Index it. Nothing is cleared: the cached facts are unchanged by this.
CREATE INDEX IF NOT EXISTS events_entity ON events (org_key, entity_key);
