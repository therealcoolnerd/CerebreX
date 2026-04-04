-- CerebreX MEMEX v2 — D1 Schema
-- Layer 3: session transcripts (grep-only, append-only)

CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_consolidation TEXT,
  session_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transcripts_agent_time
  ON transcripts(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcripts_search
  ON transcripts(agent_id, content);
