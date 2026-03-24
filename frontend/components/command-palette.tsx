'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { MODELS } from '@/lib/types';
import { logout as apiLogout } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { toast } from './toast';
import { Search, Terminal, FolderOpen, Eye, Layers, LogOut, Users, Plus, MessageSquare, Cpu, Trash2, HelpCircle, Download } from 'lucide-react';
import { ProviderLogo } from './provider-logos';

interface CommandAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category: string;
  handler: () => void;
}

export default function CommandPalette() {
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const conversations = useStore((s) => s.conversations);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);

  const actions: CommandAction[] = useMemo(() => [
    ...MODELS.map((m, i) => ({
      id: `model-${m.id}`,
      label: `Use ${m.name}`,
      icon: <ProviderLogo provider={m.provider} size={13} />,
      shortcut: i < 9 ? `\u2303${i + 1}` : undefined,
      category: 'Models',
      handler: () => setActiveModel(m.id),
    })),
    { id: 'new-chat', label: 'New Conversation', icon: <Plus size={13} />, shortcut: '\u2318N', category: 'Actions', handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'focus-input', label: 'Focus Chat Input', icon: <MessageSquare size={13} />, shortcut: '\u2318J', category: 'Actions', handler: () => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } } },
    { id: 'toggle-panel', label: 'Toggle Right Panel', category: 'Navigation', handler: () => setRightPanelOpen(!rightPanelOpen) },
    { id: 'view-terminal', label: 'Show Terminal', icon: <Terminal size={13} />, category: 'Navigation', handler: () => { setRightPanelOpen(true); setRightPanelTab('terminal'); } },
    { id: 'view-files', label: 'Show Files', icon: <FolderOpen size={13} />, category: 'Navigation', handler: () => { setRightPanelOpen(true); setRightPanelTab('files'); } },
    { id: 'view-preview', label: 'Show Preview', icon: <Eye size={13} />, category: 'Navigation', handler: () => { setRightPanelOpen(true); setRightPanelTab('preview'); } },
    { id: 'view-artifacts', label: 'Show Artifacts', icon: <Layers size={13} />, category: 'Navigation', handler: () => { setRightPanelOpen(true); setRightPanelTab('artifacts'); } },
    { id: 'agents', label: 'Manage Personas', icon: <Users size={13} />, category: 'Navigation', handler: () => { window.location.href = '/agents'; } },
    // Slash Commands
    { id: 'slash-model', label: '/model — Switch model', icon: <Cpu size={13} />, category: 'Slash Commands', handler: () => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      if (ta) { ta.focus(); const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; nativeSet?.call(ta, '/model '); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }},
    { id: 'slash-clear', label: '/clear — New conversation', icon: <Trash2 size={13} />, category: 'Slash Commands', handler: () => {
      (async () => { try { const conv = await (await import('@/lib/api')).createConversation({ model: useStore.getState().activeModel }); useStore.getState().setActiveConversationId(conv.id); useStore.getState().setMessages([]); const r = await (await import('@/lib/api')).listConversations(); useStore.getState().setConversations(r.conversations); } catch {} })();
    }},
    { id: 'slash-help', label: '/help — Keyboard shortcuts', icon: <HelpCircle size={13} />, category: 'Slash Commands', handler: () => {
      window.dispatchEvent(new CustomEvent('nexus:open-shortcuts'));
    }},
    { id: 'slash-export', label: '/export — Export as markdown', icon: <Download size={13} />, category: 'Slash Commands', handler: () => {
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
    { id: 'logout', label: 'Log Out', icon: <LogOut size={13} />, category: 'Account', handler: async () => { try { await apiLogout(); } catch {} clearToken(); useStore.getState().reset(); window.location.href = '/login'; } },
  ], [setActiveModel, setRightPanelTab, setRightPanelOpen, rightPanelOpen]);

  // Build conversation search results
  const conversationResults: CommandAction[] = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    // Only show conversation results if query doesn't match many actions
    return conversations
      .filter((c) => c.title?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({
        id: `conv-${c.id}`,
        label: c.title || 'Untitled',
        icon: <MessageSquare size={13} />,
        category: 'Conversations',
        handler: () => {
          setActiveConversationId(c.id);
        },
      }));
  }, [query, conversations, setActiveConversationId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    const matchedActions = actions.filter((a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    return [...matchedActions, ...conversationResults];
  }, [query, actions, conversationResults]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHighlightedIndex(0); }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${highlightedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const close = () => setCommandPaletteOpen(false);
  const execute = (action: CommandAction) => { close(); action.handler(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); break;
      case 'Enter': e.preventDefault(); if (filtered[highlightedIndex]) execute(filtered[highlightedIndex]); break;
      case 'Escape': e.preventDefault(); close(); break;
    }
  };

  const groups = new Map<string, CommandAction[]>();
  for (const action of filtered) {
    const list = groups.get(action.category) || [];
    list.push(action);
    groups.set(action.category, list);
  }
  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-3 sm:px-0">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg bg-surface-0 border border-border-default rounded-lg shadow-2xl overflow-hidden animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
          <Search size={14} className="text-text-tertiary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          <kbd className="text-[10px] text-text-tertiary bg-surface-1 border border-border-default rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary text-xs font-mono">No results found</div>
          ) : (
            Array.from(groups.entries()).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-mono">
                  {category}
                </div>
                {items.map((action) => {
                  const idx = globalIndex++;
                  return (
                    <button
                      key={action.id}
                      data-index={idx}
                      onClick={() => execute(action)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs cursor-pointer transition-colors ${
                        idx === highlightedIndex
                          ? 'bg-accent/10 text-text-primary'
                          : 'text-text-secondary hover:bg-surface-1'
                      }`}
                    >
                      {action.icon && <span className="text-text-tertiary w-4 shrink-0">{action.icon}</span>}
                      <span className="flex-1 text-left">{action.label}</span>
                      {action.shortcut && (
                        <kbd className="text-[10px] text-text-tertiary bg-surface-1 border border-border-subtle rounded px-1.5 py-0.5 font-mono">{action.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
