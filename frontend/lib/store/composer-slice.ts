import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import type { AgentPersona } from '../types';
import { DEFAULT_MODEL_ID } from '../types';

export interface ComposerSlice {
  pendingPrompt: string | null;
  activeModel: string;
  activePersona: AgentPersona | null;
  activeKnowledgeBaseIds: string[];
  setPendingPrompt: (prompt: string | null) => void;
  setActiveModel: (model: string) => void;
  setActivePersona: (persona: AgentPersona | null) => void;
  setActiveKnowledgeBaseIds: (ids: string[]) => void;
  toggleKnowledgeBase: (id: string) => void;
}

export const createComposerSlice: StateCreator<StoreState, [], [], ComposerSlice> = (set) => ({
  pendingPrompt: null,
  activeModel: DEFAULT_MODEL_ID,
  activePersona: null,
  activeKnowledgeBaseIds: [],
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
  setActiveModel: (model) => {
    try { localStorage.setItem('nexus:activeModel', model); } catch {}
    set({ activeModel: model });
  },
  setActivePersona: (persona) => set({ activePersona: persona }),
  setActiveKnowledgeBaseIds: (ids) => set({ activeKnowledgeBaseIds: ids }),
  toggleKnowledgeBase: (id) => set((state) => {
    const ids = state.activeKnowledgeBaseIds;
    return {
      activeKnowledgeBaseIds: ids.includes(id)
        ? ids.filter((k) => k !== id)
        : [...ids, id],
    };
  }),
});
