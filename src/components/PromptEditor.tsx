import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, FolderOpen, Hash, Heart, Link2, LoaderCircle, Plus, RotateCcw, Save, X } from 'lucide-react';
import { repository } from '../data/repository';
import { detectVariables } from '../domain/variables';
import type { LibrarySnapshot, Prompt, PromptInput, PromptType } from '../domain/types';
import { Button, IconButton, Modal } from './ui';
import './panels.css';

type Notify = (message: string, tone?: 'success' | 'error' | 'info') => void;
interface EditorState { title: string; content: string; type: PromptType; categoryId: string | null; tagIds: string[]; collectionIds: string[]; referenceText: string; favorite: boolean; kind: 'prompt' | 'template' }
interface Props { open: boolean; prompt?: Prompt | null; template?: Prompt | null; initialKind?: 'prompt' | 'template'; initialCollectionId?: string; snapshot: LibrarySnapshot; onClose: () => void; onSaved: (prompt: Prompt) => void; notify: Notify }
const emptyForm: EditorState = { title: '', content: '', type: 'Text', categoryId: null, tagIds: [], collectionIds: [], referenceText: '', favorite: false, kind: 'prompt' };
function isDraft(value: unknown): value is EditorState {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<EditorState>;
  return typeof d.title === 'string' && typeof d.content === 'string' && ['Text','Image','Video','Code','Other'].includes(d.type || '') && Array.isArray(d.tagIds) && Array.isArray(d.collectionIds) && typeof d.referenceText === 'string' && typeof d.favorite === 'boolean' && ['prompt','template'].includes(d.kind || '');
}
export function PromptEditor({ open, prompt, template, initialKind = 'prompt', initialCollectionId, snapshot, onClose, onSaved, notify }: Props) {
  const [form, setForm] = useState<EditorState>(emptyForm);
  const [recovery, setRecovery] = useState<EditorState | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle'|'saving'|'saved'|'failed'>('idle');
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const original = useRef(JSON.stringify(emptyForm));
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  const draftOwner = useRef(snapshot.ownerId);
  const session = useRef(0);
  const saved = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const draftKey = prompt ? `prompt:${prompt.id}` : `new:${initialKind}`;
  const isDirty = ready && JSON.stringify(form) !== original.current;
  const variables = useMemo(() => detectVariables(form.content), [form.content]);

  useEffect(() => {
    if (!open) return;
    const current = ++session.current;
    const ownerId = snapshot.ownerId;
    draftOwner.current = ownerId;
    const source = prompt || template;
    const next: EditorState = source ? {
      title: template && !prompt ? `${source.title}` : source.title,
      content: source.content, type: source.type, categoryId: source.categoryId,
      tagIds: [...source.tagIds], favorite: template && !prompt ? false : source.favorite,
      referenceText: source.referenceLinks.join('\n'),
      collectionIds: prompt ? snapshot.collections.filter(c => c.promptIds.includes(prompt.id)).map(c => c.id) : initialCollectionId ? [initialCollectionId] : [],
      kind: prompt?.kind || initialKind,
    } : { ...emptyForm, kind: initialKind, tagIds: [], collectionIds: initialCollectionId ? [initialCollectionId] : [] };
    original.current = JSON.stringify(next);
    saved.current = false;
    setForm(next); setErrors({}); setReady(false); setRecovery(null); setDraftStatus('idle'); setCloseConfirm(false); setLinksOpen(!!next.referenceText); setTagPickerOpen(false); setCollectionsOpen(false); setAddingCategory(false);
    void repository.getDraft<EditorState>(draftKey, ownerId).then(d => {
      if (current !== session.current) return;
      if (isDraft(d) && JSON.stringify(d) !== original.current) setRecovery(d);
      setReady(true);
    }).catch(() => { if (current === session.current) { setReady(true); notify('Your saved draft could not be read. You can still edit this prompt.', 'error'); } });
    return () => { session.current++; };
    // Initialize once per editor session, never reset edits when the live library changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt?.id, template?.id, initialKind, draftKey]);

  useEffect(() => {
    if (!open || !ready || recovery || !isDirty || saved.current) return;
    const ownerId = draftOwner.current;
    setDraftStatus('saving');
    const timer = setTimeout(() => {
      if (saved.current) return;
      draftWrite.current = draftWrite.current.catch(() => {}).then(() => repository.saveDraft(draftKey, form, ownerId));
      void draftWrite.current.then(() => setDraftStatus('saved')).catch(() => setDraftStatus('failed'));
    }, 450);
    return () => clearTimeout(timer);
  }, [form, open, ready, recovery, draftKey, isDirty]);

  useEffect(() => {
    if (!open || !isDirty) return;
    const handle = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [open, isDirty]);

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: '' }));
  }
  const close = () => { if (saving) return; if (isDirty) setCloseConfirm(true); else onClose(); };
  async function finishClose(discard: boolean) {
    const ownerId = draftOwner.current;
    try {
      saved.current = true;
      await draftWrite.current.catch(() => {});
      if (discard) await repository.deleteDraft(draftKey, ownerId);
      else await repository.saveDraft(draftKey, form, ownerId);
      setCloseConfirm(false); onClose();
    } catch { saved.current = false; notify('The draft could not be saved. Your editor is still open.', 'error'); }
  }
  async function dismissRecovery() {
    const ownerId = draftOwner.current;
    try { await repository.deleteDraft(draftKey, ownerId); setRecovery(null); } catch { notify('The saved draft could not be removed.', 'error'); }
  }
  async function save() {
    if (saving || !ready) return;
    const ownerId = draftOwner.current;
    const nextErrors: Record<string,string> = {};
    if (!form.title.trim()) nextErrors.title = 'Title is required.';
    if (!form.content.trim()) nextErrors.content = 'Prompt content is required.';
    const referenceLinks = form.referenceText.split('\n').map(l => l.trim()).filter(Boolean);
    if (referenceLinks.some(link => { try { return !['https:','http:'].includes(new URL(link).protocol); } catch { return true; } })) nextErrors.referenceText = 'Use a complete http:// or https:// URL, one per line.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { if (nextErrors.title) titleInput.current?.focus(); if (nextErrors.referenceText) setLinksOpen(true); return; }
    setSaving(true);
    try {
      const input: PromptInput = { title: form.title.trim(), content: form.content, type: form.type, categoryId: form.categoryId, tagIds: form.tagIds, favorite: form.favorite, referenceLinks, kind: form.kind, collectionIds: form.collectionIds };
      const result = await repository.savePrompt(input, prompt?.id);
      saved.current = true;
      await draftWrite.current.catch(() => {});
      try { await repository.deleteDraft(draftKey, ownerId); } catch { notify('Your prompt was saved. An old recovery draft could not be cleared.', 'info'); }
      original.current = JSON.stringify(form);
      notify(`${form.kind === 'template' ? 'Template' : 'Prompt'} saved.`, 'success');
      onSaved(result); onClose();
    } catch (error) { notify(error instanceof Error ? error.message : 'Your prompt could not be saved. Your changes are still here.', 'error'); }
    finally { setSaving(false); }
  }
  async function createCategory() {
    if (!categoryName.trim() || creating) return;
    setCreating(true);
    try { const category = await repository.saveCategory({ name: categoryName.trim(), color: '#FF385C', icon: 'folder' }); update('categoryId', category.id); setAddingCategory(false); setCategoryName(''); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not create category.', 'error'); }
    finally { setCreating(false); }
  }
  async function createTag() {
    if (!tagSearch.trim() || creating) return;
    setCreating(true);
    try { const tag = await repository.saveTag({ name: tagSearch.trim(), color: '#A3A3A3' }); update('tagIds', [...new Set([...form.tagIds,tag.id])]); setTagSearch(''); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not create tag.', 'error'); }
    finally { setCreating(false); }
  }
  const matchingTags = snapshot.tags.filter(tag => tag.name.toLowerCase().includes(tagSearch.toLowerCase()));
  const tagExists = snapshot.tags.some(tag => tag.name.toLowerCase() === tagSearch.trim().toLowerCase());
  return <>
    <Modal open={open} onClose={close} title={prompt ? `Edit ${form.kind}` : `New ${initialKind}`} className="prompt-editor-modal" footer={<><div className={`editor-draft-status ${draftStatus === 'failed' ? 'draft-error' : ''}`}>{draftStatus === 'saving' ? <><LoaderCircle size={14} className="spin"/> Saving draft…</> : draftStatus === 'saved' ? <><CheckCircle2 size={14}/> Draft saved locally</> : draftStatus === 'failed' ? 'Draft unavailable. Please save your prompt.' : <><span className="shortcut-key">⌘ / Ctrl</span><span>+ Enter to save</span></>}</div><Button onClick={close} disabled={saving}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving || !ready}><Save size={16}/>{saving ? 'Saving…' : `Save ${form.kind}`}</Button></>}>
      <div onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save(); } }}>
        {recovery && <div className="draft-recovery" role="status"><RotateCcw size={18}/><div><strong>Saved draft available.</strong></div><Button small onClick={() => { setForm(recovery); setLinksOpen(!!recovery.referenceText); setRecovery(null); setDraftStatus('saved'); }}>Restore draft</Button><IconButton label="Discard saved draft" onClick={dismissRecovery}><X size={16}/></IconButton></div>}
        {template && !prompt && <div className="editor-template-note">From template: {template.title}</div>}
        <div className="editor-layout">
          <div className="editor-writing">
            <div className="field"><label className="field-label" htmlFor="prompt-title">Title <span className="required-marker">*</span></label><input ref={titleInput} id="prompt-title" autoFocus className="input editor-title-input" placeholder="Prompt title" value={form.title} onChange={e => update('title',e.target.value)} maxLength={200} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'prompt-title-error' : undefined}/>{errors.title && <p id="prompt-title-error" className="field-error" role="alert">{errors.title}</p>}</div>
            <div className="field editor-content-field"><div className="field-label-row"><label className="field-label" htmlFor="prompt-content">Prompt <span className="required-marker">*</span></label><span className="character-count">{form.content.length.toLocaleString()} characters</span></div><textarea id="prompt-content" className="textarea prompt-content-editor" placeholder="Enter prompt text" value={form.content} onChange={e => update('content',e.target.value)} maxLength={100000} spellCheck={false} aria-invalid={!!errors.content} aria-describedby={errors.content ? 'prompt-content-error' : 'prompt-variables-help'}/>{errors.content && <p id="prompt-content-error" className="field-error" role="alert">{errors.content}</p>}<div id="prompt-variables-help" className="editor-variable-help">{variables.length ? <span>{variables.length} variable{variables.length === 1 ? '' : 's'} detected</span> : <span>Use <code>{'{{name}}'}</code> for a variable.</span>}</div>{variables.length > 0 && <div className="editor-detected-variables">{variables.map(v => <span className="variable-chip" key={v}>{`{{${v}}}`}</span>)}</div>}</div>
            <div className="editor-reference-section"><button type="button" className="editor-disclosure" aria-expanded={linksOpen} onClick={() => setLinksOpen(v => !v)}><Link2 size={16}/><span>Reference links</span><span className="muted">Optional</span><ChevronDown size={16} className={linksOpen ? 'rotate-180' : ''}/></button>{linksOpen && <div className="field"><label className="sr-only" htmlFor="prompt-reference-links">Reference URLs, one per line</label><textarea id="prompt-reference-links" className="textarea reference-textarea" rows={3} placeholder="https://example.com/reference" value={form.referenceText} onChange={e => update('referenceText',e.target.value)} aria-invalid={!!errors.referenceText}/><span className="field-help">One complete URL per line.</span>{errors.referenceText && <p className="field-error" role="alert">{errors.referenceText}</p>}</div>}</div>
          </div>
          <aside className="editor-properties" aria-label="Prompt organization">
            <div className="field"><label className="field-label" htmlFor="prompt-type">Prompt type</label><div className="select-wrapper"><select id="prompt-type" className="select" value={form.type} onChange={e => update('type',e.target.value as PromptType)}>{(['Text','Image','Video','Code','Other'] as const).map(type => <option key={type}>{type}</option>)}</select><ChevronDown size={15}/></div></div>
            <div className="field"><div className="field-label-row"><label className="field-label" htmlFor="prompt-category">Category</label><IconButton label="Create category" className="small-icon" onClick={() => setAddingCategory(v => !v)}><Plus size={15}/></IconButton></div><div className="select-wrapper"><select id="prompt-category" className="select" value={form.categoryId || ''} onChange={e => update('categoryId',e.target.value || null)}><option value="">Uncategorized</option>{snapshot.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={15}/></div>{addingCategory && <div className="inline-create"><input aria-label="New category name" className="input" placeholder="Category name" value={categoryName} onChange={e => setCategoryName(e.target.value)} maxLength={80} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createCategory(); } }}/><IconButton label="Save new category" disabled={creating || !categoryName.trim()} onClick={createCategory}><Check size={16}/></IconButton></div>}</div>
            <div className="field"><div className="field-label">Tags</div><div className="editor-selected-tags">{form.tagIds.map(id => { const tag = snapshot.tags.find(t => t.id === id); return tag ? <span className="editable-tag" key={id}><Hash size={11}/>{tag.name}<button type="button" onClick={() => update('tagIds',form.tagIds.filter(t => t !== id))} aria-label={`Remove tag ${tag.name}`}><X size={12}/></button></span> : null; })}</div><button type="button" className="picker-toggle" onClick={() => setTagPickerOpen(v => !v)} aria-expanded={tagPickerOpen}><Plus size={15}/>{form.tagIds.length ? 'Add another tag' : 'Add tags'}<ChevronDown size={14}/></button>{tagPickerOpen && <div className="inline-picker"><input aria-label="Search or create tags" className="input" placeholder="Search or create a tag" value={tagSearch} onChange={e => setTagSearch(e.target.value)} maxLength={80}/><div className="inline-picker-options">{matchingTags.map(tag => <label className="checkbox-option" key={tag.id}><input type="checkbox" checked={form.tagIds.includes(tag.id)} onChange={e => update('tagIds',e.target.checked ? [...form.tagIds,tag.id] : form.tagIds.filter(id => id !== tag.id))}/><span>{tag.name}</span></label>)}</div>{tagSearch.trim() && !tagExists && <Button small className="create-tag-button" onClick={createTag} disabled={creating}><Plus size={14}/>Create “{tagSearch.trim()}”</Button>}{!matchingTags.length && !tagSearch.trim() && <p className="field-help">Type a name to create a tag.</p>}</div>}</div>
            <div className="field"><div className="field-label">Collections</div><button type="button" className="picker-toggle" onClick={() => setCollectionsOpen(v => !v)} aria-expanded={collectionsOpen}><FolderOpen size={15}/>{form.collectionIds.length ? `${form.collectionIds.length} selected` : 'Add to collection'}<ChevronDown size={14}/></button>{form.collectionIds.length > 0 && <div className="editor-collection-names">{snapshot.collections.filter(c => form.collectionIds.includes(c.id)).map(c => <span key={c.id}>{c.name}</span>)}</div>}{collectionsOpen && <div className="inline-picker"><div className="inline-picker-options">{snapshot.collections.map(c => <label className="checkbox-option" key={c.id}><input type="checkbox" checked={form.collectionIds.includes(c.id)} onChange={e => update('collectionIds',e.target.checked ? [...form.collectionIds,c.id] : form.collectionIds.filter(id => id !== c.id))}/><span>{c.name}</span></label>)}</div>{!snapshot.collections.length && <p className="field-help">Create collections on the Collections page.</p>}</div>}</div>
            <div className="editor-property-divider"/><button type="button" className={`editor-favorite-toggle ${form.favorite ? 'is-favorite' : ''}`} onClick={() => update('favorite',!form.favorite)} aria-pressed={form.favorite}><Heart size={19} fill={form.favorite ? 'currentColor' : 'none'}/><span><strong>Favorite</strong></span><span className={`mini-switch ${form.favorite ? 'on' : ''}`} aria-hidden="true"/></button>
          </aside>
        </div>
      </div>
    </Modal>
    <Modal open={closeConfirm} onClose={() => setCloseConfirm(false)} title="Unsaved changes" description="Your changes are not saved. Keep a draft to continue later." className="confirm-modal" footer={<><Button onClick={() => setCloseConfirm(false)}>Keep editing</Button><Button variant="ghost" onClick={() => finishClose(true)}>Discard</Button><Button variant="primary" onClick={() => finishClose(false)}>Keep draft & close</Button></>}>{null}</Modal>
  </>;
}
