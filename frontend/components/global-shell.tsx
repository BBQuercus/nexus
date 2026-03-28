'use client';

import { lazy, Suspense, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Toaster } from './toast';
import ConfirmDialog from './confirm-dialog';
import { initErrorReporter } from '@/lib/error-reporter';
import { useKeyboardShortcuts } from './workspace/use-keyboard-shortcuts';
import BugReportDialog from './bug-report-dialog';

const KeyboardShortcuts = lazy(() => import('./keyboard-shortcuts'));

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const bugReportOpen = useStore((s) => s.bugReportOpen);
  const setBugReportOpen = useStore((s) => s.setBugReportOpen);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  useKeyboardShortcuts();

  useEffect(() => {
    initErrorReporter();
  }, []);

  // Listen for open-shortcuts event from slash commands / command palette
  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener('nexus:open-shortcuts', handler);
    return () => window.removeEventListener('nexus:open-shortcuts', handler);
  }, [setShortcutsOpen]);

  // Listen for bug report trigger from error toasts
  useEffect(() => {
    const handler = () => setBugReportOpen(true);
    window.addEventListener('nexus:open-bug-report', handler);
    return () => window.removeEventListener('nexus:open-bug-report', handler);
  }, [setBugReportOpen]);

  return (
    <>
      {children}
      <Suspense fallback={null}>
        {shortcutsOpen && (
          <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        )}
      </Suspense>
      <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
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
