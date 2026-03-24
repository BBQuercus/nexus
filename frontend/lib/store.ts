import { create } from 'zustand';
import type { User, Conversation, Message, Artifact, AgentPersona, ToolCall, ConversationTree, Citation, RetrievalResult, KnowledgeBase, StreamingTable, StreamingChart } from './types';
import { DEFAULT_MODEL_ID } from './types';

export interface StreamingImage {
  filename: string;
  url: string;
}

export interface StreamingFile {
  filename: string;
  fileType: string;
  sandboxId?: string;
}

export interface StreamingState {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  images: StreamingImage[];
  files: StreamingFile[];
  tables: StreamingTable[];
  charts: StreamingChart[];
  citations: Citation[];
  retrievalResult: RetrievalResult | null;
}

export interface MultiStreamingState {
  branches: StreamingState[];
  activeBranchIndex: number;
  branchCount: number;
  completedBranches: number[];
  branchModels?: string[];
}

export interface ConfirmState {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  resolve: ((confirmed: boolean) => void) | null;
}

export interface AppState {
  user: User | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  messagesByConversation: Record<string, Message[]>;
  activeModel: string;
  activePersona: AgentPersona | null;
  sandboxStatus: 'none' | 'creating' | 'running' | 'stopped';
  sandboxId: string | null;
  rightPanelTab: 'terminal' | 'files' | 'preview' | 'artifacts' | 'tree' | 'sources';
  activeLeafId: string | null;
  conversationTree: ConversationTree | null;
  branchingFromId: string | null;
  multiStreaming: MultiStreamingState | null;
  sidebarOpen: boolean;
  abortController: AbortController | null;
  abortControllersByConversation: Record<string, AbortController | null>;
  commandPaletteOpen: boolean;
  isStreaming: boolean;
  streamingConversationIds: string[];
  streaming: StreamingState;
  streamingByConversation: Record<string, StreamingState>;
  multiStreamingByConversation: Record<string, MultiStreamingState | null>;
  artifacts: Artifact[];
  rightPanelOpen: boolean;
  previewUrl: string | null;
  pendingPrompt: string | null;
  confirmDialog: ConfirmState;
  activeKnowledgeBaseIds: string[];
  diffView: { columns: { label: string; content: string }[] } | null;
}

