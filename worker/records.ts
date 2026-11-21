import { validateEntity } from '../src/domain/validation';
import type { Entity, Mutation, Tombstone } from '../src/domain/types';
import { digest } from './security';
import { HttpError, identifier, type Env, type RecordRow } from './env';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function validateMutation(input: unknown, workspace: string): Mutation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'A mutation is required.');
  const value = input as Record<string, unknown>;
  let entity: Entity;
  try { entity = validateEntity(value.entity); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'The record is invalid.'); }
  const id = identifier(value.id, 'Mutation ID');
  const entityId = identifier(value.entityId, 'Record ID');
  if (value.ownerId !== workspace || entity.ownerId !== workspace) throw new HttpError(403, 'This record belongs to a different library.');
  if (entityId !== entity.id) throw new HttpError(400, 'The mutation does not match its record.');
  if (!Number.isSafeInteger(value.baseRevision) || Number(value.baseRevision) < 0 || entity.revision !== Number(value.baseRevision) + 1) throw new HttpError(400, 'The record revision is invalid.');
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new HttpError(400, 'The mutation timestamp is invalid.');
  return { id, entityId, ownerId: workspace, baseRevision: Number(value.baseRevision), entity, createdAt: new Date(value.createdAt).toISOString() };
}

export const envelope = (row: RecordRow) => ({ entity: JSON.parse(row.entity_json) as Entity, mutationId: row.mutation_id, cursor: row.cursor });

export async function applyMutation(input: unknown, env: Env) {
  const mutation = validateMutation(input, env.PROMPTA_WORKSPACE_ID!);
  const hash = await digest(canonical(mutation));
  const attempt = crypto.randomUUID();
  const entity = mutation.entity;
  const serialized = JSON.stringify(entity);
  // All four statements execute in one D1 transaction. A receipt is inserted only if
  // the base revision still matches; its monotonic cursor is the change journal.
  // attempt_id prevents a retried historical receipt from writing the record again.
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT INTO mutations(workspace_id, mutation_id, entity_id, payload_hash, revision, attempt_id, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE ((? = 0 AND NOT EXISTS(SELECT 1 FROM records WHERE workspace_id = ? AND id = ?))
        OR EXISTS(SELECT 1 FROM records WHERE workspace_id = ? AND id = ? AND revision = ?))
      ON CONFLICT(workspace_id, mutation_id) DO NOTHING`)
      .bind(mutation.ownerId, mutation.id, entity.id, hash, entity.revision, attempt, Date.now(), mutation.baseRevision,
        mutation.ownerId, entity.id, mutation.ownerId, entity.id, mutation.baseRevision),
    env.DB.prepare(`INSERT INTO records(workspace_id, id, kind, prompt_id, revision, entity_json, mutation_id, cursor)
      SELECT workspace_id, entity_id, ?, ?, revision, ?, mutation_id, cursor FROM mutations
      WHERE workspace_id = ? AND mutation_id = ? AND attempt_id = ?
      ON CONFLICT(workspace_id, id) DO UPDATE SET kind = excluded.kind, prompt_id = excluded.prompt_id,
        revision = excluded.revision, entity_json = excluded.entity_json, mutation_id = excluded.mutation_id, cursor = excluded.cursor`)
      .bind(entity.kind, entity.kind === 'version' ? entity.promptId : null, serialized, mutation.ownerId, mutation.id, attempt),
    env.DB.prepare('SELECT payload_hash, attempt_id, cursor FROM mutations WHERE workspace_id = ? AND mutation_id = ?').bind(mutation.ownerId, mutation.id),
    env.DB.prepare('SELECT * FROM records WHERE workspace_id = ? AND id = ?').bind(mutation.ownerId, entity.id),
  ]);
  const receipt = result[2].results[0] as { payload_hash: string; attempt_id: string; cursor: number } | undefined;
  const row = result[3].results[0] as unknown as RecordRow | undefined;
  if (receipt && receipt.payload_hash !== hash) throw new HttpError(409, 'This mutation ID was already used for different content. Your local changes have not been replaced.');
  if (!receipt) {
    const absent: Tombstone = { id: entity.id, ownerId: mutation.ownerId, kind: 'tombstone', originalKind: entity.kind,
      revision: 0, createdAt: entity.createdAt, updatedAt: new Date().toISOString(), deletedAt: new Date().toISOString() };
    return { outcome: 'conflict' as const, entity: row ? envelope(row).entity : absent, cursor: row?.cursor || 0 };
  }
  if (!row) throw new HttpError(409, 'An acknowledged record is missing on the server. Review the library before retrying.');
  return { outcome: receipt.attempt_id === attempt ? 'committed' as const : 'acknowledged' as const, entity: envelope(row).entity, cursor: row.cursor };
}

function pagination(url: URL) {
  const afterText = url.searchParams.get('after') || '0';
  const limitText = url.searchParams.get('limit') || '100';
  if (!/^\d+$/.test(afterText) || !/^\d+$/.test(limitText)) throw new HttpError(400, 'The pagination cursor is invalid.');
  const after = Number(afterText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Use a valid cursor and a page size from 1 to 100.');
  // A record may approach 900 KiB. Cap rows per response to bound Worker memory.
  return { after, limit: Math.min(limit, 20) };
}

export async function listRecords(url: URL, env: Env, versionsOnly = false) {
  const { after, limit } = pagination(url);
  const includeVersions = ['1', 'true'].includes(url.searchParams.get('includeVersions') || '');
  const promptId = versionsOnly ? identifier(url.searchParams.get('promptId'), 'Prompt ID') : null;
  const statement = versionsOnly
    ? env.DB.prepare('SELECT * FROM records WHERE workspace_id = ? AND kind = ? AND prompt_id = ? AND cursor > ? ORDER BY cursor LIMIT ?').bind(env.PROMPTA_WORKSPACE_ID!, 'version', promptId, after, limit + 1)
    : env.DB.prepare('SELECT * FROM records WHERE workspace_id = ? AND cursor > ? ORDER BY cursor LIMIT ?').bind(env.PROMPTA_WORKSPACE_ID!, after, limit + 1);
  const result = await statement.all<RecordRow>();
  const scanned = result.results.slice(0, limit);
  return {
    records: scanned.filter(row => versionsOnly || includeVersions || row.kind !== 'version').map(envelope),
    // Advance over filtered-out versions as well, so an empty page cannot stall a client.
    cursor: scanned.length ? scanned[scanned.length - 1].cursor : after,
    hasMore: result.results.length > limit,
  };
}
