// ============================================================
// File Content Viewer
// ============================================================

import { highlightCode } from './markdown';

export function renderFileViewer(
  filename: string,
  content: string,
  language: string,
  onBack: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-viewer';

  // Header
  const header = document.createElement('div');
  header.className = 'file-viewer__header';

  const backBtn = document.createElement('button');
  backBtn.className = 'file-viewer__back';
  backBtn.textContent = '\u2190 Back';
  backBtn.addEventListener('click', onBack);

  const filenameEl = document.createElement('span');
  filenameEl.className = 'file-viewer__filename';
  filenameEl.textContent = filename;

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'file-viewer__download';
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.split('/').pop() || filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  header.appendChild(backBtn);
  header.appendChild(filenameEl);
  header.appendChild(downloadBtn);

  // Content
  const contentArea = document.createElement('div');
  contentArea.className = 'file-viewer__content';

  const lines = content.split('\n');
  const lineNumbers = lines.map((_, i) => i + 1).join('\n');

  const highlighted = highlightCode(content, language);

  contentArea.innerHTML = `
    <div class="file-viewer__lines">
      <pre class="file-viewer__line-numbers">${lineNumbers}</pre>
      <div class="file-viewer__code">${highlighted}</div>
    </div>
  `;

  container.appendChild(header);
  container.appendChild(contentArea);

  return container;
}
