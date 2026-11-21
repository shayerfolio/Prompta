CREATE TABLE IF NOT EXISTS mutations (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  attempt_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, mutation_id)
);
CREATE INDEX IF NOT EXISTS mutations_workspace_cursor ON mutations(workspace_id, cursor);

CREATE TABLE IF NOT EXISTS records (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  prompt_id TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  entity_json TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  cursor INTEGER NOT NULL REFERENCES mutations(cursor),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS records_workspace_cursor ON records(workspace_id, cursor);
CREATE INDEX IF NOT EXISTS records_versions ON records(workspace_id, kind, prompt_id, cursor);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  auth_epoch TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(window_start);

CREATE TABLE IF NOT EXISTS backup_status (
  workspace_id TEXT PRIMARY KEY,
  last_backup_at TEXT,
  last_attempt_at TEXT,
  object_key TEXT,
  sha256 TEXT,
  record_count INTEGER,
  bytes INTEGER,
  error TEXT
);
