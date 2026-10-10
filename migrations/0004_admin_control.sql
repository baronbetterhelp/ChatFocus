PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN daily_limit_override INTEGER;
ALTER TABLE users ADD COLUMN unlimited_usage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN admin_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS service_rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_service_rules_enabled ON service_rules(enabled, updated_at DESC);

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('service_enabled','true'),
  ('daily_request_limit','100'),
  ('owner_rules_enabled','true'),
  ('open_response_mode','true');
