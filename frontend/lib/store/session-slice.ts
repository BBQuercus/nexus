import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import type { User } from '../types';

export interface SessionSlice {
  user: User | null;
  sidebarOpen: boolean;
  setUser: (user: User | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const createSessionSlice: StateCreator<StoreState, [], [], SessionSlice> = (set) => ({
  user: null,
  sidebarOpen: true,
  setUser: (user) => set({ user }),
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
});
