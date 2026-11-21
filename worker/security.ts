import type { Env, SessionRow } from './env';
import { HttpError, identifier } from './env';

const encoder = new TextEncoder();
export const PIN_ITERATIONS = 100_000;
export const RATE_WINDOW_SECONDS = 15 * 60;
export const IP_ATTEMPTS = 8;
export const GLOBAL_ATTEMPTS = 60;

export const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromBase64url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded secret.');
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
};
export async function digest(value: string): Promise<string> { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function pinConfiguration(env: Env) {
  const parts = env.PROMPTA_PIN_HASH?.split(':');
  if (!parts || parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== String(PIN_ITERATIONS)) throw new Error('PIN hash is not configured.');
  const salt = fromBase64url(parts[2]);
  const expected = fromBase64url(parts[3]);
  if (salt.byteLength !== 16 || expected.byteLength !== 32) throw new Error('PIN hash has an invalid length.');
  return { salt, expected };
}

export function requireConfiguration(env: Env): string {
  try {
    if (!env.DB?.prepare || !env.PROMPTA_SESSION_SECRET || fromBase64url(env.PROMPTA_SESSION_SECRET).byteLength < 32) throw new Error();
    const workspace = identifier(env.PROMPTA_WORKSPACE_ID, 'Workspace');
    pinConfiguration(env);
    return workspace;
  } catch { throw new HttpError(503, 'Prompta’s server is not configured. Run npm run setup, then start or launch the configured app.'); }
}

export async function verifyPin(pin: string, env: Env): Promise<boolean> {
  const { salt, expected } = pinConfiguration(env);
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  // workerd caps PBKDF2 at 100,000 iterations. Keep setup and verification identical.
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS }, key, 256);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer | Uint8Array, b: ArrayBuffer | Uint8Array): boolean };
  if (typeof subtle.timingSafeEqual !== 'function') throw new HttpError(503, 'Secure PIN verification is unavailable in this runtime.');
  return subtle.timingSafeEqual(derived, expected);
}

const isLoopback = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
export function localHttpAllowed(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  return url.protocol === 'http:' && isLoopback(url.hostname) && env.PROMPTA_ALLOW_INSECURE_LOCAL_DEV === 'true';
}
export function requireSecureTransport(request: Request, env: Env) {
  if (new URL(request.url).protocol !== 'https:' && !localHttpAllowed(request, env)) throw new HttpError(403, 'Use HTTPS to unlock this library.');
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'This request must come from the Prompta website.');
}

function cookieName(request: Request, env: Env) { return localHttpAllowed(request, env) ? 'prompta_dev_session' : '__Host-prompta_session'; }
export function sessionCookie(request: Request, env: Env, token: string, maxAge: number): string {
  return `${cookieName(request, env)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, maxAge)}${localHttpAllowed(request, env) ? '' : '; Secure'}`;
}
function cookieToken(request: Request, env: Env): string | null {
  const name = cookieName(request, env);
  const values = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
async function tokenHash(token: string, env: Env) { return hmac(env.PROMPTA_SESSION_SECRET!, `prompta-session:${token}`); }
async function authEpoch(env: Env) { return hmac(env.PROMPTA_SESSION_SECRET!, `prompta-auth-epoch:${env.PROMPTA_WORKSPACE_ID}:${env.PROMPTA_PIN_HASH}`); }

export async function getSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = cookieToken(request, env);
  if (!token) return null;
  const hash = await tokenHash(token, env);
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ? AND workspace_id = ?').bind(hash, env.PROMPTA_WORKSPACE_ID!).first<SessionRow>();
  if (!session || session.expires_at <= Date.now() || session.auth_epoch !== await authEpoch(env)) return null;
  return session;
}

export async function createSession(env: Env): Promise<{ token: string; expiresAt: string; maxAge: number }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const requested = Number(env.PROMPTA_SESSION_TTL_SECONDS || '604800');
  const maxAge = Number.isInteger(requested) ? Math.max(300, Math.min(requested, 30 * 86400)) : 604800;
  const now = Date.now();
  const expires = now + maxAge * 1000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions(token_hash, workspace_id, auth_epoch, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await tokenHash(token, env), env.PROMPTA_WORKSPACE_ID!, await authEpoch(env), now, expires),
  ]);
  return { token, expiresAt: new Date(expires).toISOString(), maxAge };
}

export async function revokeSession(request: Request, env: Env) {
  const token = cookieToken(request, env);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ? AND workspace_id = ?').bind(await tokenHash(token, env), env.PROMPTA_WORKSPACE_ID!).run();
}

export async function enforceUnlockLimit(request: Request, env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / RATE_WINDOW_SECONDS) * RATE_WINDOW_SECONDS;
  const globalKey = `global:${env.PROMPTA_WORKSPACE_ID}`;
  // Cloudflare sets this header at the edge. Never trust a user-controlled X-Forwarded-For.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipKey = `ip:${await hmac(env.PROMPTA_SESSION_SECRET!, `${env.PROMPTA_WORKSPACE_ID}:${ip}`)}`;
  const statements = [
    env.DB.prepare(`INSERT INTO rate_limits(bucket_key, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN rate_limits.window_start = excluded.window_start THEN MIN(rate_limits.attempts + 1, ?) ELSE 1 END,
      window_start = excluded.window_start RETURNING attempts`).bind(globalKey, windowStart, GLOBAL_ATTEMPTS + 1),
    env.DB.prepare(`INSERT INTO rate_limits(bucket_key, window_start, attempts)
      SELECT ?, ?, 1 WHERE (SELECT attempts FROM rate_limits WHERE bucket_key = ?) <= ?
      ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN rate_limits.window_start = excluded.window_start THEN MIN(rate_limits.attempts + 1, ?) ELSE 1 END,
      window_start = excluded.window_start RETURNING attempts`).bind(ipKey, windowStart, globalKey, GLOBAL_ATTEMPTS, IP_ATTEMPTS + 1),
  ];
  const results = await env.DB.batch<{ attempts: number }>(statements);
  if ((results[0].results[0]?.attempts || 0) > GLOBAL_ATTEMPTS || (results[1].results[0]?.attempts || 0) > IP_ATTEMPTS) {
    const seconds = Math.max(1, windowStart + RATE_WINDOW_SECONDS - now);
    throw new HttpError(429, 'Too many PIN attempts. Please wait before trying again.', { 'Retry-After': String(seconds) });
  }
}
