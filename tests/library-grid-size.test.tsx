import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from '../src/pages/LibraryPage';
import { repository } from '../src/data/repository';
import type { LibrarySnapshot, Prompt } from '../src/domain/types';

vi.mock('../src/data/repository', () => ({ repository: { saveSettings: vi.fn() } }));

const prompt: Prompt = {
  id:'prompt-size-test',kind:'prompt',ownerId:'local',createdAt:'2026-11-20T10:00:00.000Z',updatedAt:'2026-11-20T10:00:00.000Z',revision:1,
  deletedAt:null,title:'Test prompt',content:'Full prompt content.',type:'Text',categoryId:null,tagIds:[],referenceLinks:[],favorite:false,copyCount:0,lastCopiedAt:null,
};
const snapshot: LibrarySnapshot = {
  ready:true,ownerId:'local',prompts:[prompt],templates:[],categories:[],tags:[],collections:[],pendingCount:0,conflicts:[],error:null,
  settings:{id:'settings',kind:'settings',ownerId:'local',createdAt:prompt.createdAt,updatedAt:prompt.updatedAt,revision:0,deletedAt:null,view:'grid',sort:'modified',sidebarCollapsed:false,reducedMotion:false,displayName:''},
};
function setup() {
  return render(<LibraryPage page="all" snapshot={snapshot} actions={{open:vi.fn(),copy:vi.fn(async()=>{}),favorite:vi.fn(),edit:vi.fn(),duplicate:vi.fn(),remove:vi.fn(),apply:vi.fn()}} query="" setQuery={vi.fn()} onNew={vi.fn()} onVariables={vi.fn()} restore={vi.fn()} emptyTrash={vi.fn()} onManageCollection={vi.fn()}/>);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(repository.saveSettings).mockResolvedValue(snapshot.settings);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('device-local grid size', () => {
  it('offers a labelled native range, updates card layout and restores its value after remount', () => {
    const first = setup();
    const slider = screen.getByRole('slider',{name:'Card size'}) as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.tabIndex).toBe(0);
    expect(slider.value).toBe('320');
    fireEvent.change(slider,{target:{value:'560'}});
    expect((first.container.querySelector('.prompt-grid') as HTMLElement).style.getPropertyValue('--prompt-card-min-width')).toBe('560px');
    expect(window.localStorage.getItem('prompta:grid-card-width')).toBe('560');
    first.unmount();
    setup();
    expect((screen.getByRole('slider',{name:'Card size'}) as HTMLInputElement).value).toBe('560');
  });

  it('hides the slider in list view while retaining the selected grid size', async () => {
    setup();
    fireEvent.change(screen.getByRole('slider',{name:'Card size'}),{target:{value:'240'}});
    fireEvent.click(screen.getByRole('button',{name:'List view'}));
    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
    expect(repository.saveSettings).toHaveBeenCalledWith({view:'list'});
    fireEvent.click(screen.getByRole('button',{name:'Grid view'}));
    await waitFor(() => expect((screen.getByRole('slider',{name:'Card size'}) as HTMLInputElement).value).toBe('240'));
    expect(repository.saveSettings).toHaveBeenCalledWith({view:'grid'});
  });

  it.each([['invalid','320'],['99999','560'],['-80','240']])('safely handles stored preference %s', (stored,expected) => {
    window.localStorage.setItem('prompta:grid-card-width',stored);
    setup();
    expect((screen.getByRole('slider',{name:'Card size'}) as HTMLInputElement).value).toBe(expected);
  });

  it('keeps resizing usable and reports session-only behavior when storage rejects writes', () => {
    const result = setup();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new DOMException('Blocked','SecurityError'); });
    fireEvent.change(screen.getByRole('slider',{name:'Card size'}),{target:{value:'420'}});
    expect((result.container.querySelector('.prompt-grid') as HTMLElement).style.getPropertyValue('--prompt-card-min-width')).toBe('420px');
    expect(screen.getByText('Card size applies for this session. Device storage is unavailable.')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Copy Test prompt'})).toBeTruthy();
  });
});
