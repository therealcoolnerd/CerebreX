-- ─────────────────────────────────────────────────────────────
-- CerebreX Registry — Schema v4 Migration
-- Adds MEMEX: cloud-backed persistent agent memory
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner       TEXT NOT NULL,
  agent_id    TEXT NOT NULL DEFAULT 'default',
  namespace   TEXT NOT NULL DEFAULT 'default',
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'episodic',
  checksum    TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  expires_at  TEXT DEFAULT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(owner, agent_id, namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_owner_agent ON memories(owner, agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_lookup ON memories(owner, agent_id, namespace, key);
