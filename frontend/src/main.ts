// ============================================================
// Nexus Frontend — Entry Point
// ============================================================

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { registerRoute, initRouter, navigateTo } from './router';
import { checkAuth, handleCallback } from './auth';
import { renderLoginView } from './views/login';
import { renderWorkspaceView } from './views/workspace';
import { renderAgentsView } from './views/agents';
import { getState } from './state';

// Register routes
registerRoute('/login', (container) => {
  renderLoginView(container);
});

registerRoute('/', async (container) => {
  const user = getState().user;
  if (!user) {
    navigateTo('/login');
    return;
  }
  await renderWorkspaceView(container);
});

registerRoute('/agents', async (container) => {
  const user = getState().user;
  if (!user) {
    navigateTo('/login');
    return;
  }
  await renderAgentsView(container);
});

registerRoute('/auth/callback', (_container) => {
  handleCallback();
});

// Initialize
async function init(): Promise<void> {
  // Check authentication
  const user = await checkAuth();

  if (!user) {
    navigateTo('/login');
  }

  // Start router
  initRouter();
}

init().catch(console.error);
