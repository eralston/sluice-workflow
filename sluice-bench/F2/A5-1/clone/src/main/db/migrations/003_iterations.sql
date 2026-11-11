-- Sprints (decided 2026-10-07): the project's iteration tree, with each sprint's dates.
CREATE TABLE iteration_nodes (org_key TEXT, project_id TEXT, node_id INTEGER, path TEXT NOT NULL,
  start_utc INTEGER, finish_utc INTEGER, observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, project_id, node_id));
-- Work-item history cached before this held no iteration (System.IterationPath): clear it, so the
-- next sync reads each item's history again, sprints included. Configuration (favorites, settings,
-- profiles) is kept.
DELETE FROM wi_revisions;
DELETE FROM wi_updates;
DELETE FROM item_checkpoints;
DELETE FROM wi_current;
DELETE FROM scope_checkpoints;
DELETE FROM scope_members;
DELETE FROM events;
DELETE FROM links;
DELETE FROM observations;
DELETE FROM settings WHERE key LIKE 'levels:%';
