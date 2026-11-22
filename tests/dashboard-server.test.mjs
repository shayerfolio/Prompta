// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';

const PIN = '00182749';
const WORKSPACE = 'shared:preserved-prompta-library';
let script;
let migration;
const instances = [];

beforeAll(async () => {
  const bundle = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  script = bundle.outputFiles[0].text;
  migration = await readFile('migrations/0001_shared_library.sql', 'utf8');
});
afterEach(async () => { await Promise.all(instances.splice(0).map(instance => instance.dispose())); });

function options(bindings = [{ PIN }], { database = true } = {}) {
  return {
    host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.ERROR),
    workers: bindings.map((values, index) => ({ config: {
      name: `cuebase-dashboard-${index}`, compatibilityDate: '2026-11-21',
      triggers: [{ type: 'fetch', pattern: `${index ? `cuebase-${index}` : 'cuebase'}.test/*` }],
      manifest: { mainModule: 'worker.js', modules: { 'worker.js': { type: 'esm', contents: script } } },
      env: { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: 'text', value }])),
        ...(database ? { DB: { type: 'd1', id: 'cuebase-dashboard-db' } } : {}) },
    } })),
  };
}
async function runtime(bindings, settings) {
  const instance = new Miniflare(options(bindings, settings));
  instances.push(instance);
  await instance.ready;
  return instance;
}
async function request(instance, path, { worker = 0, method = 'GET', body, cookie, origin, ip = '203.0.113.11', protocol = 'https:' } = {}) {
  const hostname = `${worker ? `cuebase-${worker}` : 'cuebase'}.test`;
  if (origin === undefined) origin = `${protocol}//${hostname}`;
  return instance.dispatchFetch(`${protocol}//${hostname}${path}`, {
    method, headers: {
      ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': ip,
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function unlock(instance, overrides = {}) {
  const response = await request(instance, '/api/unlock', { method: 'POST', body: { pin: PIN }, ...overrides });
  expect(response.status, await response.clone().text()).toBe(200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], session: await response.json(), headers: response.headers };
}
async function existingSchema(database) {
  await database.batch(migration.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => database.prepare(sql)));
}
async function commit(instance, cookie, workspace, overrides = {}) {
  const entity = {
    id: 'kept-prompt', ownerId: workspace, kind: 'prompt', revision: 1,
    createdAt: '2026-11-21T10:00:00.000Z', updatedAt: '2026-11-21T10:00:00.000Z', deletedAt: null,
    title: 'Keep this prompt', content: 'Keep {{subject}}.\n  Preserve the spaces.', type: 'Text',
    categoryId: null, tagIds: [], referenceLinks: [], favorite: true, copyCount: 3, lastCopiedAt: null,
  };
  const mutation = { id: randomUUID(), entityId: entity.id, ownerId: workspace, baseRevision: 0, entity, createdAt: entity.createdAt };
  const response = await request(instance, '/api/mutations', { method: 'POST', cookie, body: { mutation }, ...overrides });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

describe('Cuebase dashboard setup on real workerd and D1', () => {
  it('starts an empty shared library using only PIN and DB, with leading zeros preserved', async () => {
    const instance = await runtime();
    const response = await request(instance, '/api/session');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authenticated: false, workspaceId: null });
    expect((await request(instance, '/api/records')).status).toBe(401);
    expect((await request(instance, '/api/unlock', { method: 'POST', body: { pin: '182749' } })).status).toBe(401);
    const first = await unlock(instance);
    expect(first.session.workspaceId).toMatch(/^shared:[0-9a-f-]{36}$/);
    expect(first.session.backup).toEqual({ configured: false, lastBackupAt: null, error: null });
    expect(first.headers.get('set-cookie')).toMatch(/^__Host-prompta_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    const configuration = await database.prepare('SELECT * FROM cuebase_configuration').all();
    expect(configuration.results).toHaveLength(1);
    expect(configuration.results[0].session_secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(configuration.results)).not.toContain(PIN);
    expect(JSON.stringify(first.session)).not.toContain(configuration.results[0].session_secret);
    expect(JSON.stringify(first.session)).not.toContain(PIN);
    await commit(instance, first.cookie, first.session.workspaceId);
    const second = await unlock(instance, { ip: '203.0.113.12' });
    const records = await (await request(instance, '/api/records', { cookie: second.cookie })).json();
    expect(records.records[0].entity.content).toBe('Keep {{subject}}.\n  Preserve the spaces.');
  }, 20_000);

  it('chooses one workspace and secret when separate deployment instances initialize concurrently', async () => {
    const instance = await runtime([{ PIN }, { PIN }, { PIN }, { PIN }]);
    const sessions = await Promise.all([0, 1, 2, 3].map(worker => unlock(instance, { worker, ip: `198.51.100.${worker + 1}` })));
    expect(new Set(sessions.map(item => item.session.workspaceId)).size).toBe(1);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    expect((await database.prepare('SELECT COUNT(*) AS count FROM cuebase_configuration').first()).count).toBe(1);
    // An opaque session minted by one isolate remains valid in another.
    const restored = await (await request(instance, '/api/session', { worker: 3, cookie: sessions[0].cookie })).json();
    expect(restored.authenticated).toBe(true);
    expect(restored.workspaceId).toBe(sessions[0].session.workspaceId);
  }, 20_000);

  it('reuses a v0.7 library without rewriting its records, cursors, history or identity', async () => {
    const salt = randomBytes(16);
    const legacy = {
      PROMPTA_WORKSPACE_ID: WORKSPACE,
      PROMPTA_PIN_HASH: `pbkdf2-sha256:100000:${salt.toString('base64url')}:${pbkdf2Sync(PIN, salt, 100000, 32, 'sha256').toString('base64url')}`,
      PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url'),
    };
    const instance = await runtime([legacy, { PIN }]);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    await existingSchema(database);
    const oldSession = await unlock(instance);
    const source = (await commit(instance, oldSession.cookie, WORKSPACE)).entity;
    const version = { id: 'kept-version', ownerId: WORKSPACE, kind: 'version', revision: 1,
      createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: null, promptId: source.id, reason: 'edit',
      snapshot: { title: source.title, content: 'The original prompt text.', type: source.type, categoryId: null, tagIds: [], referenceLinks: [], favorite: true } };
    const historyWrite = await request(instance, '/api/mutations', { method: 'POST', cookie: oldSession.cookie,
      body: { mutation: { id: randomUUID(), entityId: version.id, ownerId: WORKSPACE, baseRevision: 0, entity: version, createdAt: source.createdAt } } });
    expect(historyWrite.status).toBe(200);
    const beforeRecords = (await database.prepare('SELECT * FROM records ORDER BY id').all()).results;
    const beforeMutations = (await database.prepare('SELECT * FROM mutations ORDER BY cursor').all()).results;
    const current = await unlock(instance, { worker: 1, ip: '198.51.100.15' });
    expect(current.session.workspaceId).toBe(WORKSPACE);
    expect((await database.prepare('SELECT * FROM records ORDER BY id').all()).results).toEqual(beforeRecords);
    expect((await database.prepare('SELECT * FROM mutations ORDER BY cursor').all()).results).toEqual(beforeMutations);
    const page = await (await request(instance, '/api/records', { worker: 1, cookie: current.cookie })).json();
    expect(page.records[0].entity.favorite).toBe(true);
    expect(page.records[0].entity.copyCount).toBe(3);
    expect(page.cursor).toBe(Math.max(...beforeRecords.map(record => record.cursor)));
    const history = await (await request(instance, '/api/versions?promptId=kept-prompt', { worker: 1, cookie: current.cookie })).json();
    expect(history.records[0].entity.snapshot.content).toBe('The original prompt text.');
    expect((await request(instance, '/api/records', { cookie: oldSession.cookie })).status).toBe(200);
  }, 20_000);

  it.each(['sessions', 'mutations', 'backup_status'])('retains an existing workspace even when only %s identifies it', async table => {
    const instance = await runtime();
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    await existingSchema(database);
    if (table === 'sessions') await database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)').bind('old-session', WORKSPACE, 'old-epoch', 1, 2).run();
    if (table === 'mutations') await database.prepare('INSERT INTO mutations(workspace_id, mutation_id, entity_id, payload_hash, revision, attempt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(WORKSPACE, 'old-mutation', 'old-entity', 'old-hash', 1, 'old-attempt', 1).run();
    if (table === 'backup_status') await database.prepare('INSERT INTO backup_status(workspace_id) VALUES (?)').bind(WORKSPACE).run();
    expect((await unlock(instance)).session.workspaceId).toBe(WORKSPACE);
  }, 20_000);

  it('refuses to guess between existing workspaces and rejects an override that would hide saved data', async () => {
    const alternate = 'shared:second-library';
    const instance = await runtime([{ PIN }, { PIN, PROMPTA_WORKSPACE_ID: WORKSPACE }, { PIN, PROMPTA_WORKSPACE_ID: 'shared:unknown-library' }, { PIN, PROMPTA_WORKSPACE_ID: alternate }]);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    await existingSchema(database);
    await database.batch([WORKSPACE, alternate].map((workspace, index) => database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)').bind(`old-${index}`, workspace, 'old-epoch', 1, Date.now() + 86400_000)));
    const undecided = await request(instance, '/api/session');
    expect(undecided.status).toBe(503);
    expect(await undecided.json()).toEqual({ error: expect.stringContaining('workspace selection') });
    expect((await request(instance, '/api/session', { worker: 2 })).status).toBe(503);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM cuebase_configuration').first()).count).toBe(0);
    expect((await unlock(instance, { worker: 1 })).session.workspaceId).toBe(WORKSPACE);
    expect((await request(instance, '/api/session', { worker: 3 })).status).toBe(503);
    expect((await database.prepare('SELECT workspace_id FROM cuebase_configuration').first()).workspace_id).toBe(WORKSPACE);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash LIKE ?').bind('old-%').first()).count).toBe(2);
  }, 20_000);

  it('invalidates old sessions after a dashboard PIN change while keeping the same library', async () => {
    const nextPin = '00648217';
    const instance = await runtime();
    const first = await unlock(instance);
    await commit(instance, first.cookie, first.session.workspaceId);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    const configuration = await database.prepare('SELECT * FROM cuebase_configuration').first();
    await instance.setOptions(options([{ PIN: nextPin }]));
    const oldSession = await request(instance, '/api/session', { cookie: first.cookie });
    expect((await oldSession.json()).authenticated).toBe(false);
    expect(oldSession.headers.get('set-cookie')).toBeNull();
    expect((await request(instance, '/api/unlock', { method: 'POST', body: { pin: PIN } })).status).toBe(401);
    const current = await unlock(instance, { body: { pin: nextPin } });
    expect(current.session.workspaceId).toBe(first.session.workspaceId);
    const freshDatabase = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    expect(await freshDatabase.prepare('SELECT * FROM cuebase_configuration').first()).toEqual(configuration);
    expect((await (await request(instance, '/api/records', { cookie: current.cookie })).json()).records).toHaveLength(1);
  }, 20_000);

  it('honors an optional session-secret rotation without changing the dashboard PIN or database', async () => {
    const instance = await runtime([{ PIN, PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url') }]);
    const first = await unlock(instance);
    await instance.setOptions(options([{ PIN, PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url') }]));
    expect((await (await request(instance, '/api/session', { cookie: first.cookie })).json()).authenticated).toBe(false);
    expect((await unlock(instance)).session.workspaceId).toBe(first.session.workspaceId);
  }, 20_000);

  it.each([
    ['missing PIN', {}],
    ['empty PIN', { PIN: '' }],
    ['short PIN', { PIN: '12345' }],
    ['non-digit PIN', { PIN: 'abcdefg' }],
    ['long PIN', { PIN: '1234567890123' }],
    ['invalid workspace override', { PIN, PROMPTA_WORKSPACE_ID: 'not a workspace' }],
    ['invalid secret override', { PIN, PROMPTA_SESSION_SECRET: 'too-short' }],
  ])('fails closed before writing schema for %s', async (_description, bindings) => {
    const instance = await runtime([bindings]);
    const response = await request(instance, '/api/session');
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    const payload = await response.text();
    expect(payload).not.toContain(PIN);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    const tables = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('records', 'cuebase_configuration')").all();
    expect(tables.results).toEqual([]);
  }, 20_000);

  it('reports a missing DB binding with a dashboard setup instruction', async () => {
    const instance = await runtime([{ PIN }], { database: false });
    const response = await request(instance, '/api/session');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringContaining('binding named DB') });
  }, 20_000);

  it('rejects insecure and cross-origin requests before database initialization', async () => {
    const instance = await runtime();
    expect((await request(instance, '/api/session', { protocol: 'http:' })).status).toBe(403);
    expect((await request(instance, '/api/unlock', { method: 'POST', origin: 'https://elsewhere.test', body: { pin: PIN } })).status).toBe(403);
    expect((await request(instance, '/api/unlock', { method: 'POST', origin: null, body: { pin: PIN } })).status).toBe(403);
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    expect((await database.prepare("SELECT name FROM sqlite_master WHERE name = 'cuebase_configuration'").all()).results).toEqual([]);
  }, 20_000);

  it('still limits concurrent wrong PIN attempts during first initialization', async () => {
    const instance = await runtime();
    const responses = await Promise.all(Array.from({ length: 10 }, () => request(instance, '/api/unlock', { method: 'POST', body: { pin: '999999' } })));
    expect(responses.filter(response => response.status === 401)).toHaveLength(8);
    expect(responses.filter(response => response.status === 429)).toHaveLength(2);
    expect((await request(instance, '/api/unlock', { method: 'POST', body: { pin: PIN } })).status).toBe(429);
  }, 20_000);

  it('cleans expired sessions and old rate buckets after unlock without a scheduled Worker', async () => {
    const instance = await runtime();
    await request(instance, '/api/session');
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    const configuration = await database.prepare('SELECT workspace_id FROM cuebase_configuration').first();
    await database.batch([
      database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)').bind('expired-session', configuration.workspace_id, 'old', 1, 2),
      database.prepare('INSERT INTO rate_limits VALUES (?, ?, ?)').bind('ip:expired-counter', 1, 8),
    ]);
    await unlock(instance);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').bind('expired-session').first()).count).toBe(0);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM rate_limits WHERE bucket_key = ?').bind('ip:expired-counter').first()).count).toBe(0);
    expect((await database.prepare('SELECT COUNT(*) AS count FROM rate_limits').first()).count).toBe(2);
  }, 20_000);

  it('recovers from a repaired configuration after a failed initialization', async () => {
    const instance = await runtime();
    const database = await instance.getD1Database('DB', 'cuebase-dashboard-0');
    await existingSchema(database);
    await database.prepare('CREATE TABLE cuebase_configuration (id INTEGER PRIMARY KEY, workspace_id TEXT NOT NULL, session_secret TEXT NOT NULL)').run();
    await database.prepare('INSERT INTO cuebase_configuration VALUES (1, ?, ?)').bind(WORKSPACE, 'invalid-secret').run();
    expect((await request(instance, '/api/session')).status).toBe(503);
    await database.prepare('UPDATE cuebase_configuration SET session_secret = ? WHERE id = 1').bind(randomBytes(32).toString('base64url')).run();
    expect((await unlock(instance)).session.workspaceId).toBe(WORKSPACE);
  }, 20_000);
});
