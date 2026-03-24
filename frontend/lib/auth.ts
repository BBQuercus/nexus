const TOKEN_KEY = 'nexus_session';
const REFRESH_TOKEN_KEY = 'nexus_refresh_token';

export function getToken(): string | null {
  return null;
}

export function setToken(_token: string): void {
}

export function getRefreshToken(): string | null {
  return null;
}

export function setRefreshToken(_token: string): void {
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getLoginUrl(): string {
  return '/auth/login';
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
    const base = typeof window !== 'undefined' && window.location.port === '5173'
      ? 'http://localhost:8000'
      : '';
    const csrfToken = getCsrfToken();
    const resp = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      credentials: 'include',
    });

    if (!resp.ok) {
      clearToken();
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
