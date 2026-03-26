const LOCAL_API_BASE_URL = 'http://localhost:8000';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && ['3000', '5173'].includes(window.location.port)) {
    return LOCAL_API_BASE_URL;
  }

  return '';
}

export function toApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${getApiBaseUrl()}${path}`;
}

export function getWsBaseUrl(): string {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return trimTrailingSlash(url.toString());
  }

  if (typeof window === 'undefined') return '';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}
