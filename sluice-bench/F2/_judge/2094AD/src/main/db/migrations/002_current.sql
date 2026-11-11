-- Current state first (decided 2026-10-07): each item as ADO says it is now (hydrate's fields), so a
-- scene shows at once without history. fact_json: CurrentItemFact (03 §2 shapes only).
CREATE TABLE wi_current (org_key TEXT, item_id INTEGER, fact_json TEXT NOT NULL, observed_at INTEGER NOT NULL,
  PRIMARY KEY (org_key, item_id));
