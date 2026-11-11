-- 03 §9 — SQLite schema v1. Source tables hold facts (03 §2 shapes only, never whole payloads);
-- derived tables are rebuilt wholesale per scope, and when meta.derivation_version changes.
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- source
CREATE TABLE projects (org_key TEXT, project_id TEXT, name TEXT NOT NULL, ado_url TEXT NOT NULL,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, project_id));
CREATE TABLE area_nodes (org_key TEXT, project_id TEXT, node_id INTEGER, path TEXT NOT NULL,
  has_children INTEGER NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, project_id, node_id));
-- image_url: the identity ref's picture link; avatar: its inline data URL, '' for none, NULL until fetched
CREATE TABLE identities (org_key TEXT, identity_id TEXT, display_name TEXT NOT NULL, unique_name TEXT,
  image_url TEXT, avatar TEXT,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, identity_id));
CREATE TABLE wi_revisions (org_key TEXT, item_id INTEGER, rev INTEGER, changed_at INTEGER NOT NULL,
  project_id TEXT NOT NULL, fact_json TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (org_key, item_id, rev));
CREATE TABLE wi_updates (org_key TEXT, item_id INTEGER, update_id INTEGER, rev INTEGER,
  source_at INTEGER, fact_json TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (org_key, item_id, update_id));
-- relations_json: RelationFact[] from hydrate; ado_url: the item's web link, when ADO gives one
CREATE TABLE wi_current_relations (org_key TEXT, item_id INTEGER, relations_json TEXT NOT NULL,
  ado_url TEXT NOT NULL DEFAULT '',
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, item_id));
CREATE TABLE repositories (org_key TEXT, repo_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL,
  ado_url TEXT NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, repo_id));
-- approvers_json: identity IDs whose vote stood approved at completion (04 §6a); NULL until read
CREATE TABLE pull_requests (org_key TEXT, repo_id TEXT, pr_id INTEGER, fact_json TEXT NOT NULL,
  approvers_json TEXT,
  observed_at INTEGER NOT NULL, PRIMARY KEY (org_key, repo_id, pr_id));
CREATE TABLE pr_observations (org_key TEXT, repo_id TEXT, pr_id INTEGER, observed_at INTEGER,
  status TEXT NOT NULL, PRIMARY KEY (org_key, repo_id, pr_id, observed_at));
-- sync state
CREATE TABLE item_checkpoints (org_key TEXT, item_id INTEGER, last_rev INTEGER NOT NULL DEFAULT 0,
  last_update_id INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER, PRIMARY KEY (org_key, item_id));
-- coverage_json: { partial, notes } from the scope's last sync
CREATE TABLE scope_checkpoints (org_key TEXT, scope_key TEXT, last_success_at INTEGER, last_error TEXT,
  coverage_json TEXT,
  PRIMARY KEY (org_key, scope_key));
CREATE TABLE scope_members (org_key TEXT, scope_key TEXT, item_id INTEGER, PRIMARY KEY (org_key, scope_key, item_id));
-- the unlinked reconcile's finds (04 §3): PRs in the scope's repos, and whether ADO lists any work item
CREATE TABLE scope_prs (org_key TEXT, scope_key TEXT, repo_id TEXT, pr_id INTEGER, has_work_items INTEGER NOT NULL,
  PRIMARY KEY (org_key, scope_key, repo_id, pr_id));
-- derived
CREATE TABLE links (link_id INTEGER PRIMARY KEY,
  org_key TEXT NOT NULL, kind TEXT NOT NULL,
  from_key TEXT NOT NULL, to_key TEXT NOT NULL,
  valid_from INTEGER NOT NULL, valid_to INTEGER,
  end_unknown INTEGER NOT NULL DEFAULT 0);
CREATE INDEX links_to ON links (org_key, to_key, valid_from);
CREATE INDEX links_from ON links (org_key, from_key, valid_from);
CREATE TABLE observations (obs_key TEXT PRIMARY KEY, org_key TEXT NOT NULL, obs_json TEXT NOT NULL);
CREATE TABLE events (event_key TEXT PRIMARY KEY, org_key TEXT NOT NULL, project_id TEXT NOT NULL,
  kind TEXT NOT NULL, entity_key TEXT NOT NULL, occurred_at INTEGER NOT NULL, observed_at INTEGER NOT NULL,
  event_json TEXT NOT NULL);
CREATE INDEX events_time ON events (org_key, project_id, occurred_at);
-- local config
CREATE TABLE area_favorites (org_key TEXT, project_id TEXT, node_id INTEGER, path TEXT NOT NULL,
  label TEXT NOT NULL, display_order INTEGER NOT NULL, unavailable INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_key, project_id, node_id));
CREATE TABLE captain_profiles (org_key TEXT, identity_id TEXT, ship_seed INTEGER NOT NULL,
  ship_design_version INTEGER NOT NULL, call_sign TEXT NOT NULL, PRIMARY KEY (org_key, identity_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
