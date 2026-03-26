'use client';

import { useMemo, useCallback } from 'react';
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
      label: `Use ${m.name}`,
      icon: <ProviderLogo provider={m.provider} size={13} />,
      shortcut: i < 9 ? `\u2303${i + 1}` : undefined,
      handler: () => setActiveModel(m.id),
    })),
  [setActiveModel]);

  const navActions: CommandAction[] = useMemo(() => [
    { id: 'search-all', label: 'Search Everything', icon: <Search size={13} />, shortcut: '\u2318\u21E7F', handler: () => { useStore.getState().setSearchPanelOpen(true); } },
    { id: 'new-chat', label: 'New Conversation', icon: <Plus size={13} />, shortcut: '\u2318N', handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'focus-input', label: 'Focus Chat Input', icon: <MessageSquare size={13} />, shortcut: '\u2318J', handler: () => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } } },
    { id: 'toggle-panel', label: 'Toggle Right Panel', handler: () => setRightPanelOpen(!rightPanelOpen) },
    { id: 'view-terminal', label: 'Show Terminal', icon: <Terminal size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('terminal'); } },
    { id: 'view-files', label: 'Show Files', icon: <FolderOpen size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('files'); } },
    { id: 'view-preview', label: 'Show Preview', icon: <Eye size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('preview'); } },
    { id: 'view-artifacts', label: 'Show Artifacts', icon: <Layers size={13} />, handler: () => { setRightPanelOpen(true); setRightPanelTab('artifacts'); } },
    { id: 'agents', label: 'Manage Personas', icon: <Users size={13} />, handler: () => { window.location.href = '/agents'; } },
  ], [setRightPanelTab, setRightPanelOpen, rightPanelOpen]);

  const slashActions: CommandAction[] = useMemo(() => [
    { id: 'slash-model', label: '/model — Switch model', icon: <Cpu size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/model '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-clear', label: '/clear — New conversation', icon: <Trash2 size={13} />, handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'slash-help', label: '/help — Keyboard shortcuts', icon: <HelpCircle size={13} />, handler: () => { window.dispatchEvent(new CustomEvent('nexus:open-shortcuts')); } },
    { id: 'slash-export', label: '/export — Export as markdown', icon: <Download size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      if (msgs.length === 0) { toast.info('No messages to export'); return; }
      const md = msgs.map((m) => {
        const role = m.role === 'user' ? '**You**' : m.role === 'assistant' ? '**Assistant**' : '**System**';
        return `### ${role}\n\n${m.content}`;
      }).join('\n\n---\n\n');
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conversation.md';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Conversation exported');
    }},
    { id: 'slash-copy', label: '/copy — Copy last response', icon: <ClipboardCopy size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (!last) { toast.info('No assistant response to copy'); return; }
      navigator.clipboard.writeText(last.content).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Failed to copy'));
    }},
    { id: 'slash-retry', label: '/retry — Regenerate last response', icon: <RefreshCw size={13} />, handler: () => {
      const { messages: msgs, activeConversationId: convId } = useStore.getState();
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (!last || !convId) { toast.info('Nothing to regenerate'); return; }
      window.dispatchEvent(new CustomEvent('nexus:regenerate', { detail: { conversationId: convId, messageId: last.id } }));
    }},
    { id: 'slash-pin', label: '/pin — Pin/unpin conversation', icon: <Pin size={13} />, handler: () => {
      const convId = useStore.getState().activeConversationId;
      if (!convId) { toast.info('No active conversation'); return; }
      useStore.getState().togglePinConversation(convId);
      const conv = useStore.getState().conversations.find((c) => c.id === convId);
      toast.success(conv?.pinned ? 'Conversation pinned' : 'Conversation unpinned');
    }},
    { id: 'slash-system', label: '/system — Set system prompt', icon: <ScrollText size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/system '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-search', label: '/search — Search messages', icon: <Search size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/search '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-tokens', label: '/tokens — Show token usage', icon: <Hash size={13} />, handler: () => {
      const msgs = useStore.getState().messages;
      if (msgs.length === 0) { toast.info('No messages yet'); return; }
      let inputTokens = 0, outputTokens = 0, totalCost = 0, counted = 0;
      for (const m of msgs) { if (m.cost) { inputTokens += m.cost.inputTokens; outputTokens += m.cost.outputTokens; totalCost += m.cost.totalCost || 0; counted++; } }
      if (counted === 0) { toast.info('No token usage data available'); return; }
      const parts = [`${(inputTokens + outputTokens).toLocaleString()} tokens`, `(${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out)`];
      if (totalCost > 0) parts.push(`· $${totalCost.toFixed(4)}`);
      toast.info(parts.join(' '));
    }},
    { id: 'slash-summarize', label: '/summarize — Summarize conversation', icon: <FileText size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/summarize'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      setTimeout(() => { const btn = document.querySelector('[data-send-button]') as HTMLButtonElement; btn?.click(); }, 100);
    }},
    { id: 'slash-diff', label: '/diff — Compare branched responses', icon: <GitCompare size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/diff'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      setTimeout(() => { const btn = document.querySelector('[data-send-button]') as HTMLButtonElement; btn?.click(); }, 100);
    }},
    { id: 'slash-compare', label: '/compare — Compare models side-by-side', icon: <GitCompare size={13} />, handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/compare '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
  ], []);

  const conversationItems = useMemo(() =>
    conversations.slice(0, 10).map((c) => ({
      id: `conv-${c.id}`,
      label: c.title || 'Untitled',
      icon: <MessageSquare size={13} />,
      handler: () => setActiveConversationId(c.id),
    })),
  [conversations, setActiveConversationId]);

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search conversations..." />
      <CommandList>
        <CommandEmpty>No results found</CommandEmpty>

        <CommandGroup heading="Actions">
          {navActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
              {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Models">
          {modelActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
              {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Slash Commands">
          {slashActions.map((action) => (
            <CommandItem key={action.id} onSelect={() => execute(action.handler)}>
              {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {conversationItems.length > 0 && (
          <CommandGroup heading="Conversations">
            {conversationItems.map((item) => (
              <CommandItem key={item.id} onSelect={() => execute(item.handler)}>
                {item.icon && <span className="text-text-tertiary w-4 shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Account">
          <CommandItem onSelect={() => execute(async () => { useStore.getState().setAuthStatus('loading'); try { await apiLogout(); } catch {} useStore.getState().reset(); window.location.href = '/login'; })}>
            <span className="text-text-tertiary w-4 shrink-0"><LogOut size={13} /></span>
            <span>Log Out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
