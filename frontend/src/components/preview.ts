// ============================================================
// Preview Panel Component
// ============================================================

export function renderPreviewPanel(url: string | null): HTMLElement {
  const container = document.createElement('div');
  container.className = 'preview-panel';

  if (!url) {
    container.innerHTML = '<div class="preview-panel__empty">No preview active</div>';
    return container;
  }

  const bar = document.createElement('div');
  bar.className = 'preview-panel__bar';

  const urlInput = document.createElement('input');
  urlInput.className = 'preview-panel__url';
  urlInput.value = url;
  urlInput.readOnly = true;

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'preview-panel__btn';
  refreshBtn.textContent = '\u21BB';
  refreshBtn.title = 'Refresh';

  const openBtn = document.createElement('button');
  openBtn.className = 'preview-panel__btn';
  openBtn.textContent = '\u2197';
  openBtn.title = 'Open in new tab';
  openBtn.addEventListener('click', () => {
    window.open(url, '_blank', 'noopener');
  });

  bar.appendChild(urlInput);
  bar.appendChild(refreshBtn);
  bar.appendChild(openBtn);

  const iframe = document.createElement('iframe');
  iframe.className = 'preview-panel__iframe';
  iframe.src = url;
  iframe.sandbox.add('allow-scripts', 'allow-same-origin');

  refreshBtn.addEventListener('click', () => {
    iframe.src = '';
    setTimeout(() => {
      iframe.src = url;
    }, 50);
  });

  container.appendChild(bar);
  container.appendChild(iframe);

  return container;
}
