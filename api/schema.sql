-- TideLog License Database Schema

CREATE TABLE IF NOT EXISTS licenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT    UNIQUE NOT NULL,
  status       TEXT    DEFAULT 'unused',   -- unused | active | revoked
  license_type TEXT    DEFAULT 'lifetime', -- annual | lifetime
  expires_at   INTEGER,                    -- Unix seconds; NULL for lifetime
  max_devices  INTEGER DEFAULT 3,
  email        TEXT,
  order_id     TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);

-- Index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_email_order ON licenses(email, order_id);

CREATE TABLE IF NOT EXISTS license_devices (
  license_key  TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  activated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(license_key, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_devices_key ON license_devices(license_key);

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
