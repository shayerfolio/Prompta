import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { X } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; small?: boolean };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', small, className = '', children, ...props }, ref) {
  return <button ref={ref} type="button" className={`btn btn-${variant} ${small ? 'btn-small' : ''} ${className}`} {...props}>{children}</button>;
});
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, className = '', children, ...props }, ref) {
  return <button ref={ref} type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...props}>{children}</button>;
});
export function Modal({ open, onClose, title, description, children, footer, className = '' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  const descriptionId = useId();
  return <Dialog.Root open={open} onOpenChange={v => !v && onClose()}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={`modal ${className}`} aria-describedby={description ? descriptionId : undefined} onInteractOutside={e => e.preventDefault()}><div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id={descriptionId}>{description}</Dialog.Description>}</div><IconButton label="Close dialog" onClick={onClose}><X size={20}/></IconButton></div><div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Menu({ trigger, items }: { trigger: ReactNode; items: { label: string; icon?: ReactNode; action: () => void; danger?: boolean; disabled?: boolean }[] }) {
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown" sideOffset={7} align="end">{items.map((item,i) => <DropdownMenu.Item key={i} className={`dropdown-item ${item.danger ? 'danger-text' : ''}`} onSelect={item.action} disabled={item.disabled}>{item.icon}{item.label}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
export function EmptyState({ icon, title, description, action, compact = false }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}>{icon && <div className="empty-icon">{icon}</div>}<h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function ConfirmDialog({ title, description, open, onClose, onConfirm, label = 'Confirm', danger = false, busy = false }: { title: string; description: string; open: boolean; onClose: () => void; onConfirm: () => void; label?: string; danger?: boolean; busy?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title} description={description} className="confirm-modal" footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : label}</Button></>}><div className="confirmation-spacer"/></Modal>;
}
