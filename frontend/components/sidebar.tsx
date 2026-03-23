'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Conversation } from '@/lib/types';
import { Plus, Search, X, MessageSquare } from 'lucide-react';

export default function Sidebar() {
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setConversations = useStore((s) => s.setConversations);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const activeModel = useStore((s) => s.activeModel);
  const activeMode = useStore((s) => s.activeMode);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadConversations = useCallback(async (q?: string) => {
    try {
      const result = await api.listConversations(q);
      setConversations(result.conversations);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, [setConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadConversations(value || undefined), 300);
  };

  const handleNew = async () => {
    try {
      const conv = await api.createConversation({
        title: 'New conversation',
        model: activeModel,
        mode: activeMode,
      });
      setActiveConversationId(conv.id);
      setMessages([]);
      loadConversations();
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
      loadConversations();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  // Group by date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt || conv.createdAt);
    if (date >= today) groups[0].items.push(conv);
    else if (date >= yesterday) groups[1].items.push(conv);
    else if (date >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return (
    <div className="relative flex flex-col w-[260px] bg-surface-0 border-r border-border-default shrink-0">
      <div className="absolute inset-0 grid-texture opacity-10 pointer-events-none" />
      <div className="flex items-center gap-1.5 p-2">
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-1 border border-border-default rounded-lg">
          <Search size={12} className="text-text-tertiary shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary outline-none"
          />
        </div>
        <button
          onClick={handleNew}
          title="New conversation (Cmd+N)"
          className="w-8 h-8 flex items-center justify-center bg-surface-1 border border-border-default rounded-lg text-text-tertiary hover:text-accent hover:border-accent/30 cursor-pointer transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-text-tertiary text-xs">No conversations</div>
        ) : (
          groups.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary font-medium">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer text-xs rounded-md transition-colors mb-0.5 ${
                    conv.id === activeConversationId
                      ? 'bg-accent/8 text-text-primary border-l-2 border-accent ml-0'
                      : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary border-l-2 border-transparent'
                  }`}
                >
                  <MessageSquare size={13} className="shrink-0 text-text-tertiary" />
                  <span className="flex-1 truncate leading-snug">
                    {conv.title || <span className="text-text-tertiary italic">untitled</span>}
                  </span>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error shrink-0 cursor-pointer p-0.5 rounded hover:bg-surface-2 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
