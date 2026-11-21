import type { Entity, Mutation, Tombstone } from '../domain/types';

export interface CloudEnvelope {
  entity: Entity;
  mutationId: string;
  committedAt?: unknown;
}

export type MutationDecision =
  | { kind: 'acknowledge'; entity: Entity }
  | { kind: 'conflict'; remote: Entity }
  | { kind: 'write'; entity: Entity };

/** Pure optimistic-concurrency decision. Never mutate local state during the server compare-and-swap. */
export function decideMutation(mutation: Mutation, remote: CloudEnvelope | null): MutationDecision {
  if (remote?.mutationId === mutation.id) return { kind: 'acknowledge', entity: remote.entity };
  const revision = remote?.entity.revision ?? 0;
  if (revision !== mutation.baseRevision) {
    const absent: Tombstone = {
      id: mutation.entityId, kind: 'tombstone', originalKind: mutation.entity.kind,
      ownerId: mutation.ownerId, createdAt: mutation.entity.createdAt,
      updatedAt: mutation.createdAt, deletedAt: mutation.createdAt, revision: 0,
    };
    return { kind: 'conflict', remote: remote?.entity ?? absent };
  }
  return { kind: 'write', entity: { ...mutation.entity, revision: revision + 1 } };
}

export function describeCloudError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied')) return 'The library is locked. Enter your PIN again. Your local changes are safe.';
  if (code.includes('network') || code.includes('unavailable') || error instanceof TypeError) return 'The server could not be reached. Your changes remain on this device and will retry when the connection returns.';
  return error instanceof Error ? error.message : 'Sync failed. Your local changes are safe. Try again.';
}
