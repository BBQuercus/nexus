// ============================================================
// Artifacts Panel Component
// ============================================================

import type { Artifact } from '../state';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderArtifactsPanel(
  artifacts: Artifact[],
  onSelect?: (artifact: Artifact) => void,
  onPin?: (artifact: Artifact) => void,
  onDismiss?: (artifact: Artifact) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'artifacts-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'artifacts-panel__header';
  header.innerHTML = `
    <span class="artifacts-panel__title">Artifacts (${artifacts.length})</span>
    <div class="artifacts-panel__actions">
      <button class="data-table__action-btn" data-action="export-all">Export</button>
    </div>
  `;
  container.appendChild(header);

  if (artifacts.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;';
    empty.textContent = 'No artifacts yet';
    container.appendChild(empty);
    return container;
  }

  for (const artifact of artifacts) {
    const card = document.createElement('div');
    card.className = 'artifact-card';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'artifact-card__type';
    typeBadge.textContent = artifact.type;

    const label = document.createElement('div');
    label.className = 'artifact-card__label';
    label.textContent = artifact.label;

    const meta = document.createElement('div');
    meta.className = 'artifact-card__meta';
    meta.textContent = new Date(artifact.createdAt).toLocaleTimeString();

    const actions = document.createElement('div');
    actions.className = 'artifact-card__actions';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'artifact-card__btn';
    pinBtn.textContent = artifact.pinned ? 'Unpin' : 'Pin';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPin?.(artifact);
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'artifact-card__btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDismiss?.(artifact);
    });

    actions.appendChild(pinBtn);
    actions.appendChild(dismissBtn);

    card.appendChild(typeBadge);
    card.appendChild(label);
    card.appendChild(meta);
    card.appendChild(actions);

    card.addEventListener('click', () => onSelect?.(artifact));

    container.appendChild(card);
  }

  return container;
}
