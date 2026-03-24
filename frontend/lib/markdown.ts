import { marked, Renderer } from 'marked';
import katex from 'katex';

let shikiHighlighter: Awaited<ReturnType<typeof import('shiki')['createHighlighter']>> | null = null;
let shikiLoading: Promise<void> | null = null;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeUrl(url: string, { allowData = false }: { allowData?: boolean } = {}): string {
  const trimmed = url.trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
  if (allowData && (trimmed.startsWith('data:') || trimmed.startsWith('blob:'))) return trimmed;

  try {
    const parsed = new URL(trimmed, 'https://nexus.local');
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return trimmed;
    }
  } catch {
    return '#';
  }

  return '#';
}

export async function initMarkdown(): Promise<void> {
  if (shikiHighlighter || shikiLoading) return;
  shikiLoading = (async () => {
    try {
      const shiki = await import('shiki');
      shikiHighlighter = await shiki.createHighlighter({
        themes: ['vitesse-dark'],
        langs: [
          'javascript', 'typescript', 'python', 'bash', 'shell', 'json',
          'html', 'css', 'sql', 'yaml', 'toml', 'markdown', 'rust',
          'go', 'java', 'c', 'cpp', 'ruby', 'php', 'swift', 'kotlin',
          'dockerfile', 'xml', 'r', 'lua', 'perl', 'scala',
        ],
      });
    } catch (e) {
      console.warn('Shiki init failed:', e);
    }
  })();
  await shikiLoading;
}

export function highlightCode(code: string, language: string): string {
  if (!shikiHighlighter) {
    return `<pre class="shiki" style="background-color:#18181B"><code>${escapeHtml(code)}</code></pre>`;
  }
  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    const lang = loadedLangs.includes(language as never) ? language : 'text';
    return shikiHighlighter.codeToHtml(code, { lang: lang || 'text', theme: 'vitesse-dark' });
  } catch {
    return `<pre class="shiki" style="background-color:#18181B"><code>${escapeHtml(code)}</code></pre>`;
  }
}

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, trust: false });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

export function renderMarkdown(text: string): string {
  let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex: string) =>
    `<div class="katex-display">${renderKatex(tex.trim(), true)}</div>`
  );
  processed = processed.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex: string) =>
    renderKatex(tex, false)
  );

  const renderer = new Renderer();
  renderer.html = function ({ raw, text }: { raw?: string; text?: string }) {
    return escapeHtml(raw || text || '');
  };
  renderer.code = function ({ text: code, lang }: { text: string; lang?: string | undefined }) {
    const language = lang || '';
    if (language === 'mermaid') {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      return `<div class="mermaid-embed"><div class="mermaid-container" data-mermaid-id="${id}" data-mermaid-source="${escapeHtml(code)}">${escapeHtml(code)}</div></div>`;
    }
    const highlighted = highlightCode(code, language);
    const langLabel = language ? `<span class="code-lang-label">${escapeHtml(language)}</span>` : '';
    return `<div class="code-block-wrapper"><div class="code-block-header">${langLabel}<button type="button" class="code-copy-btn" data-code="${escapeHtml(code)}">Copy</button></div>${highlighted}</div>`;
  };
  renderer.image = function ({ href, title, text }: { href: string; title?: string | null | undefined; text: string }) {
    const alt = text || '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const safeHref = sanitizeUrl(href, { allowData: true });
    return `<div class="my-3 border border-[var(--color-border-default)] overflow-hidden">
      <img src="${escapeHtml(safeHref)}" alt="${escapeHtml(alt)}"${titleAttr} class="w-full max-h-[500px] object-contain" style="background:#121214" loading="lazy" />
      ${alt ? `<div class="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono" style="background:var(--color-surface-1);color:var(--color-text-tertiary)">
        <span>${escapeHtml(alt)}</span>
        <a href="${escapeHtml(safeHref)}" download="${escapeHtml(alt)}" style="color:var(--color-text-tertiary)">Save</a>
      </div>` : ''}
    </div>`;
  };
  renderer.link = function ({ href, title, text }: { href: string; title?: string | null | undefined; text: string }) {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(sanitizeUrl(href))}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  marked.setOptions({ renderer, gfm: true, breaks: true });
  return marked.parse(processed) as string;
}
