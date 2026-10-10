PRAGMA foreign_keys = ON;

-- ChatFocus V1.17 defaults vision to the economy detail level.
-- Existing owners can still change this from Admin > Limits & Access > Product Defaults.
UPDATE app_settings
SET value='low', updated_at=CURRENT_TIMESTAMP
WHERE key='image_detail' AND value='auto';

INSERT OR IGNORE INTO app_settings(key,value) VALUES ('image_detail','low');
