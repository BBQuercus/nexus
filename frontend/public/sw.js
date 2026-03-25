// Nexus Service Worker — app shell and static asset caching only.
// No offline chat or API caching. The app requires network for LLM calls.

const CACHE_NAME = 'nexus-shell-v1';

// Static assets to cache on install for fast revisits
const SHELL_ASSETS = [
  '/',
  '/login',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove old caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only cache GET requests to our own origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API calls, auth endpoints, SSE streams, or WebSocket upgrades
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/health') ||
    url.pathname.startsWith('/ready') ||
    url.pathname.startsWith('/metrics') ||
    request.headers.get('accept')?.includes('text/event-stream') ||
    request.headers.get('upgrade') === 'websocket'
  ) {
    return;
  }

  // For static assets (JS, CSS, images, fonts): cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|svg|ico|jpg|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For navigation (HTML pages): network-first with shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/') || caches.match(request))
    );
    return;
  }
});
