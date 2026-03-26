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
 * Returns the new expiry (seconds from now) on success, or null on failure.
 */
export async function refreshAccessToken(): Promise<number | null> {
  try {
    const csrfToken = getCsrfToken();
    const resp = await fetch(toApiUrl('/auth/refresh'), {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      credentials: 'include',
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    return data.expires_in ?? null;
  } catch {
    return null;
  }
}

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

// Margin before expiry to trigger refresh (2 minutes)
const REFRESH_MARGIN_S = 120;

/**
 * Schedule a token refresh based on the backend-reported expiry time.
 * Falls back to 30 minutes if no expiry is provided.
 */
export function startTokenRefreshTimer(expiresInSeconds?: number): void {
  if (typeof window === 'undefined') return;

  if (_refreshTimer) clearTimeout(_refreshTimer);

  const delay = expiresInSeconds
    ? Math.max(10, expiresInSeconds - REFRESH_MARGIN_S) * 1000
    : 30 * 60_000;

  _refreshTimer = setTimeout(async () => {
    const newExpiry = await refreshAccessToken();
    if (newExpiry) {
      startTokenRefreshTimer(newExpiry);
    }
    // If refresh fails, don't retry — the next API call will get a 401
    // and attempt a silent refresh there.
  }, delay);
}

export function stopTokenRefreshTimer(): void {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
}
