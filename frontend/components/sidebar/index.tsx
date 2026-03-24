'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Conversation } from '@/lib/types';
import { toast } from '../toast';
import UserDropdown from '../user-dropdown';
import SidebarActions from './sidebar-actions';
import ConversationList from './conversation-list';

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

  const handleSelect = (id: string) => {
    if (bulkMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else if (renamingId !== id) {
      setActiveConversationId(id);
    }
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

      <SidebarActions
        search={search}
        onSearchChange={handleSearch}
        bulkMode={bulkMode}
        onToggleBulkMode={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
        onNewConversation={handleNew}
        selectedCount={selectedIds.size}
        onBulkExport={handleBulkExport}
        onBulkDelete={handleBulkDelete}
        conversationCount={conversations.length}
      />

      <ConversationList
        groups={groups}
        conversations={conversations}
        search={search}
        activeConversationId={activeConversationId}
        bulkMode={bulkMode}
        selectedIds={selectedIds}
        renamingId={renamingId}
        renameValue={renameValue}
        onSelect={handleSelect}
        onDoubleClick={startRename}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        onPin={handlePin}
        onExport={handleExport}
        onDelete={handleDelete}
        onRenameChange={setRenameValue}
        onRenameSubmit={submitRename}
        onRenameCancel={() => setRenamingId(null)}
        renameInputRef={renameInputRef}
      />

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
