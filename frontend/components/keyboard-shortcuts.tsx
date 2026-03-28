'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

export default function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('keyboardShortcuts');
  const shortcutGroups: ShortcutGroup[] = [
    {
      title: t('navigation'),
      shortcuts: [
        { keys: ['⌘', 'B'], description: t('toggleSidebar') },
        { keys: ['⌘', 'K'], description: t('openCommandPalette') },
        { keys: ['⌘', 'J'], description: t('focusChatInput') },
        { keys: ['/'], description: t('focusChatInput') },
      ],
    },
    {
      title: t('chat'),
      shortcuts: [
        { keys: ['Enter'], description: t('sendMessage') },
        { keys: ['Shift', 'Enter'], description: t('newLine') },
        { keys: ['⌘', 'N'], description: t('newConversation') },
        { keys: ['⌘', 'Shift', '⌫'], description: t('deleteConversation') },
      ],
    },
    {
      title: t('models'),
      shortcuts: [
        { keys: ['Ctrl', '1-9'], description: t('switchModel') },
      ],
    },
    {
      title: t('slashCommands'),
      shortcuts: [
        { keys: ['/model'], description: t('switchModel') },
        { keys: ['/clear'], description: t('newConversation') },
        { keys: ['/help'], description: t('showKeyboardShortcuts') },
        { keys: ['/export'], description: t('exportMarkdown') },
        { keys: ['/copy'], description: t('copyLastResponse') },
        { keys: ['/retry'], description: t('regenerateLastResponse') },
        { keys: ['/pin'], description: t('pinConversation') },
        { keys: ['/system'], description: t('setSystemPrompt') },
        { keys: ['/search'], description: t('searchMessages') },
        { keys: ['/summarize'], description: t('summarizeConversation') },
        { keys: ['/tokens'], description: t('showTokenUsage') },
        { keys: ['/diff'], description: t('compareBranchedResponses') },
        { keys: ['/compare'], description: t('compareModels') },
      ],
    },
    {
      title: t('general'),
      shortcuts: [
        { keys: ['Esc'], description: t('closeOrBlur') },
        { keys: ['?'], description: t('showOverlay') },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" hideClose>
        <DialogHeader className="px-5 py-3.5 border-b border-border-default">
          <DialogTitle className="text-sm font-semibold text-text-primary">{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
          {shortcutGroups.map((group) => (
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
      </DialogContent>
    </Dialog>
  );
}
