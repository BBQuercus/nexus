'use client';

import { useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { initMarkdown } from '@/lib/markdown';
import Sidebar from './sidebar';
import TopBar from './top-bar';
import ChatMessages from './chat-messages';
import ChatInput from './chat-input';
import EmptyState from './empty-state';
import RightPanel from './right-panel';
import CommandPalette from './command-palette';
import * as api from '@/lib/api';

export default function Workspace() {
  const activeConversationId = useStore((s) => s.activeConversationId);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen);

  useEffect(() => {
    initMarkdown();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Cmd+K — command palette
    if (meta && e.key === 'k') {
      e.preventDefault();
      useStore.getState().setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
      return;
    }

    // Escape — close command palette, or blur active input
    if (e.key === 'Escape') {
      if (useStore.getState().commandPaletteOpen) {
        useStore.getState().setCommandPaletteOpen(false);
      } else if (isInput) {
        (target as HTMLElement).blur();
      }
      return;
    }

    // Cmd+N — new conversation
    if (meta && e.key === 'n') {
      e.preventDefault();
      (async () => {
        try {
          const conv = await api.createConversation({
            model: useStore.getState().activeModel,
            agent_mode: useStore.getState().activeMode,
          });
          useStore.getState().setActiveConversationId(conv.id);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to create conversation:', err);
        }
      })();
      return;
    }

    // Cmd+Backspace — delete active conversation
    if (meta && e.key === 'Backspace' && e.shiftKey) {
      e.preventDefault();
      const convId = useStore.getState().activeConversationId;
      if (!convId) return;
      if (!confirm('Delete this conversation?')) return;
      (async () => {
        try {
          await api.deleteConversation(convId);
          useStore.getState().setActiveConversationId(null);
          useStore.getState().setMessages([]);
          const result = await api.listConversations();
          useStore.getState().setConversations(result.conversations);
        } catch (err) {
          console.error('Failed to delete:', err);
        }
      })();
      return;
    }

    // / — focus chat input (when not in an input field)
    if (e.key === '/' && !isInput && !useStore.getState().commandPaletteOpen) {
      e.preventDefault();
      const textarea = document.querySelector('textarea');
      textarea?.focus();
      return;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const hasConversation = !!activeConversationId;

  return (
    <div className="relative flex flex-col h-screen w-screen bg-bg overflow-hidden noise-overlay">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="relative flex flex-col flex-1 min-w-0">
          <div className="absolute inset-0 dot-texture opacity-40 pointer-events-none" />
          <div className="relative flex flex-col flex-1 min-h-0">
            {hasConversation ? <ChatMessages /> : <EmptyState />}
            <ChatInput />
          </div>
        </div>
        {rightPanelOpen && <RightPanel />}
      </div>
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
