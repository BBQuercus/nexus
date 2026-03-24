import { useCallback } from 'react';
import { useStore } from './store';
import type { StreamingState } from './store';
import * as api from './api';
import { streamSSE } from './sse';
import type { Message, ToolCall } from './types';
import { toast } from '@/components/toast';

/** Map raw API message objects to typed Message[] */
export function mapRawMessages(raw: Array<Record<string, unknown>>, conversationId: string): Message[] {
  return raw.map((m) => ({
    id: (m.id as string) || '',
    conversationId,
    role: (m.role as 'user' | 'assistant' | 'system') || 'user',
    content: (m.content as string) || '',
    createdAt: (m.created_at as string) || (m.createdAt as string) || '',
    reasoning: (m.reasoning as string) || undefined,
    toolCalls: (m.tool_calls as Message['toolCalls']) || undefined,
    images: (m.images as Message['images']) || undefined,
    files: (m.files as Message['files']) || undefined,
    feedback: (m.feedback as Message['feedback']) || undefined,
    parentId: (m.parent_id as string) || undefined,
    branchIndex: (m.branch_index as number) ?? undefined,
  }));
}

/** Process a single SSE event into the appropriate store state */
export function processSseEvent(
  event: Record<string, unknown>,
  opts: {
    isMulti: boolean;
    activeModel: string;
    updateBranch: (bi: number, updater: (b: StreamingState) => Partial<StreamingState>) => void;
  },
): { finalCost?: Message['cost']; done?: boolean } {
  const store = useStore.getState();
  const bi = (event.branch_index as number) ?? 0;
  const type = event.type as string;

  switch (type) {
    case 'token':
      if (opts.isMulti) {
        opts.updateBranch(bi, (b) => ({ content: b.content + ((event.content as string) || '') }));
      } else {
        store.appendStreamingContent((event.content as string) || '');
      }
      break;

    case 'reasoning':
      if (opts.isMulti) {
        opts.updateBranch(bi, () => ({ reasoning: (event.content as string) || '' }));
      } else {
        store.setStreaming({ reasoning: (event.content as string) || '' });
      }
      break;

    case 'tool_start': {
      const toolId = (event.tool_call_id as string) || `tool-${Date.now()}`;
      const args = event.arguments as Record<string, string> | undefined;
      const newTool: ToolCall = {
        id: toolId,
        name: (event.tool as string) || '',
        language: args?.language || (event.tool as string) || '',
        code: args?.code || '',
        isRunning: true,
      };
      if (opts.isMulti) {
        opts.updateBranch(bi, (b) => ({ toolCalls: [...b.toolCalls, newTool] }));
      } else {
        store.setStreaming({ toolCalls: [...store.streaming.toolCalls, newTool] });
      }
      break;
    }

    case 'tool_output': {
      const toolId = (event.tool_call_id as string) || '';
      const output = (event.output as string) || '';
      if (opts.isMulti) {
        opts.updateBranch(bi, (b) => ({
          toolCalls: b.toolCalls.map((t) => t.id === toolId ? { ...t, output: (t.output || '') + output } : t),
        }));
      } else {
        store.setStreaming({
          toolCalls: store.streaming.toolCalls.map((t) =>
            t.id === toolId ? { ...t, output: (t.output || '') + output } : t
          ),
        });
      }
      break;
    }

    case 'tool_end': {
      const toolId = (event.tool_call_id as string) || '';
      const exitCode = event.exit_code as number ?? 0;
      if (opts.isMulti) {
        opts.updateBranch(bi, (b) => ({
          toolCalls: b.toolCalls.map((t) => t.id === toolId ? { ...t, isRunning: false, exitCode } : t),
        }));
      } else {
        store.setStreaming({
          toolCalls: store.streaming.toolCalls.map((t) =>
            t.id === toolId ? { ...t, isRunning: false, exitCode } : t
          ),
        });
      }
      break;
    }

    case 'image_output': {
      const url = (event.url as string) || '';
      const filename = (event.filename as string) || '';
      if (url) {
        if (opts.isMulti) {
          opts.updateBranch(bi, (b) => ({ images: [...b.images, { filename, url }] }));
        } else {
          store.setStreaming({ images: [...store.streaming.images, { filename, url }] });
        }
      }
      break;
    }

    case 'file_output': {
      const filename = (event.filename as string) || '';
      const fileType = (event.file_type as string) || '';
      const sandboxId = (event.sandbox_id as string) || undefined;
      if (filename) {
        const fileEntry = { filename, fileType, sandboxId };
        if (opts.isMulti) {
          opts.updateBranch(bi, (b) => ({ files: [...b.files, fileEntry] }));
        } else {
          store.setStreaming({ files: [...store.streaming.files, fileEntry] });
        }
      }
      break;
    }

    case 'preview':
      store.setPreviewUrl((event.url as string) || '');
      store.setRightPanelTab('preview');
      break;

    case 'title': {
      const title = (event.title as string) || '';
      const convId = store.activeConversationId;
      if (title && convId) store.updateConversationTitle(convId, title);
      break;
    }

    case 'done': {
      const newSandboxId = (event.sandbox_id as string) || null;
      if (newSandboxId) {
        store.setSandboxId(newSandboxId);
        store.setSandboxStatus('running');
      }
      const newLeafId = (event.active_leaf_id as string) || null;
      if (newLeafId) store.setActiveLeafId(newLeafId);

      if (opts.isMulti) {
        const ms = store.multiStreaming;
        if (ms) {
          store.setMultiStreaming({ ...ms, completedBranches: [...ms.completedBranches, bi] });
        }
      } else {
        return {
          finalCost: {
            inputTokens: (event.input_tokens as number) || 0,
            outputTokens: (event.output_tokens as number) || 0,
            totalCost: 0,
            model: opts.activeModel,
            duration: (event.duration_ms as number) || 0,
          },
        };
      }
      break;
    }

    case 'all_done': {
      const newLeafId = (event.active_leaf_id as string) || null;
      if (newLeafId) store.setActiveLeafId(newLeafId);
      return { done: true };
    }

    case 'error':
      if (opts.isMulti) {
        opts.updateBranch(bi, (b) => ({ content: b.content + `\n\n**Error:** ${(event.message as string) || 'Unknown error'}` }));
      } else {
        store.appendStreamingContent(`\n\n**Error:** ${(event.message as string) || 'Unknown error'}`);
      }
      break;
  }

  return {};
}

