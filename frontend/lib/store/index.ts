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
function getPersistedState(): Pick<AppState, 'activeConversationId' | 'activeModel' | 'activeProjectId'> {
  const defaults = { activeConversationId: null as string | null, activeModel: DEFAULT_MODEL_ID, activeProjectId: null as string | null };
  if (typeof window === 'undefined') return defaults;
  try {
    const convId = localStorage.getItem('nexus:activeConversationId');
    const model = localStorage.getItem('nexus:activeModel');
    const projectId = localStorage.getItem('nexus:activeProjectId');
    return {
      activeConversationId: convId ?? null,
      activeModel: model ?? DEFAULT_MODEL_ID,
      activeProjectId: projectId ?? null,
    };
  } catch {
    return defaults;
  }
}

const initialState: AppState = {
  user: null,
  authStatus: 'loading',
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
  currentOrg: null,
  memberships: [],
};

export const useStore = create<StoreState>((...args) => {
  const [set, get] = args;
  return {
    ...createSessionSlice(...args),
    ...createConversationSlice(...args),
    ...createStreamingSlice(...args),
    ...createComposerSlice(...args),
    ...createWorkspaceSlice(...args),
    ...createArtifactsSlice(...args),
    ...createBranchingSlice(...args),
    ...getPersistedState(),
    currentOrg: null,
    memberships: [],
    setCurrentOrg: (org) => set({ currentOrg: org }),
    setMemberships: (memberships) => set({ memberships }),
    switchOrg: async (orgId: string) => {
      const { switchOrg: apiSwitchOrg } = await import('../api');
      await apiSwitchOrg(orgId);
      // Find the target org in memberships
      const membership = get().memberships.find((m) => m.orgId === orgId);
      if (membership) {
        set({
          currentOrg: {
            id: membership.orgId,
            name: membership.orgName,
            slug: membership.orgSlug,
            settings: {},
          },
        });
      }
      // Clear all org-scoped state
      set({
        conversations: [],
        activeConversationId: null,
        messages: [],
        messagesByConversation: {},
        projects: [],
        activeProjectId: null,
        artifacts: [],
        streaming: cloneEmptyStreaming(),
        streamingByConversation: {},
        multiStreamingByConversation: {},
        streamingConversationIds: [],
        isStreaming: false,
        searchPanelOpen: false,
      });
      try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
      try { localStorage.removeItem('nexus:activeProjectId'); } catch {}
      // Re-fetch user to get fresh org context
      const { getCurrentUser } = await import('../api');
      const user = await getCurrentUser();
      set({ user, currentOrg: user.currentOrg || null, memberships: user.memberships || [] });
    },
    reset: () => {
      try { localStorage.removeItem('nexus:activeConversationId'); } catch {}
      set(initialState);
    },
  };
});
