-- Migration: Xiaohongshu fulfilment orders, claim audit events, and delivery template settings
-- Run: wrangler d1 execute tidelog-license-db --remote --file=migration-v4.sql

CREATE TABLE IF NOT EXISTS xhs_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT UNIQUE NOT NULL,
  product_type  TEXT NOT NULL DEFAULT 'tidelog-pro',
  license_type  TEXT NOT NULL DEFAULT 'lifetime',
  status        TEXT NOT NULL DEFAULT 'imported',
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
