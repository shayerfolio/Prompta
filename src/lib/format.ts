export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'Not used yet';
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60000) return 'Just now';
  if (delta < 3600000) return `${Math.floor(delta/60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta/3600000)}h ago`;
  if (delta < 604800000) return `${Math.floor(delta/86400000)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function fullDate(value: string): string { return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }
export function initials(value: string): string { return value.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase() || 'P'; }
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
