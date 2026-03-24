const TOKEN_KEY = 'nexus_session';
const REFRESH_TOKEN_KEY = 'nexus_refresh_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getLoginUrl(): string {
  return '/auth/login';
}

/**
 * Decode JWT payload without verification (just for client-side expiry checks).
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get seconds until the access token expires. Returns -1 if no token or can't decode.
 */
export function getTokenExpirySeconds(): number {
  const token = getToken();
  if (!token) return -1;
  const payload = decodePayload(token);
  if (!payload || typeof payload.exp !== 'number') return -1;
  return payload.exp - Math.floor(Date.now() / 1000);
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Returns true on success, false on failure.
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    // Hit backend directly
    const base = typeof window !== 'undefined' && window.location.port === '5173'
      ? 'http://localhost:8000'
      : '';
    const resp = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!resp.ok) {
      // Refresh failed — clear tokens
      clearToken();
      return false;
    }

    const data = await resp.json();
    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
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
    const secondsLeft = getTokenExpirySeconds();
    if (secondsLeft < 0) return; // No token

    // Refresh when <5 minutes remaining
    if (secondsLeft < 300 && secondsLeft > 0) {
      const success = await refreshAccessToken();
      if (!success && _onSessionExpiringSoon) {
        _onSessionExpiringSoon();
      }
    }
  }, 30_000); // Check every 30 seconds
}

export function stopTokenRefreshTimer(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
