-- One-time migration: add access requests ("🙋 Ask for access" button). New table only, safe to run twice.
-- Run before deploying that version:
--   cf d1 query <db_id> --sql "$(grep -v '^\s*--' migrate-access-requests.sql)"

-- People who tapped "Ask for access". One row per person: while it exists they can't ask again.
-- Deleted when the owner allows them (button or /allow). Kept when ignored.
CREATE TABLE IF NOT EXISTS access_requests (
  user_id   INTEGER PRIMARY KEY,
  name      TEXT,
  username  TEXT,
  requested TEXT NOT NULL,
  ignored   TEXT              -- when the owner tapped Ignore, NULL while pending
);
