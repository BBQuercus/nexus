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

const DESKTOP_MIN_WIDTH = 1280;

export const createSessionSlice: StateCreator<StoreState, [], [], SessionSlice> = (set) => ({
  user: null,
  authStatus: 'loading',
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_MIN_WIDTH : true,
  setUser: (user) => set({ user }),
  setAuthStatus: (authStatus) => set({ authStatus }),
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
});
