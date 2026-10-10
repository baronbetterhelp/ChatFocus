PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN daily_image_limit_override INTEGER;

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('image_uploads_enabled','true'),
  ('daily_image_upload_limit','20'),
  ('max_image_upload_mb','18');
