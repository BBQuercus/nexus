// ============================================================
// Image Embed + Lightbox
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ImageEmbedData {
  url: string;
  filename: string;
  format?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export function renderImageEmbed(data: ImageEmbedData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'image-embed';

  const img = document.createElement('img');
  img.className = 'image-embed__img';
  img.src = data.url;
  img.alt = data.filename;
  img.loading = 'lazy';
  img.addEventListener('click', () => openLightbox(data.url));

  const footer = document.createElement('div');
  footer.className = 'image-embed__footer';

  const meta = document.createElement('span');
  const parts: string[] = [data.filename];
  if (data.width && data.height) parts.push(`${data.width}x${data.height}`);
  if (data.format) parts.push(data.format.toUpperCase());
  meta.textContent = parts.join(' \u00B7 ');

  const download = document.createElement('a');
  download.className = 'image-embed__download';
  download.href = data.url;
  download.download = data.filename;
  download.textContent = 'Download';

  footer.appendChild(meta);
  footer.appendChild(download);
  container.appendChild(img);
  container.appendChild(footer);

  return container;
}

export function openLightbox(src: string): void {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';

  const img = document.createElement('img');
  img.className = 'lightbox__img';
  img.src = src;

  const close = document.createElement('button');
  close.className = 'lightbox__close';
  close.textContent = '\u2715';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    lightbox.remove();
  });

  lightbox.addEventListener('click', () => lightbox.remove());
  img.addEventListener('click', (e) => e.stopPropagation());

  lightbox.appendChild(img);
  lightbox.appendChild(close);
  document.body.appendChild(lightbox);

  // Close on escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      lightbox.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}
