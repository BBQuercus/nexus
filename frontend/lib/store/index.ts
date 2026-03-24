import { create } from 'zustand';
import { DEFAULT_MODEL_ID } from '../types';
import type { StoreState, AppState } from './types';
import { cloneEmptyStreaming, emptyConfirm } from './types';
import { createSessionSlice } from './session-slice';
import { createConversationSlice } from './conversation-slice';
import { createStreamingSlice } from './streaming-slice';
import { createComposerSlice } from './composer-slice';
import { createWorkspaceSlice } from './workspace-slice';
import { createArtifactsSlice } from './artifacts-slice';
import { createBranchingSlice } from './branching-slice';

// Re-export all types for backwards compatibility
export type { StreamingImage, StreamingFile, StreamingState, MultiStreamingState, ConfirmState, AppState, AppActions } from './types';

// Restore persisted state from localStorage
function getPersistedState(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  try {
    const convId = localStorage.getItem('nexus:activeConversationId');
    const model = localStorage.getItem('nexus:activeModel');
    const projectId = localStorage.getItem('nexus:activeProjectId');
    return {
      ...(convId ? { activeConversationId: convId } : {}),
      ...(model ? { activeModel: model } : {}),
      ...(projectId ? { activeProjectId: projectId } : {}),
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
  projects: [],
  activeProjectId: null,
  searchPanelOpen: false,
};

export const useStore = create<StoreState>((...args) => {
  const [set] = args;
  return {
    ...createSessionSlice(...args),
    ...createConversationSlice(...args),
    ...createStreamingSlice(...args),
    ...createComposerSlice(...args),
    ...createWorkspaceSlice(...args),
    ...createArtifactsSlice(...args),
    ...createBranchingSlice(...args),
    ...getPersistedState(),
    reset: () => {
      try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
      set(initialState);
    },
  };
});
