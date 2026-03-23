'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from '@/lib/types';
import { ArrowDown } from 'lucide-react';
import MessageBubble from './message-bubble';
import StreamingBubble from './streaming-bubble';

export default function ChatMessages() {
  const activeConversationId = useStore((s) => s.activeConversationId);
  const messages = useStore((s) => s.messages);
  const setMessages = useStore((s) => s.setMessages);
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

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distFromBottom > 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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

    async function load() {
      try {
        const conv = await api.getConversation(activeConversationId!);
        const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
        const mapped: Message[] = rawMessages.map((m) => ({
          id: (m.id as string) || '',
          conversationId: activeConversationId!,
          role: (m.role as 'user' | 'assistant' | 'system') || 'user',
          content: (m.content as string) || '',
          createdAt: (m.created_at as string) || (m.createdAt as string) || '',
          reasoning: (m.reasoning as string) || undefined,
          toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
          images: (m.images as Message['images']) || undefined,
          feedback: (m.feedback as Message['feedback']) || undefined,
          parentId: (m.parent_id as string) || undefined,
          branchIndex: (m.branch_index as number) ?? undefined,
        }));
        setMessages(mapped);
        setActiveLeafId((conv.active_leaf_id as string) || null);
        setSandboxId((conv.sandbox_id as string) || null);
        setSandboxStatus(conv.sandbox_id ? 'running' : 'none');

        try {
          const artifacts = await api.getArtifacts(activeConversationId!);
          setArtifacts(artifacts);
        } catch {}

        // Load tree structure
        try {
          const tree = await api.getConversationTree(activeConversationId!);
          setConversationTree(tree);
        } catch {}
      } catch (e) {
        console.error('Failed to load conversation:', e);
      }
    }

    load();
  }, [activeConversationId, setMessages, setSandboxId, setSandboxStatus, setArtifacts, setActiveLeafId, setConversationTree]);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0 overflow-y-auto px-4 py-6">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <StreamingBubble />
        </div>
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
