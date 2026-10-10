ALTER TABLE usage_events ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN request_kind TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE usage_events ADD COLUMN web_search_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN response_id TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_kind_created ON usage_events(request_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_chat_created ON usage_events(chat_id, created_at DESC);

-- Backfill historical events with the GPT-6 Luna Standard token estimate.
-- Historical cached-token detail was not previously stored, so old rows are
-- conservatively treated as uncached input.
UPDATE usage_events
SET estimated_cost_usd = ((input_tokens * 0.10) + (output_tokens * 0.50)) / 1000000.0
WHERE estimated_cost_usd = 0;
