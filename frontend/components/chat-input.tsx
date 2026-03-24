'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import * as api from '@/lib/api';
import type { Message } from '@/lib/types';
import { ArrowUp, Square, Paperclip, X } from 'lucide-react';
import ModelPicker from './model-picker';
import { toast } from './toast';
import { useStreaming } from '@/lib/useStreaming';

const RESPONSE_COUNTS = [1, 3, 5] as const;

export default function ChatInput() {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [numResponses, setNumResponses] = useState<number>(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = useStore((s) => s.isStreaming);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeModel = useStore((s) => s.activeModel);
  const sandboxId = useStore((s) => s.sandboxId);
  const messages = useStore((s) => s.messages);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setConversations = useStore((s) => s.setConversations);
  const pendingPrompt = useStore((s) => s.pendingPrompt);
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const branchingFromId = useStore((s) => s.branchingFromId);
  const setBranchingFromId = useStore((s) => s.setBranchingFromId);
  const abortStreaming = useStore((s) => s.abortStreaming);

  const { streamSend, streamRegenerate } = useStreaming();

  // Pick up pending prompt from empty state starters
  useEffect(() => {
    if (pendingPrompt) {
      setContent(pendingPrompt);
      setPendingPrompt(null);
      textareaRef.current?.focus();
    }
  }, [pendingPrompt, setPendingPrompt]);

  // Auto-focus textarea on conversation switch
  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [activeConversationId, isStreaming]);

  // Re-focus after streaming ends
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      textareaRef.current?.focus();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [content]);

  const handleSend = useCallback(async () => {
    if (isStreaming) return;
    const text = content.trim();
    if (!text && pendingFiles.length === 0) return;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await api.createConversation({ model: activeModel, agent_mode: 'code' });
        convId = conv.id;
        setActiveConversationId(convId);
        api.listConversations().then((r) => setConversations(r.conversations));
      } catch (e) {
        console.error('Failed to create conversation:', e);
        toast.error('Failed to create conversation');
        return;
      }
    }

    let attachmentIds: string[] | undefined;
    if (pendingFiles.length > 0 && sandboxId) {
      try {
        const result = await api.uploadSandboxFiles(sandboxId, pendingFiles);
        attachmentIds = result.ids;
      } catch {
        toast.error('Failed to upload files');
      }
    }

    const parentId = branchingFromId || undefined;
    setBranchingFromId(null);
    setContent('');
    setPendingFiles([]);

    // Add user message optimistically
    const userMsg: Message = {
      id: `temp-${Date.now()}`, conversationId: convId, role: 'user',
      content: text || '[File upload]', createdAt: new Date().toISOString(),
      parentId,
    };
    if (parentId) {
      const branchIdx = messages.findIndex((m) => m.id === parentId);
      setMessages(branchIdx !== -1 ? [...messages.slice(0, branchIdx + 1), userMsg] : [...messages, userMsg]);
    } else {
      setMessages([...messages, userMsg]);
    }

    await streamSend(text, convId, {
      attachmentIds,
      model: activeModel,
      parentId,
      numResponses,
    });
  }, [content, pendingFiles, isStreaming, activeConversationId, activeModel, sandboxId, messages,
    setActiveConversationId, setMessages, setConversations, branchingFromId, setBranchingFromId,
    numResponses, streamSend]);

  // Handle regenerate events from message bubbles
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.conversationId || !detail?.messageId || isStreaming) return;
      await streamRegenerate(detail.conversationId, detail.messageId);
    };
    window.addEventListener('nexus:regenerate', handler);
    return () => window.removeEventListener('nexus:regenerate', handler);
  }, [isStreaming, streamRegenerate]);

  // Handle retry-with-model events
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.conversationId || !detail?.messageId || !detail?.model || isStreaming) return;
      await streamRegenerate(detail.conversationId, detail.messageId, detail.model);
    };
    window.addEventListener('nexus:regenerate-with-model', handler);
    return () => window.removeEventListener('nexus:regenerate-with-model', handler);
  }, [isStreaming, streamRegenerate]);

  // Handle branch-send events from the inline branch input card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.content || !detail?.parentId) return;
      setBranchingFromId(detail.parentId);
      setContent(detail.content);
      setTimeout(() => {
        const sendBtn = document.querySelector('[data-send-button]') as HTMLButtonElement;
        sendBtn?.click();
      }, 50);
    };
    window.addEventListener('nexus:branch-send', handler);
    return () => window.removeEventListener('nexus:branch-send', handler);
  }, [setBranchingFromId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const removeFile = (index: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  const hasContent = content.trim() || pendingFiles.length > 0;

  return (
    <div className="shrink-0 border-t border-border-default bg-surface-0 px-3 sm:px-4 py-2 sm:py-3 safe-bottom">
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pendingFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-1 border border-border-default rounded-md text-[11px] text-text-secondary font-mono">
              <span className="truncate max-w-[140px]">{file.name}</span>
              <button onClick={() => removeFile(i)} className="text-text-tertiary hover:text-error cursor-pointer">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-2 bg-surface-1 border border-border-default rounded-xl px-3 py-2 min-h-[44px] focus-within:border-accent/30 focus-within:shadow-[0_0_16px_-4px_var(--color-accent-dim)] transition-all"
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) setPendingFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]); }}
        onDragOver={(e) => e.preventDefault()}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'Waiting for response...' : 'Message Nexus...'}
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary resize-none outline-none disabled:opacity-50 max-h-[200px] self-center"
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]); }} />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 text-text-tertiary hover:text-text-secondary shrink-0 cursor-pointer rounded-md hover:bg-surface-2 transition-colors"
          title="Attach files"
        >
          <Paperclip size={14} />
        </button>

        {isStreaming ? (
          <button
            onClick={abortStreaming}
            className="w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all bg-error/80 text-white hover:bg-error"
            title="Stop generation"
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            data-send-button
            onClick={handleSend}
            disabled={!hasContent}
            className={`w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all ${
              hasContent ? 'bg-accent text-bg hover:bg-accent-hover scale-100' : 'bg-surface-2 text-text-tertiary scale-95'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="mt-1.5 px-1 flex items-center gap-3">
        <ModelPicker />
        {!isStreaming && (
          <div className="hidden sm:flex items-center gap-1 ml-auto">
            {RESPONSE_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setNumResponses(n)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded-md border cursor-pointer transition-all ${
                  numResponses === n
                    ? 'text-accent bg-accent/10 border-accent/30'
                    : 'text-text-tertiary bg-surface-1 border-border-default hover:border-border-focus hover:text-text-secondary'
                }`}
              >
                {n}x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
