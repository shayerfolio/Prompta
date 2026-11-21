import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PromptaDatabase } from '../src/data/database';
import { LibraryRepository, VERSION_LIMIT } from '../src/data/repository';
import type { Prompt, PromptInput } from '../src/domain/types';

const fields = (changes: Partial<PromptInput> = {}): PromptInput => ({ title: 'A useful prompt', content: 'Original {{subject}}\n  Keep whitespace.\n', type: 'Text', categoryId: null, tagIds: [], referenceLinks: [], favorite: false, ...changes });
let database: PromptaDatabase;
let repository: LibraryRepository;
beforeEach(async () => {
  database = new PromptaDatabase(`prompta-test-${crypto.randomUUID()}`);
  repository = new LibraryRepository(database);
  await repository.init('owner-a');
});
afterEach(async () => { repository.dispose(); await database.delete(); });

async function acknowledgeAll() {
  for (;;) { const mutation = await repository.claimNextMutation(); if (!mutation) break; await repository.acknowledgeMutation(mutation.id, mutation.entity); }
}

describe('local library persistence and organization', () => {
  it('starts empty, persists prompts and drafts across re-opening, and isolates owners', async () => {
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    const prompt = await repository.savePrompt(fields());
    await repository.saveDraft('new-prompt', { content: 'Unfinished work' });
    repository.dispose();
    database.close();
    repository = new LibraryRepository(database);
    await repository.init('owner-a');
    expect(repository.getSnapshot().prompts[0].content).toBe(prompt.content);
    expect(await repository.getDraft('new-prompt')).toEqual({ content: 'Unfinished work' });
    await repository.init('owner-b');
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    expect(await repository.getDraft('new-prompt')).toBeUndefined();
    await repository.init('owner-a');
    expect(repository.getSnapshot().prompts[0].id).toBe(prompt.id);
  });

  it('previews and imports the former local library without deleting it or exposing other partitions', async () => {
    await repository.savePrompt(fields({ title: 'Other workspace record' }));
    await repository.init('local');
    const original = await repository.savePrompt(fields({ title: 'Existing local prompt' }));
    await repository.init('shared:pin-workspace');
    const deviceLibrary = await repository.deviceLibraryForImport();
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    expect(deviceLibrary?.entities.filter(entity => entity.kind === 'prompt')).toHaveLength(1);
    const preview = await repository.previewImport(JSON.stringify(deviceLibrary));
    await repository.importLibrary(preview.data, 'skip');
    expect(repository.getSnapshot().prompts[0]).toMatchObject({ id: original.id, ownerId: 'shared:pin-workspace', title: original.title });
    await repository.init('local');
    expect(repository.getSnapshot().prompts[0].id).toBe(original.id);
    expect(await repository.deviceLibraryForImport()).toBeNull();
  });

  it('edits in place, retains meaningful versions, and preserves the current text before restoration', async () => {
    const original = await repository.savePrompt(fields());
    await repository.savePrompt(fields({ content: 'Second version' }), original.id);
    expect(repository.getSnapshot().prompts).toHaveLength(1);
    const versions = await repository.getVersions(original.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].snapshot.content).toBe(original.content);
    const restored = await repository.restoreVersion(original.id, versions[0].id);
    expect(restored.id).toBe(original.id);
    expect(restored.content).toBe(original.content);
    expect((await repository.getVersions(original.id)).some(version => version.snapshot.content === 'Second version')).toBe(true);
  });

  it('bounds version retention to the latest 20 saved revisions', async () => {
    const prompt = await repository.savePrompt(fields({ content: 'Version 0' }));
    for (let number = 1; number <= 24; number++) await repository.savePrompt(fields({ content: `Version ${number}` }), prompt.id);
    const versions = await repository.getVersions(prompt.id);
    expect(versions).toHaveLength(VERSION_LIMIT);
    expect(versions[0].snapshot.content).toBe('Version 23');
    expect(versions.at(-1)?.snapshot.content).toBe('Version 4');
  });

  it('prunes newly hydrated remote histories and removes uncached history after permanent deletion', async () => {
    const prompt = await repository.savePrompt(fields());
    await acknowledgeAll();
    for (let index = 0; index < 23; index++) {
      const stamp = new Date(Date.now() + index).toISOString();
      await repository.applyRemote({ id: `cloud-version-${index}`, ownerId: 'owner-a', kind: 'version', revision: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null, promptId: prompt.id, snapshot: fields({ content: `Remote version ${index}` }), reason: 'edit' });
    }
    await repository.pruneVersions(prompt.id);
    expect(await repository.getVersions(prompt.id)).toHaveLength(20);
    await repository.permanentlyDeletePrompt(prompt.id);
    await repository.applyRemote({ id: 'late-cloud-version', ownerId: 'owner-a', kind: 'version', revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null, promptId: prompt.id, snapshot: fields(), reason: 'edit' });
    await repository.pruneVersions(prompt.id);
    expect(await repository.getVersions(prompt.id)).toHaveLength(0);
    expect((await database.entities.get(['owner-a', 'late-cloud-version']))?.kind).toBe('tombstone');
  });

  it('duplicates a prompt with a new identity and independent usage metadata', async () => {
    const prompt = await repository.savePrompt(fields());
    await repository.recordCopy(prompt.id);
    const duplicate = await repository.duplicatePrompt(prompt.id);
    expect(duplicate.id).not.toBe(prompt.id);
    expect(duplicate.content).toBe(prompt.content);
    expect(duplicate.copyCount).toBe(0);
    expect(duplicate.lastCopiedAt).toBeNull();
    expect(repository.getSnapshot().prompts.find(item => item.id === prompt.id)?.copyCount).toBe(1);
  });

  it('reassigns categories and removes tags without leaving broken active prompt references', async () => {
    const source = await repository.saveCategory({ name: 'Video', color: '#ABCDEF', icon: 'video' });
    const target = await repository.saveCategory({ name: 'Creative', color: '#123456', icon: 'sparkles' });
    const tag = await repository.saveTag({ name: 'Product', color: '#FF385C' });
    const prompt = await repository.savePrompt(fields({ categoryId: source.id, tagIds: [tag.id] }));
    await repository.deleteCategory(source.id, target.id);
    await repository.deleteTag(tag.id);
    const saved = repository.getSnapshot().prompts.find(item => item.id === prompt.id)!;
    expect(saved.categoryId).toBe(target.id);
    expect(saved.tagIds).toEqual([]);
    expect(repository.getSnapshot().categories.map(item => item.id)).toEqual([target.id]);
  });

  it('reorders collection references and deletes collections without deleting prompts', async () => {
    const first = await repository.savePrompt(fields({ title: 'First' }));
    const second = await repository.savePrompt(fields({ title: 'Second' }));
    const collection = await repository.saveCollection({ name: 'My collection', description: '', color: '#FF385C', icon: 'folder', promptIds: [first.id, second.id] });
    await repository.setCollectionPrompts(collection.id, [second.id, first.id]);
    expect(repository.getSnapshot().collections[0].promptIds).toEqual([second.id, first.id]);
    await repository.deleteCollection(collection.id);
    expect(repository.getSnapshot().collections).toHaveLength(0);
    expect(repository.getSnapshot().prompts).toHaveLength(2);
  });

  it('soft deletes and restores prompts, and expiry creates durable tombstones', async () => {
    const prompt = await repository.savePrompt(fields());
    await repository.trashPrompt(prompt.id);
    expect(repository.getSnapshot().prompts[0].deletedAt).not.toBeNull();
    await repository.restorePrompt(prompt.id);
    expect(repository.getSnapshot().prompts[0].deletedAt).toBeNull();
    await repository.trashPrompt(prompt.id);
    await database.entities.update(['owner-a', prompt.id], { deletedAt: new Date(Date.now() - 31 * 86400000).toISOString() });
    await repository.cleanupTrash();
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    expect((await database.entities.get(['owner-a', prompt.id]))?.kind).toBe('tombstone');
    expect((await repository.getPendingMutations()).find(item => item.entityId === prompt.id)?.entity.kind).toBe('tombstone');
  });

  it('does not silently create samples and only adds examples after explicit loadDemo', async () => {
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    await repository.loadDemo();
    expect(repository.getSnapshot().prompts).toHaveLength(6);
    await repository.loadDemo();
    expect(repository.getSnapshot().prompts).toHaveLength(6);
  });

  it('validates all changes before committing and keeps existing data on failed saves', async () => {
    const prompt = await repository.savePrompt(fields());
    await expect(repository.savePrompt(fields({ referenceLinks: ['javascript:alert(1)'] }), prompt.id)).rejects.toThrow(/http/);
    await expect(repository.savePrompt(fields({ categoryId: 'missing' }), prompt.id)).rejects.toThrow(/category/);
    expect(repository.getSnapshot().prompts[0].content).toBe(prompt.content);
    expect(await repository.getVersions(prompt.id)).toHaveLength(0);
  });

  it('keeps the library and recovery draft available after a recoverable transaction validation error', async () => {
    await repository.saveCategory({ name: 'Writing', color: '#ABCDEF', icon: 'pen' });
    await repository.saveDraft('new:prompt', { content: 'Unsaved idea' });
    await expect(repository.saveCategory({ name: 'writing', color: '#123456', icon: 'pen' })).rejects.toThrow(/already exists/);
    expect(repository.getSnapshot().ready).toBe(true);
    expect(repository.getSnapshot().error).toBeNull();
    expect(repository.getSnapshot().categories).toHaveLength(1);
    expect(await repository.getDraft('new:prompt')).toEqual({ content: 'Unsaved idea' });
    await repository.savePrompt(fields());
    expect(repository.getSnapshot().prompts).toHaveLength(1);
  });
});

