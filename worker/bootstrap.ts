import type { D1Database } from '@cloudflare/workers-types';
import { HttpError, identifier, type Env } from './env';
import { base64url, hashPin, validSessionSecret } from './security';

// This is the additive schema from migrations/0001_shared_library.sql. Pages
// initializes it on its first API request, so dashboard deployment needs no CLI.
// Existing tables and records are never dropped, replaced or rewritten here.
const schema = [
  `CREATE TABLE IF NOT EXISTS mutations (
    cursor INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL,
    mutation_id TEXT NOT NULL, entity_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0), attempt_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, UNIQUE (workspace_id, mutation_id))`,
  'CREATE INDEX IF NOT EXISTS mutations_workspace_cursor ON mutations(workspace_id, cursor)',
  `CREATE TABLE IF NOT EXISTS records (
    workspace_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, prompt_id TEXT,
    revision INTEGER NOT NULL CHECK (revision > 0), entity_json TEXT NOT NULL,
    mutation_id TEXT NOT NULL, cursor INTEGER NOT NULL REFERENCES mutations(cursor),
    PRIMARY KEY (workspace_id, id))`,
  'CREATE INDEX IF NOT EXISTS records_workspace_cursor ON records(workspace_id, cursor)',
  'CREATE INDEX IF NOT EXISTS records_versions ON records(workspace_id, kind, prompt_id, cursor)',
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, auth_epoch TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)',
  `CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts >= 0))`,
  'CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(window_start)',
  `CREATE TABLE IF NOT EXISTS backup_status (
    workspace_id TEXT PRIMARY KEY, last_backup_at TEXT, last_attempt_at TEXT,
    object_key TEXT, sha256 TEXT, record_count INTEGER, bytes INTEGER, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS cuebase_configuration (
    id INTEGER PRIMARY KEY CHECK (id = 1), workspace_id TEXT NOT NULL,
    session_secret TEXT NOT NULL)`,
];

interface Configuration { workspace_id: string; session_secret: string }
interface Prepared { PROMPTA_WORKSPACE_ID: string; PROMPTA_SESSION_SECRET: string; PROMPTA_PIN_HASH: string }
interface Cached { pin: string; requestedWorkspace?: string; requestedSecret?: string; promise: Promise<Prepared> }
const prepared = new WeakMap<D1Database, Cached>();

const existingWorkspaces = `SELECT workspace_id FROM records
  UNION SELECT workspace_id FROM mutations
  UNION SELECT workspace_id FROM sessions
  UNION SELECT workspace_id FROM backup_status`;

