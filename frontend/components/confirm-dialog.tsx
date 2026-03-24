'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    },
    [open, onCancel, onConfirm],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  if (!open) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative w-full max-w-sm bg-surface-0 border border-border-default rounded-xl shadow-2xl overflow-hidden animate-fade-in-up"
        style={{ animationDuration: '0.12s' }}
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            {isDanger && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-error/10 border border-error/20 shrink-0">
                <AlertTriangle size={14} className="text-error" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              {message && (
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">{message}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs text-text-secondary bg-surface-1 border border-border-default rounded-lg hover:bg-surface-2 hover:border-border-focus transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer outline-none ${
              isDanger
                ? 'bg-error text-white hover:bg-error/90'
                : 'bg-accent text-bg hover:bg-accent-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
