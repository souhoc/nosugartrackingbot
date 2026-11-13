-- Fresh install schema. For an existing single-user database, run migrate-multi-user.sql instead.

-- People the owner let in with /allow. The owner (OWNER_ID secret) is always allowed.
CREATE TABLE IF NOT EXISTS allowlist (
  user_id INTEGER PRIMARY KEY,
  added   TEXT NOT NULL
);

-- One row per person who sent /start while allowed.
-- In a private chat, chat id == user id, so we message user_id directly.
CREATE TABLE IF NOT EXISTS users (
  user_id  INTEGER PRIMARY KEY,
  name     TEXT,
  timezone TEXT NOT NULL,
  created  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
  user_id     INTEGER NOT NULL,
  date        TEXT    NOT NULL,  -- user's local date, YYYY-MM-DD
  slot        TEXT    NOT NULL,  -- morning | lunch | break | dinner
  sugar       INTEGER NOT NULL,  -- 1 = ate sugar, 0 = clean
  answered_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, date, slot)
);

-- Spontaneous moments logged any time: refused sugar, or had sugar.
CREATE TABLE IF NOT EXISTS moments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  date    TEXT NOT NULL,  -- user's local date, YYYY-MM-DD
  time    TEXT NOT NULL,  -- user's local time, HH:MM
  kind    TEXT NOT NULL,  -- refused | sugar
  created TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS moments_user ON moments (user_id, id);
