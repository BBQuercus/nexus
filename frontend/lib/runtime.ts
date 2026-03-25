const LOCAL_API_BASE_URL = 'http://localhost:8000';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getRailwaySiblingApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const { protocol, hostname } = window.location;
  const parts = hostname.split('.');
  if (parts.length < 2) return '';

  const [serviceLabel, ...rest] = parts;
  if (serviceLabel.endsWith('-api')) return '';
  if (!hostname.endsWith('.up.railway.app')) return '';

  return `${protocol}//${serviceLabel}-api.${rest.join('.')}`;
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return trimTrailingSlash(configured);

  if (typeof window !== 'undefined' && ['3000', '5173'].includes(window.location.port)) {
    return LOCAL_API_BASE_URL;
  }

  const derived = getRailwaySiblingApiBaseUrl();
  if (derived) return trimTrailingSlash(derived);

  return '';
}

export function toApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${getApiBaseUrl()}${path}`;
}

export function getWsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (configured) return trimTrailingSlash(configured);

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
