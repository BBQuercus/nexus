'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import { mapRawMessages, loadAndAttachArtifacts } from '@/lib/useStreaming';
import { ArrowDown } from 'lucide-react';
import MessageBubble from './message-bubble';
import StreamingBubble from './streaming-bubble';
import { MessageSkeleton } from './skeleton';

const PAGE_SIZE = 50;

export default function ChatMessages() {
  const t = useTranslations('chatMessages');
  const activeConversationId = useStore((s) => s.activeConversationId);
  const messages = useStore((s) => s.messages);
  const setConversationMessages = useStore((s) => s.setConversationMessages);
  const setSandboxId = useStore((s) => s.setSandboxId);
  const setSandboxStatus = useStore((s) => s.setSandboxStatus);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);
  const isStreaming = useStore((s) => s.isStreaming);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(messages.length);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when conversation changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeConversationId]);

  const hasMore = messages.length > visibleCount;
  const visibleMessages = hasMore ? messages.slice(messages.length - visibleCount) : messages;

  // Virtualizer for efficient rendering of long message lists
  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => visibleMessages[index]?.id ?? index,
  });

  const loadMore = useCallback(() => {
    const container = containerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    setVisibleCount((prev) => prev + PAGE_SIZE);
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - prevHeight;
      }
    });
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const isNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;

    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distFromBottom <= 80;
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

  const scrollToBottomIfPinned = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (!autoScrollRef.current) {
      updateScrollButtonVisibility();
      return;
    }

    requestAnimationFrame(() => {
      scrollToBottom(behavior);
      updateScrollButtonVisibility();
    });
  }, [scrollToBottom, updateScrollButtonVisibility]);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      autoScrollRef.current = isNearBottom();
      updateScrollButtonVisibility();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isNearBottom, updateScrollButtonVisibility]);

  useEffect(() => {
    updateScrollButtonVisibility();
  }, [activeConversationId, messages, isStreaming, loading, updateScrollButtonVisibility]);

  useEffect(() => {
    autoScrollRef.current = true;
    previousMessageCountRef.current = useStore.getState().messages.length;
    scrollToBottomIfPinned();
  }, [activeConversationId, scrollToBottomIfPinned]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const nextCount = messages.length;

    if (nextCount > previousCount) {
      const added = nextCount - previousCount;
      setVisibleCount((prev) => prev + added);
      scrollToBottomIfPinned('smooth');
    }

    previousMessageCountRef.current = nextCount;
  }, [messages.length, scrollToBottomIfPinned]);

  // Also scroll when streaming content changes
  const streamingContent = useStore((s) => s.streaming.content);
  useEffect(() => {
    if (isStreaming) scrollToBottomIfPinned();
  }, [streamingContent, isStreaming, scrollToBottomIfPinned]);

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

        if (!cancelled) {
          await loadAndAttachArtifacts(conversationId);
        }

        // Load tree structure
        try {
          const tree = await api.getConversationTree(conversationId);
          if (cancelled || useStore.getState().activeConversationId !== conversationId) return;
          setConversationTree(tree);
        } catch {}
      } catch (e: unknown) {
        console.error('Failed to load conversation:', e);
        // If conversation no longer exists (404), clear stale selection
        if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) {
          if (!cancelled) {
            useStore.getState().setActiveConversationId(null);
            useStore.getState().setMessages([]);
            try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, setConversationMessages, setSandboxId, setSandboxStatus, setActiveLeafId, setConversationTree]);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0 overflow-y-auto px-3 md:px-6 py-4 md:py-6 scrollbar-gutter-stable">
        {loading && messages.length === 0 ? (
          <MessageSkeleton />
        ) : (
          <div className="max-w-4xl mx-auto">
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadMore}
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-surface-1 border border-border-default rounded-lg hover:border-border-focus transition-colors cursor-pointer"
                >
                  {t('loadEarlier', { count: Math.min(PAGE_SIZE, messages.length - visibleCount) })}
                </button>
              </div>
            )}
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const msg = visibleMessages[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="pb-4">
                      <MessageBubble message={msg} />
                    </div>
                  </div>
                );
              })}
            </div>
            <StreamingBubble />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={() => {
            autoScrollRef.current = true;
            scrollToBottom('smooth');
            updateScrollButtonVisibility();
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border-default rounded-full text-[11px] text-text-secondary hover:text-text-primary hover:border-border-focus shadow-lg transition-all cursor-pointer animate-fade-in-up"
          style={{ animationDuration: '0.15s' }}
        >
          <ArrowDown size={12} />
          {t('scrollToBottom')}
        </button>
      )}
    </div>
  );
}
