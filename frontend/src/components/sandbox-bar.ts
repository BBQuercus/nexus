// ============================================================
// Sandbox Status Bar Component
// ============================================================

import { getState, setState } from '../state';
import * as api from '../services/api';

export function renderSandboxBar(
  status: 'none' | 'creating' | 'running' | 'stopped',
  sandboxId: string | null
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'sandbox-status';

  const pill = document.createElement('button');
  pill.className = 'sandbox-status__pill';

  const dot = document.createElement('span');
  dot.className = `sandbox-status__dot ${status === 'none' ? '' : status}`;

  const label = document.createElement('span');
  const labels: Record<string, string> = {
    none: 'No Sandbox',
    creating: 'Creating...',
    running: 'Sandbox Running',
    stopped: 'Sandbox Stopped',
  };
  label.textContent = labels[status] || 'Unknown';

  pill.appendChild(dot);
  pill.appendChild(label);

  // Menu
  const menu = document.createElement('div');
  menu.className = 'sandbox-status__menu';

  if (sandboxId && status !== 'none') {
    const actions: { label: string; action: () => Promise<void>; danger?: boolean }[] = [];

    if (status === 'running') {
      actions.push({
        label: 'Stop Sandbox',
        action: async () => {
          try {
            await api.stopSandbox(sandboxId);
            setState({ sandboxStatus: 'stopped' });
          } catch (e) {
            console.error('Failed to stop sandbox:', e);
          }
        },
      });
    }

    if (status === 'stopped') {
      actions.push({
        label: 'Start Sandbox',
        action: async () => {
          try {
            await api.startSandbox(sandboxId);
            setState({ sandboxStatus: 'running' });
          } catch (e) {
            console.error('Failed to start sandbox:', e);
          }
        },
      });
    }

    actions.push({
      label: 'Delete Sandbox',
      danger: true,
      action: async () => {
        if (!confirm('Delete this sandbox? This cannot be undone.')) return;
        try {
          await api.deleteSandbox(sandboxId);
          setState({ sandboxStatus: 'none', sandboxId: null });
        } catch (e) {
          console.error('Failed to delete sandbox:', e);
        }
      },
    });

    for (const act of actions) {
      const item = document.createElement('button');
      item.className = `sandbox-status__menu-item${act.danger ? ' danger' : ''}`;
      item.textContent = act.label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        act.action();
      });
      menu.appendChild(item);
    }
  }

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
  });

  container.appendChild(pill);
  container.appendChild(menu);

  return container;
}
