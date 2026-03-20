// ============================================================
// Auth Flow
// ============================================================

import { getCurrentUser } from './services/api';
import { logout as apiLogout } from './services/api';
import { setState, resetState } from './state';
import type { User } from './state';

const TOKEN_KEY = 'nexus_session';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function checkAuth(): Promise<User | null> {
  const token = getToken();
  if (!token) {
    setState({ user: null });
    return null;
  }
  try {
    const user = await getCurrentUser();
    setState({ user });
    return user;
  } catch {
    clearToken();
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
  clearToken();
  resetState();
  window.location.hash = '#/login';
}

export function handleCallback(): void {
  // Extract token from URL: #/auth/callback?token=...
  const hash = window.location.hash;
  const match = hash.match(/[?&]token=([^&]+)/);
  if (match) {
    setToken(decodeURIComponent(match[1]));
    // Clean up URL
    window.location.hash = '#/';
  } else {
    window.location.hash = '#/login';
  }
}
