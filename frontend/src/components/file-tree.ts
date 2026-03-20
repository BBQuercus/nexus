// ============================================================
// File Browser / Tree Component
// ============================================================

import type { FileNode } from '../state';

type FileSelectCallback = (path: string, node: FileNode) => void;

const FILE_ICONS: Record<string, string> = {
  directory: '\uD83D\uDCC1', // folder
  '.py': '\uD83D\uDC0D',    // snake for python
  '.js': 'JS',
  '.ts': 'TS',
  '.json': '{}',
  '.md': '#',
  '.html': '<>',
  '.css': '#',
  '.yaml': 'Y',
  '.yml': 'Y',
  '.toml': 'T',
  '.sh': '$',
  '.bash': '$',
  '.rs': 'Rs',
  '.go': 'Go',
  '.java': 'Jv',
  '.rb': 'Rb',
  '.sql': 'Q',
  '.csv': ',',
  '.txt': 'Tx',
  '.xml': '<>',
  '.svg': 'Sv',
  '.png': '\uD83D\uDDBC',   // picture
  '.jpg': '\uD83D\uDDBC',
  '.gif': '\uD83D\uDDBC',
  '.pdf': 'Pd',
  '.zip': 'Zp',
  '.gz': 'Gz',
  '.dockerfile': 'Dk',
  '.env': 'Ev',
  '.gitignore': 'Gi',
};

function getFileIcon(node: FileNode): string {
  if (node.type === 'directory') return FILE_ICONS['directory'];

  const ext = '.' + node.name.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || '\uD83D\uDCC4'; // default file icon
}

function isRecentlyModified(modifiedAt?: string): boolean {
  if (!modifiedAt) return false;
  const modified = new Date(modifiedAt);
  const now = new Date();
  const diff = now.getTime() - modified.getTime();
  return diff < 5 * 60 * 1000; // 5 minutes
}

function renderNode(node: FileNode, depth: number, onSelect: FileSelectCallback): HTMLElement {
  const item = document.createElement('div');
  item.className = 'file-tree-item';
  if (isRecentlyModified(node.modifiedAt)) {
    item.classList.add('recently-modified');
  }
  item.style.setProperty('--depth', String(depth));

  const icon = document.createElement('span');
  icon.className = 'file-tree-item__icon';
  icon.textContent = getFileIcon(node);

  const name = document.createElement('span');
  name.className = 'file-tree-item__name';
  name.textContent = node.name;

  item.appendChild(icon);
  item.appendChild(name);

  if (node.type === 'file' && node.size !== undefined) {
    const meta = document.createElement('span');
    meta.className = 'file-tree-item__meta';
    meta.textContent = formatSize(node.size);
    item.appendChild(meta);
  }

  const container = document.createElement('div');
  container.appendChild(item);

  if (node.type === 'directory') {
    let expanded = false;
    const childrenContainer = document.createElement('div');
    childrenContainer.style.display = 'none';

    if (node.children) {
      // Sort: directories first, then alphabetical
      const sorted = [...node.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const child of sorted) {
        childrenContainer.appendChild(renderNode(child, depth + 1, onSelect));
      }
    }

    container.appendChild(childrenContainer);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      expanded = !expanded;
      childrenContainer.style.display = expanded ? 'block' : 'none';
      icon.textContent = expanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'; // open/closed folder
      onSelect(node.path, node);
    });
  } else {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      // Clear other selections
      const tree = item.closest('.file-browser');
      tree?.querySelectorAll('.file-tree-item.selected').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      onSelect(node.path, node);
    });
  }

  return container;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function renderFileTree(files: FileNode[], onSelect: FileSelectCallback): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-browser';

  if (files.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">No files</div>`;
    return container;
  }

  // Sort: directories first
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const node of sorted) {
    container.appendChild(renderNode(node, 0, onSelect));
  }

  return container;
}
