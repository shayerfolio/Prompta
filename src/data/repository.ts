import type { BaseEntity, Category, Collection, Entity, ExportData, ImportPreview, LibrarySnapshot, Mutation, Prompt, PromptFields, PromptInput, PromptVersion, Settings, SyncConflict, Tag, Tombstone } from '../domain/types';
import { parseLibraryExport, SORT_ORDERS, validateColor, validateEntity, validateExport, validateIcon, validateName, validatePromptInput } from '../domain/validation';
import { db, type PendingMutation, type PromptaDatabase } from './database';

export { db } from './database';
export type { PendingMutation } from './database';
export const VERSION_LIMIT = 20;
export const TRASH_RETENTION_DAYS = 30;
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const isPrompt = (entity: Entity | undefined): entity is Prompt => entity?.kind === 'prompt' || entity?.kind === 'template';
const promptFields = (prompt: Prompt): PromptFields => ({ title: prompt.title, content: prompt.content, type: prompt.type, categoryId: prompt.categoryId, tagIds: [...prompt.tagIds], referenceLinks: [...prompt.referenceLinks], favorite: prompt.favorite });
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function defaultSettings(ownerId = 'local'): Settings {
  return { id: 'settings', kind: 'settings', ownerId, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z', revision: 0, deletedAt: null, view: 'grid', sort: 'modified', reducedMotion: false, sidebarCollapsed: false, displayName: '' };
}
const blankSnapshot = (ownerId: string): LibrarySnapshot => ({ ready: false, ownerId, prompts: [], templates: [], categories: [], tags: [], collections: [], settings: defaultSettings(ownerId), pendingCount: 0, conflicts: [], error: null });
export type CategoryInput = Pick<Category, 'name' | 'color' | 'icon'>;
export type TagInput = Pick<Tag, 'name' | 'color'>;
export type CollectionInput = Pick<Collection, 'name' | 'description' | 'color' | 'icon'> & { promptIds?: string[] };

/** Local commits and their outbox records are one IndexedDB transaction. */
export class LibraryRepository {
  private ownerId = 'local';
  private snapshot: LibrarySnapshot = blankSnapshot('local');
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  readonly db: PromptaDatabase;

  constructor(database: PromptaDatabase = db) {
    this.db = database;
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`prompta-library-${database.name}`);
      this.channel.onmessage = () => { void this.refresh().catch(() => undefined); };
    }
  }

  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): LibrarySnapshot => this.snapshot;
  private emit() { this.listeners.forEach(listener => listener()); }
  private base(kind: Entity['kind'], id: string = uid()): BaseEntity {
    const timestamp = now();
    return { id, kind, ownerId: this.ownerId, createdAt: timestamp, updatedAt: timestamp, revision: 0, deletedAt: null };
  }

  async init(ownerId = 'local'): Promise<void> {
    if (!/^[A-Za-z0-9:_-]{1,200}$/.test(ownerId)) throw new Error('Invalid library owner.');
    this.ownerId = ownerId;
    this.generation++;
    this.snapshot = blankSnapshot(ownerId);
    this.emit();
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    try {
      await this.db.open();
      await this.releaseStaleClaims(ownerId);
      await this.cleanupTrash();
      await this.refresh();
      if (typeof window !== 'undefined') this.cleanupTimer = setInterval(() => { void this.cleanupTrash().catch(() => undefined); }, 60 * 60 * 1000);
    } catch (error) {
      this.snapshot = { ...this.snapshot, ready: true, error: error instanceof Error ? error.message : 'Local storage could not be opened.' };
      this.emit();
      throw error;
    }
  }

  async refresh(): Promise<void> {
    const ownerId = this.ownerId;
    const generation = this.generation;
    const kinds = ['prompt', 'template', 'category', 'tag', 'collection', 'settings'];
    const [records, pendingCount, conflicts] = await Promise.all([
      this.db.entities.where('[ownerId+kind]').anyOf(kinds.map(kind => [ownerId, kind])).toArray(),
      this.db.mutations.where('ownerId').equals(ownerId).count(),
      this.db.conflicts.where('ownerId').equals(ownerId).toArray(),
    ]);
    if (ownerId !== this.ownerId || generation !== this.generation) return;
    const active = records.filter(entity => !entity.deletedAt);
    this.snapshot = {
      ready: true, ownerId,
      prompts: records.filter((entity): entity is Prompt => entity.kind === 'prompt'),
      templates: records.filter((entity): entity is Prompt => entity.kind === 'template'),
      categories: active.filter((entity): entity is Category => entity.kind === 'category').sort((a, b) => a.name.localeCompare(b.name)),
      tags: active.filter((entity): entity is Tag => entity.kind === 'tag').sort((a, b) => a.name.localeCompare(b.name)),
      collections: active.filter((entity): entity is Collection => entity.kind === 'collection').sort((a, b) => a.name.localeCompare(b.name)),
      settings: active.find((entity): entity is Settings => entity.kind === 'settings') || defaultSettings(ownerId),
      pendingCount, conflicts, error: null,
    };
    this.emit();
  }

  private async commit<T>(operation: () => Promise<T>): Promise<T> {
    const ownerAtStart = this.ownerId;
    const value = await this.db.transaction('rw', this.db.entities, this.db.mutations, this.db.conflicts, this.db.drafts, async () => {
      if (this.ownerId !== ownerAtStart) throw new Error('The library was locked before this operation could finish. Unlock it and try again.');
      const result = await operation();
      if (this.ownerId !== ownerAtStart) throw new Error('The library was locked before this operation could finish. Unlock it and try again.');
      return result;
    });
    // Individual operation failures belong to their form/toast. Only init failures
    // set snapshot.error; otherwise a validation error could unmount an open editor.
    await this.refresh();
    this.channel?.postMessage({ ownerId: this.ownerId });
    return value;
  }

  private async entity(id: string): Promise<Entity | undefined> { return this.db.entities.get([this.ownerId, id]); }
  private async requirePrompt(id: string): Promise<Prompt> {
    const value = await this.entity(id);
    if (!isPrompt(value)) throw new Error('This prompt is no longer available.');
    return value;
  }

  /** Only an unsent tail may be coalesced. A claimed payload stays immutable. */
  private async write<T extends Entity>(value: T): Promise<T> {
    const ownerId = this.ownerId;
    if (value.ownerId !== ownerId) throw new Error('Cannot save a record belonging to another owner.');
    const current = await this.entity(value.id);
    const conflict = await this.db.conflicts.where('[ownerId+entityId]').equals([ownerId, value.id]).first();
    const queued = await this.db.mutations.where('[ownerId+entityId]').equals([ownerId, value.id]).toArray();
    const tail = queued.sort((a, b) => b.baseRevision - a.baseRevision)[0];
    const canCoalesce = tail?.status === 'pending' && !tail.sealed;
    const baseRevision = canCoalesce ? tail.baseRevision : (current?.revision || 0);
    const saved = validateEntity({ ...value, revision: conflict ? conflict.remote.revision + 1 : baseRevision + 1 }) as T;
    await this.db.entities.put(saved);
    if (conflict) {
      await this.db.conflicts.put({ ...conflict, local: saved });
      return saved;
    }
    if (canCoalesce) {
      await this.db.mutations.put({ ...tail, entity: saved });
    } else {
      await this.db.mutations.add({ id: uid(), ownerId, entityId: saved.id, baseRevision, entity: saved, createdAt: now(), status: 'pending' });
    }
    return saved;
  }

  private async deleteEntity(entity: Entity): Promise<void> {
    const timestamp = now();
    const deleted: Tombstone = { ...this.base('tombstone', entity.id), createdAt: entity.createdAt, updatedAt: timestamp, deletedAt: timestamp, originalKind: entity.kind === 'tombstone' ? entity.originalKind : entity.kind, kind: 'tombstone' };
    await this.write(deleted);
  }

  private async validateRelationships(input: PromptInput): Promise<void> {
    if (input.categoryId) {
      const category = await this.entity(input.categoryId);
      if (category?.kind !== 'category' || category.deletedAt) throw new Error('Choose an existing category.');
    }
    for (const id of input.tagIds) {
      const tag = await this.entity(id);
      if (tag?.kind !== 'tag' || tag.deletedAt) throw new Error('One of the selected tags is no longer available.');
    }
    for (const id of input.collectionIds || []) {
      const collection = await this.entity(id);
      if (collection?.kind !== 'collection' || collection.deletedAt) throw new Error('One of the selected collections is no longer available.');
    }
  }

  private async addVersion(prompt: Prompt, reason: PromptVersion['reason']): Promise<void> {
    const previous = (await this.db.entities.where('[ownerId+promptId]').equals([this.ownerId, prompt.id]).toArray()).filter((item): item is PromptVersion => item.kind === 'version' && !item.deletedAt);
    const timestamp = new Date(Math.max(Date.now(), ...previous.map(item => Date.parse(item.createdAt) + 1))).toISOString();
    const version: PromptVersion = { ...this.base('version'), createdAt: timestamp, updatedAt: timestamp, kind: 'version', promptId: prompt.id, snapshot: promptFields(prompt), reason };
    await this.write(version);
    const history = (await this.db.entities.where('[ownerId+promptId]').equals([this.ownerId, prompt.id]).toArray()).filter((item): item is PromptVersion => item.kind === 'version' && !item.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    for (const old of history.slice(VERSION_LIMIT)) await this.deleteEntity(old);
  }

  async savePrompt(input: PromptInput, id?: string): Promise<Prompt> {
    const fields = validatePromptInput(input);
    return this.commit(async () => {
      await this.validateRelationships(fields);
      const old = id ? await this.requirePrompt(id) : null;
      if (old?.deletedAt) throw new Error('Restore this prompt before editing it.');
      const { collectionIds, kind, ...content } = fields;
      if (old && !same(promptFields(old), content)) await this.addVersion(old, 'edit');
      const prompt: Prompt = old ? { ...old, ...content, kind: old.kind, updatedAt: now() } : { ...this.base(kind || 'prompt'), ...content, kind: kind || 'prompt', copyCount: 0, lastCopiedAt: null };
      const saved = await this.write(prompt);
      if (collectionIds !== undefined) {
        const collections = await this.db.entities.where('[ownerId+kind]').equals([this.ownerId, 'collection']).toArray() as Collection[];
        for (const collection of collections) {
          const contains = collection.promptIds.includes(saved.id);
          const selected = collectionIds.includes(collection.id);
          if (contains !== selected) await this.write({ ...collection, promptIds: selected ? [...collection.promptIds, saved.id] : collection.promptIds.filter(item => item !== saved.id), updatedAt: now() });
        }
      }
      return saved;
    });
  }

  async toggleFavorite(id: string): Promise<Prompt> { return this.commit(async () => { const prompt = await this.requirePrompt(id); return this.write({ ...prompt, favorite: !prompt.favorite }); }); }
  async recordCopy(id: string): Promise<Prompt> { return this.commit(async () => { const prompt = await this.requirePrompt(id); return this.write({ ...prompt, copyCount: prompt.copyCount + 1, lastCopiedAt: now() }); }); }
  async duplicatePrompt(id: string): Promise<Prompt> {
    return this.commit(async () => {
      const original = await this.requirePrompt(id);
      const copy = await this.write<Prompt>({ ...original, ...this.base(original.kind), kind: original.kind, title: `${original.title.slice(0, 233)} (copy)`, copyCount: 0, lastCopiedAt: null });
      const collections = await this.db.entities.where('[ownerId+kind]').equals([this.ownerId, 'collection']).toArray() as Collection[];
      for (const collection of collections.filter(item => item.promptIds.includes(id))) await this.write({ ...collection, promptIds: [...collection.promptIds, copy.id], updatedAt: now() });
      return copy;
    });
  }

  private async removeFromCollections(id: string): Promise<void> {
    const collections = await this.db.entities.where('[ownerId+kind]').equals([this.ownerId, 'collection']).toArray() as Collection[];
    for (const collection of collections.filter(item => item.promptIds.includes(id))) await this.write({ ...collection, promptIds: collection.promptIds.filter(promptId => promptId !== id), updatedAt: now() });
  }

  async trashPrompt(id: string): Promise<void> {
    await this.commit(async () => {
      const prompt = await this.requirePrompt(id);
      if (prompt.deletedAt) return;
      await this.write({ ...prompt, deletedAt: now(), updatedAt: now() });
      await this.removeFromCollections(id);
    });
  }
  async restorePrompt(id: string): Promise<Prompt> { return this.commit(async () => { const prompt = await this.requirePrompt(id); return this.write({ ...prompt, deletedAt: null, updatedAt: now() }); }); }
  private async purgePrompt(id: string): Promise<void> {
    const prompt = await this.requirePrompt(id);
    await this.deleteEntity(prompt);
    await this.removeFromCollections(id);
    const versions = await this.db.entities.where('[ownerId+promptId]').equals([this.ownerId, id]).toArray();
    for (const version of versions) await this.deleteEntity(version);
  }
  async permanentlyDeletePrompt(id: string): Promise<void> { await this.commit(() => this.purgePrompt(id)); }
  async emptyTrash(): Promise<void> {
    await this.commit(async () => {
      const entities = await this.db.entities.where('[ownerId+kind]').anyOf([[this.ownerId, 'prompt'], [this.ownerId, 'template']]).toArray();
      for (const entity of entities.filter(item => item.deletedAt)) await this.purgePrompt(entity.id);
    });
  }
  async cleanupTrash(): Promise<void> {
    const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
    await this.commit(async () => {
      const entities = await this.db.entities.where('[ownerId+kind]').anyOf([[this.ownerId, 'prompt'], [this.ownerId, 'template']]).toArray();
      for (const entity of entities.filter(item => item.deletedAt && Date.parse(item.deletedAt) <= cutoff)) await this.purgePrompt(entity.id);
    });
  }

  private async uniqueName(kind: 'category' | 'tag' | 'collection', name: string, id?: string): Promise<void> {
    const existing = await this.db.entities.where('[ownerId+kind]').equals([this.ownerId, kind]).toArray() as (Category | Tag | Collection)[];
    if (existing.some(item => item.id !== id && !item.deletedAt && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error(`A ${kind} with this name already exists.`);
  }
  async saveCategory(input: CategoryInput, id?: string): Promise<Category> {
    const fields = { name: validateName(input.name), color: validateColor(input.color), icon: validateIcon(input.icon) };
    return this.commit(async () => {
      await this.uniqueName('category', fields.name, id);
      const old = id ? await this.entity(id) : undefined;
      if (id && old?.kind !== 'category') throw new Error('This category is no longer available.');
      return this.write({ ...(old || this.base('category')), ...fields, kind: 'category', updatedAt: now() } as Category);
    });
  }
  async deleteCategory(id: string, reassignTo: string | null = null): Promise<void> {
    if (id === reassignTo) throw new Error('Choose a different category for reassignment.');
    await this.commit(async () => {
      const category = await this.entity(id);
      if (category?.kind !== 'category') throw new Error('This category is no longer available.');
      if (reassignTo && (await this.entity(reassignTo))?.kind !== 'category') throw new Error('Choose an existing replacement category.');
      const prompts = await this.db.entities.where('[ownerId+kind]').anyOf([[this.ownerId, 'prompt'], [this.ownerId, 'template']]).toArray() as Prompt[];
      for (const prompt of prompts.filter(item => item.categoryId === id)) await this.write({ ...prompt, categoryId: reassignTo, updatedAt: now() });
      await this.deleteEntity(category);
    });
  }
  async saveTag(input: TagInput, id?: string): Promise<Tag> {
    const fields = { name: validateName(input.name, 'Tag name'), color: validateColor(input.color) };
    return this.commit(async () => {
      await this.uniqueName('tag', fields.name, id);
      const old = id ? await this.entity(id) : undefined;
      if (id && old?.kind !== 'tag') throw new Error('This tag is no longer available.');
      return this.write({ ...(old || this.base('tag')), ...fields, kind: 'tag', updatedAt: now() } as Tag);
    });
  }
  async deleteTag(id: string): Promise<void> {
    await this.commit(async () => {
      const tag = await this.entity(id);
      if (tag?.kind !== 'tag') throw new Error('This tag is no longer available.');
      const prompts = await this.db.entities.where('[ownerId+kind]').anyOf([[this.ownerId, 'prompt'], [this.ownerId, 'template']]).toArray() as Prompt[];
      for (const prompt of prompts.filter(item => item.tagIds.includes(id))) await this.write({ ...prompt, tagIds: prompt.tagIds.filter(tagId => tagId !== id), updatedAt: now() });
      await this.deleteEntity(tag);
    });
  }
  async saveCollection(input: CollectionInput, id?: string): Promise<Collection> {
    const fields = { name: validateName(input.name), color: validateColor(input.color), icon: validateIcon(input.icon), description: typeof input.description === 'string' ? input.description.trim() : '' };
    if (fields.description.length > 2000) throw new Error('Collection descriptions can have at most 2,000 characters.');
    return this.commit(async () => {
      await this.uniqueName('collection', fields.name, id);
      const old = id ? await this.entity(id) : undefined;
      if (id && old?.kind !== 'collection') throw new Error('This collection is no longer available.');
      const promptIds = [...new Set(input.promptIds ?? (old?.kind === 'collection' ? old.promptIds : []))];
      for (const promptId of promptIds) { const prompt = await this.requirePrompt(promptId); if (prompt.deletedAt) throw new Error('Restore deleted prompts before adding them to a collection.'); }
      return this.write({ ...(old || this.base('collection')), ...fields, promptIds, kind: 'collection', updatedAt: now() } as Collection);
    });
  }
  async deleteCollection(id: string): Promise<void> { await this.commit(async () => { const value = await this.entity(id); if (value?.kind !== 'collection') throw new Error('This collection is no longer available.'); await this.deleteEntity(value); }); }
  async setCollectionPrompts(id: string, ids: string[]): Promise<Collection> {
    return this.commit(async () => {
      const value = await this.entity(id);
      if (value?.kind !== 'collection') throw new Error('This collection is no longer available.');
      const promptIds = [...new Set(ids)];
      for (const promptId of promptIds) { const prompt = await this.requirePrompt(promptId); if (prompt.deletedAt) throw new Error('Restore deleted prompts before adding them to a collection.'); }
      return this.write({ ...value, promptIds, updatedAt: now() });
    });
  }

  async getVersions(id: string): Promise<PromptVersion[]> {
    return (await this.db.entities.where('[ownerId+promptId]').equals([this.ownerId, id]).toArray()).filter((value): value is PromptVersion => value.kind === 'version' && !value.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }
  /** Cloud hydration calls this after loading history so retention includes uncached revisions. */
  async pruneVersions(promptId: string, removeAll = false): Promise<void> {
    await this.commit(async () => {
      const history = await this.getVersions(promptId);
      const prompt = await this.entity(promptId);
      const purge = removeAll || prompt?.kind === 'tombstone';
      for (const version of history.slice(purge ? 0 : VERSION_LIMIT)) await this.deleteEntity(version);
    });
  }
  async restoreVersion(promptId: string, versionId: string): Promise<Prompt> {
    return this.commit(async () => {
      const prompt = await this.requirePrompt(promptId);
      const version = await this.entity(versionId);
      if (version?.kind !== 'version' || version.promptId !== promptId || version.deletedAt) throw new Error('This revision is no longer available.');
      await this.addVersion(prompt, 'restore');
      const fields = { ...version.snapshot, tagIds: [...version.snapshot.tagIds] };
      if (fields.categoryId && (await this.entity(fields.categoryId))?.kind !== 'category') fields.categoryId = null;
      fields.tagIds = (await Promise.all(fields.tagIds.map(id => this.entity(id)))).filter((item): item is Tag => item?.kind === 'tag').map(tag => tag.id);
      return this.write({ ...prompt, ...fields, updatedAt: now() });
    });
  }
  async saveSettings(partial: Partial<Pick<Settings, 'view' | 'sort' | 'reducedMotion' | 'sidebarCollapsed' | 'displayName'>>): Promise<Settings> {
    if (partial.view !== undefined && !['grid', 'list'].includes(partial.view)) throw new Error('Choose grid or list view.');
    if (partial.sort !== undefined && !SORT_ORDERS.includes(partial.sort)) throw new Error('Choose a valid default sort.');
    if (partial.displayName !== undefined && (typeof partial.displayName !== 'string' || partial.displayName.length > 100)) throw new Error('Display names can have at most 100 characters.');
    return this.commit(async () => {
      const existing = await this.entity('settings');
      const settings = existing?.kind === 'settings' ? existing : { ...defaultSettings(this.ownerId), createdAt: now() };
      return this.write({ ...settings, ...partial, updatedAt: now() });
    });
  }

  async getDraft<T = unknown>(key: string, ownerId = this.ownerId): Promise<T | undefined> { return (await this.db.drafts.get([ownerId, key]))?.value as T | undefined; }
  async saveDraft(key: string, value: unknown, ownerId = this.ownerId): Promise<void> { await this.db.drafts.put({ ownerId, key, value, updatedAt: now() }); }
  async deleteDraft(key: string, ownerId = this.ownerId): Promise<void> { await this.db.drafts.delete([ownerId, key]); }

  async exportLibrary(): Promise<ExportData> {
    const entities = await this.db.entities.where('ownerId').equals(this.ownerId).toArray();
    return { app: 'Prompta', schemaVersion: 1, exportedAt: now(), entities: entities.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)) };
  }
  async deviceLibraryForImport(): Promise<ExportData | null> {
    if (this.ownerId === 'local' || this.ownerId === 'signed-out') return null;
    const entities = await this.db.entities.where('ownerId').equals('local').toArray();
    if (!entities.some(entity => entity.kind !== 'settings' && entity.kind !== 'tombstone')) return null;
    return { app: 'Prompta', schemaVersion: 1, exportedAt: now(), entities };
  }
  async previewImport(text: string): Promise<ImportPreview> {
    const data = parseLibraryExport(text);
    const existing = new Set((await this.db.entities.where('ownerId').equals(this.ownerId).primaryKeys()).map(key => key[1]));
    const importedIds = new Set(data.entities.map(entity => entity.id));
    const validIds = new Set([...existing, ...importedIds]);
    const warnings = new Set<string>();
    for (const entity of data.entities) {
      if (isPrompt(entity)) {
        if (entity.categoryId && !validIds.has(entity.categoryId)) warnings.add('Missing categories will be removed from imported prompts.');
        if (entity.tagIds.some(id => !validIds.has(id))) warnings.add('Missing tags will be removed from imported prompts.');
      }
      if (entity.kind === 'collection' && entity.promptIds.some(id => !validIds.has(id))) warnings.add('Unavailable prompts will be removed from imported collections.');
      if (entity.kind === 'version' && !validIds.has(entity.promptId)) warnings.add('Revisions without a matching prompt will be skipped.');
      if (entity.kind === 'tombstone') warnings.add('Deletion markers are retained in exports for recovery, but are never applied by an import.');
    }
    if (data.entities.some(entity => entity.kind === 'settings') && existing.has('settings')) warnings.add('Existing settings will be preserved.');
    const count = (kind: Entity['kind']) => data.entities.filter(item => item.kind === kind).length;
    return { data, prompts: count('prompt'), templates: count('template'), categories: count('category'), tags: count('tag'), collections: count('collection'), versions: count('version'), duplicates: data.entities.filter(item => existing.has(item.id)).length, warnings: [...warnings] };
  }

  async importLibrary(input: ExportData, mode: 'skip' | 'copy'): Promise<{ imported: number; skipped: number }> {
    if (mode !== 'skip' && mode !== 'copy') throw new Error('Choose how to handle duplicate records.');
    const data = validateExport(input);
    return this.commit(async () => {
      const current = await this.db.entities.where('ownerId').equals(this.ownerId).toArray();
      const existing = new Map(current.map(entity => [entity.id, entity]));
      const mapping = new Map<string, string>();
      let skipped = 0;
      for (const entity of data.entities) {
        if (entity.kind === 'tombstone' || (entity.kind === 'settings' && existing.has('settings'))) { skipped++; continue; }
        if (mode === 'skip' && existing.has(entity.id)) { mapping.set(entity.id, entity.id); skipped++; continue; }
        mapping.set(entity.id, entity.kind === 'settings' ? 'settings' : mode === 'copy' ? uid() : entity.id);
      }
      const planned = data.entities.filter(entity => mapping.has(entity.id) && entity.kind !== 'tombstone' && !(mode === 'skip' && existing.has(entity.id)) && !(entity.kind === 'settings' && existing.has('settings')));
      const importedKinds = new Map(planned.map(entity => [mapping.get(entity.id)!, entity.kind]));
      const remap = (id: string, kinds: Entity['kind'][]): string | null => {
        const mapped = mapping.get(id) || (existing.has(id) ? id : null);
        if (!mapped) return null;
        const kind = importedKinds.get(mapped) || existing.get(mapped)?.kind;
        return kind && kinds.includes(kind) ? mapped : null;
      };
      let imported = 0;
      for (const entity of planned) {
        let copy = { ...entity, id: mapping.get(entity.id)!, ownerId: this.ownerId, revision: 0 } as Entity;
        if (isPrompt(copy)) copy = { ...copy, categoryId: copy.categoryId ? remap(copy.categoryId, ['category']) : null, tagIds: copy.tagIds.map(id => remap(id, ['tag'])).filter((id): id is string => !!id) };
        if (copy.kind === 'collection') copy = { ...copy, promptIds: copy.promptIds.map(id => remap(id, ['prompt', 'template'])).filter((id): id is string => !!id) };
        if (copy.kind === 'version') {
          const promptId = remap(copy.promptId, ['prompt', 'template']);
          if (!promptId) { skipped++; continue; }
          copy = { ...copy, promptId, snapshot: { ...copy.snapshot, categoryId: copy.snapshot.categoryId ? remap(copy.snapshot.categoryId, ['category']) : null, tagIds: copy.snapshot.tagIds.map(id => remap(id, ['tag'])).filter((id): id is string => !!id) } };
        }
        await this.write(copy);
        imported++;
      }
      return { imported, skipped };
    });
  }

  async getPendingMutations(ownerId = this.ownerId): Promise<PendingMutation[]> {
    return (await this.db.mutations.where('ownerId').equals(ownerId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.baseRevision - b.baseRevision || a.id.localeCompare(b.id));
  }
  async releaseStaleClaims(ownerId = this.ownerId): Promise<void> {
    await this.db.mutations.where('ownerId').equals(ownerId).modify(mutation => { mutation.status = 'pending'; });
  }
  async claimNextMutation(ownerId = this.ownerId): Promise<PendingMutation | undefined> {
    return this.db.transaction('rw', this.db.mutations, this.db.conflicts, async () => {
      const conflicts = new Set((await this.db.conflicts.where('ownerId').equals(ownerId).toArray()).map(conflict => conflict.entityId));
      const mutations = await this.getPendingMutations(ownerId);
      const candidate = mutations.find(mutation => mutation.status === 'pending' && !conflicts.has(mutation.entityId) && !mutations.some(other => other.entityId === mutation.entityId && (other.status === 'sending' || other.baseRevision < mutation.baseRevision)));
      if (!candidate) return undefined;
      const claimed: PendingMutation = { ...candidate, status: 'sending', sealed: true };
      await this.db.mutations.put(claimed);
      return claimed;
    });
  }
  async rejectMutation(mutationId: string): Promise<void> {
    await this.db.mutations.update(mutationId, { status: 'pending' });
    await this.refresh();
  }
  async acknowledgeMutation(mutationId: string, committedEntity: Entity): Promise<void> {
    const entity = validateEntity(committedEntity);
    await this.commit(async () => {
      const mutation = await this.db.mutations.get(mutationId);
      if (!mutation || mutation.ownerId !== entity.ownerId || mutation.entityId !== entity.id) return;
      await this.db.mutations.delete(mutationId);
      const remaining = await this.db.mutations.where('[ownerId+entityId]').equals([entity.ownerId, entity.id]).toArray();
      const conflict = await this.db.conflicts.where('[ownerId+entityId]').equals([entity.ownerId, entity.id]).first();
      if (!remaining.length && !conflict) await this.db.entities.put(entity);
    });
  }
  private async conflictFor(local: Entity, remote: Entity): Promise<void> {
    const existing = await this.db.conflicts.where('[ownerId+entityId]').equals([local.ownerId, local.id]).first();
    const latestRemote = existing && existing.remote.revision > remote.revision ? existing.remote : remote;
    await this.db.conflicts.put({ id: existing?.id || uid(), ownerId: local.ownerId, entityId: local.id, local, remote: latestRemote, createdAt: existing?.createdAt || now() });
    await this.db.mutations.where('[ownerId+entityId]').equals([local.ownerId, local.id]).delete();
  }
  async recordConflict(mutation: Mutation, remoteInput: Entity): Promise<void> {
    const remote = validateEntity(remoteInput);
    if (remote.ownerId !== mutation.ownerId || remote.id !== mutation.entityId) throw new Error('The cloud conflict does not match this record.');
    await this.commit(async () => {
      const local = await this.db.entities.get([mutation.ownerId, mutation.entityId]);
      await this.conflictFor(local || mutation.entity, remote);
    });
  }
  async applyRemote(input: Entity, mutationId?: string): Promise<void> {
    const remote = validateEntity(input);
    if (remote.ownerId !== this.ownerId) return;
    if (mutationId && await this.db.mutations.get(mutationId)) return this.acknowledgeMutation(mutationId, remote);
    await this.commit(async () => {
      const current = await this.entity(remote.id);
      const conflict = await this.db.conflicts.where('[ownerId+entityId]').equals([remote.ownerId, remote.id]).first();
      if (conflict) { if (remote.revision >= conflict.remote.revision) await this.conflictFor(current || conflict.local, remote); return; }
      const pending = (await this.db.mutations.where('[ownerId+entityId]').equals([remote.ownerId, remote.id]).toArray()).sort((a, b) => a.baseRevision - b.baseRevision);
      if (pending.length) {
        if (remote.revision <= pending[0].baseRevision || pending.some(item => same(item.entity, remote))) return;
        await this.conflictFor(current || pending[pending.length - 1].entity, remote);
        return;
      }
      if (!current || remote.revision > current.revision || (remote.revision === current.revision && !same(current, remote))) await this.db.entities.put(remote);
    });
  }

  async resolveConflict(id: string, strategy: 'local' | 'remote' | 'both'): Promise<void> {
    if (!['local', 'remote', 'both'].includes(strategy)) throw new Error('Choose a conflict resolution.');
    await this.commit(async () => {
      const conflict = await this.db.conflicts.get(id);
      if (!conflict || conflict.ownerId !== this.ownerId) throw new Error('This conflict has already been resolved.');
      const { local, remote } = conflict;
      await this.db.drafts.put({ ownerId: this.ownerId, key: `resolved-conflict:${id}`, value: { ...conflict, resolvedAt: now(), strategy }, updatedAt: now() });
      await this.db.conflicts.delete(id);
      await this.db.mutations.where('[ownerId+entityId]').equals([this.ownerId, conflict.entityId]).delete();
      await this.db.entities.put(remote);
      if (isPrompt(local)) await this.addVersion(local, 'conflict');
      if (isPrompt(remote) && (!isPrompt(local) || !same(promptFields(local), promptFields(remote)))) await this.addVersion(remote, 'conflict');
      if (strategy === 'local') {
        await this.write({ ...local, revision: remote.revision, updatedAt: now() });
      } else if (strategy === 'both') {
        if (local.kind === 'tombstone' || local.kind === 'settings') throw new Error('Choose a single version for settings or a deletion conflict.');
        const copy = { ...local, ...this.base(local.kind), kind: local.kind, updatedAt: now() } as Entity;
        if (isPrompt(copy)) copy.title = `${copy.title.slice(0, 224)} (local conflict)`;
        if (copy.kind === 'category' || copy.kind === 'tag' || copy.kind === 'collection') copy.name = `${copy.name.slice(0, 103)} (local conflict)`;
        await this.write(copy);
      }
    });
  }

  /** Explicit user opt-in only; never called during initialization or unlocking. */
  async loadDemo(): Promise<void> {
    const categories = [
      { name: 'Video generation', color: '#B49AF0', icon: 'video' },
      { name: 'Image generation', color: '#8BBEAB', icon: 'image' },
      { name: 'Writing', color: '#E6BA7C', icon: 'pen' },
    ];
    const categoryIds: string[] = [];
    for (const category of categories) {
      const existing = this.snapshot.categories.find(item => item.name.toLowerCase() === category.name.toLowerCase());
      categoryIds.push(existing?.id || (await this.saveCategory(category)).id);
    }
    const existingTag = this.snapshot.tags.find(item => item.name === 'Creative');
    const tag = existingTag || await this.saveTag({ name: 'Creative', color: '#FF385C' });
    const examples = [
      { title: 'Cinematic product reveal', type: 'Video' as const, categoryId: categoryIds[0], content: 'Create a cinematic reveal for {{product}}. Begin with an intimate detail shot, then slowly pull back to reveal its silhouette. Use {{lighting}} lighting, subtle atmospheric depth, and a restrained color palette. Camera movement: {{camera_movement}}. Keep the product shape, logo, and materials consistent throughout.', favorite: true },
      { title: 'From idea to storyboard', type: 'Text' as const, categoryId: categoryIds[2], content: 'Turn this concept into a clear six-scene storyboard for a SaaS explainer: {{concept}}. For each scene, describe the composition, on-screen copy, transition, and animation direction. Keep the visual language simple and the narrative focused on one customer problem. Audience: {{audience}}.', favorite: true },
      { title: 'Editorial product photography', type: 'Image' as const, categoryId: categoryIds[1], content: 'Photograph {{product}} on a softly textured neutral backdrop. Use a large diffused key light from the upper left and a subtle bounce fill. The composition should feel considered and editorial, with generous negative space for a headline. Lens: 85mm. Preserve realistic materials and natural shadows.', favorite: false },
      { title: 'Make the message human', type: 'Text' as const, categoryId: categoryIds[2], content: 'Rewrite the following message in a warm, direct, professional voice. Keep every factual detail, use natural language, and remove unnecessary jargon. Avoid exaggeration and preserve the original intent.\n\nMessage:\n{{message}}', favorite: false },
      { title: 'A seamless motion loop', type: 'Video' as const, categoryId: categoryIds[0], content: 'Animate {{subject}} in a seamless 6-second loop. Use gentle, continuous movement with the first and last frames matching exactly. Keep the camera fixed, preserve the composition, and avoid changes in lighting or background. Style: {{style}}.', favorite: true },
      { title: 'Find the story in a feature', type: 'Text' as const, categoryId: categoryIds[2], content: 'Help me explain {{feature}} to {{audience}}. Start with the everyday frustration it removes, show how the experience changes, and end with the practical benefit. Give me three short narrative directions, each with a different opening. Keep the language specific and easy to visualize.', favorite: false },
    ];
    const promptIds: string[] = [];
    for (const example of examples) {
      if (this.snapshot.prompts.some(item => item.title === example.title && !item.deletedAt)) continue;
      promptIds.push((await this.savePrompt({ ...example, tagIds: [tag.id], referenceLinks: [], kind: 'prompt' })).id);
    }
    if (promptIds.length && !this.snapshot.collections.some(item => item.name === 'Creative toolkit')) await this.saveCollection({ name: 'Creative toolkit', description: 'A few starting points for your next good idea.', icon: 'sparkles', color: '#FF385C', promptIds });
  }

  dispose(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.channel?.close();
    this.listeners.clear();
  }
}

export const repository = new LibraryRepository();
