import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import { cloneEmptyStreaming } from './types';
import type { Conversation, Message } from '../types';

export interface ConversationSlice {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  messagesByConversation: Record<string, Message[]>;
  sandboxStatus: 'none' | 'creating' | 'running' | 'stopped';
  sandboxId: string | null;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setConversationMessages: (conversationId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setSandboxStatus: (status: 'none' | 'creating' | 'running' | 'stopped') => void;
  setSandboxId: (id: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
  removeConversation: (id: string) => void;
}

export const createConversationSlice: StateCreator<StoreState, [], [], ConversationSlice> = (set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesByConversation: {},
  sandboxStatus: 'none',
  sandboxId: null,
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => {
    try { if (id) localStorage.setItem('nexus:activeConversationId', id); else localStorage.removeItem('nexus:activeConversationId'); } catch {}
    set((state) => ({
      activeConversationId: id,
      messages: id ? (state.messagesByConversation[id] || []) : [],
      sandboxStatus: 'none',
      sandboxId: null,
      activeLeafId: null,
      conversationTree: null,
      artifacts: [],
      previewUrl: null,
      abortController: id ? (state.abortControllersByConversation[id] || null) : null,
      isStreaming: id ? state.streamingConversationIds.includes(id) : false,
      streaming: id ? (state.streamingByConversation[id] || cloneEmptyStreaming()) : cloneEmptyStreaming(),
      multiStreaming: id ? (state.multiStreamingByConversation[id] || null) : null,
    }));
  },
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
      messagesByConversation: state.activeConversationId
        ? {
            ...state.messagesByConversation,
            [state.activeConversationId]: typeof messages === 'function'
              ? messages(state.messagesByConversation[state.activeConversationId] || [])
              : messages,
          }
        : state.messagesByConversation,
    })),
  setConversationMessages: (conversationId, messages) =>
    set((state) => {
      const prev = state.messagesByConversation[conversationId] || [];
      const next = typeof messages === 'function' ? messages(prev) : messages;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: next,
        },
        ...(state.activeConversationId === conversationId ? { messages: next } : {}),
      };
    }),
  setSandboxStatus: (status) => set({ sandboxStatus: status }),
  setSandboxId: (id) => set({ sandboxId: id }),
  updateConversationTitle: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    })),
  togglePinConversation: (id) => {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
      );
      const pinnedIds = updated.filter((c) => c.pinned).map((c) => c.id);
      try { localStorage.setItem('nexus:pinnedConversations', JSON.stringify(pinnedIds)); } catch {}
      return { conversations: updated };
    });
  },
  removeConversation: (id) =>
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id);
      const messagesByConversation = { ...state.messagesByConversation };
      delete messagesByConversation[id];

      return {
        conversations,
        messagesByConversation,
        ...(state.activeConversationId === id
          ? {
              activeConversationId: null,
              messages: [],
              sandboxStatus: 'none',
              sandboxId: null,
              activeLeafId: null,
              conversationTree: null,
              artifacts: [],
              previewUrl: null,
              abortController: null,
              isStreaming: false,
              streaming: cloneEmptyStreaming(),
              multiStreaming: null,
            }
          : {}),
      };
    }),
});
