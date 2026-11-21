import { describe, expect, it } from 'vitest';
import { detectVariables, fillVariables } from '../src/domain/variables';
import { filterPrompts } from '../src/domain/search';
import { isSafeReferenceUrl, parseLibraryExport, validatePromptInput } from '../src/domain/validation';
import { defaultSettings } from '../src/data/repository';
import type { LibrarySnapshot, Prompt } from '../src/domain/types';

describe('text-only prompt variables', () => {
  it('detects unique identifiers, including repeated and spaced placeholders', () => {
    expect(detectVariables('Show {{product}} with {{ lighting }}. Finish on {{product}}.')).toEqual(['product', 'lighting']);
    expect(detectVariables('{{{nested}}} {{ }} {{1invalid}} {{valid_name}}')).toEqual(['valid_name']);
  });
  it('replaces values literally without special regex replacement expansion or HTML execution', () => {
    expect(fillVariables('{{value}} + {{value}}', { value: '$& <script>alert(1)</script>' })).toBe('$& <script>alert(1)</script> + $& <script>alert(1)</script>');
  });
  it('preserves unresolved and empty variables, and never mutates the source', () => {
    const original = '{{product}}\n{{lighting}}\n{{missing}}';
    expect(fillVariables(original, { product: 'Lamp', lighting: '  ' })).toBe('Lamp\n{{lighting}}\n{{missing}}');
    expect(original).toBe('{{product}}\n{{lighting}}\n{{missing}}');
    expect(fillVariables('{{toString}}', {})).toBe('{{toString}}');
  });
});

const base = { ownerId: 'owner-a', revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null };
const prompts: Prompt[] = [
  { ...base, id: 'a', kind: 'prompt', title: 'Product reveal', content: 'Cinematic studio lighting', type: 'Video', categoryId: 'video', tagIds: ['realistic'], referenceLinks: [], favorite: true, copyCount: 3, lastCopiedAt: '2026-02-01T00:00:00.000Z' },
  { ...base, id: 'b', kind: 'prompt', title: 'Brand voice', content: 'Warm writing for a website', type: 'Text', categoryId: null, tagIds: [], referenceLinks: [], favorite: false, copyCount: 10, lastCopiedAt: null },
  { ...base, id: 'c', kind: 'prompt', title: 'Deleted idea', content: 'Archived', type: 'Text', categoryId: null, tagIds: [], referenceLinks: [], favorite: true, copyCount: 0, lastCopiedAt: null, deletedAt: '2026-02-02T00:00:00.000Z' },
];
const snapshot: LibrarySnapshot = { ready: true, ownerId: 'owner-a', prompts, templates: [], categories: [{ ...base, id: 'video', kind: 'category', name: 'Video generation', icon: 'video', color: '#FF385C' }], tags: [{ ...base, id: 'realistic', kind: 'tag', name: 'Photorealistic', color: '#ABCDEF' }], collections: [{ ...base, id: 'saas', kind: 'collection', name: 'SaaS launch', description: '', icon: 'folder', color: '#ABCDEF', promptIds: ['a'] }], settings: defaultSettings('owner-a'), pendingCount: 0, conflicts: [], error: null };

describe('shared library query behavior', () => {
  it('searches case-insensitive partial text, categories, tags, types and collections', () => {
    for (const query of ['CINEM', 'generation', 'photo', 'Video', 'SaaS']) expect(filterPrompts(prompts, snapshot, {}, 'modified', query).map(item => item.id)).toEqual(['a']);
  });
  it('combines filters and excludes deleted prompts from ordinary browsing', () => {
    expect(filterPrompts(prompts, snapshot, { categoryId: 'video', tagIds: ['realistic'], collectionId: 'saas', type: 'Video', favorite: true }, 'modified', 'studio').map(item => item.id)).toEqual(['a']);
    expect(filterPrompts(prompts, snapshot, { favorite: true }, 'modified').map(item => item.id)).toEqual(['a']);
    expect(filterPrompts(prompts, snapshot, { collectionId: 'missing' }, 'modified')).toEqual([]);
  });
  it('sorts without modifying the original dataset and shares results between views', () => {
    expect(filterPrompts(prompts, snapshot, {}, 'copies').map(item => item.id)).toEqual(['b', 'a']);
    expect(filterPrompts(prompts, snapshot, {}, 'used').map(item => item.id)).toEqual(['a', 'b']);
    expect(filterPrompts(prompts, snapshot, {}, 'az').map(item => item.id)).toEqual(['b', 'a']);
    expect(prompts.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('untrusted input validation', () => {
  it('allows web references and rejects executable or credential-bearing URLs', () => {
    expect(isSafeReferenceUrl('https://example.com/reference?q=1')).toBe(true);
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///private', 'https://user:secret@example.com', 'not a URL']) expect(isSafeReferenceUrl(value)).toBe(false);
  });
  it('preserves raw content formatting while validating the title and required fields', () => {
    const raw = '  First line\n\n    Indented {{variable}}\n';
    const result = validatePromptInput({ ...prompts[0], content: raw });
    expect(result.content).toBe(raw);
    expect(() => validatePromptInput({ ...prompts[0], title: '  ' })).toThrow(/Title/);
    expect(() => validatePromptInput({ ...prompts[0], content: '' })).toThrow(/content/);
  });
  it('rejects malformed JSON and unknown schema versions', () => {
    expect(() => parseLibraryExport('{bad')).toThrow(/JSON/);
    expect(() => parseLibraryExport(JSON.stringify({ app: 'Prompta', schemaVersion: 2, entities: [] }))).toThrow(/schema/);
  });
});
