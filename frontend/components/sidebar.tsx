'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Conversation } from '@/lib/types';
import { Plus, Search, X, Download, Pin, PinOff, Trash2, CheckSquare, Square } from 'lucide-react';
import { toast } from './toast';
import UserDropdown from './user-dropdown';

function getPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('nexus:pinnedConversations');
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

export default function Sidebar() {
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setConversations = useStore((s) => s.setConversations);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const activeModel = useStore((s) => s.activeModel);
  const togglePinConversation = useStore((s) => s.togglePinConversation);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Preview tooltip
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Apply pinned state from localStorage on load
  useEffect(() => {
    const pinnedIds = getPinnedIds();
    if (pinnedIds.size > 0 && conversations.length > 0) {
      const needsUpdate = conversations.some((c) => pinnedIds.has(c.id) && !c.pinned);
      if (needsUpdate) {
        setConversations(conversations.map((c) => pinnedIds.has(c.id) ? { ...c, pinned: true } : c));
      }
    }
  }, [conversations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversations = useCallback(async (q?: string) => {
    try {
      const result = await api.listConversations(q);
      // Restore pinned state
      const pinnedIds = getPinnedIds();
      const convs = result.conversations.map((c) => pinnedIds.has(c.id) ? { ...c, pinned: true } : c);
      setConversations(convs);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, [setConversations]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadConversations(value || undefined), 300);
  };

  const handleNew = async () => {
    try {
      const conv = await api.createConversation({ title: 'New conversation', model: activeModel });
      setActiveConversationId(conv.id);
      setMessages([]);
      loadConversations();
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await useStore.getState().showConfirm({
      title: 'Delete this conversation?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteConversation(id);
      if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
      loadConversations();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  };

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title || '');
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const submitRename = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      try {
        await api.updateConversation(renamingId, { title: trimmed });
        useStore.getState().updateConversationTitle(renamingId, trimmed);
      } catch { toast.error('Failed to rename conversation'); }
    }
    setRenamingId(null);
  };

  const handleExport = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const data = await api.getConversation(conv.id);
      const rawMessages = (data.messages as Array<Record<string, unknown>>) || [];
      const lines: string[] = [`# ${conv.title || 'Untitled Conversation'}`, ''];
      for (const m of rawMessages) {
        const role = (m.role as string) || 'user';
        const content = (m.content as string) || '';
        lines.push(`## ${role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : 'System'}`);
        lines.push('');
        lines.push(content);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(conv.title || 'conversation').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Conversation exported');
    } catch { toast.error('Failed to export conversation'); }
  };

  const handlePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinConversation(id);
  };

  // Bulk actions
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await useStore.getState().showConfirm({
      title: `Delete ${selectedIds.size} conversation${selectedIds.size > 1 ? 's' : ''}?`,
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete all',
      variant: 'danger',
    });
    if (!confirmed) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await api.deleteConversation(id);
        if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
        deleted++;
      } catch {}
    }
    setSelectedIds(new Set());
    setBulkMode(false);
    loadConversations();
    toast.success(`Deleted ${deleted} conversation${deleted > 1 ? 's' : ''}`);
  };

  const handleBulkExport = async () => {
    for (const id of selectedIds) {
      const conv = conversations.find((c) => c.id === id);
      if (conv) await handleExport(conv, { stopPropagation: () => {} } as React.MouseEvent);
    }
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  // Preview on hover
  const handleHoverStart = (conv: Conversation, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => {
      setHoveredId(conv.id);
      setHoverPos({ x: rect.right + 8, y: rect.top });
    }, 500);
  };
  const handleHoverEnd = () => {
    clearTimeout(hoverTimeout.current);
    setHoveredId(null);
  };

  const hoveredConv = hoveredId ? conversations.find((c) => c.id === hoveredId) : null;

  // Group conversations: pinned first, then by date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups = useMemo(() => {
    const pinned: Conversation[] = [];
    const todayItems: Conversation[] = [];
    const yesterdayItems: Conversation[] = [];
    const weekItems: Conversation[] = [];
    const olderItems: Conversation[] = [];

    for (const conv of conversations) {
      if (conv.pinned) { pinned.push(conv); continue; }
      const date = new Date(conv.updatedAt || conv.createdAt);
      if (date >= today) todayItems.push(conv);
      else if (date >= yesterday) yesterdayItems.push(conv);
      else if (date >= weekAgo) weekItems.push(conv);
      else olderItems.push(conv);
    }

    return [
      { label: 'Pinned', items: pinned },
      { label: 'Today', items: todayItems },
      { label: 'Yesterday', items: yesterdayItems },
      { label: 'This Week', items: weekItems },
      { label: 'Older', items: olderItems },
    ];
  }, [conversations, today, yesterday, weekAgo]);

  return (
    <div className="relative flex flex-col w-[85vw] sm:w-[272px] max-w-[320px] bg-surface-0 border-r border-border-default shrink-0 h-full min-w-0 sm:min-w-[272px]">
      <div className="absolute inset-0 grid-texture opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-2 bg-surface-1 border border-border-default rounded-lg">
          <Search size={13} className="text-text-tertiary shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
          />
          {search && (
            <button
              onClick={() => handleSearch('')}
              className="text-text-tertiary hover:text-text-secondary cursor-pointer shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
          title={bulkMode ? 'Exit select mode' : 'Select multiple'}
          className={`w-8 h-8 flex items-center justify-center border rounded-lg cursor-pointer transition-colors shrink-0 ${
            bulkMode
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-surface-1 border-border-default text-text-tertiary hover:text-text-secondary hover:border-border-focus'
          }`}
        >
          <CheckSquare size={13} />
        </button>
        <button
          onClick={handleNew}
          title="New conversation (Cmd+N)"
          className="w-8 h-8 flex items-center justify-center bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 cursor-pointer transition-colors shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-1.5 px-2 pb-1.5 animate-fade-in-up" style={{ animationDuration: '0.1s' }}>
          <span className="text-[10px] text-text-tertiary font-mono flex-1">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkExport}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-surface-1 border border-border-default rounded-lg text-text-secondary hover:text-accent hover:border-accent/30 cursor-pointer transition-colors"
          >
            <Download size={10} /> Export
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-surface-1 border border-border-default rounded-lg text-text-secondary hover:text-error hover:border-error/30 cursor-pointer transition-colors"
          >
            <Trash2 size={10} /> Delete
          </button>
        </div>
      )}

      {/* Search result count */}
      {search.trim() && (
        <div className="px-3 pb-1 text-[10px] font-mono text-text-tertiary">
          {conversations.length === 0
            ? 'No conversations found'
            : `${conversations.length} result${conversations.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-text-tertiary text-xs">
            {search.trim() ? 'No conversations found' : 'No conversations'}
          </div>
        ) : (
          groups.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.label} className="mb-1">
              <div className={`px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] font-medium ${
                group.label === 'Pinned' ? 'text-accent/70' : 'text-text-tertiary'
              }`}>
                {group.label === 'Pinned' && <Pin size={8} className="inline mr-1 -mt-0.5" />}
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (bulkMode) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
                        return next;
                      });
                    } else if (renamingId !== conv.id) {
                      setActiveConversationId(conv.id);
                    }
                  }}
                  onDoubleClick={(e) => { if (!bulkMode) startRename(conv, e); }}
                  onMouseEnter={(e) => handleHoverStart(conv, e)}
                  onMouseLeave={handleHoverEnd}
                  className={`group flex items-center gap-2 px-2.5 py-2.5 cursor-pointer text-xs rounded-lg transition-colors mb-0.5 ${
                    bulkMode && selectedIds.has(conv.id)
                      ? 'bg-accent/8 text-text-primary border-l-2 border-accent'
                      : conv.id === activeConversationId
                        ? 'bg-accent/8 text-text-primary border-l-2 border-accent ml-0'
                        : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary border-l-2 border-transparent'
                  }`}
                >
                  {bulkMode && (
                    <span className="shrink-0 text-text-tertiary">
                      {selectedIds.has(conv.id) ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                    </span>
                  )}
                  {renamingId === conv.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
                        if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-surface-1 border border-accent/30 rounded px-1.5 py-0.5 text-xs text-text-primary outline-none min-w-0"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 truncate leading-snug">
                      {conv.title || <span className="text-text-tertiary italic">untitled</span>}
                    </span>
                  )}
                  {!bulkMode && renamingId !== conv.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={(e) => handlePin(conv.id, e)}
                        title={conv.pinned ? 'Unpin' : 'Pin to top'}
                        className={`cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all ${
                          conv.pinned ? 'text-accent' : 'text-text-tertiary hover:text-accent'
                        }`}
                      >
                        {conv.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                      </button>
                      <button
                        onClick={(e) => handleExport(conv, e)}
                        title="Export as Markdown"
                        className="text-text-tertiary hover:text-accent shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        title="Delete conversation"
                        className="text-text-tertiary hover:text-error shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* User dropdown */}
      <div className="px-3 pb-3 border-t border-border-default pt-2.5">
        <UserDropdown />
      </div>

      {/* Preview tooltip */}
      {hoveredConv && !bulkMode && (
        <div
          className="fixed z-50 w-64 bg-surface-0 border border-border-default rounded-lg shadow-xl shadow-black/30 p-3 pointer-events-none"
          style={{ left: hoverPos.x, top: hoverPos.y, maxHeight: 200 }}
        >
          <div className="text-[11px] font-medium text-text-primary truncate mb-1.5">
            {hoveredConv.title || 'Untitled'}
          </div>
          {hoveredConv.model && (
            <div className="text-[9px] text-text-tertiary font-mono mb-1">
              {hoveredConv.model.split('/').pop()}
            </div>
          )}
          <div className="text-[10px] text-text-tertiary">
            {hoveredConv.messageCount ? `${hoveredConv.messageCount} messages` : 'No messages yet'}
            {' · '}
            {new Date(hoveredConv.updatedAt || hoveredConv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  );
}
