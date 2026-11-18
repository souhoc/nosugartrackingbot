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
  created  TEXT NOT NULL,
  onboarded INTEGER NOT NULL DEFAULT 0  -- 1 once they picked their reminders
);

-- Each user's own reminders. Times are the user's local HH:MM, on a 5-minute mark.
CREATE TABLE IF NOT EXISTS reminders (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  time    TEXT NOT NULL,
  emoji   TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_user ON reminders (user_id);

CREATE TABLE IF NOT EXISTS checks (
  user_id     INTEGER NOT NULL,
  date        TEXT    NOT NULL,  -- user's local date, YYYY-MM-DD
  slot        TEXT    NOT NULL,  -- "r<reminder id>", or morning | lunch | break | dinner (old rows)
  sugar       INTEGER NOT NULL,  -- 1 = ate sugar, 0 = clean
  answered_at TEXT    NOT NULL,
  time        TEXT,              -- copy of the reminder when answered, so history survives edits
  emoji       TEXT,
  message     TEXT,
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

-- Targets: reach `days` clean days to earn cheat days. One active target per user (reached IS NULL).
-- start NULL = the current streak counts; otherwise only days from `start` (user's local date) count.
-- base = progress when set (the streak, or 0), so the reward only pays for new days.
CREATE TABLE IF NOT EXISTS targets (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  days    INTEGER NOT NULL,
  base    INTEGER NOT NULL,
  start   TEXT,
  created TEXT NOT NULL,
  reached TEXT,                       -- local date it was reached, NULL while active
  earned  INTEGER NOT NULL DEFAULT 0  -- cheat days given (after the cap)
);
CREATE INDEX IF NOT EXISTS targets_user ON targets (user_id);

-- Sugar days the user covered with a cheat day. Balance = SUM(targets.earned) - COUNT(cheats).
CREATE TABLE IF NOT EXISTS cheats (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,  -- user's local date, YYYY-MM-DD
  created TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
