'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['⌘', 'K'], description: 'Command palette' },
      { keys: ['⌘', 'J'], description: 'Focus chat input' },
      { keys: ['/'], description: 'Focus chat input' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['⌘', 'N'], description: 'New conversation' },
      { keys: ['⌘', 'Shift', '⌫'], description: 'Delete conversation' },
    ],
  },
  {
    title: 'Models',
    shortcuts: [
      { keys: ['Ctrl', '1-9'], description: 'Switch model' },
    ],
  },
  {
    title: 'Slash Commands',
    shortcuts: [
      { keys: ['/model'], description: 'Switch model' },
      { keys: ['/clear'], description: 'New conversation' },
      { keys: ['/help'], description: 'Show keyboard shortcuts' },
      { keys: ['/export'], description: 'Export as markdown' },
      { keys: ['/copy'], description: 'Copy last response' },
      { keys: ['/retry'], description: 'Regenerate last response' },
      { keys: ['/pin'], description: 'Pin/unpin conversation' },
      { keys: ['/system'], description: 'Set system prompt' },
      { keys: ['/search'], description: 'Search messages' },
      { keys: ['/summarize'], description: 'Summarize conversation' },
      { keys: ['/tokens'], description: 'Show token usage' },
      { keys: ['/diff'], description: 'Compare branched responses' },
      { keys: ['/compare'], description: 'Compare models side-by-side' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['Esc'], description: 'Close modal / blur input' },
      { keys: ['?'], description: 'Show this overlay' },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3 md:px-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-surface-0 border border-border-default rounded-lg shadow-2xl overflow-hidden animate-fade-in-up"
        style={{ animationDuration: '0.15s' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-1 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono mb-2">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description + shortcut.keys.join('')}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-xs text-text-secondary">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[10px] font-mono text-text-tertiary bg-surface-1 border border-border-default rounded shadow-[0_1px_0_0_var(--color-border-default)]">
                            {key}
                          </kbd>
                          {i < shortcut.keys.length - 1 && (
                            <span className="text-text-tertiary text-[10px] mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
