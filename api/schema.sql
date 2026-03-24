-- TideLog License Database Schema

CREATE TABLE IF NOT EXISTS licenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT    UNIQUE NOT NULL,
  status       TEXT    DEFAULT 'unused',   -- unused | active | revoked
  device_id    TEXT,
  email        TEXT,
  order_id     TEXT,
  activated_at INTEGER,
  created_at   INTEGER DEFAULT (unixepoch())
);

-- Index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
