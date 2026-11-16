-- One-time migration: fixed 4 slots -> custom reminders per user.
-- Run before deploying the version with custom reminders:
--   cf d1 query <db_id> --sql "$(grep -v '^\s*--' migrate-reminders.sql)"

CREATE TABLE IF NOT EXISTS reminders (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  time    TEXT NOT NULL,
  emoji   TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_user ON reminders (user_id);

ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checks ADD COLUMN time TEXT;
ALTER TABLE checks ADD COLUMN emoji TEXT;
ALTER TABLE checks ADD COLUMN message TEXT;

-- Existing users keep the 4 reminders they had, and skip onboarding.
INSERT INTO reminders (user_id, time, emoji, message)
SELECT user_id, '10:00', '☀️', 'Morning check: did you eat sugar since the last check?' FROM users;
INSERT INTO reminders (user_id, time, emoji, message)
SELECT user_id, '12:30', '🥗', 'Lunch check: did you eat sugar since the last check?' FROM users;
INSERT INTO reminders (user_id, time, emoji, message)
SELECT user_id, '16:00', '☕', 'Break check: did you eat sugar since the last check?' FROM users;
INSERT INTO reminders (user_id, time, emoji, message)
SELECT user_id, '19:00', '🍽️', 'Dinner check: did you eat sugar since the last check?' FROM users;
UPDATE users SET onboarded = 1;

-- Old answers get their label.
UPDATE checks SET time = '10:00', emoji = '☀️', message = 'Morning check: did you eat sugar since the last check?' WHERE slot = 'morning';
UPDATE checks SET time = '12:30', emoji = '🥗', message = 'Lunch check: did you eat sugar since the last check?' WHERE slot = 'lunch';
UPDATE checks SET time = '16:00', emoji = '☕', message = 'Break check: did you eat sugar since the last check?' WHERE slot = 'break';
UPDATE checks SET time = '19:00', emoji = '🍽️', message = 'Dinner check: did you eat sugar since the last check?' WHERE slot = 'dinner';
