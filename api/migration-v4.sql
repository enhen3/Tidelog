-- Migration v4: AI proxy usage and free quota anchors
-- Apply manually after review:
-- wrangler d1 execute tidelog-license-db --remote --file=migration-v4.sql

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
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_subject_feature_period
  ON ai_usage(subject_id, feature, period);

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
