PRAGMA foreign_keys = ON;

-- Split the old shared CFocus Open switch into two independent customer modes.
INSERT INTO app_settings(key,value) VALUES
  ('groq_enabled','true'),
  ('groq_public_name','CFocus Groq')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;

INSERT INTO app_settings(key,value) VALUES
  ('nomask_public_name','CFocus NoMask')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;

-- NoMask starts off independently so it cannot be used accidentally before it is funded.
INSERT INTO app_settings(key,value) VALUES ('nomask_enabled','false')
ON CONFLICT(key) DO UPDATE SET value='false', updated_at=CURRENT_TIMESTAMP;

-- Existing V1.22 chats that used the shared "open" mode were routed through Groq by default.
UPDATE chats SET ai_mode='groq' WHERE ai_mode='open';
