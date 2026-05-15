-- Migration: Add basic D1-backed API rate limits
-- Run: wrangler d1 execute tidelog-license-db --remote --file=migration-v3.sql

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
