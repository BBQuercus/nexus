'use client';

import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  add: (toast: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 5;
const DEDUP_WINDOW_MS = 2000;

// Track recent messages for dedup
let _recentMessages: { message: string; time: number }[] = [];

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) =>
    set((s) => {
      // Deduplicate: skip if same message shown recently
      const now = Date.now();
      _recentMessages = _recentMessages.filter((r) => now - r.time < DEDUP_WINDOW_MS);
      if (_recentMessages.some((r) => r.message === toast.message)) return s;
      _recentMessages.push({ message: toast.message, time: now });

      // Rate limit: max visible toasts
      const existing = s.toasts.length >= MAX_VISIBLE_TOASTS ? s.toasts.slice(1) : s.toasts;
      return {
        toasts: [...existing, { ...toast, id: `toast-${now}-${Math.random().toString(36).slice(2, 6)}` }],
      };
    }),
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers
export const toast = {
  success: (message: string) => useToast.getState().add({ type: 'success', message }),
  error: (message: string) => useToast.getState().add({ type: 'error', message, duration: 6000 }),
  warning: (message: string) => useToast.getState().add({ type: 'warning', message }),
  info: (message: string) => useToast.getState().add({ type: 'info', message }),
};

const ICONS = {
  success: <CheckCircle2 size={14} />,
  error: <XCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
};

const COLORS = {
  success: 'text-accent border-accent/20 bg-accent/5',
  error: 'text-error border-error/20 bg-error/5',
  warning: 'text-warning border-warning/20 bg-warning/5',
  info: 'text-info border-info/20 bg-info/5',
};

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onRemove, 150);
  }, [onRemove]);

  useEffect(() => {
    const timer = setTimeout(dismiss, t.duration || 3500);
    return () => clearTimeout(timer);
  }, [t.duration, dismiss]);

  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 border rounded-lg shadow-lg shadow-black/20 backdrop-blur-sm text-xs transition-all ${COLORS[t.type]} ${
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      style={{ animation: exiting ? undefined : 'fadeInUp 0.2s ease-out' }}
    >
      <span className="shrink-0">{ICONS[t.type]}</span>
      <span className="flex-1 text-text-primary">{t.message}</span>
      <button onClick={dismiss} className="shrink-0 text-text-tertiary hover:text-text-secondary cursor-pointer">
        <X size={12} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => remove(t.id)} />
      ))}
    </div>
  );
}
