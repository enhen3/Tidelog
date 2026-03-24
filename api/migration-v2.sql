-- Migration: Add license types + multi-device support
-- Run: wrangler d1 execute tidelog-license-db --remote --file=migration-v2.sql

-- Add new columns to licenses
ALTER TABLE licenses ADD COLUMN license_type TEXT DEFAULT 'lifetime';
ALTER TABLE licenses ADD COLUMN expires_at INTEGER;
ALTER TABLE licenses ADD COLUMN max_devices INTEGER DEFAULT 3;

-- Remove old single-device column (SQLite doesn't support DROP COLUMN in older versions,
-- so we just stop using it — the new logic uses the license_devices table instead)

-- Multi-device binding table
CREATE TABLE IF NOT EXISTS license_devices (
  license_key  TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  activated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(license_key, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_devices_key ON license_devices(license_key);