async function initialize(db: D1Database, pin: string, requestedWorkspace?: string, requestedSecret?: string): Promise<Prepared> {
  const schemaResults = await db.batch<Configuration>([
    ...schema.map(sql => db.prepare(sql)),
    db.prepare('SELECT workspace_id, session_secret FROM cuebase_configuration WHERE id = 1'),
  ]);
  let configuration = schemaResults[schemaResults.length - 1].results[0];

  // The choice and INSERT are one statement inside a D1 batch transaction.
  // Concurrent first requests therefore all read the same winning identity and
  // secret. A populated database with several workspaces is never guessed at.
  // Once initialized, cold starts read only the single metadata row rather than
  // rescanning a potentially large mutation journal for workspace discovery.
  if (!configuration) {
    const proposedWorkspace = `shared:${crypto.randomUUID()}`;
    const proposedSecret = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const results = await db.batch<Configuration>([
      db.prepare(`WITH known AS (${existingWorkspaces}), candidates AS (SELECT workspace_id FROM known LIMIT 2)
        INSERT OR IGNORE INTO cuebase_configuration(id, workspace_id, session_secret)
        SELECT 1,
          CASE WHEN ? IS NOT NULL THEN ?
            WHEN (SELECT COUNT(*) FROM candidates) = 1 THEN (SELECT workspace_id FROM candidates LIMIT 1)
            ELSE ? END,
          ?
        WHERE (? IS NULL AND (SELECT COUNT(*) FROM candidates) < 2)
           OR (? IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM candidates) OR EXISTS(SELECT 1 FROM known WHERE workspace_id = ?)))`)
        .bind(requestedWorkspace ?? null, requestedWorkspace ?? null, proposedWorkspace, proposedSecret,
          requestedWorkspace ?? null, requestedWorkspace ?? null, requestedWorkspace ?? null),
      db.prepare('SELECT workspace_id, session_secret FROM cuebase_configuration WHERE id = 1'),
    ]);
    configuration = results[1].results[0];
  }
  if (!configuration) throw new HttpError(503, 'This database needs a workspace selection. In Cloudflare Pages, set PROMPTA_WORKSPACE_ID to the existing library’s workspace ID, then redeploy.');
  if (requestedWorkspace && configuration.workspace_id !== requestedWorkspace) {
    throw new HttpError(503, 'The workspace setting does not match this database’s library. Restore its original PROMPTA_WORKSPACE_ID or remove that setting, then redeploy.');
  }
  try { identifier(configuration.workspace_id, 'Workspace'); }
  catch { throw new HttpError(503, 'This database’s library configuration needs repair. Its saved prompts have not been changed.'); }
  if (!/^[A-Za-z0-9_-]{43}$/.test(configuration.session_secret)) {
    throw new HttpError(503, 'This database’s session configuration needs repair. Its saved prompts have not been changed.');
  }
  // The salt stays stable across requests and deployments. Neither this hash nor
  // the PIN is stored in D1; only the dashboard runtime holds the original PIN.
  const sessionSecret = requestedSecret ?? configuration.session_secret;
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`cuebase-pin-salt:${sessionSecret}`))).slice(0, 16);
  return {
    PROMPTA_WORKSPACE_ID: configuration.workspace_id,
    PROMPTA_SESSION_SECRET: sessionSecret,
    PROMPTA_PIN_HASH: await hashPin(pin, salt),
  };
}

/** Resolve dashboard setup without changing the caller's bindings object. */
export async function prepareEnvironment(env: Env): Promise<Env> {
  // Legacy Worker setup remains compatible, but an explicitly set invalid PIN
  // must fail closed instead of silently falling back to a previous PIN hash.
  if (env.PIN === undefined) return env;
  if (typeof env.PIN !== 'string' || !/^[0-9]{6,12}$/.test(env.PIN)) {
    throw new HttpError(503, 'Cuebase’s PIN is not configured correctly. In Cloudflare Pages, set the secret named PIN to 6 to 12 digits, then redeploy.');
  }
  if (!env.DB?.prepare || !env.DB?.batch) {
    throw new HttpError(503, 'Cuebase’s database is not configured. In Cloudflare Pages, add a D1 database binding named DB, then redeploy.');
  }
  const requestedWorkspace = env.PROMPTA_WORKSPACE_ID || undefined;
  const requestedSecret = env.PROMPTA_SESSION_SECRET;
  if (requestedSecret !== undefined && !validSessionSecret(requestedSecret)) {
    throw new HttpError(503, 'The optional PROMPTA_SESSION_SECRET setting is invalid. Remove it to use the database’s automatic session key, then redeploy.');
  }
  if (requestedWorkspace) {
    try { identifier(requestedWorkspace, 'Workspace'); }
    catch { throw new HttpError(503, 'The PROMPTA_WORKSPACE_ID setting is invalid. Use the existing library’s workspace ID or remove this optional setting, then redeploy.'); }
  }
  let cached = prepared.get(env.DB);
  if (!cached || cached.pin !== env.PIN || cached.requestedWorkspace !== requestedWorkspace || cached.requestedSecret !== requestedSecret) {
    const entry: Cached = { pin: env.PIN, requestedWorkspace, requestedSecret, promise: initialize(env.DB, env.PIN, requestedWorkspace, requestedSecret) };
    prepared.set(env.DB, entry);
    // A temporary D1 error can recover on the next request.
    entry.promise.catch(() => { if (prepared.get(env.DB) === entry) prepared.delete(env.DB); });
    cached = entry;
  }
  return { ...env, ...await cached.promise };
}
