'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import type { StreamingState } from '@/lib/store';
import * as api from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import type { Message, ToolCall } from '@/lib/types';
import { ArrowUp, Square, Paperclip, X } from 'lucide-react';
import ModelPicker from './model-picker';

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
  const setIsStreaming = useStore((s) => s.setIsStreaming);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const setMessages = useStore((s) => s.setMessages);
  const setConversations = useStore((s) => s.setConversations);
  const setPreviewUrl = useStore((s) => s.setPreviewUrl);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const updateConversationTitle = useStore((s) => s.updateConversationTitle);
  const appendStreamingContent = useStore((s) => s.appendStreamingContent);
  const setStreaming = useStore((s) => s.setStreaming);
  const resetStreaming = useStore((s) => s.resetStreaming);
  const pendingPrompt = useStore((s) => s.pendingPrompt);
  const setPendingPrompt = useStore((s) => s.setPendingPrompt);
  const branchingFromId = useStore((s) => s.branchingFromId);
  const setBranchingFromId = useStore((s) => s.setBranchingFromId);
  const setActiveLeafId = useStore((s) => s.setActiveLeafId);
  const setConversationTree = useStore((s) => s.setConversationTree);
  const setMultiStreaming = useStore((s) => s.setMultiStreaming);

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
      // Small delay to let the DOM settle after conversation load
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

    setIsStreaming(true);
    resetStreaming();

    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await api.createConversation({ model: activeModel, agent_mode: 'code' });
        convId = conv.id;
        setActiveConversationId(convId);
        api.listConversations().then((r) => setConversations(r.conversations));
      } catch (e) {
        console.error('Failed to create conversation:', e);
        setIsStreaming(false);
        return;
      }
    }

    let attachmentIds: string[] | undefined;
    if (pendingFiles.length > 0 && sandboxId) {
      try {
        const result = await api.uploadSandboxFiles(sandboxId, pendingFiles);
        attachmentIds = result.ids;
      } catch (e) {
        console.error('Failed to upload files:', e);
      }
    }

    // Capture parentId for branching, then clear
    const parentId = branchingFromId || undefined;
    setBranchingFromId(null);
    setContent('');
    setPendingFiles([]);

    // Add user message to the messages array
    const userMsg: Message = {
      id: `temp-${Date.now()}`, conversationId: convId, role: 'user',
      content: text || '[File upload]', createdAt: new Date().toISOString(),
      parentId: parentId,
    };

    // If branching, we need to truncate messages to the branch point first
    if (parentId) {
      const branchIdx = messages.findIndex((m) => m.id === parentId);
      if (branchIdx !== -1) {
        setMessages([...messages.slice(0, branchIdx + 1), userMsg]);
      } else {
        setMessages([...messages, userMsg]);
      }
    } else {
      setMessages([...messages, userMsg]);
    }

    const isMulti = numResponses > 1;

    // Initialize multi-streaming state if needed
    if (isMulti) {
      const emptyBranch = { content: '', reasoning: '', toolCalls: [] as ToolCall[], images: [] as { filename: string; url: string }[] };
      setMultiStreaming({
        branches: Array.from({ length: numResponses }, () => ({ ...emptyBranch, toolCalls: [], images: [] })),
        activeBranchIndex: 0,
        branchCount: numResponses,
        completedBranches: [],
      });
    }

    // Stream into the dedicated streaming state (NOT into messages array)
    let finalContent = '';
    let finalReasoning = '';
    let finalToolCalls: ToolCall[] = [];
    let finalCost: Message['cost'] = undefined;

    // Helper to update a specific branch in multi-streaming state
    const updateBranch = (bi: number, updater: (branch: StreamingState) => Partial<StreamingState>) => {
      const ms = useStore.getState().multiStreaming;
      if (!ms) return;
      const branches = [...ms.branches];
      branches[bi] = { ...branches[bi], ...updater(branches[bi]) };
      setMultiStreaming({ ...ms, branches });
    };

    try {
      const response = await api.sendMessage(convId, text, attachmentIds, activeModel, 'code', parentId, numResponses);
      for await (const event of streamSSE(response)) {
        const e = event as unknown as Record<string, unknown>;
        const bi = (e.branch_index as number) ?? 0;

        switch (event.type) {
          case 'token':
            if (isMulti) {
              updateBranch(bi, (b) => ({ content: b.content + ((e.content as string) || '') }));
            } else {
              appendStreamingContent((e.content as string) || '');
              finalContent = useStore.getState().streaming.content;
            }
            break;

          case 'reasoning':
            if (isMulti) {
              updateBranch(bi, () => ({ reasoning: (e.content as string) || '' }));
            } else {
              setStreaming({ reasoning: (e.content as string) || '' });
              finalReasoning = (e.content as string) || '';
            }
            break;

          case 'tool_start': {
            const toolId = (e.tool_call_id as string) || `tool-${Date.now()}`;
            const args = e.arguments as Record<string, string> | undefined;
            const newTool: ToolCall = {
              id: toolId, name: (e.tool as string) || '',
              language: args?.language || (e.tool as string) || '',
              code: args?.code || '', isRunning: true,
            };
            if (isMulti) {
              updateBranch(bi, (b) => ({ toolCalls: [...b.toolCalls, newTool] }));
            } else {
              finalToolCalls = [...useStore.getState().streaming.toolCalls, newTool];
              setStreaming({ toolCalls: finalToolCalls });
            }
            break;
          }

          case 'tool_output': {
            const toolId = (e.tool_call_id as string) || '';
            const output = (e.output as string) || '';
            if (isMulti) {
              updateBranch(bi, (b) => ({
                toolCalls: b.toolCalls.map((t) => t.id === toolId ? { ...t, output: (t.output || '') + output } : t),
              }));
            } else {
              finalToolCalls = useStore.getState().streaming.toolCalls.map((t) =>
                t.id === toolId ? { ...t, output: (t.output || '') + output } : t
              );
              setStreaming({ toolCalls: finalToolCalls });
            }
            break;
          }

          case 'tool_end': {
            const toolId = (e.tool_call_id as string) || '';
            if (isMulti) {
              updateBranch(bi, (b) => ({
                toolCalls: b.toolCalls.map((t) => t.id === toolId ? { ...t, isRunning: false, exitCode: (e as Record<string, unknown>).exit_code as number ?? 0 } : t),
              }));
            } else {
              finalToolCalls = useStore.getState().streaming.toolCalls.map((t) =>
                t.id === toolId ? { ...t, isRunning: false, exitCode: (e as Record<string, unknown>).exit_code as number ?? 0 } : t
              );
              setStreaming({ toolCalls: finalToolCalls });
            }
            break;
          }

          case 'image_output': {
            const url = (e.url as string) || '';
            const filename = (e.filename as string) || '';
            if (url) {
              if (isMulti) {
                updateBranch(bi, (b) => ({ images: [...b.images, { filename, url }] }));
              } else {
                const currentImages = useStore.getState().streaming.images;
                setStreaming({ images: [...currentImages, { filename, url }] });
              }
            }
            break;
          }

          case 'preview':
            setPreviewUrl((e.url as string) || '');
            setRightPanelTab('preview');
            break;

          case 'title': {
            const title = (e.title as string) || '';
            if (title && convId) updateConversationTitle(convId, title);
            break;
          }

          case 'done': {
            if (isMulti) {
              // Mark this branch as completed
              const ms = useStore.getState().multiStreaming;
              if (ms) {
                setMultiStreaming({ ...ms, completedBranches: [...ms.completedBranches, bi] });
              }
              const newSandboxId = (e.sandbox_id as string) || null;
              if (newSandboxId) {
                useStore.getState().setSandboxId(newSandboxId);
                useStore.getState().setSandboxStatus('running');
              }
            } else {
              finalCost = {
                inputTokens: (e.input_tokens as number) || 0,
                outputTokens: (e.output_tokens as number) || 0,
                totalCost: 0, model: activeModel,
                duration: (e.duration_ms as number) || 0,
              };
              const newSandboxId = (e.sandbox_id as string) || null;
              if (newSandboxId) {
                useStore.getState().setSandboxId(newSandboxId);
                useStore.getState().setSandboxStatus('running');
              }
              const newLeafId = (e.active_leaf_id as string) || null;
              if (newLeafId) setActiveLeafId(newLeafId);
            }
            break;
          }

          case 'all_done': {
            // Multi-response complete — reload conversation
            const newLeafId = (e.active_leaf_id as string) || null;
            if (newLeafId) setActiveLeafId(newLeafId);
            break;
          }

          case 'error':
            if (isMulti) {
              updateBranch(bi, (b) => ({ content: b.content + `\n\n**Error:** ${(e.message as string) || 'Unknown error'}` }));
            } else {
              appendStreamingContent(`\n\n**Error:** ${(e.message as string) || 'Unknown error'}`);
              finalContent = useStore.getState().streaming.content;
            }
            break;
        }
      }
    } catch (err) {
      console.error('Stream error:', err);
      if (!isMulti) finalContent = `Error: ${(err as Error).message}`;
    }

    if (isMulti) {
      // Multi-response done — reload full conversation from backend
      setMultiStreaming(null);
      resetStreaming();
      setIsStreaming(false);
      if (convId) {
        try {
          const conv = await api.getConversation(convId);
          const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
          const mapped: Message[] = rawMessages.map((m) => ({
            id: (m.id as string) || '',
            conversationId: convId,
            role: (m.role as 'user' | 'assistant' | 'system') || 'user',
            content: (m.content as string) || '',
            createdAt: (m.created_at as string) || '',
            reasoning: (m.reasoning as string) || undefined,
            toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
            images: (m.images as Message['images']) || undefined,
            feedback: (m.feedback as Message['feedback']) || undefined,
            parentId: (m.parent_id as string) || undefined,
            branchIndex: (m.branch_index as number) ?? undefined,
          }));
          setMessages(mapped);
          const tree = await api.getConversationTree(convId);
          setConversationTree(tree);
        } catch {}
        api.listConversations().then((r) => setConversations(r.conversations));
      }
    } else {
      // Single response — commit locally
      const finalState = useStore.getState().streaming;
      const commitContent = finalState.content || finalContent;
      const commitToolCalls = finalState.toolCalls.length > 0 ? finalState.toolCalls : (finalToolCalls.length > 0 ? finalToolCalls : undefined);
      const commitReasoning = finalState.reasoning || finalReasoning || undefined;
      const commitImages = finalState.images.length > 0 ? [...finalState.images] : undefined;

      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        conversationId: convId,
        role: 'assistant',
        content: commitContent,
        createdAt: new Date().toISOString(),
        reasoning: commitReasoning,
        toolCalls: commitToolCalls,
        cost: finalCost,
        images: commitImages,
      };
      setMessages((prev: Message[]) => [...prev, assistantMsg]);
      resetStreaming();
      setIsStreaming(false);

      if (convId) {
        api.listConversations().then((r) => setConversations(r.conversations));
        api.getConversationTree(convId).then((tree) => setConversationTree(tree)).catch(() => {});
      }
    }
  }, [content, pendingFiles, isStreaming, activeConversationId, activeModel, sandboxId, messages,
    setIsStreaming, setActiveConversationId, setMessages, setConversations, setPreviewUrl,
    setRightPanelTab, updateConversationTitle, appendStreamingContent, setStreaming, resetStreaming,
    branchingFromId, setBranchingFromId, setActiveLeafId, setConversationTree, numResponses, setMultiStreaming]);

  // Handle regenerate events from message bubbles
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.conversationId || !detail?.messageId || isStreaming) return;

      setIsStreaming(true);
      resetStreaming();

      try {
        const response = await api.regenerateMessage(detail.conversationId, detail.messageId);
        for await (const event of streamSSE(response)) {
          const ev = event as unknown as Record<string, unknown>;
          switch (event.type) {
            case 'token':
              appendStreamingContent((ev.content as string) || '');
              break;
            case 'reasoning':
              setStreaming({ reasoning: (ev.content as string) || '' });
              break;
            case 'tool_start': {
              const toolId = (ev.tool_call_id as string) || `tool-${Date.now()}`;
              const args = ev.arguments as Record<string, string> | undefined;
              const newTool: ToolCall = {
                id: toolId, name: (ev.tool as string) || '',
                language: args?.language || '', code: args?.code || '', isRunning: true,
              };
              setStreaming({ toolCalls: [...useStore.getState().streaming.toolCalls, newTool] });
              break;
            }
            case 'tool_output': {
              const toolId = (ev.tool_call_id as string) || '';
              const output = (ev.output as string) || '';
              setStreaming({ toolCalls: useStore.getState().streaming.toolCalls.map((t) =>
                t.id === toolId ? { ...t, output: (t.output || '') + output } : t
              )});
              break;
            }
            case 'tool_end': {
              const toolId = (ev.tool_call_id as string) || '';
              setStreaming({ toolCalls: useStore.getState().streaming.toolCalls.map((t) =>
                t.id === toolId ? { ...t, isRunning: false, exitCode: (ev as Record<string, unknown>).exit_code as number ?? 0 } : t
              )});
              break;
            }
            case 'image_output': {
              const url = (ev.url as string) || '';
              const filename = (ev.filename as string) || '';
              if (url) setStreaming({ images: [...useStore.getState().streaming.images, { filename, url }] });
              break;
            }
            case 'done': {
              const newLeafId = (ev.active_leaf_id as string) || null;
              if (newLeafId) setActiveLeafId(newLeafId);
              break;
            }
          }
        }
      } catch (err) {
        console.error('Regenerate stream error:', err);
      }

      // Commit: reload the full conversation to get the correct active path
      try {
        const conv = await api.getConversation(detail.conversationId);
        const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
        const mapped: Message[] = rawMessages.map((m) => ({
          id: (m.id as string) || '',
          conversationId: detail.conversationId,
          role: (m.role as 'user' | 'assistant' | 'system') || 'user',
          content: (m.content as string) || '',
          createdAt: (m.created_at as string) || '',
          reasoning: (m.reasoning as string) || undefined,
          toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
          images: (m.images as Message['images']) || undefined,
          feedback: (m.feedback as Message['feedback']) || undefined,
          parentId: (m.parent_id as string) || undefined,
          branchIndex: (m.branch_index as number) ?? undefined,
        }));
        setMessages(mapped);
        const tree = await api.getConversationTree(detail.conversationId);
        setConversationTree(tree);
      } catch {}

      resetStreaming();
      setIsStreaming(false);
    };

    window.addEventListener('nexus:regenerate', handler);
    return () => window.removeEventListener('nexus:regenerate', handler);
  }, [isStreaming, setIsStreaming, resetStreaming, appendStreamingContent, setStreaming, setMessages, setActiveLeafId, setConversationTree]);

  // Handle branch-send events from the inline branch input card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.content || !detail?.parentId) return;
      // Set the branching parent and content, then trigger send
      setBranchingFromId(detail.parentId);
      setContent(detail.content);
      // Use a microtask to let state settle, then trigger send
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
    <div className="shrink-0 border-t border-border-default bg-surface-0 px-4 py-3">
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
        className="flex items-end gap-2 bg-surface-1 border border-border-default rounded-xl px-3 py-2 focus-within:border-accent/30 focus-within:shadow-[0_0_16px_-4px_var(--color-accent-dim)] transition-all"
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
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary resize-none outline-none disabled:opacity-50 max-h-[200px]"
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]); }} />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 text-text-tertiary hover:text-text-secondary shrink-0 cursor-pointer rounded-md hover:bg-surface-2 transition-colors"
          title="Attach files"
        >
          <Paperclip size={14} />
        </button>

        <button
          data-send-button
          onClick={handleSend}
          disabled={isStreaming || !hasContent}
          className={`w-7 h-7 flex items-center justify-center text-sm shrink-0 cursor-pointer rounded-lg transition-all ${
            hasContent ? 'bg-accent text-bg hover:bg-accent-hover scale-100' : 'bg-surface-2 text-text-tertiary scale-95'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isStreaming ? <Square size={12} /> : <ArrowUp size={14} strokeWidth={2.5} />}
        </button>
      </div>

      <div className="mt-1.5 px-1 flex items-center gap-3">
        <ModelPicker />
        {/* Response count selector */}
        {!isStreaming && (
          <div className="flex items-center gap-1 ml-auto">
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