/** Reload conversation messages and tree from the API */
export async function reloadConversation(conversationId: string): Promise<void> {
  const store = useStore.getState();
  try {
    const conv = await api.getConversation(conversationId);
    const rawMessages = (conv.messages as Array<Record<string, unknown>>) || [];
    store.setMessages(mapRawMessages(rawMessages, conversationId));
    const tree = await api.getConversationTree(conversationId);
    store.setConversationTree(tree);
  } catch {}
  api.listConversations().then((r) => store.setConversations(r.conversations));
}

/** Hook that provides streamSend and streamRegenerate functions */
export function useStreaming() {
  const streamSend = useCallback(async (
    text: string,
    convId: string,
    opts: {
      attachmentIds?: string[];
      model: string;
      parentId?: string;
      numResponses: number;
      contextIds?: string[];
    },
  ) => {
    const store = useStore.getState();
    const controller = new AbortController();
    store.setAbortController(controller);
    store.setIsStreaming(true);
    store.resetStreaming();

    const isMulti = opts.numResponses > 1;

    if (isMulti) {
      const emptyBranch: StreamingState = { content: '', reasoning: '', toolCalls: [], images: [], files: [] };
      store.setMultiStreaming({
        branches: Array.from({ length: opts.numResponses }, () => ({ ...emptyBranch })),
        activeBranchIndex: 0,
        branchCount: opts.numResponses,
        completedBranches: [],
      });
    }

    const updateBranch = (bi: number, updater: (b: StreamingState) => Partial<StreamingState>) => {
      const ms = useStore.getState().multiStreaming;
      if (!ms) return;
      const branches = [...ms.branches];
      branches[bi] = { ...branches[bi], ...updater(branches[bi]) };
      useStore.getState().setMultiStreaming({ ...ms, branches });
    };

    let finalCost: Message['cost'] = undefined;

    try {
      const response = await api.sendMessage(
        convId, text, opts.attachmentIds, opts.model, 'code',
        opts.parentId, opts.numResponses, controller.signal,
        opts.contextIds,
      );
      for await (const event of streamSSE(response)) {
        const result = processSseEvent(
          event as unknown as Record<string, unknown>,
          { isMulti, activeModel: opts.model, updateBranch },
        );
        if (result.finalCost) finalCost = result.finalCost;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User stopped — keep partial content
      } else {
        console.error('Stream error:', err);
        toast.error('Connection lost. Refreshing conversation...');
        // SSE stream recovery: reload conversation state from server
        try {
          await reloadConversation(convId);
        } catch {
          toast.error('Failed to recover conversation state.');
        }
      }
    }

    useStore.getState().setAbortController(null);

    if (isMulti) {
      useStore.getState().setMultiStreaming(null);
      useStore.getState().resetStreaming();
      useStore.getState().setIsStreaming(false);
      await reloadConversation(convId);
    } else {
      // Single response — commit locally
      const finalState = useStore.getState().streaming;
      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        conversationId: convId,
        role: 'assistant',
        content: finalState.content,
        createdAt: new Date().toISOString(),
        reasoning: finalState.reasoning || undefined,
        toolCalls: finalState.toolCalls.length > 0 ? finalState.toolCalls : undefined,
        cost: finalCost,
        images: finalState.images.length > 0 ? [...finalState.images] : undefined,
        files: finalState.files.length > 0 ? [...finalState.files] : undefined,
      };
      useStore.getState().setMessages((prev: Message[]) => [...prev, assistantMsg]);
      useStore.getState().resetStreaming();
      useStore.getState().setIsStreaming(false);

      api.listConversations().then((r) => useStore.getState().setConversations(r.conversations));
      api.getConversationTree(convId).then((tree) => useStore.getState().setConversationTree(tree)).catch(() => {});
    }
  }, []);

  const streamRegenerate = useCallback(async (conversationId: string, messageId: string, model?: string) => {
    const store = useStore.getState();
    if (store.isStreaming) return;

    const controller = new AbortController();
    store.setAbortController(controller);
    store.setIsStreaming(true);
    store.resetStreaming();

    const noopBranch = () => {};

    try {
      const response = await api.regenerateMessage(conversationId, messageId, controller.signal, model);
      for await (const event of streamSSE(response)) {
        processSseEvent(
          event as unknown as Record<string, unknown>,
          { isMulti: false, activeModel: '', updateBranch: noopBranch as never },
        );
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Regenerate stream error:', err);
        toast.error('Connection lost during regeneration. Refreshing...');
        try {
          await reloadConversation(conversationId);
        } catch {
          toast.error('Failed to recover conversation state.');
        }
      }
    }

    useStore.getState().setAbortController(null);
    await reloadConversation(conversationId);
    useStore.getState().resetStreaming();
    useStore.getState().setIsStreaming(false);
  }, []);

  return { streamSend, streamRegenerate };
}
