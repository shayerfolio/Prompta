import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptEditor } from '../src/components/PromptEditor';
import { PromptDetail } from '../src/components/PromptDetail';
import { VariablesDialog } from '../src/components/VariablesDialog';
import { repository } from '../src/data/repository';
import { copyText } from '../src/lib/clipboard';
import type { LibrarySnapshot, Prompt } from '../src/domain/types';

vi.mock('../src/data/repository', () => ({ repository: {
  getDraft: vi.fn(), saveDraft: vi.fn(), deleteDraft: vi.fn(), savePrompt: vi.fn(),
  saveCategory: vi.fn(), saveTag: vi.fn(), recordCopy: vi.fn(),
  restorePrompt: vi.fn(), getVersions: vi.fn(), restoreVersion: vi.fn(),
} }));
vi.mock('../src/lib/clipboard', () => ({ copyText: vi.fn() }));
vi.mock('../src/lib/cloud', () => ({ cloud: { loadVersions: vi.fn().mockResolvedValue(undefined) } }));

const prompt: Prompt = { id:'prompt-test',kind:'prompt',ownerId:'local',createdAt:'2026-11-20T10:00:00Z',updatedAt:'2026-11-20T10:00:00Z',revision:1,deletedAt:null,title:'Reusable script',content:'Write about {{product}}. Keep {{product}} in a {{tone}} tone.',type:'Text',categoryId:null,tagIds:[],referenceLinks:[],favorite:false,copyCount:0,lastCopiedAt:null };
const snapshot: LibrarySnapshot = { ready:true,ownerId:'local',prompts:[prompt],templates:[],categories:[],tags:[],collections:[],pendingCount:0,conflicts:[],error:null,settings:{id:'settings',kind:'settings',ownerId:'local',createdAt:prompt.createdAt,updatedAt:prompt.updatedAt,revision:1,deletedAt:null,view:'grid',sort:'modified',reducedMotion:false,sidebarCollapsed:false,displayName:''} };
const notify = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.getDraft).mockResolvedValue(undefined);
  vi.mocked(repository.saveDraft).mockResolvedValue(undefined);
  vi.mocked(repository.deleteDraft).mockResolvedValue(undefined);
  vi.mocked(repository.savePrompt).mockResolvedValue(prompt);
  vi.mocked(repository.recordCopy).mockResolvedValue({...prompt,copyCount:1});
  vi.mocked(repository.restorePrompt).mockResolvedValue(prompt);
  vi.mocked(repository.getVersions).mockResolvedValue([]);
  vi.mocked(copyText).mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('filled prompt interactions', () => {
  it('shows unique variable fields and explicitly confirms unresolved placeholders before literal copy', async () => {
    render(<VariablesDialog open prompt={prompt} onClose={vi.fn()} notify={notify}/>);
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('product'),{target:{value:'$& <b>Literal</b>'}});
    fireEvent.click(screen.getByRole('button',{name:'Copy filled prompt'}));
    expect(copyText).not.toHaveBeenCalled();
    expect(screen.getByText('Copy with unfilled variables?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Copy anyway'}));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('Write about $& <b>Literal</b>. Keep $& <b>Literal</b> in a {{tone}} tone.'));
    await waitFor(() => expect(repository.recordCopy).toHaveBeenCalledWith(prompt.id));
    expect(prompt.content).toBe('Write about {{product}}. Keep {{product}} in a {{tone}} tone.');
    expect(document.querySelector('b')).toBeNull();
  });
  it('does not record a copy or display success when the clipboard fails', async () => {
    vi.mocked(copyText).mockRejectedValue(new Error('Clipboard access denied.'));
    render(<VariablesDialog open prompt={prompt} onClose={vi.fn()} notify={notify}/>);
    fireEvent.change(screen.getByLabelText('product'),{target:{value:'Prompta'}});
    fireEvent.change(screen.getByLabelText('tone'),{target:{value:'friendly'}});
    fireEvent.click(screen.getByRole('button',{name:'Copy filled prompt'}));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Clipboard access denied.','error'));
    expect(repository.recordCopy).not.toHaveBeenCalled();
    expect(notify.mock.calls.some(call => call[1] === 'success')).toBe(false);
  });
});

