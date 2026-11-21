import { describe, expect, it } from 'vitest';
import type { Mutation, Prompt } from '../src/domain/types';
import { decideMutation, describeCloudError } from '../src/lib/sync-protocol';

const prompt: Prompt = {
  id: 'prompt-1', ownerId: 'owner-1', kind: 'prompt', revision: 1,
  createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z', deletedAt: null,
  title: 'Original', content: 'Literal {{variable}}', type: 'Text', categoryId: null,
  tagIds: [], referenceLinks: [], favorite: false, copyCount: 0, lastCopiedAt: null,
};
const mutation: Mutation = { id: 'mutation-1', entityId: prompt.id, ownerId: prompt.ownerId, baseRevision: 0, entity: prompt, createdAt: prompt.createdAt };

describe('transaction conflict protocol', () => {
  it('writes a new entity at revision one', () => {
    expect(decideMutation(mutation, null)).toEqual({ kind: 'write', entity: prompt });
  });
  it('acknowledges an already committed retry without another increment', () => {
    expect(decideMutation(mutation, { entity: prompt, mutationId: mutation.id })).toEqual({ kind: 'acknowledge', entity: prompt });
  });
  it('detects independently edited same-base changes and preserves the remote text', () => {
    const pending = { ...mutation, baseRevision: 1, entity: { ...prompt, content: 'My offline change', revision: 2 } };
    const remote = { ...prompt, content: 'Other device change', revision: 2 };
    expect(decideMutation(pending, { entity: remote, mutationId: 'another-mutation' })).toEqual({ kind: 'conflict', remote });
    expect(pending.entity.content).toBe('My offline change');
  });
  it('increments only the acknowledged base revision', () => {
    const pending = { ...mutation, baseRevision: 1, entity: { ...prompt, content: 'New text', revision: 99 } };
    const result = decideMutation(pending, { entity: prompt, mutationId: 'older-mutation' });
    expect(result.kind).toBe('write');
    if (result.kind === 'write') expect(result.entity.revision).toBe(2);
  });
  it('treats an administratively removed remote record as a conflict, not an automatic resurrection', () => {
    const result = decideMutation({ ...mutation, baseRevision: 3 }, null);
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.remote.kind).toBe('tombstone');
      expect(result.remote.id).toBe(prompt.id);
    }
  });
  it('preserves remote tombstones when an offline edit uses an older revision', () => {
    const tombstone = { id: prompt.id, ownerId: prompt.ownerId, kind: 'tombstone' as const, originalKind: 'prompt' as const,
      createdAt: prompt.createdAt, updatedAt: prompt.updatedAt, deletedAt: prompt.updatedAt, revision: 2 };
    expect(decideMutation({ ...mutation, baseRevision: 1 }, { entity: tombstone, mutationId: 'delete-1' })).toEqual({ kind: 'conflict', remote: tombstone });
  });
});

describe('cloud errors', () => {
  it('gives an actionable authorization failure without exposing a stack', () => {
    expect(describeCloudError({ code: 'permission-denied' })).toContain('PIN');
  });
  it('reports network failures without claiming data was synced', () => {
    expect(describeCloudError({ code: 'unavailable' })).toContain('remain on this device');
  });
});
