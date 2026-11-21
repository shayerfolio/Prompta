import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mutation, Prompt } from '../src/domain/types';
const fakes = vi.hoisted(() => ({
  init: vi.fn(async (_owner?: string) => {}),
  applyRemote: vi.fn(async () => {}),
  claimNextMutation: vi.fn(async (_owner?: string): Promise<Mutation | undefined> => undefined),
  rejectMutation: vi.fn(async (_id: string) => {}),
  acknowledgeMutation: vi.fn(async (_id: string, _entity: unknown) => {}),
  pruneVersions: vi.fn(async (_id: string) => {}),
  snapshot: { prompts: [], templates: [], categories: [], collections: [], pendingCount: 0, conflicts: [] },
}));
vi.mock('../src/data/repository', () => ({ repository: {
  init: fakes.init, subscribe: vi.fn(() => () => {}), getSnapshot: () => fakes.snapshot,
  applyRemote: fakes.applyRemote, claimNextMutation: fakes.claimNextMutation,
  rejectMutation: fakes.rejectMutation, acknowledgeMutation: fakes.acknowledgeMutation,
  pruneVersions: fakes.pruneVersions,
} }));

const session = () => ({ authenticated: true, workspaceId: 'shared:test-library', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), backup: { configured: true, lastBackupAt: null, error: null } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<typeof fetch>();
const emptyPage = () => json({ records: [], cursor: 0, hasMore: false });
const serveUnlocked = () => fetchMock.mockImplementation(async input => ['/api/session', '/api/unlock'].includes(String(input)) ? json(session()) : emptyPage());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function promptRecord(id: string): Prompt {
  return { id, ownerId: 'shared:test-library', kind: 'prompt', title: id, content: 'Saved text', type: 'Text', categoryId: null, tagIds: [], referenceLinks: [], favorite: false, copyCount: 0, lastCopiedAt: null, revision: 1, deletedAt: null, createdAt: '2026-11-21T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z' };
}
let instance: import('../src/lib/cloud').PromptaCloud;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); vi.stubEnv('VITE_LOCAL_ONLY', '');
  fakes.applyRemote.mockReset().mockResolvedValue(undefined);
  fakes.claimNextMutation.mockReset().mockResolvedValue(undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async input => String(input).startsWith('/api/records') ? json({ records: [], cursor: 0, hasMore: false }) : json({ authenticated: false, workspaceId: null }));
  const { PromptaCloud } = await import('../src/lib/cloud'); instance = new PromptaCloud();
});
afterEach(() => { instance.dispose(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('shared PIN client boundary', () => {
  it('starts locked and never falls back to an unprotected local library', async () => {
    await instance.init();
    expect(instance.getSnapshot().configured).toBe(true); expect(instance.getSnapshot().user).toBeNull();
    expect(fakes.init).toHaveBeenCalledWith('signed-out'); expect(fakes.init).not.toHaveBeenCalledWith('local');
  });
  it('fails closed if the PIN server is absent', async () => {
    fetchMock.mockResolvedValue(new Response('<html>App</html>', { status: 200 }));
    await instance.init(); expect(instance.getSnapshot().user).toBeNull();
    expect(instance.getSnapshot().error).toContain('PIN access is unavailable'); expect(fakes.init).not.toHaveBeenCalled();
  });
  it('sends a leading-zero PIN only in a same-origin POST and opens the shared workspace', async () => {
    await instance.init();
    fetchMock.mockImplementation(async input => String(input) === '/api/unlock' ? json(session()) : json({ records: [], cursor: 0, hasMore: false }));
    await instance.unlock('001234');
    expect(fakes.init).toHaveBeenLastCalledWith('shared:test-library'); expect(instance.getSnapshot().status).toBe('synced');
    const unlock = fetchMock.mock.calls.find(([path]) => path === '/api/unlock')!;
    expect(unlock[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', body: '{"pin":"001234"}' });
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('001234');
    expect(instance.getSnapshot().backup.lastBackupAt).toBeNull();
  });
  it('rejects a wrong PIN without initializing a shared partition', async () => {
    await instance.init(); fetchMock.mockResolvedValue(json({ error: 'Incorrect PIN.' }, 401));
    await expect(instance.unlock('111111')).rejects.toThrow('Incorrect PIN');
    expect(instance.getSnapshot().user).toBeNull(); expect(fakes.init).toHaveBeenCalledTimes(1); expect(localStorage.getItem('prompta:pin-session')).toBeNull();
  });
  it('does not accept a malformed successful session', async () => {
    await instance.init(); fetchMock.mockResolvedValue(json({ authenticated: true, workspaceId: 'shared:test-library' }));
    await expect(instance.unlock('123456')).rejects.toThrow('could not be opened'); expect(instance.getSnapshot().user).toBeNull();
  });
  it('restores the same shared workspace from the server cookie without asking for an account', async () => {
    fetchMock.mockImplementation(async input => String(input) === '/api/session' ? json(session()) : json({ records: [], cursor: 0, hasMore: false }));
    await instance.init(); expect(instance.getSnapshot().user?.uid).toBe('shared:test-library'); expect(fakes.init).toHaveBeenCalledWith('shared:test-library');
  });
  it('hides cached data immediately when locking, even before the server responds', async () => {
    fetchMock.mockImplementation(async input => String(input) === '/api/session' ? json(session()) : json({ records: [], cursor: 0, hasMore: false }));
    await instance.init(); let finish!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const locking = instance.lock(); expect(instance.getSnapshot().user).toBeNull(); expect(localStorage.getItem('prompta:pin-session')).toBeNull();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); finish(json({ authenticated: false })); await locking;
    expect(fakes.init).toHaveBeenLastCalledWith('signed-out');
  });
  it('does not reopen from a late session response after locking', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation(async input => String(input) === '/api/session' ? new Promise(resolve => { finish = resolve; }) : json({ authenticated: false }));
    const initializing = instance.init(); await instance.lock(); finish(json(session())); await initializing;
    expect(instance.getSnapshot().user).toBeNull(); expect(fakes.init).not.toHaveBeenCalledWith('shared:test-library');
  });
  it('locks on an unauthorized sync response', async () => {
    fetchMock.mockImplementation(async input => String(input) === '/api/session' ? json(session()) : json({ error: 'Session expired.' }, 401));
    await instance.init(); expect(instance.getSnapshot().user).toBeNull(); expect(instance.getSnapshot().status).toBe('signed-out');
    expect(localStorage.getItem('prompta:pin-session')).toBeNull();
  });
  it('reopens previously authorized cached records offline, without claiming sync', async () => {
    const { workspaceId, expiresAt } = session(); localStorage.setItem('prompta:pin-session', JSON.stringify({ workspaceId, expiresAt }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); await instance.init();
    expect(instance.getSnapshot().status).toBe('offline'); expect(instance.getSnapshot().lastSyncAt).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps expired or explicitly locked cached sessions closed offline', async () => {
    localStorage.setItem('prompta:pin-session', JSON.stringify({ workspaceId: 'shared:test-library', expiresAt: new Date(Date.now() - 1).toISOString() }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); await instance.init();
    expect(instance.getSnapshot().user).toBeNull(); expect(instance.getSnapshot().error).toContain('internet');
  });
  it('refuses to apply a record from a different workspace', async () => {
    fetchMock.mockImplementation(async input => String(input) === '/api/session' ? json(session()) : json({ records: [{ entity: { id: 'p1', ownerId: 'another-workspace' }, mutationId: 'm1', cursor: 1 }], cursor: 1, hasMore: false }));
    await instance.init(); expect(instance.getSnapshot().status).toBe('error'); expect(fakes.applyRemote).not.toHaveBeenCalled();
  });
});

describe('PIN session race regressions', () => {
  it('does not let an old unauthorized history response close a newly unlocked session', async () => {
    serveUnlocked(); await instance.init();
    const history = deferred<Response>();
    fetchMock.mockImplementation(async input => String(input).startsWith('/api/versions') ? history.promise : String(input) === '/api/unlock' ? json(session()) : emptyPage());
    const loading = instance.loadVersions('p1');
    const denied = expect(loading).rejects.toThrow('Session expired.');
    await instance.lock(); await instance.unlock('123456');
    history.resolve(json({ error: 'Session expired.' }, 401)); await denied;
    expect(instance.getSnapshot().user?.uid).toBe('shared:test-library');
    expect(fakes.init).toHaveBeenLastCalledWith('shared:test-library');
  });

  it('keeps the gate closed when another tab locks during an outstanding unlock', async () => {
    await instance.init();
    const opening = deferred<Response>();
    fetchMock.mockImplementation(async input => String(input) === '/api/unlock' ? opening.promise : emptyPage());
    const unlock = instance.unlock('123456');
    const rejected = expect(unlock).rejects.toThrow('locked');
    localStorage.setItem('prompta:locked', 'new-lock-from-another-tab');
    window.dispatchEvent(new StorageEvent('storage', { key: 'prompta:locked', newValue: 'new-lock-from-another-tab' }));
    opening.resolve(json(session())); await rejected;
    expect(instance.getSnapshot().user).toBeNull();
    expect(localStorage.getItem('prompta:locked')).toBe('new-lock-from-another-tab');
    expect(fakes.init).not.toHaveBeenCalledWith('shared:test-library');
  });

  it('stays locked in memory if browser storage and server sign-out both fail', async () => {
    serveUnlocked(); await instance.init();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage blocked.', 'SecurityError'); });
    fetchMock.mockImplementation(async input => {
      if (String(input) === '/api/lock') throw new TypeError('Network unavailable.');
      return String(input) === '/api/session' ? json(session()) : emptyPage();
    });
    await instance.lock(); fetchMock.mockClear(); await instance.refresh();
    expect(instance.getSnapshot().user).toBeNull();
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/session')).toBe(false);
    expect(fakes.init).toHaveBeenLastCalledWith('signed-out');
  });

  it('keeps a newer sign-out pending when an older session refresh finishes', async () => {
    serveUnlocked(); await instance.init();
    const sessionResponse = deferred<Response>();
    const lockResponse = deferred<Response>();
    fetchMock.mockImplementation(async input => {
      if (String(input) === '/api/session') return sessionResponse.promise;
      if (String(input) === '/api/lock') return lockResponse.promise;
      return String(input) === '/api/unlock' ? json(session()) : emptyPage();
    });
    const refreshing = instance.refresh();
    const locking = instance.lock();
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/lock')).toBe(true));
    sessionResponse.resolve(json(session())); await refreshing;
    const unlocking = instance.unlock('123456');
    try {
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/unlock')).toBe(false);
    } finally {
      lockResponse.resolve(json({ authenticated: false }));
      await locking; await unlocking;
    }
    expect(instance.getSnapshot().user?.uid).toBe('shared:test-library');
  });

  it('does not repeat completed sign-out after another tab opens a new session', async () => {
    serveUnlocked(); await instance.init(); await instance.lock();
    expect(localStorage.getItem('prompta:locked')).toBe('locked');
    localStorage.removeItem('prompta:locked');
    window.dispatchEvent(new StorageEvent('storage', { key: 'prompta:locked', oldValue: 'locked', newValue: null }));
    fetchMock.mockClear(); await instance.refresh();
    expect(instance.getSnapshot().user).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops queued offline revocation after another tab deliberately unlocks', async () => {
    serveUnlocked(); await instance.init();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await instance.lock();
    const marker = localStorage.getItem('prompta:locked');
    expect(marker).toBeTruthy();
    localStorage.removeItem('prompta:locked');
    window.dispatchEvent(new StorageEvent('storage', { key: 'prompta:locked', oldValue: marker, newValue: null }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fetchMock.mockClear(); await instance.refresh();
    expect(instance.getSnapshot().user).toBeNull();
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/lock')).toBe(false);
  });

  it('closes expired cached access when the server is unreachable but the browser reports online', async () => {
    serveUnlocked(); await instance.init();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86_400_001);
    fetchMock.mockRejectedValue(new TypeError('Network unavailable.'));
    await instance.refresh();
    expect(instance.getSnapshot().user).toBeNull();
    expect(localStorage.getItem('prompta:pin-session')).toBeNull();
    expect(fakes.init).toHaveBeenLastCalledWith('signed-out');
  });

  it('keeps the sync cursor before an interrupted page so unapplied records are replayed', async () => {
    serveUnlocked(); await instance.init();
    const applying = deferred<void>();
    fakes.applyRemote.mockImplementationOnce(() => applying.promise);
    const records = ['first', 'second'].map((id, i) => ({ entity: promptRecord(id), mutationId: `m${i + 1}`, cursor: i + 1 }));
    fetchMock.mockImplementation(async input => String(input).startsWith('/api/records') ? json({ records, cursor: 2, hasMore: false }) : emptyPage());
    const syncing = instance.syncNow();
    await vi.waitFor(() => expect(fakes.applyRemote).toHaveBeenCalledTimes(1));
    await instance.lock(); applying.resolve(); await syncing;
    expect(fakes.applyRemote).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('prompta:pin-sync-cursor:shared:test-library')).toBe('0');
  });

  it('retains an in-flight mutation for retry when locking before its response arrives', async () => {
    serveUnlocked(); await instance.init();
    const entity = promptRecord('pending');
    const mutation: Mutation = { id: 'outbox-id', entityId: entity.id, ownerId: entity.ownerId, baseRevision: 0, entity, createdAt: entity.createdAt };
    fakes.claimNextMutation.mockResolvedValueOnce(mutation);
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async input => String(input) === '/api/mutations' ? pending.promise : emptyPage());
    const syncing = instance.syncNow();
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/mutations')).toBe(true));
    await instance.lock();
    pending.resolve(json({ outcome: 'committed', entity, cursor: 1 })); await syncing;
    expect(fakes.rejectMutation).toHaveBeenCalledWith('outbox-id');
    expect(fakes.acknowledgeMutation).not.toHaveBeenCalled();
    expect(instance.getSnapshot().user).toBeNull();
  });
});
