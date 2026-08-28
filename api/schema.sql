-- TideLog License Database Schema

CREATE TABLE IF NOT EXISTS licenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT    UNIQUE NOT NULL,
  status       TEXT    DEFAULT 'unused',   -- unused | active | revoked
  license_type TEXT    DEFAULT 'annual',   -- monthly | annual | lifetime (legacy only)
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

CREATE TABLE IF NOT EXISTS ai_usage (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('license', 'free')),
  subject_id    TEXT NOT NULL,
  feature       TEXT NOT NULL CHECK (feature IN ('daily_insight', 'weekly', 'monthly', 'profile', 'chat')),
  period        TEXT NOT NULL CHECK (
                  period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
                  AND CAST(substr(period, 6, 2) AS INTEGER) BETWEEN 1 AND 12
                ),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  input_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  session_id    TEXT,
  ip_anchor     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_subject_feature_period
  ON ai_usage(subject_id, feature, period);
CREATE INDEX IF NOT EXISTS idx_ai_usage_session
  ON ai_usage(subject_id, feature, period, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ip_period
  ON ai_usage(ip_anchor, period);

-- 已退出配额决策路径，保留用于兼容旧数据与运维查询。
CREATE TABLE IF NOT EXISTS free_quota (
  anchor        TEXT PRIMARY KEY,
  period        TEXT NOT NULL CHECK (
                  period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
                  AND CAST(substr(period, 6, 2) AS INTEGER) BETWEEN 1 AND 12
                ),
  used_count    INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_free_quota_anchor ON free_quota(anchor);

CREATE TABLE IF NOT EXISTS device_trials (
  anchor      TEXT PRIMARY KEY,
  ip_hash     TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_trials_ip_started
  ON device_trials(ip_hash, started_at);
