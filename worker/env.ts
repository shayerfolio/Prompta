import type { D1Database, Fetcher, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  BACKUPS?: R2Bucket;
  /** Dashboard-only runtime secret. Never expose this in a VITE_ variable. */
  PIN?: string;
  PROMPTA_WORKSPACE_ID?: string;
  PROMPTA_PIN_HASH?: string;
  PROMPTA_SESSION_SECRET?: string;
  PROMPTA_SESSION_TTL_SECONDS?: string;
  PROMPTA_ALLOW_INSECURE_LOCAL_DEV?: string;
}

export interface RecordRow { workspace_id: string; id: string; kind: string; prompt_id: string | null; revision: number; entity_json: string; mutation_id: string; cursor: number }
export interface SessionRow { token_hash: string; workspace_id: string; auth_epoch: string; created_at: number; expires_at: number }
export interface BackupStatus { configured: boolean; lastBackupAt: string | null; error: string | null }

export class HttpError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}) { super(message); }
}

export const identifier = (value: unknown, label = 'Identifier'): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(value)) throw new HttpError(400, `${label} is invalid.`);
  return value;
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer', ...extra,
  } });
}

export async function readJson(request: Request, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(400, 'Send a JSON request.');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(400, 'This request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(400, 'This request is too large.'); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch { throw new HttpError(400, 'The request is not valid JSON.'); }
}
