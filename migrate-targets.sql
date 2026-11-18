-- One-time migration: add targets and cheat days. Only new tables, safe to run twice.
-- Run before deploying that version:
--   cf d1 query <db_id> --sql "$(grep -v '^\s*--' migrate-targets.sql)"

CREATE TABLE IF NOT EXISTS targets (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  days    INTEGER NOT NULL,
  base    INTEGER NOT NULL,
  start   TEXT,
  created TEXT NOT NULL,
  reached TEXT,
  earned  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS targets_user ON targets (user_id);

CREATE TABLE IF NOT EXISTS cheats (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
