// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash, pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';

const ORIGIN = 'https://prompta.test';
const WORKSPACE = 'shared:integration-tests';
const PIN = '004218';
const salt = randomBytes(16);
const bindings = {
  PROMPTA_WORKSPACE_ID: WORKSPACE,
  PROMPTA_PIN_HASH: `pbkdf2-sha256:100000:${salt.toString('base64url')}:${pbkdf2Sync(PIN, salt, 100000, 32, 'sha256').toString('base64url')}`,
  PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url'),
};
let mf;
let database;
let script;
const options = ({ bindings: values = bindings, backups = true, ...overrides } = {}) => ({
  host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.ERROR),
  workers: [{ config: {
    name: 'prompta-integration', compatibilityDate: '2026-11-21',
    manifest: { mainModule: 'worker.js', modules: { 'worker.js': { type: 'esm', contents: script } } },
    env: { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: 'text', value }])),
      DB: { type: 'd1', id: 'prompta-integration-db' }, ...(backups ? { BACKUPS: { type: 'r2', name: 'prompta-integration-backups' } } : {}) },
  } }],
  ...overrides,
});

beforeAll(async () => {
  const bundle = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  script = bundle.outputFiles[0].text;
  mf = new Miniflare(options());
  database = await mf.getD1Database('DB');
  const migration = await readFile('migrations/0001_shared_library.sql', 'utf8');
  await database.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => database.prepare(sql)));
}, 30_000);
beforeEach(async () => {
  await database.exec('DELETE FROM records; DELETE FROM mutations; DELETE FROM sessions; DELETE FROM rate_limits; DELETE FROM backup_status;');
  const bucket = await mf.getR2Bucket('BACKUPS');
  const objects = await bucket.list();
  if (objects.objects.length) await bucket.delete(objects.objects.map(item => item.key));
});
afterAll(async () => { await mf?.dispose(); });

