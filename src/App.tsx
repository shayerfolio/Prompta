import { useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react';
import { Library, Star, Clock3, Folder, Shapes, BookOpen, Trash2, Settings, Plus, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, Cloud, CloudOff, RefreshCw, Check, X, AlertCircle, LockKeyhole, Menu as MenuIcon, LoaderCircle, Keyboard, Info } from 'lucide-react';
import { repository } from './data/repository';
import { cloud } from './lib/cloud';
import { copyText } from './lib/clipboard';
import type { Prompt } from './domain/types';
import { Button, IconButton, Modal, ConfirmDialog } from './components/ui';
import { PromptEditor } from './components/PromptEditor';
import { PromptDetail } from './components/PromptDetail';
import { PinAccess } from './components/PinAccess';
import { VariablesDialog } from './components/VariablesDialog';
import type { PromptActions } from './domain/actions';
import { LibraryPage } from './pages/LibraryPage';
import { OrganizePage, OrganizationDialog } from './pages/OrganizePage';
import { SettingsPage, SetupGuide } from './pages/SettingsPage';

const navigation=[{id:'all',label:'All prompts',icon:Library},{id:'favorites',label:'Favorites',icon:Star},{id:'recent',label:'Recently used',icon:Clock3},{id:'collections',label:'Collections',icon:Folder},{id:'categories',label:'Categories & tags',icon:Shapes},{id:'templates',label:'Templates',icon:BookOpen}];
const pageLabels:Record<string,string>={all:'All prompts',edited:'Recently edited',favorites:'Favorites',recent:'Recently used',collections:'Collections',collection:'Collection',categories:'Categories & tags',category:'Category',templates:'Templates',trash:'Recycle bin',settings:'Settings'};
interface Toast {id:number;message:string;tone:'success'|'error'|'info';action?:{label:string;run:()=>void}}
interface EditorState {prompt?:Prompt;template?:Prompt;kind?:'prompt'|'template';collectionId?:string}
function getParams(){return new URLSearchParams(location.search);}

export default function App() {
  const snapshot=useSyncExternalStore(repository.subscribe,repository.getSnapshot);
  const cloudState=useSyncExternalStore(cloud.subscribe,cloud.getSnapshot);
  const [params,setParams]=useState(getParams);
  const page=pageLabels[params.get('page')||'']?params.get('page')!:'all';
  const query=params.get('q')||'';
  const selectedId=params.get('prompt');
  const selected=[...snapshot.prompts,...snapshot.templates].find(p=>p.id===selectedId);
  const [editor,setEditor]=useState<EditorState|null>(null);
  const [variablesPrompt,setVariablesPrompt]=useState<Prompt|null>(null);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [collectionsExpanded,setCollectionsExpanded]=useState(true);
  const [newCollection,setNewCollection]=useState(false);
  const [manageCollection,setManageCollection]=useState(false);
  const [setupOpen,setSetupOpen]=useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [deletePrompt,setDeletePrompt]=useState<Prompt|null>(null);
  const [emptyBin,setEmptyBin]=useState(false);
  const [busy,setBusy]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const [toasts,setToasts]=useState<Toast[]>([]);
  const mainRef=useRef<HTMLElement>(null);
  const toastId=useRef(0);
  const closingUrl=useRef<URL|null>(null);
  const collapsed=snapshot.settings.sidebarCollapsed;
  const active=snapshot.prompts.filter(p=>!p.deletedAt);
  const collectionId=params.get('collection')||undefined;
  const currentCollection=snapshot.collections.find(c=>c.id===collectionId);
  const notify=useCallback((message:string,tone:'success'|'error'|'info'='success',action?:Toast['action'])=>{const id=++toastId.current;setToasts(t=>[...t.slice(-2),{id,message,tone,action}]);setTimeout(()=>setToasts(t=>t.filter(v=>v.id!==id)),tone==='error'?8500:4200);},[]);
  useEffect(()=>{void cloud.init().catch(e=>notify(e instanceof Error?e.message:'Could not open local storage.','error'));const pop=()=>{if(closingUrl.current){history.replaceState({prompta:true,panel:false},'',closingUrl.current);closingUrl.current=null;}setParams(getParams());};const connectivity=()=>setOnline(navigator.onLine);window.addEventListener('popstate',pop);window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);};},[notify]);
  useEffect(()=>{document.documentElement.dataset.reduceMotion=snapshot.settings.reducedMotion?'true':'false';},[snapshot.settings.reducedMotion]);
  useEffect(()=>{document.title=`${pageLabels[page]} · Prompta`;},[page]);
  const changeUrl=useCallback((values:Record<string,string|undefined>,replace=false)=>{const url=new URL(location.href);for(const [key,value]of Object.entries(values)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}if(replace||(values.prompt&&new URL(location.href).searchParams.has('prompt')))history.replaceState(history.state,'',url);else history.pushState({prompta:true,panel:!!values.prompt},'',url);setParams(new URLSearchParams(url.search));},[]);
  const navigate=useCallback((next:string,id?:string)=>{changeUrl({page:next,q:undefined,prompt:undefined,collection:next==='collection'?id:undefined,category:next==='category'?id:undefined});setMobileOpen(false);mainRef.current?.scrollTo({top:0});window.scrollTo({top:0});},[changeUrl]);
  const closeDetail=useCallback(()=>{if(history.state?.panel){const url=new URL(location.href);url.searchParams.delete('prompt');closingUrl.current=url;history.back();}else changeUrl({prompt:undefined},true);},[changeUrl]);
  const newPrompt=useCallback(()=>setEditor({kind:page==='templates'?'template':'prompt',collectionId}),[page,collectionId]);
  const focusSearch=useCallback(()=>{let input=document.getElementById('global-search') as HTMLInputElement|null;if(input){input.focus();input.select();}else{navigate('all');setTimeout(()=>document.getElementById('global-search')?.focus(),60);}},[navigate]);
  useEffect(()=>{const shortcut=(e:KeyboardEvent)=>{if(cloudState.configured&&!cloudState.user)return;const target=e.target as HTMLElement;const typing=target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName);const modalOpen=!!document.querySelector('[role="dialog"][data-state="open"]:not(.prompt-detail-panel)');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!modalOpen){e.preventDefault();focusSearch();}else if(e.key.toLowerCase()==='n'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!modalOpen){e.preventDefault();newPrompt();}else if(e.key==='?'&&!typing&&!modalOpen){setHelpOpen(true);}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[focusSearch,newPrompt,cloudState.configured,cloudState.user]);
  useEffect(()=>{if(cloudState.configured&&!cloudState.user){setEditor(null);setVariablesPrompt(null);setMobileOpen(false);}},[cloudState.configured,cloudState.user]);
  const run=async(work:()=>Promise<unknown>,message:string)=>{try{await work();notify(message);}catch(e){notify(e instanceof Error?e.message:'Something went wrong. Please try again.','error');}};
  const rawCopy=async(p:Prompt,feedback=true)=>{try{await copyText(p.content);}catch(e){notify(e instanceof Error?e.message:'Clipboard access is unavailable.','error');throw e;}try{await repository.recordCopy(p.id);if(feedback)notify('Copied');}catch{notify('Copied to clipboard. Activity could not be saved.','info');}};
  const remove=(p:Prompt)=>{if(p.deletedAt){setDeletePrompt(p);return;}void(async()=>{try{await repository.trashPrompt(p.id);if(selectedId===p.id)closeDetail();notify('Moved to recycle bin.','success',{label:'Undo',run:()=>void run(()=>repository.restorePrompt(p.id),'Prompt restored.')});}catch(e){notify(e instanceof Error?e.message:'Unable to delete prompt.','error');}})();};
  const duplicate=async(p:Prompt)=>{try{await repository.duplicatePrompt(p.id);notify('Duplicated');}catch(e){notify(e instanceof Error?e.message:'Unable to duplicate prompt.','error');}};
  const actions:PromptActions={open:p=>changeUrl({prompt:p.id}),copy:p=>rawCopy(p,false),favorite:p=>void run(()=>repository.toggleFavorite(p.id),p.favorite?'Removed from favorites.':'Saved to favorites.'),edit:p=>setEditor({prompt:p}),duplicate:p=>void duplicate(p),remove,apply:p=>setEditor({template:p,kind:'prompt'})};
  const permanentDelete=async()=>{if(!deletePrompt)return;setBusy(true);try{await repository.permanentlyDeletePrompt(deletePrompt.id);if(selectedId===deletePrompt.id)closeDetail();setDeletePrompt(null);notify('Prompt permanently deleted.');}catch(e){notify(e instanceof Error?e.message:'Unable to delete prompt.','error');}finally{setBusy(false);}};
  const emptyTrash=async()=>{setBusy(true);try{await repository.emptyTrash();if(selected?.deletedAt)closeDetail();setEmptyBin(false);notify('Recycle bin emptied.');}catch(e){notify(e instanceof Error?e.message:'Unable to empty recycle bin.','error');}finally{setBusy(false);}};
  const status= !online?'Offline':cloudState.status==='local'?'Saved on this device':cloudState.status==='synced'?'All changes synced':cloudState.status==='syncing'||cloudState.status==='connecting'?'Syncing…':cloudState.status==='conflict'?'Review sync conflicts':cloudState.status==='error'?'Sync needs attention':'Locked';
  const StatusIcon=!online?CloudOff:cloudState.status==='synced'?Check:cloudState.status==='error'||cloudState.status==='conflict'?AlertCircle:cloudState.status==='syncing'?RefreshCw:Cloud;
  const toastUI=<div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map(t=><div className={`toast toast-${t.tone}`} key={t.id} role={t.tone==='error'?'alert':'status'}><span className="toast-icon">{t.tone==='success'?<Check size={17}/>:t.tone==='error'?<AlertCircle size={18}/>:<InfoIcon/>}</span><span>{t.message}</span>{t.action&&<button onClick={()=>{t.action?.run();setToasts(v=>v.filter(x=>x.id!==t.id));}}>{t.action.label}</button>}<IconButton label="Dismiss notification" onClick={()=>setToasts(v=>v.filter(x=>x.id!==t.id))}><X size={15}/></IconButton></div>)}</div>;
  if(cloudState.configured&&!cloudState.user) return <><PinAccess state={cloudState} onSetup={()=>setSetupOpen(true)}/><SetupGuide open={setupOpen} onClose={()=>setSetupOpen(false)}/>{toastUI}</>;
  if(!snapshot.ready)return <div className="app-loading"><img src="/favicon.svg" alt="Prompta"/><p>Loading…</p><LoaderCircle className="spin" size={20}/></div>;
  if(snapshot.error)return <div className="fatal-error"><AlertCircle size={36}/><h1>Your local storage needs attention.</h1><p>{snapshot.error}</p><p>Try a browser with IndexedDB enabled, and make sure this device has available storage.</p><Button variant="primary" onClick={()=>location.reload()}>Try again</Button></div>;
  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${mobileOpen?'mobile-menu-open':''}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    {mobileOpen&&<button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
    <aside className="sidebar" aria-label="Main navigation"><div className="sidebar-brand"><button onClick={()=>navigate('all')} aria-label="All prompts"><img src="/favicon.svg" alt=""/><span>prompta<span className="brand-dot">.</span></span></button><IconButton className="sidebar-width-toggle" label={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>void repository.saveSettings({sidebarCollapsed:!collapsed}).catch(e=>notify(e instanceof Error?e.message:'Could not save sidebar preference.','error'))}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</IconButton><IconButton label="Close navigation" className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={20}/></IconButton></div>
      <div className="sidebar-scroll"><nav>{navigation.map(n=><button key={n.id} onClick={()=>navigate(n.id)} className={`nav-item ${(page===n.id||(page==='collection'&&n.id==='collections')||(page==='category'&&n.id==='categories')||(page==='edited'&&n.id==='all'))?'active':''}`} title={collapsed?n.label:undefined} aria-label={n.label} aria-current={page===n.id?'page':undefined}><n.icon size={19} strokeWidth={1.7}/><span>{n.label}</span>{n.id==='all'&&<span className="nav-count">{active.length}</span>}{n.id==='favorites'&&active.some(p=>p.favorite)&&<span className="nav-count">{active.filter(p=>p.favorite).length}</span>}</button>)}</nav>
      {snapshot.collections.length>0&&<><div className="nav-section-title"><button className="nav-label" onClick={()=>setCollectionsExpanded(!collectionsExpanded)} aria-expanded={collectionsExpanded}>{collectionsExpanded?<ChevronDown size={12}/>:<ChevronRight size={12}/>}Collections</button><IconButton label="Create a collection" onClick={()=>setNewCollection(true)}><Plus size={15}/></IconButton></div>{collectionsExpanded&&<div className="sidebar-collections">{snapshot.collections.slice(0,5).map(c=><button className={`nav-item collection-nav ${collectionId===c.id?'active':''}`} onClick={()=>navigate('collection',c.id)} key={c.id} title={c.name}><span className="collection-dot" style={{backgroundColor:c.color}}/><span>{c.name}</span></button>)}</div>}</>}</div>
      <div className="sidebar-bottom"><nav><button className={`nav-item ${page==='trash'?'active':''}`} onClick={()=>navigate('trash')} aria-label="Recycle bin" title={collapsed?'Recycle bin':undefined}><Trash2 size={18}/><span>Recycle bin</span></button><button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>navigate('settings')} aria-label="Settings" title={collapsed?'Settings':undefined}><Settings size={18}/><span>Settings</span></button><button className="nav-item" onClick={()=>setHelpOpen(true)} aria-label="Shortcuts" title={collapsed?'Shortcuts':undefined}><Keyboard size={18}/><span>Shortcuts</span><kbd>?</kbd></button></nav><button className="sidebar-sync" onClick={()=>cloudState.configured?navigate('settings'):setSetupOpen(true)} title={status}><StatusIcon size={14} className={cloudState.status==='syncing'?'spin':''}/><span>{status}</span></button>{cloudState.user&&<button className="nav-item sidebar-lock" onClick={()=>void cloud.lock()} title={collapsed?'Lock library':undefined}><LockKeyhole size={18}/><span>Lock library</span></button>}</div>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="topbar-left"><IconButton className="mobile-menu-toggle" label="Open navigation" onClick={()=>setMobileOpen(true)}><MenuIcon size={21}/></IconButton><span className="mobile-brand"><img src="/favicon.svg" alt=""/>Prompta</span></div><div className="topbar-right"><IconButton label={cloudState.user?'Lock library':'Settings'} onClick={()=>cloudState.user?void cloud.lock():navigate('settings')}>{cloudState.user?<LockKeyhole size={19}/>:<Settings size={19}/>}</IconButton></div></header>
    {!online&&<div className="offline-banner"><CloudOff size={16}/>Offline</div>}
    <main className="main-content" id="main-content" ref={mainRef}>
    {page==='collections'||page==='categories'?<OrganizePage key={page} page={page} snapshot={snapshot} navigate={navigate} notify={notify}/>:page==='settings'?<SettingsPage snapshot={snapshot} cloudState={cloudState} notify={notify} onShowSetup={()=>setSetupOpen(true)}/>:<LibraryPage key={`${page}-${collectionId||''}-${params.get('category')||''}`} page={page} snapshot={snapshot} actions={actions} onVariables={setVariablesPrompt} query={query} setQuery={q=>changeUrl({q:q||undefined},true)} onNew={newPrompt} collectionId={collectionId} categoryId={params.get('category')||undefined} restore={id=>void run(()=>repository.restorePrompt(id),'Prompt restored.')} emptyTrash={()=>setEmptyBin(true)} onManageCollection={()=>setManageCollection(true)}/>}
    </main></div>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{[{id:'all',label:'Prompts',icon:Library},{id:'favorites',label:'Favorites',icon:Star},{id:'new',label:'New',icon:Plus},{id:'collections',label:'Collections',icon:Folder}].map(n=><button key={n.id} className={`${page===n.id?'active':''} ${n.id==='new'?'mobile-add':''}`} onClick={()=>n.id==='new'?newPrompt():navigate(n.id)}><n.icon size={21}/><span>{n.label}</span></button>)}</nav>
    {selected&&<PromptDetail initialTab="history" key={selected.id} prompt={selected} snapshot={snapshot} onClose={closeDetail} onEdit={()=>actions.edit(selected)} onCopy={()=>void rawCopy(selected).catch(()=>undefined)} onFavorite={()=>actions.favorite(selected)} onDelete={()=>remove(selected)} onDuplicate={()=>void duplicate(selected)} onApplyTemplate={selected.kind==='template'?()=>actions.apply(selected):undefined} notify={notify}/>}
    {selectedId&&!selected&&snapshot.ready&&<Modal open onClose={closeDetail} title="Prompt unavailable" description="This prompt may have been permanently deleted, or it hasn’t synced to this device yet." className="small-modal" footer={<Button variant="primary" onClick={closeDetail}>Close</Button>}><div className="info-box"><Cloud size={20}/><p>If this is a cloud prompt, connect to the internet and allow synchronization to finish.</p></div></Modal>}
    {variablesPrompt&&<VariablesDialog open prompt={variablesPrompt} onClose={()=>setVariablesPrompt(null)} notify={notify}/>}
    {editor&&<PromptEditor key={editor.prompt?.id||editor.template?.id||editor.kind||'new'} open prompt={editor.prompt} template={editor.template} initialKind={editor.kind} initialCollectionId={editor.collectionId} snapshot={snapshot} onClose={()=>setEditor(null)} onSaved={()=>setEditor(null)} notify={notify}/>}
    {newCollection&&<OrganizationDialog open kind="collection" snapshot={snapshot} onClose={()=>setNewCollection(false)} onSaved={notify}/>}
    {manageCollection&&currentCollection&&<OrganizationDialog open kind="collection" entity={currentCollection} snapshot={snapshot} onClose={()=>setManageCollection(false)} onSaved={notify}/>}
    <SetupGuide open={setupOpen} onClose={()=>setSetupOpen(false)}/>
    <Modal open={helpOpen} onClose={()=>setHelpOpen(false)} title="Keyboard shortcuts" className="help-modal"><div className="shortcut-row"><span>Search prompts</span><kbd>Ctrl / ⌘ K</kbd></div><div className="shortcut-row"><span>New prompt</span><kbd>N</kbd></div><div className="shortcut-row"><span>Save</span><kbd>Ctrl / ⌘ Enter</kbd></div><div className="shortcut-row"><span>Close panel</span><kbd>Esc</kbd></div></Modal>
    <ConfirmDialog open={!!deletePrompt} onClose={()=>setDeletePrompt(null)} onConfirm={()=>void permanentDelete()} busy={busy} title="Delete permanently?" description={`“${deletePrompt?.title||'This prompt'}” and its saved versions will be permanently removed from this library. This can’t be undone.`} label="Delete permanently" danger/>
    <ConfirmDialog open={emptyBin} onClose={()=>setEmptyBin(false)} onConfirm={()=>void emptyTrash()} busy={busy} title="Empty the recycle bin?" description="Every prompt in the recycle bin and its saved revisions will be permanently deleted. This can’t be undone." label="Empty recycle bin" danger/>
    {toastUI}
  </div>;
}
function InfoIcon(){return <Info size={17}/>;}
