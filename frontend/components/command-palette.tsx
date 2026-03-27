'use client';

import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStore } from '@/lib/store';
import { MODELS } from '@/lib/types';
import { logout as apiLogout } from '@/lib/api';
import { toast } from './toast';
import { Search, Terminal, FolderOpen, Eye, Layers, LogOut, Users, Plus, MessageSquare, Cpu, Trash2, HelpCircle, Download, ClipboardCopy, RefreshCw, Pin, Hash, GitCompare, ScrollText, FileText } from 'lucide-react';
import { ProviderLogo } from './provider-logos';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './ui/command';

interface CommandAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  handler: () => void;
}

export default function CommandPalette() {
  const t = useTranslations('commandPalette');
  const ts = useTranslations('slashCommands');
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const conversations = useStore((s) => s.conversations);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);

  const close = useCallback(() => setCommandPaletteOpen(false), [setCommandPaletteOpen]);

  const execute = useCallback((handler: () => void) => {
    close();
    handler();
  }, [close]);

  const modelActions: CommandAction[] = useMemo(() =>
    MODELS.map((m, i) => ({
      id: `model-${m.id}`,
      label: t('useModel', { modelName: m.name }),
      icon: <ProviderLogo provider={m.provider} size={13} />,
      shortcut: i < 9 ? `\u2303${i + 1}` : undefined,
      handler: () => setActiveModel(m.id),
    })),
  [setActiveModel, t]);

  const navActions: CommandAction[] = useMemo(() => [
    { id: 'search-all', label: t('searchEverything'), icon: <Search size={13} />, shortcut: '\u2318\u21E7F', handler: () => { useStore.getState().setSearchPanelOpen(true); } },
    { id: 'new-chat', label: t('newConversation'), icon: <Plus size={13} />, shortcut: '\u2318N', handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'focus-input', label: t('focusChatInput'), icon: <MessageSquare size={13} />, shortcut: '\u2318J', handler: () => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } } },
    { id: 'toggle-panel', label: t('toggleRightPanel'), handler: () => setRightPanelOpen(!rightPanelOpen) },
    { id: 'view-terminal', label: t('showTerminal'), icon: <Terminal size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('terminal'); } },
    { id: 'view-files', label: t('showFiles'), icon: <FolderOpen size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('files'); } },
    { id: 'view-preview', label: t('showPreview'), icon: <Eye size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('preview'); } },
    { id: 'view-artifacts', label: t('showArtifacts'), icon: <Layers size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('artifacts'); } },
    { id: 'agents', label: t('managePersonas'), icon: <Users size={13} />, handler: () => { window.location.href = '/agents'; } },
  ], [setRightPanelTab, setRightPanelOpen, rightPanelOpen, t]);

  const slashActions: CommandAction[] = useMemo(() => [
    { id: 'slash-model', label: t('slashModel'), icon: <Cpu size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/model '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-clear', label: t('slashClear'), icon: <Trash2 size={13} />, handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'slash-help', label: t('slashHelp'), icon: <HelpCircle size={13} />, handler: () => { window.dispatchEvent(new CustomEvent('nexus:open-shortcuts')); } },
    { id: 'slash-export', label: t('slashExport'), icon: <Download size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      if (msgs.length === 0) { toast.info(t('noMessagesToExport')); return; }
      const md = msgs.map((m) => {
        const role = m.role === 'user' ? t('exportYou') : m.role === 'assistant' ? t('exportAssistant') : t('exportSystem');
        return `### ${role}\n\n${m.content}`;
      }).join('\n\n---\n\n');
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conversation.md';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('conversationExported'));
    }},
    { id: 'slash-copy', label: t('slashCopy'), icon: <ClipboardCopy size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (!last) { toast.info(t('noAssistantResponse')); return; }
      navigator.clipboard.writeText(last.content).then(() => toast.success(t('copiedToClipboard'))).catch(() => toast.error(t('failedToCopy')));
    }},
    { id: 'slash-retry', label: t('slashRetry'), icon: <RefreshCw size={13} />, handler: () => {
      const { messages: msgs, activeConversationId: convId } = useStore.getState();
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (!last || !convId) { toast.info(t('nothingToRegenerate')); return; }
      window.dispatchEvent(new CustomEvent('nexus:regenerate', { detail: { conversationId: convId, messageId: last.id } }));
    }},
    { id: 'slash-pin', label: t('slashPin'), icon: <Pin size={13} />, handler: () => {
      const convId = useStore.getState().activeConversationId;
      if (!convId) { toast.info(t('noActiveConversation')); return; }
      useStore.getState().togglePinConversation(convId);
      const conv = useStore.getState().conversations.find((c) => c.id === convId);
      toast.success(conv?.pinned ? t('conversationPinned') : t('conversationUnpinned'));
    }},
    { id: 'slash-system', label: t('slashSystem'), icon: <ScrollText size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/system '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-search', label: t('slashSearch'), icon: <Search size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/search '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-tokens', label: t('slashTokens'), icon: <Hash size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      if (msgs.length === 0) { toast.info(ts('tokensNoMessages')); return; }
      let inputTokens = 0, outputTokens = 0, totalCost = 0, counted = 0;
      for (const m of msgs) { if (m.cost) { inputTokens += m.cost.inputTokens; outputTokens += m.cost.outputTokens; totalCost += m.cost.totalCost || 0; counted++; } }
      if (counted === 0) { toast.info(ts('tokensNoData')); return; }
      const parts = [ts('tokensSummary', {
        total: (inputTokens + outputTokens).toLocaleString(),
        input: inputTokens.toLocaleString(),
        output: outputTokens.toLocaleString(),
      })];
      if (totalCost > 0) parts.push(`· $${totalCost.toFixed(4)}`);
      toast.info(parts.join(' '));
    }},
    { id: 'slash-summarize', label: t('slashSummarize'), icon: <FileText size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/summarize'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      setTimeout(() => { const btn = document.querySelector('[data-send-button]') as HTMLButtonElement; btn?.click(); }, 100);
    }},
    { id: 'slash-diff', label: t('slashDiff'), icon: <GitCompare size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/diff'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      setTimeout(() => { const btn = document.querySelector('[data-send-button]') as HTMLButtonElement; btn?.click(); }, 100);
    }},
    { id: 'slash-compare', label: t('slashCompare'), icon: <GitCompare size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/compare '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
  ], [t, ts]);

  const conversationItems = useMemo(() =>
    conversations.slice(0, 10).map((c) => ({
      id: `conv-${c.id}`,
      label: c.title || t('untitled'),
      icon: <MessageSquare size={13} />,
      handler: () => setActiveConversationId(c.id),
    })),
  [conversations, setActiveConversationId, t]);

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} title={t('dialogTitle')}>
      <CommandInput placeholder={t('placeholder')} />
      <CommandList>
        <CommandEmpty>{t('noResults')}</CommandEmpty>

        <CommandGroup heading={t('actionsGroup')}>
          {navActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
              {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading={t('modelsGroup')}>
          {modelActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
              {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading={t('slashCommandsGroup')}>
          {slashActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {conversationItems.length > 0 && (
          <CommandGroup heading={t('conversationsGroup')}>
            {conversationItems.map((item) => (
              <CommandItem key={item.id} onSelect={() => execute(item.handler)}>
                {item.icon && <span className="text-text-tertiary w-4 shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading={t('accountGroup')}>
          <CommandItem onSelect={() => execute(async () => { useStore.getState().setAuthStatus('loading'); try { await apiLogout(); } catch {} useStore.getState().reset(); window.location.href = '/login'; })}>
            <span className="text-text-tertiary w-4 shrink-0"><LogOut size={13} /></span>
            <span>{t('logOut')}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
