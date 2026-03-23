-- CerebreX Registry — D1 Schema Migration v3
-- Run: wrangler d1 execute cerebrex-registry --file=./schema-v3.sql --remote

-- ── Users table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  username    TEXT PRIMARY KEY,
  bio         TEXT NOT NULL DEFAULT '',
  website     TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Seed users from existing token owners ────────────────────────────────────
INSERT OR IGNORE INTO users (username, role, created_at)
SELECT DISTINCT owner, 'user', MIN(created_at)
FROM tokens
GROUP BY owner;

-- ── Featured flag on packages ─────────────────────────────────────────────────
ALTER TABLE packages ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

-- ── Index for user lookups ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
