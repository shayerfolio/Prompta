import type { CloudState, Entity, Mutation } from '../domain/types';
import { repository } from '../data/repository';
import { describeCloudError } from './sync-protocol';

const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true';
const SESSION_KEY = 'prompta:pin-session';
const LOCK_KEY = 'prompta:locked';
const PAGE_SIZE = 100;
const emptyBackup = () => ({ configured: false, lastBackupAt: null, error: null });
interface Session { authenticated: boolean; workspaceId: string | null; expiresAt?: string; backup?: CloudState['backup'] }
interface CachedSession { workspaceId: string; expiresAt: string }
interface Envelope { entity: Entity; mutationId: string; cursor: number }
interface RecordsPage { records: Envelope[]; cursor: number; hasMore: boolean }
interface MutationResult { outcome: 'committed' | 'acknowledged' | 'conflict'; entity: Entity; cursor: number }
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

/** One shared workspace. PIN checks, the HttpOnly cookie and authorization live on the server. */
export class PromptaCloud {
  private state: CloudState = { configured: !localOnly, status: localOnly ? 'local' : 'connecting', user: null, lastSyncAt: null, error: null, backup: emptyBackup() };
  private subscribers = new Set<() => void>();
  private initialization?: Promise<void>;
  private syncing?: Promise<void>;
  private locking?: Promise<void>;
  private syncAgain = false;
  private generation = 0;
  private cursor = 0;
  private unsubscribeRepository?: () => void;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private retryDelay = 1500;
  private refreshing = false;
  private sessionExpiresAt = 0;
  private locallyLocked = false;
  private needsRevocation = false;
  getSnapshot = (): CloudState => this.state;
  subscribe = (listener: () => void) => { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; };
  private update(patch: Partial<CloudState>) { this.state = { ...this.state, ...patch }; this.subscribers.forEach(listener => listener()); }
  init = (): Promise<void> => this.initialization ??= this.initialize();
  private async initialize() {
    if (localOnly) { await repository.init('local'); return; }
    window.addEventListener('online', this.onOnline); window.addEventListener('offline', this.onOffline);
    window.addEventListener('focus', this.onFocus); window.addEventListener('storage', this.onStorage);
    this.pollTimer = setInterval(() => { if (this.state.user && document.visibilityState !== 'hidden') void this.refresh(); }, 10_000);
    await this.refresh();
  }
  private onOnline = () => { void this.refresh(); };
  private onOffline = () => { if (this.state.user) this.update({ status: 'offline' }); };
  private onFocus = () => { if (this.state.user) void this.refresh(); };
  private onStorage = (event: StorageEvent) => {
    if (event.key !== LOCK_KEY) return;
    if (!event.newValue || event.newValue === 'locked') this.needsRevocation = false;
    if (event.newValue) { this.locallyLocked = true; void this.clearSession(); }
  };
  private lockMarker() { try { return localStorage.getItem(LOCK_KEY); } catch { return null; } }
  private isLocked() { return this.locallyLocked || Boolean(this.lockMarker()); }
  private rememberSession(session: CachedSession) {
    this.sessionExpiresAt = Date.parse(session.expiresAt);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Offline reopening is optional. */ }
  }
  private cachedSession(): CachedSession | null {
    if (this.isLocked()) return null;
    try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return value && typeof value.workspaceId === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(value.workspaceId) && Date.parse(value.expiresAt) > Date.now() ? value : null; } catch { return null; }
  }
  private stopSession() {
    this.generation += 1; this.unsubscribeRepository?.(); this.unsubscribeRepository = undefined;
    clearTimeout(this.retryTimer); clearTimeout(this.syncTimer); this.syncAgain = false; this.cursor = 0; this.sessionExpiresAt = 0;
  }
  private async clearSession(message: string | null = null) {
    this.stopSession();
    try { localStorage.removeItem(SESSION_KEY); } catch { /* The UI gate still closes immediately. */ }
    this.update({ user: null, status: 'signed-out', error: message, lastSyncAt: null, backup: emptyBackup() });
    await repository.init('signed-out');
  }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }, signal: AbortSignal.timeout(15_000) });
    let value: Record<string, unknown>;
    try { value = await response.json(); } catch { throw new ApiError('PIN access is unavailable. Check the server setup and try again.', response.status || 503); }
    if (!response.ok) {
      const message = typeof value.error === 'string' ? value.error : 'The library could not be reached. Try again.';
      if (response.status === 401 && path !== '/unlock' && generation === this.generation) await this.clearSession('Enter your PIN to unlock.');
      throw new ApiError(message, response.status);
    }
    return value as T;
  }
  private async acceptSession(session: Session, offline = false) {
    if (!session.authenticated || !session.workspaceId || !/^[A-Za-z0-9:_-]{1,200}$/.test(session.workspaceId) || !session.expiresAt || !(Date.parse(session.expiresAt) > Date.now())) { await this.clearSession(); return; }
    if (this.state.user?.uid === session.workspaceId) {
      this.rememberSession({ workspaceId: session.workspaceId, expiresAt: session.expiresAt });
      if (session.backup) this.update({ backup: session.backup }); return;
    }
    this.stopSession(); const generation = this.generation;
    const loading = repository.init(session.workspaceId);
    this.update({ status: offline ? 'offline' : 'connecting', error: null, user: { uid: session.workspaceId, displayName: null, email: null, photoURL: null }, backup: session.backup || emptyBackup(), lastSyncAt: null });
    await loading; if (generation !== this.generation) return;
    this.rememberSession({ workspaceId: session.workspaceId, expiresAt: session.expiresAt }); this.restoreCursor(session.workspaceId);
    this.unsubscribeRepository = repository.subscribe(() => {
      if (repository.getSnapshot().conflicts.length && !this.syncing) this.update({ status: 'conflict' });
      if (repository.getSnapshot().pendingCount) { clearTimeout(this.syncTimer); this.syncTimer = setTimeout(() => { void this.syncNow(); }, 300); }
    });
  }
  refresh = async (): Promise<void> => {
    if (localOnly || this.refreshing) return; this.refreshing = true;
    const generation = this.generation;
    let revocation: Promise<void> | undefined;
    try {
      if (this.isLocked()) {
        this.locallyLocked = true;
        const marker = this.lockMarker();
        if (navigator.onLine && (this.needsRevocation || (marker && marker !== 'locked'))) {
          revocation = this.revokePending(marker); this.locking = revocation; await revocation;
        }
        if (generation === this.generation) await this.clearSession(); return;
      }
      if (!navigator.onLine) {
        const cached = this.cachedSession();
        if (cached) await this.acceptSession({ authenticated: true, ...cached }, true); else await this.clearSession('Connect to the internet to unlock.');
        if (this.state.user) this.update({ status: 'offline' }); return;
      }
      const session = await this.request<Session>('/session'); if (generation !== this.generation) return;
      await this.acceptSession(session); if (this.state.user) await this.syncNow();
    } catch (error) {
      if (generation !== this.generation) return;
      const cached = this.cachedSession();
      if (!(error instanceof ApiError) && cached) { await this.acceptSession({ authenticated: true, ...cached }, true); this.update({ status: 'offline', error: null }); }
      else if (this.state.user && this.sessionExpiresAt <= Date.now()) await this.clearSession('Enter your PIN to unlock.');
      else this.update({ status: 'error', error: describeCloudError(error) });
    } finally { this.refreshing = false; if (revocation && this.locking === revocation) this.locking = undefined; }
  };
  unlock = async (pin: string): Promise<void> => {
    if (localOnly) throw new Error('PIN access requires the Prompta server.');
    if (!/^\d{6,12}$/.test(pin)) throw new Error('Enter a 6–12 digit PIN.');
    if (this.locking) await this.locking.catch(() => undefined);
    const generation = this.generation, marker = this.lockMarker();
    this.update({ error: null });
    try {
      const session = await this.request<Session>('/unlock', { method: 'POST', body: JSON.stringify({ pin }) });
      if (generation !== this.generation || marker !== this.lockMarker()) throw new Error('The library was locked. Enter the PIN again.');
      this.locallyLocked = false; this.needsRevocation = false;
      try { localStorage.removeItem(LOCK_KEY); } catch { /* Session remains server-authorized. */ }
      await this.acceptSession(session); if (!this.state.user) throw new Error('The PIN session could not be opened. Try again.'); await this.syncNow();
    } catch (error) { if (generation === this.generation || !this.state.user) this.update({ error: describeCloudError(error) }); throw error; }
  };
  private async revokePending(marker: string | null) {
    await this.request('/lock', { method: 'POST' });
    this.needsRevocation = false;
    try { if (localStorage.getItem(LOCK_KEY) === marker && marker) localStorage.setItem(LOCK_KEY, 'locked'); } catch { /* The memory latch remains locked. */ }
  }
  lock = async (): Promise<void> => {
    this.locallyLocked = true; this.needsRevocation = true;
    const marker = String(Date.now());
    try { localStorage.setItem(LOCK_KEY, marker); } catch { /* The memory latch protects this tab even if storage is unavailable. */ }
    const close = this.clearSession();
    const revocation = (async () => {
      await close;
      if (navigator.onLine) try { await this.revokePending(this.lockMarker()); } catch { this.update({ error: 'Locked on this device. Server sign-out will finish when the connection returns.' }); }
    })();
    this.locking = revocation;
    await revocation; if (this.locking === revocation) this.locking = undefined;
  };
  syncNow = (): Promise<void> => {
    if (!this.state.user) return Promise.resolve();
    if (this.sessionExpiresAt <= Date.now()) return this.clearSession('Enter your PIN to unlock.');
    if (this.syncing) { this.syncAgain = true; return this.syncing; }
    const generation = this.generation;
    this.syncing = this.synchronize(generation).finally(() => {
      this.syncing = undefined;
      if (this.syncAgain && this.state.user) { this.syncAgain = false; clearTimeout(this.syncTimer); this.syncTimer = setTimeout(() => { void this.syncNow(); }, 100); }
    }); return this.syncing;
  };
  private async synchronize(generation: number) {
    const uid = this.state.user!.uid;
    if (!navigator.onLine) { this.update({ status: 'offline' }); return; }
    this.update({ status: 'syncing', error: null });
    try {
      await this.pullCurrent(uid, generation); if (generation !== this.generation) return;
      const hydratedHistories = new Set<string>(), changedHistories = new Set<string>();
      for (let sent = 0; sent < 1000; sent += 1) {
        if (generation !== this.generation) return;
        const mutation = await repository.claimNextMutation(uid); if (!mutation) break;
        try {
          const historyId = mutation.entity.kind === 'version' ? mutation.entity.promptId : mutation.entity.kind === 'tombstone' && ['prompt', 'template'].includes(mutation.entity.originalKind) ? mutation.entity.id : null;
          if (historyId && !hydratedHistories.has(historyId)) { await this.loadVersions(historyId); hydratedHistories.add(historyId); }
          if (historyId) changedHistories.add(historyId);
          if (generation !== this.generation) { await repository.rejectMutation(mutation.id); return; }
          const result = await this.request<MutationResult>('/mutations', { method: 'POST', body: JSON.stringify({ mutation: this.wireMutation(mutation) }) });
          if (generation !== this.generation) { await repository.rejectMutation(mutation.id); return; }
          this.validateEntity(result.entity, uid); if (result.entity.id !== mutation.entityId) throw new Error('The server returned a different library record.');
          if (result.outcome === 'conflict') await repository.recordConflict(mutation, result.entity);
          else if (result.outcome === 'committed' || result.outcome === 'acknowledged') await repository.acknowledgeMutation(mutation.id, result.entity);
          else throw new Error('The server returned an invalid sync result.');
        } catch (error) { await repository.rejectMutation(mutation.id); throw error; }
      }
      if (generation !== this.generation) return;
      for (const promptId of changedHistories) await this.loadVersions(promptId);
      await this.pullCurrent(uid, generation); if (generation !== this.generation) return;
      const snapshot = repository.getSnapshot(); this.retryDelay = 1500; clearTimeout(this.retryTimer);
      this.update({ status: snapshot.conflicts.length ? 'conflict' : snapshot.pendingCount ? 'syncing' : 'synced', lastSyncAt: new Date().toISOString(), error: null });
      if (snapshot.pendingCount && !snapshot.conflicts.length) this.syncAgain = true;
    } catch (error) { if (generation === this.generation) this.handleFailure(error); }
  }
  private wireMutation(value: Mutation): Mutation { return { id: value.id, entityId: value.entityId, ownerId: value.ownerId, baseRevision: value.baseRevision, entity: value.entity, createdAt: value.createdAt }; }
  private handleFailure(error: unknown) {
    this.update({ status: navigator.onLine ? 'error' : 'offline', error: describeCloudError(error) }); clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { void this.syncNow(); }, this.retryDelay); this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }
  private validateEntity(entity: Entity, uid: string) { if (!entity || entity.ownerId !== uid || typeof entity.id !== 'string') throw new Error('The server returned an invalid library record. Sync stopped.'); }
  private async pullCurrent(uid: string, generation: number) {
    for (;;) {
      const page = await this.request<RecordsPage>(`/records?after=${this.cursor}&limit=${PAGE_SIZE}&includeVersions=0`); if (generation !== this.generation) return;
      if (!Array.isArray(page.records) || !Number.isSafeInteger(page.cursor) || page.cursor < this.cursor) throw new Error('The server returned an invalid sync page.');
      for (const value of page.records) { if (generation !== this.generation) return; this.validateEntity(value.entity, uid); await repository.applyRemote(value.entity, value.mutationId); }
      if (generation !== this.generation) return;
      if (page.hasMore && page.cursor <= this.cursor) throw new Error('Synchronization could not advance. Try again.');
      this.cursor = page.cursor; try { localStorage.setItem(this.cursorKey(uid), String(this.cursor)); } catch { /* Replaying the feed is safe. */ }
      if (!page.hasMore) break;
    }
  }
  private cursorKey(uid: string) { return `prompta:pin-sync-cursor:${uid}`; }
  private restoreCursor(uid: string) {
    const snapshot = repository.getSnapshot(); if (!snapshot.prompts.length && !snapshot.templates.length && !snapshot.categories.length && !snapshot.collections.length) return;
    try { const cursor = Number(localStorage.getItem(this.cursorKey(uid))); if (Number.isSafeInteger(cursor) && cursor >= 0) this.cursor = cursor; } catch { this.cursor = 0; }
  }
  loadVersions = async (promptId: string): Promise<void> => {
    if (!this.state.user || !navigator.onLine) return;
    const uid = this.state.user.uid, generation = this.generation; let cursor = 0;
    for (;;) {
      const page = await this.request<RecordsPage>(`/versions?promptId=${encodeURIComponent(promptId)}&after=${cursor}&limit=${PAGE_SIZE}`); if (generation !== this.generation) return;
      for (const value of page.records) { if (generation !== this.generation) return; this.validateEntity(value.entity, uid); await repository.applyRemote(value.entity, value.mutationId); }
      if (generation !== this.generation) return;
      if (!page.hasMore) break; if (!Number.isSafeInteger(page.cursor) || page.cursor <= cursor) throw new Error('Version history could not be loaded.'); cursor = page.cursor;
    }
    await repository.pruneVersions(promptId);
  };
  prepareExport = async (): Promise<void> => {
    if (localOnly) return;
    if (!this.state.user) throw new Error('Unlock the library before exporting.');
    if (!navigator.onLine) throw new Error('Reconnect to include all shared version history in the export.');
    await this.syncNow(); if (this.state.status !== 'synced') throw new Error(this.state.error || 'Finish syncing and resolve conflicts before exporting.');
    const uid = this.state.user.uid, generation = this.generation; let cursor = 0;
    for (;;) {
      const page = await this.request<RecordsPage>(`/records?after=${cursor}&limit=${PAGE_SIZE}&includeVersions=1`); if (generation !== this.generation) throw new Error('The library was locked during export. Unlock and try again.');
      for (const value of page.records) { if (generation !== this.generation) throw new Error('The library was locked during export. Unlock and try again.'); this.validateEntity(value.entity, uid); await repository.applyRemote(value.entity, value.mutationId); }
      if (generation !== this.generation) throw new Error('The library was locked during export. Unlock and try again.');
      if (!page.hasMore) break; if (!Number.isSafeInteger(page.cursor) || page.cursor <= cursor) throw new Error('The export could not load every record.'); cursor = page.cursor;
    }
  };
  resolveConflict = async (id: string, choice: 'local' | 'remote' | 'both') => { await repository.resolveConflict(id, choice); await this.syncNow(); };
  dispose = () => { this.stopSession(); clearInterval(this.pollTimer); window.removeEventListener('online', this.onOnline); window.removeEventListener('offline', this.onOffline); window.removeEventListener('focus', this.onFocus); window.removeEventListener('storage', this.onStorage); };
}
export const cloud = new PromptaCloud();
if (import.meta.hot) import.meta.hot.dispose(() => cloud.dispose());
