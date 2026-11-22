-- Cuebase Pages creates this automatically. The PIN is a Cloudflare runtime
-- secret and is never stored in this table.
CREATE TABLE IF NOT EXISTS cuebase_configuration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  workspace_id TEXT NOT NULL,
  session_secret TEXT NOT NULL
);
