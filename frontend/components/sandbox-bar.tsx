'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { StopCircle, Play, Trash2 } from 'lucide-react';

export default function SandboxBar() {
  const sandboxStatus = useStore((s) => s.sandboxStatus);
  const sandboxId = useStore((s) => s.sandboxId);
  const setSandboxStatus = useStore((s) => s.setSandboxStatus);
  const setSandboxId = useStore((s) => s.setSandboxId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Don't render anything when no sandbox
  if (sandboxStatus === 'none') return null;

  const labels: Record<string, string> = {
    creating: 'Creating...',
    running: 'Running',
    stopped: 'Stopped',
  };

  const dotColor: Record<string, string> = {
    creating: 'bg-warning',
    running: 'bg-accent',
    stopped: 'bg-error',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-text-tertiary bg-surface-1 border border-border-default rounded-lg hover:border-border-focus cursor-pointer transition-colors font-mono"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor[sandboxStatus]} ${sandboxStatus === 'running' ? 'animate-pulse' : ''}`} />
        <span className="hidden md:inline">{labels[sandboxStatus]}</span>
      </button>

      {open && sandboxId && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-surface-0 border border-border-default rounded-lg shadow-lg overflow-hidden z-50">
          {sandboxStatus === 'running' && (
            <button onClick={async () => { try { await api.stopSandbox(sandboxId); setSandboxStatus('stopped'); } catch {} setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-text-secondary hover:bg-surface-1 cursor-pointer transition-colors">
              <StopCircle size={12} /> Stop Sandbox
            </button>
          )}
          {sandboxStatus === 'stopped' && (
            <button onClick={async () => { try { await api.startSandbox(sandboxId); setSandboxStatus('running'); } catch {} setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-text-secondary hover:bg-surface-1 cursor-pointer transition-colors">
              <Play size={12} /> Start Sandbox
            </button>
          )}
          <button onClick={async () => {
              const confirmed = await useStore.getState().showConfirm({
                title: 'Delete this sandbox?',
                message: 'This will permanently delete the sandbox and all its files. This can\'t be undone.',
                confirmLabel: 'Delete',
                variant: 'danger',
              });
              if (!confirmed) return;
              try { await api.deleteSandbox(sandboxId); setSandboxStatus('none'); setSandboxId(null); } catch {} setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs text-error hover:bg-surface-1 cursor-pointer transition-colors">
            <Trash2 size={12} /> Delete Sandbox
          </button>
        </div>
      )}
    </div>
  );
}
