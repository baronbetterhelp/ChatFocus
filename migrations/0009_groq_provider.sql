PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('open_provider','groq'),
  ('groq_model','openai/gpt-oss-20b');
