export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Fall through for restricted clipboard contexts. */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const el = document.createElement('textarea');
  el.value = text; el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(el); el.focus(); el.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } finally { el.remove(); previous?.focus(); }
  if (!copied) throw new Error('Clipboard access was blocked. Open the prompt, select its text, and copy it manually.');
}
