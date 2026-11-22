import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { backupStatus, createBackup, maintenance } from './backups';
import { prepareEnvironment } from './bootstrap';
import { HttpError, json, readJson, type Env } from './env';
import { applyMutation, listRecords } from './records';
import { createSession, enforceUnlockLimit, getSession, requireConfiguration, requireOrigin, requireSecureTransport, revokeSession, sessionCookie, verifyPin } from './security';

const locked = { authenticated: false, workspaceId: null, expiresAt: null, backup: { configured: false, lastBackupAt: null, error: null } };

async function api(request: Request, env: Env): Promise<Response> {
  requireSecureTransport(request, env);
  const url = new URL(request.url);
  if (request.method !== 'GET') requireOrigin(request);
  env = await prepareEnvironment(env);
  const workspaceId = requireConfiguration(env);

  if (url.pathname === '/api/session' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json(locked);
    return json({ authenticated: true, workspaceId, expiresAt: new Date(session.expires_at).toISOString(), backup: await backupStatus(env) });
  }
  if (url.pathname === '/api/unlock' && request.method === 'POST') {
    await enforceUnlockLimit(request, env);
    const data = await readJson(request, 1024);
    if (typeof data.pin !== 'string' || !/^[0-9]{6,12}$/.test(data.pin)) throw new HttpError(400, 'Enter a PIN containing 6 to 12 digits.');
    if (!await verifyPin(data.pin, env)) throw new HttpError(401, 'The PIN is incorrect.');
    const session = await createSession(env);
    return json({ authenticated: true, workspaceId, expiresAt: session.expiresAt, backup: await backupStatus(env) }, 200,
      { 'Set-Cookie': sessionCookie(request, env, session.token, session.maxAge) });
  }
  if (url.pathname === '/api/lock' && request.method === 'POST') {
    await revokeSession(request, env);
    return json(locked, 200, { 'Set-Cookie': sessionCookie(request, env, '', 0) });
  }

  const session = await getSession(request, env);
  // A delayed unauthorized response must not erase a newer cookie created by unlock.
  if (!session) throw new HttpError(401, 'Unlock Cuebase to access the shared library.');
  if (url.pathname === '/api/records' && request.method === 'GET') return json(await listRecords(url, env));
  if (url.pathname === '/api/versions' && request.method === 'GET') return json(await listRecords(url, env, true));
  if (url.pathname === '/api/mutations' && request.method === 'POST') {
    const data = await readJson(request);
    return json(await applyMutation(data.mutation, env));
  }
  if (url.pathname === '/api/backups' && request.method === 'GET') return json(await backupStatus(env));
  throw new HttpError(404, 'This API route does not exist.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try { return await api(request, env); }
      catch (error) {
        if (error instanceof HttpError) return json({ error: error.message }, error.status, error.headers);
        // Never include SQL, request bodies, PINs or secrets in a public error response.
        return json({ error: 'The server could not complete this request. Check its database setup and try again. Your local work is preserved.' }, 503);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request as never) as unknown as Promise<Response>;
    return new Response('Build the Cuebase frontend before starting the server.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  },
  async scheduled(_controller: ScheduledController, env: Env, _context: ExecutionContext): Promise<void> {
    env = await prepareEnvironment(env);
    requireConfiguration(env);
    await maintenance(env);
    if (env.BACKUPS) await createBackup(env);
  },
};
