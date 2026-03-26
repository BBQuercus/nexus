import { toApiUrl } from './runtime';

export type OAuthProvider = 'microsoft' | 'github';
export type AuthProvider = OAuthProvider | 'password';

export function getLoginUrl(provider?: OAuthProvider): string {
  if (provider) {
    return toApiUrl(`/auth/login?provider=${provider}`);
  }
  return toApiUrl('/auth/login');
}

export function getLastProvider(): AuthProvider | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/nexus_provider=([^;]+)/);
  const value = match?.[1];
  if (value === 'microsoft' || value === 'github' || value === 'password') return value;
  return null;
}

export function setLastProvider(provider: AuthProvider): void {
  if (typeof document === 'undefined') return;
  // 1 year expiry
  document.cookie = `nexus_provider=${provider};path=/;max-age=${365 * 86400};samesite=lax`;
}

export function clearLastProvider(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'nexus_provider=;path=/;max-age=0;samesite=lax';
}

export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  return csrfMatch?.[1] || null;
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Returns true on success, false on failure.
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const csrfToken = getCsrfToken();
    const resp = await fetch(toApiUrl('/auth/refresh'), {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      credentials: 'include',
    });

    if (!resp.ok) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

let _refreshTimer: ReturnType<typeof setInterval> | null = null;
let _onSessionExpiringSoon: (() => void) | null = null;

/**
 * Start a background timer that refreshes the token before it expires
 * and warns the user when the session is about to expire.
 */
export function startTokenRefreshTimer(onExpiringSoon?: () => void): void {
  if (typeof window === 'undefined') return;
  _onSessionExpiringSoon = onExpiringSoon || null;

  // Clear any existing timer
  if (_refreshTimer) clearInterval(_refreshTimer);

  _refreshTimer = setInterval(async () => {
    const success = await refreshAccessToken();
    if (!success && _onSessionExpiringSoon) {
      _onSessionExpiringSoon();
    }
  }, 30 * 60_000);
}

export function stopTokenRefreshTimer(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
