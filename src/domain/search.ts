import type { LibrarySnapshot, Prompt, PromptType, SortOrder } from './types';

export interface PromptFilters {
  categoryId?: string;
  tagIds?: string[];
  collectionId?: string;
  type?: PromptType | 'all';
  favorite?: boolean;
  includeDeleted?: boolean;
}

/** Shared by grid, list and future clients; input arrays are never mutated. */
export function filterPrompts(prompts: Prompt[], snapshot: LibrarySnapshot, filters: PromptFilters = {}, sort: SortOrder = 'modified', query = ''): Prompt[] {
  const categories = new Map(snapshot.categories.map(category => [category.id, category.name]));
  const tags = new Map(snapshot.tags.map(tag => [tag.id, tag.name]));
  const collectionNames = new Map<string, string[]>();
  for (const collection of snapshot.collections) {
    for (const id of collection.promptIds) collectionNames.set(id, [...(collectionNames.get(id) || []), collection.name]);
  }
  const collection = filters.collectionId ? snapshot.collections.find(item => item.id === filters.collectionId) : undefined;
  const membership = collection ? new Set(collection.promptIds) : null;
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = prompts.filter(prompt => {
    if (!filters.includeDeleted && prompt.deletedAt) return false;
    if (filters.categoryId && filters.categoryId !== 'all' && (filters.categoryId === 'uncategorized' ? !!prompt.categoryId : prompt.categoryId !== filters.categoryId)) return false;
    if (filters.type && filters.type !== 'all' && prompt.type !== filters.type) return false;
    if (filters.favorite && !prompt.favorite) return false;
    if (filters.tagIds?.length && !filters.tagIds.every(id => prompt.tagIds.includes(id))) return false;
    if (filters.collectionId && (!membership || !membership.has(prompt.id))) return false;
    if (terms.length) {
      const haystack = [prompt.title, prompt.content, prompt.type, categories.get(prompt.categoryId || '') || '', ...prompt.tagIds.map(id => tags.get(id) || ''), ...(collectionNames.get(prompt.id) || [])].join('\n').toLocaleLowerCase();
      if (!terms.every(term => haystack.includes(term))) return false;
    }
    return true;
  });
  return matches.sort((a, b) => {
    let order = 0;
    switch (sort) {
      case 'created': order = b.createdAt.localeCompare(a.createdAt); break;
      case 'az': order = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }); break;
      case 'za': order = b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }); break;
      case 'used': order = (b.lastCopiedAt || '').localeCompare(a.lastCopiedAt || ''); break;
      case 'copies': order = b.copyCount - a.copyCount; break;
      default: order = b.updatedAt.localeCompare(a.updatedAt);
    }
    return order || a.id.localeCompare(b.id);
  });
}
