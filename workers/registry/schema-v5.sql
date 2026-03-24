-- ─────────────────────────────────────────────────────────────
-- CerebreX Registry — Schema v5 Migration
-- Adds HIVE: multi-agent orchestration config store
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hives (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config      TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(owner, name)
);

CREATE INDEX IF NOT EXISTS idx_hives_owner ON hives(owner);