export interface AppActions {
  setUser: (user: User | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setConversationMessages: (conversationId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setActiveModel: (model: string) => void;
  setActivePersona: (persona: AgentPersona | null) => void;
  setSandboxStatus: (status: AppState['sandboxStatus']) => void;
  setSandboxId: (id: string | null) => void;
  setRightPanelTab: (tab: AppState['rightPanelTab']) => void;
  setActiveLeafId: (id: string | null) => void;
  setConversationTree: (tree: ConversationTree | null) => void;
  setBranchingFromId: (id: string | null) => void;
  setMultiStreaming: (state: MultiStreamingState | null) => void;
  setConversationMultiStreaming: (conversationId: string, state: MultiStreamingState | null) => void;
  setActiveBranchView: (index: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  setConversationAbortController: (conversationId: string, controller: AbortController | null) => void;
  abortStreaming: (conversationId?: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setConversationIsStreaming: (conversationId: string, streaming: boolean) => void;
  setStreaming: (streaming: Partial<StreamingState>) => void;
  setConversationStreaming: (conversationId: string, streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  resetConversationStreaming: (conversationId: string) => void;
  appendStreamingContent: (text: string) => void;
  appendConversationStreamingContent: (conversationId: string, text: string) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  setRightPanelOpen: (open: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setPendingPrompt: (prompt: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
  showConfirm: (opts: { title: string; message?: string; confirmLabel?: string; variant?: 'danger' | 'default' }) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
  setActiveKnowledgeBaseIds: (ids: string[]) => void;
  toggleKnowledgeBase: (id: string) => void;
  setDiffView: (diff: AppState['diffView']) => void;
  reset: () => void;
}

const emptyStreaming: StreamingState = { content: '', reasoning: '', toolCalls: [], images: [], files: [], tables: [], charts: [], citations: [], retrievalResult: null };

// Restore persisted state from localStorage
function getPersistedState(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  try {
    const convId = localStorage.getItem('nexus:activeConversationId');
    const model = localStorage.getItem('nexus:activeModel');
    return {
      ...(convId ? { activeConversationId: convId } : {}),
      ...(model ? { activeModel: model } : {}),
    };
  } catch {
    return {};
  }
}

const emptyConfirm: ConfirmState = { open: false, title: '', resolve: null };

function cloneEmptyStreaming(): StreamingState {
  return {
    content: '',
    reasoning: '',
    toolCalls: [],
    images: [],
    files: [],
    tables: [],
    charts: [],
    citations: [],
    retrievalResult: null,
  };
}

const initialState: AppState = {
  user: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesByConversation: {},
  activeModel: DEFAULT_MODEL_ID,
  activePersona: null,
  sandboxStatus: 'none',
  sandboxId: null,
  rightPanelTab: 'terminal',
  activeLeafId: null,
  conversationTree: null,
  branchingFromId: null,
  multiStreaming: null,
  sidebarOpen: true,
  abortController: null,
  abortControllersByConversation: {},
  commandPaletteOpen: false,
  isStreaming: false,
  streamingConversationIds: [],
  streaming: cloneEmptyStreaming(),
  streamingByConversation: {},
  multiStreamingByConversation: {},
  artifacts: [],
  rightPanelOpen: false,
  previewUrl: null,
  pendingPrompt: null,
  confirmDialog: { ...emptyConfirm },
  activeKnowledgeBaseIds: [],
  diffView: null,
};

export const useStore = create<AppState & AppActions>((set) => ({
  ...initialState,
  ...getPersistedState(),
  setUser: (user) => set({ user }),
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
  setActiveModel: (model) => {
    try { localStorage.setItem('nexus:activeModel', model); } catch {}
    set({ activeModel: model });
  },
  setActivePersona: (persona) => set({ activePersona: persona }),
  setSandboxStatus: (status) => set({ sandboxStatus: status }),
  setSandboxId: (id) => set({ sandboxId: id }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setActiveLeafId: (id) => set({ activeLeafId: id }),
  setConversationTree: (tree) => set({ conversationTree: tree }),
  setBranchingFromId: (id) => set({ branchingFromId: id }),
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
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
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
    const targetId = conversationId || useStore.getState().activeConversationId;
    if (!targetId) return;
    const { abortControllersByConversation, activeConversationId, streamingConversationIds } = useStore.getState();
    const abortController = abortControllersByConversation[targetId];
    if (abortController) abortController.abort();
    set({
      abortControllersByConversation: { ...abortControllersByConversation, [targetId]: null },
      streamingConversationIds: streamingConversationIds.filter((id) => id !== targetId),
      ...(activeConversationId === targetId ? { abortController: null, isStreaming: false } : {}),
    });
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
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
  setArtifacts: (artifacts) => set({ artifacts }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
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
      // Persist pinned IDs to localStorage
      const pinnedIds = updated.filter((c) => c.pinned).map((c) => c.id);
      try { localStorage.setItem('nexus:pinnedConversations', JSON.stringify(pinnedIds)); } catch {}
      return { conversations: updated };
    });
  },
  showConfirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        confirmDialog: {
          open: true,
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel,
          variant: opts.variant,
          resolve,
        },
      });
    }),
  resolveConfirm: (confirmed) => {
    const { confirmDialog } = useStore.getState();
    if (confirmDialog.resolve) confirmDialog.resolve(confirmed);
    set({ confirmDialog: { ...emptyConfirm } });
  },
  setActiveKnowledgeBaseIds: (ids) => set({ activeKnowledgeBaseIds: ids }),
  toggleKnowledgeBase: (id) => set((state) => {
    const ids = state.activeKnowledgeBaseIds;
    return {
      activeKnowledgeBaseIds: ids.includes(id)
        ? ids.filter((k) => k !== id)
        : [...ids, id],
    };
  }),
  setDiffView: (diff) => set({ diffView: diff }),
  reset: () => {
    try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
    set(initialState);
  },
}));
