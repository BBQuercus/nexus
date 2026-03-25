import type { StateCreator } from 'zustand';
import type { StoreState } from './types';
import type { User } from '../types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionSlice {
  user: User | null;
  authStatus: AuthStatus;
  sidebarOpen: boolean;
  setUser: (user: User | null) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const createSessionSlice: StateCreator<StoreState, [], [], SessionSlice> = (set) => ({
  user: null,
  authStatus: 'loading',
  sidebarOpen: true,
  setUser: (user) => set({ user }),
  setAuthStatus: (authStatus) => set({ authStatus }),
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
});
