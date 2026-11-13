-- One-time migration: single-user tables -> multi-user tables.
-- __OWNER_ID__ is replaced with the existing owner's Telegram id before running:
--   cf d1 query <db_id> --sql "$(sed "s/__OWNER_ID__/123456789/g" migrate-multi-user.sql)"

CREATE TABLE IF NOT EXISTS allowlist (
  user_id INTEGER PRIMARY KEY,
  added   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id  INTEGER PRIMARY KEY,
  name     TEXT,
  timezone TEXT NOT NULL,
  created  TEXT NOT NULL
);
INSERT OR IGNORE INTO users (user_id, name, timezone, created)
VALUES (__OWNER_ID__, NULL, 'Europe/Paris', datetime('now'));

-- checks: primary key changes, so rebuild the table.
CREATE TABLE checks_new (
  user_id     INTEGER NOT NULL,
  date        TEXT    NOT NULL,
  slot        TEXT    NOT NULL,
  sugar       INTEGER NOT NULL,
  answered_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, date, slot)
);
INSERT INTO checks_new (user_id, date, slot, sugar, answered_at)
SELECT __OWNER_ID__, date, slot, sugar, answered_at FROM checks;
DROP TABLE checks;
ALTER TABLE checks_new RENAME TO checks;

-- moments: just add the column.
ALTER TABLE moments ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
UPDATE moments SET user_id = __OWNER_ID__;
CREATE INDEX IF NOT EXISTS moments_user ON moments (user_id, id);
