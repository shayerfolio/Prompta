import { useId, useMemo, useState, type CSSProperties } from 'react';
import { Search, X, Plus, SlidersHorizontal, LayoutGrid, List, Star, Trash2, FileText, Image, Video, Code2, Sparkles } from 'lucide-react';
import type { LibrarySnapshot, SortOrder, PromptType, Prompt } from '../domain/types';
import { filterPrompts } from '../domain/search';
import { repository } from '../data/repository';
import { PromptCard } from '../components/PromptCard';
import { Button, IconButton, EmptyState } from '../components/ui';
import type { PromptActions } from '../domain/actions';

export const sortLabels: Record<SortOrder,string> = {modified:'Recently edited',created:'Recently created',az:'Alphabetical A–Z',za:'Alphabetical Z–A',used:'Recently used',copies:'Most copied'};
const GRID_CARD_WIDTH_KEY = 'prompta:grid-card-width';
const MIN_CARD_WIDTH = 240;
const MAX_CARD_WIDTH = 560;
const DEFAULT_CARD_WIDTH = 320;
function normalizedCardWidth(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.round(value / 10) * 10)) : DEFAULT_CARD_WIDTH;
}
function storedCardWidth(): number {
  try {
    const stored = window.localStorage.getItem(GRID_CARD_WIDTH_KEY);
    return stored?.trim() ? normalizedCardWidth(Number(stored)) : DEFAULT_CARD_WIDTH;
  } catch { return DEFAULT_CARD_WIDTH; }
}
export function LibraryPage({page,snapshot,actions,query,setQuery,onNew,onVariables,collectionId,categoryId,restore,emptyTrash,onManageCollection}:{page:string;snapshot:LibrarySnapshot;actions:PromptActions;query:string;setQuery:(q:string)=>void;onNew:()=>void;onVariables:(prompt:Prompt)=>void;collectionId?:string;categoryId?:string;restore:(id:string)=>void;emptyTrash:()=>void;onManageCollection:()=>void}) {
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [viewError,setViewError]=useState('');
  const [gridSizeError,setGridSizeError]=useState('');
  const [cardWidth,setCardWidth]=useState(storedCardWidth);
  const gridSizeId=useId();
  const [category,setCategory]=useState(categoryId||'');
  const [tag,setTag]=useState('');
  const [collection,setCollection]=useState('');
  const [type,setType]=useState<PromptType|'all'>('all');
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [limit,setLimit]=useState(36);
  const settings=snapshot.settings;
  const [view,setView]=useState(settings.view);
  const [sort,setSort]=useState<SortOrder|'collection'>(page==='collection'?'collection':page==='recent'?'used':page==='edited'?'modified':settings.sort);
  const activeCollection=snapshot.collections.find(c=>c.id===collectionId);
  const activeCategory=snapshot.categories.find(c=>c.id===categoryId);
  const isTrash=page==='trash'; const isTemplates=page==='templates';
  const source = isTemplates?snapshot.templates:isTrash?[...snapshot.prompts,...snapshot.templates].filter(p=>!!p.deletedAt):(page==='collection'||page==='category')?[...snapshot.prompts,...snapshot.templates]:snapshot.prompts;
  const filtered=useMemo(()=>{
    let result=filterPrompts(source,snapshot,{categoryId:category||undefined,tagIds:tag?[tag]:[],collectionId:collectionId||collection||undefined,type,favorite:page==='favorites'||onlyFavorites,includeDeleted:isTrash},sort==='collection'?'modified':sort,query);
    if(page==='recent')result=result.filter(p=>!!p.lastCopiedAt);
    if(page==='collection'&&activeCollection&&sort==='collection')result.sort((a,b)=>activeCollection.promptIds.indexOf(a.id)-activeCollection.promptIds.indexOf(b.id));
    return result;
  },[source,snapshot,category,tag,collection,collectionId,type,page,onlyFavorites,sort,query,isTrash,activeCollection]);
  const hasFilters=Boolean((category&&category!==categoryId)||tag||collection||onlyFavorites||type!=='all'||query);
  const clear=()=>{setCategory(categoryId||'');setTag('');setCollection('');setOnlyFavorites(false);setType('all');setQuery('');setLimit(36);};
  const title=isTrash?'Recycle bin':isTemplates?'Templates':page==='favorites'?'Favorites':page==='recent'?'Recently used':page==='edited'?'Recently edited':page==='collection'?activeCollection?.name||'Collection not found':page==='category'?activeCategory?.name||'Category not found':'All prompts';
  const subtitle=isTrash?'Permanently deleted after 30 days.':page==='collection'?activeCollection?.description:undefined;
  const types=[{name:'all' as const,label:'All types',icon:LayoutGrid},{name:'Text' as const,label:'Text',icon:FileText},{name:'Image' as const,label:'Image',icon:Image},{name:'Video' as const,label:'Video',icon:Video},{name:'Code' as const,label:'Code',icon:Code2},{name:'Other' as const,label:'Other',icon:Sparkles}];
  const saveView=async(value:'grid'|'list')=>{setView(value);try{await repository.saveSettings({view:value});}catch{setView(settings.view);setViewError('Your view preference could not be saved. Please try again.');}};
  const resizeCards=(value:number)=>{
    const width=normalizedCardWidth(value);
    setCardWidth(width);
    try{window.localStorage.setItem(GRID_CARD_WIDTH_KEY,String(width));setGridSizeError('');}
    catch{setGridSizeError('Card size applies for this session. Device storage is unavailable.');}
  };
  return <div className="library-page page-enter"><div className="page-heading"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{isTrash?<Button variant="danger" onClick={emptyTrash} disabled={!source.length}><Trash2 size={17}/>Empty bin</Button>:<div className="heading-actions">{page==='collection'&&<Button onClick={onManageCollection}><SlidersHorizontal size={17}/>Manage</Button>}<Button variant="primary" className="library-new-button" onClick={onNew}><Plus size={18}/>New {isTemplates?'template':'prompt'}</Button></div>}</div>
    {viewError&&<p role="alert" className="form-error">{viewError}</p>}<div className="library-search-row"><div className="search-field"><Search size={20}/><input id="global-search" aria-label="Search library" placeholder={isTemplates?'Search templates':'Search prompts'} value={query} onChange={e=>{setQuery(e.target.value);setLimit(36);}}/>{query?<IconButton label="Clear search" onClick={()=>setQuery('')}><X size={17}/></IconButton>:<kbd>Ctrl K</kbd>}</div><Button className={filtersOpen||hasFilters?'filter-active':''} onClick={()=>setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><SlidersHorizontal size={17}/>Filters{hasFilters&&<span className="filter-dot"/>}</Button></div>
    <div className="type-tabs" role="tablist" aria-label="Prompt types">{types.map(t=><button key={t.name} role="tab" aria-selected={type===t.name} className={type===t.name?'active':''} onClick={()=>{setType(t.name);setLimit(36);}}><t.icon size={17}/>{t.label}</button>)}</div>
    {filtersOpen&&<div className="filters-panel"><label className="field"><span className="field-label">Category</span><select className="select" disabled={!!categoryId} value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{snapshot.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span className="field-label">Tag</span><select className="select" value={tag} onChange={e=>setTag(e.target.value)}><option value="">All tags</option>{snapshot.tags.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>{!collectionId&&<label className="field"><span className="field-label">Collection</span><select className="select" value={collection} onChange={e=>setCollection(e.target.value)}><option value="">All collections</option>{snapshot.collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className="checkbox-label filter-favorite"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/><Star size={15}/>Favorites only</label></div>}
    <div className="results-toolbar"><div className="result-count"><strong>{filtered.length}</strong> {isTemplates?(filtered.length===1?'template':'templates'):(filtered.length===1?'prompt':'prompts')}{query&&<span> matching “{query}”</span>}{hasFilters&&<button className="text-button" onClick={clear}><X size={13}/>Clear filters</button>}</div><div className="view-controls"><select aria-label="Sort prompts" className="sort-select" value={sort} onChange={e=>setSort(e.target.value as SortOrder|'collection')}>{collectionId&&<option value="collection">Collection order</option>}{Object.entries(sortLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{view==='grid'&&<label className="grid-size-control" htmlFor={gridSizeId}><span>Size</span><input id={gridSizeId} className="grid-size-range" type="range" aria-label="Card size" min={MIN_CARD_WIDTH} max={MAX_CARD_WIDTH} step={10} value={cardWidth} aria-valuetext={`${Math.round((cardWidth-MIN_CARD_WIDTH)/(MAX_CARD_WIDTH-MIN_CARD_WIDTH)*100)}%`} onChange={event=>resizeCards(Number(event.target.value))}/></label>}<div className="segmented"><IconButton label="Grid view" className={view==='grid'?'selected':''} onClick={()=>void saveView('grid')} aria-pressed={view==='grid'}><LayoutGrid size={17}/></IconButton><IconButton label="List view" className={view==='list'?'selected':''} onClick={()=>void saveView('list')} aria-pressed={view==='list'}><List size={18}/></IconButton></div></div></div>
    {gridSizeError&&<p role="status" className="form-error">{gridSizeError}</p>}
    {filtered.length ? <>
      <div className={view==='grid'?'prompt-grid':'prompt-list'} style={view==='grid'?{'--prompt-card-min-width':`${cardWidth}px`} as CSSProperties:undefined}>{filtered.slice(0,limit).map(p=><PromptCard key={p.id} prompt={p} snapshot={snapshot} view={view} onOpen={()=>actions.open(p)} onVariables={()=>onVariables(p)} onCopy={()=>actions.copy(p)} onFavorite={()=>actions.favorite(p)} onEdit={()=>actions.edit(p)} onDuplicate={()=>actions.duplicate(p)} onDelete={()=>actions.remove(p)} onRestore={()=>restore(p.id)} onApply={()=>actions.apply(p)}/>)}</div>
      {filtered.length>limit&&<div className="load-more"><Button onClick={()=>setLimit(limit+36)}>Show more</Button><span>{Math.min(limit,filtered.length)} of {filtered.length}</span></div>}
    </> : <EmptyState title={hasFilters?'No results':isTrash?'Recycle bin is empty':page==='favorites'?'No favorites':page==='recent'?'No recently used prompts':isTemplates?'No templates':'No prompts'} action={hasFilters?<Button onClick={clear}>Clear filters</Button>:undefined}/>}
  </div>;
}