function api(path, { method = 'GET', body, cookie, origin = ORIGIN, ip = '203.0.113.10' } = {}) {
  return mf.dispatchFetch(`${ORIGIN}${path}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': ip },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function unlock(ip) {
  const response = await api('/api/unlock', { method: 'POST', body: { pin: PIN }, ip });
  expect(response.status, await response.clone().text()).toBe(200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], session: await response.json(), headers: response.headers };
}
function prompt(id = 'prompt-1', changes = {}) {
  return { id, ownerId: WORKSPACE, kind: 'prompt', revision: 1, createdAt: '2026-11-21T10:00:00.000Z', updatedAt: '2026-11-21T10:00:00.000Z', deletedAt: null,
    title: 'Shared prompt', content: 'Create {{subject}}.\n  Keep every space.', type: 'Text', categoryId: null, tagIds: [], referenceLinks: [], favorite: false, copyCount: 0, lastCopiedAt: null, ...changes };
}
function mutation(entity = prompt(), baseRevision = 0, id = randomUUID()) {
  return { id, entityId: entity.id, ownerId: WORKSPACE, baseRevision, entity, createdAt: '2026-11-21T10:00:00.000Z' };
}
async function commit(cookie, value) {
  const response = await api('/api/mutations', { method: 'POST', cookie, body: { mutation: value } });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

describe('real Worker PIN authentication and authorization', () => {
  it('keeps the shared library locked without a valid server session', async () => {
    const session = await api('/api/session');
    expect(await session.json()).toMatchObject({ authenticated: false, workspaceId: null, expiresAt: null });
    const response = await api('/api/records');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await api('/api/mutations', { method: 'POST', body: { mutation: mutation() }, cookie: '__Host-prompta_session=forged' })).status).toBe(401);
  });

  it('verifies a leading-zero PIN using workerd crypto and issues only an opaque protected cookie', async () => {
    expect((await api('/api/unlock', { method: 'POST', body: { pin: '004219' } })).status).toBe(401);
    expect((await api('/api/unlock', { method: 'POST', body: { pin: 4218 } })).status).toBe(400);
    const { cookie, session, headers } = await unlock();
    expect(session.authenticated).toBe(true);
    expect(session.workspaceId).toBe(WORKSPACE);
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
    expect(headers.get('set-cookie')).toMatch(/__Host-prompta_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
    const stored = await database.prepare('SELECT token_hash FROM sessions').first();
    expect(stored.token_hash).not.toBe(cookie.split('=')[1]);
    const payload = JSON.stringify(session);
    expect(payload).not.toContain(PIN);
    expect(payload).not.toContain(bindings.PROMPTA_PIN_HASH);
    expect(payload).not.toContain(bindings.PROMPTA_SESSION_SECRET);
    expect((await (await api('/api/session', { cookie })).json()).authenticated).toBe(true);
  });

  it('rejects cross-origin and missing-Origin writes before attempting PIN verification', async () => {
    expect((await api('/api/unlock', { method: 'POST', body: { pin: PIN }, origin: 'https://unrelated.test' })).status).toBe(403);
    expect((await api('/api/unlock', { method: 'POST', body: { pin: PIN }, origin: null })).status).toBe(403);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM rate_limits').first()).count).toBe(0);
    const { cookie } = await unlock();
    expect((await api('/api/mutations', { method: 'POST', cookie, origin: 'https://unrelated.test', body: { mutation: mutation() } })).status).toBe(403);
  });

  it('revokes a session on lock and rejects replay without erasing a newer cookie on a data 401', async () => {
    const { cookie } = await unlock();
    const response = await api('/api/lock', { method: 'POST', cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await database.prepare('SELECT COUNT(*) AS count FROM sessions').first()).count).toBe(0);
    const replay = await api('/api/records', { cookie });
    expect(replay.status).toBe(401);
    expect(replay.headers.get('set-cookie')).toBeNull();
  });

  it('rejects expired sessions and sessions from an old authentication epoch', async () => {
    const first = await unlock();
    await database.prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() - 1).run();
    expect((await api('/api/records', { cookie: first.cookie })).status).toBe(401);
    const second = await unlock();
    await database.prepare('UPDATE sessions SET auth_epoch = ?').bind('previous-pin-epoch').run();
    expect((await api('/api/records', { cookie: second.cookie })).status).toBe(401);
  });

  it('rate-limits concurrent wrong attempts using atomic D1 counters', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, () => api('/api/unlock', { method: 'POST', body: { pin: '999999' } })));
    expect(responses.filter(response => response.status === 401)).toHaveLength(8);
    expect(responses.filter(response => response.status === 429)).toHaveLength(2);
    expect(Number(responses.find(response => response.status === 429).headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await api('/api/unlock', { method: 'POST', body: { pin: PIN } })).status).toBe(429);
    expect((await database.prepare("SELECT attempts FROM rate_limits WHERE bucket_key LIKE 'ip:%'").first()).attempts).toBe(9);
  }, 20_000);

  it('applies the global guard even when the next attempt uses a new IP', async () => {
    const windowStart = Math.floor(Date.now() / 1000 / 900) * 900;
    await database.prepare('INSERT INTO rate_limits(bucket_key, window_start, attempts) VALUES (?, ?, ?)').bind(`global:${WORKSPACE}`, windowStart, 60).run();
    const response = await api('/api/unlock', { method: 'POST', body: { pin: PIN }, ip: '198.51.100.99' });
    expect(response.status).toBe(429);
    expect((await database.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE bucket_key LIKE 'ip:%'").first()).count).toBe(0);
  });

  it('fails closed when server secrets are missing', async () => {
    const missing = new Miniflare(options({ bindings: { PROMPTA_WORKSPACE_ID: WORKSPACE } }));
    try {
      const response = await missing.dispatchFetch(`${ORIGIN}/api/session`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: expect.stringContaining('not configured') });
    } finally { await missing.dispose(); }
  }, 20_000);

  it('permits the explicit local HTTP mode only on loopback and reports missing backup storage truthfully', async () => {
    expect((await mf.dispatchFetch('http://localhost/api/session')).status).toBe(403);
    const local = new Miniflare(options({ backups: false, bindings: { ...bindings, PROMPTA_ALLOW_INSECURE_LOCAL_DEV: 'true' } }));
    try {
      const localDatabase = await local.getD1Database('DB');
      const migration = await readFile('migrations/0001_shared_library.sql', 'utf8');
      await localDatabase.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => localDatabase.prepare(sql)));
      const response = await local.dispatchFetch('http://localhost/api/unlock', {
        method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toMatch(/^prompta_dev_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict;/);
      expect(response.headers.get('set-cookie')).not.toContain('; Secure');
      expect((await response.json()).backup).toEqual({ configured: false, lastBackupAt: null, error: null });
      expect((await local.dispatchFetch('http://public.example/api/session')).status).toBe(403);
    } finally { await local.dispose(); }
  }, 20_000);
});

describe('real D1 shared-library transactions', () => {
  it('shares the same records between independently unlocked sessions', async () => {
    const first = await unlock('203.0.113.11');
    const second = await unlock('203.0.113.12');
    const result = await commit(first.cookie, mutation());
    expect(result.outcome).toBe('committed');
    const page = await (await api('/api/records', { cookie: second.cookie })).json();
    expect(page.records[0].entity.content).toBe(prompt().content);
    expect(page.cursor).toBe(result.cursor);
    expect(page.hasMore).toBe(false);
  });

  it('validates ownership, unsafe links and reserved settings identities on the server', async () => {
    const { cookie } = await unlock();
    const foreign = mutation(prompt('foreign', { ownerId: 'shared:another-workspace' }));
    expect((await api('/api/mutations', { method: 'POST', cookie, body: { mutation: foreign } })).status).toBe(403);
    const unsafe = mutation(prompt('unsafe', { referenceLinks: ['javascript:alert(1)'] }));
    expect((await api('/api/mutations', { method: 'POST', cookie, body: { mutation: unsafe } })).status).toBe(400);
    expect((await api('/api/mutations', { method: 'POST', cookie, body: { mutation: mutation(prompt('settings')) } })).status).toBe(400);
    const literal = '<script>never execute this</script>\n{{subject}}';
    expect((await commit(cookie, mutation(prompt('literal', { content: literal })))).entity.content).toBe(literal);
  });

  it('allows exactly one winner when two independent mutations share a base revision', async () => {
    const { cookie } = await unlock();
    const results = await Promise.all([
      commit(cookie, mutation(prompt('concurrent', { content: 'Device A' }))),
      commit(cookie, mutation(prompt('concurrent', { content: 'Device B' }))),
    ]);
    expect(results.map(result => result.outcome).sort()).toEqual(['committed', 'conflict']);
    expect(results[0].entity.content).toBe(results[1].entity.content);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM mutations').first()).count).toBe(1);
    expect((await database.prepare('SELECT revision FROM records').first()).revision).toBe(1);
  });

  it('acknowledges duplicate retries once and never rewrites a newer server revision', async () => {
    const { cookie } = await unlock();
    const first = mutation(prompt());
    const retries = await Promise.all([commit(cookie, first), commit(cookie, first), commit(cookie, first)]);
    expect(retries.filter(result => result.outcome === 'committed')).toHaveLength(1);
    expect(retries.filter(result => result.outcome === 'acknowledged')).toHaveLength(2);
    await commit(cookie, mutation(prompt('prompt-1', { content: 'Later work', revision: 2 }), 1));
    const replay = await commit(cookie, first);
    expect(replay.outcome).toBe('acknowledged');
    expect(replay.entity.content).toBe('Later work');
    expect(replay.entity.revision).toBe(2);
    const changedPayload = { ...first, entity: { ...first.entity, content: 'Different content under reused ID' } };
    expect((await api('/api/mutations', { method: 'POST', cookie, body: { mutation: changedPayload } })).status).toBe(409);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM mutations').first()).count).toBe(2);
  });

  it('preserves deletion tombstones when an offline edit tries to use an older base', async () => {
    const { cookie } = await unlock();
    await commit(cookie, mutation());
    const tombstone = { id: 'prompt-1', ownerId: WORKSPACE, kind: 'tombstone', originalKind: 'prompt', revision: 2,
      createdAt: prompt().createdAt, updatedAt: prompt().updatedAt, deletedAt: prompt().updatedAt };
    await commit(cookie, mutation(tombstone, 1));
    const stale = await commit(cookie, mutation(prompt('prompt-1', { revision: 2, content: 'Old offline edit' }), 1));
    expect(stale.outcome).toBe('conflict');
    expect(stale.entity.kind).toBe('tombstone');
    expect((await database.prepare('SELECT kind FROM records').first()).kind).toBe('tombstone');
  });

  it('advances empty filtered pages over versions and paginates history/export accurately', async () => {
    const { cookie } = await unlock();
    const first = await commit(cookie, mutation());
    for (let index = 1; index <= 3; index++) {
      const source = prompt();
      const version = { id: `version-${index}`, ownerId: WORKSPACE, kind: 'version', revision: 1, createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: null,
        promptId: source.id, reason: 'edit', snapshot: { title: source.title, content: `Old content ${index}`, type: source.type, categoryId: null, tagIds: [], referenceLinks: [], favorite: false } };
      await commit(cookie, mutation(version));
    }
    const hidden = await (await api(`/api/records?after=${first.cursor}&limit=2`, { cookie })).json();
    expect(hidden.records).toEqual([]);
    expect(hidden.cursor).toBeGreaterThan(first.cursor);
    expect(hidden.hasMore).toBe(true);
    const tail = await (await api(`/api/records?after=${hidden.cursor}&limit=2`, { cookie })).json();
    expect(tail.records).toEqual([]);
    expect(tail.cursor).toBeGreaterThan(hidden.cursor);
    expect(tail.hasMore).toBe(false);
    const history = await (await api('/api/versions?promptId=prompt-1&limit=2', { cookie })).json();
    expect(history.records).toHaveLength(2);
    expect(history.hasMore).toBe(true);
    const next = await (await api(`/api/versions?promptId=prompt-1&limit=2&after=${history.cursor}`, { cookie })).json();
    expect(next.records).toHaveLength(1);
    expect(next.hasMore).toBe(false);
    expect((await (await api('/api/records?includeVersions=1', { cookie })).json()).records).toHaveLength(4);
  });
});

describe('independent scheduled R2 snapshots', () => {
  it('reports unverified initial status and stores a recoverable snapshot independent of live edits', async () => {
    const { cookie, session } = await unlock();
    expect(session.backup).toMatchObject({ configured: true, lastBackupAt: null });
    await commit(cookie, mutation());
    const worker = await mf.getWorker();
    const run = await worker.scheduled({ cron: '0 21 * * *', scheduledTime: new Date() });
    expect(run.outcome).toBe('ok');
    const bucket = await mf.getR2Bucket('BACKUPS');
    const files = await bucket.list({ prefix: `prompta-backups/${WORKSPACE}/` });
    expect(files.objects).toHaveLength(1);
    const object = await bucket.get(files.objects[0].key);
    const raw = await object.text();
    const data = JSON.parse(raw);
    expect(data).toMatchObject({ app: 'Prompta', schemaVersion: 1 });
    expect(data.entities[0].content).toBe(prompt().content);
    expect(object.customMetadata.sha256).toBe(createHash('sha256').update(raw).digest('base64url'));
    expect(raw).not.toContain(bindings.PROMPTA_PIN_HASH);
    expect(raw).not.toContain(bindings.PROMPTA_SESSION_SECRET);
    await commit(cookie, mutation(prompt('prompt-1', { revision: 2, content: 'Changed after snapshot' }), 1));
    expect(await (await bucket.get(files.objects[0].key)).text()).toBe(raw);
    const status = await (await api('/api/backups', { cookie })).json();
    expect(status.lastBackupAt).toBe(data.exportedAt);
    expect(status.error).toBeNull();
  });

  it('rejects an oversized snapshot in D1 before loading its content and keeps the last recoverable backup', async () => {
    const { cookie } = await unlock();
    await commit(cookie, mutation());
    const worker = await mf.getWorker();
    expect((await worker.scheduled({ cron: '0 21 * * *' })).outcome).toBe('ok');
    const previous = await (await api('/api/backups', { cookie })).json();
    const bucket = await mf.getR2Bucket('BACKUPS');
    const before = await bucket.list();

    // Generate valid-sized records inside SQLite so the fixture itself does not
    // send a 27 MB request through the Worker. Their aggregate exceeds the cap.
    await database.batch([
      database.prepare(`WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM numbers WHERE n < 90)
        INSERT INTO mutations(workspace_id, mutation_id, entity_id, payload_hash, revision, attempt_id, created_at)
        SELECT ?, 'size-' || n, 'size-' || n, 'fixture', 1, 'fixture', ? FROM numbers`).bind(WORKSPACE, Date.now()),
      database.prepare(`INSERT INTO records(workspace_id, id, kind, prompt_id, revision, entity_json, mutation_id, cursor)
        SELECT workspace_id, entity_id, 'prompt', NULL, revision,
          json_set(?, '$.id', entity_id, '$.content', replace(printf('%0*d', 100000, 0), '0', 'ก')),
          mutation_id, cursor FROM mutations WHERE workspace_id = ? AND mutation_id LIKE 'size-%'`)
        .bind(JSON.stringify(prompt()), WORKSPACE),
    ]);
    const statistics = await database.prepare('SELECT COUNT(*) AS count, SUM(LENGTH(CAST(entity_json AS BLOB))) AS bytes FROM records').first();
    expect(statistics.count).toBe(91);
    expect(statistics.bytes).toBeGreaterThan(25 * 1024 * 1024);
    const run = await worker.scheduled({ cron: '0 21 * * *' });
    expect(run.outcome).not.toBe('ok');
    const status = await (await api('/api/backups', { cookie })).json();
    expect(status.lastBackupAt).toBe(previous.lastBackupAt);
    expect(status.error).toContain('25 MiB');
    expect((await bucket.list()).objects.map(object => object.key)).toEqual(before.objects.map(object => object.key));
  }, 20_000);
});
