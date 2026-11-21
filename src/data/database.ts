import Dexie, { type Table } from 'dexie';
import type { Entity, Mutation, SyncConflict } from '../domain/types';

export interface PendingMutation extends Mutation { status: 'pending' | 'sending'; sealed?: boolean }
export interface DraftRecord { ownerId: string; key: string; value: unknown; updatedAt: string }

export class PromptaDatabase extends Dexie {
  entities!: Table<Entity, [string, string]>;
  mutations!: Table<PendingMutation, string>;
  conflicts!: Table<SyncConflict, string>;
  drafts!: Table<DraftRecord, [string, string]>;

  constructor(name = 'prompta-v1') {
    super(name);
    this.version(1).stores({
      entities: '[ownerId+id],ownerId,[ownerId+kind],[ownerId+promptId],updatedAt',
      mutations: 'id,ownerId,[ownerId+entityId],createdAt',
      conflicts: 'id,ownerId,[ownerId+entityId]',
      drafts: '[ownerId+key],ownerId',
    });
  }
}

export const db = new PromptaDatabase();
