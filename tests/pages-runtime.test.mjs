// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { Log, LogLevel, Miniflare } from 'miniflare';
import { buildPages } from '../scripts/build-pages.mjs';

const LOCAL_PIN = '002967';
let directory;
let processHandle;
let origin;
let bundle;
let output = '';

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'cuebase-pages-'));
  const assets = resolve(directory, 'dist');
  await mkdir(assets);
  await buildPages(assets);
  bundle = await readFile(resolve(assets, '_worker.js'), 'utf8');
  await writeFile(resolve(assets, 'index.html'), '<!doctype html><html><head><title>Cuebase runtime test</title></head><body>Cuebase app</body></html>');
  await writeFile(resolve(assets, '_routes.json'), await readFile('public/_routes.json'));
  await writeFile(resolve(assets, '_headers'), await readFile('public/_headers'));
  await writeFile(resolve(directory, '.dev.vars'), `PIN="${LOCAL_PIN}"\nPROMPTA_ALLOW_INSECURE_LOCAL_DEV="true"\n`, { mode: 0o600 });

  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((done, reject) => listener.close(error => error ? reject(error) : done()));
  origin = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
    'pages', 'dev', assets, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0',
    '--compatibility-date', '2026-11-21', '--d1', 'DB=00000000-0000-0000-0000-000000000000',
    '--persist-to', resolve(directory, 'state')], {
    cwd: directory,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-20_000); });
  processHandle.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-20_000); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Pages emulator stopped before startup: ${output}`);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch { /* Wait for the Pages emulator. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error(`Pages emulator did not start: ${output}`);
}, 40_000);

afterAll(async () => {
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill('SIGTERM');
    await Promise.race([once(processHandle, 'exit'), new Promise(done => setTimeout(done, 3_000))]);
    if (processHandle.exitCode === null) processHandle.kill('SIGKILL');
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('compiled Pages deployment', () => {
  it('serves the app and deep links without a redirect loop, while hiding the server bundle', async () => {
    for (const path of ['/', '/collections/example']) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('Cuebase app');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
    const serverSource = await fetch(`${origin}/_worker.js`);
    expect(await serverSource.text()).not.toContain('PROMPTA_PIN_HASH');
  });

  it('routes the real API through Pages Functions and keeps it separate from the app HTML', async () => {
    const session = await fetch(`${origin}/api/session`);
    expect(session.status).toBe(200);
    expect(session.headers.get('content-type')).toContain('application/json');
    expect(await session.json()).toMatchObject({ authenticated: false, workspaceId: null });
    const unlock = await fetch(`${origin}/api/unlock`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: LOCAL_PIN }),
    });
    expect(unlock.status, await unlock.clone().text()).toBe(200);
    const cookie = unlock.headers.get('set-cookie').split(';')[0];
    const records = await fetch(`${origin}/api/records`, { headers: { Cookie: cookie } });
    expect(await records.json()).toMatchObject({ records: [], hasMore: false });
    for (const path of ['/api', '/api/unknown']) {
      const response = await fetch(`${origin}${path}`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });

  it('requires the dashboard PIN even when obsolete Worker secrets are present', async () => {
    const salt = randomBytes(16);
    const values = {
      PROMPTA_PIN_HASH: `pbkdf2-sha256:100000:${salt.toString('base64url')}:${pbkdf2Sync(LOCAL_PIN, salt, 100000, 32, 'sha256').toString('base64url')}`,
      PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url'),
      PROMPTA_WORKSPACE_ID: 'shared:legacy-pages-config',
    };
    const mf = new Miniflare({
      host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.ERROR),
      workers: [{ config: {
        name: 'cuebase-pages-guard', compatibilityDate: '2026-11-21',
        manifest: { mainModule: 'worker.js', modules: { 'worker.js': { type: 'esm', contents: bundle } } },
        env: { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: 'text', value }])),
          DB: { type: 'd1', id: 'cuebase-pages-guard' } },
      } }],
    });
    try {
      const response = await mf.dispatchFetch('https://cuebase.test/api/session');
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Set the PIN secret in Cloudflare Pages, then redeploy.' });
      const database = await mf.getD1Database('DB');
      const tables = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('cuebase_configuration', 'records', 'sessions')").all();
      expect(tables.results).toEqual([]);
    } finally { await mf.dispose(); }
  });
});
