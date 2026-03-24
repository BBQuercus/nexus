import type { StateCreator } from 'zustand';
import type { StoreState, StreamingState, MultiStreamingState } from './types';
import { cloneEmptyStreaming } from './types';

export interface StreamingSlice {
  streaming: StreamingState;
  streamingByConversation: Record<string, StreamingState>;
  streamingConversationIds: string[];
  multiStreaming: MultiStreamingState | null;
  multiStreamingByConversation: Record<string, MultiStreamingState | null>;
  abortController: AbortController | null;
  abortControllersByConversation: Record<string, AbortController | null>;
  isStreaming: boolean;
  setStreaming: (streaming: Partial<StreamingState>) => void;
  setConversationStreaming: (conversationId: string, streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  resetConversationStreaming: (conversationId: string) => void;
  appendStreamingContent: (text: string) => void;
  appendConversationStreamingContent: (conversationId: string, text: string) => void;
  setMultiStreaming: (state: MultiStreamingState | null) => void;
  setConversationMultiStreaming: (conversationId: string, state: MultiStreamingState | null) => void;
  setActiveBranchView: (index: number) => void;
  setAbortController: (controller: AbortController | null) => void;
  setConversationAbortController: (conversationId: string, controller: AbortController | null) => void;
  abortStreaming: (conversationId?: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setConversationIsStreaming: (conversationId: string, streaming: boolean) => void;
}

export const createStreamingSlice: StateCreator<StoreState, [], [], StreamingSlice> = (set, get) => ({
  streaming: cloneEmptyStreaming(),
  streamingByConversation: {},
  streamingConversationIds: [],
  multiStreaming: null,
  multiStreamingByConversation: {},
  abortController: null,
  abortControllersByConversation: {},
  isStreaming: false,
  setStreaming: (partial) => set((state) => ({
    streaming: { ...state.streaming, ...partial },
    streamingByConversation: state.activeConversationId
      ? {
          ...state.streamingByConversation,
          [state.activeConversationId]: {
            ...(state.streamingByConversation[state.activeConversationId] || cloneEmptyStreaming()),
            ...partial,
          },
        }
      : state.streamingByConversation,
  })),
  setConversationStreaming: (conversationId, partial) => set((state) => {
    const next = {
      ...(state.streamingByConversation[conversationId] || cloneEmptyStreaming()),
      ...partial,
    };
    return {
      streamingByConversation: {
        ...state.streamingByConversation,
        [conversationId]: next,
      },
      ...(state.activeConversationId === conversationId ? { streaming: next } : {}),
    };
  }),
  resetStreaming: () => set((state) => ({
    streaming: cloneEmptyStreaming(),
    streamingByConversation: state.activeConversationId
      ? { ...state.streamingByConversation, [state.activeConversationId]: cloneEmptyStreaming() }
      : state.streamingByConversation,
  })),
  resetConversationStreaming: (conversationId) => set((state) => ({
    streamingByConversation: {
      ...state.streamingByConversation,
      [conversationId]: cloneEmptyStreaming(),
    },
    ...(state.activeConversationId === conversationId ? { streaming: cloneEmptyStreaming() } : {}),
  })),
  appendStreamingContent: (text) => set((state) => ({
    streaming: { ...state.streaming, content: state.streaming.content + text },
    streamingByConversation: state.activeConversationId
      ? {
          ...state.streamingByConversation,
          [state.activeConversationId]: {
            ...(state.streamingByConversation[state.activeConversationId] || cloneEmptyStreaming()),
            content: (state.streamingByConversation[state.activeConversationId]?.content || '') + text,
          },
        }
      : state.streamingByConversation,
  })),
  appendConversationStreamingContent: (conversationId, text) => set((state) => {
    const prev = state.streamingByConversation[conversationId] || cloneEmptyStreaming();
    const next = { ...prev, content: prev.content + text };
    return {
      streamingByConversation: {
        ...state.streamingByConversation,
        [conversationId]: next,
      },
      ...(state.activeConversationId === conversationId ? { streaming: next } : {}),
    };
  }),
  setMultiStreaming: (multiStreaming) => set((state) => ({
    multiStreaming,
    multiStreamingByConversation: state.activeConversationId
      ? { ...state.multiStreamingByConversation, [state.activeConversationId]: multiStreaming }
      : state.multiStreamingByConversation,
  })),
  setConversationMultiStreaming: (conversationId, multiStreaming) => set((state) => ({
    multiStreamingByConversation: {
      ...state.multiStreamingByConversation,
      [conversationId]: multiStreaming,
    },
    ...(state.activeConversationId === conversationId ? { multiStreaming } : {}),
  })),
  setActiveBranchView: (index) => set((state) => ({
    multiStreaming: state.multiStreaming ? { ...state.multiStreaming, activeBranchIndex: index } : null,
    multiStreamingByConversation: state.activeConversationId && state.multiStreaming
      ? {
          ...state.multiStreamingByConversation,
          [state.activeConversationId]: { ...state.multiStreaming, activeBranchIndex: index },
        }
      : state.multiStreamingByConversation,
  })),
  setAbortController: (controller) => set((state) => ({
    abortController: controller,
    abortControllersByConversation: state.activeConversationId
      ? { ...state.abortControllersByConversation, [state.activeConversationId]: controller }
      : state.abortControllersByConversation,
  })),
  setConversationAbortController: (conversationId, controller) => set((state) => ({
    abortControllersByConversation: {
      ...state.abortControllersByConversation,
      [conversationId]: controller,
    },
    ...(state.activeConversationId === conversationId ? { abortController: controller } : {}),
  })),
  abortStreaming: (conversationId) => {
    const state = get();
    const targetId = conversationId || state.activeConversationId;
    if (!targetId) return;
    const { abortControllersByConversation, activeConversationId, streamingConversationIds } = state;
    const abortController = abortControllersByConversation[targetId];
    if (abortController) abortController.abort();
    set({
      abortControllersByConversation: { ...abortControllersByConversation, [targetId]: null },
      streamingConversationIds: streamingConversationIds.filter((id) => id !== targetId),
      ...(activeConversationId === targetId ? { abortController: null, isStreaming: false } : {}),
    });
  },
  setIsStreaming: (streaming) => set((state) => {
    const activeId = state.activeConversationId;
    const nextIds = activeId
      ? (streaming
          ? Array.from(new Set([...state.streamingConversationIds, activeId]))
          : state.streamingConversationIds.filter((id) => id !== activeId))
      : state.streamingConversationIds;
    return {
      isStreaming: streaming,
      streamingConversationIds: nextIds,
    };
  }),
  setConversationIsStreaming: (conversationId, streaming) => set((state) => {
    const nextIds = streaming
      ? Array.from(new Set([...state.streamingConversationIds, conversationId]))
      : state.streamingConversationIds.filter((id) => id !== conversationId);
    return {
      streamingConversationIds: nextIds,
      ...(state.activeConversationId === conversationId ? { isStreaming: streaming } : {}),
    };
  }),
});
