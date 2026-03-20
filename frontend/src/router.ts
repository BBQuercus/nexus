// ============================================================
// Simple Hash-based SPA Router
// ============================================================

export interface Route {
  path: string;
  render: (container: HTMLElement) => void | Promise<void>;
}

const routes: Route[] = [];
let currentPath = '';
let appContainer: HTMLElement | null = null;

export function registerRoute(path: string, render: (container: HTMLElement) => void | Promise<void>): void {
  routes.push({ path, render });
}

export function getCurrentRoute(): string {
  const hash = window.location.hash || '#/';
  return hash.slice(1) || '/';
}

export function navigateTo(path: string): void {
  window.location.hash = `#${path}`;
}

function matchRoute(path: string): Route | undefined {
  // Exact match first
  const exact = routes.find((r) => r.path === path);
  if (exact) return exact;

  // Prefix match for nested routes
  return routes.find((r) => path.startsWith(r.path) && r.path !== '/') || routes.find((r) => r.path === '/');
}

async function handleRouteChange(): Promise<void> {
  const path = getCurrentRoute();
  if (path === currentPath) return;
  currentPath = path;

  if (!appContainer) {
    appContainer = document.getElementById('app');
  }

  if (!appContainer) {
    console.error('App container not found');
    return;
  }

  const route = matchRoute(path);
  if (route) {
    appContainer.innerHTML = '';
    await route.render(appContainer);
  }
}

export function initRouter(): void {
  window.addEventListener('hashchange', handleRouteChange);
  // Initial route
  handleRouteChange();
}
