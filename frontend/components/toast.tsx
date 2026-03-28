'use client';

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

function openBugReport() {
  window.dispatchEvent(new CustomEvent('nexus:open-bug-report'));
}

export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message, {
    duration: 6000,
    action: {
      label: 'Report a bug',
      onClick: openBugReport,
    },
  }),
  warning: (message: string) => sonnerToast.warning(message),
  info: (message: string) => sonnerToast.info(message),
};

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        className: 'text-xs',
        style: {
          background: 'var(--color-surface-0)',
          border: '1px solid var(--color-border-default)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-ui)',
          fontSize: '12px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        },
        actionButtonStyle: {
          background: 'var(--color-surface-2)',
          color: 'var(--color-text-secondary)',
          fontSize: '11px',
          borderRadius: '4px',
          border: '1px solid var(--color-border-default)',
          padding: '2px 8px',
          cursor: 'pointer',
        },
      }}
      gap={8}
    />
  );
}

// Keep backward-compatible default export for dynamic imports
export default Toaster;
