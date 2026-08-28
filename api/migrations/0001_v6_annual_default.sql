-- Migration v6: lifetime is legacy-only; make the database fallback annual.
--
-- Applied only through `wrangler d1 migrations apply`. D1 wraps a migration
-- in its own transaction and creates a backup; do not add BEGIN/COMMIT here.
-- Existing license_type = 'lifetime' rows remain lifetime.

CREATE TABLE licenses_v6 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  key          TEXT    UNIQUE NOT NULL,
  status       TEXT    DEFAULT 'unused',
  license_type TEXT    DEFAULT 'annual', -- monthly | annual | lifetime (legacy only)
  expires_at   INTEGER,
  max_devices  INTEGER DEFAULT 3,
  email        TEXT,
  order_id     TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);

INSERT INTO licenses_v6 (id, key, status, license_type, expires_at, max_devices, email, order_id, created_at)
SELECT id, key, status, license_type, expires_at, max_devices, email, order_id, created_at
FROM licenses;

DROP TABLE licenses;
ALTER TABLE licenses_v6 RENAME TO licenses;

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_email_order ON licenses(email, order_id);
