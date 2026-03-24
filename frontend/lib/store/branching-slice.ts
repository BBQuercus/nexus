import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import type { ConversationTree } from '../types';

export interface BranchingSlice {
  conversationTree: ConversationTree | null;
  activeLeafId: string | null;
  branchingFromId: string | null;
  setConversationTree: (tree: ConversationTree | null) => void;
  setActiveLeafId: (id: string | null) => void;
  setBranchingFromId: (id: string | null) => void;
}

export const createBranchingSlice: StateCreator<StoreState, [], [], BranchingSlice> = (set) => ({
  conversationTree: null,
  activeLeafId: null,
  branchingFromId: null,
  setConversationTree: (tree) => set({ conversationTree: tree }),
  setActiveLeafId: (id) => set({ activeLeafId: id }),
  setBranchingFromId: (id) => set({ branchingFromId: id }),
});
