// ============================================================
// Auth Flow
// ============================================================

import { getCurrentUser } from './services/api';
import { logout as apiLogout } from './services/api';
import { setState, resetState } from './state';
import type { User } from './state';

export async function checkAuth(): Promise<User | null> {
  try {
    const user = await getCurrentUser();
    setState({ user });
    return user;
  } catch {
    setState({ user: null });
    return null;
  }
}

export function login(): void {
  const base = import.meta.env.VITE_API_BASE || '';
  window.location.href = `${base}/auth/login`;
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } catch {
    // Ignore errors during logout
  }
  resetState();
  window.location.hash = '#/login';
}

export function handleCallback(): void {
  // The backend handles the OAuth callback and redirects to the frontend.
  // If we land here, redirect to workspace.
  window.location.hash = '#/';
}
