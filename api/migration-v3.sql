-- Migration v3: Anonymous telemetry events
-- Run: wrangler d1 execute tidelog-license-db --remote --file=migration-v3.sql

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  anonymous_id TEXT    NOT NULL,
  event        TEXT    NOT NULL,
  properties   TEXT,                              -- JSON blob (small, < 1KB expected)
  client_ts    INTEGER,                           -- client-reported epoch ms
  received_at  INTEGER DEFAULT (unixepoch())     -- server epoch s
);

CREATE INDEX IF NOT EXISTS idx_events_event       ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_anon        ON events(anonymous_id);
