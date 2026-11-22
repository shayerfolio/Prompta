export type PromptType = 'Text' | 'Image' | 'Video' | 'Code' | 'Other';
export type SortOrder = 'modified' | 'created' | 'az' | 'za' | 'used' | 'copies';
export type EntityKind = 'prompt' | 'template' | 'category' | 'tag' | 'collection' | 'version' | 'settings' | 'tombstone';
export interface BaseEntity {
  id: string; kind: EntityKind; ownerId: string; createdAt: string; updatedAt: string;
  revision: number; deletedAt: string | null;
}
export interface PromptFields {
  title: string; content: string; type: PromptType; categoryId: string | null;
  tagIds: string[]; referenceLinks: string[]; favorite: boolean;
}
export interface Prompt extends BaseEntity, PromptFields {
  kind: 'prompt' | 'template'; copyCount: number; lastCopiedAt: string | null;
}
export type PromptInput = PromptFields & { kind?: 'prompt' | 'template'; collectionIds?: string[] };
export interface Category extends BaseEntity { kind: 'category'; name: string; color: string; icon: string }
export interface Tag extends BaseEntity { kind: 'tag'; name: string; color: string }
export interface Collection extends BaseEntity { kind: 'collection'; name: string; description: string; color: string; icon: string; promptIds: string[] }
export interface PromptVersion extends BaseEntity { kind: 'version'; promptId: string; snapshot: PromptFields; reason: 'edit' | 'restore' | 'conflict' }
export interface Settings extends BaseEntity { kind: 'settings'; view: 'grid' | 'list'; sort: SortOrder; reducedMotion: boolean; sidebarCollapsed: boolean; displayName: string }
export interface Tombstone extends BaseEntity { kind: 'tombstone'; originalKind: EntityKind }
export type Entity = Prompt | Category | Tag | Collection | PromptVersion | Settings | Tombstone;
export interface Mutation { id: string; entityId: string; ownerId: string; baseRevision: number; entity: Entity; createdAt: string }
export interface SyncConflict { id: string; entityId: string; ownerId: string; local: Entity; remote: Entity; createdAt: string }
export interface LibrarySnapshot { ready: boolean; ownerId: string; prompts: Prompt[]; templates: Prompt[]; categories: Category[]; tags: Tag[]; collections: Collection[]; settings: Settings; pendingCount: number; conflicts: SyncConflict[]; error: string | null }
// Keep the original format marker so Cuebase and existing Prompta backups interoperate.
export interface ExportData { app: 'Prompta'; schemaVersion: 1; exportedAt: string; entities: Entity[] }
export interface ImportPreview { data: ExportData; prompts: number; templates: number; categories: number; tags: number; collections: number; versions: number; duplicates: number; warnings: string[] }
export interface CloudState { configured: boolean; status: 'local' | 'signed-out' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error' | 'conflict'; user: { uid: string; displayName: string | null; email: string | null; photoURL: string | null } | null; lastSyncAt: string | null; error: string | null; backup: { configured: boolean; lastBackupAt: string | null; error: string | null } }