describe('prompt editor data safety', () => {
  it('validates required fields before persisting', async () => {
    render(<PromptEditor open snapshot={{...snapshot,prompts:[]}} onClose={vi.fn()} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Save prompt'}));
    expect(screen.getByText('Title is required.')).toBeTruthy();
    expect(screen.getByText('Prompt content is required.')).toBeTruthy();
    expect(repository.savePrompt).not.toHaveBeenCalled();
  });
  it('edits the existing ID and preserves exact content whitespace', async () => {
    render(<PromptEditor open prompt={prompt} snapshot={snapshot} onClose={vi.fn()} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    const content = ' \n\tHello {{name}} \n\n';
    fireEvent.change(screen.getByLabelText(/^Prompt \*/),{target:{value:content}});
    fireEvent.click(screen.getByRole('button',{name:'Save prompt'}));
    await waitFor(() => expect(repository.savePrompt).toHaveBeenCalledWith(expect.objectContaining({content}),prompt.id));
    expect(repository.deleteDraft).toHaveBeenCalledWith(`prompt:${prompt.id}`, snapshot.ownerId);
  });
  it('offers a saved draft without replacing the current prompt until the user restores it', async () => {
    vi.mocked(repository.getDraft).mockResolvedValue({ title:'Unfinished idea',content:'A private draft',type:'Text',categoryId:null,tagIds:[],collectionIds:[],referenceText:'',favorite:false,kind:'prompt' });
    render(<PromptEditor open prompt={prompt} snapshot={snapshot} onClose={vi.fn()} onSaved={vi.fn()} notify={notify}/>);
    await screen.findByText('Saved draft available.');
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe(prompt.title);
    fireEvent.click(screen.getByRole('button',{name:'Restore draft'}));
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Unfinished idea');
    expect((screen.getByLabelText(/^Prompt \*/) as HTMLTextAreaElement).value).toBe('A private draft');
  });
  it('keeps edits in the editor when the user cancels an unsaved close', async () => {
    const onClose = vi.fn();
    render(<PromptEditor open prompt={prompt} snapshot={snapshot} onClose={onClose} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'An edited title'}});
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('An edited title');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('only discards an unfinished edit after an explicit discard action', async () => {
    const onClose = vi.fn();
    render(<PromptEditor open prompt={prompt} snapshot={snapshot} onClose={onClose} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'Discardable changes'}});
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(repository.deleteDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Discard'}));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(repository.deleteDraft).toHaveBeenCalledWith(`prompt:${prompt.id}`, snapshot.ownerId);
    expect(repository.savePrompt).not.toHaveBeenCalled();
  });
  it('persists an unfinished edit when the user keeps the draft and closes', async () => {
    const onClose = vi.fn();
    render(<PromptEditor open prompt={prompt} snapshot={snapshot} onClose={onClose} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'Continue tomorrow'}});
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    fireEvent.click(screen.getByRole('button',{name:'Keep draft & close'}));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(repository.saveDraft).toHaveBeenCalledWith(`prompt:${prompt.id}`,expect.objectContaining({title:'Continue tomorrow'}), snapshot.ownerId);
    expect(repository.savePrompt).not.toHaveBeenCalled();
  });

  it('keeps queued draft writes in their original workspace after the library locks', async () => {
    const ownerId = 'shared:original-library';
    let activeOwner = ownerId;
    let finishFirst!: () => void;
    const firstWrite = new Promise<void>(resolve => { finishFirst = resolve; });
    const stored = new Map<string, unknown>();
    let writes = 0;
    vi.mocked(repository.saveDraft).mockImplementation(async (key, value, capturedOwner = activeOwner) => {
      if (++writes === 1) await firstWrite;
      stored.set(`${capturedOwner}/${key}`, value);
    });
    const view = render(<PromptEditor open prompt={{...prompt,ownerId}} snapshot={{...snapshot,ownerId}} onClose={vi.fn()} onSaved={vi.fn()} notify={notify}/>);
    await waitFor(() => expect((screen.getByRole('button',{name:'Save prompt'}) as HTMLButtonElement).disabled).toBe(false));
    expect(repository.getDraft).toHaveBeenCalledWith(`prompt:${prompt.id}`, ownerId);
    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'First draft'}});
      await act(async () => { await vi.advanceTimersByTimeAsync(450); });
      expect(repository.saveDraft).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByLabelText(/^Title/),{target:{value:'Latest queued draft'}});
      await act(async () => { await vi.advanceTimersByTimeAsync(450); });
      expect(repository.saveDraft).toHaveBeenCalledTimes(1);
      activeOwner = 'signed-out';
      view.unmount();
      await act(async () => { finishFirst(); });
      expect(repository.saveDraft).toHaveBeenCalledTimes(2);
      expect(stored.get(`${ownerId}/prompt:${prompt.id}`)).toEqual(expect.objectContaining({title:'Latest queued draft'}));
      expect(stored.has(`signed-out/prompt:${prompt.id}`)).toBe(false);
    } finally { finishFirst(); vi.useRealTimers(); }
  });
});

describe('recycle bin detail', () => {
  it('shows a read-only trashed prompt and restores through the repository', async () => {
    const onEdit = vi.fn();
    render(<PromptDetail prompt={{...prompt,deletedAt:'2026-11-20T12:00:00Z'}} snapshot={snapshot} onClose={vi.fn()} onEdit={onEdit} onCopy={vi.fn()} onFavorite={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} notify={notify}/>);
    expect((screen.getByRole('button',{name:'Add to favorites'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button',{name:'Edit prompt content'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Copy original'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Fill variables'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Restore prompt'}));
    await waitFor(() => expect(repository.restorePrompt).toHaveBeenCalledWith(prompt.id));
    expect(onEdit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Prompt restored to your library.','success');
  });
});

describe('responsive detail accessibility', () => {
  it('traps focus and hides the background on mobile, then returns to a nonmodal desktop panel', async () => {
    const original = window.matchMedia;
    let listener: (() => void) | undefined;
    const media = { matches:true, media:'(max-width: 720px)', addEventListener:vi.fn((_name:string,callback:()=>void) => { listener = callback; }), removeEventListener:vi.fn() };
    Object.defineProperty(window,'matchMedia',{ configurable:true, writable:true, value:vi.fn(() => media) });
    try {
      render(<><button data-testid="background-action">Background action</button><PromptDetail prompt={prompt} snapshot={snapshot} onClose={vi.fn()} onEdit={vi.fn()} onCopy={vi.fn()} onFavorite={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} notify={notify}/></>);
      const background = screen.getByTestId('background-action');
      expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
      expect(screen.queryByRole('button',{name:'Background action'})).toBeNull();
      act(() => background.focus());
      expect(document.activeElement).not.toBe(background);
      act(() => { media.matches = false; listener?.(); });
      await waitFor(() => expect(screen.getByRole('dialog').hasAttribute('aria-modal')).toBe(false));
      expect(screen.getByRole('button',{name:'Background action'})).toBeTruthy();
      act(() => background.focus());
      expect(document.activeElement).toBe(background);
    } finally { cleanup(); Object.defineProperty(window,'matchMedia',{ configurable:true, writable:true, value:original }); }
    expect(media.removeEventListener).toHaveBeenCalled();
  });
});
