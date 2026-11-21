import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Clock3, Copy, FileText, FolderOpen, GitCompareArrows, Hash, Heart, History, Link2, LoaderCircle, MoreHorizontal, Pencil, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { repository } from '../data/repository';
import { detectVariables } from '../domain/variables';
import type { LibrarySnapshot, Prompt, PromptVersion } from '../domain/types';
import { cloud } from '../lib/cloud';
import { fullDate, timeAgo } from '../lib/format';
import { Button, ConfirmDialog, EmptyState, IconButton, Menu, Modal } from './ui';
import { VariablesDialog } from './VariablesDialog';
import './panels.css';

interface Props { initialTab?: 'prompt'|'history'; prompt: Prompt; snapshot: LibrarySnapshot; onClose: () => void; onEdit: () => void; onCopy: () => void; onFavorite: () => void; onDelete: () => void; onDuplicate: () => void; onApplyTemplate?: () => void; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }
function PromptText({ content }: { content: string }) {
  const segments = content.split(/((?<!\{)\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}(?!\}))/g);
  return <pre className="detail-prompt-text">{segments.map((segment,i) => /^\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}$/.test(segment) ? <mark key={i}>{segment}</mark> : segment)}</pre>;
}
function safeUrl(value: string) { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function useFullscreenDetail() {
  const [fullscreen, setFullscreen] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)').matches : false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setFullscreen(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  return fullscreen;
}
export function PromptDetail({ initialTab = 'prompt', prompt, snapshot, onClose, onEdit, onCopy, onFavorite, onDelete, onDuplicate, onApplyTemplate, notify }: Props) {
  const fullscreenDetail = useFullscreenDetail();
  const [tab, setTab] = useState<'prompt'|'history'>(initialTab);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const isTrashed = Boolean(prompt.deletedAt);
  const [restoringPrompt, setRestoringPrompt] = useState(false);
  const category = snapshot.categories.find(c => c.id === prompt.categoryId);
  const tags = snapshot.tags.filter(t => prompt.tagIds.includes(t.id));
  const collections = snapshot.collections.filter(c => c.promptIds.includes(prompt.id));
  const variables = detectVariables(prompt.content);
  useEffect(() => () => { previousFocus.current?.focus({ preventScroll: true }); },[]);
  useEffect(() => { setTab(initialTab); setVariablesOpen(false); setSelectedVersion(null); setCompareOpen(false); setRestoreOpen(false); },[prompt.id,initialTab]);
  useEffect(() => {
    if (tab !== 'history') return;
    let stopped = false;
    async function load() {
      setLoadingHistory(true); setHistoryError(null);
      try { await cloud.loadVersions(prompt.id); } catch { if (!stopped) setHistoryError('Cloud history is unavailable. Showing revisions saved on this device.'); }
      try { const result = await repository.getVersions(prompt.id); if (!stopped) { setVersions(result); setSelectedVersion(result[0] || null); } }
      catch { if (!stopped) setHistoryError('Version history could not be loaded. Please try again.'); }
      finally { if (!stopped) setLoadingHistory(false); }
    }
    void load();
    return () => { stopped = true; };
  },[tab,prompt.id,prompt.updatedAt]);
  async function restore() {
    if (!selectedVersion || restoring || isTrashed) return;
    setRestoring(true);
    try { await repository.restoreVersion(prompt.id, selectedVersion.id); setRestoreOpen(false); setCompareOpen(false); setTab('prompt'); notify('Revision restored. Your previous version is preserved in history.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'This revision could not be restored.', 'error'); }
    finally { setRestoring(false); }
  }
  async function restoreFromBin() {
    if (restoringPrompt) return;
    setRestoringPrompt(true);
    try { await repository.restorePrompt(prompt.id); notify('Prompt restored to your library.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'This prompt could not be restored.', 'error'); }
    finally { setRestoringPrompt(false); }
  }
  return <>
    <Dialog.Root open modal={fullscreenDetail} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Content className="prompt-detail-panel" aria-modal={fullscreenDetail || undefined} aria-describedby="prompt-detail-description" onInteractOutside={e => e.preventDefault()} onOpenAutoFocus={e => { e.preventDefault(); detailTitle.current?.focus(); }} onCloseAutoFocus={e => { e.preventDefault(); previousFocus.current?.focus({ preventScroll: true }); }}>
      <div className="detail-topbar"><div className="detail-eyebrow"><FileText size={15}/>{isTrashed ? 'Recycle bin' : prompt.kind === 'template' ? 'Template' : 'History'}</div><div className="detail-header-actions"><IconButton label={prompt.favorite ? 'Remove from favorites' : 'Add to favorites'} className={prompt.favorite ? 'is-favorite' : ''} onClick={onFavorite} disabled={isTrashed} aria-pressed={prompt.favorite}><Heart size={19} fill={prompt.favorite ? 'currentColor' : 'none'}/></IconButton><Menu trigger={<IconButton label="More prompt actions"><MoreHorizontal size={21}/></IconButton>} items={[{label:'Edit',icon:<Pencil size={16}/>,action:onEdit,disabled:isTrashed},{label:'Duplicate',icon:<Copy size={16}/>,action:onDuplicate,disabled:isTrashed},{label:isTrashed ? 'Delete permanently' : 'Move to recycle bin',icon:<Trash2 size={16}/>,action:onDelete,danger:true}]}/><span className="detail-toolbar-divider"/><IconButton label="Close history" onClick={onClose}><X size={21}/></IconButton></div></div>
      <div className="detail-scroll">
        <div className="detail-title-group"><div className="detail-type-row"><span className={`prompt-type-badge type-${prompt.type.toLowerCase()}`}>{prompt.type}</span></div><Dialog.Title ref={detailTitle} tabIndex={-1} className="detail-title">{prompt.title}</Dialog.Title><Dialog.Description id="prompt-detail-description" className={isTrashed ? 'detail-subtitle' : 'sr-only'}>{isTrashed ? `Deleted ${fullDate(prompt.deletedAt!)}` : 'Prompt content, organization and history.'}</Dialog.Description></div>
        <div className="detail-tabs" role="tablist" aria-label="Prompt information"><button type="button" role="tab" tabIndex={tab === 'prompt' ? 0 : -1} aria-selected={tab === 'prompt'} aria-controls="prompt-tab-content" id="prompt-tab" className={tab === 'prompt' ? 'active' : ''} onClick={() => setTab('prompt')} onKeyDown={e => { if (e.key === 'ArrowRight') { setTab('history'); document.getElementById('history-tab')?.focus(); } }}><FileText size={16}/>Prompt</button><button type="button" role="tab" tabIndex={tab === 'history' ? 0 : -1} aria-selected={tab === 'history'} aria-controls="history-tab-content" id="history-tab" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')} onKeyDown={e => { if (e.key === 'ArrowLeft') { setTab('prompt'); document.getElementById('prompt-tab')?.focus(); } }}><History size={16}/>Version history</button></div>
        {tab === 'prompt' ? <div id="prompt-tab-content" role="tabpanel" aria-labelledby="prompt-tab">
          {isTrashed && <div className="detail-trash-notice"><Trash2 size={18}/><span><strong>In recycle bin</strong><small>Restore to edit or copy. Removed after 30 days.</small></span></div>}
          <div className="detail-content-box"><PromptText content={prompt.content}/></div>
          <dl className="detail-metadata"><div><dt><FolderOpen size={15}/>Category</dt><dd>{category ? <span className="category-badge"><span style={{background:category.color}}/>{category.name}</span> : <span className="muted">Uncategorized</span>}</dd></div><div><dt><Hash size={15}/>Tags</dt><dd>{tags.length ? tags.map(tag => <span className="detail-tag" key={tag.id}>{tag.name}</span>) : <span className="muted">None</span>}</dd></div><div><dt><FolderOpen size={15}/>Collections</dt><dd>{collections.length ? collections.map(c => <span className="detail-collection-pill" key={c.id}>{c.name}</span>) : <span className="muted">None</span>}</dd></div></dl>
          {prompt.referenceLinks.length > 0 && <section className="detail-reference-links"><h3><Link2 size={15}/>Reference links</h3>{prompt.referenceLinks.map((link,i) => { const href = safeUrl(link); return href ? <a key={i} href={href} target="_blank" rel="noopener noreferrer">{link}</a> : <span key={i} className="muted">Invalid reference URL</span>; })}</section>}
          <div className="detail-usage-strip"><div><Copy size={15}/><strong>{prompt.copyCount.toLocaleString()}</strong><span>copies</span></div><div><Clock3 size={15}/><span>{prompt.lastCopiedAt ? `Used ${timeAgo(prompt.lastCopiedAt).toLowerCase()}` : 'Not copied'}</span></div></div>
          <div className="detail-timestamps"><span>Created {fullDate(prompt.createdAt)}</span><span>Updated {fullDate(prompt.updatedAt)}</span></div>
        </div> : <div id="history-tab-content" role="tabpanel" aria-labelledby="history-tab" className="history-tab-content">
          <div className="history-intro"><p>Last 20 saved revisions.</p></div>{historyError && <p className="history-warning" role="status">{historyError}</p>}{loadingHistory ? <div className="history-loading"><LoaderCircle className="spin" size={22}/><span>Loading revisions…</span></div> : versions.length ? <><div className="version-current"><span className="version-dot"/><div><strong>Current version</strong><span>{fullDate(prompt.updatedAt)}</span></div></div><div className="version-list">{versions.map((version,index) => <button type="button" className={`version-item ${selectedVersion?.id === version.id ? 'selected' : ''}`} key={version.id} onClick={() => setSelectedVersion(version)}><span className="version-line-dot"/><span><strong>{index === 0 ? 'Previous revision' : `Earlier revision ${index + 1}`}</strong><small>{fullDate(version.createdAt)}</small></span><span className="version-reason">{version.reason}</span></button>)}</div>{selectedVersion && <div className="version-preview"><div className="field-label-row"><span className="field-label">{selectedVersion.snapshot.title}</span><span className="muted">{selectedVersion.snapshot.content.length.toLocaleString()} characters</span></div><pre>{selectedVersion.snapshot.content}</pre><div className="version-preview-actions"><Button small onClick={() => setCompareOpen(true)}><GitCompareArrows size={15}/>Compare</Button><Button small onClick={() => setRestoreOpen(true)} disabled={isTrashed} title={isTrashed ? 'Restore the prompt from the recycle bin first' : undefined}><RotateCcw size={15}/>Restore</Button></div></div>}</> : <EmptyState compact icon={<History size={26}/>} title="No previous revisions" description="Saved edits appear here."/>}
        </div>}
      </div>
      <div className="detail-footer">{isTrashed ? <><Button variant="primary" onClick={restoreFromBin} className="detail-copy-button" disabled={restoringPrompt}><RotateCcw size={17}/>{restoringPrompt ? 'Restoring…' : 'Restore prompt'}</Button><Button variant="danger" onClick={onDelete}><Trash2 size={16}/>Delete permanently</Button></> : <>{prompt.kind === 'template' && onApplyTemplate ? <Button variant="primary" onClick={onApplyTemplate} className="detail-copy-button"><Sparkles size={17}/>Use template</Button> : <Button variant="primary" onClick={onCopy} className="detail-copy-button"><Copy size={17}/>Copy original</Button>}{variables.length > 0 ? <Button onClick={() => setVariablesOpen(true)}><Sparkles size={16}/>Fill variables</Button> : <Button onClick={onEdit}><Pencil size={16}/>Edit</Button>}</>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <VariablesDialog open={variablesOpen} prompt={prompt} onClose={() => setVariablesOpen(false)} notify={notify}/>
    <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title="Compare revisions" description="Saved revision and current prompt." className="version-compare-modal" footer={<><Button onClick={() => setCompareOpen(false)}>Close</Button><Button variant="primary" onClick={() => setRestoreOpen(true)} disabled={isTrashed}><RotateCcw size={16}/>Restore this revision</Button></>}>
      {selectedVersion && <div className="version-comparison"><section><div className="comparison-header"><span>Saved revision</span><small>{fullDate(selectedVersion.createdAt)}</small></div><h3>{selectedVersion.snapshot.title}</h3><pre>{selectedVersion.snapshot.content}</pre></section><section><div className="comparison-header"><span>Current version</span><small>{fullDate(prompt.updatedAt)}</small></div><h3>{prompt.title}</h3><pre>{prompt.content}</pre></section></div>}
    </Modal>
    <ConfirmDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} onConfirm={restore} busy={restoring} title="Restore this revision?" description="This revision will become the current prompt. Your current version will remain available in history." label="Restore revision"/>
  </>;
}