describe('durable compare-and-swap outbox', () => {
  it('coalesces unsent edits while preserving the original base revision and mutation ID', async () => {
    const prompt = await repository.savePrompt(fields());
    const first = (await repository.getPendingMutations()).find(item => item.entityId === prompt.id)!;
    await repository.savePrompt(fields({ content: 'Latest unsent content' }), prompt.id);
    const pending = (await repository.getPendingMutations()).filter(item => item.entityId === prompt.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(first.id);
    expect(pending[0].baseRevision).toBe(0);
    expect((pending[0].entity as Prompt).content).toBe('Latest unsent content');
    expect(pending[0].entity.revision).toBe(1);
  });

  it('keeps a claimed payload immutable and preserves a subsequent local edit during acknowledgement', async () => {
    const prompt = await repository.savePrompt(fields());
    const claimed = (await repository.claimNextMutation())!;
    expect(claimed.entityId).toBe(prompt.id);
    await repository.savePrompt(fields({ content: 'Written during upload' }), prompt.id);
    const pending = (await repository.getPendingMutations()).filter(item => item.entityId === prompt.id);
    expect(pending).toHaveLength(2);
    expect((pending.find(item => item.id === claimed.id)!.entity as Prompt).content).toBe(prompt.content);
    expect(pending.find(item => item.id !== claimed.id)!.baseRevision).toBe(1);
    await repository.acknowledgeMutation(claimed.id, claimed.entity);
    expect(repository.getSnapshot().prompts[0].content).toBe('Written during upload');
    await acknowledgeAll();
    expect(repository.getSnapshot().pendingCount).toBe(0);
    expect(repository.getSnapshot().prompts[0].content).toBe('Written during upload');
  });

  it('never mutates a retry payload when a failed request might already have committed remotely', async () => {
    const prompt = await repository.savePrompt(fields());
    const claimed = (await repository.claimNextMutation())!;
    await repository.rejectMutation(claimed.id);
    await repository.savePrompt(fields({ content: 'After uncertain failure' }), prompt.id);
    const pending = (await repository.getPendingMutations()).filter(item => item.entityId === prompt.id);
    expect(pending).toHaveLength(2);
    expect(pending.find(item => item.id === claimed.id)!.sealed).toBe(true);
    expect((pending.find(item => item.id === claimed.id)!.entity as Prompt).content).toBe(prompt.content);
    await repository.applyRemote(claimed.entity, claimed.id);
    expect(repository.getSnapshot().prompts[0].content).toBe('After uncertain failure');
    expect(repository.getSnapshot().conflicts).toHaveLength(0);
  });

  it('does not resurrect a pending offline deletion when an old cloud snapshot returns', async () => {
    const original = await repository.savePrompt(fields());
    await expect(acknowledgeAll(), 'acknowledge original').resolves.toBeUndefined();
    await expect(repository.trashPrompt(original.id), 'soft delete').resolves.toBeUndefined();
    await expect(repository.applyRemote(original), 'apply stale remote to soft delete').resolves.toBeUndefined();
    expect(repository.getSnapshot().prompts[0].deletedAt).not.toBeNull();
    expect(repository.getSnapshot().conflicts).toHaveLength(0);
    await expect(repository.permanentlyDeletePrompt(original.id), 'permanent delete').resolves.toBeUndefined();
    await expect(repository.applyRemote(original), 'apply stale remote to tombstone').resolves.toBeUndefined();
    expect(repository.getSnapshot().prompts).toHaveLength(0);
    expect((await database.entities.get(['owner-a', original.id]))?.kind).toBe('tombstone');
  });

  it('retains independent offline edits and resolves on top of the actual cloud revision', async () => {
    const original = await repository.savePrompt(fields());
    await acknowledgeAll();
    await repository.savePrompt(fields({ content: 'Local offline work' }), original.id);
    const remote: Prompt = { ...original, content: 'Independent cloud work', revision: original.revision + 1, updatedAt: new Date().toISOString() };
    await repository.applyRemote(remote);
    const conflict = repository.getSnapshot().conflicts[0];
    expect(conflict.local.kind === 'prompt' && conflict.local.content).toBe('Local offline work');
    expect(conflict.remote.kind === 'prompt' && conflict.remote.content).toBe('Independent cloud work');
    expect((await repository.getPendingMutations()).some(item => item.entityId === original.id)).toBe(false);
    await repository.resolveConflict(conflict.id, 'local');
    expect(repository.getSnapshot().conflicts).toHaveLength(0);
    const resolved = repository.getSnapshot().prompts[0];
    expect(resolved.content).toBe('Local offline work');
    const mutation = (await repository.getPendingMutations()).find(item => item.entityId === original.id)!;
    expect(mutation.baseRevision).toBe(remote.revision);
    expect(mutation.entity.revision).toBe(remote.revision + 1);
    expect((await repository.getVersions(original.id)).map(item => item.snapshot.content)).toEqual(expect.arrayContaining(['Local offline work', 'Independent cloud work']));
  });

  it('save-both conflict resolution preserves the cloud original and creates a separate local copy', async () => {
    const original = await repository.savePrompt(fields());
    await acknowledgeAll();
    await repository.savePrompt(fields({ content: 'Local choice' }), original.id);
    await repository.applyRemote({ ...original, content: 'Cloud choice', revision: 2 });
    await repository.resolveConflict(repository.getSnapshot().conflicts[0].id, 'both');
    const prompts = repository.getSnapshot().prompts;
    expect(prompts).toHaveLength(2);
    expect(prompts.find(item => item.id === original.id)?.content).toBe('Cloud choice');
    expect(prompts.find(item => item.id !== original.id)?.content).toBe('Local choice');
  });
});

describe('safe import and export', () => {
  it('round-trips prompt relationships and history, remapping every related ID when copying', async () => {
    const category = await repository.saveCategory({ name: 'Writing', color: '#ABCDEF', icon: 'pen' });
    const tag = await repository.saveTag({ name: 'Friendly', color: '#FF385C' });
    const original = await repository.savePrompt(fields({ categoryId: category.id, tagIds: [tag.id] }));
    await repository.savePrompt(fields({ content: 'Revised', categoryId: category.id, tagIds: [tag.id] }), original.id);
    const collection = await repository.saveCollection({ name: 'Workshop', description: 'Ideas', color: '#ABCDEF', icon: 'folder', promptIds: [original.id] });
    const data = await repository.exportLibrary();
    const preview = await repository.previewImport(JSON.stringify(data));
    expect(preview.prompts).toBe(1);
    expect(preview.versions).toBe(1);
    expect(preview.duplicates).toBe(data.entities.length);
    await repository.importLibrary(preview.data, 'copy');
    const snapshot = repository.getSnapshot();
    const copy = snapshot.prompts.find(item => item.id !== original.id)!;
    expect(copy.categoryId).not.toBe(category.id);
    expect(copy.tagIds[0]).not.toBe(tag.id);
    expect(snapshot.collections.find(item => item.id !== collection.id)?.promptIds).toEqual([copy.id]);
    expect((await repository.getVersions(copy.id))[0].snapshot.content).toBe(original.content);
    expect((await repository.getVersions(copy.id))[0].snapshot.categoryId).toBe(copy.categoryId);
  });

  it('skips duplicate IDs without overwriting newer local content', async () => {
    const prompt = await repository.savePrompt(fields());
    const backup = await repository.exportLibrary();
    await repository.savePrompt(fields({ content: 'New work after backup' }), prompt.id);
    const result = await repository.importLibrary(backup, 'skip');
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(repository.getSnapshot().prompts[0].content).toBe('New work after backup');
  });

  it('rejects malicious reference links and duplicate record identities before any writes', async () => {
    const prompt = await repository.savePrompt(fields());
    const backup = await repository.exportLibrary();
    const malicious = { ...backup, entities: [{ ...prompt, referenceLinks: ['javascript:alert(document.cookie)'] }] };
    await expect(repository.importLibrary(malicious, 'copy')).rejects.toThrow(/http/);
    await expect(repository.previewImport(JSON.stringify({ ...backup, entities: [prompt, prompt] }))).rejects.toThrow(/duplicate ID/);
    expect(repository.getSnapshot().prompts).toHaveLength(1);
  });

  it('rejects reserved settings IDs so import remapping cannot overwrite another imported record', async () => {
    const prompt = await repository.savePrompt(fields());
    await repository.saveSettings({ displayName: 'Owner' });
    const backup = await repository.exportLibrary();
    const collision = { ...backup, entities: backup.entities.map(item => item.kind === 'settings' ? { ...item, id: 'noncanonical-settings' } : item) };
    await expect(repository.importLibrary(collision, 'copy')).rejects.toThrow(/reserved settings/);
    await expect(repository.importLibrary({ ...backup, entities: [{ ...prompt, id: 'settings' }] }, 'skip')).rejects.toThrow(/cannot be used/);
    expect(repository.getSnapshot().settings.displayName).toBe('Owner');
    expect(repository.getSnapshot().prompts).toHaveLength(1);
  });

  it('removes dangling import references and reports them in the preview', async () => {
    const prompt = await repository.savePrompt(fields());
    const data = { app: 'Prompta' as const, schemaVersion: 1 as const, exportedAt: new Date().toISOString(), entities: [{ ...prompt, id: 'new-import', categoryId: 'missing-category', tagIds: ['missing-tag'] }] };
    const preview = await repository.previewImport(JSON.stringify(data));
    expect(preview.warnings).toHaveLength(2);
    await repository.importLibrary(data, 'skip');
    const imported = repository.getSnapshot().prompts.find(item => item.id === 'new-import')!;
    expect(imported.categoryId).toBeNull();
    expect(imported.tagIds).toEqual([]);
  });
});
