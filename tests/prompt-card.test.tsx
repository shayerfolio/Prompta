import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptCard } from '../src/components/PromptCard';
import type { LibrarySnapshot, Prompt } from '../src/domain/types';

const prompt: Prompt = {
  id: 'prompt-1', kind: 'prompt', ownerId: 'local', createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z', revision: 1,
  deletedAt: null, title: 'Cinematic reveal', content: 'Create {{product}}.\n  Preserve this exact spacing.', type: 'Video', categoryId: null,
  tagIds: [], referenceLinks: [], favorite: false, copyCount: 0, lastCopiedAt: null,
};
const snapshot: LibrarySnapshot = {
  ready: true, ownerId: 'local', prompts: [prompt], templates: [], categories: [], tags: [], collections: [], pendingCount: 0, conflicts: [], error: null,
  settings: { id: 'settings', kind: 'settings', ownerId: 'local', createdAt: prompt.createdAt, updatedAt: prompt.updatedAt, revision: 0, deletedAt: null,
    view: 'grid', sort: 'modified', reducedMotion: false, sidebarCollapsed: false, displayName: '' },
};

function setup(overrides: Partial<Parameters<typeof PromptCard>[0]> = {}) {
  const props = {
    prompt, snapshot, onOpen: vi.fn(), onVariables: vi.fn(), onCopy: vi.fn(async () => {}), onFavorite: vi.fn(), onEdit: vi.fn(),
    onDuplicate: vi.fn(), onDelete: vi.fn(), onRestore: vi.fn(), onApply: vi.fn(), ...overrides,
  };
  const result = render(<PromptCard {...props} />);
  return { ...result, ...props };
}

describe('copy-first prompt card', () => {
  it.each(['grid', 'list'] as const)('copies from the main %s button without opening details', async view => {
    const actions = setup({ view });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Cinematic reveal' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
    expect(actions.onCopy).toHaveBeenCalledTimes(1);
    expect(actions.onOpen).not.toHaveBeenCalled();
    expect(actions.onVariables).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Copy Cinematic reveal' })).toHaveLength(1);
  });

  it('copies when the card background or metadata region is clicked', async () => {
    const actions = setup();
    fireEvent.click(screen.getByRole('article'));
    await waitFor(() => expect(actions.onCopy).toHaveBeenCalledTimes(1));
    fireEvent.click(actions.container.querySelector('.card-type')!);
    await waitFor(() => expect(actions.onCopy).toHaveBeenCalledTimes(2));
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('opens variables only from the explicit Variables button without copying or opening history', () => {
    const actions = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Variables for Cinematic reveal' }));
    expect(actions.onVariables).toHaveBeenCalledTimes(1);
    expect(actions.onOpen).not.toHaveBeenCalled();
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
  });

  it('omits Variables for prompts without placeholders and never renders a Details button', () => {
    setup({ prompt: { ...prompt, content: 'A plain prompt without placeholders.' } });
    expect(screen.queryByRole('button', { name: /variables/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
  });

  it('does not copy or open details when favoriting', () => {
    const actions = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(actions.onFavorite).toHaveBeenCalledTimes(1);
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('keeps action-menu selection separate from copying and opening details', async () => {
    const actions = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Cinematic reveal' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(actions.onDuplicate).toHaveBeenCalledTimes(1);
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('opens history from the menu without copying or filling variables', async () => {
    const actions = setup();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Cinematic reveal' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'History' }));
    expect(actions.onOpen).toHaveBeenCalledTimes(1);
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(actions.onVariables).not.toHaveBeenCalled();
  });

  it('never shows Copied when the copy action rejects', async () => {
    const actions = setup({ onCopy: vi.fn(async () => { throw new Error('Clipboard denied'); }) });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Cinematic reveal' }));
    await waitFor(() => expect(actions.onCopy).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByText('Copied')).toBeNull();
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('exposes the main copy action as a native keyboard-focusable button', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Copy Cinematic reveal' }) as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(0);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('keeps Use template explicit without copying or opening details', () => {
    const actions = setup({ prompt: { ...prompt, kind: 'template' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));
    expect(actions.onApply).toHaveBeenCalledTimes(1);
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
  });

  it('does nothing implicitly for trash and retains explicit History and Restore actions', async () => {
    const actions = setup({ prompt: { ...prompt, deletedAt: '2026-11-20T12:00:00.000Z' } });
    fireEvent.click(screen.getByRole('article'));
    fireEvent.click(screen.getByText('Cinematic reveal'));
    expect(screen.queryByRole('button', { name: 'Copy Cinematic reveal' })).toBeNull();
    expect(actions.onCopy).not.toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /variables/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Options for Cinematic reveal' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'History' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(actions.onOpen).toHaveBeenCalledTimes(1);
    expect(actions.onRestore).toHaveBeenCalledTimes(1);
    expect(actions.onCopy).not.toHaveBeenCalled();
  });
});
