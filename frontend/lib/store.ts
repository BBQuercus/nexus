import { create } from 'zustand';
import type { User, Conversation, Message, Artifact, AgentPersona, AgentMode, ToolCall, ConversationTree } from './types';

export interface StreamingImage {
  filename: string;
  url: string;
}

export interface StreamingState {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  images: StreamingImage[];
}

export interface MultiStreamingState {
  branches: StreamingState[];
  activeBranchIndex: number;
  branchCount: number;
  completedBranches: number[];
}

export interface AppState {
  user: User | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  activeModel: string;
  activeMode: AgentMode;
  activePersona: AgentPersona | null;
  sandboxStatus: 'none' | 'creating' | 'running' | 'stopped';
  sandboxId: string | null;
  rightPanelTab: 'terminal' | 'files' | 'preview' | 'artifacts' | 'tree';
  activeLeafId: string | null;
  conversationTree: ConversationTree | null;
  branchingFromId: string | null;
  multiStreaming: MultiStreamingState | null;
  commandPaletteOpen: boolean;
  isStreaming: boolean;
  streaming: StreamingState;
  artifacts: Artifact[];
  rightPanelOpen: boolean;
  previewUrl: string | null;
  pendingPrompt: string | null;
}

export interface AppActions {
  setUser: (user: User | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setActiveModel: (model: string) => void;
  setActiveMode: (mode: AgentMode) => void;
  setActivePersona: (persona: AgentPersona | null) => void;
  setSandboxStatus: (status: AppState['sandboxStatus']) => void;
  setSandboxId: (id: string | null) => void;
  setRightPanelTab: (tab: AppState['rightPanelTab']) => void;
  setActiveLeafId: (id: string | null) => void;
  setConversationTree: (tree: ConversationTree | null) => void;
  setBranchingFromId: (id: string | null) => void;
  setMultiStreaming: (state: MultiStreamingState | null) => void;
  setActiveBranchView: (index: number) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreaming: (streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  appendStreamingContent: (text: string) => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  setRightPanelOpen: (open: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setPendingPrompt: (prompt: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  reset: () => void;
}

const emptyStreaming: StreamingState = { content: '', reasoning: '', toolCalls: [], images: [] };

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

const initialState: AppState = {
  user: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  activeModel: 'azure_ai/claude-sonnet-4-5-swc',
  activeMode: 'code',
  activePersona: null,
  sandboxStatus: 'none',
  sandboxId: null,
  rightPanelTab: 'terminal',
  activeLeafId: null,
  conversationTree: null,
  branchingFromId: null,
  multiStreaming: null,
  commandPaletteOpen: false,
  isStreaming: false,
  streaming: { ...emptyStreaming },
  artifacts: [],
  rightPanelOpen: false,
  previewUrl: null,
  pendingPrompt: null,
};

export const useStore = create<AppState & AppActions>((set) => ({
  ...initialState,
  ...getPersistedState(),
  setUser: (user) => set({ user }),
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => {
    try { if (id) localStorage.setItem('nexus:activeConversationId', id); else localStorage.removeItem('nexus:activeConversationId'); } catch {}
    set({ activeConversationId: id });
  },
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    })),
  setActiveModel: (model) => {
    try { localStorage.setItem('nexus:activeModel', model); } catch {}
    set({ activeModel: model });
  },
  setActiveMode: (mode) => set({ activeMode: mode }),
  setActivePersona: (persona) => set({ activePersona: persona }),
  setSandboxStatus: (status) => set({ sandboxStatus: status }),
  setSandboxId: (id) => set({ sandboxId: id }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setActiveLeafId: (id) => set({ activeLeafId: id }),
  setConversationTree: (tree) => set({ conversationTree: tree }),
  setBranchingFromId: (id) => set({ branchingFromId: id }),
  setMultiStreaming: (state) => set({ multiStreaming: state }),
  setActiveBranchView: (index) => set((state) => ({
    multiStreaming: state.multiStreaming ? { ...state.multiStreaming, activeBranchIndex: index } : null,
  })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreaming: (partial) => set((state) => ({ streaming: { ...state.streaming, ...partial } })),
  resetStreaming: () => set({ streaming: { ...emptyStreaming } }),
  appendStreamingContent: (text) => set((state) => ({
    streaming: { ...state.streaming, content: state.streaming.content + text },
  })),
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
  reset: () => {
    try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
    set(initialState);
  },
}));
