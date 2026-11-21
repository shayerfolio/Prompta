import { useEffect, useRef, useState } from 'react';
import { Check, Star, MoreHorizontal, Pencil, CopyPlus, Trash2, FileText, Image, Video, Code2, Sparkles, Braces, RotateCcw, History } from 'lucide-react';
import type { Prompt, LibrarySnapshot } from '../domain/types';
import { timeAgo } from '../lib/format';
import { detectVariables } from '../domain/variables';
import { IconButton, Menu, Button } from './ui';

export const typeIcons = { Text: FileText, Image, Video, Code: Code2, Other: Sparkles };
export function PromptCard({ prompt, snapshot, view = 'grid', onOpen, onVariables, onCopy, onFavorite, onEdit, onDuplicate, onDelete, onRestore, onApply }: {
  prompt: Prompt; snapshot: LibrarySnapshot; view?: 'grid'|'list';
  onOpen:()=>void; onVariables:()=>void; onCopy:()=>Promise<void>; onFavorite:()=>void; onEdit:()=>void; onDuplicate:()=>void; onDelete:()=>void; onRestore?:()=>void; onApply?:()=>void;
}) {
  const [copied,setCopied] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const Icon = typeIcons[prompt.type];
  const category = snapshot.categories.find(c=>c.id===prompt.categoryId);
  const tags = snapshot.tags.filter(t=>prompt.tagIds.includes(t.id));
  const variableCount = detectVariables(prompt.content).length;
  const deleted = Boolean(prompt.deletedAt);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(feedbackTimer.current); };
  }, []);
  const copy = async () => {
    if (deleted) return;
    clearTimeout(feedbackTimer.current);
    setCopied(false);
    try {
      await onCopy();
      if (!mounted.current) return;
      setCopied(true);
      feedbackTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* The action handler reports failures. Never display success for a failed copy. */ }
  };
  const menuItems = prompt.deletedAt ? [{label:'History',icon:<History size={16}/>,action:onOpen}, {label:'Restore prompt',icon:<RotateCcw size={16}/>,action:()=>onRestore?.()}, {label:'Delete permanently',icon:<Trash2 size={16}/>,action:onDelete,danger:true}] : [
    {label:prompt.kind==='template'?'Edit template':'Edit prompt',icon:<Pencil size={16}/>,action:onEdit},
    {label:'History',icon:<History size={16}/>,action:onOpen},
    {label:'Duplicate',icon:<CopyPlus size={16}/>,action:onDuplicate},
    {label:'Move to recycle bin',icon:<Trash2 size={16}/>,action:onDelete,danger:true}
  ];
  const content = <><h3>{prompt.title}</h3><p>{prompt.content}</p></>;
  return <article onClick={event=>{
    const target = event.target;
    // The native main button provides keyboard access. Non-control card areas copy too;
    // events bubbling from a portal menu must not activate the underlying card.
    if (deleted || !(target instanceof Element) || !event.currentTarget.contains(target)) return;
    if (target.closest('button,a,input,textarea,select,[role="button"],[role="menu"],[role="menuitem"]')) return;
    void copy();
  }} className={`prompt-card ${view==='list'?'prompt-row':''} type-${prompt.type.toLowerCase()} ${deleted?'is-deleted':''}`}>
    <div className="prompt-card-top"><div className={`type-icon type-${prompt.type.toLowerCase()}`}><Icon size={20} strokeWidth={1.7}/></div><span className="card-type">{category?.name || prompt.type}</span><div className="card-top-actions"><IconButton label={prompt.favorite?'Remove from favorites':'Add to favorites'} className={prompt.favorite?'is-favorite':''} onClick={event=>{event.stopPropagation();onFavorite();}} disabled={deleted}><Star size={17} fill={prompt.favorite?'currentColor':'none'}/></IconButton><Menu trigger={<IconButton label={`Options for ${prompt.title}`} onClick={event=>event.stopPropagation()}><MoreHorizontal size={18}/></IconButton>} items={menuItems}/></div></div>
    {deleted?<div className="prompt-card-main">{content}</div>:<button type="button" className="prompt-card-main" onClick={event=>{event.stopPropagation();void copy();}} aria-label={`Copy ${prompt.title}`}>{content}</button>}
    {tags.length>0&&<div className="card-tags">{tags.map(t=><span className="tag" key={t.id}>{t.name}</span>)}</div>}
    <div className="prompt-card-footer"><span>{prompt.deletedAt ? `Deleted ${timeAgo(prompt.deletedAt).toLowerCase()}` : `Edited ${timeAgo(prompt.updatedAt).toLowerCase()}`}</span><div className="card-footer-actions">
      {!deleted&&<span className={`card-copy-status ${copied?'is-copied':''}`} role="status" aria-live="polite">{copied&&<><Check size={13} aria-hidden="true"/>Copied</>}</span>}
      {!deleted&&variableCount>0&&<button type="button" className="variables-btn" aria-label={`Variables for ${prompt.title}`} onClick={event=>{event.stopPropagation();onVariables();}}><Braces size={15} aria-hidden="true"/><span>Variables</span></button>}
      {deleted?<Button small onClick={event=>{event.stopPropagation();onRestore?.();}}><RotateCcw size={14}/>Restore</Button>:prompt.kind==='template'?<Button small onClick={event=>{event.stopPropagation();onApply?.();}}>Use template</Button>:null}
    </div></div>
  </article>;
}
