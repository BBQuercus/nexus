import type { User, Conversation, Message, Artifact, AgentPersona, ToolCall, ConversationTree, Citation, RetrievalResult, KnowledgeBase, StreamingTable, StreamingChart, Project } from '../types';

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
  projects: Project[];
  activeProjectId: string | null;
  searchPanelOpen: boolean;
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
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
  setSearchPanelOpen: (open: boolean) => void;
  reset: () => void;
}

export type StoreState = AppState & AppActions;

export function cloneEmptyStreaming(): StreamingState {
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

export const emptyConfirm: ConfirmState = { open: false, title: '', resolve: null };
