import type { BaseEntity, Entity, EntityKind, ExportData, PromptFields, PromptInput, PromptType, SortOrder } from './types';

export const PROMPT_TYPES: PromptType[] = ['Text', 'Image', 'Video', 'Code', 'Other'];
export const SORT_ORDERS: SortOrder[] = ['modified', 'created', 'az', 'za', 'used', 'copies'];
const KINDS: EntityKind[] = ['prompt', 'template', 'category', 'tag', 'collection', 'version', 'settings', 'tombstone'];
const fail = (message: string): never => { throw new Error(message); };
const object = (value: unknown, label: string): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(`${label} must be an object.`);
const str = (value: unknown, label: string, max = 200, empty = false): string => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) ? value : fail(`${label} must be ${empty ? 'text' : 'non-empty text'} of at most ${max.toLocaleString()} characters.`);
const identifier = (value: unknown, label = 'Identifier'): string => {
  const result = str(value, label, 200);
  return /^[A-Za-z0-9:_-]+$/.test(result) ? result : fail(`${label} contains unsupported characters.`);
};
const list = (value: unknown, label: string, max = 50000): unknown[] => Array.isArray(value) && value.length <= max ? value : fail(`${label} must be a list of at most ${max} items.`);
const ids = (value: unknown, label: string, max = 50000): string[] => [...new Set(list(value, label, max).map(item => identifier(item, label)))];
const date = (value: unknown, label: string): string => { const result = str(value, label, 40); return Number.isFinite(Date.parse(result)) ? new Date(result).toISOString() : fail(`${label} is not a valid date.`); };
const nullableDate = (value: unknown, label: string): string | null => value === null ? null : date(value, label);
const bool = (value: unknown, label: string): boolean => typeof value === 'boolean' ? value : fail(`${label} must be true or false.`);
const integer = (value: unknown, label: string): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail(`${label} must be a non-negative integer.`);
export const validateColor = (value: unknown): string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fail('Choose a valid six-digit color.');
export const validateName = (value: unknown, label = 'Name'): string => str(value, label, 120).trim();
export const validateIcon = (value: unknown): string => str(value, 'Icon', 50);

export function isSafeReferenceUrl(value: string): boolean {
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password; } catch { return false; }
}

export function validateReferenceLinks(value: unknown): string[] {
  return [...new Set(list(value, 'Reference links', 30).map(item => {
    const result = str(item, 'Reference link', 4096).trim();
    return isSafeReferenceUrl(result) ? result : fail('Reference links must be valid http:// or https:// URLs without embedded credentials.');
  }))];
}

export function validatePromptFields(value: unknown): PromptFields {
  const record = object(value, 'Prompt');
  if (!PROMPT_TYPES.includes(record.type as PromptType)) fail('Select a valid prompt type.');
  return {
    title: str(record.title, 'Title', 240).trim(),
    content: str(record.content, 'Prompt content', 200000),
    type: record.type as PromptType,
    categoryId: record.categoryId === null ? null : identifier(record.categoryId, 'Category'),
    tagIds: ids(record.tagIds, 'Tags', 200),
    referenceLinks: validateReferenceLinks(record.referenceLinks),
    favorite: bool(record.favorite, 'Favorite'),
  };
}

export function validatePromptInput(input: unknown): PromptInput {
  const record = object(input, 'Prompt');
  if (record.kind !== undefined && record.kind !== 'prompt' && record.kind !== 'template') fail('Invalid prompt kind.');
  return {
    ...validatePromptFields(record),
    ...(record.kind ? { kind: record.kind as 'prompt' | 'template' } : {}),
    ...(record.collectionIds !== undefined ? { collectionIds: ids(record.collectionIds, 'Collections', 500) } : {}),
  };
}

function validateEntityFields(value: unknown): Entity {
  const record = object(value, 'Library record');
  if (!KINDS.includes(record.kind as EntityKind)) fail('The file contains an unknown record type.');
  const base: BaseEntity = {
    id: identifier(record.id), kind: record.kind as EntityKind,
    ownerId: identifier(record.ownerId, 'Owner'), createdAt: date(record.createdAt, 'Created date'),
    updatedAt: date(record.updatedAt, 'Modified date'), revision: integer(record.revision, 'Revision'),
    deletedAt: nullableDate(record.deletedAt, 'Deleted date'),
  };
  if (base.kind === 'settings' && base.id !== 'settings') fail('Settings must use the reserved settings record ID.');
  if (base.id === 'settings' && base.kind !== 'settings' && base.kind !== 'tombstone') fail('The settings record ID cannot be used by another library item.');
  switch (base.kind) {
    case 'prompt': case 'template': return { ...base, kind: base.kind, ...validatePromptFields(record), copyCount: integer(record.copyCount, 'Copy count'), lastCopiedAt: nullableDate(record.lastCopiedAt, 'Last copied date') };
    case 'category': return { ...base, kind: 'category', name: validateName(record.name), color: validateColor(record.color), icon: validateIcon(record.icon) };
    case 'tag': return { ...base, kind: 'tag', name: validateName(record.name), color: validateColor(record.color) };
    case 'collection': return { ...base, kind: 'collection', name: validateName(record.name), description: str(record.description, 'Description', 2000, true), color: validateColor(record.color), icon: validateIcon(record.icon), promptIds: ids(record.promptIds, 'Collection prompts', 10000) };
    case 'version': {
      if (!['edit', 'restore', 'conflict'].includes(record.reason as string)) fail('Invalid revision reason.');
      return { ...base, kind: 'version', promptId: identifier(record.promptId, 'Revision prompt'), snapshot: validatePromptFields(record.snapshot), reason: record.reason as 'edit' | 'restore' | 'conflict' };
    }
    case 'settings': {
      if (record.view !== 'grid' && record.view !== 'list') fail('Invalid default view.');
      if (!SORT_ORDERS.includes(record.sort as SortOrder)) fail('Invalid sort order.');
      return { ...base, kind: 'settings', view: record.view as 'grid' | 'list', sort: record.sort as SortOrder, reducedMotion: bool(record.reducedMotion, 'Reduced motion'), sidebarCollapsed: bool(record.sidebarCollapsed, 'Sidebar state'), displayName: str(record.displayName, 'Display name', 100, true) };
    }
    case 'tombstone': {
      if (!KINDS.includes(record.originalKind as EntityKind)) fail('Invalid deleted record kind.');
      return { ...base, kind: 'tombstone', originalKind: record.originalKind as EntityKind };
    }
  }
}

export function validateEntity(value: unknown): Entity {
  const entity = validateEntityFields(value);
  if (new Blob([JSON.stringify(entity)]).size > 900 * 1024) fail('This record is too large to synchronize safely. Keep each record below 900 KB.');
  return entity;
}

export function validateExport(value: unknown): ExportData {
  const record = object(value, 'Import file');
  if (record.app !== 'Prompta' || record.schemaVersion !== 1) fail('This file is not a supported Cuebase backup (schema version 1).');
  const entities = list(record.entities, 'Library records').map(validateEntity);
  const seen = new Set<string>();
  for (const entity of entities) {
    if (seen.has(entity.id)) fail(`The import file contains duplicate ID ${entity.id}.`);
    seen.add(entity.id);
  }
  return { app: 'Prompta', schemaVersion: 1, exportedAt: date(record.exportedAt, 'Export date'), entities };
}

export function parseLibraryExport(text: string): ExportData {
  if (new Blob([text]).size > 25 * 1024 * 1024) fail('Import files must be smaller than 25 MB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('This file is not valid JSON. Choose an exported Cuebase backup.'); }
  return validateExport(value);
}
