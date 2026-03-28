'use client';

import { lazy, Suspense, useEffect, useCallback } from 'react';
import { X, Download } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Toaster } from './toast';
import ConfirmDialog from './confirm-dialog';
import { initErrorReporter } from '@/lib/error-reporter';
import { useKeyboardShortcuts } from './workspace/use-keyboard-shortcuts';
import BugReportDialog from './bug-report-dialog';

const KeyboardShortcuts = lazy(() => import('./keyboard-shortcuts'));

function LightboxModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filename = url.split('/').pop()?.split('?')[0] || 'image';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-1/90 backdrop-blur-sm rounded-t-xl border border-border-default border-b-0">
          <span className="text-[11px] font-mono text-text-tertiary truncate max-w-[60vw]">{filename}</span>
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <a
              href={url}
              download={filename}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors rounded"
            >
              <Download size={12} /> Save
            </a>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {/* Image */}
        <div className="bg-surface-0 rounded-b-xl border border-border-default overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename}
            className="block max-w-[90vw] max-h-[80vh] object-contain"
          />
        </div>
      </div>
    </div>
  );
}

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const bugReportOpen = useStore((s) => s.bugReportOpen);
  const setBugReportOpen = useStore((s) => s.setBugReportOpen);
  const lightboxUrl = useStore((s) => s.lightboxUrl);
  const setLightboxUrl = useStore((s) => s.setLightboxUrl);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  useKeyboardShortcuts();

  useEffect(() => {
    initErrorReporter();
  }, []);

  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener('nexus:open-shortcuts', handler);
    return () => window.removeEventListener('nexus:open-shortcuts', handler);
  }, [setShortcutsOpen]);

  useEffect(() => {
    const handler = () => setBugReportOpen(true);
    window.addEventListener('nexus:open-bug-report', handler);
    return () => window.removeEventListener('nexus:open-bug-report', handler);
  }, [setBugReportOpen]);

  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent<{ src: string }>).detail?.src;
      if (src) setLightboxUrl(src);
    };
    window.addEventListener('nexus:lightbox', handler);
    return () => window.removeEventListener('nexus:lightbox', handler);
  }, [setLightboxUrl]);

  const closeLightbox = useCallback(() => setLightboxUrl(null), [setLightboxUrl]);

  return (
    <>
      {children}
      <Suspense fallback={null}>
        {shortcutsOpen && (
          <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        )}
      </Suspense>
      <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
      {lightboxUrl && <LightboxModal url={lightboxUrl} onClose={closeLightbox} />}
      <Toaster />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </>
  );
}
