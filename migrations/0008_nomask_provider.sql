PRAGMA foreign_keys = ON;

ALTER TABLE chats ADD COLUMN ai_mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE usage_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'openai';

CREATE INDEX IF NOT EXISTS idx_usage_provider_created ON usage_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_ai_mode ON chats(user_id, ai_mode, updated_at DESC);

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('nomask_enabled','false'),
  ('nomask_model','qwen_3.8_uncensored'),
  ('nomask_public_name','CFocus Open');
