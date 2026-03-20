// ============================================================
// Command Palette (Cmd+K)
// ============================================================

import { getState, setState } from '../state';

export interface CommandAction {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  category: string;
  handler: () => void;
}

let paletteElement: HTMLElement | null = null;
let highlightedIndex = 0;
let filteredActions: CommandAction[] = [];
let allActions: CommandAction[] = [];

export function registerActions(actions: CommandAction[]): void {
  allActions = actions;
}

export function openCommandPalette(): void {
  if (paletteElement) return;

  setState({ commandPaletteOpen: true });
  highlightedIndex = 0;
  filteredActions = [...allActions];

  const overlay = document.createElement('div');
  overlay.className = 'command-palette';
  paletteElement = overlay;

  const backdrop = document.createElement('div');
  backdrop.className = 'command-palette__backdrop';
  backdrop.addEventListener('click', closeCommandPalette);

  const dialog = document.createElement('div');
  dialog.className = 'command-palette__dialog';

  const input = document.createElement('input');
  input.className = 'command-palette__input';
  input.placeholder = 'Type a command...';
  input.type = 'text';
  input.autocomplete = 'off';

  const results = document.createElement('div');
  results.className = 'command-palette__results';

  dialog.appendChild(input);
  dialog.appendChild(results);
  overlay.appendChild(backdrop);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  renderResults(results);
  input.focus();

  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    if (!query) {
      filteredActions = [...allActions];
    } else {
      filteredActions = allActions.filter((a) =>
        a.label.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query)
      );
    }
    highlightedIndex = 0;
    renderResults(results);
  });

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, filteredActions.length - 1);
        renderResults(results);
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        renderResults(results);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredActions[highlightedIndex]) {
          const action = filteredActions[highlightedIndex];
          closeCommandPalette();
          action.handler();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeCommandPalette();
        break;
    }
  });
}

export function closeCommandPalette(): void {
  if (!paletteElement) return;

  paletteElement.classList.add('closing');
  setTimeout(() => {
    paletteElement?.remove();
    paletteElement = null;
  }, 100);

  setState({ commandPaletteOpen: false });
}

function renderResults(container: HTMLElement): void {
  if (filteredActions.length === 0) {
    container.innerHTML = '<div class="command-palette__empty">No results found</div>';
    return;
  }

  // Group by category
  const groups = new Map<string, CommandAction[]>();
  for (const action of filteredActions) {
    const list = groups.get(action.category) || [];
    list.push(action);
    groups.set(action.category, list);
  }

  let html = '';
  let globalIndex = 0;

  for (const [category, actions] of groups) {
    html += `<div class="command-palette__group">`;
    html += `<div class="command-palette__group-label">${escapeHtml(category)}</div>`;
    for (const action of actions) {
      const highlighted = globalIndex === highlightedIndex ? ' highlighted' : '';
      const shortcut = action.shortcut
        ? `<span class="command-palette__item-shortcut">${escapeHtml(action.shortcut)}</span>`
        : '';
      html += `<div class="command-palette__item${highlighted}" data-action-index="${globalIndex}">
        <span class="command-palette__item-icon">${action.icon || ''}</span>
        <span class="command-palette__item-label">${escapeHtml(action.label)}</span>
        ${shortcut}
      </div>`;
      globalIndex++;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.command-palette__item').forEach((el) => {
    el.addEventListener('click', () => {
      const index = parseInt((el as HTMLElement).dataset.actionIndex || '0', 10);
      if (filteredActions[index]) {
        closeCommandPalette();
        filteredActions[index].handler();
      }
    });
  });

  // Scroll highlighted into view
  const highlighted = container.querySelector('.command-palette__item.highlighted');
  highlighted?.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
