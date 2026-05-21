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

CREATE TABLE IF NOT EXISTS xhs_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT UNIQUE NOT NULL,
  product_type  TEXT NOT NULL DEFAULT 'tidelog-pro',
  license_type  TEXT NOT NULL DEFAULT 'lifetime', -- annual | lifetime
  status        TEXT NOT NULL DEFAULT 'imported', -- imported | claimed
  imported_at   INTEGER DEFAULT (unixepoch()),
  claimed_at    INTEGER,
  bound_email   TEXT,
  license_key   TEXT,
  email_sent_at INTEGER,
  email_error   TEXT,
  last_seen_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_xhs_orders_order_id ON xhs_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_xhs_orders_email ON xhs_orders(bound_email);
CREATE INDEX IF NOT EXISTS idx_xhs_orders_license_key ON xhs_orders(license_key);
CREATE INDEX IF NOT EXISTS idx_xhs_orders_status ON xhs_orders(status);

CREATE TABLE IF NOT EXISTS xhs_claim_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  email       TEXT,
  license_key TEXT,
  detail      TEXT,
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_xhs_claim_events_order_id ON xhs_claim_events(order_id);
CREATE INDEX IF NOT EXISTS idx_xhs_claim_events_created_at ON xhs_claim_events(created_at);

CREATE TABLE IF NOT EXISTS fulfillment_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
