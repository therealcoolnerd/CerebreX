-- CerebreX KAIROS — D1 Schema

-- Append-only daemon tick log (agents cannot delete rows)
CREATE TABLE IF NOT EXISTS daemon_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT    NOT NULL,
  tick_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  decided     INTEGER NOT NULL DEFAULT 0,  -- 1 = acted, 0 = quiet
  reasoning   TEXT,
  action      TEXT,
  result      TEXT,
  latency_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_daemon_log_agent ON daemon_log(agent_id, tick_at DESC);

-- Task queue (DO-dispatched tasks)
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT    PRIMARY KEY,
  agent_id     TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  payload      TEXT,
  status       TEXT    NOT NULL DEFAULT 'queued',
  priority     INTEGER NOT NULL DEFAULT 5,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at   TEXT,
  completed_at TEXT,
  result       TEXT,
  error        TEXT,
  source       TEXT    -- 'kairos', 'ultraplan', 'manual'
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON tasks(agent_id, status, priority DESC);

-- ULTRAPLAN proposals (Opus deep-thinking plans)
CREATE TABLE IF NOT EXISTS ultraplans (
  id           TEXT PRIMARY KEY,
  goal         TEXT NOT NULL,
  model        TEXT NOT NULL DEFAULT 'claude-opus-4-6',
  plan         TEXT,
  task_count   INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, executing, complete
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at  TEXT,
  completed_at TEXT,
  created_by   TEXT
);

-- Daemon registration
CREATE TABLE IF NOT EXISTS daemon_registry (
  agent_id    TEXT    PRIMARY KEY,
  do_id       TEXT    NOT NULL,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_tick   TEXT,
  tick_count  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);
