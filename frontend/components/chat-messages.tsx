'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { mapRawMessages } from '@/lib/useStreaming';
import { ArrowDown } from 'lucide-react';
import MessageBubble from './message-bubble';
import StreamingBubble from './streaming-bubble';
import { MessageSkeleton } from './skeleton';

export default function ChatMessages() {
  const activeConversationId = useStore((s) => s.activeConversationId);
  const messages = useStore((s) => s.messages);
  const setConversationMessages = useStore((s) => s.setConversationMessages);
  const setSandboxId = useStore((s) => s.setSandboxId);
  const setSandboxStatus = useStore((s) => s.setSandboxStatus);
  const setArtifacts = useStore((s) => s.setArtifacts);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);
  const isStreaming = useStore((s) => s.isStreaming);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [loading, setLoading] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const updateScrollButtonVisibility = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const hasVisibleContent = messages.length > 0 || isStreaming;
    if (!hasVisibleContent) {
      setShowScrollButton(false);
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollable = scrollHeight > clientHeight + 10;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(isScrollable && distFromBottom > 150);
  }, [isStreaming, messages.length]);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => updateScrollButtonVisibility();

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [updateScrollButtonVisibility]);

  useEffect(() => {
    updateScrollButtonVisibility();
  }, [activeConversationId, messages, isStreaming, loading, updateScrollButtonVisibility]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Also scroll when streaming content changes
  const streamingContent = useStore((s) => s.streaming.content);
  useEffect(() => {
    if (isStreaming) scrollToBottom();
  }, [streamingContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    if (!activeConversationId || isStreamingRef.current) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const conversationId = activeConversationId as string;
        const conv = await api.getConversation(conversationId);
        if (cancelled) return;
        const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
        setConversationMessages(conversationId, mapRawMessages(rawMessages, conversationId));
        if (useStore.getState().activeConversationId !== conversationId) return;
        setActiveLeafId((conv.active_leaf_id as string) || null);
        setSandboxId((conv.sandbox_id as string) || null);
        setSandboxStatus(conv.sandbox_id ? 'running' : 'none');

        // Restore active persona from conversation
        const personaId = (conv.agent_persona_id as string) || null;
        if (personaId) {
          try {
            const persona = await api.getAgent(personaId);
            useStore.getState().setActivePersona(persona);
          } catch {
            useStore.getState().setActivePersona(null);
          }
        } else {
          useStore.getState().setActivePersona(null);
        }

        try {
          const artifacts = await api.getArtifacts(conversationId);
          if (cancelled || useStore.getState().activeConversationId !== conversationId) return;
          setArtifacts(artifacts);
        } catch {}

        // Load tree structure
        try {
          const tree = await api.getConversationTree(conversationId);
          if (cancelled || useStore.getState().activeConversationId !== conversationId) return;
          setConversationTree(tree);
        } catch {}
      } catch (e) {
        console.error('Failed to load conversation:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setConversationMessages, setSandboxId, setSandboxStatus, setArtifacts, setActiveLeafId, setConversationTree]);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
        {loading && messages.length === 0 ? (
          <MessageSkeleton />
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <StreamingBubble />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border-default rounded-full text-[11px] text-text-secondary hover:text-text-primary hover:border-border-focus shadow-lg transition-all cursor-pointer animate-fade-in-up"
          style={{ animationDuration: '0.15s' }}
        >
          <ArrowDown size={12} />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
