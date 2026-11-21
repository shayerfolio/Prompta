import { base64url } from './security';
import { HttpError, type BackupStatus, type Env } from './env';

const RETENTION_MS = 30 * 86400 * 1000;
const MAX_RECORDS = 50_000;
const MAX_BYTES = 25 * 1024 * 1024;

export async function backupStatus(env: Env): Promise<BackupStatus> {
  if (!env.BACKUPS) return { configured: false, lastBackupAt: null, error: null };
  const status = await env.DB.prepare('SELECT last_backup_at, last_attempt_at, error FROM backup_status WHERE workspace_id = ?').bind(env.PROMPTA_WORKSPACE_ID!).first<{ last_backup_at: string | null; last_attempt_at: string | null; error: string | null }>();
  // Configured means the private binding exists; only lastBackupAt proves a snapshot.
  if (!status?.last_attempt_at) return { configured: true, lastBackupAt: null, error: null };
  const stale = status?.last_backup_at && Date.now() - Date.parse(status.last_backup_at) > 36 * 3600 * 1000;
  return { configured: true, lastBackupAt: status?.last_backup_at || null, error: status?.error || (stale ? 'The last successful backup is older than 36 hours. Check the scheduled job.' : null) };
}

export async function createBackup(env: Env) {
  if (!env.BACKUPS) throw new HttpError(503, 'Automatic backup storage has not been configured.');
  const workspace = env.PROMPTA_WORKSPACE_ID!;
  const attemptedAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO backup_status(workspace_id, last_attempt_at) VALUES (?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`).bind(workspace, attemptedAt).run();
  try {
    // Guard size/count inside the same D1 transaction as the read. Oversized rows
    // never cross into Worker memory. Sessions, PINs and limiter rows are excluded.
    const budget = MAX_BYTES - MAX_RECORDS - 1024;
    const results = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(CAST(entity_json AS BLOB))), 0) AS bytes FROM records WHERE workspace_id = ?').bind(workspace),
      env.DB.prepare(`SELECT entity_json FROM records WHERE workspace_id = ? AND
        (SELECT COUNT(*) FROM records WHERE workspace_id = ?) <= ? AND
        (SELECT COALESCE(SUM(LENGTH(CAST(entity_json AS BLOB))), 0) FROM records WHERE workspace_id = ?) <= ? ORDER BY id`)
        .bind(workspace, workspace, MAX_RECORDS, workspace, budget),
    ]);
    const statistics = results[0].results[0] as { count: number; bytes: number };
    if (statistics.count > MAX_RECORDS) throw new Error('The library exceeds the configured 50,000-record backup limit.');
    if (statistics.bytes > budget) throw new Error('The library exceeds the 25 MiB backup/import limit.');
    const rows = results[1].results as { entity_json: string }[];
    // Record JSON was validated on write. Keep it as JSON text rather than making
    // a second complete object graph, then reuse one byte buffer for hash/upload.
    const snapshot = `{"app":"Prompta","schemaVersion":1,"exportedAt":${JSON.stringify(attemptedAt)},"entities":[${rows.map(row => row.entity_json).join(',')}]}`;
    const encoded = new TextEncoder().encode(snapshot);
    const bytes = encoded.byteLength;
    if (bytes > MAX_BYTES) throw new Error('The library exceeds the 25 MiB backup/import limit.');
    const checksum = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)));
    const prefix = `prompta-backups/${workspace}/`;
    const key = `${prefix}${attemptedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    const stored = await env.BACKUPS.put(key, encoded, { onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
      customMetadata: { workspaceId: workspace, schemaVersion: '1', sha256: checksum, recordCount: String(rows.length) } });
    if (!stored) throw new Error('The backup object could not be written.');
    await env.DB.prepare(`UPDATE backup_status SET last_backup_at = ?, object_key = ?, sha256 = ?, record_count = ?, bytes = ?, error = NULL WHERE workspace_id = ?`)
      .bind(attemptedAt, key, checksum, rows.length, bytes, workspace).run();
    let cursor: string | undefined;
    do {
      const page = await env.BACKUPS.list({ prefix, cursor, limit: 1000 });
      const expired = page.objects.filter(object => object.uploaded.getTime() < Date.now() - RETENTION_MS).map(object => object.key);
      if (expired.length) await env.BACKUPS.delete(expired);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return { key, recordCount: rows.length, bytes, sha256: checksum, createdAt: attemptedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'The scheduled backup failed.';
    await env.DB.prepare('UPDATE backup_status SET error = ? WHERE workspace_id = ?').bind(message, workspace).run();
    throw error;
  }
}

export async function maintenance(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(now / 1000) - 2 * 86400),
  ]);
}
