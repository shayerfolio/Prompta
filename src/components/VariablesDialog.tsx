import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { repository } from '../data/repository';
import { detectVariables, fillVariables } from '../domain/variables';
import type { Prompt } from '../domain/types';
import { copyText } from '../lib/clipboard';
import { Button, Modal } from './ui';
import './panels.css';

export function VariablesDialog({ open, prompt, onClose, notify }: { open: boolean; prompt: Prompt; onClose: () => void; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }) {
  const [values,setValues] = useState<Record<string,string>>({});
  const [confirmUnresolved,setConfirmUnresolved] = useState(false);
  const [copied,setCopied] = useState(false);
  const [busy,setBusy] = useState(false);
  const variables = useMemo(() => detectVariables(prompt.content),[prompt.content]);
  const unresolved = variables.filter(v => !values[v]?.trim());
  const preview = useMemo(() => fillVariables(prompt.content,values),[prompt.content,values]);
  useEffect(() => { if (open) { setValues({}); setConfirmUnresolved(false); setCopied(false); } },[open,prompt.id]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false),2000); return () => clearTimeout(timer); },[copied]);
  async function copy(allowUnresolved = false) {
    if (busy) return;
    if (unresolved.length && !allowUnresolved) { setConfirmUnresolved(true); return; }
    setBusy(true);
    try {
      await copyText(preview);
      setCopied(true); setConfirmUnresolved(false);
      notify('Filled prompt copied.', 'success');
      try { await repository.recordCopy(prompt.id); } catch { notify('Copied successfully. The usage count could not be updated.', 'info'); }
    } catch (error) { notify(error instanceof Error ? error.message : 'Clipboard access was blocked.', 'error'); }
    finally { setBusy(false); }
  }
  return <>
    <Modal open={open} onClose={onClose} title="Fill variables" className="variables-modal" footer={<><span className="variable-progress">{variables.length - unresolved.length} of {variables.length} variables filled</span><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => copy()} disabled={busy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy filled prompt'}</Button></>}>
      <div className="variables-prompt-title">{prompt.title}</div>
      <div className="variables-layout"><div className="variables-fields">{variables.map((name,index) => <div className="field" key={name}><label className="field-label" htmlFor={`variable-${index}`}>{name.replace(/_/g,' ')}</label><textarea id={`variable-${index}`} autoFocus={index === 0} className="textarea" rows={2} value={values[name] || ''} placeholder={`Enter ${name.replace(/_/g,' ')}…`} onChange={e => { setValues(previous => ({...previous,[name]:e.target.value})); setConfirmUnresolved(false); setCopied(false); }}/><code className="variable-label">{`{{${name}}}`}</code></div>)}</div><div className="variables-preview-wrap"><div className="field-label-row"><span className="field-label">Live preview</span></div><pre className="variables-preview">{preview}</pre>{unresolved.length > 0 && <p className="unresolved-note"><AlertCircle size={15}/>{unresolved.length} unfilled variable{unresolved.length === 1 ? '' : 's'} will keep their placeholders.</p>}</div></div>
    </Modal>
    <Modal open={confirmUnresolved} onClose={() => setConfirmUnresolved(false)} title="Copy with unfilled variables?" description={`${unresolved.length} variable${unresolved.length === 1 ? ' is' : 's are'} still empty. Their original placeholders will stay in the copied prompt.`} className="confirm-modal" footer={<><Button onClick={() => setConfirmUnresolved(false)}>Keep filling</Button><Button variant="primary" onClick={() => copy(true)} disabled={busy}>Copy anyway</Button></>}><div className="unresolved-variables">{unresolved.map(v => <code className="variable-chip" key={v}>{`{{${v}}}`}</code>)}</div></Modal>
  </>;
}
