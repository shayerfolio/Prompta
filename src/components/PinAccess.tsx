import { useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { CloudState } from '../domain/types';
import { cloud } from '../lib/cloud';
import { Button } from './ui';
import './pin-access.css';

export function PinAccess({ state, onSetup }: { state: CloudState; onSetup: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await cloud.unlock(pin); }
    catch (value) { setError(value instanceof Error ? value.message : 'Could not unlock. Try again.'); }
    finally { setPin(''); setBusy(false); }
  }
  const message = error || state.error;
  return <div className="pin-shell"><main className="pin-card">
    <h1 className="pin-brand"><img src="/favicon.svg" alt=""/>cuebase<span>.</span></h1>
    <form onSubmit={event => void unlock(event)}>
      <label className="field-label" htmlFor="library-pin">PIN</label>
      <input id="library-pin" className="input pin-input" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required autoFocus value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '')); setError(null); }} aria-invalid={!!message || undefined} aria-describedby={message ? 'pin-error' : undefined}/>
      {message && <p id="pin-error" className="form-error" role="alert">{message}</p>}
      <Button type="submit" variant="primary" disabled={busy || state.status === 'connecting'}>{busy || state.status === 'connecting' ? <><LoaderCircle size={17} className="spin"/>Opening…</> : 'Unlock'}</Button>
    </form>
    {message && /server|setup|unavailable|configured|database|binding|Cloudflare/i.test(message) && <button type="button" className="text-button pin-setup" onClick={onSetup}>Setup guide</button>}
  </main></div>;
}
